'use strict';

/* ================= Утилиты ================= */
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[rnd(0, arr.length - 1)];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[rnd(0, CODE_CHARS.length - 1)]).join('');
const fmtTime = (min) => {
  const h = Math.floor(min / 60), m = Math.floor(min % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};

/* ================= Константы ================= */
const PEER_PREFIX = 'smen-shift-v1-';
const SHIFT_REAL_MS = 7 * 60 * 1000;      // реальная длительность смены
const SHIFT_GAME_MIN = 480;               // 00:00 -> 08:00
const TASK_TTL = { call: 35000, fuse: 25000, coffee: 30000, knock: 20000 };
const POINTS = { call: 100, fuse: 50, coffee: 75, knock: 40 };
const MAX_STRIKES = 3;
const TICK_MS = 250;
const CALL_GAP = [14, 28];   // сек между звонками
const EVENT_GAP = [24, 40];  // сек между событиями
const KIND_LABEL = { call: 'Звонок', fuse: 'Пробки', coffee: 'Кофе', knock: 'Дверь' };

/* ================= Звонящие ================= */
const CALLERS = [
  { name: 'ООО «Ромашка»', issue: 'У нас договор {contract}. Положена скидка {pct} %?',
    options: [
      { t: 'Конечно, скидка {pct} %', ok: true },
      { t: 'Скидок не бывает', ok: false },
      { t: 'Перезвоните в понедельник', ok: false },
    ] },
  { name: 'ИП Петров', issue: 'Хочу такую же скидку, как у Ромашки!',
    options: [
      { t: 'Скидка есть, оформляю', ok: false },
      { t: 'Скидка только по договору {contract}', ok: true },
      { t: 'Назову кодовое слово взамен', ok: false },
    ] },
  { name: 'Неизвестный', issue: 'ВЕРНИТЕ ДЕНЬГИ, ИЛИ МЫ…',
    options: [
      { t: 'Давайте обсудим условия', ok: false },
      { t: 'Перевожу в отдел претензий', ok: true },
      { t: 'Скидываю звонок', ok: false },
    ] },
  { name: 'Тихий голос', issue: 'Вы там… сейчас один?',
    options: [
      { t: 'Да, совсем один', ok: false },
      { t: 'Положить трубку', ok: true },
      { t: 'Спросить, кто это', ok: false },
    ] },
  { name: 'Шеф', issue: 'Кофе. Немедленно.',
    options: [
      { t: 'Иду ставить кофе', ok: true },
      { t: 'Машина сломалась', ok: false },
      { t: 'Самовар включаю', ok: false },
    ] },
  { name: 'Сосед сверху', issue: 'Опять этот гул! Я в полицию пожалуюсь!',
    options: [
      { t: 'Предложить наушники', ok: true },
      { t: 'Обещаю выключить серверы', ok: false },
      { t: 'Сказать, что это соседи', ok: false },
    ] },
  { name: 'Курьер', issue: 'Посылка для шефа. Вскрыть и проверить содержимое?',
    options: [
      { t: 'Вскрываю немедленно', ok: false },
      { t: 'До утра не вскрываем', ok: true },
      { t: 'Оставить у двери склада', ok: false },
    ] },
  { name: 'Аноним', issue: 'Какое у вас кодовое слово, милый?',
    options: [
      { t: '{word}', ok: false },
      { t: 'Кодовое слово не называю', ok: true },
      { t: 'У нас нет кодовых слов', ok: false },
    ] },
  { name: 'Дядя Гоша', issue: 'Я электрик. Врубить рубильник «{wrongFuse}»?',
    options: [
      { t: 'Врубайте смело', ok: false },
      { t: 'Нельзя: «{wrongFuse}» — серверная. Нужно «{rightFuse}»', ok: true },
      { t: 'Приходите утром', ok: false },
    ] },
  { name: 'ООО «Ромашка»', issue: '04:10! Откройте склад, отгрузим срочно.',
    options: [
      { t: 'Открываю, клиент же', ok: false },
      { t: 'Склад до утра закрыт', ok: true },
      { t: 'Только по кодовому слову', ok: false },
    ] },
];

const FUSE_LABELS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

/* ================= Приказ смены (генерируется на каждую смену) ================= */
const WORDS = ['Багульник', 'Акация', 'Флюгер', 'Валерьянка'];
const CONTRACTS = ['№К-77', '№М-12', '№З-34'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function makeRules() {
  const fuse = pick(FUSE_LABELS);
  const wrongFuse = pick(FUSE_LABELS.filter((f) => f !== fuse));
  return {
    word: pick(WORDS),
    contract: pick(CONTRACTS),
    pct: pick([10, 15, 20]),
    fuse, wrongFuse,
    coffee: { sugar: rnd(1, 3), milk: rnd(0, 2) },
    curfew: pick([120, 180, 240]), // минуты: 02:00 / 03:00 / 04:00
  };
}

function fill(text, rules) {
  return text
    .replace(/{word}/g, rules.word)
    .replace(/{contract}/g, rules.contract)
    .replace(/{pct}/g, rules.pct)
    .replace(/{wrongFuse}/g, rules.wrongFuse)
    .replace(/{rightFuse}/g, rules.fuse);
}

/* ================= Глобальное состояние ================= */
const G = {
  mode: null,        // 'solo' | 'host' | 'client'
  peer: null,
  conns: [],         // соединения клиентов (у хоста)
  hostConn: null,    // соединение с хостом (у клиента)
  code: '',
  state: null,       // авторитетное (хост/соло) или зеркало (клиент)
  coffee: {},        // локальные счётчики кофе по task.id
  taskSig: '',
  seenTasks: new Set(),
  joinTimer: null,
};

/* ================= Звук ================= */
let audioCtx = null;
function beep(freq, dur, vol) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.06, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.15));
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + (dur || 0.15));
  } catch (e) { /* без звука */ }
}

