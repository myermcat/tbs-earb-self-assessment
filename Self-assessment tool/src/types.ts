/** Shared shapes. The rubric is data supplied by Dan; the app is a renderer over it. */

export type StageExpectation = 'low-ok' | 'expected' | 'critical';

/** A rung on the 0-10 ladder. `name` and `colour` come from Dan's Assessment Scale sheet. */
export interface Anchor { value: number; name?: string; colour?: string; label: string }

export interface PicklistOption { value: string; label: string }

/**
 * How a question is answered. `scale` is the 0 to 10 maturity ladder and the default, so a
 * rubric that says nothing behaves exactly as before. `yesno` is for the questions Dan spotted
 * that are binary wearing a scale.
 *
 * A `no` on a yes/no question raises a RED FLAG: it colours the section and the person carries
 * on. It does not stop the assessment. Nothing in this tool stops an assessment.
 */
export type AnswerType = 'scale' | 'yesno';

/** A name and an address somebody typed, with the moment they pressed the button. Unverified. */
export interface SavedBy {
  name: string;
  email: string;
  at: string;
  /** Always true. There is no authentication behind a submitter's name in this tool. */
  unverified: true;
  /**
   * Which save this was. The two named ones are the versions somebody asks about later: the
   * one where the assessment first existed at TBS, and the one where it was handed to an
   * assessor. Ordinary saves in between are 'save' and are the first to be dropped.
   */
  moment?: 'first' | 'ready' | 'unready' | 'save';
  /** What it scored out of ten when it went, so a trail reads as a trend and not as a list. */
  score?: number | null;
  /** How many of the scoreable questions were answered then. */
  answered?: number;
}

export interface Topic {
  id: string;
  label: string;
  note?: string;
}

export interface Question {
  id: string;
  sheetRef?: string;                                   // e.g. "Q37", to trace back to the workbook
  text: string;
  answerType?: AnswerType;
  /** Topics this question counts towards, beyond its own domain. */
  topics?: string[];
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
  /** 'interpolated' where the threshold was filled in by us and not named by Dan. */
  source?: 'interpolated';
}

export interface MaturityBand { min: number; label: string; detail: string }

export interface LifecycleStage {
  id: string;
  label: string;
  phase?: string;
  /** Path to this stage's own page in the Digital Lifecycle Guide, under `dlgBaseUrl`. */
  dlgPath?: string;
  blurb?: string;
}

export interface Phase { name: string; dlgPath?: string; blurb?: string }

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
  topics?: Topic[];
  topicsNote?: string;
  lifecycleStages: LifecycleStage[];
  phases?: Phase[];
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
  /**
   * Recorded as sent to the assessor by email, with the subject line that was written at the
   * time. This was a prefix on `location` for a while, which meant editing that text by hand
   * changed the state, and renaming the initiative made the recorded line and the shown line
   * disagree, so the assessor searched for a subject nobody had sent.
   */
  emailed?: true;
  emailSubject?: string;
}

export interface Answer {
  score: number | null;
  na?: boolean;
  picklist?: string;
  picklistOther?: string;
  justification?: string;
  evidence?: EvidenceRef[];
}

/**
 * One move in the exchange over a question. Append-only: an assessor changes a score with a
 * reason, another disagrees and changes it with theirs, and both survive. Nobody's reasoning is
 * overwritten by the next person's.
 */
export interface AuditMove {
  by: string;
  at: string;
  score: number | null;
  note: string;
  /** Never verified. There is no authentication in this tool. */
  unverified: true;
}

export interface AuditEntry {
  auditedScore: number | null;
  verdict: 'agree' | 'adjust' | 'insufficient' | '';
  note?: string;
  /** Who made the standing change, and when. */
  by?: string;
  at?: string;
  /** The full back and forth, oldest first. */
  history?: AuditMove[];
}

export interface Audit {
  reviewer: string;
  reviewedAt: string;
  perQuestion: Record<string, AuditEntry>;
  overallNote?: string;
}

/** What somebody was added as. A teammate fills the assessment in; an assessor reads and scores it. */
export type ShareRole = 'teammate' | 'assessor';

/**
 * How far a share has actually got.
 *
 * The mockup only ever writes 'recorded', which is the machine-readable form of the sentence on
 * screen: the address is in the file, no message went, and nobody was granted anything. A real
 * version adds 'invited' when the mail goes and 'accepted' when they first sign in.
 */
