import { REASONS } from './access-decision';

/** Why a door did not open: `error` (French) goes to the caller and the access log, `detail` to the service log only. */
export interface OpenFailure {
  ok: false;
  error: string;
  detail?: string;
}

/** Relay failures, without the relay's response body (security review, finding 7). */
export const RELAY_ERRORS = {
  invalidConfig: 'Configuration du relais invalide.',
  forbidden: 'Adresse du relais non autorisée.',
  unreachable: 'Relais de porte injoignable.',
  status: (status: number) => `Le relais a répondu ${status}.`,
};

/** door-agent/src/doors/http-relay.ts reports "Relay answered HTTP <status>: <up to 200 characters of body>". */
const AGENT_RELAY_STATUS = /^Relay answered HTTP (\d{3})\b/;

/**
 * Failure acknowledged by a door agent. Its message is technical English and may quote the relay's
 * answer, so the caller only gets a French summary (with the relay status when there is one).
 */
export function agentFailure(message: unknown): OpenFailure {
  const detail = typeof message === 'string' && message.trim() ? message.trim().slice(0, 300) : undefined;
  const status = detail ? AGENT_RELAY_STATUS.exec(detail) : null;
  return {
    ok: false,
    error: status ? RELAY_ERRORS.status(Number(status[1])) : REASONS.agentFailed,
    ...(detail ? { detail } : {}),
  };
}
