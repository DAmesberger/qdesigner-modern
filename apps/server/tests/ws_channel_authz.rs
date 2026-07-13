//! WebSocket designer-channel authorization.
//!
//! The `designer:{questionnaire_id}` channel is a **write** surface: the relay
//! applies and persists any subscriber's `MSG_SYNC_UPDATE` frame to the server
//! `yrs::Doc` and to `questionnaire_definitions.yjs_state`. Its gate used to be
//! a hand-rolled `EXISTS` over `project_members` with **no role filter**, which
//! was wrong in both directions:
//!
//!   * a project **viewer** (post-ADR-0033 possibly a *cross-org* viewer) was
//!     admitted and could therefore rewrite questionnaire content over the
//!     socket, while the HTTP gate for the same content requires editor+; and
//!   * an org **owner/admin who is not a project member** was locked out, even
//!     though the HTTP gate admits them.
//!
//! The gate is now `websocket::handler::authorize_channel`, which asks the real
//! ADR-0030/0032 entry point (`authz::authorize` at `Scope::Project`) and grades
//! the connection Denied / ReadOnly / ReadWrite. The relay
//! (`yjs_relay::handle_binary_message`) is the enforcement point: a ReadOnly
//! subscriber's content frames are dropped.
//!
//! Both are tested **at their function seams**: a full WebSocket round-trip
//! would need a live TCP listener plus a WS client (no `tokio-tungstenite` in
//! dev-dependencies), and the crate's HTTP harness (`tower::oneshot`) cannot
//! drive an upgrade. `handle_socket` is a thin adapter between the two seams
//! exercised here.

use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::{Doc, Map, ReadTxn, StateVector, Transact};

use qdesigner_server::websocket::handler::{authorize_channel, ChannelAccess};
use qdesigner_server::websocket::yjs_relay::handle_binary_message;
use qdesigner_server::websocket::yjs_store::YjsStore;

mod common;
use common::{build_test_state, fixture_pool, provision_tenant, register_user, test_app, TestUser};

/// Yjs frame constants (mirrors `yjs_relay`).
const MSG_SYNC: u8 = 0;
const MSG_SYNC_UPDATE: u8 = 2;

/// The attacker's Yjs client id — its presence in the server doc's state vector
/// is the proof that its update landed.
const HOSTILE_CLIENT_ID: u64 = 4_242_424_242;

fn encode_var_uint(mut value: usize, out: &mut Vec<u8>) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
}

/// A well-formed `[MSG_SYNC, MSG_SYNC_UPDATE, varuint(len), update…]` frame that
/// writes a key into a top-level map — i.e. a real content mutation.
fn hostile_update_frame() -> Vec<u8> {
    let doc = Doc::with_client_id(HOSTILE_CLIENT_ID);
    let map = doc.get_or_insert_map("hostile");
    {
        let mut txn = doc.transact_mut();
        map.insert(&mut txn, "pwned", "yes");
    }
    let update = doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());

    let mut frame = vec![MSG_SYNC, MSG_SYNC_UPDATE];
    encode_var_uint(update.len(), &mut frame);
    frame.extend_from_slice(&update);
    frame
}

/// Whether the attacker's update is present in the authoritative server doc.
async fn server_doc_contains_hostile(store: &YjsStore, qid: Uuid) -> bool {
    let room_lock = store.get_or_create_room(qid).await;
    let room = room_lock.lock().await;
    let sv = StateVector::decode_v1(&room.encode_state_vector()).expect("decode state vector");
    sv.get(&HOSTILE_CLIENT_ID) > 0
}

async fn add_org_member(fx: &sqlx::PgPool, org_id: Uuid, user: &TestUser, role: &str) {
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) \
         VALUES ($1, $2, $3, 'active')",
    )
    .bind(org_id)
    .bind(user.id)
    .bind(role)
    .execute(fx)
    .await
    .expect("seed organization_members");
}

async fn add_project_member(fx: &sqlx::PgPool, project_id: Uuid, user: &TestUser, role: &str) {
    sqlx::query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)")
        .bind(project_id)
        .bind(user.id)
        .bind(role)
        .execute(fx)
        .await
        .expect("seed project_members");
}

