import { CLASSIFICATIONS, classRank, type Assessment, type Classification } from './types';

/**
 * Everything in this tool is unclassified, settled with Dan on 1 September, so the assessment
 * itself is always an unclassified document. `initiative.classification` therefore does not
 * describe this file. It records the highest marking among the artefacts the answers point
 * at, which is what an assessor needs to know to go and read them.
 *
 * THE FIELD IS DERIVED NOW, AND NOBODY IS ASKED FOR IT.
 *
 * It used to be a picker on the overview, one of three groups there, and every evidence row
 * carried its own marking as well. Asked on 20 October: why do we need the original picker of
 * how your evidence is ranked if we rank each evidence anyway, and it can automatically give
 * the highest ranking from the ones that we give. The tool was asking the same fact twice and
 * then carrying two guards for the two answers disagreeing, one blocking the save and one a
 * dialog in the middle of typing. Both are gone with the question.
 *
 * The field keeps its name and keeps being written into the record, because every assessment
 * already saved carries it and an assessor\u2019s screens read it. A string inside somebody
 * else\u2019s saved record is a key.
 */

export interface MarkingProblem {
  kind: 'classified-attachment';
  message: string;
  questionId?: string;
}

/** The highest marking among the evidence, which is what this assessment points at. */
export function derivedMarking(a: Assessment): Classification {
  let top: Classification = 'Unclassified';
  for (const ans of Object.values(a.answers ?? {})) {
    for (const e of ans.evidence ?? []) {
      if (!e.classification) continue;
      if (classRank(e.classification) > classRank(top)) top = e.classification;
    }
  }
  return top;
}

/**
 * Write the derived marking into the record.
 *
 * Called wherever an evidence marking can change and once when an assessment is opened, so a
 * file saved under the old picker comes up carrying whatever its evidence actually says. A
 * record whose picker was set higher than any of its evidence comes down, which is the honest
 * answer: the picker was the guess and the rows are the fact.
 */
export function syncMarking(a: Assessment): Classification {
  const c = derivedMarking(a);
  // A record read off disk or out of the store may be missing whole fields. This runs on
  // every one of them as they open, and throwing here made a draft with no initiative in it
  // unreadable: loadDraft caught the error and returned null, so the browser's own record
  // vanished from a list that is built by asking for it by id.
  if (a.initiative) a.initiative.classification = c;
  return c;
}

/** How many pieces of evidence this assessment points at, counting only rows with something in them. */
export function evidenceCount(a: Assessment): number {
  let n = 0;
  for (const ans of Object.values(a.answers)) {
    for (const e of ans.evidence ?? []) if (!isEmptyRow(e)) n++;
  }
  return n;
}

function isEmptyRow(e: { title?: string; location?: string; note?: string; attachment?: unknown }): boolean {
  return !(e.title ?? '').trim() && !(e.location ?? '').trim()
    && !(e.note ?? '').trim() && !e.attachment;
}

/**
 * Everything standing between the user and a saved file. Empty means good to go.
 *
 * THREE OF THE FOUR WENT ON 20 OCTOBER. `no-file-marking` refused to save an assessment
 * nobody had given a marking, and the answer to that was: thats okay, maybe it doesnt have
 * evidence yet, its okay to save unmarked file. `evidence-above-file` cannot happen now,
 * because the file marking is the highest of the evidence and nothing can be above it. And
 * `unmarked-evidence`, which stopped a save while a row had a title and no marking, was put
 * to her as the one block left and answered: no.
 *
 * What is left refuses one thing, and it is the only one that is about the material rather
 * than about the form: a file above unclassified held inside this assessment. That is not a
 * tidiness rule. Nothing above unclassified may be in this document at all.
 *
 * An unmarked row still shows as unmarked, on the row, where the control is. The marking it
 * does not carry counts as nothing when the file's own marking is worked out, so the derived
 * answer can only ever be too low, never too high. Saying so is the row's job and not the
 * save button's.
 */
export function markingProblems(a: Assessment): MarkingProblem[] {
  const out: MarkingProblem[] = [];

  for (const [qid, ans] of Object.entries(a.answers)) {
    for (const e of ans.evidence ?? []) {
      const named = e.title || e.attachment?.name || 'an evidence item';
      /**
       * An artefact above unclassified must not be held in this file at all, and hiding the
       * attach control is not enough: attaching while a row is unclassified and raising the
       * marking afterwards kept the file, saved it, and passed every check.
       */
      if (e.attachment && e.classification && e.classification !== 'Unclassified') {
        out.push({
          kind: 'classified-attachment',
          questionId: qid,
          message: `${qid}: "${named}" is marked ${e.classification} and is attached to this file. Nothing above unclassified can be held here. Remove the file and send it to your assessor by email.`,
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
 * The assessment is unclassified, so that is what the banner says, always. It used to print
 * the evidence marking as though the file itself were Protected A, which is the wrong marking
 * on a document and would be a real problem on paper. It also used to print "Unmarked", which
 * no longer exists: a file with no evidence derives Unclassified.
 */
export function bannerFor(_a: Assessment): string {
  return 'UNCLASSIFIED';
}

/** The second line: what the evidence behind the answers is marked, when it is not plain. */
export function evidenceNote(a: Assessment): string {
  const c = a.initiative.classification;
  return c && c !== 'Unclassified' ? `evidence up to ${c}` : '';
}

export { CLASSIFICATIONS };
