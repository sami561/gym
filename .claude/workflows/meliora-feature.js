export const meta = {
  name: 'meliora-feature',
  description: 'Contract-first feature delivery across backend services, gateway, web, mobile and n8n, with parallel builders and adversarial review',
  whenToUse: 'A Meliora feature that touches several parts of the monorepo. args: { feature: "what to build", parts?: ["backend","web","mobile","n8n","door-agent"] }',
  phases: [
    { title: 'Contracts', detail: 'plan the change and write shared contracts + docs/API.md first' },
    { title: 'Build', detail: 'one agent per part, each in its own folder' },
    { title: 'Review', detail: 'skeptical review of each part as soon as it is built' },
    { title: 'Verify', detail: 'typecheck, tests and builds for every touched part' },
  ],
}

const feature = typeof args === 'string' ? args : args?.feature
if (!feature) throw new Error('Pass args: { feature: "…" }')
const wanted = new Set(args?.parts ?? ['backend', 'web', 'mobile', 'n8n'])

const PLAN = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    contractChanges: { type: 'string', description: 'What was added to libs/common contracts, patterns, events and docs/API.md' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          part: { type: 'string', enum: ['backend', 'gateway', 'web', 'mobile', 'n8n', 'door-agent'] },
          folder: { type: 'string', description: 'The only folder this task may edit' },
          task: { type: 'string' },
        },
        required: ['part', 'folder', 'task'],
      },
    },
  },
  required: ['summary', 'contractChanges', 'tasks'],
}

const REVIEW = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          fixed: { type: 'boolean' },
        },
        required: ['file', 'problem', 'severity', 'fixed'],
      },
    },
  },
  required: ['findings'],
}

phase('Contracts')
const plan = await agent(
  `Feature for Meliora Gym: ${feature}

Plan it contract-first, following the meliora-add-microservice skill: decide which services own the new
data and patterns, then WRITE the shared pieces now — types in backend/libs/common/src/contracts,
PATTERNS / EVENTS (and WEBHOOK_EVENTS if n8n must receive it) in backend/libs/common/src/bus, and the
HTTP contract in docs/API.md — and make libs/common typecheck. Then split the remaining work into
tasks, one per folder (a backend service folder, backend/apps/api-gateway, web, mobile, n8n,
door-agent), only for these parts: ${[...wanted].join(', ')} (gateway counts as backend).
Do not run git.`,
  { label: 'contract plan', schema: PLAN },
)
log(`Plan: ${plan.summary}`)
const tasks = plan.tasks.filter((t) => wanted.has(t.part) || (t.part === 'gateway' && wanted.has('backend')))
const skipped = plan.tasks.length - tasks.length
if (skipped) log(`${skipped} planned task(s) outside the requested parts were not run`)

const results = await pipeline(
  tasks,
  (t) =>
    agent(
      `Meliora feature: ${feature}
Shared contracts are already written (${plan.contractChanges}).
Your task (${t.part}): ${t.task}
Edit ONLY files under ${t.folder}. Other agents edit the other folders at the same time. Do not run git.
Follow the repo skills (contracts are the source of truth; French user-facing messages; FR/EN/AR i18n
in web and mobile). Verify your part (typecheck, unit tests, build) before finishing and report
what you changed and what you verified.`,
      { label: `build ${t.part}`, phase: 'Build' },
    ),
  (built, t) =>
    agent(
      `Review the changes just made in ${t.folder} for this Meliora feature: ${feature}.
Builder report: ${built}
Look for real defects only: contract drift with backend/libs/common, missing auth/role checks,
unvalidated input, wrong money/date/timezone handling, missing French error messages, broken i18n,
race conditions in services. Fix each confirmed defect in place (same folder only, no git) and
report every finding with fixed=true/false.`,
      { label: `review ${t.part}`, phase: 'Review', schema: REVIEW },
    ).then((review) => ({ part: t.part, folder: t.folder, built, review })),
)

phase('Verify')
const touched = results.filter(Boolean).map((r) => r.folder)
const verification = await agent(
  `Verify the Meliora feature "${feature}" end to end. Touched folders: ${touched.join(', ')}.
Run the relevant checks: backend typecheck/jest/nest build of the touched apps (libs/common too),
web npm run build, mobile npx tsc --noEmit and expo lint, n8n npm run check, door-agent npm test.
If the backend stack can be started (see meliora-run-stack skill), exercise the new endpoints
through the gateway. Do not run git. Report pass/fail per check with the key output lines.`,
  { label: 'verify' },
)

return {
  plan: plan.summary,
  contracts: plan.contractChanges,
  parts: results.filter(Boolean).map((r) => ({
    part: r.part,
    unfixed: r.review?.findings?.filter((f) => !f.fixed) ?? [],
  })),
  verification,
}
