"use strict";

/* ============================================================
   编程挑战 — 游戏逻辑（原生 JS）
   questions.json：{ "questions": { "easy": [...], "medium": [...], "hard": [...] } }

   每道题：{ "id", "type", "problem", "code", "image", "hint", ...各题型字段 }
   - problem：数组，每个元素 {"text": "...", "bold": true/false}（bold 可省略）。
       默认每个元素单独一行；以下情况会【接在上一段后面（同一行）】：
       上一段以空格结尾（如 "1. "）、这一段以 ：，；、。 ） 等标点开头、或这一段以【单个】空格开头。
       （缩进用 2 个以上空格，例如 "   1. 有人"，会另起一行并保留缩进。）
       也可以直接写成字符串（用 \n 换行）。
   - code：伪代码，字符串数组（每个元素一行，开头的空格就是缩进）
   - image：图片路径（字符串，相对于 index.html）
   - hint：字符串，或字符串数组（多级提示）

   题型：
   - sequence：code 就是【正确顺序】，页面会打乱显示，按 code 判分
   - debug：   answer = 有错误的代码行的【序号数组，从 0 开始】，如 [2, 3]
   - fill：    code 里以 * 开头的行是空格（* 后面的文字不会显示）；
               choices 的前 n 个就是正确答案（n = * 行的数量），页面会打乱选项顺序
   debug 的 answer 也可以直接写【代码行的文字】，如 ["    closeDoor", "    wait 3 seconds"]（重复的行按出现顺序依次对应）。
   答错后会显示正确答案 1 秒，然后自动换一道同难度的新题。
   ============================================================ */

const LEVELS = ["easy", "medium", "hard"];
const LEVEL_ZH = { easy: "简单", medium: "中等", hard: "困难" };
const NUM_ZH = ["一", "二", "三"];
const FEEDBACK_MS = 1800;
const WRONG_MS = 3000;   // 答错后让玩家看正确答案的时间（毫秒）
const LB_KEY = "programmingChallengeLeaderboard";
const DEFAULT_HINT = "仔细想想这道题在考什么。";