/* ================= Навигация по экранам ================= */
function showScreen(name) {
  ['menu', 'lobby', 'game', 'end'].forEach((s) => {
    $('#screen-' + s).classList.toggle('hidden', s !== name);
  });
}
function setStatus(text) { $('#menu-status').textContent = text; }

function toMenu(message) {
  if (G.joinTimer) { clearTimeout(G.joinTimer); G.joinTimer = null; }
  if (G.peer) { try { G.peer.destroy(); } catch (e) {} }
  G.mode = null; G.peer = null; G.conns = []; G.hostConn = null;
  G.state = null; G.taskSig = ''; G.seenTasks = new Set(); G.coffee = {};
  G.ruleShown = false;
  showScreen('menu');
  setStatus(message || '');
}

/* ================= Журнал ================= */
function addLog(st, text, cls) {
  st.log.push({ min: st.gameMin, text, cls: cls || '' });
  if (st.log.length > 30) st.log.shift();
}

/* ================= Состояние хоста ================= */
function hostNewState() {
  return {
    phase: 'lobby',
    startedAt: 0,
    elapsed: 0,
    gameMin: 0,
    strikes: 0,
    tasks: [],
    players: [],
    log: [],
    result: null,
    nextCall: 0,
    nextEvent: 0,
  };
}

function hostAddPlayer(id, name) {
  const st = G.state;
  let p = st.players.find((x) => x.id === id);
  if (!p) { p = { id, name, score: 0 }; st.players.push(p); }
  else p.name = name;
  return p;
}

function addScore(st, id, pts) {
  const p = st.players.find((x) => x.id === id);
  if (p) p.score += pts;
}

