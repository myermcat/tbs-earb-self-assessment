import type { Assessment } from './types';

/**
 * Cloud Firestore and Firebase Authentication, over their REST APIs.
 *
 * There is no SDK here and no script tag. The page inlines everything it runs and carries
 * `default-src 'none'`, so a library that pulls its own pieces off a CDN would need the policy
 * opened to hosts the security story does not name. Three Google origins reached with `fetch`
 * is the whole dependency, and the policy can list them by name.
 *
 * The project is a build input, the same way the endpoint in src/store.ts is:
 *
 *   EARB_FIREBASE='{"apiKey":"...","projectId":"..."}' npm run build
 *
 * That one value sets this config and the page's `connect-src` together. With nothing set,
 * `isConfigured()` is false, every call below refuses before it reaches the network, and the
 * page keeps `connect-src 'none'`, so it cannot make a request at all.
 *
 * deploy/firestore.rules is the other half. It goes in the project's Rules tab, and from then
 * on Google decides who may read and write each document. There is no program of ours in the
 * middle, which is what makes "read your own and nobody else's" enforceable.
 */
declare const __EARB_FIREBASE__: string;

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';
const SECURE_TOKEN = 'https://securetoken.googleapis.com/v1';
const FIRESTORE = 'https://firestore.googleapis.com/v1';

export interface FirebaseConfig {
  apiKey: string;
  projectId: string;
  /**
   * Addresses this build treats as admin when the store has no role document for them.
   *
   * The rules are what actually enforce admin, on Google's side, reading roles/{email}. This
   * list only changes what the page offers, so somebody who edits the JavaScript to name
   * themselves still gets refused on every call that matters. What it buys is a store whose
   * roles collection has been emptied, or a fresh project, without locking the owner out of
   * the screen that would let them fix it.
   *
   * It lives in deploy/firebase-config.json, which is not in git, because it names a person.
   */
  admins?: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function readConfig(): FirebaseConfig | null {
  const raw = typeof __EARB_FIREBASE__ === 'string' ? __EARB_FIREBASE__ : '';
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const apiKey = text(parsed.apiKey);
    const projectId = text(parsed.projectId);
    return apiKey && projectId ? { apiKey, projectId } : null;
  } catch {
    // build.mjs refuses a config it cannot parse, so getting here means the define was edited
    // by hand in a built file. Behaving as an unconfigured build beats throwing on load and
    // leaving somebody with a blank page.
    return null;
  }
}

const CONFIG = readConfig();

export function isConfigured(): boolean { return CONFIG !== null; }

/** Where the records are, for a page that has to say so. */
export function storeHost(): string { return 'firestore.googleapis.com'; }

function config(): FirebaseConfig {
  if (!CONFIG) throw new Error('This build has no Firebase project, so there is nothing to sign in to.');
  return CONFIG;
}

/* ------------------------------------------------------------------------------------------
   The wire form of a value.

   Firestore wraps every field: a string arrives as { stringValue }, a number as either
   { integerValue } or { doubleValue }, an absent value as { nullValue }. Nesting is the same
   idea repeated, so a map holds fields holding values holding fields.

   Two directions and two levels of trust. What this module produces is typed, because it is
   built here. What arrives is `unknown` until each key has been checked, because a document
   can be written by an admin in the console, by an older build, or by a future one.
   ------------------------------------------------------------------------------------------ */

export interface FirestoreValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  /** A string carries NaN and the infinities, which is how proto3 writes them in JSON. */
  doubleValue?: number | string;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude: number; longitude: number };
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

function numberValue(n: number): FirestoreValue {
  if (Number.isNaN(n)) return { doubleValue: 'NaN' };
  if (n === Infinity) return { doubleValue: 'Infinity' };
  if (n === -Infinity) return { doubleValue: '-Infinity' };
  // integerValue is an int64 carried as a string, so a whole number past 2^53 would be written
  // in exponent form and refused. Anything that large goes as a double and keeps its value to
  // the precision JavaScript held it at anyway.
  if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) return { integerValue: String(n) };
  return { doubleValue: n };
}

function arrayElement(x: unknown): FirestoreValue {
  if (Array.isArray(x)) {
    // Firestore refuses this, and the 400 it answers with names neither the field nor the
    // document. Nothing in an assessment nests arrays; a shape change that does should fail
    // where it can be read.
    throw new Error('Firestore stores no array inside an array, and one was about to be written.');
  }
  // A hole in an array has no wire form, and JSON.stringify writes null for one, so a file
  // saved and a document written agree.
  if (x === undefined) return { nullValue: null };
  return toValue(x);
}

