use secrecy::{ExposeSecret, Secret};
use serde_aux::field_attributes::deserialize_number_from_string;
use sqlx::postgres::{PgConnectOptions, PgSslMode};

pub enum Environment {
    Local,
    Production,
}

// define file
#[derive(serde::Deserialize)]
pub struct Settings {
    pub database: DatabaseSettings,
    pub application: ApplicationSettings,
    pub admin: AdminSettings,
    pub email: EmailSettings,
    pub dashboard: DashboardSettings,
}

/// The tenant dashboard (a static web app this server serves at `/dashboard`).
#[derive(serde::Deserialize, Clone)]
pub struct DashboardSettings {
    /// Folder holding the built dashboard (`index.html` + assets).
    pub static_dir: String,
    /// Mark the session cookie `Secure` (and use the `__Host-` name). Always on in production.
    #[serde(default)]
    pub secure_cookies: bool,
}

/// Outgoing email (Resend). Without `resend_api_key` notifications are
/// disabled (logged, not sent); production sets `APP_EMAIL__RESEND_API_KEY`.
#[derive(serde::Deserialize, Clone)]
pub struct EmailSettings {
    pub base_url: String,
    /// Sender address; the display name comes from each tenant's site document.
    pub sender: String,
    pub resend_api_key: Option<Secret<String>>,
    #[serde(deserialize_with = "deserialize_number_from_string")]
    pub timeout_ms: u64,
}

/// Admin API access. Set per environment; in production via
/// `APP_ADMIN__API_KEY` (never commit a production key).
#[derive(serde::Deserialize, Clone)]
pub struct AdminSettings {
    pub api_key: Secret<String>,
}

#[derive(serde::Deserialize, Clone)]
pub struct DatabaseSettings {
    pub username: String,
    pub password: Secret<String>,
    #[serde(deserialize_with = "deserialize_number_from_string")]
    pub port: u16,
    pub host: String,
    pub database_name: String,
    /// Production (DigitalOcean managed Postgres) requires TLS; local Docker Postgres has none.
    #[serde(default)]
    pub require_ssl: bool,
}

#[derive(serde::Deserialize)]
pub struct ApplicationSettings {
    #[serde(deserialize_with = "deserialize_number_from_string")]
    pub port: u16,
    pub host: String,
    /// This server's public address (no trailing slash). Uploaded images are
    /// linked from it, e.g. `https://server-xyz.ondigitalocean.app`.
    pub base_url: String,
}

// instantiate db settings
impl DatabaseSettings {
    // setup for pg connection
    pub fn connect_options(&self) -> PgConnectOptions {
        let ssl_mode = if self.require_ssl { PgSslMode::Require } else { PgSslMode::Prefer };
        PgConnectOptions::new()
            .ssl_mode(ssl_mode)
            .host(&self.host)
            .username(&self.username)
            .password(&self.password.expose_secret())
            .port(self.port)
            .database(&self.database_name)
    }
}

pub fn get_config() -> Result<Settings, config::ConfigError> {
    let base_path = std::env::current_dir().expect("could not determine the curr directory");

    let configuration_directory = base_path.join("config");

    let environment: Environment = std::env::var("APP_ENVIRONMENT")
        .unwrap_or_else(|_| "local".into())
        .try_into()
        .expect("Failed to parse the env");

    let environment_filename = format!("{}.yaml", environment.as_str());

    let settings = config::Config::builder()
        .add_source(config::File::from(
            configuration_directory.join("base.yaml"),
        ))
        .add_source(config::File::from(
            configuration_directory.join(environment_filename),
        ))
        .add_source(
            config::Environment::with_prefix("APP")
                .prefix_separator("_")
                .separator("__"),
        )
        .build()?;

    // Attempt to deserialize setting build
    settings.try_deserialize::<Settings>()
}

impl Environment {
    pub fn as_str(&self) -> &'static str {
        match self {
            Environment::Local => "local",
            Environment::Production => "production",
        }
    }
}

// creating a new implementation of try from
impl TryFrom<String> for Environment {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.to_lowercase().as_str() {
            "local" => Ok(Self::Local),
            "production" => Ok(Self::Production),
            other => Err(format!(
                "{} this implementation only supports local or production.",
                other
            )),
        }
    }
}
