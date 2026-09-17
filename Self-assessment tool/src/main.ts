import type { Assessment, Rubric } from './types';
import { el, clear } from './dom';
import { ICON_DOWN, ICON_MAIL, ICON_PRINT, ICON_SHARE } from './icons';
import { codeField } from './code-field';
import { guardDraft } from './guard';
import { validate } from './rubric';
import { completion } from './scoring';
import { goToFirstGap, overviewFieldProgress, renderSubmit, resetOverviewToFirstGap, setRepaint,
  setSaveOnline, setStopKey, showMarkingStep, takeSubmitTabs, currentStopKey } from './views-submit';
import { handOff, renderResults } from './views-results';
import { forgetPool, openedThisSession, renderReview, setAuditor } from './views-review';
import { renderDashboard } from './views-dashboard';
import { addToLibrary, canRemove, currentId, currentRubric, libraryList, removeFromLibrary,
  setCurrentId } from './library';
import { closeMenusOnOutsideClick, closeOnOutsideClick, confirmStep, openDialog } from './confirm';
import { saveBadge } from './save-badge';
import { SAD_CAT } from './cat';
import { openShareDialog } from './views-share';
import { hasAccounts, mode as accessMode } from './who';
import { rememberSigner, signerFields, signerProblem } from './signer';
import { showNewCode } from './views-share';
import { bootLang, coverage, lang, type Lang, setLang } from './i18n';
import { endpointHost, goneFromStore, isHosted, listRecords, putRecord,
  saveOnlineNow, savedOnline, showWhereItStands } from './store';
import { canSignIn, currentUser, formatCode, forgetRole, getAssessment, looksLikeCode, pageAddress, tidyCode, isConfigured as firebaseConfigured, knownRole, lastSignInProblem,
  loadRole, resumeSignIn, signInWithGoogle, signOut } from './firebase';
import { t } from './i18n';
import { answeredCount, APP_VERSION, autosave, blankAssessment, clearDraft, download, ensureRef,
  hasWork, loadDraft, readJsonFiles, saveAssessmentFile, slug } from './storage';
import { bannerFor, evidenceNote } from './marking';
import BUILTIN from '../rubric/rubric.v1-dan.json';

type Mode = 'home' | 'submit' | 'results' | 'review' | 'admin' | 'settings';

/**
 * Two jobs live in this file, and they belong to different people. A department fills an
 * assessment in; a handful of assessors at TBS read many of them. Mixing both into one path
 * asks every submitter to walk past a door that is not theirs.
 *
 * They are separated by a side, not by a second build. One HTML file that behaves as two
 * things costs nothing to publish; two builds double the publishing story for a tool that is
 * one file, serving one manager and two assessors.
 */
type Side = 'submit' | 'assess';

const SIDE_KEY = 'gc-arch-assessment:side';
const SIDE_OF: Record<Mode, Side | null> = {
  home: 'submit', submit: 'submit', results: 'submit',
  review: 'assess', admin: 'assess',
  settings: null,             // settings belongs to whoever is looking at it
};

/**
 * Where the reader is, as one value, and as an address.
 *
 * Back used to work in the questionnaire and nowhere else: the 21 stops pushed history and
 * every other screen changed silently, so leaving the results page took you two stops back into
 * the questions, and an assessor pressing Back was dropped into somebody's submitter view. One
 * router fixes both, and it makes every screen a link that can be sent.
 *
 * The stop lives in the hash unprefixed, because that is the shape the questionnaire already
 * pushed and links to those exist.
 */
interface Route { side: Side; mode: Mode; stop?: string }

function routeToHash(r: Route): string {
  if (r.side === 'assess') {
    return r.mode === 'admin' ? '#assessor/admin'
      : r.mode === 'settings' ? '#assessor/settings'
      : '#assessor';
  }
  if (r.mode === 'home') return '';
  if (r.mode === 'submit') return r.stop ? `#${r.stop}` : '#submit';
  return `#${r.mode}`;
}

function hashToRoute(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (!h) return { side: 'submit', mode: 'home' };
  if (h === 'assessor') return { side: 'assess', mode: 'review' };
  if (h === 'assessor/admin') return { side: 'assess', mode: 'admin' };
  if (h === 'assessor/settings') return { side: 'assess', mode: 'settings' };
  if (h === 'results' || h === 'settings' || h === 'submit') return { side: 'submit', mode: h as Mode };
  // Everything else is a questionnaire stop, which is what the hash held before there was a
  // router at all. An unknown one is harmless: the questionnaire opens at its first page.
  return { side: 'submit', mode: 'submit', stop: h };
}

function bootRoute(): Route {
  // A bookmarked address wins, so an assessor can pin the door they use and a section link
  // opens that section.
  try {
    if (window.location.hash) return hashToRoute(window.location.hash);
    // The remembered side is only a door on the build that has one. On codes the assessor
    // screens are not here, and sending somebody to a sign-in they cannot pass is worse than
    // opening the questionnaire.
    if (accessMode() === 'accounts' && localStorage.getItem(SIDE_KEY) === 'assess') return { side: 'assess', mode: 'review' };
  } catch {
    /* private window, or storage disabled. The submitter side is the right default. */
  }
  return { side: 'submit', mode: 'home' };
}

// The set in use is remembered, so a reload does not silently go back to the built-in one.
let rubric: Rubric = currentRubric(BUILTIN as unknown as Rubric);
let assessment: Assessment = loadDraft() ?? blankAssessment(rubric);
const booted: Route = bootRoute();
let side: Side = booted.side;
let mode: Mode = booted.mode;
if (booted.stop) setStopKey(booted.stop);

type SettingsPane = 'questions' | 'answers' | 'docs' | 'build' | 'danger';
let settingsPane: SettingsPane = 'questions';

/**
 * The assessment a discard just threw away, held in this tab and nowhere else. Undo is offered
 * from here. Nothing is written to disk to support it, so "permanently" stays true of the
 * browser's own store, which is what somebody clearing sensitive material cares about.
 */
let rescued: Assessment | null = null;

function openSettings(pane: SettingsPane) {
  settingsPane = pane;
  go('settings');
}

/**
 * When this build was made. It is in the footer because a browser holds a copy of a page for
 * longer than anybody expects, and telling a stale page apart from a bug is otherwise guesswork.
 */
declare const __EARB_BUILT__: string;
const BUILT: string = typeof __EARB_BUILT__ === 'string' ? __EARB_BUILT__ : '';

const app = document.getElementById('app')!;

/** Small counts read better spelled out in body copy. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const spell = (n: number): string => (n < WORDS.length ? WORDS[n] : String(n));

function questionCount(r: Rubric): number {
  return r.domains.reduce((n, d) => n + d.sections.reduce((m, x) => m + x.questions.length, 0), 0);
}

/**
 * Record where we are, so Back can come here.
 *
 * Wrapped, because pushState throws a SecurityError on a file:// page in some browsers and the
 * tool has to work from a file. When it throws, navigation still works and only Back does not.
 */
function pushRoute(): void {
  try {
    const here: Route = { side, mode, stop: currentStopKey() };
    const hash = routeToHash(here);
    const url = hash || `${window.location.pathname}${window.location.search}`;
    const was = window.history.state as Partial<Route> | null;
    if (was?.mode === mode && was?.side === side && window.location.hash === hash) return;
    window.history.pushState(here, '', url);
  } catch {
    /* file:// without history support. Navigation is unaffected. */
  }
}

function go(next: Mode) {
  mode = next;
  const owner = SIDE_OF[next];
  if (owner && owner !== side) setSide(owner, false);
  pushRoute();
  paint();
  window.scrollTo({ top: 0 });
}

/** Cross between the two sides, and remember which one, so a return visit opens the same door. */
function setSide(next: Side, move = true, target?: Mode) {
  side = next;
  try {
    localStorage.setItem(SIDE_KEY, next);
  } catch {
    /* storage unavailable. The side still holds for this visit. */
  }
  if (move) go(target ?? (next === 'assess' ? 'review' : 'home'));
  else pushRoute();
}

const GEAR =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.42.63.77.77H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

/**
 * Who this browser is, decided once, before anything asks.
 *
 * A real sign-in and the mockup used to write different variables in different files, so a
 * Google account could be signed in and the gate would still believe nobody was there. That
 * cost an infinite repaint and a blank page. Both names are set here, together: `assessorName`
 * is what the gate and the header read, and views-review's `auditor` is what every audit entry
 * is attributed to. Setting one without the other is the bug, so they are set in one line each,
 * side by side, where the next person can see they belong together.
 */
function adoptSignedIn(): void {
  /**
   * A build that runs on codes ignores a session, even a real one.
   *
   * A Firebase session left in this browser by an earlier build still reads back, and the
   * header hides the account chip without stopping any of this: the owner's address went onto
   * the record, the assessor name was set from it, and a roles request went out. Two people on
   * the same page were using two different tools.
   */
  if (!hasAccounts()) return;
  const me = currentUser();
  if (!me || assessorName.trim()) return;
  assessorName = me.email;
  setAuditor(me.email);
  /**
   * Put the owner on the record as soon as one is known.
   *
   * It used to arrive only on the first write to the store, so a file downloaded before that
   * named nobody, and a file is the thing people email each other. An assessment that already
   * names somebody else keeps them: opening their file works on their copy locally and never
   * writes it into this account.
   */
  if (!assessment.ownerEmail) {
    assessment.ownerEmail = me.email;
    autosave(assessment);
  }
  // The pool answers differently to somebody it knows, so whatever it said before is stale.
  forgetPool();
  // What this account is allowed to do decides which screens are offered. It is one request,
  // made once, and the header redraws when it lands.
  void loadRole().then((r) => { if (r) paint(); });
}

/**
 * Whether this account may see the assessor screens.
 *
 * Signing in and being allowed in are two different things, and a tool that treats them as one
 * shows a person an empty screen and lets them conclude their submission was lost. An admin
 * grants the assessor role, so an address nobody has granted gets a screen that says so and
 * names the address, which is the thing the admin needs in order to fix it.
 *
 * A build with no project has no roles, so the mockup side is unaffected.
 */
