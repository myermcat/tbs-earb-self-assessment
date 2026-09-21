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
}

const SKETCHES: Sketch[] = [
  {
    id: 'DEMOAAAA1111', ref: 'DM01', name: 'Permit Renewal Online',
    department: 'Department of Invented Services', stage: 'beta',
    summary: 'Moving a paper permit renewal to a digital service. Invented, for demonstration.',
    shape: 'middling', filled: 1, submitted: true,
  },
  {
    id: 'DEMOBBBB2222', ref: 'DM02', name: 'Grant Payments Platform',
    department: 'Agency for Sample Programmes', stage: 'live',
    summary: 'A payments platform for grants and contributions. Invented, for demonstration.',
    shape: 'strong', filled: 1, submitted: true,
  },
  {
    id: 'DEMOCCCC3333', ref: 'DM03', name: 'Case Management Replacement',
    department: 'Office of Example Operations', stage: 'discovery',
    summary: 'Replacing a case management system at end of life. Invented, for demonstration.',
    shape: 'weak', filled: 1, submitted: true,
  },
  {
    id: 'DEMODDDD4444', ref: 'DM04', name: 'Inspections Mobile Tool',
    department: 'Bureau of Illustrative Inspections', stage: 'alpha',
    summary: 'A tablet tool for field inspectors. Invented, and part-finished on purpose.',
    shape: 'middling', filled: 0.45, submitted: false,
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
        classification: 'Unclassified',
      },
      answers,
      meta: {
        createdAt: '2026-09-01T09:00:00.000Z',
        updatedAt: '2026-09-18T15:00:00.000Z',
        appVersion: 'demonstration',
        ...(sk.submitted ? { submittedAt: '2026-09-18T15:00:00.000Z' } : {}),
      },
    } as Assessment;
  });
}
