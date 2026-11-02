/*
 * Definitions of the Meliora n8n workflows. build.mjs writes them to workflows/*.json
 * (n8n export format, importable from the n8n editor: ⋯ → Import from file).
 */
import { createHash } from 'node:crypto';
import { composeTemplate } from './templates.mjs';
import { bodyOf, events, motivation, runtime, scheduled, webhook as webhookCheck } from './n8n-code.mjs';

/** Credentials referenced by the workflows (create them in n8n with exactly these names). */
export const CREDENTIALS = {
  smtp: { smtp: { id: 'meliora-smtp', name: 'Meliora SMTP' } },
  webhookAuth: { httpHeaderAuth: { id: 'meliora-webhook-auth', name: 'Meliora webhook (Authorization)' } },
  signature: { crypto: { id: 'meliora-webhook-signature', name: 'Meliora webhook signature' } },
  automationApi: { httpHeaderAuth: { id: 'meliora-automation-api', name: 'Meliora automation API (x-api-key)' } },
  anthropic: { httpHeaderAuth: { id: 'anthropic-api', name: 'Anthropic API (x-api-key)' } },
};

const SETTINGS = {
  executionOrder: 'v1',
  timezone: 'Africa/Tunis',
  saveManualExecutions: true,
  saveDataErrorExecution: 'all',
  saveDataSuccessExecution: 'all',
  callerPolicy: 'workflowsFromSameOwner',
};

/** Stable UUID derived from a name, so rebuilding does not change node ids. */
export function uuid(name) {
  const hex = createHash('sha1').update(`meliora-n8n:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const camel = (kebab) => kebab.replace(/-(\w)/g, (_, char) => char.toUpperCase());

class WorkflowBuilder {
  constructor(slug, name) {
    this.slug = slug;
    this.name = name;
    this.nodes = [];
    this.connections = {};
  }

  add(name, type, typeVersion, position, parameters, extra = {}) {
    if (this.nodes.some((node) => node.name === name)) throw new Error(`Duplicate node name "${name}" in ${this.slug}`);
    this.nodes.push({ parameters, id: uuid(`${this.slug}:${name}`), name, type: `n8n-nodes-base.${type}`, typeVersion, position, ...extra });
    return name;
  }

  connect(from, to, output = 0, input = 0) {
    const main = (this.connections[from] ??= { main: [] }).main;
    while (main.length <= output) main.push([]);
    main[output].push({ node: to, type: 'main', index: input });
  }

  chain(...names) {
    for (let i = 0; i < names.length - 1; i++) this.connect(names[i], names[i + 1]);
  }

  // ---- node helpers -------------------------------------------------------------------------

  schedule(name, position, cron) {
    return this.add(name, 'scheduleTrigger', 1.2, position, { rule: { interval: [{ field: 'cronExpression', expression: cron }] } });
  }

  /** GET <MELIORA_API_URL>/api/automation/<path> with the x-api-key credential. */
  api(name, position, path, query = {}, extra = {}) {
    const parameters = {
      url: `={{ $env.MELIORA_API_URL }}/api/automation/${path}`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { timeout: 30000 },
    };
    const entries = Object.entries(query);
    if (entries.length) {
      parameters.sendQuery = true;
      parameters.queryParameters = { parameters: entries.map(([key, value]) => ({ name: key, value: String(value) })) };
    }
    return this.add(name, 'httpRequest', 4.2, position, parameters, {
      credentials: CREDENTIALS.automationApi,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 5000,
      ...extra,
    });
  }

  /** POST https://api.anthropic.com/v1/messages with the body built in `$json.<field>` by the previous Code node. */
  claude(name, position, field) {
    return this.add(
      name,
      'httpRequest',
      4.2,
      position,
      {
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'anthropic-version', value: '2026-10-21' },
            { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify($json.${field}) }}`,
        options: { timeout: 600000 },
      },
      {
        credentials: CREDENTIALS.anthropic,
        retryOnFail: true,
        maxTries: 2,
        waitBetweenTries: 5000,
        // The next Code node falls back to static text when the call fails.
        onError: 'continueRegularOutput',
      },
    );
  }

  /** Code node: runtime helpers + the templates it renders + the function body from n8n-code.mjs. */
  code(name, position, fn, templates = [], description = '') {
    const compiled = Object.fromEntries(templates.map((template) => [camel(template), composeTemplate(template)]));
    const jsCode = [
      `// Meliora Gym — ${description || name}`,
      '// Généré par n8n/scripts/build.mjs : modifiez n8n/templates/*.html ou n8n/scripts/n8n-code.mjs,',
      '// puis `npm run build` et réimportez le workflow.',
      `const TEMPLATES = ${JSON.stringify(compiled)};`,
      '',
      bodyOf(runtime),
      '',
      bodyOf(fn),
    ].join('\n');
    return this.add(name, 'code', 2, position, { jsCode });
  }

  sendEmail(name, position, extra = {}) {
    return this.add(
      name,
      'emailSend',
      2.1,
      position,
      {
        fromEmail: '={{ $json.from }}',
        toEmail: '={{ $json.to }}',
        subject: '={{ $json.subject }}',
        emailFormat: 'html',
        html: '={{ $json.html }}',
        options: { appendAttribution: false },
      },
      { credentials: CREDENTIALS.smtp, ...extra },
    );
  }

  toJSON() {
    return {
      name: this.name,
      nodes: this.nodes,
      connections: this.connections,
      active: false,
      settings: SETTINGS,
      pinData: {},
      meta: { templateCredsSetupCompleted: false },
      tags: [],
    };
  }
}

