import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { stepSlots, type StepSlot } from '../../../lib/steps/stepSlots';
import styles from './StepsGrid.module.css';

/** What the grid hands each card: spread onto a `StepCard`, or a card built on one. */
export interface StepsGridCardProps {
  selected: boolean;
  /** Whether this card is the grid's tab stop: the selected card, or the first while none is. */
  tabStop: boolean;
  /** Something dragged over the grid would land on this card. */
  dropTarget: boolean;
}

/** Where something dragged over the grid would land: on a card, or on the space between the cards. */
export type StepsGridDropTarget = { kind: 'card'; id: string } | { kind: 'grid' };

/**
 * Every entry of a sequence of steps, in order, as a grid of cards that is one
 * listbox: a Diagram's steps, a Fold sequence's.
 *
 * The selection is the surface's; this only shows it and reports clicks.
 * Focus follows it — a roving tab stop on the selected card — while focus is
 * in the grid or nowhere at all, so a selection made from a control elsewhere
 * (a side pane, an Add step) never pulls focus out of it, but deleting the
 * focused card hands focus on to the card that took its place rather than
 * dropping it on the page. It scrolls the selected card into view, wherever
 * the selection came from.
 *
 * The listbox itself takes focus (not Tab) from a press on the space between
 * cards, so a press there keeps focus in the grid and the next arrow's
 * selection carries it back onto a card. The arrows are the surface's
 * shortcuts, not the grid's: it moves nothing itself.
 *
 * A turn between two steps (D22) is a card of its own in its place (D24),
 * numbered none: the cards either side read 3 and 4 (`stepSlots`). What each
 * card is, the surface draws (`renderCard`, on `StepCard` or `TurnCard`).
 *
 * A surface whose sequence can change may add, for a pointer: an empty card's
 * outline after the last card that adds an entry at the end (`append`), and
 * the gap before every card — the first card's too — that adds one there, a
 * line and a "+" between the two cards on a hover (`insert`). A listbox holds only
 * its options, so both are hidden from assistive tech and never focused: the
 * surface's own Add and its card menu's Insert are the way there from the
 * keyboard. A press on either lands focus on the listbox, so the new entry's
 * card takes it.
 */
export function StepsGrid<Step extends { id: string }, Turn extends { id: string }>({
  entries,
  isTurn,
  label,
  selectedId,
  onSelect,
  renderCard,
  attributes,
  dropTarget = null,
  insert,
  append,
}: {
  /** The sequence's order: its steps and the turns between them. */
  entries: readonly (Step | Turn)[];
  isTurn: (entry: Step | Turn) => entry is Turn;
  /** The listbox's accessible name. */
  label: string;
  selectedId: string | null;
  /** A press on a card selects it; one between or below the cards, nothing (null). */
  onSelect: (id: string | null) => void;
  /** Each entry's card, from its slot: a step's with its number, a turn's with the steps either side. */
  renderCard: (slot: StepSlot<Step, Turn>, card: StepsGridCardProps) => ReactNode;
  /** More of the listbox's own data attributes: what the surface's shortcuts know it by. */
  attributes?: Readonly<Record<`data-${string}`, string>>;
  /** Where something dragged over the grid would land; null while nothing is. */
  dropTarget?: StepsGridDropTarget | null;
  /** An entry added in the gap before a card, for a pointer; absent where the sequence cannot change. */
  insert?: { label: string; onInsertBefore: (id: string) => void };
  /** An entry added at the end, from the tile after the last card; absent where the sequence cannot change. */
  append?: { label: string; onAppend: () => void };
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const slotElements = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (selectedId === null) return;
    // The grid places each card in a slot of its own; the card is the slot's option.
    const card = slotElements.current.get(selectedId)?.querySelector<HTMLElement>('[role="option"]');
    if (!card) return;
    card.scrollIntoView?.({ block: 'nearest' });
    const active = document.activeElement;
    const nowhere = active === null || active === document.body;
    if ((nowhere || listRef.current?.contains(active)) && active !== card) {
      card.focus({ preventScroll: true });
    }
  }, [selectedId]);

  const tabStop = selectedId ?? entries[0]?.id ?? null;
  const slots = useMemo(() => stepSlots<Step, Turn>(entries, isTurn), [entries, isTurn]);
  const keep = (id: string) => (element: HTMLDivElement | null) => {
    if (element) slotElements.current.set(id, element);
    else slotElements.current.delete(id);
  };

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      tabIndex={-1}
      className={styles.grid}
      {...attributes}
      data-drop-target={dropTarget?.kind === 'grid' || undefined}
      onClick={(event) => {
        // A press between or below the cards drops the selection, as a press on
        // empty canvas does elsewhere.
        if (event.target === event.currentTarget) onSelect(null);
      }}
    >
      {slots.map((slot) => (
        // A slot, so the gap before the card is placed against it.
        <div key={slot.entry.id} ref={keep(slot.entry.id)} className={styles.slot}>
          {insert && (
            <div
              aria-hidden
              className={styles.insert}
              data-insert-before={slot.entry.id}
              title={insert.label}
              onClick={() => insert.onInsertBefore(slot.entry.id)}
            >
              <span className={styles.insertButton}>
                <Plus size={13} aria-hidden />
              </span>
            </div>
          )}
          {renderCard(slot, {
            selected: slot.entry.id === selectedId,
            tabStop: slot.entry.id === tabStop,
            dropTarget: dropTarget?.kind === 'card' && dropTarget.id === slot.entry.id,
          })}
        </div>
      ))}
      {append && (
        // The place after the last card: the tile that adds an entry there.
        <div className={styles.slot} data-trailing="">
          <div
            aria-hidden
            className={styles.addTile}
            data-add-step-tile=""
            // A double-click's second click, after a Delete moved this tile under the pointer, adds nothing.
            onClick={(event) => {
              if (event.detail <= 1) append.onAppend();
            }}
          >
            <Plus size={18} aria-hidden />
            {append.label}
          </div>
        </div>
      )}
    </div>
  );
}
