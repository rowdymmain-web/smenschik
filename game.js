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
const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt', // основной: брокер EMQX, работает в РФ без VPN
  'wss://mqtt.eclipseprojects.io:443/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const TOPIC_BASE = 'smenschik-v2/';
const topicState = (c) => TOPIC_BASE + c + '/state';
const topicToHost = (c) => TOPIC_BASE + c + '/tohost';
const topicGone = (c) => TOPIC_BASE + c + '/gone';
const topicChat = (c) => TOPIC_BASE + c + '/chat';
const SHIFT_REAL_MS = 7 * 60 * 1000;      // реальная длительность смены
const SHIFT_GAME_MIN = 480;               // 00:00 -> 08:00
const TASK_TTL = { call: 35000, fuse: 25000, coffee: 30000, knock: 20000, fax: 30000, camera: 30000, inventory: 20000, boss: 25000 };
const POINTS = { call: 100, fuse: 50, coffee: 75, knock: 40, fax: 80, camera: 80, inventory: 60, boss: 200 };
const MAX_STRIKES = 3;
const TICK_MS = 250;
const CALL_GAP = [14, 28];   // сек между звонками
const EVENT_GAP = [24, 40];  // сек между событиями
const KIND_LABEL = { call: 'Звонок', fuse: 'Пробки', coffee: 'Кофе', knock: 'Дверь', fax: 'Факс', camera: 'Камера', inventory: 'Склад', boss: 'Проверка' };

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
const NY_WORDS = ['Мандарин', 'Хвоинка', 'Сугроб', 'Гирлянда'];
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
  const ny = !!(G.settings && G.settings.nyTheme);
  return {
    word: ny ? pick(NY_WORDS) : pick(WORDS),
    contract: pick(CONTRACTS),
    pct: pick([10, 15, 20]),
    fuse, wrongFuse,
    coffee: { sugar: rnd(1, 3), milk: rnd(0, 2) },
    curfew: pick([120, 180, 240]), // минуты: 02:00 / 03:00 / 04:00
    faxShift: rnd(1, 5),
    badSeries: pick(['А3', 'А7', 'Б2', 'В5']),
    ny,
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
  mqtt: null,        // клиент MQTT
  myId: 'host',
  code: '',
  state: null,       // авторитетное (хост/соло) или зеркало (клиент)
  coffee: {},        // локальные счётчики кофе по task.id
  taskSig: '',
  seenTasks: new Set(),
  joinTimer: null,
  pingTimer: null,
  chat: [],         // расшифрованные сообщения чата
  chatKeys: {},     // кэш ключей чата по коду лобби
  chatViews: [],    // подключённые чат-панели
  statsRecorded: false, // статистика текущей смены записана
  lastScore: 0,     // мои баллы в текущей смене
  settings: { sound: true, shiftMs: 420000, diff: 1 },
  urgentNotified: new Set(), // задания, по которым уже била тревога
  voted: false,     // клиент уже голосовал за реванш
  voteAgain: new Set(), // голоса за реванш (у хоста)
};

/* ================= Звук ================= */
let audioCtx = null;
function beep(freq, dur, vol) {
  if (G.settings && !G.settings.sound) return;
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
  if (G.pingTimer) { clearInterval(G.pingTimer); G.pingTimer = null; }
  if (G.mqtt) {
    try {
      if (G.mode === 'host' && G.code && G.mqtt.connected) {
        G.mqtt.publish(topicState(G.code), '', { retain: true });
      }
      G.mqtt.end(true);
    } catch (e) {}
  }
  G.mode = null; G.mqtt = null; G.myId = 'host'; G.code = '';
  G.state = null; G.taskSig = ''; G.seenTasks = new Set(); G.coffee = {};
  G.chat = [];
  G.statsRecorded = false; G.lastScore = 0;
  G.urgentNotified.clear(); G.voted = false;
  document.body.classList.remove('alarm');
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
    shiftMs: SHIFT_REAL_MS,
    elapsed: 0,
    bossDone: false,
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
  if (!p) { p = { id, name, score: 0, lastSeen: Date.now() }; st.players.push(p); }
  else { p.name = name; p.lastSeen = Date.now(); }
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
  if (t.options) s.options = t.options.map((o) => ({ t: o.t }));
  if (t.kind === 'fuse') s.labels = FUSE_LABELS;
  if (t.kind === 'boss') s.need = t.need;
  return s;
}

