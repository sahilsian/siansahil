/// A validated tenant id: 1–63 chars of lowercase letters, digits and `-`,
/// starting with a letter or digit (mirrors the `tenants.id` CHECK constraint).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TenantId(String);

impl TenantId {
    pub fn parse(raw: &str) -> Result<Self, String> {
        let id = raw.trim();
        let valid_len = (1..=63).contains(&id.len());
        let valid_first = id.chars().next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
        let valid_chars = id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');

        if valid_len && valid_first && valid_chars {
            Ok(Self(id.to_string()))
        } else {
            Err(format!("'{raw}' is not a valid tenant id"))
        }
    }
}

impl AsRef<str> for TenantId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::TenantId;
    use claims::{assert_err, assert_ok};

    #[test]
    fn accepts_lowercase_slugs() {
        assert_ok!(TenantId::parse("siansahil"));
        assert_ok!(TenantId::parse("tenant-2"));
    }

    #[test]
    fn trims_whitespace() {
        assert_eq!(TenantId::parse("  siansahil ").unwrap().as_ref(), "siansahil");
    }

    #[test]
    fn rejects_invalid_ids() {
        for bad in ["", " ", "-leading", "Upper", "has space", "semi;colon", &"a".repeat(64)] {
            assert_err!(TenantId::parse(bad), "{bad:?} should be rejected");
        }
    }
}
