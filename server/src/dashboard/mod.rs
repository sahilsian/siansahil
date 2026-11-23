//! The tenant dashboard: accounts, sessions and the rules for what can be edited.
//! HTTP routes live in `routes::dashboard`.

pub mod accounts;
pub mod media;
pub mod prints;
pub mod products;
pub mod r2;
pub mod store;
pub mod stripe;
pub mod text_only;
pub mod throttle;
