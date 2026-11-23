//! Selling artworks: each site's standard print sizes, and syncing an artwork's
//! "for sale" state to Stripe products.
//!
//! - The site document keeps the print size list: `store.printSizes = [{ id, label, priceCents }]`.
//! - Each artwork that's in the store keeps what it sells under `store`:
//!   `{ currency, originalAvailable, prints: [{ sizeId, label, ...Item }] }`, where
//!   `Item = { priceCents, stripeProductId, stripePriceId, active }`.
//! - The original painting is sold by inquiry only: `originalAvailable` just says
//!   visitors can ask about it. It has no price and no Stripe product. (`original`
//!   remains for artworks listed before that; any such Stripe product is archived
//!   the next time the artwork is updated.)
//!
//! Every item for sale is its own Stripe product with one default price. Taking an
//! item off sale archives its product (kept, so it can be restored later); a new
//! price creates a new Stripe price (Stripe prices can't be edited).

use serde_json::Value;

use super::stripe::{StripeAccount, StripeError};

/// Stripe's smallest charge is about 50 cents; cap to catch typos (an extra zero or two).
pub const MIN_PRICE_CENTS: i64 = 50;
pub const MAX_PRICE_CENTS: i64 = 10_000_000;
pub const MAX_PRINT_SIZES: usize = 20;
/// Id of the print that matches the painting's own size.
pub const ORIGINAL_SIZE_ID: &str = "original";
/// Dollars per square inch for original-size prints until a site sets its own.
pub const DEFAULT_ORIGINAL_SIZE_RATE: f64 = 0.20;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintSize {
    pub id: String,
    pub label: String,
    pub price_cents: i64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub price_cents: i64,
    pub stripe_product_id: String,
    pub stripe_price_id: String,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintItem {
    pub size_id: String,
    pub label: String,
    #[serde(flatten)]
    pub item: Item,
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductStore {
    #[serde(default)]
    pub currency: String,
    #[serde(default)]
    pub original: Option<Item>,
    #[serde(default)]
    pub prints: Vec<PrintItem>,
    /// The original can be inquired about (no price, no Stripe product).
    #[serde(default)]
    pub original_available: bool,
}

impl ProductStore {
    pub fn from_product(product: &Value) -> Self {
        serde_json::from_value(product["store"].clone()).unwrap_or_default()
    }

    /// Anything currently for sale.
    pub fn is_listed(&self) -> bool {
        self.original_available || self.has_stripe_items()
    }

    /// Anything live in Stripe (prints, or an original priced before inquiries).
    pub fn has_stripe_items(&self) -> bool {
        self.original.as_ref().is_some_and(|o| o.active) || self.prints.iter().any(|p| p.item.active)
    }
}

pub fn validate_price(field: &str, cents: i64) -> Result<i64, String> {
    if (MIN_PRICE_CENTS..=MAX_PRICE_CENTS).contains(&cents) {
        Ok(cents)
    } else {
        Err(format!(
            "{field} must be between {} and {}.",
            money(MIN_PRICE_CENTS),
            money(MAX_PRICE_CENTS)
        ))
    }
}

fn money(cents: i64) -> String {
    format!("${}.{:02}", cents / 100, cents % 100)
}

/// "12 x 16 in" → "12-x-16-in"
fn size_id(label: &str) -> String {
    let mut id = String::new();
    for c in label.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            id.push(c);
        } else if !id.ends_with('-') && !id.is_empty() {
            id.push('-');
        }
    }
    id.trim_end_matches('-').chars().take(40).collect()
}