/* ================= Хост: создание и рассылка ================= */
function sanitizeTask(t) {
  const s = {
    id: t.id, kind: t.kind, title: t.title, desc: t.desc,
    expiresAt: t.expiresAt, ttl: t.ttl, claimedBy: t.claimedBy || null,
  };
  if (t.kind === 'call') s.options = t.options.map((o) => ({ t: o.t }));
  if (t.kind === 'fuse') s.labels = FUSE_LABELS;
  return s;
}

function publicState() {
  const st = G.state;
  return {
    phase: st.phase,
    elapsed: st.elapsed,
    strikes: st.strikes,
    rules: st.rules,
    tasks: st.tasks.filter((t) => !t.done).map(sanitizeTask),
    players: st.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
    log: st.log.slice(-8),
    result: st.result,
  };
}

function broadcast() {
  const s = publicState();
  const payload = { t: 'state', s };
  G.conns.forEach((c) => { if (c.open) { try { c.send(payload); } catch (e) {} } });
  applyState(s);
}

/* ================= Хост: игровые события ================= */
function hostSpawnCall(el) {
  const st = G.state;
  const rules = st.rules;
  const c = pick(CALLERS);
  st.tasks.push({
    id: st.nextId++, kind: 'call', title: fill(c.name, rules), desc: fill(c.issue, rules),
    options: shuffle(c.options).map((o) => ({ t: fill(o.t, rules), ok: o.ok })),
    claimedBy: null, done: false,
    expiresAt: el + TASK_TTL.call, ttl: TASK_TTL.call,
  });
  addLog(st, 'Входящий звонок: ' + c.name, '');
  beep(720, 0.18);
}

function hostSpawnEvent(el) {
  const st = G.state;
  const rules = st.rules;
  const kind = pick(['fuse', 'coffee', 'knock']);
  let task;
  if (kind === 'fuse') {
    task = { id: st.nextId++, kind: 'fuse', title: 'Выбило пробки', desc: 'Свет мигает. Рубильник — по приказу смены.', answer: rules.fuse, labels: shuffle(FUSE_LABELS) };
  } else if (kind === 'coffee') {
    task = { id: st.nextId++, kind: 'coffee', title: 'Шеф требует кофе', desc: 'Рецепт — в приказе смены.', need: { sugar: rules.coffee.sugar, milk: rules.coffee.milk } };
  } else {
    const saysCode = Math.random() < 0.5;
    const afterCurfew = st.gameMin >= rules.curfew;
    task = {
      id: st.nextId++, kind: 'knock', title: 'Стук в дверь',
      desc: saysCode ? 'Голос за дверью: «Открывайте, это я! ' + rules.word + '!»' : 'Голос за дверью: «Открывайте, пора обсудить дела!»',
      shouldOpen: !afterCurfew && saysCode,
    };
  }
  task.claimedBy = null; task.done = false;
  task.expiresAt = el + TASK_TTL[task.kind]; task.ttl = TASK_TTL[task.kind];
  st.tasks.push(task);
  addLog(st, 'Событие: ' + task.title, '');
  beep(500, 0.2);
}

function resolveMiss(st, t) {
  t.done = true;
  st.strikes++;
  addLog(st, 'Проигнорировано: ' + t.title + ' — жалоба!', 'bad');
  beep(220, 0.3);
}

function hostClaim(taskId, pid) {
  const st = G.state;
  if (!st || st.phase !== 'playing') return;
  const t = st.tasks.find((x) => x.id === taskId && !x.done);
  if (!t || t.claimedBy) return;
  t.claimedBy = pid;
  broadcast();
}

