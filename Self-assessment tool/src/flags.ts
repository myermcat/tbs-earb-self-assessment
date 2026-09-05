import type { Assessment, Rubric } from './types';
import { allQuestionScores, type Result } from './scoring';

/**
 * The anomaly detector. This is the part that replaces reading a deck:
 * the assessor's new job is auditing the places where the claimed score and the
 * evidence do not agree, not re-reading every answer.
 */

export type FlagSeverity = 'high' | 'medium' | 'low' | 'info';

export interface Flag {
  id: string;
  questionId?: string;
  severity: FlagSeverity;
  title: string;
  detail: string;
  challenge?: string;      // a question the assessor can ask in the room. Templated, not generated.
  share?: number;          // how much of the score this question carries, for ranking
  questionIds?: string[];  // set on an aggregated flag
}

/**
 * Some findings are individually interesting; others arrive in bulk. Seventy separate
 * "high score, nothing cited" cards is not a worklist, it is wallpaper - so the bulk kinds
 * collapse into one card once there are more than a few, naming the count and the heaviest
 * examples. The rare kinds stay per-question, because each one is its own story.
 */
const AGGREGATE_AT = 4;

/**
 * Every per-question kind can arrive in bulk, so all of them collapse at the same threshold
 * and rarity decides rather than a guess about which kinds are common. Below the threshold
 * each one keeps its own card, because three of anything is still readable.
 */
const AGGREGATABLE: Record<string, (n: number) => string> = {
  'high-score-no-evidence':    (n) => `${n} high scores with nothing cited`,
  'low-score-with-evidence':   (n) => `${n} low scores where evidence was provided anyway`,
  'perfect-thin-justification': (n) => `${n} full marks with barely a sentence behind them`,
  'evidence-not-attached':     (n) => `${n} high scores where evidence was pointed at, not attached`,
  'stage-mismatch':            (n) => `${n} answers unusually confident for this lifecycle stage`,
  unanswered:                  (n) => `${n} questions left unanswered`,
  'picklist-other':            (n) => `${n} answers of "other"`,
};

export function flags(rubric: Rubric, a: Assessment, r: Result): Flag[] {
  const out: Flag[] = [];
  const all = allQuestionScores(r);
  const push = (f: Flag, share?: number) => out.push(share === undefined ? f : { ...f, share });

  for (const qs of all) {
    const q = qs.question;
    const ans = a.answers[q.id];
    if (!ans) continue;
    const ev = ans.evidence ?? [];
    const just = (ans.justification ?? '').trim();

    if (qs.answered && (qs.raw as number) >= 8 && ev.length === 0) {
      push({
        share: qs.share,
        id: 'high-score-no-evidence',
        questionId: q.id,
        severity: 'high',
        title: 'High score, nothing cited',
        detail: `Scored ${qs.raw} out of 10 with no evidence referenced.`,
        challenge: `You scored ${qs.raw} on "${q.text}" and cited nothing. What would you show us?`,
      });
    }

    if (qs.answered && (qs.raw as number) <= 2 && ev.length > 0) {
      push({
        share: qs.share,
        id: 'low-score-with-evidence',
        questionId: q.id,
        severity: 'medium',
        title: 'Low score, but evidence was provided',
        detail: `Scored ${qs.raw} out of 10 yet referenced ${ev.length} item(s). Either the score is too harsh or the evidence does not support the question.`,
        challenge: `Why did this score a ${qs.raw} when you gave us ${ev[0].title}?`,
      });
    }

    if (qs.answered && (qs.raw as number) === 10 && just.length < 40) {
      push({
        share: qs.share,
        id: 'perfect-thin-justification',
        questionId: q.id,
        severity: 'medium',
        title: 'Full marks, thin explanation',
        detail: 'A 10 out of 10 with fewer than 40 characters of justification.',
        challenge: `You gave yourself full marks on "${q.text}". Walk us through how it is reviewed and used.`,
      });
    }

    if (!qs.na && !qs.answered) {
      push({
        share: qs.share,
        id: 'unanswered',
        questionId: q.id,
        severity: 'low',
        title: 'Not answered',
        detail: 'Left blank and not marked as not applicable.',
      });
    }

    if (qs.answered && (qs.raw as number) >= 8 && ev.length > 0 && ev.every((e) => !e.attachment)) {
      push({
        share: qs.share,
        id: 'evidence-not-attached',
        questionId: q.id,
        severity: 'low',
        title: 'High score, evidence pointed at but not attached',
        detail: ev.map((e) => `"${e.title || 'untitled'}" at ${e.location || 'no location given'}`).join('; '),
        challenge: `You scored ${qs.raw} here and pointed us at ${ev[0].title || 'something'} without attaching it. Can we see it?`,
      });
    }

    if (ans.picklist === 'other') {
      push({
        share: qs.share,
        id: 'picklist-other',
        questionId: q.id,
        severity: 'info',
        title: 'Answered "other"',
        detail: `"${ans.picklistOther ?? 'no description given'}". Worth checking whether the list is missing a common option.`,
      });
    }

    // Deliberately not flagged: evidence marked Protected B or above. That is ordinary in
    // government, and calling it an anomaly trains people to ignore the anomaly list. The
    // marking is handling information, so it shows on the submission header and beside each
    // evidence item instead.
  }

  // Whole-assessment patterns.
  const answeredScores = all.filter((q) => q.answered).map((q) => q.raw as number);

  if (answeredScores.length >= 5) {
    const counts = new Map<number, number>();
    for (const s of answeredScores) counts.set(s, (counts.get(s) ?? 0) + 1);
    const [topValue, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCount / answeredScores.length >= 0.7) {
      out.push({
        id: 'flat-scoring',
        severity: 'medium',
        title: 'Scores barely vary',
        detail: `${topCount} of ${answeredScores.length} answers are all ${topValue}. This reads as box-ticking.`,
        challenge: 'Which of these areas is genuinely your weakest, and why did it score the same as your strongest?',
      });
    }
  }

  /**
   * A routing threshold on a self-scored number can be cleared by moving one answer from a 6
   * to an 8, and nobody has to lie to themselves very hard to do it. A score resting just
   * above a line that decides whether the board sees you at all is worth a second look, which
   * is the cheapest possible defence and needs no policy.
   */
  if (r.overall !== null && r.band) {
    const margin = r.overall - r.band.min;
    if (r.band.min > 0 && margin < 0.35) {
      out.push({
        id: 'just-above-the-line',
        severity: 'medium',
        title: `Just above the ${r.band.label.toLowerCase()} line`,
        detail: `${r.overall.toFixed(2)} against a threshold of ${r.band.min}. ` +
          'A margin this thin is one answer wide, so the routing rests on a single score.',
        challenge: 'Which single answer would you least like us to check?',
      });
    }
  }

  if (r.overall !== null && r.overall >= 9) {
    out.push({
      id: 'self-score-outlier',
      severity: 'high',
      title: 'Very high self-score',
      detail: `Overall ${r.overall.toFixed(1)} out of 10. Include this one in the audit sample regardless of routing.`,
    });
  }

  const naCount = all.filter((q) => q.na).length;
  if (all.length > 0 && naCount / all.length > 0.25) {
    out.push({
      id: 'na-heavy',
      severity: 'medium',
      title: 'Heavy use of not applicable',
      detail: `${naCount} of ${all.length} questions marked not applicable.`,
      challenge: 'Talk the board through why so much of the rubric does not apply to this initiative.',
    });
  }

  if (r.completeness < 0.8) {
    out.push({
      id: 'incomplete',
      severity: 'high',
      title: 'Incomplete submission',
      detail: `${r.answered} of ${r.scoreable} questions answered (${Math.round(r.completeness * 100)}%). ` +
        'Every score below is calculated from that fraction.',
    });
  }

  // Stage sanity: confident about cost while still in discovery.
  const stage = (a.initiative?.lifecycleStage ?? '');
  if (stage === 'discovery' || stage === 'alpha') {
    for (const qs of all) {
      if (qs.expectation === 'low-ok' && qs.answered && (qs.raw as number) >= 9) {
        push({
          share: qs.share,
          id: 'stage-mismatch',
          questionId: qs.question.id,
          severity: 'low',
          title: 'Unusually confident for this stage',
          detail: `Scored ${qs.raw} on something most initiatives cannot know at ${stage}. If it is real it is worth showcasing; if not, it is worth challenging.`,
          challenge: `You are at ${stage} and scored ${qs.raw} here. How do you already know that?`,
        });
      }
    }
  }

  const collapsed = collapse(out, r);

  // A submission that is already flagged as incomplete does not also need its 147 unanswered
  // questions listed heaviest first. One fact, said once.
  const alreadyIncomplete = collapsed.some((f) => f.id === 'incomplete');
  return rank(collapsed.filter((f) => !(alreadyIncomplete && f.id === 'unanswered-many')));
}

