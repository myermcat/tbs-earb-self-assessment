import type { Rubric } from './types';

/**
 * The rubric is data, not code. Dan writes the questions, the weights and the ladder;
 * this app renders whatever it is handed. A new version of the rubric is a new JSON file,
 * not a new release of the app.
 *
 * The stand-in rubric is baked into the build so the app works with no network and no
 * server. "Load a different rubric" lets Dan drop in his own file and see it immediately.
 */

export const REQUIRED_FORMAT = 2;

export function validate(x: unknown): { ok: true; rubric: Rubric } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const r = x as Rubric;

  if (!r || typeof r !== 'object') return { ok: false, problems: ['Not a JSON object.'] };
  if (r.fileType !== 'gc-arch-rubric') problems.push('fileType must be "gc-arch-rubric".');
  if (r.formatVersion !== REQUIRED_FORMAT) problems.push(`formatVersion must be ${REQUIRED_FORMAT}.`);
  if (!r.version) problems.push('Needs a version string.');
  if (!Array.isArray(r.domains) || r.domains.length === 0) problems.push('Needs at least one domain.');
  if (!r.scale?.anchors?.length) problems.push('Needs a scale with anchors.');
  if (!Array.isArray(r.bands) || !r.bands.length) problems.push('Needs at least one band.');
  if (!Array.isArray(r.lifecycleStages) || !r.lifecycleStages.length) problems.push('Needs lifecycle stages.');

  /**
   * The topics a question is allowed to carry.
   *
   * A topic id nobody declared is the one error in a rubric file that cannot be seen
   * afterwards: the question counts towards nothing, every page renders correctly, and a
   * category TBS asked for is quietly short. "secuirty" on one question out of 176 is a number
   * nobody can check by looking. So it is caught when the file is loaded.
   */
  const topicIds = new Set((r.topics ?? []).map((t) => t.id));

  const ids = new Set<string>();
  for (const d of r.domains ?? []) {
    if (typeof d.weight !== 'number') problems.push(`Domain ${d.id}: weight must be a number.`);
    if (!Array.isArray(d.sections) || !d.sections.length) problems.push(`Domain ${d.id}: needs at least one section.`);
    for (const sec of d.sections ?? []) {
      if (typeof sec.weight !== 'number') problems.push(`Section ${d.id}/${sec.id}: weight must be a number.`);
      if (!sec.label) problems.push(`Section ${d.id}/${sec.id}: no label.`);
      for (const q of sec.questions ?? []) {
        if (!q.id) problems.push(`Section ${d.id}/${sec.id}: a question has no id.`);
        if (ids.has(q.id)) problems.push(`Duplicate question id "${q.id}".`);
        ids.add(q.id);
        if (typeof q.weight !== 'number') problems.push(`Question ${q.id}: weight must be a number.`);
        if (!q.text) problems.push(`Question ${q.id}: no text.`);
        for (const topic of q.topics ?? []) {
          if (!topicIds.has(topic)) {
            problems.push(`Question ${q.id}: topic "${topic}" is not one this question set declares.`);
          }
        }
      }
    }
  }
  if (ids.size === 0) problems.push('No questions at all.');

  return problems.length ? { ok: false, problems } : { ok: true, rubric: r };
}
