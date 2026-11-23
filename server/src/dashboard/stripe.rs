//! Minimal Stripe client: just the product and price calls the store needs.
//! (Checkout comes later.) Each site has its own Stripe account and key.

use std::collections::HashMap;
use std::time::Duration;

use secrecy::{ExposeSecret, Secret};
use serde_json::Value;

use crate::config::StripeSettings;
use crate::content::TenantId;

pub struct Stripe {
    http: reqwest::Client,
    api_base: String,
    keys: HashMap<String, Secret<String>>,
    offline: bool,
}

#[derive(Debug)]
pub struct StripeError(pub String);

impl std::fmt::Display for StripeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// One site's view of Stripe.
pub struct StripeAccount<'a> {
    stripe: &'a Stripe,
    /// `None` = local test mode: nothing is sent to Stripe.
    key: Option<&'a Secret<String>>,
}

impl Stripe {
    pub fn new(settings: &StripeSettings) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to build the HTTP client");
        // Env var names arrive lowercased by the config loader; site ids are lowercase too.
        let keys = settings
            .secret_keys
            .iter()
            .filter(|(_, v)| !v.expose_secret().trim().is_empty())
            .map(|(k, v)| (k.to_lowercase(), v.clone()))
            .collect();
        Self { http, api_base: settings.api_base.trim_end_matches('/').to_string(), keys, offline: settings.offline }
    }

    /// Stripe for this site: its own key, or (local test mode only) a stand-in that
    /// makes up ids instead of calling Stripe.
    pub fn account(&self, tenant: &TenantId) -> Option<StripeAccount<'_>> {
        match self.keys.get(tenant.as_ref()) {
            Some(key) => Some(StripeAccount { stripe: self, key: Some(key) }),
            None if self.offline => Some(StripeAccount { stripe: self, key: None }),
            None => None,
        }
    }

    /// True when this site has no key and is running in local test mode.
    pub fn is_offline_for(&self, tenant: &TenantId) -> bool {
        self.offline && !self.keys.contains_key(tenant.as_ref())
    }

    pub fn configured_sites(&self) -> Vec<String> {
        let mut sites: Vec<String> = self.keys.keys().cloned().collect();
        sites.sort();
        sites
    }
}

