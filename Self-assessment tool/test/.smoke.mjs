// src/scoring.ts
function questionExpectation(q, stage) {
  return q.stageExpectation?.[stage] ?? "expected";
}
function sectionExpectation(s, stage) {
  return s.stageExpectation?.[stage] ?? "expected";
}
function effectiveExpectation(q, s, stage) {
  return q.stageExpectation?.[stage] ?? s.stageExpectation?.[stage] ?? "expected";
}
var OVERVIEW_FIELDS = [
  { key: "name", label: "the name of the initiative", of: (a) => a.initiative?.name ?? "" },
  { key: "department", label: "the department", of: (a) => a.initiative?.department ?? "" },
  { key: "contact", label: "who to contact", of: (a) => a.initiative?.contact ?? "" },
  { key: "summary", label: "what it is, in two or three sentences", of: (a) => a.initiative?.summary ?? "" },
  { key: "classification", label: "how the evidence is marked", of: (a) => a.initiative?.classification ?? "" },
  { key: "lifecycleStage", label: "where it is in the lifecycle", of: (a) => a.initiative?.lifecycleStage ?? "" }
];
function completion(rubric2, a) {
  let answered = 0;
  let total = 0;
  for (const domain of rubric2.domains) {
    for (const section of domain.sections) {
      for (const question of section.questions) {
        total++;
        const ans = a.answers[question.id];
        if (ans?.na || typeof ans?.score === "number") answered++;
      }
    }
  }
  const overviewLeft = OVERVIEW_FIELDS.filter((f) => !f.of(a).trim()).map((f) => f.label);
  return {
    complete: answered === total && overviewLeft.length === 0,
    answered,
    total,
    questionsLeft: total - answered,
    overviewLeft
  };
}
function score(rubric2, a) {
  const stage = a.initiative?.lifecycleStage ?? "";
  let answered = 0;
  let scoreable = 0;
  const domains = rubric2.domains.map((domain) => {
    const sections = domain.sections.map((section) => {
      const questions = section.questions.map((question) => {
        const ans = a.answers[question.id];
        const na = !!ans?.na;
        const isAnswered = !na && typeof ans?.score === "number";
        scoreable++;
        if (isAnswered || na) answered++;
        const mult = rubric2.stageMultipliers[questionExpectation(question, stage)] ?? 1;
        const qShare = section.questions.length ? question.weight / section.questions.reduce((t, x) => t + x.weight, 0) : 0;
        return {
          question,
          domainId: domain.id,
          sectionId: section.id,
          raw: isAnswered ? ans.score : null,
          na,
          answered: isAnswered,
          effectiveWeight: isAnswered ? question.weight * mult : 0,
          expectation: effectiveExpectation(question, section, stage),
          share: domain.weight / 100 * (section.weight / 100) * qShare
        };
      });
      const wsum = questions.reduce((s, q) => s + q.effectiveWeight, 0);
      const expectation = sectionExpectation(section, stage);
      return {
        section,
        score: wsum === 0 ? null : questions.reduce((s, q) => s + (q.raw ?? 0) * q.effectiveWeight, 0) / wsum,
        weight: section.weight,
        effectiveWeight: section.weight * (rubric2.stageMultipliers[expectation] ?? 1),
        expectation,
        answered: questions.filter((q) => q.answered || q.na).length,
        total: questions.length,
        questions
      };
    });
    const scored2 = sections.filter((s) => s.score !== null);
    const sw = scored2.reduce((s, x) => s + x.effectiveWeight, 0);
    return {
      domain,
      score: sw === 0 ? null : scored2.reduce((s, x) => s + x.score * x.effectiveWeight, 0) / sw,
      weight: domain.weight,
      answered: sections.reduce((s, x) => s + x.answered, 0),
      total: sections.reduce((s, x) => s + x.total, 0),
      sections
    };
  });
  const scored = domains.filter((d) => d.score !== null);
  const dw = scored.reduce((s, d) => s + d.weight, 0);
  const overall = dw === 0 ? null : scored.reduce((s, d) => s + d.score * d.weight, 0) / dw;
  const every = domains.flatMap((d) => d.sections.flatMap((x) => x.questions));
  const topics = (rubric2.topics ?? []).map((topic) => {
    const mine = every.filter((q) => (q.question.topics ?? []).includes(topic.id));
    const scored2 = mine.filter((q) => q.answered);
    const wsum = scored2.reduce((t, q) => t + q.effectiveWeight, 0);
    return {
      topic,
      score: wsum === 0 ? null : scored2.reduce((t, q) => t + q.raw * q.effectiveWeight, 0) / wsum,
      answered: mine.filter((q) => q.answered || q.na).length,
      total: mine.length,
      redFlags: mine.filter(isRedFlag)
    };
  });
  return {
    overall,
    band: overall === null ? null : bandFor(rubric2, overall),
    maturity: overall === null ? null : maturityFor(rubric2, overall),
    domains,
    topics,
    completeness: scoreable === 0 ? 0 : answered / scoreable,
    answered,
    scoreable
  };
}
function isRedFlag(q) {
  return q.question.answerType === "yesno" && q.answered && q.raw === 0;
}
function bandFor(rubric2, overall) {
  const sorted = [...rubric2.bands].sort((x, y) => y.min - x.min);
  return sorted.find((b) => overall >= b.min) ?? sorted[sorted.length - 1];
}
function maturityFor(rubric2, overall) {
  if (!rubric2.maturityBands?.length) return null;
  const sorted = [...rubric2.maturityBands].sort((x, y) => y.min - x.min);
  return sorted.find((b) => overall >= b.min) ?? sorted[sorted.length - 1];
}
function allQuestionScores(r) {
  return r.domains.flatMap((d) => d.sections.flatMap((s) => s.questions));
}
function weakest(r, n = 5) {
  return allQuestionScores(r).filter((q) => q.answered).sort((a, b) => a.raw - b.raw).slice(0, n);
}
function nextAnchor(rubric2, q, current) {
  const ladder = (q.anchors ?? rubric2.scale.anchors).slice().sort((a, b) => a.value - b.value);
  return ladder.find((x) => x.value > current) ?? null;
}

