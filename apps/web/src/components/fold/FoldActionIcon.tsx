import { BookImage, Download, FlipHorizontal2, Images, RotateCcw, RotateCw, Send, Trash2, Upload } from 'lucide-react';
import type { FoldActionIcon as FoldActionIconName } from '../../fold/foldActions';
import { FoldKindMark } from './FoldKindMark';

/**
 * The icon of a Fold verb (`fold/foldActions`' `FoldActionIcon`), wherever a
 * surface draws one with an icon — the header, the step cards' menus. The
 * fold kinds are their letters in the ink of the crease each leaves, as on the
 * rail; turn over is the rail's own glyph; Send to Edit is the verb's icon in
 * every workspace. Decorative: every verb is named in words beside it.
 */
export function FoldActionIcon({ icon, size = 14 }: { icon: FoldActionIconName; size?: number }) {
  switch (icon) {
    case 'valley':
    case 'mountain':
    case 'precrease':
      return <FoldKindMark kind={icon} />;
    case 'turn-over':
      return <FlipHorizontal2 size={size} aria-hidden="true" />;
    case 'rotate-ccw':
      return <RotateCcw size={size} aria-hidden="true" />;
    case 'rotate-cw':
      return <RotateCw size={size} aria-hidden="true" />;
    case 'import-cp':
      return <Upload size={size} aria-hidden="true" />;
    case 'send-to-edit':
      return <Send size={size} aria-hidden="true" />;
    case 'send-to-diagram':
      return <BookImage size={size} aria-hidden="true" />;
    case 'export-fold':
      return <Download size={size} aria-hidden="true" />;
    case 'export-steps':
      return <Images size={size} aria-hidden="true" />;
    case 'delete':
      return <Trash2 size={size} aria-hidden="true" />;
  }
}
