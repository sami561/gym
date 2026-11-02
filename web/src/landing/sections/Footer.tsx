import { Link } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';
import { useGym } from '../useLandingData';

export function Footer() {
  const { t } = useI18n();
  const { gym } = useGym();
  return (
    <footer className="bg-black text-steel-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
            <img src="/images/logo.jpg" alt="Meliora Gym" className="size-full object-contain" />
          </span>
          <p className="text-sm leading-relaxed">
            <span className="type-wide block text-base text-white">{gym.name}</span>
            {gym.address}
            <br />
            {gym.city}
          </p>
        </div>
        <nav aria-label={t('a11y.footerNav')} className="flex flex-col gap-2 text-sm">
          <a href="#offres" className="hover:text-white">{t('nav.plans')}</a>
          <a href="#planning" className="hover:text-white">{t('nav.schedule')}</a>
          <a href="#essai" className="hover:text-white">{t('nav.trial')}</a>
          <a href="#app" className="hover:text-white">{t('nav.app')}</a>
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <a href={gym.instagram} target="_blank" rel="noreferrer" className="hover:text-white">Instagram</a>
          <a href={gym.mapsUrl} target="_blank" rel="noreferrer" className="hover:text-white">Google Maps</a>
          <Link to="/admin" className="hover:text-white">{t('footer.staff')}</Link>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-5 py-6 text-xs text-steel-500 sm:px-8">
          © {new Date().getFullYear()} {gym.name}, Sousse. {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}
