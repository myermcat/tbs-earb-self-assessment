import type { Assessment, Rubric } from './types';
import { el, clear } from './dom';
import { validate } from './rubric';
import { score } from './scoring';
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
import { openShareDialog, sharedCount } from './views-share';
import { bootLang, coverage, lang, type Lang, setLang } from './i18n';
import { endpointHost, flushWrites, goneFromStore, isHosted, listRecords, putRecord, saveOnlineNow,
  savedOnline } from './store';
import { canSignIn, currentUser, forgetRole, pageAddress, isConfigured as firebaseConfigured, knownRole, lastSignInProblem,
  loadRole, resumeSignIn, signInWithGoogle, signOut } from './firebase';
import { t } from './i18n';
import { answeredCount, APP_VERSION, autosave, blankAssessment, clearDraft, download, ensureRef,
  hasWork, lastSaveInfo, loadDraft, readJsonFiles, saveAssessmentFile, slug } from './storage';
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
    if (localStorage.getItem(SIDE_KEY) === 'assess') return { side: 'assess', mode: 'review' };
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

type SettingsPane = 'questions' | 'answers' | 'build' | 'danger';
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

const PERSON_PLUS =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
  'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="8.5" cy="7" r="4"/>' +
  '<path d="M19 8v6M22 11h-6"/></svg>';

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
 * Offer to start keeping this at TBS.
 *
 * The window says what an assessor will and will not do with an unfinished assessment, because
 * that is the question somebody actually has before they hand work over early. Nothing about
 * this is reversible in the sense that matters: the copy goes, and only an admin can remove it.
 */
