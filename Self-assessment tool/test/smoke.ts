/** Logic checks for the parts that decide anything: scoring, banding, flags, CSV, round-trip. */
import { allQuestionScores, completion, score, weakest, nextAnchor } from '../src/scoring';
import { flags } from '../src/flags';
import { csvHeader, csvRow, toCsv } from '../src/csv';
import { fromFields, fromValue, toFields, toValue } from '../src/firebase';
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
    initiative: { name: 'Test initiative', department: 'TC', contact: 'a@b.c', lifecycleStage: stage, summary: 's', classification: 'Unclassified' },
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
  // Deciding a question does not apply IS answering it, so progress counts it. The score is a
  // separate matter: an n/a question leaves the weighting entirely, which the line above proves.
  ok('n/a still counts as dealt with, so the denominator does not shrink',
     r.scoreable === allQ.length, String(r.scoreable));
  ok('and it counts in the numerator too', r.answered === allQ.length, String(r.answered));
  ok('so a fully handled assessment reads as complete', r.completeness === 1, String(r.completeness));
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

// A threshold on a self-scored number is one answer wide, so a score resting on it is flagged.
{
  const a = fill(blank('beta'), 6);
  const r = score(rubric, a);
  ok('a score exactly on the hall-pass line is flagged as thin',
     flags(rubric, a, r).some((f) => f.id === 'just-above-the-line'),
     `overall ${r.overall}`);
  const clear = fill(blank('beta'), 8);
  ok('a comfortable score is not', !flags(rubric, clear, score(rubric, clear)).some((f) => f.id === 'just-above-the-line'));
}

// Dan named 60%, 8.5 and about 2. The line between "come and explain" and "no board time" is
// ours, and the rubric says so rather than passing it off as his.
{
  const interpolated = rubric.bands.filter((b) => b.source === 'interpolated');
  ok('exactly one threshold is marked as ours', interpolated.length === 1,
     interpolated.map((b) => b.label).join(','));
  ok('and it is the one Dan never named', interpolated[0]?.min === 3.0, String(interpolated[0]?.min));
  ok('the note says which numbers were his', (rubric.bandsNote ?? '').includes('is OURS'));
}

