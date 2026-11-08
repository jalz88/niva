// Dependency audit gate for CI (`npm run audit`).
//
// Same bar as `npm audit --audit-level=high` — fail on any high/critical advisory —
// except for advisories listed in ACCEPTED below, each with a written reason and a
// review date. Added 2026-11-08 because one high advisory (zod) has no upstream fix
// available and would otherwise block every push for an issue that cannot be
// exploited in this app. Anything not listed here still fails the build.
import { execFileSync } from 'node:child_process'

const ACCEPTED = {
  // Zod can exhaust memory validating oversized constrained collections (fixed only
  // in zod 4.x; @vee-validate/zod 4.x requires zod 3, so no upgrade path yet).
  // Exposure: zod runs only in the browser, validating one person's own form input
  // (src/lib/schemas/transaction.ts — no array/collection fields from outside).
  // Worst case is someone hanging their own tab. Review when vee-validate 5 lands.
  'GHSA-mrhx-c7xc-m3w5': 'zod memory exhaustion — client-side own-form validation only (review 2027-02)',
}

let raw
try {
  raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (e) {
  raw = e.stdout // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw)
if (report.error) {
  console.error('npm audit failed to run:', report.error.summary ?? report.error)
  process.exit(2)
}
const vulns = report.vulnerabilities ?? {}

// A vulnerability is accepted only if every advisory it carries is accepted, and
// every vulnerable package it merely depends on is accepted too.
const memo = new Map()
function isAccepted(name, seen = new Set()) {
  if (memo.has(name)) return memo.get(name)
  if (seen.has(name)) return true
  seen.add(name)
  const v = vulns[name]
  const ok = (v?.via ?? []).every((via) => {
    if (typeof via === 'string') return isAccepted(via, seen)
    const id = (via.url ?? '').split('/').pop()
    return id in ACCEPTED
  })
  memo.set(name, ok)
  return ok
}

const blocking = Object.entries(vulns)
  .filter(([, v]) => v.severity === 'high' || v.severity === 'critical')
  .filter(([name]) => !isAccepted(name))
  .map(([name, v]) => `${v.severity.padEnd(8)} ${name}`)

const accepted = Object.entries(vulns)
  .filter(([, v]) => v.severity === 'high' || v.severity === 'critical')
  .filter(([name]) => isAccepted(name))
  .map(([name]) => name)

if (accepted.length) console.log(`Accepted (documented in scripts/audit-check.mjs): ${accepted.join(', ')}`)
if (blocking.length) {
  console.error('High/critical vulnerabilities found:\n' + blocking.join('\n') + '\nRun `npm audit` for details.')
  process.exit(1)
}
console.log('No unaccepted high/critical vulnerabilities.')
