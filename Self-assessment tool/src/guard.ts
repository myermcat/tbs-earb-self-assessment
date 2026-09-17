/**
 * The window that stands in front of anything replacing the assessment this browser holds.
 *
 * Her rule, stated in capitals: any time the tool is about to replace the local copy, it asks
 * first, offers to save online, and says plainly that the current work is otherwise discarded.
 *
 * It is one function because it was five, written separately, saying five different things.
 * Three of them asked and offered a file. One asked and offered nothing. One did not ask at
 * all. None of them offered to save online, which is the only offer that now means anything.
 *
 * The shape of what it says is always the same, and only the first sentence changes:
 *
 *   what is about to happen  ->  what it would cost  ->  the way out that costs nothing
 *
 * Three states, and the third is the one worth getting right. Work that has never been saved
 * online has everything to lose. Work saved online and edited since has only the edits to
 * lose. Work with nothing in it asks nothing at all, because a dialog in front of an empty
 * form is how people learn to dismiss dialogs without reading them.
 */
import type { Assessment } from './types';
import { confirmStep } from './confirm';
import { answeredCount, hasWork } from './storage';
import { onlineIsCurrent, saveOnlineNow, savedOnline, isHosted } from './store';
import { codeChip } from './code-chip';
import { showNewCode } from './views-share';
import { t } from './i18n';

export type ReplaceAct = 'open' | 'code' | 'switch' | 'discard' | 'undo';

/** What the person stands to lose. */
export type DraftRisk = 'none' | 'never-online' | 'behind-online' | 'safe-online';

export function draftRisk(a: Assessment): DraftRisk {
  /**
   * An assessment that is in the store is never nothing, however empty the form looks.
   *
   * hasWork asks whether anything has been typed. A record whose answers have all been cleared
   * has nothing typed and still has an access code, and that code is the only way back to it.
   * Testing hasWork first sent those silently to their replacement.
   */
  if (!hasWork(a) && !savedOnline(a)) return 'none';
  if (!isHosted() || !savedOnline(a)) return 'never-online';
  return onlineIsCurrent(a) ? 'safe-online' : 'behind-online';
}

const ACT: Record<ReplaceAct, { en: string; fr: string }> = {
  open: {
    en: 'Opening another assessment replaces the one this browser is holding. Only one can be here at a time.',
    fr: 'L’ouverture d’une autre évaluation remplace celle que ce navigateur conserve. Une seule peut être ici à la fois.',
  },
  code: {
    en: 'An access code opens the assessment it belongs to, and that one replaces the assessment this browser is holding.',
    fr: 'Un code d’accès ouvre l’évaluation à laquelle il appartient, et celle-ci remplace l’évaluation que ce navigateur conserve.',
  },
  switch: {
    en: 'Answers belong to the question set they were given against, so they cannot be carried across. Switching empties the form.',
    fr: 'Les réponses appartiennent à la série de questions à laquelle elles ont été données, elles ne peuvent donc pas être transférées. Le changement vide le formulaire.',
  },
  discard: {
    en: 'Discarding empties the form and erases the copy this browser is holding. The questions themselves stay the same.',
    fr: 'La suppression vide le formulaire et efface la copie que ce navigateur conserve. Les questions elles-mêmes ne changent pas.',
  },
  undo: {
    en: 'You have answered questions since that discard. Restoring the older copy replaces them.',
    fr: 'Vous avez répondu à des questions depuis cette suppression. La restauration de la copie précédente les remplace.',
  },
};

export interface GuardOptions {
  current: Assessment;
  act: ReplaceAct;
  onCommit: () => void;
  /** Repaint, so the save badge and the access code catch up with what just happened. */
  after?: () => void;
}

/**
 * Ask, unless there is nothing to ask about.
 *
 * The careful way out saves online, shows the access code, and then goes ahead. A person who
 * has said "save it first" has already decided, so nothing asks them twice; what the code
 * window asks is different, and is the thing they would otherwise have had no chance to do.
 */
