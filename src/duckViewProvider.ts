import * as path from "path";
import * as vscode from "vscode";
import { getDiagnostics, getSelection, Highlighter } from "./editorContext";
import {
  DuckSession,
  questionForDiagnostic,
  questionsForCode,
} from "./questionEngine";

interface ChatMessage {
  role: "duck" | "user" | "context";
  text: string;
  code?: string;
}

export class DuckViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "rubberDuck.chatView";

  private view?: vscode.WebviewView;
  private ready = false;
  private transcript: ChatMessage[] = [];
  private session = new DuckSession();
  private diagCursor = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly highlighter: Highlighter
  ) {}

  // ---------- жизненный цикл Webview ----------

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.ready = false;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    view.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
    });
  }

  private onMessage(msg: { type: string; text?: string }): void {
    switch (msg.type) {
      case "ready":
        this.ready = true;
        if (this.transcript.length === 0) {
          this.greet();
        } else {
          this.view?.webview.postMessage({ type: "restore", messages: this.transcript });
        }
        break;
      case "user":
        if (msg.text?.trim()) {
          this.handleUserText(msg.text.trim());
        }
        break;
      case "explainSelection":
        void this.explainSelection();
        break;
      case "askDiagnostics":
        void this.askAboutDiagnostics();
        break;
      case "reset":
        this.reset();
        break;
    }
  }

  // ---------- публичные действия (команды) ----------

  async start(): Promise<void> {
    await this.reveal();
  }

  reset(): void {
    this.session = new DuckSession();
    this.transcript = [];
    this.diagCursor = 0;
    this.highlighter.clear();
    if (this.ready) {
      this.view?.webview.postMessage({ type: "restore", messages: [] });
      this.greet();
    }
  }

  async explainSelection(): Promise<void> {
    // Читаем выделение до того, как фокус уйдёт в боковую панель.
    const sel = getSelection();
    await this.reveal();

    if (!sel) {
      this.post({
        role: "duck",
        text: "Сначала выдели в редакторе кусок кода, о котором хочешь рассказать, а потом нажми эту кнопку ещё раз.",
      });
      return;
    }

    this.highlighter.show(sel.editor, sel.range);

    const firstLine = sel.range.start.line + 1;
    const lastLine = sel.range.end.line + 1;
    const lines = sel.text.split("\n");
    const preview = lines
      .slice(0, 6)
      .map((l) => (l.length > 90 ? l.slice(0, 87) + "…" : l))
      .join("\n");

    this.post({
      role: "context",
      text: `${path.basename(sel.fileName)}, строки ${firstLine}–${lastLine}`,
      code: lines.length > 6 ? preview + "\n…" : preview,
    });

    const question = this.session.focusOn(questionsForCode(sel.text));
    this.post({ role: "duck", text: question });
  }

  async askAboutDiagnostics(): Promise<void> {
    const found = getDiagnostics();
    await this.reveal();

    if (!found) {
      this.post({ role: "duck", text: "Открой файл в редакторе, и я посмотрю, нет ли в нём ошибок." });
      return;
    }
    if (found.items.length === 0) {
      this.post({
        role: "duck",
        text: "В этом файле нет ни ошибок, ни предупреждений. Значит, дело в поведении программы. Что ты ожидал и что получилось?",
      });
      return;
    }

    const index = this.diagCursor % found.items.length;
    const item = found.items[index];
    this.diagCursor++;

    this.highlighter.show(found.editor, item.range);
    this.post({
      role: "context",
      text: `Ошибки и предупреждения: ${index + 1} из ${found.items.length}, строка ${item.line}`,
    });
    this.post({ role: "duck", text: questionForDiagnostic(item) });
  }

  // ---------- внутренняя кухня ----------

  private handleUserText(text: string): void {
    this.post({ role: "user", text });
    const reply = this.session.reply(text);
    this.post({ role: "duck", text: reply.text });

    if (reply.solved) {
      this.session = new DuckSession();
      this.diagCursor = 0;
      this.highlighter.clear();
    }
  }

  private greet(): void {
    const name = vscode.workspace.getConfiguration("rubberDuck").get<string>("duckName", "Кряк");
    this.post({
      role: "duck",
      text: `Кря! Меня зовут ${name}. Что сегодня не работает? Опиши проблему своими словами или выдели код и нажми «Выделенный код».`,
    });
  }

  /** Сообщение сохраняется в историю и, если панель готова, сразу отправляется в Webview. */
  private post(message: ChatMessage): void {
    this.transcript.push(message);
    if (this.ready) {
      this.view?.webview.postMessage({ type: "message", message });
    }
  }

  private async reveal(): Promise<void> {
    await vscode.commands.executeCommand(`${DuckViewProvider.viewType}.focus`);
  }

  private getHtml(webview: vscode.Webview): string {
    const media = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", file));
    const nonce = createNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${media("chat.css")}">
  <title>Резиновая утка</title>
</head>
<body>
  <header class="head">
    <img id="duck" class="duck" src="${media("duck.svg")}" alt="">
    <div>
      <div class="title">Резиновая утка</div>
      <div class="subtitle">Объясни ей проблему вслух, она задаст вопросы</div>
    </div>
  </header>

  <main id="chat" class="chat" aria-live="polite"></main>

  <div class="actions">
    <button type="button" data-action="explainSelection">Выделенный код</button>
    <button type="button" data-action="askDiagnostics">Ошибки в файле</button>
    <button type="button" data-action="reset">Новая сессия</button>
  </div>

  <form id="form" class="composer">
    <textarea id="input" rows="2" placeholder="Опиши проблему… (Enter — отправить, Shift+Enter — новая строка)" aria-label="Сообщение утке"></textarea>
    <button type="submit" class="send">Отправить</button>
  </form>

  <script nonce="${nonce}" src="${media("chat.js")}"></script>
</body>
</html>`;
  }
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
