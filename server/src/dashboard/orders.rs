//! Print orders: recorded from Stripe checkouts (see `routes::stripe_webhook`),
//! listed in the dashboard, and ticked off when shipped.

use serde_json::{json, Value};
use sqlx::{PgExecutor, PgPool};
use uuid::Uuid;

use crate::content::TenantId;

/// A paid Stripe checkout, as recorded.
#[derive(Debug, Clone)]
pub struct NewOrder {
    pub stripe_session_id: String,
    pub print_slug: Option<String>,
    pub print_name: String,
    pub amount_total_cents: i64,
    pub shipping_cents: i64,
    pub currency: String,
    pub customer_name: Option<String>,
    pub customer_email: Option<String>,
    pub customer_phone: Option<String>,
    pub shipping_address: Option<Value>,
}

impl NewOrder {
    /// Read the parts of a Stripe Checkout Session we keep. `print_slug` / `print_name`
    /// come from matching the session to a print. Handles both the newer
    /// `collected_information.shipping_details` and the older `shipping_details`.
    pub fn from_session(session: &Value, print_slug: Option<String>, print_name: String) -> Option<Self> {
        let id = session["id"].as_str()?.to_string();
        let customer = &session["customer_details"];
        let shipping = if session["collected_information"]["shipping_details"].is_object() {
            &session["collected_information"]["shipping_details"]
        } else {
            &session["shipping_details"]
        };
        let text = |v: &Value| v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
        let address = shipping["address"].as_object().map(|a| {
            let mut out = json!({ "name": shipping["name"] });
            for key in ["line1", "line2", "city", "state", "postal_code", "country"] {
                out[key] = a.get(key).cloned().unwrap_or(Value::Null);
            }
            out
        });
        Some(Self {
            stripe_session_id: id,
            print_slug,
            print_name,
            amount_total_cents: session["amount_total"].as_i64().unwrap_or(0),
            shipping_cents: session["total_details"]["amount_shipping"].as_i64().unwrap_or(0),
            currency: session["currency"].as_str().unwrap_or("cad").to_lowercase(),
            customer_name: text(&customer["name"]).or_else(|| text(&shipping["name"])),
            customer_email: text(&customer["email"]),
            customer_phone: text(&customer["phone"]),
            shipping_address: address,
        })
    }
}

/// Store an order once. Returns its id, or `None` if this checkout was already recorded
/// (Stripe can deliver the same event more than once).
pub async fn record_order(
    executor: impl PgExecutor<'_>,
    tenant: &TenantId,
    order: &NewOrder,
) -> Result<Option<Uuid>, sqlx::Error> {
    let row: Option<(Uuid,)> = sqlx::query_as(
        "INSERT INTO print_orders (id, tenant_id, stripe_session_id, print_slug, print_name, amount_total_cents,
             shipping_cents, currency, customer_name, customer_email, customer_phone, shipping_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (stripe_session_id) DO NOTHING
         RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(tenant.as_ref())
    .bind(&order.stripe_session_id)
    .bind(&order.print_slug)
    .bind(&order.print_name)
    .bind(order.amount_total_cents)
    .bind(order.shipping_cents)
    .bind(&order.currency)
    .bind(&order.customer_name)
    .bind(&order.customer_email)
    .bind(&order.customer_phone)
    .bind(&order.shipping_address)
    .fetch_optional(executor)
    .await?;
    Ok(row.map(|(id,)| id))
}

/// Copies of a print sold so far.
pub async fn copies_sold(executor: impl PgExecutor<'_>, tenant: &TenantId, print_slug: &str) -> Result<i64, sqlx::Error> {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM print_orders WHERE tenant_id = $1 AND print_slug = $2")
        .bind(tenant.as_ref())
        .bind(print_slug)
        .fetch_one(executor)
        .await?;
    Ok(n)
}

/// True when a limited edition has no copies left.
pub fn is_sold_out(edition_size: Option<u64>, sold: i64) -> bool {
    edition_size.is_some_and(|n| sold >= n as i64)
}

#[derive(sqlx::FromRow)]
struct OrderRow {
    id: Uuid,
    print_slug: Option<String>,
    print_name: String,
    amount_total_cents: i64,
    shipping_cents: i64,
    currency: String,
    customer_name: Option<String>,
    customer_email: Option<String>,
    customer_phone: Option<String>,
    shipping_address: Option<Value>,
    created_at: chrono::DateTime<chrono::Utc>,
    shipped_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// A site's orders, newest first, as the dashboard shows them.
pub async fn list_orders(pool: &PgPool, tenant: &TenantId) -> Result<Vec<Value>, sqlx::Error> {
    let rows: Vec<OrderRow> = sqlx::query_as(
        "SELECT id, print_slug, print_name, amount_total_cents, shipping_cents, currency, customer_name,
                customer_email, customer_phone, shipping_address, created_at, shipped_at
         FROM print_orders WHERE tenant_id = $1 ORDER BY created_at DESC",
    )
    .bind(tenant.as_ref())
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "printSlug": r.print_slug,
                "printName": r.print_name,
                "amountTotalCents": r.amount_total_cents,
                "shippingCents": r.shipping_cents,
                "currency": r.currency.to_uppercase(),
                "customerName": r.customer_name,
                "customerEmail": r.customer_email,
                "customerPhone": r.customer_phone,
                "shippingAddress": r.shipping_address,
                "createdAt": r.created_at,
                "shippedAt": r.shipped_at,
            })
        })
        .collect())
}

