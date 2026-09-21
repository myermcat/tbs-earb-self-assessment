/**
 * Taking an assessor's access away, which is the hardest thing to do in this tool on purpose.
 *
 * Asked for in these words: it should not be a big and easily clicked button, you do not click
 * a reviewer, you type the name yourself, and the deletion should go through hell to avoid
 * accidental deletion at all cost.
 *
 * So there is no control beside anybody's name anywhere in the product. There is one button, in
 * the danger zone, and it does not know who it is about until somebody types both their full
 * name and the address they sign in with.
 *
 * THE RULE THIS FILE EXISTS TO HOLD, and the one to read before adding anything here:
 *
 *   Nothing in this window narrows the search. No list, no autocomplete, no match count, no
 *   "did you mean", no tick when the name is half right. A hint is a pick list with one item in
 *   it, and it undoes the whole design. A near miss and a wild guess produce the same message.
 *
 * GitHub does the same thing one step further along: the string it asks you to type is rendered
 * so it cannot be selected, and the complaints about that in its own forums are the feature
 * working. Every window in the danger zone passes showPhrase: false for the same reason.
 */
import { el } from './dom';
import { t } from './i18n';
import { confirmStep, confirmTyped } from './confirm';
import { currentUser, grantsAccess, listPeople, setPersonAccess, type Person } from './firebase';

/**
 * Two names are the same name when a person would say they are.
 *
 * Case and stray spacing are somebody typing, not somebody meaning a different person. The three
 * apostrophes are folded together so O'Brien typed on a phone keyboard still matches O'Brien
 * typed on a laptop. Accents are NOT folded: Rene is not René, because exactness is the whole
 * product here and the near-miss window tells somebody to go and read the name properly.
 */
export function sameText(a: string, b: string): boolean {
  const key = (s: string) => s.normalize('NFC')
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return key(a) === key(b) && key(a).length > 0;
}

/** Where somebody goes to leave, once leaving exists. Named here so one string changes it. */
const LEAVING_IS_NOT_BUILT = true;

/**
 * The window that asks who, and refuses to help.
 *
 * Both fields, because two people can share a name and only one of them signs in with a given
 * address. Asked for directly: on deletion you need to type in both their full name AND email.
 */
export function takeAccessAway(after: () => void): void {
  const name = el('input', {
    type: 'text', autocomplete: 'off', spellcheck: false, 'aria-label': 'Their full name',
  }) as HTMLInputElement;
  const email = el('input', {
    type: 'email', autocomplete: 'off', spellcheck: false, inputmode: 'email',
    'aria-label': 'The address they sign in with',
  }) as HTMLInputElement;
  const say = el('p', { class: 'signer-advice' });

  const form = el('div', { class: 'danger-find' }, [
    el('label', { class: 'field' }, [el('span', {}, [t('Their full name', 'Son nom complet')]), name]),
    el('label', { class: 'field' }, [
      el('span', {}, [t('The address they sign in with', 'L’adresse de connexion')]), email,
    ]),
    say,
  ]);

  confirmStep({
    tier: 'danger',
    title: t('Take an assessor’s access away', 'Retirer l’accès d’un évaluateur'),
    body: t('Type their full name and the address they sign in with, both exactly as they appear on the People list. This window offers no list to choose from, so that nobody is removed by a mis-click.',
      'Saisissez son nom complet et son adresse de connexion, exactement comme sur la liste Personnes. Cette fenêtre ne propose aucune liste de sélection, afin que personne ne soit retiré par une fausse manœuvre.'),
    note: t('If you are not sure of the spelling, close this and read the People list first.',
      'En cas de doute sur l’orthographe, fermez cette fenêtre et consultez d’abord la liste Personnes.'),
    extra: form,
    focusFirst: () => name.focus(),
    /**
     * The gate does the lookup, so the window can refuse without closing and without losing what
     * was typed. Everything it can say is one of three sentences, and none of them narrows.
     */
    gate: () => {
      const n = name.value.trim();
      const e = email.value.trim().toLowerCase();
      if (!n) return t('Type their full name.', 'Saisissez son nom complet.');
      if (!e) return t('Type the address they sign in with.', 'Saisissez son adresse de connexion.');
      const me = currentUser()?.email?.trim().toLowerCase() ?? '';
      if (me && e === me) {
        return t('That is your own account. You cannot take your own access away here. To step down, ask another assessor to do it.',
          'Il s’agit de votre propre compte. Vous ne pouvez pas retirer votre propre accès ici. Pour vous retirer, demandez à un autre évaluateur de le faire.');
      }
      return null;
    },
    commitLabel: t('Find them', 'Les trouver'),
    cancelLabel: t('Cancel', 'Annuler'),
    onCommit: () => {
      const typedName = name.value.trim();
      const typedEmail = email.value.trim().toLowerCase();
      // Read the list now rather than trusting whatever the People pane last drew. Another
      // assessor may have removed this person in the time the window has been open.
      void listPeople().then((people) => {
        const me = currentUser()?.email?.trim().toLowerCase() ?? '';
        const found = people.find((p) => p.email.trim().toLowerCase() === typedEmail
          && sameText(p.name, typedName));

        if (!found || !grantsAccess(found.role)) { noMatch(); return; }
        if (found.email.trim().toLowerCase() === me) { ownAccount(); return; }
        const withAccess = people.filter((p) => grantsAccess(p.role));
        if (withAccess.length <= 1) { lastOne(); return; }
        confirmRemoval(found, after);
      }, (e: Error) => alert(e.message));
    },
  });
}

