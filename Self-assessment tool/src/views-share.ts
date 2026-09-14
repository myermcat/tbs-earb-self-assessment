/**
 * Who else can open this assessment.
 *
 * Filling in 176 questions is not a job for one person, and their assessor has to be able to
 * read it before it is finished. Both of those are the same act, and the access code is how it
 * is done: whoever holds the code opens the assessment and changes it, and nobody else can.
 *
 * This file used to be a mockup of a different idea, where you typed people's addresses onto a
 * list and nothing happened. The code replaced it. What is left here is the two places the code
 * is explained and handed over: a panel on the results page, and the window behind File.
 *
 * The rule the mockup carried still holds, and is the reason this sends nothing. The tool has no
 * way to put a message in front of somebody, so it must never look as though it has. You copy
 * the code and send it yourself, in whatever you already use.
 */
import type { Assessment } from './types';
import { el } from './dom';
import { openDialog, closeOnOutsideClick, confirmStep } from './confirm';
import { t } from './i18n';
import { codeChip } from './code-chip';

/**
 * Who can open this, on the results page.
 *
 * It used to list addresses somebody had typed, which granted nothing. The access code is the
 * sharing mechanism now, so this says the one true thing: whoever has the code can open and
 * change this assessment, and you decide who has it.
 */
export function sharedPanel(a: Assessment, open: () => void): HTMLElement {
  const saved = !!a.id;
  return el('div', { class: 'res-sub' }, [
    el('h3', {}, [t('Who can open this', 'Qui peut l\u2019ouvrir')]),
    el('p', { class: 'muted' }, [
      saved
        ? t('Anybody holding the access code can open this assessment and change it. You decide who has it, by sending it to them.',
            'Toute personne ayant le code d\u2019accès peut ouvrir cette évaluation et la modifier. C\u2019est vous qui décidez qui l\u2019a, en le lui envoyant.')
        : t('Nobody but you. This assessment is on this computer only, and it gets an access code the first time it is saved online.',
            'Personne d\u2019autre que vous. Cette évaluation est sur cet ordinateur seulement, et elle reçoit un code d\u2019accès lors du premier enregistrement en ligne.'),
    ]),
    saved ? codeChip(a.id!) : null,
    saved
      ? el('div', { class: 'actions' }, [
          el('button', { class: 'ghost', onclick: open }, [
            t('About the access code', 'À propos du code d\u2019accès'),
          ]),
        ])
      : null,
  ]);
}


/**
 * The code, the first time it exists.
 *
 * One window, at the one moment it matters, and it is here rather than in main.ts because
 * three different acts reach it now: pressing Save online, accepting the guard's offer to save
 * before replacing the draft, and marking an assessment ready. All three mint a code, and a
 * code somebody is never shown is a record they cannot reach again.
 *
 * The sentence people have to read is that this is the only way back. The browser is holding
 * the assessment too, so it feels safe, and it stays safe right up until somebody opens a
 * colleague's assessment with a code and their own is gone from this machine. That is not a
 * rare accident: it is the ordinary use of the tool.
 */
export function showNewCode(a: Assessment, after: () => void = () => {}): void {
  if (!a.id) { after(); return; }
  confirmStep({
    tier: 'plain',
    title: t('Saved online. Keep this code', 'Enregistrée en ligne. Conservez ce code'),
    body: t('This code is the only way back to this assessment. Put it somewhere you keep things: a note to yourself, the initiative\u2019s folder, an email to your team. Anybody holding it can open this assessment and change it, and nobody without it can, including you.',
      'Ce code est le seul moyen de revenir à cette évaluation. Placez-le quelque part où vous conservez vos choses : une note, le dossier de l\u2019initiative, un courriel à votre équipe. Toute personne qui le détient peut ouvrir cette évaluation et la modifier, et personne ne le peut sans lui, vous compris.'),
    extra: codeChip(a.id),
    mustAgree: t('I have saved this code somewhere', 'J\u2019ai conservé ce code quelque part'),
    note: t('This browser is holding the assessment as well, so you will not need the code today. You will need it the day you open somebody else\u2019s assessment, or work from another computer.',
      'Ce navigateur conserve aussi l\u2019évaluation, vous n\u2019aurez donc pas besoin du code aujourd\u2019hui. Vous en aurez besoin le jour où vous ouvrirez l\u2019évaluation de quelqu\u2019un d\u2019autre, ou travaillerez depuis un autre ordinateur.'),
    commitLabel: t('I have saved the code', 'J\u2019ai conservé le code'),
    cancelLabel: '',
    onCommit: after,
  });
}

/**
 * What the access code is, and what holding it means.
 *
 * This window used to be where you typed addresses, back when there was no sharing mechanism
 * at all: you added somebody, nothing happened, and the screen said so four times over. The
 * code is the mechanism now, so the window explains it and hands it over.
 */
export function openShareDialog(a: Assessment, _owner: string, after: () => void): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'confirm tier-plain share-dialog';
  const close = () => { try { dlg.close(); } catch { /* already closed */ } dlg.remove(); after(); };

  dlg.appendChild(el('div', { class: 'cf-head' }, [
    el('h2', { class: 'cf-title' }, [t('The access code', 'Le code d\u2019accès')]),
  ]));

  dlg.appendChild(el('div', { class: 'cf-body' }, a.id ? [
    el('p', {}, [
      t('This is the whole of sharing. Anybody holding this code can open this assessment and change it, and nobody without it can. Send it to the people working on it with you, and to your assessor.',
        'C\u2019est tout le partage. Toute personne ayant ce code peut ouvrir cette évaluation et la modifier, et personne ne le peut sans lui. Envoyez-le aux personnes qui travaillent dessus avec vous, et à votre évaluateur.'),
    ]),
    el('div', { class: 'cf-extra' }, [codeChip(a.id)]),
    el('p', { class: 'cf-note' }, [
      t('The tool sends nothing. Put the code in a message yourself, in Teams or by email.',
        'L\u2019outil n\u2019envoie rien. Placez vous-même le code dans un message, dans Teams ou par courriel.'),
    ]),
    el('p', { class: 'cf-stake' }, [
      t('A code cannot be taken back. Somebody who has it keeps it, and forwarding it passes the same access on, so send it the way you would send the assessment itself.',
        'Un code ne peut pas être repris. La personne qui l\u2019a le garde, et le transférer transmet le même accès, alors envoyez-le comme vous enverriez l\u2019évaluation elle-même.'),
    ]),
  ] : [
    el('p', {}, [
      t('This assessment has no access code yet. It gets one the first time it is saved online, and from then on that code is how anybody else opens it.',
        'Cette évaluation n\u2019a pas encore de code d\u2019accès. Elle en reçoit un lors du premier enregistrement en ligne, et dès lors ce code est la façon dont quiconque d\u2019autre l\u2019ouvre.'),
    ]),
  ]));

  dlg.appendChild(el('div', { class: 'cf-actions' }, [
    el('button', { class: 'cf-wide', onclick: close }, [t('Done', 'Terminé')]),
  ]));

  document.body.appendChild(dlg);
  closeOnOutsideClick(dlg, close);
  openDialog(dlg);
}
