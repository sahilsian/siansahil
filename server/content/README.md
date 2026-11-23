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

> **Once tenants edit through the dashboard, the database is the source of truth.**
> `seed` and `push_content` overwrite every document they upload, so running them
> afterwards would undo tenants' edits and artworks. To change layout or structure
> later, edit the live document (admin API `GET`, change, `PUT`) or push a single
> file's folder, not the whole tenant.

## Deploying the dashboard

The dashboard (`/dashboard` in this repo) is built into the server's Docker image
and served at `https://<server-url>/dashboard`. See [dashboard/README.md](../../dashboard/README.md)
for what it does and how it's secured.

1. **Commit and push** `server/`, `dashboard/` and the root `.dockerignore`. The
   build context is now the repo root (`source_dir: /` in `spec.yaml`). If the app
   was created from the dashboard rather than `spec.yaml`, set **Source directory**
   to `/` in the component settings (Dockerfile path stays `server/Dockerfile`).
2. **Add one environment variable** to the server component (Settings →
   Environment Variables), unless you deploy from `spec.yaml`, which already has it:

   | Key | Value |
   |---|---|
   | `APP_APPLICATION__BASE_URL` | `https://<server-url>` (no trailing slash) |

   The server won't start without it. It's the address uploaded images are linked
   from, so moving the API to a custom domain later means re-linking existing uploads.
3. **Image storage (Cloudflare R2)** — optional but recommended; without it uploads
   are stored in Postgres. See "Setting up Cloudflare R2" below.
4. **Deploy**, then check `https://<server-url>/api/v1/diagnostics/ready` returns 200
   (the new tables are created automatically).
5. **Create your superadmin account** (PowerShell):

   ```powershell
   cd server
   $env:ADMIN_API_KEY = "<production admin key>"
   cargo run --bin create_superadmin -- https://<server-url> yourname
   Remove-Item Env:ADMIN_API_KEY
   ```

   It prints a generated password once. Sign in at `https://<server-url>/dashboard/`,
   then change it under **Account**.
6. **Create tenant accounts** from the dashboard's **Superadmin** screen: username,
   password (use **Generate**), and the website they can edit. Copy the details and
   send them privately; they can change the password under **Account**. If someone
   forgets theirs, use **Reset password** on the same screen.

### Setting up Cloudflare R2

Photos uploaded in the dashboard go to an R2 bucket (free up to 10 GB, no download
fees) and are served through Cloudflare's CDN from your own domain. Objects are
named `<site>/<sha256>.jpg` and cached for a year (their content never changes).

1. **Cloudflare dashboard → R2 Object Storage → Create bucket.** Name it, e.g.
   `site-images`. Location: Automatic.
2. **Give it a public domain:** bucket → **Settings → Public access → Custom
   Domains → Connect domain**, e.g. `images.siansahil.com` (the domain must be on
   your Cloudflare account). Don't use the `r2.dev` address in production: it's
   rate-limited and not cached.
3. **Create an API token:** R2 overview → **Manage API tokens → Create API token**.
   Permission **Object Read & Write**, applied to **this bucket only**. Copy the
   **Access Key ID** and **Secret Access Key** (shown once).
4. **Find your Account ID** on the R2 overview page.
5. **DigitalOcean → server component → Environment Variables**, all encrypted:

   | Key | Value |
   |---|---|
   | `APP_MEDIA__R2__ACCOUNT_ID` | your Cloudflare account id |
   | `APP_MEDIA__R2__BUCKET` | `site-images` |
   | `APP_MEDIA__R2__ACCESS_KEY_ID` | from step 3 |
   | `APP_MEDIA__R2__SECRET_ACCESS_KEY` | from step 3 |
   | `APP_MEDIA__R2__PUBLIC_BASE_URL` | `https://images.siansahil.com` (no trailing slash) |

   Set all five or none. If only some are set, the server refuses to start and the
   log says which are missing. The startup log line "Uploaded images will be stored
   in r2" confirms it's active.

Images already uploaded to Postgres keep working at their old addresses.

### Setting up Stripe (the store)

Each site sells through **its own** Stripe account, so payments go to that artist.
"Add to store" on an artwork creates Stripe products: one for the original and one
per print size, each with its price. (Checkout on the websites comes later; until
then visitors are sent to the contact page to buy.)

1. In that artist's Stripe dashboard: **Developers → API keys**. Best practice is a
   **restricted key** with **Products: Write** and **Prices: Write** only. A secret
   key (`sk_live_...`) also works. Use the `sk_test_...` / test-mode key to try it first.
2. DigitalOcean → server component → Environment Variables (encrypted), one per site:

   | Key | Value |
   |---|---|
   | `APP_STRIPE__SECRET_KEYS__SIANSAHIL` | Sahil's Stripe key |
   | `APP_STRIPE__SECRET_KEYS__ADRIANNAHANKINS` | Adrianna's Stripe key |

   The part after `SECRET_KEYS__` is the site id in capitals. The startup log line
   "Stripe keys loaded" lists which sites have one.
3. In the dashboard, set the site's print sizes on the **Store** page, then open an
   artwork and press **Add to store**.

Prices are in the site's `currency` (from its site document, e.g. CAD).

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
