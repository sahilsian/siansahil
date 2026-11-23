//! Prints: their own `print` documents, each linked to one painting (a `product`)
//! and sold through a Stripe payment link.
//!
//! Stored shape:
//! ```json
//! { "$type": "print", "slug": "mount-pleasant-archival",
//!   "painting": "mount-pleasant", "title": "Archival Limited Edition",
//!   "size": { "width": 24, "height": 36, "unit": "in" }, "editionSize": 15,
//!   "priceCents": 18000, "currency": "cad", "description": "...", "images": [...],
//!   "forSale": true, "buyUrl": "https://buy.stripe.com/...", "stripe": { ... } }
//! ```

use serde_json::{json, Map, Value};

use super::products::{image, text, ImageInput, SizeInput};
use super::stripe::{StripeAccount, StripeError};

pub const MAX_IMAGES: usize = 20;
/// Largest limited edition (and a sanity cap for Stripe's purchase limit).
pub const MAX_EDITION: u32 = 10_000;

/// What the dashboard sends for one print.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrintInput {
    /// The painting's slug.
    pub painting: String,
    /// e.g. "Archival Limited Edition".
    pub title: String,
    pub size: SizeInput,
    /// Copies in the edition; `None` = open edition.
    #[serde(default)]
    pub edition_size: Option<u32>,
    pub price_cents: i64,
    #[serde(default)]
    pub description: String,
    /// Mockups etc. Empty = the website uses the painting's photo.
    #[serde(default)]
    pub images: Vec<ImageInput>,
    #[serde(default = "yes")]
    pub for_sale: bool,
}

fn yes() -> bool {
    true
}

/// Validate `input` and merge it onto `existing` (or a new document). Stripe
/// state (`stripe`, `buyUrl`) is left as it was; `sync` updates it.
pub fn build_print(slug: &str, input: &PrintInput, existing: Option<&Value>, media_base: &str) -> Result<Value, String> {
    let mut doc: Map<String, Value> = existing.and_then(Value::as_object).cloned().unwrap_or_default();
    doc.insert("$type".into(), json!("print"));
    doc.insert("slug".into(), json!(slug));
    doc.insert("painting".into(), json!(text("Painting", &input.painting, 1, 128)?));
    doc.insert("title".into(), json!(text("Print name", &input.title, 1, 200)?));

    let ok = |v: f64| v.is_finite() && (1.0..=1000.0).contains(&v);
    if !ok(input.size.width) || !ok(input.size.height) {
        return Err("The print size must be between 1 and 1000 inches each way.".into());
    }
    let round = |v: f64| (v * 100.0).round() / 100.0;
    doc.insert("size".into(), json!({ "width": round(input.size.width), "height": round(input.size.height), "unit": "in" }));

    match input.edition_size {
        None => {
            doc.remove("editionSize");
        }
        Some(n) if (1..=MAX_EDITION).contains(&n) => {
            doc.insert("editionSize".into(), json!(n));
        }
        Some(_) => return Err(format!("The edition must be between 1 and {MAX_EDITION} copies (or leave it empty).")),
    }

    if !(100..=10_000_000).contains(&input.price_cents) {
        return Err("The price must be between $1 and $100,000.".into());
    }
    doc.insert("priceCents".into(), json!(input.price_cents));

    let description = text("Description", &input.description, 0, 50_000)?;
    if description.is_empty() {
        doc.remove("description");
    } else {
        doc.insert("description".into(), json!(description));
    }

    if input.images.len() > MAX_IMAGES {
        return Err(format!("A print can have at most {MAX_IMAGES} images."));
    }
    let images = input.images.iter().map(|i| image(i, media_base)).collect::<Result<Vec<_>, _>>()?;
    doc.insert("images".into(), Value::Array(images));
    doc.insert("forSale".into(), json!(input.for_sale));
    Ok(Value::Object(doc))
}

/// "Mount Pleasant | Archival Limited Edition 24 x 36": how a print is named
/// everywhere (website lists, Stripe checkout, receipts).
pub fn display_name(print: &Value, painting_title: &str) -> String {
    let title = print["title"].as_str().unwrap_or_default();
    format!("{painting_title} | {title} {}", size_label(&print["size"]))
}

/// `{ width: 24, height: 36 }` → "24 x 36".
pub fn size_label(size: &Value) -> String {
    let n = |v: &Value| {
        let f = v.as_f64().unwrap_or_default();
        if f.fract() == 0.0 { format!("{}", f as i64) } else { format!("{f}") }
    };
    format!("{} x {}", n(&size["width"]), n(&size["height"]))
}

