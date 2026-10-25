import { useId, type PointerEvent } from 'react';
import { Redo2, Trash2, Undo2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listControls, rowGroupsView, type LayerRowGroupView } from '../../layer-order/model/layerOrderSelectors';
import type { LayerOrderAction, LayerOrderDialogState } from '../../layer-order/model/layerOrderState';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { LayerOrderFaceChip } from './LayerOrderFaceChip';
import type { LayerOrderCopy } from './layerOrderInspectorCopy';
import styles from './LayerOrderConstraintList.module.css';

export interface LayerOrderConstraintListProps {
  readonly state: LayerOrderDialogState;
  readonly dispatch: (action: LayerOrderAction) => void;
  readonly copy: LayerOrderCopy;
}

/** A finger down on a row lights its faces, as pointing at it does (D6). */
function touched(event: PointerEvent): boolean {
  return event.pointerType === 'touch';
}

/**
 * The constraints list (A3; A5's grouped rows; `Round4-States`' rows by
 * status): one row per subject and verb, "D in front of H, K", each the
 * sentence that made it, read from the side shown.
 *
 * - A row is one button, named by its whole sentence: a press puts its
 *   subject in the builder; pointing at it, focusing it or pressing it lights
 *   its faces on both panes.
 * - Its trash removes the whole row as one undo step; in a row of two or
 *   more, each object has its own ×, shown on hover or focus, and always on
 *   a coarse pointer (D21).
 * - A row in the clash shown carries the danger dot, and in a row of two or
 *   more the clashing objects are marked on their chips; a saved row that is
 *   not applied is dimmed with the warning dot, and its reason is its title.
 *   A face that no longer exists keeps its chip's place, with no letter.
 * - The heading counts constraints, as Properties does (D11), not rows.
 */
