/**
 * The build that gets published, driven signed in.
 *
 * Every other suite builds with no store, so `isConfigured()` is false and none of the hosted
 * branches ever run. That is how a page that went blank the moment anybody signed in reached
 * the live site with 556 green assertions behind it. This suite builds with a placeholder
 * project, seeds a session in storage the way a real sign-in does, answers Firestore from a
 * stub, and asserts the screens a signed-in person actually meets.
 *
 * Nothing here touches the network: fetch is replaced before the bundle runs, and every call
 * it does not recognise fails the suite rather than escaping.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/index.html', 'utf8');
const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));

const SESSION = 'gc-arch-assessment:firebase-session';
const SIDE = 'gc-arch-assessment:side';
const DRAFT = 'gc-arch-assessment:draft';
const ME = 'assessor@tbs-sct.gc.ca';

/** One submission, in the shape Firestore hands back. Enough of it to score and to name. */
function submission(ref, name) {
  return {
    fileType: 'gc-arch-assessment',
    ref,
    id: `doc-${ref}`,
    rubric: { id: rubric.id, version: rubric.version },
    // Marked, because the export window has to name the marking and the sheet has no column
    // for it, which is the one thing that window exists to say.
    initiative: { name, department: 'Fisheries and Oceans Canada', contact: 'someone@dfo-mpo.gc.ca', classification: 'Protected B' },
    answers: {},
    meta: { submittedAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
  };
}

/** Firestore's own encoding, so the page's decoder is exercised rather than bypassed. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
  const fields = {};
  for (const [k, val] of Object.entries(v)) fields[k] = toValue(val);
  return { mapValue: Object.keys(fields).length ? { fields } : {} };
}
const asDoc = (a) => ({ name: `projects/p/databases/(default)/documents/assessments/${a.id}`, fields: toValue(a).mapValue.fields });

/**
 * One page, booted with whatever storage and whatever store answer a case needs.
 * `listAnswer` decides what the assessments list does: a page of documents, or a refusal.
 */
async function boot({ session = null, side = null, listAnswer = { documents: [] }, role = null, hash = '', url = null, draft = null, people = null } = {}) {
  const seen = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: url ?? `https://example.gc.ca/tool/${hash}`,
    pretendToBeVisual: true,
    beforeParse(w) {
      // A file:// origin is opaque, so jsdom throws on any storage access. That is the same
      // thing a browser does in a locked-down private window, and the tool has to survive it.
      try {
        if (session) w.localStorage.setItem(SESSION, JSON.stringify(session));
        if (side) w.localStorage.setItem(SIDE, side);
        if (draft) w.localStorage.setItem(DRAFT, JSON.stringify(draft));
      } catch { /* no storage on this origin */ }
      w.scrollTo = () => {};
      w.alert = () => {};
      w.print = () => {};
      w.fetch = async (url, init) => {
        const href = String(url);
        seen.push({ href, method: init?.method ?? 'GET' });
        // The access list is a collection read; a role check is one document by name.
        const peopleList = /\/roles\?/.test(href);
        const roles = href.includes('/roles/') && !peopleList;
        const body = peopleList
          ? { documents: (people ?? []).map((p) => ({
              name: `projects/x/databases/(default)/documents/roles/${encodeURIComponent(p.email)}`,
              fields: Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'email')
                .map(([k, v]) => [k, { stringValue: String(v) }])),
            })) }
          : roles
          ? (role ? { fields: { role: { stringValue: role } } } : { error: { code: 404 } })
          : href.includes('/assessments')
            ? (listAnswer.error
                ? { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } }
                : listAnswer)
            : {};
        const status = peopleList ? 200
          : roles ? (role ? 200 : 404)
          : href.includes('/assessments') && listAnswer.error ? 403 : 200;
        // jsdom's window has no Response, so the shape the page reads is supplied directly.
        return {
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
          json: async () => body,
          text: async () => JSON.stringify(body),
        };
      };
    },
  });
  // Two turns: one for the boot paint, one for the pool answer and the repaint it asks for.
  await new Promise((r) => setTimeout(r, 120));
  return { dom, doc: dom.window.document, seen };
}

const live = { email: ME, idToken: 'seeded', refreshToken: 'seeded-refresh', expiresAt: Date.now() + 3600e3 };
// The bundle is an inline script inside <body>, so body.textContent carries every string
// literal in the program. Read what was rendered instead.
const body = (doc) => (doc.querySelector('#app')?.textContent ?? '').replace(/\s+/g, ' ').trim();

console.log('\nThe published build, signed in\n');

