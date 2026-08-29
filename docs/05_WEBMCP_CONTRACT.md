# WebMCP contract

Register: `mandate_get_workspace` (read-only), `mandate_get_capabilities` (read-only), `mandate_stage_customer_update` (allowed absolute in-scope field update), `mandate_validate_changes`, and `mandate_rebase_changes`. Require mandate/change versions for mutations. Never register apply, delete, mandate administration, export-all, account administration, or raw database tools. Register only when available, clean up through lifecycle/AbortSignal, derive current schemas dynamically, and treat the schema as communication—not authorization.
