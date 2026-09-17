/**
 * Builds the workbook Dan fills in to say which categories each question carries.
 *
 *   node tools/make-category-workbook.mjs
 *
 * WHY THIS EXISTS
 *
 * Dan's own workbook has no category column. Its sheets are #, Q#, Assessment Question,
 * Score, Maturity Label, Notes / Evidence, and that is the whole of it. So the nine categories
 * he named on 8 September have nowhere to come from, and the five that are not domains are
 * currently guessed by a keyword pass over the question wording, which is ours and not his.
 *
 * This writes his four sheets back out with the same structure, the same section rows and the
 * same weights, plus the columns that let him answer the question by ticking rather than by
 * typing. Typing category names into a cell is how "Offical Languages" ends up in the data and
 * scores nothing, silently, for a year.
 *
 * WHAT THE TICK COLUMNS ARE
 *
 * Five, because four of the nine categories are the domains themselves and a question always
 * carries its own domain: the sheet a question is on already says Business or Data, so asking
 * again would be asking Dan to type something the file already knows.
 *
 * The Topics column beside them is a formula. It joins the ticked ones into the comma-separated
 * form the importer reads, so nobody has to keep two things in step and nobody can mistype one.
 *
 * It is written by a script rather than by hand so that the day Dan changes a question, this is
 * one command and not an afternoon of copying.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const KB = '../EARB target state knowledge base';
const OUT_DIR = '../Deliverables';

/**
 * Dan's four question sheets.
 *
 * No colour per domain. An earlier version of this file invented one for each, and it was
 * inventing: his own colour system is the 0-10 score ladder on the Assessment Scale tab, where
 * every score from Absent to Symbiotic has a named colour. That tab comes across whole, with
 * its colours, and nothing here adds a second scheme beside it.
 */
const DOMAINS = [
  { sheet: 'Business Architecture', label: 'Business Architecture' },
  { sheet: 'Data & Info Architecture', label: 'Data & Information Architecture' },
  { sheet: 'Application Architecture', label: 'Application & Virtual Architecture' },
  { sheet: 'Technology Architecture', label: 'Technology & Physical Architecture' },
];

/**
 * The five that have to be answered. Business, Data, Application and Technology are the sheets
 * themselves, so they are never asked for.
 */
const ASKED = ['Security', 'Privacy', 'Financial', 'Accessibility', 'Official Languages'];

/**
 * The five categories that have to be answered, as one dropdown on one column.
 *
 * Two wrong turns got here, both recorded because the next person will be tempted by the first.
 *
 * The combinations as whole entries in one list: "Security, Privacy" as a single choice. A
 * validation list is itself comma separated, so the list split those entries on their own
 * commas and Sheets showed five choices instead of eleven.
 *
 * Three columns sharing one list, headed "Also about", "and", "and". It worked and it read
 * terribly, and it was built on my own claim that a spreadsheet has no multi-select dropdown.
 * Google Sheets does: a dropdown rule has an "Allow multiple selections" option, which is what
 * this column uses. That option is a Sheets setting with no equivalent in the xlsx format, so
 * it is switched on in the Sheet after conversion, and that step is written down in
 * NOTES/HANDOFF-category-workbook.md rather than left as folklore.
 */
const PICKS = ['Security', 'Privacy', 'Financial', 'Accessibility', 'Official Languages'];

/** One column. The importer finds it by this name, and still accepts the older spellings. */
const CAT_HEADERS = ['Categories'];

/* The CSVs are Windows-1252, which is what Excel writes on a Canadian English install. */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];
const decode = (buf) => {
  let out = '';
  for (const b of buf) out += b >= 0x80 && b <= 0x9f ? String.fromCharCode(CP1252_HIGH[b - 0x80]) : String.fromCharCode(b);
  return out;
};

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

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

async function sheetRows(name) {
  const files = await readdir(KB);
  const match = files.find((f) => f === `GC_EA_Assessment_Tool(${name}).csv`);
  if (!match) throw new Error(`No sheet named "${name}" in ${KB}`);
  return parseCsv(decode(await readFile(`${KB}/${match}`)));
}

