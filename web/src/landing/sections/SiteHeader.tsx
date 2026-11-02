import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { LanguageSwitcher, useI18n, type TranslationKey } from '../../lib/i18n';

const LINKS: { href: string; key: TranslationKey }[] = [
  { href: '#salle', key: 'nav.about' },
  { href: '#offres', key: 'nav.plans' },
  { href: '#planning', key: 'nav.schedule' },
  { href: '#app', key: 'nav.app' },
  { href: '#acces', key: 'nav.contact' },
];

export function SiteHeader() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-300',
        scrolled || open ? 'border-b border-white/10 bg-black/90 backdrop-blur' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:h-[72px] sm:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label={t('a11y.home')}>
          <span className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-white sm:size-11">
            <img src="/images/logo.jpg" alt="" className="size-full object-contain" />
          </span>
          <span className="type-wide hidden text-lg text-white sm:block">Meliora Gym</span>
        </a>

        <nav className="ms-auto hidden items-center gap-7 lg:flex" aria-label={t('a11y.mainNav')}>
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-steel-200 transition-colors hover:text-white">
              {t(link.key)}
            </a>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-3 lg:ms-0">
          <LanguageSwitcher tone="dark" />
          <a
            href="#essai"
            className="hidden h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 sm:inline-flex"
          >
            {t('nav.trial')}
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t('nav.close') : t('nav.menu')}
            className="rounded-lg p-2 text-white lg:hidden"
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-menu"
            aria-label={t('a11y.mainNav')}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="h-[calc(100dvh-64px)] overflow-y-auto bg-black px-5 pt-6 pb-10 lg:hidden"
          >
            <ul className="flex flex-col">
              {LINKS.map((link) => (
                <li key={link.href} className="border-b border-white/10">
                  <a href={link.href} onClick={() => setOpen(false)} className="type-wide block py-4 text-2xl text-white">
                    {t(link.key)}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="#essai"
              onClick={() => setOpen(false)}
              className="mt-8 flex h-12 items-center justify-center rounded-lg bg-brand-500 font-semibold text-white"
            >
              {t('nav.trial')}
            </a>
            <Link to="/admin" className="mt-4 block text-center text-sm text-steel-300 underline-offset-4 hover:underline">
              {t('nav.staff')}
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
