/**
 * Who has access, and the two things anybody does to that list.
 *
 * There are two kinds of person and no third: somebody filling an assessment in, who needs no
 * account, and an assessor, who needs one and can do everything this side offers. Asked for in
 * those words: basically there are only two functionalities, submitter and assessor.
 *
 * Any assessor adds another. That is the whole trust model and it is deliberate, because no
 * rule can tell a colleague from a stranger: what the store enforces instead is that every
 * grant carries the address of whoever made it, and this screen shows it.
 *
 * Taking access away is the same right, behind enough friction that nobody does it by reflex.
 * Asked for as: to delete, they need to go through hell.
 */
import { el, clear } from './dom';
import { t } from './i18n';
import { confirmStep, confirmTyped } from './confirm';
import {
  addPerson, currentUser, grantsAccess, grantSource, listPeople, setPersonAccess,
  type Person,
} from './firebase';

/** A shape test, not a check on anybody. The only address that works is a Google account's. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GOVERNMENT = /\.(gc|canada)\.ca$/i;

function when(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

/**
 * Where this person's own access came from.
 *
 * The build carries a list of addresses it falls back to when the store has no document, so a
 * page can offer every control while the store refuses all of them. That gap is invisible and
 * it is the difference between having access and looking like it, so the screen says which.
 */
function ownGrant(): HTMLElement | null {
  const me = currentUser();
  if (!me) return null;
  const src = grantSource();
  if (src === 'store') {
    return el('p', { class: 'set-lead' }, [
      t(`You are signed in as ${me.email}, and the store has you on this list.`,
        `Vous êtes connecté comme ${me.email}, et le dépôt vous a sur cette liste.`),
    ]);
  }
  if (src === 'build') {
    return el('div', { class: 'flag sev-medium' }, [
      el('div', { class: 'flag-title' }, [
        el('span', { class: 'sev-dot' }),
        el('strong', {}, [t('Your access comes from this build, not from the store',
          'Votre accès provient de cette version, pas du dépôt')]),
      ]),
      el('div', { class: 'small' }, [
        t(`Nothing in the store grants ${me.email} anything. This page works because this copy of the tool carries the address in its own configuration. Anything that writes to the store will be refused. Add yourself below to fix it.`,
          `Rien dans le dépôt n’accorde quoi que ce soit à ${me.email}. Cette page fonctionne parce que cette copie de l’outil porte l’adresse dans sa propre configuration. Toute écriture dans le dépôt sera refusée. Ajoutez-vous ci-dessous pour corriger cela.`),
      ]),
    ]);
  }
  return null;
}

/** One row: who they are, how they got here, and the one control that applies to them. */
function personRow(p: Person, mine: boolean, after: () => void): HTMLElement {
  const gone = !grantsAccess(p.role);
  const title = el('div', { class: 'set-row-title' }, [
    p.name,
    mine ? el('span', { class: 'badge badge-soft tiny' }, [t('you', 'vous')]) : null,
    gone ? el('span', { class: 'badge badge-warn tiny' }, [t('no access', 'aucun accès')]) : null,
  ]);

  const story = gone
    ? t(`Removed by ${p.removedBy || 'somebody'}${when(p.removedAt) ? ` on ${when(p.removedAt)}` : ''}.`,
        `Retiré par ${p.removedBy || 'quelqu’un'}${when(p.removedAt) ? ` le ${when(p.removedAt)}` : ''}.`)
    : p.addedBy
      ? t(`Added by ${p.addedBy}${when(p.addedAt) ? ` on ${when(p.addedAt)}` : ''}.`,
          `Ajouté par ${p.addedBy}${when(p.addedAt) ? ` le ${when(p.addedAt)}` : ''}.`)
      : t('Added before the tool recorded who was adding.',
          'Ajouté avant que l’outil n’enregistre qui ajoutait.');

  const act = gone
    ? el('button', {
        class: 'ghost',
        onclick: () => {
          void setPersonAccess(p, true).then(after, (e: Error) => alert(e.message));
        },
      }, [t('Put their access back', 'Rétablir son accès')])
    : el('button', { class: 'danger', onclick: () => removeFlow(p, mine, after) },
        [t('Take their access away', 'Retirer son accès')]);

  return el('div', { class: 'set-row' }, [
    el('div', {}, [
      title,
      el('p', { class: 'mono small' }, [p.email]),
      el('p', {}, [story]),
    ]),
    el('div', { class: 'set-row-act' }, [act]),
  ]);
}

