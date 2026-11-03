import { Transform } from 'class-transformer';

/**
 * Query-string booleans: "true" / "1" / "yes" → true, any other text → false. Reads the raw
 * value sent, whatever the declared type (Boolean("false") would be true).
 */
export const ToBoolean = () =>
  Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    return typeof raw === 'boolean' ? raw : ['true', '1', 'yes'].includes(String(raw).toLowerCase());
  });
