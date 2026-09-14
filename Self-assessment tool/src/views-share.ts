/**
 * Who else is on this assessment.
 *
 * Filling in 176 questions is not a job for one person, and the tool had no way to say so. A
 * department puts two or three people on it, and their assessor has to be able to read it
 * before it is finished. Both of those are shares, and both work the way sharing a document
 * works: you type an address and the person appears on a list.
 *
 * This is a mockup, and it says so on every screen it touches. It writes the addresses into the
 * assessment and does nothing else: no message is sent, and nobody is granted anything. The
 * shape is the point. Getting it agreed before the store's rules are written is cheaper than
 * discovering afterwards that the rules cannot express it.
 *
 * Two things it must never do, both of which would make it look like it worked:
 *
 *   - open a mail client. The results page has a control that does (handOff), and nothing here
 *     may borrow it, because a message that leaves is a promise the rest of this cannot keep.
 *   - imply that naming an assessor lets them score. Scoring is gated on a role that only an
 *     admin writes, and it stays that way. Otherwise anybody appoints their friend.
 */
import type { Assessment, SharedWith, ShareRole, Sharing } from './types';
import { el, clear, mockupTag } from './dom';
import { openDialog, closeOnOutsideClick, confirmStep } from './confirm';
import { autosave } from './storage';
import { t } from './i18n';
import { formatCode } from './firebase';

/** Deliberately loose. This is a list somebody reads, and a strict pattern refuses real addresses. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blank(): Sharing {
  return { people: [], teammateEmails: [], assessorEmails: [] };
}

export function sharedPeople(a: Assessment): SharedWith[] {
  return a.sharing?.people ?? [];
}

export function sharedCount(a: Assessment): number {
  return sharedPeople(a).length;
}

/**
 * Keep the two flat lists in step with the one real list.
 *
 * They exist for a rule language that cannot look inside an object inside an array. Deriving
 * them on every write means they can never disagree with the list they come from.
 */
function restate(a: Assessment): void {
  const people = a.sharing?.people ?? [];
  a.sharing = {
    people,
    teammateEmails: people.filter((p) => p.role === 'teammate').map((p) => p.email),
    assessorEmails: people.filter((p) => p.role === 'assessor').map((p) => p.email),
  };
}

function add(a: Assessment, email: string, role: ShareRole, by: string): 'added' | 'already' {
  const clean = email.trim().toLowerCase();
  const sharing = a.sharing ?? blank();
  a.sharing = sharing;
  if (sharing.people.some((p) => p.email === clean)) return 'already';
  sharing.people.push({
    email: clean,
    role,
    addedBy: by,
    addedAt: new Date().toISOString(),
    state: 'recorded',
  });
  restate(a);
  autosave(a);
  return 'added';
}

function drop(a: Assessment, email: string): void {
  if (!a.sharing) return;
  a.sharing.people = a.sharing.people.filter((p) => p.email !== email);
  restate(a);
  autosave(a);
}

const ROLE_ONE: Record<ShareRole, string> = {
  teammate: 'teammate',
  assessor: 'assessor',
};

/** The list, grouped, with a way to take somebody off it. */
function peopleList(a: Assessment, owner: string, after: () => void, readOnly = false): HTMLElement {
  const box = el('div', { class: 'share-list' });

  for (const role of ['teammate', 'assessor'] as ShareRole[]) {
    const rows = sharedPeople(a).filter((p) => p.role === role);
    box.appendChild(el('h3', { class: 'share-group' }, [
      role === 'teammate'
        ? t('Working on it with you', 'Travaillent dessus avec vous')
        : t('Reading and scoring it', 'La lisent et la notent'),
      el('span', { class: 'dim' }, [` (${rows.length})`]),
    ]));

    if (!rows.length) {
      box.appendChild(el('p', { class: 'muted small' }, [
        role === 'teammate'
          ? t('Nobody yet. You are the only person on this assessment.', 'Personne pour l’instant. Vous êtes la seule personne sur cette évaluation.')
          : t('Nobody yet. Naming your assessor is how they know to look.', 'Personne pour l’instant. Nommer votre évaluateur est la façon dont il sait qu’il doit regarder.'),
      ]));
      continue;
    }

    for (const p of rows) {
      box.appendChild(el('div', { class: 'share-row' }, [
        el('span', { class: 'mono small' }, [p.email]),
        el('span', { class: 'badge badge-mockup tiny' }, [t('No email sent', 'Aucun courriel envoyé')]),
        readOnly
          ? null
          : el('button', {
              class: 'linkish small',
              onclick: () => confirmStep({
                tier: 'danger',
                title: t(`Take ${p.email} off this assessment?`, `Retirer ${p.email} de cette évaluation?`),
                body: t(`They are recorded as ${ROLE_ONE[p.role]} on this assessment. Taking them off removes the address from the list and from the file. Nothing else happens, because nothing was granted in the first place.`,
                  `Cette personne est inscrite comme ${p.role === 'teammate' ? 'membre de l’équipe' : 'évaluateur'} sur cette évaluation. Le retrait supprime l’adresse de la liste et du fichier. Rien d’autre ne se produit, car rien n’avait été accordé.`),
                commitLabel: t('Take them off', 'Les retirer'),
                cancelLabel: t('Keep them on', 'Les garder'),
                onCommit: () => { drop(a, p.email); after(); },
              }),
            }, [t('Remove', 'Retirer')]),
      ]));
    }
  }
  return box;
}

