# MCP protocol and authorization constraints for QDesigner

**Research date:** 2026-09-01  
**Question:** Which current MCP protocol, transport, result, authorization,
scope, cancellation, progress, security, and compatibility constraints must a
QDesigner server for questionnaire creation and testing account for?

## Executive answer

QDesigner should treat MCP revision `2026-07-28` as its normative protocol.
That is the current stable revision: the specification's unversioned URL now
resolves to it, and the MCP project announced the revision as generally
available with support in all four Tier 1 SDKs. This revision is a material
break from the 2025 family: it is stateless, removes `initialize` and
`Mcp-Session-Id`, requires protocol and capability metadata on every request,
and requires `server/discover` on servers.
([current specification](https://modelcontextprotocol.io/specification/),
[2026-07-28 release announcement](https://blog.modelcontextprotocol.io/posts/2026-07-28/),
[versioning specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning))

For the shared product, expose one authenticated Streamable HTTP endpoint and
keep the MCP adapter stateless. It should call the same Questionnaire
Definition module used by the UI rather than create a second mutation path.
The initial tool surface should remain the three already proposed operations:
read a definition, apply a definition, and test a questionnaire. Use narrow
OAuth scopes, but always apply QDesigner's existing organization/project
authorization after validating the token. Use JSON Schema input and output,
structured tool results, and request-scoped progress/cancellation. Large QDef
packages and test artifacts should be returned as protected resource links,
not unbounded inline payloads.

Human-delegated agents can use the core MCP OAuth flow. Unattended
machine-to-machine agents are a separate product mode: OAuth client credentials
is currently an official **draft extension**, not a core interoperability
guarantee. Do not quietly make it a launch dependency.
([authorization extensions status](https://github.com/modelcontextprotocol/ext-auth),
[draft client-credentials extension](https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/draft/oauth-client-credentials.mdx))

The remainder of this report first records sourced protocol facts, then derives
QDesigner recommendations. Recommendation wording is deliberately separate
from normative MCP requirements.

## Sourced protocol facts

### 1. Revision and protocol lifecycle

- The current stable revision is `2026-07-28`. It defines a "modern" era for
  `2026-07-28` and later; revisions through `2025-11-25` are the legacy,
  initialization-based era.
  ([versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning))
- There is no negotiation handshake in the modern era. Every request carries
  `io.modelcontextprotocol/protocolVersion` and
  `io.modelcontextprotocol/clientCapabilities` in `_meta`; client identity is
  also sent per request. A server rejects an unsupported revision with
  `UnsupportedProtocolVersionError` and lists its supported revisions.
  ([versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning))
- Modern servers must implement `server/discover`. A client may call it before
  other methods to learn versions and capabilities, but may instead call a
  domain method directly and recover from an unsupported-version response.
  ([discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover))
- The 2026 revision removed protocol sessions, the `Mcp-Session-Id` header,
  SSE resumability, and the GET notification stream. Cross-call state must be
  represented by explicit server-minted handles passed as ordinary arguments.
  ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog),
  [tools and explicit handles](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#stateful-tools))
- Results have a required `resultType`: `complete` for ordinary results and
  `input_required` for Multi Round-Trip Requests. Older results without the
  field are interpreted as complete only for backward compatibility.
  ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog))
- Roots, Sampling, Logging, the old HTTP+SSE transport, and Dynamic Client
  Registration are deprecated for new implementations. Tasks are now an
  opt-in extension rather than core protocol.
  ([deprecated features](https://modelcontextprotocol.io/specification/2026-07-28/deprecated),
  [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog))

### 2. Standard transports

MCP defines stdio and Streamable HTTP as its standard transports. Protocol
semantics are the same, but framing and cancellation differ.
([transport overview](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports))

#### stdio

- The client launches the server subprocess. Messages are newline-delimited,
  UTF-8 JSON-RPC on `stdin`/`stdout`; embedded newlines are forbidden. Logs may
  use `stderr`, and the server must never put non-MCP output on `stdout`.
- Metadata remains in the JSON body; there is no header layer.
- The server process should exit when its input closes. A process restart loses
  in-flight work, which the client may retry because the modern protocol is
  stateless.
  ([stdio binding](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio))

The MCP OAuth profile applies to HTTP. A stdio implementation should not run
the HTTP OAuth flow and should instead obtain credentials from its environment.
([authorization protocol requirements](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#protocol-requirements))

#### Streamable HTTP

- The server exposes one MCP endpoint accepting POST. Each JSON-RPC message is
  a separate POST. A request receives either one JSON response or an SSE stream
  scoped to that request; a long-lived `subscriptions/listen` request carries
  opted-in change notifications.
- Clients must advertise both `application/json` and `text/event-stream` and
  support either response form. The modern binding has no GET stream, protocol
  session, or `Last-Event-ID` replay.
- Every POST requires `MCP-Protocol-Version` and `Mcp-Method`; calls to tools,
  resources, and prompts also require `Mcp-Name`. Mirrored header and body
  values must agree or the server rejects the request.
- Every request must be independently routable. Any instance may receive it;
  transport-local state cannot be an authorization or workflow dependency.
  ([Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http))

### 3. Tool and resource result forms

Tools declare JSON Schema `inputSchema` and may declare `outputSchema`.
JSON Schema defaults to draft 2020-12. If an output schema is present, the
server must return conforming `structuredContent`, and clients should validate
it. Structured content may be any JSON value. For compatibility, a server that
returns structured content should also serialize it into a text content block.
([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool),
[structured content and output schema](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content))

Unstructured tool `content` may contain text, image, audio, resource-link, and
embedded-resource blocks. A resource link is a URI plus descriptive metadata;
links returned by tools do not have to appear in `resources/list`. A server that
embeds resources should implement the resource capability.
([tool results](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-result))

Resources are read with `resources/read` and contain either text or base64
binary content. A read may return multiple contents. Resource list, template
list, and read results are cacheable and include `ttlMs` plus `cacheScope`
(`public` or `private`).
([resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources))

Tool errors have two forms. Malformed protocol requests and unknown methods use
JSON-RPC errors. Domain, validation, or execution failures that an agent can
correct use a normal tool result with `isError: true` and actionable content.
([tool error handling](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#error-handling))

Tool annotations and content annotations are hints, not enforcement:

- tool behavior annotations are untrusted unless the server itself is trusted;
- content/resource `audience` accepts `user` and `assistant`, while `priority`
  and `lastModified` guide client display and context selection.
  ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
  [resource annotations](https://modelcontextprotocol.io/specification/2026-07-28/server/resources#annotations))

This content `audience` is unrelated to OAuth token audience. It cannot hide a
resource or authorize an operation.

### 4. OAuth protected-resource behavior

Authorization is optional in MCP generally, but an HTTP server that supports it
should follow the MCP OAuth profile. The protected MCP server is an OAuth 2.1
resource server; the authorization server is a separate role and may be hosted
elsewhere.
([authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization))

For a protected HTTP server:

- The MCP resource server must publish RFC 9728 Protected Resource Metadata,
  including at least one `authorization_servers` entry. Clients must support
  discovery from the `resource_metadata` parameter in a 401
  `WWW-Authenticate` challenge and from the path-aware/root well-known URIs.
  Challenge metadata takes precedence.
  ([authorization-server discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery))
- The authorization server must expose either RFC 8414 OAuth metadata or OpenID
  Connect Discovery; clients must support both and validate that the discovered
  `issuer` exactly matches the issuer used for discovery.
  ([authorization-server discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery#authorization-server-metadata-discovery))
- Registration preference is: known pre-registration, Client ID Metadata
  Documents when advertised, deprecated Dynamic Client Registration as a
  fallback, then manually supplied client information. Credentials must remain
  bound to the issuer that registered them.
  ([client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration))
- Clients must use PKCE, confirm that the authorization server advertises PKCE,
  and use `S256` when capable. Authorization responses carrying `iss` must be
  checked against the recorded issuer before code exchange.
  ([authorization security](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations),
  [authorization-response validation](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#authorization-response-validation))

### 5. OAuth audience, scopes, and tokens

OAuth audience and content audience are separate concepts.

- Clients must include RFC 8707 `resource` in both authorization and token
  requests, using the canonical URI of the MCP server. Servers must validate
  that inbound tokens were issued specifically for that resource/audience.
- Bearer tokens belong in the `Authorization` header on every HTTP request and
  must never appear in query strings. Invalid or expired tokens receive 401.
- The server must not accept or transit tokens intended for other resources.
  If it calls an upstream API, it must use a separate upstream credential; MCP
  token passthrough is forbidden.
  ([resource indicator and token handling](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#resource-parameter-implementation),
  [authorization security](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations#access-token-privilege-restriction))

Servers should state the scopes required for the current operation in the 401
challenge. For a valid token with insufficient scope, the server should return
403 with `error="insufficient_scope"`, the complete scope set needed for that
operation, and the protected-resource metadata URL. Clients accumulate earlier
grants during step-up; scopes should follow least privilege.
([scope selection and step-up](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#scope-selection-strategy),
[runtime insufficient scope](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#runtime-insufficient-scope-errors))

Scopes are only one authorization input. MCP explicitly requires proper access
control for tool execution; token scope does not decide access to a particular
QDesigner organization, project, or questionnaire.
([tool security](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#security-considerations))

### 6. Progress, cancellation, and long-running work

Progress is request-scoped and optional. A client asks for it with a unique
string or integer `progressToken`; the server may emit `notifications/progress`
with monotonically increasing progress, optional total, and a human-readable
message. Both sides should rate-limit progress and it must stop on completion.
([progress](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress))

Cancellation differs by transport:

- on Streamable HTTP, closing the request's SSE response stream is the
  cancellation signal;
- on stdio, the client sends `notifications/cancelled` with the request ID.

The server should stop work and release resources promptly. Implementations
should enforce configurable per-request timeouts plus a maximum timeout that
progress notifications cannot extend indefinitely.
([cancellation](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation))

The Tasks facility is an optional extension. It adds durable handles and polling
for genuinely long-running operations, but requires explicit extension support
from both parties. It is not necessary for bounded synchronous calls that can
stream progress.
([extensions](https://modelcontextprotocol.io/specification/2026-07-28#extensions),
[Tasks extension](https://github.com/modelcontextprotocol/ext-tasks))

### 7. Security controls

The current specification requires or recommends the following controls:

- Streamable HTTP servers must validate `Origin`; an invalid present origin is
  rejected with 403. Local HTTP servers should bind to `127.0.0.1`, not all
  interfaces, and connections should be authenticated.
  ([Streamable HTTP security](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security--endpoint))
- Tool servers must validate inputs, enforce access control, rate-limit calls,
  and sanitize outputs. Clients should show sensitive tool inputs, ask for user
  confirmation, impose timeouts, validate results, and audit usage.
  ([tool security](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#security-considerations))
- Access and refresh tokens require secure storage; access tokens should be
  short-lived, and public clients must rotate refresh tokens. Authorization
  endpoints require HTTPS; redirect URIs require HTTPS or localhost.
- Clients must protect against authorization-code interception, issuer mix-up,
  and open redirect. Authorization servers fetching Client ID Metadata
  Documents must account for SSRF.
  ([authorization security](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations))
- The general MCP trust model calls for explicit consent, visible tool use, and
  user control. Tool annotations are not a security boundary.
  ([specification security principles](https://modelcontextprotocol.io/specification/2026-07-28#security-and-trust--safety))

### 8. Compatibility constraints

Modern-only clients and legacy-only servers cannot interoperate, nor can
legacy-only clients use a modern-only server. A dual-era implementation may
support both behaviors. Modern stdio clients probe with `server/discover` and
fall back to `initialize` after an unrecognized error; HTTP clients distinguish
recognized modern JSON-RPC errors from legacy 4xx responses.
([compatibility matrix](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning#compatibility-matrix))

The official TypeScript SDK requires explicit opt-in for the 2026 era. Its
default `Client.connect()` and directly connected server classes retain 2025
behavior. Modern or dual-era serving uses the newer HTTP handler/stdio factory
entry points, and clients choose automatic negotiation or a pinned modern
revision. An implementation can therefore upgrade an SDK dependency yet still
accidentally speak only the legacy protocol unless its protocol mode is tested.
([official TypeScript SDK protocol guide](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions),
[2026 support migration guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28))

The core interactive authorization flow covers an agent acting for a user.
Unattended client-credentials authentication is currently a draft official
extension and must not be presumed available in every MCP host.
([authorization extensions](https://github.com/modelcontextprotocol/ext-auth),
[client credentials draft](https://github.com/modelcontextprotocol/ext-auth/blob/main/specification/draft/oauth-client-credentials.mdx))

## Recommendations and inferences for QDesigner

The items in this section are product/architecture recommendations derived from
the sourced constraints. They are not claims that MCP mandates these names or
this exact product shape.

### Protocol and deployment decision

1. **Make `2026-07-28` the normative contract.** Pin it in conformance tests;
   do not build new behavior around `initialize`, sessions, GET streams, or SSE
   replay.
2. **Use remote Streamable HTTP for the shared product.** It fits QDesigner's
   multi-user deployment and OAuth/RBAC model. Keep requests stateless so any
   application instance can serve them.
3. **Offer stdio only as a local development/test adapter if a target host needs
   it.** It must call the same Definition module and receive a deliberately
   narrow identity/credential from its launch environment. It must not gain a
   broad database credential or become an alternative production authorization
   path.
4. **Use one isolated compatibility adapter for `2025-11-25` only if target-host
   testing demonstrates a need.** A dual-era adapter may be inexpensive with an
   official SDK, but no legacy session state may enter the Definition module.
   Do not support the older HTTP+SSE transport.
5. **Add an explicit compatibility gate before implementation tickets close:**
   test the actual MCP hosts the client will use, asserting the negotiated
   revision, tool schemas, structured results, progress, cancellation, OAuth
   discovery, and scope step-up.

### Tool and resource contract

Keep three model-controlled tools, all backed by the one Definition module:

| Tool | Operation | Suggested OAuth scope | Result form |
| --- | --- | --- | --- |
| `qdesigner_definition_get` | Read canonical QDef and digest | `questionnaires:read` | Typed `structuredContent`; protected resource link for a packaged export |
| `qdesigner_definition_apply` | Validate and atomically apply QDef | `questionnaires:write` | Validation/plan summary, new revision and digest, actionable diagnostics |
| `qdesigner_questionnaire_test` | Run deterministic scenarios | `questionnaires:test` plus read access | Typed summary, progress, and protected artifact links |

For all three:

- publish strict JSON Schema 2020-12 input and output schemas;
- return `resultType: "complete"`, structured JSON, and a concise text block;
- reserve JSON-RPC errors for malformed protocol calls and use `isError: true`
  for fixable QDef validation, stale revision, and test failures;
- keep tool listing deterministic and avoid putting secrets, tokens, PII, or
  QDef content into `x-mcp-header` values;
- include stable diagnostic codes and JSON pointers so agents can repair a
  definition deterministically.

QDef JSON can be inline when bounded. A `.qdef` package, binary asset, browser
trace, screenshot, or large test report should use a protected, expiring
resource link. If the server exposes `resources/read`, use a QDesigner-owned URI
scheme and re-run authorization on every read. Do not treat a resource
annotation or hard-to-guess URI as access control. Mark all authenticated
resource list/read caches `private`.

### Authorization decision

1. **Protect the entire remote MCP endpoint.** Every operation touches private
   questionnaire/project information; a mixed public/protected tool catalog
   adds no value.
2. **Use QDesigner's existing Zitadel/OIDC deployment as the authorization
   server and make the MCP endpoint a distinct OAuth resource.** Publish RFC
   9728 metadata from the MCP resource server. Freeze one canonical audience,
   including the `/mcp` path if that is the deployed resource identifier.
3. **Use OAuth scopes as coarse ceilings, not object authorization.** After
   issuer, expiry, audience, and scope validation, derive the local user/service
   identity and invoke QDesigner's existing authorization layer for the target
   organization, project, and questionnaire. In particular, an apply mutation
   must use the project's write authorization; a questionnaire read share must
   not accidentally become write authority.
4. **Use `questionnaires:read`, `questionnaires:write`, and
   `questionnaires:test` initially.** Publishing remains absent. Return all
   scopes required by an operation in one 403 challenge so an MCP client can
   step up once.
5. **Keep delegated-user agents as the initial supported mode.** If unattended
   migration agents become a requirement, create a separate decision for
   pre-registration, credential lifecycle, service identity, tenant/project
   bounds, and adoption of the draft client-credentials extension. A general
   administrative token is not acceptable.
6. **Never forward the inbound MCP token.** Prefer the in-process Definition
   module. If the adapter must call another QDesigner API, use a separately
   issued, audience-correct internal credential and preserve the original actor
   in the audit context.

### Mutation and testing safety

`qdesigner_definition_apply` should be safe independently of whether an MCP
host displays a confirmation:

- validate the complete QDef before mutation;
- support preview/dry-run;
- require an expected revision or digest and reject stale writes;
- make retries idempotent;
- apply atomically;
- never infer publication from apply;
- audit actor, OAuth client, tenant/project, target, before/after digest,
  revision, and outcome without recording tokens or sensitive definition data.

`qdesigner_questionnaire_test` should treat even Safe Logic and imported assets
as hostile input:

- prohibit arbitrary filesystem, process, and network access;
- sandbox browser execution;
- cap CPU, memory, duration, scenario count, output bytes, screenshots, and
  artifact lifetime;
- rate-limit by subject, client, organization, and project;
- stream bounded progress and honor disconnect/cancellation;
- start as a bounded synchronous request. Adopt Tasks only when real target
  hosts support the extension and observed workloads cannot fit the maximum
  request duration.

### Acceptance checks to carry into specifications

- A modern `server/discover` advertises `2026-07-28`, the exact capabilities,
  and no unsupported extension.
- Every request is independent; retrying the same safe operation on another
  server instance has the same result.
- HTTP header/body metadata mismatches are rejected, and invalid `Origin`
  receives 403.
- An unauthenticated call receives 401 with usable protected-resource metadata.
- A token for another audience or issuer receives 401 and is never forwarded.
- A read-scoped subject calling apply receives one 403 challenge containing the
  complete write scope requirement.
- Write scope without target-project permission is denied by QDesigner's object
  authorization.
- Apply preview makes no state change; apply is atomic and idempotent; a stale
  digest is an actionable tool error.
- Structured results validate against their output schema and include concise
  text compatibility content.
- Resource links cannot be read by another subject, expire as documented, and
  are never shared-cacheable.
- Test progress is monotonic and bounded; cancellation stops work and artifact
  production; hard timeouts remain effective despite progress.
- Tests cannot access arbitrary network, host files, processes, or secrets.
- Tokens never appear in URLs, logs, tool content, diagnostics, resources,
  artifacts, or audit payloads.
- If stdio is provided, `stdout` contains only newline-delimited MCP JSON-RPC
  and the process exits promptly when input closes.
- Conformance runs against each named target MCP host rather than assuming SDK
  support implies host support.

## Conclusion

The protocol decision is not “add a JSON-RPC endpoint.” QDesigner needs a
modern, stateless `2026-07-28` adapter over its shared Definition module, an
OAuth resource boundary integrated with existing RBAC, strict schemas and
structured results, protected artifact resources, and request-scoped execution
controls. Legacy protocol support, local stdio, Tasks, and unattended service
agents are independent compatibility features; none should leak complexity or
authority into the canonical questionnaire-definition boundary.