// src/flags.ts
var AGGREGATE_AT = 4;
var AGGREGATABLE = {
  "high-score-no-evidence": (n) => `${n} high scores with nothing cited`,
  "low-score-with-evidence": (n) => `${n} low scores where evidence was provided anyway`,
  "perfect-thin-justification": (n) => `${n} full marks with barely a sentence behind them`,
  "evidence-not-attached": (n) => `${n} high scores where evidence was pointed at, not attached`,
  "stage-mismatch": (n) => `${n} answers unusually confident for this lifecycle stage`,
  unanswered: (n) => `${n} questions left unanswered`,
  "picklist-other": (n) => `${n} answers of "other"`
};
function flags(rubric2, a, r) {
  const out = [];
  const all = allQuestionScores(r);
  const push = (f, share) => out.push(share === void 0 ? f : { ...f, share });
  for (const qs of all) {
    const q = qs.question;
    const ans = a.answers[q.id];
    if (!ans) continue;
    const ev = ans.evidence ?? [];
    const just = (ans.justification ?? "").trim();
    if (qs.answered && qs.raw >= 8 && ev.length === 0) {
      push({
        share: qs.share,
        id: "high-score-no-evidence",
        questionId: q.id,
        severity: "high",
        title: "High score, nothing cited",
        detail: `Scored ${qs.raw} out of 10 with no evidence referenced.`,
        challenge: `You scored ${qs.raw} on "${q.text}" and cited nothing. What would you show us?`
      });
    }
    if (qs.answered && qs.raw <= 2 && ev.length > 0) {
      push({
        share: qs.share,
        id: "low-score-with-evidence",
        questionId: q.id,
        severity: "medium",
        title: "Low score, but evidence was provided",
        detail: `Scored ${qs.raw} out of 10 yet referenced ${ev.length} item(s). Either the score is too harsh or the evidence does not support the question.`,
        challenge: `Why did this score a ${qs.raw} when you gave us ${ev[0].title}?`
      });
    }
    if (qs.answered && qs.raw === 10 && just.length < 40) {
      push({
        share: qs.share,
        id: "perfect-thin-justification",
        questionId: q.id,
        severity: "medium",
        title: "Full marks, thin explanation",
        detail: "A 10 out of 10 with fewer than 40 characters of justification.",
        challenge: `You gave yourself full marks on "${q.text}". Walk us through how it is reviewed and used.`
      });
    }
    if (!qs.na && !qs.answered) {
      push({
        share: qs.share,
        id: "unanswered",
        questionId: q.id,
        severity: "low",
        title: "Not answered",
        detail: "Left blank and not marked as not applicable."
      });
    }
    if (qs.answered && qs.raw >= 8 && ev.length > 0 && ev.every((e) => !e.attachment)) {
      push({
        share: qs.share,
        id: "evidence-not-attached",
        questionId: q.id,
        severity: "low",
        title: "High score, evidence pointed at but not attached",
        detail: ev.map((e) => `"${e.title || "untitled"}" at ${e.location || "no location given"}`).join("; "),
        challenge: `You scored ${qs.raw} here and pointed us at ${ev[0].title || "something"} without attaching it. Can we see it?`
      });
    }
    if (ans.picklist === "other") {
      push({
        share: qs.share,
        id: "picklist-other",
        questionId: q.id,
        severity: "info",
        title: 'Answered "other"',
        detail: `"${ans.picklistOther ?? "no description given"}". Worth checking whether the list is missing a common option.`
      });
    }
  }
  const answeredScores = all.filter((q) => q.answered).map((q) => q.raw);
  if (answeredScores.length >= 5) {
    const counts = /* @__PURE__ */ new Map();
    for (const s of answeredScores) counts.set(s, (counts.get(s) ?? 0) + 1);
    const [topValue, topCount] = [...counts.entries()].sort((a2, b) => b[1] - a2[1])[0];
    if (topCount / answeredScores.length >= 0.7) {
      out.push({
        id: "flat-scoring",
        severity: "medium",
        title: "Scores barely vary",
        detail: `${topCount} of ${answeredScores.length} answers are all ${topValue}. This reads as box-ticking.`,
        challenge: "Which of these areas is genuinely your weakest, and why did it score the same as your strongest?"
      });
    }
  }
  if (r.overall !== null && r.band) {
    const margin = r.overall - r.band.min;
    if (r.band.min > 0 && margin < 0.35) {
      out.push({
        id: "just-above-the-line",
        severity: "medium",
        title: `Just above the ${r.band.label.toLowerCase()} line`,
        detail: `${r.overall.toFixed(2)} against a threshold of ${r.band.min}. A margin this thin is one answer wide, so the routing rests on a single score.`,
        challenge: "Which single answer would you least like us to check?"
      });
    }
  }
  if (r.overall !== null && r.overall >= 9) {
    out.push({
      id: "self-score-outlier",
      severity: "high",
      title: "Very high self-score",
      detail: `Overall ${r.overall.toFixed(1)} out of 10. Include this one in the audit sample regardless of routing.`
    });
  }
  const naCount = all.filter((q) => q.na).length;
  if (all.length > 0 && naCount / all.length > 0.25) {
    out.push({
      id: "na-heavy",
      severity: "medium",
      title: "Heavy use of not applicable",
      detail: `${naCount} of ${all.length} questions marked not applicable.`,
      challenge: "Talk the board through why so much of the rubric does not apply to this initiative."
    });
  }
  if (r.completeness < 0.8) {
    out.push({
      id: "incomplete",
      severity: "high",
      title: "Incomplete submission",
      detail: `${r.answered} of ${r.scoreable} questions answered (${Math.round(r.completeness * 100)}%). Every score below is calculated from that fraction.`
    });
  }
  const stage = a.initiative?.lifecycleStage ?? "";
  if (stage === "discovery" || stage === "alpha") {
    for (const qs of all) {
      if (qs.expectation === "low-ok" && qs.answered && qs.raw >= 9) {
        push({
          share: qs.share,
          id: "stage-mismatch",
          questionId: qs.question.id,
          severity: "low",
          title: "Unusually confident for this stage",
          detail: `Scored ${qs.raw} on something most initiatives cannot know at ${stage}. If it is real it is worth showcasing; if not, it is worth challenging.`,
          challenge: `You are at ${stage} and scored ${qs.raw} here. How do you already know that?`
        });
      }
    }
  }
  const collapsed = collapse(out, r);
  const alreadyIncomplete = collapsed.some((f) => f.id === "incomplete");
  return rank(collapsed.filter((f) => !(alreadyIncomplete && f.id === "unanswered-many")));
}
function collapse(flags2, r) {
  const shareOf = new Map(allQuestionScores(r).map((qs) => [qs.question.id, qs]));
  const groups = /* @__PURE__ */ new Map();
  const kept = [];
  for (const f of flags2) {
    if (f.questionId && AGGREGATABLE[f.id]) {
      groups.set(f.id, [...groups.get(f.id) ?? [], f]);
    } else {
      kept.push(f);
    }
  }
  for (const [id, group] of groups) {
    if (group.length < AGGREGATE_AT) {
      kept.push(...group);
      continue;
    }
    const titleFor = AGGREGATABLE[id];
    const sorted = [...group].sort(
      (a, b) => (shareOf.get(b.questionId)?.share ?? 0) - (shareOf.get(a.questionId)?.share ?? 0)
    );
    const top = sorted.slice(0, 5);
    const named = top.map((f) => {
      const qs = shareOf.get(f.questionId);
      return `${f.questionId} (${Math.round((qs?.share ?? 0) * 1e3) / 10}% of the score)`;
    }).join(", ");
    kept.push({
      id: `${id}-many`,
      // An aggregate is as severe as the findings inside it.
      severity: group[0].severity,
      title: titleFor(group.length),
      detail: `Heaviest first: ${named}${group.length > top.length ? `, and ${group.length - top.length} more` : ""}.`,
      challenge: top[0]?.challenge,
      questionIds: sorted.map((f) => f.questionId)
    });
  }
  return kept;
}
function rank(flags2) {
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  return flags2.sort((a, b) => {
    const bySeverity = order[a.severity] - order[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const aWhole = a.questionId || a.questionIds ? 1 : 0;
    const bWhole = b.questionId || b.questionIds ? 1 : 0;
    if (aWhole !== bWhole) return aWhole - bWhole;
    return (b.share ?? 0) - (a.share ?? 0);
  });
}

// src/csv.ts
function cell(v2) {
  const s = v2 === null || v2 === void 0 ? "" : String(v2);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvHeader(rubric2) {
  const cols = [
    "ref",
    "access_code",
    "initiative",
    "department",
    "contact",
    "lifecycle_stage",
    "rubric_version",
    "saved_by_name",
    "saved_by_email",
    "submitted_at",
    "overall_score",
    "band",
    "completeness_pct"
  ];
  for (const d of rubric2.domains) cols.push(`domain_${d.id}`);
  for (const d of rubric2.domains) for (const s of d.sections) cols.push(`section_${d.id}_${s.id}`);
  for (const t of rubric2.topics ?? []) cols.push(`topic_${t.id}`);
  for (const d of rubric2.domains) {
    for (const s of d.sections) {
      for (const q of s.questions) {
        cols.push(`${q.id}_score`, `${q.id}_na`, `${q.id}_picklist`, `${q.id}_evidence_count`);
      }
    }
  }
  cols.push("flags_high", "flags_total", "audited_by", "audited_overall");
  return cols;
}
function csvRow(rubric2, a, flagCounts) {
  const r = score(rubric2, a);
  const row = [
    a.ref ?? "",
    a.id ?? "",
    a.initiative.name,
    a.initiative.department,
    a.initiative.contact,
    a.initiative.lifecycleStage,
    a.rubric.version,
    // Typed by whoever saved it and checked by nobody, which is why the sheet carries both
    // halves: a name on its own invites somebody to treat it as identification.
    a.meta.savedBy?.name ?? "",
    a.meta.savedBy?.email ?? "",
    a.meta.updatedAt,
    r.overall === null ? "" : r.overall.toFixed(2),
    r.band?.label ?? "",
    String(Math.round(r.completeness * 100))
  ];
  for (const d of r.domains) row.push(d.score === null ? "" : d.score.toFixed(2));
  for (const d of r.domains) for (const s of d.sections) row.push(s.score === null ? "" : s.score.toFixed(2));
  for (const t of r.topics) row.push(t.score === null ? "" : t.score.toFixed(2));
  for (const d of rubric2.domains) {
    for (const sec of d.sections) {
      for (const q of sec.questions) {
        const ans = a.answers[q.id];
        row.push(
          ans?.score === null || ans?.score === void 0 ? "" : String(ans.score),
          ans?.na ? "yes" : "",
          ans?.picklist === "other" ? `other: ${ans.picklistOther ?? ""}` : ans?.picklist ?? "",
          String(ans?.evidence?.length ?? 0)
        );
      }
    }
  }
  row.push(String(flagCounts.high), String(flagCounts.total), a.audit?.reviewer ?? "", auditedOverall(a));
  return row;
}
function auditedOverall(a) {
  if (!a.audit) return "";
  const vals = Object.values(a.audit.perQuestion).map((e) => e.auditedScore).filter((v2) => typeof v2 === "number");
  if (!vals.length) return "";
  return (vals.reduce((s, v2) => s + v2, 0) / vals.length).toFixed(2);
}
function toCsv(rows) {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

// src/firebase.ts
function isRecord(v2) {
  return typeof v2 === "object" && v2 !== null && !Array.isArray(v2);
}
function text(v2) {
  return typeof v2 === "string" ? v2 : "";
}
function readConfig() {
  const raw = typeof __EARB_FIREBASE__ === "string" ? __EARB_FIREBASE__ : "";
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const apiKey = text(parsed.apiKey);
    const projectId = text(parsed.projectId);
    return apiKey && projectId ? { apiKey, projectId } : null;
  } catch {
    return null;
  }
}
var CONFIG = readConfig();
function numberValue(n) {
  if (Number.isNaN(n)) return { doubleValue: "NaN" };
  if (n === Infinity) return { doubleValue: "Infinity" };
  if (n === -Infinity) return { doubleValue: "-Infinity" };
  if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) return { integerValue: String(n) };
  return { doubleValue: n };
}
function arrayElement(x) {
  if (Array.isArray(x)) {
    throw new Error("Firestore stores no array inside an array, and one was about to be written.");
  }
  if (x === void 0) return { nullValue: null };
  return toValue(x);
}
function toValue(x) {
  if (x === null) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (typeof x === "number") return numberValue(x);
  if (Array.isArray(x)) return { arrayValue: { values: x.map(arrayElement) } };
  if (isRecord(x)) return { mapValue: { fields: toFields(x) } };
  throw new Error(`An assessment cannot hold a ${typeof x}, and one was about to be written.`);
}
function toFields(data) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === void 0) continue;
    out[key] = toValue(value);
  }
  return out;
}
function fromValue(v2) {
  if (!isRecord(v2)) return null;
  if ("nullValue" in v2) return null;
  if (typeof v2.booleanValue === "boolean") return v2.booleanValue;
  if (typeof v2.stringValue === "string") return v2.stringValue;
  if (typeof v2.integerValue === "string" || typeof v2.integerValue === "number") return Number(v2.integerValue);
  if (typeof v2.doubleValue === "number") return v2.doubleValue;
  if (typeof v2.doubleValue === "string") return Number(v2.doubleValue);
  if (typeof v2.timestampValue === "string") return v2.timestampValue;
  if (typeof v2.bytesValue === "string") return v2.bytesValue;
  if (typeof v2.referenceValue === "string") return v2.referenceValue;
  if (isRecord(v2.geoPointValue)) {
    const g = v2.geoPointValue;
    return {
      latitude: typeof g.latitude === "number" ? g.latitude : 0,
      longitude: typeof g.longitude === "number" ? g.longitude : 0
    };
  }
  if (isRecord(v2.arrayValue)) {
    const values = v2.arrayValue.values;
    return Array.isArray(values) ? values.map(fromValue) : [];
  }
  if (isRecord(v2.mapValue)) return fromFields(v2.mapValue.fields);
  return null;
}
function fromFields(fields) {
  const out = {};
  if (!isRecord(fields)) return out;
  for (const [key, value] of Object.entries(fields)) out[key] = fromValue(value);
  return out;
}

// src/rubric.ts
var REQUIRED_FORMAT = 2;
function validate(x) {
  const problems = [];
  const r = x;
  if (!r || typeof r !== "object") return { ok: false, problems: ["Not a JSON object."] };
  if (r.fileType !== "gc-arch-rubric") problems.push('fileType must be "gc-arch-rubric".');
  if (r.formatVersion !== REQUIRED_FORMAT) problems.push(`formatVersion must be ${REQUIRED_FORMAT}.`);
  if (!r.version) problems.push("Needs a version string.");
  if (!Array.isArray(r.domains) || r.domains.length === 0) problems.push("Needs at least one domain.");
  if (!r.scale?.anchors?.length) problems.push("Needs a scale with anchors.");
  if (!Array.isArray(r.bands) || !r.bands.length) problems.push("Needs at least one band.");
  if (!Array.isArray(r.lifecycleStages) || !r.lifecycleStages.length) problems.push("Needs lifecycle stages.");
  const topicIds = new Set((r.topics ?? []).map((t) => t.id));
  const ids = /* @__PURE__ */ new Set();
  for (const d of r.domains ?? []) {
    if (typeof d.weight !== "number") problems.push(`Domain ${d.id}: weight must be a number.`);
    if (!Array.isArray(d.sections) || !d.sections.length) problems.push(`Domain ${d.id}: needs at least one section.`);
    for (const sec of d.sections ?? []) {
      if (typeof sec.weight !== "number") problems.push(`Section ${d.id}/${sec.id}: weight must be a number.`);
      if (!sec.label) problems.push(`Section ${d.id}/${sec.id}: no label.`);
      for (const q of sec.questions ?? []) {
        if (!q.id) problems.push(`Section ${d.id}/${sec.id}: a question has no id.`);
        if (ids.has(q.id)) problems.push(`Duplicate question id "${q.id}".`);
        ids.add(q.id);
        if (typeof q.weight !== "number") problems.push(`Question ${q.id}: weight must be a number.`);
        if (!q.text) problems.push(`Question ${q.id}: no text.`);
        for (const topic of q.topics ?? []) {
          if (!topicIds.has(topic)) {
            problems.push(`Question ${q.id}: topic "${topic}" is not one this question set declares.`);
          }
        }
      }
    }
  }
  if (ids.size === 0) problems.push("No questions at all.");
  return problems.length ? { ok: false, problems } : { ok: true, rubric: r };
}

