import { Injectable } from '@nestjs/common';
import {
  OutboundPolicy,
  TaskAutomation,
  assertOutboundAllowed,
  csvEnv,
  env,
  hostsFromUrls,
  parseOutboundUrl,
} from '@app/common';
import { fillDeep, fillTemplate, isPlainObject } from './templating';

export interface AutomationInput {
  runId: string | null;
  runTitle: string | null;
  task: { id: string; title: string };
  context: Record<string, unknown>;
}

export interface AutomationResult {
  ok: boolean;
  output: string;
}

export const AUTOMATION_TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 1000;

const truncate = (value: string): string => (value.length > MAX_OUTPUT ? `${value.slice(0, MAX_OUTPUT)}…` : value);

/**
 * Hosts an automation may call even on the internal network: n8n (host of N8N_WEBHOOK_URL)
 * and AUTOMATION_ALLOWED_HOSTS ("host" or "host:port", comma separated). Every other
 * destination must resolve to public addresses only (no cloud metadata, no internal service).
 */
export function automationPolicy(): OutboundPolicy {
  return { allowHosts: [...hostsFromUrls(env('N8N_WEBHOOK_URL', '')), ...csvEnv('AUTOMATION_ALLOWED_HOSTS')] };
}

/** Bodies worth keeping in task.output (shown on the task board): text/* and JSON. */
export function isTextBody(contentType: string | null): boolean {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  return type.startsWith('text/') || type === 'application/json' || type.endsWith('+json');
}

/** The first `max` characters of a text or JSON body; the rest is never downloaded, other bodies are dropped. */
async function readBody(response: Response, max: number): Promise<string> {
  if (!response.body) return '';
  if (!isTextBody(response.headers.get('content-type'))) {
    await response.body.cancel().catch(() => undefined);
    return '';
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length < max) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      text += decoder.decode(value, { stream: true });
    }
    return text.slice(0, max);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Executes AUTOMATION tasks: one HTTP call (typically an n8n webhook). */
@Injectable()
export class AutomationRunner {
  private readonly policy = automationPolicy();

  async run(automation: TaskAutomation, input: AutomationInput): Promise<AutomationResult> {
    const context = input.context ?? {};
    const method = automation.method === 'GET' ? 'GET' : 'POST';
    let url: URL;
    try {
      // Checked before every call on the final URL (security review, finding 7: SSRF): a
      // placeholder may change the host, and what a name resolves to changes over time.
      url = parseOutboundUrl(fillTemplate(automation.url, context, encodeURIComponent));
      await assertOutboundAllowed(url, this.policy);
    } catch (err) {
      return { ok: false, output: truncate((err as Error).message) };
    }
    const extra = isPlainObject(automation.body) ? (fillDeep(automation.body, context) as Record<string, unknown>) : {};
    const body = JSON.stringify({
      runId: input.runId,
      runTitle: input.runTitle,
      task: input.task,
      context,
      ...extra,
    });

    try {
      const response = await fetch(url, {
        method,
        headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'POST' ? body : undefined,
        // A redirect would lead to a destination the check above never saw.
        redirect: 'manual',
        signal: AbortSignal.timeout(AUTOMATION_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        return { ok: false, output: `Redirection refusée (HTTP ${response.status})` };
      }
      // One character more than kept, so truncate() still marks a cut body with "…".
      const text = (await readBody(response, MAX_OUTPUT + 1)).trim();
      return { ok: response.ok, output: truncate(`HTTP ${response.status}${text ? ` — ${text}` : ''}`) };
    } catch (err) {
      const error = err as Error;
      const reason = error.name === 'TimeoutError' ? `délai dépassé (${AUTOMATION_TIMEOUT_MS / 1000} s)` : error.message;
      return { ok: false, output: truncate(`Échec de l'appel : ${reason}`) };
    }
  }
}
