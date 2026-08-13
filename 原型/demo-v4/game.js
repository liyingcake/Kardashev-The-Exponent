/* ============================================================
 * 《文明指数》demo-v4 — 引擎 game.js
 * 统合乘数 · 能量利用
 * 管线：采集 → 加工 → 定居消费 → 收集(窗口)
 * 一个可分解小乘数：整合(利用率) × 规模(经济) × 技术 × 国策
 * ============================================================ */
(function () {
  'use strict';
  const SAVE_KEY = 'exponent-demo-v4';
  const TICK = 250;

  const state = {
    era: 0, P: 0, pop: 120, research: 0,
    stock: { raw_food: 20, wood: 20, cooked_food: 60 },
    nodes: [], techs: {}, creeds: {}, traits: {},
    idSeq: 1, shortage: 0, log: [],
  };

  const $ = (id) => document.getElementById(id);
  const fmtP = (w) => w >= 1e15 ? (w/1e15).toFixed(2)+' PW' : w >= 1e12 ? (w/1e12).toFixed(2)+' TW'
    : w >= 1e9 ? (w/1e9).toFixed(2)+' GW' : w >= 1e6 ? (w/1e6).toFixed(2)+' MW'
    : w >= 1e3 ? (w/1e3).toFixed(1)+' kW' : w.toFixed(0)+' W';
  const fmtN = (n) => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'k' : n.toFixed(1);
  const kOf = (p) => (Math.log10(Math.max(p,1)) - 6) / 10;
  const nextTarget = (era) => Math.pow(10, 6 + era + 1);
  const NT = (n) => DATA.nodes[n.type];

  // ---- 乘数因子 ----
  function techMult(type) { let m = 1; for (const t of DATA.techs) if (state.techs[t.id] && t.node === type) m *= t.mult; return m; }
  function creedMult(type) { let m = 1; for (const c of DATA.creeds) if (state.creeds[c.id] && c.node === type) m *= c.mult; return m; }
  function researchMult() { let m = 1; for (const c of DATA.creeds) if (state.creeds[c.id] && c.research) m *= c.research; return m; }

  // ---- 劳动力 ----
  function labor() { return Math.floor(state.pop / DATA.laborPerPop); }
  function requiredWorkers() { return state.nodes.reduce((s, n) => s + (NT(n).workers || 0), 0); }
  function laborEff() { const r = requiredWorkers(); return r === 0 ? 1 : Math.min(1, labor() / r); }

  // ---- 流量（诊断用）----
  function rawSupplyRate() {
    let r = 0;
    for (const n of state.nodes) if (NT(n).cat === 'gather') r += (NT(n).out.raw_food || 0) * techMult(n.type) * creedMult(n.type);
    return r * laborEff();
  }
  function woodSupplyRate() {
    let r = 0;
    for (const n of state.nodes) if (NT(n).cat === 'gather') r += (NT(n).out.wood || 0) * techMult(n.type) * creedMult(n.type);
    return r * laborEff();
  }
  function hearthRawDemandRate() {
    let r = 0;
    for (const n of state.nodes) if (NT(n).cat === 'process') r += (NT(n).in.raw_food || 0);
    return r * laborEff();
  }
  // 加工容量（若原料充足时能产多少熟食）——规模经济的基数
  function hearthCapacity() {
    let cap = 0;
    for (const n of state.nodes) if (NT(n).cat === 'process') cap += (NT(n).out.cooked_food || 0) * techMult(n.type) * creedMult(n.type);
    return cap * laborEff();
  }

  // ---- 乘数（窗口的核心）----
  function scaleMult() { return 1 + 0.1 * Math.floor(hearthCapacity() / 5); }  // 规模经济
  function utilization() {  // 统合度：采到的原料被用掉多少（= 不浪费）
    const sup = rawSupplyRate(), dem = hearthRawDemandRate();
    if (sup <= 0) return dem > 0 ? 0 : 1;
    return Math.min(1, dem / sup);
  }
  function integrationMult() { return 1 + 0.4 * utilization(); }  // 整合因子（统合奖励）

  // ---- 建造 ----
  function buildNode(type) {
    const t = DATA.nodes[type];
    if (!t) return;
    if (t.tech && !state.techs[t.tech]) { log('🔒 需科技：' + DATA.techs.find(x => x.id === t.tech).name); return; }
    if (state.stock.cooked_food < t.cost) { log('🍲 熟食不足（需 ' + t.cost + '，当前 ' + fmtN(state.stock.cooked_food) + '）——扩大盈余再投资'); return; }
    state.stock.cooked_food -= t.cost;
    state.nodes.push({ id: 'n' + (state.idSeq++), type, level: 1 });
    log('🏗️ 建造：' + t.icon + ' ' + t.name, '');
    renderBuild();
  }

  // ---- 结算 ----
  function settle() {
    const now = Date.now();
    const dt = Math.min(500, now - last) / 1000;
    last = now;
    const eff = laborEff();
    const scale = scaleMult();

    // 1. 采集 → 原料
    for (const n of state.nodes) {
      const t = NT(n);
      if (t.cat !== 'gather') continue;
      for (const k in t.out) {
        const cap = DATA.goods[k].cap;
        state.stock[k] = Math.min(cap, state.stock[k] + t.out[k] * techMult(n.type) * creedMult(n.type) * eff * dt);
      }
    }
    // 2. 加工 → 加工品（能量被利用；规模经济加成）
    state.shortage = 0;
    for (const n of state.nodes) {
      const t = NT(n);
      if (t.cat !== 'process') continue;
      let ok = true;
      for (const k in t.in) {
        if (state.stock[k] < t.in[k] * eff * dt) { ok = false; break; }
      }
      if (ok) {
        for (const k in t.in) state.stock[k] -= t.in[k] * eff * dt;
        for (const k in t.out) {
          const cap = DATA.goods[k].cap;
          state.stock[k] = Math.min(cap, state.stock[k] + t.out[k] * techMult(n.type) * creedMult(n.type) * scale * eff * dt);
        }
      } else state.shortage += 1;
    }
    // 3. 定居消费 → 劳动力 + 科技（消费端 = 需求 + 劳动力源）
    const demand = state.pop * DATA.foodPerPop * dt;
    const consumed = Math.min(state.stock.cooked_food, demand);
    state.stock.cooked_food -= consumed;
    const consumptionRate = consumed / dt;
    const popTarget = consumptionRate / DATA.foodPerPop;
    state.pop += (popTarget - state.pop) * 0.05 * dt;
    if (state.pop < 10) state.pop = 10;
    // 4. 有用能量流 → K 指数（整合因子 = 统合奖励：摊大饼浪费原料 → 有效能量流打折）
    state.P = consumptionRate * DATA.ENERGY_PER_COOKED * integrationMult();
    // 5. 科研
    state.research += consumptionRate * DATA.techPerFood * researchMult() * dt;
    // 6. 科技自动研发
    autoResearch();
    // 7. 纪元
    checkEra();
    refresh();
  }
  let last = Date.now();
  setInterval(settle, TICK);

  function autoResearch() {
    const av = DATA.techs.filter(t => !state.techs[t.id] && state.era >= t.era && state.research >= t.cost);
    if (!av.length) return;
    av.sort((a, b) => a.cost - b.cost);
    const t = av[0];
    state.research -= t.cost;
    state.techs[t.id] = true;
    log('🧪 研发出：' + t.name, 'era-log');
    renderTechs(); renderBuild();
  }

  // ---- 纪元 ----
  function checkEra() {
    const reached = state.P >= nextTarget(state.era);
    const box = $('eraupgrade-box');
    if (box) box.classList.toggle('hidden', !(reached && state.era < 4));
    if (reached && state.era < 4 && !state.eraPending) {
      // 等玩家点
    }
  }
  function tryUpgrade() {
    if (state.P < nextTarget(state.era)) return;
    const nextEra = DATA.eras[state.era + 1];
    if (!nextEra) { log('🏆 教学段完成 K=0.4！', 'era-log'); return; }
    state.era += 1;
    state.eraPending = false;
    log('⚜️ 纪元更替 → ' + nextEra.icon + ' ' + nextEra.name, 'era-log');
    renderTechs(); renderBuild();
  }

  // ---- 存档 ----
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s || !s.nodes) return false;
      Object.assign(state, s);
      if (!state.log) state.log = [];
      return true;
    } catch (e) { return false; }
  }
  function hardReset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); }

  // ---- 日志 ----
  function log(msg, cls) { state.log.unshift({ t: Date.now(), msg, cls }); if (state.log.length > 40) state.log.length = 40; renderLog(); }

  // ---- 渲染：数值刷新（每 tick）----
  function refresh() {
    const k = kOf(state.P);
    $('kval').textContent = k.toFixed(3);
    $('kbar-fill').style.width = Math.min(100, Math.max(0, k / 0.4 * 100)) + '%';
    $('eraname').textContent = DATA.eras[state.era].icon + ' ' + DATA.eras[state.era].name;
    $('pval').textContent = fmtP(state.P);
    $('popval').textContent = fmtN(state.pop) + ' 人';
    $('laborval').textContent = labor() + '（用工 ' + requiredWorkers() + '）';
    $('researchval').textContent = fmtN(state.research) + '（+' + fmtN(consumptionRate() * DATA.techPerFood * researchMult()) + '/s）';

    for (const k in DATA.goods) {
      const g = DATA.goods[k], v = state.stock[k] || 0;
      const fill = document.querySelector('#res-' + k + ' .resbar-fill');
      const val = document.querySelector('#res-' + k + ' b');
      if (fill) fill.style.width = Math.min(100, v / g.cap * 100) + '%';
      if (val) val.textContent = fmtN(v);
    }

    // 管线流量（窗口核心）
    $('flowRaw').textContent = fmtN(rawSupplyRate()) + '/s';
    $('flowWood').textContent = fmtN(woodSupplyRate()) + '/s';
    $('flowCooked').textContent = fmtN(hearthCapacity() * scaleMult()) + '/s';
    $('flowConsume').textContent = fmtN(consumptionRate()) + '/s';
    const surplus = hearthCapacity() * scaleMult() - consumptionRate();
    $('flowSurplus').textContent = (surplus >= 0 ? '+' : '') + fmtN(surplus) + '/s';
    $('supplyState').textContent = state.shortage > 0 ? '⚠️ ' + state.shortage + ' 灶火缺料' : '✅ 供需要平';

    // 乘数（可分解的小乘数）
    const integ = integrationMult(), scale = scaleMult();
    const tech = techMult('hearth') * techMult('farm');
    const creed = creedMult('hearth') * creedMult('farm');
    const total = integ * scale * tech * creed;
    $('mTotal').textContent = '×' + total.toFixed(2);
    $('mInteg').textContent = '整合 ×' + integ.toFixed(2) + '（统合度 ' + Math.round(utilization() * 100) + '%）';
    $('mScale').textContent = '规模 ×' + scale.toFixed(2);
    $('mTech').textContent = '技术 ×' + tech.toFixed(2);
    $('mCreed').textContent = '国策 ×' + creed.toFixed(2);

    // 收集台（窗口的收集节点）
    $('collectLabor').textContent = labor() + ' 劳动力';
    $('collectTech').textContent = fmtN(state.research) + ' 科技';
    $('collectEroi').textContent = 'EROI ≈ ' + (DATA.nodes.hearth.eroi * tech).toFixed(1);
    $('collectP').textContent = fmtP(state.P) + ' 有用能量流';

    // 里程碑
    const nt = nextTarget(state.era);
    $('milestoneTarget').textContent = fmtP(nt);
    $('milestoneBar').style.width = Math.min(100, state.P / nt * 100) + '%';
  }
  function consumptionRate() {
    // 近似当前消费速率（= P / ENERGY_PER_COOKED）
    return state.P / DATA.ENERGY_PER_COOKED;
  }

  // ---- 渲染：结构 ----
  function renderBuild() {
    $('buildList').innerHTML = Object.keys(DATA.nodes).map(k => {
      const t = DATA.nodes[k];
      const unlocked = !t.tech || state.techs[t.tech];
      const lock = unlocked ? '' : '🔒 ' + DATA.techs.find(x => x.id === t.tech).name;
      return '<button class="btn build-btn" data-build="' + k + '" ' + (unlocked ? '' : 'disabled') + '>' +
        t.icon + ' ' + t.name + '<span class="b-cost">' + (unlocked ? t.cost + ' 🍲' : lock) + '</span></button>';
    }).join('');
    $('buildList').querySelectorAll('[data-build]').forEach(b => b.addEventListener('click', () => buildNode(b.dataset.build)));
  }
  function renderCreedList() {
    $('creedList').innerHTML = DATA.creeds.map(c => {
      const on = !!state.creeds[c.id];
      const active = Object.keys(state.creeds).length;
      const full = !on && active >= 2;
      return '<div class="creed-item ' + (on ? 'on' : '') + '" data-creed="' + c.id + '" title="' + (full ? '国策槽已满' : c.desc) + '">' +
        '<span class="t-name">' + c.icon + ' ' + c.name + '</span><span class="t-desc">' + c.desc + '</span></div>';
    }).join('');
    $('creedList').querySelectorAll('[data-creed]').forEach(d => d.addEventListener('click', () => toggleCreed(d.dataset.creed)));
  }
  function toggleCreed(id) {
    if (state.creeds[id]) delete state.creeds[id];
    else if (Object.keys(state.creeds).length >= 2) { log('⚠️ 国策槽已满', ''); }
    else state.creeds[id] = true;
    renderCreedList();
  }
  function renderTechs() {
    $('techList').innerHTML = DATA.techs.map(t => {
      const got = !!state.techs[t.id], visible = state.era >= t.era;
      return '<div class="tech-item ' + (got ? 'bought' : '') + '" title="' + t.card.body + '">' +
        '<span class="t-name">' + t.icon + ' ' + t.name + '</span>' +
        '<span class="t-flag">' + (got ? '✅' : visible ? '🔬' : '🔒') + '</span>' +
        '<span class="t-cost">' + (got ? '' : fmtN(t.cost)) + '</span></div>';
    }).join('');
  }
  function renderLog() { $('logList').innerHTML = state.log.map(l => '<div class="' + (l.cls || '') + '">' + l.msg + '</div>').join(''); }
  function renderAll() { renderBuild(); renderCreedList(); renderTechs(); renderLog(); }

  // ---- 静态绑定 ----
  $('btn-upgrade-era').addEventListener('click', tryUpgrade);
  $('btnLogToggle').addEventListener('click', () => $('logBox').classList.toggle('collapsed'));
  $('btnDebugToggle').addEventListener('click', () => $('debugBox').classList.toggle('collapsed'));
  const dbg = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  dbg('btn-save', () => { save(); log('💾 已保存', ''); });
  dbg('btn-reset', () => { if (confirm('完整重置？')) hardReset(); });
  dbg('btn-cheat', () => { state.stock.cooked_food = DATA.goods.cooked_food.cap; state.research += 500; log('🍲 调试 +熟食 +科研', ''); });

  // ---- 模板（开局：1 森林 + 1 灶火，破解死锁）----
  function seedTemplate() {
    if (state.nodes.length > 0) return;
    state.nodes.push({ id: 'n1', type: 'forest', level: 1 });
    state.nodes.push({ id: 'n2', type: 'hearth', level: 1 });
    state.idSeq = 3;
    log('🔥 火种点燃：森林 → 灶火 → 定居点。', 'era-log');
    log('🧭 观察"窗口"：调国策、攒盈余投资，看小乘数如何涨。', '');
  }

  // ---- 启动 ----
  load();
  seedTemplate();
  renderAll();
  refresh();
})();
