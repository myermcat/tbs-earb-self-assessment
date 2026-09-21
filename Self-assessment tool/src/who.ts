/**
 * Who this person is, and what they are allowed to reach.
 *
 * One interface, two answers behind it. Dan asked on 8 September whether the tool needs
 * accounts at all, and the answer turned out to be split rather than yes or no:
 *
 *   A submitter does not need one. Everything an account was doing for them, a code on the
 *   assessment does as well or better. It even fixes something accounts made worse: today a
 *   submitter can only reach their own record through an id in one browser's storage, so
 *   clearing a browser loses a submission to its own author.
 *
 *   An assessor does. The one job no code can carry is handing one person the whole pool.
 *   Firestore's rules can read a query's limit, its offset and its ordering, and nothing about
 *   a filter, so no rule can permit "list the assessments matching the code I typed". The only
 *   list rules available are an identity test or one that permits everybody, and permitting
 *   everybody publishes every department's draft to anybody who reads the page source. Delete
 *   is worse: it is the one destroying right in the tool, and a self-declared admin empties
 *   the store.
 *
 * So this module is a switch and not a deletion. Both paths stay compiled, typechecked and
 * covered, because commented-out code is neither, and code that is not typechecked has been
 * abandoned and not kept. EARB_ACCESS at build time picks which one answers.
 */
import { currentUser, isConfigured, knownRole, type Role } from './firebase';

declare const __EARB_ACCESS__: string;
declare const __EARB_DEMO__: boolean;

/**
 * Whether this build is for showing the tool to a room.
 *
 * It asks nobody to sign in and reads an invented pool, never the store. It exists because a
 * Google account is nobody's work account at TBS, so the audience cannot use the real door, and
 * registering the application in the departmental directory goes through IMTD.
 *
 * The one thing it must never be is the published assessor page. A test refuses that.
 */
export function isDemo(): boolean {
  return typeof __EARB_DEMO__ === 'boolean' ? __EARB_DEMO__ : false;
}
declare const __EARB_SIDE__: string;

export type AccessMode = 'accounts' | 'code';

const MODE: AccessMode = __EARB_ACCESS__ === 'code' ? 'code' : 'accounts';

export function mode(): AccessMode { return MODE; }

/**
 * The side this page opens on when nothing else has said otherwise.
 *
 * A published assessor page opens on the assessor side, because that is the product at that
 * address. It is not derived from the access mode: a build can carry both sides, and the one
 * every test drives does.
 */
const SIDE: 'submit' | 'assess' =
  typeof __EARB_SIDE__ === 'string' && __EARB_SIDE__ === 'assess' ? 'assess' : 'submit';

export function opensOn(): 'submit' | 'assess' { return SIDE; }

/** Whether this build asks people to sign in. The screens that offer it read this, and not the store. */
export function hasAccounts(): boolean { return MODE === 'accounts' && isConfigured(); }

/**
 * The name to put against work this person does.
 *
 * With accounts it is the address the provider gave, which is checked. With codes it is what
 * somebody typed, which is not, and every screen that shows it says so. Nothing in this
 * process depends on the name being true: an audit entry needs a reason, a time and a name
 * useful enough to ask a question of, and the tool already stamps every one of them unverified.
 */
let typed = '';

export function setTypedName(name: string): void { typed = name.trim(); }

export function displayName(): string {
  if (MODE === 'accounts') return currentUser()?.email ?? '';
  return typed;
}

/** Whether the name on screen has been checked by anybody. False on the code route, always. */
export function nameIsChecked(): boolean { return MODE === 'accounts' && !!currentUser(); }

/** Whether somebody is identified at all, by whichever route this build uses. */
export function identified(): boolean {
  return MODE === 'accounts' ? !!currentUser() : typed.length > 0;
}

/**
 * Whether this person may ask the store for every assessment.
 *
 * The answer is the whole reason accounts survive on the assessor side. On the code route
 * nobody may list, and an assessor reaches one submission at a time by its code.
 */
export function canList(): boolean {
  if (MODE !== 'accounts') return false;
  const role: Role | null = knownRole();
  return role === 'assessor' || role === 'admin';
}

/** What this build calls the way in, for copy that has to name it. */
export function wayIn(): string {
  return MODE === 'accounts' ? 'signing in' : 'a share code';
}
