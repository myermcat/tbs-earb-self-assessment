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
 * Both namespaces are written out whole rather than built from a shared stem, so that a
 * demonstration build folds to one literal and the gate can read the answer off the built page.
 * A gate that only watches what booting the page touches goes green on a key added to a path
 * nobody walked, and four of the names below sit on such paths.
 */
const NAMESPACE = DEMO ? 'gc-arch-assessment:demo:' : 'gc-arch-assessment:';

/** The one way to name anything in browser storage. */
export function storeKey(name: string): string { return NAMESPACE + name; }

/**
 * What a demonstration build writes as the version that made a record.
 *
 * It lives here because three modules need it and none of them should import another: the
 * invented pool stamps it, whatever a demonstration build creates stamps it, and the assessor's
 * list refuses anything carrying it. Without the last of those, a file saved off the
 * demonstration page and emailed to an assessor arrives looking exactly like a real submission.
 */
export const DEMO_MARK = 'demonstration';
