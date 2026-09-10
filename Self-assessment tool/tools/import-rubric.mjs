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

/**
 * Dan wants security and privacy visible without inventing a fifth domain, so a question can
 * carry several topics. Two sources, and the second one is provisional.
 *
 *   1. Its own domain, which is mechanical and certain.
 *   2. Security or privacy, where the question text names those concepts outright.
 *
 * The second is a keyword pass and it is a starting point, not an answer. Dan owns the real
 * assignments; this exists so the roll-up is demonstrable before he does them.
 */
/**
 * Questions that read as yes or no rather than as a maturity. Dan named this defect and gave
 * one example; these are the ones whose wording is unambiguously binary. PROVISIONAL, and his
 * to confirm, which is why the pattern is narrow rather than clever.
 */
const YESNO_PATTERNS = [
  /^Is there a published roadmap\b/i,
  /^Has a formal threat and risk assessment\b/i,
  /^Has a Privacy Impact Assessment\b/i,
  /^Has a Threat and Risk Assessment\b/i,
  /^Is there a formal risk register\b/i,
  /^Is there a documented breach response plan\b/i,
  /^Is there a continuous business need\b/i,
  /^Is there an algorithmic impact assessment\b/i,
  /^Are accessibility standards\b/i,
  /^Is GC AI Compute\b/i,
];
const answerTypeFor = (text) => (YESNO_PATTERNS.some((re) => re.test(text)) ? 'yesno' : 'scale');

const SECURITY_WORDS = /\b(security|secure|threat|vulnerabilit|encrypt|zero-trust|zero trust|cryptograph|penetration|guardrail|authenticat|authoriz|access control|breach|sovereignty|supply chain)/i;
const PRIVACY_WORDS = /\b(privacy|personal information|PIA|Privacy Impact|consent|collection limitation|retention and disposition|ATIP)/i;
/**
 * Financial, derived the same provisional way as security and privacy.
 *
 * "invest" on its own catches "investigate", so the pattern asks for the noun or the gerund.
 * Accessibility and official languages get no pattern at all: a dry run over all 176 questions
 * found official languages in two and accessibility in three, and every loose pattern caught the
 * wrong sense, the FAIR principles' "Accessible" and programming languages. Three hits is not a
 * category, it is a gap in the instrument, and inventing one from keywords would hide that.
 */
const FINANCIAL_WORDS = /\b(cost|costing|budget|funding|funded|financial|expenditure|licen[cs]ing fee|total cost of ownership|TCO|invest(ment|ing)|value for money|business case)/i;

function topicsFor(domainId, text) {
  const out = [domainId];
  if (SECURITY_WORDS.test(text)) out.push('security');
  if (PRIVACY_WORDS.test(text)) out.push('privacy');
  if (FINANCIAL_WORDS.test(text)) out.push('financial');
  return out;
}
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
      current.questions.push({
        id: `${d.id.slice(0, 1).toUpperCase()}-${qNum}`,
        sheetRef: qNum,
        text: qText,
        weight: 1,
        answerType: answerTypeFor(qText),
        topics: topicsFor(d.id, qText),
      });
    }
  }

  /**
   * Section weights are meant to be a percentage split of their domain. Business Architecture
   * sums to 80 in Dan's workbook while the other three sum to 100, so twenty points are
   * unaccounted for.
   *
   * The roll-up already divides by the weights present, which scales the six that are there up
   * proportionally. That is the right arithmetic and it was invisible, because the page showed
   * the raw numbers and they did not add up. So each section also carries its share of its
   * domain, and the page shows that instead. The raw weight stays, because it is Dan's.
   */
  const sum = sections.reduce((s, x) => s + x.weight, 0);
  for (const sec of sections) {
    sec.shareOfDomain = sum > 0 ? Math.round((sec.weight / sum) * 1000) / 10 : 0;
  }
  if (Math.abs(sum - 100) > 0.01) {
    warnings.push(
      `${d.label}: the section weights in the workbook add up to ${sum}%, not 100%. ` +
      `The missing ${Math.round((100 - sum) * 10) / 10} points are shared out across the ` +
      `${sections.length} sections that are there, in proportion, so the domain still scores out of 10. ` +
      `Worth checking whether a section was left out of the export.`,
    );
  }
  const empty = sections.filter((s) => !s.questions.length).map((s) => s.label);
  if (empty.length) warnings.push(`${d.label}: sections with no questions: ${empty.join(', ')}`);

  domains.push({ id: d.id, label: d.label, weight: domainWeight, description: tagline, sections });
}

