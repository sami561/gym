import { Injectable } from '@nestjs/common';
import { TaskAutomation } from '@app/common';
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

/** Executes AUTOMATION tasks: one HTTP call (typically an n8n webhook). */
@Injectable()
export class AutomationRunner {
  async run(automation: TaskAutomation, input: AutomationInput): Promise<AutomationResult> {
    const context = input.context ?? {};
    const method = automation.method === 'GET' ? 'GET' : 'POST';
    let url: URL;
    try {
      url = new URL(fillTemplate(automation.url, context, encodeURIComponent));
    } catch {
      return { ok: false, output: `URL invalide : ${automation.url}` };
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
        signal: AbortSignal.timeout(AUTOMATION_TIMEOUT_MS),
      });
      const text = (await response.text()).trim();
      return { ok: response.ok, output: truncate(`HTTP ${response.status}${text ? ` — ${text}` : ''}`) };
    } catch (err) {
      const error = err as Error;
      const reason = error.name === 'TimeoutError' ? `délai dépassé (${AUTOMATION_TIMEOUT_MS / 1000} s)` : error.message;
      return { ok: false, output: truncate(`Échec de l'appel : ${reason}`) };
    }
  }
}
