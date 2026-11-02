# Designing the interfaces with Claude Design

1. Open Claude Design and start a new project.
2. Attach these five files to the first message:
   - `docs/design/claude-design-brief.md` (the full brief, ~23,000 words: too long to paste)
   - `assets/images/logo.jpg`, `facade.jpg`, `shield-sign.jpg`, `interior.jpg`
3. Paste the prompt below and send it. Claude Design answers with a one-page plan (pass 0);
   review it, then ask for the next pass. Each pass ends with a stop for your review.

---

You are designing every interface of the Meliora Gym platform (an independent gym in Sousse,
Tunisia): the member mobile app (iOS and Android), the admin back-office, the public website and
the transactional e-mails, in French (default), English and Arabic (right-to-left).

Attached:
- `claude-design-brief.md` — the complete brief and the source of truth: design system, colour and
  type tokens, exact French copy, mock data, every screen and state (APP-01…, ADM-01…, WEB-01…,
  EML-01…), breakpoints, signature moments, naming/handoff rules and a "Do not" list. Use its copy
  word for word.
- Four real photos of the gym: `logo.jpg`, `facade.jpg`, `shield-sign.jpg`, `interior.jpg`. They are
  the only photos you may use. Never redraw, recolour or crop the logo.

Work in the passes described in §0 of the brief and stop after each pass for my review:
0. Plan — one page: 4–6 core hex colours, type roles, ASCII wireframes for APP-05, ADM-03 and
   WEB-02, and what you changed so it doesn't look like a generic dark fitness/SaaS template.
1. Design system (§2) → 2. Member app (§5) with the clickable prototype → 3. Back-office (§6) →
4. Website (§7) → 5. E-mails (§8) → 6. Proposals (§10, optional) → 7. Handoff (§11).

Keep everything in one file built on shared components. Before starting, read §0–4, §9, §11 and
§12 of the brief. Start now with pass 0 only.