function publicState() {
  const st = G.state;
  return {
    phase: st.phase,
    elapsed: st.elapsed,
    shiftMs: st.shiftMs,
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
  if (G.mode === 'host' && G.mqtt && G.mqtt.connected) {
    try { G.mqtt.publish(topicState(G.code), JSON.stringify(s), { retain: true }); } catch (e) {}
  }
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
  const ny = rules.ny;
  const kind = pick(['fuse', 'coffee', 'knock', 'fax', 'camera', 'inventory']);
  let task;
  if (kind === 'fuse') {
    task = { id: st.nextId++, kind: 'fuse', title: 'Выбило пробки', desc: 'Свет мигает. Рубильник — по приказу смены.', answer: rules.fuse, labels: shuffle(FUSE_LABELS) };
  } else if (kind === 'coffee') {
    task = { id: st.nextId++, kind: 'coffee', title: 'Шеф требует кофе', desc: 'Рецепт — в приказе смены.', need: { sugar: rules.coffee.sugar, milk: rules.coffee.milk } };
  } else if (kind === 'fax') {
    const words = ['АВАНС', 'СКИДКА', 'КОД', 'ЯЩИК'];
    const w = pick(words);
    const enc = Array.from(w, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 1040 + rules.faxShift) % 32) + 1040)).join('');
    const others = shuffle(words.filter((x) => x !== w));
    const opts = shuffle([{ t: w, ok: true }, { t: others[0], ok: false }, { t: others[1], ok: false }, { t: others[2], ok: false }]);
    task = { id: st.nextId++, kind: 'fax', title: 'Факс с шифровкой', desc: 'Факс: «ШИФР: ' + enc + '» — сдвиг букв на ' + rules.faxShift + '.', options: opts };
  } else if (kind === 'camera') {
    const people = shuffle([['Смирнов', 'А3'], ['Орлов', 'А7'], ['Волкова', 'Б2'], ['Гусев', 'В5']]);
    const bad = people.find((p) => p[1] === rules.badSeries);
    const opts = shuffle(people.map((p) => ({ t: p[0] + ' (' + p[1] + ')', ok: p === bad })));
    task = { id: st.nextId++, kind: 'camera', title: 'Камера наблюдения', desc: 'Пропуска серии «' + rules.badSeries + '» недействительны. Кто нарушитель?', options: opts };
  } else if (kind === 'inventory') {
    const x = rnd(4, 9), y = rnd(6, 12);
    const right = x * y;
    const opts = shuffle([
      { t: String(right), ok: true },
      { t: String(right + rnd(1, 3)), ok: false },
      { t: String(Math.max(1, right - rnd(1, 3))), ok: false },
      { t: String(x + y), ok: false },
    ]);
    task = { id: st.nextId++, kind: 'inventory', title: 'Инвентарь склада', desc: 'На складе ' + x + ' ящиков по ' + y + ' коробок. Сколько всего?', options: opts };
  } else {
    const saysCode = Math.random() < 0.5;
    const afterCurfew = st.gameMin >= rules.curfew;
    const pre = ny ? 'В дверь стучат в валенках: ' : 'Голос за дверью: ';
    task = {
      id: st.nextId++, kind: 'knock', title: ny ? 'Стук в дверь (валенки!)' : 'Стук в дверь',
      desc: saysCode ? pre + '«Открывайте, это я! ' + rules.word + '!»' : pre + '«Открывайте, пора обсудить дела!»',
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
  if (t.kind === 'call' || t.kind === 'fax' || t.kind === 'camera' || t.kind === 'inventory') {
    ok = !!(t.options[data.choice] && t.options[data.choice].ok);
  } else if (t.kind === 'fuse') ok = data.fuse === t.answer;
  else if (t.kind === 'coffee' || t.kind === 'boss') {
    ok = data.sugar === t.need.sugar && data.milk === t.need.milk;
  } else if (t.kind === 'knock') ok = data.open === t.shouldOpen;

  if (ok) {
    addScore(st, pid, POINTS[t.kind]);
    addLog(st, KIND_LABEL[t.kind] + ': справились — +' + POINTS[t.kind], 'good');
    beep(880, 0.15);
  } else {
    st.strikes += (t.kind === 'boss' ? 2 : 1);
    addLog(st, KIND_LABEL[t.kind] + (t.kind === 'boss' ? ' провалена — ДВЕ жалобы!' : ': ошибка — жалоба!'), 'bad');
    beep(220, 0.3);
  }
  broadcast();

  if (st.strikes >= MAX_STRIKES) hostEnd(false);
}

function hostTick() {
  // таймер смены — только у хоста/соло; у клиента состояние лишь зеркало
  if (G.mode !== 'host' && G.mode !== 'solo') return;
  const st = G.state;
  // отвалившиеся игроки (без пинга дольше 45 c) выпадают из лобби
  if (st) {
    const now = Date.now();
    st.players = st.players.filter((p) => p.id === 'host' || (now - (p.lastSeen || 0) < 45000));
  }
  if (!st || st.phase !== 'playing') return;
  const el = Date.now() - st.startedAt;
  st.elapsed = el;
  st.gameMin = Math.min(SHIFT_GAME_MIN, (el / (st.shiftMs || SHIFT_REAL_MS)) * SHIFT_GAME_MIN);

  // в мультиплеере (2+ игроков) заказов и заявок вдвое больше; темп — из настроек
  const busy = st.players.length > 1;
  const diff = (G.settings && G.settings.diff) || 1;
  if (el >= st.nextCall) {
    hostSpawnCall(el);
    st.nextCall = el + Math.round(rnd(CALL_GAP[0], CALL_GAP[1]) * diff / (busy ? 2 : 1)) * 1000;
  }
  if (el >= st.nextEvent) {
    hostSpawnEvent(el);
    st.nextEvent = el + Math.round(rnd(EVENT_GAP[0], EVENT_GAP[1]) * diff / (busy ? 2 : 1)) * 1000;
  }

  for (const t of st.tasks) {
    if (!t.done && el > t.expiresAt) resolveMiss(st, t);
  }
  const hadMiss = st.tasks.some((t) => t.done);
  if (hadMiss) st.tasks = st.tasks.filter((t) => !t.done);
  else st.tasks = st.tasks.filter((t) => !t.done);

  if (st.gameMin >= 180 && !st.bossDone) {
    st.bossDone = true;
    hostSpawnBoss(el);
  }
  if (st.gameMin >= SHIFT_GAME_MIN) { hostEnd(true); return; }
  if (st.strikes >= MAX_STRIKES) { hostEnd(false); return; }
  broadcast();
}

function hostSpawnBoss(el) {
  const st = G.state;
  const rules = st.rules;
  const ny = rules.ny;
  st.tasks.push({
    id: st.nextId++, kind: 'boss',
    title: ny ? 'Дед Мороз проводит проверку!' : 'Проверка шефа в 03:00!',
    desc: (ny ? 'Дед Мороз на посту: кофе строго по приказу, мандарины не предлагать!' : 'Шеф лично на посту: кофе строго по приказу!') + ' Ошибка — сразу две жалобы.',
    need: { sugar: rules.coffee.sugar, milk: rules.coffee.milk },
    claimedBy: null, done: false,
    expiresAt: el + TASK_TTL.boss, ttl: TASK_TTL.boss,
  });
  addLog(st, ny ? 'Дед Мороз на посту!' : 'Проверка шефа в 03:00!', 'bad');
  beep(180, 0.4);
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
  st.shiftMs = (G.settings && G.settings.shiftMs) || SHIFT_REAL_MS;
  st.bossDone = false;
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
  G.voteAgain = new Set();
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
  G.voteAgain = new Set();
  broadcast();
}

/* ================= Сеть: MQTT ================= */
function netConnect(code, isHost, onReady) {
  let attempt = 0;

  function tryNext() {
    if (attempt >= MQTT_BROKERS.length) { toMenu('Сервер связи недоступен. Попробуйте позже.'); return; }
    const url = MQTT_BROKERS[attempt++];
    const will = isHost ? undefined : { topic: topicGone(code), payload: G.myId, qos: 0, retain: false };
    const client = mqtt.connect(url, {
      clientId: 'smen-' + Math.random().toString(36).slice(2, 10),
      clean: true,
      connectTimeout: 6000,
      reconnectPeriod: 3000,
      will,
    });
    G.mqtt = client;
    let ready = false;

    client.on('connect', () => {
      if (G.mqtt !== client) return;
      const subs = isHost ? [topicToHost(code), topicGone(code), topicChat(code)] : [topicState(code), topicChat(code)];
      client.subscribe(subs, (err) => {
        if (err || G.mqtt !== client) return;
        if (!isHost) {
          client.publish(topicToHost(code), JSON.stringify({ t: 'join', id: G.myId, name: playerName() }));
        }
        if (!ready) { ready = true; onReady(); }
        else if (isHost) broadcast(); // переподключились — обновляем retained-состояние
      });
    });

    client.on('message', (topic, payload) => {
      try { netOnMessage(topic, JSON.parse(payload.toString())); } catch (e) {}
    });
    client.on('close', () => { if (!ready) tryNext(); });
    client.on('error', () => {});
  }

  tryNext();
}

function netOnMessage(topic, msg) {
  if (topic === topicChat(G.code)) { chatOnMessage(msg); return; }
  if (G.mode === 'host') {
    if (topic === topicToHost(G.code)) hostHandle(msg);
    else if (topic === topicGone(G.code)) hostGone(msg);
  } else if (G.mode === 'client') {
    if (topic === topicState(G.code) && msg && typeof msg === 'object') {
      if (G.joinTimer) { clearTimeout(G.joinTimer); G.joinTimer = null; }
      G.state = msg;
      try { localStorage.setItem('smen-last-code', G.code); } catch (e) {}
      applyState(msg);
    }
  }
}

function netPublish(topic, obj) {
  if (G.mqtt && G.mqtt.connected) {
    try { G.mqtt.publish(topic, JSON.stringify(obj)); } catch (e) {}
  }
}

/* ================= Хост: сеть ================= */
function hostCreate() {
  G.mode = 'host';
  G.myId = 'host';
  G.code = makeCode();
  G.state = hostNewState();
  G.state.nextId = 1;
  hostAddPlayer('host', playerName());
  setStatus('Создаём лобби…');

  netConnect(G.code, true, () => {
    try { localStorage.setItem('smen-last-code', G.code); } catch (e) {}
    showScreen('lobby');
    renderLobby();
    broadcast();
  });
}

function hostHandle(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string') return;
  const st = G.state;
  const p = st.players.find((x) => x.id === msg.id);
  if (p) p.lastSeen = Date.now();

  if (msg.t === 'join') {
    const name = String(msg.name || 'Безымянный').slice(0, 14);
    hostAddPlayer(msg.id, name);
    if (st.phase === 'lobby') renderLobby();
    broadcast();
  } else if (msg.t === 'claim') {
    hostClaim(msg.taskId, msg.id);
  } else if (msg.t === 'act') {
    hostAct(msg.taskId, msg.id, msg.data || {});
  } else if (msg.t === 'vote-again') {
    if (G.voteAgain) {
      G.voteAgain.add(msg.id);
      const others = st.players.filter((p) => p.id !== 'host');
      const all = others.length > 0 && others.every((p) => G.voteAgain.has(p.id));
      if (all) hostAgain();
    }
  }
}

function hostGone(msg) {
  const id = typeof msg === 'string' ? msg : (msg && msg.id);
  if (typeof id !== 'string' || id === 'host') return;
  const st = G.state;
  const before = st.players.length;
  st.players = st.players.filter((p) => p.id !== id);
  if (st.players.length !== before) {
    if (st.phase === 'lobby') renderLobby();
    broadcast();
  }
}

/* ================= Клиент: сеть ================= */
function clientJoin(code) {
  G.mode = 'client';
  G.code = code;
  G.myId = 'p-' + fnv1a(G.profile.token + ':' + code) + fnv1a(code + ':' + G.profile.token);
  setStatus('Подключаемся…');
  netConnect(code, false, () => {
    showScreen('lobby');
    setStatus('');
    G.joinTimer = setTimeout(() => {
      if (!G.state) toMenu('Лобби не найдено или хост не отвечает.');
    }, 8000);
    G.pingTimer = setInterval(() => clientSend({ t: 'ping', id: G.myId }), 15000);
  });
}

function clientSend(msg) {
  msg.id = G.myId;
  netPublish(topicToHost(G.code), msg);
}

/* ================= Применение состояния (у всех) ================= */
function applyState(s) {
  if (!s) return;
  if (s.phase === 'lobby') {
    G.ruleShown = false;
    G.urgentNotified.clear();
    G.voted = false;
    document.body.classList.remove('alarm');
    showScreen('lobby');
    renderLobby();
  } else if (s.phase === 'playing') {
    showScreen('game');
    renderGame(s);
    if (!G.ruleShown && s.rules) { G.ruleShown = true; openRulebook(); }
  } else if (s.phase === 'ended') {
    document.body.classList.remove('alarm');
    showScreen('end');
    renderEnd(s);
    recordStats(s);
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
    li.appendChild(el('span', null, p.name + (p.id === 'host' ? ' — старший смены' : ' — стажёр')));
    list.appendChild(li);
  });
  const isHost = G.mode === 'host';
  $('#btn-start').classList.toggle('hidden', !isHost);
  $('#lobby-wait').classList.toggle('hidden', isHost);
}

