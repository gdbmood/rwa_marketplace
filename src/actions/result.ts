/**
 * Shared result contract for every server action (see
 * docs/architecture/IMPLEMENTATION_PLAN.md, "Action result contract").
 * This module is intentionally free of server-only imports so pure logic
 * and tests can use it.
 */

export type ActionErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'kyc_required'
  | 'chain_error'
  | 'provider_error'
  | 'internal'
  | 'gone';

export interface ActionError {
  code: ActionErrorCode;
  message: string;
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err<T = never>(code: ActionErrorCode, message: string): ActionResult<T> {
  return { ok: false, error: { code, message } };
}

/**
 * Maps thrown errors to the action error contract. AuthError (from
 * src/lib/auth/session.ts) is detected by name to keep this module free of
 * server-only imports. Everything else is treated as internal and logged
 * server side; the client only sees a generic message.
 */
export function toActionError<T = never>(error: unknown, context: string): ActionResult<T> {
  if (error instanceof Error && error.name === 'AuthError') {
    return err('unauthenticated', 'You must be logged in to do this');
  }
  console.error(`[action:${context}]`, error instanceof Error ? error.message : error);
  return err('internal', 'Something went wrong, please try again');
}
