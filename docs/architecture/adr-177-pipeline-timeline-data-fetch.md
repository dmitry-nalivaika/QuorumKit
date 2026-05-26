# ADR-177: Pipeline Timeline Data-Fetch Model

| Field | Value |
|---|---|
| **ADR Number** | 177 |
| **Issue** | #177 — Pipeline Progress Timeline UI |
| **Status** | Accepted |
| **Date** | 2026-05-25 |
| **Deciders** | Architect Agent |
| **Supersedes** | — |
| **Related** | ADR-002 (state storage), ADR-004 (state comment model), ADR-175 (local parallel pipeline worktree model) |

---

## Context

Spec #177 introduces a **Pipeline Timeline panel** in the dashboard browser UI.
The panel must display a structured, filterable, auto-refreshing history of all
agent events for a given GitHub Issue, reconstructed from `apm-msg` fenced blocks
and `agent-footprint` structured comments already written by agents into GitHub
Issue comment threads.

This requires the dashboard server (`engine/dashboard/server.js`) to fetch GitHub
Issue comments on demand, parse structured agent events out of raw Markdown comment
bodies, and deliver those events to the browser. Four decisions with non-trivial
trade-offs arise:

1. **How does the server reach the GitHub API?** (authentication, dependency surface)
2. **Where does comment parsing happen?** (server vs. browser; code reuse vs. XSS
   surface)
3. **How are events delivered to the browser?** (polling vs. Server-Sent Events vs.
   WebSocket push)
4. **Does the server cache fetched results?** (rate-limit protection vs. data
   freshness)

All four decisions are governed by Constitution Principle VII (Simplicity / YAGNI —
no new dependencies without an ADR), Principle IX (Dashboard is a read-only
observability surface — no write path), and Principle VI (Observable, Auditable
Automation). An ADR is required because each decision either introduces or explicitly
rejects an external dependency, and together they define an irreversible wire
contract for a new public endpoint.

---

## Decision 1: GitHub API Access Model

**The server fetches GitHub Issue comments by shelling out to the `gh` CLI
(`gh api /repos/:owner/:repo/issues/:number/comments`), exactly as the existing
Orchestrator does. No new dependency is introduced.**

### Rationale

The `gh` CLI is already present, authenticated, and resolved on the developer's
PATH (enriched at server startup via `SHELL_PATH` in `server.js`). The existing
Orchestrator (`engine/orchestrator/`) uses `gh api` for every GitHub read
throughout the SDLC loop. Mirroring that pattern keeps the dashboard's runtime
requirements identical to the orchestrator's.

**Rate-limit arithmetic**: GitHub's authenticated REST API allows 5 000 requests
per hour. A single timeline panel polling every 30 seconds for one issue makes
120 requests per hour. Even with 10 concurrently viewed issues that is 1 200
requests per hour — well within the limit. The 25-second TTL cache (Decision 4)
further cushions multi-tab usage.

