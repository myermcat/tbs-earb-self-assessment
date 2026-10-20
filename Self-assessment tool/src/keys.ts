/**
 * Every name this tool uses in the browser's storage, made in one place.
 *
 * Reported as: when I open your demo link it opens a popup window each time, "This assessment is
 * no longer in the shared store", and "4 from the pool" against "6 submissions open".
 *
 * All three published pages are one origin, so they are one localStorage. The demonstration page
 * was reading the submitter's draft, the assessor's saved session, the signer's real name and
 * work address, and whichever question set was active, and it was writing over all of them: its
 * four invented submissions went into the real assessor's session, and activating a set on it
 * cleared the real draft. A page that says nothing it holds is real was quietly editing
 * somebody's afternoon.
 *
 * So a demonstration build gets its own namespace. The real pages compile with the name
 * unchanged, byte for byte, which is the point: namespacing every page would take the draft away
 * from every submitter with work in progress on the next publish, silently, with the old value
 * still sitting in their browser.
 *
 * THIS MODULE IMPORTS NOTHING, and it has to stay that way. who.ts reads __EARB_ACCESS__ at
 * module level with no guard, and src/storage.ts is inside the bundle test:logic builds with no
 * --define at all, so importing who.ts here would take that suite down with a ReferenceError.
 */
declare const __EARB_DEMO__: boolean;

/**
 * Whether this build is for showing the tool to a room.
 *
 * Read into a constant, and the constant is what the namespace below tests. Going through a
 * function call left esbuild unable to fold the ternary, so a correct demonstration build still
 * carried the real namespace as a dead string and the gate that reads the built page could not
 * tell it from a mistake. The typeof guard is for the bundle named above, which is built with
 * no defines at all.
 */
const DEMO = typeof __EARB_DEMO__ === 'boolean' && __EARB_DEMO__;

export function isDemoBuild(): boolean { return DEMO; }

/**
 * Which product this build is, read here as well as in who.ts, for the namespace below.
 *
 * Read with the same typeof guard and into the same kind of constant as DEMO above, so esbuild
 * folds the ternary to one literal and the gate that reads the built page can tell a correct
 * build from a mistake. This module still imports nothing.
 */
declare const __EARB_SIDE__: string;
const ASSESS = typeof __EARB_SIDE__ === 'string' && __EARB_SIDE__ === 'assess';

/**
 * Both namespaces are written out whole rather than built from a shared stem, so that a
 * demonstration build folds to one literal and the gate can read the answer off the built page.
 * A gate that only watches what booting the page touches goes green on a key added to a path
 * nobody walked, and four of the names below sit on such paths.
 */
/**
 * THREE PAGES, THREE NAMESPACES, ONE ORIGIN.
 *
 * Asked for in these words, after the assessor's page emptied a submission: but they shouldn't
 * affect each other at all. One address is one localStorage, so the browser will not separate
 * them and a prefix is the only thing that will. The demonstration page has had its own since
 * September, for the same reason in a louder costume: it was writing over the real draft, the
 * real session and the active question set.
 *
 * THE SUBMITTER'S NAME DOES NOT CHANGE, BYTE FOR BYTE. Every draft in progress in anybody's
 * browser is under that name, and renaming it would take all of them away at the next publish,
 * silently, with the old value still sitting there. So the assessor's page is the one that
 * moves, and migrateInto() carries what is the assessor's across on its first open.
 *
 * What stops being shared, and it is the whole point: the active question set. Until now the
 * submitter's page served whichever set was last activated on the assessor's picker in the same
 * browser. That only ever happened on a machine running both pages, which is ours. A real
 * submitter has one page.
 */
/**
 * The test is written out again here rather than read from ASSESS above, and it has to be.
 * Through the constant, esbuild emitted `var a = !1, ns = a ? "gc-arch-assessor:" : "gc-arch-
 * assessment:"` into the submitter's page: both names alive, the ternary unfolded, and a gate
 * reading the built page unable to tell a correct build from a mistake. That is the same
 * failure the comment above DEMO describes, which is why both namespaces there are written out
 * whole. With the define in the expression it folds to one literal.
 */
const NAMESPACE = DEMO ? 'gc-arch-assessment:demo:'
  : typeof __EARB_SIDE__ === 'string' && __EARB_SIDE__ === 'assess' ? 'gc-arch-assessor:'
  : 'gc-arch-assessment:';

/** The one way to name anything in browser storage. */
export function storeKey(name: string): string { return NAMESPACE + name; }

/**
 * What belongs to the assessor and travels with them to the new name, once.
 *
 * Without this the page would open signed out, with no imported question set and no audit in
 * progress, and the honest description of that is losing somebody's work to a rename. The
 * session is the loud one: she would be signed out of a page she was signed in to five minutes
 * before, by a publish she did not do.
 *
 * It copies and never deletes, because the old names are in the submitter's namespace and this
 * page does not write there. That is the rule the whole change exists to enforce.
 */
const CARRIED = ['firebase-session', 'signin-email', 'audit-session',
  'rubric-library', 'rubric-current', 'rubric-hidden', 'lang'];

/**
 * And one of them is in sessionStorage: a redirect sign-in that left this tab for the provider
 * and is on its way back. Per tab on purpose, so closing the tab abandons it. Somebody whose
 * page is published while they are at Google would otherwise come back to a tab that has
 * forgotten what it asked for.
 */
const CARRIED_FOR_THIS_TAB = ['firebase-signin'];

/**
 * Run here, at the bottom of the module that imports nothing, and not from main.ts.
 *
 * This file evaluates before every module that reads storage, so the keys are in place before
 * anything asks a question of them. From main.ts it would be a race with whatever a module
 * body does on the way in, and the one that matters is the session: currentUser() reads it
 * lazily today, so main.ts would be early enough today, and the first module-level read
 * somebody adds would make the assessor's page flash a sign-in screen at somebody who is
 * signed in. Named by the session working on that page tonight, before it happened.
 */
function carryOverOnce(): void {
  if (!ASSESS || DEMO) return;
  try {
    // Only into an empty place, in both stores. A second run must never put an old session
    // back over a newer one, and this runs on every open.
    for (const name of CARRIED) {
      const to = NAMESPACE + name;
      if (localStorage.getItem(to) !== null) continue;
      const had = localStorage.getItem(`gc-arch-assessment:${name}`);
      if (had !== null) localStorage.setItem(to, had);
    }
    for (const name of CARRIED_FOR_THIS_TAB) {
      const to = NAMESPACE + name;
      if (sessionStorage.getItem(to) !== null) continue;
      const had = sessionStorage.getItem(`gc-arch-assessment:${name}`);
      if (had !== null) sessionStorage.setItem(to, had);
    }
  } catch {
    /* storage disabled. The page still works and asks who you are. */
  }
}

carryOverOnce();

/**
 * What a demonstration build writes as the version that made a record.
 *
 * It lives here because three modules need it and none of them should import another: the
 * invented pool stamps it, whatever a demonstration build creates stamps it, and the assessor's
 * list refuses anything carrying it. Without the last of those, a file saved off the
 * demonstration page and emailed to an assessor arrives looking exactly like a real submission.
 */
export const DEMO_MARK = 'demonstration';
