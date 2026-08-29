/** The error model from `docs/16_API_AND_ERROR_MODEL.md`.
 *
 *  Every failure states what changed and the smallest safe recovery, and never
 *  discloses another session. The `recovery` string is product copy: it is what
 *  the conflict panel shows the human, so it is written here rather than in the
 *  UI, where the agent path would not see it. */

export const ERROR_CODES = [
  'NO_ACTIVE_MANDATE',
  'MANDATE_EXPIRED',
  'POLICY_CHANGED',
  'OUT_OF_SCOPE',
  'REVISION_CONFLICT',
  'CHANGE_VERSION_CONFLICT',
  'VALIDATION_FAILED',
  'HUMAN_CONFIRMATION_REQUIRED',
  'WEBMCP_UNAVAILABLE',
  'NOT_FOUND',
  'BAD_REQUEST',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  recovery?: string;
  details?: Record<string, unknown>;
}

export class MandateError extends Error {
  readonly envelope: ErrorEnvelope;
  readonly httpStatus: number;

  constructor(envelope: ErrorEnvelope, httpStatus = 409) {
    super(envelope.message);
    this.name = 'MandateError';
    this.envelope = envelope;
    this.httpStatus = httpStatus;
  }
}

const make =
  (code: ErrorCode, httpStatus: number, recoverable: boolean) =>
  (message: string, recovery?: string, details?: Record<string, unknown>) =>
    new MandateError({ code, message, recoverable, recovery, details }, httpStatus);

export const errors = {
  noActiveMandate: make('NO_ACTIVE_MANDATE', 403, true),
  mandateExpired: make('MANDATE_EXPIRED', 403, true),
  policyChanged: make('POLICY_CHANGED', 409, true),
  outOfScope: make('OUT_OF_SCOPE', 403, true),
  revisionConflict: make('REVISION_CONFLICT', 409, true),
  changeVersionConflict: make('CHANGE_VERSION_CONFLICT', 409, true),
  validationFailed: make('VALIDATION_FAILED', 422, true),
  humanConfirmationRequired: make('HUMAN_CONFIRMATION_REQUIRED', 403, false),
  notFound: make('NOT_FOUND', 404, false),
  badRequest: make('BAD_REQUEST', 400, false),
};
