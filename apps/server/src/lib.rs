//! qdesigner-server crate root.
//!
//! Exposes all internal modules so integration tests under `tests/` can
//! call into handler/service code directly. main.rs imports from this
//! crate by name (`qdesigner_server::...`); there are no duplicate
//! module trees because main.rs no longer declares `mod x;` blocks.

pub mod api;
pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod middleware;
pub mod openapi;
pub mod rbac;
pub mod state;
pub mod storage;
pub mod websocket;
