# HANDOFF — 2026-06-05

> SBAR-style summary of the most recent meaningful session. CLAUDE.md
> instructs every new session to read this file first, so it's the canonical
> starting point for the next Claude Code session in this repo. Replace this
> content (don't append) at the end of any non-trivial session.

## Situation

Shipped **v1.52.0 — MCP server v1** on branch `feat/mcp-server`, then audited and patched to **v1.52.1** in the same branch (2 commits). Read-only Model Context Protocol endpoint at `/mcp` on the platform's Cloudflare Pages Worker. Solves the 2026-06-02 friction where pulling site coords/acres/MW for an Oncor KMZ workflow required gcloud ADC reauth and broke flow. Any MCP client (Claude Code, Cursor, Manus via HTTP-tool fallback) can now query sites, LLRs, CRM, and the activity log directly.

Branch is local — not pushed, not merged, prod secrets + Firestore indexes not yet deployed.

### v1.52.1 — Audit fixes

A post-ship audit caught three real bugs and one design miss in v1.52.0:

- **BUG-1**: hand-rolled `zodToJsonSchema()` used zod v3's `_def.typeName` API but the repo installed zod v4. Every tool's `inputSchema` in `tools/list` came back as `{}` — clients couldn't discover argument shapes (tool _calls_ still worked because zod v4's `safeParse` is independent).
- **BUG-2**: tool execution errors returned as JSON-RPC `-32603` instead of `result.isError: true`. Per MCP spec, execution errors belong in the result so the LLM sees them — the v1 code hid Firestore missing-index errors behind opaque "Internal error" messages.
- **BUG-3**: `firestore.indexes.json` had per-dimension indexes but not the combined-filter indexes (`utility + grade + updatedAt` on LLRs, `actor.email + resource.type + timestamp` on activity). Combined-filter queries would have hit a missing-index error on first use.
- **MISS-1**: hand-rolled JSON-RPC dispatcher in v1.52.0 when the SDK ships `WebStandardStreamableHTTPServerTransport` — explicitly documented as the Cloudflare Workers variant of streamable-HTTP. The original plan's "the SDK targets Node http" was true of `StreamableHTTPServerTransport`, not the Web Standards one.

All four resolved by adopting `McpServer` + `WebStandardStreamableHTTPServerTransport`. The SDK handles JSON Schema conversion (via `toJsonSchemaCompat` which works on both zod v3 and v4) and wraps thrown handler errors as `result.isError: true` automatically. Verified locally with a Node smoke test — `tools/list` now returns proper JSON Schema (`type: 'object'`, `properties`, `description`, `default`).

Stateless transports CAN'T be reused across requests (SDK throws "Stateless transport cannot be reused"). `mcp/transport.ts` instantiates a fresh `McpServer` + transport per request — instantiation is sub-millisecond (8 `registerTool` calls, no I/O).

Also wired `tsc -p tsconfig.worker.json --noEmit` into `npm run build` so the worker + mcp code gets typechecked in CI (Cloudflare Pages will fail-fast on broken types).

## Background — what shipped

### Architecture

