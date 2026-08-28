/**
 * Turns Dan's exported spreadsheet into rubric/rubric.v1-dan.json.
 *
 * Re-run it whenever he sends a new version of the workbook - the sheets are the source of
 * truth for content, this file is the source of truth for how that content becomes a rubric.
 *
 *   node tools/import-rubric.mjs
 *
 * The sheets are Windows-1252, and the section rows carry their weight in the row label,
 * so both are handled here rather than in the app.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const KB = '../EARB target state knowledge base';
const OUT = 'rubric/rubric.v1-dan.json';

const DOMAINS = [
  { sheet: 'Business Architecture',      id: 'business',    label: 'Business Architecture' },
  { sheet: 'Data & Info Architecture',   id: 'data',        label: 'Data & Information Architecture' },
  { sheet: 'Application Architecture',   id: 'application', label: 'Application & Virtual Architecture' },
  { sheet: 'Technology Architecture',    id: 'technology',  label: 'Technology & Physical Architecture' },
];

/**
 * The only stage rule taken from structure rather than invented: a "Defining the Current
 * State" section asks about a solution that already exists, so it counts for less when there
 * isn't one yet. Everything else counts normally until Dan says otherwise.
 */
const CURRENT_STATE_STAGE_RULE = { discovery: 'low-ok', alpha: 'low-ok' };

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * The sheets are Windows-1252. Node's TextDecoder falls through to latin-1 for that label,
 * which silently swallows the em dashes the section headers are delimited by - so the
 * 0x80-0x9F range is mapped explicitly here.
 */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

function decodeCp1252(buf) {
  let out = '';
  for (const b of buf) {
    out += b >= 0x80 && b <= 0x9f ? String.fromCharCode(CP1252_HIGH[b - 0x80]) : String.fromCharCode(b);
  }
  return out;
}

