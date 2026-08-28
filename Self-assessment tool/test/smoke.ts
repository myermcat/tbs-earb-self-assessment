/** Logic checks for the parts that decide anything: scoring, banding, flags, CSV, round-trip. */
import { allQuestionScores, score, weakest, nextAnchor } from '../src/scoring';
import { flags } from '../src/flags';
import { csvHeader, csvRow, toCsv } from '../src/csv';
import { validate } from '../src/rubric';
import type { Assessment, Rubric } from '../src/types';
import BUILTIN from '../rubric/rubric.v1-dan.json';

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const v = validate(BUILTIN);
ok("Dan's imported rubric validates", v.ok, v.ok ? '' : (v as { problems: string[] }).problems.join('; '));
const rubric = (v as { rubric: Rubric }).rubric;
const allQ = rubric.domains.flatMap((d) => d.sections.flatMap((s) => s.questions));

// The import itself: shape we expect from his workbook.
ok('4 domains at 25% each', rubric.domains.length === 4 && rubric.domains.every((d) => d.weight === 25));
ok('20 sections', rubric.domains.reduce((n, d) => n + d.sections.length, 0) === 20,
   String(rubric.domains.reduce((n, d) => n + d.sections.length, 0)));
ok('176 questions', allQ.length === 176, String(allQ.length));
ok('11-point ladder with names', rubric.scale.anchors.length === 11 && !!rubric.scale.anchors[10].name);
ok('ladder runs 0 to 10', rubric.scale.anchors[0].value === 0 && rubric.scale.anchors[10].value === 10);
ok('every question has a unique id', new Set(allQ.map((q) => q.id)).size === allQ.length);
ok('every question traces back to a sheet cell', allQ.every((q) => /^Q\d+$/.test(q.sheetRef ?? '')));
ok('the Business weight gap is recorded, not swallowed',
   (rubric.importWarnings ?? []).some((w) => w.includes('Business') && w.includes('80%')));
ok('Dan\'s maturity bands came across', (rubric.maturityBands ?? []).length === 5);

function blank(stage: string): Assessment {
  return {
    fileType: 'gc-arch-assessment', formatVersion: 1,
    rubric: { id: rubric.id, version: rubric.version, title: rubric.title },
    initiative: { name: 'Test initiative', department: 'TC', contact: 'a@b.c', lifecycleStage: stage, summary: 's' },
    answers: {}, meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test' },
  };
}
const fill = (a: Assessment, s: number) => { for (const q of allQ) a.answers[q.id] = { score: s, evidence: [], justification: 'because' }; return a; };
const qid = (text: string) => {
  const q = allQ.find((x) => x.text.toLowerCase().includes(text.toLowerCase()));
  if (!q) throw new Error(`No question matching "${text}"`);
  return q.id;
};

// A flat score must survive the whole three-level roll-up, at every stage, even with
// section weights that do not sum to 100.
for (const st of rubric.lifecycleStages) {
  const r = score(rubric, fill(blank(st.id), 5));
  ok(`all 5s scores 5.0 at ${st.id}`, Math.abs((r.overall as number) - 5) < 1e-9, `got ${r.overall}`);
}
ok('all 0s scores 0', score(rubric, fill(blank('beta'), 0)).overall === 0);
ok('all 10s scores 10', score(rubric, fill(blank('beta'), 10)).overall === 10);

// Section weights bite: 40% of the data domain is one section.
{
  const a = fill(blank('beta'), 5);
  const dataDomain = rubric.domains.find((d) => d.id === 'data')!;
  const heavy = dataDomain.sections.find((s) => s.weight === 40)!;
  const light = dataDomain.sections.find((s) => s.weight === 5)!;
  const drop = (sec: typeof heavy) => {
    const b = fill(blank('beta'), 5);
    for (const q of sec.questions) b.answers[q.id] = { score: 0, evidence: [], justification: '' };
    return score(rubric, b).overall as number;
  };
  ok('a 40% section moves the score more than a 5% section', drop(heavy) < drop(light),
     `heavy ${drop(heavy).toFixed(2)} vs light ${drop(light).toFixed(2)}`);
  ok('baseline unaffected', Math.abs((score(rubric, a).overall as number) - 5) < 1e-9);
}

