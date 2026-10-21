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
 * A code worked out from the name, so running this twice does not quietly make a second copy
 * of everything: the store refuses a document that already exists.
 *
 * IT COLLIDED, AND AT EIGHTEEN NAMES IT COLLIDED FOUR TIMES. The first version took
 * `h % 32` for each character and then stepped the state with `h ^ i`, where i is 0 to 11.
 * Both of those touch only the low bits: the step changed almost nothing the next modulo
 * would read, so twelve characters carried about as much information as three. Four of the
 * eighteen names below came out as L8P7-44PT-C8XP.
 *
 * A collision is not a cosmetic fault here. The code IS the document name and the access
 * code, so two records sharing one means the second write is refused and whoever holds that
 * code reaches a submission that is not theirs.
 *
 * So each character is taken from the top of the word, where the avalanche actually reaches,
 * and the state is stepped by a full mix rather than by xor with a small number. Checked
 * below: the run stops before writing anything if any two codes match.
 */
function codeFor(name) {
  let h = 0x811c9dc5;
  for (const c of name) { h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; }
  let out = '';
  for (let i = 0; i < 12; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    out += ALPHABET[(h >>> 27) % ALPHABET.length];
  }
  return out;
}

/**
 * The five that were written before the hash was fixed keep the codes they already have.
 *
 * Their documents are in the store under the old codes, and an access code is the one thing
 * about a record that cannot be changed: it is the document's name. Rewriting them would leave
 * the originals orphaned and hand out codes that reach nothing.
 *
 * Every pair below was read back off the store before it was written here. The first attempt
 * took them off the old dry run's printed output, where four names shared one code, and two of
 * the five came out against the wrong name: Payroll Data Hub was given a code that reaches
 * nothing and Legacy Grants Portal was given Payroll's. A list printed by a function that
 * collides cannot be read by position.
 */
