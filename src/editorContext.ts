import * as vscode from "vscode";
import { DiagnosticLike } from "./questionEngine";

export interface CodeSelection {
  editor: vscode.TextEditor;
  text: string;
  range: vscode.Range;
  fileName: string;
}

export interface DiagnosticInfo extends DiagnosticLike {
  range: vscode.Range;
}

/** Выделенный в активном редакторе код (или undefined, если ничего не выделено). */
export function getSelection(): CodeSelection | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    return undefined;
  }
  return {
    editor,
    text: editor.document.getText(editor.selection),
    range: new vscode.Range(editor.selection.start, editor.selection.end),
    fileName: editor.document.fileName,
  };
}

/** Ошибки и предупреждения активного файла: сначала ошибки, затем по номеру строки. */
export function getDiagnostics():
  | { editor: vscode.TextEditor; items: DiagnosticInfo[] }
  | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const items = vscode.languages
    .getDiagnostics(editor.document.uri)
    .filter(
      (d) =>
        d.severity === vscode.DiagnosticSeverity.Error ||
        d.severity === vscode.DiagnosticSeverity.Warning
    )
    .sort((a, b) => a.severity - b.severity || a.range.start.line - b.range.start.line)
    .map<DiagnosticInfo>((d) => ({
      line: d.range.start.line + 1,
      message: d.message,
      severity: d.severity === vscode.DiagnosticSeverity.Error ? "error" : "warning",
      source: d.source,
      range: d.range,
    }));

  return { editor, items };
}

/** Подсветка строк, о которых сейчас говорит утка. */
export class Highlighter implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    borderWidth: "0 0 0 3px",
    borderStyle: "solid",
    borderColor: "#F5C518",
    overviewRulerColor: "#F5C518",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });
  private editor?: vscode.TextEditor;

  show(editor: vscode.TextEditor, range: vscode.Range): void {
    this.clear();
    editor.setDecorations(this.decoration, [range]);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    this.editor = editor;
  }

  clear(): void {
    this.editor?.setDecorations(this.decoration, []);
    this.editor = undefined;
  }

  /** Сбрасывает подсветку, если пользователь начал править подсвеченный документ. */
  clearIfDocument(doc: vscode.TextDocument): void {
    if (this.editor?.document === doc) {
      this.clear();
    }
  }

  dispose(): void {
    this.clear();
    this.decoration.dispose();
  }
}
