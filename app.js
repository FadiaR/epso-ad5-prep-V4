// EPSO AD5 Digital Prep – single-file app.js (no dependencies)
// Local storage schema (versioned)
const STORE_KEY = "epso_digital_progress_v1";

const FIVE_HOURS_SECONDS = 5 * 60 * 60;

function todayISO() {
  const d = new Date();
  const tzOff = d.getTimezoneOffset() * 60 * 1000;
  const local = new Date(d.getTime() - tzOff);
  return local.toISOString().slice(0, 10);
}

function fmtHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
function fmtHM(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { days: {}, answers: [] };
    const obj = JSON.parse(raw);
    // minimal defensive defaults
    if (!obj.days) obj.days = {};
    if (!obj.answers) obj.answers = [];
    return obj;
  } catch {
    return { days: {}, answers: [] };
  }
}

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function ensureDay(store, dayISO) {
  if (!store.days[dayISO]) {
    store.days[dayISO] = { seconds: 0, sessions: 0, updatedAt: Date.now() };
  }
  return store.days[dayISO];
}

function addTimeToDay(dayISO, secondsToAdd) {
  const store = loadStore();
  const day = ensureDay(store, dayISO);
  day.seconds = Math.max(0, day.seconds + Math.floor(secondsToAdd));
  day.sessions += 1;
  day.updatedAt = Date.now();
  saveStore(store);
}

function clearDay(dayISO) {
  const store = loadStore();
  delete store.days[dayISO];
  // keep answers; they are separate stats. (User can clear all if needed)
  saveStore(store);
}

function clearAll() {
  localStorage.removeItem(STORE_KEY);
}

// -------- Bank loading --------
let BANK = [];
let THEMES = [];

async function loadBank() {
  const res = await fetch("./digital.v1.0.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load digital.v1.0.json");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Bank JSON must be an array of question objects.");
  // minimal validation & normalisation
  BANK = data
    .filter(q => q && typeof q.q === "string" && Array.isArray(q.opts) && q.opts.length === 4 && typeof q.a === "number")
    .map(q => ({
      theme: q.theme || "Problem solving",
      q: q.q.trim(),
      opts: q.opts.map(String),
      a: q.a,
      exp: (q.exp || "").trim()
    }));
  THEMES = Array.from(new Set(BANK.map(q => q.theme))).sort();
  document.getElementById("bankCount").textContent = String(BANK.length);
  // populate selects
  const practiceTheme = document.getElementById("practiceTheme");
  practiceTheme.innerHTML = `<option value="ALL">All themes</option>` + THEMES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -------- Navigation --------
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const view = btn.dataset.view;
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`view-${view}`).classList.remove("hidden");

    if (view === "progress") refreshProgressUI();
  });
});

// -------- Practice mode --------
let practiceIndex = 0;
let practicePool = [];

function buildPracticePool() {
  const theme = document.getElementById("practiceTheme").value;
  practicePool = BANK.filter(q => theme === "ALL" ? true : q.theme === theme);
  if (document.getElementById("practiceShuffle").value === "ON") {
    practicePool = shuffle([...practicePool]);
  }
  practiceIndex = 0;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderQuestion(container, qObj, onAnswered) {
  container.innerHTML = "";
  const qEl = document.createElement("div");
  qEl.className = "qtext";
  qEl.textContent = qObj.q;

  const optsEl = document.createElement("div");
  optsEl.className = "opts";

  let locked = false;
  qObj.opts.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.type = "button";
    b.textContent = `${String.fromCharCode(65 + idx)}. ${opt}`;
    b.addEventListener("click", () => {
      if (locked) return;
      locked = true;
      const correct = idx === qObj.a;
      b.classList.add(correct ? "correct" : "wrong");
      // mark correct option
      optsEl.querySelectorAll(".opt").forEach((btn, j) => {
        if (j === qObj.a) btn.classList.add("correct");
        btn.disabled = true;
      });

      const expl = document.createElement("div");
      expl.className = "expl";
      expl.textContent = qObj.exp ? qObj.exp : "Correct option reflects best practice under EPSO-style judgement.";
      container.appendChild(expl);

      onAnswered?.(correct, qObj.theme);
    });
    optsEl.appendChild(b);
  });

  container.appendChild(qEl);
  container.appendChild(optsEl);
}