const ALREADY_WRITTEN = {
  'Digital Credentials Wallet': 'L8P744PTC8XP',
  'Case Management Modernization': 'XRL2B9Q2P9C2',
  'Payroll Data Hub': 'TDGN754WKVQN',
  'Legacy Grants Portal': 'BVY6PMLE3D86',
  'Immigration Appointment Booking': 'HFNLM7JLZPNU',
};

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

  /* ------------------------------------------------------------------------------------- *
   * THIRTEEN MORE, ALL READY, ASKED FOR ON 20 OCTOBER: SEVENTEEN SUBMISSIONS THAT ARE NOT
   * DRAFTS.
   *
   * Four of the five above are ready, so these thirteen take the ready count to seventeen.
   * The draft stays a draft: it is the only one in the store and it is what the Drafts button
   * and the dashboard's exclusion are tested against.
   *
   * They are spread on purpose rather than generated. Every lifecycle stage carries at least
   * two, every marking carries at least four, and the scores run from the bottom of the scale
   * to the top so the deviation, the outliers and the routing bands all have something to
   * separate. A pool that is twenty copies of one shape tells an assessor nothing and tells a
   * room watching a demonstration less.
   * ------------------------------------------------------------------------------------- */
  {
    why: 'Discovery with a strong score, which the pool has never held: early and confident '
       + 'reads differently from early and unsure, and the routing bands treat them alike.',
    name: 'Benefits Delivery Platform',
    department: 'Employment and Social Development Canada',
    stage: 'discovery', marking: 'Protected B',
    seed: 66, band: [6, 9], answered: 1, na: 0.03, said: 0.75,
    ready: true,
  },
  {
    why: 'Beta, mid-scale, every question answered and almost nothing written. It is the shape '
       + 'an assessor meets most and the pool had none of it.',
    name: 'Clinical Trials Registry',
    department: 'Health Canada',
    stage: 'beta', marking: 'Protected A',
    seed: 77, band: [4, 6], answered: 1, na: 0.02, said: 0.12,
    ready: true,
  },
  {
    why: 'A fifth of the set marked not applicable, which nothing here has done. Whether the '
       + 'weights hold up when a domain is largely skipped is the question it asks.',
    name: 'Seismic Survey Archive',
    department: 'Natural Resources Canada',
    stage: 'maturity', marking: 'Unclassified',
    seed: 88, band: [5, 8], answered: 1, na: 0.21, said: 0.6,
    ready: true,
  },
  {
    why: 'Growth, and the widest spread in the pool: strong in places and poor in others, so '
       + 'the standard deviation and the category readings have something to disagree about.',
    name: 'Fleet Monitoring Service',
    department: 'Fisheries and Oceans Canada',
    stage: 'growth', marking: 'Protected B',
    seed: 99, band: [1, 9], answered: 1, na: 0.05, said: 0.45,
    ready: true,
  },
  {
    why: 'Sent with a third of the set blank, further than any other. The completeness column '
       + 'has shown a full one and a nearly full one and nothing between.',
    name: 'Rail Safety Reporting',
    department: 'Transport Canada',
    stage: 'alpha', marking: 'Unclassified',
    seed: 111, band: [3, 6], answered: 0.64, na: 0.06, said: 0.35,
    ready: true,
  },
  {
    why: 'The bottom of the scale with every question answered and a reason on almost all of '
       + 'them. A weak assessment written carefully is the one an assessor has to read.',
    name: 'Survey Collection Redesign',
    department: 'Statistics Canada',
    stage: 'stabilization', marking: 'Protected B',
    seed: 122, band: [0, 2], answered: 1, na: 0.02, said: 0.9,
    ready: true,
  },
  {
    why: 'Sunset at the top of the scale. Everything retiring here has scored badly, which '
       + 'reads as though the stage caused it.',
    name: 'Pension Records Retirement',
    department: 'Veterans Affairs Canada',
    stage: 'sunset', marking: 'Protected A',
    seed: 133, band: [7, 9], answered: 1, na: 0.12, said: 0.7,
    ready: true,
  },
  {
    why: 'Growth, Unclassified, mid-scale and wordless. Two in the same stage that look nothing '
       + 'alike is what makes a stage column worth reading.',
    name: 'Taxpayer Correspondence Hub',
    department: 'Canada Revenue Agency',
    stage: 'growth', marking: 'Unclassified',
    seed: 144, band: [4, 7], answered: 0.97, na: 0.01, said: 0.08,
    ready: true,
  },
  {
    why: 'Beta and weak, against the beta above it that is neither. The pool has never held two '
       + 'records at one stage at opposite ends of the scale.',
    name: 'Air Quality Index Feed',
    department: 'Environment and Climate Change Canada',
    stage: 'beta', marking: 'Unclassified',
    seed: 155, band: [1, 4], answered: 0.93, na: 0.07, said: 0.5,
    ready: true,
  },
  {
    why: 'Discovery and poor, which is the ordinary start and the one the pool was missing '
       + 'once the strong discovery above arrived.',
    name: 'Spectrum Licensing Rebuild',
    department: 'Innovation, Science and Economic Development Canada',
    stage: 'discovery', marking: 'Protected A',
    seed: 166, band: [0, 3], answered: 0.88, na: 0.04, said: 0.4,
    ready: true,
  },
  {
    why: 'Maturity, Protected B, scores clustered tightly in the middle. A record with almost '
       + 'no spread is what an outlier has to stand out from.',
    name: 'Visitor Pass Issuance',
    department: 'Parks Canada',
    stage: 'maturity', marking: 'Protected B',
    seed: 177, band: [5, 6], answered: 1, na: 0.03, said: 0.55,
    ready: true,
  },
  {
    why: 'Stabilization, strong, and every answer carrying a reason. It is what a well-run '
       + 'assessment looks like, and the assessor screen has never had one to compare against.',
    name: 'Network Segmentation Programme',
    department: 'Shared Services Canada',
    stage: 'stabilization', marking: 'Protected B',
    seed: 188, band: [7, 10], answered: 1, na: 0.02, said: 0.95,
    ready: true,
  },
  {
    why: 'Alpha, Protected A, middling and half-explained. The third alpha in the pool and the '
       + 'only one carrying a marking above Unclassified.',
    name: 'Digitisation Intake Queue',
    department: 'Library and Archives Canada',
    stage: 'alpha', marking: 'Protected A',
    seed: 199, band: [3, 7], answered: 0.91, na: 0.09, said: 0.5,
    ready: true,
  },
];

function recordFor(w) {
  const code = ALREADY_WRITTEN[w.name] ?? codeFor(w.name);
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

/**
 * Nothing is written until every code is its own.
 *
 * Two records cannot share one: the code is the document's name, so the second write is refused
 * and whoever holds that code reaches a submission that is not theirs. Checked here rather than
 * discovered as a already-exists error halfway through a run that has already written nine.
 */
{
  const seen = new Map();
  const clashes = [];
  for (const w of WANTED) {
    const code = ALREADY_WRITTEN[w.name] ?? codeFor(w.name);
    if (seen.has(code)) clashes.push(`${code}: ${seen.get(code)} and ${w.name}`);
    seen.set(code, w.name);
  }
  if (clashes.length) {
    console.error(`\nTwo submissions want one access code, so nothing was written:\n  ${clashes.join('\n  ')}\n`);
    process.exit(1);
  }
}

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