const condition = (id, leftValue, operator, rightValue) => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
  conditions: [{ id: uuid(id), leftValue, rightValue, operator }],
  combinator: 'and',
});

/** Customer-facing webhook events (backend/libs/common/src/bus/events.ts, WEBHOOK_EVENTS). */
export const CUSTOMER_EVENTS = [
  { event: 'member.created', label: 'Bienvenue', fn: events.memberCreated, templates: ['welcome'] },
  { event: 'subscription.created', label: 'Abonnement confirmé', fn: events.subscriptionCreated, templates: ['subscription-confirmation'] },
  { event: 'payment.received', label: 'Reçu de paiement', fn: events.paymentReceived, templates: ['payment-receipt'] },
  { event: 'subscription.expiring', label: 'Rappel d’expiration', fn: events.subscriptionExpiring, templates: ['expiry-reminder'] },
  { event: 'subscription.expired', label: 'Abonnement expiré', fn: events.subscriptionExpired, templates: ['renewal-invite'] },
  { event: 'booking.created', label: 'Réservation confirmée', fn: events.bookingCreated, templates: ['booking-confirmation'] },
  { event: 'lead.created', label: 'Séance d’essai', fn: events.leadCreated, templates: ['trial-confirmation', 'lead-alert'] },
  { event: 'sale.completed', label: 'Reçu boutique', fn: events.saleCompleted, templates: ['sale-receipt'] },
  { event: 'stock.low', label: 'Alerte stock', fn: events.stockLow, templates: ['stock-alert'] },
  { event: 'maintenance.opened', label: 'Alerte maintenance', fn: events.maintenanceOpened, templates: ['maintenance-alert'] },
];

function customerEvents() {
  const wf = new WorkflowBuilder('01-customer-events', 'Meliora · 01 · E-mails clients (événements)');
  // Header Auth checks "Authorization: Bearer <WEBHOOK_AUTH_TOKEN>"; the HMAC proves the event comes
  // from the backend and the timestamp check refuses replays (the backend re-signs each retry).
  const webhook = wf.add(
    'Événements Meliora',
    'webhook',
    2,
    [0, 200],
    { httpMethod: 'POST', path: 'meliora-events', authentication: 'headerAuth', responseMode: 'onReceived', options: { rawBody: true } },
    { credentials: CREDENTIALS.webhookAuth, webhookId: uuid('webhook:meliora-events') },
  );
  const prepare = wf.code(
    'Préparer la vérification',
    [240, 200],
    webhookCheck.prepareCheck,
    [],
    'chaîne signée « horodatage.corps brut » et contrôle de l’horodatage (5 min)',
  );
  const signature = wf.add(
    'Calculer la signature',
    'crypto',
    2,
    [480, 200],
    { action: 'hmac', type: 'SHA256', binaryData: false, value: '={{ $json.signedPayload }}', dataPropertyName: 'signature', encoding: 'hex' },
    { credentials: CREDENTIALS.signature },
  );
  const valid = wf.add('Signature valide ?', 'if', 2.2, [720, 200], {
    conditions: condition(
      'signature-check',
      "={{ $json.headers['x-meliora-signature'] }}",
      { type: 'string', operation: 'equals' },
      '=sha256={{ $json.signature }}',
    ),
    options: {},
  });
  const invalid = wf.add('Signature invalide', 'stopAndError', 1, [960, 400], {
    errorMessage: 'Signature HMAC invalide : événement ignoré (vérifiez WEBHOOK_SECRET des deux côtés).',
  });
  const fresh = wf.add('Horodatage récent ?', 'if', 2.2, [960, 200], {
    conditions: condition('timestamp-check', '={{ $json.timestampValid }}', { type: 'boolean', operation: 'true', singleValue: true }, ''),
    options: {},
  });
  const stale = wf.add('Horodatage refusé', 'stopAndError', 1, [1200, 400], {
    errorMessage:
      'Horodatage X-Meliora-Timestamp absent ou à plus de 5 minutes : événement ignoré (rejeu, ou horloge du serveur Meliora ou de n8n à régler).',
  });
  const dedupe = wf.add('Ignorer les doublons', 'removeDuplicates', 2, [1200, 200], {
    operation: 'removeItemsSeenInPreviousExecutions',
    dedupeValue: '={{ $json.body.id }}',
    options: { historySize: 10000 },
  });
  const router = wf.add('Type d’événement', 'switch', 3.2, [1440, 200], {
    rules: {
      values: CUSTOMER_EVENTS.map(({ event, label }) => ({
        conditions: condition(`route:${event}`, '={{ $json.body.event }}', { type: 'string', operation: 'equals' }, event),
        renameOutput: true,
        outputKey: label,
      })),
    },
    options: {},
  });
  const send = wf.sendEmail('Envoyer l’e-mail', [2000, 200]);

  wf.chain(webhook, prepare, signature, valid);
  wf.connect(valid, fresh, 0);
  wf.connect(valid, invalid, 1);
  wf.connect(fresh, dedupe, 0);
  wf.connect(fresh, stale, 1);
  wf.connect(dedupe, router);
  CUSTOMER_EVENTS.forEach(({ label, fn, templates, event }, index) => {
    const node = wf.code(`Préparer · ${label}`, [1720, -520 + index * 160], fn, templates, `e-mail « ${label} » (${event})`);
    wf.connect(router, node, index);
    wf.connect(node, send);
  });
  return wf;
}

