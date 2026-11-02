import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './api/auth';
import { I18nProvider, useI18n } from './i18n';
import { ConfirmProvider } from './components/ui/Modal';
import { ToastProvider } from './components/ui/Toast';
import { PageSpinner } from './components/ui/Spinner';
import { LandingPage } from './landing/LandingPage';

/** Back-office (routes, pages and its dictionary) in its own chunk. */
const AdminApp = lazy(() => import('./admin/AdminApp'));

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
      <p className="type-display text-7xl">404</p>
      <p className="text-steel-300">{t('Cette page n’existe pas.')}</p>
      <a href="/" className="rounded-lg bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600">
        {t('Retour à l’accueil')}
      </a>
    </div>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route
                path="/admin/*"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <AdminApp />
                  </Suspense>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
