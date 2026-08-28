/** Shared shapes. The rubric is data supplied by Dan; the app is a renderer over it. */

export type StageExpectation = 'low-ok' | 'expected' | 'critical';

/** A rung on the 0-10 ladder. `name` and `colour` come from Dan's Assessment Scale sheet. */
export interface Anchor { value: number; name?: string; colour?: string; label: string }

export interface PicklistOption { value: string; label: string }

export interface Question {
  id: string;
  sheetRef?: string;                                   // e.g. "Q37", to trace back to the workbook
  text: string;
  help?: string;
  weight: number;                                      // relative weight inside its section
  evidencePrompt?: string;
  picklist?: PicklistOption[];
  picklistNote?: string;
  anchors?: Anchor[];
  stageExpectation?: Record<string, StageExpectation>;
  nextSteps?: string[];
}

/** Dan's structure: each domain is split into weighted sections. */
export interface Section {
  id: string;
  label: string;
  weight: number;                                      // percent of its domain, as written
  /** The same weight as a share of the weights actually present, so a domain adds up to 100. */
  shareOfDomain?: number;
  description?: string;
  stageExpectation?: Record<string, StageExpectation>; // applies to every question in the section
  questions: Question[];
}

export interface Domain {
  id: string;
  label: string;
  weight: number;                                      // percent of the overall score
  description?: string;
  sections: Section[];
}

export interface Band {
  id: string;
  min: number;
  label: string;
  routing: string;
  tone: 'good' | 'neutral' | 'bad';
}

export interface MaturityBand { min: number; label: string; detail: string }

export interface LifecycleStage {
  id: string;
  label: string;
  dlgPage?: string;
  blurb?: string;
}

export interface Rubric {
  fileType: 'gc-arch-rubric';
  formatVersion: number;
  id: string;
  version: string;
  status: 'stand-in' | 'draft' | 'approved';
  title: string;
  provenance?: string;
  dlgBaseUrl?: string;
  importWarnings?: string[];
  scale: { min: number; max: number; anchors: Anchor[] };
  maturityBands?: MaturityBand[];
  maturityBandsNote?: string;
  bands: Band[];
  bandsNote?: string;
  stageMultipliers: Record<StageExpectation, number>;
  stageMultipliersNote?: string;
  lifecycleStages: LifecycleStage[];
  domains: Domain[];
}

/**
 * Government of Canada security categories, lowest to highest. Order matters: it drives the
 * save gate, which refuses a file marked lower than something inside it.
 *
 * Two families. Protected covers information whose compromise harms a person, a company or
 * the government but not the national interest. Confidential, Secret and Top Secret are the
 * classified levels, where the injury is to the national interest. "Classified" is the name
 * of that family, never a marking on its own, which is what this list had before.
 */
export const CLASSIFICATIONS = [
  'Unclassified',
  'Protected A', 'Protected B', 'Protected C',
  'Confidential', 'Secret', 'Top Secret',
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const classRank = (c: Classification | '' | undefined): number =>
  c ? CLASSIFICATIONS.indexOf(c as Classification) : -1;

/** A file the submitter attached, carried inside the assessment as base64. */
export interface Attachment {
  name: string;
  type: string;
  size: number;
  data: string;      // base64
}

/**
 * Evidence is either attached or pointed at.
 *
 * Attached is the default, because the whole point is that an assessor can look at it
 * without emailing anyone. Pointed-at is for the cases where the artefact cannot travel -
 * a live dashboard, a system, or anything held above the assessment's own marking.
 */
export interface EvidenceRef {
  title: string;
  kind: 'document' | 'diagram' | 'dashboard' | 'system' | 'report' | 'other';
  location: string;                 // where it lives, or a URL
  classification: Classification | '';
  note?: string;
  attachment?: Attachment;
}

export interface Answer {
  score: number | null;
  na?: boolean;
  picklist?: string;
  picklistOther?: string;
  justification?: string;
  evidence?: EvidenceRef[];
}

export interface AuditEntry {
  auditedScore: number | null;
  verdict: 'agree' | 'adjust' | 'insufficient' | '';
  note?: string;
}

export interface Audit {
  reviewer: string;
  reviewedAt: string;
  perQuestion: Record<string, AuditEntry>;
  overallNote?: string;
}

export interface Assessment {
  fileType: 'gc-arch-assessment';
  formatVersion: number;
  rubric: { id: string; version: string; title: string };
  initiative: {
    name: string;
    department: string;
    contact: string;
    lifecycleStage: string;
    summary: string;
    /** The marking on this file as a whole. Must be at least as high as anything inside it. */
    classification: Classification | '';
  };
  answers: Record<string, Answer>;
  meta: { createdAt: string; updatedAt: string; appVersion: string };
  audit?: Audit;
}
