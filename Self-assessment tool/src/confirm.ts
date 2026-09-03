import { el, clear } from './dom';

/**
 * The confirmation every destroying action goes through. Her rule, stated twice: nothing is
 * ever deleted in one step, and the window always says what is about to be lost.
 *
 * `offer` is the way out that keeps the thing: download it, save it, export it. It is optional
 * because some actions have nothing to hand back.
 */
export interface ConfirmStep {
  tier: 'caution' | 'danger';
  title: string;
  body: string;
  /** What is at stake, in one line. Rendered in the tone of the tier. */
  stake?: string;
  /**
   * The keep-a-copy escape. Runs, then reports back so the wording can change.
   *
   * `commits` makes it one action: take the copy and go ahead. Without it the copy is taken
   * and the person still has to confirm, which is right for a discard and wrong where the
   * copy removes the whole risk.
   */
  offer?: { label: string; run: () => string; commits?: boolean };
  /**
   * A second way to resolve the same problem, which is not the destroying one. Used where the
   * mismatch can be fixed from either end, so both ends are on the buttons.
   */
  alt?: { label: string; run: () => void };
  commitLabel: string;
  cancelLabel: string;
  onCommit: () => void;
}

/**
 * Clicking away from a dialog closes it.
 *
 * A native dialog's backdrop is a pseudo-element, so a click on it arrives with the dialog
 * itself as the target: anything inside the dialog targets a descendant. Cancelling is the
 * safe outcome, which is why this is fine on a destroying confirmation and wrong on the
 * classified pledge, where a tick is the whole point.
 */
export function closeOnOutsideClick(dlg: HTMLElement, cancel: () => void): void {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) cancel(); });
}

/**
 * A small menu closes when the reader clicks anywhere else, presses Escape, or opens another
 * one. Leaving it open on the next click is the thing that reads as broken.
 */
export function closeMenusOnOutsideClick(root: Document | HTMLElement, selector = 'details.set-menu'): void {
  const all = () => [...root.querySelectorAll<HTMLDetailsElement>(selector)];
  root.addEventListener('click', (e) => {
    const inside = (e.target as HTMLElement | null)?.closest?.(selector);
    for (const d of all()) if (d !== inside) d.open = false;
  }, true);
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    for (const d of all()) d.open = false;
  });
}

/**
 * Show a dialog, modal where the browser can.
 *
 * The old fallback called window.confirm and treated OK as yes, which meant a browser without
 * dialog support confirmed a delete through a box that never named what it was deleting. The
 * same dialog, non-modal, says everything it was going to say.
 */
export function openDialog(dlg: HTMLElement): void {
  const d = dlg as HTMLDialogElement;
  if (typeof d.showModal === 'function') { d.showModal(); return; }
  d.setAttribute('open', '');
  dlg.classList.add('no-modal');
}

export function confirmStep(o: ConfirmStep): void {
  const dlg = document.createElement('dialog');

  dlg.className = `confirm tier-${o.tier}`;
  const body = el('div', { class: 'cf-body' }, [el('p', {}, [o.body])]);
  let stakeEl = o.stake ? el('p', { class: 'cf-stake' }, [o.stake]) : null;
  if (stakeEl) body.appendChild(stakeEl);

  const close = () => { try { dlg.close(); } catch { /* already closed */ } dlg.remove(); };
  const actions = el('div', { class: 'cf-actions' });

  const paint = (kept: boolean) => {
    clear(actions);
    if (o.offer && !kept) {
      actions.appendChild(el('button', { class: 'primary cf-wide', onclick: () => {
        const said = o.offer!.run();
        if (o.offer!.commits) { close(); o.onCommit(); return; }
        const fresh = el('p', { class: 'cf-stake ok' }, [said]);
        if (stakeEl) { stakeEl.replaceWith(fresh); } else { body.appendChild(fresh); }
        stakeEl = fresh;
        paint(true);
      } }, [o.offer.label]));
    }
    if (o.alt) {
      actions.appendChild(el('button', { class: 'primary cf-wide', onclick: () => {
        close();
        o.alt!.run();
      } }, [o.alt.label]));
    }
    actions.appendChild(el('button', {
      class: `${o.tier === 'danger' ? 'danger-solid' : 'danger'} cf-wide`,
      onclick: () => { close(); o.onCommit(); },
    }, [kept && o.offer ? `I have the copy. ${o.commitLabel.toLowerCase()}` : o.commitLabel]));

    // The safe control takes focus, so Enter and Escape both mean cancel.
    const cancel = el('button', { class: 'cf-wide', onclick: close }, [o.cancelLabel]);
    actions.appendChild(cancel);
    setTimeout(() => cancel.focus?.(), 0);
  };
  paint(false);

  dlg.appendChild(el('div', { class: 'cf-head' }, [el('h2', { class: 'cf-title' }, [o.title])]));
  dlg.appendChild(body);
  dlg.appendChild(actions);
  dlg.addEventListener('close', () => dlg.remove());
  closeOnOutsideClick(dlg, close);
  document.body.appendChild(dlg);
  openDialog(dlg);
}
