import { el, clear } from './dom';
import { onSaveStateChange, saveStatus } from './storage';

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
    title: 'Where your answers are kept',
    onclick: openDetail,
  });

  const paint = () => {
    const { state, detail } = saveStatus();
    clear(node);
    node.className = `save-state tiny st-${state}`;
    if (state === 'idle') {
      node.classList.add('hidden');
      return;
    }
    if (state === 'saving') {
      node.appendChild(el('span', { class: 'spin', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, ['Saving']));
    } else if (state === 'local') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, ['Draft saved in browser']));
      node.appendChild(el('span', { class: 'ss-short' }, ['Saved here']));
    } else if (state === 'online') {
      node.appendChild(el('span', { class: 'ss-dot', 'aria-hidden': true }));
      node.appendChild(el('span', { class: 'ss-long' }, ['Saved to TBS']));
      node.appendChild(el('span', { class: 'ss-short' }, ['Saved']));
    } else {
      node.appendChild(el('span', { class: 'ss-long' }, [detail || 'Not saved. Check your connection.']));
      node.appendChild(el('span', { class: 'ss-short' }, ['Not saved']));
    }
  };

  paint();
  onSaveStateChange(paint);
  return node;
}