// A partly answered assessment says it is incomplete once, and does not then list every
// unanswered question underneath that.
{
  const a = blank('beta');
  for (const q of allQ.slice(0, 20)) a.answers[q.id] = { score: 6, evidence: [], justification: 'because' };
  const fs = flags(rubric, a, score(rubric, a));
  ok('an incomplete submission is flagged', fs.some((f) => f.id === 'incomplete'));
  ok('and its unanswered questions are not also listed one by one',
     !fs.some((f) => f.id === 'unanswered-many' || f.id === 'unanswered'),
     fs.map((f) => f.id).join(','));
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
  // Protected B is ordinary in government. Flagging it would train assessors to skim the
  // anomaly list, so it is handling information on the header, not a finding.
  ok('Protected B evidence is NOT treated as an anomaly', !fs.some((f) => f.id === 'evidence-classified'));
}
{
  // A high score whose evidence was only pointed at, not attached - now that attaching is
  // possible, a pointer behind a strong claim is worth asking about.
  const a = fill(blank('beta'), 5);
  a.answers[qid('avoid unnecessary duplication with existing GC capabilities')] = {
    score: 9,
    evidence: [{ title: 'Reuse assessment', kind: 'document', location: 'the team drive', classification: 'Unclassified' }],
    justification: 'we checked',
  };
  ok('a high score with evidence pointed at but not attached is caught',
     flags(rubric, a, score(rubric, a)).some((f) => f.id === 'evidence-not-attached'));
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

/* ------------------------------------------------------------------------------------------
   The Firestore value mapping.

   Firestore wraps every field, so an assessment goes out as a tree of { stringValue },
   { integerValue }, { mapValue } and { arrayValue } and has to come back as itself. This is
   where an integration like this breaks: an empty evidence array arrives with no `values` key
   at all, an integer arrives as a string, and a null score arrives under a key of its own.
   ------------------------------------------------------------------------------------------ */

/** Key order is not part of the data, so a comparison sorts the keys on the way past. */
function stable(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'undefined';
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

{
  // Every awkward shape an assessment can hold, in one record: a null score, a boolean, an
  // n/a with no evidence key at all, an empty evidence array, two evidence items of which one
  // carries an attachment, a double, and an audit history.
  const a = blank('beta');
  a.ref = 'QK7M';
  a.ownerEmail = 'someone@example.gc.ca';
  a.initiative.classification = 'Unclassified';
  a.initiative.markingAcknowledged = 'Unclassified';
  a.answers['q-null'] = { score: null, justification: '' };
  a.answers['q-na'] = { score: null, na: true };
  a.answers['q-empty'] = { score: 0, evidence: [] };
  a.answers['q-full'] = {
    score: 7,
    picklist: 'other',
    picklistOther: 'a case the list does not carry',
    justification: 'commas, "quotes" and \nnewlines',
    evidence: [
      { title: 'Current state pack', kind: 'document', location: 'GCdocs', classification: 'Unclassified' },
      {
        title: 'Cost model',
        kind: 'report',
        location: 'sent by email',
        classification: 'Protected B',
        emailed: true,
        emailSubject: 'EARB QK7M evidence 2',
        attachment: { name: 'costs.csv', type: 'text/csv', size: 4096, data: 'YSxiLGMK' },
      },
    ],
  };
  a.audit = {
    reviewer: 'An assessor',
    reviewedAt: '2026-09-03T12:00:00.000Z',
    overallNote: '',
    perQuestion: {
      'q-full': {
        auditedScore: 6.5,
        verdict: 'adjust',
        note: 'the pack covers one system of three',
        by: 'An assessor',
        at: '2026-09-03T12:00:00.000Z',
        history: [
          { by: 'An assessor', at: '2026-09-03T11:00:00.000Z', score: 5, note: 'first pass', unverified: true },
          { by: 'Another assessor', at: '2026-09-03T11:30:00.000Z', score: 6.5, note: 'on reflection', unverified: true },
        ],
      },
    },
  };

  const wire = toFields({ ...a });
  const back = fromFields(wire) as unknown as Assessment;

  ok('an assessment round-trips through the Firestore mapping', stable(back) === stable(a),
     stable(back) === stable(a) ? '' : stable(back));
  ok('a null score comes back as null', back.answers['q-null'].score === null);
  ok('an n/a boolean survives', back.answers['q-na'].na === true);
  ok('an empty evidence array stays an empty array',
     Array.isArray(back.answers['q-empty'].evidence) && back.answers['q-empty'].evidence.length === 0,
     JSON.stringify(back.answers['q-empty'].evidence));
  ok('nested evidence keeps both items and their order',
     (back.answers['q-full'].evidence ?? []).map((e) => e.title).join('|') === 'Current state pack|Cost model');
  ok('an attachment inside evidence survives',
     (back.answers['q-full'].evidence ?? [])[1]?.attachment?.data === 'YSxiLGMK');
  ok('a whole number reads back as a number', back.answers['q-full'].score === 7);
  ok('a fractional audit score keeps its fraction', back.audit?.perQuestion['q-full']?.auditedScore === 6.5);
  ok('the audit history stays two moves long', (back.audit?.perQuestion['q-full']?.history ?? []).length === 2);
  ok('awkward text survives the wrapping',
     back.answers['q-full'].justification === a.answers['q-full'].justification);
  ok('an empty answers map on a fresh assessment stays a map',
     stable(fromFields(toFields({ ...blank('beta') })).answers) === '{}');
}

{
  // The wire form itself, because a mapping that round-trips through its own reader can still
  // be writing something Firestore refuses.
  ok('a whole number goes as an int64 in a string', stable(toValue(7)) === '{"integerValue":"7"}', stable(toValue(7)));
  ok('zero goes as an integer', stable(toValue(0)) === '{"integerValue":"0"}');
  ok('a fraction goes as a double', stable(toValue(6.5)) === '{"doubleValue":6.5}', stable(toValue(6.5)));
  ok('null goes as nullValue', stable(toValue(null)) === '{"nullValue":null}');
  ok('false goes as a boolean', stable(toValue(false)) === '{"booleanValue":false}');
  ok('an empty string is a string', stable(toValue('')) === '{"stringValue":""}');
  ok('a number past 2^53 goes as a double, because an int64 in a string would be refused',
     stable(toValue(2 ** 60)) === `{"doubleValue":${2 ** 60}}`, stable(toValue(2 ** 60)));
  ok('an undefined field is left out, the way JSON.stringify leaves it out',
     stable(toFields({ note: undefined, title: 'x' })) === '{"title":{"stringValue":"x"}}',
     stable(toFields({ note: undefined, title: 'x' })));

  // Forms Firestore sends that this module never writes.
  ok('an array with no values key reads as an empty array', stable(fromValue({ arrayValue: {} })) === '[]');
  ok('a map with no fields key reads as an empty object', stable(fromValue({ mapValue: {} })) === '{}');
  ok('an integer in a string reads as a number', fromValue({ integerValue: '10' }) === 10);
  ok('a timestamp reads as the string it was written as',
     fromValue({ timestampValue: '2026-09-03T12:00:00Z' }) === '2026-09-03T12:00:00Z');
  ok('NaN in its string form reads as NaN', Number.isNaN(fromValue({ doubleValue: 'NaN' })));
  ok('a value form nobody here knows reads as absent, so one field cannot lose a record',
     fromValue({ someLaterValue: 1 }) === null);

  // Firestore stores no array inside an array, and the 400 it answers with names nothing.
  let refused = false;
  try { toValue([[1]]); } catch { refused = true; }
  ok('an array inside an array is refused before the request goes', refused);
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

/* -------------------------------------------------------------------------------------------
   What complete means. There is no finishing line in the instrument, so this is the decision
   made on 8 September, held here so it cannot drift into three different answers on three
   different screens.
   ------------------------------------------------------------------------------------------- */
{
  // The fixture arrives with its overview filled, so an empty overview is made here.
  const bareOverview = (x: Assessment): Assessment => {
    x.initiative.name = ''; x.initiative.department = '';
    x.initiative.contact = ''; x.initiative.summary = '';
    return x;
  };

  const empty = bareOverview(blank('beta'));
  const c0 = completion(rubric, empty);
  ok('an empty assessment is not complete', c0.complete === false);
  ok('and every question is outstanding', c0.questionsLeft === c0.total && c0.total === allQ.length,
     `${c0.questionsLeft} of ${c0.total}`);
  ok('and the four typed overview fields are listed as outstanding', c0.overviewLeft.length === 4,
     c0.overviewLeft.join(', '));

  // Every question scored, and the overview still empty.
  const scored = fill(bareOverview(blank('beta')), 6);
  const c1 = completion(rubric, scored);
  ok('every question answered is still not complete while the overview is short',
     c1.complete === false && c1.questionsLeft === 0, JSON.stringify(c1.overviewLeft));

  // The overview filled as well.
  const done = fill(blank('beta'), 6);
  const c2 = completion(rubric, done);
  ok('with the overview filled it is complete', c2.complete === true, JSON.stringify(c2));

  // Not applicable throughout is complete and unscored, deliberately: that is a thing an
  // assessor should see and judge.
  const na = blank('beta');
  na.initiative.name = 'X'; na.initiative.department = 'Y';
  na.initiative.contact = 'a@b.gc.ca'; na.initiative.summary = 'Z';
  for (const q of allQ) na.answers[q.id] = { score: null, na: true };
  const c3 = completion(rubric, na);
  ok('not applicable throughout is complete', c3.complete === true);
  ok('and it scores nothing', score(rubric, na).overall === null, String(score(rubric, na).overall));

  // One question back to unanswered undoes it.
  const nearly = fill(blank('beta'), 6);
  nearly.initiative.name = 'X'; nearly.initiative.department = 'Y';
  nearly.initiative.contact = 'a@b.gc.ca'; nearly.initiative.summary = 'Z';
  delete nearly.answers[allQ[0].id];
  const c4 = completion(rubric, nearly);
  ok('one question missing is one question short', c4.complete === false && c4.questionsLeft === 1,
     JSON.stringify(c4));

  // The reasoning and the evidence are deliberately outside the definition.
  const bare = fill(blank('beta'), 6);
  bare.initiative.name = 'X'; bare.initiative.department = 'Y';
  bare.initiative.contact = 'a@b.gc.ca'; bare.initiative.summary = 'Z';
  for (const q of allQ) bare.answers[q.id] = { score: 6, evidence: [] };
  ok('no reasoning and no evidence is still complete', completion(rubric, bare).complete === true);
}


/* -------------------------------------------------------------------------------------------
   Dan's nine categories, and the two that are empty on purpose.
   ------------------------------------------------------------------------------------------- */
{
  const ids = (rubric.topics ?? []).map((t) => t.id);
  ok('all nine categories Dan named are declared', ids.length === 9, ids.join(','));
  for (const want of ['business', 'data', 'application', 'technology', 'security', 'privacy',
    'financial', 'accessibility', 'official-languages']) {
    ok(`  ${want} is one of them`, ids.includes(want));
  }

  const all = rubric.domains.flatMap((d) => d.sections.flatMap((s2) => s2.questions));
  const carrying = (id: string) => all.filter((q) => (q.topics ?? []).includes(id)).length;
  ok('a question can carry more than one category',
     all.filter((q) => (q.topics ?? []).length > 1).length > 30,
     String(all.filter((q) => (q.topics ?? []).length > 1).length));
  ok('every question carries its own domain as a category',
     rubric.domains.every((d) => d.sections.every((s2) => s2.questions.every((q) => (q.topics ?? []).includes(d.id)))));
  ok('financial is derived and not empty', carrying('financial') > 5, String(carrying('financial')));

  /**
   * These two are declared and empty, and that is the finding.
   *
   * A sweep of all 176 questions found official languages in two and accessibility in three,
   * always in another sense: the FAIR principles' "Accessible", and programming languages.
   * Three hits is a gap in the instrument. Deriving a category from keywords that loose would
   * hide the gap behind a number, so they stay empty until Dan tags the rows.
   */
  ok('accessibility is declared and empty', carrying('accessibility') === 0, String(carrying('accessibility')));
  ok('official languages is declared and empty', carrying('official-languages') === 0,
     String(carrying('official-languages')));
  ok('and the note says who owns the real assignments',
     /Dan owns the real assignments/.test(rubric.topicsNote ?? ''));
  ok('and names what would fill the empty two',
     /Topics column/.test(rubric.topicsNote ?? ''));

  /**
   * A topic nobody declared is the one error in a question set that cannot be seen afterwards.
   *
   * The question counts towards nothing, every page renders correctly, and a category TBS asked
   * for is quietly short by one. "secuirty" on one row out of 176 is not a number anybody can
   * check by looking, so the file is refused when it loads.
   */
  const bent = JSON.parse(JSON.stringify(rubric)) as Rubric;
  bent.domains[0].sections[0].questions[0].topics = ['business', 'secuirty'];
  const verdict = validate(bent);
  ok('a question set carrying a topic it never declared is refused', verdict.ok === false);
  ok('and the refusal names the question and the topic',
     !verdict.ok && verdict.problems.some((x) => /secuirty/.test(x) && /B-Q/.test(x)),
     verdict.ok ? '' : verdict.problems.join(' | '));

  /**
   * The score is the whole point of the second axis, so it is asserted rather than assumed: a
   * question counts ONCE in the overall through its domain, and at FULL weight inside every
   * topic it carries. Those two facts are what let security weigh differently from business
   * without inflating the total.
   */
  const one = rubric.domains[0].sections[0].questions[0];
  const filled = blank('beta');
  filled.answers[one.id] = { score: 10, evidence: [] };
  const r = score(rubric, filled);
  const inTopics = r.topics.filter((t) => (one.topics ?? []).includes(t.topic.id));
  ok('one answer scores inside every topic that question carries',
     inTopics.length === (one.topics ?? []).length && inTopics.every((t) => t.score === 10),
     inTopics.map((t) => `${t.topic.id}=${t.score}`).join(' '));
  /**
   * And the arithmetic that makes it a second cut rather than a second spine: every question
   * sits in exactly one domain, and the topics between them hold more memberships than there
   * are questions. That difference is the 44 questions carrying more than one.
   */
  const whole = score(rubric, fill(blank('beta'), 7));
  const inDomains = whole.domains.reduce((n, d) => n + d.total, 0);
  const inTopicsTotal = whole.topics.reduce((n, t) => n + t.total, 0);
  ok('every question counts once across the domains', inDomains === allQ.length,
     `${inDomains} of ${allQ.length}`);
  ok('and more than once across the topics, which is why they do not add up to the overall',
     inTopicsTotal > inDomains, `${inTopicsTotal} topic memberships for ${inDomains} questions`);
}


console.log(fails === 0 ? '\nall checks passed' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
