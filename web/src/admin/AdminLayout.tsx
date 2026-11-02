import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, KeyRound, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../api/auth';
import { useAdminTheme } from '../lib/theme';
import { LanguageSwitcher, useI18n } from '../i18n';
import { authApi } from '../api/endpoints';
import { FormModal } from '../components/ui/FormModal';
import { useToast } from '../components/ui/Toast';
import { fullName, initials, ROLE_LABELS } from '../lib/format';
import { navFor } from './nav';

function LogoTile({ className }: { className?: string }) {
  return (
    <span className={clsx('flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white', className)}>
      <img src="/images/logo.jpg" alt="" className="size-full object-contain" />
    </span>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user) return null;
  return (
    <nav aria-label={t('Navigation du back-office')} className="flex flex-col gap-5">
      {navFor(user.role).map((section, index) => (
        <div key={section.title ?? index}>
          {section.title && <p className="mb-1.5 px-3 text-xs font-medium text-muted">{t(section.title)}</p>}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/admin'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                      isActive ? 'bg-card-2 font-semibold text-fg' : 'text-fg-2 hover:bg-card-2/60 hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute start-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-500" aria-hidden />}
                      <item.icon className={clsx('size-4 shrink-0', isActive ? 'text-fg' : 'text-muted group-hover:text-fg-2')} aria-hidden />
                      <span className="truncate">{t(item.label)}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useAdminTheme();
  const { t, dir } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const toast = useToast();
  const location = useLocation();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  if (!user) return null;
  const name = fullName(user);

  const brand = (
    <Link to="/admin" className="flex items-center gap-3 px-2">
      <LogoTile className="size-9" />
      <span className="leading-tight">
        <span className="type-wide block text-[15px] text-fg">Meliora Gym</span>
        <span className="block text-xs text-muted">{t('Back-office')}</span>
      </span>
    </Link>
  );

  return (
    <div className="min-h-dvh bg-page text-fg">
      {/* Desktop sidebar */}
      <aside className="scroll-thin fixed inset-y-0 start-0 z-30 hidden w-64 flex-col gap-6 overflow-y-auto border-e border-line bg-card px-3 py-5 lg:flex">
        {brand}
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)} />
            <motion.aside
              className="scroll-thin absolute inset-y-0 start-0 flex w-72 flex-col gap-6 overflow-y-auto bg-card px-3 py-5 ring-1 ring-line"
              initial={{ x: dir === 'rtl' ? 300 : -300 }}
              animate={{ x: 0 }}
              exit={{ x: dir === 'rtl' ? 300 : -300 }}
              transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            >
              <div className="flex items-center justify-between">
                {brand}
                <button type="button" onClick={() => setDrawerOpen(false)} aria-label={t('Fermer le menu')} className="rounded-lg p-2 text-fg-2 hover:bg-card-2">
                  <X className="size-5" />
                </button>
              </div>
              <LanguageSwitcher className="w-fit" />
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-page/85 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label={t('Ouvrir le menu')} className="-ms-1 rounded-lg p-2 text-fg-2 hover:bg-card-2 lg:hidden">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <LanguageSwitcher className="hidden sm:flex" />
          <Link to="/" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-fg-2 hover:bg-card-2 hover:text-fg sm:inline-flex">
            <ExternalLink className="size-4" aria-hidden />
            {t('Voir le site')}
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? t('Passer en thème clair') : t('Passer en thème sombre')}
            className="rounded-lg p-2 text-fg-2 hover:bg-card-2 hover:text-fg"
          >
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <div className="flex items-center gap-2.5 border-s border-line ps-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-card-2 text-xs font-semibold text-fg ring-1 ring-line" aria-hidden>
              {initials(name)}
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-medium text-fg">{name}</span>
              <span className="block text-xs text-muted">{t(ROLE_LABELS[user.role])}</span>
            </span>
            <button type="button" onClick={() => setChangingPassword(true)} aria-label={t('Changer mon mot de passe')} title={t('Changer mon mot de passe')} className="rounded-lg p-2 text-fg-2 hover:bg-card-2 hover:text-fg">
              <KeyRound className="size-4" />
            </button>
            <button type="button" onClick={() => void logout()} aria-label={t('Se déconnecter')} title={t('Se déconnecter')} className="rounded-lg p-2 text-fg-2 hover:bg-card-2 hover:text-fg">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
        <FormModal
          open={changingPassword}
          onClose={() => setChangingPassword(false)}
          title={t('Changer mon mot de passe')}
          description={t('Vos autres sessions seront déconnectées.')}
          submitLabel={t('Modifier le mot de passe')}
          size="sm"
          fields={[
            { name: 'currentPassword', label: 'Mot de passe actuel', type: 'password', required: true, wide: true },
            { name: 'newPassword', label: 'Nouveau mot de passe', type: 'password', required: true, hint: '8 caractères minimum.', wide: true },
            { name: 'confirmPassword', label: 'Confirmer le nouveau mot de passe', type: 'password', required: true, wide: true },
          ]}
          onSubmit={async (v) => {
            if (String(v.newPassword ?? '').length < 8) throw new Error(t('8 caractères minimum.'));
            if (v.newPassword !== v.confirmPassword) throw new Error(t('Les deux mots de passe ne correspondent pas.'));
            await authApi.changePassword(String(v.currentPassword), String(v.newPassword));
            toast.success(t('Mot de passe modifié. Vos autres sessions ont été déconnectées.'));
          }}
        />
      </div>
    </div>
  );
}
