import { CLASSIFICATIONS, classRank, type Assessment, type Classification } from './types';

/**
 * Dan asked for the tool to push the user into marking what they enter, and to refuse to
 * save until they have.
 *
 * A number is not classified. What can be classified is text somebody wrote and files
 * somebody attached - so the marking lives on the file as a whole and on each attachment,
 * the way a real GC document is marked, rather than on each of 176 scores.
 */

export interface MarkingProblem {
  kind: 'no-file-marking' | 'unmarked-evidence' | 'evidence-above-file';
  message: string;
  questionId?: string;
}

export function highestEvidenceMarking(a: Assessment): Classification | '' {
  let top: Classification | '' = '';
  for (const ans of Object.values(a.answers)) {
    for (const e of ans.evidence ?? []) {
      if (classRank(e.classification) > classRank(top)) top = e.classification;
    }
  }
  return top;
}

/** Everything standing between the user and a saved file. Empty means good to go. */
export function markingProblems(a: Assessment): MarkingProblem[] {
  const out: MarkingProblem[] = [];
  const fileMark = a.initiative.classification;

  // "Content" is anything a person typed or attached. An initiative name can itself be
  // sensitive, so it counts; a score on its own does not, but it means the file is in use.
  const hasContent =
    !!a.initiative.name.trim() ||
    !!a.initiative.summary.trim() ||
    Object.values(a.answers).some(
      (ans) => (ans.justification ?? '').trim() || (ans.evidence ?? []).length || typeof ans.score === 'number',
    );

  if (hasContent && !fileMark) {
    out.push({
      kind: 'no-file-marking',
      message: 'Mark this assessment before saving it. Choose the highest marking of anything you have put in it.',
    });
  }

  for (const [qid, ans] of Object.entries(a.answers)) {
    for (const e of ans.evidence ?? []) {
      const named = e.title || e.attachment?.name || 'an evidence item';
      if (!e.classification) {
        out.push({ kind: 'unmarked-evidence', questionId: qid, message: `${qid}: mark "${named}".` });
      } else if (fileMark && classRank(e.classification) > classRank(fileMark)) {
        out.push({
          kind: 'evidence-above-file',
          questionId: qid,
          message: `${qid}: "${named}" is ${e.classification}, which is higher than this file's ${fileMark} marking. Either raise the file's marking or point at the artefact instead of attaching it.`,
        });
      }
    }
  }

  return out;
}

export function canSave(a: Assessment): boolean {
  return markingProblems(a).length === 0;
}

/** The banner text that goes at the top and bottom of the page and on every printout. */
export function bannerFor(a: Assessment): string {
  return a.initiative.classification ? a.initiative.classification.toUpperCase() : 'UNMARKED';
}

export { CLASSIFICATIONS };