// Bands, from Dan's spoken numbers.
const band = (n: number) => score(rubric, fill(blank('beta'), n)).band?.id;
ok('10 -> showcase', band(10) === 'showcase', String(band(10)));
ok('7 -> hall pass', band(7) === 'hallpass', String(band(7)));
ok('5 -> routine', band(5) === 'routine', String(band(5)));
ok('2 -> attend', band(2) === 'attend', String(band(2)));

// Dan's own maturity labels, from the Summary Dashboard sheet.
const mat = (n: number) => score(rubric, fill(blank('beta'), n)).maturity?.label;
ok('5 -> Baseline Ready', mat(5) === 'Baseline Ready', String(mat(5)));
ok('7 -> Advanced', mat(7) === 'Advanced', String(mat(7)));
ok('10 -> Leading Practice', mat(10) === 'Leading Practice', String(mat(10)));
ok('1 -> Critical Risk', mat(1) === 'Critical Risk', String(mat(1)));

// The one stage rule we added: current-state sections count less before anything exists.
{
  const currentStateQs = rubric.domains
    .flatMap((d) => d.sections.filter((s) => /current state/i.test(s.label)))
    .flatMap((s) => s.questions.map((q) => q.id));
  ok('current-state sections were found in all four domains', currentStateQs.length > 30, String(currentStateQs.length));
  const mk = (stage: string) => {
    const a = fill(blank(stage), 8);
    for (const id of currentStateQs) a.answers[id] = { score: 0, evidence: [], justification: '' };
    return score(rubric, a).overall as number;
  };
  const disc = mk('discovery'), matu = mk('maturity');
  ok('an undocumented current state hurts less at discovery than at maturity', disc > matu,
     `discovery ${disc.toFixed(2)} vs maturity ${matu.toFixed(2)}`);
}

// N/A leaves the denominator rather than scoring zero.
{
  const a = fill(blank('beta'), 6);
  const target = qid('Privacy Impact Assessment');
  a.answers[target] = { score: null, na: true };
  const r = score(rubric, a);
  ok('n/a does not drag the score down', Math.abs((r.overall as number) - 6) < 1e-9, `got ${r.overall}`);
  ok('n/a leaves the scoreable count', r.scoreable === allQ.length - 1, String(r.scoreable));
}

// Partial completion scores what was answered and reports the gap.
{
  const a = blank('beta');
  a.answers[qid('current state of this solution been documented')] = {
    score: 9,
    evidence: [{ title: 'Current state pack', kind: 'document', location: 'GCdocs', classification: 'Unclassified' }],
    justification: 'reviewed quarterly since March and owned by the ADM',
  };
  const r = score(rubric, a);
  ok('one answer of 9 scores 9', Math.abs((r.overall as number) - 9) < 1e-9, `got ${r.overall}`);
  ok('completeness reflects the gap', r.completeness < 0.02, String(r.completeness));
  ok('incompleteness is flagged', flags(rubric, a, r).some((f) => f.id === 'incomplete'));
}

