# Limitations

Written to be read by someone deciding whether to believe the claims. Every
item here is a thing Mandate does **not** do, stated before anyone has to
discover it.

## The security claim, precisely

Mandate bounds **what may be done in this browser session**. It does not
establish **who is doing it**.

A WebMCP caller is an untrusted tool caller. There is no cryptographic identity,
no attestation, no way for the server to distinguish one agent from another, and
none of that is attempted. If two agents have the page open, they share one
mandate. The mandate is the boundary; the caller is not.

This matters because it is the thing most easily overclaimed. "The human
delegated authority to the agent" is a convenient sentence and a slightly false
one. The accurate sentence is: *the human made a bounded capability surface exist
for a while, and the server enforces its bounds on every call that arrives.*

## What the schema does and does not do

A narrowed tool schema is communication. It tells a well-behaved caller what it
may ask for. It confers nothing, and `server/core/policy.ts` re-derives the
answer from the mandate on every mutating call. A caller that ignores every enum
gets exactly as far as one that respects them.

Do not read the narrowed enums as a security boundary. They are a courtesy.

## Not a CRM

Relay CRM is a seeded, resettable demo with six fictional accounts. It has no
authentication, no authorisation model of its own, no multi-tenancy, no
persistence beyond the session, and no integrations. It exists so Mandate has
something to be a mandate *over*.

## Not an agent, and no model anywhere

There is no LLM, model proxy, agent harness, or API key in this repository.

The **simulated caller** in the interface is a test harness: it invokes the same
tool implementations the browser would, with arguments a human types. It decides
nothing. It exists because WebMCP is behind a flag and the demo must not depend
on a judge having it enabled.

## Persistence, and the budget around it

Sessions are anonymous, seeded, and disposable. In production they live in
Upstash Redis with a thirty-minute TTL; locally they live in process memory.
Nothing is durable and nothing is meant to be. Applied changes are immutable
*within a session* and vanish with it.

The demo is a public URL on a free tier, so three bounds keep it available:
one session cannot grow without limit (280 characters per field value, 50 staged
changes, 300 timeline events, oldest dropped), one caller cannot open more than
twenty sessions per half hour, and no new session is created once the store
holds four thousand.

**None of that is a security boundary**, and it is not offered as one. The
fingerprint is `x-forwarded-for`, which is spoofable, and rotating addresses
defeats it entirely. It exists so that ordinary crawling, an accidental loop, or
one bored person cannot fill the store before a judge opens it. The failure it
prevents is "the demo is unavailable", not "an attacker got in". A store that
cannot be measured admits rather than refuses, so a Redis outage degrades the
demo instead of closing it.

## Discovery timing

The page registers its tools when the mandate changes. How quickly a given agent
notices — or whether it re-reads the schema before its next call — is the
browser's and the agent's business, not this app's. Mandate does not claim
instant discovery, and the server refuses stale calls precisely because it
cannot assume the caller noticed.

## Concurrency

Optimistic revisions with a single writer per session. Two humans in two tabs on
one session id will fight, and the loser gets `REVISION_CONFLICT` — which is the
correct outcome but not a designed multi-user experience.

## What has not been tested

- Behaviour under a real WebMCP-enabled browser was reasoned about and coded
  for; the automated suite runs without the flag, which is the case a judge is
  most likely to hit.
- No load, no adversarial fuzzing of session ids, no cross-browser matrix.

## Scope deliberately excluded

Accounts, OAuth, a browser extension, a remote MCP server, a real CRM
integration, and any multi-agent coordination — all out of scope by
`docs/12_DECISIONS.md` D-003 and D-009, not by omission.