/**
 * Our provisional guesses, read back out of the rubric the importer already built, so the
 * filled example and the tool agree. They are a keyword pass and the example says so on its
 * own first tab.
 */
/** What kind of answer each question takes, read back out of the rubric the importer built. */
async function answerTypes() {
  const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));
  const by = new Map();
  for (const d of rubric.domains) {
    for (const s of d.sections) {
      for (const q of s.questions) by.set(`${d.id}:${q.sheetRef}`, q.answerType ?? 'scale');
    }
  }
  return by;
}

async function guesses() {
  const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));
  const byRef = new Map();
  for (const d of rubric.domains) {
    for (const s of d.sections) {
      for (const q of s.questions) {
        byRef.set(`${d.id}:${q.sheetRef}`, (q.topics ?? []).filter((x) => !rubric.domains.some((dd) => dd.id === x)));
      }
    }
  }
  return byRef;
}

const domainIdOf = (label) => label.toLowerCase().split(/[ &]/)[0];

/**
 * A sheet of Dan's that we change nothing about.
 *
 * The Assessment Scale is the one that matters: it carries his colour for every score from 0 to
 * 10, which is the colour system this workbook uses. Passing it through rather than rebuilding
 * it means the day he changes a label, this is one command.
 */
async function passThrough(name) {
  const rows = await sheetRows(name);
  return rows.map((r) => r.map(clean));
}

async function build(filled) {
  const guess = filled ? await guesses() : new Map();
  const answerTypeOf = await answerTypes();
  const sheets = [];
  for (const d of DOMAINS) {
    const rows = await sheetRows(d.sheet);
    const out = [];
    let current = '';
    for (const r of rows.slice(2)) {
      const first = clean(r[0]);
      const qNum = clean(r[1]);
      const qText = clean(r[2]);
      if (/Section weight:/i.test(first)) { out.push({ kind: 'section', text: first }); current = first; continue; }
      if (/^Q\d+$/.test(qNum) && qText) {
        const picked = guess.get(`${domainIdOf(d.label)}:${qNum}`) ?? [];
        // In the order the picker lists them, so a cell always matches an entry in the list.
        const named = ASKED.filter((a) => picked.includes(a.toLowerCase().replace(/ /g, '-')));
        out.push({
          kind: 'question', num: first, q: qNum, text: qText,
          // One cell holding every category, comma separated, which is what a multi-select
          // dropdown puts in a cell and what the importer reads back out of it.
          categories: [named.join(', ')],
          // Ours, and provisional, the same as the categories. Dan named this defect and gave
          // one example; the sheet shows our reading so he can confirm or overrule it.
          answerType: answerTypeOf.get(`${domainIdOf(d.label)}:${qNum}`) === 'yesno' ? 'Yes / No' : 'Scale 0-10',
        });
      }
    }
    sheets.push({
      ...d,
      tagline: clean(rows[0]?.[0]).split('·').slice(1).join('·').trim(),
      weight: clean(rows[1]?.[0]),
      rows: out,
      sections: out.filter((x) => x.kind === 'section').length,
      questions: out.filter((x) => x.kind === 'question').length,
    });
  }

  const name = filled
    ? 'GC EA assessment tool - categories, filled as an example.xlsx'
    : 'GC EA assessment tool - categories template.xlsx';
  const payload = {
    out: `${OUT_DIR}/${name}`, filled, asked: ASKED, picks: PICKS, catHeaders: CAT_HEADERS, sheets,
    scale: await passThrough('Assessment Scale'),
    dashboard: await passThrough('Summary Dashboard'),
  };
  await writeFile('/tmp/earb-workbook.json', JSON.stringify(payload));
  const { stdout } = await run('python3', ['tools/write-category-workbook.py', '/tmp/earb-workbook.json']);
  process.stdout.write(stdout);
}

await build(false);
await build(true);
