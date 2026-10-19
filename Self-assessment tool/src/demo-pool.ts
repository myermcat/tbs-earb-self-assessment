/**
 * Invented submissions, for showing the tool to a room.
 *
 * Every department here is made up and so is every answer. Nothing in this file has been near
 * the store, and a demonstration build never reads it, which is the whole reason this exists:
 * the alternative on the table was opening the real pool to anybody holding the address, and
 * that would put every department's work on the open internet to save a login.
 *
 * The names are obviously invented on purpose. A demonstration that used a real department's
 * name would be quoted back as that department's score.
 */
import { DEMO_MARK } from './keys';
import type { AssessorAudit } from './firebase';
import type { Assessment, Rubric } from './types';

interface Sketch {
  id: string;
  /** Its own reference. They shared one at first, and the list collapsed to a single row. */
  ref: string;
  name: string;
  department: string;
  stage: string;
  summary: string;
  /** Roughly where this one scores, so the pool has a weak, a middling and a strong record. */
  shape: 'weak' | 'middling' | 'strong';
  /** How much of it is filled in, as a fraction. A real pool holds unfinished work. */
  filled: number;
  submitted: boolean;
  /** Every one of these was Unclassified, so the marking column had one value down the page. */
  marking: 'Unclassified' | 'Protected A' | 'Protected B';
}

const SKETCHES: Sketch[] = [
  {
    id: 'DEMOAAAA1111', ref: 'DM01', name: 'Permit Renewal Online',
    department: 'Department of Invented Services', stage: 'beta',
    summary: 'Moving a paper permit renewal to a digital service. Invented, for demonstration.',
    shape: 'middling', filled: 1, submitted: true, marking: 'Unclassified',
  },
  {
    id: 'DEMOBBBB2222', ref: 'DM02', name: 'Grant Payments Platform',
    // This said 'live', which is not one of the seven stages the rubric has. Nothing refused it
    // and the stage multipliers simply found nothing to apply, so a demonstration scored it on a
    // stage that does not exist.
    department: 'Agency for Sample Programmes', stage: 'growth',
    summary: 'A payments platform for grants and contributions. Invented, for demonstration.',
    shape: 'strong', filled: 1, submitted: true, marking: 'Protected A',
  },
  {
    id: 'DEMOCCCC3333', ref: 'DM03', name: 'Case Management Replacement',
    department: 'Office of Example Operations', stage: 'discovery',
    summary: 'Replacing a case management system at end of life. Invented, for demonstration.',
    shape: 'weak', filled: 1, submitted: true, marking: 'Unclassified',
  },
  {
    id: 'DEMODDDD4444', ref: 'DM04', name: 'Inspections Mobile Tool',
    department: 'Bureau of Illustrative Inspections', stage: 'alpha',
    summary: 'A tablet tool for field inspectors. Invented, and part-finished on purpose.',
    shape: 'middling', filled: 0.45, submitted: false, marking: 'Unclassified',
  },
  /**
   * Four more, so the pool shows what a real one shows. The first four were all Unclassified,
   * all but one finished, and between them covered four of the seven lifecycle stages, so a
   * demonstration could not show a marking column with anything in it, a submission sent before
   * it was done, or what a sunset solution looks like beside one still in discovery.
   */
  {
    id: 'DEMOEEEE5555', ref: 'DM05', name: 'Benefits Eligibility Engine',
    department: 'Office of Illustrative Benefits', stage: 'stabilization',
    summary: 'Rules engine deciding benefit eligibility. Invented, for demonstration.',
    shape: 'weak', filled: 1, submitted: true, marking: 'Protected B',
  },
  {
    id: 'DEMOFFFF6666', ref: 'DM06', name: 'Records Retention Service',
    department: 'Sample Records Authority', stage: 'maturity',
    summary: 'Retention and disposition across departmental records. Invented.',
    shape: 'strong', filled: 1, submitted: true, marking: 'Protected A',
  },
  {
    id: 'DEMOGGGG7777', ref: 'DM07', name: 'Legacy Licensing Retirement',
    department: 'Example Licensing Directorate', stage: 'sunset',
    summary: 'Turning off a licensing system and moving its data. Invented.',
    shape: 'middling', filled: 0.92, submitted: true, marking: 'Unclassified',
  },
  {
    // Sent while still unfinished, which a real pool holds and this one never did.
    id: 'DEMOHHHH8888', ref: 'DM08', name: 'Client Notification Hub',
    department: 'Bureau of Demonstration Services', stage: 'beta',
    summary: 'One place for every notice a client receives. Invented, and sent part-finished.',
    shape: 'middling', filled: 0.7, submitted: true, marking: 'Protected B',
  },
];

/**
 * A score for one question, steady for a given assessment and question.
 *
 * Deterministic, because a pool that rolls new numbers on every repaint would show a different
 * portfolio each time somebody clicked, and the person demonstrating would be arguing with the
 * screen. Security is dragged down in the weak one on purpose, because the first thing the room
 * will ask is where the security is, and a pool where nothing is weak answers nothing.
 */
function scoreFor(shape: Sketch['shape'], qid: string, isSecurity: boolean): number {
  let h = 0;
  for (let i = 0; i < qid.length; i++) h = (h * 31 + qid.charCodeAt(i)) % 997;
  const spread = h % 3;
  const base = shape === 'strong' ? 8 : shape === 'middling' ? 5 : 3;
  const n = base + spread - 1;
  if (isSecurity && shape === 'weak') return Math.max(0, n - 2);
  if (isSecurity && shape === 'strong') return Math.min(10, n + 1);
  return Math.max(0, Math.min(10, n));
}

