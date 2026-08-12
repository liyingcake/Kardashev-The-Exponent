/* ============================================================
 * 《文明指数》demo-v2 — 游戏引擎 game.js v2.0
 * 三轴玩法：放置 / 连线 / 升级；引导任务；里程碑卡；事件横幅
 * 数值按《00_反思与v2设计.md》5.2
 * ============================================================ */
(function () {
  'use strict';
  const SAVE_KEY = 'exponent-demo-v2';

  const state = {
    era: 0, P: 0, energyPool: 10000, research: 0,
    nodes: [], links: [], stock: { wood: 0, food: 0, water: 0, ore: 0, metal: 0 },
    techs: {}, traits: {}, events: {}, tasks: {},
    activeEvent: null, traitPending: false, idSeq: 1,
    selectedId: null, placingType: null,
    log: [],
  };

  const $ = (id) => document.getElementById(id);
  const fmtP = (w) => w >= 1e15 ? (w/1e15).toFixed(2)+' PW' : w >= 1e12 ? (w/1e12).toFixed(2)+' TW'
    : w >= 1e9 ? (w/1e9).toFixed(2)+' GW' : w >= 1e6 ? (w/1e6).toFixed(2)+' MW'
    : w >= 1e3 ? (w/1e3).toFixed(1)+' kW' : w.toFixed(0)+' W';
  const fmtN = (n) => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'k' : n.toFixed(1);
  const kOf = (p) => (Math.log10(Math.max(p,1)) - 6) / 10;
  const nextTarget = (era) => Math.pow(10, 6 + era + 1);
  const nodeType = (n) => DATA.nodes[n.type];

  // ---- 派生 ----
  function pop() { return Math.round(Math.pow(Math.max(state.P,1e3), 0.5) * 50); }
  function availWorkers() { return Math.floor(pop() / 50); }
  function assignedWorkers() { return state.nodes.reduce((s, n) => s + n.workers, 0); }
  function levelMult(n) { return Math.pow(UPGRADE.powerMult, (n.level || 1) - 1); }
  function techNodeMult(type) {
    let m = 1;
    for (const t of DATA.techs) if (state.techs[t.id] && t.effect && t.effect.type === 'buff' && t.effect.node === type) m *= t.effect.mult;
    return m;
  }
  function techResMult(res) {
    let m = 1;
    for (const t of DATA.techs) if (state.techs[t.id] && t.effect && t.effect.type === 'buff' && t.effect.res === res) m *= t.effect.mult;
    return m;
  }
  function traitMult(key) {
    let m = 1;
    for (const tr of DATA.traits) if (state.traits[tr.id] && tr.eff[key]) m *= (1 + tr.eff[key]);
    return m;
  }

  function nodeActive(n) {
    const t = nodeType(n);
    const hasIn = state.links.some(l => l.to === n.id);
    const hasOut = state.links.some(l => l.from === n.id);
    if (t.cat === 'source') return hasOut;
    if (t.cat === 'work') return hasIn && hasOut;
    return hasIn;
  }
  function totalPower() {
    let p = 0;
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'energy' && nodeActive(n)) p += t.power * levelMult(n) * techNodeMult(n.type) * (n.debuff || 1);
    }
    return p * traitMult('power');
  }
  function chainEROI() {
    let inEq = 0;
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'energy' && nodeActive(n)) for (const k in t.in) inEq += t.in[k] * (DATA.resources[k].equiv || 0);
    }
    const p = totalPower();
    return inEq > 0 ? p / inEq : (p > 0 ? 99 : 0);
  }
  function researchRate() {
    let r = state.P / 2e4 * techResMult('research') * traitMult('research');
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'research' && nodeActive(n) && n.workers >= t.workers) r += t.rps * techNodeMult(n.type) * (n.debuff || 1);
    }
    return r;
  }

  // ---- 操作 ----
  function placeCost() { return 500 * (1 + 0.1 * state.nodes.length); }
  function placeNode(type, x, y) {
    const t = DATA.nodes[type];
    if (!t) return false;
    if (state.era < t.era) { log('🔒 ' + t.name + ' 属于 ' + DATA.eras[t.era].name + ' 纪元', ''); return false; }
    if (t.tech && !state.techs[t.tech]) { log('🔒 需科技：' + DATA.techs.find(x => x.id === t.tech).name, ''); return false; }
    const cost = placeCost();
    if (state.energyPool < cost) { log('⚡ 能量不足：需 ' + fmtN(cost) + ' J（上限 50k，多建节点充能）', ''); return false; }
    if (t.reqRes) for (const k in t.reqRes) if (state.stock[k] < t.reqRes[k]) { log('🔒 需资源 ' + DATA.resources[k].name + '×' + t.reqRes[k], ''); return false; }
    state.energyPool -= cost;
    const id = 'n' + (state.idSeq++);
    state.nodes.push({ id, type, x, y, workers: 0, level: 1, active: false, shortage: false, power: 0 });
    for (const k in (t.reqRes || {})) state.stock[k] -= t.reqRes[k];
    log('🏗️ 放置 ' + t.icon + ' ' + t.name, '');
    onGraphChanged();
    return true;
  }
  function addLink(fromId, toId) {
    const a = state.nodes.find(n => n.id === fromId), b = state.nodes.find(n => n.id === toId);
    if (!a || !b) return;
    const ta = nodeType(a), tb = nodeType(b);
    if (!ta.out || !(tb.in || tb.cat === 'research')) { log('⚠️ 需「有输出 → 有输入」', ''); return; }
    if (state.links.some(l => l.from === fromId && l.to === toId)) { log('⚠️ 已存在该连线', ''); return; }
    state.links.push({ from: fromId, to: toId });
    log('🔗 连线：' + ta.name + ' → ' + tb.name, '');
    onGraphChanged();
  }
  function upgradeNode(id) {
    const n = state.nodes.find(x => x.id === id);
    if (!n) return;
    if (n.level >= UPGRADE.maxLevel) { log('🔝 已达最高等级 Lv' + UPGRADE.maxLevel, ''); return; }
    const cost = UPGRADE.costBase * Math.pow(UPGRADE.costGrowth, n.level - 1);
    if (state.energyPool < cost) { log('⚡ 升级需 ' + fmtN(cost) + ' J', ''); return; }
    state.energyPool -= cost;
    n.level += 1;
    log('⬆️ ' + DATA.nodes[n.type].name + ' → Lv' + n.level + '（+50% 产出）', '');
    onGraphChanged();
  }
  function assignWorker(id, delta) {
    const n = state.nodes.find(x => x.id === id);
    if (!n) return;
    const t = nodeType(n);
    const avail = availWorkers() - (assignedWorkers() - n.workers);
    if (delta > 0 && n.workers >= t.workers) { log('👷 该节点满编', ''); return; }
    if (delta > 0 && avail <= 0) { log('👥 劳动力不足（可用 ' + availWorkers() + '，人口 ' + fmtN(pop()) + '）', ''); return; }
    if (delta < 0 && n.workers <= 0) return;
    n.workers += delta;
    onGraphChanged();
  }
  function buyTech(id) {
    const t = DATA.techs.find(x => x.id === id);
    if (!t || state.techs[id] || state.era < t.era) return;
    if (!t.prereq.every(p => state.techs[p])) { log('🔒 需前置科技', ''); return; }
    if (state.research < t.cost) { log('🧪 科研不足：需 ' + fmtN(t.cost), ''); return; }
    state.research -= t.cost;
    state.techs[id] = true;
    log('🧪 科技解锁：' + t.name, '');
    renderTechs();
    checkTasks();
  }

  // ---- 任务 ----
  function taskDone(t) {
    switch (t.id) {
      case 't1': return state.nodes.some(n => n.type === 'forest' && nodeActive(n));
      case 't2': { const c = state.nodes.find(n => n.type === 'campfire'); return c && c.workers >= nodeType(c).workers; }
      case 't3': return chainEROI() >= 3;
      case 't4': return state.nodes.some(n => (n.level || 1) >= 2);
      case 't5': return !!state.techs.fire_mastery;
      default: return false;
    }
  }
  function checkTasks() {
    for (const t of DATA.tasks) {
      if (state.tasks[t.id]) continue;
      if (taskDone(t)) {
        state.tasks[t.id] = true;
        state.energyPool = Math.min(50000, state.energyPool + t.reward);
        log('🎯 任务完成：' + t.name + '（+' + fmtN(t.reward) + ' J）', 'era-log');
        renderTasks();
      }
    }
  }

  // ---- 事件（里程碑触发）----
  function checkEvents() {
    for (const ev of DATA.events) {
      if (state.events[ev.id] || state.activeEvent) continue;
      const tr = ev.trigger;
      let hit = false;
      if (tr.type === 'nodes') hit = state.nodes.filter(n => n.type === tr.node).length >= tr.count;
      if (tr.type === 'era') hit = state.era >= tr.at;
      if (hit) { state.activeEvent = ev; renderEventBanner(); return; }
    }
  }
  function applyEventChoice(ev, opt) {
    let res = opt.result;
    if (opt.effect.type === 'debuff') {
      for (const n of state.nodes) if (n.type === opt.effect.node) n.debuff = (n.debuff || 1) * opt.effect.mult;
      res += '（' + DATA.nodes[opt.effect.node].name + ' ×' + opt.effect.mult + '）';
    }
    if (opt.effect.type === 'lossP') { state.P *= (1 - opt.effect.pct); res += '（功率 -' + (opt.effect.pct * 100).toFixed(0) + '%）'; }
    log('🌍 事件应对：' + ev.name + ' — ' + res, '');
    state.events[ev.id] = true;
    state.activeEvent = null;
    $('eventBanner').classList.add('hidden');
    renderEventBanner();
  }

  // ---- 结算引擎 ----
  const TICK = 250;
  let last = Date.now();
  function settle() {
    const now = Date.now();
    const dt = Math.min(500, now - last) / 1000;
    last = now;
    if (state.traitPending) return;

    for (const n of state.nodes) {
      const t = nodeType(n);
      if (!nodeActive(n)) { n.shortage = false; if (t.cat === 'energy') n.power = 0; continue; }
      const mult = levelMult(n) * (n.debuff || 1) * (t.cat === 'source' ? techResMult(Object.keys(t.out)[0]) : techNodeMult(n.type));
      if (t.cat === 'source') {
        for (const k in t.out) {
          const r = DATA.resources[k];
          if (state.stock[k] < r.cap) state.stock[k] = Math.min(r.cap, state.stock[k] + t.out[k] * mult * dt);
        }
      } else if (t.cat === 'work') {
        if (n.workers < t.workers) { n.shortage = false; continue; }
        const ik = Object.keys(t.in)[0], ok = Object.keys(t.out)[0];
        const need = t.in[ik] * dt;
        if (state.stock[ik] >= need) {
          state.stock[ik] -= need;
          const r = DATA.resources[ok];
          state.stock[ok] = Math.min(r.cap, state.stock[ok] + t.out[ok] * mult * dt);
          n.shortage = false;
        } else n.shortage = true;
      } else if (t.cat === 'energy') {
        if (n.workers < t.workers) { n.power = 0; continue; }
        const ik = Object.keys(t.in)[0];
        const need = t.in[ik] * dt;
        if (state.stock[ik] >= need) { state.stock[ik] -= need; n.shortage = false; n.power = t.power * mult; }
        else { n.shortage = true; n.power = 0; }
      } else if (t.cat === 'research') {
        if (n.workers < t.workers) continue;
        if (state.energyPool >= t.power * dt) { state.energyPool -= t.power * dt; state.research += t.rps * mult * dt; }
      }
    }

    state.P = totalPower();
    state.energyPool = Math.min(50000, state.energyPool + state.P * 0.3 * dt);
    state.research += researchRate() * dt;

    checkEvents();
    checkTasks();
    refresh();
  }
  setInterval(settle, TICK);

  // ---- 存档 ----
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s || !s.nodes) return false;
      Object.assign(state, s);
      if (!state.log) state.log = [];
      if (state.traitPending === undefined) state.traitPending = false;
      return true;
    } catch (e) { return false; }
  }
  function hardReset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); }
  const copyText = (t) => {
    const done = () => log('📤 已复制', '');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => ta(t));
    else ta(t);
  };
  function ta(t) {
    const x = document.createElement('textarea'); x.value = t; x.style.position = 'fixed'; x.style.opacity = '0';
    document.body.appendChild(x); x.select(); document.execCommand('copy'); document.body.removeChild(x);
    log('📤 已复制', '');
  }
  function exportSave() { save(); copyText(JSON.stringify(state)); }
  function importSave() {
    const raw = prompt('粘贴存档 JSON：');
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (!s.nodes) throw new Error('无效存档');
      Object.assign(state, s);
      if (!state.log) state.log = [];
      save(); renderAll();
      log('📥 已导入', '');
    } catch (e) { alert('导入失败：' + e.message); }
  }

  // ---- 渲染 ----
  function log(msg, cls) { state.log.unshift({ t: Date.now(), msg, cls }); if (state.log.length > 40) state.log.length = 40; renderLog(); }

  function refresh() {
    const k = kOf(state.P);
    $('kval').textContent = k.toFixed(3);
    $('kbar-fill').style.width = Math.min(100, Math.max(0, k / 0.4 * 100)) + '%';
    $('eraname').textContent = DATA.eras[state.era].icon + ' ' + DATA.eras[state.era].name;
    $('pval').textContent = fmtP(state.P);
    $('popval').textContent = fmtN(pop()) + ' 人';
    $('workerval').textContent = assignedWorkers() + '/' + availWorkers();
    $('energyval').textContent = fmtN(state.energyPool) + '/50k J';
    $('researchval').textContent = fmtN(state.research) + '（+' + fmtN(researchRate()) + '/s）';

    // 资源条
    $('resBars').innerHTML = Object.keys(DATA.resources).map(k => {
      const r = DATA.resources[k], v = state.stock[k] || 0;
      return '<div class="resbar"><span>' + r.icon + ' ' + r.name + '</span>' +
        '<div class="resbar-track"><div class="resbar-fill" style="width:' + Math.min(100, v / r.cap * 100) + '%"></div></div>' +
        '<b>' + fmtN(v) + '</b></div>';
    }).join('');

    // EROI 状态条
    const er = chainEROI();
    const erEl = $('eroiVal');
    erEl.textContent = er > 90 ? '∞' : er.toFixed(1);
    erEl.style.color = er > 90 || er >= 3 ? '#7fe0a8' : er >= 1.5 ? '#ffd97a' : '#ff5d5d';
    $('eroiState').textContent = er > 90 ? '无燃料能源' : er >= 3 ? '可持续' : er >= 1.5 ? '⚠ 警戒' : '🚨 崩塌风险';
    $('eroiState').style.color = erEl.style.color;
    const short = state.nodes.filter(n => n.shortage).length;
    $('supplyVal').textContent = short > 0 ? '⚠️ ' + short + ' 节点缺料' : '✅ 供给正常';

    // 里程碑卡
    const nt = nextTarget(state.era);
    const reached = state.P >= nt;
    $('milestoneTarget').textContent = fmtP(nt);
    const nextEra = DATA.eras[state.era + 1];
    $('milestoneNext').textContent = reached ? '🎉 已达标！点「纪元更替」' : (nextEra ? '→ 进入「' + nextEra.name + '」' : '教学段终点');
    $('milestoneBar').style.width = Math.min(100, state.P / nt * 100) + '%';
    $('eraupgrade-box').classList.toggle('hidden', !(reached && !state.traitPending && state.era < 4));
  }

  function renderTechs() {
    $('techList').innerHTML = DATA.techs.map(t => {
      const bought = !!state.techs[t.id], visible = state.era >= t.era;
      const prereqOk = t.prereq.every(p => state.techs[p]);
      const afford = state.research >= t.cost;
      const flag = !visible ? '🔒' : !prereqOk ? '🔒' : bought ? '✅' : afford ? '' : '🧪';
      return '<div class="tech-item ' + (bought ? 'bought' : '') + '" data-tech="' + t.id + '">' +
        '<span class="t-name">' + t.icon + ' ' + t.name + '</span>' +
        '<span class="t-flag">' + flag + '</span>' +
        '<span class="t-cost">' + (bought ? '' : fmtN(t.cost)) + '</span></div>';
    }).join('');
    $('techList').querySelectorAll('[data-tech]').forEach(d => d.addEventListener('click', () => buyTech(d.dataset.tech)));
  }
  function renderTasks() {
    $('taskList').innerHTML = DATA.tasks.map(t => {
      const done = !!state.tasks[t.id];
      return '<div class="task-item ' + (done ? 'done' : '') + '">' + (done ? '✅' : '⬜') + ' ' + t.name +
        '<span class="hint">' + (done ? '' : '奖励 ' + fmtN(t.reward) + 'J') + '</span></div>';
    }).join('');
  }
  function renderEventBanner() {
    const ev = state.activeEvent, el = $('eventBanner');
    if (!ev) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '<div class="ev-tag">⚠️ 文明事件：' + ev.name + '</div>' +
      '<div class="ev-cause">' + ev.cause.join(' → ') + '</div>' +
      ev.options.map((o, i) => '<button class="btn ev-btn" data-opt="' + i + '">' + o.text + '</button>').join('');
    el.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
      applyEventChoice(ev, ev.options[+b.dataset.opt]);
    }));
  }
  function renderLog() { $('logList').innerHTML = state.log.map(l => '<div>' + l.msg + '</div>').join(''); }

  function renderAll() { renderTechs(); renderTasks(); renderEventBanner(); renderLog(); onGraphChanged(); }

  // ---- 纪元更替 ----
  function tryUpgrade() {
    if (state.P < nextTarget(state.era) || state.traitPending) return;
    const nextEra = DATA.eras[state.era + 1];
    if (!nextEra) { log('🏆 教学段完成 K=0.4！', 'era-log'); return; }
    state.traitPending = true;
    $('erao-icon').textContent = nextEra.icon;
    $('erao-name').textContent = nextEra.name;
    $('erao-desc').textContent = nextEra.desc;
    $('eraOverlay').classList.remove('hidden');
    const pool = DATA.traits.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    $('traitList').innerHTML = pool.map(t =>
      '<div class="trait-item" data-trait="' + t.id + '">' +
      '<span class="t-icon">' + t.icon + '</span>' +
      '<div><div class="t-name">' + t.name + '</div><div class="t-desc">' + t.desc + '</div></div></div>').join('');
    $('traitList').querySelectorAll('[data-trait]').forEach(d => d.addEventListener('click', () => {
      const t = DATA.traits.find(x => x.id === d.dataset.trait);
      $('eraOverlay').classList.add('hidden'); $('traitOverlay').classList.add('hidden');
      try {
        state.traits[t.id] = true; state.era += 1; state.traitPending = false; state.activeEvent = null;
        log('⚜️ 纪元更替 → ' + DATA.eras[state.era].icon + ' ' + DATA.eras[state.era].name + '（特质：' + t.name + '）', 'era-log');
        renderAll();
      } catch (e) { log('⚠️ 特质出错', ''); }
    }));
  }

  // ---- 图变化 / 上下文面板 ----
  function onGraphChanged() {
    for (const n of state.nodes) { n.active = nodeActive(n); if (!n.active) n.shortage = false; }
    renderNodePanel();
  }
  function renderNodePanel() {
    const box = $('nodePanel');
    const n = state.nodes.find(x => x.id === state.selectedId);
    if (!n) {
      box.innerHTML = '<p class="hint">👆 点击画布中的节点：查看详情 / 雇工 / 升级 / 连线。<br><br>连线方式：点源节点 → 目标可连节点亮绿 → 点目标。右键节点可断开。</p>' +
        '<h2 style="margin-top:12px">＋ 添加节点</h2><div id="palette"></div><p class="hint" id="palHint"></p>';
      renderPalette();
      return;
    }
    const t = nodeType(n);
    const upCost = UPGRADE.costBase * Math.pow(UPGRADE.costGrowth, n.level - 1);
    let html = '<div class="ni-head">' + t.icon + ' <b>' + t.name + '</b> <span class="' + (n.active ? 'ni-on' : 'ni-off') + '">' + (n.active ? '● 运行' : '○ 未连线') + '</span></div>';
    if (t.cat === 'source') html += '<div class="ni-row">产出：' + Object.entries(t.out).map(([k, v]) => DATA.resources[k].icon + ' ' + (v * levelMult(n) * (n.debuff || 1)).toFixed(1) + '/s').join(' ') + '</div>';
    if (t.cat === 'work') html += '<div class="ni-row">' + Object.entries(t.in).map(([k, v]) => DATA.resources[k].icon + ' ' + v + '/s').join(' ') + ' → ' + Object.entries(t.out).map(([k, v]) => DATA.resources[k].icon + ' ' + v + '/s').join(' ') + '</div>';
    if (t.cat === 'energy') html += '<div class="ni-row">⚡ ' + fmtP(t.power * levelMult(n) * (n.debuff || 1)) + ' ｜ 耗 ' + Object.entries(t.in).map(([k, v]) => DATA.resources[k].icon + ' ' + v + '/s').join('') + '</div>';
    if (t.cat === 'research') html += '<div class="ni-row">🔬 +' + t.rps * levelMult(n) + '/s（耗 ⚡' + t.power + 'W）</div>';
    html += '<div class="ni-row">📦 库存 ' + fmtN(state.stock[Object.keys(t.out || t.in || {})[0]] || 0) + '</div>';
    if (t.workers) html += '<div class="ni-row">👷 ' + n.workers + '/' + t.workers +
      ' <button class="btn btn-mini" data-w="1">+</button><button class="btn btn-mini" data-w="-1">−</button></div>';
    if (n.level && n.level < UPGRADE.maxLevel && (t.cat === 'source' || t.cat === 'energy')) {
      html += '<div class="ni-row">⬆️ Lv' + n.level + ' → Lv' + (n.level + 1) + '（+50%）<button class="btn btn-mini" data-up="1">升级 ' + fmtN(upCost) + 'J</button></div>';
    }
    html += '<div class="ni-row"><button class="btn btn-mini" data-dis="1">✂️ 断开</button><button class="btn btn-mini" data-card="1">📖 科学卡</button></div>';
    box.innerHTML = html;
    box.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => assignWorker(n.id, +b.dataset.w)));
    if (box.querySelector('[data-up]')) box.querySelector('[data-up]').addEventListener('click', () => upgradeNode(n.id));
    if (box.querySelector('[data-dis]')) box.querySelector('[data-dis]').addEventListener('click', () => {
      state.links = state.links.filter(l => l.from !== n.id && l.to !== n.id);
      onGraphChanged(); log('✂️ 断开 ' + t.name + ' 连线', ''); renderNodePanel();
    });
    if (box.querySelector('[data-card]')) box.querySelector('[data-card]').addEventListener('click', () => openCard(t.card.title, t.card.body));
  }
  function renderPalette() {
    const el = $('palette');
    if (!el) return;
    el.innerHTML = Object.keys(DATA.nodes).map(k => {
      const t = DATA.nodes[k];
      const unlocked = state.era >= t.era && (!t.tech || state.techs[t.tech]);
      const cost = fmtN(placeCost());
      return '<button class="btn pal-btn" data-type="' + k + '" ' + (unlocked ? '' : 'disabled') + '>' +
        t.icon + ' ' + t.name + '<span class="pal-cost">' + (unlocked ? cost + 'J' : '🔒 ' + (t.tech ? '科技' : '纪元')) + '</span></button>';
    }).join('');
    el.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
      const type = b.dataset.type;
      state.placingType = state.placingType === type ? null : type;
      if (window.EXP.graphUI) window.EXP.graphUI.setPlacing(state.placingType);
      $('palHint').textContent = state.placingType ? '点击画布放置「' + DATA.nodes[type].name + '」' : '';
      el.querySelectorAll('.pal-btn').forEach(x => x.classList.toggle('active', x.dataset.type === type));
    }));
  }
  function openCard(title, body) {
    $('modal-box').innerHTML = '<div class="card-title">' + title + '</div><div class="card-body">' + body + '</div>' +
      '<button class="btn btn-gold card-close" onclick="document.getElementById(\'modal\').classList.add(\'hidden\')">关闭</button>';
    $('modal').classList.remove('hidden');
  }

  // ---- 静态绑定 ----
  $('btn-upgrade-era').addEventListener('click', tryUpgrade);
  $('btn-trait').addEventListener('click', () => $('traitOverlay').classList.remove('hidden'));
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
  $('traitOverlay').addEventListener('click', (e) => { if (e.target.id === 'traitOverlay') $('traitOverlay').classList.add('hidden'); });
  $('btnLogToggle').addEventListener('click', () => $('logBox').classList.toggle('collapsed'));
  $('btnDebugToggle').addEventListener('click', () => $('debugBox').classList.toggle('collapsed'));
  const dbg = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  dbg('btn-save', () => { save(); log('💾 已保存', ''); });
  dbg('btn-export', exportSave);
  dbg('btn-import', importSave);
  dbg('btn-reset', () => { if (confirm('完整重置？')) hardReset(); });
  dbg('btn-template', () => { if (confirm('重置为教学模板？')) { state.nodes = []; state.links = []; state.stock = { wood: 0, food: 0, water: 0, ore: 0, metal: 0 }; state.energyPool = 10000; state.research = 0; state.selectedId = null; seedTemplate(); renderAll(); } });
  dbg('btn-cheat-e', () => { state.energyPool = Math.min(50000, state.energyPool + 10000); log('⚡ 调试 +10k J', ''); });
  dbg('btn-cheat-r', () => { state.research += 2000; log('🧪 调试 +2000 科研', ''); });

  // ---- 模板 ----
  function seedTemplate() {
    if (state.nodes.length > 0) return;
    state.nodes.push({ id: 'n1', type: 'forest', x: 90, y: 200, workers: 0, level: 1, active: false, shortage: false, power: 0 });
    state.nodes.push({ id: 'n2', type: 'campfire', x: 330, y: 200, workers: 1, level: 1, active: false, shortage: false, power: 0 });
    state.links.push({ from: 'n1', to: 'n2' });
    state.idSeq = 3;
    log('🌲 教学模板：森林 → 篝火（已雇 1 工人）。完成任务赚能量！', 'era-log');
    onGraphChanged();
  }

  // ---- 启动 ----
  load();
  seedTemplate();
  renderAll();
  refresh();

  // ---- 对外 ----
  window.EXP = {
    game: {
      state, placeNode, addLink, upgradeNode, assignWorker, buyTech, onGraphChanged, log, openCard, refresh, renderAll,
      dominantSource: () => {
        let best = null, bp = 0;
        for (const n of state.nodes) { const t = nodeType(n); if (t.cat === 'energy' && nodeActive(n) && n.power > bp) { bp = n.power; best = t; } }
        return best || DATA.nodes.campfire;
      },
    },
    graph: state, fmtP, DATA,
  };
  window.EXP.onNodeSelect = (id) => { state.selectedId = id; renderNodePanel(); };
  window.EXP.onPlacingChange = (type) => { state.placingType = type; };
})();
