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
import { storeKey } from './keys';

const KEY = storeKey('signer');

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
 * The local part, which nothing here narrows.
 *
 * A negated class rather than an allow-list, because every real shape has to pass: dots for
 * firstname.lastname, a second dot for a middle initial, hyphens and underscores in generic
 * mailboxes, a digit from the rule that gives duplicate names a number, and accented characters
 * for a name that has them. The domain is where the check actually lives, below.
 */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;

/**
 * Whether this is a Government of Canada work address, which is now a refusal and not advice.
 *
 * Every federal department sits under gc.ca: tbs-sct.gc.ca, dfo-mpo.gc.ca, hc-sc.gc.ca,
 * ssc-spc.gc.ca, forces.gc.ca, and the Senate at sen.parl.gc.ca, which is two levels down and
 * is why this matches a suffix rather than a list of departments. canada.ca is the second
 * address the published email standard gives every public servant on the same mailbox; most
 * people never use theirs, which is why it is accepted and not required.
 *
 * A list of every department would have to be maintained by somebody and would turn away a
 * real person the week a department is renamed. The suffix cannot go stale.
 */
export function looksGovernment(email: string): boolean {
  return /\.(gc|canada)\.ca$/i.test(email.trim());
}

/**
 * Whether this address is a different person from the one this browser last saved as.
 *
 * The case it exists for: somebody accepts the remembered address, deletes half of it by
 * accident, and presses Enter. The result still passes every check and is a different mailbox,
 * so that version is attributed to somebody who cannot be found and the trail no longer joins
 * up. Nothing can detect a typo, but a change can be noticed, and noticing is enough: the tool
 * asks once, and somebody who meant it says yes.
 */
export function signerChanged(who: Signer): boolean {
  const was = rememberedSigner();
  if (!was.email) return false;
  return was.email.trim().toLowerCase() !== who.email.trim().toLowerCase();
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
  /**
   * Refused, not warned about. Warning was the first version and it was wrong: somebody who has
   * not read the grey line presses save and the address goes in as typed, and a half-typed
   * address is a version attributed to nobody who can be found.
   */
  if (!looksGovernment(email)) {
    return t('Use your government address, ending in gc.ca or canada.ca. This is how an assessor reaches you about this assessment.',
      'Utilisez votre adresse du gouvernement, se terminant par gc.ca ou canada.ca. C’est ainsi qu’un évaluateur vous joindra au sujet de cette évaluation.');
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
    if (v && !looksGovernment(v)) {
      advice.className = 'signer-advice';
      advice.textContent = t('This has to end in gc.ca or canada.ca.',
        'Elle doit se terminer par gc.ca ou canada.ca.');
      return;
    }
    /**
     * A changed address, noticed out loud. Somebody accepts the remembered one, deletes half of
     * it by accident and presses Enter: it still passes every check and it is a different
     * mailbox, so that version is attributed to somebody who cannot be found.
     */
    if (v && was.email && v.toLowerCase() !== was.email.toLowerCase()) {
      advice.className = 'signer-advice signer-changed';
      advice.textContent = t(`Last time you saved as ${was.email}. Check this is right.`,
        `La dernière fois, vous avez enregistré comme ${was.email}. Vérifiez que c’est exact.`);
      return;
    }
    advice.className = 'signer-advice';
    advice.textContent = '';
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

  /**
   * What is in the boxes, and nothing else.
   *
   * This used to fall back to the remembered pair when a box was left empty, and the gate is
   * fed this same value, so two empty boxes passed every check and the version went into the
   * store under whoever used this browser last. The comment at the top of this function says
   * that cannot happen; it could. Tab already fills both boxes visibly, which is the accept
   * path, so the only thing lost here is a save nobody looked at.
   */
  return {
    node,
    value: () => ({
      name: name.value.trim(),
      email: email.value.trim().replace(/[\s ]+/g, ''),
    }),
    focus: () => name.focus(),
  };
}
