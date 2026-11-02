import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { publicApi } from '../../api/endpoints';
import { useI18n } from '../../lib/i18n';
import { isoDay } from '../../lib/format';
import { usePublicPlans } from '../useLandingData';

const input =
  'h-12 w-full rounded-lg bg-black px-4 text-white ring-1 ring-white/15 placeholder:text-steel-500 focus:outline-none focus:ring-2 focus:ring-brand-500';

export function TrialSection({ preselectedPlan }: { preselectedPlan: string | null }) {
  const { t } = useI18n();
  const plans = usePublicPlans();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', trialDate: '', interestPlanId: '', message: '' });
  const mutation = useMutation({ mutationFn: publicApi.trial });

  useEffect(() => {
    if (preselectedPlan) setForm((f) => ({ ...f, interestPlanId: preselectedPlan }));
  }, [preselectedPlan]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      trialDate: form.trialDate || null,
      interestPlanId: form.interestPlanId || null,
      message: form.message.trim() || null,
    });
  };

  return (
    <section id="essai" className="bg-corrugated py-24 text-white sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <h2 className="type-display text-5xl sm:text-6xl">{t('trial.title')}</h2>
          <p className="mt-6 max-w-md text-lg text-steel-200">{t('trial.lead')}</p>
        </div>

        <div className="rounded-2xl bg-shield p-6 ring-1 ring-white/10 sm:p-10">
          <AnimatePresence mode="wait" initial={false}>
            {mutation.isSuccess ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center"
                role="status"
              >
                <CircleCheck className="size-12 text-[#3ccf3c]" aria-hidden />
                <p className="type-wide max-w-sm text-2xl">{t('trial.success')}</p>
              </motion.div>
            ) : (
              <motion.form key="form" exit={{ opacity: 0 }} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm text-steel-300">
                  {t('trial.firstName')}
                  <input className={input} required autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-steel-300">
                  {t('trial.lastName')}
                  <input className={input} required autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-steel-300">
                  {t('trial.phone')}
                  <input className={input} required type="tel" autoComplete="tel" inputMode="tel" placeholder="+216" value={form.phone} onChange={set('phone')} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-steel-300">
                  {t('trial.email')}
                  <input className={input} type="email" autoComplete="email" value={form.email} onChange={set('email')} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-steel-300">
                  {t('trial.date')}
                  <input className={input} type="date" min={isoDay()} value={form.trialDate} onChange={set('trialDate')} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-steel-300">
                  {t('trial.plan')}
                  <select className={input} value={form.interestPlanId} onChange={set('interestPlanId')}>
                    <option value="">{t('trial.planNone')}</option>
                    {(plans.data ?? []).map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-steel-300 sm:col-span-2">
                  {t('trial.message')}
                  <textarea className={`${input} h-auto py-3`} rows={3} value={form.message} onChange={set('message')} />
                </label>
                {mutation.isError && (
                  <p role="alert" className="rounded-lg bg-brand-500/15 px-4 py-3 text-sm text-brand-300 ring-1 ring-brand-500/40 sm:col-span-2">
                    {t('trial.error')}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="mt-2 h-12 rounded-lg bg-brand-500 font-semibold text-white transition-[background-color,transform] hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60 sm:col-span-2"
                >
                  {mutation.isPending ? t('trial.sending') : t('trial.submit')}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