// rubric/rubric.v1-dan.json
var rubric_v1_dan_default = {
  fileType: "gc-arch-rubric",
  formatVersion: 2,
  id: "gc-ea-assessment",
  version: "1.0-dan",
  status: "draft",
  title: "GC Enterprise Architecture self-assessment",
  provenance: `Imported by tools/import-rubric.mjs from Dan's GC_EA_Assessment_Tool workbook (6 sheets) in "EARB target state knowledge base". Questions, section names, section weights, domain weights and the 0-10 ladder are all his. Added by us and marked as such: lifecycle stages, the stage rule on "Defining the Current State" sections, and the routing bands.`,
  dlgBaseUrl: "https://myermcat.github.io/digital-lifecycle-guide",
  dlgBaseUrlNote: "The guide, on GitHub Pages for now. Each stage points at its own page there.",
  importWarnings: [
    "Business Architecture: the section weights in the workbook add up to 80%, not 100%. The missing 20 points are shared out across the 6 sections that are there, in proportion, so the domain still scores out of 10. Worth checking whether a section was left out of the export."
  ],
  scale: {
    min: 0,
    max: 10,
    anchors: [
      {
        value: 0,
        colour: "Black",
        name: "Absent",
        label: "No formal architecture. Capabilities are missing, and manual workarounds are the only way to achieve business outcomes."
      },
      {
        value: 1,
        colour: "Dark Red",
        name: "Critical Gaps",
        label: "A skeleton exists, but core capabilities (like security or data integrity) are missing. High risk of systemic failure."
      },
      {
        value: 2,
        colour: "Red",
        name: "Fragmented",
        label: 'Capabilities exist in "silos." They are inconsistent, undocumented, and require constant manual intervention to stay synchronized.'
      },
      {
        value: 3,
        colour: "Orange",
        name: "Emergent",
        label: 'Core capabilities are present but brittle. The architecture meets the "happy path" but fails under stress or edge cases.'
      },
      {
        value: 4,
        colour: "Orange-Yellow",
        name: "Defined",
        label: "The architecture meets basic functional requirements. Documentation exists, but Quality Attributes (scalability, maintainability) are an afterthought."
      },
      {
        value: 5,
        colour: "Yellow",
        name: "Integrated",
        label: "This is the Baseline. All desired capabilities are present and connected. The system is stable and performs as expected under normal conditions."
      },
      {
        value: 6,
        colour: "Yellow-Green",
        name: "Managed",
        label: "Capabilities are monitored and measured. The architecture can handle predictable growth and has basic fault tolerance."
      },
      {
        value: 7,
        colour: "Green",
        name: "Scalable & Secure",
        label: 'The architecture is "hardened." It handles bursts in demand effortlessly and has proactive security measures built into the design.'
      },
      {
        value: 8,
        colour: "Dark Green",
        name: "Agile/Extensible",
        label: "The architecture is modular. Adding a new desired capability does not require a rewrite; the system is designed to be plugged into and extended."
      },
      {
        value: 9,
        colour: "Blue",
        name: "Predictive",
        label: "The architecture uses telemetry and AI/ML to anticipate needs (e.g., auto-scaling before a spike or self-healing before a crash)."
      },
      {
        value: 10,
        colour: "Purple",
        name: "Symbiotic",
        label: 'The "North Star" state. The architecture and business strategy are one. The system is so flexible it can pivot to entirely new business models with minimal architectural friction.'
      }
    ]
  },
  maturityBands: [
    {
      min: 9,
      label: "Leading Practice",
      detail: "Predictive, self-optimizing, fully aligned with business strategy."
    },
    {
      min: 7,
      label: "Advanced",
      detail: "Hardened, scalable, and modular. Demonstrably high-quality architecture."
    },
    {
      min: 5,
      label: "Baseline Ready",
      detail: "Core capabilities present and stable. Meets minimum GC EA expectations."
    },
    {
      min: 3,
      label: "Developing",
      detail: "Foundational elements exist but architecture is immature and at risk under stress."
    },
    {
      min: 0,
      label: "Critical Risk",
      detail: "Immediate intervention required. Core capabilities absent or severely compromised."
    }
  ],
  maturityBandsNote: "Dan's own reference guide, from the Summary Dashboard sheet.",
  bands: [
    {
      id: "showcase",
      min: 8.5,
      label: "Showcase",
      routing: "No board slot needed. TBS may ask to showcase this work.",
      tone: "good"
    },
    {
      id: "hallpass",
      min: 6,
      label: "Hall pass",
      routing: "Suggested: no GC EARB appearance required. Subject to audit sample.",
      tone: "good"
    },
    {
      id: "routine",
      min: 3,
      label: "Routine",
      routing: "Suggested: no board time. Assessor spot-check only.",
      tone: "neutral",
      source: "interpolated"
    },
    {
      id: "attend",
      min: 0,
      label: "Bring it to the board",
      routing: "Suggested: attend GC EARB. Come and tell us why, and what the plan is.",
      tone: "bad"
    }
  ],
  bandsNote: 'ROUTING, not maturity, and provisional. Dan named three numbers out loud on 2026-08-26: above roughly 60% is an automatic hall pass, around 8.5 is worth showcasing, and around 2 out of 10 means come and explain. He also said the 4, 5, 6 middle is not worth board time. The 3.0 line between "come and explain" and "no board time" is OURS, interpolated to bridge the 2 he named and the 4 he named. He has not seen it. None of these are signed off. The maturity labels above are his.',
  stageMultipliers: {
    "low-ok": 0.25,
    expected: 1,
    critical: 1.5
  },
  stageMultipliersNote: 'Our addition. Lifecycle stage is not captured in the current process at all - Dan named it as the key missing field. Only "Defining the Current State" sections carry a rule so far.',
  topics: [
    {
      id: "business",
      label: "Business",
      note: "Strategy, process, value and cost."
    },
    {
      id: "data",
      label: "Data",
      note: "Models, quality, lineage and stewardship."
    },
    {
      id: "application",
      label: "Application",
      note: "What the software does and depends on."
    },
    {
      id: "technology",
      label: "Technology",
      note: "Where it runs, and whether it stays up."
    },
    {
      id: "security",
      label: "Security",
      note: "Cuts across all four. Dan asked for this one by name."
    },
    {
      id: "privacy",
      label: "Privacy",
      note: "Personal information specifically, and not data in general."
    },
    {
      id: "financial",
      label: "Financial",
      note: "Cost, funding and value for money. Dan asked for this one by name."
    },
    {
      id: "accessibility",
      label: "Accessibility",
      note: "Dan asked for this one by name. No question in the instrument asks about it yet, so it is empty until he tags the rows."
    },
    {
      id: "official-languages",
      label: "Official Languages",
      note: "Dan asked for this one by name. No question in the instrument asks about it yet, so it is empty until he tags the rows."
    }
  ],
  answerTypesNote: "PROVISIONAL. Dan named this defect: several questions are yes or no wearing a 0 to 10 scale. The ones marked yesno here are the ones whose wording is unambiguously binary. He owns the real list. A no on a yes/no question raises a red flag: it colours the section and the person carries on. Nothing in this tool stops an assessment.",
  topicsNote: "A second axis. The four domains still produce the overall score and a question counts once there. A question also counts at full weight inside every topic it carries, which is where the weights genuinely differ. Dan named nine on 8 September: Business, Data, Application, Technology, Security, Privacy, Accessibility, Official Languages and Financial. The four domain topics are mechanical. Security, privacy and financial were derived from the question wording and are PROVISIONAL: Dan owns the real assignments. Accessibility and Official Languages are declared and empty, because no question in the instrument asks about either: a sweep of all 176 found official languages in two and accessibility in three, always in another sense. They stay on the list so the gap is visible. What fills them is one Topics column in each domain sheet, comma separated, filled only on the rows that need more than their own domain.",
  lifecycleStages: [
    {
      id: "discovery",
      label: "Discovery",
      phase: "Create",
      dlgPath: "create-discovery",
      blurb: "Understanding the problem. There may be no current solution to describe yet."
    },
    {
      id: "alpha",
      label: "Alpha",
      phase: "Create",
      dlgPath: "create-alpha",
      blurb: "Testing whether an approach can work, with real users."
    },
    {
      id: "beta",
      label: "Beta",
      phase: "Create",
      dlgPath: "create-beta",
      blurb: "Building the real thing in public, at growing scale."
    },
    {
      id: "stabilization",
      label: "Stabilization",
      phase: "Live",
      dlgPath: "live-stabilization",
      blurb: "In service, settling down. Costs and operations should be known."
    },
    {
      id: "growth",
      label: "Growth",
      phase: "Live",
      dlgPath: "live-growth",
      blurb: "In service, scaling up."
    },
    {
      id: "maturity",
      label: "Maturity",
      phase: "Live",
      dlgPath: "live-maturity",
      blurb: "In service, steady state. Everything should be documented and measured."
    },
    {
      id: "sunset",
      label: "Sunset",
      phase: "Sunset",
      dlgPath: "sunset",
      blurb: "Replacing or retiring. Dependencies and data disposition matter most."
    }
  ],
  phases: [
    {
      name: "Create",
      dlgPath: "create",
      blurb: "Being built, and not in service yet."
    },
    {
      name: "Live",
      dlgPath: "live",
      blurb: "In service, with real users."
    },
    {
      name: "Sunset",
      dlgPath: "sunset",
      blurb: "Being replaced or retired."
    }
  ],
  domains: [
    {
      id: "business",
      label: "Business Architecture",
      weight: 25,
      description: "Connecting strategy to execution through structured design",
      sections: [
        {
          id: "defining-the-current-state",
          label: "Defining the Current State",
          weight: 5,
          questions: [
            {
              id: "B-Q1",
              sheetRef: "Q1",
              text: "How thoroughly has the current state of this solution been documented, including all processes, data flows, and system dependencies?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q2",
              sheetRef: "Q2",
              text: "What entities (data objects, records, clients, files) are currently produced, managed, or maintained by this solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q3",
              sheetRef: "Q3",
              text: "Have all roles and responsibilities across stakeholders, operators, and service consumers been identified, documented, and formally accepted?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q4",
              sheetRef: "Q4",
              text: "How well understood is the criticality of this solution to Government of Canada program delivery and citizen outcomes?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q5",
              sheetRef: "Q5",
              text: "Are all sub-components of the current solution assessed for their individual criticality, availability, and risk exposure?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q6",
              sheetRef: "Q6",
              text: "What is the current level of utilization and demand for the solution (transaction volumes, active users, peak load)?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q7",
              sheetRef: "Q7",
              text: "What is the known availability, uptime, and service continuity record of the current solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q8",
              sheetRef: "Q8",
              text: "How well understood are the total lifecycle costs \u2014 including build, operate, maintain, and decommission \u2014 of the current solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "financial"
              ]
            },
            {
              id: "B-Q9",
              sheetRef: "Q9",
              text: "What are the current unit economics (cost per transaction, cost per entity managed) and how are they tracked?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "financial"
              ]
            },
            {
              id: "B-Q10",
              sheetRef: "Q10",
              text: "How mature and current are the performance indicators for this solution, and what trends do they reflect?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q11",
              sheetRef: "Q11",
              text: "Is the lifespan and full lifecycle of the solution mapped out, and is the current position within that lifecycle known?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q12",
              sheetRef: "Q12",
              text: "What major events (technology refresh, contract renewal, legislative changes) are on the horizon for this solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q13",
              sheetRef: "Q13",
              text: "How well understood are the specific skills, staffing levels, and capacity requirements to operate and evolve this solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q14",
              sheetRef: "Q14",
              text: "How are universal requirements \u2014 accessibility, official languages, inclusion, and privacy \u2014 currently addressed in the solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "privacy"
              ]
            }
          ],
          stageExpectation: {
            discovery: "low-ok",
            alpha: "low-ok"
          },
          shareOfDomain: 6.3
        },
        {
          id: "defining-the-business-solution",
          label: "Defining the Business Solution",
          weight: 25,
          questions: [
            {
              id: "B-Q15",
              sheetRef: "Q15",
              text: "How clearly and completely has the core business problem been defined and agreed upon by all stakeholders?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q16",
              sheetRef: "Q16",
              text: "Is there a documented business case that articulates the expected value, outcomes, and measurable benefits of the proposed solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "financial"
              ]
            },
            {
              id: "B-Q17",
              sheetRef: "Q17",
              text: "How well do the proposed solution capabilities map to the GC Business Capability Model and existing enterprise services?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q18",
              sheetRef: "Q18",
              text: "Have value streams been fully mapped, showing how business capabilities deliver outcomes to clients and citizens?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q19",
              sheetRef: "Q19",
              text: "Is the solution design driven by defined user personas, journeys, and evidence-based user research?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q20",
              sheetRef: "Q20",
              text: "How clearly are the target service levels, response times, and quality benchmarks defined for the proposed solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q21",
              sheetRef: "Q21",
              text: "Has the solution's criticality to GC program delivery been assessed, and does the architecture reflect that criticality?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q22",
              sheetRef: "Q22",
              text: "Is there a funding model and sourcing strategy that is sustainable across the full lifecycle of the solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "financial"
              ]
            },
            {
              id: "B-Q23",
              sheetRef: "Q23",
              text: "How well is the talent strategy defined, including required skills, existing capacity, training pipeline, and long-term retention?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q24",
              sheetRef: "Q24",
              text: "Is a demand forecast available, and does the solution design account for projected growth and usage variability?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q25",
              sheetRef: "Q25",
              text: "How well is the solution integrated within the broader GC enterprise ecosystem and aligned with whole-of-government priorities?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q26",
              sheetRef: "Q26",
              text: "Is the solution designed to maximize reuse of existing GC shared services and platforms before building new capabilities?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q27",
              sheetRef: "Q27",
              text: "How transparent is the solution design \u2014 is it documented, accessible, and understandable to those who rely on it?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            }
          ],
          shareOfDomain: 31.3
        },
        {
          id: "demonstrated-engagement",
          label: "Demonstrated Engagement",
          weight: 10,
          questions: [
            {
              id: "B-Q28",
              sheetRef: "Q28",
              text: "Have user personas, stories, and journeys been mapped and validated through direct engagement with actual users and stakeholders?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q29",
              sheetRef: "Q29",
              text: "Are there formal, repeatable mechanisms to capture client, user, and stakeholder needs on a continuous basis?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q30",
              sheetRef: "Q30",
              text: "How mature are feedback loops between the delivery team and end users, including Communities of Practice and regular reviews?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q31",
              sheetRef: "Q31",
              text: "Are all roles, accountabilities, and decision rights across the solution ecosystem clearly documented in a RACI or equivalent model?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q32",
              sheetRef: "Q32",
              text: "Is solution documentation, interactive guidance, and self-service assistance available and actively maintained for all user types?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q33",
              sheetRef: "Q33",
              text: "How transparent is the operational status of the solution, including an offering roadmap and historical event schedule?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q34",
              sheetRef: "Q34",
              text: "Are performance metrics (NPS, CSAT, CES, usage rates, drop-off rates) defined, measured, and reported back to stakeholders?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q35",
              sheetRef: "Q35",
              text: "Does the solution support multi-channel delivery patterns (web, chat, phone, in-person) that reflect real user demand?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q36",
              sheetRef: "Q36",
              text: "How mature are personalization, predictive analytics, or AI-assisted capabilities within the solution offering?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            }
          ],
          shareOfDomain: 12.5
        },
        {
          id: "calculated-measured-and-transparent-performance-and-value",
          label: "Calculated, Measured & Transparent Performance & Value",
          weight: 10,
          questions: [
            {
              id: "B-Q37",
              sheetRef: "Q37",
              text: "Are Service Level Objectives (SLOs) and Service Level Agreements (SLAs) formally defined, monitored, and reported?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q38",
              sheetRef: "Q38",
              text: "Is there end-to-end instrumentation of delivery processes, enabling real-time performance monitoring and visualization?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q39",
              sheetRef: "Q39",
              text: "How well are costs, prices, and unit economics tracked and published, enabling informed investment decisions?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "financial"
              ]
            },
            {
              id: "B-Q40",
              sheetRef: "Q40",
              text: "Are client satisfaction scores (CSAT, NPS, or equivalent) captured systematically and acted upon?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q41",
              sheetRef: "Q41",
              text: "How are quality and error rates measured, tracked, and used to drive continuous improvement?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q42",
              sheetRef: "Q42",
              text: "Are response times, total transaction times, and execution time variance measured and within defined thresholds?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q43",
              sheetRef: "Q43",
              text: "Is trend analysis performed regularly on key metrics to anticipate performance changes and drive proactive action?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q44",
              sheetRef: "Q44",
              text: "Are periodic evaluations of continuing business need performed to assess whether the solution still justifies its cost?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "financial"
              ]
            }
          ],
          shareOfDomain: 12.5
        },
        {
          id: "operational-readiness",
          label: "Operational Readiness",
          weight: 10,
          questions: [
            {
              id: "B-Q45",
              sheetRef: "Q45",
              text: "How well-defined is the delivery pipeline, including deployment cadence, automation, rollback procedures, and success rates?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q46",
              sheetRef: "Q46",
              text: "Are skills requirements, staffing levels, and a training and improvement pipeline in place to sustain operations?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q47",
              sheetRef: "Q47",
              text: "Is there an established and confirmed funding strategy, including lifecycle funding beyond the initial build phase?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "financial"
              ]
            },
            {
              id: "B-Q48",
              sheetRef: "Q48",
              text: "How mature and tested is the incident management, business continuity, and disaster recovery planning for this solution?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q49",
              sheetRef: "Q49",
              text: "Is the infrastructure and technology acquisition strategy defined, including procurement pathways and lead times?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q50",
              sheetRef: "Q50",
              text: "Has a formal threat and risk assessment (including sovereignty and security classification) been completed and reviewed?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "business",
                "security"
              ]
            },
            {
              id: "B-Q51",
              sheetRef: "Q51",
              text: "How deep and well-prioritized is the feature and requirements backlog, and does it reflect validated stakeholder needs?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q52",
              sheetRef: "Q52",
              text: "Are there operational runbooks, monitoring dashboards, and on-call processes in place to support production operations?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            }
          ],
          shareOfDomain: 12.5
        },
        {
          id: "governance-and-strategy",
          label: "Governance & Strategy",
          weight: 20,
          questions: [
            {
              id: "B-Q53",
              sheetRef: "Q53",
              text: "Is there a clearly defined governance model with accountable decision-makers for the solution's direction and performance?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q54",
              sheetRef: "Q54",
              text: "How well does the solution align with the GC Digital Operations Strategic Plan and departmental enterprise strategy?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q55",
              sheetRef: "Q55",
              text: "Is there a published roadmap with near, medium, and long-term milestones that is communicated to stakeholders?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q56",
              sheetRef: "Q56",
              text: "How mature is the change management process, including impact assessment, approval workflows, and communication plans?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q57",
              sheetRef: "Q57",
              text: "Are compliance requirements (legal, regulatory, policy, accessibility, bilingualism) formally tracked and verified?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q58",
              sheetRef: "Q58",
              text: "Is there a formal risk register maintained for the solution, with assigned owners and documented mitigation strategies?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q59",
              sheetRef: "Q59",
              text: "How well is vendor and third-party relationship governance defined, including performance monitoring and exit strategies?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            },
            {
              id: "B-Q60",
              sheetRef: "Q60",
              text: "Is there a documented and approved data governance model aligned with the solution's information and privacy requirements?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business",
                "privacy"
              ]
            },
            {
              id: "B-Q61",
              sheetRef: "Q61",
              text: "How well does the solution contribute to GC-wide shared service consolidation and enterprise architecture objectives?",
              weight: 1,
              answerType: "scale",
              topics: [
                "business"
              ]
            }
          ],
          shareOfDomain: 25
        }
      ]
    },
    {
      id: "data",
      label: "Data & Information Architecture",
      weight: 25,
      description: "Turning raw data into trusted, connected insights",
      sections: [
        {
          id: "defining-the-current-state",
          label: "Defining the Current State",
          weight: 10,
          questions: [
            {
              id: "D-Q1",
              sheetRef: "Q1",
              text: "How well documented are current data models, entity relationships, and data-sharing agreements?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q2",
              sheetRef: "Q2",
              text: "What is the degree of data fragmentation, duplication, and inconsistency across the current solution and its dependencies?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q3",
              sheetRef: "Q3",
              text: "How well understood are data volumes, growth rates, residency requirements, and encryption posture?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security"
              ]
            },
            {
              id: "D-Q4",
              sheetRef: "Q4",
              text: "Is the lifespan and full data lifecycle \u2014 from creation to disposition \u2014 mapped and governed?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q5",
              sheetRef: "Q5",
              text: "Are data formats proprietary or based on open, interoperable standards?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q6",
              sheetRef: "Q6",
              text: "How open and transparent is data publication, and is a default-open approach applied where appropriate?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q7",
              sheetRef: "Q7",
              text: "Are analytics and trend analysis capabilities available to support decision-making from current data assets?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q8",
              sheetRef: "Q8",
              text: "How mature are data access controls, auditing mechanisms, and the ability to trace who accessed what and when?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security"
              ]
            },
            {
              id: "D-Q9",
              sheetRef: "Q9",
              text: "How interoperable is the current data environment with other GC systems, programs, and platforms?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            }
          ],
          stageExpectation: {
            discovery: "low-ok",
            alpha: "low-ok"
          },
          shareOfDomain: 10
        },
        {
          id: "data-architecture-and-standards",
          label: "Data Architecture & Standards",
          weight: 40,
          questions: [
            {
              id: "D-Q10",
              sheetRef: "Q10",
              text: "Is there a formal, documented data model that reflects all key entities, relationships, attributes, and business rules?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q11",
              sheetRef: "Q11",
              text: "How mature is master data management \u2014 are authoritative data sources identified, maintained, and trusted?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q12",
              sheetRef: "Q12",
              text: "Is data lifecycle governance established, covering creation, versioning, archiving, and secure disposition?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security"
              ]
            },
            {
              id: "D-Q13",
              sheetRef: "Q13",
              text: "Are international and GC data standards applied (e.g., ISO, DCAT, NIEM, GC Open Data Directive)?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q14",
              sheetRef: "Q14",
              text: "How well defined is data lineage \u2014 can the origin, transformation, and movement of data be traced end-to-end?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q15",
              sheetRef: "Q15",
              text: "Is comprehensive metadata management in place, enabling data discovery, classification, and contextual understanding?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q16",
              sheetRef: "Q16",
              text: "How mature is data quality management \u2014 are completeness, accuracy, consistency, and timeliness measured and enforced?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q17",
              sheetRef: "Q17",
              text: "Is data instrumentation in place to capture operational telemetry, audit records, and system-generated metadata?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q18",
              sheetRef: "Q18",
              text: "Are data read/write performance requirements (volumes, IOPS, movement patterns) understood and architecturally addressed?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q19",
              sheetRef: "Q19",
              text: "Is there a strategy for structured, semi-structured, and unstructured data that applies consistent governance across all types?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q20",
              sheetRef: "Q20",
              text: "How well is data residency managed \u2014 are intentional copies of data tracked, controlled, and compliant with policy?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q21",
              sheetRef: "Q21",
              text: "Does the architecture support event-driven data integration patterns and real-time data processing where needed?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            }
          ],
          shareOfDomain: 40
        },
        {
          id: "privacy-protection-and-compliance",
          label: "Privacy, Protection & Compliance",
          weight: 25,
          questions: [
            {
              id: "D-Q22",
              sheetRef: "Q22",
              text: "Has a Privacy Impact Assessment (PIA) been completed, and does the architecture reflect its recommendations?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "data",
                "privacy"
              ]
            },
            {
              id: "D-Q23",
              sheetRef: "Q23",
              text: "Is Privacy by Design embedded throughout the solution, from data collection through to disposition?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "privacy"
              ]
            },
            {
              id: "D-Q24",
              sheetRef: "Q24",
              text: "How mature is data categorization \u2014 are all data assets classified by sensitivity, and is handling appropriate to classification?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q25",
              sheetRef: "Q25",
              text: "Is encryption applied at rest, in transit, and in processing for all data at the appropriate sensitivity level?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security"
              ]
            },
            {
              id: "D-Q26",
              sheetRef: "Q26",
              text: "Are data sovereignty requirements met \u2014 is there full awareness of where data resides, crosses borders, and is subject to foreign law?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security"
              ]
            },
            {
              id: "D-Q27",
              sheetRef: "Q27",
              text: "Are data retention and disposition policies enforced, including secure deletion and legal hold capabilities?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security",
                "privacy"
              ]
            },
            {
              id: "D-Q28",
              sheetRef: "Q28",
              text: "How well are collection limitation principles applied \u2014 is only necessary data collected, with informed consent where required?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "privacy"
              ]
            },
            {
              id: "D-Q29",
              sheetRef: "Q29",
              text: "Is there a documented breach response plan, and has it been tested?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "data",
                "security"
              ]
            },
            {
              id: "D-Q30",
              sheetRef: "Q30",
              text: "Are access controls enforced at the data level, ensuring role-based and attribute-based access is actively governed?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security"
              ]
            }
          ],
          shareOfDomain: 25
        },
        {
          id: "accessibility-interoperability-and-usability",
          label: "Accessibility, Interoperability & Usability",
          weight: 5,
          questions: [
            {
              id: "D-Q31",
              sheetRef: "Q31",
              text: "Does the data architecture align with FAIR principles (Findable, Accessible, Interoperable, Reusable)?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q32",
              sheetRef: "Q32",
              text: "Are APIs and data-sharing interfaces standards-based and documented, enabling downstream consumption without tight coupling?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q33",
              sheetRef: "Q33",
              text: "How accessible is data to authorized consumers, including other departments, partners, and (where appropriate) the public?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security"
              ]
            }
          ],
          shareOfDomain: 5
        },
        {
          id: "governance-oversight-and-accountability",
          label: "Governance, Oversight & Accountability",
          weight: 20,
          questions: [
            {
              id: "D-Q34",
              sheetRef: "Q34",
              text: "Is there a designated data owner and data steward for each key dataset, with documented accountability?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q35",
              sheetRef: "Q35",
              text: "How mature is the data governance framework \u2014 does it cover policies, standards, roles, dispute resolution, and enforcement?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q36",
              sheetRef: "Q36",
              text: "Are data governance decisions transparent and auditable, including any changes to data models, access rules, or classifications?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            },
            {
              id: "D-Q37",
              sheetRef: "Q37",
              text: "Is there a process to ensure data governance keeps pace with legislative changes (Privacy Act, Access to Information, Bill C-27)?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "privacy"
              ]
            },
            {
              id: "D-Q38",
              sheetRef: "Q38",
              text: "How well is data quality monitored, reported on, and escalated when thresholds are breached?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data",
                "security"
              ]
            },
            {
              id: "D-Q39",
              sheetRef: "Q39",
              text: "Is there a regular data audit process to validate compliance with policies, identify orphaned data, and assess data health?",
              weight: 1,
              answerType: "scale",
              topics: [
                "data"
              ]
            }
          ],
          shareOfDomain: 20
        }
      ]
    },
    {
      id: "application",
      label: "Application & Virtual Architecture",
      weight: 25,
      description: "Designing agile, scalable application ecosystems",
      sections: [
        {
          id: "defining-the-current-state",
          label: "Defining the Current State",
          weight: 10,
          questions: [
            {
              id: "A-Q1",
              sheetRef: "Q1",
              text: "Is the current application solution fully documented, including architecture diagrams, data flows, and integration points?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q2",
              sheetRef: "Q2",
              text: "How well is the current system instrumented \u2014 are resource allocation, consumption, and application health monitored?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q3",
              sheetRef: "Q3",
              text: "What is the outstanding technical debt, and is it formally tracked in a backlog with prioritization?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q4",
              sheetRef: "Q4",
              text: "When are major software contracts expiring, and is there a renewal or replacement strategy in place?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q5",
              sheetRef: "Q5",
              text: "What known security vulnerabilities exist in the current solution, and what is the remediation status?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "security"
              ]
            },
            {
              id: "A-Q6",
              sheetRef: "Q6",
              text: "How well understood are the delivery pipeline properties \u2014 maturity, automation, deployment frequency, and failure rate?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q7",
              sheetRef: "Q7",
              text: "What is the degree of vendor or technology lock-in, and are exit/migration pathways understood?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q8",
              sheetRef: "Q8",
              text: "Are all upstream and downstream application dependencies mapped and current?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q9",
              sheetRef: "Q9",
              text: "What is the known backlog of defects, flaws, and unresolved issues, and how is it managed?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            }
          ],
          stageExpectation: {
            discovery: "low-ok",
            alpha: "low-ok"
          },
          shareOfDomain: 10
        },
        {
          id: "application-architecture-and-build-approach",
          label: "Application Architecture & Build Approach",
          weight: 20,
          questions: [
            {
              id: "A-Q10",
              sheetRef: "Q10",
              text: "Is the application type (COTS, configured, custom-built, low/no-code, assembled) clearly defined and justified?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q11",
              sheetRef: "Q11",
              text: "Is the delivery methodology (agile, waterfall, hybrid) appropriate to the solution's context and documented?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q12",
              sheetRef: "Q12",
              text: "How software-defined is the solution \u2014 are configuration, policy, and infrastructure managed as code?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q13",
              sheetRef: "Q13",
              text: "Is the application designed with capabilities-based modularity, enabling components to be replaced independently?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q14",
              sheetRef: "Q14",
              text: "How are interoperability interfaces between internal components and external applications exposed and governed?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q15",
              sheetRef: "Q15",
              text: "Is intellectual property ownership clear, and are code licensing obligations tracked and managed?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q16",
              sheetRef: "Q16",
              text: "How mature is code reuse \u2014 is there a shared code repository, automated integration, and published component catalogue?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q17",
              sheetRef: "Q17",
              text: "What is the lowest required integration level (container, VM/OS, physical hardware), and is it minimized where possible?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q18",
              sheetRef: "Q18",
              text: "Are volume, redundancy, elasticity, scalability, throttling, and observability requirements defined and implemented?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q19",
              sheetRef: "Q19",
              text: "Is the application designed as external-facing, internal enterprise, or administrative \u2014 and is the design tailored accordingly?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            }
          ],
          shareOfDomain: 20
        },
        {
          id: "engineering-practices-and-frameworks",
          label: "Engineering Practices & Frameworks",
          weight: 20,
          questions: [
            {
              id: "A-Q20",
              sheetRef: "Q20",
              text: "How mature is the DevSecOps pipeline \u2014 including continuous integration, continuous deployment, automated testing, and security gates?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "security"
              ]
            },
            {
              id: "A-Q21",
              sheetRef: "Q21",
              text: "Is test coverage defined, measured, and enforced \u2014 including unit, integration, regression, performance, and security testing?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "security"
              ]
            },
            {
              id: "A-Q22",
              sheetRef: "Q22",
              text: "How well are coding standards, frameworks, and languages documented, enforced, and aligned with GC guidance?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q23",
              sheetRef: "Q23",
              text: "Are accessibility standards (WCAG 2.1 AA or equivalent) embedded in the development and QA process?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q24",
              sheetRef: "Q24",
              text: "Is there an algorithmic impact assessment (AIA) process in place for any AI/ML components in the application?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q25",
              sheetRef: "Q25",
              text: "How mature is the code review and peer review process, and is it consistently applied?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q26",
              sheetRef: "Q26",
              text: "Are application performance benchmarks established, tested against in CI/CD, and used to gate deployments?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q27",
              sheetRef: "Q27",
              text: "Is observability (logging, tracing, metrics) built into the application architecture from the start?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            }
          ],
          shareOfDomain: 20
        },
        {
          id: "solution-options-and-ecosystem-strategy",
          label: "Solution Options & Ecosystem Strategy",
          weight: 50,
          questions: [
            {
              id: "A-Q28",
              sheetRef: "Q28",
              text: "Has a multi-disciplinary team \u2014 including business, security, privacy, data, and technology \u2014 been engaged in solution design?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "security",
                "privacy"
              ]
            },
            {
              id: "A-Q29",
              sheetRef: "Q29",
              text: "Were enterprise contracts and procurement pathways (GC-wide standing offers, task authorizations) explored before custom sourcing?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "security"
              ]
            },
            {
              id: "A-Q30",
              sheetRef: "Q30",
              text: "Was optionality fully investigated \u2014 including multi-vendor, open source, and homegrown options \u2014 with a documented rationale?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q31",
              sheetRef: "Q31",
              text: "Is a Total Cost of Ownership (TCO) model available that includes build, operate, maintain, licensing, and exit costs?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "financial"
              ]
            },
            {
              id: "A-Q32",
              sheetRef: "Q32",
              text: "How well are digital sovereignty considerations addressed \u2014 are GC data and systems protected from foreign jurisdiction risk?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "security"
              ]
            },
            {
              id: "A-Q33",
              sheetRef: "Q33",
              text: "Is the solution designed to integrate with GC-wide shared services (Sign-In Canada, GC Notify, GC Forms, etc.) where applicable?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q34",
              sheetRef: "Q34",
              text: "How well does the solution avoid unnecessary duplication with existing GC capabilities and investments?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "financial"
              ]
            },
            {
              id: "A-Q35",
              sheetRef: "Q35",
              text: "Is there a clear strategy for AI integration \u2014 including use of GC Foundation Models and GC AI Compute infrastructure?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q36",
              sheetRef: "Q36",
              text: "Is the solution designed to be decommissioned or migrated, with a documented sunset and transition strategy?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application"
              ]
            },
            {
              id: "A-Q37",
              sheetRef: "Q37",
              text: "How well are supply chain security risks addressed in the sourcing and integration of third-party components?",
              weight: 1,
              answerType: "scale",
              topics: [
                "application",
                "security"
              ]
            }
          ],
          shareOfDomain: 50
        }
      ]
    },
    {
      id: "technology",
      label: "Technology & Physical Architecture",
      weight: 25,
      description: "Building resilient, sovereign infrastructure foundations",
      sections: [
        {
          id: "defining-the-current-state",
          label: "Defining the Current State",
          weight: 10,
          questions: [
            {
              id: "T-Q1",
              sheetRef: "Q1",
              text: "Are all details of the current solution's hosting environment \u2014 hardware, software, network, and configuration \u2014 fully documented?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q2",
              sheetRef: "Q2",
              text: "Is the current solution healthy, with no critical alerts, capacity issues, or unresolved infrastructure-level incidents?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q3",
              sheetRef: "Q3",
              text: "Are there any imminent changes to consumed infrastructure services, and is the solution prepared for those transitions?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q4",
              sheetRef: "Q4",
              text: "Is the lifespan of the solution shorter than that of the infrastructure \u2014 and if not, is an upgrade plan in the backlog?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q5",
              sheetRef: "Q5",
              text: "How well-informed is the team about their infrastructure service provider's roadmap, changes, and service performance?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q6",
              sheetRef: "Q6",
              text: "Can infrastructure be ordered and provisioned on demand, and what lead time is required?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q7",
              sheetRef: "Q7",
              text: "Is there a clear inventory of all infrastructure components, including versions, patch levels, and support status?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            }
          ],
          stageExpectation: {
            discovery: "low-ok",
            alpha: "low-ok"
          },
          shareOfDomain: 10
        },
        {
          id: "infrastructure-architecture-and-deployment-model",
          label: "Infrastructure Architecture & Deployment Model",
          weight: 25,
          questions: [
            {
              id: "T-Q8",
              sheetRef: "Q8",
              text: "Is the physical hosting model (on-premise EDC, public cloud, private cloud, hybrid) clearly justified and documented?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q9",
              sheetRef: "Q9",
              text: "Is the decision between shared and dedicated hardware documented with supporting rationale for cost, isolation, and performance?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "financial"
              ]
            },
            {
              id: "T-Q10",
              sheetRef: "Q10",
              text: "Are physical kiosks, IoT devices, or specialized hardware requirements identified and architecturally accommodated?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q11",
              sheetRef: "Q11",
              text: "How well does the design leverage GC-wide service consolidation, shared footprint, and enterprise infrastructure services?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q12",
              sheetRef: "Q12",
              text: "Are elasticity, burst capacity, and auto-scaling requirements defined and architecturally implemented?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q13",
              sheetRef: "Q13",
              text: "Are High-Performance Computing (HPC) and edge computing needs assessed and addressed where applicable?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q14",
              sheetRef: "Q14",
              text: "Is GC AI Compute (dedicated GC-owned/controlled GPU infrastructure) considered and evaluated as a first option for AI workloads?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q15",
              sheetRef: "Q15",
              text: "Are bandwidth, latency, and network connectivity requirements defined and met by the infrastructure design?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q16",
              sheetRef: "Q16",
              text: "Are storage volumes, IOPS, throughput, and data tiering requirements specified and provisioned appropriately?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q17",
              sheetRef: "Q17",
              text: "Is the deployment model designed to meet availability, recovery time, and recovery point objectives?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            }
          ],
          shareOfDomain: 25
        },
        {
          id: "modern-engineering-patterns-and-platform-design",
          label: "Modern Engineering Patterns & Platform Design",
          weight: 20,
          questions: [
            {
              id: "T-Q18",
              sheetRef: "Q18",
              text: "Is configuration and infrastructure managed as code (IaC/CaC), enabling reproducible and auditable deployments?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q19",
              sheetRef: "Q19",
              text: "How well does the team understand and apply GC-relevant infrastructure design patterns and reference architectures?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q20",
              sheetRef: "Q20",
              text: "Does the architecture embrace composable, modular designs and event-driven models where appropriate?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q21",
              sheetRef: "Q21",
              text: "Is interoperability and containerization baked into the infrastructure design from the beginning?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q22",
              sheetRef: "Q22",
              text: "Is there a documented plan and roadmap for quantum and post-quantum cryptography readiness?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "security"
              ]
            },
            {
              id: "T-Q23",
              sheetRef: "Q23",
              text: "How mature is the use of platform engineering practices \u2014 are developer-facing platforms self-service and well-governed?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q24",
              sheetRef: "Q24",
              text: "Are orchestration and container management (e.g., Kubernetes) used appropriately and configured to GC standards?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            }
          ],
          shareOfDomain: 20
        },
        {
          id: "resilience-sovereignty-and-security",
          label: "Resilience, Sovereignty & Security",
          weight: 25,
          questions: [
            {
              id: "T-Q25",
              sheetRef: "Q25",
              text: "Are resilience requirements (availability tiers, fault tolerance, geo-redundancy) formally defined and validated in design?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q26",
              sheetRef: "Q26",
              text: "Is the solution's data sovereignty posture clearly documented, including data residency and foreign access risk mitigation?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "security"
              ]
            },
            {
              id: "T-Q27",
              sheetRef: "Q27",
              text: "How mature is the zero-trust security architecture \u2014 is authentication, authorization, and segmentation enforced throughout?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "security"
              ]
            },
            {
              id: "T-Q28",
              sheetRef: "Q28",
              text: "Is encryption applied appropriately at rest, in transit, and in processing, using GC-approved cryptographic standards?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "security"
              ]
            },
            {
              id: "T-Q29",
              sheetRef: "Q29",
              text: "Has a Threat and Risk Assessment (TRA) or Security Assessment and Authorization (SA&A) been completed and reflected in design?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "technology",
                "security"
              ]
            },
            {
              id: "T-Q30",
              sheetRef: "Q30",
              text: "Are security controls validated through automated security testing, vulnerability scanning, and penetration testing?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "security"
              ]
            },
            {
              id: "T-Q31",
              sheetRef: "Q31",
              text: "Is there a documented and tested disaster recovery plan, with defined RTO and RPO that align to business requirements?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q32",
              sheetRef: "Q32",
              text: "Are GC Cloud Guardrails and security baseline configurations implemented and continuously validated?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "security"
              ]
            }
          ],
          shareOfDomain: 25
        },
        {
          id: "operations-governance-and-continuous-management",
          label: "Operations, Governance & Continuous Management",
          weight: 20,
          questions: [
            {
              id: "T-Q33",
              sheetRef: "Q33",
              text: "Are real-time monitoring, alerting, and incident response capabilities in place and actively used?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q34",
              sheetRef: "Q34",
              text: "Is activity auditing implemented at the infrastructure level, enabling forensic investigation and compliance verification?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q35",
              sheetRef: "Q35",
              text: "How mature is the FinOps practice \u2014 are cloud and infrastructure costs tracked, attributed, optimized, and reported?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "financial"
              ]
            },
            {
              id: "T-Q36",
              sheetRef: "Q36",
              text: "Is there infrastructure-level observability (metrics, logs, traces) that provides end-to-end system visibility?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            },
            {
              id: "T-Q37",
              sheetRef: "Q37",
              text: "Are resource governance policies enforced \u2014 including tagging, cost allocation, and access to shared infrastructure?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology",
                "financial"
              ]
            },
            {
              id: "T-Q38",
              sheetRef: "Q38",
              text: "Is there a continuous business need (CBN) process to evaluate whether infrastructure investment remains justified?",
              weight: 1,
              answerType: "yesno",
              topics: [
                "technology",
                "financial"
              ]
            },
            {
              id: "T-Q39",
              sheetRef: "Q39",
              text: "How mature is the infrastructure change management process \u2014 are changes reviewed, approved, and traceable?",
              weight: 1,
              answerType: "scale",
              topics: [
                "technology"
              ]
            }
          ],
          shareOfDomain: 20
        }
      ]
    }
  ]
};

