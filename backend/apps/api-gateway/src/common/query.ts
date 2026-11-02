import { Transform } from 'class-transformer';

/**
 * Query-string booleans: "true" / "1" / "yes" → true. Reads the raw value because the
 * global implicit conversion would already have turned "false" into true.
 */
export const ToBoolean = () =>
  Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    return typeof raw === 'boolean' ? raw : ['true', '1', 'yes'].includes(String(raw).toLowerCase());
  });