export function toValue(x: unknown): FirestoreValue {
  if (x === null) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'number') return numberValue(x);
  if (Array.isArray(x)) return { arrayValue: { values: x.map(arrayElement) } };
  if (isRecord(x)) return { mapValue: { fields: toFields(x) } };
  throw new Error(`An assessment cannot hold a ${typeof x}, and one was about to be written.`);
}

export function toFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const out: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(data)) {
    // Firestore has no undefined. An optional field left unset is absent, which is how
    // JSON.stringify treats it too, so the file and the document hold the same thing.
    if (value === undefined) continue;
    out[key] = toValue(value);
  }
  return out;
}

export function fromValue(v: unknown): unknown {
  if (!isRecord(v)) return null;
  if ('nullValue' in v) return null;
  if (typeof v.booleanValue === 'boolean') return v.booleanValue;
  if (typeof v.stringValue === 'string') return v.stringValue;
  if (typeof v.integerValue === 'string' || typeof v.integerValue === 'number') return Number(v.integerValue);
  if (typeof v.doubleValue === 'number') return v.doubleValue;
  if (typeof v.doubleValue === 'string') return Number(v.doubleValue);
  // An assessment keeps its own times as ISO strings, so a timestamp reads back as the string
  // it was written as and the scoring code never has to know which form it came in.
  if (typeof v.timestampValue === 'string') return v.timestampValue;
  if (typeof v.bytesValue === 'string') return v.bytesValue;
  if (typeof v.referenceValue === 'string') return v.referenceValue;
  if (isRecord(v.geoPointValue)) {
    const g = v.geoPointValue;
    return {
      latitude: typeof g.latitude === 'number' ? g.latitude : 0,
      longitude: typeof g.longitude === 'number' ? g.longitude : 0,
    };
  }
  // An empty array and an empty map arrive with no `values` and no `fields` at all, so both
  // have to survive as an empty array and an empty object. Reading them as null was the first
  // bug this mapping had.
  if (isRecord(v.arrayValue)) {
    const values = v.arrayValue.values;
    return Array.isArray(values) ? values.map(fromValue) : [];
  }
  if (isRecord(v.mapValue)) return fromFields(v.mapValue.fields);
  // A form the API adds later reads as absent, so one unfamiliar field cannot throw away the
  // record it appeared in.
  return null;
}

export function fromFields(fields: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isRecord(fields)) return out;
  for (const [key, value] of Object.entries(fields)) out[key] = fromValue(value);
  return out;
}

/* ------------------------------------------------------------------------------------------
   Requests.
   ------------------------------------------------------------------------------------------ */

interface Reply { status: number; body: unknown }

async function call(url: string, init: RequestInit): Promise<Reply> {
  const res = await fetch(url, init);
  // The body is read as text first. A failure is not always JSON, and res.json() throwing on
  // an HTML error page hides the status code that would have explained the failure.
  const raw = await res.text();
  let body: unknown = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = raw; }
  }
  return { status: res.status, body };
}

/**
 * What went wrong, in something a person can read.
 *
 * Google answers with `{ error: { message } }` and the message is a code in capitals, so the
 * status goes alongside it: INVALID_IDP_RESPONSE with a 400 beside it at least tells whoever
 * is looking whether the request or the account was refused.
 */
function problemFrom(reply: Reply): string {
  const b = reply.body;
  if (isRecord(b) && isRecord(b.error) && typeof b.error.message === 'string') {
    return `${b.error.message} (${reply.status})`;
  }
  return `the store answered ${reply.status}`;
}

function postJson(url: string, payload: unknown): Promise<Reply> {
  return call(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
}

/* ------------------------------------------------------------------------------------------
   Sign-in.

   The redirect flow, which is the one a page with this policy can use. A popup needs a second
   window talking back to this one; a redirect is a plain navigation, and navigation is not
   what connect-src governs.

   Three steps: accounts:createAuthUri says where to send the person, the provider sends them
   back here with an answer in the address, and accounts:signInWithIdp turns that answer into a
   token. The sessionId from the first step has to come back with the third, which is the only
   reason anything is held between them.
   ------------------------------------------------------------------------------------------ */

export type Provider = 'google.com' | 'microsoft.com';
export interface CurrentUser { email: string; idToken: string }

const SESSION_KEY = 'gc-arch-assessment:firebase-session';
const PENDING_KEY = 'gc-arch-assessment:firebase-signin';

/** A token is good for an hour. The minute of margin is for a clock that runs slow. */
const CLOCK_MARGIN_MS = 60_000;

interface Session {
  email: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * The token is kept where the browser already keeps the draft, so reloading the page does not
 * ask somebody to sign in again halfway through 176 questions. It expires on its own after an
 * hour whatever happens to it here.
 */
function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s: unknown = JSON.parse(raw);
    if (!isRecord(s)) return null;
    const email = text(s.email);
    const idToken = text(s.idToken);
    if (!email || !idToken) return null;
    return {
      email,
      idToken,
      refreshToken: text(s.refreshToken),
      expiresAt: typeof s.expiresAt === 'number' ? s.expiresAt : 0,
    };
  } catch {
    return null;
  }
}

function writeSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* a private window. The session holds for this page load. */
  }
}

function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* nothing to remove from */ }
}

/**
 * Who is signed in, or nobody.
 *
 * A build with no project answers nobody whatever the browser is holding. Somebody who signed
 * in on a configured build and is then handed one without a project has a token for a place
 * this page cannot reach, and reporting them as signed in would offer them a store that is
 * not there.
 */
export function currentUser(): CurrentUser | null {
  if (!CONFIG) return null;
  const s = readSession();
  if (!s) return null;
  /**
   * A session whose token has run out and which has no refresh token is nobody.
   *
   * This used to answer with whatever was in storage, so a page could believe somebody was
   * signed in while every request they made came back refused. Where a refresh token exists
   * there is still a way back and freshToken() takes it, so that case stays signed in.
   */
  if (Date.now() >= s.expiresAt && !s.refreshToken) return null;
  return { email: s.email, idToken: s.idToken };
}

/**
 * Forgetting the token is what sign-out means here. Identity Toolkit has no call that cancels
 * an ID token already issued: it stops working an hour after it was made, and dropping the
 * refresh token is what stops a new one being had.
 */
export function signOut(): void {
  clearSession();
  clearPending();
}

let signInProblem = '';

/** The last sign-in failure, for the screen that offers to try again. */
export function lastSignInProblem(): string { return signInProblem; }

interface Pending { providerId: string; sessionId: string }

function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p: unknown = JSON.parse(raw);
    if (!isRecord(p)) return null;
    return { providerId: text(p.providerId), sessionId: text(p.sessionId) };
  } catch {
    return null;
  }
}

function clearPending(): void {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* nothing to remove from */ }
}

/**
 * The address the provider returns to, which is this page without its query or its fragment.
 *
 * It has to be on the project's authorised domains list, and a page opened from a USB stick has
 * no address at all, so that case is refused with a reason somebody can act on.
 */
function returnAddress(): string {
  if (!/^https?:$/.test(window.location.protocol)) {
    throw new Error(
      'Signing in needs this page served over http or https. Opened from a file, there is no address for the provider to return to.',
    );
  }
  return `${window.location.origin}${window.location.pathname}`;
}

