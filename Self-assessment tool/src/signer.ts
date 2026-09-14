/**
 * Who is saving this, asked every time it is saved online.
 *
 * Dan asked for it on 14 September and the reason is the one thing nothing else in the tool
 * provides: a version in the store used to arrive with no person attached to it at all. The
 * owner's address is set once, when the record is created, and a co-author holding the access
 * code never leaves a trace. So an assessor reading a submission could not tell who wrote the
 * version in front of them, or who to ask about it.
 *
 * WHAT IT IS NOT
 *
 * It is not authentication and it never says it is. Nobody checks this name and nobody sends
 * mail to this address. A person could type the Prime Minister's name and the tool would keep
 * it. That is true of the assessor's own name today too, and the tool says "unverified" beside
 * every one of them for the same reason.
 *
 * What it buys is what a signature in a paper file buys: an assessor holding a version can see
 * whose it is and go and ask them. That is the whole requirement, and a checked identity would
 * cost every submitter an account, which is exactly what Dan does not want.
 *
 * TYPING IT EVERY TIME, WITHOUT TYPING IT EVERY TIME
 *
 * Asked for in these words: prefill it in grey, tab to accept it as though you had typed it,
 * enter to save. So the remembered values are shown as placeholder text, one Tab from the first
 * field fills both and moves to the button, and Enter presses it. Tab, Enter, done.
 *
 * The values live in this browser under their own key. They are a convenience and nothing
 * depends on them: a cleared browser asks again, which is the correct outcome.
 */
import { el } from './dom';
import { t } from './i18n';

const KEY = 'gc-arch-assessment:signer';

export interface Signer {
  name: string;
  email: string;
}

/** What this browser remembers, or two empty strings. */
export function rememberedSigner(): Signer {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { name: '', email: '' };
    const x = JSON.parse(raw) as Partial<Signer>;
    return { name: String(x.name ?? ''), email: String(x.email ?? '') };
  } catch {
    // A private window, or storage turned off. Asking again is the right answer.
    return { name: '', email: '' };
  }
}

export function rememberSigner(who: Signer): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(who));
  } catch { /* nothing remembered, and nothing depends on it */ }
}

/**
 * Deliberately loose, and the looseness is the decision.
 *
 * There is no single Government of Canada email domain. The published Email Management
 * Services Configuration Requirements give every public servant TWO addresses, one at their
 * department's own domain and one at canada.ca, and the departmental half differs for every
 * department: hc-sc.gc.ca, ssc-spc.gc.ca, dfo-mpo.gc.ca, tbs-sct.gc.ca. The Senate uses
 * sen.parl.gc.ca, two levels below gc.ca. Canada Post is not on gc.ca at all. Duplicate names
 * get a digit, middle initials add a third dot-separated segment, and generic mailboxes look
 * nothing like a person.
 *
 * So the blocking check asks only that it be an address at all. Anything stricter turns away a
 * real public servant on a Friday afternoon, and a form that refuses a real person is a worse
 * failure here than one that accepts a typo, because nobody verifies this name anyway.
 */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;

/** Whether this is the kind of address the tool expects. Advice, never a refusal. */
export function looksGovernment(email: string): boolean {
  return /\.(gc|canada)\.ca$/i.test(email.trim());
}

export function signerProblem(who: Signer): string | null {
  if (!who.name.trim()) {
    return t('Put your name in before saving. An assessor reading this needs to know whose it is.',
      'Inscrivez votre nom avant d’enregistrer. Un évaluateur qui lit ceci doit savoir de qui elle est.');
  }
  // Word and Outlook paste a non-breaking space, which is the one that actually bites.
  const email = who.email.replace(/[\s ]+/g, '');
  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return t('That does not look like an email address. It is how somebody reaches you about this assessment.',
      'Cela ne ressemble pas à une adresse courriel. C’est ainsi qu’on vous joindra au sujet de cette évaluation.');
  }
  return null;
}

export interface SignerFields {
  node: HTMLElement;
  value: () => Signer;
  focus: () => void;
}

/**
 * The two fields, with the remembered values offered rather than filled.
 *
 * Offered, not filled, because a filled field is a claim the tool is making on somebody's
 * behalf: the second person to use a shared machine would save under the first person's name
 * without ever reading it. Grey text they accept with one key is the same number of keystrokes
 * and none of that.
 */
export function signerFields(): SignerFields {
  const was = rememberedSigner();
  const has = !!(was.name && was.email);

  const name = el('input', {
    class: 'signer-box', type: 'text', autocomplete: 'name', spellcheck: false,
    placeholder: was.name || t('First and last name', 'Prénom et nom'),
    'aria-label': t('Your name', 'Votre nom'),
  }) as HTMLInputElement;

  const email = el('input', {
    class: 'signer-box', type: 'email', autocomplete: 'email', spellcheck: false,
    inputmode: 'email',
    placeholder: was.email || t('you@department.gc.ca', 'vous@ministere.gc.ca'),
    'aria-label': t('Your government email address', 'Votre adresse courriel du gouvernement'),
  }) as HTMLInputElement;

  const advice = el('p', { class: 'signer-advice' });
  const sayAdvice = () => {
    const v = email.value.trim();
    advice.textContent = !v || looksGovernment(v)
      ? ''
      : t('That is not a gc.ca or canada.ca address. It will be saved as you typed it.',
          'Ce n’est pas une adresse gc.ca ou canada.ca. Elle sera enregistrée telle quelle.');
  };
  email.addEventListener('input', sayAdvice);
  email.addEventListener('blur', sayAdvice);

  /**
   * Tab from the first field, while both are empty, accepts both and goes to the button. So the
   * whole thing is Tab then Enter, which is what was asked for. Tab does its ordinary job the
   * moment anything has been typed, because overriding it then would trap somebody in a field.
   */
  const acceptAll = (): boolean => {
    if (!has || name.value || email.value) return false;
    name.value = was.name;
    email.value = was.email;
    sayAdvice();
    return true;
  };
  name.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Tab' || (e as KeyboardEvent).shiftKey) return;
    if (!acceptAll()) return;
    e.preventDefault();
    const commit = name.closest('dialog')?.querySelector('.cf-actions button') as HTMLElement | null;
    commit?.focus();
  });
  email.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Tab' || (e as KeyboardEvent).shiftKey || email.value) return;
    if (!has) return;
    e.preventDefault();
    email.value = was.email;
    sayAdvice();
    const commit = email.closest('dialog')?.querySelector('.cf-actions button') as HTMLElement | null;
    commit?.focus();
  });

  const node = el('div', { class: 'signer' }, [
    el('label', { class: 'signer-row' }, [
      el('span', { class: 'signer-label' }, [t('Your name', 'Votre nom')]),
      name,
    ]),
    el('label', { class: 'signer-row' }, [
      el('span', { class: 'signer-label' }, [t('Your work email', 'Votre courriel professionnel')]),
      email,
    ]),
    advice,
    has
      ? el('p', { class: 'signer-hint' }, [
          t('Press Tab to use what you entered last time, then Enter to save.',
            'Appuyez sur Tab pour reprendre ce que vous avez saisi la dernière fois, puis sur Entrée pour enregistrer.'),
        ])
      : null,
  ]);

  return {
    node,
    value: () => ({
      name: name.value.trim() || was.name,
      email: (email.value.trim() || was.email).replace(/[\s ]+/g, ''),
    }),
    focus: () => name.focus(),
  };
}