/// What's in Stripe for one print.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintStripe {
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default)]
    pub price_id: Option<String>,
    #[serde(default)]
    pub price_cents: Option<i64>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub payment_link_id: Option<String>,
    #[serde(default)]
    pub payment_link_url: Option<String>,
    /// The price and limit the current payment link was made with.
    #[serde(default)]
    pub link_price_id: Option<String>,
    #[serde(default)]
    pub link_limit: Option<u32>,
    /// The product and payment link are live.
    #[serde(default)]
    pub active: bool,
}

impl PrintStripe {
    pub fn from_print(print: &Value) -> Self {
        serde_json::from_value(print["stripe"].clone()).unwrap_or_default()
    }

    pub fn has_stripe_items(&self) -> bool {
        self.product_id.is_some() || self.payment_link_id.is_some()
    }
}

/// What should be on sale.
pub struct Wanted<'a> {
    pub name: &'a str,
    pub image: Option<&'a str>,
    pub price_cents: i64,
    pub currency: &'a str,
    pub limit: Option<u32>,
    pub shipping_countries: &'a [String],
    pub tenant: &'a str,
    pub slug: &'a str,
}

/// Make Stripe match `wanted` (`None` = take it off sale). `state` is updated as
/// each step succeeds, so a failure part-way still leaves an accurate record.
pub async fn sync(account: &StripeAccount<'_>, state: &mut PrintStripe, wanted: Option<&Wanted<'_>>) -> Result<(), StripeError> {
    let Some(w) = wanted else {
        if let (Some(link), true) = (&state.payment_link_id, state.active) {
            account.set_payment_link_active(link, false).await?;
        }
        if let (Some(product), true) = (&state.product_id, state.active) {
            account.set_product_active(product, false).await?;
        }
        state.active = false;
        return Ok(());
    };

    // A currency change needs a fresh product (prices can't change currency).
    if state.product_id.is_some() && state.currency.as_deref() != Some(w.currency) {
        if let Some(product) = state.product_id.take() {
            account.set_product_active(&product, false).await?;
        }
        state.price_id = None;
        state.price_cents = None;
    }

    match state.product_id.clone() {
        None => {
            let metadata = [("tenant", w.tenant), ("print", w.slug)];
            let (product, price) = account.create_product(w.name, w.image, &metadata, w.currency, w.price_cents).await?;
            state.product_id = Some(product);
            state.price_id = Some(price);
            state.price_cents = Some(w.price_cents);
            state.currency = Some(w.currency.to_string());
        }
        Some(product) => {
            if !state.active {
                account.set_product_active(&product, true).await?;
            }
            account.rename_product(&product, w.name).await?;
            if state.price_cents != Some(w.price_cents) {
                let price = account.change_price(&product, state.price_id.as_deref(), w.currency, w.price_cents).await?;
                state.price_id = Some(price);
                state.price_cents = Some(w.price_cents);
            }
        }
    }

    // Payment links can't change price or limit: make a new one when either changed.
    let link_current = state.payment_link_id.is_some() && state.link_price_id == state.price_id && state.link_limit == w.limit;
    if link_current {
        if !state.active {
            account.set_payment_link_active(state.payment_link_id.as_deref().unwrap_or_default(), true).await?;
        }
    } else {
        if let Some(old) = state.payment_link_id.take() {
            account.set_payment_link_active(&old, false).await?;
            state.payment_link_url = None;
        }
        let price = state.price_id.clone().unwrap_or_default();
        let link = account
            .create_payment_link(&price, w.limit, w.shipping_countries, &[("tenant", w.tenant), ("print", w.slug)])
            .await?;
        state.payment_link_id = Some(link.id);
        state.payment_link_url = link.url;
        state.link_price_id = state.price_id.clone();
        state.link_limit = w.limit;
    }
    state.active = true;
    Ok(())
}

/// Countries a print can ship to: the site's `store.shippingCountries`, else Canada and the US.
pub fn shipping_countries(site: &Value) -> Vec<String> {
    let configured: Vec<String> = site["store"]["shippingCountries"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .filter(|c| c.len() == 2 && c.chars().all(|ch| ch.is_ascii_alphabetic()))
                .map(str::to_uppercase)
                .collect()
        })
        .unwrap_or_default();
    if configured.is_empty() { vec!["CA".into(), "US".into()] } else { configured }
}