function offerOnlineSave(): void {
  const r = score(rubric, assessment);
  const left = r.scoreable - r.answered;
  const done = left <= 0;
  confirmStep({
    tier: 'caution',
    title: done
      ? t('Keep this at TBS?', 'Conserver ceci au SCT?')
      : t('Keep this at TBS before it is finished?', 'Conserver ceci au SCT avant que ce soit terminé?'),
    body: done
      ? `All ${r.scoreable} questions are answered. This is the only time you press this. From now on your work is written to ${endpointHost()} a few seconds after you stop typing, on its own, so a closed tab or a lost laptop costs you nothing.`
      : `${left} of ${r.scoreable} questions have no answer yet. Your assessor will be able to read it, they cannot change anything in it until you say it is finished, and they are told to look only when you say so. This is also the only time you press this: from now on your work is written to ${endpointHost()} a few seconds after you stop typing, on its own.`,
    stake: t('Everything in this tool is unclassified. By keeping it at TBS you are saying this is too.',
      'Tout dans cet outil est non classifié. En le conservant au SCT, vous affirmez que ceci l\u2019est aussi.'),
    alt: {
      label: t('No, this browser is enough for now', 'Non, ce navigateur suffit pour l\u2019instant'),
      run: () => {
        assessment.meta.onlineDeclined = true;
        autosave(assessment);
        return t('Kept on this machine. The offer stays in the header.',
          'Conservé sur cet appareil. L\u2019offre reste dans l\u2019en-tête.');
      },
    },
    commitLabel: done
      ? t('Yes, keep it at TBS', 'Oui, conserver au SCT')
      : t('Yes, keep it at TBS now', 'Oui, conserver au SCT maintenant'),
    cancelLabel: t('Not yet', 'Pas encore'),
    onCommit: () => {
      void saveOnlineNow(assessment).then((res) => {
        if (!res.ok) alert(res.problem);
        paint();
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
      side === 'assess' && !bare
        ? el('span', { class: 'side-badge' }, [
            !assessorName.trim() ? t('Assessor', 'Évaluateur')
              : firebaseConfigured() ? assessorName.trim()
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
            }, [t('Share access', 'Gérer l\u2019accès')]),
            el('button', {
              class: 'menu-item',
              onclick: () => handOff(assessment),
            }, [t('Email this assessment', 'Envoyer cette évaluation par courriel')]),
            el('button', {
              class: 'menu-item',
              onclick: () => { saveAssessmentFile(assessment); paint(); },
            }, [t('Download as a file', 'Télécharger comme fichier')]),
            el('button', {
              class: 'menu-item',
              onclick: () => window.print(),
            }, [t('Print or save as PDF', 'Imprimer ou enregistrer en PDF')]),
          ]),
        ])
      : null,
    el('div', { class: 'topbar-right' }, [
      // Where the work is kept, on every screen, and one click from the detail.
      bare ? null : saveBadge(() => openSettings('answers')),
      /**
       * Signing in is not a gate on this side. A submitter can answer all 176 questions with no
       * account at all. What the account buys is that the work is kept at TBS as they go, so the
       * offer is beside the save state, where somebody wondering where their work lives is
       * already looking.
       */
      !bare && isHosted() && canSignIn() && !currentUser()
        ? el('button', {
            class: 'linkish small',
            onclick: () => { void signInWithGoogle().then((went) => { if (!went) paint(); }); },
          }, [t('Sign in to save online', 'Se connecter pour enregistrer en ligne')])
        : null,
      !bare && isHosted() && currentUser() && !savedOnline(assessment) && hasWork(assessment)
        ? el('button', { class: 'linkish small', onclick: () => offerOnlineSave() }, [
            t('Save online', 'Enregistrer en ligne'),
          ])
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
       * Share, where a document editor puts it.
       *
       * Filling in 176 questions is not a job for one person, and their assessor has to be able
       * to read it before it is finished. It appears once there is a document to share, which
       * is the questionnaire and the results, and it says on its face that it is a mockup.
       */
      !bare && side === 'submit' && (mode === 'submit' || mode === 'results')
        ? el('button', {
            class: 'ghost small share-btn',
            title: t('Manage who can see and work on this assessment',
              'Gérer qui peut voir cette évaluation et y travailler'),
            onclick: () => openShareDialog(assessment, currentUser()?.email ?? assessorName, () => paint()),
          }, [
            el('span', { class: 'share-ico', html: PERSON_PLUS }),
            t('Share', 'Partager'),
            sharedCount(assessment) ? el('span', { class: 'ref-chip' }, [String(sharedCount(assessment))]) : null,
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
      firebaseConfigured() && currentUser()
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
      el('span', {}, [`  \u00b7  rubric ${rubric.version}  \u00b7  v${APP_VERSION}`]),
    ]);
  }
  return el('footer', { class: 'sitefoot' }, [
    el('span', {}, ['Everything you enter stays on this machine. ']),
    el('button', { class: 'linkish', onclick: () => openSettings('answers') }, ['How that works']),
    el('span', {}, [`  ·  rubric ${rubric.version}  ·  v${APP_VERSION}`]),
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
        el('span', { class: 'or' }, [t('or', 'ou')]),
        /**
         * Opening a file replaces whatever this browser is holding, so the question comes
         * before the file picker rather than after it: being asked once a file is chosen
         * reads as the tool changing its mind. Both assessments belong to the same person,
         * so the wording is about which one, never about whose.
         */
        (() => {
          const picker = el('input', {
            type: 'file', accept: '.json', hidden: true,
            onchange: async (e: Event) => {
              const input = e.target as HTMLInputElement;
              const f = input.files;
              if (!f?.length) return;
              const [item] = await readJsonFiles(f);
              input.value = '';
              const a = item.data as Assessment;
              if (a?.fileType !== 'gc-arch-assessment') {
                alert(t(`${item.file} is not a self-assessment file.`, `${item.file} n\u2019est pas un fichier d\u2019auto-évaluation.`));
                return;
              }
              assessment = ensureRef(a);
              autosave(assessment);
              go('submit');
            },
          }) as HTMLInputElement;

          const open = () => picker.click();

          return el('span', { class: 'openfile' }, [
            el('button', {
              class: 'linkish',
              onclick: () => {
                if (!hasWork(assessment)) { open(); return; }
                const n = answeredCount(assessment);
                confirmStep({
                  tier: 'danger',
                  title: 'Open a different assessment?',
                  body: `This browser is holding one with ${n} answer${n === 1 ? '' : 's'} in it. Opening another replaces it, and only one can be here at a time.`,
                  stake: 'Whatever is here and not already in a file of its own is gone.',
                  offer: {
                    label: 'Save this one as a file, then choose the other',
                    commits: true,
                    run: () => `Saving as ${saveAssessmentFile(assessment)}.`,
                  },
                  commitLabel: 'Choose the other one without saving this',
                  cancelLabel: 'Keep this one',
                  onCommit: open,
                });
              },
            }, [t('open a saved assessment', 'ouvrir une évaluation enregistrée')]),
            picker,
          ]);
        })(),
      ]),
      started ? draftNote(draft!, total) : null,
    ]),
    el('div', { class: 'hero-art', 'aria-hidden': true }, [
      el('span', { class: 'rung r1' }), el('span', { class: 'rung r2' }),
      el('span', { class: 'rung r3' }), el('span', { class: 'rung r4' }),
      el('span', { class: 'rung r5' }),
    ]),
  ]));

  root.appendChild(el('p', { class: 'crossover tiny dim' }, [
    t('Reviewing submissions for TBS? ', 'Vous examinez des soumissions pour le SCT? '),
    el('button', { class: 'linkish', onclick: () => setSide('assess') }, [t('Open the assessor view', 'Ouvrir la vue de l\u2019évaluateur')]),
  ]));
  // The portfolio view has no other way in from here, and somebody who runs the programme
  // should not have to find it through the assessor side.
  root.appendChild(el('p', { class: 'crossover tiny dim' }, [
    t('Running the programme? ', 'Vous dirigez le programme? '),
    el('button', { class: 'linkish', onclick: () => setSide('assess', true, 'admin') }, [t('Open the admin view', 'Ouvrir la vue de l\u2019administrateur')]),
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
            el('a', {
              href: 'https://myermcat.github.io/tbs-earb-self-assessment-preview/',
              target: '_blank', rel: 'noopener',
            }, ['myermcat.github.io/tbs-earb-self-assessment-preview']),
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
  function paintPane() {
    clear(nav);
    nav.appendChild(el('span', { class: 'set-navgroup' }, [t('Settings', 'Paramètres')]));
    nav.appendChild(navRow(t('Question set', 'Jeu de questions'), 'questions'));
    nav.appendChild(navRow(t('Your answers', 'Vos réponses'), 'answers'));
    nav.appendChild(navRow(t('This build', 'Cette version'), 'build'));
    nav.appendChild(el('span', { class: 'set-navsep', 'aria-hidden': true }));
    nav.appendChild(navRow(t('Start again', 'Recommencer'), 'danger', true));

    clear(pane);
    if (settingsPane === 'questions') paneQuestions(pane);
    else if (settingsPane === 'answers') paneAnswers(pane);
    else if (settingsPane === 'build') paneBuild(pane);
    else paneDanger(pane);

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
      if (!hasWork(assessment)) { swap(); return; }
      confirmDestructive({
        tier: 'caution',
        title: `Switch to this set and clear ${answeredCount(assessment)} answers?`,
        body: 'Answers belong to the set they were given against, so they cannot be carried across. Assessments already submitted keep the set they were answered against and are not touched.',
        saveLabel: 'Save a file, then switch',
        commitLabel: 'Switch anyway',
        cancelLabel: 'Keep my answers',
        onCommit: swap,
      });
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
      me ? 'Signed in means saved at TBS' : 'Signing in keeps your work at TBS',
      `Your work is written to ${endpointHost()} a few seconds after you stop typing, so a closed tab or a broken laptop costs you nothing. Up to twenty seconds of the newest work exists only in this browser, which is the gap between writes that keeps the shared store inside its daily allowance. Telling TBS it is ready to review is a separate act, at the bottom of My results, and it saves nothing new: it puts your assessment in front of an assessor.`,
      null,
    ));
    pane.appendChild(setRow(
      'Nothing goes until you have said how your evidence is marked',
      'The questionnaire asks that before it will save a file, and the same answer gates what goes to TBS. Until it is answered, everything stays on this machine.',
      null,
    ));
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
      'Nothing is sent anywhere in this copy',
      'This build was made with no store, so the page cannot reach the network at all: it carries a browser rule that blocks every outbound request. Saving to a file and sending that file is the whole route.',
      null,
    ));
  }
  pane.appendChild(setRow(
    'Sharing records addresses and does nothing else',
    'Adding a teammate or an assessor writes their address into your assessment and shows it on the sharing list. No email is sent and no access is granted. Both need a change to the store\u2019s rules at TBS, published by whoever owns the project.',
    null,
    { tier: 'caution', badge: 'Mockup' },
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

  // The requirements and the backlog are the build team's own working pages. They name
  // colleagues and the state of internal decisions, so they are offered to an admin and to a
  // build with no project, which is somebody working on the tool itself.
  if (!firebaseConfigured() || knownRole() === 'admin') {
  pane.appendChild(setRow(
    'The requirements specification',
    'Every requirement, numbered, with its state and whoever owes an answer. Decisions are written here the day they are made, and the open ones are listed at the top.',
    el('a', {
      class: 'ghost',
      href: 'https://myermcat.github.io/tbs-earb-self-assessment-preview/requirements.html',
      target: '_blank', rel: 'noopener',
    }, ['Open the requirements']),
  ));
  pane.appendChild(setRow(
    'The backlog',
    'What is done, what is next, and what is waiting on a person. It is the same page the team works from, and it opens in a new tab.',
    el('a', {
      class: 'ghost',
      href: 'https://myermcat.github.io/tbs-earb-self-assessment-preview/backlog.html',
      target: '_blank', rel: 'noopener',
    }, ['Open the backlog']),
  ));
  }
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
        if (!hasWork(assessment)) { restore(); return; }
        confirmStep({
          tier: 'danger',
          title: `Put the discarded copy back over ${answeredCount(assessment)} answers?`,
          body: 'You have answered questions since that discard. Restoring the old copy replaces them, and they are not held anywhere else.',
          stake: 'The newer answers cannot be recovered afterwards.',
          commitLabel: 'Restore the old copy',
          cancelLabel: 'Keep what I have now',
          onCommit: restore,
        });
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
    onclick: () => confirmDestructive({
      tier: 'danger',
      title: n > 0 ? `Discard ${n} answer${n === 1 ? '' : 's'}?` : 'Discard this assessment?',
      body: assessment.id && isHosted() && currentUser()
        ? `Discarding empties the form and erases the draft this browser is holding. The questions themselves stay the same. The copy already kept at ${endpointHost()} is not touched: an admin is the only person who can remove that one, so ask yours if it has to go.`
        : 'Discarding empties the form and erases the draft this browser is holding. The questions themselves stay the same.',
      saveLabel: 'Save a file, then discard',
      commitLabel: 'Discard permanently',
      cancelLabel: 'Keep my answers',
      onCommit: () => {
        rescued = assessment;
        clearDraft();
        assessment = blankAssessment(rubric);
        resetOverviewToFirstGap(rubric, assessment);
        go('settings');
      },
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

/* ------------------------------------------------------------------------------------------
   The confirmation.
   ------------------------------------------------------------------------------------------ */

interface ConfirmOpts {
  tier: 'caution' | 'danger';
  title: string;
  body: string;
  saveLabel: string;
  commitLabel: string;
  cancelLabel: string;
  onCommit: () => void;
}

/**
 * Native <dialog> brings the focus trap, Escape, the inert background and focus restoration,
 * with no dependency. jsdom has no showModal, so there is a plain-confirm fallback: without it
 * every test that reaches Settings would throw.
 *
 * The recommendation is the first button and the only filled one. Saving never auto-discards,
 * because a browser download has no completion event: the person confirms they have the file,
 * which is the only honest thing a page that cannot see the filesystem can do.
 */
function confirmDestructive(o: ConfirmOpts): void {
  const dlg = document.createElement('dialog') as HTMLDialogElement;

  dlg.className = `confirm tier-${o.tier}`;
  const actions = el('div', { class: 'cf-actions' });
  const body = el('div', { class: 'cf-body' }, [el('p', {}, [o.body])]);

  const stake = () => {
    const last = lastSaveInfo();
    return last
      ? el('p', { class: 'cf-stake ok' }, [
          `You saved ${last.name} at ${new Date(last.at).toLocaleTimeString()}. `,
          'If you still have that file, you can open it again from the start page.',
        ])
      : el('p', { class: 'cf-stake' }, [
          'This browser is holding the only copy. Nothing has been saved to a file since this page was opened.',
        ]);
  };
  let stakeEl = stake();
  body.appendChild(stakeEl);

  const close = () => { try { dlg.close(); } catch { /* already closed */ } dlg.remove(); };

  const paintActions = (saved: boolean) => {
    clear(actions);
    if (!saved) {
      actions.appendChild(el('button', { class: 'primary cf-wide', onclick: () => {
        const name = saveAssessmentFile(assessment);
        const fresh = el('p', { class: 'cf-stake ok' }, [
          `Saving as ${name}. Check your Downloads folder. `,
          'If your browser asked where to put it and you cancelled, save it again.',
        ]);
        stakeEl.replaceWith(fresh);
        stakeEl = fresh;
        paintActions(true);
      } }, [o.saveLabel]));
      actions.appendChild(el('button', { class: 'danger cf-wide', onclick: () => { close(); o.onCommit(); } }, [
        o.commitLabel,
      ]));
    } else {
      actions.appendChild(el('button', { class: 'danger-solid cf-wide', onclick: () => { close(); o.onCommit(); } }, [
        'I have the file. ' + o.commitLabel.toLowerCase(),
      ]));
      actions.appendChild(el('button', { class: 'cf-wide', onclick: () => { saveAssessmentFile(assessment); } }, [
        'Save it again',
      ]));
    }
    // The safest control takes focus, so Enter and Escape both cancel.
    const cancel = el('button', { class: 'cf-wide', onclick: close }, [o.cancelLabel]);
    actions.appendChild(cancel);
    setTimeout(() => cancel.focus?.(), 0);
  };
  paintActions(false);

  dlg.appendChild(el('div', { class: 'cf-head' }, [el('h2', { class: 'cf-title' }, [o.title])]));
  dlg.appendChild(body);
  dlg.appendChild(actions);
  dlg.addEventListener('close', () => dlg.remove());
  closeOnOutsideClick(dlg, close);
  document.body.appendChild(dlg);
  openDialog(dlg);
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
openEverythingForPrint();
wireHistory();
/**
 * The floor between writes means the newest twenty seconds of work can exist only in this
 * browser. A tab closing is the one moment that matters, so it pushes rather than waits.
 */
if (typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', () => { void flushWrites(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushWrites();
  });
  /*
   * There used to be a prompt here, asking whether to stay when work had never been saved
   * online. It is gone, and the reasoning is hers: the browser is holding the assessment,
   * nothing is lost by closing the tab, and somebody who has not saved online has not asked to.
   * A dialog on the way out of a page that loses nothing teaches people to dismiss dialogs.
   */
}
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
