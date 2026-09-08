import type { Assessment, Band, Domain, MaturityBand, Question, Rubric, Section, Topic } from './types';

export interface QuestionScore {
  question: Question;
  domainId: string;
  sectionId: string;
  raw: number | null;
  na: boolean;
  answered: boolean;
  effectiveWeight: number;
  expectation: 'low-ok' | 'expected' | 'critical';
  /** This question's share of the whole score, 0..1. Used to rank what is worth an assessor's time. */
  share: number;
}

export interface SectionScore {
  section: Section;
  score: number | null;
  weight: number;              // as written in the rubric
  effectiveWeight: number;     // after the lifecycle-stage multiplier
  expectation: 'low-ok' | 'expected' | 'critical';
  answered: number;
  total: number;
  questions: QuestionScore[];
}

export interface DomainScore {
  domain: Domain;
  score: number | null;
  weight: number;
  answered: number;
  total: number;
  sections: SectionScore[];
}

export interface TopicScore {
  topic: Topic;
  score: number | null;
  answered: number;
  total: number;
  /** Questions carrying this topic whose yes/no answer is a no. */
  redFlags: QuestionScore[];
}

export interface Result {
  overall: number | null;
  band: Band | null;
  maturity: MaturityBand | null;
  domains: DomainScore[];
  /**
   * A second axis, not a second spine. A question counts ONCE in the overall score, through its
   * domain, and at FULL weight inside every topic it carries. That is what makes a question able
   * to weigh differently in security than it does in business without inflating the total.
   */
  topics: TopicScore[];
  completeness: number;
  answered: number;
  scoreable: number;
}

type Expectation = 'low-ok' | 'expected' | 'critical';

/**
 * A stage rule has to be applied at the level it was written at.
 *
 * A section-level rule applied to every question inside that section would cancel out
 * entirely - the within-section average is unchanged when every weight moves by the same
 * factor - so a section rule adjusts the SECTION's weight in the domain roll-up, and a
 * question rule adjusts the QUESTION's weight inside its section.
 */
function questionExpectation(q: Question, stage: string): Expectation {
  return q.stageExpectation?.[stage] ?? 'expected';
}
function sectionExpectation(s: Section, stage: string): Expectation {
  return s.stageExpectation?.[stage] ?? 'expected';
}
/** What to show the user: the question's own rule if it has one, otherwise its section's. */
function effectiveExpectation(q: Question, s: Section, stage: string): Expectation {
  return q.stageExpectation?.[stage] ?? s.stageExpectation?.[stage] ?? 'expected';
}

/**
 * Roll-up. Question -> section (by question weight), section -> domain (by section weight),
 * domain -> overall (by domain weight). Unanswered and n/a questions leave the denominator
 * at every level, so a partly filled assessment still scores out of 10 rather than being
 * punished for the questions it has not reached. Weights that do not sum to 100 normalise.
 */
/**
 * Whether an assessment is finished, and what is missing when it is not.
 *
 * There is no finishing line in the instrument. All 176 of Dan's questions carry the same
 * weight, not one is marked required, and no question asks for evidence, so the line is a
 * decision. This is the decision, taken on 8 September:
 *
 *   complete = every question in the set carries a score or is marked not applicable,
 *              and all six overview fields are filled.
 *
 * What is excluded and why. The reasoning and the evidence, because no question asks for
 * either and requiring 176 more boxes buys typed filler; the flags already catch the other
 * direction, a high score with nothing behind it. Answers to questions outside this set,
 * because a submission is judged against the set it was answered against.
 *
 * The overview counts as things that have to be filled in and not as questions, so the count on
 * screen stays 176. There is no floor on how much may be marked not applicable: an assessment
 * that is not applicable throughout is a thing an assessor should see and judge.
 */
export interface Completion {
  complete: boolean;
  answered: number;
  total: number;
  questionsLeft: number;
  overviewLeft: string[];
}

const OVERVIEW_FIELDS: { key: string; label: string; of: (a: Assessment) => string }[] = [
  { key: 'name', label: 'the name of the initiative', of: (a) => a.initiative?.name ?? '' },
  { key: 'department', label: 'the department', of: (a) => a.initiative?.department ?? '' },
  { key: 'contact', label: 'who to contact', of: (a) => a.initiative?.contact ?? '' },
  { key: 'summary', label: 'what it is, in two or three sentences', of: (a) => a.initiative?.summary ?? '' },
  { key: 'classification', label: 'how the evidence is marked', of: (a) => a.initiative?.classification ?? '' },
  { key: 'lifecycleStage', label: 'where it is in the lifecycle', of: (a) => a.initiative?.lifecycleStage ?? '' },
];

export function completion(rubric: Rubric, a: Assessment): Completion {
  let answered = 0;
  let total = 0;
  for (const domain of rubric.domains) {
    for (const section of domain.sections) {
      for (const question of section.questions) {
        total++;
        const ans = a.answers[question.id];
        if (ans?.na || typeof ans?.score === 'number') answered++;
      }
    }
  }
  const overviewLeft = OVERVIEW_FIELDS.filter((f) => !f.of(a).trim()).map((f) => f.label);
  return {
    complete: answered === total && overviewLeft.length === 0,
    answered,
    total,
    questionsLeft: total - answered,
    overviewLeft,
  };
}

