use std::time::Duration;

use secrecy::{ExposeSecret, Secret};
use serde_json::json;

use crate::config::EmailSettings;

/// Sends email through Resend's HTTP API (`POST {base_url}/emails`).
pub struct EmailClient {
    http: reqwest::Client,
    base_url: String,
    sender: String,
    api_key: Option<Secret<String>>,
}

/// One outgoing message.
pub struct Email<'a> {
    /// Display name for the sender, e.g. the tenant's `fromName`.
    pub from_name: &'a str,
    pub to: &'a str,
    pub subject: &'a str,
    pub text: &'a str,
    pub reply_to: Option<&'a str>,
}

#[derive(Debug)]
pub enum EmailError {
    /// No API key configured: sending is switched off.
    Disabled,
    Request(reqwest::Error),
    Rejected(reqwest::StatusCode, String),
}

impl std::fmt::Display for EmailError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EmailError::Disabled => write!(f, "email sending is disabled (no Resend API key configured)"),
            EmailError::Request(e) => write!(f, "request to email provider failed: {e}"),
            EmailError::Rejected(status, body) => write!(f, "email provider rejected the message ({status}): {body}"),
        }
    }
}

impl EmailClient {
    pub fn new(settings: &EmailSettings) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_millis(settings.timeout_ms))
            .build()
            .expect("Failed to build the HTTP client");
        Self {
            http,
            base_url: settings.base_url.trim_end_matches('/').to_string(),
            sender: settings.sender.clone(),
            api_key: settings.resend_api_key.clone(),
        }
    }

    pub async fn send(&self, email: &Email<'_>) -> Result<(), EmailError> {
        let api_key = self.api_key.as_ref().ok_or(EmailError::Disabled)?;

        let mut body = json!({
            "from": format!("{} <{}>", sanitize_display_name(email.from_name), self.sender),
            "to": [email.to],
            "subject": email.subject,
            "text": email.text,
        });
        if let Some(reply_to) = email.reply_to {
            body["reply_to"] = json!(reply_to);
        }

        let response = self
            .http
            .post(format!("{}/emails", self.base_url))
            .bearer_auth(api_key.expose_secret())
            .json(&body)
            .send()
            .await
            .map_err(EmailError::Request)?;

        let status = response.status();
        if status.is_success() {
            Ok(())
        } else {
            let detail = response.text().await.unwrap_or_default();
            Err(EmailError::Rejected(status, detail))
        }
    }
}

/// Keep the display name from breaking the `Name <address>` header.
fn sanitize_display_name(name: &str) -> String {
    name.chars().filter(|c| !matches!(c, '<' | '>' | '"' | '\r' | '\n')).collect::<String>().trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::sanitize_display_name;

    #[test]
    fn display_name_cannot_inject_addresses_or_headers() {
        assert_eq!(sanitize_display_name("Evil <x@y.com>\r\nBcc: z"), "Evil x@y.comBcc: z");
        assert_eq!(sanitize_display_name("  Sahil's Studio "), "Sahil's Studio");
    }
}