/* ================= Отрисовка: игра ================= */
function gameMinutes(elapsed, shiftMs) {
  return Math.min(SHIFT_GAME_MIN, (elapsed / (shiftMs || SHIFT_REAL_MS)) * SHIFT_GAME_MIN);
}

function renderGame(st) {
  // шапка
  $('#hud-time').textContent = fmtTime(gameMinutes(st.elapsed, st.shiftMs));
  const dots = [];
  for (let i = 0; i < MAX_STRIKES; i++) dots.push(i < st.strikes ? '●' : '○');
  $('#hud-strikes').textContent = dots.join(' ');
  $('#hud-strikes').style.color = st.strikes >= MAX_STRIKES - 1 ? 'var(--bad)' : 'var(--text)';
  $('#hud-players').textContent = st.players.map((p) => p.name + ': ' + p.score).join(' · ');
  const me = st.players.find((p) => p.id === myId());
  if (me) G.lastScore = me.score;

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
  return G.mode === 'client' ? G.myId : '';
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
  if (t.kind === 'call' || t.kind === 'fax' || t.kind === 'camera' || t.kind === 'inventory') {
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
  } else if (t.kind === 'coffee' || t.kind === 'boss') {
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
  let alarm = false;
  document.querySelectorAll('.task').forEach((card) => {
    const id = Number(card.dataset.taskId);
    const t = st.tasks.find((x) => x.id === id);
    const fill = card.querySelector('.bar i');
    if (!t || !fill) return;
    const remaining = Math.max(0, t.expiresAt - st.elapsed);
    const pct = Math.max(0, Math.min(100, (remaining / t.ttl) * 100));
    fill.style.width = pct + '%';
    fill.className = pct < 25 ? 'crit' : (pct < 55 ? 'warn' : '');
    const urgent = remaining > 0 && remaining < 8000;
    card.classList.toggle('urgent', urgent);
    if (urgent) alarm = true;
    if (urgent && !G.urgentNotified.has(id)) {
      G.urgentNotified.add(id);
      beep(940, 0.12);
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    }
  });
  document.body.classList.toggle('alarm', alarm);
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
  const voteBtn = $('#btn-vote');
  if (voteBtn) {
    voteBtn.classList.toggle('hidden', isAuthority);
    voteBtn.disabled = G.voted;
    voteBtn.textContent = G.voted ? 'Голос отдан' : 'Просить реванш';
  }
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
    'Камера: пропуска серии <b>«' + rules.badSeries + '»</b> недействительны.',
    'Факс: шифр — сдвиг букв на <b>' + rules.faxShift + '</b>.',
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
    st.elapsed = Math.min(st.elapsed + TICK_MS, st.shiftMs || SHIFT_REAL_MS);
  }
  if ($('#screen-game').classList.contains('hidden')) return;
  $('#hud-time').textContent = fmtTime(gameMinutes(st.elapsed, st.shiftMs));
  updateTimers(st);
}, TICK_MS);

