/*
 * JavaScript that runs inside the n8n "Code" nodes.
 *
 * Each function below is never called here: build.mjs copies its *body* into a Code node,
 * after `const TEMPLATES = {...}` (the composed e-mail templates) and the runtime helpers.
 * Inside n8n they can use $input, $env and $('Node name'), like any Code node.
 */
/* eslint-disable no-undef */

/** Helpers shared by every Code node (branding, template rendering, French formatting). */
export function runtime() {
  const env = (key, fallback = '') => {
    try {
      const value = $env[key];
      return value === undefined || value === null || value === '' ? fallback : String(value);
    } catch (error) {
      return fallback; // N8N_BLOCK_ENV_ACCESS_IN_NODE=true
    }
  };
  const BRAND = {
    logoUrl: env('MELIORA_LOGO_URL', 'https://meliora-gym.tn/images/logo.jpg'),
    websiteUrl: env('MELIORA_WEBSITE_URL', 'https://meliora-gym.tn'),
    appUrl: env('MELIORA_APP_URL', 'https://meliora-gym.tn/app'),
    adminUrl: env('MELIORA_ADMIN_URL', 'https://meliora-gym.tn/admin'),
    mapsUrl: env('MELIORA_MAPS_URL', 'https://maps.app.goo.gl/CVWB98nx2RdSd8Mw8'),
    instagramUrl: 'https://www.instagram.com/gymmeliora/',
    instagramHandle: '@gymmeliora',
    address: 'Khzema Est, Rue Colonel Garnaoui, Sousse 4051',
    phone: env('MELIORA_GYM_PHONE'),
  };
  const FROM = env('MELIORA_FROM_EMAIL', 'Meliora Gym <contact@meliora-gym.tn>');
  const OWNER = env('MELIORA_OWNER_EMAIL');
  const STAFF = env('MELIORA_STAFF_EMAIL', OWNER);
  const MEMBER_NOTE = 'Vous recevez cet e-mail car vous êtes membre de Meliora Gym. Répondez « STOP » pour ne plus recevoir nos messages.';
  const TZ = 'Africa/Tunis';

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // {{#if key}}…{{/if}} blocks, then {{{raw}}} / {{escaped}} values in a single pass (values are never re-scanned).
  const render = (template, vars) =>
    template
      .replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => (vars[key] ? inner : ''))
      .replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, raw, key) => (raw ? String(vars[raw] ?? '') : esc(vars[key])));

  const asDate = (value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  const fmt = (value, options) => {
    if (!value) return '';
    const date = asDate(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...options }).format(date);
  };
  const longDate = (value) => fmt(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dayMonth = (value) => fmt(value, { weekday: 'long', day: 'numeric', month: 'long' });
  const shortDate = (value) => fmt(value, { day: 'numeric', month: 'long', year: 'numeric' });
  const dateTime = (value) => fmt(value, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const hour = (value) => fmt(value, { hour: '2-digit', minute: '2-digit' });
  const dayKey = (value) => fmt(value, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
  const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');
  const money = (amount) =>
    `${Number(amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
  const plural = (count, one, many) => `${count} ${Math.abs(Number(count)) === 1 ? one : many}`;
  const firstWord = (name) => String(name || '').trim().split(/\s+/)[0] || '';
  const weekRange = (from, to) => `${fmt(from, { day: 'numeric', month: 'long' })} au ${fmt(to, { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const METHODS = { CASH: 'Espèces', CARD: 'Carte bancaire', TRANSFER: 'Virement bancaire', D17: 'D17' };
  const SOURCES = {
    WALK_IN: 'Passage à l’accueil',
    INSTAGRAM: 'Instagram',
    FACEBOOK: 'Facebook',
    WEBSITE: 'Site web',
    REFERRAL: 'Parrainage',
    PHONE: 'Téléphone',
    OTHER: 'Autre',
  };
  const PRIORITIES = { LOW: 'basse', MEDIUM: 'moyenne', HIGH: 'haute', URGENT: 'urgente' };

  /** One e-mail item for the "Send Email" node, or null when there is no usable recipient. */
  const email = (template, { to, subject, preheader = '', vars = {}, footerNote = '' }) => {
    const recipient = String(to || '').trim();
    if (!recipient.includes('@')) return null;
    const html = render(TEMPLATES[template], {
      ...BRAND,
      year: new Date().getFullYear(),
      subject,
      preheader,
      footerNote,
      ...vars,
    });
    return { json: { from: FROM, to: recipient, subject, html } };
  };

  /** Bordered list used in owner digests: rows of { title, detail }. */
  const listTable = (rows, empty = 'Rien à signaler ✅') => {
    if (!rows.length) return `<p style="margin:0 0 14px;color:#2e7d32;">${esc(empty)}</p>`;
    const body = rows
      .map(
        (row) =>
          `<tr><td style="padding:11px 16px;border-bottom:1px solid #f1f1f1;font-size:14px;"><strong style="color:#0b0b0c;">${esc(row.title)}</strong>` +
          (row.detail ? `<br><span style="color:#6b6b6b;font-size:13px;">${esc(row.detail)}</span>` : '') +
          '</td></tr>',
      )
      .join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;border:1px solid #ececec;border-radius:10px;border-collapse:separate;border-spacing:0;">${body}</table>`;
  };
}

/* ---------------------------------------------------------------------------------------------
 * 01 · Webhook check. notification-service sends X-Meliora-Timestamp (unix seconds) and
 * X-Meliora-Signature = sha256=<hex HMAC-SHA256(WEBHOOK_SECRET, "<timestamp>.<raw body>")>.
 * The Crypto node recomputes the HMAC with the "Meliora webhook signature" credential.
 * ------------------------------------------------------------------------------------------- */
export const webhook = {
  /**
   * Adds the exact signed string ($json.signedPayload) and whether the timestamp is within 5 minutes
   * of now ($json.timestampValid: an older request is a replay). The bearer token is removed from
   * the headers so the next nodes do not copy it into their output.
   */
  async prepareCheck() {
    const MAX_CLOCK_SKEW_SECONDS = 300;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const received = $input.all();
    const prepared = [];
    for (let index = 0; index < received.length; index++) {
      const item = received[index];
      const headers = { ...(item.json.headers ?? {}) };
      delete headers.authorization;
      const timestamp = String(headers['x-meliora-timestamp'] ?? '');
      // Raw bytes (Webhook option "Raw Body"): the signature covers them, not the parsed $json.body.
      // `helpers` (not `this.helpers`) resolves in both task-runner modes (secure and insecure).
      const rawBody = item.binary?.data
        ? Buffer.from(await helpers.getBinaryDataBuffer(index, 'data')).toString('utf8')
        : '';
      const timestampValid = /^\d{1,12}$/.test(timestamp) && Math.abs(nowSeconds - Number(timestamp)) <= MAX_CLOCK_SKEW_SECONDS;
      prepared.push({
        json: { ...item.json, headers, signedPayload: `${timestamp}.${rawBody}`, timestampValid },
        pairedItem: { item: index },
      });
    }
    return prepared;
  },
};

/* ---------------------------------------------------------------------------------------------
 * 01 · Customer events (webhook). Items come from the Webhook node: $json.body = { id, event, occurredAt, data }.
 * ------------------------------------------------------------------------------------------- */
export const events = {
  memberCreated() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        return email('welcome', {
          to: d.email,
          subject: `Bienvenue chez Meliora Gym, ${d.firstName} !`,
          preheader: 'Votre compte membre est prêt : QR code d’accès, réservations et suivi dans l’application.',
          vars: { firstName: d.firstName, memberCode: d.memberCode },
        });
      })
      .filter(Boolean);
  },

  subscriptionCreated() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        return email('subscriptionConfirmation', {
          to: d.email,
          subject: `Abonnement ${d.planName} confirmé`,
          preheader: `Du ${shortDate(d.startDate)} au ${shortDate(d.endDate)}.`,
          vars: {
            firstName: d.firstName,
            planName: d.planName,
            startDate: longDate(d.startDate),
            endDate: longDate(d.endDate),
            price: money(d.price),
            memberCode: d.memberCode,
          },
        });
      })
      .filter(Boolean);
  },

  paymentReceived() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        return email('paymentReceipt', {
          to: d.email,
          subject: `Reçu de paiement — ${money(d.amount)}`,
          preheader: `Paiement de ${money(d.amount)} reçu le ${shortDate(d.paidAt)}.`,
          vars: {
            firstName: d.firstName,
            receiptNumber: `MEL-${String(d.paymentId ?? '').slice(-8).toUpperCase()}`,
            paidAt: dateTime(d.paidAt),
            amount: money(d.amount),
            methodLabel: METHODS[d.method] ?? d.method,
            planName: d.planName,
            reference: d.reference,
            memberCode: d.memberCode,
          },
        });
      })
      .filter(Boolean);
  },

  subscriptionExpiring() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        const days = Number(d.daysLeft ?? 0);
        return email('expiryReminder', {
          to: d.email,
          subject:
            days <= 0
              ? 'Votre abonnement se termine aujourd’hui'
              : days === 1
                ? 'Votre abonnement se termine demain'
                : `Votre abonnement se termine dans ${days} jours`,
          preheader: `Renouvelez votre abonnement ${d.planName} pour garder votre accès au club.`,
          vars: {
            firstName: d.firstName,
            planName: d.planName,
            endDate: longDate(d.endDate),
            daysLabel: days <= 0 ? 'quelques heures' : plural(days, 'jour', 'jours'),
          },
        });
      })
      .filter(Boolean);
  },

  subscriptionExpired() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        return email('renewalInvite', {
          to: d.email,
          subject: 'Votre abonnement a expiré — on vous garde une place',
          preheader: 'Renouvelez à l’accueil ou dans l’application : votre accès est réactivé immédiatement.',
          vars: { firstName: d.firstName, planName: d.planName, endDate: longDate(d.endDate) },
        });
      })
      .filter(Boolean);
  },

  bookingCreated() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        return email('bookingConfirmation', {
          to: d.email,
          subject: `Réservation confirmée : ${d.sessionTitle} (${dayMonth(d.startsAt)} à ${hour(d.startsAt)})`,
          preheader: `Votre place au cours de ${d.sessionTitle} est réservée.`,
          vars: {
            firstName: firstWord(d.memberName),
            sessionTitle: d.sessionTitle,
            date: capitalize(dayMonth(d.startsAt)),
            timeRange: `${hour(d.startsAt)} – ${hour(d.endsAt)}`,
            coachName: d.coachName,
            room: d.room,
          },
        });
      })
      .filter(Boolean);
  },

  leadCreated() {
    const out = [];
    for (const item of $input.all()) {
      const d = item.json.body?.data ?? {};
      const fullName = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim();
      const trialDate = d.trialDate ? longDate(d.trialDate) : '';
      const sourceLabel = SOURCES[d.source] ?? d.source ?? 'Autre';
      // To the prospect, when an e-mail was given on the free-trial form.
      out.push(
        email('trialConfirmation', {
          to: d.email,
          subject: 'Votre séance d’essai gratuite chez Meliora Gym',
          preheader: trialDate ? `Rendez-vous le ${trialDate}.` : 'Notre équipe vous contacte très vite.',
          vars: { firstName: d.firstName, trialDate, noTrialDate: !trialDate, interestPlanName: d.interestPlanName },
        }),
      );
      // To the reception team.
      out.push(
        email('leadAlert', {
          to: STAFF,
          subject: `Nouveau prospect : ${fullName} (${sourceLabel})`,
          preheader: `${d.phone ?? ''} · séance d’essai ${trialDate || 'à planifier'}`,
          vars: {
            fullName,
            phone: d.phone || '—',
            email: d.email,
            sourceLabel,
            trialLabel: trialDate || 'À planifier',
            interestPlanName: d.interestPlanName,
            message: d.message,
          },
        }),
      );
    }
    return out.filter(Boolean);
  },

  saleCompleted() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        const rows = (d.items ?? [])
          .map(
            (line) =>
              `<tr><td style="padding:10px 16px;border-bottom:1px solid #f1f1f1;font-size:14px;">${esc(line.name)} <span style="color:#6b6b6b;">× ${esc(line.quantity)}</span></td>` +
              `<td align="right" style="padding:10px 16px;border-bottom:1px solid #f1f1f1;font-size:14px;white-space:nowrap;">${esc(money(line.total))}</td></tr>`,
          )
          .join('');
        const itemsHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 4px;border:1px solid #ececec;border-radius:10px;border-collapse:separate;border-spacing:0;">${rows}</table>`;
        return email('saleReceipt', {
          to: d.email,
          subject: `Votre reçu Meliora Gym — ${d.number}`,
          preheader: `Total : ${money(d.total)}`,
          vars: {
            firstName: firstWord(d.memberName),
            number: d.number,
            date: dateTime(d.createdAt),
            methodLabel: METHODS[d.paymentMethod] ?? d.paymentMethod,
            total: money(d.total),
            itemsHtml,
          },
        });
      })
      .filter(Boolean);
  },

  stockLow() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        return email('stockAlert', {
          to: OWNER,
          subject: `Stock bas : ${d.name} (${plural(d.stock, 'unité restante', 'unités restantes')})`,
          preheader: `Seuil d’alerte : ${d.threshold}.`,
          vars: { name: d.name, stockLabel: plural(d.stock, 'unité', 'unités'), threshold: d.threshold },
        });
      })
      .filter(Boolean);
  },

  maintenanceOpened() {
    return $input
      .all()
      .map((item) => {
        const d = item.json.body?.data ?? {};
        const priorityLabel = PRIORITIES[d.priority] ?? String(d.priority ?? '').toLowerCase();
        return email('maintenanceAlert', {
          to: OWNER,
          subject: `Maintenance ${priorityLabel} : ${d.title}`,
          preheader: [d.equipmentName, d.roomName].filter(Boolean).join(' · '),
          vars: {
            title: d.title,
            priorityLabel,
            equipmentName: d.equipmentName,
            roomName: d.roomName,
            at: dateTime(d.at),
          },
        });
      })
      .filter(Boolean);
  },
};

