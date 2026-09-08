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
          'Saved on this computer only. Sign in to save it online as well. Click for the detail.',
          'Enregistré sur cet ordinateur seulement. Connectez-vous pour l\u2019enregistrer aussi en ligne. Cliquez pour le détail.',
        )
      : t(
          'Saved on this computer only. This copy of the tool has nowhere online to save to. Click for the detail.',
          'Enregistré sur cet ordinateur seulement. Cette copie de l\u2019outil n\u2019a nulle part où enregistrer en ligne. Cliquez pour le détail.',
        ),
    pending: t('Saved here, and on its way online', 'Enregistré ici, et en route vers en ligne'),
    saving: t('Saving online', 'Enregistrement en ligne'),
    online: t('Saved online. Your assessor reads this copy.', 'Enregistré en ligne. Votre évaluateur lit cette copie.'),
    offline: t(
      'Saved on this computer. It goes online when the connection is back.',
      'Enregistré sur cet ordinateur. L\u2019enregistrement en ligne se fera au retour de la connexion.',
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
      node.appendChild(el('span', { class: 'ss-long' }, [t('Saving online', 'Enregistrement en ligne')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Saving', 'En cours')]));
    } else if (state === 'local') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, [t('Saved on this computer', 'Enregistré sur cet ordinateur')]));
      node.appendChild(el('span', { class: 'ss-short' }, [t('Saved here', 'Enregistré ici')]));
    } else if (state === 'online') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, [t('Saved online', 'Enregistré en ligne')]));
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
