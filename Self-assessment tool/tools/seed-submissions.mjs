/**
 * Puts test submissions into the store.
 *
 *   node tools/seed-submissions.mjs --dry     what it would write, and nothing else
 *   node tools/seed-submissions.mjs           writes them
 *
 * WHY THIS EXISTS. The first three were made by hand through the submitter page, which took
 * half an hour and produced three submissions that were all the same shape: every question
 * answered, every one Unclassified, every one ready. An assessor screen tested only against
 * that has never been shown a draft, a Protected B marking, a half-finished assessment, a
 * question marked not applicable, or a score at either end of the scale.
 *
 * So this writes variety on purpose. Each entry below says what it is for.
 *
 * WHAT MAKES THEM REMOVABLE. meta.appVersion is 'seed' on every record this writes, which is
 * what the first three carry and what tells a real submission from a made-up one. They carry no
 * owner address either, so nobody's account is attached to them.
 *
 * THEY ARE REAL RECORDS IN THE REAL STORE. There is no test store. The twelve-character code is
 * the document name, the rules grant a read on it, and anybody holding one can open it. That is
 * the design, and it is why none of the wording below names a real initiative, a real contact,
 * or anything a department would mind being read.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DRY = process.argv.includes('--dry');

const cfg = JSON.parse(await readFile(join(ROOT, '..', 'deploy', 'firebase-config.json'), 'utf8'));
const rubric = JSON.parse(await readFile(join(ROOT, 'rubric', 'rubric.v1-dan.json'), 'utf8'));
const BASE = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;

const QUESTIONS = rubric.domains.flatMap((d) => d.sections.flatMap((s) => s.questions.map((q) => q.id)));

/** The alphabet the tool mints codes from. It omits I, O, 0 and 1 so nobody misreads one aloud. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A code worked out from the name rather than drawn at random, so running this twice does not
 * quietly make a second copy of everything: the store refuses a document that already exists.
 */
function codeFor(name) {
  let h = 0x811c9dc5;
  for (const c of name) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  let out = '';
  for (let i = 0; i < 12; i++) { out += ALPHABET[h % ALPHABET.length]; h = Math.imul(h ^ i, 0x01000193) >>> 0; }
  return out;
}