function birthdays() {
  const wf = new WorkflowBuilder('02-birthdays', 'Meliora · 02 · Anniversaires des membres');
  wf.chain(
    wf.schedule('Chaque jour à 09:00', [0, 0], '0 9 * * *'),
    wf.api('Anniversaires du jour', [240, 0], 'birthdays'),
    wf.code('Préparer · anniversaire', [480, 0], scheduled.birthdays, ['birthday'], 'e-mail d’anniversaire'),
    wf.sendEmail('Envoyer l’e-mail', [720, 0]),
  );
  return wf;
}

function memberMotivation() {
  const wf = new WorkflowBuilder('03-member-motivation', 'Meliora · 03 · Motivation des membres inactifs');
  const stage = wf.code('Choisir l’étape', [720, 0], motivation.chooseStage, [], 'étape de relance par membre (rappel, motivation, reprise, premiers pas)');
  const ai = wf.add('Phrase IA activée ?', 'if', 2.2, [960, 0], {
    conditions: condition('motivation-ai', '={{ $json.aiEnabled }}', { type: 'boolean', operation: 'true', singleValue: true }, ''),
    options: {},
  });
  const claude = wf.claude('Claude · phrase de motivation', [1200, -140], 'claudeRequest');
  const prepare = wf.code(
    'Préparer · e-mails de motivation',
    [1440, 0],
    motivation.prepareEmails,
    ['motivation-rappel', 'motivation-encouragement', 'motivation-reprise', 'motivation-premiers-pas'],
    'e-mails de motivation par étape',
  );
  const send = wf.sendEmail('Envoyer les e-mails de motivation', [1680, 0], { onError: 'continueRegularOutput' });
  const record = wf.code('Mémoriser les envois', [1920, 0], motivation.recordSent, [], 'étapes envoyées (données statiques du workflow)');

  wf.chain(
    wf.schedule('Chaque jour à 10:00', [0, 0], '0 10 * * *'),
    wf.api('Membres inactifs', [240, 0], 'inactive', { days: 7 }),
    wf.api('Prochains cours', [480, 0], 'schedule', { days: 7 }, { executeOnce: true, alwaysOutputData: true }),
    stage,
    ai,
  );
  wf.connect(ai, claude, 0);
  wf.connect(ai, prepare, 1);
  wf.chain(claude, prepare, send, record);

  wf.chain(
    wf.schedule('Chaque lundi à 09:00', [0, 320], '0 9 * * 1'),
    wf.code('Bilan de la semaine', [240, 320], motivation.weeklySummary, ['motivation-summary'], 'bilan hebdomadaire des relances'),
    wf.sendEmail('Envoyer le bilan', [480, 320]),
  );
  return wf;
}