/* --------------------------------------------------------------------------------------- */
{
  // The defect that shipped: a session existed, the gate did not know it, and paint() called
  // itself until the stack gave out. The page was blank and stayed blank on every reload.
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'assessor' });
  const app = doc.querySelector('#app');
  ok('a signed-in assessor gets a page at all', app.children.length > 0, `children=${app.children.length}`);
  ok('and it is not the sign-in screen', !/Continue with Google/.test(body(doc)));
  /**
   * The address is in the account chip and nowhere else on the bar. It used to be in both the
   * chip and the badge beside the title, which is one fact printed twice at opposite ends of
   * one header, charging the width for it.
   */
  ok('the account chip holds the address', doc.querySelector('.account-menu')?.textContent?.includes(ME),
     doc.querySelector('.account-menu')?.textContent);
  ok('and the badge beside the title says which side you are on, not who you are',
     doc.querySelector('.side-badge')?.textContent?.trim() === 'Assessor',
     doc.querySelector('.side-badge')?.textContent);
  ok('so the address appears once in the header',
     (doc.querySelector('.topbar')?.textContent?.split(ME).length ?? 0) === 2,
     doc.querySelector('.topbar')?.textContent);
  ok('and does not call a checked account unverified', !/unverified/i.test(body(doc)));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // The second defect: the screen only ever showed files dragged onto it, so a submission
  // sitting in the store was reported as an empty pool.
  const rows = [submission('AB12', 'Licensing Renewal'), submission('CD34', 'Fleet Scheduling')];
  const { doc, dom, seen } = await boot({
    session: live, side: 'assess', role: 'assessor', listAnswer: { documents: rows.map(asDoc) },
  });
  ok('the assessor screen asks the store', seen.some((r) => r.href.includes('/assessments')));
  ok('and lists what came back', body(doc).includes('Licensing Renewal'), body(doc).slice(0, 160));
  ok('both of them', body(doc).includes('Fleet Scheduling'));
  ok('and stops saying the pool is empty', !/Nothing assigned to you yet/.test(body(doc)));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  /**
   * The assessor screen, on the same ratio as the submitter's results page.
   *
   * It was running at 0.81: a card margined .85rem below and padded 1.05rem inside, so two
   * unrelated blocks were closer together than a heading was to its own content. Reported as
   * "all the buttons in there are very close to the text", which is what that inversion looks
   * like from the outside. These are computed lengths, so the gate cannot pass on a rule that
   * another rule is cancelling: the first version of the fix reset all four margins on a
   * selector that outranked the one setting the gap, and measured 0px.
   */
  const rows = [submission('AB12', 'Licensing Renewal'), submission('CD34', 'Fleet Scheduling')];
  const { doc, dom } = await boot({
    session: live, side: 'assess', role: 'assessor', listAnswer: { documents: rows.map(asDoc) },
  });
  const w = dom.window;
  const px = (el, prop) => parseFloat(w.getComputedStyle(el)[prop]) || 0;
  const kids = [...doc.querySelector('main').children];
  ok('the assessor body is marked as one', doc.querySelector('main').className.includes('body-review'));
  const between = kids.length > 1 ? px(kids[1], 'marginTop') : 0;
  const within = px(kids[0], 'paddingTop');
  ok('two blocks are further apart than a heading is from its own content',
     between >= 2.2 * within, `${between}px between, ${within}px within`);
  const h2 = doc.querySelector('main .card h2');
  ok('and a heading has room under it',
     px(h2.nextElementSibling, 'marginTop') > 0, String(px(h2?.nextElementSibling, 'marginTop')));

  /**
   * Nothing destroys an assessor's work from a toolbar.
   *
   * There used to be a Clear beside the export, the same size and the same colour, which
   * emptied every submission and every score, verdict and reason typed against them. The audit
   * lives in this browser and in a file somebody may not have saved, so it was the only copy.
   * Nothing covered it, which is why it survived this long.
   */
  const labels = [...doc.querySelectorAll('button')].map((b) => b.textContent.trim());
  /**
   * The table has to fit its box, and the row menu has to escape it.
   *
   * Reported together, and they are the same rule: `.table-wrap { overflow-x: auto }` made the
   * twelve-column table scroll sideways inside a 940px column, and the same declaration made
   * the box clip in both directions, so the row menu's pop-up was cut off below and to the
   * right of it. The column is 1200px now and the wrap does not clip above 900px.
   */
  const wrap = doc.querySelector('.body-review .table-wrap');
  ok('the table is in its own box', !!wrap);
  /**
   * jsdom has no layout and does not evaluate @media in getComputedStyle, so this one is read
   * off the stylesheet. It is read as "the last word on the subject" rather than grepped for a
   * declaration, because a gate written the lazy way once passed on a page where a later rule
   * was cancelling the rule it had found.
   */
  const css = html.slice(html.indexOf('.table-wrap'));
  const lastWord = [...css.matchAll(/\.(?:body-review |body-admin )?\.?table-wrap[^{}]*\{([^}]*)\}/g)]
    .map((m) => m[1]).filter((d) => /overflow/.test(d)).pop() ?? '';
  ok('and above phone width the box does not clip what opens inside it',
     /overflow:\s*visible/.test(lastWord), lastWord);
  ok('and the menu is painted above the rows it opens over',
     /\.row-menu \.set-menu-pop\s*\{[^}]*z-index:\s*\d/.test(html));
  ok('the assessor column is wider than the reading column, because it holds a table',
     parseFloat(w.getComputedStyle(doc.querySelector('.body-review')).maxWidth) >= 1200,
     w.getComputedStyle(doc.querySelector('.body-review')).maxWidth);
  ok('and nothing in the table refuses to wrap',
     w.getComputedStyle(doc.querySelector('.triage td')).overflowWrap === 'anywhere');

  ok('there is no Clear on the toolbar', !labels.includes('Clear'), labels.slice(0, 12).join(','));
  ok('the export is on a toolbar above the table', !!doc.querySelector('.res-toolbar .btn-icon'));
  ok('and it carries an icon', !!doc.querySelector('.res-toolbar .btn-icon svg'));
  /**
   * And no control on a row removes anything at all.
   *
   * This menu carried "Take it off this list", which dropped the row from this browser and left
   * the record in the store. It was renamed once from "Close this one" because somebody pressed
   * it meaning to remove an assessment and watched the row go. The rename did not fix it, and it
   * was reported again as still ambiguous, so the control is gone. Reloading the pool brings the
   * list back, and deleting lives in the danger zone.
   */
  const rowActs = [...doc.querySelectorAll('.row-acts .row-menu .menu-item')];
  ok('no control on a submission row removes it from anything',
     !rowActs.some((b) => /take it off|close this|remove|delete/i.test(b.textContent)),
     rowActs.map((b) => b.textContent).join(' | '));

  /**
   * And nothing on this toolbar closes everything at once.
   *
   * There was a "Close all and erase the audit" here. It touched nobody's assessment, and it
   * read as though it deleted every submission in the pool; what it actually erased was the
   * assessor's own scores, verdicts and reasons, which live in this browser and nowhere else.
   * Reported in those words: a very dangerous button for a thing nobody wants to do.
   */
  ok('and nothing here closes every submission at once',
     ![...doc.querySelectorAll('.res-toolbar button')].some((b) => /close all/i.test(b.textContent)),
     [...doc.querySelectorAll('.res-toolbar button')].map((b) => b.textContent.trim()).join(' | '));
  ok('and nothing on this toolbar is a destroying control at all',
     !doc.querySelector('.res-toolbar .menu-danger, .res-toolbar .danger'));

  // Exporting names what goes out, including the thing the sheet cannot carry.
  doc.querySelector('.res-toolbar .btn-icon').click();
  await new Promise((r) => setTimeout(r, 40));
  const ask = doc.querySelector('dialog.confirm');
  ok('exporting asks first', !!ask);
  ok('on a window that is not dressed as a deletion', ask.className.includes('tier-plain'), ask.className);
  ok('and says the sheet records no marking', /No column in the sheet records/.test(ask.textContent));
  ok('and names the marking to treat the file as', /Protected B/.test(ask.textContent));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // A refusal is not an empty pool. Being told the pool is empty when the truth is that
  // nobody has granted a role sends an assessor looking for the submission instead of asking
  // for access, and the store answers 403 for exactly that case.
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'assessor', listAnswer: { error: true } });
  const t = body(doc);
  ok('a refusal says the account cannot read the pool', /cannot read the pool/i.test(t), t.slice(0, 200));
  ok('and quotes what the store said', /insufficient permissions/i.test(t));
  ok('and does not claim the pool is empty', !/Nothing assigned to you yet/.test(t));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // Nothing used to read the role, so every account was offered the admin screen and the
  // delete button, and Firestore did the refusing after the click.
  const { doc, dom, seen } = await boot({ session: live, side: 'assess' });
  ok('the role is asked for', seen.some((r) => r.href.includes('/roles/')));
  ok('and a submitter is not offered the admin tab',
     !/Admin/.test(body(doc)), body(doc).slice(0, 140));
  dom.window.close();
}

