//! Runs database migrations in the background, retrying until they succeed.
//!
//! Why not fail fast at startup: on DigitalOcean dev databases the app's DB user
//! only receives CREATE rights on the `public` schema *during a successful
//! deployment*. A server that crashes on its first migration attempt never
//! finishes deploying, so the rights never arrive and every redeploy fails the
//! same way. Instead the server starts (and passes its health check) while this
//! task keeps retrying; `/diagnostics/ready` reports the outcome.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use sqlx::PgPool;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum MigrationState {
    /// No attempt has finished yet.
    Pending,
    /// Schema is up to date.
    Applied,
    /// Attempts are failing (details are in the server log, not exposed here).
    Failing { attempts: u32 },
}

/// Shared, cloneable view of the migration outcome.
#[derive(Clone)]
pub struct MigrationStatus(Arc<Mutex<MigrationState>>);

impl MigrationStatus {
    pub fn pending() -> Self {
        Self(Arc::new(Mutex::new(MigrationState::Pending)))
    }

    /// For callers that migrate themselves (tests, the seed tool).
    pub fn applied() -> Self {
        Self(Arc::new(Mutex::new(MigrationState::Applied)))
    }

    pub fn get(&self) -> MigrationState {
        self.0.lock().expect("migration status lock poisoned").clone()
    }

    fn set(&self, state: MigrationState) {
        *self.0.lock().expect("migration status lock poisoned") = state;
    }
}

/// Wait before retry number `attempt` (1-based): quick at first, then steady.
pub fn retry_delay(attempt: u32) -> Duration {
    Duration::from_secs(match attempt {
        1 => 5,
        2 => 10,
        _ => 30,
    })
}

/// Apply pending migrations, retrying forever until they succeed.
/// Intended to be spawned: `actix_web::rt::spawn(run_until_applied(pool, status))`.
pub async fn run_until_applied(pool: PgPool, status: MigrationStatus) {
    let mut attempt: u32 = 0;
    loop {
        attempt += 1;
        match sqlx::migrate!("./migrations").run(&pool).await {
            Ok(()) => {
                status.set(MigrationState::Applied);
                tracing::info!(attempt, "Database migrations applied");
                return;
            }
            Err(e) => {
                status.set(MigrationState::Failing { attempts: attempt });
                let wait = retry_delay(attempt);
                tracing::error!(
                    error = %e,
                    attempt,
                    retry_in_secs = wait.as_secs(),
                    "Database migrations failed; will retry"
                );
                actix_web::rt::time::sleep(wait).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_start_fast_then_settle_at_thirty_seconds() {
        let secs: Vec<u64> = (1..=5).map(|a| retry_delay(a).as_secs()).collect();
        assert_eq!(secs, [5, 10, 30, 30, 30]);
    }

    #[test]
    fn status_starts_pending_and_is_shared_between_clones() {
        let status = MigrationStatus::pending();
        let view = status.clone();
        assert_eq!(view.get(), MigrationState::Pending);

        status.set(MigrationState::Failing { attempts: 2 });
        assert_eq!(view.get(), MigrationState::Failing { attempts: 2 });

        status.set(MigrationState::Applied);
        assert_eq!(view.get(), MigrationState::Applied);
    }

    #[test]
    fn state_serialises_without_error_details() {
        let json = serde_json::to_value(MigrationState::Failing { attempts: 3 }).unwrap();
        assert_eq!(json, serde_json::json!({ "state": "failing", "attempts": 3 }));
    }
}
