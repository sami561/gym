export const meta = {
  name: 'meliora-review',
  description: 'Multi-angle review of a Meliora branch with adversarial verification of every finding',
  whenToUse: 'Before opening a PR to main. args: { base?: "main" }',
  phases: [
    { title: 'Find', detail: 'one reviewer per angle over the branch diff' },
    { title: 'Verify', detail: 'two independent skeptics try to refute each finding' },
  ],
}

const base = args?.base ?? 'main'

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          problem: { type: 'string' },
          scenario: { type: 'string', description: 'Concrete input/state that triggers it' },
        },
        required: ['file', 'problem', 'scenario'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['refuted', 'reason'],
}

const ANGLES = [
  ['security', 'auth and role checks on every gateway route, /api/me using the token user id only, secrets, QR anti-replay, geofence, webhook signatures, SQL built from input'],
  ['correctness', 'business rules: subscriptions and freezes, payments and KPIs (GMV/NMV/margins), bookings/waitlist/strikes, payroll, stock never negative, timezone Africa/Tunis date maths'],
  ['contracts', 'drift between backend/libs/common contracts, the gateway DTOs, the services, docs/API.md, web/src/api/types.ts and mobile/src/api/types.ts'],
  ['resilience', 'event handlers idempotent and order-independent, failures of other services handled, outbox/retries, read models reconciled'],
  ['frontend', 'web and mobile: error/empty/loading states, FR/EN/AR i18n with RTL, accessibility, the dashboard numbers matching the API'],
]

const verified = await pipeline(
  ANGLES,
  ([angle, focus]) =>
    agent(
      `Review the Meliora branch diff \`git diff ${base}...HEAD\` from the ${angle} angle: ${focus}.
Report only real defects with a concrete triggering scenario; no style nits. Do not modify files.`,
      { label: `find ${angle}`, phase: 'Find', schema: FINDINGS },
    ),
  (found, [angle]) =>
    parallel(
      (found?.findings ?? []).map((f) => () =>
        parallel(
          [0, 1].map((n) => () =>
            agent(
              `Skeptic #${n + 1}: try to REFUTE this ${angle} finding in the Meliora repo by reading the code.
${f.file}${f.line ? `:${f.line}` : ''} — ${f.problem}
Scenario: ${f.scenario}
Answer refuted=true if the scenario cannot happen or the code already handles it; if unsure, refuted=true.`,
              { label: `verify ${angle}`, phase: 'Verify', schema: VERDICT },
            ),
          ),
        ).then((votes) => ({ angle, ...f, confirmed: votes.filter(Boolean).filter((v) => !v.refuted).length === 2 })),
      ),
    ),
)

const all = verified.filter(Boolean).flat()
const confirmed = all.filter((f) => f.confirmed)
log(`${confirmed.length} confirmed of ${all.length} reported`)
return { confirmed, dismissed: all.length - confirmed.length }