{
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'admin' });
  ok('an admin is', /Admin/.test(body(doc)), body(doc).slice(0, 140));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // Signing in and being allowed in are two different things. An address nobody has added used
  // to reach the assessor screen and be told the pool was empty, which reads as a lost
  // submission rather than a missing role.
  const { doc, dom, seen } = await boot({ session: live, side: 'assess' });
  const t = body(doc);
  ok('an address nobody has added is told so', /does not have access/i.test(t), t.slice(0, 160));
  ok('and is given the address to send to an admin', t.includes(ME));
  ok('and a way back to the home page', /Go to the home page/.test(t));
  ok('and a way to try another account', /different account/i.test(t));
  ok('and the cat is on it', !!doc.querySelector('.no-access .pool-art svg'));
  ok('and it does not ask the store for a list it cannot have',
     !seen.some((r) => /assessments\?/.test(r.href)), JSON.stringify(seen).slice(0, 160));
  dom.window.close();
}

{
  /**
   * One rung. An assessor reaches every screen on this side, the admin view included.
   *
   * There used to be an admin above the assessor, and this assertion checked the assessor was
   * turned back from the admin view. It bought a separation nobody asked for and it cost a
   * lockout: taking a grant back needed admin, and an assessor could write a role document
   * naming an admin's own address, after which the admin had no way in. Asked for in these
   * words: basically there are only two functionalities, submitter and assessor.
   */
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'assessor', hash: '#assessor/admin' });
  const t = body(doc);
  ok('an assessor reaches the admin view, because there is no rung above assessor',
     !/does not have access/i.test(t) && !/admin view is for admins/i.test(t), t.slice(0, 160));
  ok('and it is the portfolio they land on', /Portfolio/.test(t), t.slice(0, 160));
  dom.window.close();
}

{
  /**
   * An account whose access was taken away is told that, and not told it was never added.
   *
   * Removal marks the record rather than deleting it, so this is a state the store can report
   * and the screen has to be able to name. The two read very differently to the person: one is
   * "ask somebody to add you", the other is "somebody removed you".
   */
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'removed' });
  const t = body(doc);
  ok('a removed account is told it no longer has access', /no longer has access/i.test(t), t.slice(0, 160));
  ok('and is told any assessor can put it back', /any assessor can put it back/i.test(t), t.slice(0, 200));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // Signed out, the same build has to draw the real sign-in and reach nothing at all.
  const { doc, dom, seen } = await boot({ side: 'assess' });
  ok('signed out, the sign-in card draws', /Continue with Google/.test(body(doc)));
  ok('and nothing is fetched before somebody signs in', seen.length === 0, JSON.stringify(seen).slice(0, 200));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // The same configured build, opened from a file. There is no address for a provider to
  // return to, so the button used to be offered and then do nothing at all, because the
  // refusal went into a promise nobody was reading.
  // Storage is unavailable on this origin, so the address is what puts us on the assessor side.
  const { doc, dom } = await boot({ url: 'file:///Users/someone/dist/index.html#assessor' });
  const t = body(doc);
  // The first wording said "This copy was opened from a file", which reads as a claim about the
  // assessment and names nothing, so there was nothing to act on. It states what it observed.
  ok('the screen says sign-in needs a web address', /needs a web address/i.test(t), t.slice(0, 220));
  ok('and names the address it was loaded from', /file:\/\/\//.test(t));
  ok('and points at the published one', /myermcat\.github\.io/.test(t));
  const google = [...doc.querySelectorAll('.signin-providers button')]
    .find((b) => /Continue with Google/.test(b.textContent));
  ok('and the Google button is dead rather than silent', google?.disabled === true);
  dom.window.close();
}

{
  // Microsoft is on the screen and is not built. It has to read as unfinished before it is
  // pressed, which means disabled and labelled.
  const { doc, dom } = await boot({ side: 'assess' });
  const ms = [...doc.querySelectorAll('.signin-providers button')]
    .find((b) => /Microsoft/.test(b.textContent));
  ok('the Microsoft button is disabled', ms?.disabled === true);
  // A badge beside it was noise. Unclickable, and the whole story on hover.
  ok('and says on hover that it is a mockup', /Mockup/.test(ms?.getAttribute('title') ?? ''),
     ms?.getAttribute('title') ?? '');
  ok('and what it would take to build', /Azure rights/.test(ms?.getAttribute('title') ?? ''));
  ok('and carries no badge beside it', !doc.querySelector('.signin-providers .badge-mockup'));
  ok('and the sign-in card no longer calls itself a prototype',
     !/Prototype/.test(doc.querySelector('.signin')?.textContent ?? ''));
  dom.window.close();
}

{
  // The sign-in screen is not the place for a save badge, an offer to sign in, or a breadcrumb
  // to submissions. None of those are questions this person has been allowed to ask yet.
  const { doc, dom } = await boot({ side: 'assess' });
  const right = doc.querySelector('.topbar-right');
  const kinds = [...right.children].map((n) => n.className.split(' ')[0]);
  ok('the sign-in header carries no save badge', !kinds.includes('save-state'), kinds.join(','));
  ok('and no breadcrumb', !kinds.includes('path'), kinds.join(','));
  ok('and the language link is still there', kinds.includes('lang-link'), kinds.join(','));
  dom.window.close();
}

