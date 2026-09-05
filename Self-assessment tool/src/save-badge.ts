import { el, clear } from './dom';
import { onSaveStateChange, saveStatus } from './storage';
import { t } from './i18n';
import { isHosted } from './store';

/**
 * Where the work is, on every screen.
 *
 * It used to live in the questionnaire's own footer, which meant it appeared on the 21
 * question pages and nowhere else - not on the start page, not on the results, not in the
 * assessor views - and CSS hid it below 720px, so a phone never showed it at all. It belongs
 * in the chrome, which every screen has.
 *
 * Idle shows nothing. A page with no work on it announcing "draft saved" is a claim ahead of
 * the fact, which is what it did before.
 */
export function saveBadge(openDetail: () => void): HTMLElement {
  const node = el('button', {
    class: 'save-state tiny',
    role: 'status',
    onclick: openDetail,
  });

  // Hovering it answers the question people actually have, which is whether anybody else can
  // see this yet.
  const TITLE: Record<string, string> = {
    idle: t('Nothing written yet', 'Rien n\u2019a encore été enregistré'),
    local: isHosted()
      ? t(
          'Kept on this machine only. Sign in and your work is kept at TBS as you go. Click for the detail.',
          'Conservé sur cet appareil seulement. Connectez-vous et votre travail sera conservé au SCT à mesure. Cliquez pour le détail.',
        )
      : t(
          'Kept in this browser only. This build has no store to send to. Click for the detail.',
          'Conservé dans ce navigateur seulement. Cette version n\u2019a aucun dépôt où envoyer. Cliquez pour le détail.',
        ),
    pending: t('Kept here, and on its way to TBS', 'Conservé ici, et en route vers le SCT'),
    saving: t('Writing to the TBS store', 'Enregistrement dans le dépôt du SCT'),
    online: t('Kept at TBS. Your assessor reads this copy.', 'Conservé au SCT. Votre évaluateur lit cette copie.'),
    offline: t(
      'Kept on this machine. It goes to TBS when the connection is back.',
      'Conservé sur cet appareil. L\u2019envoi au SCT se fera au retour de la connexion.',
    ),
    failed: t('The last write did not go through. Click for what to do.', 'Le dernier enregistrement n\u2019a pas abouti. Cliquez pour savoir quoi faire.'),
  };

  const paint = () => {
    const { state, detail } = saveStatus();
    clear(node);
    node.className = `save-state tiny st-${state}`;
    node.setAttribute('title', TITLE[state] ?? '');
    if (state === 'idle') {
      node.classList.add('hidden');
      return;
    }
    if (state === 'saving' || state === 'pending') {
      if (state === 'saving') node.appendChild(el('span', { class: 'spin', 'aria-hidden': true }));
      else node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, [t('Saving to TBS', 'Enregistrement au SCT')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Saving', 'En cours')]));
    } else if (state === 'local') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, [t('Draft saved in browser', 'Brouillon enregistré dans le navigateur')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Saved here', 'Enregistré ici')]));
    } else if (state === 'online') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, [t('Saved to TBS', 'Enregistré au SCT')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Saved', 'Enregistré')]));
    } else if (state === 'offline') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, [t('Saved here, waiting for a connection', 'Enregistré ici, en attente d\u2019une connexion')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Waiting', 'En attente')]));
    } else {
      node.appendChild(el('span', { class: 'ss-long' }, [detail || t('Not saved. Check your connection.', 'Non enregistré. Vérifiez votre connexion.')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Not saved', 'Non enregistré')]));
    }
  };

  paint();
  onSaveStateChange(paint);
  return node;
}
