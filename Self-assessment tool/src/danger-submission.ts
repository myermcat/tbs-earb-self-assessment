/**
 * Deleting a submission, from the danger zone and from nowhere else.
 *
 * It used to be a menu item on the portfolio, and the danger zone only pointed at it. Reported
 * in those words: deletion should not be from a portfolio, but from the danger zone, that is the
 * whole reason for having it.
 *
 * So this follows the same shape as taking an access away, and for the same reason: nothing on a
 * screen somebody reads every day removes anything, and the window does not offer a list to pick
 * from. What is typed here is the access code rather than a name, because the code belongs to one
 * assessment and to no other, while two departments can name an initiative the same thing and the
 * name is the field most likely to be blank.
 */
import { el } from './dom';
import { t } from './i18n';
import { confirmStep, confirmTyped } from './confirm';
import { formatCode, tidyCode } from './firebase';
import { deleteRecord, isHosted, listRecords } from './store';

/** The window that asks which one, and offers nobody a list. */
export function deleteSubmission(after: () => void): void {
  const box = el('input', {
    type: 'text', autocomplete: 'off', spellcheck: false,
    'aria-label': 'The access code of the assessment to delete',
  }) as HTMLInputElement;

  confirmStep({
    tier: 'danger',
    title: t('Delete a submission', 'Supprimer une soumission'),
    body: t('Type the access code of the assessment you mean. This window offers no list to choose from, so that nothing is deleted by a mis-click, and the code belongs to one assessment where an initiative name can belong to two.',
      'Saisissez le code d’accès de l’évaluation visée. Cette fenêtre ne propose aucune liste, afin que rien ne soit supprimé par une fausse manœuvre, et le code appartient à une seule évaluation là où un nom d’initiative peut en désigner deux.'),
    note: t('If the assessment is a test one, stopping the count takes it out of every average and every ranked list and can be undone. That is on the portfolio, beside the record.',
      'S’il s’agit d’une évaluation d’essai, cesser de la compter la retire de toutes les moyennes et de tous les classements, et cela peut être annulé. Cette option est dans le portefeuille, à côté de l’enregistrement.'),
    extra: el('div', { class: 'danger-find' }, [
      el('label', { class: 'field' }, [
        el('span', {}, [t('Its access code', 'Son code d’accès')]), box,
      ]),
    ]),
    focusFirst: () => box.focus(),
    gate: () => {
      if (!tidyCode(box.value)) return t('Type the access code.', 'Saisissez le code d’accès.');
      if (!isHosted()) {
        return t('This copy of the tool has no shared store, so there is nothing here to delete.',
          'Cette copie de l’outil n’a pas de dépôt partagé, il n’y a donc rien à supprimer ici.');
      }
      return null;
    },
    commitLabel: t('Find it', 'La trouver'),
    cancelLabel: t('Cancel', 'Annuler'),
    onCommit: () => {
      const code = tidyCode(box.value);
      // Read the pool now. A record deleted in another tab must not be deletable again here,
      // and the name shown in the next window has to be the one the store currently holds.
      void listRecords().then((records) => {
        const found = records.find((rec) => rec.assessment.id === code);
        if (!found) { noMatch(); return; }
        confirmDeletion(code, found.assessment.initiative?.name || 'unnamed', after);
      }, (e: Error) => alert(e.message));
    },
  });
}

/** One message, whatever was typed. A near miss and a wild guess look the same from here. */
function noMatch(): void {
  confirmStep({
    tier: 'caution',
    title: t('No assessment has that code', 'Aucune évaluation ne porte ce code'),
    body: t('Nothing in the shared store is named by what you typed. The code is on the portfolio beside each record, and on the submitter’s own results page.',
      'Rien dans le dépôt partagé ne porte ce que vous avez saisi. Le code figure dans le portefeuille à côté de chaque enregistrement, et sur la page de résultats du soumissionnaire.'),
    commitLabel: t('Close', 'Fermer'),
    cancelLabel: t('Close', 'Fermer'),
    onCommit: () => {},
  });
}

/** The last gate: the code again, and this window does not print it. */
function confirmDeletion(code: string, name: string, after: () => void): void {
  confirmTyped({
    title: t(`Delete the ${name} assessment`, `Supprimer l’évaluation ${name}`),
    consequences: [
      t('Every answer in it, and the reasoning typed against each one.',
        'Chaque réponse, et le raisonnement saisi pour chacune.'),
      t('Every piece of evidence referenced in it.', 'Chaque preuve qui y est référencée.'),
      t('Every audited score, verdict and reason written against it.',
        'Chaque note évaluée, verdict et motif qui y sont consignés.'),
      t('The record of who saved each version of it.',
        'Le registre des personnes ayant enregistré chaque version.'),
      t(`The code ${formatCode(code)} stops working, and anybody holding it loses the assessment.`,
        `Le code ${formatCode(code)} cesse de fonctionner, et quiconque le détient perd l’évaluation.`),
    ],
    phrase: formatCode(code),
    phraseLabel: t('the access code once more', 'le code d’accès une fois de plus'),
    showPhrase: false,
    commitLabel: t('Delete this assessment', 'Supprimer cette évaluation'),
    onCommit: () => {
      void deleteRecord(code).then((res) => {
        if (!res.ok) { alert(res.problem); return; }
        after();
      });
    },
  });
}