{
  // Signed in, the language link comes before the account menu.
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'admin' });
  const kinds = [...doc.querySelector('.topbar-right').children].map((n) => n.className.split(' ')[0]);
  ok('the language link is to the left of the account menu',
     kinds.indexOf('lang-link') < kinds.indexOf('set-menu'), kinds.join(','));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // A submitter is not an assessor, and the home page has to work signed in or out.
  const { doc, dom } = await boot({ session: live });
  ok('the submitter home page renders for a signed-in person', /Assess your own architecture/.test(body(doc)));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  /**
   * What the button on the results page claims, and what it does.
   *
   * It was called "Ask an assessor to review it", over a paragraph saying it put the assessment
   * in front of one. Nothing is put in front of anybody: it writes a mark on the record, and an
   * assessor reading the pool sees the mark. The user asked what the button actually did, which
   * is the question a name like that produces. Telling somebody stays a thing a person does,
   * outside the tool, and the code is what they need to do it.
   */
  const mine = {
    fileType: 'gc-arch-assessment', formatVersion: 1, ref: 'ZZ99', id: 'KFRM92TXBQ7H',
    rubric: { id: rubric.id, version: rubric.version, title: 'x' },
    initiative: {
      name: 'Licensing Renewal', department: 'DFO', contact: ME,
      lifecycleStage: 'beta', summary: 'A thing.', classification: 'Unclassified',
    },
    answers: {},
    meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test', savedOnlineAt: 'x', owner: ME },
  };
  const { doc, dom } = await boot({ session: live, side: 'submit', hash: '#results', draft: mine });
  const said = body(doc);
  const labels = [...doc.querySelectorAll('.submit-box button')].map((b) => b.textContent.trim());

  ok('the results page offers to mark it ready', labels.some((l) => /Mark it ready to review/.test(l)),
     labels.join(' | '));
  ok('and never claims to ask anybody anything', !/Ask an assessor/i.test(said));
  ok('it says what the mark does', /beside this assessment in the assessor/i.test(said), said.slice(0, 200));
  ok('and that the tool sends nothing', /sends nothing and tells nobody/i.test(said));
  ok('and that telling them is yours to do', /Tell your assessor yourself/i.test(said));

  /**
   * Every code on screen is something you can take a copy of. Reading twelve characters off a
   * screen and retyping them into a chat window is the failure this removes, and the results
   * page is where somebody goes looking for the code to send.
   */
  const chip = doc.querySelector('.res-sub .code-chip');
  ok('the access code is on the results page', !!chip);
  ok('as a control and not as text', !!chip?.querySelector('button'));
  ok('shown the way it is read aloud', /KFRM-92TX-BQ7H/.test(chip?.textContent ?? ''), chip?.textContent);
  ok('and the page says holding it is enough to change the assessment',
     /open this assessment and change it/i.test(said));
  dom.window.close();

  /**
   * A mark with no way off it is a trap. Somebody presses it, finds a mistake, and the
   * assessor's list still says this is finished work.
   */
  const marked = { ...mine, meta: { ...mine.meta, submittedAt: '2026-09-10T12:00:00.000Z' } };
  const two = await boot({ session: live, side: 'submit', hash: '#results', draft: marked });
  const after = [...two.doc.querySelectorAll('.submit-box button')].map((b) => b.textContent.trim());
  ok('a marked assessment offers to take the mark back off',
     after.some((l) => /Take the ready mark off/i.test(l)), after.join(' | '));
  ok('and says when it was marked', /Marked ready on/i.test(body(two.doc)));
  ok('and no longer offers to mark it', !after.some((l) => /^Mark it ready to review$/i.test(l)),
     after.join(' | '));
  two.dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  /**
   * The mark, in the only place it was ever supposed to mean anything.
   *
   * The submitter's results page says in both languages that marking an assessment ready puts
   * "Ready to review" beside it in the assessor's list. It did not: the list never read
   * meta.submittedAt, so a finished assessment and an untouched draft were identical, and the
   * promise on the other screen was false.
   */
  const ready = submission('AB12', 'Licensing Renewal');
  const draft = submission('CD34', 'Fleet Scheduling');
  delete draft.meta.submittedAt;
  const { doc, dom } = await boot({
    session: live, side: 'assess', role: 'assessor',
    listAnswer: { documents: [draft, ready].map(asDoc) },
  });
  const heads = [...doc.querySelectorAll('.triage thead th')].map((h) => h.textContent.trim());
  ok('the pool has a column for whether it is finished',
     heads.some((h) => /State/.test(h)), heads.join(' | '));
  // A column reading "Ready to review" with nothing saying who decided it invites somebody to
  // read it as a status the tool worked out.
  ok('and says the department decided it, above the word itself',
     heads.some((h) => /^self-marked by submitter\s*State$/i.test(h.replace(/\s+/g, ' ').trim())),
     heads.join(' | '));

  /**
   * The qualifier is paler than the heading it qualifies.
   *
   * Both were --ink-3, so the two lines read as one two-line heading. jsdom does not resolve
   * custom properties, so this is read off the stylesheet the same way the table-wrap gate
   * above is: the last rule that has anything to say about the colour, rather than the first
   * one a grep happens to meet.
   */
  {
    const decl = [...html.matchAll(/\.triage th \.th-sub[^{}]*\{([^}]*)\}/g)]
      .map((m) => m[1]).filter((d) => /color:/.test(d)).pop() ?? '';
    ok('the column qualifier is mixed toward the surface, so it sits back from its heading',
       /color:\s*color-mix\([^;]*--ink-3[^;]*--surface/.test(decl), decl);
  }

  /**
   * Severity is a rail and a dot on the audit screen, never a fill.
   *
   * Reported as "a mishmash of colour, really hard to see anything". Measured in a rendered
   * page: four tinted grounds and five rail colours at once, 166 rows out of 166 carrying the
   * same amber, a medium finding painted the amber of the row holding it and a low finding the
   * grey of the quotation beside it. Two rules produced all of it, and both are gated here.
   */
  {
    const fills = [...html.matchAll(/\.flag\.sev-[a-z]+[^{}]*\{([^}]*)\}/g)]
      .map((m) => m[1]).filter((d) => /background/.test(d));
    ok('no severity of finding is painted as a fill', fills.length === 0, fills.join(' // '));

    const rowDecl = [...html.matchAll(/\.audit-row\.flagged[^{}]*\{([^}]*)\}/g)].map((m) => m[1]);
    ok('and a row is not tinted for being flagged on a screen where every row is flagged',
       !rowDecl.some((d) => /background|box-shadow/.test(d)), rowDecl.join(' // '));

    const dot = [...html.matchAll(/\.sev-dot[^{}]*\{([^}]*)\}/g)]
      .map((m) => m[1]).filter((d) => /background/.test(d)).pop() ?? '';
    ok('and the dot takes the same severity token the rail takes, so it cannot stop carrying it',
       /background:\s*var\(--sev\)/.test(dot), dot);
  }

  const rows = [...doc.querySelectorAll('.triage tbody tr')];
  const cell = (tr) => tr.children[1]?.textContent?.trim();
  ok('a marked assessment says it is ready', rows.some((tr) => /^Ready$/.test(cell(tr))),
     rows.map(cell).join(' | '));
  ok('and the date is on the hover, where a date belongs',
     /Marked ready to review on/.test(
       rows.map((tr) => tr.children[1]?.querySelector('.badge')?.getAttribute('title') ?? '').join(' ')));
  ok('and one nobody has marked says it is a draft', rows.some((tr) => /^Draft$/.test(cell(tr))),
     rows.map(cell).join(' | '));
  ok('and the ready one is listed first, because that is the work',
     /^Ready$/.test(cell(rows[0])), cell(rows[0]));

  /**
   * The same cut by category the submitter gets, on the assessor's side of the same answers.
   *
   * A department that is fine overall and weak on security is the case an assessor exists to
   * catch, and the four domain numbers hide it by dividing those questions four ways. It is
   * read-only here: an opinion about a question belongs in the audit, which is its own screen
   * with its own reasons attached.
   */
  [...doc.querySelectorAll('.row-acts button')].find((b) => /^Open$/.test(b.textContent.trim())).click();
  await new Promise((r) => setTimeout(r, 60));
  const catBox = [...doc.querySelectorAll('.card')]
    .find((c) => c.querySelector('h2')?.textContent === 'By category');
  ok('the submission detail carries the category cut', !!catBox);
  ok('and every category opens onto its own questions',
     (catBox?.querySelectorAll('.cat-open').length ?? 0) > 0,
     String(catBox?.querySelectorAll('.cat-open').length));
  ok('and says they do not add up to the overall',
     /do not add up to the overall/.test(catBox?.textContent ?? ''));
  ok('and the questions are read-only, because a score belongs in the audit',
     [...(catBox?.querySelectorAll('.cat-q') ?? [])].every((n) => n.tagName !== 'BUTTON'),
     [...(catBox?.querySelectorAll('.cat-q') ?? [])].map((n) => n.tagName).join(','));

  /**
   * And the assessor's own name is not called unchecked on a build that checked it.
   *
   * The sign-off card printed an "unverified" badge beside the auditor unconditionally. On a
   * build with a provider that name is the address the provider gave, and the rules will not
   * list the pool to an address that is not verified, so the card was not being cautious, it
   * was stating something false. The header already read the same fact correctly, and this
   * screen was never asserted on, which is how the two disagreed in one product.
   */
  {
    const signOff = [...doc.querySelectorAll('.card')]
      .find((c) => /Auditing as/.test(c.textContent));
    ok('the sign-off card names who is auditing', !!signOff, signOff?.textContent?.slice(0, 60));
    ok('and does not call a checked account unverified',
       !/unverified|not checked/i.test(signOff?.textContent ?? ''), signOff?.textContent?.slice(0, 120));
    ok('and says an account is behind it',
       /signed in/i.test(signOff?.textContent ?? ''), signOff?.textContent?.slice(0, 120));
  }
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  /**
   * Saving online is one deliberate act, every time.
   *
   * It was built as a switch: the first press turned on a write-through that sent every later
   * keystroke. The user pressed save, typed one character, and watched the badge say "Saving
   * online" by itself, which is not what she had asked for. These cases hold the button to
   * being the only writer, and hold the badge to saying when the store is behind.
   */
  const mine = {
    fileType: 'gc-arch-assessment', formatVersion: 1, ref: 'ZZ99', id: 'KFRM92TXBQ7H',
    rubric: { id: rubric.id, version: rubric.version, title: 'x' },
    initiative: {
      name: 'Licensing Renewal', department: 'DFO', contact: ME,
      lifecycleStage: 'beta', summary: 'A thing.', classification: 'Unclassified',
    },
    answers: { 'B-Q1': { score: 7, evidence: [] } },
    meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test', savedOnlineAt: 'x' },
    ownerEmail: ME,
  };
  const { doc, dom, seen } = await boot({ session: live, side: 'submit', hash: '#results', draft: mine });
  const badge = doc.querySelector('.save-state');

  /**
   * The reload case, reported on its own: the badge vanished entirely until something was
   * typed. Where the work stood lived in module state, and a fresh tab has none of that.
   */
  ok('a reloaded page says where the work stands', !!badge && !badge.classList.contains('hidden'),
     badge?.className);
  ok('and this record was saved online in an earlier session, and edited since, so it says so',
     badge?.className.includes('st-behind'), `${badge?.className} :: ${badge?.textContent}`);
  ok('in words, not in a colour alone', /out of date/i.test(badge?.textContent ?? ''), badge?.textContent);

  /**
   * Who saved it, asked every time, because a version used to arrive with nobody attached.
   *
   * The owner's address is set once, when the record is created, and somebody holding the
   * access code left no trace at all, so an assessor could not tell whose work was in front of
   * them or who to ask about it. It is typed and checked by nobody, which is what every screen
   * showing it has to say.
   */
  const saveBtn = [...doc.querySelectorAll('button')]
    .find((b) => /^Save online( again)?$/.test(b.textContent.trim()));
  ok('the results page offers to save online', !!saveBtn, saveBtn?.textContent);
  saveBtn.click();
  await new Promise((r) => setTimeout(r, 60));
  const win = [...doc.querySelectorAll('dialog.confirm')].find((x) => /Save this online/.test(x.textContent));
  ok('and the window asks who is saving', !!win?.querySelector('.signer'));
  const boxes = [...(win?.querySelectorAll('input.signer-box') ?? [])];
  ok('with two fields, a name and an address', boxes.length === 2, String(boxes.length));
  ok('and the address field is an email field', boxes[1]?.type === 'email', boxes[1]?.type);
  ok('and one of them holds the caret, so Enter is the answer',
     doc.activeElement === boxes[0], doc.activeElement?.className);

  // An empty name must not commit, and must not close the window and lose what was typed.
  const commitBtn = [...win.querySelectorAll('.cf-actions button')]
     .find((b) => /Save online/.test(b.textContent));
  commitBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  ok('pressing save with nothing typed does not close the window',
     doc.body.contains(win), 'window gone');
  ok('and says what is missing', /Put your name in/i.test(win.textContent));

  boxes[0].value = 'Mariia Yermolenko';
  boxes[1].value = 'not an address';
  commitBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  ok('an address that is not one is refused too',
     doc.body.contains(win) && /does not look like an email/i.test(win.textContent));

  /**
   * And then it is accepted, including addresses that are not gc.ca. There is no single
   * Government of Canada domain: every public servant has one at their department and one at
   * canada.ca, the Senate is two levels below gc.ca, and Canada Post is not on gc.ca at all. A
   * form that turns away a real person is the worse failure, because nobody verifies this name.
   */
  boxes[1].value = 'someone@sen.parl.gc.ca';
  commitBtn.click();
  await new Promise((r) => setTimeout(r, 60));
  ok('a real, unusual government address is accepted', !doc.body.contains(win));
  // Read back what the page kept, not the object this test seeded: they are separate copies.
  const kept = JSON.parse(dom.window.localStorage.getItem(DRAFT) ?? '{}');
  ok('and the name and address go into the record with the version',
     kept.meta?.savedBy?.name === 'Mariia Yermolenko'
     && kept.meta?.savedBy?.email === 'someone@sen.parl.gc.ca',
     JSON.stringify(kept.meta?.savedBy));
  ok('marked unverified, because nobody checked it', kept.meta?.savedBy?.unverified === true);
  ok('and the save is kept as a trail, since a save replaces the document',
     (kept.meta?.saves ?? []).length === 1, String((kept.meta?.saves ?? []).length));
  ok('and this browser remembers it for next time',
     JSON.parse(dom.window.localStorage.getItem('gc-arch-assessment:signer') ?? '{}').name
       === 'Mariia Yermolenko');

  /**
   * And remembering it does not sign the next save on its own.
   *
   * The remembered pair was offered as placeholder text and ALSO returned by the field reader
   * when a box was left empty, and the same reader feeds the gate, so two empty boxes passed
   * every check and the version went into the store under whoever used this browser last. On a
   * shared departmental machine that is somebody else's name on somebody else's submission.
   * Tab fills both boxes visibly and that is still the one-key path.
   */
  {
    const ready = [...doc.querySelectorAll('button')]
      .find((b) => /Mark it ready to review/.test(b.textContent.trim()));
    ok('there is a second place that asks who is acting', !!ready);
    ready.click();
    await new Promise((r) => setTimeout(r, 60));
    const w2 = [...doc.querySelectorAll('dialog.confirm')].find((x) => x.querySelector('.signer'));
    const b2 = [...(w2?.querySelectorAll('input.signer-box') ?? [])];
    ok('the remembered pair is offered rather than filled in',
       b2.length === 2 && b2[0].value === '' && b2[1].value === '',
       b2.map((b) => JSON.stringify(b.value)).join(' / '));
    const acts = [...w2.querySelectorAll('.cf-actions button')];
    const commit2 = acts.find((b) => /Mark it ready/i.test(b.textContent));
    commit2.click();
    await new Promise((r) => setTimeout(r, 40));
    ok('and acting with both boxes empty is refused, not signed with the remembered name',
       doc.body.contains(w2) && /Put your name in/i.test(w2.textContent),
       w2.textContent.slice(-140));
    const tab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    b2[0].dispatchEvent(tab);
    ok('while Tab fills both boxes where the person can read them',
       b2[0].value === 'Mariia Yermolenko' && b2[1].value === 'someone@sen.parl.gc.ca',
       `${b2[0].value} / ${b2[1].value}`);
    acts.find((b) => /Not yet/i.test(b.textContent))?.click();
    await new Promise((r) => setTimeout(r, 30));
  }

  const wrote = () => seen.filter((r) => r.method === 'PATCH' || r.method === 'POST');
  const before = wrote().length;
  await new Promise((r) => setTimeout(r, 250));
  ok('and nothing is sent while nobody presses anything', wrote().length === before,
     wrote().map((w) => `${w.method} ${w.href}`).join(' | '));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  /**
   * Settings is the one screen both sides share, and two of its four panes belong to the
   * submitter. An assessor was being offered "Your answers", which describes a draft they do
   * not have, and "Start again", which erases it. Reported as: how can you discard the
   * assessment that is not even yours?
   */
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'assessor' });
  const gear = [...doc.querySelectorAll('button')].find((b) => /Settings/i.test(b.getAttribute('title') || ''));
    gear.click();
    await new Promise((r) => setTimeout(r, 60));
    const rail = [...doc.querySelectorAll('.set-navrow')].map((b) => b.textContent.trim());
    ok('an assessor is not offered the submitter\u2019s own answers', !rail.includes('Your answers'), rail.join(' | '));
    ok('nor a control that erases them', !rail.includes('Start again'), rail.join(' | '));
    ok('and what is left belongs to both sides, plus the access list and the danger zone',
       rail.length === 5, rail.join(' | '));
    /**
     * People is the assessor's screen. A submitter has no store identity to list, and the
     * submitter rail is asserted whole in test/ui.mjs, which is where its absence is caught.
     */
    ok('and the assessor is offered the access list', rail.includes('People'), rail.join(' | '));
    /**
     * Every destructive act is gathered in one pane on both sides, and it is the last row so
     * that nothing ordinary is reached by passing through it.
     */
    ok('and the danger zone is last in the rail', rail[rail.length - 1] === 'Danger zone', rail.join(' | '));
    ok('and nothing on screen offers to discard anything',
       !/Discard this assessment/i.test(doc.querySelector('.set-pane')?.textContent ?? ''));
  dom.window.close();
}