/** Collapse the bulk kinds into one card each, keeping the heaviest examples. */
function collapse(flags: Flag[], r: Result): Flag[] {
  const shareOf = new Map(allQuestionScores(r).map((qs) => [qs.question.id, qs]));
  const groups = new Map<string, Flag[]>();
  const kept: Flag[] = [];

  for (const f of flags) {
    if (f.questionId && AGGREGATABLE[f.id]) {
      groups.set(f.id, [...(groups.get(f.id) ?? []), f]);
    } else {
      kept.push(f);
    }
  }

  for (const [id, group] of groups) {
    if (group.length < AGGREGATE_AT) { kept.push(...group); continue; }

    const titleFor = AGGREGATABLE[id];
    const sorted = [...group].sort(
      (a, b) => (shareOf.get(b.questionId!)?.share ?? 0) - (shareOf.get(a.questionId!)?.share ?? 0),
    );
    const top = sorted.slice(0, 5);
    const named = top
      .map((f) => {
        const qs = shareOf.get(f.questionId!);
        return `${f.questionId} (${Math.round((qs?.share ?? 0) * 1000) / 10}% of the score)`;
      })
      .join(', ');

    kept.push({
      id: `${id}-many`,
      // An aggregate is as severe as the findings inside it.
      severity: group[0].severity,
      title: titleFor(group.length),
      detail: `Heaviest first: ${named}${group.length > top.length ? `, and ${group.length - top.length} more` : ''}.`,
      challenge: top[0]?.challenge,
      questionIds: sorted.map((f) => f.questionId!),
    });
  }

  return kept;
}

/** Severity first, then how much of the score the question actually carries. */
function rank(flags: Flag[]): Flag[] {
  const order: Record<FlagSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };
  return flags.sort((a, b) => {
    const bySeverity = order[a.severity] - order[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const aWhole = a.questionId || a.questionIds ? 1 : 0;
    const bWhole = b.questionId || b.questionIds ? 1 : 0;
    if (aWhole !== bWhole) return aWhole - bWhole;          // whole-assessment findings first
    return (b.share ?? 0) - (a.share ?? 0);
  });
}

export function challenges(fs: Flag[]): Flag[] {
  return fs.filter((f) => !!f.challenge);
}