/** Whether this page load is a provider answering, in the query or in the fragment. */
function answerInAddress(): boolean {
  return [window.location.search, window.location.hash].some((part) => {
    const q = new URLSearchParams(part.replace(/^[?#]/, ''));
    return q.has('code') || q.has('id_token') || q.has('access_token') || q.has('error');
  });
}

/**
 * The provider's answer carries a credential, and an address bar goes into history, into a
 * bookmark and into anything somebody pastes into a ticket. So it is taken out of the address
 * as soon as it has been exchanged.
 */
function scrubAddress(): void {
  try {
    window.history.replaceState(null, '', `${window.location.origin}${window.location.pathname}`);
  } catch {
    /* no history API. The credential is spent either way. */
  }
}

async function startSignIn(providerId: Provider): Promise<void> {
  const cfg = config();
  const continueUri = returnAddress();
  const reply = await postJson(
    `${IDENTITY}/accounts:createAuthUri?key=${encodeURIComponent(cfg.apiKey)}`,
    { providerId, continueUri, authFlowType: 'CODE_FLOW' },
  );
  if (reply.status !== 200 || !isRecord(reply.body)) throw new Error(problemFrom(reply));

  const authUri = text(reply.body.authUri);
  if (!authUri) throw new Error('The sign-in service gave no address to send you to.');

  // The sessionId has to come back with the provider's answer. It is held per tab, because a
  // redirect returns to the tab it left from, so closing the tab abandons the attempt and
  // leaves nothing behind.
  try {
    const pending: Pending = { providerId, sessionId: text(reply.body.sessionId) };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    throw new Error('This browser is keeping nothing for this tab, so a sign-in cannot be finished.');
  }

  window.location.assign(authUri);
}

/**
 * Whether a sign-in can even be attempted from here.
 *
 * A page opened from a file has no address a provider can return to, so there is nothing to
 * register and nothing to come back. The button used to be offered anyway, and pressing it
 * threw into a promise nobody was reading, so it did nothing at all and said nothing at all.
 * Asking first means the screen can explain rather than the button can fail.
 */
export function canSignIn(): boolean {
  if (!CONFIG || typeof window === 'undefined') return false;
  return /^https?:$/.test(window.location.protocol);
}

/** Where this page was loaded from, for a screen that has to say why sign-in is unavailable. */
export function pageAddress(): string {
  try {
    return window.location.href;
  } catch {
    return '';
  }
}

/**
 * Start a sign-in, and never reject.
 *
 * Every caller was `void signInWithGoogle()`, so a refusal from the provider, a blocked
 * request or a page opened from a file all produced silence. The answer is whether the
 * browser is on its way somewhere; when it is false the reason is in lastSignInProblem() and
 * the caller repaints to show it.
 */
async function attempt(providerId: Provider): Promise<boolean> {
  signInProblem = '';
  try {
    await startSignIn(providerId);
    return true;
  } catch (err) {
    signInProblem = (err as Error).message;
    return false;
  }
}

export function signInWithGoogle(): Promise<boolean> { return attempt('google.com'); }
export function signInWithMicrosoft(): Promise<boolean> { return attempt('microsoft.com'); }

/**
 * The last step of a redirect sign-in, which belongs in the boot sequence because the page
 * that has to finish it is a fresh load of this one.
 *
 * The answer is whether this page load was a sign-in coming back, so a caller knows to
 * repaint. Whether it worked is in `currentUser()`, and why it did not is in
 * `lastSignInProblem()`. Nothing throws: this runs before the first paint, and an exception
 * there would take the whole page with it.
 */
export async function resumeSignIn(): Promise<boolean> {
  if (!CONFIG || typeof window === 'undefined') return false;
  const pending = readPending();
  if (!pending || !answerInAddress()) return false;

  clearPending();
  const requestUri = window.location.href;
  try {
    const reply = await postJson(
      `${IDENTITY}/accounts:signInWithIdp?key=${encodeURIComponent(CONFIG.apiKey)}`,
      { requestUri, sessionId: pending.sessionId, returnSecureToken: true },
    );
    scrubAddress();
    if (reply.status !== 200 || !isRecord(reply.body)) {
      signInProblem = `Signing in with ${pending.providerId} did not go through: ${problemFrom(reply)}`;
      return true;
    }
    const email = text(reply.body.email);
    const idToken = text(reply.body.idToken);
    if (!email || !idToken) {
      signInProblem = 'The sign-in service returned no address and no token for this account.';
      return true;
    }
    const seconds = Number(text(reply.body.expiresIn)) || 3600;
    writeSession({
      email,
      idToken,
      refreshToken: text(reply.body.refreshToken),
      expiresAt: Date.now() + seconds * 1000,
    });
    signInProblem = '';
    return true;
  } catch (err) {
    scrubAddress();
    signInProblem = `Signing in with ${pending.providerId} did not go through: ${(err as Error).message}`;
    return true;
  }
}

/**
 * A token this request can use, refreshing it first if it has run out.
 *
 * The exchange goes to securetoken.googleapis.com, which is the third host in the policy and
 * the reason there are three. Identity Toolkit has no endpoint for it, and without a refresh a
 * person filling in an assessment is signed out after an hour with a write in their hand.
 */
export async function freshToken(): Promise<string | null> {
  if (!CONFIG) return null;
  const s = readSession();
  if (!s) return null;
  if (Date.now() < s.expiresAt - CLOCK_MARGIN_MS) return s.idToken;
  if (!s.refreshToken) { clearSession(); return null; }

  const reply = await call(`${SECURE_TOKEN}/token?key=${encodeURIComponent(config().apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken }).toString(),
  });
  if (reply.status !== 200 || !isRecord(reply.body)) {
    // A refresh token is refused when it has been revoked or the account has been turned off.
    // Both mean the same thing from here: this browser has to sign in again.
    clearSession();
    return null;
  }
  // This endpoint answers in snake_case, which the rest of the API does not.
  const idToken = text(reply.body.id_token);
  if (!idToken) { clearSession(); return null; }
  const seconds = Number(text(reply.body.expires_in)) || 3600;
  const next: Session = {
    email: s.email,
    idToken,
    refreshToken: text(reply.body.refresh_token) || s.refreshToken,
    expiresAt: Date.now() + seconds * 1000,
  };
  writeSession(next);
  return idToken;
}

/* ------------------------------------------------------------------------------------------
   Documents.
   ------------------------------------------------------------------------------------------ */

/** One request per page, and 300 records is more than the whole programme will hold for years. */
const PAGE_SIZE = 300;
/** A page token that keeps coming back would loop for as long as the tab is open. */
const PAGE_CAP = 20;

function docsRoot(): string {
  return `${FIRESTORE}/projects/${encodeURIComponent(config().projectId)}/databases/(default)/documents`;
}

async function authorized(url: string, init: RequestInit = {}): Promise<Reply> {
  const token = await freshToken();
  if (!token) throw new Error('Sign in before reading or writing the shared store.');
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return call(url, { ...init, headers });
}

/**
 * The same request, with the token only if there is one.
 *
 * Two paths in this file are granted by the rules on the document's name rather than on who is
 * asking: reading an assessment somebody sent you the code for, and saving one back. Demanding
 * a session before the request goes is the client refusing what the store would allow, and it
 * is what made an access code mean nothing for anybody without an account.
 *
 * The token still goes when there is one, because an owner or an assessor is granted more by
 * the rules than a code holder is, and the same request should get them everything they have.
 */
async function withCodeOrAccount(url: string, init: RequestInit = {}): Promise<Reply> {
  const token = await freshToken();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return call(url, { ...init, headers });
}

/**
 * The alphabet an access code is drawn from.
 *
 * Thirty-two characters with I, O, 0 and 1 removed, so nothing in a code can be misread on a
 * call or mistyped from a sticky note. It is the same alphabet the four-character reference
 * uses, for the same reason.
 */
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** How long an access code is, and how it is grouped when a person has to read it. */
export const CODE_LENGTH = 12;
export const CODE_GROUP = 4;

/**
 * A name for a record going online for the first time, which is also its access code.
 *
 * One value doing both jobs, deliberately. The id is the document's path, so knowing it is
 * what lets somebody fetch that one record and nothing else, which is exactly what an access
 * code has to mean. A separate code would need a lookup table and two things to keep in step.
 *
 * Twelve characters from a 32-symbol alphabet is 2^60. At a billion guesses a second that is
 * thirty-six years, and at 50,000 assessments the chance any two codes collide is about one in
 * a billion. It was twenty characters from a 62-symbol alphabet, which is stronger and
 * unreadable: a person has to carry this one over Teams, read it down a phone and type it back.
 *
 * The name has to be known before the write, so the browser's own copy can be matched to it
 * afterwards. Letting Firestore choose would cost a second request to find out what it chose.
 */
export function newDocId(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

/** The code as a person reads it: three groups of four. */
export function formatCode(code: string): string {
  /**
   * A name this tool would not mint is shown as it is, and never tidied into something else.
   *
   * Records made before 14 September carry a twenty-character mixed-case id, from back when
   * the document name was a name and not a thing a person reads down a phone. Putting one
   * through the tidier uppercased it, dropped every character the current alphabet excludes
   * and cut what was left to twelve, so the screen showed a code that opened nothing and the
   * submitter copied it in good faith. Showing the real one is the least this can do.
   */
  if (!isCode(code)) return code;
  const clean = tidyCode(code);
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += CODE_GROUP) groups.push(clean.slice(i, i + CODE_GROUP));
  return groups.join('-');
}

/**
 * A typed or pasted code, reduced to what it means.
 *
 * People paste with the dashes, without them, with a stray space from a chat client, and in
 * lower case because a phone keyboard did it for them. All of those are the same code.
 */
export function tidyCode(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => ID_ALPHABET.includes(c)).join('').slice(0, CODE_LENGTH);
}

/**
 * The characters somebody offered that a code can never contain.
 *
 * I, O, 0 and 1 are not in the alphabet, so a code holds none of them and one that arrives is
 * a misreading: an O read off a screen and typed as a zero, or the other way about. Dropping
 * them quietly and reporting the field incomplete was the tool's own answer for a while, and
 * it told somebody with twelve characters typed that they had not finished, which is the
 * least useful true thing it could have said.
 *
 * Case and punctuation are not strays. A pasted code arrives lower case, with dashes, and
 * sometimes with a space a chat client added, and all of that is the same code.
 */
export function strayInCode(raw: string): string[] {
  const seen = [...raw.toUpperCase()]
    .filter((c) => /[A-Z0-9]/.test(c) && !ID_ALPHABET.includes(c));
  return [...new Set(seen)];
}

/** The characters a code is made of, for a screen that has to say what is allowed. */
export const CODE_ALPHABET = ID_ALPHABET;

/**
 * Whether this record is named in a way this tool can still hand to a person.
 *
 * True for every record made before the code became readable. The document is in the store
 * under that name and nothing is wrong with it; what cannot be done is telling somebody the
 * name over Teams, which is the whole purpose the name now serves.
 */
export function needsANewCode(id: string | undefined): boolean {
  return !!id && !isCode(id);
}

/**
 * Whether this string, exactly as it stands, is a code this tool would mint.
 *
 * Stricter than `looksLikeCode`, and the difference is the whole of this bug. That one is
 * asked about something a person typed, so it tidies first: it uppercases, drops what the
 * alphabet excludes and keeps the first twelve. Asked about a stored document name, tidying
 * is exactly wrong, because a twenty-character mixed-case name tidies down to twelve
 * characters that are all in the alphabet and answers yes.
 */
export function isCode(raw: string): boolean {
  return raw.length === CODE_LENGTH && [...raw].every((c) => ID_ALPHABET.includes(c));
}

/** Whether this is a complete code. It says nothing about whether a record exists. */
export function looksLikeCode(raw: string): boolean {
  const clean = tidyCode(raw);
  return clean.length === CODE_LENGTH && [...clean].every((c) => ID_ALPHABET.includes(c));
}

function assessmentFrom(doc: unknown): Assessment | null {
  if (!isRecord(doc)) return null;
  const name = text(doc.name);
  const data = fromFields(doc.fields);
  // A collection can hold a document nobody here wrote: a test row from the console, or one
  // from a build with a different format. Skipping it keeps one strange row from emptying the
  // dashboard for everybody.
  if (data.fileType !== 'gc-arch-assessment') return null;
  // Past the file type the shape is taken on trust, which is how main.ts already treats an
  // assessment somebody opens from disk, and for the same reason: the scoring code reads every
  // field through an optional chain and a missing one shows as unanswered.
  //
  // The path is where the id comes from, so a copy of it in the fields can never disagree.
  return { ...data, id: name.slice(name.lastIndexOf('/') + 1) } as unknown as Assessment;
}

/**
 * Every assessment the signed-in person may read.
 *
 * Listing the collection is an assessor's and an admin's right in deploy/firestore.rules, so a
 * submitter's request is refused with a 403 and the message says so. A submitter reads the one
 * record they own by its id, which is what `getAssessment` is for.
 */
export async function listAssessments(): Promise<Assessment[]> {
  const out: Assessment[] = [];
  let token = '';
  for (let page = 0; page < PAGE_CAP; page++) {
    const query = `pageSize=${PAGE_SIZE}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const reply = await authorized(`${docsRoot()}/assessments?${query}`);
    if (reply.status !== 200 || !isRecord(reply.body)) throw new Error(problemFrom(reply));
    const docs = Array.isArray(reply.body.documents) ? reply.body.documents : [];
    for (const doc of docs) {
      const a = assessmentFrom(doc);
      if (a) out.push(a);
    }
    token = text(reply.body.nextPageToken);
    if (!token) break;
  }
  return out;
}

/** One record by its id. Null means there is no such document, which an admin delete produces. */
export async function getAssessment(id: string): Promise<Assessment | null> {
  // The code is the name of the document, and the rules grant a get on the name alone. So this
  // request carries a token when there is one and goes without when there is not.
  const reply = await withCodeOrAccount(`${docsRoot()}/assessments/${encodeURIComponent(id)}`);
  if (reply.status === 404) return null;
  if (reply.status !== 200) throw new Error(problemFrom(reply));
  return assessmentFrom(reply.body);
}

/* ------------------------------------------------------------------------------------------
   Writing only what changed.
   ------------------------------------------------------------------------------------------ */

/**
 * The copy of an assessment the store last had from this browser.
 *
 * It is what a write is compared against, so a save can name the fields it is changing and
 * leave the rest of the document alone. Without it a save is a replacement of everything, and
 * two people working from one code overwrite each other's answers by taking turns pressing a
 * button that says Save.
 *
 * Kept per assessment, because a browser can hold one draft and open somebody else's record by
 * its code in the same session.
 */
const BASE_KEY = 'gc-arch-assessment:online-base';

function readBase(id: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(`${BASE_KEY}:${id}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function keepBase(id: string, doc: Record<string, unknown>): void {
  try {
    localStorage.setItem(`${BASE_KEY}:${id}`, JSON.stringify(doc));
  } catch {
    /* No room, or storage disabled. The next write compares against what the store holds. */
  }
}

/**
 * A field path as Firestore's updateMask spells it.
 *
 * A segment that is not a plain identifier has to be quoted in backticks, and an answer id is
 * `BU-Q1`, which is not: unquoted, the hyphen reads as part of a path expression and the
 * request is refused. A backtick inside a segment is escaped, which no question id has and
 * every question id could.
 */
function fieldPath(...segments: string[]): string {
  return segments
    .map((seg) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(seg) ? seg : `\`${seg.replace(/[\\`]/g, '\\$&')}\``))
    .join('.');
}