/* ---------- 测试用 mock 题目（questions.json 加载成功后会被替换） ---------- */
const emoji = (e) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><text x='80' y='125' font-size='120' text-anchor='middle'>${e}</text></svg>`);

const mockQuestions = {
  easy: [
    {
      id: "e1", type: "sequence", problem: ["按下按钮后 LED 亮起，等待 2 秒后熄灭。", "请把指令排成正确的顺序。"],
      code: ["if buttonPressed:", "    turnOnLED", "    wait 2 seconds", "    turnOffLED"], image: emoji("💡"), hint: DEFAULT_HINT
    },
    {
      id: "e2", type: "fill", problem: ["按下按钮时，LED 应该亮起。", "请选择正确的指令。"],
      code: ["if buttonPressed:", "    *turnOnLED"],
      choices: ["turnOnLED", "turnOffLED", "wait 2 seconds", "turnOnBuzzer"], image: emoji("🔘"), hint: DEFAULT_HINT
    }
  ],
  medium: [
    {
      id: "m1", type: "debug", problem: ["按下按钮 → 门打开 → 等待 3 秒 → 门关闭。", "以下程序有错误。请选择需要修改的代码行。"],
      code: ["if buttonPressed:", "    openDoor", "    closeDoor", "    wait 3 seconds", "else:", "    closeDoor"],
      answer: [2, 3], image: emoji("🚪"), hint: DEFAULT_HINT
    },
    {
      id: "m2", type: "sequence", problem: ["环境昏暗时 LED 亮起，明亮时熄灭。", "请把指令排成正确的顺序。"],
      code: ["if dark:", "    turnOnLED", "else:", "    turnOffLED"], image: emoji("🌙"), hint: DEFAULT_HINT
    }
  ],
  hard: [
    {
      id: "h1", type: "debug", problem: [{ text: "正常情况下红灯和蜂鸣器关闭；" }, { text: "检测到烟雾时两者开启。", bold: true }, { text: "以下程序有错误。请选择需要修改的代码行。" }],
      code: ["turnOffRedLED", "turnOffBuzzer", "if smokeDetected:", "    turnOnRedLED", "    turnOnBuzzer"],
      answer: [0, 1], image: emoji("🔥"), hint: DEFAULT_HINT
    },
    {
      id: "h2", type: "fill", problem: ["检测到烟雾时红灯和蜂鸣器开启，否则关闭。", "请选择正确的指令补全程序。"],
      code: ["if smokeDetected:", "    *turnOnRedLED", "    *turnOnBuzzer", "else:", "    turnOffRedLED", "    turnOffBuzzer"],
      choices: ["turnOnRedLED", "turnOnBuzzer", "turnOffRedLED", "wait 2 seconds"], image: emoji("🚨"), hint: DEFAULT_HINT
    }
  ]
};

/* ---------- 状态 ---------- */
let questionBank = mockQuestions;
const state = {
  name: "", levelIndex: 0, question: null,
  usedIds: { easy: [], medium: [], hard: [] },
  startTime: 0, elapsed: 0, timerId: null,
  attempts: 0, mistakes: 0, hints: 0, hintLevel: 0,
  locked: false, getAnswer: () => null, result: null, nextTimer: null
};

/* ---------- 工具函数 ---------- */
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;   // textContent：JSON 里的内容不会被当成 HTML
  return e;
}
const formatTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const codeLines = (code) => (Array.isArray(code) ? code : String(code || "").split("\n"));
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-" + name).classList.add("active");
}

/* ---------- 题库 ---------- */
async function loadQuestionBank() {
  try {
    const res = await fetch("questions.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const raw = await res.json();
    const data = raw.questions || raw;   // 支持 {"questions": {...}} 或直接 {easy,medium,hard}
    if (!LEVELS.every((l) => Array.isArray(data[l]) && data[l].length)) {
      throw new Error("questions.json 必须包含非空的 easy / medium / hard 数组");
    }
    questionBank = data;
    console.info("已载入 questions.json");
  } catch (err) {
    console.warn("Could not load questions.json.\nUsing mock questions instead.", err);
    questionBank = mockQuestions;
  }
}

function pickQuestion(level) {
  const pool = questionBank[level];
  let fresh = pool.filter((q) => !state.usedIds[level].includes(q.id));
  if (!fresh.length) {
    state.usedIds[level] = [];
    fresh = pool.filter((q) => !state.question || q.id !== state.question.id);
    if (!fresh.length) fresh = pool;
  }
  const q = fresh[Math.floor(Math.random() * fresh.length)];
  state.usedIds[level].push(q.id);
  return q;
}

/* ---------- 游戏流程 ---------- */
function startGame(name) {
  resetState();
  state.name = name;
  $("hud-player").textContent = name;
  showScreen("game");
  startTimer();
  loadQuestion();
}

function resetState() {
  stopTimer();
  clearTimeout(state.nextTimer);
  Object.assign(state, {
    name: "", levelIndex: 0, question: null, usedIds: { easy: [], medium: [], hard: [] },
    startTime: 0, elapsed: 0, attempts: 0, mistakes: 0, hints: 0, hintLevel: 0, locked: false, result: null
  });
  updateHud();
}

function startTimer() {
  state.startTime = Date.now();
  state.timerId = setInterval(() => {
    state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    $("hud-time").textContent = formatTime(state.elapsed);
  }, 250);
}
function stopTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
  if (state.startTime) state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
}

function updateHud() {
  $("hud-time").textContent = formatTime(state.elapsed);
  $("hud-done").textContent = state.attempts;
  $("hud-mistakes").textContent = state.mistakes;
  document.querySelectorAll("#levels li").forEach((li, i) => {
    li.classList.toggle("done", i < state.levelIndex);
    li.classList.toggle("current", i === state.levelIndex);
  });
}

function loadQuestion() {
  clearTimeout(state.nextTimer);
  const level = LEVELS[state.levelIndex];
  state.question = pickQuestion(level);
  state.hintLevel = 0;
  state.locked = false;
  $("feedback").hidden = true;
  $("hint-box").style.display = "none";
  $("hint-box").replaceChildren();
  $("btn-hint").disabled = false;
  $("btn-submit").disabled = false;
  $("question-card").dataset.level = level;
  $("q-watermark").textContent = LEVEL_ZH[level];
  updateHud();
  renderQuestion(state.question);
}

/* ---------- 题目渲染（按 question.type 分发） ---------- */
const renderers = { sequence: renderSequenceQuestion, fill: renderFillQuestion, debug: renderDebugQuestion };

function renderQuestion(q) {
  $("q-title").textContent = q.title || `第${NUM_ZH[state.levelIndex]}题`;
  renderInfo(q);
  renderImages(q);
  const body = $("q-body");
  body.replaceChildren();
  const render = renderers[q.type];
  if (!render) {
    body.append(el("p", "error-text", `未知题型：“${q.type}”`));
    state.getAnswer = () => null;
    state.reveal = () => { };
    return;
  }
  render(q, body);
}

/* 左侧文字：problem 是 {text, bold} 数组；按规则合并成行，支持加粗 */
function problemLines(problem) {
  const isStr = typeof problem === "string";
  const segs = (isStr ? problem.split("\n") : [].concat(problem || [])).map((p) => (typeof p === "string" ? { text: p } : p));
  const lines = [];
  segs.forEach((seg, i) => {
    const prev = i > 0 ? (segs[i - 1].text || "") : "";
    const text = seg.text || "";
    const joins = !isStr && lines.length && (/\s$/.test(prev) || /^[：:，,；;、。)）]/.test(text) || /^ [^ ]/.test(text));
    joins ? lines[lines.length - 1].push(seg) : lines.push([seg]);
  });
  return lines;
}

function renderInfo(q) {
  const box = el("div", "problem");
  problemLines(q.problem).forEach((segs) => {
    const line = el("div", "pline");
    segs.forEach((seg) => line.append(seg.bold ? el("strong", "", seg.text) : document.createTextNode(seg.text || "")));
    box.append(line);
  });
  $("q-info").replaceChildren(box);
}

/* 右下角图片：路径来自 JSON 的 image；找不到就显示占位提示 */
function renderImages(q) {
  const box = $("q-images");
  box.replaceChildren();
  [].concat(q.image || q.images || []).forEach((src) => {
    const img = el("img");
    img.src = src;
    img.alt = "";
    img.onerror = () => {
      console.warn("找不到图片：" + src);
      img.replaceWith(el("div", "img-missing", "图片未找到\n" + src));
    };
    box.append(img);
  });
}

/* debug 的 answer 可以是行号（从 0 开始），也可以是代码行文字；统一转成行号数组 */
function debugAnswerIndices(q) {
  const lines = codeLines(q.code), used = new Set();
  const find = (fn) => lines.findIndex((l, i) => !used.has(i) && fn(l));
  const out = [];
  [].concat(q.answer).forEach((a) => {
    let idx = -1;
    if (typeof a === "number" || /^\d+$/.test(String(a).trim())) idx = Number(a);
    else {
      idx = find((l) => l === a);
      if (idx < 0) idx = find((l) => l.trim() === String(a).trim());
    }
    if (idx < 0 || idx >= lines.length) { console.warn("debug 题答案对不上代码行：", q.id, a); return; }
    used.add(idx); out.push(idx);
  });
  return out.sort((x, y) => x - y);
}

/* 找错误：纯文字伪代码，点击需要修改的行（可多选）；answer = 错误行的序号（从 0 开始） */
function renderDebugQuestion(q, body) {
  const selected = new Set();
  const want = new Set(debugAnswerIndices(q));
  const box = el("div", "pseudo"), rows = [];
  codeLines(q.code).forEach((text, i) => {
    if (!text.trim()) { box.append(el("div", "spacer")); return; }
    const row = el("button", "line", text);
    row.setAttribute("aria-pressed", "false");
    row.onclick = () => {
      selected.has(i) ? selected.delete(i) : selected.add(i);
      row.classList.toggle("selected", selected.has(i));
      row.setAttribute("aria-pressed", String(selected.has(i)));
    };
    rows.push({ row, i });
    box.append(row);
  });
  const tip = el("p", "tip", "点击需要修改的代码行（可以选多行）。");
  body.append(box, tip);
  state.getAnswer = () => (selected.size ? [...selected].sort((x, y) => x - y) : null);
  state.reveal = () => {
    rows.forEach(({ row, i }) => {
      row.disabled = true;
      row.classList.remove("selected");
      row.classList.toggle("answer", want.has(i));
      row.classList.toggle("wrongpick", selected.has(i) && !want.has(i));
      if (want.has(i)) row.append(el("span", "mark", "   ← 需要修改"));
    });
    tip.textContent = "正确答案：绿色标出的行需要修改。";
    tip.classList.add("ok");
  };
}

/* 填空：* 行变成空格，从下方选项里选；点已填的空格可取消 */
function renderFillQuestion(q, body) {
  const lines = codeLines(q.code);
  const choices = q.choices || [];
  const isBlank = (l) => l.trimStart().startsWith("*");
  const n = lines.filter(isBlank).length;
  const chips = shuffle(choices.map((text, idx) => ({ text, idx })));   // idx < n 的才是正确答案
  const slots = Array(n).fill(null);                                    // 每个空格放的 chip.idx
  let active = 0, revealed = false;
  const box = el("div", "pseudo"), pool = el("div", "choices");
  const tip = el("p", "tip", "点击下方选项填入空格；点击已填的空格可以取消。");
  body.append(box, tip, pool);

  const draw = () => {
    box.replaceChildren(); pool.replaceChildren();
    let k = 0;
    lines.forEach((l) => {
      const row = el("div", "fline");
      if (!isBlank(l)) { row.textContent = l || " "; box.append(row); return; }
      const slotNo = k++;
      row.append(document.createTextNode(l.match(/^\s*/)[0]));
      const filled = slots[slotNo] !== null;
      const slot = el("button", "slot" + (filled ? " filled" : "") + (slotNo === active && !revealed ? " active" : "") + (revealed ? " correct" : ""),
        filled ? choices[slots[slotNo]] : "______");
      slot.disabled = revealed;
      slot.onclick = () => { slots[slotNo] = null; active = slotNo; draw(); };
      row.append(slot);
      box.append(row);
    });
    chips.forEach((c) => {
      const btn = el("button", "choice", c.text);
      btn.disabled = revealed || slots.includes(c.idx);
      btn.onclick = () => {
        slots[active] = c.idx;
        const next = slots.indexOf(null);
        if (next >= 0) active = next;
        draw();
      };
      pool.append(btn);
    });
  };
  draw();
  state.getAnswer = () => (slots.includes(null) ? null : slots.map((i) => choices[i]));
  state.reveal = () => {
    revealed = true;
    for (let k = 0; k < n; k++) slots[k] = k;
    tip.textContent = "正确答案：绿色空格里是正确的指令。";
    tip.classList.add("ok");
    draw();
  };
}

/* 排顺序：code 就是正确顺序；页面打乱后用 ↑↓ 调整（以后可换成拖拽） */
function renderSequenceQuestion(q, body) {
  const correct = codeLines(q.code);
  const order = shuffle(correct);
  if (order.length > 1 && order.join("\n") === correct.join("\n")) order.push(order.shift());
  let revealed = false;
  const list = el("ol", "seq-list");
  const tip = el("p", "tip", "用 ↑ ↓ 按钮调整顺序。");
  const draw = () => {
    list.replaceChildren();
    order.forEach((text, i) => {
      const li = el("li", "seq-item" + (revealed ? " correct" : ""));
      li.append(el("span", "idx", String(i + 1)), el("span", "label", text));
      if (!revealed) {
        const up = el("button", "mini", "↑"), down = el("button", "mini", "↓");
        up.setAttribute("aria-label", "上移"); down.setAttribute("aria-label", "下移");
        up.disabled = i === 0; down.disabled = i === order.length - 1;
        up.onclick = () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); };
        down.onclick = () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); };
        li.append(up, down);
      }
      list.append(li);
    });
  };
  draw();
  body.append(list, tip);
  state.getAnswer = () => order.slice();
  state.reveal = () => {
    order.splice(0, order.length, ...correct);
    revealed = true;
    tip.textContent = "正确答案：上面是正确的顺序。";
    tip.classList.add("ok");
    draw();
  };
}

/* ---------- 判分 ---------- */
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
const checkers = {
  sequence: (q, a) => sameList(a, codeLines(q.code)),
  fill: (q, a) => {
    const n = codeLines(q.code).filter((l) => l.trimStart().startsWith("*")).length;
    return sameList(a, (q.choices || []).slice(0, n));
  },
  debug: (q, a) => sameList(a, debugAnswerIndices(q))
};

function submitAnswer() {
  if (state.locked) return;
  const q = state.question, answer = state.getAnswer();
  if (answer === null) {
    flashCard("shake");
    return;
  }
  state.locked = true;
  $("btn-submit").disabled = true;
  $("btn-hint").disabled = true;
  state.attempts++;
  (checkers[q.type] && checkers[q.type](q, answer)) ? handleCorrect() : handleIncorrect();
  updateHud();
}

function handleCorrect() {
  const last = state.levelIndex === LEVELS.length - 1;
  showFeedback(true, "✓ 回答正确！", last ? "全部关卡完成！" : "正在进入下一关...");
  flashCard("pop");
  state.nextTimer = setTimeout(() => {
    state.levelIndex++;
    state.levelIndex >= LEVELS.length ? finishGame() : loadQuestion();
  }, FEEDBACK_MS);
}

function handleIncorrect() {
  state.mistakes++;
  state.reveal();                                   // 在题目里直接显示正确答案
  showFeedback(false, "✗ 差一点！", "正确答案已显示，马上换一道同难度的新题…", true);
  flashCard("shake");
  state.nextTimer = setTimeout(loadQuestion, WRONG_MS);
}

function showFeedback(ok, title, sub, bar = false) {
  const fb = $("feedback");
  fb.className = "feedback " + (ok ? "ok" : "bad") + (bar ? " bar" : "");
  fb.querySelector(".fb-title").textContent = title;
  fb.querySelector(".fb-sub").textContent = sub;
  fb.hidden = false;
  if (bar) fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function flashCard(cls) {
  const c = $("question-card");
  c.classList.remove("shake", "pop");
  void c.offsetWidth;
  c.classList.add(cls);
}

/* ---------- 提示（字符串或数组） ---------- */
function getHints(q) {
  if (Array.isArray(q.hint)) return q.hint;
  return [q.hint || DEFAULT_HINT];
}

function showHint() {
  if (state.locked) return;
  const hints = getHints(state.question);
  if (state.hintLevel >= hints.length) return;
  state.hintLevel++;
  state.hints++;
  const box = $("hint-box");
  box.style.display = "block";
  box.replaceChildren();
  hints.slice(0, state.hintLevel).forEach((h, i) => {
    const p = el("div");
    p.append(el("b", "", hints.length > 1 ? `提示 ${i + 1}：` : "提示："), document.createTextNode(h));
    box.append(p);
  });
  if (state.hintLevel >= hints.length) $("btn-hint").disabled = true;
}

/* ---------- 排行榜（目前存在本机浏览器 localStorage，以后可改成服务器） ---------- */
function loadBoard() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch (e) { return []; }
}
function saveBoard(list) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(list)); }
  catch (e) { console.warn("无法保存排行榜（浏览器禁止了本地存储）。", e); }
}
const byRank = (a, b) => a.time - b.time || a.mistakes - b.mistakes || a.hints - b.hints || a.at - b.at;

function addToBoard(result) {
  const entry = { ...result, at: Date.now() };
  const list = loadBoard().concat(entry).sort(byRank).slice(0, 100);
  saveBoard(list);
  return entry;
}

function renderBoard(me) {
  const list = loadBoard().sort(byRank);
  const body = $("board-body");
  body.replaceChildren();
  const medals = ["🥇", "🥈", "🥉"];
  const addRow = (e, rank) => {
    const tr = el("tr", me && e.at === me.at ? "me" : "");
    [medals[rank] || String(rank + 1), e.name, formatTime(e.time), e.mistakes, e.hints]
      .forEach((v) => tr.append(el("td", "", String(v))));
    body.append(tr);
  };
  const TOP = 8;
  list.slice(0, TOP).forEach(addRow);
  const myRank = me ? list.findIndex((e) => e.at === me.at) : -1;
  if (myRank >= TOP) {
    const gap = el("tr", "gap"); const td = el("td", "", "…"); td.colSpan = 5; gap.append(td); body.append(gap);
    addRow(list[myRank], myRank);
  }
  if (!list.length) { const tr = el("tr"); const td = el("td", "", "还没有成绩"); td.colSpan = 5; tr.append(td); body.append(tr); }
}

/* ---------- 结束 / 重置 ---------- */
function finishGame() {
  stopTimer();
  updateHud();
  state.result = { name: state.name, time: state.elapsed, mistakes: state.mistakes, hints: state.hints };
  $("complete-msg").textContent = `做得好，${state.name}！`;
  $("res-time").textContent = formatTime(state.result.time);
  $("res-mistakes").textContent = state.result.mistakes;
  $("res-hints").textContent = state.result.hints;
  console.log("Result:", state.result);
  renderBoard(addToBoard(state.result));
  showScreen("complete");
}

function resetGame() {
  resetState();
  $("input-name").value = "";
  showScreen("start");
}

/* ---------- 事件 ---------- */
function tryStartFromName() {
  const name = $("input-name").value.trim();
  if (!name) { $("name-error").hidden = false; $("input-name").focus(); return; }
  $("name-error").hidden = true;
  startGame(name);
}

document.addEventListener("DOMContentLoaded", () => {
  loadQuestionBank();
  $("btn-start").onclick = () => { showScreen("name"); $("input-name").focus(); };
  $("btn-name-start").onclick = tryStartFromName;
  $("input-name").addEventListener("keydown", (e) => { if (e.key === "Enter") tryStartFromName(); });
  $("input-name").addEventListener("input", () => { $("name-error").hidden = true; });
  $("btn-submit").onclick = submitAnswer;
  $("btn-hint").onclick = showHint;
  $("btn-again").onclick = resetGame;
});
