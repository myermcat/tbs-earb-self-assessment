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
import { confirmStep } from './confirm';
import {
  addPerson, currentUser, grantsAccess, grantSource, listPeople, renamePerson, setPersonAccess,
  type Person,
} from './firebase';
import { sameText } from './danger-people';

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
  /**
   * Nothing is said when the access is real.
   *
   * There was a line here reading "you are signed in as X, and the store has you on this list".
   * It named an internal word for the database, and it told somebody looking at a list with
   * their own name on it a thing they could already see. The warning below is the whole reason
   * this function exists.
   */
  const src = grantSource();
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

  /**
   * No control on this row takes anything away.
   *
   * Asked for in these words: it should not be a big and easily clicked button. Removal is one
   * button in the danger zone that does not know who it is about until somebody types both the
   * name and the address. Putting access back is not destructive, so it stays here where the
   * person who needs it is looking.
   */
  const act = gone
    ? el('button', {
        class: 'ghost',
        onclick: () => {
          void setPersonAccess(p, true).then(after, (e: Error) => alert(e.message));
        },
      }, [t('Put their access back', 'Rétablir son accès')])
    : el('button', { class: 'ghost small', onclick: () => editName(p, after) },
        [t('Edit the name', 'Modifier le nom')]);

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
 * Correcting a name, which is what keeps type-to-remove workable.
 *
 * Removal asks somebody to type the stored name exactly. A name mistyped when the person was
 * added would then have to be mistyped the same way forever, by somebody with no way to know
 * what the typo was. This changes the name and nothing else: never the address, never the role,
 * so it grants nothing, takes nothing away, and stays out of the danger zone.
 */
function editName(p: Person, after: () => void): void {
  const box = el('input', {
    type: 'text', autocomplete: 'off', spellcheck: false, value: p.name,
    'aria-label': 'Their full name',
  }) as HTMLInputElement;
  confirmStep({
    tier: 'plain',
    title: t(`Correct the name for ${p.email}`, `Corriger le nom pour ${p.email}`),
    body: t('This changes the name on the list and nothing else. It is the name somebody has to type to take this access away, so a typo here is worth fixing.',
      'Ceci modifie le nom dans la liste et rien d\u2019autre. C\u2019est le nom qu\u2019il faudra saisir pour retirer cet accès, donc une faute de frappe vaut la peine d\u2019être corrigée.'),
    extra: el('div', { class: 'people-add' }, [
      el('label', { class: 'field' }, [el('span', {}, [t('Their full name', 'Son nom complet')]), box]),
    ]),
    focusFirst: () => box.focus(),
    gate: () => (box.value.trim() ? null : t('Put a name in.', 'Indiquez un nom.')),
    commitLabel: t('Save the name', 'Enregistrer le nom'),
    cancelLabel: t('Cancel', 'Annuler'),
    onCommit: () => {
      void renamePerson(p, box.value.trim()).then(after, (e: Error) => alert(e.message));
    },
  });
}

/** The form. Name and address, because removal asks for a name and nobody can invent one later. */
function addForm(people: Person[], after: () => void): HTMLElement {
  /**
   * First and last, in two boxes.
   *
   * Asked for in these words: it should be separately first and last, since I do not know what
   * order I need to input them. One box makes the order a guess, and the order matters later,
   * because taking an access away asks for the name back exactly as it is stored.
   */
  const first = el('input', { type: 'text', autocomplete: 'off', spellcheck: false,
    'aria-label': 'First name' }) as HTMLInputElement;
  const last = el('input', { type: 'text', autocomplete: 'off', spellcheck: false,
    'aria-label': 'Last name' }) as HTMLInputElement;
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
    const n = `${first.value.trim()} ${last.value.trim()}`.trim();
    const e = email.value.trim().toLowerCase();
    if (!first.value.trim() || !last.value.trim()) {
      say.textContent = t('Put both their first and last name in. It is what taking an access away asks you to type.',
        'Indiquez son prénom et son nom. C’est ce que le retrait d’accès demande de saisir.');
      return;
    }
    if (!LOOKS_LIKE_EMAIL.test(e)) { say.textContent = t('That does not look like an email address.',
      'Cela ne ressemble pas à une adresse courriel.'); return; }
    if (people.some((p) => p.email.toLowerCase() === e)) {
      say.textContent = t('That address is already on the list below.',
        'Cette adresse figure déjà dans la liste ci-dessous.');
      return;
    }
    /**
     * Two people with one name cannot both be removed by typing it, so the second is refused
     * here rather than found later by somebody trying to take an access away and failing.
     */
    if (people.some((x) => grantsAccess(x.role) && sameText(x.name, n))) {
      say.textContent = t('Somebody with access is already called that. Taking an access away asks for a name, so two people cannot share one. Add a middle name or an initial.',
        'Une personne ayant accès porte déjà ce nom. Le retrait d’un accès demande un nom, deux personnes ne peuvent donc pas en partager un. Ajoutez un second prénom ou une initiale.');
      return;
    }
    void addPerson(e, n).then(() => { first.value = ''; last.value = ''; email.value = ''; after(); },
      (err: Error) => { say.textContent = err.message; });
  } }, [t('Add this assessor', 'Ajouter cet évaluateur')]);

  return el('div', { class: 'people-add' }, [
    el('label', { class: 'field' }, [el('span', {}, [t('First name', 'Prénom')]), first]),
    el('label', { class: 'field' }, [el('span', {}, [t('Last name', 'Nom de famille')]), last]),
    el('label', { class: 'field' }, [
      el('span', {}, [t('The address they sign in with', 'L’adresse de connexion')]), email,
    ]),
    /**
     * The one way to grant nothing without being told: an address the person does not sign in
     * with. Google is the only provider wired today, so this is their Google account's address
     * and not whichever address they read departmental mail at.
     */
    el('div', { class: 'note-yellow' }, [
      el('strong', { class: 'note-yellow-head' }, [t('Google account only', 'Compte Google uniquement')]),
      t('Signing in is by Google account only today, so this has to be the address of the Google account they will use. Another address grants nothing, and they will be told they have no access with nothing on screen explaining why.',
        'La connexion se fait uniquement par compte Google : il doit donc s’agir de l’adresse du compte Google qu’ils utiliseront. Une autre adresse n’accorde rien, et la personne se verra refuser l’accès sans explication à l’écran.'),
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
    pane.appendChild(el('h1', { tabindex: -1 }, [t('People', 'Personnes')]));
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
