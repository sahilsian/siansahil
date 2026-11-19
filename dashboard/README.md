# Dashboard

The web app tenants use to edit their website: page text, the shared header/footer
text, and gallery artworks. It's a static React app that the Rust server serves at
`/dashboard`, on the same origin as the API.

## What people can do

| | Editor (one site) | Superadmin |
|---|---|---|
| Edit text on Home, About, FAQ, Contact, other pages | ✓ | ✓ (any site) |
| Edit shared text (header, footer, mailing list, labels, messages) | ✓ | ✓ |
| Add, edit and delete artworks; upload photos | ✓ | ✓ |
| Change their own password (Account) | ✓ | ✓ |
| Change layout, links, images on pages, theme, block order | ✗ | ✗ (use the content files + `push_content`) |
| Create accounts, reset passwords, remove accounts | ✗ | ✓ |

"Text only" is enforced by the server (`server/src/dashboard/text_only.rs`), not
just hidden in the UI.

## Local development

1. Start Postgres and the server (`cd server && cargo run`). It applies the new migrations.
2. Start the dashboard: `npm install` then `npm run dev`, and open
   <http://localhost:5173/dashboard/>. Vite forwards `/api` to the server.
3. Make yourself a superadmin (PowerShell, from `server/`):

   ```powershell
   $env:ADMIN_API_KEY = "local-dev-admin-key-0123456789abcdef"
   cargo run --bin create_superadmin -- http://127.0.0.1:8000 yourname
   ```

   Sign in with the printed password.

To try the production setup locally instead, run `npm run build`; the server then
serves the built app at <http://127.0.0.1:8000/dashboard/> (it looks in
`../dashboard/dist`).

## Security

- **No sign-up.** Accounts are created only by a superadmin (or, for the first
  superadmin, with the admin API key). There's nothing to register through.
- **Passwords:** at least 15 characters and can't contain the username; hashed with
  Argon2id. "Generate" makes a random 100-bit password. People change theirs under
  Account; changing or resetting a password signs that account out of other devices.
- **Sign-in throttling:** 5 wrong passwords for a username, or 30 failures from one
  address, block further attempts for 15 minutes.
- **Sessions:** a random 256-bit token in an `httpOnly`, `Secure`, `SameSite=Strict`,
  `__Host-` cookie. Only its SHA-256 is stored. Sessions end after 14 days, or after
  3 days unused. Removing an account ends its sessions immediately.
- **CSRF:** every non-GET API call needs an `X-Dashboard-Request: 1` header (which
  other sites can't add), and cross-site requests are refused via `Sec-Fetch-Site`.
- **Site isolation:** editors can only read or change their own site; enforced on
  every request.
- **Uploads:** only real JPEG/PNG/WebP files (checked from their bytes; SVG refused),
  10 MB each, 2 GB per site. The dashboard shrinks photos to 2400 px and strips their
  metadata (including phone GPS location) before uploading.
- **Page hardening:** strict Content-Security-Policy, no framing, no referrer, HSTS.

## Production

See "Deploying the dashboard" in [server/content/README.md](../server/content/README.md).
