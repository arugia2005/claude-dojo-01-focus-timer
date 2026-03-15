const timeEl = document.getElementById('time');
const ringEl = document.getElementById('ring');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const modeEl = document.getElementById('mode');
const sessionCountEl = document.getElementById('sessionCount');
const taskInput = document.getElementById('taskInput');
const focusMinInput = document.getElementById('focusMin');
const breakMinInput = document.getElementById('breakMin');
const autoCycleInput = document.getElementById('autoCycle');

const STORAGE_KEY = 'focus_timer_state_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function clamp(n, min, max) {
  return Number.isNaN(n) ? min : Math.min(max, Math.max(min, n));
}

const defaultState = {
  mode: 'focus',
  focusMinutes: 25,
  breakMinutes: 5,
  remainingSeconds: 25 * 60,
  sessions: 0,
  task: '',
  autoCycle: true,
};

let state = { ...defaultState };
let timerId = null;
let isRunning = false;

function applyInputs() {
  focusMinInput.value = state.focusMinutes;
  breakMinInput.value = state.breakMinutes;
  autoCycleInput.checked = state.autoCycle;
  taskInput.value = state.task;
}

function getCurrentModeMinutes() {
  return state.mode === 'focus' ? state.focusMinutes : state.breakMinutes;
}

function tick() {
  if (state.remainingSeconds <= 0) {
    clearInterval(timerId);
    timerId = null;
    isRunning = false;

    if (state.mode === 'focus') {
      state.sessions += 1;
    }

    if (state.autoCycle) {
      state.mode = state.mode === 'focus' ? 'break' : 'focus';
      state.remainingSeconds = getCurrentModeMinutes() * 60;
      isRunning = true;
      timerId = setInterval(tick, 1000);
    }

    persist();
    render();
    return;
  }

  state.remainingSeconds -= 1;
  render();
}

function startTimer() {
  if (isRunning) return;
  if (state.remainingSeconds <= 0) {
    state.remainingSeconds = getCurrentModeMinutes() * 60;
  }
  isRunning = true;
  timerId = setInterval(tick, 1000);
  render();
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  isRunning = false;
  render();
}

function resetTimer() {
  stopTimer();
  state.remainingSeconds = getCurrentModeMinutes() * 60;
  render();
}

function updateRing() {
  const duration = getCurrentModeMinutes() * 60;
  const progress = duration === 0 ? 0 : (1 - state.remainingSeconds / duration) * 100;
  const color = state.mode === 'focus' ? '#4f46e5' : '#059669';
  ringEl.style.background = `conic-gradient(${color} ${progress}%, #e2e8f0 ${progress}% 100%)`;
}

function render() {
  timeEl.textContent = formatTime(state.remainingSeconds);
  startBtn.disabled = isRunning;
  stopBtn.disabled = !isRunning;
  const task = (taskInput.value.trim() || '集中タイマー');
  const modeText = state.mode === 'focus' ? 'フォーカス' : '休憩';
  modeEl.textContent = `モード: ${modeText}`;
  if (state.remainingSeconds === 0 && !isRunning) {
    statusEl.textContent = `${task} - ${modeText}完了！`;
  } else {
    statusEl.textContent = isRunning ? `${task} - ${modeText}集中中...` : `${task} - ${modeText}停止中`;
  }
  sessionCountEl.textContent = state.sessions;
  updateRing();
  persist();
}

function setDurationFromInputs() {
  const focus = clamp(Number(focusMinInput.value), 1, 120);
  const brk = clamp(Number(breakMinInput.value), 1, 60);
  state.focusMinutes = focus;
  state.breakMinutes = brk;
  if (!isRunning) {
    state.remainingSeconds = getCurrentModeMinutes() * 60;
  }
  persist();
  render();
}

function persist() {
  state.task = taskInput.value.trim();
  state.autoCycle = autoCycleInput.checked;
  saveState(state);
}

startBtn.addEventListener('click', startTimer);
stopBtn.addEventListener('click', stopTimer);
resetBtn.addEventListener('click', resetTimer);

focusMinInput.addEventListener('change', setDurationFromInputs);
breakMinInput.addEventListener('change', setDurationFromInputs);
autoCycleInput.addEventListener('change', () => {
  state.autoCycle = autoCycleInput.checked;
  persist();
  render();
});

taskInput.addEventListener('input', render);

document.addEventListener('keydown', (event) => {
  if (event.target.tagName === 'INPUT') {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      if (isRunning) stopTimer(); else startTimer();
    }
    return;
  }

  if (event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    if (isRunning) stopTimer(); else startTimer();
  }
  if (event.key.toLowerCase() === 'r') {
    resetTimer();
  }
});

function init() {
  const saved = loadState();
  if (saved) {
    state = {
      ...defaultState,
      ...saved,
    };
  }
  state.focusMinutes = clamp(Number(state.focusMinutes), 1, 120);
  state.breakMinutes = clamp(Number(state.breakMinutes), 1, 60);
  state.remainingSeconds = Number(state.remainingSeconds) || state.focusMinutes * 60;
  applyInputs();
  render();
}

init();
