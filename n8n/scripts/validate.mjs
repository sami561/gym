/*
 * Validates workflows/*.json and runs every Code node with sample data.
 *   node scripts/validate.mjs
 *   N8N_NODES_BASE_DIR=/path/to/node_modules/n8n-nodes-base node scripts/validate.mjs   (also checks against a real n8n-nodes-base)
 * Rendered e-mails are written to preview/ (open preview/index.html).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeholders, assertNoNestedIf, composeTemplate, templateNames } from './templates.mjs';
import * as F from './fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS_DIR = join(ROOT, 'workflows');
const PREVIEW_DIR = join(ROOT, 'preview');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let failures = 0;
let checks = 0;
const fail = (message) => {
  failures++;
  console.log(`  ✗ ${message}`);
};
const check = (condition, message) => {
  checks++;
  if (!condition) fail(message);
  return condition;
};

// ---- Known node types (n8n-nodes-base 2.45.x, the version shipped with n8n 2.45) ----------------
const KNOWN_NODES = {
  'n8n-nodes-base.webhook': [1, 1.1, 2, 2.1, 2.2],
  'n8n-nodes-base.crypto': [1, 2],
  'n8n-nodes-base.if': [1, 2, 2.1, 2.2, 2.3, 2.4],
  'n8n-nodes-base.stopAndError': [1],
  'n8n-nodes-base.removeDuplicates': [1, 1.1, 2],
  'n8n-nodes-base.switch': [1, 2, 3, 3.1, 3.2, 3.3, 3.4, 3.5],
  'n8n-nodes-base.code': [1, 2],
  'n8n-nodes-base.emailSend': [1, 2, 2.1],
  'n8n-nodes-base.scheduleTrigger': [1, 1.1, 1.2, 1.3, 1.4],
  'n8n-nodes-base.httpRequest': [1, 2, 3, 4, 4.1, 4.2, 4.3, 4.4, 4.5],
  'n8n-nodes-base.splitInBatches': [1, 2, 3],
  'n8n-nodes-base.wait': [1, 1.1],
  'n8n-nodes-base.noOp': [1],
};
const CREDENTIAL_TYPES = {
  'n8n-nodes-base.emailSend': ['smtp'],
  'n8n-nodes-base.httpRequest': ['httpHeaderAuth'],
  'n8n-nodes-base.webhook': ['httpHeaderAuth'],
  'n8n-nodes-base.crypto': ['crypto'],
};
const TRIGGERS = new Set(['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook']);

/** Optional: versions read from a real n8n-nodes-base package. */
function loadRealNodes(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const nodes = {};
  for (const file of pkg.n8n.nodes) {
    const base = basename(file).replace(/\.node\.js$/, '');
    const type = `n8n-nodes-base.${base.charAt(0).toLowerCase()}${base.slice(1)}`;
    const source = readFileSync(join(dir, file), 'utf8');
    const versions = new Set();
    for (const m of source.matchAll(/version: \[([0-9., ]+)\]/g)) m[1].split(',').forEach((v) => versions.add(Number(v.trim())));
    for (const m of source.matchAll(/\bversion: ([0-9.]+),/g)) versions.add(Number(m[1]));
    for (const m of source.matchAll(/^\s+([0-9]+(?:\.[0-9]+)?): new /gm)) versions.add(Number(m[1]));
    nodes[type] = versions;
  }
  return { version: pkg.version, nodes };
}
const real = process.env.N8N_NODES_BASE_DIR ? loadRealNodes(process.env.N8N_NODES_BASE_DIR) : null;

function outputCount(node) {
  if (node.type === 'n8n-nodes-base.switch') {
    return (node.parameters.rules?.values?.length ?? 0) + (node.parameters.options?.fallbackOutput === 'extra' ? 1 : 0);
  }
  if (node.type === 'n8n-nodes-base.if' || node.type === 'n8n-nodes-base.splitInBatches') return 2;
  return 1;
}

