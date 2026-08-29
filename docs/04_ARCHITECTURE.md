# Architecture

React client + page WebMCP registration calls a same-origin application service backed by session-scoped durable demo data. The service is authoritative for sessions, CRM data, mandates, changes, validation, revisions, and audit events. A capability compiler derives tool descriptors from latest mandate/page context; the inspector renders those descriptors. Human UI and tool path use the same policy service. Suggested deployment: Worker-compatible TypeScript service with SQLite/D1-style persistence; no model provider or secret-bearing external integration.
