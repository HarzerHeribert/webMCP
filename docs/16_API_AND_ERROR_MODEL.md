# API/error model

Human UI and tools call one service. Mutations carry expected session revision, mandate version (agent path), and change version. Envelope: `{code,message,recoverable,details}`. Codes: NO_ACTIVE_MANDATE, MANDATE_EXPIRED, POLICY_CHANGED, OUT_OF_SCOPE, REVISION_CONFLICT, CHANGE_VERSION_CONFLICT, VALIDATION_FAILED, HUMAN_CONFIRMATION_REQUIRED, WEBMCP_UNAVAILABLE. Errors state what changed and the smallest safe recovery; never disclose another session.
