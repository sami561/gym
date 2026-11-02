import { decimalTransformer } from './transformers';

describe('decimalTransformer (numeric columns as TND numbers)', () => {
  it('reads Postgres numeric strings as numbers', () => {
    expect(decimalTransformer.from('89.900')).toBe(89.9);
    expect(decimalTransformer.from('0.000')).toBe(0);
    expect(decimalTransformer.from('-12.345')).toBe(-12.345);
  });

  it('keeps missing values as null', () => {
    expect(decimalTransformer.from(null)).toBeNull();
    expect(decimalTransformer.from(undefined)).toBeNull();
  });

  it('writes numbers as they are', () => {
    expect(decimalTransformer.to(1450.5)).toBe(1450.5);
    expect(decimalTransformer.to(null)).toBeNull();
    expect(decimalTransformer.to(undefined)).toBeUndefined();
  });
});
