import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck } from 'lucide-react';

type ToastTone = 'success' | 'error';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++;
    setItems((prev) => [...prev.slice(-3), { id, tone, message }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const api = useCallback(
    () => ({ success: (m: string) => push('success', m), error: (m: string) => push('error', m) }),
    [push],
  );
  const [value] = useState<ToastApi>(api);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed start-4 end-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:start-auto" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg bg-card px-4 py-3 text-sm text-fg shadow-xl ring-1 ring-line"
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              {t.tone === 'success' ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
              )}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