type Access = 'ok' | 'checking' | 'denied';

function accessState(): Access {
  if (mode !== 'review' && mode !== 'admin') return 'ok';
  if (!firebaseConfigured() || !currentUser()) return 'ok';
  const role = knownRole();
  if (role === null) return 'checking';
  if (role === 'admin') return 'ok';
  if (role === 'assessor') return mode === 'admin' ? 'denied' : 'ok';
  return 'denied';
}

/**
 * The screen an account without access meets, and the one it meets while that is being decided.
 *
 * Two ways out, because there are two reasons to be here: the wrong account is signed in, or
 * the right one has not been added yet. Signing in again handles the first. For the second the
 * only useful thing a page can do is hand over the address to send to an admin.
 */
function renderNoAccess(root: HTMLElement, state: Access) {
  const me = currentUser();
  const role = knownRole();
  const checking = state === 'checking';
  const wrongScreen = role === 'assessor' && mode === 'admin';

  const title = checking
    ? t('Checking your access', 'Vérification de votre accès')
    : wrongScreen
      ? t('The admin view is for admins', 'La vue d\u2019administration est réservée aux administrateurs')
      : t('This account does not have access', 'Ce compte n\u2019a pas accès');

  const detail = checking
    ? t('Asking the store what this account is allowed to see.',
        'Nous demandons au dépôt ce que ce compte a le droit de voir.')
    : wrongScreen
      ? t('You are signed in as an assessor. The admin view lists every submission and can delete them, so it is kept to admins.',
          'Vous êtes connecté comme évaluateur. La vue d\u2019administration liste toutes les soumissions et peut les supprimer, elle est donc réservée aux administrateurs.')
      : t('This address is not set up as an assessor, so there is nothing here for it to show. An admin adds assessors. Send them the address below and they can add it in a minute.',
          'Cette adresse n\u2019est pas enregistrée comme évaluateur, il n\u2019y a donc rien à afficher ici. Ce sont les administrateurs qui ajoutent les évaluateurs. Envoyez-leur l\u2019adresse ci-dessous et ils pourront l\u2019ajouter en une minute.');

  const actions: (HTMLElement | null)[] = checking ? [] : [
    wrongScreen
      ? el('button', { class: 'primary', onclick: () => go('review') }, [
          t('Back to submissions', 'Retour aux soumissions'),
        ])
      : el('button', { class: 'primary', onclick: () => setSide('submit') }, [
          t('Go to the home page', 'Aller à la page d\u2019accueil'),
        ]),
    el('button', {
      class: 'ghost',
      onclick: () => {
        signOut();
        forgetPool();
        forgetRole();
        assessorName = '';
        void signInWithGoogle().then((went) => { if (!went) paint(); });
      },
    }, [t('Sign in with a different account', 'Se connecter avec un autre compte')]),
  ];

  root.appendChild(el('section', { class: 'card no-access' }, [
    el('div', { class: 'pool-out' }, [
      el('div', { class: 'pool-art', html: SAD_CAT }),
      el('div', {}, [
        el('h1', { tabindex: -1 }, [title]),
        el('p', { class: 'muted' }, [detail]),
        me && !checking
          ? el('p', { class: 'mono small addr' }, [me.email])
          : null,
        actions.length ? el('div', { class: 'actions' }, actions) : null,
      ]),
    ]),
  ]));
}

/** Two letters for the account button, which is what an avatar would be if there were one. */
function initialsOf(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase() || '??';
}

/**
 * Open an assessment somebody sent you the access code for.
 *
 * The code is the record's own name in the store, so entering it is the whole of "let me in".
 * Whether the store answers is the store's decision and not this page's: the rules on Google's
 * side see the request, and a refusal is reported in their words.
 */
function openWithCode(): void {
  // Ask before the typing, and not after it. Twelve characters is work, and finding out
  // afterwards that it replaces yours is the wrong order to learn it in.
  guardDraft({ current: assessment, act: 'code', onCommit: () => askForCode(), after: () => paint() });
}

function askForCode(): void {
  const field = codeField(() => { /* the button is the way in, so nothing happens on the last box */ });
  const said = el('p', { class: 'cf-note' }, [
    t('Twelve characters, in three groups. Paste the whole thing into any box.',
      'Douze caractères, en trois groupes. Collez le tout dans n\u2019importe quelle case.'),
  ]);
  const dlg = document.createElement('dialog');
  dlg.className = 'confirm tier-plain';
  const close = () => { try { dlg.close(); } catch { /* already closed */ } dlg.remove(); };

  const tryOpen = async () => {
    if (!looksLikeCode(field.value())) {
      said.textContent = t('That is not a complete code yet.', 'Ce code n\u2019est pas encore complet.');
      return;
    }
    said.textContent = t('Looking for it...', 'Recherche en cours...');
    try {
      const found = await getAssessment(tidyCode(field.value()));
      if (!found) {
        said.textContent = t('No assessment has that code. Check it against the message you were sent.',
          'Aucune évaluation ne porte ce code. Vérifiez-le par rapport au message que vous avez reçu.');
        return;
      }
      close();
      assessment = ensureRef(found);
      autosave(assessment);
      go('submit');
    } catch (err) {
      // This branched once on the store asking for an account before it would read anything.
      // The published rules grant a read on the document's name, so that sentence had become
      // untrue and the message it replaced was the store's own.
      const why = (err as Error).message;
      said.textContent = t(`The store would not open it: ${why}`, `Le dépôt n\u2019a pas voulu l\u2019ouvrir : ${why}`);
    }
  };

  dlg.appendChild(el('div', { class: 'cf-head' }, [
    el('h2', { class: 'cf-title' }, [t('Open with an access code', 'Ouvrir avec un code d\u2019accès')]),
  ]));
  dlg.appendChild(el('div', { class: 'cf-body' }, [
    el('p', {}, [
      t('Whoever is working on an assessment can send you its access code. Entering it opens that assessment here.',
        'La personne qui travaille sur une évaluation peut vous envoyer son code d\u2019accès. En le saisissant, vous ouvrez cette évaluation ici.'),
    ]),
    field.node,
    said,
  ]));
  dlg.appendChild(el('div', { class: 'cf-actions' }, [
    el('button', { class: 'primary cf-wide', onclick: () => { void tryOpen(); } }, [t('Open it', 'L\u2019ouvrir')]),
    el('button', { class: 'cf-wide', onclick: close }, [t('Cancel', 'Annuler')]),
  ]));
  document.body.appendChild(dlg);
  closeOnOutsideClick(dlg, close);
  openDialog(dlg);
  field.focus();
}

/**
 * Offer to save this online.
 *
 * The words are the whole job here, and the first version of this window got them wrong in
 * four ways at once: it invented a phrase nobody had asked for, it put two unrelated thoughts
 * in one paragraph, it ended on a sentence whose "this is too" pointed at nothing, and it wore
 * the colours of a window that deletes something.
 *
 * So: one question in the title, the thing being decided in the body, the thing worth knowing
 * once as a note under it, and no red anywhere, because saving your own work takes nothing away.
 */
function offerOnlineSave(): void {
  const c = completion(rubric, assessment);
  const who = signerFields();
  confirmStep({
    tier: 'plain',
    title: t('Save this online?', 'Enregistrer ceci en ligne?'),
    body: c.complete
      ? t('Your assessment is saved on this computer only. Saving it online puts a copy on the TBS server, so it survives a closed tab or a lost laptop, and your assessor can read it.',
          'Votre évaluation est enregistrée sur cet ordinateur seulement. L\u2019enregistrement en ligne place une copie sur le serveur du SCT : elle survit à un onglet fermé ou à un ordinateur perdu, et votre évaluateur peut la lire.')
      : t(`Your assessment is saved on this computer only. Saving it online puts a copy on the TBS server, so it survives a closed tab or a lost laptop, and your assessor can read it. ${c.questionsLeft} of ${c.total} questions have no answer yet, so they will see it unfinished.`,
          `Votre évaluation est enregistrée sur cet ordinateur seulement. L\u2019enregistrement en ligne place une copie sur le serveur du SCT : elle survit à un onglet fermé ou à un ordinateur perdu, et votre évaluateur peut la lire. ${c.questionsLeft} des ${c.total} questions n\u2019ont pas encore de réponse, il la verra donc inachevée.`),
    /**
     * Who is saving, asked every time. It rides in the window rather than sitting on the
     * results page because it is part of the act: an assessor holding a version needs to know
     * whose it is and who to ask about it, and that is a fact about this save and not about
     * the assessment.
     */
    extra: who.node,
    focusFirst: () => who.focus(),
    gate: () => signerProblem(who.value()),
    note: savedOnline(assessment)
      ? t('It saves the version you have now. Change something afterwards and it stays on this computer until you save online again.',
          'Il enregistre la version actuelle. Si vous modifiez quelque chose ensuite, cela reste sur cet ordinateur jusqu\u2019au prochain enregistrement en ligne.')
      : t('The first save gives this assessment an access code, which is the only way anybody opens it afterwards, including you from another computer.',
          'Le premier enregistrement attribue à cette évaluation un code d\u2019accès, seul moyen de l\u2019ouvrir par la suite, y compris pour vous depuis un autre ordinateur.'),
    /**
     * The assessment is Unclassified. What it points at may not be, and saying otherwise was
     * wrong: the whole reason evidence is a title and a location rather than an attachment is
     * so that a Protected artefact can be named here and kept where it belongs.
     */
    stake: t('This assessment is an Unclassified document. It may name and link to evidence that is marked higher, and it must never hold that evidence itself: no file above Unclassified may be attached here.',
      'Cette évaluation est un document non classifié. Elle peut nommer des preuves portant une cote plus élevée et y renvoyer, mais ne doit jamais contenir ces preuves : aucun fichier au-dessus de Non classifié ne peut y être joint.'),
    alt: savedOnline(assessment) ? undefined : {
      label: t('No, keep it on this computer only', 'Non, la garder sur cet ordinateur seulement'),
      run: () => {
        assessment.meta.onlineDeclined = true;
        autosave(assessment);
      },
    },
    commitLabel: t('Save online', 'Enregistrer en ligne'),
    cancelLabel: t('Cancel', 'Annuler'),
    onCommit: () => {
      const signer = who.value();
      const first = !savedOnline(assessment);
      rememberSigner(signer);
      void saveOnlineNow(assessment, signer).then((res) => {
        if (!res.ok) { alert(res.problem); paint(); return; }
        paint();
        if (first && assessment.id) showNewCode(assessment);
      });
    },
  });
}