/**
 * One message for a near miss and for a wild guess.
 *
 * The real risk in a type-to-confirm is somebody adding a helpful "did you mean". This says
 * nothing about how close the attempt was, how many people are on the list, or whether the
 * address exists, because each of those is a way to find a name by guessing at it.
 */
function noMatch(): void {
  confirmStep({
    tier: 'caution',
    title: t('No assessor matches both of those', 'Aucun évaluateur ne correspond aux deux'),
    body: t('Nobody with access has that name and that address together. Read the People list and try again.',
      'Personne ayant accès ne porte ce nom avec cette adresse. Consultez la liste Personnes et réessayez.'),
    note: t('This window will not tell you which of the two was wrong, and it will not suggest a name. That is deliberate.',
      'Cette fenêtre n’indiquera pas laquelle des deux valeurs était erronée et ne proposera aucun nom. C’est volontaire.'),
    commitLabel: t('Close', 'Fermer'),
    cancelLabel: t('Close', 'Fermer'),
    onCommit: () => {},
  });
}

function ownAccount(): void {
  confirmStep({
    tier: 'caution',
    title: t('That is your own account', 'Il s’agit de votre propre compte'),
    body: LEAVING_IS_NOT_BUILT
      ? t('You cannot take your own access away here. Somebody else with access has to do it, and this tool has no way to step down on your own yet.',
          'Vous ne pouvez pas retirer votre propre accès ici. Une autre personne ayant accès doit le faire, et cet outil ne permet pas encore de se retirer soi-même.')
      : t('You cannot take your own access away here. Leaving is on your own account screen.',
          'Vous ne pouvez pas retirer votre propre accès ici. Le départ se fait depuis votre propre compte.'),
    commitLabel: t('Close', 'Fermer'),
    cancelLabel: t('Close', 'Fermer'),
    onCommit: () => {},
  });
}

/**
 * The one invariant, said as a fact about the tool and never as a rule about the person.
 *
 * "You cannot remove yourself" and "you cannot remove the last one" are the same sentence when
 * there is one assessor, and she spotted that. The constraint belongs to the tool.
 */
function lastOne(): void {
  confirmStep({
    tier: 'caution',
    title: t('This tool needs at least one assessor', 'Cet outil a besoin d’au moins un évaluateur'),
    body: t('They are the only person with access. Taking it away would leave nobody able to open the assessor side, and nobody able to give access back.',
      'C’est la seule personne ayant accès. Le lui retirer ne laisserait personne en mesure d’ouvrir la vue de l’évaluateur, ni de rétablir un accès.'),
    note: t('Add a second assessor first, then come back.', 'Ajoutez d’abord un second évaluateur, puis revenez.'),
    commitLabel: t('Close', 'Fermer'),
    cancelLabel: t('Close', 'Fermer'),
    onCommit: () => {},
  });
}

/** The last gate. Their name again, and this window does not print it. */
function confirmRemoval(p: Person, after: () => void): void {
  confirmTyped({
    title: t(`Take ${p.name}’s access away`, `Retirer l’accès de ${p.name}`),
    lead: t('Their audit stays where it is. This takes away:', 'Leur audit reste en place. Ceci retire :'),
    consequences: [
      t(`Their sign-in to the assessor side, for ${p.email}.`, `Sa connexion à la vue de l’évaluateur, pour ${p.email}.`),
      t('Their view of every department’s submission.', 'Sa vue de toutes les soumissions.'),
      t('Their ability to write or change an audit.', 'Sa capacité d’écrire ou de modifier un audit.'),
    ],
    phrase: p.name,
    phraseLabel: t('their full name once more', 'son nom complet une fois de plus'),
    showPhrase: false,
    commitLabel: t('Take their access away', 'Retirer son accès'),
    onCommit: () => { void setPersonAccess(p, false).then(after, (e: Error) => alert(e.message)); },
  });
}