- **Host**: same Pages Worker that serves the SPA. `functions/worker.ts` gains a `/mcp` route branch ahead of the existing `PROXY_ROUTES` loop and three new `Env` fields (`FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `MCP_BEARER_TOKEN`).
- **Transport**: stateless streamable-HTTP. Hand-rolled JSON-RPC 2.0 dispatcher in `mcp/server.ts` — the official `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport` targets Node `http`, not Workers' fetch. zod validates each tool's inputs against the same schema the handler consumes; `zodToJsonSchema` exposes them on `tools/list`.
- **Inbound auth**: single shared bearer token (`mcp/auth.ts`, constant-time compare).
- **Outbound auth**: service-account JSON → RS256 JWT signed via Web Crypto (`crypto.subtle.importKey` + `subtle.sign`) → OAuth access token at `oauth2.googleapis.com/token` → bearer to `firestore.googleapis.com`. Token cached in module scope until 60s before expiry. No `firebase-admin` (Node-only, unreliable under `nodejs_compat`). Files: `mcp/firestore/auth.ts`, `client.ts`, `decode.ts`.
- **Tools** (`mcp/tools/`, 8 total):
  - `list_sites(filter?, companyId?, limit?)`, `get_site(id, sections?)` — `sections` projection avoids returning the full 50KB+ `SiteRegistryEntry` by default (overview + appraisal only)
  - `list_llrs(utility?, grade?, limit?)`, `get_llr(id)`
  - `list_companies(q?, tag?, limit?)`, `get_company(id)` (company + all linked contacts), `list_contacts(companyId?, q?, limit?)`
  - `get_recent_activity(actorEmail?, resourceType?, limit?)` (newest first)
- **Composite indexes**: 7 in `firestore.indexes.json` (utility/grade × updatedAt for LLRs; tags/companyIds × updatedAt for CRM; actor.email/resource.type × timestamp for activity; companyId × updatedAt for sites-registry). `firebase.json` now wires `firestore.indexes` to that file.
- **Wrangler**: `wrangler.json` declares `FIREBASE_PROJECT_ID = "randb-site-valuator"` as a var; the two secrets are set via `wrangler secret put`.

### Files added / modified

- NEW `mcp/server.ts`, `mcp/transport.ts`, `mcp/auth.ts`, `mcp/types.ts`
- NEW `mcp/firestore/{auth,client,decode}.ts`
- NEW `mcp/tools/{sites,llrs,crm,activity}.ts`
- NEW `firestore.indexes.json`
- NEW `tsconfig.worker.json` (covers `functions/worker.ts` + `mcp/**/*.ts`, uses `@cloudflare/workers-types`; not in root `references` — run manually)
- MODIFIED `functions/worker.ts` (`/mcp` route branch, extended `Env`)
- MODIFIED `wrangler.json` (FIREBASE_PROJECT_ID var)
- MODIFIED `firebase.json` (firestore.indexes pointer)
- MODIFIED `package.json` — added `@modelcontextprotocol/sdk`, `zod`, devDep `@cloudflare/workers-types`
- MODIFIED `src/version.ts` → 1.52.0
- MODIFIED `CLAUDE.md` (new MCP Server section after Tech Stack)
- MODIFIED `TODO.md` (marked done, added follow-up tasks)

## Assessment — known limitations / risks

- **Prod secrets not yet set.** `FIREBASE_SERVICE_ACCOUNT_JSON` + `MCP_BEARER_TOKEN` must be `wrangler secret put` before `/mcp` will work in prod. Local dev wants the same values in `.dev.vars` (gitignored).
- **Firestore indexes not yet deployed.** `firebase deploy --only firestore:indexes` is required before LLR utility/grade filters and activity actor/resource filters will work. Missing-index errors return a clean `McpError` with the GCP console link.
- **`@modelcontextprotocol/sdk` is installed but unused.** Kept as a dep in case we refactor toward the SDK's `Server` class once a Workers-compatible transport ships upstream. Pure type-safety hedge.
- **Workers types**: `tsconfig.worker.json` is intentionally outside the `tsconfig.json` references so the existing `tsc -b` build is untouched. The post-edit-check hook (`.claude/hooks/post-edit-check.sh`) only runs on `src/`, so edits under `mcp/` don't auto-typecheck — run `npx tsc -p tsconfig.worker.json --noEmit` manually before push.
- **No tests.** Hand-rolled JSON-RPC dispatcher is small (~150 LOC) and verifiable via curl, but a test harness would catch protocol regressions.

## Recommendation — what next

1. **Push + open PR**, review, merge to `main`. Pages auto-deploys.
2. **Set prod secrets**:
   ```bash
   wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON  # paste JSON from Firebase Console → Service Accounts
   wrangler secret put MCP_BEARER_TOKEN               # openssl rand -hex 32
   ```
3. **Deploy indexes**: `firebase deploy --only firestore:indexes`.
4. **Smoke test** (with bearer token in `RANDB_MCP_TOKEN`):
   ```bash
   curl -X POST https://<pages-domain>/mcp \
     -H "Authorization: Bearer $RANDB_MCP_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```
   Expect 8 tools. Then `list_sites` with `limit:5`. Then a 401 with a bad token.
5. **Register in Claude Code**:
   ```bash
   claude mcp add randb --transport http \
     --url https://<pages-domain>/mcp \
     --header "Authorization: Bearer ${RANDB_MCP_TOKEN}"
   ```
6. **Reproduce the original win**: ask Claude "give me coords + acres for Rich Barry to draft an Oncor KMZ" — completes with no SPA reauth.
7. **v2 backlog** (in TODO.md): writes behind `MCP_WRITE_ENABLED` flag with `activity` audit entries; OAuth for multi-user via `@cloudflare/workers-oauth-provider`; analysis-tool wrappers once Census/FCC proxies are portable.

## Key file map

- `mcp/server.ts` — tool registry + JSON-RPC dispatcher (the load-bearing piece)
- `mcp/firestore/auth.ts` — JWT mint + token cache (Web Crypto)
- `mcp/firestore/client.ts` — `getDoc`, `runQuery` over Firestore REST
- `mcp/tools/sites.ts` — section projection logic for `get_site`
- `functions/worker.ts` — `/mcp` route branch + extended `Env`
- `firestore.indexes.json` — 7 composite indexes
- `tsconfig.worker.json` — Worker + MCP typecheck config