Browser-direct access (Option B) would expose a GitHub Personal Access Token
(PAT) in the browser's JavaScript context, violating the constitution's security
constraint ("No secrets, tokens, or credentials may be committed to the
repository") and its spirit — a PAT visible in DevTools is equivalent to one
committed to source. Adding `@octokit/rest` (Option C) introduces a new npm
dependency, which Constitution Principle VII explicitly prohibits without an ADR.
Since `gh` already satisfies the requirement, the dependency cost is unjustified.

### Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| **A — `gh api` CLI (chosen)** | Zero new dependency; already authenticated; consistent with Orchestrator; 5 000 req/hr authenticated limit | Requires `gh` CLI on PATH; introduces child-process latency (~100–200 ms) per call | — |
| **B — Browser fetches GitHub API directly with PAT** | No server round-trip for reads | PAT visible in browser DevTools; token must be stored somewhere (localStorage = XSS risk); requires CORS allowance from GitHub | Violates constitution security constraints; PAT exposure is a hard anti-pattern |
| **C — `@octokit/rest` npm package** | Typed SDK; no child-process overhead | New runtime dependency; requires `npm install` and version pinning; adds ~500 KB to node_modules | Constitution VII prohibits new dependencies without an ADR; `gh` already satisfies the need |

---

## Decision 2: Comment Parsing Location

**The server parses `apm-msg` blocks and `agent-footprint` comments, returning
structured event objects as JSON. Raw Markdown comment bodies never reach the
browser unprocessed. The server reuses `engine/orchestrator/apm-msg-parser.js`
via dynamic `import()` to extract structured `apm-msg` payloads.**

### Rationale

Parsing on the server has two compounding benefits: it keeps all parser logic in
one canonical location (single source of truth), and it eliminates the `apm-msg`
Markdown block as an XSS vector in the browser. If the browser parsed raw GitHub
comment bodies, any Markdown that contained crafted HTML or script tags could
execute in the developer's local browser session. Server-side parsing produces
clean structured JSON — only sanitised plain-text summaries and pre-parsed fields
reach the client.

`apm-msg-parser.js` is a pure ES module with top-level `await`. The dashboard
server is CommonJS. These can interoperate via Node.js dynamic `import()`:
`const { parseApmMsg } = await import(...)` resolves correctly at runtime (Node ≥
14.8). This module boundary must be initialised once at server startup and cached
in a module-level reference; it must not be re-imported on every request.

For comments that do not contain a valid `apm-msg` block but do contain an
`agent-footprint` HTML comment marker (the secondary structured format), the
server applies a lightweight regex extraction directly — no external parser needed
for that format, and `apm-msg-parser.js` is not extended. This preserves the
parser's single responsibility.

Comments from the GitHub API that produce a `'no-block'` parse result are included
in the timeline response as `eventType: "narrative"` rows with their sanitised
body text (see Security Considerations), allowing the timeline panel to show all
comment activity, not just agent-structured events.

### Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| **A — Server parses, returns structured JSON (chosen)** | Single parser location; no duplication; eliminates XSS surface from raw Markdown reaching browser | Module boundary: ES module parser imported into CommonJS server via dynamic `import()` — needs one-time initialisation | — |
| **B — Browser parses raw Markdown comments** | No server parsing logic; reduced server payload size | Duplicates parser in browser JS; raw Markdown in DOM creates XSS surface; future parser changes require updates in two places | Violates DRY; introduces a meaningful XSS risk that server-side parsing eliminates for free |

---

## Decision 3: Real-Time Delivery

**The browser client polls `GET /api/timeline/:issueNumber` every 30 seconds.
The server remains stateless between requests. No Server-Sent Events loop or
WebSocket push infrastructure is added to the server.**

### Rationale

The dashboard server is already stateless for all data-read routes: `GET
/api/config`, `GET /api/agents`, `GET /api/pipelines` all execute and return
without the server maintaining any per-client connection state. The WebSocket
channel (`wss`) is used exclusively for real-time push of orchestrator events
arriving via the `POST /webhook/pipeline-event` route — a server-initiated
broadcast model, not a pull model.

Extending the server with an SSE push loop (Option B) would require the server to
independently poll GitHub for each subscribed issue on a background interval,
correlate results with connected SSE clients, and clean up subscriptions when
clients disconnect. This is substantially more complex than the existing stateless
pattern and creates a risk of unbounded GitHub API call growth as the number of
connected clients increases. It also means the server would make GitHub calls even
when no browser tab is looking at the timeline — wasted quota.

GitHub webhooks (Option C) require a publicly reachable endpoint. The dashboard
runs on `localhost:3131` in local development mode; there is no public endpoint.
This option is inapplicable in the primary use case.

Client-side polling at 30-second intervals exactly matches the auto-refresh
requirement in US-3. The 25-second TTL cache (Decision 4) ensures that every poll
from the browser returns data no older than 25 seconds, effectively satisfying
the "silently re-fetches every 30 seconds" acceptance scenario.

### Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| **A — Client polling every 30 s (chosen)** | Stateless server; simple implementation; no persistent connection management; consistent with existing read-route pattern | Events arrive up to 30 s late (acceptable per spec US-3) | — |
| **B — Server-Sent Events (server pushes on detection)** | Lower perceived latency; no client-side interval management | Server must maintain a per-issue background polling loop; unbounded GitHub API calls as client count grows; complex connection lifecycle management | Complexity is disproportionate to the latency benefit; violates YAGNI |
| **C — GitHub webhook → WebSocket push** | True real-time; zero polling latency | Requires public webhook endpoint; unavailable in local dev; requires secret management for webhook delivery | Inapplicable: dashboard runs on localhost without a public endpoint |

---

## Decision 4: Caching

**The server maintains an in-memory cache (a `Map`) keyed by issue number, with a
25-second TTL. A cache hit returns the stored result immediately without shelling
out to `gh`. A cache miss (or expired entry) triggers a fresh `gh api` call,
updates the cache, and returns the result.**

### Rationale

Without caching, a developer with two browser tabs open to the same issue would
generate twice the GitHub API calls per 30-second cycle. A manual refresh button
(US-6) could further multiply requests if clicked rapidly. The 25-second TTL is
intentionally shorter than the 30-second poll interval: a browser tab that polls
at t=0 populates the cache; a second tab polling at t=15 receives a 15-second-old
cached result; at t=30 the first tab's next poll finds the cache expired (TTL=25 s)
and re-fetches fresh data. This means fresh data always arrives within one poll
cycle (≤ 30 s), satisfying the "silently re-fetches every 30 seconds" requirement
in US-3 while capping `gh` calls to one per 25 seconds per issue regardless of
connected client count.

Cache entries are stored in a module-level `Map<number, { data: object, fetchedAt:
number }>`. This is consistent with the server's existing in-memory patterns
(`running`, `kanbanCards`). The cache is non-persistent: a server restart clears
it, which is acceptable because the authoritative data source is always GitHub.

Cache size is inherently bounded: one entry per issue number ever requested in the
server's current uptime. In practice, a developer session views a small number of
issues (< 20); no eviction policy beyond TTL expiry is required.

---

## API Contract

### `GET /api/timeline/:issueNumber`

**Path parameter**: `:issueNumber` — a positive integer (GitHub Issue number).
The server validates that it matches `/^\d+$/` and is non-zero; invalid values
return `400`.

**Success response** — `200 application/json`:

```json
{
  "issueNumber": 42,
  "fetchedAt": "2026-05-25T12:00:00.000Z",
  "cached": false,
  "overallStatus": "running",
  "events": [
    {
      "id": "comment-12345678",
      "commentId": 12345678,
      "commentUrl": "https://github.com/owner/repo/issues/42#issuecomment-12345678",
      "agent": "Developer Agent",
      "agentEmoji": "🛠️",
      "eventType": "start",
      "outcome": "running",
      "step": "implement",
      "runId": "run-001",
      "iteration": 1,
      "timestamp": "2026-05-25T11:55:00.000Z",
      "summary": "Developer Agent started implementation step",
      "bodyText": "Sanitised plain-text rendering of the comment body (HTML stripped)."
    }
  ],
  "agentNames": ["BA Agent", "Developer Agent"]
}
```

**Field definitions**:

| Field | Type | Description |
|---|---|---|
| `issueNumber` | `number` | Echoed back from the request |
| `fetchedAt` | ISO-8601 string | When the server last fetched from GitHub |
| `cached` | `boolean` | `true` if this response was served from the TTL cache |
| `overallStatus` | `"running" \| "success" \| "failed" \| "awaiting-approval" \| "unknown"` | Derived from the most recent terminal `apm-msg` outcome across all events |
| `events` | `Event[]` | Chronologically ordered array, oldest first |
| `events[].id` | `string` | Stable opaque identifier: `"comment-{commentId}"` |
| `events[].commentId` | `number` | GitHub comment ID |
| `events[].commentUrl` | `string` | Direct URL to the GitHub comment |
| `events[].agent` | `string` | Agent name from `apm-msg.agent` or `agent-footprint`; `"Unknown"` if not parseable |
| `events[].agentEmoji` | `string \| null` | Unicode emoji character extracted from agent name or comment prefix; `null` if absent |
| `events[].eventType` | `"start" \| "complete" \| "fail" \| "approval-request" \| "approval-granted" \| "narrative"` | Normalised from `apm-msg.outcome`; `"narrative"` for comments with no structured block |
| `events[].outcome` | `string \| null` | Raw `outcome` field from the `apm-msg` block; `null` for narrative events |
| `events[].step` | `string \| null` | `apm-msg.step` value |
| `events[].runId` | `string \| null` | `apm-msg.runId` value |
| `events[].iteration` | `number \| null` | `apm-msg.iteration` value |
| `events[].timestamp` | ISO-8601 string | GitHub comment `created_at` field |
| `events[].summary` | `string` | One-line human-readable summary; derived from `apm-msg` fields or first non-empty line of sanitised body |
| `events[].bodyText` | `string` | HTML-stripped, length-capped (≤ 4 096 chars) plain-text rendering of the full comment body |
| `agentNames` | `string[]` | Deduplicated sorted list of all agent names present in `events`; used to populate the filter dropdown |

**Error responses**:

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "issueNumber must be a positive integer" }` | Invalid path parameter |
| `502` | `{ "error": "GitHub API unavailable: <gh stderr>" }` | `gh api` subprocess failed |
| `404` | `{ "error": "Issue not found or has no comments" }` | GitHub returned an empty comment list or 404 |

---

## Security Considerations

### Comment body sanitisation

GitHub comment bodies are untrusted user input. Any agent or human may post a
comment containing crafted HTML or Markdown that, if rendered unescaped in the
browser, could execute JavaScript (stored XSS).

**Server-side obligations** (enforced before the `bodyText` field is populated):

1. **Strip all HTML tags** using a regex allowlist approach: remove every `<...>`
   sequence from the comment body before including it in the JSON response.
   The server does not render Markdown to HTML — it returns plain text only.
2. **Cap body length** at 4 096 characters. Comment bodies beyond this limit are
   truncated with an appended `"…"` sentinel. This bounds response payload size
   and limits the blast radius of any inadvertent rendering.
3. **Never return raw `apm-msg` block content** in `bodyText`. The structured JSON
   payload extracted by `parseApmMsg` is placed in the typed fields (`outcome`,
   `step`, `runId`, etc.). The raw fenced block is excluded from `bodyText` to
   prevent double-rendering of structured data.

**Client-side obligations** (enforced in `index.html`):

4. **`bodyText` must be set as `element.textContent`**, never `element.innerHTML`.
   This provides a second defence-in-depth layer: even if the server-side strip
   misses an edge case, the browser will not interpret the content as HTML.
5. **`commentUrl` must be validated** to match `https://github.com/` before
   constructing an anchor element, preventing open-redirect via a crafted URL in
   a comment payload.

