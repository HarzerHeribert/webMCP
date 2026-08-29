# Requirements

**FR-001** isolated anonymous seeded sessions and deterministic reset. **FR-002** selection proposes scope but grants no authority. **FR-003** explicit delegation creates a versioned, revocable, expiring scope of customers/fields. **FR-004** scope is always visible. **FR-005** human and agent edit the same staged changes with provenance. **FR-006** human-only apply after validation. **FR-007** revoke immediately removes publication and server acceptance. **FR-008** timeline captures mandate, tool, edit, conflict, rebase, validation, and apply.

**MCP-001** lifecycle-safe dynamic registration; **MCP-002** schemas reflect active scope; **SEC-001** schemas never authorize; **SEC-002** latest policy/revision checked server-side; **SEC-003** stale policy returns `POLICY_CHANGED`; **SEC-004** no agent apply tool; **CON-001** optimistic revisions and recoverable conflicts.