function weeklyNewsletter() {
  const wf = new WorkflowBuilder('04-weekly-schedule-newsletter', 'Meliora · 04 · Newsletter du planning (dimanche)');
  const loop = wf.add('Par lots de 20', 'splitInBatches', 3, [1200, 0], { batchSize: 20, options: {} });
  const send = wf.sendEmail('Envoyer la newsletter', [1440, 100]);
  const pause = wf.add('Pause 2 s', 'wait', 1.1, [1680, 100], { resume: 'timeInterval', amount: 2, unit: 'seconds' }, { webhookId: uuid('04:pause') });
  const done = wf.add('Envoi terminé', 'noOp', 1, [1440, -120], {});
  wf.chain(
    wf.schedule('Chaque dimanche à 18:00', [0, 0], '0 18 * * 0'),
    wf.api('Cours de la semaine', [240, 0], 'schedule', { days: 7 }),
    wf.code('Construire le planning', [480, 0], scheduled.buildSchedule, [], 'planning HTML de la semaine'),
    wf.api('Membres actifs', [720, 0], 'recipients', { segment: 'active' }),
    wf.code('Préparer · newsletter', [960, 0], scheduled.newsletter, ['weekly-schedule'], 'newsletter du planning'),
    loop,
  );
  wf.connect(loop, done, 0);
  wf.connect(loop, send, 1);
  wf.chain(send, pause, loop);
  return wf;
}

function dailyReport() {
  const wf = new WorkflowBuilder('05-owner-daily-report', 'Meliora · 05 · Rapport quotidien du gérant');
  wf.chain(
    wf.schedule('Chaque jour à 07:30', [0, 0], '30 7 * * *'),
    wf.api('Chiffres d’hier', [240, 0], 'daily-report'),
    wf.code('Préparer · rapport du jour', [480, 0], scheduled.dailyReport, ['daily-report'], 'rapport quotidien du gérant'),
    wf.sendEmail('Envoyer l’e-mail', [720, 0]),
  );
  return wf;
}

function instagramIdeas() {
  const wf = new WorkflowBuilder('06-instagram-content-ideas', 'Meliora · 06 · Idées de contenu Instagram (Claude)');
  wf.chain(
    wf.schedule('Chaque lundi à 08:00', [0, 0], '0 8 * * 1'),
    wf.api('Cours de la semaine', [240, 0], 'schedule', { days: 7 }, { alwaysOutputData: true }),
    wf.code('Résumer le planning', [480, 0], scheduled.summarizeSchedule, [], 'résumé texte du planning'),
    wf.api('Infos du club', [720, 0], 'gym'),
    wf.code('Construire la requête Claude', [960, 0], scheduled.claudeRequest, [], 'requête à l’API Claude (sortie JSON structurée)'),
    wf.claude('Claude · idées de contenu', [1200, 0], 'request'),
    wf.code('Préparer · idées de contenu', [1440, 0], scheduled.contentIdeas, ['content-ideas'], 'e-mail des idées Instagram'),
    wf.sendEmail('Envoyer l’e-mail', [1680, 0]),
  );
  return wf;
}

function operationsDigest() {
  const wf = new WorkflowBuilder('07-weekly-operations-digest', 'Meliora · 07 · Point opérations hebdomadaire');
  wf.chain(
    wf.schedule('Chaque lundi à 08:30', [0, 0], '30 8 * * 1'),
    wf.api('Prospects à relancer', [240, 0], 'leads-follow-up', {}, { alwaysOutputData: true }),
    wf.api('Stock bas', [480, 0], 'low-stock', {}, { alwaysOutputData: true, executeOnce: true }),
    wf.api('Maintenance à prévoir', [720, 0], 'maintenance-due', { days: 7 }, { alwaysOutputData: true, executeOnce: true }),
    wf.code('Préparer · point opérations', [960, 0], scheduled.operationsDigest, ['operations-digest'], 'point opérations du lundi'),
    wf.sendEmail('Envoyer l’e-mail', [1200, 0]),
  );
  return wf;
}

function expiredRenewal() {
  const wf = new WorkflowBuilder('08-expired-renewal', 'Meliora · 08 · Relance des abonnements expirés');
  wf.chain(
    wf.schedule('Chaque lundi à 10:30', [0, 0], '30 10 * * 1'),
    wf.api('Abonnements expirés', [240, 0], 'expired', { days: 7 }),
    wf.code('Préparer · relance expirés', [480, 0], scheduled.expiredMembers, ['winback-expired'], 'relance des abonnements expirés'),
    wf.sendEmail('Envoyer l’e-mail', [720, 0]),
  );
  return wf;
}

export function buildWorkflows() {
  return [
    customerEvents(),
    birthdays(),
    memberMotivation(),
    weeklyNewsletter(),
    dailyReport(),
    instagramIdeas(),
    operationsDigest(),
    expiredRenewal(),
  ].map((wf) => ({ slug: wf.slug, json: wf.toJSON() }));
}