export function LayerOrderConstraintList({ state, dispatch, copy }: LayerOrderConstraintListProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const groups = rowGroupsView(state);
  const controls = listControls(state);
  const count = state.rows.committed.length + state.rows.carried.length;
  const leave = () => dispatch({ type: 'row_hovered', key: null });

  return (
    <section className={styles.list} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h3 className={styles.title} id={titleId}>
          {count > 0
            ? t('dialogs:layerOrder.list.titleCount', 'Constraints · {{count}}', { count })
            : t('dialogs:layerOrder.list.title', 'Constraints')}
        </h3>
        <IconButton
          size="sm"
          aria-label={t('dialogs:layerOrder.list.undo', 'Undo')}
          title={controls.undo ? t('dialogs:layerOrder.list.undo', 'Undo') : t('dialogs:layerOrder.list.nothingToUndo', 'Nothing to undo')}
          aria-disabled={!controls.undo || undefined}
          onClick={() => {
            if (controls.undo) dispatch({ type: 'undo' });
          }}
        >
          <Undo2 size={14} />
        </IconButton>
        <IconButton
          size="sm"
          aria-label={t('dialogs:layerOrder.list.redo', 'Redo')}
          title={controls.redo ? t('dialogs:layerOrder.list.redo', 'Redo') : t('dialogs:layerOrder.list.nothingToRedo', 'Nothing to redo')}
          aria-disabled={!controls.redo || undefined}
          onClick={() => {
            if (controls.redo) dispatch({ type: 'redo' });
          }}
        >
          <Redo2 size={14} />
        </IconButton>
        <Button
          size="sm"
          variant="ghost"
          aria-disabled={!controls.clearAll || undefined}
          onClick={() => {
            if (controls.clearAll) dispatch({ type: 'clear_all' });
          }}
        >
          {t('dialogs:layerOrder.list.clearAll', 'Clear all')}
        </Button>
      </div>
      {groups.length === 0 ? (
        <p className={styles.empty}>
          {t('dialogs:layerOrder.list.empty', 'None yet. Each constraint you add is listed here as its sentence, in the order made.')}
        </p>
      ) : (
        <ul className={styles.rows} onPointerLeave={leave}>
          {groups.map((group) => (
            <ConstraintRow
              key={group.key}
              group={group}
              copy={copy}
              removable={controls.remove}
              dispatch={dispatch}
              onLeave={leave}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ConstraintRow({
  group,
  copy,
  removable,
  dispatch,
  onLeave,
}: {
  group: LayerRowGroupView;
  copy: LayerOrderCopy;
  removable: boolean;
  dispatch: (action: LayerOrderAction) => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const { key, sentence, members, mark, reason } = group;
  const multi = members.length > 1;
  const text = copy.sentence(sentence);
  const enter = () => dispatch({ type: 'row_hovered', key });
  const title =
    reason !== null && mark !== 'none'
      ? copy.reason(reason)
      : sentence.subject !== null
        ? t('dialogs:layerOrder.list.reveal', 'Put {{face}} in the builder', { face: copy.letter(sentence.subject) })
        : undefined;
  const dim = mark === 'not_applied';
  const remove = (ids: readonly number[]) => {
    if (removable) dispatch({ type: 'rows_removed', ids });
  };

  const parts = copy.sentenceParts().map((part, index) => {
    switch (part.kind) {
      case 'subject':
        return (
          <LayerOrderFaceChip
            key="subject"
            letter={copy.letter(sentence.subject)}
            gone={sentence.subject === null}
            dim={dim}
          />
        );
      case 'verb':
        return (
          <span key="verb" className={styles.verb} data-dim={dim || undefined} aria-hidden="true">
            {sentence.verb === null ? t('dialogs:layerOrder.verb.against', 'against') : copy.verb(sentence.verb)}
          </span>
        );
      case 'objects':
        return (
          <span key="objects" className={styles.objects}>
            {members.map((member, i) => {
              const one = copy.clause({ ...sentence, objects: [member.object] });
              const label = t('dialogs:layerOrder.list.remove', 'Remove {{sentence}}', { sentence: one });
              return (
                <span
                  key={member.id}
                  className={styles.object}
                  data-x={multi ? '' : undefined}
                  // A press on an object reaches its row, as a press anywhere else on it does.
                  onClick={() => dispatch({ type: 'row_clicked', key })}
                >
                  <LayerOrderFaceChip
                    letter={copy.letter(member.object)}
                    gone={member.object === null}
                    tone={multi && member.clash ? 'danger' : 'plain'}
                    dim={dim}
                  />
                  {multi && (
                    <span className={styles.objectSlot}>
                      <span className={styles.separator} aria-hidden="true">
                        {i < members.length - 1 ? t('dialogs:layerOrder.list.separator', ',') : ''}
                      </span>
                      <button
                        type="button"
                        className={styles.objectRemove}
                        aria-label={label}
                        title={label}
                        aria-disabled={!removable || undefined}
                        onFocus={enter}
                        onBlur={onLeave}
                        onClick={(event) => {
                          event.stopPropagation();
                          remove([member.id]);
                        }}
                      >
                        <X size={10} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </span>
              );
            })}
          </span>
        );
      case 'text':
        return (
          <span key={`text-${index}`} className={styles.verb} aria-hidden="true">
            {part.text}
          </span>
        );
    }
  });

  return (
    <li
      className={styles.row}
      data-hot={group.hot || undefined}
      data-mark={mark}
      data-flagged={group.flagged || undefined}
      onPointerEnter={enter}
      onPointerDown={(event) => {
        if (touched(event)) enter();
      }}
      onPointerUp={(event) => {
        if (touched(event)) onLeave();
      }}
      onPointerCancel={(event) => {
        if (touched(event)) onLeave();
      }}
    >
      <div className={styles.line}>
        <button
          type="button"
          className={styles.hit}
          aria-label={text}
          title={title}
          onClick={() => dispatch({ type: 'row_clicked', key })}
          onFocus={enter}
          onBlur={onLeave}
        />
        <span className={styles.dot} aria-hidden="true" />
        {/* What it reads, drawn: its chips and words are hidden from a reader, which hears the row's button. */}
        <span className={styles.sentence}>{parts}</span>
      </div>
      <IconButton
        size="sm"
        aria-label={t('dialogs:layerOrder.list.remove', 'Remove {{sentence}}', { sentence: copy.clause(sentence) })}
        title={t('dialogs:layerOrder.list.remove', 'Remove {{sentence}}', { sentence: copy.clause(sentence) })}
        aria-disabled={!removable || undefined}
        onFocus={enter}
        onBlur={onLeave}
        onClick={() => remove(members.map((member) => member.id))}
      >
        <Trash2 size={14} />
      </IconButton>
    </li>
  );
}