// test/smoke.ts
var fails = 0;
var ok = (name, cond, extra = "") => {
  if (!cond) {
    fails++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
};
var v = validate(rubric_v1_dan_default);
ok("Dan's imported rubric validates", v.ok, v.ok ? "" : v.problems.join("; "));
var rubric = v.rubric;
var allQ = rubric.domains.flatMap((d) => d.sections.flatMap((s) => s.questions));
ok("4 domains at 25% each", rubric.domains.length === 4 && rubric.domains.every((d) => d.weight === 25));
ok(
  "20 sections",
  rubric.domains.reduce((n, d) => n + d.sections.length, 0) === 20,
  String(rubric.domains.reduce((n, d) => n + d.sections.length, 0))
);
ok("176 questions", allQ.length === 176, String(allQ.length));
ok("11-point ladder with names", rubric.scale.anchors.length === 11 && !!rubric.scale.anchors[10].name);
ok("ladder runs 0 to 10", rubric.scale.anchors[0].value === 0 && rubric.scale.anchors[10].value === 10);
ok("every question has a unique id", new Set(allQ.map((q) => q.id)).size === allQ.length);
ok("every question traces back to a sheet cell", allQ.every((q) => /^Q\d+$/.test(q.sheetRef ?? "")));
ok(
  "the Business weight gap is recorded, not swallowed",
  (rubric.importWarnings ?? []).some((w) => w.includes("Business") && w.includes("80%"))
);
ok("Dan's maturity bands came across", (rubric.maturityBands ?? []).length === 5);
function blank(stage) {
  return {
    fileType: "gc-arch-assessment",
    formatVersion: 1,
    rubric: { id: rubric.id, version: rubric.version, title: rubric.title },
    initiative: { name: "Test initiative", department: "TC", contact: "a@b.c", lifecycleStage: stage, summary: "s", classification: "Unclassified" },
    answers: {},
    meta: { createdAt: "x", updatedAt: "x", appVersion: "test" }
  };
}
var fill = (a, s) => {
  for (const q of allQ) a.answers[q.id] = { score: s, evidence: [], justification: "because" };
  return a;
};
var qid = (text2) => {
  const q = allQ.find((x) => x.text.toLowerCase().includes(text2.toLowerCase()));
  if (!q) throw new Error(`No question matching "${text2}"`);
  return q.id;
};
for (const st of rubric.lifecycleStages) {
  const r = score(rubric, fill(blank(st.id), 5));
  ok(`all 5s scores 5.0 at ${st.id}`, Math.abs(r.overall - 5) < 1e-9, `got ${r.overall}`);
}
ok("all 0s scores 0", score(rubric, fill(blank("beta"), 0)).overall === 0);
ok("all 10s scores 10", score(rubric, fill(blank("beta"), 10)).overall === 10);
{
  const a = fill(blank("beta"), 5);
  const dataDomain = rubric.domains.find((d) => d.id === "data");
  const heavy = dataDomain.sections.find((s) => s.weight === 40);
  const light = dataDomain.sections.find((s) => s.weight === 5);
  const drop = (sec) => {
    const b = fill(blank("beta"), 5);
    for (const q of sec.questions) b.answers[q.id] = { score: 0, evidence: [], justification: "" };
    return score(rubric, b).overall;
  };
  ok(
    "a 40% section moves the score more than a 5% section",
    drop(heavy) < drop(light),
    `heavy ${drop(heavy).toFixed(2)} vs light ${drop(light).toFixed(2)}`
  );
  ok("baseline unaffected", Math.abs(score(rubric, a).overall - 5) < 1e-9);
}
var band = (n) => score(rubric, fill(blank("beta"), n)).band?.id;
ok("10 -> showcase", band(10) === "showcase", String(band(10)));
ok("7 -> hall pass", band(7) === "hallpass", String(band(7)));
ok("5 -> routine", band(5) === "routine", String(band(5)));
ok("2 -> attend", band(2) === "attend", String(band(2)));
var mat = (n) => score(rubric, fill(blank("beta"), n)).maturity?.label;
ok("5 -> Baseline Ready", mat(5) === "Baseline Ready", String(mat(5)));
ok("7 -> Advanced", mat(7) === "Advanced", String(mat(7)));
ok("10 -> Leading Practice", mat(10) === "Leading Practice", String(mat(10)));
ok("1 -> Critical Risk", mat(1) === "Critical Risk", String(mat(1)));
{
  const currentStateQs = rubric.domains.flatMap((d) => d.sections.filter((s) => /current state/i.test(s.label))).flatMap((s) => s.questions.map((q) => q.id));
  ok("current-state sections were found in all four domains", currentStateQs.length > 30, String(currentStateQs.length));
  const mk = (stage) => {
    const a = fill(blank(stage), 8);
    for (const id of currentStateQs) a.answers[id] = { score: 0, evidence: [], justification: "" };
    return score(rubric, a).overall;
  };
  const disc = mk("discovery"), matu = mk("maturity");
  ok(
    "an undocumented current state hurts less at discovery than at maturity",
    disc > matu,
    `discovery ${disc.toFixed(2)} vs maturity ${matu.toFixed(2)}`
  );
}
{
  const a = fill(blank("beta"), 6);
  const target = qid("Privacy Impact Assessment");
  a.answers[target] = { score: null, na: true };
  const r = score(rubric, a);
  ok("n/a does not drag the score down", Math.abs(r.overall - 6) < 1e-9, `got ${r.overall}`);
  ok(
    "n/a still counts as dealt with, so the denominator does not shrink",
    r.scoreable === allQ.length,
    String(r.scoreable)
  );
  ok("and it counts in the numerator too", r.answered === allQ.length, String(r.answered));
  ok("so a fully handled assessment reads as complete", r.completeness === 1, String(r.completeness));
}
{
  const a = blank("beta");
  a.answers[qid("current state of this solution been documented")] = {
    score: 9,
    evidence: [{ title: "Current state pack", kind: "document", location: "GCdocs", classification: "Unclassified" }],
    justification: "reviewed quarterly since March and owned by the ADM"
  };
  const r = score(rubric, a);
  ok("one answer of 9 scores 9", Math.abs(r.overall - 9) < 1e-9, `got ${r.overall}`);
  ok("completeness reflects the gap", r.completeness < 0.02, String(r.completeness));
  ok("incompleteness is flagged", flags(rubric, a, r).some((f) => f.id === "incomplete"));
}
{
  const a = fill(blank("beta"), 6);
  const r = score(rubric, a);
  ok(
    "a score exactly on the hall-pass line is flagged as thin",
    flags(rubric, a, r).some((f) => f.id === "just-above-the-line"),
    `overall ${r.overall}`
  );
  const clear = fill(blank("beta"), 8);
  ok("a comfortable score is not", !flags(rubric, clear, score(rubric, clear)).some((f) => f.id === "just-above-the-line"));
}
{
  const interpolated = rubric.bands.filter((b) => b.source === "interpolated");
  ok(
    "exactly one threshold is marked as ours",
    interpolated.length === 1,
    interpolated.map((b) => b.label).join(",")
  );
  ok("and it is the one Dan never named", interpolated[0]?.min === 3, String(interpolated[0]?.min));
  ok("the note says which numbers were his", (rubric.bandsNote ?? "").includes("is OURS"));
}
{
  const a = blank("beta");
  for (const q of allQ.slice(0, 20)) a.answers[q.id] = { score: 6, evidence: [], justification: "because" };
  const fs = flags(rubric, a, score(rubric, a));
  ok("an incomplete submission is flagged", fs.some((f) => f.id === "incomplete"));
  ok(
    "and its unanswered questions are not also listed one by one",
    !fs.some((f) => f.id === "unanswered-many" || f.id === "unanswered"),
    fs.map((f) => f.id).join(",")
  );
}
{
  const a = fill(blank("beta"), 5);
  const target = qid("clear inventory of all infrastructure components");
  a.answers[target] = { score: 9, evidence: [], justification: "we have it all" };
  const fs = flags(rubric, a, score(rubric, a));
  ok("high score with no evidence is caught", fs.some((f) => f.id === "high-score-no-evidence" && f.questionId === target));
  ok("that flag carries a question to ask", !!fs.find((f) => f.id === "high-score-no-evidence")?.challenge);
}
{
  const a = fill(blank("beta"), 5);
  a.answers[qid("total lifecycle costs")] = {
    score: 1,
    evidence: [{ title: "Five-year cost model", kind: "document", location: "SharePoint", classification: "Protected B" }],
    justification: ""
  };
  const fs = flags(rubric, a, score(rubric, a));
  ok("low score with evidence is caught", fs.some((f) => f.id === "low-score-with-evidence"));
  ok("Protected B evidence is NOT treated as an anomaly", !fs.some((f) => f.id === "evidence-classified"));
}
{
  const a = fill(blank("beta"), 5);
  a.answers[qid("avoid unnecessary duplication with existing GC capabilities")] = {
    score: 9,
    evidence: [{ title: "Reuse assessment", kind: "document", location: "the team drive", classification: "Unclassified" }],
    justification: "we checked"
  };
  ok(
    "a high score with evidence pointed at but not attached is caught",
    flags(rubric, a, score(rubric, a)).some((f) => f.id === "evidence-not-attached")
  );
}
{
  const a = fill(blank("beta"), 7);
  ok("flat scoring is caught", flags(rubric, a, score(rubric, a)).some((f) => f.id === "flat-scoring"));
}
{
  const a = fill(blank("beta"), 10);
  const fs = flags(rubric, a, score(rubric, a));
  ok("a perfect self-score is pulled into the audit sample", fs.some((f) => f.id === "self-score-outlier"));
}
{
  const a = fill(blank("discovery"), 4);
  a.answers[qid("current state of this solution been documented")] = {
    score: 10,
    evidence: [{ title: "x", kind: "document", location: "y", classification: "Unclassified" }],
    justification: "fully mapped"
  };
  ok(
    "unusual confidence at discovery is caught",
    flags(rubric, a, score(rubric, a)).some((f) => f.id === "stage-mismatch")
  );
}
{
  const a = fill(blank("beta"), 7);
  const target = qid("avoid unnecessary duplication with existing GC capabilities");
  a.answers[target] = { score: 1, evidence: [], justification: "" };
  const r = score(rubric, a);
  const w = weakest(r, 3);
  ok("weakest is the 1", w[0].question.id === target, w[0].question.id);
  const next = nextAnchor(rubric, w[0].question, 1);
  ok("the next rung above 1 is 2, Fragmented", next?.value === 2 && next?.name === "Fragmented", JSON.stringify(next));
}
{
  const r = score(rubric, fill(blank("beta"), 5));
  ok(
    "every question appears in the result",
    allQuestionScores(r).length === allQ.length,
    `${allQuestionScores(r).length} vs ${allQ.length}`
  );
}
{
  const a = fill(blank("growth"), 6);
  const header = csvHeader(rubric);
  const row = csvRow(rubric, a, { high: 1, total: 4 });
  ok("csv row matches header width", header.length === row.length, `${header.length} vs ${row.length}`);
  ok("csv has a column per question score", allQ.every((q) => header.includes(`${q.id}_score`)));
  ok("csv has a column per section", rubric.domains.every((d) => d.sections.every((s) => header.includes(`section_${d.id}_${s.id}`))));
  const text2 = toCsv([header, row]);
  ok("csv quotes and escapes safely", !text2.split("\r\n")[1].includes("\n"));
}
{
  const a = fill(blank("sunset"), 6);
  const target = qid("formal, documented data model");
  a.answers[target] = { score: 3, evidence: [], justification: 'commas, "quotes" and \nnewlines' };
  const back = JSON.parse(JSON.stringify(a));
  ok("round-trips through a file", score(rubric, back).overall === score(rubric, a).overall);
  ok("awkward text survives", back.answers[target].justification === a.answers[target].justification);
}
function stable(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x) ?? "undefined";
  if (Array.isArray(x)) return `[${x.map(stable).join(",")}]`;
  const o = x;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
{
  const a = blank("beta");
  a.ref = "QK7M";
  a.ownerEmail = "someone@example.gc.ca";
  a.initiative.classification = "Unclassified";
  a.initiative.markingAcknowledged = "Unclassified";
  a.answers["q-null"] = { score: null, justification: "" };
  a.answers["q-na"] = { score: null, na: true };
  a.answers["q-empty"] = { score: 0, evidence: [] };
  a.answers["q-full"] = {
    score: 7,
    picklist: "other",
    picklistOther: "a case the list does not carry",
    justification: 'commas, "quotes" and \nnewlines',
    evidence: [
      { title: "Current state pack", kind: "document", location: "GCdocs", classification: "Unclassified" },
      {
        title: "Cost model",
        kind: "report",
        location: "sent by email",
        classification: "Protected B",
        emailed: true,
        emailSubject: "EARB QK7M evidence 2",
        attachment: { name: "costs.csv", type: "text/csv", size: 4096, data: "YSxiLGMK" }
      }
    ]
  };
  a.audit = {
    reviewer: "An assessor",
    reviewedAt: "2026-09-03T12:00:00.000Z",
    overallNote: "",
    perQuestion: {
      "q-full": {
        auditedScore: 6.5,
        verdict: "adjust",
        note: "the pack covers one system of three",
        by: "An assessor",
        at: "2026-09-03T12:00:00.000Z",
        history: [
          { by: "An assessor", at: "2026-09-03T11:00:00.000Z", score: 5, note: "first pass", unverified: true },
          { by: "Another assessor", at: "2026-09-03T11:30:00.000Z", score: 6.5, note: "on reflection", unverified: true }
        ]
      }
    }
  };
  const wire = toFields({ ...a });
  const back = fromFields(wire);
  ok(
    "an assessment round-trips through the Firestore mapping",
    stable(back) === stable(a),
    stable(back) === stable(a) ? "" : stable(back)
  );
  ok("a null score comes back as null", back.answers["q-null"].score === null);
  ok("an n/a boolean survives", back.answers["q-na"].na === true);
  ok(
    "an empty evidence array stays an empty array",
    Array.isArray(back.answers["q-empty"].evidence) && back.answers["q-empty"].evidence.length === 0,
    JSON.stringify(back.answers["q-empty"].evidence)
  );
  ok(
    "nested evidence keeps both items and their order",
    (back.answers["q-full"].evidence ?? []).map((e) => e.title).join("|") === "Current state pack|Cost model"
  );
  ok(
    "an attachment inside evidence survives",
    (back.answers["q-full"].evidence ?? [])[1]?.attachment?.data === "YSxiLGMK"
  );
  ok("a whole number reads back as a number", back.answers["q-full"].score === 7);
  ok("a fractional audit score keeps its fraction", back.audit?.perQuestion["q-full"]?.auditedScore === 6.5);
  ok("the audit history stays two moves long", (back.audit?.perQuestion["q-full"]?.history ?? []).length === 2);
  ok(
    "awkward text survives the wrapping",
    back.answers["q-full"].justification === a.answers["q-full"].justification
  );
  ok(
    "an empty answers map on a fresh assessment stays a map",
    stable(fromFields(toFields({ ...blank("beta") })).answers) === "{}"
  );
}
{
  ok("a whole number goes as an int64 in a string", stable(toValue(7)) === '{"integerValue":"7"}', stable(toValue(7)));
  ok("zero goes as an integer", stable(toValue(0)) === '{"integerValue":"0"}');
  ok("a fraction goes as a double", stable(toValue(6.5)) === '{"doubleValue":6.5}', stable(toValue(6.5)));
  ok("null goes as nullValue", stable(toValue(null)) === '{"nullValue":null}');
  ok("false goes as a boolean", stable(toValue(false)) === '{"booleanValue":false}');
  ok("an empty string is a string", stable(toValue("")) === '{"stringValue":""}');
  ok(
    "a number past 2^53 goes as a double, because an int64 in a string would be refused",
    stable(toValue(2 ** 60)) === `{"doubleValue":${2 ** 60}}`,
    stable(toValue(2 ** 60))
  );
  ok(
    "an undefined field is left out, the way JSON.stringify leaves it out",
    stable(toFields({ note: void 0, title: "x" })) === '{"title":{"stringValue":"x"}}',
    stable(toFields({ note: void 0, title: "x" }))
  );
  ok("an array with no values key reads as an empty array", stable(fromValue({ arrayValue: {} })) === "[]");
  ok("a map with no fields key reads as an empty object", stable(fromValue({ mapValue: {} })) === "{}");
  ok("an integer in a string reads as a number", fromValue({ integerValue: "10" }) === 10);
  ok(
    "a timestamp reads as the string it was written as",
    fromValue({ timestampValue: "2026-09-03T12:00:00Z" }) === "2026-09-03T12:00:00Z"
  );
  ok("NaN in its string form reads as NaN", Number.isNaN(fromValue({ doubleValue: "NaN" })));
  ok(
    "a value form nobody here knows reads as absent, so one field cannot lose a record",
    fromValue({ someLaterValue: 1 }) === null
  );
  let refused = false;
  try {
    toValue([[1]]);
  } catch {
    refused = true;
  }
  ok("an array inside an array is refused before the request goes", refused);
}
{
  ok("rejects a non-rubric", validate({ hello: "world" }).ok === false);
  ok(
    "rejects the old sectionless format",
    validate({ ...rubric, domains: [{ id: "x", label: "x", weight: 25, questions: [] }] }).ok === false
  );
  const dup = JSON.parse(JSON.stringify(rubric));
  dup.domains[0].sections[0].questions.push({ ...dup.domains[0].sections[0].questions[0] });
  const res = validate(dup);
  ok("rejects duplicate question ids", res.ok === false && res.problems.some((p) => p.includes("Duplicate")));
}
{
  const bareOverview = (x) => {
    x.initiative.name = "";
    x.initiative.department = "";
    x.initiative.contact = "";
    x.initiative.summary = "";
    return x;
  };
  const empty = bareOverview(blank("beta"));
  const c0 = completion(rubric, empty);
  ok("an empty assessment is not complete", c0.complete === false);
  ok(
    "and every question is outstanding",
    c0.questionsLeft === c0.total && c0.total === allQ.length,
    `${c0.questionsLeft} of ${c0.total}`
  );
  ok(
    "and the four typed overview fields are listed as outstanding",
    c0.overviewLeft.length === 4,
    c0.overviewLeft.join(", ")
  );
  const scored = fill(bareOverview(blank("beta")), 6);
  const c1 = completion(rubric, scored);
  ok(
    "every question answered is still not complete while the overview is short",
    c1.complete === false && c1.questionsLeft === 0,
    JSON.stringify(c1.overviewLeft)
  );
  const done = fill(blank("beta"), 6);
  const c2 = completion(rubric, done);
  ok("with the overview filled it is complete", c2.complete === true, JSON.stringify(c2));
  const na = blank("beta");
  na.initiative.name = "X";
  na.initiative.department = "Y";
  na.initiative.contact = "a@b.gc.ca";
  na.initiative.summary = "Z";
  for (const q of allQ) na.answers[q.id] = { score: null, na: true };
  const c3 = completion(rubric, na);
  ok("not applicable throughout is complete", c3.complete === true);
  ok("and it scores nothing", score(rubric, na).overall === null, String(score(rubric, na).overall));
  const nearly = fill(blank("beta"), 6);
  nearly.initiative.name = "X";
  nearly.initiative.department = "Y";
  nearly.initiative.contact = "a@b.gc.ca";
  nearly.initiative.summary = "Z";
  delete nearly.answers[allQ[0].id];
  const c4 = completion(rubric, nearly);
  ok(
    "one question missing is one question short",
    c4.complete === false && c4.questionsLeft === 1,
    JSON.stringify(c4)
  );
  const bare = fill(blank("beta"), 6);
  bare.initiative.name = "X";
  bare.initiative.department = "Y";
  bare.initiative.contact = "a@b.gc.ca";
  bare.initiative.summary = "Z";
  for (const q of allQ) bare.answers[q.id] = { score: 6, evidence: [] };
  ok("no reasoning and no evidence is still complete", completion(rubric, bare).complete === true);
}
{
  const ids = (rubric.topics ?? []).map((t) => t.id);
  ok("all nine categories Dan named are declared", ids.length === 9, ids.join(","));
  for (const want of [
    "business",
    "data",
    "application",
    "technology",
    "security",
    "privacy",
    "financial",
    "accessibility",
    "official-languages"
  ]) {
    ok(`  ${want} is one of them`, ids.includes(want));
  }
  const all = rubric.domains.flatMap((d) => d.sections.flatMap((s2) => s2.questions));
  const carrying = (id) => all.filter((q) => (q.topics ?? []).includes(id)).length;
  ok(
    "a question can carry more than one category",
    all.filter((q) => (q.topics ?? []).length > 1).length > 30,
    String(all.filter((q) => (q.topics ?? []).length > 1).length)
  );
  ok(
    "every question carries its own domain as a category",
    rubric.domains.every((d) => d.sections.every((s2) => s2.questions.every((q) => (q.topics ?? []).includes(d.id))))
  );
  ok("financial is derived and not empty", carrying("financial") > 5, String(carrying("financial")));
  ok("accessibility is declared and empty", carrying("accessibility") === 0, String(carrying("accessibility")));
  ok(
    "official languages is declared and empty",
    carrying("official-languages") === 0,
    String(carrying("official-languages"))
  );
  ok(
    "and the note says who owns the real assignments",
    /Dan owns the real assignments/.test(rubric.topicsNote ?? "")
  );
  ok(
    "and names what would fill the empty two",
    /Topics column/.test(rubric.topicsNote ?? "")
  );
  const bent = JSON.parse(JSON.stringify(rubric));
  bent.domains[0].sections[0].questions[0].topics = ["business", "secuirty"];
  const verdict = validate(bent);
  ok("a question set carrying a topic it never declared is refused", verdict.ok === false);
  ok(
    "and the refusal names the question and the topic",
    !verdict.ok && verdict.problems.some((x) => /secuirty/.test(x) && /B-Q/.test(x)),
    verdict.ok ? "" : verdict.problems.join(" | ")
  );
  const one = rubric.domains[0].sections[0].questions[0];
  const filled = blank("beta");
  filled.answers[one.id] = { score: 10, evidence: [] };
  const r = score(rubric, filled);
  const inTopics = r.topics.filter((t) => (one.topics ?? []).includes(t.topic.id));
  ok(
    "one answer scores inside every topic that question carries",
    inTopics.length === (one.topics ?? []).length && inTopics.every((t) => t.score === 10),
    inTopics.map((t) => `${t.topic.id}=${t.score}`).join(" ")
  );
  const whole = score(rubric, fill(blank("beta"), 7));
  const inDomains = whole.domains.reduce((n, d) => n + d.total, 0);
  const inTopicsTotal = whole.topics.reduce((n, t) => n + t.total, 0);
  ok(
    "every question counts once across the domains",
    inDomains === allQ.length,
    `${inDomains} of ${allQ.length}`
  );
  ok(
    "and more than once across the topics, which is why they do not add up to the overall",
    inTopicsTotal > inDomains,
    `${inTopicsTotal} topic memberships for ${inDomains} questions`
  );
}
console.log(fails === 0 ? "\nall checks passed" : `
${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