impl StripeAccount<'_> {
    async fn post(&self, path: &str, form: &[(String, String)]) -> Result<Value, StripeError> {
        let key = self.key.ok_or_else(|| StripeError("no Stripe key (test mode)".into()))?;
        let response = self
            .stripe
            .http
            .post(format!("{}{path}", self.stripe.api_base))
            .bearer_auth(key.expose_secret().trim())
            .form(form)
            .send()
            .await
            .map_err(|e| StripeError(format!("couldn't reach Stripe: {e}")))?;
        let status = response.status();
        let body: Value = response.json().await.unwrap_or(Value::Null);
        if status.is_success() {
            Ok(body)
        } else {
            let message = body["error"]["message"].as_str().unwrap_or("request refused");
            Err(StripeError(format!("Stripe said ({status}): {message}")))
        }
    }

    /// Create a product with a default price. Returns `(product id, price id)`.
    pub async fn create_product(
        &self,
        name: &str,
        image: Option<&str>,
        metadata: &[(&str, &str)],
        currency: &str,
        unit_amount: i64,
    ) -> Result<(String, String), StripeError> {
        if self.key.is_none() {
            return Ok((fake_id("prod"), fake_id("price")));
        }
        let mut form = vec![
            ("name".to_string(), name.to_string()),
            ("default_price_data[currency]".to_string(), currency.to_string()),
            ("default_price_data[unit_amount]".to_string(), unit_amount.to_string()),
        ];
        if let Some(image) = image {
            form.push(("images[0]".to_string(), image.to_string()));
        }
        for (k, v) in metadata {
            form.push((format!("metadata[{k}]"), v.to_string()));
        }
        let product = self.post("/v1/products", &form).await?;
        let product_id = product["id"].as_str().ok_or_else(|| StripeError("Stripe returned no product id".into()))?;
        let price_id = product["default_price"]
            .as_str()
            .or_else(|| product["default_price"]["id"].as_str())
            .ok_or_else(|| StripeError("Stripe returned no price id".into()))?;
        Ok((product_id.to_string(), price_id.to_string()))
    }

    /// Give a product a new price and make it the default; the old price is archived.
    /// (Stripe prices can't be edited.) Returns the new price id.
    pub async fn change_price(
        &self,
        product_id: &str,
        old_price_id: Option<&str>,
        currency: &str,
        unit_amount: i64,
    ) -> Result<String, StripeError> {
        if self.key.is_none() {
            return Ok(fake_id("price"));
        }
        let form = vec![
            ("product".to_string(), product_id.to_string()),
            ("currency".to_string(), currency.to_string()),
            ("unit_amount".to_string(), unit_amount.to_string()),
        ];
        let price = self.post("/v1/prices", &form).await?;
        let price_id = price["id"].as_str().ok_or_else(|| StripeError("Stripe returned no price id".into()))?.to_string();
        self.post(&format!("/v1/products/{product_id}"), &[("default_price".into(), price_id.clone())]).await?;
        if let Some(old) = old_price_id {
            self.post(&format!("/v1/prices/{old}"), &[("active".into(), "false".into())]).await?;
        }
        Ok(price_id)
    }

    /// Archive (`false`) or restore (`true`) a product. Archived products can't be bought.
    pub async fn set_product_active(&self, product_id: &str, active: bool) -> Result<(), StripeError> {
        if self.key.is_none() {
            return Ok(());
        }
        self.post(&format!("/v1/products/{product_id}"), &[("active".into(), active.to_string())]).await?;
        Ok(())
    }

    /// Change a product's name (what buyers see at checkout and on receipts).
    pub async fn rename_product(&self, product_id: &str, name: &str) -> Result<(), StripeError> {
        if self.key.is_none() {
            return Ok(());
        }
        self.post(&format!("/v1/products/{product_id}"), &[("name".into(), name.to_string())]).await?;
        Ok(())
    }

    /// A Stripe-hosted checkout page for one copy of `price_id`, collecting a shipping
    /// address. `limit` stops sales after that many purchases (limited editions).
    /// In local test mode there's no real page, so the url is `None`.
    pub async fn create_payment_link(
        &self,
        price_id: &str,
        limit: Option<u32>,
        shipping_countries: &[String],
        metadata: &[(&str, &str)],
    ) -> Result<PaymentLink, StripeError> {
        if self.key.is_none() {
            return Ok(PaymentLink { id: fake_id("plink"), url: None });
        }
        let mut form = vec![
            ("line_items[0][price]".to_string(), price_id.to_string()),
            ("line_items[0][quantity]".to_string(), "1".to_string()),
        ];
        for (i, country) in shipping_countries.iter().enumerate() {
            form.push((format!("shipping_address_collection[allowed_countries][{i}]"), country.clone()));
        }
        if let Some(limit) = limit {
            form.push(("restrictions[completed_sessions][limit]".to_string(), limit.to_string()));
        }
        for (k, v) in metadata {
            form.push((format!("metadata[{k}]"), v.to_string()));
        }
        let link = self.post("/v1/payment_links", &form).await?;
        let id = link["id"].as_str().ok_or_else(|| StripeError("Stripe returned no payment link id".into()))?;
        Ok(PaymentLink { id: id.to_string(), url: link["url"].as_str().map(str::to_string) })
    }

    /// Turn a payment link off (its page stops taking orders) or back on.
    pub async fn set_payment_link_active(&self, link_id: &str, active: bool) -> Result<(), StripeError> {
        if self.key.is_none() {
            return Ok(());
        }
        self.post(&format!("/v1/payment_links/{link_id}"), &[("active".into(), active.to_string())]).await?;
        Ok(())
    }
}

pub struct PaymentLink {
    pub id: String,
    /// The checkout page; `None` in local test mode.
    pub url: Option<String>,
}

/// A placeholder id for local test mode, clearly not a real Stripe id.
fn fake_id(kind: &str) -> String {
    let mut bytes = [0u8; 6];
    getrandom::fill(&mut bytes).expect("the OS random number generator is unavailable");
    format!("offline_{kind}_{}", hex::encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tenant() -> TenantId {
        TenantId::parse("acme").unwrap()
    }

    #[actix_web::test]
    async fn test_mode_makes_up_ids_and_never_calls_stripe() {
        let stripe = Stripe::new(&StripeSettings { offline: true, api_base: "http://127.0.0.1:9".into(), ..Default::default() });
        assert!(stripe.is_offline_for(&tenant()));
        let account = stripe.account(&tenant()).expect("offline mode offers a stand-in account");
        let (product, price) = account.create_product("Girl", None, &[], "cad", 5000).await.unwrap();
        assert!(product.starts_with("offline_prod_") && price.starts_with("offline_price_"));
        assert!(account.change_price(&product, Some(&price), "cad", 6000).await.unwrap().starts_with("offline_price_"));
        account.set_product_active(&product, false).await.unwrap();
    }

    #[test]
    fn without_test_mode_a_site_needs_its_own_key() {
        let stripe = Stripe::new(&StripeSettings::default());
        assert!(stripe.account(&tenant()).is_none());
        assert!(!stripe.is_offline_for(&tenant()));
    }
}