// ---- lifecycle stages, our addition ----------------------------------------------------
/**
 * Each stage points at its own page in the Digital Lifecycle Guide. Paths verified against the
 * live site: every one returns 200.
 */
const lifecycleStages = [
  { id: 'discovery',     label: 'Discovery',     phase: 'Create', dlgPath: 'create-discovery',    blurb: 'Understanding the problem. There may be no current solution to describe yet.' },
  { id: 'alpha',         label: 'Alpha',         phase: 'Create', dlgPath: 'create-alpha',        blurb: 'Testing whether an approach can work, with real users.' },
  { id: 'beta',          label: 'Beta',          phase: 'Create', dlgPath: 'create-beta',         blurb: 'Building the real thing in public, at growing scale.' },
  { id: 'stabilization', label: 'Stabilization', phase: 'Live',   dlgPath: 'live-stabilization',  blurb: 'In service, settling down. Costs and operations should be known.' },
  { id: 'growth',        label: 'Growth',        phase: 'Live',   dlgPath: 'live-growth',         blurb: 'In service, scaling up.' },
  { id: 'maturity',      label: 'Maturity',      phase: 'Live',   dlgPath: 'live-maturity',       blurb: 'In service, steady state. Everything should be documented and measured.' },
  { id: 'sunset',        label: 'Sunset',        phase: 'Sunset', dlgPath: 'sunset',              blurb: 'Replacing or retiring. Dependencies and data disposition matter most.' },
];

const phases = [
  { name: 'Create', dlgPath: 'create', blurb: 'Being built, and not in service yet.' },
  { name: 'Live',   dlgPath: 'live',   blurb: 'In service, with real users.' },
  { name: 'Sunset', dlgPath: 'sunset', blurb: 'Being replaced or retired.' },
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
  dlgBaseUrl: 'https://myermcat.github.io/digital-lifecycle-guide',
  dlgBaseUrlNote: 'The guide, on GitHub Pages for now. Each stage points at its own page there.',
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
    { id: 'routine',  min: 3.0, label: 'Routine',              routing: 'Suggested: no board time. Assessor spot-check only.', tone: 'neutral', source: 'interpolated' },
    { id: 'attend',   min: 0.0, label: 'Bring it to the board', routing: 'Suggested: attend GC EARB. Come and tell us why, and what the plan is.', tone: 'bad' },
  ],
  bandsNote:
    'ROUTING, not maturity, and provisional. Dan named three numbers out loud on 2026-08-26: above ' +
    'roughly 60% is an automatic hall pass, around 8.5 is worth showcasing, and around 2 out of 10 means ' +
    'come and explain. He also said the 4, 5, 6 middle is not worth board time. The 3.0 line between ' +
    '"come and explain" and "no board time" is OURS, interpolated to bridge the 2 he named and the 4 he ' +
    'named. He has not seen it. None of these are signed off. The maturity labels above are his.',

  stageMultipliers: { 'low-ok': 0.25, expected: 1, critical: 1.5 },
  stageMultipliersNote:
    'Our addition. Lifecycle stage is not captured in the current process at all - Dan named it as the key missing field. Only "Defining the Current State" sections carry a rule so far.',

  topics: [
    { id: 'business',    label: 'Business',    note: 'Strategy, process, value and cost.' },
    { id: 'data',        label: 'Data',        note: 'Models, quality, lineage and stewardship.' },
    { id: 'application', label: 'Application', note: 'What the software does and depends on.' },
    { id: 'technology',  label: 'Technology',  note: 'Where it runs, and whether it stays up.' },
    { id: 'security',    label: 'Security',    note: 'Cuts across all four. Dan asked for this one by name.' },
    { id: 'privacy',     label: 'Privacy',     note: 'Personal information specifically, and not data in general.' },
    { id: 'financial',   label: 'Financial',   note: 'Cost, funding and value for money. Dan asked for this one by name.' },
    { id: 'accessibility', label: 'Accessibility',
      note: 'Dan asked for this one by name. No question in the instrument asks about it yet, so it is empty until he tags the rows.' },
    { id: 'official-languages', label: 'Official Languages',
      note: 'Dan asked for this one by name. No question in the instrument asks about it yet, so it is empty until he tags the rows.' },
  ],
  answerTypesNote:
    'PROVISIONAL. Dan named this defect: several questions are yes or no wearing a 0 to 10 scale. ' +
    'The ones marked yesno here are the ones whose wording is unambiguously binary. He owns the real ' +
    'list. A no on a yes/no question raises a red flag: it colours the section and the person carries ' +
    'on. Nothing in this tool stops an assessment.',
  topicsNote:
    'A second axis. The four domains still produce the overall score and a question counts once ' +
    'there. A question also counts at full weight inside every topic it carries, which is where the ' +
    'weights genuinely differ. Dan named nine on 8 September: Business, Data, Application, ' +
    'Technology, Security, Privacy, Accessibility, Official Languages and Financial. The four domain ' +
    'topics are mechanical. Security, privacy and financial were derived from the question wording ' +
    'and are PROVISIONAL: Dan owns the real assignments. Accessibility and Official Languages are ' +
    'declared and empty, because no question in the instrument asks about either: a sweep of all 176 ' +
    'found official languages in two and accessibility in three, always in another sense. They stay ' +
    'on the list so the gap is visible. What fills them is one Topics column in each domain sheet, ' +
    'comma separated, filled only on the rows that need more than their own domain.',

  lifecycleStages,
  phases,
  domains,
};

