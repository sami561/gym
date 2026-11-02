import { useCallback, useEffect, useState } from 'react';
import { toDateOnly } from '@/lib/format';
import { storage } from '@/lib/storage';

/**
 * Exercises ticked during today's session for one program day.
 * Kept on the device only (keyed by date), so tomorrow starts fresh.
 */
export function useDoneExercises(programId: string, dayIndex: number) {
  const key = `meliora.done.${programId}.${dayIndex}.${toDateOnly(new Date())}`;
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    storage.getJSON<number[]>(key).then((saved) => {
      if (!cancelled) setDone(Array.isArray(saved) ? saved : []);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const persist = useCallback(
    (next: number[]) => {
      setDone(next);
      storage.setJSON(key, next).catch(() => undefined);
    },
    [key],
  );

  const toggle = useCallback(
    (index: number) => persist(done.includes(index) ? done.filter((i) => i !== index) : [...done, index]),
    [done, persist],
  );

  const reset = useCallback(() => persist([]), [persist]);

  return { done, toggle, reset };
}
