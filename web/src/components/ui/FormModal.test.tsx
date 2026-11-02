// @vitest-environment jsdom
import { useState, type ComponentProps } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { Lang } from '../../i18n';
import { PROMO_TYPE_LABELS } from '../../lib/labels-ops';
import { renderInLang } from '../../test/render';
import { enumOptions, FormModal, fromFormValues, toLocalInput, type FieldDef, type SubmitValues } from './FormModal';

describe('fromFormValues (editor strings → API payload)', () => {
  const fields: FieldDef[] = [
    { name: 'name', label: 'Nom' },
    { name: 'price', label: 'Prix', type: 'number' },
    { name: 'startsAt', label: 'Début', type: 'datetime' },
    { name: 'validUntil', label: 'Valable jusqu’au', type: 'date' },
    { name: 'features', label: 'Avantages (un par ligne)', type: 'list' },
    { name: 'isActive', label: 'Actif', type: 'checkbox' },
    { name: 'coachId', label: 'Coach', type: 'select' },
  ];
  const only = (name: string) => fields.filter((field) => field.name === name);

  it('trims text and sends null for every empty field', () => {
    expect(
      fromFormValues(fields, { name: '  Cross training  ', price: '', startsAt: '', validUntil: '', features: '', isActive: false, coachId: '' }),
    ).toEqual({ name: 'Cross training', price: null, startsAt: null, validUntil: null, features: [], isActive: false, coachId: null });
  });

  it('reads numbers typed with a decimal comma and keeps zero', () => {
    const price = (typed: string) => fromFormValues(only('price'), { price: typed }).price;
    expect(price('12,5')).toBe(12.5);
    expect(price(' 45.250 ')).toBe(45.25);
    expect(price('0')).toBe(0);
  });

  it('sends a date-time typed on the Tunis clock as a UTC instant', () => {
    expect(fromFormValues(only('startsAt'), { startsAt: '2026-03-10T18:30' }).startsAt).toBe('2026-03-10T17:30:00.000Z');
  });

  it('keeps calendar dates as YYYY-MM-DD', () => {
    expect(fromFormValues(only('validUntil'), { validUntil: '2026-12-31' }).validUntil).toBe('2026-12-31');
  });

  it('splits lists on new lines and commas, dropping blanks', () => {
    expect(fromFormValues(only('features'), { features: 'Vestiaires\nDouches, Parking\n\n , ' }).features).toEqual([
      'Vestiaires',
      'Douches',
      'Parking',
    ]);
  });

  it('sends checkboxes as booleans, unchecked when missing', () => {
    expect(fromFormValues(only('isActive'), { isActive: true }).isActive).toBe(true);
    expect(fromFormValues(only('isActive'), {}).isActive).toBe(false);
  });

  it('leaves hidden fields out of the payload', () => {
    const conditional: FieldDef[] = [
      { name: 'type', label: 'Type de remise', type: 'select' },
      { name: 'maxUses', label: 'Utilisations max.', type: 'number', hidden: (values) => values.type !== 'PERCENT' },
    ];
    expect(fromFormValues(conditional, { type: 'FIXED', maxUses: '3' })).toEqual({ type: 'FIXED' });
    expect(fromFormValues(conditional, { type: 'PERCENT', maxUses: '3' })).toEqual({ type: 'PERCENT', maxUses: 3 });
  });
});

describe('toLocalInput', () => {
  it('shows an instant on the Tunis clock, as <input type="datetime-local"> expects', () => {
    expect(toLocalInput('2026-03-10T17:30:00.000Z')).toBe('2026-03-10T18:30');
    expect(toLocalInput('2026-03-10T23:05:00.000Z')).toBe('2026-03-11T00:05');
  });

  it('round-trips with fromFormValues to the same instant', () => {
    const iso = '2026-07-01T05:45:00.000Z';
    expect(fromFormValues([{ name: 'at', label: 'Début', type: 'datetime' }], { at: toLocalInput(iso) }).at).toBe(iso);
  });
});

describe('enumOptions', () => {
  it('lists the values in declaration order with their label keys', () => {
    expect(enumOptions(PROMO_TYPE_LABELS)).toEqual([
      { value: 'PERCENT', label: 'Pourcentage' },
      { value: 'FIXED', label: 'Montant fixe' },
    ]);
  });
});

