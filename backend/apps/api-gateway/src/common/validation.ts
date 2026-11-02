import { ValidationPipe } from '@nestjs/common';

/**
 * Global pipe of the gateway (main.ts): validates bodies and query strings against their DTO and drops
 * unknown fields. No implicit conversion: it ran String() / Number() / Boolean() on the declared type
 * before validation, so { "notes": { … } } was stored as "[object Object]" and { "isActive": "false" }
 * became true. JSON bodies keep their own types; query values are text, so numeric query fields convert
 * with @Type(() => Number) and booleans with ToBoolean().
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });
}
