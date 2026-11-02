import { useI18n } from '../../lib/i18n';

export function About() {
  const { t } = useI18n();
  return (
    <section id="salle" className="bg-shield py-24 text-white sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <figure className="relative">
          <img
            src="/images/shield-sign.jpg"
            alt={t('about.imageAlt')}
            loading="lazy"
            className="aspect-[4/5] w-full rounded-2xl object-cover object-[50%_40%]"
          />
          <figcaption className="mt-3 text-sm text-steel-400">{t('about.caption')}</figcaption>
        </figure>
        <div>
          <h2 className="type-display text-5xl sm:text-6xl">{t('about.title')}</h2>
          <p className="mt-8 max-w-[62ch] text-lg leading-relaxed text-steel-200">{t('about.p1')}</p>
          <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-steel-300">{t('about.p2')}</p>
          <dl className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-3">
            {(['about.stat1', 'about.stat2', 'about.stat3'] as const).map((key, i) => (
              <div key={key} className="bg-shield p-5">
                <dt className="sr-only">{t(key)}</dt>
                <dd className="flex items-start gap-3 text-sm text-steel-200">
                  <span className={i === 0 ? 'mt-1.5 size-2 shrink-0 rounded-full bg-brand-500' : 'mt-1.5 size-2 shrink-0 rounded-full bg-led'} aria-hidden />
                  {t(key)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
