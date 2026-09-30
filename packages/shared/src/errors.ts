/**
 * Error envelopes for the two wire formats the gateway speaks. Gateway-generated errors use these;
 * upstream errors are passed through unchanged so Claude Code's recovery logic can match them.
 */

export type AnthropicErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'not_found_error'
  | 'request_too_large'
  | 'rate_limit_error'
  | 'api_error'
  | 'overloaded_error';

export const STATUS_FOR_ERROR: Record<AnthropicErrorType, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  permission_error: 403,
  not_found_error: 404,
  request_too_large: 413,
  rate_limit_error: 429,
  api_error: 500,
  overloaded_error: 529,
};

export interface AnthropicErrorBody {
  type: 'error';
  error: { type: AnthropicErrorType; message: string };
  request_id?: string;
}

export function anthropicError(
  type: AnthropicErrorType,
  message: string,
  requestId?: string,
): AnthropicErrorBody {
  return {
    type: 'error',
    error: { type, message },
    ...(requestId ? { request_id: requestId } : {}),
  };
}

export interface OpenAIErrorBody {
  error: { message: string; type: string; param: null; code: string | null };
}

const OPENAI_TYPE: Record<AnthropicErrorType, string> = {
  invalid_request_error: 'invalid_request_error',
  authentication_error: 'authentication_error',
  permission_error: 'permission_error',
  not_found_error: 'not_found_error',
  request_too_large: 'invalid_request_error',
  rate_limit_error: 'rate_limit_exceeded',
  api_error: 'server_error',
  overloaded_error: 'server_error',
};

export function openaiError(
  type: AnthropicErrorType,
  message: string,
  code: string | null = null,
): OpenAIErrorBody {
  return { error: { message, type: OPENAI_TYPE[type], param: null, code } };
}

/** Machine-readable reasons the gateway refuses a request, recorded in the audit log. */
export type GatewayRefusal =
  | 'missing_key'
  | 'invalid_key'
  | 'revoked_key'
  | 'org_inactive'
  | 'trial_expired'
  | 'rate_limited'
  | 'org_budget_exhausted'
  | 'seat_budget_exhausted'
  | 'unknown_model'
  | 'invalid_body'
  | 'body_too_large'
  | 'playground_limit'
  | 'upstream_unavailable';
