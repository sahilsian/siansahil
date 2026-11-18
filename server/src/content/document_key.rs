/// A validated document key (page slug, product slug, form id, ...):
/// 1–128 chars of lowercase letters, digits and `-`, starting with a letter or digit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentKey(String);

impl DocumentKey {
    pub fn parse(raw: &str) -> Result<Self, String> {
        let key = raw.trim();
        let valid = (1..=128).contains(&key.len())
            && key.chars().next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
            && key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        if valid { Ok(Self(key.to_string())) } else { Err(format!("'{raw}' is not a valid document key")) }
    }
}

impl AsRef<str> for DocumentKey {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::DocumentKey;
    use claims::{assert_err, assert_ok};

    #[test]
    fn accepts_slugs() {
        for ok in ["home", "science-world", "404", &"a".repeat(128)] {
            assert_ok!(DocumentKey::parse(ok), "{ok}");
        }
    }

    #[test]
    fn rejects_invalid_keys() {
        for bad in ["", "-x", "Home", "a/b", "../etc", "a b", &"a".repeat(129)] {
            assert_err!(DocumentKey::parse(bad), "{bad:?}");
        }
    }
}
