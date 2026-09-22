/** Tiny DOM helpers. No framework, so the built file stays small and has no supply chain. */

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      node.className = String(v);
    } else if (k === 'html') {
      node.innerHTML = String(v);
    } else if (v === true) {
      // An HTML boolean attribute is true by presence, so `hidden` and `disabled` want an
      // empty value. ARIA is the opposite: aria-hidden="" hides nothing, it has to be the
      // literal string. Getting this wrong is silent, which is the worst kind of wrong.
      node.setAttribute(k, k.startsWith('aria-') ? 'true' : '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const frag = (children: (Node | string | null | undefined)[]): DocumentFragment => {
  const f = document.createDocumentFragment();
  for (const c of children) {
    if (c === null || c === undefined) continue;
    f.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return f;
};

export function clear(node: HTMLElement): HTMLElement {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Dan's Assessment Scale sheet gives a colour to every one of the eleven scores, so the app
 * uses his ramp rather than inventing a three-colour one. `tone` colours text and borders,
 * `bar` fills a track.
 */
export function tone(v: number | null): string {
  return v === null ? 'tnone' : `t${Math.max(0, Math.min(10, Math.round(v)))}`;
}

export function bar(v: number | null): string {
  return v === null ? 'bnone' : `b${Math.max(0, Math.min(10, Math.round(v)))}`;
}

/**
 * The mark on a control that does not work yet.
 *
 * A prototype is full of screens that exist before the thing behind them does, and a button
 * that looks ordinary and does nothing is worse than no button. Every one of them carries this,
 * and every one of them is also disabled, so it reads as unfinished before it is pressed.
 */
export function mockupTag(label = 'Mockup'): HTMLElement {
  return el('span', { class: 'badge badge-mockup tiny' }, [label]);
}

/**
 * A run of text that came out of the question set.
 *
 * The set is Dan's English and there is no French of it anywhere, so on a French page these
 * words sit inside a document declared lang="fr" and a French voice reads them aloud in French.
 * Reported as: in submitter view there is no french text whatsoever. That screen is 8 per cent
 * chrome, and the chrome does switch; the other 92 per cent is the 176 questions, the twenty
 * section names and the eleven rungs of the scale, and none of those has a French version to
 * switch to. The attribute is what tells assistive technology to change voice, and it is WCAG
 * 2.1 success criterion 3.1.2, which the Standard on Web Accessibility requires.
 */
export const fromSet = (s: string): HTMLElement => el('span', { class: 'from-set', lang: 'en' }, [s]);