export function demoAssessments(rubric: Rubric): Assessment[] {
  const questions = rubric.domains.flatMap((d) => d.sections.flatMap((s) => s.questions));
  return SKETCHES.map((sk) => {
    const answers: Assessment['answers'] = {};
    const take = Math.round(questions.length * sk.filled);
    questions.slice(0, take).forEach((q) => {
      const isSecurity = (q.topics ?? []).includes('security');
      answers[q.id] = {
        score: scoreFor(sk.shape, q.id, isSecurity),
        justification: 'Invented answer, written for a demonstration.',
        evidence: [],
      };
    });
    return {
      fileType: 'gc-arch-assessment',
      formatVersion: 1,
      id: sk.id,
      ref: sk.ref,
      rubric: { id: rubric.id, version: rubric.version, title: rubric.title },
      initiative: {
        name: sk.name,
        department: sk.department,
        contact: 'someone@example.gc.ca',
        lifecycleStage: sk.stage,
        summary: sk.summary,
        classification: sk.marking,
      },
      answers,
      meta: {
        createdAt: '2026-09-01T09:00:00.000Z',
        updatedAt: '2026-09-18T15:00:00.000Z',
        appVersion: DEMO_MARK,
        ...(sk.submitted ? { submittedAt: '2026-09-18T15:00:00.000Z' } : {}),
      },
    } as Assessment;
  });
}

/**
 * Invented audits, so a demonstration can show what two assessors disagreeing looks like.
 *
 * The pool had none, so "Audited by others" never appeared and the dashboard counted nothing
 * re-scored. Asked for directly: show different people who audited.
 *
 * TWO THINGS MAKE A DISAGREEMENT VISIBLE RATHER THAN MERELY PRESENT, and both are easy to miss.
 *
 * A question only counts as audited when its entry carries a number, a verdict or a note. An
 * empty entry is what opening a submission writes for every question as a side effect of
 * drawing the controls, so seeding empty ones would make the screen say three people had
 * audited a question and then show nothing under it. Only the questions below are seeded.
 *
 * And an assessor who agrees at the same number writes no change, so the dashboard does not
 * count it and the screen has nothing to draw. Every reading here is deliberately a different
 * number from the department's own, and the two reviewers differ from each other.
 */
const REVIEWED: Record<string, Array<{
  who: string; name: string; at: string;
  /** Question id, how far the reading sits from the department's own score, verdict, note. */
  on: Array<[string, number, 'agree' | 'adjust' | 'insufficient', string]>;
  overall?: string;
}>> = {
  // The strong one, read by two people who do not agree with each other.
  DEMOBBBB2222: [
    {
      who: 'nick.brennan@example.gc.ca', name: 'Nick Brennan', at: '2026-09-22T14:10:00.000Z',
      on: [
        ['B-Q16', -2, 'adjust', 'The business case is there. The benefits are not measurable as written.'],
        ['D-Q25', -1, 'adjust', 'Encryption in transit is evidenced. At rest is asserted.'],
        ['A-Q20', -3, 'insufficient', 'Nothing attached showing the pipeline gates on anything.'],
      ],
      overall: 'Strong overall. Two of the three I moved are about the evidence behind a score.',
    },
    {
      who: 'allison.ward@example.gc.ca', name: 'Allison Ward', at: '2026-09-24T09:40:00.000Z',
      on: [
        ['B-Q16', 0, 'agree', 'Reads fine to me. The benefits section is thin but it is there.'],
        ['D-Q25', -3, 'adjust', 'At rest is not evidenced at all. Lower than my colleague has it.'],
        ['A-Q20', -1, 'adjust', 'Gates exist. They are not enforced on every branch.'],
      ],
      overall: 'I read D-Q25 harder than Nick does. Worth settling before the board.',
    },
  ],
  // The weak one, read by one person, which is the ordinary case.
  DEMOCCCC3333: [
    {
      who: 'allison.ward@example.gc.ca', name: 'Allison Ward', at: '2026-09-25T11:05:00.000Z',
      on: [
        ['B-Q1', -1, 'adjust', 'Current state is partly documented. Dependencies are not.'],
        ['T-Q29', -2, 'insufficient', 'No threat and risk assessment attached.'],
      ],
      overall: 'Early, and the scores say so.',
    },
  ],
  // Sent unfinished and already picked up, so a reader sees an audit on a part-finished record.
  DEMOHHHH8888: [
    {
      who: 'nick.brennan@example.gc.ca', name: 'Nick Brennan', at: '2026-09-26T16:20:00.000Z',
      on: [['B-Q29', 2, 'adjust', 'Better than scored. The feedback loop is real and running.']],
    },
  ],
};

/** The audits on each invented submission, keyed by the code the record carries. */
export function demoAudits(rubric: Rubric): Record<string, AssessorAudit[]> {
  const questions = rubric.domains.flatMap((d) => d.sections.flatMap((s) => s.questions));
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: Record<string, AssessorAudit[]> = {};
  for (const sk of SKETCHES) {
    const seeded = REVIEWED[sk.id];
    if (!seeded) continue;
    out[sk.id] = seeded.map((r) => ({
      reviewer: r.who,
      reviewerName: r.name,
      reviewedAt: r.at,
      updatedAt: r.at,
      overallNote: r.overall,
      perQuestion: Object.fromEntries(r.on.flatMap(([qid, delta, verdict, note]) => {
        const q = byId.get(qid);
        if (!q) return [];
        const theirs = scoreFor(sk.shape, qid, (q.topics ?? []).includes('security'));
        return [[qid, {
          auditedScore: Math.max(0, Math.min(10, theirs + delta)),
          verdict,
          note,
          by: r.who,
          at: r.at,
        }]];
      })),
    }));
  }
  return out;
}