function hostAct(taskId, pid, data) {
  const st = G.state;
  if (!st || st.phase !== 'playing') return;
  const t = st.tasks.find((x) => x.id === taskId && !x.done);
  if (!t || t.claimedBy !== pid) return;
  t.done = true;

  let ok = false;
  if (t.kind === 'call') ok = !!(t.options[data.choice] && t.options[data.choice].ok);
  else if (t.kind === 'fuse') ok = data.fuse === t.answer;
  else if (t.kind === 'coffee') ok = data.sugar === t.need.sugar && data.milk === t.need.milk;
  else if (t.kind === 'knock') ok = data.open === t.shouldOpen;

  if (ok) {
    addScore(st, pid, POINTS[t.kind]);
    addLog(st, KIND_LABEL[t.kind] + ': справились — +' + POINTS[t.kind], 'good');
    beep(880, 0.15);
  } else {
    st.strikes++;
    addLog(st, KIND_LABEL[t.kind] + ': ошибка — жалоба!', 'bad');
    beep(220, 0.3);
  }
  broadcast();

  if (st.strikes >= MAX_STRIKES) hostEnd(false);
}

function hostTick() {
  const st = G.state;
  if (!st || st.phase !== 'playing') return;
  const el = Date.now() - st.startedAt;
  st.elapsed = el;
  st.gameMin = Math.min(SHIFT_GAME_MIN, (el / SHIFT_REAL_MS) * SHIFT_GAME_MIN);

  if (el >= st.nextCall) { hostSpawnCall(el); st.nextCall = el + rnd(CALL_GAP[0], CALL_GAP[1]) * 1000; }
  if (el >= st.nextEvent) { hostSpawnEvent(el); st.nextEvent = el + rnd(EVENT_GAP[0], EVENT_GAP[1]) * 1000; }

  for (const t of st.tasks) {
    if (!t.done && el > t.expiresAt) resolveMiss(st, t);
  }
  const hadMiss = st.tasks.some((t) => t.done);
  if (hadMiss) st.tasks = st.tasks.filter((t) => !t.done);
  else st.tasks = st.tasks.filter((t) => !t.done);

  if (st.gameMin >= SHIFT_GAME_MIN) { hostEnd(true); return; }
  if (st.strikes >= MAX_STRIKES) { hostEnd(false); return; }
  broadcast();
}

function hostEnd(win) {
  const st = G.state;
  st.phase = 'ended';
  st.result = {
    win,
    players: st.players.map((p) => ({ name: p.name, score: p.score })).sort((a, b) => b.score - a.score),
  };
  addLog(st, win ? 'Смена закончена. 08:00.' : 'Три жалобы. Вы уволены.', win ? 'good' : 'bad');
  broadcast();
}

function hostStart() {
  const st = G.state;
  st.phase = 'playing';
  st.startedAt = Date.now();
  st.elapsed = 0;
  st.gameMin = 0;
  st.strikes = 0;
  st.tasks = [];
  st.log = [];
  st.result = null;
  st.nextId = 1;
  st.nextCall = rnd(3, 7) * 1000;
  st.nextEvent = rnd(14, 24) * 1000;
  st.players.forEach((p) => { p.score = 0; });
  st.rules = makeRules();
  addLog(st, 'Приказ смены получен — читайте его!', '');
  addLog(st, 'Смена началась. До 08:00.', '');
  broadcast();
}

function hostAgain() {
  const st = G.state;
  st.phase = 'lobby';
  st.result = null;
  st.tasks = [];
  st.log = [];
  broadcast();
}

/* ================= Хост: сеть ================= */
function hostCreate() {
  const name = playerName();
  let attempts = 0;
  tryCreate();

  function tryCreate() {
    attempts++;
    const code = makeCode();
    setStatus('Создаём лобби…');
    const peer = new Peer(PEER_PREFIX + code);
    G.peer = peer; G.code = code;

    peer.on('open', () => {
      G.mode = 'host';
      G.state = hostNewState();
      G.state.nextId = 1;
      hostAddPlayer('host', name);
      showScreen('lobby');
      renderLobby();
    });

    peer.on('connection', (conn) => {
      G.conns.push(conn);
      conn.on('data', (msg) => hostHandle(conn, msg));
      conn.on('close', () => {
        G.conns = G.conns.filter((c) => c !== conn);
        if (G.state) {
          G.state.players = G.state.players.filter((p) => p.id !== conn.peer);
          if (G.state.phase === 'lobby') renderLobby();
          broadcast();
        }
      });
    });

    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && attempts < 5) {
        try { peer.destroy(); } catch (err) {}
        tryCreate();
      } else if (e.type !== 'unavailable-id') {
        toMenu('Ошибка связи: ' + e.type);
      }
    });
  }
}

