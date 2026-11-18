# Tenant content

All website data, one folder per tenant. A head (client) holds components only;
everything it shows comes from these documents via the server.

```
tenants/<tenantId>/
  tenant.json              id + domains (used to resolve/verify the tenant)
  site.json                one per tenant: theme, nav, SEO defaults, labels, messages
  pages/<slug>.json        one per route; "home" is "/"
  collections/<id>.json    product listings (all, gallery, by category)
  products/<slug>.json     one per artwork
  forms/<id>.json          form schemas (contact, commission, print, mailing-list)
```

Every document has `$type`. Strings rendered as rich text support
`**bold**`, `*italic*`, `[label](href)` and `#`–`######` headings.

## Public content API

Read-only, no auth, CORS open. The tenant is in the URL. Successful responses
carry `Cache-Control: public, max-age=60, stale-while-revalidate=300`; errors are `no-store`.

| `GET` | Returns |
|---|---|
| `/api/v1/content/{tenantId}/site` | the site document |
| `/api/v1/content/{tenantId}/pages/{slug}` | the page, plus `included: { forms: {id: doc}, collections: {id: doc} }` for every form/collection its blocks reference |
| `/api/v1/content/{tenantId}/products/{slug}` | the full product |
| `/api/v1/content/{tenantId}/collections/{id}?search=` | the collection plus `products`: matching product summaries (`slug, title, category, image, dateCreated?, shopifyHandle?`) |
| `/api/v1/content/{tenantId}/forms/{id}` | the form |

Tenant ids and document keys: lowercase `a-z`, `0-9`, `-`; tenant ids max 63 chars, keys max 128.

## Admin API

Every route requires `Authorization: Bearer <admin key>`. The key comes from
`admin.api_key` (`config/local.yaml` for local dev) or `APP_ADMIN__API_KEY` in
production. It must be at least 32 characters, or the server refuses to start.

| Method | Path | Body | Result |
|---|---|---|---|
| `GET` | `/api/v1/admin/tenants` | | `[{ id, domains, createdAt, documentCount }]` |
| `POST` | `/api/v1/admin/tenants` | `{ id, domains? }` | 201 tenant; 409 if the id exists |
| `GET` | `/api/v1/admin/tenants/{tenantId}` | | tenant |
| `PUT` | `/api/v1/admin/tenants/{tenantId}` | `{ domains }` | tenant (domains replaced) |
| `DELETE` | `/api/v1/admin/tenants/{tenantId}` | | 204; **also deletes all its documents** |
| `GET` | `/api/v1/admin/tenants/{tenantId}/documents?type=page` | | `[{ type, key, version, updatedAt }]` |
| `GET` | `/api/v1/admin/tenants/{tenantId}/documents/{type}/{key}` | | `{ type, key, version, updatedAt, data }` |
| `PUT` | `/api/v1/admin/tenants/{tenantId}/documents/{type}/{key}` | the document (≤ 1 MB) | 201 created, or 200 updated/unchanged, with `{ type, key, version, updatedAt, status }` |
| `DELETE` | `/api/v1/admin/tenants/{tenantId}/documents/{type}/{key}` | | 204 |

`type` is one of `site`, `page`, `product`, `collection`, `form`. A document's
`$type` must match the URL, and the site document's key is always `main`.
`version` starts at 1 and increases only when the content actually changes.

Domains are bare hostnames (`example.com`, not `https://example.com/`); they're
lowercased and de-duplicated. They're stored but not yet enforced.

Example: create a tenant, give it a site, read it publicly.

```
curl -X POST localhost:8000/api/v1/admin/tenants \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"id":"acme","domains":["acme.com"]}'

curl -X PUT localhost:8000/api/v1/admin/tenants/acme/documents/site/main \
  -H "Authorization: Bearer $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"$type":"site","name":"Acme Art"}'

curl localhost:8000/api/v1/content/acme/site
```

## Errors (both APIs)

