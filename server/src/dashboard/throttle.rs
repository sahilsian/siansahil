//! Slows down password guessing: after too many failed sign-ins for one username
//! (or from one address), further attempts are refused for a while.
//!
//! Kept in memory, which is enough for a single server instance. Restarting the
//! server resets it.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct Throttle {
    limit: u32,
    window: Duration,
    failures: Mutex<HashMap<String, (u32, Instant)>>,
}

impl Throttle {
    pub fn new(limit: u32, window: Duration) -> Self {
        Self { limit, window, failures: Mutex::new(HashMap::new()) }
    }

    /// True when `key` has used up its failures for the current window.
    pub fn is_blocked(&self, key: &str) -> bool {
        let map = self.failures.lock().expect("throttle lock poisoned");
        map.get(key).is_some_and(|(count, since)| *count >= self.limit && since.elapsed() < self.window)
    }

    pub fn record_failure(&self, key: &str) {
        let mut map = self.failures.lock().expect("throttle lock poisoned");
        if map.len() > 10_000 {
            let window = self.window;
            map.retain(|_, (_, since)| since.elapsed() < window);
        }
        let entry = map.entry(key.to_string()).or_insert((0, Instant::now()));
        if entry.1.elapsed() >= self.window {
            *entry = (0, Instant::now());
        }
        entry.0 += 1;
    }

    pub fn clear(&self, key: &str) {
        self.failures.lock().expect("throttle lock poisoned").remove(key);
    }
}

/// Throttles for signing in and changing passwords.
pub struct AuthThrottles {
    /// Per username: 5 wrong passwords per 15 minutes.
    pub username: Throttle,
    /// Per client address: 30 failed sign-ins (any username) per 15 minutes.
    pub client: Throttle,
}

impl Default for AuthThrottles {
    fn default() -> Self {
        Self {
            username: Throttle::new(5, Duration::from_secs(15 * 60)),
            client: Throttle::new(30, Duration::from_secs(15 * 60)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_after_the_limit_and_clears_on_success() {
        let t = Throttle::new(3, Duration::from_secs(60));
        for _ in 0..2 {
            t.record_failure("adri");
        }
        assert!(!t.is_blocked("adri"));
        t.record_failure("adri");
        assert!(t.is_blocked("adri"));
        assert!(!t.is_blocked("someone-else"));
        t.clear("adri");
        assert!(!t.is_blocked("adri"));
    }

    #[test]
    fn the_window_expires() {
        let t = Throttle::new(1, Duration::from_millis(1));
        t.record_failure("adri");
        std::thread::sleep(Duration::from_millis(5));
        assert!(!t.is_blocked("adri"));
    }
}
