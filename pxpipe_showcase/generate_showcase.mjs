import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const corpusDir = path.join(root, 'corpus');
fs.mkdirSync(corpusDir, { recursive: true });

for (const name of fs.readdirSync(corpusDir)) {
  fs.unlinkSync(path.join(corpusDir, name));
}

const tenants = ['atlas', 'beacon', 'cinder', 'delta', 'ember', 'flux', 'grove'];
const services = ['auth', 'billing', 'search', 'queue', 'edge', 'lake', 'metrics', 'notebook'];
const regions = ['iad', 'sfo', 'fra', 'sin'];
const owners = ['ari', 'bo', 'cy', 'dee', 'eli', 'fay', 'gus', 'hal'];
const risks = ['low', 'medium', 'high'];
const decisions = ['approve', 'deny', 'review'];

const state = Object.fromEntries(tenants.map((tenant, i) => [
  tenant,
  {
    owner: owners[i],
    budget: 180000 + i * 32000,
    service_anchor: services[i % services.length],
  },
]));
const regionDecisionCounts = Object.fromEntries(regions.map((region) => [
  region,
  { approve: 0, deny: 0, review: 0 },
]));
const serviceBudgetTotals = Object.fromEntries(services.map((service) => [service, 0]));

let seq = 0;
const rows = [];
function row(obj) {
  rows.push(JSON.stringify({ seq: String(seq++).padStart(5, '0'), ...obj }));
}

for (let day = 1; day <= 36; day++) {
  for (const tenant of tenants) {
    for (const service of services) {
      const tenantIndex = tenants.indexOf(tenant);
      const serviceIndex = services.indexOf(service);
      const region = regions[(day + tenantIndex + serviceIndex) % regions.length];
      const decision = decisions[(day * 3 + tenantIndex + serviceIndex * 2) % decisions.length];
      const budget = 9000 + ((day * 431 + tenantIndex * 997 + serviceIndex * 277) % 19000);
      const risk = risks[(day + serviceIndex) % risks.length];
      regionDecisionCounts[region][decision] += 1;
      serviceBudgetTotals[service] += budget;
      row({
        ts: `2026-06-${String(day).padStart(2, '0')}T${String((8 + serviceIndex) % 24).padStart(2, '0')}:15:00Z`,
        type: 'decision',
        tenant,
        service,
        region,
        decision,
        budget,
        risk,
        note: `dense-ledger policy=${tenant}:${service}:${region}:${risk}; keep aggregate, not exact id`,
      });
    }
  }

  if ([6, 13, 21, 30, 35].includes(day)) {
    for (const tenant of tenants) {
      const i = tenants.indexOf(tenant);
      const owner = owners[(day + i * 2) % owners.length];
      const budget = 240000 + day * 7300 + i * 41500;
      state[tenant].owner = owner;
      state[tenant].budget = budget;
      state[tenant].service_anchor = services[(day + i) % services.length];
      row({
        ts: `2026-06-${String(day).padStart(2, '0')}T22:45:00Z`,
        type: 'tenant_state_update',
        tenant,
        owner,
        budget,
        service_anchor: state[tenant].service_anchor,
        region: regions[(day + i) % regions.length],
        rule: 'last tenant_state_update wins',
        note: `state mutation for ${tenant}; summarize final state only`,
      });
    }
  }
}

const shardCount = 12;
for (let shard = 0; shard < shardCount; shard++) {
  const lines = rows.filter((_, index) => index % shardCount === shard);
  fs.writeFileSync(
    path.join(corpusDir, `dense_ledger_${String(shard + 1).padStart(2, '0')}.jsonl`),
    `${lines.join('\n')}\n`,
  );
}

const topServices = Object.entries(serviceBudgetTotals)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([service, budget]) => ({ service, budget }));

const highBudgetTenants = Object.entries(state)
  .filter(([, value]) => value.budget >= 500000)
  .map(([tenant, value]) => ({ tenant, budget: value.budget, owner: value.owner }))
  .sort((a, b) => a.tenant.localeCompare(b.tenant));

const golden = {
  final_tenant_state: state,
  region_decision_counts: regionDecisionCounts,
  top_three_services_by_budget: topServices,
  high_budget_tenants: highBudgetTenants,
  grading_note: 'Exact seq values and opaque note fragments are intentionally irrelevant.',
};

fs.writeFileSync(path.join(root, 'golden_answer.json'), `${JSON.stringify(golden, null, 2)}\n`);

const prompt = `Read every JSONL file under pxpipe_showcase/corpus.

Use only those files. Treat tenant_state_update records as state mutations where the last update by timestamp wins. Treat decision records as additive ledger entries.

Return compact JSON with exactly these keys:
- final_tenant_state: tenant -> { owner, budget, service_anchor }
- region_decision_counts: region -> { approve, deny, review }
- top_three_services_by_budget: array of { service, budget }, descending
- high_budget_tenants: tenants whose final budget is at least 500000, sorted by tenant

Do not quote seq values, opaque note fragments, hashes, or any byte-exact identifiers. This test is about aggregate/state recovery from dense context, not OCR-perfect recall.
`;

fs.writeFileSync(path.join(root, 'test_prompt.md'), prompt);

const readme = `# pxpipe Token Savings Showcase

This is a model-agnostic pxpipe test case. It works best with any model that can read dense text rendered as images well enough for state tracking and aggregate recall.

## Why this case is good

- The corpus is dense JSONL, which is where image context can beat plain text tokens.
- The task asks for final state and aggregates, which are useful model behaviors to test.
- It avoids exact hashes, IDs, and secrets because dense image reads are not byte-exact.
- The expected answer is in \`golden_answer.json\`, so you can grade correctness separately from token savings.

## Run the A/B

Plain control:

\`\`\`powershell
# Use your normal model/client with no proxy.
# Ask it to read pxpipe_showcase/corpus and answer using pxpipe_showcase/test_prompt.md.
\`\`\`

pxpipe arm:

\`\`\`powershell
# Terminal 1. Replace the model base with the vision-capable model you want to test.
$env:PXPIPE_MODELS="gpt-5.6"
pxpipe

# Terminal 2 for Anthropic-style clients:
$env:ANTHROPIC_BASE_URL="http://127.0.0.1:47821"
claude

# Terminal 2 for OpenAI-compatible clients:
$env:OPENAI_BASE_URL="http://127.0.0.1:47821/v1"
\`\`\`

Then give the model this prompt:

\`\`\`text
$(Get-Content .\\pxpipe_showcase\\test_prompt.md -Raw)
\`\`\`

## What to measure

Open the dashboard at http://127.0.0.1:47821/ and compare the recorded baseline input against actual input. The useful claim is not a universal dollar number; it is whether the same answer matches \`golden_answer.json\` while the request input shrinks.

For GPT/OpenAI-compatible traffic, the proxy can use image-token accounting for imaged blocks. For Anthropic traffic, pxpipe also records a text-only count_tokens counterfactual in \`~/.pxpipe/events.jsonl\` when the upstream supports it.
`;

fs.writeFileSync(path.join(root, 'README.md'), readme);

console.log(`wrote ${rows.length} ledger rows across ${shardCount} shards`);
console.log(`corpus chars: ${rows.join('\n').length}`);
console.log(`golden answer: ${path.join(root, 'golden_answer.json')}`);