/**
 * Which paths differ between what the store has and what is being sent.
 *
 * Answers are compared one at a time, because they are the part two people touch at once and
 * the part a blanking write would take. Everything else is compared whole: the overview, the
 * rubric and the metadata are edited by one person at a time and are small.
 *
 * A path that is present in the mask and absent from the body deletes that field, which is how
 * a deleted answer and a deleted justification leave the store.
 */
export function changedPaths(base: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const paths: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
  for (const key of keys) {
    if (key === 'answers') continue;
    if (!same(base[key], next[key])) paths.push(fieldPath(key));
  }

  const wasAnswers = isRecord(base.answers) ? base.answers : {};
  const nowAnswers = isRecord(next.answers) ? next.answers : {};
  const ids = new Set([...Object.keys(wasAnswers), ...Object.keys(nowAnswers)]);
  for (const id of ids) {
    if (!same(wasAnswers[id], nowAnswers[id])) paths.push(fieldPath('answers', id));
  }
  return paths;
}

/**
 * Write one assessment, and answer with the id it was written under.
 *
 * PATCH with no updateMask replaces the whole document, which is what saving an assessment
 * means here: a justification somebody deleted has to go from the record as well, and a mask
 * would leave the old one behind.
 *
 * WHO MAY DO THIS, which is two different people now.
 *
 * An account creating its own assessment. The rules compare `ownerEmail` against the signed-in
 * address on create, so it is set from the session, and the same comparison here is only so
 * that a refusal names the person rather than arriving as a bare 403.
 *
 * Somebody holding the access code, with no account at all. The code is the document's name,
 * and the rules grant an update on the name as long as the write leaves `ownerEmail` alone.
 * So a co-author's write keeps the owner it found and this function never invents one. That is
 * what makes the sentence the tool prints on four screens true: whoever holds the code can
 * open this assessment and change it.
 *
 * A record with no id has never been in the store, so there is nothing to hold a code for and
 * it takes the create path, which needs an account.
 */
