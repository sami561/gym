import { useMemo } from 'react';
import { Bell, CalendarCheck, DoorOpen, QrCode } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

/** Illustrative access code: same 21×21 module layout as a QR code, deterministic pattern. */
function QrIllustration() {
  const { t } = useI18n();
  const cells = useMemo(() => {
    const size = 21;
    const out: { x: number; y: number }[] = [];
    let seed = 7;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const finder = (x: number, y: number) =>
      [
        [0, 0],
        [size - 7, 0],
        [0, size - 7],
      ].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (finder(x, y)) continue;
        if (rand() > 0.52) out.push({ x, y });
      }
    }
    return out;
  }, []);

  const Finder = ({ x, y }: { x: number; y: number }) => (
    <g>
      <rect x={x} y={y} width="7" height="7" fill="#000" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#000" />
    </g>
  );

  return (
    <svg viewBox="-1 -1 23 23" className="size-full" role="img" aria-label={t('app.qrAlt')}>
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill="#000" />
      ))}
      <Finder x={0} y={0} />
      <Finder x={14} y={0} />
      <Finder x={0} y={14} />
    </svg>
  );
}

function PhoneMock() {
  const { t } = useI18n();
  return (
    <div className="relative mx-auto w-[280px] rounded-[42px] bg-steel-800 p-3 shadow-[0_40px_120px_rgba(0,0,0,0.6)] ring-1 ring-white/15 sm:w-[300px]">
      <div className="overflow-hidden rounded-[32px] bg-black px-5 pt-10 pb-7">
        <div className="flex items-center justify-between">
          <span className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-white">
            <img src="/images/logo.jpg" alt="" className="size-full object-contain" />
          </span>
          <span className="rounded-full bg-[#0ca30c]/15 px-2.5 py-1 text-[11px] font-semibold text-[#3ccf3c]">{t('app.mockDays')}</span>
        </div>
        <p className="type-wide mt-6 text-lg text-white">Yasmine B.</p>
        <p className="text-xs text-steel-400">{t('app.mockPlan')}</p>
        <div className="mt-5 rounded-2xl bg-white p-3">
          <QrIllustration />
        </div>
        <p className="mt-2 text-center text-[11px] text-steel-400">{t('app.validFor')}</p>
        <div className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-semibold text-white">
          <DoorOpen className="size-4" aria-hidden />
          {t('app.door')}
        </div>
      </div>
    </div>
  );
}

export function AppSection() {
  const { t } = useI18n();
  const features = [
    { icon: QrCode, title: t('app.qr'), text: t('app.qrText') },
    { icon: DoorOpen, title: t('app.door'), text: t('app.doorText') },
    { icon: CalendarCheck, title: t('app.book'), text: t('app.bookText') },
    { icon: Bell, title: t('app.renew'), text: t('app.renewText') },
  ];
  const appStore = import.meta.env.VITE_APP_STORE_URL;
  const playStore = import.meta.env.VITE_PLAY_STORE_URL;

  return (
    <section id="app" className="overflow-hidden bg-steel-950 py-24 text-white sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h2 className="type-display text-5xl sm:text-6xl">{t('app.title')}</h2>
          <p className="mt-6 max-w-xl text-lg text-steel-300">{t('app.lead')}</p>
          <dl className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <dt className="flex items-center gap-3 font-semibold">
                  <Icon className="size-5 text-led" aria-hidden />
                  {title}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-steel-300">{text}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-12 flex flex-wrap items-center gap-3">
            {appStore || playStore ? (
              <>
                {appStore && (
                  <a href={appStore} className="inline-flex h-12 items-center rounded-lg bg-white px-5 font-semibold text-black hover:bg-steel-100">
                    {t('app.store')}
                  </a>
                )}
                {playStore && (
                  <a href={playStore} className="inline-flex h-12 items-center rounded-lg bg-white px-5 font-semibold text-black hover:bg-steel-100">
                    {t('app.play')}
                  </a>
                )}
              </>
            ) : (
              <p className="rounded-lg px-4 py-3 text-sm text-steel-300 ring-1 ring-white/15">{t('app.soon')}</p>
            )}
          </div>
        </div>
        <PhoneMock />
      </div>
    </section>
  );
}
