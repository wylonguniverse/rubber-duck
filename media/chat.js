(function () {
  const vscode = acquireVsCodeApi();

  const chat = document.getElementById("chat");
  const duck = document.getElementById("duck");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Все сообщения проходят через одну очередь, чтобы порядок не нарушался,
  // пока утка «думает». generation нужен, чтобы сброс чата отменял старые задачи.
  let queue = Promise.resolve();
  let generation = 0;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function scrollDown() {
    chat.scrollTop = chat.scrollHeight;
  }

  function createBubble(role) {
    const el = document.createElement("div");
    el.className = "bubble " + role;
    chat.appendChild(el);
    return el;
  }

  function fillBubble(el, msg) {
    if (msg.role === "context") {
      const title = document.createElement("div");
      title.className = "context-title";
      title.textContent = msg.text;
      el.appendChild(title);
      if (msg.code) {
        const pre = document.createElement("pre");
        pre.textContent = msg.code;
        el.appendChild(pre);
      }
    } else {
      el.textContent = msg.text;
    }
  }

  function typingIndicator() {
    const dots = document.createElement("span");
    dots.className = "dots";
    for (let i = 0; i < 3; i++) {
      dots.appendChild(document.createElement("i"));
    }
    return dots;
  }

  function enqueue(task) {
    const gen = generation;
    queue = queue.then(() => (gen === generation ? task(gen) : undefined));
  }

  function render(msg, live) {
    if (msg.role === "duck" && live) {
      enqueue(async (gen) => {
        const indicator = createBubble("duck");
        indicator.classList.add("typing");
        indicator.appendChild(typingIndicator());
        scrollDown();
        duck.classList.add("thinking");
        await wait(reduceMotion ? 0 : Math.min(400 + msg.text.length * 12, 1500));
        duck.classList.remove("thinking");
        indicator.remove();
        if (gen !== generation) {
          return;
        }
        const bubble = createBubble("duck");
        bubble.textContent = msg.text;
        scrollDown();
      });
    } else {
      enqueue(() => {
        fillBubble(createBubble(msg.role), msg);
        scrollDown();
      });
    }
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data.type === "restore") {
      generation++;
      queue = Promise.resolve();
      duck.classList.remove("thinking");
      chat.textContent = "";
      data.messages.forEach((m) => render(m, false));
    } else if (data.type === "message") {
      render(data.message, true);
    }
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      vscode.postMessage({ type: button.dataset.action });
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      return;
    }
    vscode.postMessage({ type: "user", text });
    input.value = "";
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  vscode.postMessage({ type: "ready" });
})();
