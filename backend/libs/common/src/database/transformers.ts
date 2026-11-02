import { ValueTransformer } from 'typeorm';

/** Postgres numeric columns come back as strings; expose them as numbers (TND, 3 decimals). */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => (value === null || value === undefined ? value : value),
  from: (value?: string | null) => (value === null || value === undefined ? null : Number(value)),
};