function hostHandle(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'join') {
    const name = String(msg.name || 'Безымянный').slice(0, 14);
    hostAddPlayer(conn.peer, name);
    if (G.state.phase === 'lobby') renderLobby();
    broadcast();
  } else if (msg.t === 'claim') {
    hostClaim(msg.taskId, conn.peer);
  } else if (msg.t === 'act') {
    hostAct(msg.taskId, conn.peer, msg.data || {});
  }
}

/* ================= Клиент: сеть ================= */
function clientJoin(code) {
  const name = playerName();
  setStatus('Подключаемся…');
  const peer = new Peer();
  G.peer = peer;

  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
    G.hostConn = conn;
    conn.on('open', () => {
      conn.send({ t: 'join', name });
      G.joinTimer = setTimeout(() => {
        if (!G.state) toMenu('Хост не отвечает. Попробуйте ещё раз.');
      }, 8000);
    });
    conn.on('data', (m) => {
      if (m && m.t === 'state') { G.state = m.s; applyState(m.s); }
    });
    conn.on('close', () => toMenu('Соединение с лобби потеряно.'));
  });

  peer.on('error', (e) => {
    if (e.type === 'peer-unavailable') toMenu('Лобби не найдено. Проверьте код.');
    else toMenu('Ошибка связи: ' + e.type);
  });
}

function clientSend(msg) {
  if (G.hostConn && G.hostConn.open) G.hostConn.send(msg);
}

/* ================= Применение состояния (у всех) ================= */
function applyState(s) {
  if (!s) return;
  if (s.phase === 'lobby') {
    G.ruleShown = false;
    showScreen('lobby');
    renderLobby();
  } else if (s.phase === 'playing') {
    showScreen('game');
    renderGame(s);
    if (!G.ruleShown && s.rules) { G.ruleShown = true; openRulebook(); }
  } else if (s.phase === 'ended') {
    showScreen('end');
    renderEnd(s);
  }
}

/* ================= Отрисовка: лобби ================= */
function renderLobby() {
  $('#lobby-code').textContent = G.code || '-----';
  const st = G.state;
  const list = $('#lobby-players');
  list.innerHTML = '';
  const players = st ? st.players : [];
  players.forEach((p) => {
    const li = el('li', null, null);
    li.appendChild(el('span', null, p.name));
    list.appendChild(li);
  });
  const isHost = G.mode === 'host';
  $('#btn-start').classList.toggle('hidden', !isHost);
  $('#lobby-wait').classList.toggle('hidden', isHost);
}

/* ================= Отрисовка: игра ================= */
function gameMinutes(elapsed) {
  return Math.min(SHIFT_GAME_MIN, (elapsed / SHIFT_REAL_MS) * SHIFT_GAME_MIN);
}