// The flags Dan described by name.
{
  const a = fill(blank('beta'), 5);
  const target = qid('clear inventory of all infrastructure components');
  a.answers[target] = { score: 9, evidence: [], justification: 'we have it all' };
  const fs = flags(rubric, a, score(rubric, a));
  ok('high score with no evidence is caught', fs.some((f) => f.id === 'high-score-no-evidence' && f.questionId === target));
  ok('that flag carries a question to ask', !!fs.find((f) => f.id === 'high-score-no-evidence')?.challenge);
}
{
  const a = fill(blank('beta'), 5);
  a.answers[qid('total lifecycle costs')] = {
    score: 1,
    evidence: [{ title: 'Five-year cost model', kind: 'document', location: 'SharePoint', classification: 'Protected B' }],
    justification: '',
  };
  const fs = flags(rubric, a, score(rubric, a));
  ok('low score with evidence is caught', fs.some((f) => f.id === 'low-score-with-evidence'));
  ok('Protected B evidence is called out', fs.some((f) => f.id === 'evidence-classified'));
}
{
  const a = fill(blank('beta'), 7);
  ok('flat scoring is caught', flags(rubric, a, score(rubric, a)).some((f) => f.id === 'flat-scoring'));
}
{
  const a = fill(blank('beta'), 10);
  const fs = flags(rubric, a, score(rubric, a));
  ok('a perfect self-score is pulled into the audit sample', fs.some((f) => f.id === 'self-score-outlier'));
}
{
  const a = fill(blank('discovery'), 4);
  a.answers[qid('current state of this solution been documented')] = {
    score: 10,
    evidence: [{ title: 'x', kind: 'document', location: 'y', classification: 'Unclassified' }],
    justification: 'fully mapped',
  };
  ok('unusual confidence at discovery is caught',
     flags(rubric, a, score(rubric, a)).some((f) => f.id === 'stage-mismatch'));
}

// The backlog picks the genuinely weakest and knows the next rung.
{
  const a = fill(blank('beta'), 7);
  const target = qid('avoid unnecessary duplication with existing GC capabilities');
  a.answers[target] = { score: 1, evidence: [], justification: '' };
  const r = score(rubric, a);
  const w = weakest(r, 3);
  ok('weakest is the 1', w[0].question.id === target, w[0].question.id);
  const next = nextAnchor(rubric, w[0].question, 1);
  ok('the next rung above 1 is 2, Fragmented', next?.value === 2 && next?.name === 'Fragmented', JSON.stringify(next));
}

// Every question is reachable from a Result - nothing is silently dropped by the roll-up.
{
  const r = score(rubric, fill(blank('beta'), 5));
  ok('every question appears in the result', allQuestionScores(r).length === allQ.length,
     `${allQuestionScores(r).length} vs ${allQ.length}`);
}

// CSV: header and row line up, and every question and section gets its columns.
{
  const a = fill(blank('growth'), 6);
  const header = csvHeader(rubric);
  const row = csvRow(rubric, a, { high: 1, total: 4 });
  ok('csv row matches header width', header.length === row.length, `${header.length} vs ${row.length}`);
  ok('csv has a column per question score', allQ.every((q) => header.includes(`${q.id}_score`)));
  ok('csv has a column per section', rubric.domains.every((d) => d.sections.every((s) => header.includes(`section_${d.id}_${s.id}`))));
  const text = toCsv([header, row]);
  ok('csv quotes and escapes safely', !text.split('\r\n')[1].includes('\n'));
}

// Round-trip through JSON, the way save-then-reopen works.
{
  const a = fill(blank('sunset'), 6);
  const target = qid('formal, documented data model');
  a.answers[target] = { score: 3, evidence: [], justification: 'commas, "quotes" and \nnewlines' };
  const back = JSON.parse(JSON.stringify(a)) as Assessment;
  ok('round-trips through a file', score(rubric, back).overall === score(rubric, a).overall);
  ok('awkward text survives', back.answers[target].justification === a.answers[target].justification);
}

// A rubric that is wrong should be refused, not silently half-loaded.
{
  ok('rejects a non-rubric', validate({ hello: 'world' }).ok === false);
  ok('rejects the old sectionless format',
     validate({ ...rubric, domains: [{ id: 'x', label: 'x', weight: 25, questions: [] }] }).ok === false);
  const dup = JSON.parse(JSON.stringify(rubric)) as Rubric;
  dup.domains[0].sections[0].questions.push({ ...dup.domains[0].sections[0].questions[0] });
  const res = validate(dup);
  ok('rejects duplicate question ids', res.ok === false && (res as { problems: string[] }).problems.some((p) => p.includes('Duplicate')));
}

console.log(fails === 0 ? '\nall checks passed' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
