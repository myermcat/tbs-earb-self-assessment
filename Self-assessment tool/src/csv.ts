import type { Assessment, Rubric } from './types';
import { refOf } from './storage';
import { score } from './scoring';

/** One row per assessment. This is the file Nick and Allison open in Excel to do trend analysis. */

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvHeader(rubric: Rubric): string[] {
  /**
   * Two identifiers, and they are not the same thing.
   *
   * `ref` is four characters minted when an assessment is created, before it has ever been
   * online. It is the subject line of every evidence email, frozen into mail already sent, so
   * it cannot change and it is how a reply in somebody's inbox matches a row here.
   *
   * `access_code` is the twelve-character name the assessment has in the store, and it exists
   * only once it has been saved online. It is unique by construction and it is what opens the
   * assessment. Without it in this sheet the only stable key was a four-character string with
   * no uniqueness check behind it.
   */
  const cols = [
    'code', 'email_tag', 'initiative', 'department', 'contact', 'lifecycle_stage',
    'rubric_version', 'saved_by_name', 'saved_by_email', 'submitted_at',
    'overall_score', 'band', 'completeness_pct',
  ];
  for (const d of rubric.domains) cols.push(`domain_${d.id}`);
  for (const d of rubric.domains) for (const s of d.sections) cols.push(`section_${d.id}_${s.id}`);
  /**
   * Cross-cutting views of the same questions: security spans all four domains, so it gets a
   * column of its own. These do not add up to the overall, because a question sits in one domain
   * and can sit in several categories.
   *
   * The prefix was topic_, and the four domains were declared as categories too, so this file
   * carried topic_business beside domain_business: the same questions, two columns, and two
   * different numbers, because a domain rolls up through section weights and a category is a
   * flat mean. The four are gone with them.
   */
  for (const t of rubric.topics ?? []) cols.push(`category_${t.id}`);
  for (const d of rubric.domains) {
    for (const s of d.sections) {
      for (const q of s.questions) {
        cols.push(`${q.id}_score`, `${q.id}_na`, `${q.id}_picklist`, `${q.id}_evidence_count`);
      }
    }
  }
  cols.push('flags_high', 'flags_total', 'audited_by', 'audited_overall');
  return cols;
}

export function csvRow(rubric: Rubric, a: Assessment, flagCounts: { high: number; total: number }): string[] {
  const r = score(rubric, a);
  const row: string[] = [
    // One code, and the four characters of it that appear in email subject lines.
    a.id ?? '', refOf(a),
    a.initiative.name, a.initiative.department, a.initiative.contact, a.initiative.lifecycleStage,
    a.rubric.version,
    // Typed by whoever saved it and checked by nobody, which is why the sheet carries both
    // halves: a name on its own invites somebody to treat it as identification.
    a.meta.savedBy?.name ?? '', a.meta.savedBy?.email ?? '',
    a.meta.updatedAt,
    r.overall === null ? '' : r.overall.toFixed(2),
    r.band?.label ?? '',
    String(Math.round(r.completeness * 100)),
  ];
  for (const d of r.domains) row.push(d.score === null ? '' : d.score.toFixed(2));
  for (const d of r.domains) for (const s of d.sections) row.push(s.score === null ? '' : s.score.toFixed(2));
  for (const t of r.topics) row.push(t.score === null ? '' : t.score.toFixed(2));
  for (const d of rubric.domains) {
    for (const sec of d.sections) {
      for (const q of sec.questions) {
        const ans = a.answers[q.id];
        row.push(
          ans?.score === null || ans?.score === undefined ? '' : String(ans.score),
          ans?.na ? 'yes' : '',
          ans?.picklist === 'other' ? `other: ${ans.picklistOther ?? ''}` : (ans?.picklist ?? ''),
          String(ans?.evidence?.length ?? 0),
        );
      }
    }
  }
  row.push(String(flagCounts.high), String(flagCounts.total), a.audit?.reviewer ?? '', auditedOverall(a));
  return row;
}

function auditedOverall(a: Assessment): string {
  if (!a.audit) return '';
  const vals = Object.values(a.audit.perQuestion)
    .map((e) => e.auditedScore)
    .filter((v): v is number => typeof v === 'number');
  if (!vals.length) return '';
  return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2);
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