### `gh` subprocess safety

The `:issueNumber` path parameter is validated as `/^\d+$/` before being
interpolated into the `gh api` shell command. Only the decimal-digit-validated
integer value is used in the command string — never the raw request path. This
prevents command injection via crafted URL paths (e.g.
`/api/timeline/1;rm+-rf+/`).

---

## Constitution Alignment

| Principle | How this decision set satisfies it |
|---|---|
| I — Agent-First Design | The timeline endpoint is agent-callable: a deterministic `GET` with a structured JSON response; agents can query it to inspect pipeline history |
| II — NNN Traceability | The `issueNumber` parameter is the NNN identifier; every event in the response is anchored to a GitHub Issue comment |
| VI — Observable, Auditable | The timeline panel makes the full agent audit trail accessible in the dashboard without manual GitHub browsing |
| VII — Simplicity / YAGNI | No new npm dependencies introduced; `gh` CLI and the existing `apm-msg-parser.js` are reused |
| VIII — Orchestrator as Single Control Plane | The dashboard reads state; it does not post comments, trigger steps, or sequence agents; the `GET /api/timeline` endpoint is strictly read-only |
| IX — Dashboard as Read-Only | The new endpoint is `GET` only; no write path to GitHub is opened |

---

## Consequences

**Positive**:
- No new runtime dependencies are added to `engine/dashboard/package.json`.
- The existing `apm-msg-parser.js` is reused, preserving a single source of truth
  for structured comment parsing.
