import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import { useI18n } from '../../i18n';

export const controlClass =
  'w-full rounded-lg bg-page px-3 text-sm text-fg ring-1 ring-line placeholder:text-muted ' +
  'transition-shadow focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60';

/** Control classes where a width passed by the caller (w-44…) replaces the default full width. */
function sized(base: string, className?: string): string {
  return /(^|\s)(w-|max-w-|min-w-)/.test(className ?? '') ? base.replace('w-full ', '') : base;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapperClassName?: string };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, wrapperClassName, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const control = (
    <input ref={ref} id={inputId} className={clsx(sized(controlClass, className), 'h-10', className)} aria-invalid={Boolean(error)} {...rest} />
  );
  if (!label) return control;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={wrapperClassName}>
      {control}
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; wrapperClassName?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, className, wrapperClassName, id, children, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const control = (
    <select ref={ref} id={selectId} className={clsx(sized(controlClass, className), 'h-10 pe-8', className)} {...rest}>
      {children}
    </select>
  );
  if (!label) return control;
  return (
    <Field label={label} hint={hint} htmlFor={selectId} className={wrapperClassName}>
      {control}
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; wrapperClassName?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, className, wrapperClassName, id, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const control = (
    <textarea ref={ref} id={areaId} rows={rows} className={clsx(controlClass, 'py-2', className)} {...rest} />
  );
  if (!label) return control;
  return (
    <Field label={label} hint={hint} htmlFor={areaId} className={wrapperClassName}>
      {control}
    </Field>
  );
});

export function Checkbox({
  label,
  checked,
  onChange,
  description,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg py-1 text-sm text-fg">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-brand-500"
      />
      <span>
        <span className="font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  placeholder = placeholder ?? t('Rechercher…');
  return (
    <div className={clsx('relative', className)}>
      <svg className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={clsx(controlClass, 'h-10 ps-9')}
      />
    </div>
  );
}