/** Sign out, from wherever it was asked for. Everything the account decided goes with it. */
function leave(): void {
  signOut();
  forgetPool();
  forgetRole();
  assessorName = '';
  setSide('submit');
}

function paint() {
  clear(app);
  adoptSignedIn();
  // The sign-in gate is its own shell: one screen, nothing to scroll, like any sign-in.
  const gate = (mode === 'admin' || mode === 'review') && !assessorName.trim();
  const access = gate ? 'ok' : accessState();
  app.className = mode === 'home' ? 'app-home'
    : mode === 'results' ? 'app-results'
    : gate || access !== 'ok' ? 'app-signin' : '';

  // The body is built first because the questionnaire's domain tabs live in the chrome and
  // register their own readouts, and renderSubmit clears that registry as it starts.
  const body = el('main', {
    class: [
      'body',
      mode === 'home' ? 'body-home' : '',
      mode === 'submit' ? 'body-submit' : '',
      mode === 'results' ? 'body-results' : '',
      mode === 'settings' ? 'body-settings' : '',
      mode === 'review' ? 'body-review' : '',
      mode === 'admin' ? 'body-admin' : '',
    ].filter(Boolean).join(' '),
  });

  if (mode === 'home') renderHome(body);
  else if (mode === 'submit') renderSubmit(body, rubric, assessment, () => go('results'));
  else if (mode === 'results') renderResults(body, rubric, assessment, () => go('submit'));
  else if (mode === 'settings') renderSettings(body);
  else if (gate) renderSignIn(body, () => paint());
  else if (access !== 'ok') renderNoAccess(body, access);
  else if (mode === 'admin') renderAdmin(body);
  else renderReview(body, rubric);

  // Header, marking and the domain tabs travel as one sticky block. Separately pinned strips
  // leave a seam that page content shows through.
  const chrome = el('div', { class: 'chrome' }, [header(gate || access !== 'ok')]);
  if (mode === 'submit' || mode === 'results') chrome.appendChild(banner());
  const tabs = takeSubmitTabs();
  if (mode === 'submit' && tabs) chrome.appendChild(tabs);

  app.appendChild(chrome);
  app.appendChild(body);

  // A printed assessment carries its marking at the foot of the page as well as the head.
  // On screen the sticky one above is enough.
  if (mode === 'submit' || mode === 'results') app.appendChild(banner('print-only'));
  if (mode !== 'submit') app.appendChild(footer());
  measureChrome();
}

/**
 * The domain tabs and the rail pin themselves under the header, so they need to know how tall
 * it is. Guarded on a real measurement: jsdom returns zero from getBoundingClientRect, and a
 * sticky offset of zero would put the tabs under the header rather than below it.
 */
function measureChrome(): void {
  const chrome = document.querySelector('.chrome');
  if (!chrome || typeof chrome.getBoundingClientRect !== 'function') return;
  const h = chrome.getBoundingClientRect().height;
  if (h > 0) document.documentElement.style.setProperty('--chrome-h', `${Math.round(h)}px`);
}

/**
 * The three tabs are one path through the work, so they render as a path: start, fill it in,
 * have it reviewed. Settings is not a step on that path, so it takes the usual place and the
 * usual icon at the far right.
 */
/**
 * The chrome. On a sign-in screen it carries the name of the tool and the language, and nothing
 * else: a save badge saying work is kept in this browser, an offer to sign in to save online and
 * a breadcrumb to submissions are all answers to questions nobody has been allowed to ask yet.
 */
function header(bare = false): HTMLElement {
  const tab = (label: string, m: Mode) =>
    el('button', { class: `tab ${mode === m ? 'on' : ''}`, onclick: () => go(m) }, [label]);
  const chev = () => el('span', { class: 'chev', 'aria-hidden': true }, ['\u203A']);

  return el('header', { class: 'topbar' }, [
    el('div', { class: 'brand', onclick: () => go(side === 'assess' ? 'review' : 'home') }, [
      el('span', { class: 'brand-mark' }, ['EA']),
      el('strong', {}, [rubric.title]),
      /**
       * Which side you are on, and not who you are.
       *
       * This badge used to print the signed-in address, which the account chip at the other end
       * of the same header already holds, and holds better: the chip is where every signed-in
       * service keeps an identity, and it opens to show the address in full. Two copies of one
       * address, at opposite ends of one bar, is the header carrying the same fact twice and
       * charging the width for it.
       *
       * A typed name on a build with no provider is different, and it stays, because nothing
       * else on screen says whose name is going onto the audit or that nobody has checked it.
       */
      side === 'assess' && !bare
        ? el('span', { class: 'side-badge' }, [
            firebaseConfigured() || !assessorName.trim()
              ? t('Assessor', 'Évaluateur')
              : `${assessorName.trim()} · ${t('unverified', 'non vérifié')}`,
          ])
        : null,
    ]),
    /**
     * File, where a document editor keeps it.
     *
     * Everything you do to a whole assessment lives here: who can see it, sending it, taking a
     * copy away. Saving to a file used to be a button on the questionnaire footer, which is the
     * wrong offer in the wrong place, because a file is a thing you do at the end and the
     * question somebody has while answering is where their work is going.
     */
    !bare && side === 'submit'
      ? el('details', { class: 'set-menu file-menu' }, [
          el('summary', { class: 'set-menu-btn file-btn' }, [t('File', 'Fichier')]),
          el('div', { class: 'set-menu-pop' }, [
            el('button', {
              class: 'menu-item',
              onclick: () => openShareDialog(assessment, currentUser()?.email ?? assessorName, () => paint()),
            }, [
              el('span', { class: 'menu-ico', html: ICON_SHARE, 'aria-hidden': true }),
              t('Share access', 'Gérer l\u2019accès'),
            ]),
            el('button', {
              class: 'menu-item',
              onclick: () => handOff(assessment),
            }, [
              el('span', { class: 'menu-ico', html: ICON_MAIL, 'aria-hidden': true }),
              t('Write an email about it', 'R\u00e9diger un courriel \u00e0 son sujet'),
            ]),
            // "File" on its own said nothing: a PDF is a file too. The kind is the point.
            el('button', {
              class: 'menu-item',
              onclick: () => { saveAssessmentFile(assessment); paint(); },
            }, [
              el('span', { class: 'menu-ico', html: ICON_DOWN, 'aria-hidden': true }),
              t('Download as a JSON file', 'Télécharger en fichier JSON'),
            ]),
            el('button', {
              class: 'menu-item',
              onclick: () => window.print(),
            }, [
              el('span', { class: 'menu-ico', html: ICON_PRINT, 'aria-hidden': true }),
              t('Print or save as a PDF', 'Imprimer ou enregistrer en PDF'),
            ]),
          ]),
        ])
      : null,
    el('div', { class: 'topbar-right' }, [
      // Where the work is kept, on every screen, and one click from the detail.
      // The save state is the submitter's. An assessor has nothing of their own open here,
      // so a badge saying a draft is kept in this browser is answering nobody's question.
      bare || side === 'assess' ? null : saveBadge(() => openSettings('answers')),
      /**
       * Signing in is not a gate on this side. A submitter can answer all 176 questions with no
       * account at all. What the account buys is that the work can be saved online, so the
       * offer is beside the save state, where somebody wondering where their work lives is
       * already looking.
       */
      !bare && side === 'submit' && isHosted() && hasAccounts() && canSignIn() && !currentUser()
        ? el('button', {
            class: 'linkish small',
            onclick: () => { void signInWithGoogle().then((went) => { if (!went) paint(); }); },
          }, [t('Sign in to save online', 'Se connecter pour enregistrer en ligne')])
        : null,
      bare ? null : side === 'assess'
        ? el('nav', { class: 'path', 'aria-label': t('Where you are', 'Où vous êtes') }, [
            tab(t('Submissions', 'Soumissions'), 'review'),
            // No store means no roles, so the mockup keeps both tabs. With a store, the tab
            // appears once the role has come back and says admin.
            !firebaseConfigured() || knownRole() === 'admin' ? chev() : null,
            !firebaseConfigured() || knownRole() === 'admin'
              ? tab(t('Admin', 'Administration'), 'admin')
              : null,
          ])
        : el('nav', { class: 'path', 'aria-label': t('Where you are', 'Où vous êtes') }, [
            tab(t('Start', 'Début'), 'home'), chev(),
            tab(t('Fill it in', 'Remplir'), 'submit'), chev(),
            tab(t('My results', 'Mes résultats'), 'results'),
          ]),
      side === 'assess'
        ? el('button', { class: 'linkish small', onclick: () => setSide('submit') }, [
            t('Leave assessor view', 'Quitter la vue de l\u2019évaluateur'),
          ])
        : null,
      /**
       * One link, naming the other language in that language, which is the Canada.ca and WET
       * pattern. The href is real: bootLang() reads ?lang=, so the French page is something a
       * person can send to somebody. `lang` on the link is what makes a screen reader say
       * "Français" with a French voice inside an English page.
       */
      (() => {
        const other: Lang = lang() === 'en' ? 'fr' : 'en';
        const label = other === 'fr' ? 'Français' : 'English';
        return el('a', {
          class: 'lang-link', lang: other, hreflang: other, href: `?lang=${other}`,
          onclick: (e: Event) => { e.preventDefault(); setLang(other); paint(); },
        }, [
          el('span', { class: 'lang-full' }, [label]),
          el('abbr', { class: 'lang-abbr', title: label }, [other.toUpperCase()]),
        ]);
      })(),
      /**
       * The account menu.
       *
       * Sign-out lives at the top right of the header behind the signed-in identity, because
       * that is where GitHub, Google, Microsoft and every Canada.ca signed-in service keep it,
       * and somebody looking for it looks there first. Settings holds the same control, which
       * is a second home rather than the only one.
       */
      /**
       * On a build that runs on codes there is no account to show, so this is gated on the
       * switch rather than on the store being configured. A submitter asking "do I have an
       * account here?" is the question this answers: today, on the accounts build, yes, and
       * that is why the badge is there.
       */
      hasAccounts() && currentUser()
        ? el('details', { class: 'set-menu account-menu' }, [
            el('summary', {
              class: 'set-menu-btn account-btn',
              title: t('Your account', 'Votre compte'),
              'aria-label': t('Your account', 'Votre compte'),
            }, [initialsOf(currentUser()!.email)]),
            el('div', { class: 'set-menu-pop' }, [
              el('span', { class: 'menu-head' }, [t('Signed in as', 'Connecté en tant que')]),
              el('span', { class: 'menu-head mono' }, [currentUser()!.email]),
              el('button', { class: 'menu-item', onclick: () => leave() }, [
                t('Sign out', 'Se déconnecter'),
              ]),
            ]),
          ])
        : null,
      el('button', {
        class: `icon-btn ${mode === 'settings' ? 'on' : ''}`,
        title: t('Settings', 'Paramètres'), 'aria-label': t('Settings', 'Paramètres'),
        html: GEAR,
        onclick: () => openSettings('questions'),
      }),
    ]),
  ]);
}

