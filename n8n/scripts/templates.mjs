/*
 * E-mail templates: templates/layout.html wraps each templates/<name>.html fragment.
 * Fragments use a few build-time shortcuts (expanded here) and runtime placeholders
 * ({{value}}, {{{html}}}, {{#if key}}…{{/if}}) filled by the Code nodes in n8n.
 *
 *   [[kicker:Text]]   [[h1:Text]]   [[h2:Text]]   [[button:Label|{{url}}]]
 *   [[details]] [[row:Label|Value]] … [[/details]]   [[note]]…[[/note]]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

const RED = '#E10600';
const STYLE = {
  kicker: `margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${RED};`,
  h1: "margin:0 0 18px;font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:30px;line-height:1.2;color:#0b0b0c;",
  h2: 'margin:28px 0 10px;font-size:18px;line-height:1.3;color:#0b0b0c;',
  p: 'margin:0 0 14px;',
  table: 'margin:20px 0;border:1px solid #ececec;border-radius:10px;border-collapse:separate;border-spacing:0;',
  label: 'padding:11px 16px;border-bottom:1px solid #f1f1f1;font-size:14px;color:#6b6b6b;',
  value: 'padding:11px 16px;border-bottom:1px solid #f1f1f1;font-size:14px;font-weight:bold;color:#0b0b0c;text-align:right;',
  note: `margin:20px 0;padding:14px 18px;background:#f7f7f7;border-left:4px solid ${RED};border-radius:6px;font-size:14px;color:#333333;`,
};

const button = (label, href) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 10px;"><tr>` +
  `<td style="border-radius:8px;background:${RED};">` +
  `<a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>` +
  `</td></tr></table>`;

export function expandMacros(fragment) {
  const html = fragment
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/\[\[kicker:([^\]]*)\]\]/g, (_, text) => `<p style="${STYLE.kicker}">${text}</p>`)
    .replace(/\[\[h1:([^\]]*)\]\]/g, (_, text) => `<h1 class="h1" style="${STYLE.h1}">${text}</h1>`)
    .replace(/\[\[h2:([^\]]*)\]\]/g, (_, text) => `<h2 style="${STYLE.h2}">${text}</h2>`)
    .replace(/\[\[button:([^|\]]*)\|([^\]]*)\]\]/g, (_, label, href) => button(label, href))
    .replace(/\[\[details\]\]/g, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${STYLE.table}">`)
    .replace(/\[\[\/details\]\]/g, '</table>')
    .replace(/\[\[row:([^|\]]*)\|([^\]]*)\]\]/g, (_, label, value) => `<tr><td style="${STYLE.label}">${label}</td><td style="${STYLE.value}">${value}</td></tr>`)
    .replace(/\[\[note\]\]/g, `<div style="${STYLE.note}">`)
    .replace(/\[\[\/note\]\]/g, '</div>')
    .replace(/<p>/g, `<p style="${STYLE.p}">`)
    .trim();
  const leftover = html.match(/\[\[[^\]]*\]\]/);
  if (leftover) throw new Error(`Unknown template shortcut ${leftover[0]}`);
  return html;
}

/** Full e-mail HTML (layout + fragment) with runtime placeholders still in place. */
export function composeTemplate(name) {
  const layout = readFileSync(join(TEMPLATES_DIR, 'layout.html'), 'utf8');
  const fragment = readFileSync(join(TEMPLATES_DIR, `${name}.html`), 'utf8');
  return layout.replace('{{{content}}}', expandMacros(fragment));
}

export function templateNames() {
  return readdirSync(TEMPLATES_DIR)
    .filter((file) => file.endsWith('.html') && file !== 'layout.html')
    .map((file) => file.replace(/\.html$/, ''));
}

/** Placeholders a composed template expects at runtime. */
export function placeholders(template) {
  const names = new Set();
  for (const match of template.matchAll(/\{\{#if (\w+)\}\}|\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g)) {
    names.add(match[1] ?? match[2] ?? match[3]);
  }
  return [...names];
}

/** {{#if}} blocks must not be nested (the runtime renderer does not support it). */
export function assertNoNestedIf(name, template) {
  for (const match of template.matchAll(/\{\{#if \w+\}\}([\s\S]*?)\{\{\/if\}\}/g)) {
    if (match[1].includes('{{#if')) throw new Error(`Nested {{#if}} in template ${name}`);
  }
}
