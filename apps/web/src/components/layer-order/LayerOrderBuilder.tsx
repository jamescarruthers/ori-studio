import { useId, useState, type PointerEvent } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, CircleAlert, LoaderCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FaceLetters, LayerFace } from '../../layer-order/engine/faceIndex';
import { builderLive } from '../../layer-order/model/layerOrderReducer';
import { addState, hintLine, listControls, paneMarks } from '../../layer-order/model/layerOrderSelectors';
import { LAYER_VERBS, facesWithChoices, openPartners, slotNow } from '../../layer-order/model/layerOrderSentence';
import type { LayerOrderAction, LayerOrderDialogState } from '../../layer-order/model/layerOrderState';
import { Button } from '../ui/Button';
import { MenuCheckboxItem, MenuContent, MenuItemIcon, MenuItemLabel, MenuRadioGroup, MenuRadioItem } from '../ui/Menu';
import { LayerOrderFaceChip, LayerOrderFaceChipButton } from './LayerOrderFaceChip';
import type { LayerHintContext, LayerOrderCopy } from './layerOrderInspectorCopy';
import styles from './LayerOrderBuilder.module.css';

export interface LayerOrderBuilderProps {
  readonly state: LayerOrderDialogState;
  readonly dispatch: (action: LayerOrderAction) => void;
  readonly copy: LayerOrderCopy;
  readonly letters: FaceLetters | null;
  readonly hint: LayerHintContext;
}

/**
 * A face menu opens from the keyboard only (Enter, Space or ↓ on its slot):
 * a pointer's press on the slot makes it the active one and picks nothing,
 * since faces are picked on the panes.
 */
function keyboardOnly(event: PointerEvent) {
  event.preventDefault();
}

/**
 * A menu named by its own label (A5: "Objects for D", "Verb") rather than
 * by its trigger, whose name says what the slot holds: Radix labels a menu by
 * its trigger unless told otherwise.
 */
function namedMenu(label: string) {
  return { 'aria-label': label, 'aria-labelledby': undefined };
}

/**
 * "Add a constraint" (A3's sentence, A5's compound objects; `Round4-States`'
 * hint line): `[subject] [verb ▾] [objects]` on one line, in the locale's
 * order, then the reserved hint line, then Clear and Add.
 *
 * - **The subject slot** holds one face; **the object field** one or more,
 *   each a chip that is just its letter, a press on it removing that object,
 *   and the field's one × clearing them all (D21). A press on a slot makes it
 *   the one the next pick fills; from the keyboard, Enter or ↓ on it opens a
 *   menu of the faces it can take, by letter: the subject's is a choice of
 *   one, the objects' a set of checkboxes that stays open (A5).
 * - **The verb menu** previews the verb under the pointer or the focus on the
 *   folded figure, and picking one previews it at once (Round3:457; D6).
 * - **The hint line** keeps its two lines whatever it says, so Clear and Add
 *   never move; a can't-fit's reason is in the danger tone, and pointing at
 *   it strengthens the clash's tints. A check that ran out offers Keep trying
 *   in the same line (D8).
 */
