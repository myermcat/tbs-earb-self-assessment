import { el, clear } from './dom';
import { t } from './i18n';

/**
 * The confirmation every destroying action goes through. Her rule, stated twice: nothing is
 * ever deleted in one step, and the window always says what is about to be lost.
 *
 * `offer` is the way out that keeps the thing: download it, save it, export it. It is optional
 * because some actions have nothing to hand back.
 */
export interface ConfirmStep {
  /**
   * How much is at stake, which decides the colour of everything.
   *
   * 'plain' is for a window that asks about something destroying nothing. It exists because the
   * save-online window was borrowing 'caution', so a person choosing to save their own work was
   * shown an amber bar, a red-bordered warning panel and a red confirm button. Red is a word,
   * and using it on an action that takes nothing away spends it.
   */
  tier: 'plain' | 'caution' | 'danger';
  title: string;
  body: string;
  /** What is at stake, in one line. Rendered in the tone of the tier. */
  stake?: string;
  /**
   * Something the window has to show rather than say: an access code to copy, usually.
   *
   * A string cannot be clicked, and a code somebody is about to lose is exactly the thing they
   * need to take with them, so a window that mentions one has to hand it over.
   */
  extra?: HTMLElement;
  /**
   * A second thought, below the decision and quieter than it.
   *
   * The body is the thing being decided. A note is the thing worth knowing once, and putting
   * the two in one paragraph is how a window ends up saying two unrelated things in one voice.
   */
  note?: string;
  /**
   * Something the window needs before it will commit, checked when the button is pressed.
   *
   * Returns the problem in words, or null when there is none. It exists because saving online
   * now asks who is saving, and a window with a field in it has to be able to say "not yet"
   * without closing and losing what was typed.
   */
  gate?: () => string | null;
  /**
   * A thing to tick before the window will commit.
   *
   * There is exactly one use and it is the reason it exists: an act that replaces the only copy
   * of an assessment cannot proceed on somebody having read a sentence about the code. Ticking
   * is deliberate in a way that reading is not, and the code is right there to copy.
   */
  mustAgree?: string;
  /** Focused when the window opens, if the window has something to type in. */
  focusFirst?: () => void;
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
  if (o.extra) body.appendChild(el('div', { class: 'cf-extra' }, [o.extra]));
  let agreed: HTMLInputElement | null = null;
  if (o.mustAgree) {
    agreed = el('input', { type: 'checkbox', class: 'cf-agree-box' }) as HTMLInputElement;
    body.appendChild(el('label', { class: 'cf-agree' }, [agreed, el('span', {}, [o.mustAgree])]));
  }
  if (o.note) body.appendChild(el('p', { class: 'cf-note' }, [o.note]));
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
      actions.appendChild(el('button', { class: `${o.tier === 'plain' ? 'ghost' : 'primary'} cf-wide`, onclick: () => {
        close();
        o.alt!.run();
      } }, [o.alt.label]));
    }
    /**
     * The loudest control is the one that keeps the work, and never the one that loses it.
     *
     * This window used to draw the destroying answer as a solid red button, which made it the
     * brightest thing on screen: somebody who is not going to read four lines of prose clicks
     * the brightest thing, and the brightest thing was "Go ahead". So on any window with
     * something at stake the destroying answer is outlined and the way out is solid, and the
     * rule holds for every window that goes through here.
     *
     * On a 'plain' window nothing is being lost and the commit is what the person came to do,
     * so it stays the bright one.
     */
    const commit = el('button', {
      class: `${o.tier === 'plain' ? 'primary' : 'danger'} cf-wide`,
      onclick: () => {
        const problem = agreed && !agreed.checked
          ? t('Tick the box first.', 'Cochez d\u2019abord la case.')
          : o.gate?.();
        if (problem) {
          const said = el('p', { class: 'cf-stake' }, [problem]);
          if (stakeEl) stakeEl.replaceWith(said); else body.appendChild(said);
          stakeEl = said;
          /**
           * The window shakes, because a refusal that only adds a line of text is a refusal
           * somebody misses: they pressed a button, nothing visibly happened, and they press it
           * again harder. Honoured only when the person has not asked for less motion.
           */
          dlg.classList.remove('shake');
          void dlg.offsetWidth;
          dlg.classList.add('shake');
          if (agreed && !agreed.checked) agreed.focus(); else o.focusFirst?.();
          return;
        }
        close();
        o.onCommit();
      },
    }, [kept && o.offer
      ? t(`I have the copy. ${o.commitLabel.toLowerCase()}`, `J\u2019ai la copie. ${o.commitLabel.toLowerCase()}`)
      : o.commitLabel]);
    actions.appendChild(commit);

    /**
     * The safe control takes focus, so Enter and Escape both mean cancel.
     *
     * An empty label means there is nothing to decide: the window is telling you something and
     * the only sensible answer is that you have read it. Drawing a nameless second button there
     * asks a question the window did not pose.
     */
    const keepsIt = o.tier !== 'plain' && !o.offer && !o.alt;
    const cancel = o.cancelLabel
      ? el('button', { class: `${keepsIt ? 'primary ' : ''}cf-wide`, onclick: close }, [o.cancelLabel])
      : null;
    if (cancel) actions.appendChild(cancel);
    /**
     * A window with a field in it puts the caret in the field instead, because somebody who has
     * been asked a question is going to answer it, and Enter from there is the commit.
     */
    const rest = cancel ?? (actions.lastElementChild as HTMLElement | null);
    setTimeout(() => { if (o.focusFirst) o.focusFirst(); else rest?.focus?.(); }, 0);
    dlg.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Enter' && o.focusFirst && (e.target as HTMLElement)?.tagName === 'INPUT') {
        e.preventDefault();
        commit.click();
      }
    });
  };
  paint(false);

  /**
   * The title is the sentence somebody has to read, so it is the biggest type in the window.
   *
   * It was 1.1rem, a shade above the body, under which sat four lines of prose and a bright
   * button. What the window is FOR has to arrive before anybody decides they are not reading
   * this one, which means the title carries the whole of it: "Keep this code", not "Saved".
   */
  dlg.appendChild(el('div', { class: 'cf-head' }, [el('h2', { class: 'cf-title' }, [o.title])]));
  dlg.appendChild(body);
  dlg.appendChild(actions);
  dlg.addEventListener('close', () => dlg.remove());
  closeOnOutsideClick(dlg, close);
  document.body.appendChild(dlg);
  openDialog(dlg);
}