/* ---------------------------------------------------------------------------------------------
 * Scheduled workflows. Items come from HTTP Request nodes calling /api/automation/*.
 * ------------------------------------------------------------------------------------------- */
export const scheduled = {
  birthdays() {
    const offer = env('MELIORA_BIRTHDAY_OFFER');
    return $input
      .all()
      .map((item) => item.json)
      .filter((member) => member && member.email)
      .map((member) =>
        email('birthday', {
          to: member.email,
          subject: `Joyeux anniversaire ${member.firstName} ! 🎂`,
          preheader: 'Toute l’équipe Meliora vous souhaite une très belle journée.',
          vars: { firstName: member.firstName, offer },
          footerNote: MEMBER_NOTE,
        }),
      )
      .filter(Boolean);
  },

  expiredMembers() {
    const offer = env('MELIORA_WINBACK_OFFER');
    return $input
      .all()
      .map((item) => item.json)
      .filter((member) => member && member.email)
      .map((member) =>
        email('winbackExpired', {
          to: member.email,
          subject: `${member.firstName}, et si vous repreniez cette semaine ?`,
          preheader: `Votre abonnement ${member.planName} est terminé, pas votre progression.`,
          vars: {
            firstName: member.firstName,
            planName: member.planName,
            daysLabel: plural(member.daysSinceExpiry ?? 0, 'jour', 'jours'),
            offer,
          },
          footerNote: MEMBER_NOTE,
        }),
      )
      .filter(Boolean);
  },

  /** Newsletter step 1: turns the week's sessions into one HTML schedule (no sessions = no newsletter). */
  buildSchedule() {
    const sessions = $input
      .all()
      .map((item) => item.json)
      .filter((session) => session && session.startsAt)
      .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
    if (!sessions.length) return [];

    const days = new Map();
    for (const session of sessions) {
      const key = dayKey(session.startsAt);
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(session);
    }
    const cell = 'padding:10px 14px;border-bottom:1px solid #f1f1f1;font-size:14px;vertical-align:top;';
    let rows = '';
    for (const daySessions of days.values()) {
      rows += `<tr><td colspan="3" style="padding:12px 14px 6px;background:#0b0b0c;color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">${esc(capitalize(dayMonth(daySessions[0].startsAt)))}</td></tr>`;
      for (const s of daySessions) {
        const left = Number(s.capacity ?? 0) - Number(s.bookedCount ?? 0);
        const details = [s.coachName ? `avec ${s.coachName}` : '', s.room ?? ''].filter(Boolean).join(' · ');
        rows +=
          `<tr><td style="${cell}white-space:nowrap;color:#E10600;font-weight:bold;">${esc(hour(s.startsAt))} – ${esc(hour(s.endsAt))}</td>` +
          `<td style="${cell}"><strong>${esc(s.title)}</strong>${details ? `<br><span style="color:#6b6b6b;font-size:13px;">${esc(details)}</span>` : ''}</td>` +
          `<td align="right" style="${cell}white-space:nowrap;color:${left > 0 ? '#2e7d32' : '#9e9e9e'};">${left > 0 ? esc(plural(left, 'place', 'places')) : 'Complet'}</td></tr>`;
      }
    }
    const scheduleHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border:1px solid #ececec;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;">${rows}</table>`;
    return [
      {
        json: {
          scheduleHtml,
          count: sessions.length,
          weekLabel: weekRange(sessions[0].startsAt, sessions[sessions.length - 1].startsAt),
        },
      },
    ];
  },

  /** Newsletter step 2: one e-mail per active member. */
  newsletter() {
    const planning = $('Construire le planning').first().json;
    return $input
      .all()
      .map((item) => item.json)
      .filter((recipient) => recipient && recipient.email)
      .map((recipient) =>
        email('weeklySchedule', {
          to: recipient.email,
          subject: `Planning de la semaine — ${planning.weekLabel}`,
          preheader: `${plural(planning.count, 'cours', 'cours')} au programme cette semaine.`,
          vars: { firstName: recipient.firstName, weekLabel: planning.weekLabel, scheduleHtml: planning.scheduleHtml },
          footerNote: MEMBER_NOTE,
        }),
      )
      .filter(Boolean);
  },

  dailyReport() {
    const report = $input.first().json ?? {};
    const m = report.membership ?? {};
    const a = report.access ?? {};
    const c = report.classes ?? {};
    const expiring = Number(m.expiringNext7Days ?? 0);
    const out = email('dailyReport', {
      to: OWNER,
      subject: `Rapport Meliora du ${shortDate(report.date)}`,
      preheader: `${money(m.revenue)} encaissés · ${plural(a.checkIns ?? 0, 'entrée', 'entrées')}`,
      vars: {
        dateLabel: longDate(report.date),
        revenue: money(m.revenue),
        payments: m.payments ?? 0,
        newMembers: m.newMembers ?? 0,
        newSubscriptions: m.newSubscriptions ?? 0,
        checkIns: a.checkIns ?? 0,
        uniqueVisitors: a.uniqueVisitors ?? 0,
        denied: a.denied ?? 0,
        sessions: c.sessionsToday ?? 0,
        upcomingBookings: c.upcomingBookings ?? 0,
        fillRate: `${Math.round(Number(c.fillRate30d ?? 0) * 100)} %`,
        expiringLabel: expiring
          ? `${plural(expiring, 'abonnement expire', 'abonnements expirent')} dans les 7 prochains jours : pensez à relancer.`
          : 'Aucun abonnement n’expire dans les 7 prochains jours.',
      },
    });
    return out ? [out] : [];
  },

  /** Instagram ideas step 1: plain-text summary of the week's classes (works with an empty week). */
  summarizeSchedule() {
    const sessions = $input
      .all()
      .map((item) => item.json)
      .filter((session) => session && session.startsAt)
      .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
    const lines = sessions.map(
      (s) =>
        `- ${capitalize(dayMonth(s.startsAt))}, ${hour(s.startsAt)}–${hour(s.endsAt)} : ${s.title}` +
        `${s.coachName ? ` avec ${s.coachName}` : ''}${s.room ? ` (${s.room})` : ''} — ${s.bookedCount ?? 0}/${s.capacity ?? '?'} inscrits`,
    );
    const now = new Date();
    return [
      {
        json: {
          count: sessions.length,
          scheduleText: lines.join('\n') || 'Aucun cours collectif programmé cette semaine.',
          weekLabel: weekRange(now, new Date(now.getTime() + 6 * 86_400_000)),
        },
      },
    ];
  },

  /** Instagram ideas step 2: Anthropic Messages API request (structured JSON output). */
  claudeRequest() {
    const planning = $('Résumer le planning').first().json;
    const gym = $input.first().json ?? {};
    const hours = (gym.openingHours ?? []).map((h) => `${h.days} ${h.open}–${h.close}`).join(' ; ');
    const system = [
      `Tu es le community manager de ${gym.name || 'Meliora Gym'}, une salle de sport premium à Sousse (Tunisie), sur Instagram ${BRAND.instagramHandle}.`,
      'Identité : logo bouclier noir, blanc et rouge, un athlète qui forge sa meilleure version. Ton : motivant, chaleureux, direct, inclusif (débutants comme confirmés), jamais culpabilisant.',
      'Tu écris en français, avec au plus quelques mots de darija tunisienne bien choisis. Les emojis restent sobres.',
      'N’invente jamais de prix, de promotion, de coach, d’horaire ou de cours absents des informations fournies.',
    ].join('\n');
    const user = [
      `Semaine du ${planning.weekLabel}.`,
      '',
      'Cours collectifs programmés :',
      planning.scheduleText,
      '',
      `Infos du club : ${gym.address ?? BRAND.address}${gym.city ? `, ${gym.city}` : ''}${hours ? ` ; horaires : ${hours}` : ''}.`,
      'L’application Meliora permet de réserver les cours et d’entrer au club avec un QR code.',
      '',
      'Prépare le contenu Instagram de la semaine :',
      '- un thème de semaine accrocheur ;',
      '- exactement 3 publications (post ou reel) : une première ligne qui accroche, une légende de 60 à 150 mots, un appel à l’action (réserver dans l’application, séance d’essai gratuite, venir avec un ami…), une idée de visuel tournable à la salle et le meilleur jour de publication ;',
      '- 5 idées de stories, avec un élément interactif (sondage, quiz, question, compte à rebours…) ;',
      '- 15 à 20 hashtags pertinents, locaux (Sousse, Tunisie) et fitness.',
      'Appuie-toi sur les vrais cours, horaires et coachs de la semaine.',
    ].join('\n');

    const string = { type: 'string' };
    const schema = {
      type: 'object',
      properties: {
        weekTheme: string,
        posts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: string,
              caption: string,
              visualIdea: string,
              bestDay: string,
              hashtags: { type: 'array', items: string },
            },
            required: ['title', 'caption', 'visualIdea', 'bestDay', 'hashtags'],
            additionalProperties: false,
          },
        },
        stories: {
          type: 'array',
          items: {
            type: 'object',
            properties: { day: string, idea: string, interactive: string },
            required: ['day', 'idea', 'interactive'],
            additionalProperties: false,
          },
        },
        hashtags: { type: 'array', items: string },
      },
      required: ['weekTheme', 'posts', 'stories', 'hashtags'],
      additionalProperties: false,
    };

    const request = {
      model: env('MELIORA_CLAUDE_MODEL', 'claude-opus-5-5'),
      max_tokens: 16000,
      // Server-side refusal fallback (header anthropic-beta: server-side-fallback-2026-07-01).
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    };
    return [{ json: { request, weekLabel: planning.weekLabel, scheduleText: planning.scheduleText } }];
  },

  /** Instagram ideas step 3: parse Claude's JSON (or explain what failed) and build the owner e-mail. */
  contentIdeas() {
    const response = $input.first().json ?? {};
    const meta = $('Construire la requête Claude').first().json;
    let ideas = null;
    let failure = '';
    if (response.error) {
      failure = typeof response.error === 'string' ? response.error : response.error.message || 'erreur de l’API Claude';
    } else if (response.stop_reason === 'refusal') {
      failure = 'demande refusée par les garde-fous du modèle';
    } else if (response.stop_reason === 'max_tokens') {
      failure = 'réponse incomplète (limite de longueur atteinte)';
    } else {
      const text = (response.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      try {
        ideas = JSON.parse(text);
      } catch (error) {
        failure = 'réponse illisible';
      }
    }

    const nl2br = (text) => esc(text).replace(/\n/g, '<br>');
    const card = 'margin:14px 0;padding:16px 18px;border:1px solid #ececec;border-left:4px solid #E10600;border-radius:10px;';
    const postsHtml = ideas
      ? (ideas.posts ?? [])
          .slice(0, 3)
          .map(
            (post, index) =>
              `<div style="${card}"><p style="margin:0 0 6px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#E10600;">Publication ${index + 1} · ${esc(post.bestDay)}</p>` +
              `<p style="margin:0 0 10px;font-size:17px;font-weight:bold;color:#0b0b0c;">${esc(post.title)}</p>` +
              `<p style="margin:0 0 10px;font-size:15px;">${nl2br(post.caption)}</p>` +
              `<p style="margin:0 0 6px;font-size:13px;color:#6b6b6b;"><strong>Visuel :</strong> ${esc(post.visualIdea)}</p>` +
              `<p style="margin:0;font-size:13px;color:#6b6b6b;">${esc((post.hashtags ?? []).join(' '))}</p></div>`,
          )
          .join('')
      : `<pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px;background:#f7f7f7;padding:14px;border-radius:8px;">${esc(meta.scheduleText)}</pre>`;
    const storiesHtml = ideas
      ? `<ul style="margin:0 0 14px;padding-left:20px;">${(ideas.stories ?? [])
          .map((story) => `<li style="margin:0 0 8px;"><strong>${esc(story.day)}</strong> : ${esc(story.idea)} <em style="color:#6b6b6b;">(${esc(story.interactive)})</em></li>`)
          .join('')}</ul>`
      : '<p>—</p>';

    const out = email('contentIdeas', {
      to: OWNER,
      subject: `Idées Instagram — semaine du ${meta.weekLabel}`,
      preheader: ideas ? ideas.weekTheme : 'La génération automatique n’a pas abouti cette semaine.',
      vars: {
        weekLabel: meta.weekLabel,
        weekTheme: ideas ? ideas.weekTheme : 'Planning de la semaine',
        postsHtml,
        storiesHtml,
        hashtags: ideas ? (ideas.hashtags ?? []).join(' ') : '',
        failed: !ideas,
        errorMessage: failure,
      },
    });
    return out ? [out] : [];
  },

  operationsDigest() {
    const pick = (name) =>
      $(name)
        .all()
        .map((item) => item.json)
        .filter((row) => row && row.id);
    const leads = pick('Prospects à relancer');
    const products = pick('Stock bas');
    const equipment = pick('Maintenance à prévoir');
    const now = new Date();

    const leadsHtml = listTable(
      leads.map((lead) => ({
        title: `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim(),
        detail: [
          lead.phone,
          SOURCES[lead.source] ?? lead.source,
          lead.status === 'TRIAL' ? 'séance d’essai' : null,
          lead.followUpAt ? `relance prévue le ${shortDate(lead.followUpAt)}` : null,
          lead.assignedToName ? `suivi par ${lead.assignedToName}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    );
    const stockHtml = listTable(
      products.map((product) => ({
        title: product.name,
        detail: `${plural(product.stock ?? 0, 'unité', 'unités')} en stock · seuil ${product.lowStockThreshold}`,
      })),
    );
    const maintenanceHtml = listTable(
      equipment.map((item) => ({
        title: item.name,
        detail: [
          item.roomName,
          item.nextMaintenanceAt ? `entretien prévu le ${shortDate(item.nextMaintenanceAt)}` : null,
          item.status === 'OUT_OF_ORDER' ? 'hors service' : item.status === 'MAINTENANCE' ? 'en maintenance' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    );

    const weekLabel = weekRange(now, new Date(now.getTime() + 6 * 86_400_000));
    const out = email('operationsDigest', {
      to: OWNER,
      subject: `Point opérations Meliora — semaine du ${weekLabel}`,
      preheader: `${plural(leads.length, 'prospect', 'prospects')} à relancer · ${plural(products.length, 'produit', 'produits')} en stock bas · ${plural(equipment.length, 'entretien', 'entretiens')}`,
      vars: {
        weekLabel,
        leadsCount: leads.length,
        leadsHtml,
        stockCount: products.length,
        stockHtml,
        maintenanceCount: equipment.length,
        maintenanceHtml,
      },
    });
    return out ? [out] : [];
  },
};

/* ---------------------------------------------------------------------------------------------
 * 03 · Motivation of inactive members (daily) + weekly owner summary.
 * Sent stages are remembered in the workflow static data (production runs only):
 *   staticData.motivation[`${memberId}:${stage}:${lastVisitAt}`] = { at, stage, name }
 * ------------------------------------------------------------------------------------------- */
export const motivation = {
  /** Picks the stage of each inactive member and drops the ones already contacted for this absence. */
  chooseStage() {
    const store = $getWorkflowStaticData('global');
    store.motivation = store.motivation ?? {};
    const KEEP_DAYS = 180;
    const now = Date.now();
    for (const [key, entry] of Object.entries(store.motivation)) {
      if (!entry || now - Date.parse(entry.at) > KEEP_DAYS * 86_400_000) delete store.motivation[key];
    }

    const stageOf = (days) => {
      if (days === null || days === undefined) return 'premiers-pas';
      if (days >= 30) return 'reprise';
      if (days >= 14) return 'motivation';
      if (days >= 7) return 'rappel';
      return null;
    };
    const SITUATIONS = {
      rappel: 'ne vient plus depuis une à deux semaines (petit rappel amical)',
      motivation: 'ne vient plus depuis deux à quatre semaines (besoin d’encouragement)',
      reprise: 'ne vient plus depuis plus d’un mois (reprise en douceur)',
      'premiers-pas': 'est inscrit(e) mais n’est encore jamais venu(e) au club (première séance)',
    };

    const upcoming = $('Prochains cours')
      .all()
      .map((item) => item.json)
      .filter((session) => session && session.startsAt && Date.parse(session.startsAt) > now)
      .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))
      .slice(0, 3);
    const aiEnabled = env('MELIORA_MOTIVATION_AI') === 'true';

    const out = [];
    for (const member of $('Membres inactifs').all().map((item) => item.json)) {
      if (!member || !member.memberId || !member.email) continue;
      const days = member.daysSinceVisit === null || member.daysSinceVisit === undefined ? null : Number(member.daysSinceVisit);
      const stage = stageOf(days);
      if (!stage) continue;
      const key = `${member.memberId}:${stage}:${member.lastVisitAt ?? 'never'}`;
      if (store.motivation[key]) continue;

      const situation =
        days === null ? SITUATIONS[stage] : `${SITUATIONS[stage]} — dernière visite il y a ${days} jours`;
      const claudeRequest = aiEnabled
        ? {
            model: env('MELIORA_CLAUDE_MODEL', 'claude-opus-5-5'),
            max_tokens: 2000,
            fallbacks: 'default',
            output_config: {
              effort: 'low',
              format: {
                type: 'json_schema',
                schema: {
                  type: 'object',
                  properties: { sentence: { type: 'string' } },
                  required: ['sentence'],
                  additionalProperties: false,
                },
              },
            },
            system:
              'Tu es coach à Meliora Gym, une salle de sport à Sousse (Tunisie). Tu écris UNE seule phrase de motivation en français, ' +
              'chaleureuse et personnelle, de 25 mots maximum, qui donne envie de revenir s’entraîner. Jamais culpabilisante, ' +
              'sans promesse d’offre ni de prix, au plus un emoji.',
            messages: [{ role: 'user', content: `Prénom : ${member.firstName}. Situation : ce membre ${situation}.` }],
          }
        : null;

      out.push({
        json: {
          memberId: member.memberId,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          daysSinceVisit: days,
          lastVisitAt: member.lastVisitAt ?? null,
          stage,
          key,
          upcoming: stage === 'motivation' ? upcoming : [],
          aiEnabled,
          claudeRequest,
        },
      });
    }
    return out;
  },

  /** Builds the stage e-mails. Input: the staged members, or Claude's answers paired with them. */
  prepareEmails() {
    const staged = $('Choisir l’étape').all();
    const STATIC_LINES = {
      rappel: 'Une séance cette semaine suffit à garder le rythme : on vous attend !',
      motivation: 'Chaque retour compte plus que la perfection : une séance, et la machine repart.',
      reprise: 'Reprendre après une pause, c’est déjà une victoire : on vous accompagne pas à pas.',
      'premiers-pas': 'Le plus dur, c’est de pousser la porte la première fois : on s’occupe du reste.',
    };
    const TIPS = [
      'Notez vos séances dans votre agenda comme un vrai rendez-vous.',
      'Préparez votre sac la veille : une excuse de moins le lendemain.',
      'Venez avec un ami : on se motive deux fois plus à deux.',
      'Commencez court : 30 minutes valent toujours mieux que zéro.',
    ];
    const whatsapp = env('MELIORA_WHATSAPP').replace(/[^\d]/g, '');
    const whatsappUrl = whatsapp
      ? `https://wa.me/${whatsapp}?text=${encodeURIComponent('Bonjour Meliora, je souhaite reprendre l’entraînement !')}`
      : '';
    const phoneUrl = BRAND.phone ? `tel:${BRAND.phone.replace(/[^\d+]/g, '')}` : '';
    const comebackOffer = env(
      'MELIORA_COMEBACK_OFFER',
      'Une séance de reprise offerte avec un coach, pour repartir sur de bonnes bases et à votre rythme.',
    );

    const sentenceFrom = (response) => {
      if (!response || response.error || response.stop_reason !== 'end_turn') return '';
      try {
        const text = (response.content ?? [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('');
        const sentence = String(JSON.parse(text).sentence ?? '').trim();
        return sentence.length > 0 && sentence.length <= 280 ? sentence : '';
      } catch (error) {
        return '';
      }
    };

    const SUBJECTS = {
      rappel: (m) => `${m.firstName}, on garde le rythme ? 💪`,
      motivation: (m) => `${m.firstName}, votre prochaine séance vous attend`,
      reprise: (m) => `${m.firstName}, une séance de reprise vous attend chez Meliora`,
      'premiers-pas': (m) => `${m.firstName}, et si on faisait votre première séance cette semaine ?`,
    };
    const TEMPLATE_OF = {
      rappel: 'motivationRappel',
      motivation: 'motivationEncouragement',
      reprise: 'motivationReprise',
      'premiers-pas': 'motivationPremiersPas',
    };

    const out = [];
    $input.all().forEach((item, index) => {
      const fromClaude = !('stage' in item.json);
      const member = fromClaude ? staged[item.pairedItem?.item ?? index]?.json : item.json;
      if (!member) return;
      const line = (fromClaude ? sentenceFrom(item.json) : '') || STATIC_LINES[member.stage];
      const classesHtml = (member.upcoming ?? []).length
        ? `<ul style="margin:0 0 14px;padding-left:20px;">${member.upcoming
            .map(
              (s) =>
                `<li style="margin:0 0 6px;"><strong>${esc(capitalize(dayMonth(s.startsAt)))} à ${esc(hour(s.startsAt))}</strong> : ${esc(s.title)}${s.coachName ? ` avec ${esc(s.coachName)}` : ''}</li>`,
            )
            .join('')}</ul>`
        : '';
      const seed = [...String(member.memberId)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const mail = email(TEMPLATE_OF[member.stage], {
        to: member.email,
        subject: SUBJECTS[member.stage](member),
        preheader: line,
        vars: {
          firstName: member.firstName,
          daysLabel: member.daysSinceVisit === null ? '' : plural(member.daysSinceVisit, 'jour', 'jours'),
          personalLine: line,
          classesHtml,
          tip: TIPS[seed % TIPS.length],
          offer: comebackOffer,
          whatsappUrl,
          phoneUrl,
        },
        footerNote: MEMBER_NOTE,
      });
      if (mail) {
        mail.json.meta = {
          key: member.key,
          stage: member.stage,
          name: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim(),
          aiLine: line !== STATIC_LINES[member.stage],
        };
        out.push(mail);
      }
    });
    return out;
  },

  /** Remembers the stages actually sent (failed e-mails are retried the next day). */
  recordSent() {
    const store = $getWorkflowStaticData('global');
    store.motivation = store.motivation ?? {};
    const prepared = $('Préparer · e-mails de motivation').all();
    let recorded = 0;
    let failed = 0;
    $input.all().forEach((item, index) => {
      const meta = prepared[item.pairedItem?.item ?? index]?.json?.meta;
      if (!meta) return;
      if (item.json.error) {
        failed++;
        return;
      }
      store.motivation[meta.key] = { at: new Date().toISOString(), stage: meta.stage, name: meta.name };
      recorded++;
    });
    return [{ json: { recorded, failed } }];
  },

  /** Monday summary for the owner: how many members got each stage during the last 7 days. */
  weeklySummary() {
    const store = $getWorkflowStaticData('global');
    const since = Date.now() - 7 * 86_400_000;
    const recent = Object.values(store.motivation ?? {}).filter((entry) => entry && Date.parse(entry.at) >= since);
    const count = (stage) => recent.filter((entry) => entry.stage === stage).length;
    const comeback = recent.filter((entry) => entry.stage === 'reprise').map((entry) => ({ title: entry.name, detail: `relancé(e) le ${shortDate(entry.at)}` }));
    const now = new Date();
    const out = email('motivationSummary', {
      to: OWNER,
      subject: `Motivation des membres : ${plural(recent.length, 'relance', 'relances')} cette semaine`,
      preheader: `${count('rappel')} rappels · ${count('motivation')} encouragements · ${count('reprise')} reprises · ${count('premiers-pas')} premiers pas`,
      vars: {
        weekLabel: weekRange(new Date(now.getTime() - 6 * 86_400_000), now),
        total: recent.length,
        rappel: count('rappel'),
        motivation: count('motivation'),
        reprise: count('reprise'),
        premiersPas: count('premiers-pas'),
        comebackHtml: listTable(comeback, 'Aucun membre absent depuis plus d’un mois cette semaine ✅'),
      },
    });
    return out ? [out] : [];
  },
};

/** Source of a function body, de-indented, for a Code node. */
export function bodyOf(fn) {
  const source = fn.toString();
  const body = source.slice(source.indexOf('{') + 1, source.lastIndexOf('}'));
  const lines = body.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  return lines.map((line) => line.slice(indent)).join('\n');
}