/* --------------------------------------------------------------------------------------- */
{
  /**
   * Who has access, and the two things anybody does to it.
   *
   * Any assessor adds another and any assessor can take access away, which is the whole trust
   * model: no rule can tell a colleague from a stranger, so what the store enforces instead is
   * that a grant carries whoever made it, and this screen has to show that. Removal is behind
   * the person's full name typed out, asked for as: to delete, they need to go through hell.
   */
  const { doc, dom } = await boot({
    session: live, side: 'assess', role: 'assessor',
    people: [
      { email: ME, name: 'Signed In Assessor', role: 'assessor', addedBy: 'first@tbs-sct.gc.ca', addedAt: '2026-09-01T10:00:00Z' },
      { email: 'colleague@tbs-sct.gc.ca', name: 'Jean Tremblay', role: 'assessor', addedBy: ME, addedAt: '2026-09-10T10:00:00Z' },
      { email: 'gone@tbs-sct.gc.ca', name: 'Retired Person', role: 'removed', addedBy: ME, addedAt: '2026-08-01T10:00:00Z', removedBy: ME, removedAt: '2026-09-15T10:00:00Z' },
    ],
  });
  const gear = [...doc.querySelectorAll('button')].find((b) => /Settings/i.test(b.getAttribute('title') || ''));
  gear.click();
  await new Promise((r) => setTimeout(r, 60));
  [...doc.querySelectorAll('.set-navrow')].find((b) => /People/.test(b.textContent)).click();
  await new Promise((r) => setTimeout(r, 120));
  const pane = doc.querySelector('.set-pane');
  const text = pane?.textContent ?? '';

  ok('the access list names everybody the store knows',
     /Jean Tremblay/.test(text) && /Retired Person/.test(text), text.slice(0, 200));
  ok('and says who added whom, because any assessor can add anybody',
     /Added by first@tbs-sct\.gc\.ca/.test(text), text.slice(0, 300));
  ok('and says who took an access away, and when',
     new RegExp(`Removed by ${ME}`).test(text), text.slice(0, 400));
  ok('and marks the account that is signed in', /\byou\b/.test(text), text.slice(0, 200));
  /**
   * The one with access is offered removal and the one without is offered it back. A screen
   * that offers both to both is a screen where the state has to be read out of the prose.
   */
  const acts = [...pane.querySelectorAll('.set-row-act button')].map((b) => b.textContent);
  ok('every row carries exactly one control', acts.length === 3, acts.join(' | '));
  ok('and a removed person is offered their access back, not removal again',
     acts.filter((a) => /put their access back/i.test(a)).length === 1, acts.join(' | '));

  /**
   * Adding asks for a name as well as an address, because removal asks for the name to be typed
   * and nobody can invent one after the fact.
   */
  const fields = [...pane.querySelectorAll('.people-add input')];
  /**
   * First and last in separate boxes. Asked for as: I do not know what order I need to input
   * them, and the order matters, because taking an access away asks for the name back exactly.
   */
  ok('adding asks for a first name, a last name and an address', fields.length === 3,
     fields.map((f) => f.type).join(','));
  ok('and the note above the address has a heading, so it is read before the box under it',
     /Google account only/.test(pane.querySelector('.note-yellow-head')?.textContent ?? ''),
     pane.querySelector('.note-yellow-head')?.textContent ?? 'no heading');
  const add = [...pane.querySelectorAll('.people-add button')].find((b) => /Add this assessor/.test(b.textContent));
  fields[2].value = 'someone@tbs-sct.gc.ca';
  add.click();
  await new Promise((r) => setTimeout(r, 30));
  ok('and refuses an address with no name against it',
     /first and last name/i.test(pane.textContent), pane.textContent.slice(-200));
  fields[0].value = 'Someone';
  fields[1].value = 'New';
  fields[2].value = 'colleague@tbs-sct.gc.ca';
  add.click();
  await new Promise((r) => setTimeout(r, 30));
  ok('and refuses an address that is already on the list',
     /already on the list/i.test(pane.textContent), pane.textContent.slice(-200));

  /**
   * A non-government address warns and does not refuse. Sign-in is Google, so the address that
   * works is whichever one the person's Google account uses, and the account that set this
   * project up is a personal one. Refusing would lock out exactly the person who fixes things.
   */
  fields[2].value = 'someone@gmail.com';
  fields[2].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  ok('a non-government address is warned about and not refused',
     /not a government address/i.test(pane.textContent)
     && !doc.querySelector('.people-add button')?.disabled,
     pane.textContent.slice(-200));

  /**
   * Removal is not on the row, and it is not on this screen at all.
   *
   * Asked for in these words: it should not be a big and easily clicked button, you do not click
   * a reviewer, you type the name yourself, and the deletion should go through hell.
   */
  ok('no row offers to take anything away',
     ![...pane.querySelectorAll('button')].some((b) => /take .*access away/i.test(b.textContent)),
     [...pane.querySelectorAll('.set-row-act button')].map((b) => b.textContent).join(' | '));
  ok('and a name can be corrected, so a typo is not typed forever',
     [...pane.querySelectorAll('.set-row-act button')].some((b) => /Edit the name/.test(b.textContent)));
  ok('and the address field says only Google accounts work today',
     /Google account only/i.test(pane.textContent), pane.textContent.slice(0, 200));

  /**
   * A second person with one name cannot be added, because removal asks for a name and two
   * people cannot answer to it.
   */
  {
    const f = [...pane.querySelectorAll('.people-add input')];
    f[0].value = 'Jean';
    f[1].value = 'Tremblay';
    f[2].value = 'different@tbs-sct.gc.ca';
    [...pane.querySelectorAll('.people-add button')].find((b) => /Add this assessor/.test(b.textContent)).click();
    await new Promise((r) => setTimeout(r, 30));
    ok('a duplicate name is refused when it is added, not discovered at removal',
       /already called that/i.test(pane.textContent), pane.textContent.slice(-220));
  }
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  /**
   * The danger zone, which is the only place anything is taken away.
   *
   * Every gate here exists because of one instruction: to avoid accidental deletion at all cost.
   * Nothing narrows the search, the window never prints what it asks for, and an assessor cannot
   * take their own access away.
   */
  const { doc, dom } = await boot({
    session: live, side: 'assess', role: 'assessor',
    people: [
      { email: ME, name: 'Signed In Assessor', role: 'assessor', addedBy: 'first@tbs-sct.gc.ca', addedAt: '2026-09-01T10:00:00Z' },
      { email: 'colleague@tbs-sct.gc.ca', name: 'Jean Tremblay', role: 'assessor', addedBy: ME, addedAt: '2026-09-10T10:00:00Z' },
    ],
  });
  const gear = [...doc.querySelectorAll('button')].find((b) => /Settings/i.test(b.getAttribute('title') || ''));
  gear.click();
  await new Promise((r) => setTimeout(r, 60));
  const rail = [...doc.querySelectorAll('.set-navrow')];
  ok('the danger zone is the last row and is marked dangerous',
     rail[rail.length - 1].textContent === 'Danger zone'
     && rail[rail.length - 1].className.includes('danger'), rail.map((b) => b.textContent).join(' | '));
  rail[rail.length - 1].click();
  await new Promise((r) => setTimeout(r, 80));
  const pane = doc.querySelector('.set-pane');
  ok('it gathers the acts that remove something', !!pane.querySelector('.danger-box'));
  ok('and says where a submission is deleted, which is not here',
     /Delete a submission/.test(pane.textContent), pane.textContent.slice(0, 200));

  /**
   * Deleting a submission is in this zone too, and not on the portfolio.
   *
   * Reported as: deletion should not be from a portfolio, but from the danger zone, that is the
   * whole reason for having it. What is typed is the access code, because two departments can
   * name an initiative the same thing and the code belongs to one assessment only.
   */
  {
    [...pane.querySelectorAll('.danger-row-act button')].find((b) => /Delete a submission/.test(b.textContent)).click();
    await new Promise((r) => setTimeout(r, 60));
    const d = doc.querySelector('dialog.confirm');
    ok('deleting a submission starts here and asks which one',
       !!d && /Type the access code/i.test(d.textContent), d?.textContent?.slice(0, 160));
    /**
     * And it asks for the code the way every other screen asks for one. Reported as: an access
     * code should always be asked in the same way, same functionality always. One box per
     * character, dashes drawn and never typed.
     */
    ok('and asks for the code in the boxes every other screen uses',
       (d.querySelectorAll('.code-field input').length) === 12,
       String(d.querySelectorAll('.code-field input').length));
    ok('and offers no list to choose from',
       !d.querySelector('datalist') && !d.querySelector('select'));
    ok('and names the reversible option so nobody deletes a test record by reflex',
       /stopping the count/i.test(d.textContent), d.textContent.slice(0, 260));
    [...d.querySelectorAll('.cf-actions button')].find((b) => /Cancel/.test(b.textContent)).click();
    await new Promise((r) => setTimeout(r, 30));
  }

  [...pane.querySelectorAll('.danger-row-act button')].find((b) => /Take access away/.test(b.textContent)).click();
  await new Promise((r) => setTimeout(r, 60));
  const win = doc.querySelector('dialog.confirm');
  const fields = [...win.querySelectorAll('.danger-find input')];
  ok('the window asks for a name and an address, both typed', fields.length === 2);
  /**
   * The rule this whole design rests on: nothing here offers a person to pick.
   */
  ok('and offers nobody to choose from',
     !win.querySelector('datalist') && !win.querySelector('select')
     && fields.every((f) => f.getAttribute('list') === null),
     win.innerHTML.slice(0, 120));
  ok('and says so, so that nobody adds a picker later believing it a kindness',
     /no list to choose from/i.test(win.textContent));

  const find = [...win.querySelectorAll('.cf-actions button')].find((b) => /Find them/.test(b.textContent));
  fields[0].value = 'Signed In Assessor';
  fields[1].value = ME;
  find.click();
  await new Promise((r) => setTimeout(r, 40));
  ok('your own account is refused, and the window stays open',
     doc.body.contains(win) && /your own account/i.test(win.textContent), win.textContent.slice(-200));

  fields[0].value = 'Nobody At All';
  fields[1].value = 'nobody@tbs-sct.gc.ca';
  find.click();
  await new Promise((r) => setTimeout(r, 120));
  {
    const miss = [...doc.querySelectorAll('dialog.confirm')].pop();
    ok('a wrong pair is refused without saying which half was wrong',
       /No assessor matches both/i.test(miss.textContent), miss.textContent.slice(0, 160));
    ok('and it suggests nothing, because a suggestion is a pick list with one item',
       !/did you mean/i.test(miss.textContent) && !/\d+ (match|people)/i.test(miss.textContent));
    [...miss.querySelectorAll('.cf-actions button')][0].click();
    await new Promise((r) => setTimeout(r, 30));
  }
  dom.window.close();
}