/**
 * Two windows and their full name typed out.
 *
 * The first says what removal does and, just as usefully, what it does not: an assessor's audit
 * lives inside each assessment and nothing here touches it. The second is the typing, and what
 * has to be typed is the person's full name, because that is the field somebody has to read off
 * the row they actually meant.
 */
function removeFlow(p: Person, mine: boolean, after: () => void): void {
  confirmStep({
    tier: 'danger',
    title: t(`Take ${p.name}'s access away?`, `Retirer l’accès de ${p.name} ?`),
    body: t(`${p.email} will not be able to open the assessor side again. They will see a screen saying the address was taken off the list.`,
      `${p.email} ne pourra plus ouvrir la vue de l’évaluateur. Un écran indiquera que l’adresse a été retirée de la liste.`),
    note: t('Everything they audited stays exactly where it is. Their name stays on every score they changed and every reason they gave, because an audit that can be erased by removing somebody is not an audit.',
      'Tout ce qu’ils ont évalué reste tel quel. Leur nom demeure sur chaque note qu’ils ont modifiée et chaque raison donnée, car un audit effaçable en retirant quelqu’un n’est pas un audit.'),
    stake: mine
      ? t('This is your own account. You will be signed out of this side and you will need another assessor to put it back.',
          'Il s’agit de votre propre compte. Vous perdrez l’accès à cette vue et un autre évaluateur devra le rétablir.')
      : t('Any assessor can put it back afterwards, and the list will show that it was taken away.',
          'N’importe quel évaluateur peut le rétablir ensuite, et la liste indiquera qu’il a été retiré.'),
    commitLabel: t('Continue', 'Continuer'),
    cancelLabel: t('Keep their access', 'Conserver son accès'),
    onCommit: () => confirmTyped({
      title: t(`Type ${p.name}'s name to remove them`, `Saisissez le nom de ${p.name} pour le retirer`),
      lead: t('Their audit stays where it is. This takes away:',
        'Leur audit reste en place. Ceci retire :'),
      consequences: [
        t(`Their sign-in to the assessor side, for ${p.email}.`,
          `Sa connexion à la vue de l’évaluateur, pour ${p.email}.`),
        t('Their view of every department’s submission.', 'Sa vue de toutes les soumissions.'),
        t('Their ability to write or change an audit.', 'Sa capacité d’écrire ou de modifier un audit.'),
      ],
      phrase: p.name,
      phraseLabel: t('their full name', 'son nom complet'),
      commitLabel: t('Take their access away', 'Retirer son accès'),
      onCommit: () => {
        void setPersonAccess(p, false).then(after, (e: Error) => alert(e.message));
      },
    }),
  });
}

