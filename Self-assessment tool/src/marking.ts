import { CLASSIFICATIONS, classRank, type Assessment, type Classification } from './types';

/**
 * Everything in this tool is unclassified, settled with Dan on 1 September, so the assessment
 * itself is always an unclassified document. `initiative.classification` therefore no longer
 * describes this file. It records the highest marking among the artefacts the answers point
 * at, which is what an assessor needs to know to go and read them.
 *
 * The field keeps its name so files saved earlier still open. Every label the reader sees
 * asks about the evidence.
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
      message: 'Say how your evidence is marked before saving. If every artefact you point at is unclassified, choose unclassified.',
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
          message: `${qid}: "${named}" is ${e.classification}, which is higher than the ${fileMark} you gave on the overview. Raise that answer to ${e.classification}.`,
        });
      }
    }
  }

  return out;
}

export function canSave(a: Assessment): boolean {
  return markingProblems(a).length === 0;
}

/**
 * The banner at the top and bottom of the page, and on every printout.
 *
 * The assessment is unclassified, so that is what the banner says. It used to print the
 * evidence marking as though the file itself were Protected A, which is the wrong marking on
 * a document and would be a real problem on paper.
 */
export function bannerFor(a: Assessment): string {
  return a.initiative.classification ? 'UNCLASSIFIED' : 'UNMARKED';
}

/** The second line: what the evidence behind the answers is marked, when it is not plain. */
export function evidenceNote(a: Assessment): string {
  const c = a.initiative.classification;
  return c && c !== 'Unclassified' ? `evidence up to ${c}` : '';
}

export { CLASSIFICATIONS };