export async function putAssessment(a: Assessment): Promise<string> {
  const me = currentUser();
  // Every assessment has a code from the moment it is created, so the id no longer says whether
  // this is the first time it has been in the store. What says so is whether it has ever been.
  const making = !a.meta?.savedOnlineAt;
  if (making && me) a.ownerEmail = a.ownerEmail ?? me.email;
  const owner = a.ownerEmail ?? me?.email ?? '';
  if (making && me && owner !== me.email) {
    throw new Error(`This assessment belongs to ${owner}, and you are signed in as ${me.email}.`);
  }

  /**
   * The id is written onto the record before the request goes, rather than after it comes
   * back. Two writes started close together would otherwise each mint an id and the one record
   * would become two documents.
   */
  /**
   * A record whose name nobody can type gets a new one, on the next save.
   *
   * The old document stays where it is: deleting it is an admin's right and this page does not
   * have it. It is unreachable, which is what it already was. What changes is that the
   * assessment somebody is working on acquires a name they can be given.
   */
  if (needsANewCode(a.id)) {
    a.meta = { ...a.meta, previousId: a.id };
    a.id = newDocId();
  }
  a.id = a.id ?? newDocId();
  a.ownerEmail = owner || undefined;
  const id = a.id;
  const body: Record<string, unknown> = { ...a };
  if (owner) body.ownerEmail = owner; else delete body.ownerEmail;
  // The id is the document's path. Keeping a second copy of it in the fields gives two answers
  // to one question the first time a record is copied.
  delete body.id;

  /**
   * A save names the fields it is changing, and leaves the rest of the document alone.
   *
   * It used to send the whole document every time, with no mask. That is the shape of the two
   * worst things a code can do: two people working from one code overwrite each other's
   * answers by taking turns pressing Save, and one save from a copy that has been emptied
   * empties the record. Neither is a rule Google could refuse, because both are one write of
   * one document by somebody entitled to write it.
   *
   * The comparison is against what the store last had from this browser. When this browser has
   * no record of that, the document is read first: it costs one read on the first save from a
   * new machine and it is the only way to know what is being left alone. If the read fails the
   * write goes unmasked, because refusing to save somebody's work to protect a field is the
   * wrong trade.
   *
   * A path in the mask with nothing under it in the body deletes that field, which is how a
   * deleted answer and a deleted justification leave the store.
   */
  let mask = '';
  if (!making) {
    let base = readBase(id);
    if (!base) {
      try {
        const had = await withCodeOrAccount(`${docsRoot()}/assessments/${encodeURIComponent(id)}`);
        if (had.status === 200) {
          const doc = assessmentFrom(had.body);
          if (doc) {
            const { id: _drop, ...rest } = doc;
            base = rest as unknown as Record<string, unknown>;
          }
        }
      } catch {
        /* The write is the point. An unmasked one still saves the work. */
      }
    }
    if (base) {
      const paths = changedPaths(base, body);
      // Nothing changed, and a mask with no paths in it is a request Firestore refuses. There
      // is nothing to send, so the record is already what this browser holds.
      if (!paths.length) { keepBase(id, body); return id; }
      mask = paths.map((path) => `updateMask.fieldPaths=${encodeURIComponent(path)}`).join('&');
    }
  }

  const reply = await withCodeOrAccount(
    `${docsRoot()}/assessments/${encodeURIComponent(id)}${mask ? `?${mask}` : ''}`,
    { method: 'PATCH', body: JSON.stringify({ fields: toFields(body) }) },
  );
  if (reply.status !== 200) throw new Error(problemFrom(reply));
  keepBase(id, body);
  return id;
}