/** The read-only card on the results page, so the list is visible without opening anything. */
export function sharedPanel(a: Assessment, open: () => void): HTMLElement {
  const people = sharedPeople(a);
  const mates = people.filter((p) => p.role === 'teammate').length;
  const assessors = people.filter((p) => p.role === 'assessor').length;

  return el('div', { class: 'res-sub' }, [
    el('div', { class: 'head-row' }, [
      el('h3', {}, [t('Who this is shared with', 'Avec qui cette évaluation est partagée')]),
      mockupTag(t('Mockup', 'Maquette')),
    ]),
    el('p', { class: 'muted' }, [
      people.length
        ? t(`${mates} working on it with you, ${assessors} reading it. No email has been sent and no access has been granted.`,
            `${mates} travaillent dessus avec vous, ${assessors} la lisent. Aucun courriel n’a été envoyé et aucun accès n’a été accordé.`)
        : t('Nobody yet. You can name the people working on it with you, and your assessor.',
            'Personne pour l’instant. Vous pouvez nommer les personnes qui travaillent dessus avec vous, et votre évaluateur.'),
    ]),
    people.length ? peopleList(a, '', () => {}, true) : null,
    el('div', { class: 'actions' }, [
      el('button', { class: 'ghost', onclick: open }, [
        t('Open the sharing list', 'Ouvrir la liste de partage'),
      ]),
    ]),
  ]);
}

/**
 * The dialog.
 *
 * The sentence saying nothing is sent goes above the field, not below it. The classified pledge
 * taught that lesson: a panel under the fold is scrolled past, and the one thing somebody has to
 * know here is that typing an address into this box does not tell anybody anything.
 */
