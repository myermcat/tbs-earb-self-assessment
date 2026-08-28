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

/** Score to a colour band. Red / amber / green, matching the way the board already reads scores. */
export function tone(v: number | null): string {
  if (v === null) return 'none';
  if (v >= 8) return 'green';
  if (v >= 6) return 'lime';
  if (v >= 3) return 'amber';
  return 'red';
}
