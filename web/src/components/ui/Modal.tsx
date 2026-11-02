import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';
import { useI18n } from '../../i18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first field, else the panel itself.
    requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]):not([disabled]), select, textarea, [data-autofocus]',
      );
      (target ?? panelRef.current)?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            className={clsx(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-card text-fg ring-1 ring-line sm:rounded-2xl',
              widths[size],
            )}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-fg-2">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('Fermer')}
                className="-me-1 rounded-lg p-1.5 text-fg-2 hover:bg-card-2 hover:text-fg"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- confirm dialog ----------
interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const { t } = useI18n();
  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {t('Annuler')}
            </Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {state?.confirmLabel ?? t('Confirmer')}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-fg-2">{state.message}</div>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
