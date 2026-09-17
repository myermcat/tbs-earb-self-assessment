/**
 * The access code field: twelve boxes in three groups, the way a verification code is typed.
 *
 * One box per character, because a code somebody reads off a chat message and types back is
 * read four characters at a time, and a single long input gives them nothing to hold their
 * place with. The dashes are drawn between the groups and never typed: a person who types them
 * anyway, or pastes a code with them in, gets the same result.
 *
 * Everything a person might reasonably do has to work, because the alternative is somebody
 * deciding the tool is broken when they have the right code in their hand:
 *
 *   - paste the whole code into any box, with or without dashes, upper or lower case
 *   - type it straight through, the focus moving on by itself
 *   - backspace out of an empty box into the one before it
 *   - arrow left and right between boxes
 *   - paste a code with a stray space, which is what a chat client adds
 *
 * It is its own file because both sides of the tool need it, and because a field that people
 * fight with is the thing that decides whether sharing gets used at all.
 */
import { el } from './dom';
import { CODE_GROUP, CODE_LENGTH, strayInCode, tidyCode } from './firebase';

export interface CodeField {
  /** The field, ready to append. */
  node: HTMLElement;
  /** What has been typed, with no dashes. Twelve characters when it is complete. */
  value: () => string;
  /** Put a code in, from a paste button or from an address. */
  set: (code: string) => void;
  focus: () => void;
}

/**
 * @param onComplete called once the twelfth character arrives, so a form can act without
 *        anybody pressing a button. It is also fine to leave the button as the only way in.
 * @param onStray called with the characters a code cannot contain when somebody types or
 *        pastes one, so the screen can say what happened to it rather than leaving a box
 *        that refuses to fill.
 */
export function codeField(onComplete: () => void = () => {}, onStray: (chars: string[]) => void = () => {}): CodeField {
  const boxes: HTMLInputElement[] = [];
  const node = el('div', { class: 'code-field', role: 'group', 'aria-label': 'Access code' });

  const value = () => boxes.map((b) => b.value).join('');

  const settle = () => {
    if (value().length === CODE_LENGTH) onComplete();
  };

  /** Spread a string across the boxes from a starting point, and leave the caret after it. */
  const spread = (from: number, text: string) => {
    const stray = strayInCode(text);
    if (stray.length) onStray(stray);
    const clean = tidyCode(text);
    let at = from;
    for (const ch of clean) {
      if (at >= CODE_LENGTH) break;
      boxes[at].value = ch;
      at++;
    }
    boxes[Math.min(at, CODE_LENGTH - 1)].focus();
    settle();
  };

  for (let i = 0; i < CODE_LENGTH; i++) {
    if (i > 0 && i % CODE_GROUP === 0) {
      // A plain hyphen. The prose gate is right that an en dash has no business in a sentence,
      // and it has none in a code either: people retype what they see.
      node.appendChild(el('span', { class: 'code-dash', 'aria-hidden': true }, ['-']));
    }
    const box = el('input', {
      class: 'code-box',
      type: 'text',
      inputmode: 'latin',
      autocomplete: i === 0 ? 'one-time-code' : 'off',
      autocapitalize: 'characters',
      spellcheck: false,
      maxlength: 1,
      'aria-label': `Character ${i + 1} of ${CODE_LENGTH}`,
    }) as HTMLInputElement;

    box.addEventListener('input', () => {
      // A phone keyboard and a paste both arrive here, and both can carry more than one
      // character however narrow maxlength is.
      const typed = tidyCode(box.value);
      box.value = '';
      if (typed) spread(i, typed);
    });

    box.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Backspace' && !box.value && i > 0) {
        e.preventDefault();
        boxes[i - 1].value = '';
        boxes[i - 1].focus();
        return;
      }
      if (k === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
      if (k === 'ArrowRight' && i < CODE_LENGTH - 1) { e.preventDefault(); boxes[i + 1].focus(); }
    });

    box.addEventListener('paste', (e) => {
      const text = (e as ClipboardEvent).clipboardData?.getData('text') ?? '';
      if (!text) return;
      e.preventDefault();
      spread(i, text);
    });

    // Clicking into the middle of a half-typed code and typing over it is what people do.
    box.addEventListener('focus', () => box.select());

    boxes.push(box);
    node.appendChild(box);
  }

  return {
    node,
    value,
    set: (code: string) => {
      for (const b of boxes) b.value = '';
      spread(0, code);
    },
    focus: () => boxes[0].focus(),
  };
}
