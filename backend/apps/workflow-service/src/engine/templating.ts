/** {{placeholders}} filled from a run context; dotted paths reach nested values ({{member.firstName}}). */
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function lookup(context: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, context);
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Unknown placeholders become empty strings. `encode` is applied to each inserted value (e.g. URLs). */
export function fillTemplate(
  template: string,
  context: Record<string, unknown>,
  encode: (value: string) => string = (value) => value,
): string {
  return template.replace(PLACEHOLDER, (_, path: string) => encode(stringify(lookup(context, path))));
}

/** Fills every string found in a JSON-like value (objects and arrays are copied). */
export function fillDeep(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') return fillTemplate(value, context);
  if (Array.isArray(value)) return value.map((item) => fillDeep(item, context));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillDeep(item, context)]));
  }
  return value;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