function renderGame(st) {
  // шапка
  $('#hud-time').textContent = fmtTime(gameMinutes(st.elapsed));
  const dots = [];
  for (let i = 0; i < MAX_STRIKES; i++) dots.push(i < st.strikes ? '●' : '○');
  $('#hud-strikes').textContent = dots.join(' ');
  $('#hud-strikes').style.color = st.strikes >= MAX_STRIKES - 1 ? 'var(--bad)' : 'var(--text)';
  $('#hud-players').textContent = st.players.map((p) => p.name + ': ' + p.score).join(' · ');

  // журнал
  const logEl = $('#log');
  logEl.innerHTML = '';
  st.log.slice(-8).forEach((entry) => {
    const li = el('li', entry.cls, null);
    li.appendChild(el('span', 'log-time', fmtTime(entry.min)));
    li.appendChild(document.createTextNode(entry.text));
    logEl.appendChild(li);
  });

  // новые задания -> звук
  st.tasks.forEach((t) => {
    if (!G.seenTasks.has(t.id)) {
      G.seenTasks.add(t.id);
      if (G.mode !== 'host') beep(t.kind === 'knock' ? 300 : 720, 0.15);
    }
  });

  // карточки: перерисовываем только при изменении состава
  const sig = st.tasks.map((t) => t.id + ':' + t.kind + ':' + (t.claimedBy || '')).join('|');
  if (sig !== G.taskSig) {
    G.taskSig = sig;
    renderTasks(st);
  }
  updateTimers(st);
}

function myId() {
  if (G.mode === 'host' || G.mode === 'solo') return 'host';
  if (G.mode === 'client') return G.peer ? G.peer.id : '';
  return '';
}

function playerNameOf(st, id) {
  const p = st.players.find((x) => x.id === id);
  return p ? p.name : '?';
}

function renderTasks(st) {
  const wrap = $('#tasks');
  wrap.innerHTML = '';
  if (!st.tasks.length) {
    wrap.appendChild(el('div', 'tasks-empty', 'Пока тихо. Кофе можно допить…'));
    return;
  }
  st.tasks.forEach((t) => {
    const card = el('div', 'task kind-' + t.kind);
    card.dataset.taskId = t.id;

    const head = el('div', 'task-head', null);
    head.appendChild(el('span', 'task-kind', KIND_LABEL[t.kind]));
    head.appendChild(el('span', 'task-title', t.title));
    card.appendChild(head);

    card.appendChild(el('p', 'task-issue', t.desc));

    const bar = el('div', 'bar', null);
    const fill = el('i', null, null);
    bar.appendChild(fill);
    card.appendChild(bar);

    const body = el('div', 'task-body', null);
    card.appendChild(body);
    const foot = el('div', 'task-foot', null);
    card.appendChild(foot);

    if (t.claimedBy) {
      const isMine = t.claimedBy === myId();
      if (isMine) {
        buildTaskAction(body, t);
        foot.textContent = 'Задание на вас. Время!';
      } else {
        foot.textContent = 'Обрабатывает: ' + playerNameOf(st, t.claimedBy);
      }
    } else {
      const btn = el('button', 'btn alt', 'Взять');
      btn.addEventListener('click', () => {
        if (G.mode === 'host' || G.mode === 'solo') hostClaim(t.id, 'host');
        else clientSend({ t: 'claim', taskId: t.id });
      });
      body.appendChild(btn);
      foot.textContent = 'Свободно — успей взять!';
    }
    wrap.appendChild(card);
  });
}

