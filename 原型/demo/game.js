/* ============================================================
 * 《文明指数》节点-lite MVP — 游戏引擎 game.js v2
 * 玩法：节点图供需网络（方案 B）
 * 结算：源产出→加工→能源→科研；连线激活制；全局资源库存
 * 复用：K 尺 / 纪元 / 特质 / 事件 / 科学卡 / 存档
 * ============================================================ */
(function () {
  'use strict';
  const SAVE_KEY = 'exponent-demo-v2';

  const state = {
    era: 0,
    P: 0,
    energyPool: 0,
    research: 0,
    nodes: [],
    links: [],
    stock: { wood: 0, food: 0, ore: 0, metal: 0, water: 0 },
    techs: {},
    traits: {},
    events: {},
    activeEvent: null,
    nextEventTimer: 0,
    traitPending: false,
    log: [],
    selectedId: null,
    placingType: null,
    idSeq: 1,
  };

  const $ = (id) => document.getElementById(id);
  const fmtP = (w) => {
    if (w >= 1e15) return (w / 1e15).toFixed(2) + ' PW';
    if (w >= 1e12) return (w / 1e12).toFixed(2) + ' TW';
    if (w >= 1e9)  return (w / 1e9).toFixed(2) + ' GW';
    if (w >= 1e6)  return (w / 1e6).toFixed(2) + ' MW';
    if (w >= 1e3)  return (w / 1e3).toFixed(1) + ' kW';
    return w.toFixed(0) + ' W';
  };
  const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(1));
  const kOf = (p) => (Math.log10(p) - 6) / 10;
  const nextTarget = (era) => Math.pow(10, 6 + era + 1);
  const nodeType = (n) => DATA.nodes[n.type];

  // ================= 派生 =================
  function pop() { return Math.max(1, Math.round(Math.pow(state.P / 1e6, 0.6) * 100)); }
  function availWorkers() { return Math.max(3, Math.floor(pop() / 200)); }
  function assignedWorkers() { return state.nodes.reduce((s, n) => s + n.workers, 0); }

  function nodeMult(type) {
    let m = 1;
    for (const t of DATA.techs) if (state.techs[t.id] && t.effect.type === 'buff' && t.effect.node === type) m *= t.effect.mult;
    return m;
  }
  function resMult(res) {
    let m = 1;
    for (const t of DATA.techs) if (state.techs[t.id] && t.effect.type === 'buff' && t.effect.res === res) m *= t.effect.mult;
    for (const tr of DATA.traits) if (state.traits[tr.id] && tr.eff[res]) m *= (1 + tr.eff[res]);
    return m;
  }
  function powerTraitMult() {
    let m = 1;
    for (const tr of DATA.traits) if (state.traits[tr.id] && tr.eff.power) m *= (1 + tr.eff.power);
    return m;
  }
  function researchTraitMult() {
    let m = 1;
    for (const tr of DATA.traits) if (state.traits[tr.id] && tr.eff.research) m *= (1 + tr.eff.research);
    return m;
  }

  // 节点激活：source 需出线；work 需入+出；energy/research 需入线
  function nodeActive(n) {
    const t = nodeType(n);
    const hasIn = state.links.some(l => l.to === n.id);
    const hasOut = state.links.some(l => l.from === n.id);
    if (t.cat === 'source') return hasOut;
    if (t.cat === 'work') return hasIn && hasOut;
    return hasIn; // energy / research
  }

  // 总功率 = Σ 激活能源节点功率
  function totalPower() {
    let p = 0;
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'energy' && nodeActive(n)) p += (n.power || t.power);
    }
    return p * powerTraitMult();
  }

  // EROI：P / 能源投入等效功率（近似教学指标）
  function chainEROI() {
    let inEq = 0;
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'energy' && nodeActive(n)) {
        for (const k in t.in) inEq += t.in[k] * (EQUIV[k] || 0);
      }
    }
    const p = totalPower();
    return inEq > 0 ? p / inEq : (p > 0 ? 99 : 0);
  }

  // 科研速率
  function researchRate() {
    let r = Math.max(0.5, state.P / 2000) * researchTraitMult();
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'research' && nodeActive(n) && n.workers === t.workers) r += t.rps * nodeMult(n.type);
    }
    return r;
  }

  // ================= 操作 =================
  function placeNode(type, x, y) {
    const t = DATA.nodes[type];
    if (!t) return false;
    if (state.era < t.era) { log('🔒 ' + t.name + ' 属于未来纪元（' + DATA.eras[t.era].name + '）', ''); return false; }
    if (t.tech && !state.techs[t.tech]) { log('🔒 需科技：' + DATA.techs.find(x => x.id === t.tech).name, ''); return false; }
    const cost = placeCost();
    if (state.energyPool < cost) { log('⚡ 能量不足：需要 ' + fmtN(cost) + ' J（攒功率可充能）', ''); return false; }
    if (t.reqRes) {
      for (const k in t.reqRes) if (state.stock[k] < t.reqRes[k]) { log('🔒 需资源：' + DATA.resources[k].name + ' ×' + t.reqRes[k], ''); return false; }
    }
    state.energyPool -= cost;
    const id = 'n' + (state.idSeq++);
    state.nodes.push({
      id, type, x, y, workers: 0, active: false, shortage: false,
      power: t.power || 0, work: null,
    });
    for (const k in t.reqRes || {}) state.stock[k] -= t.reqRes[k];
    log('🏗️ 放置 ' + t.icon + ' ' + t.name + '（成本 ' + fmtN(cost) + ' J）', '');
    onGraphChanged();
    return true;
  }
  function placeCost() { return 500 + state.P * 3; }

  function addLink(fromId, toId) {
    if (state.links.some(l => l.from === fromId && l.to === toId)) { log('⚠️ 已存在该连线', ''); return; }
    state.links.push({ from: fromId, to: toId });
    const a = state.nodes.find(n => n.id === fromId), b = state.nodes.find(n => n.id === toId);
    log('🔗 连线：' + DATA.nodes[a.type].name + ' → ' + DATA.nodes[b.type].name, '');
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
  }

  function assignWorker(nodeId, delta) {
    const n = state.nodes.find(x => x.id === nodeId);
    if (!n) return;
    const t = nodeType(n);
    const wmax = t.workers;
    const avail = availWorkers() - (assignedWorkers() - n.workers);
    if (delta > 0 && n.workers >= wmax) { log('👷 该节点满编', ''); return; }
    if (delta > 0 && avail <= 0) { log('👥 劳动力不足（可用 ' + availWorkers() + '，人口 ' + fmtN(pop()) + '）', ''); return; }
    if (delta < 0 && n.workers <= 0) return;
    n.workers += delta;
    onGraphChanged();
  }

  // ================= 事件 =================
  function scheduleEvent() {
    const cands = DATA.events.filter(e => state.era >= e.eraMin && !state.events[e.id]);
    if (!cands.length) { state.nextEventTimer = -1; return; }
    state.nextEventTimer = 20 + Math.random() * 15;
  }
  function applyEventChoice(ev, opt) {
    let res = opt.result;
    if (opt.effect.type === 'debuff') {
      for (const n of state.nodes) if (n.type === opt.effect.node) n.debuff = n.debuff || 1 * opt.effect.mult;
      res += '（' + DATA.nodes[opt.effect.node].name + ' 产出 x' + opt.effect.mult + '）';
    }
    if (opt.effect.type === 'lossP') { state.P *= (1 - opt.effect.pct); res += '（功率 -' + (opt.effect.pct * 100).toFixed(0) + '%）'; }
    log('🌍 事件应对：' + ev.name + ' — ' + res, '');
    state.events[ev.id] = true;
    state.activeEvent = null;
    scheduleEvent();
    renderEvent();
  }

  // ================= 结算引擎 =================
  const TICK = 250;
  let last = Date.now();
  function settle() {
    const now = Date.now();
    const dt = Math.min(500, now - last) / 1000;
    last = now;
    if (state.traitPending) return;

    // 1. 源产出（库存未满 + 激活 + 无 debuff 全额或 debuff）
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat !== 'source' || !nodeActive(n)) continue;
      const mult = nodeMult(n.type) * (n.debuff || 1) * resMult(Object.keys(t.out)[0]);
      for (const k in t.out) {
        const r = DATA.resources[k];
        if (state.stock[k] < r.cap) state.stock[k] = Math.min(r.cap, state.stock[k] + t.out[k] * mult * dt);
      }
    }
    // 2. 加工
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat !== 'work' || !nodeActive(n) || n.workers < t.workers) continue;
      const inKey = Object.keys(t.in)[0], outKey = Object.keys(t.out)[0];
      const need = t.in[inKey] * dt;
      if (state.stock[inKey] >= need) {
        state.stock[inKey] -= need;
        const r = DATA.resources[outKey];
        state.stock[outKey] = Math.min(r.cap, state.stock[outKey] + t.out[outKey] * dt * (n.debuff || 1));
        n.shortage = false;
      } else n.shortage = true;
    }
    // 3. 能源
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat !== 'energy' || !nodeActive(n) || n.workers < t.workers) { if (n) n.power = 0; continue; }
      const inKey = Object.keys(t.in)[0];
      const need = t.in[inKey] * dt;
      if (state.stock[inKey] >= need) {
        state.stock[inKey] -= need;
        n.shortage = false;
        n.power = t.power * nodeMult(n.type) * (n.debuff || 1);
      } else { n.shortage = true; n.power = 0; }
    }
    // 4. 科研（lab 消耗能量池）
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat !== 'research' || !nodeActive(n) || n.workers < t.workers) continue;
      if (state.energyPool >= t.power * dt) {
        state.energyPool -= t.power * dt;
        state.research += t.rps * nodeMult(n.type) * researchTraitMult() * dt;
      }
    }

    // 5. P 与能量池
    state.P = totalPower();
    state.energyPool += state.P * 0.2 * dt;

    // 6. 事件调度
    if (state.nextEventTimer > 0) {
      state.nextEventTimer -= dt;
      if (state.nextEventTimer <= 0 && !state.activeEvent && !state.traitPending) {
        const cands = DATA.events.filter(e => state.era >= e.eraMin && !state.events[e.id]);
        if (cands.length) { state.activeEvent = cands[0]; renderEvent(); }
      }
    }

    refresh();
  }
  setInterval(settle, TICK);

  // ================= 保存 / 加载 =================
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s.nodes || !s.links) return false;
      Object.assign(state, s);
      if (!state.log) state.log = [];
      if (state.activeEvent === undefined) state.activeEvent = null;
      if (state.traitPending === undefined) state.traitPending = false;
      if (state.nextEventTimer === undefined) state.nextEventTimer = 0;
      return true;
    } catch (e) { return false; }
  }
  function hardReset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    location.reload();
  }
  function copyText(t) {
    const done = () => log('📤 存档已复制到剪贴板', '');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => textareaCopy(t));
    else textareaCopy(t);
  }
  function textareaCopy(t) {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      log('📤 存档已复制到剪贴板', '');
    } catch (e) { log('📤 导出失败', ''); }
  }
  function exportSave() { save(); copyText(JSON.stringify(state)); }
  function importSave() {
    const raw = prompt('粘贴存档 JSON：');
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (!s.nodes || !s.links) throw new Error('缺少节点数据');
      Object.assign(state, s);
      if (!state.log) state.log = [];
      if (state.activeEvent === undefined) state.activeEvent = null;
      if (state.traitPending === undefined) state.traitPending = false;
      if (state.nextEventTimer === undefined) state.nextEventTimer = 0;
      save();
      renderAll();
      log('📥 存档已导入', '');
    } catch (e) { alert('导入失败：' + e.message); }
  }

  // ================= 渲染 =================
  function log(msg, cls) {
    state.log.unshift({ t: Date.now(), msg, cls });
    if (state.log.length > 50) state.log.length = 50;
    renderLog();
  }

  function refresh() {
    const k = kOf(Math.max(state.P, 1));
    $('kval').textContent = k.toFixed(3);
    $('kbar-fill').style.width = Math.min(100, Math.max(0, k / 0.4 * 100)) + '%';
    const reached = state.P >= nextTarget(state.era);
    $('kbar-next').textContent = reached ? '🎉 可更替！' : '';
    $('kbar-next').style.cssText = reached ? 'color:#7fe0a8;margin-left:10px;' : '';
    $('eraname').textContent = DATA.eras[state.era].icon + ' ' + DATA.eras[state.era].name;
    $('pval').textContent = fmtP(state.P);
    $('popval').textContent = fmtN(pop()) + ' 人';
    $('workerval').textContent = assignedWorkers() + '/' + availWorkers();
    $('researchval').textContent = fmtN(state.research) + '（+' + fmtN(researchRate()) + '/s）';
    $('energyval').textContent = fmtN(state.energyPool) + ' J';
    $('nexttarget').textContent = 'K ' + (state.era + 1) / 10 + ' · ' + fmtP(nextTarget(state.era));

    // 资源条
    const rw = $('resBars');
    rw.innerHTML = Object.keys(DATA.resources).map(k => {
      const r = DATA.resources[k];
      const v = state.stock[k] || 0;
      const pct = Math.min(100, v / r.cap * 100);
      return '<div class="resbar"><span>' + r.icon + ' ' + r.name + '</span>' +
        '<div class="resbar-track"><div class="resbar-fill" style="width:' + pct + '%"></div></div>' +
        '<b>' + fmtN(v) + '</b></div>';
    }).join('');

    // 链 EROI（近似教学指标，精确口径见科学卡）
    const er = chainEROI();
    const erEl = $('eroiVal');
    erEl.textContent = er > 90 ? '∞' : er.toFixed(1);
    erEl.style.color = er > 90 ? '#7fe0a8' : er >= 3 ? '#7fe0a8' : er >= 1.5 ? '#ffd97a' : '#ff5d5d';
    $('eroiState').textContent = er > 90 ? '无燃料能源' : er >= 3 ? '可持续' : er >= 1.5 ? '警戒' : '崩塌风险';
    $('eroiState').style.color = erEl.style.color;
    $('fuelVal').textContent = fmtP(state.P) + ' / 池 ' + fmtN(state.energyPool) + ' J';
    const short = state.nodes.filter(n => n.shortage).length;
    $('supplyHint').textContent = short > 0 ? '⚠️ ' + short + ' 节点缺料：补源/加工或重连' :
      (state.stock.wood === 0 && state.stock.water === 0) ? '🪵 燃料耗尽！检查源节点' : '✅ 供给正常';

    // 更替按钮
    $('eraupgrade-box').classList.toggle('hidden', !(reached && !state.traitPending && state.era < 4));
    if (state.era >= 4 && reached) $('palHint').textContent = '🎉 教学段完成（K=0.4）！可继续扩张或重置重玩。';
    // 科技可购
    renderTechFlags();
  }

  // ================= palette =================
  function renderPalette() {
    const el = $('palette');
    el.innerHTML = Object.keys(DATA.nodes).map(k => {
      const t = DATA.nodes[k];
      const unlocked = state.era >= t.era && (!t.tech || state.techs[t.tech]);
      const cost = fmtN(placeCost());
      const extra = t.reqRes ? '＋' + Object.keys(t.reqRes).map(r => DATA.resources[r].icon).join('') : '';
      return '<button class="btn pal-btn" data-type="' + k + '" ' + (unlocked ? '' : 'disabled') + '>' +
        t.icon + ' ' + t.name + ' <span class="pal-cost">' + (unlocked ? cost + 'J' + extra : '🔒') + '</span></button>';
    }).join('');
    el.querySelectorAll('[data-type]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.type;
        state.placingType = (state.placingType === t ? null : t);
        if (window.EXP.graphUI) window.EXP.graphUI.setPlacing(state.placingType);
        $('palHint').textContent = state.placingType ? '点击画布放置「' + DATA.nodes[state.placingType].name + '」' : '';
        document.querySelectorAll('.pal-btn').forEach(x => x.classList.remove('active'));
        if (state.placingType) b.classList.add('active');
      });
    });
  }

  // ================= 科技 =================
  function renderTechs() {
    const el = $('techList');
    el.innerHTML = DATA.techs.map(t => {
      const bought = !!state.techs[t.id];
      const visible = state.era >= t.era;
      const prereqOk = t.prereq.every(p => state.techs[p]);
      const afford = state.research >= t.cost;
      const flag = !visible ? '🔒' : !prereqOk ? '🔒' : bought ? '✅' : afford ? '' : '🧪不足';
      return '<div class="tech-item ' + (bought ? 'bought' : '') + '" data-tech="' + t.id + '">' +
        '<span class="t-name">' + t.icon + ' ' + t.name + '</span>' +
        '<span class="t-flag">' + flag + '</span>' +
        '<span class="t-cost">' + (bought ? '' : fmtN(t.cost)) + '</span></div>';
    }).join('');
    el.querySelectorAll('[data-tech]').forEach(d => {
      d.addEventListener('click', () => {
        const t = DATA.techs.find(x => x.id === d.dataset.tech);
        if (state.techs[t.id]) return;
        buyTech(t.id);
      });
    });
  }
  function renderTechFlags() {
    const el = $('techList');
    el.querySelectorAll('[data-tech]').forEach(d => {
      const t = DATA.techs.find(x => x.id === d.dataset.tech);
      const bought = !!state.techs[t.id];
      const visible = state.era >= t.era;
      const prereqOk = t.prereq.every(p => state.techs[p]);
      const afford = state.research >= t.cost;
      d.classList.toggle('bought', bought);
      d.querySelector('.t-flag').textContent = !visible ? '🔒' : !prereqOk ? '🔒' : bought ? '✅' : afford ? '' : '🧪不足';
    });
  }

  // ================= 节点信息面板 =================
  function renderNodeInfo() {
    const box = $('nodeInfo');
    const n = state.nodes.find(x => x.id === state.selectedId);
    if (!n) { box.innerHTML = '<p class="hint">点击节点查看详情；点节点再点另一节点连线；右键断开。</p>'; return; }
    const t = nodeType(n);
    const active = nodeActive(n);
    let html = '<div class="ni-head">' + t.icon + ' <b>' + t.name + '</b> <span class="' + (active ? 'ni-on' : 'ni-off') + '">' + (active ? '● 运行' : '○ 未连线') + '</span></div>';
    if (t.in) html += '<div class="ni-row">输入：' + Object.entries(t.in).map(([k, v]) => DATA.resources[k].icon + ' ' + v + '/s').join(' ') + '</div>';
    if (t.out) html += '<div class="ni-row">输出：' + Object.entries(t.out).map(([k, v]) => DATA.resources[k].icon + ' ' + v + '/s').join(' ') + '</div>';
    if (t.cat === 'energy') html += '<div class="ni-row">⚡ 功率：' + fmtP(t.power * nodeMult(n.type)) + '（EROI 计入链）</div>';
    if (t.cat === 'research') html += '<div class="ni-row">🔬 科研：+' + t.rps * nodeMult(n.type) + '/s（耗 ⚡' + t.power + 'W）</div>';
    if (t.workers > 0) {
      html += '<div class="ni-row">👷 工人：' + n.workers + '/' + t.workers +
        ' <button class="btn btn-mini" data-w="1">+</button><button class="btn btn-mini" data-w="-1">−</button></div>';
    }
    html += '<div class="ni-row"><button class="btn btn-mini" data-dis="1">✂️ 断开连线</button></div>';
    html += '<button class="btn btn-gold" style="margin-top:8px" data-card="1">📖 科学卡</button>';
    box.innerHTML = html;
    box.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => assignWorker(n.id, +b.dataset.w)));
    box.querySelector('[data-dis]') && box.querySelector('[data-dis]').addEventListener('click', () => {
      state.links = state.links.filter(l => l.from !== n.id && l.to !== n.id);
      onGraphChanged();
      log('✂️ 断开 ' + t.name + ' 连线', '');
      renderNodeInfo();
    });
    box.querySelector('[data-card]') && box.querySelector('[data-card]').addEventListener('click', () => openCard(t.card.title, t.card.body));
  }

  // ================= 事件 =================
  function renderEvent() {
    const el = $('eventPanel');
    const ev = state.activeEvent;
    if (!ev) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '<h3>⚠️ 文明事件：' + ev.name + '</h3>' +
      '<div class="cause-chain">' + ev.cause.map(c => '▸ ' + c).join('<br>') + '</div>' +
      ev.options.map((o, i) => '<button class="btn opt-btn" data-opt="' + i + '">' + o.text + '</button>').join('') +
      '<div class="hint" style="margin-top:6px" id="evRes"></div>';
    el.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
      const opt = ev.options[+b.dataset.opt];
      const res = applyEventChoice(ev, opt);
      const rEl = $('evRes'); if (rEl) rEl.textContent = '结果：' + res;
      el.querySelectorAll('.opt-btn').forEach(x => x.disabled = true);
    }));
  }

  // ================= 纪元更替 =================
  function tryUpgrade() {
    if (state.P < nextTarget(state.era) || state.traitPending) return;
    const nextEra = DATA.eras[state.era + 1];
    if (!nextEra) { log('🏆 已达教学段终点 K=0.4！', 'era-log'); return; }
    state.traitPending = true;
    $('erao-icon').textContent = nextEra.icon;
    $('erao-name').textContent = nextEra.name;
    $('erao-desc').textContent = nextEra.desc;
    $('eraOverlay').classList.remove('hidden');
    const pool = DATA.traits.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const tl = $('traitList');
    tl.innerHTML = pool.map(t =>
      '<div class="trait-item" data-trait="' + t.id + '">' +
      '<span class="t-icon">' + t.icon + '</span>' +
      '<div><div class="t-name">' + t.name + '</div><div class="t-desc">' + t.desc + '</div></div></div>').join('');
    tl.querySelectorAll('[data-trait]').forEach(d => d.addEventListener('click', () => {
      const t = DATA.traits.find(x => x.id === d.dataset.trait);
      $('eraOverlay').classList.add('hidden');
      $('traitOverlay').classList.add('hidden');
      try {
        state.traits[t.id] = true;
        state.era += 1;
        state.traitPending = false;
        state.activeEvent = null;
        const cur = DATA.eras[state.era];
        log('⚜️ 纪元更替 → ' + cur.icon + ' ' + cur.name + '（特质：' + t.name + '）', 'era-log');
        scheduleEvent();
        renderAll();
      } catch (e) { log('⚠️ 特质出错：' + e.message, ''); }
    }));
  }

  // ================= 图状态变化 =================
  function onGraphChanged() {
    for (const n of state.nodes) {
      n.active = nodeActive(n);
      if (!n.active) n.shortage = false;
    }
    renderNodeInfo();
  }

  // ================= 渲染全量 =================
  function renderAll() {
    renderPalette();
    renderTechs();
    renderNodeInfo();
    renderEvent();
    renderLog();
    onGraphChanged();
  }
  function renderLog() {
    const el = $('log');
    el.innerHTML = state.log.map(l => '<div class="' + (l.cls || '') + '">[' + new Date(l.t).toLocaleTimeString() + '] ' + l.msg + '</div>').join('');
  }

  // ================= 科学卡 =================
  function openCard(title, body) {
    const box = $('modal-box');
    box.innerHTML = '<div class="card-title">' + title + '</div>' +
      '<div class="card-body">' + body + '</div>' +
      '<button class="btn btn-gold card-close" onclick="document.getElementById(\'modal\').classList.add(\'hidden\')">关闭</button>';
    $('modal').classList.remove('hidden');
  }

  // ================= 静态绑定 =================
  $('btn-upgrade').addEventListener('click', tryUpgrade);
  $('btn-trait').addEventListener('click', () => $('traitOverlay').classList.remove('hidden'));
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
  $('traitOverlay').addEventListener('click', (e) => { if (e.target.id === 'traitOverlay') $('traitOverlay').classList.add('hidden'); });
  const dbg = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  dbg('btn-save', () => { save(); log('💾 已保存', ''); });
  dbg('btn-export', exportSave);
  dbg('btn-import', importSave);
  dbg('btn-reset', () => { if (confirm('完整重置？')) hardReset(); });
  dbg('btn-cheat-e', () => { state.energyPool += 50000; log('⚡ 调试：能量 +50,000 J', ''); });
  dbg('btn-cheat-r', () => { state.research += 2000; log('🧪 调试：科研 +2000', ''); });
  dbg('btn-cheat-template', () => { if (confirm('重置为教学模板（森林→篝火）？')) { state.nodes = []; state.links = []; state.stock = { wood: 0, food: 0, ore: 0, metal: 0, water: 0 }; state.energyPool = 0; state.research = 0; seedTemplate(); renderAll(); } });

  // ================= 模板 =================
  function seedTemplate() {
    if (state.nodes.length > 0) return;
    state.nodes.push({ id: 'n1', type: 'forest', x: 100, y: 180, workers: 0, power: 0 });
    state.nodes.push({ id: 'n2', type: 'campfire', x: 320, y: 180, workers: 1, power: 0 });
    state.links.push({ from: 'n1', to: 'n2' });
    state.idSeq = 3;
    log('🌲 教学模板已就绪：森林 → 篝火。试试放置更多节点并连线！', 'era-log');
    onGraphChanged();
  }

  // ================= 启动 =================
  load();
  seedTemplate();
  scheduleEvent();
  renderAll();
  refresh();

  // ---- 对外接口（graph.js / scene.js / 调试） ----
  window.EXP = {
    game: {
      state,
      placeNode, addLink, buyTech, assignWorker, onGraphChanged,
      log, openCard, refresh, renderAll,
      dominantSource: () => {
        let best = null, bp = 0;
        for (const n of state.nodes) {
          const t = DATA.nodes[n.type];
          if (t.cat === 'energy' && nodeActive(n) && n.power > bp) { bp = n.power; best = t; }
        }
        return best || DATA.nodes.campfire;
      },
    },
    graph: state,
    fmtP,
  };

  // graph.js 交互联动
  window.EXP.onNodeSelect = (id) => { state.selectedId = id; renderNodeInfo(); };
  window.EXP.onPlacingChange = (type) => {
    state.placingType = type;
    document.querySelectorAll('.pal-btn').forEach(x => x.classList.toggle('active', x.dataset.type === type));
    $('palHint').textContent = type ? '点击画布放置「' + DATA.nodes[type].name + '」' : '开局：森林→篝火已连好。放置更多节点并连线。';
  };
})();
