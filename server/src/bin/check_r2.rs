//! Check Cloudflare R2 settings before deploying: uploads a tiny test image with
//! the same code the server uses, then downloads it from the public domain.
//!
//! Reads the same settings as the server (`APP_MEDIA__R2__*` environment
//! variables), so run it with those set:
//!
//!   cargo run --bin check_r2
//!
//! It leaves one 70-byte file in the bucket: `_checks/r2-check.png`.

use server::config::get_config;
use server::dashboard::r2::R2Client;

// Smallest valid 1x1 PNG.
const PNG_1X1: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

fn fail(message: &str) -> ! {
    eprintln!("✗ {message}");
    std::process::exit(1);
}

#[actix_web::main]
async fn main() {
    let config = get_config().unwrap_or_else(|e| fail(&format!("Couldn't read settings: {e}")));
    let Some(settings) = config.media.r2 else {
        fail("No R2 settings found. Set the five APP_MEDIA__R2__* variables in this terminal first.");
    };
    let r2 = R2Client::new(&settings).unwrap_or_else(|e| fail(&e));

    let key = "_checks/r2-check.png";
    println!("1/2 Uploading a test image to bucket “{}”…", settings.bucket.trim());
    if let Err(e) = r2.put(key, PNG_1X1.to_vec(), "image/png").await {
        fail(&format!(
            "Upload failed: {e}\n  Check the account id, bucket name, and that the API token has Object Read & Write on this bucket."
        ));
    }
    println!("    ✓ Uploaded");

    let url = r2.public_url(key);
    println!("2/2 Downloading it from {url} …");
    let response = reqwest::get(&url).await.unwrap_or_else(|e| {
        fail(&format!("Couldn't reach {url}: {e}\n  Check the bucket's custom domain is connected and active in Cloudflare."))
    });
    let status = response.status();
    let cache = response.headers().get("cf-cache-status").and_then(|v| v.to_str().ok()).unwrap_or("-").to_string();
    let control = response.headers().get("cache-control").and_then(|v| v.to_str().ok()).unwrap_or("-").to_string();
    let body = response.bytes().await.unwrap_or_default();
    if !status.is_success() {
        fail(&format!(
            "The public address answered {status}.\n  Check APP_MEDIA__R2__PUBLIC_BASE_URL is the bucket's custom domain and that public access is on."
        ));
    }
    if body.as_ref() != PNG_1X1 {
        fail("The public address returned different content. Is APP_MEDIA__R2__PUBLIC_BASE_URL pointing at this bucket?");
    }
    println!("    ✓ Downloaded the same image (cache-control: {control}; Cloudflare cache: {cache})");
    println!("\n✓ R2 works. Use the same five values in DigitalOcean.");
}
