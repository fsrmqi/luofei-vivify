import { buildLayout, categories, cellIndex, choices, deviceBindings, editId, hex, isCode, isSnapshot, mediaLabels, previewLayerCount } from './keyboard.js';

const byId = id => document.getElementById(id);
const storageKey = 'vivify.oe927.v1';
const state = {
  snapshot: null, edits: new Map(), history: [], finish: 'silver',
  connected: false, busy: false, message: '', layer: 0, selected: '3,0',
  category: 'basic',
  test: false, tested: new Set(), pressed: null
};

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (isSnapshot(saved?.snapshot)) state.snapshot = saved.snapshot;
  if (['silver', 'nebula', 'petal', 'volt'].includes(saved?.finish)) state.finish = saved.finish;
  for (const edit of Array.isArray(saved?.edits) ? saved.edits : []) {
    if (edit && Number.isInteger(edit.layer) && edit.layer >= 0 && edit.layer < 32 &&
        isCode(edit.after) && (edit.before === null || isCode(edit.before))) state.edits.set(editId(edit), edit);
  }
} catch { /* 本地存储可能受浏览器限制。 */ }

const layout = buildLayout(await fetch('/oe927-mac.json').then(res => res.json()));
const keys = new Map(layout.flat().map(key => [key.id, key]));
for (const [id, edit] of state.edits) {
  if (!keys.has(`${edit.row},${edit.col}`)) state.edits.delete(id);
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      snapshot: state.snapshot, edits: [...state.edits.values()], finish: state.finish
    }));
    return true;
  } catch {
    state.message = '浏览器无法保存本地草稿，请保持页面打开。';
    return false;
  }
}

function button(text, handler, className) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  if (className) element.className = className;
  element.addEventListener('click', handler);
  return element;
}

const capButtons = new Map();
for (const row of layout) {
  const container = document.createElement('div');
  container.className = 'key-row';
  for (const key of row) {
    const cap = button(key.legend, () => selectKey(key.id), 'cap');
    cap.setAttribute('aria-label', key.name);
    cap.style.left = `${key.x / 16 * 100}%`;
    cap.style.width = `${key.width / 16 * 100}%`;
    const face = document.createElement('span');
    face.className = 'face';
    const hint = document.createElement('span');
    hint.className = 'cap-hint';
    hint.setAttribute('aria-hidden', 'true');
    cap.replaceChildren(face, hint);
    capButtons.set(key.id, { cap, face, hint });
    container.append(cap);
  }
  byId('keybed').append(container);
}

let token;
let wasDetected;
async function api(path, body) {
  if (!token) {
    const session = await fetch('/api/session');
    const data = await session.json();
    if (!session.ok) throw new Error(data.error);
    token = data.token;
  }
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-vivify-token': token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json();
  if (res.status === 403) token = undefined;
  if (!res.ok) throw new Error(data.error);
  return data;
}

const layerCount = () => state.snapshot?.layers.length ?? previewLayerCount;
const actualValue = (key, layer = state.layer) => state.snapshot?.layers[layer]?.[cellIndex(key)];
const conflict = edit => {
  if (!state.snapshot) return false;
  const actual = actualValue(edit, edit.layer);
  return actual === undefined || (edit.before !== null && edit.before !== actual && edit.after !== actual);
};

function reconcile(snapshot) {
  state.snapshot = snapshot;
  state.layer = Math.min(state.layer, snapshot.layers.length - 1);
  for (const [id, edit] of state.edits) {
    const actual = actualValue(edit, edit.layer);
    if (actual === edit.after) state.edits.delete(id);
    else if (edit.before === null && actual !== undefined) state.edits.set(id, { ...edit, before: actual });
  }
  state.history = [];
}

async function readKeyboard() {
  await run(async () => {
    let snapshot;
    try {
      ({ snapshot } = await api('keyboard'));
    } catch (error) {
      wasDetected = true;
      throw error;
    }
    wasDetected = Boolean(snapshot);
    state.connected = isSnapshot(snapshot);
    if (state.connected) {
      reconcile(snapshot);
      const conflicts = [...state.edits.values()].filter(conflict).length;
      state.message = conflicts ? `有 ${conflicts} 处与设备值冲突，选中标记的键处理。` : '';
    } else state.message = '请用 USB 数据线直连，并将键盘切到有线模式。';
  });
}