/// The public view of a print: no Stripe ids, plus a summary of its painting.
pub fn public_print(print: &Value, painting: &Value) -> Value {
    let mut out = print.clone();
    if let Some(map) = out.as_object_mut() {
        map.remove("stripe");
        let live = print["forSale"].as_bool().unwrap_or(false) && print["stripe"]["active"].as_bool().unwrap_or(false);
        match print["stripe"]["paymentLinkUrl"].as_str().filter(|_| live) {
            Some(url) => map.insert("buyUrl".into(), json!(url)),
            None => map.remove("buyUrl"),
        };
        let painting_title = painting["title"].as_str().unwrap_or_default();
        map.insert("name".into(), json!(display_name(print, painting_title)));
        map.insert("sizeLabel".into(), json!(size_label(&print["size"])));
        map.insert(
            "artwork".into(),
            json!({
                "slug": painting["slug"],
                "title": painting["title"],
                "image": painting["images"].get(0).cloned().unwrap_or(Value::Null),
            }),
        );
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://api.example.com";

    fn input() -> PrintInput {
        serde_json::from_value(json!({
            "painting": "mount-pleasant",
            "title": " Archival Limited Edition ",
            "size": { "width": 24, "height": 36 },
            "editionSize": 15,
            "priceCents": 18000
        }))
        .unwrap()
    }

    #[test]
    fn builds_a_print_and_names_it() {
        let doc = build_print("mp-archival", &input(), None, BASE).unwrap();
        assert_eq!(doc["title"], "Archival Limited Edition");
        assert_eq!(doc["editionSize"], 15);
        assert_eq!(doc["forSale"], true);
        assert_eq!(display_name(&doc, "Mount Pleasant"), "Mount Pleasant | Archival Limited Edition 24 x 36");
        assert_eq!(size_label(&json!({ "width": 8.5, "height": 11 })), "8.5 x 11");
    }

    #[test]
    fn rejects_bad_prints() {
        let mut no_title = input();
        no_title.title = " ".into();
        let mut free = input();
        free.price_cents = 0;
        let mut huge_edition = input();
        huge_edition.edition_size = Some(0);
        let mut tiny = input();
        tiny.size.width = 0.0;
        for bad in [no_title, free, huge_edition, tiny] {
            assert!(build_print("x", &bad, None, BASE).is_err());
        }
    }

    #[test]
    fn keeps_stripe_state_when_edited() {
        let existing = json!({ "stripe": { "productId": "prod_1", "active": true } });
        let doc = build_print("x", &input(), Some(&existing), BASE).unwrap();
        assert_eq!(doc["stripe"]["productId"], "prod_1");
    }

    #[test]
    fn public_view_hides_stripe_ids_and_only_offers_live_links() {
        let painting = json!({ "slug": "mount-pleasant", "title": "Mount Pleasant", "images": [{ "url": "/mp.jpg" }] });
        let mut print = build_print("x", &input(), None, BASE).unwrap();
        print["stripe"] = json!({ "productId": "prod_1", "paymentLinkUrl": "https://buy.stripe.com/x", "active": true });
        let public = public_print(&print, &painting);
        assert!(public.get("stripe").is_none());
        assert_eq!(public["buyUrl"], "https://buy.stripe.com/x");
        assert_eq!(public["artwork"]["image"]["url"], "/mp.jpg");
        assert_eq!(public["sizeLabel"], "24 x 36");

        print["forSale"] = json!(false);
        assert!(public_print(&print, &painting).get("buyUrl").is_none());
    }

    #[actix_web::test]
    async fn test_mode_sync_records_a_link_and_takes_it_down() {
        use crate::config::StripeSettings;
        use crate::content::TenantId;
        let stripe = super::super::stripe::Stripe::new(&StripeSettings { offline: true, ..Default::default() });
        let tenant = TenantId::parse("acme").unwrap();
        let account = stripe.account(&tenant).unwrap();
        let countries = vec!["CA".to_string()];
        let wanted = Wanted {
            name: "MP | A 8 x 10", image: None, price_cents: 3000, currency: "cad", limit: Some(15),
            shipping_countries: &countries, tenant: "acme", slug: "x",
        };
        let mut state = PrintStripe::default();
        sync(&account, &mut state, Some(&wanted)).await.unwrap();
        assert!(state.active && state.product_id.is_some() && state.payment_link_id.is_some());
        let first_link = state.payment_link_id.clone();

        // A new price means a new payment link.
        let dearer = Wanted { price_cents: 4000, ..wanted };
        sync(&account, &mut state, Some(&dearer)).await.unwrap();
        assert_ne!(state.payment_link_id, first_link);
        assert_eq!(state.price_cents, Some(4000));

        sync(&account, &mut state, None).await.unwrap();
        assert!(!state.active);
    }
}
