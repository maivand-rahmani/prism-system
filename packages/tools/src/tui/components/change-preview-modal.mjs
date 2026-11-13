import { useCallback, useState } from "react";
import { Text, useWindowSize } from "ink";
import { List, useKeyHandler } from "runeframe";
import {
  displayValue,
  fileContentRows,
  managedFileKindLabel,
  previewViewportRows,
} from "../utils/format.mjs";
import { Heading, KeyButton, h, line, paragraph } from "../primitives.mjs";

export function ChangePreviewModal({ modalProps = {}, closeModal = () => {} }) {
  const { columns = 80, rows = 24 } = useWindowSize();
  const [fileIndex, setFileIndex] = useState(0);
  const closePreview = useCallback(() => closeModal(), [closeModal]);
  const compact = columns < 58 || rows < 18;
  const files = Array.isArray(modalProps.files) ? modalProps.files : [];
  const diffLines = Array.isArray(modalProps.lines) ? modalProps.lines : [];
  const isFileDiff = modalProps.kind === "managed-files";
  const selectedFile = files[fileIndex] ?? files[0];
  const moveFile = useCallback(
    (direction) => {
      if (files.length < 2) return;
      setFileIndex((index) => (index + direction + files.length) % files.length);
    },
    [files.length],
  );

  useKeyHandler(
    (event) => {
      if (!event.escape) return false;
      closePreview();
      return true;
    },
    "modal",
    { priority: 200, deps: [closePreview] },
  );

  useKeyHandler(
    (event) => {
      if (!isFileDiff || files.length < 2) return false;
      if (event.left || event.key === "[") {
        moveFile(-1);
        return true;
      }
      if (event.right || event.key === "]") {
        moveFile(1);
        return true;
      }
      return false;
    },
    "modal",
    { priority: 50, deps: [files.length, isFileDiff, moveFile] },
  );

  const closeAction = h(KeyButton, {
    key: "close",
    shortcut: "Esc",
    label: "Close preview",
    onActivate: closePreview,
    compact: true,
  });

  if (isFileDiff && selectedFile) {
    const contentRows = fileContentRows(selectedFile, Math.max(8, columns - 12));
    const fileLabel = managedFileKindLabel(selectedFile.kind);
    const changeStatus =
      selectedFile.changed === true
        ? "CHANGED"
        : selectedFile.changed === false
          ? "UNCHANGED"
          : "STATUS NOT RETURNED";
    const items = contentRows.map((row, index) => ({
      id: `file-row-${index}`,
      label: row.text,
      row,
    }));
    const footerActions = [];
    if (files.length > 1) {
      footerActions.push(
        h(KeyButton, {
          key: "previous-diff",
          shortcut: "←",
          label: compact ? "Prev diff" : "Previous diff",
          onActivate: () => moveFile(-1),
          compact: true,
        }),
        h(KeyButton, {
          key: "next-diff",
          shortcut: "→",
          label: compact ? "Next diff" : "Next diff",
          onActivate: () => moveFile(1),
          compact: true,
        }),
      );
    }
    footerActions.push(closeAction);

    return paragraph([
      h(Heading, { key: "title" }, "Managed-file changes"),
      h(
        Text,
        { key: "position", color: "cyan", bold: true, wrap: "wrap" },
        `DIFF ${fileIndex + 1}/${files.length} · ${fileLabel} · ${changeStatus}`,
      ),
      h(Text, { key: "path", wrap: "wrap" }, `PATH  ${displayValue(selectedFile.path)}`),
      h(
        Text,
        { key: "scroll-hint", dimColor: true, wrap: "wrap" },
        files.length > 1 ? "↑/↓ scroll · ←/→ change diff · Esc close" : "↑/↓ scroll · Esc close",
      ),
      h(List, {
        key: `managed-file-${fileIndex}`,
        items,
        maxVisible: previewViewportRows(rows),
        renderItem: (item, { focused }) => {
          const row = item.row;
          if (row.kind === "section") {
            return h(Text, { color: "cyan", bold: true }, `── ${row.text} ──`);
          }
          if (row.kind === "note") {
            return h(Text, { dimColor: true, wrap: "wrap" }, `  ${row.text}`);
          }
          return h(Text, { bold: focused }, `│ ${row.text}`);
        },
      }),
      line(footerActions, { key: "footer", flexWrap: "wrap" }),
    ]);
  }

  const items = diffLines.map((label, index) => ({
    id: `manifest-diff-${index}`,
    label,
  }));
  return paragraph([
    h(Heading, { key: "title" }, "Manifest diff"),
    h(
      Text,
      { key: "target", wrap: "wrap" },
      `${displayValue(modalProps.packageName)} · ${displayValue(modalProps.fromVersion)} → ${displayValue(modalProps.toVersion)}`,
    ),
    h(Text, { key: "scroll-hint", dimColor: true }, "↑/↓ scroll · Esc close"),
    items.length > 0
      ? h(List, {
          key: "manifest-diff-list",
          items,
          maxVisible: previewViewportRows(rows),
        })
      : h(Text, { key: "empty", dimColor: true }, "No manifest changes were returned."),
    line([closeAction], { key: "footer" }),
  ]);
}