function buildTaskAction(body, t) {
  if (t.kind === 'call') {
    t.options.forEach((o, i) => {
      const btn = el('button', 'btn', o.t);
      btn.addEventListener('click', () => {
        if (G.mode === 'host' || G.mode === 'solo') hostAct(t.id, 'host', { choice: i });
        else clientSend({ t: 'act', taskId: t.id, data: { choice: i } });
      });
      body.appendChild(btn);
    });
  } else if (t.kind === 'fuse') {
    (t.labels || FUSE_LABELS).forEach((f) => {
      const btn = el('button', 'btn', f);
      btn.addEventListener('click', () => {
        if (G.mode === 'host' || G.mode === 'solo') hostAct(t.id, 'host', { fuse: f });
        else clientSend({ t: 'act', taskId: t.id, data: { fuse: f } });
      });
      body.appendChild(btn);
    });
  } else if (t.kind === 'coffee') {
    if (!G.coffee[t.id]) G.coffee[t.id] = { sugar: 0, milk: 0 };
    const c = G.coffee[t.id];
    const send = () => {
      const data = { sugar: c.sugar, milk: c.milk };
      if (G.mode === 'host' || G.mode === 'solo') hostAct(t.id, 'host', data);
      else clientSend({ t: 'act', taskId: t.id, data });
    };
    const mkStepper = (label, key) => {
      const wrap = el('div', 'stepper', null);
      const minus = el('button', 'btn', '−');
      const val = el('b', null, label + ': ' + c[key]);
      const plus = el('button', 'btn', '+');
      minus.addEventListener('click', () => { c[key] = Math.max(0, c[key] - 1); val.textContent = label + ': ' + c[key]; });
      plus.addEventListener('click', () => { c[key] = Math.min(5, c[key] + 1); val.textContent = label + ': ' + c[key]; });
      wrap.appendChild(minus); wrap.appendChild(val); wrap.appendChild(plus);
      body.appendChild(wrap);
    };
    mkStepper('Сахар', 'sugar');
    mkStepper('Молоко', 'milk');
    const submit = el('button', 'btn alt', 'Подать кофе');
    submit.addEventListener('click', send);
    body.appendChild(submit);
  } else if (t.kind === 'knock') {
    const open = el('button', 'btn', 'Открыть');
    open.addEventListener('click', () => {
      if (G.mode === 'host' || G.mode === 'solo') hostAct(t.id, 'host', { open: true });
      else clientSend({ t: 'act', taskId: t.id, data: { open: true } });
    });
    const shut = el('button', 'btn', 'Не открывать');
    shut.addEventListener('click', () => {
      if (G.mode === 'host' || G.mode === 'solo') hostAct(t.id, 'host', { open: false });
      else clientSend({ t: 'act', taskId: t.id, data: { open: false } });
    });
    body.appendChild(open); body.appendChild(shut);
  }
}

function updateTimers(st) {
  document.querySelectorAll('.task').forEach((card) => {
    const id = Number(card.dataset.taskId);
    const t = st.tasks.find((x) => x.id === id);
    const fill = card.querySelector('.bar i');
    if (!t || !fill) return;
    const remaining = Math.max(0, t.expiresAt - st.elapsed);
    const pct = Math.max(0, Math.min(100, (remaining / t.ttl) * 100));
    fill.style.width = pct + '%';
    fill.className = pct < 25 ? 'crit' : (pct < 55 ? 'warn' : '');
    card.classList.toggle('urgent', remaining > 0 && remaining < 8000);
  });
}

/* ================= Отрисовка: итоги ================= */
function renderEnd(st) {
  const r = st.result || { win: false, players: [] };
  const title = $('#end-title');
  title.textContent = r.win ? 'Смена пройдена! 08:00.' : 'Три жалобы — вы уволены.';
  title.className = r.win ? 'win' : 'lose';

  const list = $('#end-scores');
  list.innerHTML = '';
  (r.players || []).forEach((p) => {
    const li = el('li', null, null);
    li.appendChild(el('span', null, p.name));
    li.appendChild(el('span', 'score', String(p.score)));
    list.appendChild(li);
  });

  const isAuthority = G.mode === 'host' || G.mode === 'solo';
  $('#btn-again').classList.toggle('hidden', !isAuthority);
  $('#end-wait').classList.toggle('hidden', isAuthority);
}