/** Repeatable noise, so the same seed produces the same assessment every time. */
function roll(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const SAID = [
  'Documented and reviewed at the last architecture board.',
  'Known, not written down anywhere somebody else could find.',
  'Partly. The current state is mapped; the target is not.',
  'Owned by one person who is leaving in the spring.',
  'Held in the vendor’s documentation rather than ours.',
  'Measured monthly and reported to the department’s committee.',
];

/**
 * `band` is where the scores sit on the eleven-point scale, `answered` how much of the set has
 * been filled in, `na` how much of it is marked not applicable, and `said` how often a score
 * carries the submitter’s reasoning.
 */
function answersFor({ seed, band, answered, na, said }) {
  const r = roll(seed);
  const out = {};
  for (const id of QUESTIONS) {
    if (r() > answered) continue;
    if (r() < na) { out[id] = { score: null, na: true, justification: '', evidence: [] }; continue; }
    const spread = band[1] - band[0];
    const score = Math.max(0, Math.min(10, Math.round(band[0] + r() * spread)));
    out[id] = {
      score,
      na: false,
      justification: r() < said ? SAID[Math.floor(r() * SAID.length)] : '',
      evidence: [],
    };
  }
  return out;
}

const NOW = new Date().toISOString();

/* --------------------------------------------------------------------------------------- *
 * Each of these exists to put something on the assessor's screen that was never there.
 * ----------------------------------------------------------------------------------------- */
const WANTED = [
  {
    why: 'A draft. Nobody has pressed send, and the assessor list has never shown one that was '
       + 'not also nearly finished.',
    name: 'Digital Credentials Wallet',
    department: 'Treasury Board of Canada Secretariat',
    stage: 'discovery', marking: 'Unclassified',
    seed: 11, band: [1, 4], answered: 0.24, na: 0.02, said: 0.3,
    ready: false,
  },
  {
    why: 'Protected B, and weak. The marking has only ever been Unclassified here, and no '
       + 'submission has sat at the bottom of the scale with every question answered.',
    name: 'Case Management Modernization',
    department: 'Canada Border Services Agency',
    stage: 'alpha', marking: 'Protected B',
    seed: 22, band: [1, 3], answered: 1, na: 0.08, said: 0.55,
    ready: true,
  },
  {
    why: 'The top of the scale, and a late lifecycle stage. Everything seeded so far scores in '
       + 'the middle, so nothing has shown what a strong assessment looks like beside a weak one.',
    name: 'Payroll Data Hub',
    department: 'Public Services and Procurement Canada',
    stage: 'maturity', marking: 'Protected A',
    seed: 33, band: [7, 10], answered: 1, na: 0.01, said: 0.8,
    ready: true,
  },
  {
    why: 'A solution being turned off, which the stage multipliers treat differently from one '
       + 'being built. Sunset has never been seeded.',
    name: 'Legacy Grants Portal',
    department: 'Agriculture and Agri-Food Canada',
    stage: 'sunset', marking: 'Unclassified',
    seed: 44, band: [2, 8], answered: 0.95, na: 0.18, said: 0.4,
    ready: true,
  },
  {
    why: 'Sent while still unfinished. A department can mark an assessment ready with questions '
       + 'left blank, and no seeded record has ever done it, so the completeness column has '
       + 'never shown anything but a full one or a draft.',
    name: 'Immigration Appointment Booking',
    department: 'Immigration, Refugees and Citizenship Canada',
    stage: 'stabilization', marking: 'Protected A',
    seed: 55, band: [4, 7], answered: 0.71, na: 0.04, said: 0.5,
    ready: true,
  },
];

function recordFor(w) {
  const code = codeFor(w.name);
  const answers = answersFor(w);
  const meta = { createdAt: NOW, updatedAt: NOW, appVersion: 'seed', savedOnlineAt: NOW };
  if (w.ready) meta.submittedAt = NOW;
  return {
    code,
    answered: Object.keys(answers).length,
    body: {
      fileType: 'gc-arch-assessment',
      formatVersion: 1,
      ref: code.slice(0, 4),
      rubric: { id: rubric.id, version: rubric.version, title: rubric.title },
      initiative: {
        name: w.name,
        department: w.department,
        contact: 'nobody@example.gc.ca',
        lifecycleStage: w.stage,
        summary: `Invented for testing. ${w.why}`,
        classification: w.marking,
      },
      answers,
      meta,
    },
  };
}

/** Firestore's REST shape. Written out rather than pulled in, because src/ is bundled for a browser. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

const group = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;

console.log(`\n${WANTED.length} submissions, ${QUESTIONS.length} questions in the set.\n`);
let made = 0;
for (const w of WANTED) {
  const rec = recordFor(w);
  const na = Object.values(rec.body.answers).filter((a) => a.na).length;
  const scored = Object.values(rec.body.answers).filter((a) => !a.na);
  const mean = scored.length
    ? (scored.reduce((s, a) => s + a.score, 0) / scored.length).toFixed(1) : '--';
  console.log(`  ${group(rec.code)}  ${w.name}`);
  console.log(`      ${w.department}`);
  console.log(`      ${w.stage}, ${w.marking}, ${w.ready ? 'ready' : 'draft'}, `
    + `${rec.answered} of ${QUESTIONS.length} answered, ${na} not applicable, mean ${mean}`);

  if (DRY) { console.log(''); continue; }
  const r = await fetch(`${BASE}/assessments?documentId=${rec.code}&key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: toValue(rec.body).mapValue.fields }),
  });
  if (r.ok) { made++; console.log('      written\n'); }
  else {
    const t = await r.text();
    // A code that is already there is the ordinary answer to running this twice, not a fault.
    console.log(`      NOT written: ${r.status} ${t.slice(0, 160)}\n`);
  }
}
console.log(DRY ? 'Nothing written. Drop --dry to write them.\n' : `${made} of ${WANTED.length} written.\n`);