/* ================= Чат (AES-GCM, ключ из кода лобби) ================= */
const CHAT_SALT = 'smenschik-chat-v1';
const b64enc = (u8) => btoa(String.fromCharCode.apply(null, u8));
const b64dec = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function chatKey(code) {
  if (!G.chatKeys[code]) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(code + ':' + CHAT_SALT), 'PBKDF2', false, ['deriveKey']);
    G.chatKeys[code] = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(CHAT_SALT), iterations: 50000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  return G.chatKeys[code];
}

async function chatSend(raw) {
  const text = String(raw).slice(0, 120).trim();
  if (!text || !G.mqtt || !G.mqtt.connected || !G.code) return;
  try {
    const key = await chatKey(G.code);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = JSON.stringify({
      n: playerName(),
      x: text,
      m: Math.round((G.state && G.state.gameMin) || 0),
    });
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
    netPublish(topicChat(G.code), { t: 'chat', iv: b64enc(iv), ct: b64enc(new Uint8Array(ct)) });
  } catch (e) { /* без шифрования не отправляем */ }
}

async function chatOnMessage(msg) {
  if (!msg || msg.t !== 'chat' || typeof msg.iv !== 'string' || typeof msg.ct !== 'string' || !G.code) return;
  try {
    const key = await chatKey(G.code);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(msg.iv) }, key, b64dec(msg.ct));
    const data = JSON.parse(new TextDecoder().decode(plain));
    if (typeof data.x !== 'string' || !data.x.trim()) return;
    G.chat.push({
      name: String(data.n || '???').slice(0, 14),
      text: String(data.x).slice(0, 120),
      min: typeof data.m === 'number' ? data.m : null,
    });
    if (G.chat.length > 40) G.chat.shift();
    renderChat();
    beep(980, 0.08, 0.03);
  } catch (e) { /* чужой ключ или битое сообщение — молча */ }
}