export function LayerOrderBuilder({ state, dispatch, copy, letters, hint: hintContext }: LayerOrderBuilderProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const hintId = useId();
  const [verbOpen, setVerbOpen] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [objectsOpen, setObjectsOpen] = useState(false);

  const live = builderLive(state);
  const { sentence, open } = state;
  const { subject, objects, verb } = sentence;
  const active = slotNow(sentence, open);
  const stuck = subject !== null && openPartners(open, subject).length === 0;
  const marks = paneMarks(state);
  const clashObjects = new Set(marks.clashObjects);
  const byLetter = (faces: readonly LayerFace[]) => (letters ? [...faces].sort(letters.compare) : [...faces]);
  const subjects = live ? byLetter(facesWithChoices(open)) : [];
  const offered = live && subject !== null ? byLetter(openPartners(open, subject)) : [];

  const add = addState(state);
  const hint = hintLine(state);
  const hintText = hint ? copy.hint(hint, hintContext) : '';
  const controls = listControls(state);
  const subjectLetter = copy.letter(subject);
  const verbText = copy.verb(verb);

  const subjectAria =
    subject === null
      ? t('dialogs:layerOrder.builder.subjectEmpty', 'Subject: pick a face')
      : active === 'subject'
        ? t('dialogs:layerOrder.builder.subjectActive', 'Subject: face {{face}}. The next face picked replaces it', { face: subjectLetter })
        : t('dialogs:layerOrder.builder.subjectFilled', 'Subject: face {{face}}. Press to replace it', { face: subjectLetter });
  const objectsAria =
    subject === null
      ? t('dialogs:layerOrder.builder.objectsNoSubject', 'Objects: pick the subject first')
      : stuck
        ? t('dialogs:layerOrder.builder.objectsStuck', 'Objects: nothing left to choose for {{face}}', { face: subjectLetter })
        : objects.length === 0
          ? t('dialogs:layerOrder.builder.objectsEmpty', 'Objects: pick faces {{face}} overlaps', { face: subjectLetter })
          : t('dialogs:layerOrder.builder.objectsFilled', 'Objects: {{objects}}. Choose more from a list', {
              objects: copy.objects(objects),
            });
  const facesNamed = (face: LayerFace) => t('dialogs:layerOrder.builder.menuFace', 'Face {{face}}', { face: copy.letter(face) });

  const subjectSlot = (
    <div
      key="subject"
      className={styles.slot}
      data-slot="subject"
      data-active={live && active === 'subject' ? '' : undefined}
      onPointerEnter={() => dispatch({ type: 'slot_hovered', slot: 'subject' })}
      onPointerLeave={() => dispatch({ type: 'slot_hovered', slot: null })}
    >
      <DropdownMenu.Root modal={false} open={subjectsOpen && live} onOpenChange={setSubjectsOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={styles.slotMain}
            aria-label={subjectAria}
            aria-current={live && active === 'subject' ? 'true' : undefined}
            aria-disabled={!live || undefined}
            onPointerDown={keyboardOnly}
            onClick={() => dispatch({ type: 'slot_activated', slot: 'subject' })}
          >
            {subject !== null ? (
              <LayerOrderFaceChip letter={subjectLetter} tone="pick" />
            ) : (
              <span className={styles.placeholder}>{t('dialogs:layerOrder.builder.pickFace', 'Pick a face')}</span>
            )}
          </button>
        </DropdownMenu.Trigger>
        <MenuContent align="start" {...namedMenu(t('dialogs:layerOrder.builder.subjectsMenu', 'Subjects'))}>
          <MenuRadioGroup
            value={subject === null ? '' : String(subject)}
            onValueChange={(value) => {
              dispatch({ type: 'slot_activated', slot: 'subject' });
              dispatch({ type: 'face_picked', face: Number(value), origin: 'menu' });
            }}
          >
            {subjects.map((face) => (
              <MenuRadioItem key={face} value={String(face)} aria-label={facesNamed(face)}>
                <MenuItemIcon>{face === subject && <Check size={14} />}</MenuItemIcon>
                <LayerOrderFaceChip letter={copy.letter(face)} />
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </DropdownMenu.Root>
      {subject !== null && (
        <button
          type="button"
          className={styles.slotClear}
          aria-label={t('dialogs:layerOrder.builder.clearSubject', 'Clear {{face}} from the subject', { face: subjectLetter })}
          title={t('dialogs:layerOrder.builder.clearSubject', 'Clear {{face}} from the subject', { face: subjectLetter })}
          aria-disabled={!live || undefined}
          onClick={() => dispatch({ type: 'slot_cleared', slot: 'subject' })}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const verbMenu = (
    <DropdownMenu.Root
      key="verb"
      // Non-modal (Round3): a press anywhere else closes it, and that press still acts.
      modal={false}
      open={verbOpen && live}
      onOpenChange={(next) => {
        setVerbOpen(next);
        if (!next) dispatch({ type: 'verb_pointed', verb: null });
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles.verb}
          aria-label={t('dialogs:layerOrder.builder.verb', 'Verb: {{verb}}', { verb: verbText })}
          aria-disabled={!live || undefined}
        >
          <span>{verbText}</span>
          <ChevronDown size={12} aria-hidden="true" className={styles.verbChevron} />
        </button>
      </DropdownMenu.Trigger>
      <MenuContent align="start" {...namedMenu(t('dialogs:layerOrder.builder.verbMenu', 'Verb'))}>
        <MenuRadioGroup value={verb} onValueChange={(value) => dispatch({ type: 'verb_set', verb: value as typeof verb })}>
          {LAYER_VERBS.map((option) => (
            <MenuRadioItem
              key={option}
              value={option}
              // Pointing at a verb, or reaching it from the keyboard, previews it (Round3:457, 893).
              onFocus={() => dispatch({ type: 'verb_pointed', verb: option })}
            >
              <MenuItemIcon>{option === verb && <Check size={14} />}</MenuItemIcon>
              <MenuItemLabel>{copy.verb(option)}</MenuItemLabel>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </DropdownMenu.Root>
  );

  const objectsDisabled = !live || subject === null || stuck;
  const objectsField = (
    <div
      key="objects"
      className={styles.slot}
      data-slot="objects"
      data-active={live && active === 'object' ? '' : undefined}
      onPointerEnter={() => dispatch({ type: 'slot_hovered', slot: 'object' })}
      onPointerLeave={() => dispatch({ type: 'slot_hovered', slot: null })}
    >
      <DropdownMenu.Root modal={false} open={objectsOpen && !objectsDisabled} onOpenChange={setObjectsOpen}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={styles.fieldOpen}
            aria-label={objectsAria}
            title={objectsAria}
            aria-current={live && active === 'object' ? 'true' : undefined}
            aria-disabled={objectsDisabled || undefined}
            onPointerDown={keyboardOnly}
            onClick={() => dispatch({ type: 'slot_activated', slot: 'object' })}
          >
            {objects.length === 0 && (
              <span className={styles.placeholder}>{t('dialogs:layerOrder.builder.pickObject', 'pick a face')}</span>
            )}
          </button>
        </DropdownMenu.Trigger>
        <MenuContent
          align="end"
          {...namedMenu(t('dialogs:layerOrder.builder.objectsMenu', 'Objects for {{face}}', { face: subjectLetter }))}
        >
          {offered.map((face) => (
            <MenuCheckboxItem
              key={face}
              checked={objects.includes(face)}
              aria-label={facesNamed(face)}
              // A checkbox set: the menu stays open, so several can be picked (A5).
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => {
                dispatch({ type: 'slot_activated', slot: 'object' });
                dispatch({ type: 'face_picked', face, origin: 'menu' });
              }}
            >
              <MenuItemIcon>{objects.includes(face) && <Check size={14} />}</MenuItemIcon>
              <LayerOrderFaceChip letter={copy.letter(face)} />
            </MenuCheckboxItem>
          ))}
        </MenuContent>
      </DropdownMenu.Root>
      {objects.length > 0 && (
        <span className={styles.chips}>
          {objects.map((face) => {
            const remove = t('dialogs:layerOrder.builder.removeObject', 'Remove {{face}}', { face: copy.letter(face) });
            return (
              <LayerOrderFaceChipButton
                key={face}
                letter={copy.letter(face)}
                tone={clashObjects.has(face) ? 'danger' : 'pick'}
                aria-label={remove}
                title={remove}
                onClick={() => dispatch({ type: 'object_removed', face })}
              />
            );
          })}
        </span>
      )}
      {objects.length > 0 && (
        <button
          type="button"
          className={styles.slotClear}
          data-objects=""
          aria-label={
            objects.length > 1
              ? t('dialogs:layerOrder.builder.clearObjects', 'Clear the objects')
              : t('dialogs:layerOrder.builder.clearObject', 'Clear the object')
          }
          title={
            objects.length > 1
              ? t('dialogs:layerOrder.builder.clearObjects', 'Clear the objects')
              : t('dialogs:layerOrder.builder.clearObject', 'Clear the object')
          }
          aria-disabled={!live || undefined}
          onClick={() => dispatch({ type: 'slot_cleared', slot: 'object' })}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const tone = hint?.tone ?? 'quiet';
  const danger = tone === 'danger' || tone === 'busy_danger';
  const role = !hint ? undefined : danger ? 'alert' : tone === 'busy' || hint.action ? 'status' : undefined;

  return (
    <section className={styles.builder} data-off={!live || undefined} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h3 className={styles.title} id={titleId}>
          {t('dialogs:layerOrder.builder.title', 'Add a constraint')}
        </h3>
      </div>
      <div className={styles.sentence} role="group" aria-labelledby={titleId} aria-describedby={hintId}>
        {copy.sentenceParts().map((part, index) => {
          if (part.kind === 'subject') return subjectSlot;
          if (part.kind === 'verb') return verbMenu;
          if (part.kind === 'objects') return objectsField;
          return (
            <span key={`text-${index}`} className={styles.particle}>
              {part.text}
            </span>
          );
        })}
      </div>
      <div
        className={styles.hint}
        id={hintId}
        data-tone={tone}
        role={role}
        onPointerEnter={() => {
          if (danger) dispatch({ type: 'reason_hovered', on: true });
        }}
        onPointerLeave={() => dispatch({ type: 'reason_hovered', on: false })}
      >
        {danger && <CircleAlert size={12} className={styles.hintIcon} aria-hidden="true" />}
        {tone === 'busy' && <LoaderCircle size={12} className={styles.spin} aria-hidden="true" />}
        <span className={styles.hintText} title={hintText || undefined}>
          {hintText}
        </span>
        {tone === 'busy_danger' && <LoaderCircle size={12} className={styles.spin} aria-hidden="true" />}
        {hint?.action === 'keep_trying' && (
          <Button size="sm" variant="secondary" className={styles.hintAction} onClick={() => dispatch({ type: 'keep_trying' })}>
            {t('dialogs:layerOrder.keepTrying', 'Keep trying')}
          </Button>
        )}
      </div>
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="ghost"
          aria-disabled={!controls.clearSentence || undefined}
          title={t('dialogs:layerOrder.builder.clearTitle', 'Clear the sentence')}
          onClick={() => {
            if (controls.clearSentence) dispatch({ type: 'sentence_cleared' });
          }}
        >
          {t('dialogs:layerOrder.builder.clear', 'Clear')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          aria-disabled={!add.enabled || undefined}
          title={copy.addTitle(add, hint?.text.key === 'cant_fit' ? hintText : null)}
          onClick={() => {
            if (add.enabled) dispatch({ type: 'add' });
          }}
        >
          {copy.addLabel(add)}
        </Button>
      </div>
    </section>
  );
}
