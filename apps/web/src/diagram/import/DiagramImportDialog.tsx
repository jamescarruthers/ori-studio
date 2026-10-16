import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { useModalDialog } from "../../components/ui/useModalDialog";
import {
  getFileService,
  pickBinaryFolder,
  type PickedFile,
} from "../../platform/fileService";
import { ensureDiagramImportTarget } from "../../store/workspaceStore/diagramBatchImport";
import { useImportDialogStore } from "./importDialogStore";
import {
  orderedImportFiles,
  runImportJob,
  supportsStepImport,
  type ImportProgress,
} from "./importJob";
import styles from "./DiagramImportDialog.module.css";

export function DiagramImportDialogHost() {
  const target = useImportDialogStore((s) => s.target);
  return target ? <DiagramImportDialog /> : null;
}
function DiagramImportDialog() {
  const { t } = useTranslation();
  const {
    target,
    files: initial,
    opener,
    close,
    folder,
  } = useImportDialogStore();
  const [files, setFiles] = useState(initial),
    [columns, setColumns] = useState(0),
    [gap, setGap] = useState(100),
    [timeout, setTimeoutSeconds] = useState(5),
    [recursive, setRecursive] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null),
    [error, setError] = useState<string | null>(null),
    [running, setRunning] = useState(false),
    [finishing, setFinishing] = useState(false);
  const job = useRef<AbortController | null>(null),
    folds = useRef<AbortController | null>(null);
  const cancel = () => {
    if (progress?.phase === "placing") return;
    if (running) {
      job.current?.abort();
      folds.current?.abort();
    } else close();
  };
  const { rootRef, documentRef, keepFocus } = useModalDialog(cancel, opener);
  useEffect(
    () => () => {
      job.current?.abort();
      folds.current?.abort();
    },
    [],
  );
  const picked = (next: PickedFile[] | null) => {
    if (!next) return;
    const selected = orderedImportFiles(
      next.filter((f) => supportsStepImport(f.name)),
    );
    setFiles(selected);
    setColumns(0);
    setError(
      selected.length
        ? null
        : t(
            "panels:diagram.import.noFiles",
            "No CP, SVG or Defox files were found.",
          ),
    );
  };
  useEffect(() => {
    if (!folder) return;
    let live = true;
    setFiles([]);
    void folder(recursive)
      .then((next) => {
        if (live) {
          setFiles(
            orderedImportFiles(next.filter((f) => supportsStepImport(f.name))),
          );
          setColumns(0);
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [folder, recursive]);
  const pick = async (folder: boolean) => {
    try {
      useImportDialogStore.setState({ folder: null });
      picked(
        folder
          ? await pickBinaryFolder(recursive)
          : await getFileService().openBinaryFiles({
              title: t("panels:diagram.import.title", "Import steps"),
              extensions: ["cp", "svg", "defox"],
              multiple: true,
            }),
      );
    } catch (e) {
      setError(String(e));
    }
  };
  const start = async () => {
    if (!target || running || !files.length) return;
    job.current = new AbortController();
    folds.current = new AbortController();
    setRunning(true);
    setError(null);
    setFinishing(false);
    try {
      const destination = files.some((file) => /\.(cp|defox)$/i.test(file.name))
        ? await ensureDiagramImportTarget(target)
        : target;
      useImportDialogStore.setState({ target: destination });
      await runImportJob(
        files,
        destination,
        { columns, gap, foldTimeoutMs: timeout * 1000 },
        job.current.signal,
        folds.current.signal,
        setProgress,
      );
    } catch (e) {
      if (job.current.signal.aborted) {
        setProgress(null);
        setError(
          t(
            "panels:diagram.import.cancelled",
            "Import cancelled. No files were added.",
          ),
        );
      } else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };
  const move = (i: number, by: number) =>
    setFiles((current) => {
      const next = [...current];
      [next[i], next[i + by]] = [next[i + by]!, next[i]!];
      return next;
    });
  const done = progress?.phase === "done";
  const cells = files.filter((f) => /\.cp$/i.test(f.name)).length;
  const previewColumns = columns || Math.max(1, Math.ceil(Math.sqrt(cells)));
  return createPortal(
    <div
      ref={rootRef}
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagram-import-title"
      data-shortcut-barrier
    >
      <div
        ref={documentRef}
        className={styles.dialog}
        role="document"
        tabIndex={-1}
        onBlur={keepFocus}
      >
        <h2 id="diagram-import-title">
          {t("panels:diagram.import.title", "Import steps")}
        </h2>
        <p>
          {t(
            "panels:diagram.import.description",
            "CPs become folded steps and are appended together to Edit. SVGs become pictures. Defox keeps its saved views.",
          )}
        </p>
        {!running && !done && (
          <>
            <div className={styles.controls}>
              <Button size="sm" onClick={() => void pick(false)}>
                {t("panels:diagram.import.files", "Choose files…")}
              </Button>
              <Button size="sm" onClick={() => void pick(true)}>
                {t("panels:diagram.import.folder", "Choose folder…")}
              </Button>
              <label>
                <input
                  type="checkbox"
                  checked={recursive}
                  onChange={(e) => setRecursive(e.target.checked)}
                />
                {t("panels:diagram.import.recursive", "Include subfolders")}
              </label>
            </div>
            <div className={styles.controls}>
              <label>
                {t("panels:diagram.import.columns", "Columns")}
                <input
                  aria-label={t("panels:diagram.import.columns", "Columns")}
                  type="number"
                  min={1}
                  max={1000}
                  value={columns || ""}
                  placeholder={t("panels:diagram.import.auto", "Auto")}
                  onChange={(e) =>
                    setColumns(
                      e.target.value
                        ? Math.max(
                            1,
                            Math.min(1000, Number(e.target.value) || 1),
                          )
                        : 0,
                    )
                  }
                />
              </label>
              <label>
                {t("panels:diagram.import.gap", "Gap")}
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={gap}
                  onChange={(e) =>
                    setGap(
                      Math.max(1, Math.min(10000, Number(e.target.value) || 1)),
                    )
                  }
                />
              </label>
              <label>
                {t("panels:diagram.import.budget", "Seconds per fold")}
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={timeout}
                  onChange={(e) =>
                    setTimeoutSeconds(
                      Math.max(1, Math.min(120, Number(e.target.value) || 1)),
                    )
                  }
                />
              </label>
            </div>
            {cells > 0 && (
              <svg
                className={styles.preview}
                viewBox={`0 0 ${Math.min(previewColumns, cells) * 5} ${Math.ceil(cells / previewColumns) * 5}`}
                role="img"
                aria-label={t(
                  "panels:diagram.import.layout",
                  "Edit layout preview",
                )}
              >
                {Array.from({ length: cells }, (_, i) => (
                  <rect
                    key={i}
                    x={(i % previewColumns) * 5}
                    y={Math.floor(i / previewColumns) * 5}
                    width={4}
                    height={4}
                  />
                ))}
              </svg>
            )}
            <ol className={styles.files}>
              {files.map((f, i) => (
                <li key={`${i}:${f.name}`}>
                  <span>{f.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    aria-label={t(
                      "panels:diagram.import.earlier",
                      "Move earlier",
                    )}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === files.length - 1}
                    aria-label={t("panels:diagram.import.later", "Move later")}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </Button>
                </li>
              ))}
            </ol>
          </>
        )}
        {progress && (
          <div aria-live="polite">
            <progress max={Math.max(1, progress.total)} value={progress.done} />
            <p>
              {done
                ? t("panels:diagram.import.added", "Steps added: {{total}}", {
                    total: progress.added,
                  })
                : `${progress.done} / ${progress.total} · ${progress.name}`}
            </p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {progress &&
          (progress.failures.length > 0 || progress.notices.length > 0) && (
            <ul className={styles.results}>
              {[...progress.failures, ...progress.notices].map((n, i) => (
                <li key={i}>
                  <strong>{n.name}</strong>: {n.message}
                </li>
              ))}
            </ul>
          )}
        <div className={styles.footer}>
          <Button
            size="sm"
            variant="ghost"
            disabled={progress?.phase === "placing"}
            onClick={cancel}
          >
            {running
              ? t("common:cancel", "Cancel")
              : t("common:close", "Close")}
          </Button>
          {running && (
            <Button
              size="sm"
              disabled={finishing || progress?.phase === "placing"}
              onClick={() => {
                folds.current?.abort();
                setFinishing(true);
              }}
            >
              {t("panels:diagram.import.finish", "Finish import now")}
            </Button>
          )}
          {!running && !done && (
            <Button
              size="sm"
              disabled={!files.length}
              onClick={() => void start()}
            >
              {t("panels:diagram.import.start", "Import")}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
