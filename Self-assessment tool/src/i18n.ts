/**
 * The two languages, and how a string gets into both.
 *
 * A Government of Canada tool is bilingual, so the architecture has to allow it before the
 * translation exists. There are roughly 960 reader-facing strings in this page today, so the
 * cheap part is the mechanism and the long part is the writing.
 *
 * The mechanism is keyed on the English, deliberately:
 *
 *   el('h2', {}, [t('Where your answers go', 'Où vont vos réponses')])
 *
 * No key has to be invented, nothing can point at a key that no longer exists, and migrating
 * a string is a mechanical edit rather than a decision. A string with no French falls back to
 * English and is counted, so `coverage()` says how far along the translation is instead of
 * somebody guessing.
 *
 * What this does not solve: the question set. Dan's 176 questions, their descriptions and the
 * eleven rungs of the scale are data, so their French belongs in the rubric file beside the
 * English. That is a separate piece of work and it is his text, not ours.
 */
import { isDemoBuild, storeKey } from './keys';

export type Lang = 'en' | 'fr';

const KEY = storeKey('lang');
/** The real pages' own name for it, read by a demonstration and written by nothing. */
const SHARED_LANG = 'gc-arch-assessment:lang';
let current: Lang = 'en';
const missing = new Set<string>();
const seen = new Set<string>();

/** Language for this visit: the query string wins, then a stored choice, then the browser. */
export function bootLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'fr' || q === 'en') { current = q; return current; }
    const stored = localStorage.getItem(KEY);
    if (stored === 'fr' || stored === 'en') { current = stored; return current; }
    /**
     * The demonstration page keeps its own names, so a French speaker who chose French on a
     * real page would have met a demonstration in English. Serving English to somebody who
     * asked for French is the expensive failure for a Government of Canada tool, and one of the
     * five categories this thing scores departments on is Official Languages.
     *
     * So the demonstration reads the shared choice once, when it has none of its own, and never
     * writes it. Anything the room changes during a demonstration stays in the demonstration.
     * This is the one name that crosses, it is named here, and the gate allows exactly it.
     */
    if (isDemoBuild()) {
      const shared = localStorage.getItem(SHARED_LANG);
      if (shared === 'fr' || shared === 'en') { current = shared; return current; }
    }
    if ((navigator.language || '').toLowerCase().startsWith('fr')) current = 'fr';
  } catch {
    /* a private window, or no navigator. English is the default. */
  }
  return current;
}

export function lang(): Lang { return current; }

export function setLang(next: Lang): void {
  current = next;
  try { localStorage.setItem(KEY, next); } catch { /* holds for this visit */ }
  document.documentElement.setAttribute('lang', next);
}

/**
 * One string, in the language of this visit. The French is optional while the translation is
 * being written, and its absence is recorded rather than hidden.
 */
export function t(en: string, fr?: string): string {
  seen.add(en);
  if (current === 'fr') {
    if (fr) return fr;
    missing.add(en);
  }
  return en;
}

/** How far the translation has got, for the page that reports it. */
export function coverage(): { seen: number; missing: number } {
  return { seen: seen.size, missing: missing.size };
}
