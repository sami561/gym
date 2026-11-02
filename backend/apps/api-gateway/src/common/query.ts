import { Transform } from 'class-transformer';

/** Query-string booleans: "true" / "1" → true. */
export const ToBoolean = () =>
  Transform(({ value }) => (typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(String(value))));