function renderChat() {
  G.chatViews.forEach((list) => {
    list.innerHTML = '';
    G.chat.forEach((m) => {
      const row = el('div', 'chat-msg', null);
      const who = el('b', null, m.name);
      row.appendChild(who);
      row.appendChild(document.createTextNode((m.min !== null ? ' [' + fmtTime(m.min) + ']' : '') + ' ' + m.text));
      list.appendChild(row);
    });
    list.scrollTop = list.scrollHeight;
  });
}

function mountChat(sel) {
  const c = $(sel);
  if (!c) return;
  const list = el('div', 'chat-list');
  const row = el('div', 'chat-row');
  const input = el('input', 'chat-input');
  input.maxLength = 120;
  input.placeholder = 'Сообщение…';
  const btn = el('button', 'btn small chat-btn', '→');
  const send = () => {
    if (input.value.trim()) chatSend(input.value);
    input.value = '';
  };
  btn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  row.appendChild(input); row.appendChild(btn);
  c.appendChild(list); c.appendChild(row);
  G.chatViews.push(list);
}

/* ================= Настройки (localStorage) ================= */
const SETTINGS_KEY = 'smen-settings-v1';
const SHIFT_CHOICES = [300000, 420000, 600000];
const DIFF_CHOICES = [0.7, 1, 1.5];