export function score(rubric: Rubric, a: Assessment): Result {
  const stage = (a.initiative?.lifecycleStage ?? '');
  let answered = 0;
  let scoreable = 0;

  const domains: DomainScore[] = rubric.domains.map((domain) => {
    const sections: SectionScore[] = domain.sections.map((section) => {
      const questions: QuestionScore[] = section.questions.map((question) => {
        const ans = a.answers[question.id];
        const na = !!ans?.na;
        const isAnswered = !na && typeof ans?.score === 'number';
        // Progress counts a question as dealt with once it has a score OR has been marked not
        // applicable, because deciding it does not apply IS answering it. Showing 7 of 8 after
        // marking one n/a, when there are nine questions, reads as a question going missing.
        // The score is a separate matter: an n/a question still leaves the weighting entirely.
        scoreable++;
        if (isAnswered || na) answered++;
        const mult = rubric.stageMultipliers[questionExpectation(question, stage)] ?? 1;
        const qShare = section.questions.length ? question.weight / section.questions.reduce((t, x) => t + x.weight, 0) : 0;
        return {
          question,
          domainId: domain.id,
          sectionId: section.id,
          raw: isAnswered ? (ans!.score as number) : null,
          na,
          answered: isAnswered,
          effectiveWeight: isAnswered ? question.weight * mult : 0,
          expectation: effectiveExpectation(question, section, stage),
          share: (domain.weight / 100) * (section.weight / 100) * qShare,
        };
      });

      const wsum = questions.reduce((s, q) => s + q.effectiveWeight, 0);
      const expectation = sectionExpectation(section, stage);
      return {
        section,
        score: wsum === 0 ? null : questions.reduce((s, q) => s + (q.raw ?? 0) * q.effectiveWeight, 0) / wsum,
        weight: section.weight,
        effectiveWeight: section.weight * (rubric.stageMultipliers[expectation] ?? 1),
        expectation,
        answered: questions.filter((q) => q.answered || q.na).length,
        total: questions.length,
        questions,
      };
    });

    const scored = sections.filter((s) => s.score !== null);
    const sw = scored.reduce((s, x) => s + x.effectiveWeight, 0);
    return {
      domain,
      score: sw === 0 ? null : scored.reduce((s, x) => s + (x.score as number) * x.effectiveWeight, 0) / sw,
      weight: domain.weight,
      answered: sections.reduce((s, x) => s + x.answered, 0),
      total: sections.reduce((s, x) => s + x.total, 0),
      sections,
    };
  });

  const scored = domains.filter((d) => d.score !== null);
  const dw = scored.reduce((s, d) => s + d.weight, 0);
  const overall = dw === 0 ? null : scored.reduce((s, d) => s + (d.score as number) * d.weight, 0) / dw;

  const every = domains.flatMap((d) => d.sections.flatMap((x) => x.questions));
  const topics: TopicScore[] = (rubric.topics ?? []).map((topic) => {
    const mine = every.filter((q) => (q.question.topics ?? []).includes(topic.id));
    const scored = mine.filter((q) => q.answered);
    const wsum = scored.reduce((t, q) => t + q.effectiveWeight, 0);
    return {
      topic,
      score: wsum === 0 ? null : scored.reduce((t, q) => t + (q.raw as number) * q.effectiveWeight, 0) / wsum,
      answered: mine.filter((q) => q.answered || q.na).length,
      total: mine.length,
      redFlags: mine.filter(isRedFlag),
    };
  });

  return {
    overall,
    band: overall === null ? null : bandFor(rubric, overall),
    maturity: overall === null ? null : maturityFor(rubric, overall),
    domains,
    topics,
    completeness: scoreable === 0 ? 0 : answered / scoreable,
    answered,
    scoreable,
  };
}

/**
 * A no on a yes/no question. It colours the section and the person carries on: nothing in this
 * tool stops an assessment.
 */
export function isRedFlag(q: QuestionScore): boolean {
  return q.question.answerType === 'yesno' && q.answered && q.raw === 0;
}

/** Red-flagged questions in a section, used to colour it everywhere it appears. */
export function sectionRedFlags(s: SectionScore): QuestionScore[] {
  return s.questions.filter(isRedFlag);
}

export function domainRedFlags(d: DomainScore): QuestionScore[] {
  return d.sections.flatMap(sectionRedFlags);
}

export function bandFor(rubric: Rubric, overall: number): Band {
  const sorted = [...rubric.bands].sort((x, y) => y.min - x.min);
  return sorted.find((b) => overall >= b.min) ?? sorted[sorted.length - 1];
}

export function maturityFor(rubric: Rubric, overall: number): MaturityBand | null {
  if (!rubric.maturityBands?.length) return null;
  const sorted = [...rubric.maturityBands].sort((x, y) => y.min - x.min);
  return sorted.find((b) => overall >= b.min) ?? sorted[sorted.length - 1];
}

export function allQuestionScores(r: Result): QuestionScore[] {
  return r.domains.flatMap((d) => d.sections.flatMap((s) => s.questions));
}

/** Weakest answered questions first - this is the submitter's backlog. */
export function weakest(r: Result, n = 5): QuestionScore[] {
  return allQuestionScores(r)
    .filter((q) => q.answered)
    .sort((a, b) => (a.raw as number) - (b.raw as number))
    .slice(0, n);
}

export function strongest(r: Result, n = 3): QuestionScore[] {
  return allQuestionScores(r)
    .filter((q) => q.answered)
    .sort((a, b) => (b.raw as number) - (a.raw as number))
    .slice(0, n);
}

/** The next rung up the ladder, used to tell a low scorer what "better" looks like. */
export function nextAnchor(rubric: Rubric, q: Question, current: number) {
  const ladder = (q.anchors ?? rubric.scale.anchors).slice().sort((a, b) => a.value - b.value);
  return ladder.find((x) => x.value > current) ?? null;
}

export function anchorFor(rubric: Rubric, q: Question, value: number) {
  const ladder = (q.anchors ?? rubric.scale.anchors).slice().sort((a, b) => b.value - a.value);
  return ladder.find((x) => x.value <= value) ?? null;
}
