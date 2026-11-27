//! Minimal Stripe client: the product, price, shipping-rate and payment-link calls
//! the print store needs, plus webhook signature checks. Each site has its own
//! Stripe account, key and webhook secret.

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
    webhook_secrets: HashMap<String, Secret<String>>,
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
        let by_site = |map: &HashMap<String, Secret<String>>| -> HashMap<String, Secret<String>> {
            map.iter()
                .filter(|(_, v)| !v.expose_secret().trim().is_empty())
                .map(|(k, v)| (k.to_lowercase(), v.clone()))
                .collect()
        };
        Self {
            http,
            api_base: settings.api_base.trim_end_matches('/').to_string(),
            keys: by_site(&settings.secret_keys),
            webhook_secrets: by_site(&settings.webhook_secrets),
            offline: settings.offline,
        }
    }

    /// The signing secret of this site's Stripe webhook endpoint, if set.
    pub fn webhook_secret(&self, tenant: &TenantId) -> Option<&Secret<String>> {
        self.webhook_secrets.get(tenant.as_ref())
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

/// An id made up by local test mode (see `fake_id`), not a real Stripe object.
pub fn is_placeholder_id(id: &str) -> bool {
    id.starts_with("offline_")
}

impl StripeAccount<'_> {
    /// True for the local test-mode stand-in (no key: nothing is sent to Stripe).
    pub fn is_offline(&self) -> bool {
        self.key.is_none()
    }

    /// With a real key, a made-up test-mode id refers to nothing in Stripe.
    pub fn is_stale_id(&self, id: &str) -> bool {
        !self.is_offline() && is_placeholder_id(id)
    }

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

    /// A flat shipping charge offered at checkout. Shipping rates can't be edited, so a
    /// change makes a new one (and archives the old with `set_shipping_rate_active`).
    pub async fn create_shipping_rate(&self, label: &str, amount_cents: i64, currency: &str) -> Result<String, StripeError> {
        if self.key.is_none() {
            return Ok(fake_id("shr"));
        }
        let form = vec![
            ("type".to_string(), "fixed_amount".to_string()),
            ("display_name".to_string(), label.to_string()),
            ("fixed_amount[amount]".to_string(), amount_cents.to_string()),
            ("fixed_amount[currency]".to_string(), currency.to_string()),
        ];
        let rate = self.post("/v1/shipping_rates", &form).await?;
        rate["id"].as_str().map(str::to_string).ok_or_else(|| StripeError("Stripe returned no shipping rate id".into()))
    }

    pub async fn set_shipping_rate_active(&self, rate_id: &str, active: bool) -> Result<(), StripeError> {
        if self.key.is_none() {
            return Ok(());
        }
        self.post(&format!("/v1/shipping_rates/{rate_id}"), &[("active".into(), active.to_string())]).await?;
        Ok(())
    }

    /// A Stripe-hosted checkout page for one copy of `price_id`, collecting a shipping
    /// address (and charging `shipping_rate`, if any). `limit` stops sales after that
    /// many purchases (limited editions). After paying, buyers are sent to `success_url`.
    /// In local test mode there's no real page, so the url is `None`.
    pub async fn create_payment_link(&self, link: &NewPaymentLink<'_>) -> Result<PaymentLink, StripeError> {
        if self.key.is_none() {
            return Ok(PaymentLink { id: fake_id("plink"), url: None });
        }
        let mut form = vec![
            ("line_items[0][price]".to_string(), link.price_id.to_string()),
            ("line_items[0][quantity]".to_string(), "1".to_string()),
        ];
        for (i, country) in link.shipping_countries.iter().enumerate() {
            form.push((format!("shipping_address_collection[allowed_countries][{i}]"), country.clone()));
        }
        if let Some(rate) = link.shipping_rate {
            form.push(("shipping_options[0][shipping_rate]".to_string(), rate.to_string()));
        }
        if let Some(limit) = link.limit {
            form.push(("restrictions[completed_sessions][limit]".to_string(), limit.to_string()));
        }
        if let Some(url) = link.success_url {
            form.push(("after_completion[type]".to_string(), "redirect".to_string()));
            form.push(("after_completion[redirect][url]".to_string(), url.to_string()));
        }
        let metadata = link.metadata;
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

/// What a new payment link sells and how.
pub struct NewPaymentLink<'a> {
    pub price_id: &'a str,
    pub limit: Option<u32>,
    pub shipping_countries: &'a [String],
    pub shipping_rate: Option<&'a str>,
    pub success_url: Option<&'a str>,
    pub metadata: &'a [(&'a str, &'a str)],
}

pub struct PaymentLink {
    pub id: String,
    /// The checkout page; `None` in local test mode.
    pub url: Option<String>,
}

/// Check a webhook's `Stripe-Signature` header (`t=<unix time>,v1=<hex hmac>,...`): an
/// HMAC-SHA256 of `"<t>.<raw body>"` with the endpoint's secret, sent within
/// `tolerance_secs` of `now` (so old deliveries can't be replayed).
pub fn verify_webhook_signature(payload: &[u8], header: &str, secret: &str, now: i64, tolerance_secs: i64) -> bool {
    use hmac::{Hmac, Mac};
    let mut timestamp = None;
    let mut signatures = Vec::new();
    for part in header.split(',') {
        match part.trim().split_once('=') {
            Some(("t", v)) => timestamp = v.parse::<i64>().ok(),
            Some(("v1", v)) => signatures.extend(hex::decode(v).ok()),
            _ => {}
        }
    }
    let Some(timestamp) = timestamp else { return false };
    if (now - timestamp).abs() > tolerance_secs {
        return false;
    }
    signatures.iter().any(|signature| {
        let mut mac = Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC takes keys of any length");
        mac.update(timestamp.to_string().as_bytes());
        mac.update(b".");
        mac.update(payload);
        mac.verify_slice(signature).is_ok()
    })
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
    fn webhook_signatures_must_match_and_be_recent() {
        use hmac::{Hmac, Mac};
        let sign = |t: i64, body: &str, secret: &str| {
            let mut mac = Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).unwrap();
            mac.update(format!("{t}.{body}").as_bytes());
            hex::encode(mac.finalize().into_bytes())
        };
        let body = r#"{"type":"checkout.session.completed"}"#;
        let header = format!("t=1000,v1={}", sign(1000, body, "whsec_a"));
        assert!(verify_webhook_signature(body.as_bytes(), &header, "whsec_a", 1100, 300));
        assert!(!verify_webhook_signature(body.as_bytes(), &header, "whsec_b", 1100, 300), "wrong secret");
        assert!(!verify_webhook_signature(b"{}", &header, "whsec_a", 1100, 300), "tampered body");
        assert!(!verify_webhook_signature(body.as_bytes(), &header, "whsec_a", 2000, 300), "too old");
        assert!(!verify_webhook_signature(body.as_bytes(), "v1=abc", "whsec_a", 1100, 300), "no timestamp");
    }

    #[test]
    fn without_test_mode_a_site_needs_its_own_key() {
        let stripe = Stripe::new(&StripeSettings::default());
        assert!(stripe.account(&tenant()).is_none());
        assert!(!stripe.is_offline_for(&tenant()));
    }
}