function loadSettings() {
  const def = { sound: true, shiftMs: 420000, diff: 1, nyTheme: false };
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      sound: s.sound !== false,
      shiftMs: SHIFT_CHOICES.includes(s.shiftMs) ? s.shiftMs : def.shiftMs,
      diff: DIFF_CHOICES.includes(s.diff) ? s.diff : def.diff,
      nyTheme: s.nyTheme === true,
    };
  } catch (e) { return def; }
}

function applyTheme() {
  document.body.classList.toggle('ny', !!(G.settings && G.settings.nyTheme));
}

function bindSeg(id, key, numeric) {
  const wrap = $(id);
  if (!wrap) return;
  const mark = () => {
    Array.from(wrap.children).forEach((b) => {
      b.classList.toggle('on', String(G.settings[key]) === b.dataset.v);
    });
  };
  Array.from(wrap.children).forEach((b) => {
    b.addEventListener('click', () => {
      G.settings[key] = numeric ? Number(b.dataset.v) : (b.dataset.v === 'true');
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) {}
      mark();
      applyTheme();
    });
  });
  mark();
}

/* ================= Профиль (только на устройстве, без БД) ================= */
const PROFILE_KEY = 'smen-profile-v1';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.token && p.id && p.stats) return p;
    }
  } catch (e) {}
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const p = {
    id: 'u-' + fnv1a(token + ':' + Date.now()),
    token,               // никогда не покидает устройство
    name: 'Сменщик',
    created: new Date().toISOString(),
    stats: { games: 0, wins: 0, best: 0 },
  };
  saveProfile(p);
  return p;
}