JSON `{ "error": code, "message": text }`:

| Status | `error` | When |
|---|---|---|
| 400 | `bad_request` | invalid id/key/type, malformed body or query |
| 401 | `unauthorized` | admin route without a valid key |
| 404 | `tenant_not_found` | no such tenant |
| 404 | `not_found` | tenant exists, document doesn't |
| 409 | `conflict` | creating a tenant whose id is taken |
| 500 | `internal_error` | database failure |

Not yet: Shopify price/stock merging and form submissions. Secrets (Shopify
token, Resend key, admin key) live in server env, never in these files.

## Loading this folder into the database

```
cargo run --bin seed                               # every tenant in content/tenants
cargo run --bin seed -- content/tenants/siansahil  # one tenant
```

Upserts tenants and documents (bumping `version` only when a document changed);
never deletes. Each file's `$type` must match its folder.

For a deployed server (whose database you can't reach directly), upload through
the admin API instead. Same validation, same result:

```
ADMIN_API_KEY=<production admin key> cargo run --bin push_content -- https://<your-app>.ondigitalocean.app
ADMIN_API_KEY=<production admin key> cargo run --bin push_content -- https://<your-app>.ondigitalocean.app content/tenants/siansahil
```

The server applies database migrations itself on startup.

## Shapes

### Image
```ts
{ url: string; width: number; height: number; alternativeText?: string; name: string }
```
`width`/`height` are as displayed (after EXIF rotation).

### site
```ts
{
  $type: "site"; name; url; locale; currency;
  contact: { email };
  social: { instagram: { handle; url } };
  theme: { colors: Record<string, hex>; fonts: { body } };
  seo: { siteName; title; description; keywords; ogImage: Image; robots; titleTemplate };
  favicons: { png96; svg; ico; appleTouch; manifest };
  nav: {
    header: { title; items: NavItem[] };
    footer: { title; description; groups: { title; items: NavItem[] }[] };
  };
  mailing: { formId; title; description; consentPrefix; consentLink: { label; to } };
  labels: Record<string, string | string[]>;    // every UI word: Back, Search, Sold, ...
  messages: Record<string, string>;              // errors, 404, empty states
  integrations: { shopify: { printClubHandle }; email: { recipient; fromName } };
}
NavItem = { label; to; external?: true; search?: { collection } }
```

### page
```ts
{
  $type: "page"; slug;
  seo: { title; description; keywords?; ogImage?: Image; robots? };
  layout?: { title; description };   // paper-margin header; omit for home
  blocks: Block[];
}
```

Block types:

| `type` | Fields |
|---|---|
| `hero` | `title`, `description`, `primary`/`secondary`: `{ label, variant, to, search? }`, `heroImage`, `profileImage` |
| `collection` | `defaultCollection`, `views: { id, columns }[]` |
| `imageText` | `image`, `imagePosition: "start" \| "end"`, `body` (rich text) |
| `faq` | `items: { question, answer (rich text) }[]` |
| `richText` | `body` |
| `form` | `formId` |
| `printClub` | `subscriptionHandle`, `intro`, `announcement`, `details`, `closing` (see `pages/vancouver-print-club.json`) |

### collection
```ts
{
  $type: "collection"; id; title; description;
  filter: { type: "all" } | { type: "category"; category } | { type: "curated"; productSlugs: string[] };
  sort: "dateCreated:desc";
  seo: { title; description };
}
```

### product
```ts
{
  $type: "product"; slug; title; category; description;
  images: Image[];                 // [0] is the main image
  ogImage?: Image;                 // ~1200px copy for link previews
  tabs: { title; body (rich text) }[];
  material?; dateCreated?; shopifyHandle?;
}
```

### form
```ts
{
  $type: "form"; id; title; description;
  successMessage?; errorMessage?; fullWidth?; image?: Image;
  fields: Field[];   // same field schema the head's FieldRenderer uses today
}
```
