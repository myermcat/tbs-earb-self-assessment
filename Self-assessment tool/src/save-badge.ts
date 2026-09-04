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
    saving: t('Writing to the TBS store', 'Enregistrement dans le dépôt du SCT'),
    local: isHosted()
      ? t(
          'Kept in this browser only. Sending it to TBS is a separate step, at the bottom of My results. Click for the detail.',
          'Conservé dans ce navigateur seulement. L\u2019envoi au SCT est une étape distincte, au bas de Mes résultats. Cliquez pour le détail.',
        )
      : t(
          'Kept in this browser only. This build has no store to send to. Click for the detail.',
          'Conservé dans ce navigateur seulement. Cette version n\u2019a aucun dépôt où envoyer. Cliquez pour le détail.',
        ),
    online: t('Written to the TBS store. Your assessor sees this copy.', 'Enregistré dans le dépôt du SCT. Votre évaluateur voit cette copie.'),
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
    if (state === 'saving') {
      node.appendChild(el('span', { class: 'spin', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, ['Saving']));
    } else if (state === 'local') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, [t('Draft saved in browser', 'Brouillon enregistré dans le navigateur')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Saved here', 'Enregistré ici')]));
    } else if (state === 'online') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, [t('Saved to TBS', 'Enregistré au SCT')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Saved', 'Enregistré')]));
    } else {
      node.appendChild(el('span', { class: 'ss-long' }, [detail || t('Not saved. Check your connection.', 'Non enregistré. Vérifiez votre connexion.')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Not saved', 'Non enregistré')]));
    }
  };

  paint();
  onSaveStateChange(paint);
  return node;
}