function saveProfile(p) {
  const prof = p || G.profile;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(prof)); } catch (e) {}
}

function renderProfileLine() {
  const s = G.profile.stats;
  $('#profile-line').textContent = 'Профиль на устройстве: ' + G.profile.name +
    ' · смен: ' + s.games + ' · побед: ' + s.wins + ' · рекорд: ' + s.best;
}

function renderEndStats() {
  const target = $('#end-stats');
  if (!target) return;
  const s = G.profile.stats;
  let html = 'Всего смен: ' + s.games + ' · побед: ' + s.wins + ' · личный рекорд: ' + s.best;
  const top = (G.profile.history || []).slice(0, 5);
  if (top.length) {
    html += '<br>Лучшие смены: ' + top.map((h, i) => (i + 1) + '. ' + h.name + ' — ' + h.score).join(' · ');
  }
  target.innerHTML = html;
}

function recordStats(s) {
  if (G.statsRecorded || !G.profile) return;
  G.statsRecorded = true;
  const r = s.result || { win: false };
  let score = G.lastScore;
  const mine = (s.players || []).find((p) => p.id === myId());
  if (mine) score = mine.score;
  const st = G.profile.stats;
  st.games++;
  if (r.win) st.wins++;
  if (score > st.best) st.best = score;
  G.profile.history = (G.profile.history || [])
    .concat([{ name: G.profile.name, score, win: !!r.win, date: new Date().toISOString().slice(0, 10) }])
    .sort((a, b) => b.score - a.score).slice(0, 5);
  saveProfile();
  renderProfileLine();
  renderEndStats();
}

/* ================= Инициализация ================= */
function playerName() {
  const v = $('#name-input').value.trim();
  return v || 'Сменщик';
}

function init() {
  G.profile = loadProfile();
  $('#name-input').value = G.profile.name;
  $('#name-input').addEventListener('change', () => {
    G.profile.name = ($('#name-input').value.trim() || 'Сменщик').slice(0, 14);
    saveProfile();
    renderProfileLine();
  });
  $('#code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  try { $('#code-input').value = localStorage.getItem('smen-last-code') || ''; } catch (e) {}

  G.settings = loadSettings();
  bindSeg('#seg-sound', 'sound', false);
  bindSeg('#seg-shift', 'shiftMs', true);
  bindSeg('#seg-diff', 'diff', true);
  bindSeg('#seg-ny', 'nyTheme', false);
  applyTheme();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

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
  $('#btn-vote').addEventListener('click', () => {
    if (G.mode !== 'client' || G.voted) return;
    G.voted = true;
    clientSend({ t: 'vote-again', id: G.myId });
    const b = $('#btn-vote');
    b.disabled = true;
    b.textContent = 'Голос отдан';
  });
  $('#btn-end-menu').addEventListener('click', () => toMenu(''));

  $('#btn-rulebook').addEventListener('click', () => openRulebook());
  $('#btn-close-modal').addEventListener('click', () => $('#modal').classList.add('hidden'));
  $('#modal').addEventListener('click', (e) => {
    if (e.target === $('#modal')) $('#modal').classList.add('hidden');
  });

  setInterval(hostTick, TICK_MS);

  mountChat('#chat-lobby');
  mountChat('#chat-game');
  renderProfileLine();
}

init();

/* ================= Снег (новогодняя тема) ================= */
(function () {
  const cv = document.getElementById('snow');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let flakes = [];
  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener('resize', resize);
  resize();
  flakes = Array.from({ length: 90 }, () => ({
    x: Math.random() * cv.width, y: Math.random() * cv.height,
    r: 1 + Math.random() * 2.6, s: 0.4 + Math.random() * 1.1,
    ph: Math.random() * Math.PI * 2,
  }));
  function frame() {
    if (G.settings && G.settings.nyTheme) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      flakes.forEach((f) => {
        f.y += f.s;
        f.x += Math.sin(f.y / 40 + f.ph) * 0.6;
        if (f.y > cv.height + 4) { f.y = -4; f.x = Math.random() * cv.width; }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, 6.284);
        ctx.fill();
      });
    } else {
      ctx.clearRect(0, 0, cv.width, cv.height);
    }
    requestAnimationFrame(frame);
  }
  frame();
})();
