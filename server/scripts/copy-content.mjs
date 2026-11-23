// Copy one site's content (every document: site, pages, artworks, prints, ...) from
// one server to another through the admin API, exactly as it is in the source.
// Documents in the target are overwritten; documents only in the target are kept.
//
//   node scripts/copy-content.mjs <tenant> <from-url> <to-url> [--dry-run]
//
// Admin keys come from FROM_ADMIN_KEY and TO_ADMIN_KEY. Example (PowerShell):
//   $env:FROM_ADMIN_KEY = "local-dev-admin-key-0123456789abcdef"
//   $env:TO_ADMIN_KEY   = "<production APP_ADMIN__API_KEY>"
//   node scripts/copy-content.mjs siansahil http://127.0.0.1:8000 https://server-ucdtb.ondigitalocean.app

const [tenant, fromUrl, toUrl, flag] = process.argv.slice(2);
const dryRun = flag === "--dry-run";
const fromKey = process.env.FROM_ADMIN_KEY;
const toKey = process.env.TO_ADMIN_KEY;
if (!tenant || !fromUrl || !toUrl || !fromKey || (!toKey && !dryRun)) {
  console.error("Usage: node scripts/copy-content.mjs <tenant> <from-url> <to-url> [--dry-run]  (FROM_ADMIN_KEY / TO_ADMIN_KEY set)");
  process.exit(1);
}

const api = (base) => `${base.replace(/\/+$/, "")}/api/v1/admin`;
async function call(base, key, method, path, body) {
  const response = await fetch(api(base) + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${base}${path} → ${response.status} ${data?.message ?? ""}`);
  return data;
}

const docs = await call(fromUrl, fromKey, "GET", `/tenants/${tenant}/documents`);
console.log(`${docs.length} documents in ${tenant} at ${fromUrl}${dryRun ? " (dry run: nothing is written)" : ""}`);

// Addresses only the source machine can serve would be broken images on the target.
const localOnly = /https?:\/\/(127\.0\.0\.1|localhost)[:/]/;
let warnings = 0;

if (!dryRun) {
  const existing = await call(toUrl, toKey, "GET", "/tenants").then((all) => all.some((t) => t.id === tenant));
  if (!existing) {
    const source = await call(fromUrl, fromKey, "GET", `/tenants/${tenant}`);
    await call(toUrl, toKey, "POST", "/tenants", { id: tenant, domains: source.domains ?? [] });
    console.log(`created tenant ${tenant} on ${toUrl}`);
  }
}

// Site first, so pages never refer to labels the site doesn't have yet.
docs.sort((a, b) => (a.type === "site" ? -1 : b.type === "site" ? 1 : 0));
for (const { type, key } of docs) {
  const { data } = await call(fromUrl, fromKey, "GET", `/tenants/${tenant}/documents/${type}/${key}`);
  if (localOnly.test(JSON.stringify(data))) {
    warnings++;
    console.warn(`  ! ${type}/${key} has an image stored on this computer (127.0.0.1); re-add it in the live dashboard`);
  }
  if (dryRun) {
    console.log(`  would copy ${type}/${key}`);
    continue;
  }
  const result = await call(toUrl, toKey, "PUT", `/tenants/${tenant}/documents/${type}/${key}`, data);
  console.log(`  ${type}/${key}: ${result.status}`);
}
console.log(`done${warnings ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""}`);
