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
  /**
   * How far this one sits from the middle of its shape, in rungs.
   *
   * Three shapes gave three scores. Twenty records across three shapes gave three scores
   * twenty times, which is a portfolio with no spread in it: the dashboard's deviation came
   * out of the gap between the shapes and nothing else, and the list of what falls outside
   * one deviation held every record of the high shape and every record of the low one. A lean
   * per record is what makes the deviation a reading about this pool rather than a reading
   * about how many shapes this file has.
   */
  lean: number;
  /** How much of it is filled in, as a fraction. A real pool holds unfinished work. */
  filled: number;
  submitted: boolean;
  /** Every one of these was Unclassified, so the marking column had one value down the page. */
  marking: 'Unclassified' | 'Protected A' | 'Protected B';
  /**
   * What this one is better and worse at than the rest of its own answers, by topic or by
   * domain letter.
   *
   * Without it every record scores the same everywhere, so the five category readings printed
   * the same average, the same deviation and the same names under all five, and the four
   * domain readings came out within two tenths of each other. A room reads that as a tool that
   * cannot tell categories apart. Real departments are uneven: strong on the business case and
   * thin on security, or the reverse, and the whole point of reading by category is finding
   * which.
   */
  strongIn?: string[];
  weakIn?: string[];
  /**
   * How many pieces of evidence this one attached. The column read nought on all twenty rows,
   * which tells a room nothing about a column whose whole job is saying who backed their
   * answers up. Most departments attach little, a few attach a lot, and that gap is one of the
   * first things an assessor goes looking for.
   */
  evidence?: number;
}

