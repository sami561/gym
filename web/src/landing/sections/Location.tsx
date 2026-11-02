import { Mail, MapPin, Phone } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { MAPS_EMBED_URL } from '../../lib/fallbacks';
import { useGym } from '../useLandingData';
import { InstagramGlyph } from './InstagramGlyph';

export function Location() {
  const { t } = useI18n();
  const { gym } = useGym();
  const handle = '@' + gym.instagram.replace(/\/+$/, '').split('/').pop();

  return (
    <section id="acces" className="bg-shield py-24 text-white sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 className="type-display text-5xl sm:text-6xl">{t('location.title')}</h2>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid bg-steel-950 sm:grid-cols-2">
            <img src="/images/facade.jpg" alt={t('location.facadeAlt')} loading="lazy" className="h-72 w-full object-cover object-[50%_38%] sm:h-full" />
            <iframe
              title={t('location.mapTitle')}
              src={MAPS_EMBED_URL}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full grayscale-[0.4] invert-[0.92] hue-rotate-180 sm:h-full sm:min-h-[420px]"
            />
          </div>

          <div className="flex flex-col gap-10 bg-steel-950 p-8 sm:p-10">
            <div>
              <h3 className="text-sm text-steel-400">{t('location.address')}</h3>
              <p className="mt-2 flex gap-3 text-lg">
                <MapPin className="mt-1 size-5 shrink-0 text-brand-500" aria-hidden />
                <span>
                  {gym.address}
                  <br />
                  {gym.city}
                </span>
              </p>
              <a href={gym.mapsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/10">
                {t('location.directions')}
              </a>
            </div>

            <div>
              <h3 className="text-sm text-steel-400">{t('location.hours')}</h3>
              <table className="mt-3 w-full text-start">
                <tbody>
                  {gym.openingHours.map((h) => (
                    <tr key={h.days} className="border-b border-white/10 last:border-0">
                      <th scope="row" className="py-2.5 text-start font-normal text-steel-200">
                        {h.days}
                      </th>
                      <td className="py-2.5 text-end font-semibold tabular" dir="ltr">
                        {h.open} – {h.close}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm text-steel-400">{t('location.contact')}</h3>
              <ul className="mt-3 flex flex-col gap-3">
                {gym.phone && !/0{3}/.test(gym.phone) && (
                  <li>
                    <a href={`tel:${gym.phone.replace(/\s/g, '')}`} className="flex items-center gap-3 hover:text-led">
                      <Phone className="size-4 text-steel-400" aria-hidden />
                      {gym.phone}
                    </a>
                  </li>
                )}
                <li>
                  <a href={`mailto:${gym.email}`} className="flex items-center gap-3 hover:text-led">
                    <Mail className="size-4 text-steel-400" aria-hidden />
                    {gym.email}
                  </a>
                </li>
                <li>
                  <a href={gym.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-led">
                    <InstagramGlyph className="size-4 text-steel-400" />
                    {handle}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