/** The form. Name and address, because removal asks for a name and nobody can invent one later. */
function addForm(people: Person[], after: () => void): HTMLElement {
  const name = el('input', { type: 'text', autocomplete: 'off', spellcheck: false,
    placeholder: t('First and last name', 'Prénom et nom') }) as HTMLInputElement;
  const email = el('input', { type: 'email', autocomplete: 'off', spellcheck: false,
    inputmode: 'email', placeholder: t('name@department.gc.ca', 'nom@ministere.gc.ca') }) as HTMLInputElement;
  const say = el('p', { class: 'signer-advice' });

  /**
   * A warning and not a refusal.
   *
   * Sign-in is Google, so the address that works is whichever one the person's Google account
   * uses, and that is not always a departmental one. Refusing anything outside gc.ca would lock
   * out the account that set this project up, which is a personal address. What is worth saying
   * is the thing that actually goes wrong: an address nobody signs in with grants nothing, and
   * fails silently at the far end.
   */
  const advise = () => {
    const v = email.value.trim();
    say.className = 'signer-advice';
    say.textContent = v && !GOVERNMENT.test(v)
      ? t('That is not a government address. It still works if it is the one they sign in to Google with.',
          'Ce n’est pas une adresse gouvernementale. Elle fonctionne si c’est celle de leur compte Google.')
      : '';
    if (say.textContent) say.classList.add('signer-changed');
  };
  email.addEventListener('input', advise);

  const go = el('button', { class: 'primary', onclick: () => {
    const n = name.value.trim();
    const e = email.value.trim().toLowerCase();
    if (!n) { say.textContent = t('Put their name in. It is what removal asks you to type.',
      'Indiquez son nom. C’est ce que le retrait demande de saisir.'); return; }
    if (!LOOKS_LIKE_EMAIL.test(e)) { say.textContent = t('That does not look like an email address.',
      'Cela ne ressemble pas à une adresse courriel.'); return; }
    if (people.some((p) => p.email.toLowerCase() === e)) {
      say.textContent = t('That address is already on the list below.',
        'Cette adresse figure déjà dans la liste ci-dessous.');
      return;
    }
    void addPerson(e, n).then(() => { name.value = ''; email.value = ''; after(); },
      (err: Error) => { say.textContent = err.message; });
  } }, [t('Add this assessor', 'Ajouter cet évaluateur')]);

  return el('div', { class: 'people-add' }, [
    el('label', { class: 'field' }, [el('span', {}, [t('Their full name', 'Son nom complet')]), name]),
    el('label', { class: 'field' }, [
      el('span', {}, [t('The address they sign in with', 'L’adresse de connexion')]), email,
    ]),
    say,
    go,
  ]);
}

/**
 * The pane. Redraws itself into its own element after every change, because a change to this
 * list is the one thing on the screen and reloading the whole settings screen loses the place.
 */
export function panePeople(pane: HTMLElement): void {
  const draw = () => {
    clear(pane);
    pane.appendChild(el('h1', { tabindex: -1 }, [t('Who has access', 'Qui a accès')]));
    pane.appendChild(el('p', { class: 'set-lead' }, [
      t('Everybody who can open the assessor side. Any assessor can add another, and anybody added can do everything you can.',
        'Toute personne pouvant ouvrir la vue de l’évaluateur. Tout évaluateur peut en ajouter un autre, et la personne ajoutée peut tout faire comme vous.'),
    ]));
    const own = ownGrant();
    if (own) pane.appendChild(own);

    const body = el('div', {});
    pane.appendChild(body);
    body.appendChild(el('p', { class: 'muted' }, [t('Reading the list…', 'Lecture de la liste…')]));

    void listPeople().then((people) => {
      clear(body);
      const me = currentUser()?.email?.toLowerCase() ?? '';
      body.appendChild(el('h2', { class: 'set-sub' }, [t('Add an assessor', 'Ajouter un évaluateur')]));
      body.appendChild(addForm(people, draw));
      body.appendChild(el('h2', { class: 'set-sub' }, [
        t(`On the list (${people.filter((p) => grantsAccess(p.role)).length})`,
          `Sur la liste (${people.filter((p) => grantsAccess(p.role)).length})`),
      ]));
      // Access first, then the ones taken off: the second group is history and not a worklist.
      const order = [...people].sort((a, b) =>
        Number(grantsAccess(b.role)) - Number(grantsAccess(a.role)) || a.name.localeCompare(b.name));
      for (const p of order) {
        body.appendChild(personRow(p, p.email.toLowerCase() === me, draw));
      }
    }, (e: Error) => {
      clear(body);
      body.appendChild(el('p', { class: 'warn-text' }, [
        t(`The store would not hand over the list. ${e.message}`,
          `Le dépôt n’a pas fourni la liste. ${e.message}`),
      ]));
    });
  };
  draw();
}
