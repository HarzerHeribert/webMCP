import { domainOf, type DomainSpec } from './domains';
import type { Mandate, Session } from './types';

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
  // Every noun below comes from here. Switch the host application and the tool
  // surface an agent reads is rewritten — names, enums and prose — without a
  // line of this file changing.
  const d = domainOf(session.domainId);

  const withheld = (reason: string) => ({
    availability: 'withheld' as const,
    availabilityReason: reason,
  });
  const registered = (reason: string) => ({
    availability: 'registered' as const,
    availabilityReason: reason,
  });

  const scopeSuffix = live
    ? ` Scope: ${live.resourceIds.length} ${d.noun}(s), fields ${live.allowedFields.join(', ')}. Mandate version ${live.version}.`
    : '';

  const tools: ToolDescriptor[] = [
    {
      name: 'mandate_get_workspace',
      description:
        `Read the visible ${d.product} workspace: ${d.collection.toLowerCase()}, their ` +
        'fields, the current selection, and the staged changes. Read-only.',
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
    name: stageToolName(d),
    description:
      'Stage an absolute new value for one delegated field on one delegated ' +
      `${d.noun}. Staging never commits: only the human can apply.` +
      scopeSuffix,
    inputSchema: OBJ(
      {
        resourceId: live
          ? {
              type: 'string',
              enum: live.resourceIds,
              description: `Must be a ${d.noun} the human delegated.`,
            }
          : { type: 'string' },
        field: live
          ? {
              type: 'string',
              enum: live.allowedFields,
              description: 'Must be a field the human delegated.',
            }
          : { type: 'string' },
        value: valueSchema(d, live),
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
      ['resourceId', 'field', 'value', 'mandateVersion'],
    ),
    readOnly: false,
    ...(live
      ? registered(`Registered because an active mandate covers ${live.resourceIds.length} ${d.noun}(s).`)
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

/** The mutating tool is named after the host's own noun, so an agent reading
 *  the surface is told what kind of thing it may touch before it reads a
 *  single enum. */
export function stageToolName(d: DomainSpec): string {
  return `mandate_stage_${d.noun}_update`;
}

function valueSchema(d: DomainSpec, live: Mandate | null): Record<string, unknown> {
  // When exactly one field is delegated and that field is a closed set, the
  // enum can be exact; otherwise the value stays a string and the server does
  // the deciding. Narrowing further than the truth would be a lie the caller
  // cannot check.
  const only = live?.allowedFields.length === 1 ? live.allowedFields[0] : undefined;
  const options = d.fields.find((f) => f.key === only)?.options;
  if (options) return { type: 'string', enum: [...options] };

  const closed = d.fields.filter((f) => f.options);
  return {
    type: 'string',
    description:
      'The absolute new value, not a delta.' +
      closed.map((f) => ` If the field is ${f.key}, it must be one of: ${f.options!.join(', ')}.`).join(''),
  };
}

/**
 * The tools that must never exist. Kept as data so the M3 gate can assert
 * against it and the inspector can show the human what is structurally absent —
 * "there is no apply tool" is a claim worth being able to see.
 */
export function neverRegistered(session: Session): { name: string; reason: string }[] {
  const d = domainOf(session.domainId);
  return [
    { name: 'mandate_apply_changes', reason: 'Applying is a human-only action (D-006). No agent path exists at any layer.' },
    { name: `mandate_delete_${d.noun}`, reason: 'Destructive operations are outside anything a session mandate can grant.' },
    { name: 'mandate_admin_mandate', reason: 'An agent must never be able to widen its own authority.' },
    { name: 'mandate_export_all', reason: 'Bulk export defeats the point of a bounded scope.' },
    { name: 'mandate_sql', reason: 'No raw data access is exposed to any caller.' },
  ];
}