export function openShareDialog(a: Assessment, owner: string, after: () => void): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'confirm share-dialog';

  const close = () => { try { dlg.close(); } catch { /* already closed */ } dlg.remove(); after(); };

  const said = el('p', { class: 'cf-stake' });
  const list = el('div', {});
  const field = el('input', {
    type: 'email', autocomplete: 'off', spellcheck: false,
    placeholder: t('name@department.gc.ca', 'nom@ministere.gc.ca'),
  }) as HTMLInputElement;

  let role: ShareRole = 'teammate';
  const roleBtn = (r: ShareRole, label: string) => el('button', {
    class: `chip ${role === r ? 'on' : ''}`,
    onclick: () => { role = r; repaint(); field.focus(); },
  }, [label]);

  const roles = el('div', { class: 'share-roles' });

  /** One address, or a pasted list of them. Whatever is refused is named. */
  const take = () => {
    const parts = field.value.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    const good: string[] = [];
    const bad: string[] = [];
    const dupes: string[] = [];
    for (const one of parts) {
      if (!LOOKS_LIKE_EMAIL.test(one)) { bad.push(one); continue; }
      if (add(a, one, role, owner) === 'already') dupes.push(one);
      else good.push(one);
    }
    field.value = '';
    const parts2: string[] = [];
    if (good.length) {
      parts2.push(t(`${good.length} added to the list. No email was sent.`,
        `${good.length} ajoutée(s) à la liste. Aucun courriel n’a été envoyé.`));
    }
    if (dupes.length) parts2.push(t(`Already on the list: ${dupes.join(', ')}.`, `Déjà sur la liste : ${dupes.join(', ')}.`));
    if (bad.length) parts2.push(t(`Not an address, so left out: ${bad.join(', ')}.`, `Pas une adresse, donc omise : ${bad.join(', ')}.`));
    said.textContent = parts2.join(' ');
    repaint();
    field.focus();
  };

  field.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); take(); }
  });

  function repaint(): void {
    clear(roles);
    roles.appendChild(roleBtn('teammate', t('As a teammate', 'Comme membre de l’équipe')));
    roles.appendChild(roleBtn('assessor', t('As an assessor', 'Comme évaluateur')));
    clear(list);
    list.appendChild(peopleList(a, owner, () => repaint()));
  }
  repaint();

  dlg.appendChild(el('div', { class: 'cf-head' }, [
    el('h2', {}, [t('Share this assessment', 'Partager cette évaluation')]),
    mockupTag(t('Mockup', 'Maquette')),
  ]));
  dlg.appendChild(el('div', { class: 'cf-body' }, [
    /**
     * The access code, first, because it is the only thing on this screen that works.
     *
     * It is the record's own name in the store, so anybody holding it can open this assessment
     * and nothing else. There is no way to send it from here: a page that opened a mail client
     * would be promising delivery it cannot see, so the code goes on the clipboard and the
     * person sends it themselves.
     */
    a.id
      ? el('div', {}, [
          el('h3', { class: 'share-group' }, [t('The access code', 'Le code d\u2019accès')]),
          el('p', { class: 'muted small' }, [
            t('Anybody with this code can open this assessment. Send it to them yourself, in Teams or by email.',
              'Toute personne ayant ce code peut ouvrir cette évaluation. Envoyez-le-lui vous-même, dans Teams ou par courriel.'),
          ]),
          (() => {
            const shown = el('span', { class: 'code-shown' }, [formatCode(a.id ?? '')]);
            const note = el('span', { class: 'tiny dim' });
            const copy = el('button', {
              class: 'ghost small',
              onclick: () => {
                const text = formatCode(a.id ?? '');
                const done = () => {
                  note.textContent = t('Copied. Paste it into a message and send it.',
                    'Copié. Collez-le dans un message et envoyez-le.');
                };
                try {
                  void navigator.clipboard?.writeText(text).then(done, () => {
                    note.textContent = t('This browser would not let the page copy it. Select it and copy by hand.',
                      'Ce navigateur n\u2019a pas permis la copie. Sélectionnez le code et copiez-le à la main.');
                  });
                } catch {
                  note.textContent = t('This browser would not let the page copy it. Select it and copy by hand.',
                    'Ce navigateur n\u2019a pas permis la copie. Sélectionnez le code et copiez-le à la main.');
                }
              },
            }, [t('Copy the code', 'Copier le code')]);
            return el('div', { class: 'share-code-row' }, [shown, copy, note]);
          })(),
        ])
      : el('div', { class: 'card warn tight' }, [
          el('p', { class: 'small' }, [
            t('This assessment has no access code yet. It gets one the first time it is saved online.',
              'Cette évaluation n\u2019a pas encore de code d\u2019accès. Elle en reçoit un lors du premier enregistrement en ligne.'),
          ]),
        ]),
    el('div', { class: 'card warn tight' }, [
      el('p', { class: 'small' }, [
        t('Addresses you add are written into your assessment and shown here. No email is sent, and nobody gains access to anything. This is the shape of sharing, agreed before it is built.',
          'Les adresses que vous ajoutez sont inscrites dans votre évaluation et affichées ici. Aucun courriel n’est envoyé et personne n’obtient d’accès. Ceci est la forme du partage, convenue avant sa construction.'),
      ]),
    ]),
    el('label', { class: 'share-add' }, [
      el('span', { class: 'small' }, [t('Address', 'Adresse')]),
      field,
    ]),
    roles,
    el('div', { class: 'actions' }, [
      el('button', { class: 'primary', onclick: take }, [t('Add to the list', 'Ajouter à la liste')]),
    ]),
    said,
    list,
    el('p', { class: 'tiny dim' }, [
      t('Naming an assessor does not let them score. Scoring is granted by an admin, so nobody can appoint their own assessor.',
        'Nommer un évaluateur ne lui permet pas de noter. La notation est accordée par un administrateur, personne ne peut donc nommer son propre évaluateur.'),
    ]),
  ]));
  dlg.appendChild(el('div', { class: 'cf-actions' }, [
    el('button', { class: 'ghost', onclick: close }, [t('Done', 'Terminé')]),
  ]));

  document.body.appendChild(dlg);
  closeOnOutsideClick(dlg, close);
  openDialog(dlg);
  field.focus();
}