export type ShareState = 'recorded' | 'invited' | 'accepted';

export interface SharedWith {
  email: string;
  role: ShareRole;
  /** The address that added them, so a list of five people is still attributable. */
  addedBy: string;
  addedAt: string;
  state: ShareState;
}

/**
 * Who else is on an assessment.
 *
 * One list with a role on each entry, so there is one way to add, one way to remove and one
 * validator, and somebody whose part changes keeps the date they were added. The screen groups
 * them.
 *
 * The two flat lists are for the store's rules, which cannot read a field out of an object
 * inside an array. Writing them now means the day the real sharing goes live, no record already
 * in the store needs migrating.
 */
export interface Sharing {
  people: SharedWith[];
  teammateEmails: string[];
  assessorEmails: string[];
}

export interface Assessment {
  fileType: 'gc-arch-assessment';
  formatVersion: number;
  /** Assigned by the store when the record first goes online. Absent while it is only a draft. */
  id?: string;
  /**
   * A short code for this assessment, made when it is created and never changed.
   *
   * It exists because email subject lines are permanent. Putting the initiative name in a
   * subject means renaming the initiative invalidates every email already sent, and nobody can
   * un-send an email. The code does not depend on anything a person can edit.
   */
  ref?: string;
  rubric: { id: string; version: string; title: string };
  initiative: {
    name: string;
    department: string;
    contact: string;
    lifecycleStage: string;
    summary: string;
    /** The marking on this file as a whole. Must be at least as high as anything inside it. */
    classification: Classification | '';
    /**
     * Which marking the pledge was given for. Switching Protected B to Secret is a different
     * situation and asks again; it used to stay silent because this was a boolean.
     * `true` appears in files saved before this changed, and counts for whatever marking they
     * carry.
     */
    markingAcknowledged?: Classification | boolean;
  };
  answers: Record<string, Answer>;
  meta: {
    createdAt: string;
    updatedAt: string;
    appVersion: string;
    /**
     * When this assessment was last put in the store, by somebody pressing the button.
     *
     * Nothing leaves the machine unless somebody asks for it, and this is the record that
     * somebody did. It was once a switch: press it and everything after went by itself. That
     * is not what was wanted, and it is not what this is.
     */
    savedOnlineAt?: string;
    /**
     * The document name this record used to have, when that name could not be read to anybody.
     *
     * Records made before 14 September are named with twenty mixed-case characters. They are
     * given a readable code on their next save, and the old name is kept here so the copy left
     * behind in the store can be matched to the record that replaced it.
     */
    previousId?: string;
    /**
     * What the copy in the store contains, so the tool can say whether it is behind this one.
     *
     * The fingerprint of the assessment as it went, kept in the assessment itself and so
     * surviving a reload. Module state cannot answer this question: a reloaded tab has no
     * memory of the last write, and the badge went blank until somebody typed.
     */
    onlineVersion?: string;
    /**
     * Who put this version in the store, and when.
     *
     * Asked for by Dan on 14 September. A version used to arrive with nobody attached to it:
     * ownerEmail is set once when the record is created, and somebody holding the access code
     * left no trace at all, so an assessor could not tell whose work was in front of them.
     *
     * Typed, and checked by nobody. Every screen that shows it says so, the same way the
     * assessor's own name has always said so.
     */
    savedBy?: SavedBy;
    /**
     * The last twenty saves, newest last, as the version trail this tool has.
     *
     * A save replaces the document, so there is no history of the answers themselves. There is
     * a history of who pressed the button, which is the question an assessor actually asks. It
     * is bounded because it rides inside the document and the document has a size.
     */
    saves?: SavedBy[];
    /** Set when the person has been offered online saving and said the browser is enough. */
    onlineDeclined?: boolean;
    /** When the submitter marked it ready for an assessor to read. Nothing is sent. */
    submittedAt?: string;
  };
  /** Set when a record is pulled back out of the statistics. */
  withdrawnAt?: string;
  /**
   * Who owns this record, once there is a store and a sign-in. The store's rules compare it
   * against the signed-in address, which is what makes "read your own and nobody else's"
   * enforceable without a program of ours in the middle.
   */
  ownerEmail?: string;
  /** Who else is on this assessment. A mockup: the addresses are recorded and nothing is sent. */
  sharing?: Sharing;
  audit?: Audit;
}