function footer(): HTMLElement {
  // With a store configured, the first thing the page says about itself is what it is. An
  // unowned prototype with no end date is the objection; saying so first is the answer.
  if (isHosted()) {
    return el('footer', { class: 'sitefoot' }, [
      el('span', { class: 'proto' }, [
          `Prototype. Unclassified only, and not an official EARB decision. What you send is kept at ${endpointHost()}. `,
        ]),
      el('button', { class: 'linkish', onclick: () => openSettings('build') }, ['Where this goes']),
      el('span', {}, [`  \u00b7  rubric ${rubric.version}  \u00b7  v${APP_VERSION}${BUILT ? `  \u00b7  built ${BUILT} UTC` : ''}`]),
    ]);
  }
  return el('footer', { class: 'sitefoot' }, [
    el('span', {}, ['Everything you enter stays on this machine. ']),
    el('button', { class: 'linkish', onclick: () => openSettings('answers') }, ['How that works']),
    el('span', {}, [`  ·  rubric ${rubric.version}  ·  v${APP_VERSION}${BUILT ? `  ·  built ${BUILT} UTC` : ''}`]),
  ]);
}

function banner(extra = ''): HTMLElement {
  const mark = bannerFor(assessment);
  const unmarked = mark === 'UNMARKED';
  if (!unmarked || extra) {
    const note = evidenceNote(assessment);
    return el('div', { class: `marking-banner ${unmarked ? 'unmarked' : ''} ${extra}` }, [
      unmarked ? 'Unmarked' : mark,
      note ? el('span', { class: 'mark-note' }, [note]) : null,
    ]);
  }
  // An unmarked banner is the one thing on the page that needs doing, so it is the control
  // for doing it. Saying "go and find the setting" is the failure, not the wording of it.
  return el('button', {
    class: 'marking-banner unmarked',
    onclick: () => {
      // The marking question lives on the overview, so go there first. Without this the
      // banner did nothing at all from any of the twenty question pages.
      showMarkingStep();
      go('submit');
      const heading = document.getElementById('marking-control');
      if (heading && typeof heading.scrollIntoView === 'function') heading.scrollIntoView({ block: 'center' });
      heading?.focus?.();
    },
  }, ['Say how your evidence is marked']);
}

/* ------------------------------------------------------------------------------------------
   Home. One thing to read and one thing to do, then a lighter note on what to expect.
   The rubric controls and the data-handling detail belong in Settings; somebody arriving
   here wants to know what this is and how to start.
   ------------------------------------------------------------------------------------------ */

/**
 * What "Continue" is continuing, said plainly. Somebody arriving at a half-finished assessment
 * should not have to guess whether their work survived, where it went, or whether they need
 * the file they saved last week.
 *
 * Starting over is deliberately quiet. A department fills one of these in once; the button
 * that throws the work away should not be the brightest thing on the page.
 */
function draftNote(draft: Assessment, total: number): HTMLElement {
  const answered = answeredCount(draft);
  const saved = (() => {
    const t = Date.parse(draft.meta?.updatedAt ?? '');
    return Number.isFinite(t) ? new Date(t).toLocaleString() : 'a moment ago';
  })();

  // The overview is six fields and none of them are scored questions, so filling it in left
  // this line reading "0 of 176 answered", which looks like nothing was kept.
  const [ovDone, ovTotal] = overviewFieldProgress(draft);

  return el('div', { class: 'draft-note' }, [
    el('p', { class: 'small' }, [
      el('b', {}, [
        ovDone < ovTotal
          ? `About the initiative ${ovDone} of ${ovTotal}, and ${answered} of ${total} questions answered.`
          : `${answered} of ${total} answered.`,
      ]),
      el('span', { class: 'muted' }, [` Last changed ${saved}.`]),
    ]),
    el('p', { class: 'small muted' }, [
      'Saved locally on this machine, by your browser, as you type. Closing the tab or ',
      'reloading the page does not lose it, and you do not need the file you saved to carry on.',
    ]),
    el('p', { class: 'tiny dim' }, [
      'Starting over is in ',
      el('button', { class: 'linkish', onclick: () => openSettings('danger') }, ['Settings']),
      '.',
    ]),
  ]);
}

/**
 * An admin removed this submission from the store while the person still had their own copy.
 * Two ways forward, and no third: send this copy again, or keep it here and talk to the
 * assessor. Nothing is done to their work either way.
 */
function warnGoneFromStore(): void {
  if (!isHosted()) return;
  // Nothing can have gone missing unless this browser holds a copy that was actually sent. The
  // check used to run on every load for everybody, which asked the store for a list that most
  // people are refused, on the way to answering a question they had not asked.
  if (!assessment.id || !assessment.meta?.submittedAt) return;
  void listRecords().then((records) => {
    if (!goneFromStore(records, assessment)) return;
    confirmStep({
      tier: 'caution',
      title: 'This assessment is no longer in the shared store',
      body: 'Somebody with admin rights removed it. Your own copy is here and untouched, and nothing has happened to your answers.',
      stake: `${answeredCount(assessment)} answers, kept in this browser.`,
      alt: {
        label: 'Send this copy to the store again',
        run: () => { void putRecord(assessment); },
      },
      commitLabel: 'Keep it here and ask my assessor',
      cancelLabel: 'Decide later',
      onCommit: () => { /* nothing to do: the local copy is already the only one */ },
    });
  });
}

function renderHome(root: HTMLElement) {
  const draft = loadDraft();
  const started = !!draft && Object.keys(draft.answers ?? {}).length > 0;
  const total = questionCount(rubric);

  root.appendChild(el('section', { class: 'hero' }, [
    el('div', { class: 'hero-text' }, [
      el('p', { class: 'eyebrow' }, [t('Government of Canada Enterprise Architecture', 'Architecture intégrée du gouvernement du Canada')]),
      el('h1', {}, [t('Assess your own architecture', 'Évaluez votre propre architecture')]),
      el('p', { class: 'lead' }, [
        t('You answer questions about the work you already run, score yourself against a published scale, and point to evidence you already have. Nothing new has to be written for it.',
          'Vous répondez à des questions sur le travail que vous menez déjà, vous vous notez selon une échelle publiée et vous renvoyez à des preuves que vous avez déjà. Rien de nouveau n\u2019a à être rédigé pour cela.'),
      ]),
      el('div', { class: 'hero-actions' }, [
        el('button', {
          class: 'primary big',
          // Continuing means going to the first thing left blank, not back to the top.
          onclick: () => {
            resetOverviewToFirstGap(rubric, assessment);
            if (started) goToFirstGap(rubric, assessment);
            go('submit');
          },
        }, [
          started ? t('Continue', 'Continuer') : t('Fill it in', 'Remplir le questionnaire'),
          el('span', { class: 'arrow', 'aria-hidden': true }, ['\u2192']),
        ]),
        /**
         * The second way in. It was two, and the file one has gone, which left the word "or"
         * behind twice over.
         */
        isHosted()
          ? el('span', { class: 'or' }, [t('or', 'ou')])
          : null,
        isHosted()
          ? el('button', { class: 'linkish', onclick: () => openWithCode() }, [
              t('open one with an access code', 'en ouvrir une avec un code d\u2019accès'),
            ])
          : null,
      ]),
      started ? draftNote(draft!, total) : null,
    ]),
    el('div', { class: 'hero-art', 'aria-hidden': true }, [
      el('span', { class: 'rung r1' }), el('span', { class: 'rung r2' }),
      el('span', { class: 'rung r3' }), el('span', { class: 'rung r4' }),
      el('span', { class: 'rung r5' }),
    ]),
  ]));

  /**
   * The way across, which is here for testing and for nothing else.
   *
   * The two sides are separate products, and on the build that runs on codes they are also two
   * published pages: an assessor opens their own address and never arrives through this one.
   * A submitter's home page offering a door to the assessor view describes a product that is
   * not theirs, which is the one thing neither side may do.
   */
  if (accessMode() === 'accounts') root.appendChild(el('p', { class: 'crossover tiny dim' }, [
    el('span', { class: 'badge badge-mockup tiny' }, [t('For testing', 'Pour les tests')]),
    ' ',
    el('button', { class: 'linkish', onclick: () => setSide('assess') }, [
      t('Open the assessor view', 'Ouvrir la vue de l\u2019évaluateur'),
    ]),
    el('span', { class: 'dim' }, [
      t(' The finished tool sends an assessor to their own address.',
        ' L\u2019outil fini envoie l\u2019évaluateur à sa propre adresse.'),
    ]),
  ]));


  root.appendChild(el('section', { class: 'note' }, [
    el('h2', {}, [t('What to expect', 'À quoi s\u2019attendre')]),
    el('ul', {}, [
      el('li', {}, [
        el('b', {}, [t(`${total} questions, across ${spell(rubric.domains.length)} architecture domains. `, `${total} questions, réparties sur ${rubric.domains.length} domaines d\u2019architecture. `)]),
        t('You do not have to finish in one sitting. Your progress is kept as you go, and you can save a file and come back to it.',
          'Vous n\u2019avez pas à tout terminer d\u2019un seul coup. Votre progression est conservée à mesure, et vous pouvez enregistrer un fichier pour y revenir.'),
      ]),
      el('li', {}, [
        el('b', {}, [t('The scale explains itself. ', 'L\u2019échelle s\u2019explique d\u2019elle-même. ')]),
        t('Every score from 0 to 10 has a description, so a low score comes with a plain account of what would improve it.',
          'Chaque note de 0 à 10 est accompagnée d\u2019une description, de sorte qu\u2019une note faible dit clairement ce qui l\u2019améliorerait.'),
      ]),
      el('li', {}, [
        el('b', {}, [t('You decide who sees it. ', 'Vous décidez qui la voit. ')]),
        t('Saving produces a file on your machine. Sending it is a separate step, through whatever channel your department already uses.',
          'L\u2019enregistrement produit un fichier sur votre ordinateur. L\u2019envoi est une étape distincte, par le canal que votre ministère utilise déjà.'),
      ]),
    ]),
  ]));
}