function balancedExpressions(value, path, problems) {
  if (typeof value === 'string') {
    if (value.startsWith('=') && (value.match(/\{\{/g) ?? []).length !== (value.match(/\}\}/g) ?? []).length) {
      problems.push(`unbalanced expression at ${path}`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) balancedExpressions(child, `${path}.${key}`, problems);
  }
}

// ---- 1. Structure ---------------------------------------------------------------------------------
const files = readdirSync(WORKFLOWS_DIR).filter((file) => file.endsWith('.json')).sort();
const workflows = {};
const allIds = new Set();
const webhookPaths = new Set();
console.log(`Structure (${files.length} workflows${real ? `, checked against n8n-nodes-base ${real.version}` : ''})`);

for (const file of files) {
  let wf;
  try {
    wf = JSON.parse(readFileSync(join(WORKFLOWS_DIR, file), 'utf8'));
  } catch (error) {
    fail(`${file}: invalid JSON (${error.message})`);
    continue;
  }
  workflows[file.replace(/\.json$/, '')] = wf;
  const where = (msg) => `${file}: ${msg}`;
  check(typeof wf.name === 'string' && wf.name.startsWith('Meliora'), where('missing name'));
  check(Array.isArray(wf.nodes) && wf.nodes.length > 0, where('no nodes'));
  check(wf.connections && typeof wf.connections === 'object', where('no connections'));
  check(wf.settings?.executionOrder === 'v1' && wf.settings?.timezone === 'Africa/Tunis', where('settings'));

  const byName = new Map();
  for (const node of wf.nodes) {
    check(!byName.has(node.name), where(`duplicate node name "${node.name}"`));
    byName.set(node.name, node);
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(node.id), where(`bad id on "${node.name}"`));
    check(!allIds.has(node.id), where(`node id reused across workflows ("${node.name}")`));
    allIds.add(node.id);
    check(Array.isArray(node.position) && node.position.length === 2 && node.position.every(Number.isFinite), where(`position of "${node.name}"`));
    check(node.parameters && typeof node.parameters === 'object', where(`parameters of "${node.name}"`));

    const versions = KNOWN_NODES[node.type];
    check(Boolean(versions), where(`unknown node type ${node.type}`));
    if (versions) check(versions.includes(node.typeVersion), where(`${node.type} has no typeVersion ${node.typeVersion}`));
    if (real) {
      check(Boolean(real.nodes[node.type]), where(`${node.type} not found in n8n-nodes-base ${real.version}`));
      if (real.nodes[node.type]) {
        check(real.nodes[node.type].has(node.typeVersion), where(`${node.type}@${node.typeVersion} not in n8n-nodes-base ${real.version}`));
      }
    }
    for (const credentialType of Object.keys(node.credentials ?? {})) {
      check((CREDENTIAL_TYPES[node.type] ?? []).includes(credentialType), where(`credential ${credentialType} not valid for ${node.type}`));
    }
    if (node.type === 'n8n-nodes-base.webhook') {
      check(!webhookPaths.has(node.parameters.path), where(`webhook path reused: ${node.parameters.path}`));
      webhookPaths.add(node.parameters.path);
      check(Boolean(node.webhookId), where('webhook without webhookId'));
    }
    if (node.type === 'n8n-nodes-base.code') {
      try {
        new AsyncFunction('$input', '$env', '$', '$getWorkflowStaticData', node.parameters.jsCode);
        checks++;
      } catch (error) {
        fail(where(`Code node "${node.name}" does not compile: ${error.message}`));
      }
    }
    const problems = [];
    balancedExpressions(node.parameters, node.name, problems);
    problems.forEach((problem) => fail(where(problem)));
  }

  // Connections point to existing nodes and existing outputs.
  const incoming = new Map();
  for (const [from, { main }] of Object.entries(wf.connections)) {
    const source = byName.get(from);
    if (!check(Boolean(source), where(`connection from unknown node "${from}"`))) continue;
    check(main.length <= outputCount(source), where(`"${from}" uses ${main.length} outputs, has ${outputCount(source)}`));
    main.forEach((targets) =>
      targets.forEach((target) => {
        check(byName.has(target.node), where(`connection to unknown node "${target.node}"`));
        check(target.type === 'main' && target.index === 0, where(`unexpected input on "${target.node}"`));
        incoming.set(target.node, (incoming.get(target.node) ?? 0) + 1);
      }),
    );
  }
  // Every node is reachable from a trigger.
  const reachable = new Set();
  const visit = (name) => {
    if (reachable.has(name)) return;
    reachable.add(name);
    for (const targets of wf.connections[name]?.main ?? []) targets.forEach((target) => visit(target.node));
  };
  wf.nodes.filter((node) => TRIGGERS.has(node.type)).forEach((node) => visit(node.name));
  for (const node of wf.nodes) check(reachable.has(node.name), where(`node "${node.name}" is not reachable from a trigger`));
}

