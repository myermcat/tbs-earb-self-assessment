import { el, clear } from './dom';
import { t } from './i18n';

/**
 * The classified-evidence pledge, as a modal that has to be dealt with.
 *
 * The inline advice panel stays where it is - it is the reference somebody comes back to - but
 * a panel further down a page is not a warning. It can be scrolled past, and it was: choosing
 * Protected A from the strip that says "mark this file to save it" set the marking and showed
 * nothing at all.
 *
 * So the moment a marking above unclassified is chosen anywhere, this takes over the screen.
 * The close control is dead until the box is ticked, Escape does not dismiss it, and clicking
 * outside does nothing. The one other way out is the honest one: say it is unclassified after
 * all, which changes the answer rather than dismissing the warning.
 */

export interface PledgeOpts {
  /** The marking that triggered this: 'Protected A', 'Secret', and so on. */
  marking: string;
  /** An example of the subject line to use, with a real question number in it. */
  subject: string;
  /** Ticked: they keep the marking, and the acknowledgement is recorded. */
  onAcknowledge: () => void;
  /** They decide it is unclassified after all, so the marking goes back. */
  onUnclassified: () => void;
}

const CROSS =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export function demandPledge(o: PledgeOpts): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'pledge';

  let ticked = false;
  let closing = false;

  const close = () => {
    closing = true;
    try { dlg.close(); } catch { /* never opened */ }
    dlg.remove();
    scrim.remove();
  };

  // A scrim of our own, for the fallback path where showModal does not exist. The native
  // ::backdrop covers it when the real modal is available.
  const scrim = el('div', { class: 'pledge-scrim' });

  const x = el('button', {
    class: 'pledge-x',
    disabled: true,
    title: t('Tick the box first', 'Cochez d\u2019abord la case'),
    'aria-label': t('Close', 'Fermer'),
    html: CROSS,
    onclick: () => { if (ticked) close(); },
  }) as HTMLButtonElement;

  const hint = el('p', { class: 'pledge-hint' }, [t('Tick the box to close this.', 'Cochez la case pour fermer.')]);

  const box = el('input', {
    type: 'checkbox',
    onchange: (e: Event) => {
      ticked = (e.target as HTMLInputElement).checked;
      x.disabled = !ticked;
      x.title = ticked ? t('Close', 'Fermer') : t('Tick the box first', 'Cochez d\u2019abord la case');
      x.classList.toggle('live', ticked);
      clear(hint);
      hint.appendChild(document.createTextNode(
        ticked ? t('You can close this now.', 'Vous pouvez fermer maintenant.') : t('Tick the box to close this.', 'Cochez la case pour fermer.'),
      ));
      if (ticked) o.onAcknowledge();
      if (ticked) setTimeout(() => x.focus?.(), 0);
    },
  }) as HTMLInputElement;

  dlg.appendChild(el('div', { class: 'pledge-head' }, [
    el('h2', {}, [t(`${o.marking} material does not go in this tool`, `Le contenu ${o.marking} n\u2019a pas sa place dans cet outil`)]),
    x,
  ]));

  /**
   * FOUR LINES, FROM FIFTEEN.
   *
   * It carried two numbered steps, a subject line to copy, a note saying the real one is
   * written per question, and a sentence about a high-level answer scoring about 5. Reported
   * on 20 October: there's no hierarchy, way too much text, maybe we don't have that window
   * at all.
   *
   * The two steps went because the row underneath is where they are carried out: it asks for
   * a link, it offers the email route, and it writes the subject line with the real question
   * number in it beside a button that copies it. The scoring note went because reassurance
   * about a score does not belong inside a warning about classified material.
   *
   * What a window has to say here is the one thing nothing else on the screen says: the
   * material stays out, and the marking goes in.
   */
  dlg.appendChild(el('div', { class: 'pledge-body' }, [
    el('p', {}, [
      t('Record the marking here and keep the material out, in the answers and in the evidence alike. Name it, say where it is kept, and send it to your assessor yourself.',
        'Indiquez la cote ici et gardez le contenu \u00e0 l\u2019ext\u00e9rieur, dans les r\u00e9ponses comme dans les preuves. Nommez-le, dites o\u00f9 il est conserv\u00e9 et transmettez-le vous-m\u00eame \u00e0 votre \u00e9valuateur.'),
    ]),
    el('p', { class: 'muted small' }, [
      t('The row underneath writes the subject line for that email, with this question\u2019s number in it:',
        'La ligne ci-dessous r\u00e9dige l\u2019objet de ce courriel, avec le num\u00e9ro de cette question :'),
      el('code', { class: 'mono pledge-subject' }, [o.subject]),
    ]),
    el('label', { class: 'pledge-ack' }, [box, t('I understand, and I will keep this tool unclassified.', 'Je comprends, et je garderai cet outil non classifié.')]),
    hint,
    el('div', { class: 'pledge-out' }, [
      el('button', { class: 'linkish small', onclick: () => { o.onUnclassified(); close(); } }, [
        t(`This is unclassified after all, not ${o.marking}`, `C\u2019est finalement non classifié, pas ${o.marking}`),
      ]),
    ]),
  ]));

  // Escape is a dismissal, and this is not dismissable until the box is ticked.
  dlg.addEventListener('cancel', (e) => { if (!ticked) e.preventDefault(); });
  dlg.addEventListener('close', () => { if (!closing) { dlg.remove(); scrim.remove(); } });

  document.body.appendChild(scrim);
  document.body.appendChild(dlg);

  const d = dlg as HTMLDialogElement;
  if (typeof d.showModal === 'function') {
    d.showModal();
    scrim.remove();                       // the native ::backdrop does this properly
  } else {
    d.setAttribute('open', '');           // anything without dialog support
    dlg.classList.add('no-modal');
  }
  setTimeout(() => box.focus?.(), 0);
}