/// Clean up a submitted print size list: labels and prices checked, ids kept
/// (so existing artworks stay linked) or derived from the label, no duplicates.
pub fn validate_print_sizes(input: &[PrintSizeInput]) -> Result<Vec<PrintSize>, String> {
    if input.len() > MAX_PRINT_SIZES {
        return Err(format!("A site can have at most {MAX_PRINT_SIZES} print sizes."));
    }
    let mut out: Vec<PrintSize> = Vec::new();
    for (i, size) in input.iter().enumerate() {
        let label = size.label.trim();
        if label.is_empty() || label.chars().count() > 60 {
            return Err(format!("Print size {} needs a name of up to 60 characters.", i + 1));
        }
        let price_cents = validate_price(&format!("The price for “{label}”"), size.price_cents)?;
        let id = size.id.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(size_id).unwrap_or_else(|| size_id(label));
        if id == ORIGINAL_SIZE_ID {
            return Err("“original” is reserved for the print that matches each painting's own size.".into());
        }
        if id.is_empty() {
            return Err(format!("“{label}” needs letters or numbers in its name."));
        }
        if out.iter().any(|s| s.id == id) {
            return Err(format!("Two print sizes are both called “{label}”."));
        }
        out.push(PrintSize { id, label: label.to_string(), price_cents });
    }
    Ok(out)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrintSizeInput {
    #[serde(default)]
    pub id: Option<String>,
    pub label: String,
    pub price_cents: i64,
}

/// The site's print sizes, from its site document.
pub fn site_print_sizes(site: &Value) -> Vec<PrintSize> {
    serde_json::from_value(site["store"]["printSizes"].clone()).unwrap_or_default()
}

/// Dollars per square inch for original-size prints (the site's setting, or the default).
pub fn original_size_rate(site: &Value) -> f64 {
    site["store"]["originalSizePrintRate"]
        .as_f64()
        .filter(|r| r.is_finite() && (0.01..=100.0).contains(r))
        .unwrap_or(DEFAULT_ORIGINAL_SIZE_RATE)
}

/// Whether every painting with a size automatically offers a print at its own size
/// (the site's setting; on unless switched off).
pub fn original_size_prints_enabled(site: &Value) -> bool {
    site["store"]["originalSizePrints"].as_bool().unwrap_or(true)
}

/// "36" or "7.5" (no trailing zeros).
fn dimension(v: f64) -> String {
    let s = format!("{v:.2}");
    s.trim_end_matches("0").trim_end_matches(".").to_string()
}

/// The print that matches the painting's own size, priced by area. `None` when the
/// painting has no size recorded.
pub fn original_size_print(product: &Value, rate: f64) -> Option<PrintSize> {
    let width = product["size"]["width"].as_f64()?;
    let height = product["size"]["height"].as_f64()?;
    if !(width > 0.0 && height > 0.0) {
        return None;
    }
    // Whole dollars, so prices look like prices.
    let price_cents = ((width * height * rate).round() as i64).max(1) * 100;
    Some(PrintSize {
        id: ORIGINAL_SIZE_ID.into(),
        label: format!("Original size · {} x {} in", dimension(width), dimension(height)),
        price_cents,
    })
}

/// What should be for sale.
pub struct Wanted<'a> {
    pub original_price_cents: Option<i64>,
    pub prints: &'a [PrintSize],
}

/// Facts about the artwork used to name the Stripe products.
pub struct ArtworkInfo<'a> {
    pub tenant: &'a str,
    pub slug: &'a str,
    pub title: &'a str,
    /// Absolute image URL, if any (Stripe needs a full https address).
    pub image: Option<&'a str>,
}

/// Bring one item in line with the wanted price (`None` = not for sale).
async fn sync_item(
    stripe: &StripeAccount<'_>,
    current: Option<Item>,
    wanted: Option<i64>,
    currency: &str,
    currency_changed: bool,
    name: &str,
    image: Option<&str>,
    metadata: &[(&str, &str)],
) -> Result<Option<Item>, (Option<Item>, StripeError)> {
    match (current, wanted) {
        (None, None) => Ok(None),
        (None, Some(cents)) => match stripe.create_product(name, image, metadata, currency, cents).await {
            Ok((product, price)) => {
                Ok(Some(Item { price_cents: cents, stripe_product_id: product, stripe_price_id: price, active: true }))
            }
            Err(e) => Err((None, e)),
        },
        (Some(mut item), None) => {
            if item.active {
                if let Err(e) = stripe.set_product_active(&item.stripe_product_id, false).await {
                    return Err((Some(item), e));
                }
                item.active = false;
            }
            Ok(Some(item))
        }
        (Some(mut item), Some(cents)) => {
            if !item.active {
                if let Err(e) = stripe.set_product_active(&item.stripe_product_id, true).await {
                    return Err((Some(item), e));
                }
                item.active = true;
            }
            if item.price_cents != cents || currency_changed {
                match stripe.change_price(&item.stripe_product_id, Some(&item.stripe_price_id), currency, cents).await {
                    Ok(price) => {
                        item.stripe_price_id = price;
                        item.price_cents = cents;
                    }
                    Err(e) => return Err((Some(item), e)),
                }
            }
            Ok(Some(item))
        }
    }
}