/// Mark an order shipped (now) or not. Returns false if it isn't this site's order.
pub async fn set_shipped(pool: &PgPool, tenant: &TenantId, id: Uuid, shipped: bool) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE print_orders SET shipped_at = CASE WHEN $3 THEN COALESCE(shipped_at, now()) ELSE NULL END
         WHERE tenant_id = $1 AND id = $2",
    )
    .bind(tenant.as_ref())
    .bind(id)
    .bind(shipped)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() == 1)
}

/// "Name\nLine 1\nLine 2\nCity, State Postal\nCountry" for emails.
pub fn address_lines(address: &Value) -> String {
    let s = |k: &str| address[k].as_str().map(str::trim).filter(|v| !v.is_empty());
    let city_line = [s("city"), s("state"), s("postal_code")].into_iter().flatten().collect::<Vec<_>>().join(" ");
    [s("name"), s("line1"), s("line2"), Some(city_line.as_str()).filter(|l| !l.is_empty()), s("country")]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_checkout_session_new_and_old_shapes() {
        let new_shape = json!({
            "id": "cs_1", "amount_total": 19500, "currency": "CAD", "total_details": { "amount_shipping": 1500 },
            "customer_details": { "name": "Ana", "email": "ana@example.com", "phone": null },
            "collected_information": { "shipping_details": { "name": "Ana B", "address": {
                "line1": "1 Main St", "line2": null, "city": "Vancouver", "state": "BC", "postal_code": "V5V 1A1", "country": "CA" } } }
        });
        let order = NewOrder::from_session(&new_shape, Some("p".into()), "P".into()).unwrap();
        assert_eq!(order.amount_total_cents, 19500);
        assert_eq!(order.shipping_cents, 1500);
        assert_eq!(order.currency, "cad");
        assert_eq!(order.customer_email.as_deref(), Some("ana@example.com"));
        let address = order.shipping_address.unwrap();
        assert_eq!(address_lines(&address), "Ana B\n1 Main St\nVancouver BC V5V 1A1\nCA");

        let old_shape = json!({ "id": "cs_2", "shipping_details": { "name": "Bo", "address": { "line1": "2 Elm", "country": "US" } } });
        let order = NewOrder::from_session(&old_shape, None, "P".into()).unwrap();
        assert_eq!(order.customer_name.as_deref(), Some("Bo"));
        assert_eq!(order.shipping_address.unwrap()["line1"], "2 Elm");
    }

    #[test]
    fn sold_out_only_for_limited_editions() {
        assert!(is_sold_out(Some(3), 3));
        assert!(!is_sold_out(Some(3), 2));
        assert!(!is_sold_out(None, 1000));
    }
}
