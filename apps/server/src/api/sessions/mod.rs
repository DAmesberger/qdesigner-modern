//! Session API surface, split by concern.
//!
//! - [`models`] — DTOs, `FromRow` row structs, and the shared helper
//!   functions reused across the handler modules (variable normalization,
//!   numeric statistics, session-access probes). Kept together because
//!   they are cross-cutting: `sync` reuses the ingestion helpers, `crud`
//!   (update_session) refreshes variable projections, `filter` reuses the
//!   analytics statistics helpers.
//! - [`crud`] — session lifecycle + read handlers.
//! - [`ingestion`] — response/event/variable write handlers.
//! - [`analytics`] — aggregate/compare/dashboard/cross-project/timeseries.
//! - [`quotas`] — condition counts and quota status.
//! - [`sync`] — offline sync batch handler.
//! - [`filter`] — dynamic session filtering.
//!
//! `mod.rs` re-exports each handler module with a `pub use` glob so the
//! generated `__path_<fn>` items land at `api::sessions::*`, keeping the
//! route wiring in `api/mod.rs` and the path/schema references in
//! `openapi.rs` resolvable exactly as before the split.

mod analytics;
mod crud;
mod filter;
mod ingestion;
mod models;
mod quotas;
mod sync;

pub use analytics::*;
pub use crud::*;
pub use filter::*;
pub use ingestion::*;
pub(crate) use models::*;
pub use quotas::*;
pub use sync::*;
