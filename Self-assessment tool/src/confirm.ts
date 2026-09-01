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
  /** The keep-a-copy escape. Runs, then reports back so the wording can change. */
  offer?: { label: string; run: () => string };
  commitLabel: string;
  cancelLabel: string;
  onCommit: () => void;
}

export function confirmStep(o: ConfirmStep): void {
  const dlg = document.createElement('dialog');

  // jsdom has no showModal. The tests drive the fallback, so the fallback has to be real
  // rather than a silent no-op that would let a delete through unconfirmed.
  if (typeof (dlg as HTMLDialogElement).showModal !== 'function') {
    if (window.confirm(`${o.title}\n\n${o.body}`)) o.onCommit();
    return;
  }

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
        const fresh = el('p', { class: 'cf-stake ok' }, [said]);
        if (stakeEl) { stakeEl.replaceWith(fresh); } else { body.appendChild(fresh); }
        stakeEl = fresh;
        paint(true);
      } }, [o.offer.label]));
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
  document.body.appendChild(dlg);
  (dlg as HTMLDialogElement).showModal();
}