/* --------------------------------------------------------------------------------------- */
{
  /**
   * Withdrawing a record, which is what somebody wants when a test submission is cluttering the
   * portfolio and deleting is more than they meant.
   *
   * The rule that permits it allows exactly one field to differ, so this test also proves the
   * request the tool actually sends is masked to that one field. An assessor who could rewrite a
   * department's answers while tidying the portfolio is the failure it exists to prevent.
   */
  const rows = [submission('AB12', 'Real Work'), submission('CD34', 'Test Submission')];
  const { doc, dom, seen } = await boot({
    session: live, side: 'assess', role: 'assessor', hash: '#assessor/admin',
    listAnswer: { documents: rows.map(asDoc) },
  });
  const menu = doc.querySelector('table.detail .row-menu');
  ok('the portfolio row carries a menu', !!menu, doc.querySelector('main')?.textContent?.slice(0, 120));
  menu.open = true;
  const items = [...menu.querySelectorAll('.menu-item')].map((b) => b.textContent.trim());
  ok('and offers to stop counting the record before it offers to delete it',
     items.indexOf('Stop counting it') === 0, items.join(' | '));

  [...menu.querySelectorAll('.menu-item')].find((b) => /Stop counting it/.test(b.textContent)).click();
  await new Promise((r) => setTimeout(r, 40));
  const w = doc.querySelector('dialog.confirm');
  ok('it asks first', !!w);
  ok('and says the record itself is untouched',
     /Nothing in it is changed or removed/.test(w?.textContent ?? ''), w?.textContent?.slice(0, 220));
  ok('and says the access code keeps working, because withdrawing is not deleting',
     /access code keeps working/.test(w?.textContent ?? ''), w?.textContent?.slice(0, 260));

  [...w.querySelectorAll('.cf-actions button')].find((b) => /Stop counting it/.test(b.textContent)).click();
  await new Promise((r) => setTimeout(r, 120));
  /**
   * The request, which is the half a rule cannot check from inside the browser.
   */
  const patch = seen.filter((x) => x.method === 'PATCH').pop();
  ok('the write is a masked patch, so it cannot carry anything but the one field',
     !!patch && /updateMask\.fieldPaths=withdrawnAt/.test(patch.href), patch?.href ?? 'no PATCH sent');
  ok('and it is sent against the record that was chosen',
     !!patch && /assessments\/doc-AB12\?/.test(patch.href), patch?.href ?? '');
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  /**
   * No person's address is compiled into the page, and no grant comes from anywhere but the store.
   *
   * The build carried a list of addresses it treated as assessors when the store had no document
   * for them. It was inlined into the published HTML, so a real address sat on the open internet,
   * and it was a grant nobody could take away: remove the person from the store and the page
   * still let them in, because the page carried its own answer. Asked for by the person whose
   * address it was: I will leave the team at some point and they will need to remove my access,
   * can we have my credentials in the store only.
   */
  /**
   * A gate says which address, not that there was one.
   *
   * Asked directly: will it show why it failed the build. The first version printed a fixed
   * sentence, which tells somebody a rule was broken and leaves them grepping 350KB of inlined
   * bundle to find out by what.
   */
  const PLACEHOLDERS = /^(someone|you|vous|name|nom|test|a|b|first\.last)@/i;
  const KNOWN_FIXTURES = /@(department\.gc\.ca|ministere\.gc\.ca|tbs-sct\.gc\.ca|tc\.gc\.ca|dfo-mpo\.gc\.ca|b\.gc\.ca|sen\.parl\.gc\.ca|example\.[a-z.]+)$/i;
  const addresses = [...new Set(html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g) ?? [])]
    .filter((a) => !PLACEHOLDERS.test(a) && !KNOWN_FIXTURES.test(a));
  ok('the built page carries nobody\u2019s address',
     addresses.length === 0,
     addresses.length
       ? `compiled into dist/index.html: ${addresses.join(', ')}. An address in the build is public the moment the page is, and it is a grant nobody can take away. Take it out of deploy/firebase-config.json and out of the source; access comes from the roles collection.`
       : '');
  const declares = html.match(/"admins"\s*:\s*\[[^\]]*\]/)?.[0];
  ok('and the build declares no list of people it trusts',
     !declares,
     declares ? `the build carries ${declares}. Remove the admins key from deploy/firebase-config.json: a grant that lives in the build cannot be revoked in the store.` : '');
}