/**
 * Question ids are generated from the sheet, never typed by hand, and they become CSV column
 * names - so an id that changes meaning silently breaks comparison with every export made
 * before it. This lock file records what each id meant; the check below refuses to let one
 * quietly point at a different question. New ids are fine, and disappearing ones are noted.
 */
const LOCK = 'rubric/rubric-ids.lock.json';
const gist = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 70);
const current = {};
for (const d of domains) for (const sec of d.sections) for (const q of sec.questions) current[q.id] = gist(q.text);

let previous = null;
try { previous = JSON.parse(await readFile(LOCK, 'utf8')); } catch { /* first run */ }

if (previous) {
  for (const [id, was] of Object.entries(previous)) {
    if (!(id in current)) { warnings.push(`Question ${id} has disappeared. Old exports have a ${id} column with no question behind it.`); continue; }
    if (current[id] !== was) {
      warnings.push(
        `Question ${id} now means something different.\n      was: "${was}"\n      now: "${current[id]}"\n      ` +
        `Ids are column names in every CSV already exported. Add a new question rather than repointing this id, ` +
        `or delete ${LOCK} deliberately if the change is intended.`,
      );
    }
  }
  const added = Object.keys(current).filter((id) => !(id in previous));
  if (added.length) console.log(`  ${added.length} new question id(s): ${added.slice(0, 6).join(', ')}${added.length > 6 ? '...' : ''}`);
}

rubric.importWarnings = warnings;
await writeFile(LOCK, JSON.stringify(current, null, 2) + '\n');
await writeFile(OUT, JSON.stringify(rubric, null, 2) + '\n');

const nq = domains.reduce((s, d) => s + d.sections.reduce((t, x) => t + x.questions.length, 0), 0);
console.log(`${OUT}`);
console.log(`  ${domains.length} domains, ${domains.reduce((s, d) => s + d.sections.length, 0)} sections, ${nq} questions, ${anchors.length}-point scale`);
for (const d of domains) {
  const q = d.sections.reduce((t, x) => t + x.questions.length, 0);
  console.log(`  ${String(d.weight).padStart(3)}%  ${d.label.padEnd(38)} ${d.sections.length} sections, ${q} questions`);
}
if (warnings.length) { console.log('\n  warnings:'); for (const w of warnings) console.log(`  - ${w}`); }