/* ------------------------------------------------------------------------------------------
   Settings. The rubric, and how information is handled. Both matter, and neither is the
   first thing a person needs.
   ------------------------------------------------------------------------------------------ */

/**
 * Who the assessor says they are. There is no authentication anywhere in this tool and there
 * cannot be until somebody decides how it works, so this screen is shaped like a sign-in and
 * says plainly that it is a mockup. Getting the shape agreed now is worth more than a text
 * field pretending to be nothing.
 *
 * Everything it produces is labelled unverified, in the file and on screen, so nobody can
 * later mistake a typed name for a checked one.
 */
let assessorName = '';

/**
 * The real sign-in, when there is a store to sign in to.
 *
 * Two providers, because Google works for anybody today and Microsoft is how somebody uses
 * their departmental account. Which one a person picks changes nothing downstream: the store's
 * rules key off the address, and a role is a document an admin writes.
 */
function renderRealSignIn(root: HTMLElement) {
  const problem = lastSignInProblem();

  const card = el('section', { class: 'card signin' }, [
    el('div', { class: 'head-row' }, [
      el('h1', {}, [t('Sign in', 'Connexion')]),
    ]),
    el('p', { class: 'muted' }, [
      t('The tool needs to know who you are before it can show you anything. It reads your name and address from whichever account you use, and it never sees a password.',
        'L\u2019outil doit savoir qui vous êtes avant de pouvoir vous montrer quoi que ce soit. Il lit votre nom et votre adresse dans le compte que vous utilisez, et il ne voit jamais de mot de passe.'),
    ]),
    problem
      ? el('div', { class: 'card warn tight' }, [
          el('strong', { class: 'small' }, [t('That sign-in did not finish', 'Cette connexion n\u2019a pas abouti')]),
          el('p', { class: 'small' }, [problem]),
        ])
      : null,
    /**
     * A page opened from a file cannot sign in at all: there is no address for a provider to
     * return to. The button used to be offered anyway and pressing it did nothing, because the
     * refusal went into a promise nobody read. Now the screen says it before it is pressed.
     */
    !canSignIn()
      ? el('div', { class: 'card warn tight' }, [
          el('strong', { class: 'small' }, [
            t('Sign-in needs a web address, and this page has none',
              'La connexion exige une adresse web, et cette page n\u2019en a pas'),
          ]),
          el('p', { class: 'small' }, [
            t('Google has to be given somewhere to send you back to, and it will only accept an address registered in advance. This page was loaded from:',
              'Google doit recevoir une adresse de retour, et il n\u2019accepte qu\u2019une adresse enregistrée d\u2019avance. Cette page a été chargée depuis :'),
          ]),
          el('p', { class: 'mono tiny' }, [pageAddress()]),
          el('p', { class: 'small' }, [
            t('Open the published address and sign in there: ', 'Ouvrez l\u2019adresse publiée et connectez-vous là : '),
            /**
             * The assessor's own address, and not the site root. The root is the submitter's
             * page now, which has no sign-in on it at all, so sending somebody there to sign
             * in lands them on a screen that cannot do it.
             */
            el('a', {
              href: 'https://myermcat.github.io/tbs-earb-self-assessment-preview/assessor/',
              target: '_blank', rel: 'noopener',
            }, ['myermcat.github.io/tbs-earb-self-assessment-preview/assessor']),
          ]),
        ])
      : null,
    el('div', { class: 'actions signin-providers' }, [
      el('button', {
        class: 'primary', disabled: !canSignIn(),
        onclick: () => { void signInWithGoogle().then((went) => { if (!went) paint(); }); },
      }, [t('Continue with Google', 'Continuer avec Google')]),
      /**
       * Microsoft is on the screen because it is how somebody uses their departmental account,
       * and it is disabled because Firebase needs an application registered in an Azure
       * directory first. A button that looks ordinary and does nothing is worse than no button.
       */
      el('button', {
        class: 'ghost is-mockup', disabled: true,
        title: t('Mockup. No working sign-in behind it yet. To build it, somebody with Azure rights at TBS has to register this application in the departmental directory.',
          'Maquette. Aucune connexion fonctionnelle derrière pour l\u2019instant. Pour la construire, une personne ayant les droits Azure au SCT doit enregistrer cette application dans l\u2019annuaire ministériel.'),
      }, [
        t('Continue with your Microsoft or departmental account', 'Continuer avec votre compte Microsoft ou ministériel'),
      ]),
    ]),
    el('p', { class: 'tiny dim' }, [
      t('A departmental account needs somebody with Azure rights at TBS to register this application first. Until they do, that button does nothing and says so. Google works meanwhile.',
        'Un compte ministériel exige que quelqu\u2019un ayant les droits Azure au SCT enregistre d\u2019abord cette application. D\u2019ici là, ce bouton ne fait rien et le dit. Google fonctionne entre-temps.'),
    ]),
  ]);
  root.appendChild(card);
}

function renderSignIn(root: HTMLElement, onDone: () => void) {
  // With a store configured, the mockup has nothing to do: a real sign-in exists.
  if (firebaseConfigured()) { renderRealSignIn(root); return; }

  const input = el('input', {
    type: 'text', value: assessorName, placeholder: 'First and last name',
    oninput: (e: Event) => { assessorName = (e.target as HTMLInputElement).value; },
  }) as HTMLInputElement;

  const go = () => {
    if (!assessorName.trim()) { input.focus(); return; }
    setAuditor(assessorName.trim());
    onDone();
  };

  const card = el('section', { class: 'card signin' }, [
    el('div', { class: 'head-row' }, [
      el('h1', {}, ['Sign in']),
      el('span', { class: 'badge badge-warn' }, ['Mockup']),
    ]),
    el('p', { class: 'muted' }, [
      'There is no sign-in yet. Nobody has decided how assessors will be verified, so this ',
      'screen is the shape of one and nothing more.',
    ]),
    el('div', { class: 'signin-mock' }, [
      el('p', { class: 'small' }, [
        el('b', {}, ['What this will probably become. ']),
        'Your departmental account, the same one you use for Teams, so there is no new ',
        'password and the tool knows who you are without asking.',
      ]),
      el('button', { class: 'ghost', disabled: true }, ['Continue with your departmental account']),
      el('p', { class: 'tiny dim' }, ['Not wired to anything.']),
    ]),
    el('hr', { class: 'q-split' }),
    el('label', { class: 'field' }, [
      el('span', {}, ['For now, type your full name']),
      input,
    ]),
    el('p', { class: 'small warn-text' }, [
      'This is not checked. Anything you score will be recorded as unverified, and it will say ',
      'so beside your name.',
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'primary', onclick: go }, ['Continue as unverified']),
    ]),
  ]);
  card.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); go(); }
  });
  root.appendChild(card);
  setTimeout(() => input.focus?.(), 0);
}

/**
 * The admin view: the portfolio dashboard. It recalculates every record from its answers as the
 * page draws, so there is no stored roll-up to go stale - Dan's dashboard updates itself by
 * never storing a number in the first place. What it can reach depends on whether a store
 * exists, and the page says which.
 */
function renderAdmin(root: HTMLElement) {
  renderDashboard(root, rubric, openedThisSession());
}

const TRASH =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

/* ------------------------------------------------------------------------------------------
   Settings: a rail on the left, one pane at a time on the right.
   ------------------------------------------------------------------------------------------ */

