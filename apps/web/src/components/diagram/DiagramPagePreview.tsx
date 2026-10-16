import { memo, useEffect, useRef, useState } from 'react';
import { pagePreviewCache, pagePreviewSize } from '../../diagram/pages/pagePreviewCache';
import styles from './DiagramPagePreview.module.css';

/**
 * Navigate a bitmap of the exact composed page. Keep its previous resolution
 * during a gesture, then sharpen once zoom settles. A changed SVG immediately
 * shows the new vector until its bitmap is ready; an older async result can
 * never overwrite it. The vector also remains the fallback if canvas fails.
 */
export const DiagramPagePreview = memo(function DiagramPagePreview({
  src,
  width,
  height,
  scale,
  className,
}: {
  src: string;
  width: number;
  height: number;
  scale: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null);
  const size = pagePreviewSize(width, height, scale, window.devicePixelRatio || 1);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void pagePreviewCache.get(src, { width: size.width, height: size.height })
        .then((bitmap) => {
          const canvas = canvasRef.current;
          if (!current || !canvas) return;
          const context = canvas.getContext('2d');
          if (!context) return;
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          context.drawImage(bitmap, 0, 0);
          setPaintedSrc(src);
        })
        .catch(() => {
          // A failed refinement may have cleared the canvas: show the vector.
          if (current) setPaintedSrc(null);
        });
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [src, size.width, size.height]);
  const ready = paintedSrc === src;
  return (
    <span className={className} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.surface} hidden={!ready} />
      {!ready && <img className={styles.surface} src={src} alt="" draggable={false} />}
    </span>
  );
});
