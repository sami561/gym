import { describe, expect, it } from '@jest/globals';
import { ApiError } from '@/api/client';
import { translate, type Lang, type TranslationKey } from '@/i18n';
import { ar } from '@/i18n/ar';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { errorMessage } from './errors';

/** Stand-in translator that shows which key was picked. */
const t = (key: TranslationKey) => `<${key}>`;

describe('errorMessage', () => {
  it.each([
    ['network', 'errors.network'],
    ['timeout', 'errors.timeout'],
    ['session', 'errors.session'],
  ] as const)('translates %s errors', (kind, key) => {
    expect(errorMessage(new ApiError(0, kind, kind), t)).toBe(`<${key}>`);
  });

  it('shows the server message as is: it is already written for the member', () => {
    expect(errorMessage(new ApiError(409, 'Cette place est déjà prise.'), t)).toBe('Cette place est déjà prise.');
    // The client joins validation messages with line breaks.
    expect(errorMessage(new ApiError(400, 'Prénom obligatoire\nTéléphone invalide'), t)).toBe(
      'Prénom obligatoire\nTéléphone invalide',
    );
  });

  it('uses the generic message when the server sent no message', () => {
    // "HTTP <status>" is the client's placeholder for a body without message (e.g. a proxy HTML page).
    expect(errorMessage(new ApiError(502, 'HTTP 502'), t)).toBe('<errors.generic>');
    expect(errorMessage(new ApiError(500, ''), t)).toBe('<errors.generic>');
  });

  it('never shows technical messages of other errors', () => {
    const others: unknown[] = [
      new TypeError("Cannot read properties of undefined (reading 'id')"),
      new SyntaxError('Unexpected token < in JSON at position 0'),
      'boom',
      { message: 'raw object' },
      null,
      undefined,
    ];
    for (const error of others) expect(errorMessage(error, t)).toBe('<errors.generic>');
  });

  it.each<Lang>(['fr', 'en', 'ar'])('reads the transport messages from the %s dictionary', (lang) => {
    const dictionary = { fr, en, ar }[lang];
    const translateIn = (key: TranslationKey) => translate(lang, key);
    expect(errorMessage(new ApiError(0, 'timeout', 'timeout'), translateIn)).toBe(dictionary.errors.timeout);
    expect(errorMessage(new Error('boom'), translateIn)).toBe(dictionary.errors.generic);
  });
});
