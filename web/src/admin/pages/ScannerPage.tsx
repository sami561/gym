import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { CameraOff, CircleCheck, CircleX, Expand, Keyboard } from 'lucide-react';
import { accessApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { AccessDecision } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState, PageHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Field';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../i18n';
import { MemberAvatar } from '../photos/MemberAvatar';

const DOOR_KEY = 'meliora.scanner.door';
const READER_ID = 'meliora-qr-reader';

function readDoor(): string {
  try {
    return localStorage.getItem(DOOR_KEY) ?? '';
  } catch {
    return '';
  }
}

type Result = { decision: AccessDecision } | { error: string };

export function ScannerPage() {
  const { t } = useI18n();
  const doors = useQuery({ queryKey: ['doors'], queryFn: accessApi.doors });
  const [doorId, setDoorId] = useState(readDoor);
  const [result, setResult] = useState<Result | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const busy = useRef(false);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!doorId && doors.data?.length) setDoorId(doors.data[0].id);
  }, [doors.data, doorId]);

  useEffect(() => {
    try {
      if (doorId) localStorage.setItem(DOOR_KEY, doorId);
    } catch {
      /* kiosk without storage */
    }
  }, [doorId]);

  const submit = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || !doorId || busy.current) return;
      const now = Date.now();
      if (lastCode.current && lastCode.current.code === trimmed && now - lastCode.current.at < 4000) return;
      lastCode.current = { code: trimmed, at: now };
      busy.current = true;
      try {
        const decision = await accessApi.scan(trimmed, doorId);
        setResult({ decision });
        if ('vibrate' in navigator) navigator.vibrate(decision.granted ? 80 : [60, 60, 60]);
      } catch (err) {
        setResult({ error: errorMessage(err) });
      } finally {
        busy.current = false;
        window.clearTimeout(resetTimer.current);
        resetTimer.current = window.setTimeout(() => setResult(null), 4500);
      }
    },
    [doorId],
  );

  // Camera scanner (html5-qrcode is loaded only on this page).
  useEffect(() => {
    if (!doorId) return;
    let cancelled = false;
    let scanner: import('html5-qrcode').Html5Qrcode | null = null;
    let started = false;
    (async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;
      scanner = new Html5Qrcode(READER_ID, { verbose: false });
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
          (text) => void submit(text),
          () => undefined,
        );
        started = true;
        if (cancelled) await scanner.stop();
        setCameraError(null);
      } catch (err) {
        if (!cancelled) setCameraError((err as Error)?.message ?? String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (scanner && started) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => undefined);
      }
    };
  }, [doorId, submit]);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const onManual = (e: FormEvent) => {
    e.preventDefault();
    void submit(manual);
    setManual('');
  };

  const decision = result && 'decision' in result ? result.decision : null;
  const granted = decision?.granted ?? false;

  return (
    <div>
      <PageHeader
        title={t('Scanner QR')}
        description={t('Posez la tablette à l’entrée : le membre présente le QR code de son application, la porte s’ouvre si l’abonnement est valide.')}
        actions={
          <Button variant="secondary" icon={<Expand className="size-4" />} onClick={() => void document.documentElement.requestFullscreen?.()}>
            {t('Plein écran')}
          </Button>
        }
      />
      {doors.data?.length === 0 ? (
        <Card>
          <EmptyState title={t('Aucune porte configurée')} description={t('Ajoutez une porte dans « Portes et accès » avant d’utiliser le scanner.')} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card className="relative overflow-hidden">
            <div id={READER_ID} className="aspect-square w-full bg-black [&_video]:size-full [&_video]:object-cover" />
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card p-6 text-center">
                <CameraOff className="size-10 text-muted" aria-hidden />
                <p className="font-semibold text-fg">{t('Caméra indisponible')}</p>
                <p className="max-w-sm text-sm text-fg-2">{t('Autorisez l’accès à la caméra dans le navigateur, ou utilisez un lecteur QR USB avec le champ ci-contre.')}</p>
              </div>
            )}
            <AnimatePresence>
              {result && (
                <motion.div
                  key={decision?.logId ?? decision?.at ?? 'error'}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white sm:gap-4 sm:p-8 ${granted ? 'bg-[#0a7a0a]' : 'bg-[#b3261e]'}`}
                  role="status"
                  aria-live="assertive"
                >
                  {decision?.member ? (
                    // The member's photo, large: the desk compares it with the face of the person scanning.
                    <span className="relative mb-1 sm:mb-2">
                      <MemberAvatar memberId={decision.member.id} name={decision.member.fullName} photoUpdatedAt={undefined} size="xl" tone="verdict" decorative />
                      <span className={`absolute -end-3 -bottom-3 rounded-full bg-white p-0.5 ${granted ? 'text-[#0a7a0a]' : 'text-[#b3261e]'}`} aria-hidden>
                        {granted ? <CircleCheck className="size-9 sm:size-11" /> : <CircleX className="size-9 sm:size-11" />}
                      </span>
                    </span>
                  ) : granted ? (
                    <CircleCheck className="size-24" aria-hidden />
                  ) : (
                    <CircleX className="size-24" aria-hidden />
                  )}
                  <p className={`type-display ${decision?.member ? 'text-4xl sm:text-5xl' : 'text-5xl'}`}>{granted ? t('Bienvenue') : t('Accès refusé')}</p>
                  {decision?.member && <p className="text-2xl font-semibold">{decision.member.fullName}</p>}
                  {granted && decision?.member?.validUntil && <p className="text-white/85">{t('Abonnement valable jusqu’au {date}', { date: formatDate(decision.member.validUntil) })}</p>}
                  {!granted && <p className="max-w-md text-lg text-white/90">{decision?.reason ?? (result && 'error' in result ? result.error : '')}</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="p-5">
              <Select label={t('Porte à ouvrir')} value={doorId} onChange={(e) => setDoorId(e.target.value)}>
                {doors.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Card>
            <Card className="p-5">
              <p className="flex items-center gap-2 font-semibold text-fg">
                <Keyboard className="size-4" aria-hidden />
                {t('Lecteur USB ou saisie manuelle')}
              </p>
              <form onSubmit={onManual} className="mt-3 flex gap-2">
 <Input aria-label={t('Code d’accès')} placeholder="MLR1.MEL-00042…" value={manual} onChange={(e) => setManual(e.target.value)} autoFocus />
                <Button type="submit" disabled={!manual.trim()}>
                  {t('Vérifier')}
                </Button>
              </form>
              <p className="mt-2 text-xs text-muted">{t('Un lecteur USB tape le code puis « Entrée » : laissez ce champ sélectionné.')}</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