function renderSettings(root: HTMLElement) {
  const pane = el('section', { class: 'set-pane' });

  const navRow = (label: string, id: SettingsPane, danger = false) =>
    el('button', {
      class: `set-navrow ${danger ? 'danger' : ''} ${settingsPane === id ? 'on' : ''}`,
      'aria-current': settingsPane === id ? 'page' : 'false',
      onclick: () => { settingsPane = id; paintPane(); },
    }, [label]);

  const nav = el('nav', { class: 'set-nav', 'aria-label': 'Settings' });

  /**
   * Switching pane repaints the pane and nothing else, so there is no scroll jump and no
   * history entry. Focus moves to the new heading, which is what announces the change to a
   * screen reader without an aria-live region reading a whole pane aloud.
   */
  /**
   * Two of these four panes belong to the submitter and were shown to everybody.
   *
   * Reported in those words: "it is in the assessor view, and the assessment the browser is
   * holding is in the submitter view, and those two views should not be connected at all. How
   * can you discard the assessment that is not even yours?" She is right, and it is the
   * standing rule of the project broken in the one screen both sides share.
   *
   * "Your answers" describes the draft this browser is holding, which an assessor does not
   * have. "Start again" erases it. An assessor reading the pool has no draft and no business
   * being offered either, and the offer reads as though it would clear the submissions in front
   * of them, which is worse than merely being useless.
   */
  const mine = side === 'submit';

  function paintPane() {
    // Landing on a pane that is not offered on this side, by a stale value or a link.
    if (!mine && (settingsPane === 'answers' || settingsPane === 'danger')) settingsPane = 'questions';

    clear(nav);
    nav.appendChild(el('span', { class: 'set-navgroup' }, [t('Settings', 'Paramètres')]));
    nav.appendChild(navRow(t('Question set', 'Jeu de questions'), 'questions'));
    if (mine) nav.appendChild(navRow(t('Your answers', 'Vos réponses'), 'answers'));
    nav.appendChild(navRow(t('Documentation', 'Documentation'), 'docs'));
    nav.appendChild(navRow(t('This build', 'Cette version'), 'build'));
    if (mine) {
      nav.appendChild(el('span', { class: 'set-navsep', 'aria-hidden': true }));
      nav.appendChild(navRow(t('Start again', 'Recommencer'), 'danger', true));
    }

    clear(pane);
    if (settingsPane === 'questions') paneQuestions(pane);
    else if (settingsPane === 'answers' && mine) paneAnswers(pane);
    else if (settingsPane === 'docs') paneDocs(pane);
    else if (settingsPane === 'build') paneBuild(pane);
    else if (mine) paneDanger(pane);
    else paneQuestions(pane);

    const h = pane.querySelector('h1') as HTMLElement | null;
    h?.focus?.();
  }

  paintPane();
  root.appendChild(el('div', { class: 'set-layout' }, [nav, pane]));
}

function setRow(
  title: string,
  body: string,
  control: HTMLElement | null,
  opts: { tier?: 'caution' | 'danger'; badge?: string } = {},
): HTMLElement {
  return el('div', { class: `set-row ${opts.tier ?? ''}` }, [
    el('div', {}, [
      el('div', { class: 'set-row-title' }, [
        title,
        opts.badge
          ? el('span', { class: `badge ${opts.tier === 'danger' ? 'badge-bad' : 'badge-warn'}` }, [opts.badge])
          : null,
      ]),
      el('p', {}, [body]),
    ]),
    control ? el('div', { class: 'set-row-act' }, [control]) : null,
  ]);
}

function paneQuestions(pane: HTMLElement) {
  pane.appendChild(el('h1', { tabindex: -1 }, [t('Question set', 'Jeu de questions')]));
  pane.appendChild(el('p', { class: 'set-lead' }, ['The active questions, weights and scale.']));

  pane.appendChild(el('dl', { class: 'kv' }, [
    el('dt', {}, ['Title']), el('dd', {}, [rubric.title]),
    el('dt', {}, ['Version']), el('dd', { class: 'mono' }, [rubric.version]),
    el('dt', {}, ['Status']), el('dd', {}, [rubric.status]),
    el('dt', {}, ['Size']), el('dd', {}, [
      `${questionCount(rubric)} questions in ${rubric.domains.reduce((n, d) => n + d.sections.length, 0)} sections`,
    ]),
  ]));
  if (rubric.provenance) pane.appendChild(el('p', { class: 'small muted' }, [rubric.provenance]));
  if (rubric.importWarnings?.length) {
    pane.appendChild(el('div', { class: 'card warn tight' }, [
      el('strong', { class: 'small' }, ['Noted when this question set was imported']),
      el('ul', { class: 'small' }, rubric.importWarnings.map((w) => el('li', {}, [w]))),
    ]));
  }

  /**
   * Replacing the question set belongs to whoever maintains the instrument, not to somebody
   * filling one in. It is offered on the assessor and admin side only.
   *
   * It also used to wipe every answer the moment a file validated, with no warning at all: the
   * most destructive control in the tool and the only one that asked nothing. It now goes
   * through the same confirmation as a discard.
   */
  const picker = el('label', { class: 'filelabel' }, [
    'Add a question set',
    el('input', {
      type: 'file', accept: '.json', hidden: true,
      onchange: async (e: Event) => {
        const input = e.target as HTMLInputElement;
        const f = input.files;
        if (!f?.length) return;
        const [item] = await readJsonFiles(f);
        input.value = '';
        const v = validate(item.data);
        if (!v.ok) { alert(`That question set will not load:\n\n- ${v.problems.join('\n- ')}`); return; }

        // Adding is not activating. Nothing that anybody is answering changes here.
        const added = addToLibrary(v.rubric, new Date().toISOString(), assessorName.trim() || undefined);
        if (!added.ok) { alert(added.problem); return; }
        settingsPane = 'questions';
        go('settings');
      },
    }),
  ]);

  if (side !== 'assess') return;

  /**
   * The library. Sets accumulate: the one from the build, plus every one that has been added.
   *
   * Adding and activating are separate acts. A set that arrives by email is not automatically
   * the one everybody answers, and somebody should be able to look at it first.
   */
  const lib = libraryList(BUILTIN as unknown as Rubric);
  const cur = currentId();

  const rows = el('div', { class: 'set-list' });
  for (const entry of lib) {
    const isCurrent = entry.id === cur;
    const removable = canRemove(BUILTIN as unknown as Rubric, entry.id);

    const activate = () => {
      const swap = () => {
        setCurrentId(entry.id);
        rubric = entry.rubric;
        clearDraft();
        assessment = blankAssessment(rubric);
        resetOverviewToFirstGap(rubric, assessment);
        go('settings');
      };
      guardDraft({ current: assessment, act: 'switch', onCommit: swap, after: () => paint() });
    };

    const remove = () => confirmStep({
      tier: 'danger',
      title: `Delete "${entry.rubric.title}" ${entry.rubric.version}?`,
      body: 'This removes the question set from this browser. No answers are touched, and assessments already answered against it keep their own copy.',
      stake: 'Nobody can get it back from here. If this is the only copy, take the file first.',
      offer: {
        label: 'Download the set, then delete',
        run: () => {
          const name = `${slug(entry.rubric.title)}-${entry.rubric.version}.json`;
          download(name, JSON.stringify(entry.rubric, null, 2));
          return `Saving as ${name}. Check your Downloads folder.`;
        },
      },
      commitLabel: 'Delete permanently',
      cancelLabel: 'Keep it',
      onCommit: () => { removeFromLibrary(entry.id); go('settings'); },
    });

    // What each set holds, without making it the one in use.
    const preview = el('div', { class: 'set-preview', hidden: true }, [
      el('dl', { class: 'kv tight' }, [
        el('dt', {}, ['Status']), el('dd', {}, [entry.rubric.status]),
        el('dt', {}, ['Scale']), el('dd', {}, [`${entry.rubric.scale.min} to ${entry.rubric.scale.max}`]),
        el('dt', {}, ['Domains']), el('dd', {}, [
          entry.rubric.domains.map((d) => `${d.label} ${d.weight}%`).join(', '),
        ]),
      ]),
      el('p', { class: 'tiny dim' }, ['First questions in each domain']),
      el('ul', { class: 'small set-preview-q' }, entry.rubric.domains.map((d) => {
        const first = d.sections[0]?.questions[0];
        return el('li', {}, [
          el('span', { class: 'mono tiny' }, [`${first?.id ?? '--'} `]),
          first?.text ?? 'no questions',
        ]);
      })),
    ]);

    const menu = el('details', { class: 'set-menu' }, [
      el('summary', { class: 'set-menu-btn', title: 'More', 'aria-label': 'More actions' }, ['\u22EF']),
      el('div', { class: 'set-menu-pop' }, [
        el('button', {
          class: 'menu-item',
          onclick: () => { preview.hidden = !preview.hidden; },
        }, ['Preview the questions']),
        isCurrent
          ? el('span', { class: 'menu-item is-off' }, ['Already active'])
          : el('button', { class: 'menu-item', onclick: activate }, ['Make this the active set']),
        removable
          ? el('button', { class: 'menu-item menu-danger', onclick: remove }, ['Delete this set'])
          : el('span', {
              class: 'menu-item is-off',
              title: isCurrent
                ? 'Make another set active first.'
                : 'The tool has no questions without a set.',
            }, [isCurrent ? 'Active, cannot delete' : 'The only set, cannot delete']),
        el('div', { class: 'menu-note tiny dim' }, [
          entry.addedBy
            ? `Added by ${entry.addedBy}, unverified`
            : entry.bundled ? 'Came with the page' : 'Added here',
          entry.addedAt ? `, ${new Date(entry.addedAt).toLocaleDateString()}` : '',
        ]),
      ]),
    ]);

    rows.appendChild(el('div', { class: `set-list-row ${isCurrent ? 'on' : ''}` }, [
      el('div', { class: 'set-list-main' }, [
        el('div', { class: 'set-row-title' }, [
          entry.rubric.title,
          el('span', { class: 'mono small muted' }, [` ${entry.rubric.version}`]),
          isCurrent ? el('span', { class: 'badge' }, ['Active']) : null,
        ]),
        el('p', { class: 'small muted' }, [
          `${questionCount(entry.rubric)} questions in ${entry.rubric.domains.reduce((n, d) => n + d.sections.length, 0)} sections`,
        ]),
        preview,
      ]),
      el('div', { class: 'set-list-act' }, [
        isCurrent ? null : el('button', { class: 'ghost small', onclick: activate }, ['Make active']),
        menu,
      ]),
    ]));
  }

  pane.appendChild(el('h2', { class: 'set-h2' }, [
    'Question sets in this browser',
    el('span', { class: 'muted small' }, [` ${lib.length}`]),
  ]));
  pane.appendChild(el('p', { class: 'small muted' }, [
    'Adding a set keeps the others and changes nothing on its own. Make one active when you want it answered.',
  ]));
  pane.appendChild(rows);
  pane.appendChild(el('div', { class: 'actions' }, [picker]));
}