/**
 * Remove one record. Admin only, and the rules enforce that.
 *
 * Firestore answers 200 for a document that was already gone, so deleting the same record
 * twice is not a failure anybody needs to hear about.
 */
export async function deleteAssessment(id: string): Promise<void> {
  const reply = await authorized(
    `${docsRoot()}/assessments/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (reply.status !== 200) throw new Error(problemFrom(reply));
}

export type Role = 'submitter' | 'assessor' | 'admin';

/**
 * What this person may do, from roles/{email}.
 *
 * The rules let somebody read their own roles document and nobody else's, so this answers for
 * the signed-in address and a 403 for any other one. No document means no grant has been made,
 * and everybody starts there.
 */
/** What this build assumes about an address the store has no role document for. */
function defaultRole(email: string): Role {
  const list = CONFIG?.admins ?? [];
  return list.some((a) => a.trim().toLowerCase() === email.trim().toLowerCase())
    ? 'admin'
    : 'submitter';
}

export async function roleOf(email: string): Promise<Role> {
  const reply = await authorized(`${docsRoot()}/roles/${encodeURIComponent(email)}`);
  if (reply.status === 404) return defaultRole(email);
  if (reply.status !== 200) throw new Error(problemFrom(reply));
  const role = fromFields(isRecord(reply.body) ? reply.body.fields : null).role;
  return role === 'assessor' || role === 'admin' ? role : defaultRole(email);
}

/**
 * The signed-in person's role, asked once and remembered.
 *
 * Nothing used to call roleOf at all, so every signed-in account was offered the admin screen
 * and the delete button, and Firestore did the refusing afterwards. Offering somebody a control
 * that cannot work is its own defect, so the answer is fetched and the screens read it.
 */
let myRoleValue: Role | null = null;
let roleAsked = false;

export function knownRole(): Role | null { return myRoleValue; }
export function forgetRole(): void { myRoleValue = null; roleAsked = false; }

export async function loadRole(): Promise<Role | null> {
  const me = currentUser();
  if (!me) { forgetRole(); return null; }
  if (roleAsked) return myRoleValue;
  roleAsked = true;
  try {
    myRoleValue = await roleOf(me.email);
  } catch {
    // A refused read means the rules do not know this address, which is what a submitter is.
    // The build's own list still applies, so an owner is not locked out of a wiped project.
    myRoleValue = defaultRole(me.email);
  }
  return myRoleValue;
}
