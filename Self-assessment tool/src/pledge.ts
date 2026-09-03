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

  dlg.appendChild(el('div', { class: 'pledge-body' }, [
    el('p', {}, [
      t('Nothing above unclassified belongs in here, answers or evidence. Recording the marking is right; putting the material itself in is not.', 'Rien au-dessus de Non classifié n\u2019a sa place ici, ni les réponses ni les preuves. Indiquer la cote est la bonne chose à faire; y mettre le contenu lui-même ne l\u2019est pas.'),
    ]),
    el('ol', { class: 'steps' }, [
      el('li', {}, [
        el('b', {}, [t('Link to it where it already lives, ', 'Pointez vers son emplacement actuel, ')]),
        t('and make sure your assessor can open it. A link is unclassified even when the document is not.', 'et assurez-vous que votre évaluateur peut l\u2019ouvrir. Un lien est non classifié même quand le document ne l\u2019est pas.'),
      ]),
      el('li', {}, [
        el('b', {}, [t('If it cannot be linked, email it to your assessor ', 'Si le lien est impossible, envoyez-le par courriel à votre évaluateur ')]),
        t('and say so in the evidence box under the question. The subject line has to say which initiative and which question, so they can match your email to your answer:', 'et indiquez-le dans la zone de preuve sous la question. L\u2019objet doit préciser l\u2019initiative et la question, pour que votre courriel puisse être rattaché à votre réponse :'),
        el('code', { class: 'mono pledge-subject' }, [o.subject]),
        el('span', { class: 'muted small' }, [
          t('That is an example. The evidence box writes the line for you, with the real question number in it, and there is a button to copy it.', 'Ceci est un exemple. La zone de preuve rédige la ligne pour vous, avec le vrai numéro de question, et un bouton la copie.'),
        ]),
      ]),
    ]),
    el('p', { class: 'muted small' }, [
      t('Describing the shape of a system is usually unclassified. A high-level answer scores about 5, and 5 is a fine score.', 'Décrire la forme d\u2019un système est habituellement non classifié. Une réponse générale obtient environ 5, et 5 est une bonne note.'),
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
