import { fillDeep, fillTemplate } from './templating';

describe('placeholders', () => {
  const context = { firstName: 'Amira', lastName: 'Ben Salah', daysLeft: 3, member: { code: 'MEL-00012' }, empty: null };

  it('fills flat and dotted placeholders, tolerating spaces', () => {
    expect(fillTemplate('Onboarding — {{firstName}} {{ lastName }}', context)).toBe('Onboarding — Amira Ben Salah');
    expect(fillTemplate('Code {{member.code}}, J-{{daysLeft}}', context)).toBe('Code MEL-00012, J-3');
  });

  it('turns unknown or empty values into empty strings', () => {
    expect(fillTemplate('[{{nope}}][{{empty}}][{{member.nope.deeper}}]', context)).toBe('[][][]');
  });

  it('encodes inserted values for URLs only', () => {
    expect(fillTemplate('https://n8n.local/hook?name={{lastName}}', context, encodeURIComponent)).toBe(
      'https://n8n.local/hook?name=Ben%20Salah',
    );
  });

  it('fills strings deep inside objects and arrays without touching other values', () => {
    expect(fillDeep({ to: '{{firstName}}', tags: ['{{member.code}}', 4], nested: { ok: true } }, context)).toEqual({
      to: 'Amira',
      tags: ['MEL-00012', 4],
      nested: { ok: true },
    });
  });
});