const SKETCHES: Sketch[] = [
  {
    id: 'DEMOAAAA1111', ref: 'DM01', name: 'Permit Renewal Online',
    department: 'Department of Invented Services', stage: 'beta',
    summary: 'Moving a paper permit renewal to a digital service. Invented, for demonstration.',
    lean: 0, shape: 'middling', filled: 1, submitted: true, marking: 'Unclassified',
    evidence: 2,
    strongIn: ['official-languages'], weakIn: ['security'],
  },
  {
    id: 'DEMOBBBB2222', ref: 'DM02', name: 'Grant Payments Platform',
    // This said 'live', which is not one of the seven stages the rubric has. Nothing refused it
    // and the stage multipliers simply found nothing to apply, so a demonstration scored it on a
    // stage that does not exist.
    department: 'Agency for Sample Programmes', stage: 'growth',
    summary: 'A payments platform for grants and contributions. Invented, for demonstration.',
    lean: 0, shape: 'strong', filled: 1, submitted: true, marking: 'Protected A',
    evidence: 6,
    strongIn: ['financial'], weakIn: ['accessibility'],
  },
  {
    id: 'DEMOCCCC3333', ref: 'DM03', name: 'Case Management Replacement',
    department: 'Office of Example Operations', stage: 'discovery',
    summary: 'Replacing a case management system at end of life. Invented, for demonstration.',
    lean: -1, shape: 'weak', filled: 1, submitted: true, marking: 'Unclassified',
    weakIn: ['security', 'privacy'],
  },
  {
    id: 'DEMODDDD4444', ref: 'DM04', name: 'Inspections Mobile Tool',
    department: 'Bureau of Illustrative Inspections', stage: 'alpha',
    summary: 'A tablet tool for field inspectors. Invented, and part-finished on purpose.',
    lean: -1, shape: 'middling', filled: 0.45, submitted: false, marking: 'Unclassified',
    strongIn: ['A'], weakIn: ['accessibility'],
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
    lean: 0, shape: 'weak', filled: 1, submitted: true, marking: 'Protected B',
    strongIn: ['privacy'], weakIn: ['official-languages', 'D'],
  },
  {
    id: 'DEMOFFFF6666', ref: 'DM06', name: 'Records Retention Service',
    department: 'Sample Records Authority', stage: 'maturity',
    summary: 'Retention and disposition across departmental records. Invented.',
    lean: 1, shape: 'strong', filled: 1, submitted: true, marking: 'Protected A',
    evidence: 5,
    strongIn: ['privacy', 'D'], weakIn: ['financial'],
  },
  {
    id: 'DEMOGGGG7777', ref: 'DM07', name: 'Legacy Licensing Retirement',
    department: 'Example Licensing Directorate', stage: 'sunset',
    summary: 'Turning off a licensing system and moving its data. Invented.',
    lean: 1, shape: 'middling', filled: 0.92, submitted: true, marking: 'Unclassified',
    evidence: 1,
    strongIn: ['financial'], weakIn: ['T'],
  },
  {
    // Sent while still unfinished, which a real pool holds and this one never did.
    id: 'DEMOHHHH8888', ref: 'DM08', name: 'Client Notification Hub',
    department: 'Bureau of Demonstration Services', stage: 'beta',
    summary: 'One place for every notice a client receives. Invented, and sent part-finished.',
    lean: 0, shape: 'middling', filled: 0.7, submitted: true, marking: 'Protected B',
    strongIn: ['accessibility'], weakIn: ['official-languages'],
  },
  /**
   * Twelve more, because eight is too few for the readings the dashboard now puts on top of
   * them. With eight records one submission moves the mean by an eighth of its distance, the
   * deviation is mostly a statement about that one record, and the list of what falls outside
   * the deviation is as long as the list of what is in the pool. Asked for directly: more than
   * eight.
   *
   * The leans below spread the twenty across the whole range, two near the bottom and two near
   * the top, because twenty departments do not score alike and a pool shaped to flatter one
   * reading on one screen is the wrong pool. About a third of any spread falls outside one
   * deviation whatever the numbers are, so the anomaly list is capped at the six furthest out
   * and says how many there were.
   */
  {
    id: 'DEMOJJJJ2345', ref: 'DM09', name: 'Travel Claims Modernization',
    department: 'Office of Sample Travel', stage: 'growth',
    summary: 'Replacing the travel claim form and what is behind it. Invented.',
    lean: -1, shape: 'strong', filled: 1, submitted: true, marking: 'Protected A',
    evidence: 3,
    strongIn: ['financial', 'B'], weakIn: ['privacy'],
  },
  {
    id: 'DEMOKKKK3456', ref: 'DM10', name: 'Shoreline Monitoring Network',
    department: 'Agency for Example Environment', stage: 'alpha',
    summary: 'Sensors along the coast, reporting into one place. Invented.',
    lean: -1, shape: 'middling', filled: 1, submitted: true, marking: 'Unclassified',
    strongIn: ['T'], weakIn: ['security', 'B'],
  },
  {
    id: 'DEMOLLLL4567', ref: 'DM11', name: 'Pension Statement Rewrite',
    department: 'Illustrative Pensions Branch', stage: 'maturity',
    summary: 'The annual statement, rewritten and redelivered. Invented.',
    lean: -1, shape: 'strong', filled: 1, submitted: true, marking: 'Protected B',
    evidence: 4,
    strongIn: ['accessibility', 'official-languages'], weakIn: ['A'],
  },
  {
    id: 'DEMOMMMM5678', ref: 'DM12', name: 'Border Declaration Kiosk',
    department: 'Bureau of Sample Borders', stage: 'beta',
    summary: 'A kiosk taking declarations on arrival. Invented.',
    lean: 1, shape: 'middling', filled: 1, submitted: true, marking: 'Protected A',
    evidence: 2,
    strongIn: ['security'], weakIn: ['accessibility', 'official-languages'],
  },
  {
    // A draft, so the pool holds work nobody has sent yet at more than one stage of being done.
    id: 'DEMONNNN6789', ref: 'DM13', name: 'Procurement Intake Portal',
    department: 'Office of Demonstration Procurement', stage: 'stabilization',
    summary: 'One front door for procurement requests. Invented, and barely started.',
    lean: 0, shape: 'weak', filled: 0.3, submitted: false, marking: 'Unclassified',
    weakIn: ['financial', 'T'],
  },
  {
    id: 'DEMOPPPP7892', ref: 'DM14', name: 'Veterans Benefits Lookup',
    department: 'Example Veterans Directorate', stage: 'growth',
    summary: 'Letting somebody see what they are entitled to. Invented.',
    lean: 0, shape: 'middling', filled: 1, submitted: true, marking: 'Protected B',
    strongIn: ['accessibility'], weakIn: ['security'],
  },
  {
    // Near the bottom of the range, which every portfolio of twenty has.
    id: 'DEMOQQQQ8923', ref: 'DM15', name: 'Fisheries Quota Ledger',
    department: 'Invented Fisheries Authority', stage: 'discovery',
    summary: 'Tracking quota against catch. Invented, and early.',
    lean: -1, shape: 'weak', filled: 1, submitted: true, marking: 'Unclassified',
    weakIn: ['security', 'T'],
  },
  {
    // And near the top.
    id: 'DEMORRRR9234', ref: 'DM16', name: 'Identity Credential Broker',
    department: 'Sample Identity Services', stage: 'maturity',
    summary: 'Brokering credentials between departments. Invented.',
    lean: 1, shape: 'strong', filled: 1, submitted: true, marking: 'Protected B',
    evidence: 6,
    strongIn: ['security', 'privacy'], weakIn: ['financial'],
  },
  {
    id: 'DEMOSSSS2456', ref: 'DM17', name: 'Heritage Collections Catalogue',
    department: 'Office of Illustrative Heritage', stage: 'beta',
    summary: 'A catalogue of what the collection holds. Invented, and sent part-finished.',
    lean: 1, shape: 'middling', filled: 0.6, submitted: true, marking: 'Unclassified',
    strongIn: ['official-languages'], weakIn: ['privacy'],
  },
  {
    id: 'DEMOTTTT3567', ref: 'DM18', name: 'Payroll Exception Queue',
    department: 'Demonstration Pay Centre', stage: 'stabilization',
    summary: 'The queue of pay cases that need a person. Invented.',
    lean: 0, shape: 'middling', filled: 1, submitted: true, marking: 'Protected A',
    evidence: 1,
    strongIn: ['financial'], weakIn: ['privacy', 'accessibility'],
  },
  {
    id: 'DEMOUUUU4678', ref: 'DM19', name: 'Weather Alert Relay',
    department: 'Agency for Invented Forecasting', stage: 'growth',
    summary: 'Getting an alert to the people under it. Invented.',
    lean: 2, shape: 'middling', filled: 1, submitted: true, marking: 'Unclassified',
    strongIn: ['T', 'accessibility'], weakIn: ['financial'],
  },
  {
    id: 'DEMOVVVV5789', ref: 'DM20', name: 'Property Title Registry Move',
    department: 'Example Title Registry', stage: 'sunset',
    summary: 'Moving a title registry off its last server. Invented, and unsent.',
    lean: 1, shape: 'middling', filled: 0.55, submitted: false, marking: 'Protected A',
    strongIn: ['D'], weakIn: ['security'],
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
function scoreFor(sk: Sketch, qid: string, tags: string[]): number {
  let h = 0;
  for (let i = 0; i < qid.length; i++) h = (h * 31 + qid.charCodeAt(i)) % 997;
  const spread = h % 3;
  const base = (sk.shape === 'strong' ? 8 : sk.shape === 'middling' ? 5 : 3) + sk.lean;
  let n = base + spread - 1;
  /**
   * A weakness moves further than a strength, because an assessor reading this pool is looking
   * for the category somebody is thin on and a weakness worth one rung disappears into the
   * spread.
   *
   * How far is its own number per department rather than the same number for all of them. A
   * flat offset puts every tilted record at one remove and every other record at none, which
   * is two clumps and no middle, and on a category of two or three questions that is the whole
   * distribution. Departments are thin on security by their own amounts.
   */
  const weak = tags.find((x) => sk.weakIn?.includes(x));
  if (weak) n -= 2 + (stir(sk.id + weak) % 3);
  const strongAt = tags.find((x) => sk.strongIn?.includes(x));
  if (strongAt) n += 1 + (stir(sk.id + strongAt) % 3);
  return Math.max(0, Math.min(10, n));
}

/** A steady number from a string, so a department's unevenness is the same on every repaint. */
function stir(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return h;
}

/** A question's topics and the letter of its domain, which is what a profile is written in. */
function tagsOf(qid: string, topics: string[]): string[] {
  return [...topics, qid.split('-')[0]];
}

/**
 * Invented attachments. Nothing is uploaded and no location resolves: a demonstration that
 * carried a real file would be handing a room a document to open.
 */
const ATTACHED: Array<{ title: string; kind: 'document' | 'diagram' | 'dashboard' | 'system' | 'report' | 'other' }> = [
  { title: 'Current state architecture, approved', kind: 'diagram' },
  { title: 'Business case, signed', kind: 'document' },
  { title: 'Threat and risk assessment', kind: 'report' },
  { title: 'Privacy impact assessment', kind: 'document' },
  { title: 'Availability over the last four quarters', kind: 'dashboard' },
  { title: 'Accessibility audit, third party', kind: 'report' },
];

export function demoAssessments(rubric: Rubric): Assessment[] {
  const questions = rubric.domains.flatMap((d) => d.sections.flatMap((s) => s.questions));
  return SKETCHES.map((sk) => {
    const answers: Assessment['answers'] = {};
    const take = Math.round(questions.length * sk.filled);
    const attach = sk.evidence ? ATTACHED : [];
    let placed = 0;
    let answered = 0;
    questions.slice(0, take).forEach((q) => {
      answers[q.id] = {
        score: scoreFor(sk, q.id, tagsOf(q.id, q.topics ?? [])),
        justification: 'Invented answer, written for a demonstration.',
        evidence: [],
      };
      // Spread across the questionnaire and not piled on the first few, so a reader opening
      // the record meets them where a department would have put them.
      if (attach.length) {
        const where = Math.floor(take / (sk.evidence ?? 1) / 2);
        if (where > 0 && placed < (sk.evidence ?? 0) && answered % where === 0) {
          const item = ATTACHED[placed % ATTACHED.length];
          answers[q.id].evidence = [{
            title: item.title, kind: item.kind,
            location: 'Invented, for demonstration.',
            classification: sk.marking,
          }];
          placed++;
        }
      }
      answered++;
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
 * The assessors here are named nobody. They were first given the first names of two people who
 * will be in the room when this is shown, which puts an invented opinion against a real
 * person's name on a screen they are looking at. The departments in this file are invented for
 * the same reason, and `test/smoke.ts` already refuses a rubric that names anybody.
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
      who: 'margaret.shaw@example.gc.ca', name: 'Margaret Shaw', at: '2026-09-22T14:10:00.000Z',
      on: [
        ['B-Q16', -2, 'adjust', 'The business case is there. The benefits are not measurable as written.'],
        ['D-Q25', -1, 'adjust', 'Encryption in transit is evidenced. At rest is asserted.'],
        ['A-Q20', -3, 'insufficient', 'Nothing attached showing the pipeline gates on anything.'],
      ],
      overall: 'Strong overall. Two of the three I moved are about the evidence behind a score.',
    },
    {
      who: 'owen.fitzgerald@example.gc.ca', name: 'Owen Fitzgerald', at: '2026-09-24T09:40:00.000Z',
      on: [
        ['B-Q16', 0, 'agree', 'Reads fine to me. The benefits section is thin but it is there.'],
        ['D-Q25', -3, 'adjust', 'At rest is not evidenced at all. Lower than my colleague has it.'],
        ['A-Q20', -1, 'adjust', 'Gates exist. They are not enforced on every branch.'],
      ],
      overall: 'I read D-Q25 harder than Margaret does. Worth settling before the board.',
    },
  ],
  // The weak one, read by one person, which is the ordinary case.
  DEMOCCCC3333: [
    {
      who: 'owen.fitzgerald@example.gc.ca', name: 'Owen Fitzgerald', at: '2026-09-25T11:05:00.000Z',
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
      who: 'margaret.shaw@example.gc.ca', name: 'Margaret Shaw', at: '2026-09-26T16:20:00.000Z',
      on: [['B-Q29', 2, 'adjust', 'Better than scored. The feedback loop is real and running.']],
    },
  ],
  /**
   * The high one, read by three people, because the record at the top of the list is the one a
   * board argues over and a demonstration should have an argument in it.
   */
  DEMORRRR9234: [
    {
      who: 'margaret.shaw@example.gc.ca', name: 'Margaret Shaw', at: '2026-09-29T10:15:00.000Z',
      on: [
        ['A-Q14', -2, 'adjust', 'The interfaces are governed inside the department. Across departments they are agreements on paper.'],
        ['T-Q17', -1, 'adjust', 'Recovery time is stated. The test that proves it was last run a year ago.'],
      ],
      overall: 'Good work, scored a little generously at the top end.',
    },
    {
      who: 'owen.fitzgerald@example.gc.ca', name: 'Owen Fitzgerald', at: '2026-09-30T13:05:00.000Z',
      on: [
        ['A-Q14', -1, 'adjust', 'Governed well enough for what it does today. It will strain when a second department joins.'],
        ['A-Q5', -3, 'insufficient', 'The remediation status is a date with nothing behind it.'],
      ],
      overall: 'Closer to the department than Margaret is, apart from A-Q5.',
    },
    {
      who: 'dana.whitfield@example.gc.ca', name: 'Dana Whitfield', at: '2026-10-01T09:30:00.000Z',
      on: [
        ['A-Q5', -1, 'adjust', 'There is a remediation plan. It has slipped twice.'],
        ['D-Q31', 1, 'adjust', 'More reusable than scored. The schemas are published.'],
      ],
      overall: 'Three of us now have A-Q5 at three different numbers. That is the one to settle.',
    },
  ],
  // The low one, read by two people who agree with each other, which also happens.
  DEMOQQQQ8923: [
    {
      who: 'owen.fitzgerald@example.gc.ca', name: 'Owen Fitzgerald', at: '2026-09-28T11:45:00.000Z',
      on: [
        ['B-Q22', -1, 'insufficient', 'No funding named past the first year.'],
        ['T-Q33', -1, 'insufficient', 'Monitoring is on the list of things to do.'],
      ],
      overall: 'Early, and the department has said so in its own scores.',
    },
    {
      who: 'dana.whitfield@example.gc.ca', name: 'Dana Whitfield', at: '2026-10-02T15:20:00.000Z',
      on: [['B-Q22', -1, 'insufficient', 'Same reading as my colleague. One year of funding against a five year plan.']],
    },
  ],
  // One reading on a strong record, so the list has an audit with no argument attached.
  DEMOJJJJ2345: [
    {
      who: 'dana.whitfield@example.gc.ca', name: 'Dana Whitfield', at: '2026-09-27T14:00:00.000Z',
      on: [['B-Q40', 2, 'adjust', 'Satisfaction is measured every quarter and the last two rounds changed the roadmap.']],
      overall: 'Scored lower than it deserves on the client side.',
    },
  ],
  // Two readings that move a record in opposite directions, which nets to almost nothing.
  DEMOMMMM5678: [
    {
      who: 'margaret.shaw@example.gc.ca', name: 'Margaret Shaw', at: '2026-09-29T16:40:00.000Z',
      on: [['T-Q6', -2, 'adjust', 'On demand inside the data centre. Anything new takes six weeks.']],
    },
    {
      who: 'owen.fitzgerald@example.gc.ca', name: 'Owen Fitzgerald', at: '2026-10-03T10:10:00.000Z',
      on: [['T-Q6', 2, 'adjust', 'Six weeks is the old number. The self serve path went in this spring.']],
      overall: 'Margaret and I are two rungs apart on one question and together everywhere else.',
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
        const theirs = scoreFor(sk, qid, tagsOf(qid, q.topics ?? []));
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
