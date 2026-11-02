import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useI18n } from '../../lib/i18n';

const HexCeiling = lazy(() => import('../three/HexCeiling'));

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Shown before the 3D scene loads, and instead of it (reduced motion, no WebGL, GPU error). */
function StaticCeiling() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <img src="/images/interior.jpg" alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-2xl" />
      <div className="bg-hex absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
      <div className="absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_50%_0%,rgba(233,242,255,0.18),transparent_65%)]" />
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <StaticCeiling /> : this.props.children;
  }
}

function CeilingBackdrop() {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [webgl] = useState(supportsWebGL);

  // Stop rendering frames once the hero has scrolled away.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const use3d = webgl && !reduceMotion;
  return (
    <div ref={ref} className="absolute inset-0">
      <StaticCeiling />
      {use3d && (
        <SceneBoundary>
          <Suspense fallback={null}>
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
              <HexCeiling active={visible} />
            </motion.div>
          </Suspense>
        </SceneBoundary>
      )}
    </div>
  );
}

const line = {
  hidden: { y: '105%' },
  show: (i: number) => ({ y: '0%', transition: { delay: 0.35 + i * 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] as const } }),
};

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (delay: number) => ({ opacity: 1, y: 0, transition: { delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } }),
};

export function Hero() {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? 'show' : 'hidden';

  return (
    <section id="top" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-shield text-white">
      <CeilingBackdrop />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-black/85 via-black/45 to-transparent" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-5 pt-28 pb-14 sm:px-8 sm:pb-20">
        <motion.div initial={initial} animate="show" variants={fade} custom={0.15} className="mb-8 flex items-center gap-4">
          <span className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_0_60px_rgba(233,242,255,0.18)] sm:size-20">
            <img src="/images/logo.jpg" alt="Meliora Gym" className="size-full object-contain" />
          </span>
          <span className="text-sm text-steel-200 [text-shadow:0_1px_12px_rgb(0_0_0/0.95)] sm:text-base">{t('hero.place')}</span>
        </motion.div>

        <h1 className="type-display text-[clamp(3.1rem,10.5vw,9rem)] text-balance">
          <span className="block overflow-hidden pb-[0.06em]">
            <motion.span className="block" initial={initial} animate="show" variants={line} custom={0}>
              {t('hero.title1')}
            </motion.span>
          </span>
          <span className="block overflow-hidden pb-[0.06em]">
            <motion.span className="block" initial={initial} animate="show" variants={line} custom={1}>
              {t('hero.title2')}
            </motion.span>
          </span>
        </h1>
        <motion.span
          className="mt-5 block h-1.5 w-28 origin-left bg-brand-500 sm:w-40 rtl:origin-right"
          initial={reduceMotion ? { scaleX: 1 } : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.9, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden
        />

        <motion.p initial={initial} animate="show" variants={fade} custom={1.0} className="mt-7 max-w-xl text-base leading-relaxed text-steel-200 [text-shadow:0_1px_12px_rgb(0_0_0/0.9)] sm:text-lg">
          {t('hero.lead')}
        </motion.p>

        <motion.div initial={initial} animate="show" variants={fade} custom={1.15} className="mt-9 flex flex-wrap gap-3">
          <a
            href="#essai"
            className="inline-flex h-12 items-center rounded-lg bg-brand-500 px-6 font-semibold text-white transition-[background-color,transform] hover:bg-brand-600 active:scale-[0.98]"
          >
            {t('hero.ctaJoin')}
          </a>
          <a
            href="#offres"
            className="inline-flex h-12 items-center rounded-lg px-6 font-semibold text-white ring-1 ring-white/35 transition-[background-color,transform] hover:bg-white/10 active:scale-[0.98]"
          >
            {t('hero.ctaPlans')}
          </a>
        </motion.div>
      </div>
    </section>
  );
}