// ---- 2. Templates ---------------------------------------------------------------------------------
console.log('Templates');
const LAYOUT_KEYS = new Set(['logoUrl', 'websiteUrl', 'appUrl', 'adminUrl', 'mapsUrl', 'instagramUrl', 'instagramHandle', 'address', 'phone', 'year', 'subject', 'preheader', 'footerNote']);
const usedTemplates = new Set();
for (const wf of Object.values(workflows)) {
  for (const node of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
    const match = node.parameters.jsCode.match(/^const TEMPLATES = (.*);$/m);
    const templates = match ? JSON.parse(match[1]) : {};
    const body = node.parameters.jsCode.split('\n').filter((line) => !line.startsWith('const TEMPLATES')).join('\n');
    for (const [key, template] of Object.entries(templates)) {
      usedTemplates.add(key);
      for (const name of placeholders(template)) {
        if (LAYOUT_KEYS.has(name)) continue;
        check(new RegExp(`\\b${name}\\b`).test(body), `${wf.name} › ${node.name}: template ${key} uses {{${name}}} but the node never sets it`);
      }
    }
  }
}
for (const name of templateNames()) {
  const template = composeTemplate(name);
  try {
    assertNoNestedIf(name, template);
    checks++;
  } catch (error) {
    fail(error.message);
  }
  const key = name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  check(usedTemplates.has(key), `template ${name}.html is not used by any workflow`);
}

// ---- 3. Run the Code nodes ------------------------------------------------------------------------
console.log('Code nodes with sample data');
rmSync(PREVIEW_DIR, { recursive: true, force: true });
const previews = [];

