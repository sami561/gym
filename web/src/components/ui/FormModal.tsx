import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { errorMessage } from '../../api/client';
import { Button } from './Button';
import { Checkbox, controlClass, Field } from './Field';
import { Modal } from './Modal';
import { ErrorNote } from './Card';
import { useI18n, type TKey } from '../../i18n';

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'password'
  | 'number'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'list';

export interface FieldDef {
  name: string;
  label: TKey;
  type?: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Example value: shown as-is (data, not copy). */
  placeholder?: string;
  hint?: TKey;
  min?: number;
  max?: number;
  step?: number | 'any';
  /** Takes the full row on the 2-column grid. */
  wide?: boolean;
  hidden?: (values: FormValues) => boolean;
}

/** Raw editor state: strings for inputs, booleans for checkboxes. */
export type FormValues = Record<string, string | boolean>;
export type SubmitValues = Record<string, unknown>;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** ISO → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toFormValues(fields: FieldDef[], initial: SubmitValues): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const raw = initial[field.name];
    if (field.type === 'checkbox') values[field.name] = Boolean(raw);
    else if (field.type === 'list') values[field.name] = Array.isArray(raw) ? raw.join('\n') : '';
    else if (field.type === 'datetime') values[field.name] = typeof raw === 'string' && raw ? toLocalInput(raw) : '';
    else if (field.type === 'date') values[field.name] = typeof raw === 'string' ? raw.slice(0, 10) : '';
    else values[field.name] = raw === null || raw === undefined ? '' : String(raw);
  }
  return values;
}

/** Converts editor strings back to API values: '' → null, numbers, ISO dates, lists. */
export function fromFormValues(fields: FieldDef[], values: FormValues): SubmitValues {
  const out: SubmitValues = {};
  for (const field of fields) {
    if (field.hidden?.(values)) continue;
    const raw = values[field.name];
    if (field.type === 'checkbox') {
      out[field.name] = Boolean(raw);
      continue;
    }
    const text = String(raw ?? '').trim();
    if (field.type === 'list') {
      out[field.name] = text
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (field.type === 'number') {
      out[field.name] = text === '' ? null : Number(text.replace(',', '.'));
    } else if (field.type === 'datetime') {
      out[field.name] = text === '' ? null : new Date(text).toISOString();
    } else {
      out[field.name] = text === '' ? null : text;
    }
  }
  return out;
}

export function FormFields({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: FormValues;
  onChange: (name: string, value: string | boolean) => void;
}) {
  const baseId = useId();
  const { t } = useI18n();
  // Option labels are either i18n keys (enum labels) or data (names): unknown text falls back to itself.
  const tx = (text: string) => t(text as TKey);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        if (field.hidden?.(values)) return null;
        const id = `${baseId}-${field.name}`;
        const value = values[field.name];
        const wide = field.wide || field.type === 'textarea' || field.type === 'list' || field.type === 'checkbox';
        const label = (
          <>
            {t(field.label)}
            {field.required && <span className="text-brand-400"> *</span>}
          </>
        );

        if (field.type === 'checkbox') {
          return (
            <div key={field.name} className="sm:col-span-2">
              <Checkbox
                label={t(field.label)}
                description={field.hint ? t(field.hint) : undefined}
                checked={Boolean(value)}
                onChange={(checked) => onChange(field.name, checked)}
              />
            </div>
          );
        }

        let control: ReactNode;
        if (field.type === 'select') {
          control = (
            <select
              id={id}
              required={field.required}
              value={String(value ?? '')}
              onChange={(e) => onChange(field.name, e.target.value)}
              className={clsx(controlClass, 'h-10')}
            >
              {!field.required && <option value="">—</option>}
              {field.required && !value && <option value="">{t('Choisir…')}</option>}
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {tx(option.label)}
                </option>
              ))}
            </select>
          );
        } else if (field.type === 'textarea' || field.type === 'list') {
          control = (
            <textarea
              id={id}
              rows={field.type === 'list' ? 4 : 3}
              required={field.required}
              placeholder={field.placeholder}
              value={String(value ?? '')}
              onChange={(e) => onChange(field.name, e.target.value)}
              className={clsx(controlClass, 'py-2')}
            />
          );
        } else {
          const inputType =
            field.type === 'datetime' ? 'datetime-local' : field.type === 'number' ? 'number' : field.type ?? 'text';
          control = (
            <input
              id={id}
              type={inputType}
              required={field.required}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              step={field.step ?? (field.type === 'number' ? 'any' : undefined)}
              value={String(value ?? '')}
              onChange={(e) => onChange(field.name, e.target.value)}
              className={clsx(controlClass, 'h-10')}
              inputMode={field.type === 'number' ? 'decimal' : undefined}
            />
          );
        }

        return (
          <Field key={field.name} label={label} hint={field.hint ? t(field.hint) : undefined} htmlFor={id} className={wide ? 'sm:col-span-2' : undefined}>
            {control}
          </Field>
        );
      })}
    </div>
  );
}

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  fields: FieldDef[];
  initial?: SubmitValues;
  submitLabel: string;
  onSubmit: (values: SubmitValues) => Promise<unknown>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children?: ReactNode;
}

/** Config-driven create/edit dialog used by every back-office CRUD screen. */
export function FormModal({
  open,
  onClose,
  title,
  description,
  fields,
  initial,
  submitLabel,
  onSubmit,
  size = 'lg',
  children,
}: FormModalProps) {
  const [values, setValues] = useState<FormValues>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const { t } = useI18n();

  useEffect(() => {
    if (open) {
      setValues(toFormValues(fields, initial ?? {}));
      setError(null);
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(fromFormValues(fields, values));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <FormFields fields={fields} values={values} onChange={(name, value) => setValues((prev) => ({ ...prev, [name]: value }))} />
        {children}
        {error && <ErrorNote message={error} />}
      </form>
    </Modal>
  );
}

export function enumOptions<K extends string>(labels: Record<K, string>): { value: K; label: string }[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}