export function guardDraft(o: GuardOptions): void {
  const risk = draftRisk(o.current);
  if (risk === 'none') { o.onCommit(); return; }

  const n = answeredCount(o.current);
  const answers = `${n} answer${n === 1 ? '' : 's'}`;

  /**
   * The access code is the only way back to an assessment, so a window that might lose one has
   * to put the code in front of the person.
   *
   * There is no file any more and no list to find it in. A submitter who goes on without the
   * code has no route back to that work at all, which is a thing to say out loud and not a
   * thing to leave them to discover.
   */
  const code = savedOnline(o.current) && o.current.id ? o.current.id : '';

  /**
   * Why there is no code on this window, on the one branch where there is none to give.
   *
   * An assessment carries its code from the moment it is created, so somebody who has seen
   * theirs on the results page expects it here, and its absence reads as the tool having
   * mislaid it. It is absent because nothing has been sent to the store: a code opens a
   * document, and there is no document.
   */
  const stake = risk === 'never-online'
    ? t(`This copy has never been saved online, so ${answers} would be gone, and there is no other way back to it. There is no code to copy here, because a code opens a record in the store and nothing has been sent there yet. Saving online first is what gives you one.`,
        `Cette copie n’a jamais été enregistrée en ligne, donc ${answers === '1 answer' ? '1 réponse' : `${n} réponses`} seraient perdues, et il n’y a aucun autre moyen d’y revenir. Il n’y a pas de code à copier ici : un code ouvre un enregistrement dans le dépôt, et rien n’y a encore été envoyé. L’enregistrement en ligne est ce qui vous en donne un.`)
    : risk === 'behind-online'
      ? t('The copy online is behind this one, so anything typed since the last save would be gone. Its access code is the only way back to it, so take a copy before you go on.',
          'La copie en ligne est en retard sur celle-ci, donc tout ce qui a été saisi depuis le dernier enregistrement serait perdu. Son code d’accès est le seul moyen d’y revenir : copiez-le avant de continuer.')
      : t('This is saved online, so nothing is lost. Its access code is the only way back to it, so take a copy before you go on.',
          'Ceci est enregistré en ligne, donc rien n’est perdu. Son code d’accès est le seul moyen d’y revenir : copiez-le avant de continuer.');

  confirmStep({
    // Nothing is lost when the copy online is current, so the window stops shouting.
    tier: risk === 'safe-online' ? 'plain' : 'danger',
    title: t('Replace what this browser is holding?', 'Remplacer ce que ce navigateur conserve?'),
    body: t(ACT[o.act].en, ACT[o.act].fr),
    // The code itself, to take with them. Mentioning one and leaving it as text is how
    // somebody closes this window and cannot find their way back.
    extra: code ? codeChip(code) : undefined,
    /**
     * Ticked, not read. This window is the last moment somebody has the code in front of them
     * before the only copy of it leaves this browser, and a sentence about that is something
     * people scroll past. Ticking is deliberate in a way reading is not.
     */
    mustAgree: code
      ? t('I have saved this code somewhere. Without it there is no way back to this assessment.',
          'J\u2019ai conservé ce code quelque part. Sans lui, il n\u2019y a aucun moyen de revenir à cette évaluation.')
      : undefined,
    stake,
    /**
     * Saving first, and then showing the code, and only then replacing anything.
     *
     * This used to save and go ahead in one press. The save that MINTS a code therefore closed
     * the window, replaced the draft, and never showed the code it had just made: somebody took
     * the careful option and lost the assessment more completely than if they had taken the
     * other one. Now the three things happen in the order they have to: save, show the code,
     * replace. Acknowledging the code window is what goes ahead.
     */
    alt: risk === 'never-online' || risk === 'behind-online'
      ? {
          label: t('Save this online first, then go ahead', 'L\u2019enregistrer en ligne d\u2019abord, puis continuer'),
          run: () => {
            const first = !savedOnline(o.current);
            void saveOnlineNow(o.current).then((res) => {
              o.after?.();
              if (!res.ok) {
                // It did not go, so nothing is replaced. The draft is still here and the
                // person can try again or choose the other way out.
                alert(res.problem);
                return;
              }
              if (first) showNewCode(o.current, () => { o.onCommit(); o.after?.(); });
              else { o.onCommit(); o.after?.(); }
            });
          },
        }
      : undefined,
    commitLabel: risk === 'safe-online'
      ? t('Go ahead', 'Continuer')
      : t('Go ahead without saving', 'Continuer sans enregistrer'),
    cancelLabel: t('Keep what I have', 'Garder ce que j’ai'),
    onCommit: () => { o.onCommit(); o.after?.(); },
  });
}
