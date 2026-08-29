# Domain and state

`Session(id, revision, mandateVersion)`; `Mandate(id, version, ACTIVE|REVOKED|EXPIRED, customerIds, allowedFields, expiresAt)`; `Change(id, customerId, field, before, after, baseRevision, version, DRAFT|VALIDATED|STALE|APPLIED, actor, mandateVersion)`.

Selection is not authority. Changes store absolute targets, not deltas. Applied changes are immutable; a correction is a new change. A human and agent modify the same change entity. Mandate edits never mutate committed CRM data. `DRAFT → VALIDATED → READY_FOR_APPLY → APPLIED`; revision conflict yields STALE and rebase returns a fresh DRAFT.
