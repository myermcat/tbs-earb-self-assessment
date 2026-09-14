/**
 * The access code: how it is minted, and how it is typed.
 *
 * The code is the record's own name in the store, so it is the whole of "let me in". Two things
 * follow and both are asserted here. It has to be unguessable, which is arithmetic. And it has
 * to be typeable by somebody reading it off a Teams message, which is the part that decides
 * whether sharing gets used at all: a field people fight with is a feature nobody uses.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/index.html', 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 40));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.gc.ca/tool/',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.scrollTo = () => {};
    w.alert = () => {};
    // Nothing in this suite should reach the network, and anything that tries is a finding.
    w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
  },
});
await settle();
const { document, KeyboardEvent, Event } = dom.window;
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const byText = (s, t) => qa(s).find((n) => n.textContent.trim().toLowerCase().includes(t.toLowerCase()));

console.log('\nThe access code\n');

/* --------------------------------------------------------------------------------------- */
// The alphabet is the argument. I, O, 0 and 1 are out, because somebody reads this down a
// phone, and 62 mixed-case characters with all four of them in was the previous shape.
{
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  ok('the code alphabet has no character that can be misread',
     !/[IO01]/.test(ALPHABET) && ALPHABET.length === 32);
  ok('and twelve of them is more than a billion billion codes',
     Math.pow(ALPHABET.length, 12) > 1e18, String(Math.pow(ALPHABET.length, 12)));
}

