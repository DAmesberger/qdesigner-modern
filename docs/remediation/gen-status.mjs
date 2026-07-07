import fs from 'node:fs'
const DIR = '/tmp/claude-1000/-home-dev-dev-qdesigner-modern/f4805726-a631-46c7-816f-6c10e8021dbe/scratchpad'
const REPO = '/home/dev/dev/qdesigner-modern/docs/remediation'
const R = JSON.parse(fs.readFileSync(`${DIR}/roadmap.json`, 'utf8'))
let ST = {}; try { ST = JSON.parse(fs.readFileSync(`${REPO}/status.json`, 'utf8')) } catch {}
const byId = {}; for (const t of R.tasks) byId[t.id]={...t,kind:'task'}; for (const e of R.epics) byId[e.id]={...e,kind:'epic'}
const SHORT = { 'Online + offline fillout completeness':'Offline Fillout','Full-precision reaction suite (audio/video/image + precision keying)':'Reaction Suite','Fully programmable questionnaire flow (SOTA psych 2026)':'Programmable Flow','Instant offline feedback suite (stats/graphs/baselines, designable)':'Feedback Suite','Complete RBAC / roles / projects / multi-tenant':'RBAC / Multi-tenant' }
const LABEL = { merged:'✅ merged', 'in-review':'👀 in-review', 'in-worktree':'🔨 in-worktree', deferred:'⏭️ deferred', blocked:'🚫 blocked' }
const isDone = (id) => ST[id] === 'merged'
const line = (id) => { const u = byId[id]; if(!u) return `- [ ] \`${id}\` — (unresolved)`
  const grp = u.kind==='task' ? u.phase_id : (SHORT[u.pillar]||u.pillar)
  const st = ST[id] || 'pending'
  return `- [${isDone(id)?'x':' '}] \`${id}\` · ${u.kind} · ${u.effort}/${u.risk} · ${grp} — ${u.title}  \n      status: **${LABEL[st]||st}**` }
const mtitle = (m) => m.milestone.replace(/^M\d+\s*—\s*/,'')
let out = `# Implementation status — QDesigner 2026 roadmap

> **Source of truth:** \`roadmap.json\`. **This file is the ledger** (regenerated from \`status.json\`). \`implement-phase.mjs\` / supervised batches are the executor.
> ${Object.values(ST).filter(s=>s==='merged').length} / ${R.counts.units} units merged.

**Legend:** \`pending\` → \`🔨 in-worktree\` → \`👀 in-review\` → \`✅ merged\` (diff merged + gate green) · \`⏭️ deferred\` · \`🚫 blocked\`

## Milestone progress

| Milestone | Units | Merged | Status |
|---|---|---|---|
`
R.synthesis.milestones.forEach((m,i)=>{ const done=m.includes.filter(isDone).length; const status=done===0?'⬜ not started':done===m.includes.length?'✅ complete':`🔨 ${done}/${m.includes.length}`; out += `| **M${i+1}** ${mtitle(m)} | ${m.includes.length} | ${done} | ${status} |\n` })
out += `\n---\n`
R.synthesis.milestones.forEach((m,i)=>{
  out += `\n## M${i+1} — ${mtitle(m)}\n\n**Goal:** ${m.goal}\n\n**Exit gate:** ${m.gate}\n\n**Proven by:** ${m.exit_demo}\n\n**Run:** \`Workflow({ scriptPath: 'docs/remediation/implement-phase.mjs', args: { milestone: 'M${i+1}' } })\`\n\n`
  const tasks=m.includes.filter(id=>byId[id]&&byId[id].kind==='task'), epics=m.includes.filter(id=>byId[id]&&byId[id].kind==='epic')
  if(tasks.length){ out += `### Remediation fixes (${tasks.length})\n${tasks.map(line).join('\n')}\n\n` }
  if(epics.length){ out += `### New capability (${epics.length})\n${epics.map(line).join('\n')}\n\n` }
})
fs.writeFileSync(`${REPO}/STATUS.md`, out)
console.log('STATUS.md updated —', Object.values(ST).filter(s=>s==='merged').length, 'merged /', R.counts.units)