async function run(task) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await task();
  } catch (error) {
    state.connected = false;
    state.message = error.message;
  } finally {
    state.busy = false;
    save();
    render();
  }
}

function selectKey(id) {
  state.selected = id;
  byId('search').value = '';
  render();
}

function changeEntries(updates) {
  if (state.busy) return;
  const previous = new Map();
  for (const [id, edit] of updates) {
    previous.set(id, state.edits.get(id));
    if (edit) state.edits.set(id, edit);
    else state.edits.delete(id);
  }
  state.history.push(previous);
  state.message = '';
  save();
  render();
}

function choose(code) {
  const { row, col } = keys.get(state.selected);
  const key = { layer: state.layer, row, col };
  const id = editId(key);
  const edit = state.edits.get(id);
  const before = actualValue(key) ?? null;
  if (edit && conflict(edit)) return;
  changeEntries([[id, code === before ? null : { ...key, before, after: code }]]);
}

function undo() {
  if (state.busy) return;
  for (const [id, edit] of state.history.pop() ?? []) {
    if (edit) state.edits.set(id, edit);
    else state.edits.delete(id);
  }
  state.message = '';
  save();
  render();
}

function resolveConflict(keep) {
  const key = { ...keys.get(state.selected), layer: state.layer };
  const id = editId(key);
  const actual = actualValue(key);
  const edit = state.edits.get(id);
  changeEntries([[id, keep && actual !== undefined ? { ...edit, before: actual } : null]]);
}

async function writeKeyboard() {
  if (!state.connected || !state.edits.size || [...state.edits.values()].some(conflict)) return;
  await run(async () => {
    const sent = [...state.edits.values()];
    const { results, error } = await api('keyboard', sent);
    let written = 0;
    for (const result of results) {
      if (result.actual !== undefined) state.snapshot.layers[result.layer][cellIndex(result)] = result.actual;
      if (result.status === 'written') {
        state.edits.delete(editId(result));
        written++;
      }
    }
    state.history = [];
    if (error) {
      state.connected = false;
      state.message = `已确认 ${written} 处。剩余修改已保留，请重新读取键盘。 ${error}`;
    } else if (results.some(result => result.status === 'conflict')) {
      state.message = '键盘配置有变动，请处理冲突后重试。';
    } else state.message = `已写入并核对 ${written} 处键位。`;
  });
}

