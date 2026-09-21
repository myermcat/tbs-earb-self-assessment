/**
 * The back button, and screens as addresses.
 *
 * Back used to work inside the questionnaire and nowhere else, because the 21 stops pushed
 * history and every other screen changed silently. So leaving the results page took you two
 * stops back into the questions, and an assessor pressing Back was dropped into somebody's
 * submitter view. These cases hold the router to the behaviour a browser has taught everybody
 * to expect, and they hold the addresses to being sendable.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/index.html', 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 30));

async function boot(hash = '') {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: `http://localhost/tool/${hash}`,
    pretendToBeVisual: true,
    beforeParse(w) { w.scrollTo = () => {}; w.alert = () => {}; w.print = () => {}; },
  });
  await settle();
  const { document } = dom.window;
  return {
    dom,
    doc: document,
    view: () => (document.querySelector('#app')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    hash: () => dom.window.location.hash,
    click: async (sel, text) => {
      const node = [...document.querySelectorAll(sel)]
        .find((n) => n.textContent.trim().toLowerCase().includes(text.toLowerCase()));
      if (!node) throw new Error(`no ${sel} reading "${text}"`);
      node.click();
      await settle();
    },
    back: async () => { dom.window.history.back(); await settle(); },
  };
}

console.log('\nAddresses and the back button\n');

/* --------------------------------------------------------------------------------------- */
{
  const p = await boot();
  ok('the tool opens on the home page', /Assess your own architecture/.test(p.view()));
  ok('and the address carries no hash', p.hash() === '', p.hash());

  await p.click('.tab', 'Fill it in');
  ok('the questionnaire is an address', p.hash().length > 1, p.hash());

  await p.click('.tab', 'My results');
  ok('so are the results', p.hash() === '#results', p.hash());

  await p.back();
  ok('back from results returns to the questionnaire', /Not applicable|About the initiative/.test(p.view()), p.view().slice(0, 120));
  ok('and not two stops earlier', p.hash() !== '#results');

  await p.back();
  ok('and back again reaches the home page', /Assess your own architecture/.test(p.view()), p.view().slice(0, 120));
  p.dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // The defect this replaced: back from the assessor view hard-assigned the submitter side,
  // so an assessor pressing Back landed in the questionnaire rather than where they came from.
  // The home page no longer offers a way across, because the two sides are separate products.
  // The address is how anybody reaches the assessor side now, including this test.
  const p = await boot();
  await p.click('.tab', 'My results');
  p.dom.window.location.hash = '#assessor';
  p.dom.window.dispatchEvent(new p.dom.window.PopStateEvent('popstate', { state: null }));
  await new Promise((r) => setTimeout(r, 30));
  ok('the assessor view is an address', p.hash() === '#assessor', p.hash());
  ok('and it is the assessor view', /sign in|Load submissions|pool/i.test(p.view()), p.view().slice(0, 120));

  await p.back();
  ok('back leaves the assessor side', p.hash() !== '#assessor', p.hash());
  p.dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // Every screen has to survive a reload and a pasted link, which is the other half of having
  // an address at all.
  const r = await boot('#results');
  ok('a results link opens the results', /result|score/i.test(r.view()), r.view().slice(0, 120));
  r.dom.window.close();

  const a = await boot('#assessor');
  ok('an assessor link opens the assessor side', !/Assess your own architecture/.test(a.view()));
  a.dom.window.close();

  const s = await boot('#settings');
  ok('a settings link opens settings', /Where your answers go|question set|Settings/i.test(s.view()),
     s.view().slice(0, 120));
  s.dom.window.close();

  const junk = await boot('#not-a-real-place');
  ok('an address nobody recognises still gives a working page',
     (junk.doc.querySelector('#app')?.children.length ?? 0) > 0);
  junk.dom.window.close();
}

{
  /**
   * A settings pane is a place, so it is in the address.
   *
   * Reported as: why does a reload on Documentation send me to Question set. Because the pane
   * was module state while the address said only "settings", so a reload put the default back
   * and a link to a pane could not be sent to anybody.
   */
  const d = await boot('#settings/docs');
  const on = d.doc.querySelector('.set-navrow.on');
  ok('an address naming a pane opens that pane', on?.textContent === 'Documentation',
     on?.textContent ?? 'none');
  d.dom.window.close();

  const dz = await boot('#settings/danger');
  ok('and so does the danger zone, which is the one worth linking to',
     dz.doc.querySelector('.set-navrow.on')?.textContent === 'Danger zone',
     dz.doc.querySelector('.set-navrow.on')?.textContent ?? 'none');
  dz.dom.window.close();

  /**
   * Switching pane writes the address, which is what makes a reload come back to it. Asserted
   * on the hash rather than on history, because a file:// page cannot push state at all.
   */
  const sw = await boot('#settings');
  const row = [...sw.doc.querySelectorAll('.set-navrow')].find((b) => /Documentation/.test(b.textContent));
  row.click();
  await new Promise((r) => setTimeout(r, 20));
  ok('and choosing a pane puts it in the address',
     sw.dom.window.location.hash === '#settings/docs', sw.dom.window.location.hash);
  sw.dom.window.close();

  const junk2 = await boot('#settings/not-a-pane');
  ok('a pane nobody recognises opens settings rather than nothing',
     (junk2.doc.querySelector('.set-pane')?.children.length ?? 0) > 0);
  junk2.dom.window.close();
}

console.log(fails ? `\n${fails} routing check(s) failed\n` : '\nall routing checks passed\n');
process.exit(fails ? 1 : 0);