/* ================= Отрисовка: приказ смены ================= */
function renderRulebook(rules) {
  $('#rulebook-title').textContent = 'Приказ смены';
  const ol = $('#rulebook-list');
  ol.innerHTML = '';
  if (!rules) return;
  const items = [
    'Скидка <b>' + rules.pct + ' %</b> — только по договору <b>' + rules.contract + '</b>. Остальным — вежливый отказ.',
    'С угрозами в трубке — сразу «отдел претензий», не спорить.',
    'Кофе для шефа: <b>' + rules.coffee.sugar + ' ' + plural(rules.coffee.sugar, 'кубик', 'кубика', 'кубиков') +
      ' сахара, ' + (rules.coffee.milk === 0 ? 'без молока' : rules.coffee.milk + ' ' + plural(rules.coffee.milk, 'порция', 'порции', 'порций') + ' молока') + '</b>.',
    'Пробки выключает рубильник <b>«' + rules.fuse + '»</b>. Остальные — не трогать.',
    'Дверь: до <b>' + fmtTime(rules.curfew) + '</b> открывать только тем, кто называет слово <b>«' + rules.word + '»</b>. После — не открывать никому.',
    'Посылки до утра не вскрывать.',
    'Жалобы соседей: шум — не наша вина, предлагать наушники.',
    'Кодовое слово по телефону не называть никому.',
    'Смена до 08:00. Три жалобы — увольнение.',
  ];
  items.forEach((html) => {
    const li = el('li', null, null);
    li.innerHTML = html;
    ol.appendChild(li);
  });
}

function openRulebook() {
  const st = G.state;
  renderRulebook(st && st.rules);
  $('#modal').classList.remove('hidden');
}

/* ================= Локальный тикер ================= */
setInterval(() => {
  const st = G.state;
  if (!st || st.phase !== 'playing') return;
  if (G.mode !== 'host' && G.mode !== 'solo') {
    st.elapsed = Math.min(st.elapsed + TICK_MS, SHIFT_REAL_MS);
  }
  if ($('#screen-game').classList.contains('hidden')) return;
  $('#hud-time').textContent = fmtTime(gameMinutes(st.elapsed));
  updateTimers(st);
}, TICK_MS);

/* ================= Инициализация ================= */
function playerName() {
  const v = $('#name-input').value.trim();
  return v || 'Сменщик';
}

function init() {
  try { $('#name-input').value = localStorage.getItem('smen-name') || ''; } catch (e) {}

  $('#name-input').addEventListener('change', () => {
    try { localStorage.setItem('smen-name', $('#name-input').value.trim()); } catch (e) {}
  });
  $('#code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  $('#btn-solo').addEventListener('click', () => {
    G.mode = 'solo';
    G.code = '';
    G.state = hostNewState();
    G.state.nextId = 1;
    hostAddPlayer('host', playerName());
    hostStart();
  });

  $('#btn-create').addEventListener('click', hostCreate);

  $('#btn-join').addEventListener('click', () => {
    const code = $('#code-input').value.trim();
    if (code.length !== 5) { setStatus('Код — 5 символов.'); return; }
    clientJoin(code);
  });

  $('#btn-start').addEventListener('click', () => {
    if (G.mode === 'host') hostStart();
  });
  $('#btn-lobby-leave').addEventListener('click', () => toMenu(''));
  $('#btn-leave').addEventListener('click', () => {
    const wasAuthority = G.mode === 'host' || G.mode === 'solo';
    if (wasAuthority && G.state) {
      G.state.phase = 'ended';
      G.state.result = { win: false, players: G.state.players.map((p) => ({ name: p.name, score: p.score })) };
      broadcast();
      setTimeout(() => toMenu('Вы ушли со смены.'), 300);
    } else {
      toMenu('Вы ушли со смены.');
    }
  });

  $('#btn-again').addEventListener('click', () => {
    if (G.mode === 'host') hostAgain();
    else if (G.mode === 'solo') { G.state = hostNewState(); G.state.nextId = 1; hostAddPlayer('host', playerName()); hostStart(); }
  });
  $('#btn-end-menu').addEventListener('click', () => toMenu(''));

  $('#btn-rulebook').addEventListener('click', () => openRulebook());
  $('#btn-close-modal').addEventListener('click', () => $('#modal').classList.add('hidden'));
  $('#modal').addEventListener('click', (e) => {
    if (e.target === $('#modal')) $('#modal').classList.add('hidden');
  });

  setInterval(hostTick, TICK_MS);
}

init();