/// Make Stripe match `wanted`. Always returns the store as it now stands (even
/// after a failure part-way, so what did happen is saved), plus the first error.
pub async fn sync(
    stripe: &StripeAccount<'_>,
    current: ProductStore,
    wanted: &Wanted<'_>,
    currency: &str,
    artwork: &ArtworkInfo<'_>,
) -> (ProductStore, Result<(), StripeError>) {
    let currency = currency.to_lowercase();
    let currency_changed = !current.currency.is_empty() && current.currency != currency;
    let mut store =
        ProductStore { currency: currency.clone(), original: None, prints: Vec::new(), original_available: current.original_available };

    let name = format!("{} (original)", artwork.title);
    let meta = [("site", artwork.tenant), ("artwork", artwork.slug), ("kind", "original")];
    match sync_item(stripe, current.original, wanted.original_price_cents, &currency, currency_changed, &name, artwork.image, &meta)
        .await
    {
        Ok(item) => store.original = item,
        Err((item, e)) => {
            store.original = item;
            store.prints = current.prints;
            return (store, Err(e));
        }
    }

    // Every size the artwork has ever been sold in, plus every size wanted now.
    let mut remaining = current.prints;
    let mut size_ids: Vec<String> = remaining.iter().map(|p| p.size_id.clone()).collect();
    for size in wanted.prints {
        if !size_ids.contains(&size.id) {
            size_ids.push(size.id.clone());
        }
    }
    for size_id in size_ids {
        let existing_index = remaining.iter().position(|p| p.size_id == size_id);
        let existing = existing_index.map(|i| remaining.remove(i));
        let want = wanted.prints.iter().find(|s| s.id == size_id);
        let label = want.map(|s| s.label.clone()).or_else(|| existing.as_ref().map(|p| p.label.clone())).unwrap_or_default();
        let name = format!("{} (print, {label})", artwork.title);
        let meta = [("site", artwork.tenant), ("artwork", artwork.slug), ("kind", "print"), ("size", size_id.as_str())];
        let result = sync_item(
            stripe,
            existing.map(|p| p.item),
            want.map(|s| s.price_cents),
            &currency,
            currency_changed,
            &name,
            artwork.image,
            &meta,
        )
        .await;
        match result {
            Ok(Some(item)) => store.prints.push(PrintItem { size_id, label, item }),
            Ok(None) => {}
            Err((item, e)) => {
                if let Some(item) = item {
                    store.prints.push(PrintItem { size_id, label, item });
                }
                store.prints.extend(remaining);
                return (store, Err(e));
            }
        }
    }
    (store, Ok(()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(label: &str, price: i64) -> PrintSizeInput {
        PrintSizeInput { id: None, label: label.into(), price_cents: price }
    }

    #[test]
    fn print_sizes_get_stable_ids_and_valid_prices() {
        let sizes = validate_print_sizes(&[input(" 8 x 10 in ", 4000), input("12×16", 8000)]).unwrap();
        assert_eq!(sizes[0], PrintSize { id: "8-x-10-in".into(), label: "8 x 10 in".into(), price_cents: 4000 });
        assert_eq!(sizes[1].id, "12-16");
        let kept = validate_print_sizes(&[PrintSizeInput { id: Some("8-x-10-in".into()), label: "8×10 (renamed)".into(), price_cents: 4500 }]).unwrap();
        assert_eq!(kept[0].id, "8-x-10-in", "renaming keeps the id so artworks stay linked");
    }

    #[test]
    fn original_size_print_is_priced_by_area() {
        let product = serde_json::json!({ "size": { "width": 36.0, "height": 48.0, "unit": "in" } });
        let print = original_size_print(&product, 0.20).unwrap();
        assert_eq!(print.id, "original");
        assert_eq!(print.label, "Original size · 36 x 48 in");
        assert_eq!(print.price_cents, 34600, "1728 sq in x $0.20 = $345.60 → $346");
        let small = serde_json::json!({ "size": { "width": 7.5, "height": 10.0 } });
        assert_eq!(original_size_print(&small, 0.20).unwrap().label, "Original size · 7.5 x 10 in");
        assert!(original_size_print(&serde_json::json!({}), 0.20).is_none());
        assert_eq!(original_size_rate(&serde_json::json!({})), DEFAULT_ORIGINAL_SIZE_RATE);
        assert_eq!(original_size_rate(&serde_json::json!({ "store": { "originalSizePrintRate": 0.5 } })), 0.5);
    }

    #[test]
    fn bad_print_sizes_are_refused() {
        for bad in [vec![input("", 4000)], vec![input("A4", 10)], vec![input("A4", 4000), input("a4", 5000)], vec![input("!!", 4000)], vec![input("Original", 4000)]] {
            assert!(validate_print_sizes(&bad).is_err());
        }
    }

    #[test]
    fn listing_state_reads_from_the_product() {
        let product = serde_json::json!({ "store": { "currency": "cad", "original": { "priceCents": 85000, "stripeProductId": "prod_1", "stripePriceId": "price_1", "active": false }, "prints": [] } });
        let store = ProductStore::from_product(&product);
        assert!(!store.is_listed());
        assert!(!ProductStore::from_product(&serde_json::json!({})).is_listed());
    }
}