/// The gate: every principal is graded against the same tiers the HTTP surface
/// enforces.
#[tokio::test]
async fn designer_channel_authorization_is_role_tiered() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let Some(fx) = fixture_pool().await else {
        eprintln!("skipping: no fixture pool");
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let channel = format!("designer:{}", tenant.questionnaire_id);

    // A project viewer (also an ordinary org member).
    let viewer = register_user(&app).await;
    add_org_member(&fx, tenant.org_id, &viewer, "member").await;
    add_project_member(&fx, tenant.project_id, &viewer, "viewer").await;

    // A project editor.
    let editor = register_user(&app).await;
    add_org_member(&fx, tenant.org_id, &editor, "member").await;
    add_project_member(&fx, tenant.project_id, &editor, "editor").await;

    // An org admin who is NOT a project member (the lockout bug).
    let org_admin = register_user(&app).await;
    add_org_member(&fx, tenant.org_id, &org_admin, "admin").await;

    // A cross-org project viewer (ADR 0033): a project_members row, no org
    // membership at all. Read-only, and must not be able to write.
    let cross_org_viewer = register_user(&app).await;
    add_project_member(&fx, tenant.project_id, &cross_org_viewer, "viewer").await;

    // A total outsider.
    let outsider = register_user(&app).await;

    assert_eq!(
        authorize_channel(&state, owner.id, &channel).await,
        ChannelAccess::ReadWrite,
        "the org owner keeps write access"
    );
    assert_eq!(
        authorize_channel(&state, editor.id, &channel).await,
        ChannelAccess::ReadWrite,
        "a project editor keeps write access"
    );
    assert_eq!(
        authorize_channel(&state, org_admin.id, &channel).await,
        ChannelAccess::ReadWrite,
        "an org admin who is not a project member must be ADMITTED (the HTTP gate admits them)"
    );
    assert_eq!(
        authorize_channel(&state, viewer.id, &channel).await,
        ChannelAccess::ReadOnly,
        "a project viewer may watch but MUST NOT hold write access"
    );
    assert_eq!(
        authorize_channel(&state, cross_org_viewer.id, &channel).await,
        ChannelAccess::ReadOnly,
        "a cross-org project viewer may watch but MUST NOT hold write access"
    );
    assert_eq!(
        authorize_channel(&state, outsider.id, &channel).await,
        ChannelAccess::Denied,
        "a non-member is denied the channel outright"
    );

    // A garbage / unknown-resource channel is denied, and so is a channel whose
    // questionnaire does not exist.
    assert_eq!(
        authorize_channel(&state, owner.id, "designer:not-a-uuid").await,
        ChannelAccess::Denied
    );
    assert_eq!(
        authorize_channel(&state, owner.id, &format!("designer:{}", Uuid::new_v4())).await,
        ChannelAccess::Denied
    );
}

/// The enforcement point: a read-only subscriber's content frame must never
/// reach the server document.
#[tokio::test]
async fn read_only_subscriber_cannot_write_the_yjs_doc() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let qid = tenant.questionnaire_id;
    let conn_id = Uuid::new_v4();
    let frame = hostile_update_frame();

    assert!(
        !server_doc_contains_hostile(&state.yjs_store, qid).await,
        "precondition: the server doc has never seen the hostile client"
    );

    // (1) A read-only connection (project viewer) sends the update: dropped.
    let responses = handle_binary_message(
        &frame,
        qid,
        &state.yjs_store,
        &state.websocket_state,
        &conn_id,
        false, // can_write — the ReadOnly tier
    )
    .await;
    assert!(
        responses.is_empty(),
        "a rejected content frame produces no reply"
    );
    assert!(
        !server_doc_contains_hostile(&state.yjs_store, qid).await,
        "a read-only subscriber MUST NOT be able to mutate the shared document"
    );

    // (2) The very same frame from a write-capable connection (editor+) IS
    // applied — proving the assertion above is about the tier, not about a
    // malformed frame.
    handle_binary_message(
        &frame,
        qid,
        &state.yjs_store,
        &state.websocket_state,
        &conn_id,
        true, // can_write — the ReadWrite tier
    )
    .await;
    assert!(
        server_doc_contains_hostile(&state.yjs_store, qid).await,
        "an editor's update must still be applied (the fix must not break collaboration)"
    );
}