function exportSnapshot() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state.snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `flow2-84-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importSnapshot(file) {
  if (!file || !state.snapshot || state.busy) return;
  try {
    if (file.size > 200_000) throw new Error('快照文件过大。');
    const snapshot = JSON.parse(await file.text());
    if (state.busy) throw new Error('正在读取键盘，请稍后重试。');
    if (!isSnapshot(snapshot) || snapshot.layers.length !== layerCount()) {
      throw new Error('快照的型号、协议或层数与当前布局不匹配。');
    }
    const updates = new Map([...state.edits.keys()].map(id => [id, null]));
    for (let layer = 0; layer < layerCount(); layer++) {
      for (const { row, col } of keys.values()) {
        const key = { layer, row, col };
        const before = actualValue(key, layer);
        const after = snapshot.layers[layer][cellIndex(key)];
        if (before !== after) updates.set(editId(key), { ...key, before, after });
      }
    }
    if (state.edits.size && !window.confirm('用快照的差异替换当前草稿？')) return;
    if (updates.size) changeEntries(updates);
    state.message = updates.size ? '快照差异已载入草稿。' : '快照与当前键位一致。';
  } catch (error) {
    state.message = error.message;
  }
  render();
}

// 浏览器 KeyboardEvent.code 到键值的映射；字母、数字、功能键按区间推导。
const browserCodes = {
  Escape: 0x29, Enter: 0x28, Tab: 0x2b, Space: 0x2c, Backspace: 0x2a,
  Minus: 0x2d, Equal: 0x2e, BracketLeft: 0x2f, BracketRight: 0x30,
  Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39,
  Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e,
  ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52,
  NumLock: 0x53, NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56,
  NumpadAdd: 0x57, NumpadEnter: 0x58, NumpadDecimal: 0x63, NumpadEqual: 0x67,
  PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
  ShiftLeft: 0xe1, ShiftRight: 0xe5, ControlLeft: 0xe0, ControlRight: 0xe4,
  AltLeft: 0xe2, AltRight: 0xe6, MetaLeft: 0xe3, MetaRight: 0xe7
};

function keycodeOf(event) {
  const { code } = event;
  if (/^Key[A-Z]$/.test(code)) return 0x04 + code.charCodeAt(3) - 65;
  if (/^Digit[0-9]$/.test(code)) return code === 'Digit0' ? 0x27 : 0x1e + Number(code.slice(5)) - 1;
  if (/^F([1-9]|1[0-2])$/.test(code)) return 0x3a + Number(code.slice(1)) - 1;
  if (/^Numpad[0-9]$/.test(code)) return code === 'Numpad0' ? 0x62 : 0x59 + Number(code.slice(6)) - 1;
  return browserCodes[code];
}

// 找出当前层里实际输出该键值的物理键。
function keysProducing(keycode) {
  return [...keys.values()].filter(key => actualValue(key) === keycode);
}

function handleTestKey(event, down) {
  if (!state.test) return;
  const keycode = keycodeOf(event);
  if (keycode === undefined) return;
  // 测试态下接管按键，避免 Tab 切焦点、空格滚页干扰观察。
  event.preventDefault();
  if (!down) {
    state.pressed = null;
    render();
    return;
  }
  const targets = keysProducing(keycode);
  state.pressed = keycode;
  for (const key of targets) state.tested.add(key.id);
  state.message = targets.length
    ? `按到 ${targets.map(key => key.name).join('、')}（${display(keycode)}）`
    : `按到未映射键 ${hex(keycode)}`;
  render();
}

function renderCategories() {
  const search = byId('search').value.trim();
  // 搜索时跨全部分类匹配，分类按钮只作提示，不参与筛选。
  const nodes = categories.map(category => {
    const tab = button(category.name, () => {
      state.category = category.id;
      byId('search').value = '';
      renderOptions();
    }, 'category');
    tab.setAttribute('aria-pressed', !search && state.category === category.id);
    return tab;
  });
  byId('categories').replaceChildren(...nodes);
}

function renderOptions() {
  const options = choices(layerCount());
  const query = byId('search').value.trim().toLowerCase();
  // 有搜索词就在全量里找，否则只看当前分类。
  const matches = query
    ? options.filter(option => `${option.label} ${option.aliases} ${hex(option.code)}`.toLowerCase().includes(query))
    : options.filter(option => option.category === state.category);
  const selected = keys.get(state.selected);
  const edit = state.edits.get(editId({ ...selected, layer: state.layer }));
  const blocked = state.busy || (edit && conflict(edit));
  const nodes = matches.map(option => {
    const glyph = option.code === 0xe3 ? '⌘ ' : option.code === 0xe2 ? '⌥ ' : '';
    const item = button(glyph + option.label, () => choose(option.code), 'option');
    item.title = option.aliases ? `${option.aliases} · ${hex(option.code)}` : hex(option.code);
    item.disabled = blocked;
    return item;
  });
  if (!nodes.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '未找到匹配的键位';
    nodes.push(empty);
  }
  renderCategories();
  byId('options').replaceChildren(...nodes);
}

const labelCache = new Map();
function labelsFor(count) {
  if (!labelCache.has(count)) labelCache.set(count, new Map(choices(count).map(option => [option.code, option.label])));
  return labelCache.get(count);
}

function display(value) {
  if (!isCode(value)) return '未读取';
  return deviceBindings.get(value)?.label ?? labelsFor(layerCount()).get(value) ?? `自定义 ${hex(value)}`;
}

function render() {
  const labels = labelsFor(layerCount());
  const status = byId('status');
  status.className = state.connected ? 'online' : '';
  status.textContent = state.busy ? '正在与键盘通信' : state.connected ? '有线已连接' : '离线编辑';
  byId('refresh').disabled = state.busy;
  const activeLayers = Array.from({ length: layerCount() }, (_, layer) => {
    const tab = button(layer === 0 ? '基础层' : layer === 1 ? '功能层' : `层 ${layer}`, () => {
      state.layer = layer;
      byId('search').value = '';
      render();
    }, 'tab');
    tab.setAttribute('aria-pressed', state.layer === layer);
    const inLayer = [...state.edits.values()].filter(edit => edit.layer === layer);
    tab.classList.toggle('has-edits', inLayer.length > 0);
    tab.classList.toggle('has-conflict', inLayer.some(conflict));
    return tab;
  });
  // 保留焦点，避免每次预览更新时重新创建同一组层按钮。
  const previousTabs = [...byId('layers').children];
  if (previousTabs.length !== activeLayers.length) byId('layers').replaceChildren(...activeLayers);
  else activeLayers.forEach((tab, i) => {
    previousTabs[i].className = tab.className;
    previousTabs[i].setAttribute('aria-pressed', tab.getAttribute('aria-pressed'));
  });

  byId('keyboard').dataset.finish = state.finish;
  byId('finish').value = state.finish;
  for (const [id, { cap, face, hint }] of capButtons) {
    const key = keys.get(id);
    const edit = state.edits.get(editId({ ...key, layer: state.layer }));
    const actual = actualValue(key);
    const selected = id === state.selected;
    const shown = edit ? edit.after : actual;
    const printed = !edit && (shown === undefined || (state.layer === 0 && shown === key.printedCode));
    const deviceBinding = deviceBindings.get(shown);
    const inherited = shown === 1;
    const shortLabel = deviceBinding?.short ?? mediaLabels.get(shown);
    const preview = shortLabel ?? (printed || inherited ? key.legend :
      labels.has(shown) ? display(shown) : '自定义');
    const physicalLabel = key.row === 0 && key.col >= 1 && key.col <= 12 ? `F${key.col}` : key.legend;
    const annotation = inherited ? '继承' : shortLabel ? physicalLabel : '';
    hint.hidden = !annotation;
    if (hint.textContent !== annotation) hint.textContent = annotation;
    if (face.textContent !== preview) face.textContent = preview;
    cap.setAttribute('aria-pressed', selected);
    cap.classList.toggle('changed', Boolean(edit));
    cap.classList.toggle('tested', state.tested.has(id));
    cap.classList.toggle('pressed', state.test && shown === state.pressed);
    cap.classList.toggle('conflicted', Boolean(edit && conflict(edit)));
    cap.classList.toggle('inherited', !edit && state.layer > 0 && actual === 1);
    const description = shown === undefined ? key.name : `${key.name} · ${display(shown)}`;
    cap.title = description;
    cap.setAttribute('aria-description', shown === undefined ? '' : display(shown));
  }

  const selected = keys.get(state.selected);
  const edit = state.edits.get(editId({ ...selected, layer: state.layer }));
  const actual = actualValue(selected);
  const conflicted = Boolean(edit && conflict(edit));
  byId('before').textContent = display(actual);
  const inspected = edit?.after ?? actual;
  const deviceBinding = deviceBindings.get(inspected);
  const note = byId('binding-note');
  const fn = keys.get('5,0');
  const fnCode = state.edits.get('0:5,0')?.after ?? actualValue(fn, 0);
  const physicalName = selected.row === 0 && selected.col >= 1 && selected.col <= 12 ? `F${selected.col}` : selected.name;
  const shortcut = state.layer > 0 && fnCode === 0x5220 + state.layer && inspected !== 1 ?
    `Fn + ${selected.row === 1 && selected.col >= 1 && selected.col <= 10 ? selected.legend.split(' ')[0] : physicalName}` : '';
  byId('physical').textContent = shortcut || physicalName;
  note.textContent = inspected === 1 ? '这颗键沿用下方生效层的绑定。' :
    deviceBinding ? `${deviceBinding.hint} 键值 ${hex(inspected)}` :
    isCode(inspected) && !labels.has(inspected) ? `原始键值 ${hex(inspected)}，具体功能待确认。` : '';
  note.hidden = !note.textContent;
  byId('arrow').hidden = !edit;
  byId('after').textContent = edit ? display(edit.after) : '';
  byId('conflict').hidden = !conflicted;
  byId('conflict-text').textContent = conflicted ? `草稿基于 ${display(edit.before)}，设备当前为 ${display(actual)}。` : '';
  byId('keep-edit').disabled = state.busy || actual === undefined;
  byId('discard-edit').hidden = !edit || conflicted;
  byId('discard-edit').disabled = state.busy;
  byId('use-device').disabled = state.busy;
  byId('layer-note').textContent = state.snapshot ? `VIA ${state.snapshot.protocol} · ${layerCount()} 层` : '布局预览';
  byId('export').disabled = !state.snapshot || state.busy;
  byId('import').disabled = !state.snapshot || state.busy;
  const count = state.edits.size;
  const conflicts = [...state.edits.values()].filter(conflict).length;
  byId('changes').classList.toggle('dirty', count > 0);
  byId('changes').textContent = count ? `${count} 处待写入${conflicts ? ` · ${conflicts} 处冲突` : ''}` : '没有待写入的修改';
  byId('message').textContent = state.message;
  byId('undo').disabled = !state.history.length || state.busy;
  byId('apply').disabled = !state.connected || !count || Boolean(conflicts) || state.busy;
  renderOptions();
}

byId('search').addEventListener('input', renderOptions);

byId('key-test').addEventListener('click', () => {
  state.test = !state.test;
  state.pressed = null;
  if (state.test) state.tested.clear();
  byId('key-test').setAttribute('aria-pressed', state.test);
  byId('key-test').textContent = state.test ? '结束测试' : '按键测试';
  state.message = state.test ? '按下键盘上的键，页面会标记它落在哪颗键上。' : '';
  render();
});
// 测试态在捕获阶段接管，避免页面控件先吃掉按键。
window.addEventListener('keydown', event => handleTestKey(event, true), true);
window.addEventListener('keyup', event => handleTestKey(event, false), true);
byId('device-help').addEventListener('click', () => byId('help').showModal());
byId('touch-help').addEventListener('click', () => {
  byId('help').showModal();
  byId('touch-section').focus();
});
byId('finish').addEventListener('change', event => { state.finish = event.target.value; save(); render(); });
byId('refresh').addEventListener('click', readKeyboard);
byId('apply').addEventListener('click', writeKeyboard);
byId('undo').addEventListener('click', undo);
byId('discard-edit').addEventListener('click', () => resolveConflict(false));
byId('use-device').addEventListener('click', () => resolveConflict(false));
byId('keep-edit').addEventListener('click', () => resolveConflict(true));
byId('export').addEventListener('click', exportSnapshot);
byId('import').addEventListener('click', () => byId('snapshot-file').click());
byId('snapshot-file').addEventListener('change', event => {
  importSnapshot(event.target.files[0]);
  event.target.value = '';
});

render();
await readKeyboard();
setInterval(async () => {
  if (state.busy || document.hidden) return;
  let status;
  try { status = await api('status'); } catch {
    wasDetected = undefined;
    if (state.connected && !state.busy) {
      state.connected = false;
      state.message = '本机键盘服务暂不可用，草稿已保留。';
      render();
    }
    return;
  }
  if (state.busy || status.detected === wasDetected) return;
  wasDetected = status.detected;
  if (status.detected) await readKeyboard();
  else {
    state.connected = false;
    state.message = '键盘已断开，仍可编辑本地草稿。';
    render();
  }
}, 3500);