/**
 * The delete that has to be typed out, copied from the way GitHub deletes a repository.
 *
 * The reason it works: a confirmation you can agree to by reflex stops being a confirmation
 * once you have seen it twice. Typing the name cannot be done by reflex, and it fails safe,
 * because a person who cannot produce the name is not looking at what they think they are.
 */
export interface ConfirmTyped {
  /** What is being deleted, as a heading: "Delete the Nexus platform assessment?" */
  title: string;
  /** Everything that goes, listed. GitHub enumerates it and so should we. */
  consequences: string[];
  /** The exact string somebody has to type. Shown, so it can be read and copied. */
  /**
   * The line above the list. Defaults to saying the act cannot be undone, which is true of a
   * deleted assessment and false of access that any assessor can give back.
   */
  lead?: string;
  /**
   * Whether the window prints the string it is asking for.
   *
   * Printing it turns the typing into a copy exercise and the guard becomes decoration. GitHub
   * renders its confirming string so it cannot be selected, on purpose, and the complaints
   * about that are the feature working. Anything in the danger zone passes false: the person
   * has to get the string from the screen that owns it, which is the act that proves they meant
   * this one. Defaults true, because the older callers name a thing already on screen in front
   * of the reader.
   */
  showPhrase?: boolean;
  phrase: string;
  /** What to call the phrase in the instruction: "the initiative name", "the reference". */
  phraseLabel: string;
  commitLabel: string;
  onCommit: () => void;
}

export function confirmTyped(o: ConfirmTyped): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'confirm tier-danger typed';

  const close = () => { try { (dlg as HTMLDialogElement).close(); } catch { /* not open */ } dlg.remove(); };

  const go = el('button', { class: 'danger-solid cf-wide', disabled: true }, [o.commitLabel]) as HTMLButtonElement;
  const field = el('input', {
    type: 'text',
    class: 'typed-field',
    autocomplete: 'off',
    spellcheck: false,
    'aria-label': t(`Type ${o.phraseLabel} to confirm`, `Saisissez ${o.phraseLabel} pour confirmer`),
    oninput: (e: Event) => {
      const typed = (e.target as HTMLInputElement).value.trim();
      go.disabled = typed !== o.phrase;
      go.classList.toggle('armed', !go.disabled);
    },
  }) as HTMLInputElement;
  go.onclick = () => { if (!go.disabled) { close(); o.onCommit(); } };

  /**
   * The title is the sentence somebody has to read, so it is the biggest type in the window.
   *
   * It was 1.1rem, a shade above the body, under which sat four lines of prose and a bright
   * button. What the window is FOR has to arrive before anybody decides they are not reading
   * this one, which means the title carries the whole of it: "Keep this code", not "Saved".
   */
  dlg.appendChild(el('div', { class: 'cf-head' }, [el('h2', { class: 'cf-title' }, [o.title])]));
  dlg.appendChild(el('div', { class: 'cf-body' }, [
    el('p', {}, [o.lead ?? t('This cannot be undone. It removes:', 'Cette action est irréversible. Elle supprime :')]),
    el('ul', { class: 'typed-list' }, o.consequences.map((c) => el('li', {}, [c]))),
    o.showPhrase === false
      ? el('p', { class: 'typed-ask' }, [
          t(`To confirm, type ${o.phraseLabel}. It is not printed here, so that typing it is an act and not a copy.`,
            `Pour confirmer, saisissez ${o.phraseLabel}. Nous ne l\u2019affichons pas ici, afin que la saisie soit un acte et non une copie.`),
        ])
      : el('p', { class: 'typed-ask' }, [
          t(`To confirm, type ${o.phraseLabel}: `, `Pour confirmer, saisissez ${o.phraseLabel} : `),
          el('code', { class: 'mono' }, [o.phrase]),
        ]),
    field,
  ]));
  dlg.appendChild(el('div', { class: 'cf-actions' }, [
    go,
    el('button', { class: 'cf-wide', onclick: close }, [t('Cancel', 'Annuler')]),
  ]));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  openDialog(dlg);
  setTimeout(() => field.focus?.(), 0);
}
