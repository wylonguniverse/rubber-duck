import * as vscode from "vscode";
import { DuckViewProvider } from "./duckViewProvider";
import { Highlighter } from "./editorContext";

export function activate(context: vscode.ExtensionContext): void {
  const highlighter = new Highlighter();
  const provider = new DuckViewProvider(context.extensionUri, highlighter);

  context.subscriptions.push(
    highlighter,

    vscode.window.registerWebviewViewProvider(DuckViewProvider.viewType, provider, {
      // Чат не пропадает, когда пользователь переключается на другую панель.
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand("rubberDuck.start", () => provider.start()),
    vscode.commands.registerCommand("rubberDuck.explainSelection", () => provider.explainSelection()),
    vscode.commands.registerCommand("rubberDuck.askDiagnostics", () => provider.askAboutDiagnostics()),
    vscode.commands.registerCommand("rubberDuck.reset", () => provider.reset()),

    // Как только пользователь правит подсвеченный файл, подсветка снимается.
    vscode.workspace.onDidChangeTextDocument((e) => highlighter.clearIfDocument(e.document))
  );
}

export function deactivate(): void {}
