# Handoff

## Where this stands

62/66. M0–M7B complete. The product works end to end and is proved by 21 unit +
integration tests and 11 browser tests, all green, three consecutive clean runs.

Deployed: Vercel project `webmcp`, git-linked to `HarzerHeribert/webMCP`, auto-
deploying on push to `main`. Build `READY` on `49d17e1`. Aliases
`webmcp-weld.vercel.app` and `webmcp-holdpoint-deployment.vercel.app`.

## Next action

**Blocked on one dashboard toggle:** the project has Vercel Authentication (SSO)
enabled, so every request 302s to `vercel.com/sso-api`. The submission requires a
URL judges can open. The Vercel MCP connector is **read-only for this team** —
`update_project_deployment_protection` returns 403 — so the user must set
Settings → Deployment Protection → Vercel Authentication → Disabled.

Once it is off, the four remaining M8 lines are one pass:

1. `curl` the live origin: session creation, a forged session id, an
   out-of-scope tool call, and confirm no internal error text leaks.
2. Confirm Redis is actually bound — create a session, wait past a cold start,
   read it again. If it 404s, the store fell back to process memory and the
   function log will say so.
3. Verify in Chrome with WebMCP enabled, and confirm the unavailable path.
4. Record the URL, SHA, browser version and limitations in the map.

Then: record the demo video against `docs/17_DEMO_SCRIPT.md`.

## Live workers

None. All five worktrees integrated and closed.

## Loose ends

- `HUMAN_CONFIRMATION_REQUIRED` is defined in `docs/16` and never thrown. Either
  give it a use or mark it reserved.
- The e2e worker noted that all three mutating tools register together once any
  mandate is active — only `mandate_stage_customer_update`'s *schema* narrows to
  the exact grant. That is correct behaviour (validate and rebase operate over
  whatever is staged), but the demo narration should not imply otherwise.
- `.mcp.json` adds chrome-devtools-mcp; it needs a session restart to load.