async function sheet(name) {
  const files = readdirSync(KB);
  const match = files.find((f) => f === `GC_EA_Assessment_Tool(${name}).csv`);
  if (!match) throw new Error(`No sheet named "${name}" in ${KB}`);
  const buf = await readFile(`${KB}/${match}`);
  return parseCsv(decodeCp1252(buf));
}

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const slug = (s) => clean(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- the 0-10 ladder -------------------------------------------------------------------
const scaleRows = await sheet('Assessment Scale');
const anchors = [];
for (const r of scaleRows) {
  const n = Number(clean(r[0]));
  if (!Number.isInteger(n) || clean(r[0]) === '') continue;
  anchors.push({ value: n, colour: clean(r[1]), name: clean(r[2]), label: clean(r[3]) });
}
if (anchors.length !== 11) throw new Error(`Expected 11 scale rows, got ${anchors.length}`);

// ---- the four domain sheets ------------------------------------------------------------
const warnings = [];
const domains = [];

for (const d of DOMAINS) {
  const rows = await sheet(d.sheet);
  const tagline = clean(rows[0]?.[0]).split('·').slice(1).join('·').trim();
  const domainWeight = Number(clean(rows[1]?.[0]).match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 25);

  const sections = [];
  let current = null;

  for (const r of rows.slice(2)) {
    const first = clean(r[0]);
    const qNum = clean(r[1]);
    const qText = clean(r[2]);

    const sectionHeader = first.match(/^(.*?)\s*[—–-]\s*Section weight:\s*(\d+(?:\.\d+)?)\s*%$/);
    if (sectionHeader) {
      current = {
        id: slug(sectionHeader[1]),
        label: clean(sectionHeader[1]),
        weight: Number(sectionHeader[2]),
        questions: [],
      };
      if (/defining the current state/i.test(current.label)) current.stageExpectation = CURRENT_STATE_STAGE_RULE;
      sections.push(current);
      continue;
    }

    if (/^Q\d+$/.test(qNum) && qText && current) {
      current.questions.push({ id: `${d.id.slice(0, 2).toUpperCase()}-${qNum}`, sheetRef: qNum, text: qText, weight: 1 });
    }
  }

  const sum = sections.reduce((s, x) => s + x.weight, 0);
  if (Math.abs(sum - 100) > 0.01) {
    warnings.push(`${d.label}: section weights sum to ${sum}%, not 100%. Imported as stated; the roll-up normalises, so scores stay out of 10 - but this looks like a gap in the workbook.`);
  }
  const empty = sections.filter((s) => !s.questions.length).map((s) => s.label);
  if (empty.length) warnings.push(`${d.label}: sections with no questions: ${empty.join(', ')}`);

  domains.push({ id: d.id, label: d.label, weight: domainWeight, description: tagline, sections });
}

// ---- lifecycle stages, our addition ----------------------------------------------------
const lifecycleStages = [
  { id: 'discovery',     label: 'Create - Discovery',   dlgPage: 'Create phase', blurb: 'Understanding the problem. There may be no current solution to describe yet.' },
  { id: 'alpha',         label: 'Create - Alpha',       dlgPage: 'Create phase', blurb: 'Testing whether an approach can work, with real users.' },
  { id: 'beta',          label: 'Create - Beta',        dlgPage: 'Create phase', blurb: 'Building the real thing in public, at growing scale.' },
  { id: 'stabilization', label: 'Live - Stabilization', dlgPage: 'Live phase',   blurb: 'In service, settling down. Costs and operations should be known.' },
  { id: 'growth',        label: 'Live - Growth',        dlgPage: 'Live phase',   blurb: 'In service, scaling up.' },
  { id: 'maturity',      label: 'Live - Maturity',      dlgPage: 'Live phase',   blurb: 'In service, steady state. Everything should be documented and measured.' },
  { id: 'sunset',        label: 'Sunset',               dlgPage: 'Sunset phase', blurb: 'Replacing or retiring. Dependencies and data disposition matter most.' },
];

const rubric = {
  fileType: 'gc-arch-rubric',
  formatVersion: 2,
  id: 'gc-ea-assessment',
  version: '1.0-dan',
  status: 'draft',
  title: 'GC Enterprise Architecture self-assessment',
  provenance:
    'Imported by tools/import-rubric.mjs from Dan\'s GC_EA_Assessment_Tool workbook (6 sheets) in "EARB target state knowledge base". Questions, section names, section weights, domain weights and the 0-10 ladder are all his. Added by us and marked as such: lifecycle stages, the stage rule on "Defining the Current State" sections, and the routing bands.',
  dlgBaseUrl: '',
  dlgBaseUrlNote: 'Set once the Digital Lifecycle Guide is live on GCXchange. Empty means stage links render as plain text.',
  importWarnings: warnings,

  scale: { min: 0, max: 10, anchors },

  maturityBands: [
    { min: 9, label: 'Leading Practice', detail: 'Predictive, self-optimizing, fully aligned with business strategy.' },
    { min: 7, label: 'Advanced',         detail: 'Hardened, scalable, and modular. Demonstrably high-quality architecture.' },
    { min: 5, label: 'Baseline Ready',   detail: 'Core capabilities present and stable. Meets minimum GC EA expectations.' },
    { min: 3, label: 'Developing',       detail: 'Foundational elements exist but architecture is immature and at risk under stress.' },
    { min: 0, label: 'Critical Risk',    detail: 'Immediate intervention required. Core capabilities absent or severely compromised.' },
  ],
  maturityBandsNote: "Dan's own reference guide, from the Summary Dashboard sheet.",

  bands: [
    { id: 'showcase', min: 8.5, label: 'Showcase',             routing: 'No board slot needed. TBS may ask to showcase this work.', tone: 'good' },
    { id: 'hallpass', min: 6.0, label: 'Hall pass',            routing: 'Suggested: no GC EARB appearance required. Subject to audit sample.', tone: 'good' },
    { id: 'routine',  min: 3.0, label: 'Routine',              routing: 'Suggested: no board time. Assessor spot-check only.', tone: 'neutral' },
    { id: 'attend',   min: 0.0, label: 'Bring it to the board', routing: 'Suggested: attend GC EARB. Come and tell us why, and what the plan is.', tone: 'bad' },
  ],
  bandsNote:
    'ROUTING, not maturity. These are Dan\'s spoken numbers from 2026-08-26 (60% hall pass, 8.5 showcase, ~2 come and explain) and are NOT in his workbook or signed off by anyone. Maturity labels above are his.',

  stageMultipliers: { 'low-ok': 0.25, expected: 1, critical: 1.5 },
  stageMultipliersNote:
    'Our addition. Lifecycle stage is not captured in the current process at all - Dan named it as the key missing field. Only "Defining the Current State" sections carry a rule so far.',

  lifecycleStages,
  domains,
};

await writeFile(OUT, JSON.stringify(rubric, null, 2) + '\n');

const nq = domains.reduce((s, d) => s + d.sections.reduce((t, x) => t + x.questions.length, 0), 0);
console.log(`${OUT}`);
console.log(`  ${domains.length} domains, ${domains.reduce((s, d) => s + d.sections.length, 0)} sections, ${nq} questions, ${anchors.length}-point scale`);
for (const d of domains) {
  const q = d.sections.reduce((t, x) => t + x.questions.length, 0);
  console.log(`  ${String(d.weight).padStart(3)}%  ${d.label.padEnd(38)} ${d.sections.length} sections, ${q} questions`);
}
if (warnings.length) { console.log('\n  warnings:'); for (const w of warnings) console.log(`  - ${w}`); }
