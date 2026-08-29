# Security model

The human creates temporary authority; a WebMCP caller is an untrusted tool caller, not a cryptographically identified individual agent. Backend is the enforcement point. Every mutation checks active/unexpired mandate, customer, field, mandate version, and revisions. Stale calls return `POLICY_CHANGED`; out-of-scope calls return `OUT_OF_SCOPE`; conflicts return `REVISION_CONFLICT`. CRM notes/external text are untrusted content, never tool instructions. No privileged agent endpoint, secrets, LLM/API key, or autonomous apply exists.