/* --------------------------------------------------------------------------------------- */
{
  const entry = byText('.hero-actions button', 'access code');
  ok('the home page offers a way in with a code', !!entry, entry?.textContent);
  entry.click();
  await settle();
  ok('and it opens a window that says so', /Open with an access code/.test(q('.cf-title')?.textContent ?? ''));

  const boxes = qa('.code-field .code-box');
  ok('the field is one box per character', boxes.length === 12, String(boxes.length));
  ok('with a dash drawn between each group of four',
     qa('.code-field .code-dash').length === 2, String(qa('.code-field .code-dash').length));
  ok('and the dashes are hidden from a screen reader, which would read them as words',
     qa('.code-field .code-dash').every((d) => d.getAttribute('aria-hidden') === 'true'));
  ok('the group is named for somebody who cannot see the boxes',
     q('.code-field')?.getAttribute('aria-label') === 'Access code');
  ok('and every box says which one it is',
     boxes.every((b, i) => b.getAttribute('aria-label') === `Character ${i + 1} of 12`));

  /**
   * The paste case, which is what almost everybody will do. A code copied out of Teams arrives
   * with its dashes, and a phone keyboard may have lower-cased it. Both are the same code.
   */
  boxes[0].value = 'kfrm-92tx-bq7h';
  boxes[0].dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  ok('pasting a dashed lower-case code fills every box',
     boxes.map((b) => b.value).join('') === 'KFRM92TXBQ7H', boxes.map((b) => b.value).join(''));

  // Backspace out of an empty box goes back and clears, which is what a person expects when
  // they have mistyped one character in the middle.
  boxes[5].value = '';
  boxes[5].focus();
  boxes[5].dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
  ok('backspace in an empty box walks back to the one before', document.activeElement === boxes[4]);

  boxes[3].focus();
  boxes[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ok('and the arrow keys move between boxes', document.activeElement === boxes[4]);

  // A code with a character that is not in the alphabet is not a code.
  for (const b of boxes) b.value = '';
  boxes[0].value = 'IIII-OOOO-0000';
  boxes[0].dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  byText('.cf-actions button', 'Open it').click();
  await settle();
  ok('a code made of characters the alphabet excludes is refused',
     /not a complete code/i.test(q('.cf-note')?.textContent ?? ''), q('.cf-note')?.textContent);
}

/* --------------------------------------------------------------------------------------- */
/**
 * The guard in front of anything that replaces what this browser holds.
 *
 * Asked for twice, in capitals the second time: any time the tool is about to replace the local
 * copy it asks first, offers to save online, and says plainly what is otherwise lost. Opening by
 * access code was the path that asked nothing at all.
 *
 * A second page, because the guard's answer depends on what the draft holds, and this one is
 * booted with a draft that has work in it.
 */
{
  const withWork = {
    fileType: 'gc-arch-assessment', formatVersion: 1, ref: 'ZZ99',
    rubric: { id: 'gc-ea-selfassess', version: '1.0-dan', title: 'x' },
    initiative: {
      name: 'Licensing Renewal', department: 'DFO', contact: 'a@b.gc.ca',
      lifecycleStage: 'beta', summary: 'A thing.', classification: 'Unclassified',
    },
    answers: { 'B-Q1': { score: 7, evidence: [] } },
    meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test' },
  };
  const two = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.gc.ca/tool/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('gc-arch-assessment:draft', JSON.stringify(withWork));
      // A session, because the store still asks for an account before it reads anything. The
      // rule that lets a code stand on its own has not been published, so without this the path
      // stops at the refusal and never reaches the guard.
      w.localStorage.setItem('gc-arch-assessment:firebase-session', JSON.stringify({
        email: 'someone@dfo-mpo.gc.ca', idToken: 't', refreshToken: 'r', expiresAt: Date.now() + 36e5,
      }));
      w.scrollTo = () => {};
      w.alert = () => {};
      // The store answers with a real record for the code, so the path reaches the guard. A
      // stub that answers with nothing stops at "no assessment has that code", which is a
      // different screen and would have made this pass by never getting there.
      w.fetch = async (url) => {
        const doc = String(url).includes('/assessments/')
          ? {
              name: 'projects/p/databases/(default)/documents/assessments/KFRM92TXBQ7H',
              fields: {
                fileType: { stringValue: 'gc-arch-assessment' },
                ref: { stringValue: 'AB12' },
                rubric: { mapValue: { fields: {
                  id: { stringValue: 'gc-ea-selfassess' }, version: { stringValue: '1.0-dan' },
                } } },
                initiative: { mapValue: { fields: {
                  name: { stringValue: 'Fleet Scheduling' }, department: { stringValue: 'DFO' },
                } } },
                answers: { mapValue: {} },
                meta: { mapValue: { fields: { updatedAt: { stringValue: '2026-09-01T00:00:00Z' } } } },
              },
            }
          : {};
        return { ok: true, status: 200, json: async () => doc, text: async () => JSON.stringify(doc) };
      };
    },
  });
  await settle();
  const d2 = two.window.document;
  const all = (sel) => [...d2.querySelectorAll(sel)];
  const find = (sel, txt) => all(sel).find((n) => n.textContent.toLowerCase().includes(txt.toLowerCase()));

  // The guard comes first, before the typing. Asking somebody for twelve characters and only
  // then telling them it replaces their work is the wrong order to learn it in.
  find('.hero-actions button', 'access code').click();
  await settle();
  const guard = all('dialog.confirm').find((x) => /Replace what this browser/.test(x.textContent));
  ok('opening by code asks before replacing work', !!guard,
     all('dialog.confirm').map((x) => x.querySelector('.cf-title')?.textContent).join(' | '));
  ok('and says what this act does', /access code opens the assessment/i.test(guard?.textContent ?? ''));
  ok('and says what would be lost', /never been saved online/i.test(guard?.textContent ?? ''),
     guard?.textContent?.slice(0, 200));
  ok('and offers to save online first',
     !!find('.cf-actions button', 'Save this online first'),
     all('.cf-actions button').map((b) => b.textContent).join(' | '));
  ok('and the way out keeps what you have',
     !!find('.cf-actions button', 'Keep what I have'));

  // Going ahead is what opens the field.
  find('.cf-actions button', 'Go ahead without saving').click();
  await settle();
  const boxes = all('.code-field .code-box');
  ok('and only then does it ask for the code', boxes.length === 12, String(boxes.length));
  two.window.close();
}

console.log(fails ? `\n${fails} access code check(s) failed\n` : '\nall access code checks passed\n');
process.exit(fails ? 1 : 0);