function paneAnswers(pane: HTMLElement) {
  pane.appendChild(el('h1', { tabindex: -1 }, [t('Where your answers go', 'Où vont vos réponses')]));
  pane.appendChild(el('p', { class: 'set-lead' }, [
    t('Everything in this tool is unclassified. Nothing protected or classified belongs in it, which is what keeps the rest of this simple.',
      'Tout dans cet outil est non classifié. Rien de protégé ni de classifié n\u2019y a sa place, et c\u2019est ce qui garde le reste simple.'),
  ]));

  pane.appendChild(setRow(
    t('Unclassified only', 'Non classifié seulement'),
    'Not the answers and not the evidence. Point at where an artefact already lives and make sure your assessor can open it. Where something cannot be linked because of its marking, send it to your assessor by email and record here that you did, with its marking and the subject line.',
    null,
  ));
  pane.appendChild(setRow(
    'This browser keeps your work as you type',
    `Every browser keeps a small private store on disk for each site it visits. This page writes the whole assessment there as you type, so closing the tab or reloading is safe. It is holding ${answeredCount(assessment)} answers now. That store belongs to one browser on one machine, and clearing your browsing data clears it.`,
    null,
  ));
  if (isHosted()) {
    const me = currentUser();
    pane.appendChild(setRow(
      me || !hasAccounts() ? 'Saving online is a button, every time' : 'Signing in lets you save online',
      `Press Save online and the assessment as it stands is copied to ${endpointHost()}. Nothing else goes: edit a question afterwards and that edit is on this computer until you press it again, and the badge in the header says the copy online is out of date while that is true. It was built the other way first, sending every change a few seconds after you stopped typing, and that was wrong for a copy somebody else reads. Marking the assessment ready for an assessor is a separate act at the bottom of My results, and it saves online as part of doing it.`,
      null,
    ));
    pane.appendChild(setRow(
      'Nothing goes until you have said how your evidence is marked',
      'The questionnaire asks that before it will let you save at all, and the same answer decides what may go online. Until it is answered, everything stays on this computer.',
      null,
    ));
    /**
     * What gets somebody back to their own work, which is the one question this row answers.
     *
     * On the accounts build it is the account. On the code build there is no account to name,
     * and the sentence this replaced said the store only accepts work from somebody it knows,
     * which the published rules made untrue: they grant the write on the document's name.
     */
    if (hasAccounts()) {
      pane.appendChild(setRow(
        me ? 'Signed in' : 'Sending needs you to sign in',
        me
          ? `You are signed in as ${me.email}. That is the name on anything you send, and the store answers only accounts it knows.`
          : 'The store only accepts work from somebody it knows, so pressing Send asks you to sign in first. It reads your name and address from the account you use, and it never sees a password.',
        me
          ? el('button', { class: 'ghost', onclick: () => leave() }, ['Sign out'])
          : el('button', { class: 'primary', onclick: () => { void signInWithGoogle().then((went) => { if (!went) paint(); }); } }, ['Sign in with Google']),
        me ? {} : { tier: 'caution', badge: 'Not signed in' },
      ));
    } else {
      pane.appendChild(setRow(
        t('Your access code is the way back', 'Votre code d\u2019accès est le chemin du retour'),
        assessment.id
          ? t(`Saving online gave this assessment the code ${formatCode(assessment.id)}. Anybody holding it can open this assessment and change it, and nobody without it can, including you. There is no account here and no sign-in, so a code you lose is work you cannot reach from another computer.`,
              `L\u2019enregistrement en ligne a donné à cette évaluation le code ${formatCode(assessment.id)}. Toute personne qui le détient peut ouvrir cette évaluation et la modifier, et personne ne le peut sans lui, vous compris. Il n\u2019y a ici ni compte ni connexion : un code perdu est un travail que vous ne pouvez pas rejoindre depuis un autre ordinateur.`)
          : t('This assessment gets a twelve-character code the first time it is saved online, and from then on that code is the whole of getting back to it. Anybody holding it can open this assessment and change it, and nobody without it can. There is no account here and no sign-in.',
              'Cette évaluation reçoit un code de douze caractères lors du premier enregistrement en ligne, et dès lors ce code est tout ce qui permet d\u2019y revenir. Toute personne qui le détient peut l\u2019ouvrir et la modifier, et personne ne le peut sans lui. Il n\u2019y a ici ni compte ni connexion.'),
        null,
      ));
    }
  } else {
    pane.appendChild(setRow(
      'Nothing is sent anywhere in this copy',
      'This build was made with no store, so the page cannot reach the network at all: it carries a browser rule that blocks every outbound request. Saving to a file and sending that file is the whole route.',
      null,
    ));
  }
  pane.appendChild(setRow(
    'Sharing is the access code, and nothing is sent',
    'Whoever holds an assessment\u2019s access code can open it and change it, and nobody without it can. Sending the code is something you do yourself, in Teams or in your own mail client. The tool has no way to put a message in front of anybody, so it never claims to.',
    null,
  ));
  pane.appendChild(setRow(
    'A code cannot be taken back',
    'There is no list of who has one and no way to withdraw it. Somebody given the code keeps the ability to open the assessment and change it, and forwarding it passes the same ability on. Send it the way you would send the assessment itself.',
    null,
    { tier: 'caution', badge: 'Known limit' },
  ));
  pane.appendChild(setRow(
    'Nothing will be recalled once submitted',
    'Planned, not built. A submitted assessment will not be deleted. It will be withdrawn and left out of the statistics, which is a different thing: a copy may already exist in a backup or in somebody else\'s download, so nothing here will claim to erase it.',
    null,
  ));
}

/**
 * What this copy of the tool is, and where the work on it is written down. Somebody looking
 * for the backlog looks in Settings, which is where this puts it.
 */
function paneBuild(pane: HTMLElement) {
  pane.appendChild(el('h1', { tabindex: -1 }, [t('This build', 'Cette version')]));
  pane.appendChild(el('p', { class: 'set-lead' }, [
    'Which version of the tool and the questions you are looking at, and what is being worked on.',
  ]));

  pane.appendChild(el('dl', { class: 'kv' }, [
    el('dt', {}, ['Tool']), el('dd', { class: 'mono' }, [`v${APP_VERSION}`]),
    el('dt', {}, ['Question set']), el('dd', { class: 'mono' }, [`${rubric.id} ${rubric.version}`]),
    el('dt', {}, ['Store']), el('dd', {}, [
      isHosted() ? `Writing to ${endpointHost()}` : 'None. This build cannot send anything.',
    ]),
  ]));

  (() => {
    /**
     * What the count can and cannot say.
     *
     * coverage() sees a string only once it has passed through t(), and every string that has
     * carries French. So the fraction it can compute is always one, on a screen that may be
     * entirely English. A number that reassures a French reader wrongly is worse than no
     * number, so this row says what is done and what is not.
     */
    const c = coverage();
    pane.appendChild(setRow(
      t('Languages', 'Langues'),
      t(`English is complete. French is partly written: the home page, the header, the questionnaire, the results and the dialogs carry it, and ${c.seen} strings have been asked for on the screens visited so far. The settings, the assessor screens and the admin screens are still English. The 176 questions and the scale are data from TBS, and their French is Dan's to write.`,
        `L'anglais est complet. Le français est partiellement rédigé : la page d'accueil, l'en-tête, le questionnaire, les résultats et les fenêtres de confirmation en disposent, et ${c.seen} chaînes ont été demandées sur les écrans visités jusqu'ici. Les paramètres, les écrans de l'évaluateur et ceux de l'administration sont encore en anglais. Les 176 questions et l'échelle sont des données du SCT, et leur français revient à Dan.`),
      null,
      { tier: 'caution', badge: t('French incomplete', 'Français incomplet') },
    ));
  })();


  /**
   * The team's own working pages. They name colleagues and the state of internal decisions, so
   * they are offered to an admin and to a build with no project, which is somebody working on
   * the tool itself. They belong here and not under Documentation: they are facts about this
   * build and about what is left to do to it.
   */
  if (!firebaseConfigured() || knownRole() === 'admin') {
    pane.appendChild(el('h2', { class: 'set-sub' }, ['What is decided, and what is left']));
    pane.appendChild(el('div', { class: 'hub-cards' }, [
      linkCard({
        accent: '#4E90C8', ghost: '\u00a7',
        eyebrow: 'The build team',
        title: 'Requirements',
        body: 'Every requirement, numbered, with its state and whoever owes an answer. Decisions are written here the day they are made, and the open ones are listed at the top.',
        meta: ['Updated on every publish'],
        cta: 'Open the requirements',
        href: 'https://myermcat.github.io/tbs-earb-self-assessment-preview/requirements.html',
      }),
      linkCard({
        accent: '#C08A3E', ghost: '\u2713',
        eyebrow: 'The build team',
        title: 'Backlog',
        body: 'What is done, what is next, and what is waiting on a person. The same page the team works from.',
        meta: ['Updated on every publish'],
        cta: 'Open the backlog',
        href: 'https://myermcat.github.io/tbs-earb-self-assessment-preview/backlog.html',
      }),
    ]));
  }
}

/**
 * The pages that are not this tool, as cards rather than as rows.
 *
 * A setRow is for a setting: a sentence and a control beside it. These are destinations, and
 * a person looking for one is looking for a place and not for a paragraph. The shape is the
 * course-hub card, asked for by name: a coloured rail down the left, a mono eyebrow, a large
 * title, a line of prose, and a mono call to action with an arrow that moves on hover. You
 * find the one you want without reading anything.
 */
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M5 12h13"/><path d="M12 5l7 7-7 7"/></svg>';

const linkCard = (o: {
  accent: string; ghost: string; eyebrow: string; title: string; body: string;
  meta: string[]; cta: string; href: string;
}) => el('a', {
  class: 'hub-card', href: o.href, target: '_blank', rel: 'noopener',
  style: `--card-accent:${o.accent}`,
}, [
  el('span', { class: 'hub-ghost', 'aria-hidden': true }, [o.ghost]),
  el('span', { class: 'hub-eyebrow' }, [o.eyebrow]),
  el('h3', {}, [o.title]),
  el('p', {}, [o.body]),
  el('span', { class: 'hub-meta' }, o.meta.map((m) => el('span', {}, [m]))),
  el('span', { class: 'hub-go' }, [o.cta, el('span', { class: 'hub-arrow', html: ARROW, 'aria-hidden': true })]),
]);