/* --------------------------------------------------------------------------------------- */
{
  /**
   * The published pages are never a demonstration build.
   *
   * The demonstration build asks nobody to sign in. That is safe only because it reads an
   * invented pool and never reaches the store; the same flag on the real assessor page would
   * open every department's submission to anybody holding the address. It is published at its
   * own address, and this refuses the flag anywhere near the two real ones.
   */
  /**
   * Asserted on what the page renders, not on what its text contains. The stylesheet is inlined
   * into every build, so the class name is in all of them and grepping for it fails the pages it
   * is meant to protect.
   */
  const assessor = await readFile('dist/assessor.html', 'utf8').catch(() => '');
  for (const [name, page] of [['the submitter page', html], ['the assessor page', assessor]]) {
    if (!page) continue;
    const j = new JSDOM(page, { runScripts: 'dangerously', url: 'https://example.gc.ca/',
      beforeParse(w) { w.scrollTo = () => {}; w.alert = () => {}; w.print = () => {};
        w.fetch = async () => ({ ok: false, status: 403, headers: { get: () => 'application/json' },
          json: async () => ({}), text: async () => '{}' }); } });
    await new Promise((r) => setTimeout(r, 120));
    ok(`${name} does not render as a demonstration`,
       !j.window.document.querySelector('.demo-banner'),
       'the demonstration flag is compiled into a page that reads the real store');
    j.window.close();
  }
}

console.log(fails ? `\n${fails} hosted check(s) failed\n` : '\nall hosted checks passed\n');
process.exit(fails ? 1 : 0);