function codeNode(slug, name) {
  const node = workflows[slug]?.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Code node "${name}" not found in ${slug}`);
  return node;
}

const toItems = (list) => list.map((entry, index) => (entry && entry.json ? entry : { json: entry, pairedItem: { item: index } }));
const accessor = (items) => ({
  all: () => items,
  first: () => items[0],
  last: () => items[items.length - 1],
  item: items[0],
});

// During tests, render() throws when a placeholder outside {{#if}} gets no value (instead of printing nothing).
const OPTIONAL_VALUES = new Set(['preheader', 'classesHtml', 'hashtags']);
const STRICT_RENDER = `const render = (template, vars) => {
  const missing = new Set();
  const html = template
    .replace(/\\{\\{#if (\\w+)\\}\\}([\\s\\S]*?)\\{\\{\\/if\\}\\}/g, (_, key, inner) => (vars[key] ? inner : ''))
    .replace(/\\{\\{\\{(\\w+)\\}\\}\\}|\\{\\{(\\w+)\\}\\}/g, (_, raw, key) => {
      const name = raw || key;
      const value = vars[name];
      if ((value === undefined || value === null || value === '') && !${JSON.stringify([...OPTIONAL_VALUES])}.includes(name)) missing.add(name);
      return raw ? String(value ?? '') : esc(value);
    });
  if (missing.size) throw new Error('template values missing: ' + [...missing].join(', '));
  return html;
};
`;

function strictCode(jsCode) {
  const pattern = /const render = \(template, vars\) =>\n[\s\S]*?\)\);\n/;
  if (!pattern.test(jsCode)) throw new Error('render() not found in the Code node');
  return jsCode.replace(pattern, STRICT_RENDER);
}

async function run(slug, name, { input = [], refs = {}, env = {}, staticData } = {}) {
  const node = codeNode(slug, name);
  const $input = accessor(toItems(input));
  const $ = (ref) => {
    if (!(ref in refs)) throw new Error(`$('${ref}') is not provided by the test`);
    return accessor(toItems(refs[ref]));
  };
  const store = staticData ?? {};
  const fn = new AsyncFunction('$input', '$env', '$', '$getWorkflowStaticData', strictCode(node.parameters.jsCode));
  const result = await fn($input, { ...F.ENV, ...env }, $, () => store);
  if (!Array.isArray(result)) throw new Error(`${name} did not return an array`);
  result.forEach((item, index) => {
    if (!item || typeof item.json !== 'object') throw new Error(`${name} returned an invalid item #${index}`);
  });
  return result;
}

const LEAKS = ['{{', '}}', 'undefined', 'NaN', '[object Object]', '>null<', ' null ', 'Invalid Date'];
function checkEmails(label, items, { count, to, subject, contains = [], notContains = [] } = {}) {
  checks++;
  if (count !== undefined && items.length !== count) {
    fail(`${label}: expected ${count} e-mail(s), got ${items.length}`);
  }
  items.forEach((item, index) => {
    const mail = item.json;
    const tag = `${label} #${index + 1}`;
    check(String(mail.to).includes('@'), `${tag}: recipient "${mail.to}"`);
    check(Boolean(mail.subject) && !/undefined|null|NaN/.test(mail.subject), `${tag}: subject "${mail.subject}"`);
    check(mail.from === F.ENV.MELIORA_FROM_EMAIL, `${tag}: from`);
    check(mail.html.includes(F.ENV.MELIORA_LOGO_URL) && mail.html.includes('Khzema Est'), `${tag}: branding missing`);
    for (const leak of LEAKS) check(!mail.html.includes(leak), `${tag}: html contains "${leak}"`);
    previews.push({ label: tag, subject: mail.subject, to: mail.to, html: mail.html });
  });
  if (to) items.forEach((item, index) => check(item.json.to === (Array.isArray(to) ? to[index] : to), `${label} #${index + 1}: sent to ${item.json.to}`));
  if (subject) items.forEach((item, index) => check(subject.test(item.json.subject), `${label} #${index + 1}: subject "${item.json.subject}" !~ ${subject}`));
  const html = items.map((item) => item.json.html).join('\n');
  contains.forEach((text) => check(html.includes(text), `${label}: missing "${text}"`));
  notContains.forEach((text) => check(!html.includes(text), `${label}: should not contain "${text}"`));
}

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// 01 · customer events
const EVENT_EXPECTATIONS = {
  'member.created': { node: 'Préparer · Bienvenue', count: 1, to: 'yassine@example.com', contains: ['MEL-00042'] },
  'subscription.created': { node: 'Préparer · Abonnement confirmé', count: 1, contains: ['Trimestriel', '270,000 DT'] },
  'payment.received': { node: 'Préparer · Reçu de paiement', count: 1, contains: ['D17-778899', 'MEL-EF12'.slice(0, 4)] },
  'subscription.expiring': { node: 'Préparer · Rappel d’expiration', count: 1, subject: /dans 3 jours/, contains: ['3 jours'] },
  'subscription.expired': { node: 'Préparer · Abonnement expiré', count: 1, contains: ['Mensuel'] },
  'booking.created': { node: 'Préparer · Réservation confirmée', count: 1, contains: ['Cross Training', 'Coach Amine', 'Salle Cardio'] },
  'lead.created': { node: 'Préparer · Séance d’essai', count: 2, to: ['sarra@example.com', 'accueil@meliora-gym.tn'], contains: ['&lt;3', 'Instagram'] },
  'sale.completed': { node: 'Préparer · Reçu boutique', count: 1, contains: ['Whey Protein 2 kg', '219,000 DT', 'Carte bancaire'] },
  'stock.low': { node: 'Préparer · Alerte stock', count: 1, to: 'gerant@meliora-gym.tn', contains: ['4 unités'] },
  'maintenance.opened': { node: 'Préparer · Alerte maintenance', count: 1, to: 'gerant@meliora-gym.tn', subject: /haute/ },
};
for (const [event, expectation] of Object.entries(EVENT_EXPECTATIONS)) {
  scenario(`01 ${event}`, async () => {
    const out = await run('01-customer-events', expectation.node, { input: [F.WEBHOOK_EVENTS[event]] });
    checkEmails(`01 ${event}`, out, expectation);
  });
}
scenario('01 booking without e-mail is skipped', async () => {
  const event = structuredClone(F.WEBHOOK_EVENTS['booking.created']);
  event.body.data.email = null;
  const out = await run('01-customer-events', 'Préparer · Réservation confirmée', { input: [event] });
  check(out.length === 0, '01 booking without e-mail should produce no e-mail');
});
scenario('01 webhook routing covers every customer event', async () => {
  const wf = workflows['01-customer-events'];
  const router = wf.nodes.find((node) => node.name === 'Type d’événement');
  const routed = router.parameters.rules.values.map((rule) => rule.conditions.conditions[0].rightValue);
  for (const event of Object.keys(EVENT_EXPECTATIONS)) check(routed.includes(event), `01 switch has no branch for ${event}`);
  const webhook = wf.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
  check(webhook.parameters.path === 'meliora-events' && webhook.parameters.httpMethod === 'POST', '01 webhook path/method');
  check(webhook.parameters.authentication === 'headerAuth' && webhook.parameters.options.rawBody === true, '01 webhook auth/raw body');
});

// 02 · birthdays
scenario('02 birthdays', async () => {
  const out = await run('02-birthdays', 'Préparer · anniversaire', { input: F.BIRTHDAYS });
  checkEmails('02 birthday', out, { count: 1, contains: ['Amira', 'sa séance est offerte'] });
});

// 03 · motivation
scenario('03 motivation: stages, e-mails, dedupe, AI fallback, weekly summary', async () => {
  const slug = '03-member-motivation';
  const refs = { 'Membres inactifs': F.INACTIVE, 'Prochains cours': F.SESSIONS };
  const store = {};
  const staged = await run(slug, 'Choisir l’étape', { refs, staticData: store });
  const stages = Object.fromEntries(staged.map((item) => [item.json.memberId, item.json.stage]));
  check(staged.length === 4, `03 expected 4 staged members, got ${staged.length}`);
  check(stages.m5 === 'rappel' && stages.m6 === 'motivation' && stages.m7 === 'reprise' && stages.m8 === 'premiers-pas', `03 stages ${JSON.stringify(stages)}`);
  check(!('m10' in stages) && !('m11' in stages), '03 members without e-mail or inactive < 7 days must be skipped');
  check(staged.find((i) => i.json.stage === 'motivation').json.upcoming.length === 3, '03 motivation stage should carry the next 3 classes');
  check(staged.every((i) => i.json.aiEnabled === false && i.json.claudeRequest === null), '03 AI off by default');

  const mails = await run(slug, 'Préparer · e-mails de motivation', { input: staged.map((i) => i.json), refs: { 'Choisir l’étape': staged.map((i) => i.json) } });
  checkEmails('03 motivation e-mails', mails, { count: 4, contains: ['Les prochains cours', 'Cross Training', 'séance de reprise offerte', 'https://wa.me/21673000000', 'tel:+21673000000', 'première séance'] });
  check(mails.every((m) => m.json.meta && m.json.meta.key && m.json.meta.aiLine === false), '03 e-mails carry their dedupe key');

  // The send of the 2nd e-mail fails: only 3 stages are remembered.
  const sendResults = mails.map((m, index) => ({ json: index === 1 ? { error: 'SMTP timeout' } : { accepted: [m.json.to] }, pairedItem: { item: index } }));
  const [recorded] = await run(slug, 'Mémoriser les envois', { input: sendResults, refs: { 'Préparer · e-mails de motivation': mails.map((m) => m.json) }, staticData: store });
  check(recorded.json.recorded === 3 && recorded.json.failed === 1, `03 record ${JSON.stringify(recorded.json)}`);
  check(Object.keys(store.motivation).length === 3, '03 static data should hold 3 keys');

  const again = await run(slug, 'Choisir l’étape', { refs, staticData: store });
  check(again.length === 1 && again[0].json.memberId === 'm6', `03 second run should only retry the failed e-mail, got ${again.map((i) => i.json.memberId)}`);

  const cameBack = structuredClone(F.INACTIVE);
  cameBack[0].lastVisitAt = new Date(Date.now() - 8 * 86_400_000).toISOString();
  cameBack[0].daysSinceVisit = 8;
  const newAbsence = await run(slug, 'Choisir l’étape', { refs: { ...refs, 'Membres inactifs': cameBack }, staticData: store });
  check(newAbsence.some((i) => i.json.memberId === 'm5'), '03 a new absence (new lastVisitAt) must restart the stages');

  store.motivation['old:rappel:x'] = { at: new Date(Date.now() - 400 * 86_400_000).toISOString(), stage: 'rappel', name: 'Old' };
  await run(slug, 'Choisir l’étape', { refs, staticData: store });
  check(!store.motivation['old:rappel:x'], '03 keys older than 180 days are pruned');

  // AI on: requests built, then a success, a refusal and an API error.
  const aiStaged = await run(slug, 'Choisir l’étape', { refs, env: { MELIORA_MOTIVATION_AI: 'true' }, staticData: {} });
  const request = aiStaged[0].json.claudeRequest;
  check(request?.model === 'claude-opus-5-5' && request.fallbacks === 'default' && request.output_config?.format?.type === 'json_schema' && request.output_config.effort === 'low', '03 Claude request shape');
  check(!JSON.stringify(request).includes('@'), '03 Claude request must not contain e-mail addresses');
  const responses = [
    { json: F.claudeMessage({ sentence: 'Mehdi, une petite séance mardi et tu retrouves ton énergie !' }), pairedItem: { item: 0 } },
    { json: { ...F.claudeMessage({ sentence: 'x' }), stop_reason: 'refusal', content: [] }, pairedItem: { item: 1 } },
    { json: { error: { message: 'Request failed with status code 401' } }, pairedItem: { item: 2 } },
    { json: F.claudeMessage({ sentence: '' }), pairedItem: { item: 3 } },
  ];
  const aiMails = await run(slug, 'Préparer · e-mails de motivation', { input: responses, refs: { 'Choisir l’étape': aiStaged.map((i) => i.json) } });
  checkEmails('03 motivation e-mails (Claude)', aiMails, { count: 4, contains: ['une petite séance mardi', 'Chaque retour compte plus que la perfection', 'Reprendre après une pause'] });
  check(aiMails[0].json.meta.aiLine === true && aiMails.slice(1).every((m) => m.json.meta.aiLine === false), '03 AI sentence used only when valid');

  const summary = await run(slug, 'Bilan de la semaine', { staticData: store });
  checkEmails('03 weekly summary', summary, { count: 1, to: 'gerant@meliora-gym.tn', contains: ['Hatem Dridi'] });
});

// 04 · newsletter
scenario('04 newsletter', async () => {
  const slug = '04-weekly-schedule-newsletter';
  const [planning] = await run(slug, 'Construire le planning', { input: F.SESSIONS });
  check(planning.json.count === 4 && planning.json.scheduleHtml.includes('Complet') && planning.json.scheduleHtml.includes('5 places'), '04 schedule HTML');
  const empty = await run(slug, 'Construire le planning', { input: [] });
  check(empty.length === 0, '04 no sessions → no newsletter');
  const out = await run(slug, 'Préparer · newsletter', { input: F.RECIPIENTS, refs: { 'Construire le planning': [planning.json] } });
  checkEmails('04 newsletter', out, { count: 2, contains: ['Cross Training', 'Coach Nour', 'Complet'] });
});

// 05 · daily report
scenario('05 daily report', async () => {
  const out = await run('05-owner-daily-report', 'Préparer · rapport du jour', { input: [F.DAILY_REPORT] });
  checkEmails('05 daily report', out, { count: 1, to: 'gerant@meliora-gym.tn', contains: ['240,500 DT', '183', '72 %', '7 abonnements expirent'] });
  const none = await run('05-owner-daily-report', 'Préparer · rapport du jour', { input: [F.DAILY_REPORT], env: { MELIORA_OWNER_EMAIL: '' } });
  check(none.length === 0, '05 no owner e-mail configured → nothing sent');
});

// 06 · Instagram ideas
scenario('06 instagram ideas', async () => {
  const slug = '06-instagram-content-ideas';
  const [summary] = await run(slug, 'Résumer le planning', { input: F.SESSIONS });
  check(summary.json.count === 4 && summary.json.scheduleText.includes('Cross Training avec Coach Amine'), '06 schedule summary');
  const [emptyWeek] = await run(slug, 'Résumer le planning', { input: [{}] });
  check(emptyWeek.json.count === 0 && emptyWeek.json.scheduleText.startsWith('Aucun cours'), '06 empty week summary');

  const [built] = await run(slug, 'Construire la requête Claude', { input: [F.GYM], refs: { 'Résumer le planning': [summary.json] } });
  const request = built.json.request;
  check(request.model === 'claude-opus-5-5' && request.max_tokens === 16000 && request.fallbacks === 'default', '06 model / max_tokens / fallbacks');
  check(request.output_config?.effort === 'medium' && request.output_config?.format?.type === 'json_schema', '06 output_config');
  check(!('thinking' in request) && !('temperature' in request), '06 no thinking / sampling parameters');
  const strict = (schema) =>
    schema.type !== 'object' ||
    (schema.additionalProperties === false &&
      Object.keys(schema.properties).every((key) => schema.required.includes(key)) &&
      Object.values(schema.properties).every((child) => strict(child.type === 'array' ? child.items : child)));
  check(strict(request.output_config.format.schema), '06 every schema object is closed and fully required');
  check(request.messages[0].content.includes('Cross Training'), '06 prompt includes the schedule');

  const http = workflows[slug].nodes.find((node) => node.name === 'Claude · idées de contenu');
  const headers = Object.fromEntries(http.parameters.headerParameters.parameters.map((h) => [h.name, h.value]));
  check(headers['anthropic-version'] === '2026-10-21' && headers['anthropic-beta'] === 'server-side-fallback-2026-07-01', '06 Anthropic headers');
  check(http.parameters.url === 'https://api.anthropic.com/v1/messages' && http.onError === 'continueRegularOutput', '06 Claude node');

  const refs = { 'Construire la requête Claude': [built.json] };
  const ok = await run(slug, 'Préparer · idées de contenu', { input: [F.claudeMessage(F.CLAUDE_IDEAS)], refs });
  checkEmails('06 ideas', ok, { count: 1, to: 'gerant@meliora-gym.tn', contains: ['Forge ta régularité', 'Le Cross Training de mardi', 'Sondage', '#MelioraGym'], notContains: ['n’a pas abouti'] });
  const failed = await run(slug, 'Préparer · idées de contenu', { input: [{ error: { message: 'Request failed with status code 529' } }], refs });
  checkEmails('06 ideas (API failure)', failed, { count: 1, contains: ['n’a pas abouti', 'status code 529', 'Cross Training'] });
  const refused = await run(slug, 'Préparer · idées de contenu', { input: [{ ...F.claudeMessage({}), stop_reason: 'refusal', content: [] }], refs });
  checkEmails('06 ideas (refusal)', refused, { count: 1, contains: ['garde-fous'] });
});

// 07 · operations digest
scenario('07 operations digest', async () => {
  const slug = '07-weekly-operations-digest';
  const full = await run(slug, 'Préparer · point opérations', {
    refs: { 'Prospects à relancer': F.LEADS, 'Stock bas': F.LOW_STOCK, 'Maintenance à prévoir': F.MAINTENANCE_DUE },
  });
  checkEmails('07 digest', full, { count: 1, to: 'gerant@meliora-gym.tn', contains: ['Sarra Ben Ammar', 'Walid Hamdi', 'Eau minérale', 'Tapis de course n°3', 'Prospects à relancer (2)'] });
  const quiet = await run(slug, 'Préparer · point opérations', { refs: { 'Prospects à relancer': [{}], 'Stock bas': [{}], 'Maintenance à prévoir': [{}] } });
  checkEmails('07 digest (quiet week)', quiet, { count: 1, contains: ['Rien à signaler'] });
});

// 08 · expired renewal
scenario('08 expired renewal', async () => {
  const out = await run('08-expired-renewal', 'Préparer · relance expirés', { input: F.EXPIRED });
  checkEmails('08 expired', out, { count: 1, contains: ['Mensuel', '5 jours'] });
});

for (const { name, fn } of scenarios) {
  try {
    await fn();
  } catch (error) {
    fail(`${name}: ${error.stack ?? error.message}`);
  }
}

// ---- 4. Previews ------------------------------------------------------------------------------------
mkdirSync(PREVIEW_DIR, { recursive: true });
const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const links = previews.map((preview) => {
  const file = `${slugify(preview.label)}.html`;
  writeFileSync(join(PREVIEW_DIR, file), preview.html);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<li><a href="${file}">${esc(preview.label)}</a> — <strong>${esc(preview.subject)}</strong> → ${esc(preview.to)}</li>`;
});
writeFileSync(
  join(PREVIEW_DIR, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Meliora · aperçus e-mails</title><body style="font-family:Arial;padding:24px"><h1>Aperçus des e-mails (${previews.length})</h1><ul>${links.join('')}</ul></body>`,
);

console.log(`\n${checks} checks, ${failures} failure(s) · ${previews.length} e-mails rendered in preview/`);
if (existsSync(PREVIEW_DIR)) console.log(`open ${join(PREVIEW_DIR, 'index.html')}`);
process.exit(failures ? 1 : 0);