describe('FormModal', () => {
  // The promo code form of PromosPage, with a list and a field shown for percentages only.
  const FIELDS: FieldDef[] = [
    { name: 'code', label: 'Code', required: true },
    { name: 'type', label: 'Type de remise', type: 'select', required: true, options: enumOptions(PROMO_TYPE_LABELS) },
    { name: 'value', label: 'Valeur', type: 'number', required: true },
    { name: 'maxUses', label: 'Utilisations max.', type: 'number', hidden: (values) => values.type !== 'PERCENT' },
    { name: 'validUntil', label: 'Valable jusqu’au', type: 'date' },
    { name: 'features', label: 'Avantages (un par ligne)', type: 'list' },
    { name: 'isActive', label: 'Actif', type: 'checkbox' },
  ];
  const PROMO = { code: 'RENTREE26', type: 'PERCENT', value: 20, maxUses: null, validUntil: '2026-09-30T00:00:00.000Z', features: ['Vestiaires', 'Douches'], isActive: true };

  type Props = ComponentProps<typeof FormModal>;

  function renderForm(props: Partial<Props> = {}, lang: Lang = 'fr') {
    const onSubmit = vi.fn<Props['onSubmit']>().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderInLang(
      <FormModal open onClose={onClose} title="Code promo" submitLabel="Enregistrer" fields={FIELDS} onSubmit={onSubmit} {...props} />,
      lang,
    );
    return { onSubmit, onClose };
  }

  const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
  const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

  it('fills the fields from the record being edited', () => {
    renderForm({ initial: PROMO });
    expect(input('Code *').value).toBe('RENTREE26');
    expect(select('Type de remise *').value).toBe('PERCENT');
    expect(input('Valeur *').value).toBe('20');
    expect(input('Utilisations max.').value).toBe('');
    expect(input('Valable jusqu’au').value).toBe('2026-09-30');
    expect(input('Avantages (un par ligne)').value).toBe('Vestiaires\nDouches');
    expect(input('Actif').checked).toBe(true);
  });

  it('translates labels and options, and stars the required fields', () => {
    renderForm({}, 'en');
    expect(screen.getByLabelText('Code *')).toBeTruthy();
    expect(screen.getByLabelText('Valid until')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Choose…' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Percentage' })).toBeTruthy();
  });

  it('shows a conditional field only when it applies, and never sends it hidden', async () => {
    const { onSubmit } = renderForm({ initial: { ...PROMO, type: 'FIXED', value: 10 } });
    expect(screen.queryByLabelText('Utilisations max.')).toBeNull();

    fireEvent.change(select('Type de remise *'), { target: { value: 'PERCENT' } });
    fireEvent.change(input('Utilisations max.'), { target: { value: '100' } });
    fireEvent.change(select('Type de remise *'), { target: { value: 'FIXED' } });
    save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('maxUses');
  });

  it('sends the converted values, then closes', async () => {
    const { onSubmit, onClose } = renderForm();
    fireEvent.change(input('Code *'), { target: { value: '  ETE26 ' } });
    fireEvent.change(select('Type de remise *'), { target: { value: 'PERCENT' } });
    fireEvent.change(input('Valeur *'), { target: { value: '12.5' } });
    fireEvent.change(input('Utilisations max.'), { target: { value: '100' } });
    fireEvent.change(input('Avantages (un par ligne)'), { target: { value: 'Vestiaires\nDouches' } });
    fireEvent.click(input('Actif'));
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith<[SubmitValues]>({
      code: 'ETE26',
      type: 'PERCENT',
      value: 12.5,
      maxUses: 100,
      validUntil: null,
      features: ['Vestiaires', 'Douches'],
      isActive: true,
    });
  });

  it('does not submit while a required field is empty', async () => {
    const { onSubmit } = renderForm();
    save();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input('Code *').validity.valueMissing).toBe(true);
  });

  it('keeps the dialog open with the API message when saving fails', async () => {
    const onSubmit = vi.fn<Props['onSubmit']>().mockRejectedValue(new ApiError(409, ['Ce code existe déjà.']));
    const { onClose } = renderForm({ initial: PROMO, onSubmit });
    save();

    expect((await screen.findByRole('alert')).textContent).toBe('Ce code existe déjà.');
    expect(onClose).not.toHaveBeenCalled();
    expect(input('Code *').value).toBe('RENTREE26');
  });

  it('disables the save button while saving', async () => {
    let finish!: () => void;
    const onSubmit = vi.fn<Props['onSubmit']>(() => new Promise<void>((resolve) => (finish = resolve)));
    const { onClose } = renderForm({ initial: PROMO, onSubmit });
    save();

    const button = screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('discards unsaved edits when the dialog opens again', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            reopen
          </button>
          <FormModal open={open} onClose={() => setOpen(false)} title="Code promo" submitLabel="Enregistrer" fields={FIELDS} initial={PROMO} onSubmit={vi.fn()} />
        </>
      );
    }
    renderInLang(<Harness />);
    fireEvent.change(input('Code *'), { target: { value: 'BROUILLON' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'reopen' }));
    expect(input('Code *').value).toBe('RENTREE26');
  });
});
