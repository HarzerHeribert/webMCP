import type { Mandate, Session } from './types';
import { CUSTOMER_STATUSES } from './types';

/**
 * The capability compiler. It turns the *current* mandate into the tool
 * descriptors the page registers, and the same descriptors the inspector
 * renders — one derivation, so the M3 gate ("the inspector equals the
 * registrations") holds by construction rather than by discipline.
 *
 * `docs/12_DECISIONS.md` D-005: the schema communicates, the backend enforces.
 * A narrowed schema here is a courtesy to a well-behaved caller. Nothing in this
 * file is a security boundary, and a caller that ignores every enum below is
 * still refused by `policy.ts`.
 */

export interface ToolDescriptor {
  name: string;
  description: string;
  /** JSON Schema, narrowed to the live mandate. */
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  /** Why this tool is or is not currently registered — shown in the inspector. */
  availability: 'registered' | 'withheld';
  availabilityReason: string;
}

const OBJ = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});

export function compileCapabilities(session: Session): ToolDescriptor[] {
  const m = session.mandate;
  const live = m?.status === 'ACTIVE' ? m : null;

  const withheld = (reason: string) => ({
    availability: 'withheld' as const,
    availabilityReason: reason,
  });
  const registered = (reason: string) => ({
    availability: 'registered' as const,
    availabilityReason: reason,
  });

  const scopeSuffix = live
    ? ` Scope: ${live.customerIds.length} customer(s), fields ${live.allowedFields.join(', ')}. Mandate version ${live.version}.`
    : '';

  const tools: ToolDescriptor[] = [
    {
      name: 'mandate_get_workspace',
      description:
        'Read the visible Relay CRM workspace: customers, their fields, the ' +
        'current selection, and the staged changes. Read-only.',
      inputSchema: OBJ({}, []),
      readOnly: true,
      ...registered('Read-only. Registered whenever the page is open; reading needs no mandate.'),
    },
    {
      name: 'mandate_get_capabilities',
      description:
        'Read the authority the human has currently delegated, and the tools ' +
        'that authority makes available. Read-only.',
      inputSchema: OBJ({}, []),
      readOnly: true,
      ...registered('Read-only. Registered whenever the page is open.'),
    },
  ];

  tools.push({
    name: 'mandate_stage_customer_update',
    description:
      'Stage an absolute new value for one delegated field on one delegated ' +
      'customer. Staging never commits: only the human can apply.' +
      scopeSuffix,
    inputSchema: OBJ(
      {
        customerId: live
          ? {
              type: 'string',
              enum: live.customerIds,
              description: 'Must be a customer the human delegated.',
            }
          : { type: 'string' },
        field: live
          ? {
              type: 'string',
              enum: live.allowedFields,
              description: 'Must be a field the human delegated.',
            }
          : { type: 'string' },
        value: valueSchema(live),
        mandateVersion: {
          type: 'integer',
          const: live?.version,
          description:
            'The mandate version this call is made against. The server refuses ' +
            'any other value, so a call made before the human narrowed or ' +
            'revoked the mandate fails rather than slipping through.',
        },
        changeVersion: {
          type: 'integer',
          description:
            'When editing a change that is already staged, the version you read. ' +
            'Omit when staging a new one. If a human edited it in between, the ' +
            'call is refused rather than quietly overwriting their edit.',
        },
      },
      ['customerId', 'field', 'value', 'mandateVersion'],
    ),
    readOnly: false,
    ...(live
      ? registered(`Registered because an active mandate covers ${live.customerIds.length} customer(s).`)
      : withheld('Withheld: the human has not delegated any authority.')),
  });

  tools.push({
    name: 'mandate_validate_changes',
    description:
      'Ask the server to validate every staged change against the current ' +
      'record. Reports conflicts; commits nothing.',
    inputSchema: OBJ(
      {
        mandateVersion: { type: 'integer', const: live?.version },
      },
      ['mandateVersion'],
    ),
    readOnly: false,
    ...(live
      ? registered('Registered while a mandate is active.')
      : withheld('Withheld: the human has not delegated any authority.')),
  });

  tools.push({
    name: 'mandate_rebase_changes',
    description:
      'Re-base staged changes that were made against an older revision, ' +
      'preserving the intended value.',
    inputSchema: OBJ(
      {
        mandateVersion: { type: 'integer', const: live?.version },
      },
      ['mandateVersion'],
    ),
    readOnly: false,
    ...(live
      ? registered('Registered while a mandate is active.')
      : withheld('Withheld: the human has not delegated any authority.')),
  });

  return tools;
}

function valueSchema(live: Mandate | null): Record<string, unknown> {
  // When status is the only delegated field the enum can be exact; otherwise the
  // value stays a string and the server does the deciding. Narrowing a schema
  // further than the truth would be a lie the caller cannot check.
  if (live && live.allowedFields.length === 1 && live.allowedFields[0] === 'status') {
    return { type: 'string', enum: [...CUSTOMER_STATUSES] };
  }
  return {
    type: 'string',
    description:
      'The absolute new value, not a delta. If the field is status, it must be ' +
      `one of: ${CUSTOMER_STATUSES.join(', ')}.`,
  };
}

/**
 * The tools that must never exist. Kept as data so the M3 gate can assert
 * against it and the inspector can show the human what is structurally absent —
 * "there is no apply tool" is a claim worth being able to see.
 */
export const NEVER_REGISTERED = [
  { name: 'mandate_apply_changes', reason: 'Applying is a human-only action (D-006). No agent path exists at any layer.' },
  { name: 'mandate_delete_customer', reason: 'Destructive operations are outside anything a session mandate can grant.' },
  { name: 'mandate_admin_mandate', reason: 'An agent must never be able to widen its own authority.' },
  { name: 'mandate_export_all', reason: 'Bulk export defeats the point of a bounded scope.' },
  { name: 'mandate_sql', reason: 'No raw data access is exposed to any caller.' },
] as const;
