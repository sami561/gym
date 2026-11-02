import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/auth';
import { errorMessage } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { ErrorNote } from '../components/ui/Card';
import { homeFor } from './nav';
import { LanguageSwitcher, useI18n } from '../i18n';

export function LoginPage() {
  const { status, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useI18n();

  if (status === 'authenticated' && user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const loggedIn = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/admin/login' ? from : homeFor(loggedIn.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-page text-fg lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-black lg:block">
 <img src="/images/facade.jpg" alt={t('Façade de Meliora Gym à Sousse')} className="absolute inset-0 size-full object-cover object-[50%_35%] opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-x-10 bottom-10">
          <p className="type-display text-5xl text-white">Meliora Gym</p>
          <p className="mt-3 max-w-md text-steel-200">{t('Khzema Est, Rue Colonel Garnaoui, Sousse')}</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <LanguageSwitcher className="mb-8 w-fit" />
          <Link to="/" className="mb-10 inline-flex items-center gap-3">
            <span className="flex size-12 items-center justify-center overflow-hidden rounded-xl bg-white">
              <img src="/images/logo.jpg" alt="Meliora Gym" className="size-full object-contain" />
            </span>
          </Link>
          <h1 className="type-wide text-3xl">{t('Espace équipe')}</h1>
          <p className="mt-2 text-sm text-fg-2">{t('Connexion réservée au personnel de la salle. Les membres utilisent l’application mobile.')}</p>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
            <Input label={t('E-mail')} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label={t('Mot de passe')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <ErrorNote message={error} />}
            <Button type="submit" size="lg" loading={submitting} className="mt-2 w-full">
              {t('Se connecter')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