- XSS risk from raw GitHub comment bodies is eliminated at the server boundary
  before any Markdown reaches the browser.
- The server remains stateless for data reads: the TTL cache is a bounded
  in-memory optimisation, not persistent state.
- Rate-limit exposure is predictable: at most one `gh api` call per 25 seconds per
  viewed issue regardless of client count.

**Negative**:
- The ES module / CommonJS boundary requires a `await import()` initialisation for
  `apm-msg-parser.js` at server startup. This is a one-time complexity cost.
- The 25-second TTL means a manual refresh initiated within 25 seconds of the
  previous fetch returns cached data. The response includes `cached: true` and
  `fetchedAt` so the UI can communicate this to the developer.
- `gh` CLI spawning adds ~100–200 ms latency to cache-miss requests. This is
  acceptable for a 30-second poll interval.

**Risks**:

| Risk | Likelihood | Mitigation |
|---|---|---|
| `gh` CLI not on PATH when server starts | Low | `server.js` already enriches `SHELL_PATH` at startup and falls back to `resolveBin()`; the route returns a descriptive `502` with the `gh` stderr so the developer knows what to fix |
| Concurrent cache-miss requests for the same issue before the first `gh` call returns (thundering herd) | Low | Implement a per-issue in-flight promise that second callers await; never spawn two concurrent `gh` calls for the same issue number |
| `apm-msg-parser.js` ES module fails to load via `import()` (e.g. top-level `await` schema read fails) | Very Low | Wrap the `import()` initialisation in a try/catch; log a startup warning and degrade to regex-only `agent-footprint` parsing if the module is unavailable |
| Comment body sanitisation regex misses an edge case (malformed HTML entity, Unicode tricks) | Low | Second layer: `textContent` assignment in the browser. Add a unit test exercising the strip function against known XSS payloads before merge |
| In-memory cache grows unboundedly in a long-lived server session with many distinct issue numbers | Very Low | Cache is bounded in practice (< 20 issues per session); if future usage expands, add a simple LRU cap of 100 entries in a follow-up ADR |

---

## Alternatives Considered

| Option | Pro | Con | Rejected Because |
|---|---|---|---|
| **`@octokit/rest` npm SDK** | Typed, no subprocess latency | New dependency; ~500 KB addition | Constitution VII; `gh` already covers the need |
| **Browser-direct GitHub API with PAT** | No server round-trip | PAT exposure in browser; CORS complexity | Constitution security constraints |
| **SSE server push** | Lower perceived latency | Server must poll GitHub independently per issue; stateful connection lifecycle | Complexity disproportionate to benefit; violates YAGNI |
| **GitHub webhook push** | True real-time | Requires public endpoint; inapplicable locally | Not available in local dev environment |
| **Client-side comment parsing** | Fewer server CPU cycles | Duplicates parser; XSS surface in browser | Violates DRY; introduces XSS risk eliminated for free by server-side parsing |
| **No cache (always fresh)** | Always latest data on every poll | 2× GitHub calls with two browser tabs; rapid manual refreshes exhaust rate limit | Rate-limit risk under normal multi-tab usage |
| **Cache TTL > 30 s** | Fewer `gh` calls | Data could be older than one full poll cycle | Breaks the 30-second freshness guarantee in US-3 |
