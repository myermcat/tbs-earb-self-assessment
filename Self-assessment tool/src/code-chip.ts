/**
 * An access code on screen, which is always something you can take a copy of.
 *
 * A code is never ordinary text. It is the only way back to an assessment, so every time one
 * appears somebody is either about to send it or about to lose it, and both of those start
 * with getting it onto the clipboard. Reading twelve characters off a screen and typing them
 * into a chat window is the failure mode this exists to remove.
 *
 * The shape is the one people already know from an API key or a repository address: the value
 * in a monospaced box, a copy control at the end of it, and the box itself clickable because
 * that is what people try first. It says "Copied" for a moment and goes back, so the feedback
 * is where the eye already is.
 */
import { el } from './dom';
import { formatCode } from './firebase';
import { t } from './i18n';

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="12" height="12" rx="2"/>' +
  '<path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

export function codeChip(id: string): HTMLElement {
  const shown = formatCode(id);
  const label = el('span', { class: 'code-chip-value' }, [shown]);
  const said = el('span', { class: 'code-chip-said', 'aria-live': 'polite' });

  const copy = () => {
    const done = () => {
      said.textContent = t('Copied', 'Copié');
      window.setTimeout(() => { said.textContent = ''; }, 2200);
    };
    const failed = () => {
      // A browser that refuses the clipboard leaves the person the code itself, selected, so
      // the keyboard can finish the job.
      said.textContent = t('Select it and copy', 'Sélectionnez-le et copiez');
      try {
        const range = document.createRange();
        range.selectNodeContents(label);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch { /* no selection here */ }
    };
    try {
      const write = navigator.clipboard?.writeText(shown);
      if (write) void write.then(done, failed);
      else failed();
    } catch {
      failed();
    }
  };

  return el('span', { class: 'code-chip' }, [
    el('button', {
      class: 'code-chip-btn',
      title: t('Copy the access code', 'Copier le code d’accès'),
      'aria-label': t(`Copy the access code ${shown}`, `Copier le code d’accès ${shown}`),
      onclick: copy,
    }, [
      label,
      el('span', { class: 'code-chip-ico', html: COPY_ICON, 'aria-hidden': true }),
    ]),
    said,
  ]);
}
