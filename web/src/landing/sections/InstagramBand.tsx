import { useI18n } from '../../lib/i18n';
import { useGym } from '../useLandingData';
import { FacebookGlyph } from './FacebookGlyph';
import { InstagramGlyph } from './InstagramGlyph';

export function InstagramBand() {
  const { t } = useI18n();
  const { gym } = useGym();
  return (
    <section className="relative overflow-hidden bg-brand-500 text-white">
      <div className="bg-hex absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center">
        <div>
          <h2 className="type-display text-4xl sm:text-5xl">{t('insta.title')}</h2>
          <p className="mt-3 max-w-xl text-white/85">{t('insta.lead')}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 md:items-center">
          <a
            href={gym.instagram}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center gap-2.5 rounded-lg bg-black px-6 font-semibold text-white transition-[background-color,transform] hover:bg-steel-900 active:scale-[0.98]"
          >
            <InstagramGlyph className="size-5" />
            {t('insta.cta')}
          </a>
          <a
            href={gym.facebook}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-6 items-center gap-2 text-sm font-semibold text-white underline-offset-4 hover:underline"
          >
            <FacebookGlyph className="size-4" />
            {t('insta.facebook')}
          </a>
        </div>
      </div>
    </section>
  );
}