function nextPracticeQuestion() {
  if (!BANK.length) return;
  if (!practicePool.length || practiceIndex >= practicePool.length) buildPracticePool();
  const qObj = practicePool[practiceIndex++];
  const container = document.getElementById("practiceQA");
  renderQuestion(container, qObj, (correct, theme) => logAnswer(theme, correct));
}

document.getElementById("practiceNew").addEventListener("click", nextPracticeQuestion);
document.getElementById("practiceTheme").addEventListener("change", () => {
  buildPracticePool();
  nextPracticeQuestion();
});
document.getElementById("practiceShuffle").addEventListener("change", () => {
  buildPracticePool();
  nextPracticeQuestion();
});

// -------- Exam mode --------
let exam = {
  running: false,
  timeLeft: 30 * 60,
  timerId: null,
  questions: [],
  idx: 0,
  correct: 0
};

function setExamButtons(running) {
  document.getElementById("examStart").disabled = running;
  document.getElementById("examReset").disabled = !running && exam.idx === 0 && exam.questions.length === 0;
}

function examTick() {
  exam.timeLeft -= 1;
  document.getElementById("examTime").textContent = fmtMMSS(exam.timeLeft);
  if (exam.timeLeft <= 0) endExam();
}
function fmtMMSS(s) {
  const m = Math.floor(Math.max(0, s) / 60);
  const ss = String(Math.max(0, s) % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

function startExam() {
  if (!BANK.length) return;
  exam.running = true;
  exam.timeLeft = 30 * 60;
  exam.idx = 0;
  exam.correct = 0;
  exam.questions = shuffle([...BANK]).slice(0, 40);
  document.getElementById("examReset").disabled = false;
  document.getElementById("examStart").disabled = true;

  document.getElementById("examTime").textContent = "30:00";
  document.getElementById("examProgressPill").textContent = "0 / 40";
  renderExamQuestion();

  exam.timerId = setInterval(examTick, 1000);
}

function endExam() {
  if (!exam.running) return;
  exam.running = false;
  if (exam.timerId) clearInterval(exam.timerId);
  exam.timerId = null;

  const examArea = document.getElementById("examArea");
  const scorePct = Math.round((exam.correct / 40) * 100);
  examArea.innerHTML = `
    <div class="card inner">
      <div class="card-title">Exam finished</div>
      <div class="card-subtitle">Score: <b>${exam.correct} / 40</b> (${scorePct}%)</div>
      <div class="divider"></div>
      <div class="muted">Tip: Re-run exam mode with mixed themes. Keep pace: 45s per question average.</div>
    </div>
  `;
  document.getElementById("examStart").disabled = false;
}

function renderExamQuestion() {
  const examArea = document.getElementById("examArea");
  if (exam.idx >= exam.questions.length) {
    endExam();
    return;
  }
  const qObj = exam.questions[exam.idx];
  document.getElementById("examProgressPill").textContent = `${exam.idx} / 40`;

  renderQuestion(examArea, qObj, (correct, theme) => {
    logAnswer(theme, correct);
    if (correct) exam.correct += 1;
    exam.idx += 1;
    document.getElementById("examProgressPill").textContent = `${exam.idx} / 40`;
    setTimeout(renderExamQuestion, 250);
  });
}

function resetExam() {
  if (exam.timerId) clearInterval(exam.timerId);
  exam = { running: false, timeLeft: 30*60, timerId: null, questions: [], idx: 0, correct: 0 };
  document.getElementById("examTime").textContent = "30:00";
  document.getElementById("examProgressPill").textContent = "0 / 40";
  document.getElementById("examArea").innerHTML = "";
  document.getElementById("examReset").disabled = true;
  document.getElementById("examStart").disabled = false;
}

document.getElementById("examStart").addEventListener("click", startExam);
document.getElementById("examReset").addEventListener("click", resetExam);

// -------- Answer logging / stats --------
function logAnswer(theme, correct) {
  const store = loadStore();
  store.answers.push({
    t: Date.now(),
    theme,
    correct: !!correct
  });
  // Keep last 10k answers to stay fast
  if (store.answers.length > 10000) store.answers = store.answers.slice(store.answers.length - 10000);
  saveStore(store);
}

function lastNDaysAnswers(nDays) {
  const store = loadStore();
  const cutoff = Date.now() - nDays * 24 * 60 * 60 * 1000;
  return store.answers.filter(a => a.t >= cutoff);
}

function computeThemeStats(nDays=7) {
  const ans = lastNDaysAnswers(nDays);
  const byTheme = new Map();
  ans.forEach(a => {
    const o = byTheme.get(a.theme) || { total: 0, correct: 0 };
    o.total += 1;
    o.correct += a.correct ? 1 : 0;
    byTheme.set(a.theme, o);
  });
  // ensure all themes appear
  THEMES.forEach(t => { if (!byTheme.has(t)) byTheme.set(t, { total: 0, correct: 0 }); });
  return Array.from(byTheme.entries()).map(([theme, v]) => ({
    theme,
    total: v.total,
    correct: v.correct,
    pct: v.total ? Math.round((v.correct / v.total) * 100) : 0
  })).sort((a,b) => a.theme.localeCompare(b.theme));
}

// -------- Timer + daily gauges --------
let timerState = {
  running: false,
  startedAt: null,
  accumulated: 0, // seconds accumulated for the current session
  tickId: null
};

function setTimerButtons(running) {
  document.getElementById("timerStart").disabled = running;
  document.getElementById("timerPause").disabled = !running;
  document.getElementById("timerStop").disabled = !running;
}

function getSelectedTrainingDay() {
  const el = document.getElementById("trainingDay");
  return el.value || todayISO();
}

function timerStart() {
  if (timerState.running) return;
  timerState.running = true;
  timerState.startedAt = Date.now();
  timerState.tickId = setInterval(() => {
    const now = Date.now();
    const sec = timerState.accumulated + Math.floor((now - timerState.startedAt) / 1000);
    document.getElementById("sessionTime").textContent = fmtHMS(sec);
  }, 250);
  setTimerButtons(true);
}

function timerPause() {
  if (!timerState.running) return;
  const now = Date.now();
  timerState.accumulated += Math.floor((now - timerState.startedAt) / 1000);
  timerState.startedAt = null;
  timerState.running = false;
  if (timerState.tickId) clearInterval(timerState.tickId);
  timerState.tickId = null;
  document.getElementById("sessionTime").textContent = fmtHMS(timerState.accumulated);
  setTimerButtons(false);
}

function timerStopAndSave() {
  // pause to compute final seconds
  if (timerState.running) timerPause();
  const day = getSelectedTrainingDay();
  const seconds = timerState.accumulated;
  if (seconds > 0) addTimeToDay(day, seconds);
  // reset session
  timerState.accumulated = 0;
  document.getElementById("sessionTime").textContent = "00:00:00";
  refreshProgressUI();
}

function addManualMinutes() {
  const minutes = Number(document.getElementById("manualMinutes").value || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const day = getSelectedTrainingDay();
  addTimeToDay(day, Math.floor(minutes * 60));
  document.getElementById("manualMinutes").value = "";
  refreshProgressUI();
}

document.getElementById("timerStart").addEventListener("click", timerStart);
document.getElementById("timerPause").addEventListener("click", timerPause);
document.getElementById("timerStop").addEventListener("click", timerStopAndSave);
document.getElementById("manualAdd").addEventListener("click", addManualMinutes);

// -------- Progress UI --------
function refreshProgressUI() {
  const store = loadStore();
  const dayISO = document.getElementById("progressDay").value || todayISO();
  document.getElementById("progressDay").value = dayISO;

  const day = ensureDay(store, dayISO);
  const pct = Math.min(100, Math.round((day.seconds / FIVE_HOURS_SECONDS) * 100));
  document.getElementById("dayTotal").textContent = fmtHM(day.seconds);
  document.getElementById("dayGaugePct").textContent = `${pct}%`;
  document.getElementById("dayGaugeFill").style.width = `${pct}%`;

  // days list (sorted desc)
  const days = Object.entries(store.days)
    .map(([d, v]) => ({ day: d, ...v }))
    .sort((a,b) => b.day.localeCompare(a.day));

  const list = document.getElementById("daysList");
  if (!days.length) {
    list.innerHTML = `<div class="muted">No training days saved yet.</div>`;
  } else {
    list.innerHTML = days.map(d => `
      <div class="day-item" data-day="${d.day}">
        <div>
          <div class="day-date">${d.day}</div>
          <div class="day-meta">${d.sessions} session(s)</div>
        </div>
        <div class="day-meta">${fmtHM(d.seconds)}</div>
      </div>
    `).join("");
    list.querySelectorAll(".day-item").forEach(el => {
      el.addEventListener("click", () => {
        const day = el.dataset.day;
        document.getElementById("progressDay").value = day;
        document.getElementById("trainingDay").value = day;
        refreshProgressUI();
      });
    });
  }

  // theme stats
  const stats = computeThemeStats(7);
  const statsEl = document.getElementById("themeStats");
  statsEl.innerHTML = stats.map(s => `
    <div class="stat-row">
      <div><b>${escapeHtml(s.theme)}</b></div>
      <div class="day-meta">${s.pct}% · ${s.correct}/${s.total}</div>
    </div>
  `).join("");
}

document.getElementById("progressDay").addEventListener("change", refreshProgressUI);
document.getElementById("todayBtn").addEventListener("click", () => {
  const t = todayISO();
  document.getElementById("progressDay").value = t;
  document.getElementById("trainingDay").value = t;
  refreshProgressUI();
});

document.getElementById("clearDay").addEventListener("click", () => {
  const day = document.getElementById("progressDay").value || todayISO();
  clearDay(day);
  refreshProgressUI();
});
document.getElementById("clearAll").addEventListener("click", () => {
  clearAll();
  refreshProgressUI();
});

// -------- Settings: export/import --------
document.getElementById("exportProgress").addEventListener("click", () => {
  const store = loadStore();
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "epso-progress.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById("importProgress").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object") throw new Error("Invalid progress file");
  localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  refreshProgressUI();
  e.target.value = "";
});

document.getElementById("reloadBank").addEventListener("click", async () => {
  try {
    await loadBank();
    buildPracticePool();
    nextPracticeQuestion();
    refreshProgressUI();
    alert("Bank reloaded.");
  } catch (err) {
    alert("Failed to reload bank: " + err.message);
  }
});

// -------- Init --------
(function init() {
  const t = todayISO();
  document.getElementById("trainingDay").value = t;
  document.getElementById("progressDay").value = t;
  document.getElementById("sessionTime").textContent = "00:00:00";
  setTimerButtons(false);

  loadBank()
    .then(() => {
      buildPracticePool();
      nextPracticeQuestion();
      refreshProgressUI();
    })
    .catch(err => {
      document.getElementById("bankCount").textContent = "0";
      const container = document.getElementById("practiceQA");
      container.innerHTML = `<div class="note warn">Could not load the question bank. Ensure <b>digital.v1.0.json</b> is in the same folder as <b>index.html</b> and served via a local web server (or GitHub Pages).</div>`;
      console.error(err);
    });
})();
