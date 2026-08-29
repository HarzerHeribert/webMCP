# Locked decisions

D-001 WebMCP page tools, not remote MCP. D-002 Relay CRM is host; Mandate is reusable product. D-003 no LLM/model proxy/agent harness. D-004 selection proposes; explicit delegation activates. D-005 schema communicates; backend enforces. D-006 agent stages/validates; human applies. D-007 mandates are scoped, versioned, revocable, session-local. D-008 optimistic revision plus change versions; rebase makes fresh staged state. D-009 no accounts/OAuth/real CRM/extension/multi-agent system in hackathon scope. D-010 visual identity is open, semantics are not.

D-011 deployment is Vercel on one origin: the Vite build as static assets, the same Hono app as a single serverless function under `/api`. Because Vercel functions are stateless, `SessionStore` is backed by Upstash Redis (`mandate:<id>`, one-hour TTL) rather than process memory. Rejected: signing session state and holding it on the client — it removes the store, but a client replaying its own older state could resurrect a revoked mandate, and FR-007 is precisely what this product claims. The store stays server-side so revocation stays real.

