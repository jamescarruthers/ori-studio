import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { useLongPressReorder } from '../../hooks/useLongPressReorder';
import type { PickedFile } from '../../platform/fileService';
import styles from './ImportFileOrder.module.css';

// Identity survives a move, including files with identical names from different folders.
const ids = new WeakMap<PickedFile, string>();
let nextId = 0;
function idOf(file: PickedFile): string {
  let id = ids.get(file);
  if (!id) ids.set(file, (id = `import-file-${++nextId}`));
  return id;
}
const scrollElement = (list: HTMLElement) => list.parentElement;

export function ImportFileOrder({ files, onChange, disabled, currentName }: {
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  disabled: boolean;
  currentName?: string;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const move = (id: string, to: number) => {
    if (disabled) return;
    const from = files.findIndex((file) => idOf(file) === id);
    if (from < 0 || to < 0 || to >= files.length || from === to) return;
    const next = [...files];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    onChange(next);
  };
  const { draggingId, handlers } = useLongPressReorder({
    itemAttribute: 'data-import-file',
    onReorder: move,
    scrollElement,
  });
  return <>
    <span id={hintId} className={styles.hint}>
      {t('panels:diagram.import.reorderHint', 'Drag to reorder, or use the up and down arrow keys.')}
    </span>
    <ol className={styles.files} aria-label={t('panels:diagram.import.order', 'Import order')}>
      {files.map((file, index) => <li
        key={idOf(file)}
        data-import-file={idOf(file)}
        data-dragging={draggingId === idOf(file) || undefined}
        data-current={currentName === file.name || undefined}
        {...(!disabled ? handlers : {})}
      >
        <IconButton
          size="sm"
          title={t('panels:diagram.import.reorder', 'Reorder {{name}}', { name: file.name })}
          aria-describedby={hintId}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            event.stopPropagation();
            move(idOf(file), index + (event.key === 'ArrowUp' ? -1 : 1));
            const handle = event.currentTarget;
            requestAnimationFrame(() => handle.scrollIntoView?.({ block: 'nearest' }));
          }}
        ><GripVertical size={14} /></IconButton>
        <span className={styles.fileIndex} aria-hidden="true">{index + 1}</span>
        <span className={styles.fileName} title={file.name}>{file.name}</span>
      </li>)}
    </ol>
  </>;
}
