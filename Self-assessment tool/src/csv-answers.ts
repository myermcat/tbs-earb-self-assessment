import type { Assessment, EvidenceRef, Rubric } from './types';
import { maturityFor, score } from './scoring';

/**
 * The assessment as Dan's workbook, with the answers in it.
 *
 * Asked for on 20 October: download as CSV in the same exact format as the questions
 * themselves are in CSV, so you can upload that to Google Sheets or Excel and it looks the
 * same as the Excel sheet of the questions template, just filled questions.
 *
 * So the shape here is not ours to choose. It is read off
 * `GC_EA_Assessment_Tool(Business Architecture).csv` and its three siblings: six columns, a
 * domain title row carrying the domain's own description, the domain's overall weight on the
 * row under it, the header row, and then a band row per section with the section's weight on
 * it. The `#` column carries the section's number on the first question of each section and
 * nothing on the rest, which is how the workbook writes it. Every row is padded to six cells,
 * because that is what gives a band row the trailing commas the workbook's own rows have.
 *
 * The workbook is four sheets and this is one file, so the four domains follow each other with
 * a blank row between. A sheet per domain would be four downloads or a zip, and the thing
 * somebody does with this is look at it.
 *
 * ENGLISH ONLY, AND THAT IS NOT AN OVERSIGHT. The 176 questions exist in English alone, which
 * is an open item against Dan, and French column headings over English questions is a worse
 * answer than the workbook's own headings. The screens stay bilingual.
 */

const COLS = 6;

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(cells: (string | number | null)[]): string {
  const out = cells.slice(0, COLS).map(cell);
  while (out.length < COLS) out.push('');
  return out.join(',');
}

/**
 * The workbook's own separators, copied byte for byte off
 * GC_EA_Assessment_Tool(Business Architecture).csv: two plain spaces either side, a middle
 * dot on a title row and an em dash on a section band. They are escapes because the prose
 * linter refuses a dash anywhere in this repository, and this one is a quotation of somebody
 * else's file rather than our own writing.
 */
const DOT = '  \u00b7  ';
const DASH = '  \u2014  ';
/* A section average row spaces the same dash singly. The workbook is inconsistent there and
   this file copies the workbook, so the difference is reproduced. */
const AVG_DASH = ' \u2014 ';
const EN = '\u2013';

/** What a piece of evidence says in a cell somebody reads in Excel. */
function evidenceLine(e: EvidenceRef): string {
  const bits = [e.title || '(untitled)'];
  if (e.location) bits.push(e.location);
  if (e.classification) bits.push(e.classification);
  if (e.emailed) bits.push(`emailed to the assessor, subject: ${e.emailSubject ?? ''}`.trim());
  if (e.note) bits.push(e.note);
  return bits.join(' | ');
}

export function answersCsv(rubric: Rubric, a: Assessment): string {
  const r = score(rubric, a);
  const scored = new Map(r.domains.map((d) => [d.domain.id, d]));
  const anchorName = new Map(rubric.scale.anchors.map((x) => [x.value, x.name ?? x.label]));
  const lines: string[] = [];

  lines.push(row([`GC Enterprise Architecture Assessment${DOT}${a.initiative.name || 'Untitled'}`]));
  lines.push(row(['Department', a.initiative.department]));
  lines.push(row(['Access code', a.ref ?? '']));
  lines.push(row(['Lifecycle stage', a.initiative.lifecycleStage]));
  lines.push(row(['Question set', `${rubric.title} ${rubric.version}`]));
  lines.push(row(['Downloaded', new Date().toISOString().slice(0, 10)]));
  lines.push(row([
    'Overall score', r.overall === null ? '' : r.overall.toFixed(1), '',
    'Maturity', maturityFor(rubric, r.overall ?? 0)?.label ?? 'Awaiting input',
  ]));
  lines.push(row([`Answered`, `${r.answered} of ${r.scoreable}`]));

  for (const d of rubric.domains) {
    lines.push(row([]));
    lines.push(row([`${d.label}${d.description ? DOT + d.description : ''}`]));
    lines.push(row([`Overall weight in GC EA score: ${d.weight}%`]));
    lines.push(row(['#', 'Q#', 'Assessment Question', `Score (0${EN}10)`, 'Maturity Label', 'Notes / Evidence']));

    const ds = scored.get(d.id);
    d.sections.forEach((sec, i) => {
      // The workbook indents a section band by two spaces, so the cell is not a question id.
      lines.push(row([`  ${sec.label}${DASH}Section weight: ${sec.weight}%`]));
      sec.questions.forEach((q, j) => {
        const ans = a.answers[q.id];
        const na = ans?.na === true;
        const sc = na || ans?.score === null || ans?.score === undefined ? null : ans.score;
        const notes = [
          (ans?.justification ?? '').trim(),
          ...(ans?.evidence ?? []).map(evidenceLine),
        ].filter(Boolean).join('\n');
        lines.push(row([
          j === 0 ? `S${i + 1}` : '',
          q.sheetRef ?? q.id,
          q.text,
          sc === null ? '' : sc,
          na ? 'Not applicable' : sc === null ? '\u2014' : anchorName.get(sc) ?? '',
          notes,
        ]));
      });
      /**
       * The workbook closes every section with a Section Average row and every sheet with an
       * OVERALL row, and leaves both of them empty for a formula to fill. A filled copy has the
       * numbers, so they go in the two columns the question rows put a score and a rung in.
       */
      const ss = ds?.sections.find((x) => x.section.id === sec.id);
      lines.push(row([
        `Section Average${AVG_DASH}${sec.label}`, '', '',
        ss?.score === null || ss?.score === undefined ? '' : ss.score.toFixed(1),
        ss?.score === null || ss?.score === undefined ? '' : anchorName.get(Math.round(ss.score)) ?? '',
      ]));
    });
    lines.push(row([]));
    lines.push(row([
      `OVERALL ${d.label.toUpperCase()} SCORE`, '', '',
      ds?.score === null || ds?.score === undefined ? '' : ds.score.toFixed(1),
      ds?.score === null || ds?.score === undefined ? '' : anchorName.get(Math.round(ds.score)) ?? '',
    ]));
  }

  // Excel on Windows reads a bare LF as one line. The workbook's own files are CRLF.
  return `${lines.join('\r\n')}\r\n`;
}