/**
 * How the instrument is put together, for somebody who has to explain it.
 *
 * Its own pane and not a corner of "This build", because a version number is a fact about this
 * copy of the tool and these are about the assessment itself. The requirements and the backlog
 * are the other kind and stay where they were.
 */
function paneDocs(pane: HTMLElement) {
  pane.appendChild(el('h1', { tabindex: -1 }, [t('Documentation', 'Documentation')]));
  pane.appendChild(el('p', { class: 'set-lead' }, [
    t('How a question is filed, and the spreadsheet that decides it. Each opens in a new tab.',
      'Comment une question est class\u00e9e, et la feuille de calcul qui en d\u00e9cide. Chacune s\u2019ouvre dans un nouvel onglet.'),
  ]));
  pane.appendChild(el('div', { class: 'hub-cards' }, [
    linkCard({
      accent: '#3E9E82', ghost: '4\u00b75',
      eyebrow: 'For anybody \u00b7 no sign-in',
      title: 'Domains and categories',
      body: 'Where a question lives, what it is about, and why those are two different things. Four domains, five categories, and the arithmetic that keeps them apart.',
      meta: ['One page', 'Made to be shown to somebody'],
      cta: 'Open the explanation',
      href: 'https://myermcat.github.io/tbs-earb-self-assessment-preview/domains-and-categories.html',
    }),
    linkCard({
      accent: '#7C5CB8', ghost: '\u2261',
      eyebrow: 'For Dan \u00b7 Google Sheets',
      title: 'The question set, as a spreadsheet',
      body: 'His own four domain sheets with a Categories column to fill in, his Assessment Scale, and a Summary Dashboard that calculates. The same arithmetic as the tool, in a form he can check.',
      meta: ['Anybody with the link can comment'],
      cta: 'Open the spreadsheet',
      href: 'https://docs.google.com/spreadsheets/d/1SuEuo3_iK--XjVy0jzsvmwGhxOV5JqEeLzNIUMTY9xw/edit',
    }),
  ]));
}

function paneDanger(pane: HTMLElement) {
  pane.appendChild(el('h1', { tabindex: -1 }, [t('Start again', 'Recommencer')]));
  pane.appendChild(el('p', { class: 'set-lead' }, [
    'Nothing here can be taken back once this tab is closed.',
  ]));

  if (rescued) {
    const n = answeredCount(rescued);
    pane.appendChild(el('div', { class: 'undo-bar' }, [
      el('div', {}, [
        el('div', { class: 'small' }, [
          el('b', {}, ['Discarded. ']),
          `${n} answer${n === 1 ? '' : 's'} were erased from this browser.`,
        ]),
        el('div', { class: 'tiny dim' }, [
          'Undo is held in this tab only. Reload or close the tab and it is gone for good.',
        ]),
      ]),
      el('button', { class: 'ghost small', onclick: () => {
        // Coming back to this pane after answering more questions, Undo would have replaced
        // the newer work with the older copy and thrown the newer away silently.
        const restore = () => {
          assessment = rescued as Assessment;
          rescued = null;
          autosave(assessment);
          resetOverviewToFirstGap(rubric, assessment);
          go('settings');
        };
        guardDraft({ current: assessment, act: 'undo', onCommit: restore, after: () => paint() });
      } }, ['Undo']),
      el('button', {
        class: 'primary small',
        // This is the only copy of what was just discarded, so letting it go is a decision.
        onclick: () => confirmStep({
          tier: 'caution',
          title: 'Let the discarded copy go?',
          body: 'This is the last moment it can be brought back. After this it is gone from the browser as well.',
          stake: `${answeredCount(rescued as Assessment)} answers were in it.`,
          offer: {
            label: 'Save it as a file first',
            run: () => `Saving as ${saveAssessmentFile(rescued as Assessment)}. Check your Downloads folder.`,
          },
          commitLabel: 'Let it go',
          cancelLabel: 'Keep the undo for now',
          onCommit: () => { rescued = null; go('submit'); },
        }),
      }, ['Start filling it in']),
    ]));
  }

  const n = answeredCount(assessment);
  const anything = hasWork(assessment);
  const button = el('button', {
    class: 'danger btn-icon', disabled: !anything,
    html: `${TRASH}<span>Discard this assessment</span>`,
    /**
     * Through the one guard, like every other path that replaces what this browser holds.
     *
     * It was the last one still asking its own way: it offered a file download, never showed
     * the access code, and when the assessment was already in the store it said the online copy
     * was untouched, which reads as "nothing is lost" to somebody who is about to lose the only
     * copy of the code that reaches it.
     */
    onclick: () => guardDraft({
      current: assessment,
      act: 'discard',
      onCommit: () => {
        rescued = assessment;
        clearDraft();
        assessment = blankAssessment(rubric);
        resetOverviewToFirstGap(rubric, assessment);
        go('settings');
      },
      after: () => paint(),
    }),
  });

  pane.appendChild(setRow(
    'Discard this assessment and start again',
    anything
      ? `Erases the ${n} answer${n === 1 ? '' : 's'} this browser is holding and empties the form. A file you have already saved is not touched.`
      : 'Nothing to discard. The form is already empty.',
    button,
    { tier: 'danger', badge: 'Cannot be undone' },
  ));
}

/**
 * A folded section printed as nothing at all: hiding the <summary> hid the title, and
 * `details { display: block }` does not reveal a closed <details> in Blink or WebKit. So every
 * section is opened before the print dialog and put back afterwards.
 */
function openEverythingForPrint(): void {
  if (typeof window.addEventListener !== 'function') return;
  let reclose: HTMLDetailsElement[] = [];
  window.addEventListener('beforeprint', () => {
    reclose = [...document.querySelectorAll('details')].filter((d) => !(d as HTMLDetailsElement).open) as HTMLDetailsElement[];
    for (const d of reclose) d.open = true;
  });
  window.addEventListener('afterprint', () => {
    for (const d of reclose) d.open = false;
    reclose = [];
  });
}

/**
 * The browser's Back button should walk back through the questionnaire, since that is what a
 * reader expects of anything that looks like 21 pages.
 */
function wireHistory(): void {
  if (typeof window.addEventListener !== 'function') return;
  window.addEventListener('popstate', (e) => {
    // The questionnaire pushes its own entries carrying only a stop, so an entry without a mode
    // is read from the address instead. Both end up as one route.
    const was = (e as PopStateEvent).state as Partial<Route> | null;
    const r: Route = was?.mode && was?.side
      ? { side: was.side, mode: was.mode, stop: was.stop }
      : hashToRoute(window.location.hash);
    side = r.side;
    mode = r.mode;
    try { localStorage.setItem(SIDE_KEY, side); } catch { /* storage unavailable */ }
    if (r.stop) setStopKey(r.stop);
    paint();
  });
}

/**
 * The frame lifts once the page has scrolled under it.
 *
 * A border is the separation at rest, and a shadow is what tells you content is passing
 * beneath. Showing the shadow at the top of the page as well leaves nothing to distinguish the
 * two states, which is the state the tool was in when the frame read as part of the page.
 */
function wireScrollLift(): void {
  if (typeof window.addEventListener !== 'function') return;
  const root = document.documentElement;
  const paint = () => root.classList.toggle('scrolled', (window.scrollY || 0) > 4);
  window.addEventListener('scroll', paint, { passive: true });

  /**
   * A sentinel above the frame, watched rather than polled. Scroll events are the obvious
   * mechanism and they are not reliable everywhere: in the embedded browser used to check this
   * page, a programmatic scroll moved the page and fired nothing. An intersection observer
   * reports the same fact without depending on the event.
   */
  // It goes in the body, not in #app: every render empties #app, which took the sentinel
  // with it and left the frame flat for the rest of the visit.
  const sentinel = el('span', { class: 'top-sentinel', 'aria-hidden': true });
  document.body.insertBefore(sentinel, document.body.firstChild);
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(
      ([entry]) => root.classList.toggle('scrolled', !entry.isIntersecting),
      { threshold: 0 },
    ).observe(sentinel);
  }
  // The questionnaire's results view scrolls inside its own container, so it reports its own.
  document.addEventListener('scroll', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t.classList?.contains('body-results')) root.classList.toggle('scrolled', t.scrollTop > 4);
  }, true);
  paint();
}

setLang(bootLang());
// The badge showed nothing at all on a reloaded page, because where the work stood lived only
// in module state and a fresh tab has none. The draft itself knows, so ask it.
showWhereItStands(assessment);
openEverythingForPrint();
wireHistory();
/*
 * There used to be two listeners here pushing queued writes out as the tab closed, and before
 * them a prompt asking whether to stay. Both are gone, and for the same reason: nothing is
 * queued any more. Saving online is a button, so a closing tab has nothing in flight to rescue,
 * and the browser keeps the draft. What the tab close can lose is the difference between this
 * copy and the copy in the store, and the badge says that in words on every screen.
 */
warnGoneFromStore();
wireScrollLift();
closeMenusOnOutsideClick(document);
setRepaint(() => paint());
setSaveOnline(() => offerOnlineSave());

const check = validate(rubric);
if (!check.ok) {
  app.textContent = `The built-in rubric is invalid: ${check.problems.join('; ')}`;
} else {
  paint();
}

/**
 * A redirect sign-in comes back to a fresh load of this page with the provider's answer in the
 * address, so the last step of it belongs in the boot sequence. A build with no Firebase
 * project answers false before it touches the network, and nothing here runs.
 */
void resumeSignIn()
  .then((came) => { if (came) paint(); })
  .catch((err: unknown) => {
    app.textContent = `This page could not finish loading: ${(err as Error).message}`;
  });
