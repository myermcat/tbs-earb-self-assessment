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
      node.setAttribute(k, '');
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
