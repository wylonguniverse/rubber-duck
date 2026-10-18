/**
 * Логика подбора вопросов. Не зависит от VS Code API,
 * поэтому её легко тестировать отдельно.
 */

interface Rule {
  keywords: RegExp;
  questions: string[];
}

const RULES: Rule[] = [
  {
    keywords: /undefined|null|NaN|None|не определ|пуст(ой|ая|ое|ые)/i,
    questions: [
      "Где эта переменная получает своё значение?",
      "Всегда ли код, который задаёт значение, выполняется раньше, чем оно понадобится?",
    ],
  },
  {
    keywords: /цикл|loop|\bfor\b|\bwhile\b|итерац|бесконечн|зациклил/i,
    questions: [
      "С какого значения начинается счётчик и как он меняется на каждом шаге?",
      "Когда именно условие выхода из цикла становится ложным?",
    ],
  },
  {
    keywords: /async|await|промис|promise|callback|колбэк|асинхрон/i,
    questions: [
      "В каком порядке выполняются эти операции на самом деле?",
      "Ты уверен, что дождался результата, прежде чем его использовать?",
    ],
  },
  {
    keywords: /массив|индекс|array|index|за границ|out of range|список/i,
    questions: [
      "Какой длины массив в момент ошибки и к какому индексу ты обращаешься?",
      "Что произойдёт, если массив окажется пустым?",
    ],
  },
  {
    keywords: /ошибк|exception|исключени|упал|падает|crash|traceback|stack/i,
    questions: [
      "Что именно написано в тексте ошибки? Прочитай его мне целиком.",
      "На какой строке происходит падение и как программа туда попала?",
    ],
  },
  {
    keywords: /иногда|случайн|нестабильн|плавающ|flaky|не всегда/i,
    questions: [
      "Чем отличаются запуски, когда всё работает, и когда нет?",
      "Есть ли здесь что-то, что зависит от времени, порядка или внешних данных?",
    ],
  },
  {
    keywords: /раньше работал|вчера работал|сломал|после обновлен|перестал/i,
    questions: [
      "Что изменилось с того момента, когда всё работало?",
      "Можно ли откатывать изменения по одному и смотреть, когда проблема исчезнет?",
    ],
  },
  {
    keywords: /не работает|не раб|ничего не происходит|не срабатывает/i,
    questions: [
      "Что ты ожидал увидеть?",
      "А что произошло вместо этого?",
    ],
  },
];

const FALLBACK: string[] = [
  "Что ты ожидал получить?",
  "А что получилось на самом деле?",
  "Расскажи шаг за шагом, что делает проблемный участок кода.",
  "Какие входные данные ты подаёшь? Они точно такие, как ты думаешь?",
  "Что ты уже пробовал, чтобы это исправить?",
  "Как проверить твою догадку одной строкой вывода или точкой останова?",
];

const SUMMARY_PROMPT =
  "Мы уже немного поговорили. Попробуй пересказать всю проблему одним предложением: что должно происходить, что происходит и где расхождение?";

const EXHAUSTED =
  "Кря... Кажется, ты уже всё мне объяснил. Что думаешь теперь? Если нашёл решение, напиши «понял».";

const CELEBRATIONS = [
  "Кря-кря! Ты сам нашёл ответ, я только слушала. Напиши, когда появится следующая проблема.",
  "Отличная работа! Вот поэтому утки и работают: вслух всё становится понятнее.",
  "Ура! Проблема решена. Можно начать новую сессию, когда понадобится.",
];

const SOLVED = /(понял|поняла|нашёл|нашел|нашла|решил|решила|разобрал|got it|solved)/i;
const NOT_SOLVED = /не\s+(понял|поняла|нашёл|нашел|нашла|решил|решила|разобрал)/i;

export function isSolved(text: string): boolean {
  return SOLVED.test(text) && !NOT_SOLVED.test(text);
}

export class DuckSession {
  private asked = new Set<string>();
  private queue: string[] = [];
  private turns = 0;

  /** Ответ утки на реплику пользователя. */
  reply(userText: string): { text: string; solved: boolean } {
    if (isSolved(userText)) {
      const text = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)];
      return { text, solved: true };
    }

    this.turns++;
    if (this.turns % 6 === 0) {
      return { text: SUMMARY_PROMPT, solved: false };
    }

    const matched = RULES.filter((r) => r.keywords.test(userText)).flatMap((r) => r.questions);
    const pool = [...matched, ...this.queue, ...FALLBACK].filter((q) => !this.asked.has(q));
    const text = pool[0] ?? EXHAUSTED;
    this.asked.add(text);
    return { text, solved: false };
  }

  /**
   * Переключает утку на конкретный фрагмент кода или ошибку:
   * возвращает первый вопрос, остальные ставит в очередь.
   */
  focusOn(questions: string[]): string {
    const [first, ...rest] = questions;
    this.queue = rest;
    this.asked.add(first);
    return first;
  }
}

/** Вопросы о выделенном фрагменте: подбираются по тому, что в нём найдено. */
export function questionsForCode(code: string): string[] {
  const questions: string[] = [
    "Объясни мне, что делает этот кусок кода, строчка за строчкой. Представь, что я никогда не видела программирования.",
  ];

  if (/\bfunction\b|=>|\bdef\b|\bfunc\b/.test(code)) {
    questions.push("Что функция принимает на вход и что должна вернуть? Всегда ли она возвращает значение?");
  }
  if (/\b(for|while)\b|\.forEach\(|\.map\(/.test(code)) {
    questions.push("С чего начинается обход и когда он остановится? Что будет на последней итерации?");
  }
  if (/\bif\b|\belse\b|\bswitch\b|\?[^?:]+:/.test(code)) {
    questions.push("Какие условия здесь проверяются? Что произойдёт, если ни одно из них не выполнится?");
  }
  if (/\basync\b|\bawait\b|\.then\(|Promise|asyncio/.test(code)) {
    questions.push("В каком порядке выполняются операции? В каком месте ты ждёшь результат?");
  }
  if (/\btry\b|\bcatch\b|\bexcept\b|\brescue\b/.test(code)) {
    questions.push("Какие ошибки ты ожидаешь здесь поймать? Что происходит после перехвата?");
  }
  if (/\bnull\b|\bundefined\b|\bNone\b|\bnil\b/.test(code)) {
    questions.push("Может ли какое-то значение здесь оказаться пустым? Что тогда случится дальше?");
  }
  if (code.split("\n").length > 15) {
    questions.push("Кусок довольно длинный. Можно ли разбить его на 2-3 части и объяснить каждую отдельно?");
  }

  return questions;
}

export interface DiagnosticLike {
  line: number;
  message: string;
  severity: "error" | "warning";
  source?: string;
}

export function questionForDiagnostic(d: DiagnosticLike): string {
  const clean = d.message.replace(/\s+/g, " ").trim();
  const msg = clean.length > 160 ? clean.slice(0, 157) + "…" : clean;

  if (d.severity === "error") {
    return `Я вижу ошибку на строке ${d.line}: «${msg}». Как думаешь, почему ${d.source ?? "компилятор"} недоволен именно здесь?`;
  }
  return `На строке ${d.line} есть предупреждение: «${msg}». Это настоящая проблема или его можно игнорировать? Почему ты так думаешь?`;
}
