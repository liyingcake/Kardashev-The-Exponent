/* ============================================================
 * 《文明指数》demo-v3 — 引擎 game.js
 * 上帝视角·宏观引导：玩家定国策/调权重/设探索焦点/裁决危机，
 * 文明自动体（agent）负责建节点/研发/探索/雇工/升级——文明自己长大。
 * 渲染分离规范（R1-R3）：refresh 只做 textContent/width 更新，
 * 结构渲染（列表重建）只在状态变化时触发。
 * ============================================================ */
(function () {
  'use strict';
  const SAVE_KEY = 'exponent-demo-v3';
  const TICK = 250;            // 结算 tick（ms）
  const AGENT_TICK = 1.2;      // 自动体决策间隔（s）
  const ENERGY_RECHARGE = 0.35; // 功率→能量池再投资率

  const state = {
    era: 0, P: 0, energyPool: 5000, research: 0,
    pop: 200,
    stock: { wood: 20, water: 20 },
    nodes: [], techs: {}, traits: {}, creeds: {},
    weights: { explore: 15, research: 15, agri: 20, industry: 30, culture: 10, defense: 10 },
    regions: {},          // {id: {prog, done}}
    agenda: 'auto',        // 'auto' | regionId（探索焦点）
    cultureMeter: 0, defenseMeter: 0, cultureLevel: 0,
    activeCrisis: null, crisisDone: {}, starveTimer: 0,
    traitPending: false, eraPending: false,
    idSeq: 1, agentTimer: 0, selectedId: null,
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

  // ---- 派生：权重份额 / 乘数 ----
  function weightSum() { return DATA.pillars.reduce((s,p) => s + (state.weights[p.id]||0), 0) || 1; }
  function share(p) { return (state.weights[p]||0) / weightSum(); }
  function creedOn(id) { return !!state.creeds[id]; }
  const creedFarmMult   = () => 1 + (creedOn('agrarian') ? 0.5 : 0);
  const creedPowerMult  = () => 1 + (creedOn('industrial') ? 0.2 : 0);
  const creedResearchMult = () => 1 + (creedOn('scientific') ? 0.3 : 0);
  const creedExploreMult  = () => 1 + (creedOn('expansion') ? 0.5 : 0);
  const creedCultureMult  = () => 1 + (creedOn('conserv') ? 0.5 : 0);
  const creedDefenseMult  = () => 1 + (creedOn('militant') ? 0.5 : 0);
  function techNodeMult(type) {
    let m = 1;
    for (const t of DATA.techs) if (state.techs[t.id] && t.effect && t.effect.type === 'buff' && t.effect.node === type) m *= t.effect.mult;
    return m;
  }
  function techResMult() {
    let m = 1;
    for (const t of DATA.techs) if (state.techs[t.id] && t.effect && t.effect.type === 'buff' && t.effect.res === 'research') m *= t.effect.mult;
    return m;
  }
  function traitMult(key) {
    let m = 1;
    for (const tr of DATA.traits) if (state.traits[tr.id] && tr.eff[key]) m *= (1 + tr.eff[key]);
    return m;
  }
  const cultureBonus = () => 1 + 0.02 * state.cultureLevel;
  const levelMult = (n) => Math.pow(UPGRADE.powerMult, (n.level||1) - 1);
  function regionBonus(res) {
    let b = 1;
    for (const r of DATA.regions) if (state.regions[r.id] && state.regions[r.id].done && r.bonus && r.bonus[res]) b += r.bonus[res];
    return b;
  }

  // ---- 区域/节点解锁判定 ----
  function regionDiscovered(id) { return state.regions[id] && state.regions[id].done; }
  function nodeUnlocked(type) {
    const t = DATA.nodes[type];
    if (state.era < t.era) return false;
    if (t.tech && !state.techs[t.tech]) return false;
    if (t.region && !regionDiscovered(t.region)) return false;
    return true;
  }

  // ---- 劳动力 / 人口 / 食物 ----
  function foodRate() {
    let f = 2.0; // 采集基线
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'farm') f += t.food * levelMult(n) * techNodeMult(n.type) * traitMult('food') * creedFarmMult() * regionBonus('food');
    }
    return f;
  }
  function popTarget() { return foodRate() * 250; }
  function labor() { return Math.floor(state.pop / 100); }

  // ---- 能源 / EROI ----
  function totalPower() {
    let p = 0;
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'energy' && n.staffed) p += (n.power || 0);
    }
    return p * creedPowerMult() * traitMult('power') * cultureBonus();
  }
  function chainEROI() {
    let num = 0, den = 0;
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'energy' && n.staffed && n.power > 0) {
        num += n.power * creedPowerMult() * traitMult('power') * cultureBonus();
        den += n.power / (t.eroi || 1);
      }
    }
    return den > 0 ? num / den : 0;
  }
  function researchRate() {
    let r = state.P / 5e4 * techResMult() * traitMult('research') * creedResearchMult() * (1 + 2 * share('research'));
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'research' && n.staffed) r += t.rps * techNodeMult(n.type);
    }
    return r;
  }
  function fuelShortage() {
    const sup = { wood: 0, water: 0 }, dem = { wood: 0, water: 0 };
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'source') for (const k in t.out) sup[k] += t.out[k] * levelMult(n) * regionBonus(k) * (n.debuff||1);
      if (t.cat === 'energy' && n.staffed) for (const k in t.in) dem[k] += t.in[k];
    }
    return { wood: dem.wood > sup.wood * 1.05, water: dem.water > sup.water * 1.05 };
  }

  // ---- 自动体：雇工（满编或闲置，能源优先）----
  function assignWorkers() {
    let remaining = labor();
    for (const n of state.nodes) n.workers = 0;
    const staffable = state.nodes
      .filter(n => (nodeType(n).cat === 'energy' || nodeType(n).cat === 'research'))
      .sort((a, b) => (nodeType(b).power || nodeType(b).rps || 0) - (nodeType(a).power || nodeType(a).rps || 0));
    for (const n of staffable) {
      const need = nodeType(n).workers || 0;
      if (remaining >= need) { n.workers = need; remaining -= need; }
    }
    for (const n of state.nodes) {
      const t = nodeType(n);
      n.staffed = (t.cat === 'energy' || t.cat === 'research') ? (n.workers >= (t.workers||0)) : true;
    }
  }

  // ---- 自动体：建节点 ----
  function canBuild(type) {
    if (!nodeUnlocked(type)) return false;
    return state.energyPool >= DATA.nodes[type].cost;
  }
  function nextPos(type) {
    const cat = DATA.nodes[type].cat;
    const cols = { source: 120, farm: 250, energy: 400, research: 570 };
    const same = state.nodes.filter(n => nodeType(n).cat === cat).length;
    return { x: cols[cat], y: 50 + (same % 9) * 66 };
  }
  function buildNode(type) {
    const t = DATA.nodes[type];
    if (!canBuild(type)) return false;
    state.energyPool -= t.cost;
    const id = 'n' + (state.idSeq++);
    const p = nextPos(type);
    state.nodes.push({ id, type, x: p.x, y: p.y, workers: 0, level: 1, staffed: true, power: 0, shortage: false });
    log('🏗️ 文明兴建：' + t.icon + ' ' + t.name, '');
    return true;
  }
  function bestEnergy() {
    const cands = Object.keys(DATA.nodes).filter(k => DATA.nodes[k].cat === 'energy' && nodeUnlocked(k));
    cands.sort((a, b) => DATA.nodes[b].power - DATA.nodes[a].power);
    return cands[0] || null;
  }
  function energyFuelExists(type) {
    const fuel = Object.keys(DATA.nodes[type].in)[0];
    const src = fuelSourceFor(fuel);
    return src ? state.nodes.some(n => n.type === src) : false;
  }
  function fuelSourceFor(fuel) {
    const map = { wood: ['oldforest','forest'], water: ['greatriver','river'] };
    for (const t of (map[fuel]||[])) if (nodeUnlocked(t)) return t;
    return null;
  }
  function decideBuild() {
    // 1. 燃料短缺 → 建燃料源
    const fs = fuelShortage();
    if (fs.wood) { const s = fuelSourceFor('wood'); if (s && canBuild(s)) return s; }
    if (fs.water) { const s = fuelSourceFor('water'); if (s && canBuild(s)) return s; }
    // 2. 未达标 → 建最强能源（先补燃料源）
    if (state.P < nextTarget(state.era)) {
      const e = bestEnergy();
      if (e && canBuild(e)) {
        const fuel = Object.keys(DATA.nodes[e].in)[0];
        const src = fuelSourceFor(fuel);
        const hasSrc = energyFuelExists(e);
        if (src && !hasSrc && canBuild(src)) return src;
        return e;
      }
    }
    // 3. 加权选择（受国策偏置）
    const choices = [];
    const push = (type, w) => { if (w > 0.05 && canBuild(type)) choices.push({ type, w }); };
    push('farm', share('agri') * 3 + (creedOn('agrarian') ? 2 : 0));
    push('lab', share('research') * 2 + (creedOn('scientific') ? 1.5 : 0));
    push('forest', share('industry') * 1.5);
    push('river', share('industry') * 1.5);
    push('oldforest', share('industry') * 1.5);
    push('greatriver', share('industry') * 1.5);
    const e2 = bestEnergy();
    if (e2) push(e2, share('industry') * 3 + (creedOn('industrial') ? 2 : 0));
    if (!choices.length) return null;
    choices.forEach(c => c.w *= (0.7 + Math.random() * 0.6));
    choices.sort((a, b) => b.w - a.w);
    return choices[0].type;
  }

  // ---- 自动体：升级节点（深度轴）----
  function upgradeCost(n) { return DATA.nodes[n.type].cost * Math.pow(UPGRADE.costFactor, (n.level||1) - 1); }
  function decideUpgrade() {
    if (state.energyPool < 2000) return false;
    const ups = state.nodes.filter(n => (n.level||1) < UPGRADE.maxLevel && upgradeCost(n) < state.energyPool);
    if (!ups.length) return false;
    ups.sort((a, b) => (nodeType(b).power || nodeType(b).food || nodeType(b).rps || 1) - (nodeType(a).power || nodeType(a).food || nodeType(a).rps || 1));
    const n = ups[0];
    state.energyPool -= upgradeCost(n);
    n.level += 1;
    log('⬆️ ' + nodeType(n).name + ' 升到 Lv' + n.level + '（+50%）', '');
    return true;
  }

  // ---- 自动体：探索 ----
  function exploreRegions(dt) {
    const unexplored = DATA.regions.filter(r => !regionDiscovered(r.id));
    if (!unexplored.length) return;
    // 探索消耗的能量 = 探索份额 × 功率
    const spend = share('explore') * state.P * 0.15 * creedExploreMult() * dt;
    if (spend <= 0 || state.energyPool <= 0) return;
    state.energyPool = Math.max(0, state.energyPool - spend);
    // 焦点区域优先，否则按顺序
    let target = unexplored.find(r => r.id === state.agenda) || unexplored[0];
    if (state.agenda === 'auto' || !target) target = unexplored[0];
    const prog = state.regions[target.id] || { prog: 0, done: false };
    prog.prog += (spend / target.cost) * 100;
    if (prog.prog >= 100) {
      prog.prog = 100; prog.done = true;
      state.regions[target.id] = prog;
      state.energyPool += 1500; // 探索奖励
      log('🗺️ 发现新区域：' + target.icon + ' ' + target.name + '！' + target.desc, 'era-log');
      renderRegions(); renderPalette();
    } else {
      state.regions[target.id] = prog;
    }
  }

  // ---- 自动体：研发 ----
  function autoResearch() {
    const av = DATA.techs.filter(t => !state.techs[t.id] && state.era >= t.era && t.prereq.every(p => state.techs[p]) && state.research >= t.cost);
    if (!av.length) return;
    av.sort((a, b) => a.cost - b.cost);
    const t = av[0];
    state.research -= t.cost;
    state.techs[t.id] = true;
    log('🧪 文明研发出：' + t.name, 'era-log');
    renderTechs();
    renderPalette();
  }

  // ---- 危机 ----
  function checkCrisis(dt) {
    if (state.activeCrisis || state.traitPending) return;
    const c = DATA.crises[0]; // 森林枯竭
    if (state.crisisDone[c.id]) return;
    const forestCount = state.nodes.filter(n => n.type === 'forest' || n.type === 'oldforest').length;
    const starving = fuelShortage().wood;
    if (forestCount >= c.trigger.forestMin && starving) {
      state.starveTimer += dt;
      if (state.starveTimer >= c.trigger.starveSeconds) {
        state.activeCrisis = c;
        state.starveTimer = 0;
        renderCrisis();
      }
    } else state.starveTimer = 0;
  }
  function applyCrisisChoice(opt) {
    const c = state.activeCrisis;
    if (!c) return;
    const defenseLevel = Math.floor(state.defenseMeter / 100);
    let res = opt.result;
    if (opt.effect.type === 'invest') {
      state.research += 300;
      res += '（科研 +300，加速「' + DATA.techs.find(t => t.id === opt.effect.unlock).name + '」）';
    } else if (opt.effect.type === 'debuff') {
      const soften = Math.max(0.3, 1 - 0.1 * defenseLevel);
      const mult = 1 - (1 - opt.effect.mult) * soften;
      for (const n of state.nodes) if (n.type === opt.effect.node) n.debuff = (n.debuff || 1) * mult;
      res += '（' + DATA.nodes[opt.effect.node].name + ' 产出 ×' + mult.toFixed(2) + '）';
    } else if (opt.effect.type === 'boost') {
      state.energyPool = Math.max(0, state.energyPool - 2000);
      for (const n of state.nodes) if (n.type === 'forest' || n.type === 'oldforest') n.boost = (n.boost || 1) * opt.effect.wood;
      res += '（薪柴产出 +50%，消耗能量）';
    }
    log('⚖️ 文明裁决：' + c.name + ' — ' + res, 'era-log');
    state.crisisDone[c.id] = true;
    state.activeCrisis = null;
    renderCrisis();
  }

  // ---- 结算引擎 ----
  function settle() {
    const now = Date.now();
    const dt = Math.min(500, now - last) / 1000;
    last = now;
    if (state.traitPending) return;

    // 1. 源生产 → 库存
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'source') {
        for (const k in t.out) {
          const r = DATA.resources[k];
          state.stock[k] = Math.min(r.cap, state.stock[k] + t.out[k] * levelMult(n) * regionBonus(k) * (n.debuff||1) * (n.boost||1) * dt);
        }
      }
    }
    // 2. 能源消耗燃料 → 功率
    for (const n of state.nodes) {
      const t = nodeType(n);
      if (t.cat === 'energy') {
        n.shortage = false;
        if (!n.staffed) { n.power = 0; continue; }
        let ok = true;
        for (const k in t.in) {
          const need = t.in[k] * dt;
          if (state.stock[k] >= need) state.stock[k] -= need;
          else { ok = false; break; }
        }
        if (ok) n.power = t.power * levelMult(n) * techNodeMult(n.type) * (n.debuff||1);
        else { n.power = 0; n.shortage = true; }
      } else if (t.cat === 'research') {
        if (n.staffed && state.energyPool >= t.power * dt) state.energyPool -= t.power * dt;
      }
    }
    // 3. 人口动态
    state.pop += (popTarget() - state.pop) * 0.05 * dt;
    if (state.pop < 10) state.pop = 10;
    // 4. 雇工
    assignWorkers();
    // 5. 功率 / 能量池 / 科研
    state.P = totalPower();
    state.energyPool = Math.min(Math.max(5000, state.P * 10), state.energyPool + state.P * ENERGY_RECHARGE * dt);
    state.research += researchRate() * dt;
    // 6. 文化/国防 meter
    state.cultureMeter += share('culture') * 1.2 * creedCultureMult() * dt;
    if (state.cultureMeter >= 100) { state.cultureMeter -= 100; state.cultureLevel += 1; log('🏛️ 文明印记 +1（永久功率 +2%）', 'era-log'); }
    state.defenseMeter += share('defense') * 1.2 * creedDefenseMult() * dt;
    // 7. 自动体
    state.agentTimer += dt;
    if (state.agentTimer >= AGENT_TICK) {
      state.agentTimer = 0;
      exploreRegions(AGENT_TICK);
      const plan = decideBuild();
      if (plan) buildNode(plan);
      decideUpgrade();
      autoResearch();
    }
    // 8. 危机 / 纪元
    checkCrisis(dt);
    checkEra();
    // 9. 刷新
    refresh();
  }
  let last = Date.now();
  setInterval(settle, TICK);

  // ---- 纪元更替 ----
  function checkEra() {
    const nt = nextTarget(state.era);
    const reached = state.P >= nt;
    const box = $('eraupgrade-box');
    if (box) box.classList.toggle('hidden', !(reached && !state.traitPending && state.era < 4));
    if (reached && !state.eraPending && state.era < 4 && !state.traitPending) {
      // 不自动弹，等玩家点；这里只亮按钮
    }
  }
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
        state.traits[t.id] = true; state.era += 1; state.traitPending = false; state.eraPending = false;
        log('⚜️ 纪元更替 → ' + DATA.eras[state.era].icon + ' ' + DATA.eras[state.era].name + '（特质：' + t.name + '）', 'era-log');
        renderPalette(); renderRegions();
      } catch (e) { log('⚠️ 特质出错', ''); }
    }));
  }

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
  function copyText(t) {
    const done = () => log('📤 已复制', '');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => ta(t));
    else ta(t);
  }
  function ta(t) {
    const x = document.createElement('textarea'); x.value = t; x.style.position = 'fixed'; x.style.opacity = '0';
    document.body.appendChild(x); x.select(); document.execCommand('copy'); document.body.removeChild(x);
    log('📤 已复制', '');
  }
  function exportSave() { save(); copyText(JSON.stringify(state)); }
  function importSave() {
    const raw = prompt('粘贴存档 JSON：');
    if (!raw) return;
    try { const s = JSON.parse(raw); if (!s.nodes) throw new Error('无效存档'); Object.assign(state, s); if (!state.log) state.log = []; save(); renderAll(); log('📥 已导入', ''); }
    catch (e) { alert('导入失败：' + e.message); }
  }

  // ---- 渲染：日志 ----
  function log(msg, cls) { state.log.unshift({ t: Date.now(), msg, cls }); if (state.log.length > 40) state.log.length = 40; renderLog(); }

  // ---- 渲染：数值刷新（每 tick，仅 textContent/width）----
  function refresh() {
    const k = kOf(state.P);
    $('kval').textContent = k.toFixed(3);
    $('kbar-fill').style.width = Math.min(100, Math.max(0, k / 0.4 * 100)) + '%';
    $('eraname').textContent = DATA.eras[state.era].icon + ' ' + DATA.eras[state.era].name;
    $('pval').textContent = fmtP(state.P);
    $('popval').textContent = fmtN(state.pop) + ' 人';
    $('laborval').textContent = state.nodes.filter(n => nodeType(n).workers).reduce((s,n)=>s+n.workers,0) + '/' + labor();
    $('energyval').textContent = fmtN(state.energyPool) + ' J';
    $('researchval').textContent = fmtN(state.research) + '（+' + fmtN(researchRate()) + '/s）';
    $('cultureval').textContent = '印记 ×' + state.cultureLevel + ' ｜ 国防 ' + Math.floor(state.defenseMeter/100);

    for (const k in DATA.resources) {
      const r = DATA.resources[k], v = state.stock[k] || 0;
      const fill = document.querySelector('#res-' + k + ' .resbar-fill');
      const val = document.querySelector('#res-' + k + ' b');
      if (fill) fill.style.width = Math.min(100, v / r.cap * 100) + '%';
      if (val) val.textContent = fmtN(v);
    }

    const er = chainEROI();
    const erEl = $('eroiVal');
    erEl.textContent = er > 0 ? er.toFixed(1) : '—';
    erEl.style.color = er >= 3 ? '#7fe0a8' : er >= 1.5 ? '#ffd97a' : '#ff5d5d';
    $('eroiState').textContent = er >= 3 ? '可持续' : er >= 1.5 ? '⚠ 警戒' : er > 0 ? '🚨 崩塌风险' : '—';
    $('eroiState').style.color = erEl.style.color;
    const short = state.nodes.filter(n => n.shortage).length;
    $('supplyVal').textContent = short > 0 ? '⚠️ ' + short + ' 节点缺料' : '✅ 供给正常';
    $('nodeVal').textContent = state.nodes.length + ' 节点';

    const nt = nextTarget(state.era);
    $('milestoneTarget').textContent = fmtP(nt);
    $('milestoneBar').style.width = Math.min(100, state.P / nt * 100) + '%';
    $('milestoneNext').textContent = state.P >= nt ? '🎉 已达标！点「纪元更替」' : (DATA.eras[state.era+1] ? '→ 进入「' + DATA.eras[state.era+1].name + '」' : '教学段终点');
  }

  // ---- 渲染：结构（状态变化时重建）----
  function renderCreedList() {
    $('creedList').innerHTML = DATA.creeds.map(c => {
      const on = creedOn(c.id);
      const active = Object.keys(state.creeds).length;
      const full = !on && active >= 2;
      return '<div class="creed-item ' + (on ? 'on' : '') + '" data-creed="' + c.id + '" title="' + (full ? '国策槽已满（最多 2 条）' : c.desc) + '">' +
        '<span class="t-name">' + c.icon + ' ' + c.name + '</span>' +
        '<span class="t-desc">' + c.desc + '</span></div>';
    }).join('');
    $('creedList').querySelectorAll('[data-creed]').forEach(d => d.addEventListener('click', () => toggleCreed(d.dataset.creed)));
  }
  function toggleCreed(id) {
    if (state.creeds[id]) { delete state.creeds[id]; }
    else if (Object.keys(state.creeds).length >= 2) { log('⚠️ 国策槽已满（最多 2 条）', ''); }
    else state.creeds[id] = true;
    renderCreedList();
  }
  function renderPillars() {
    $('pillarList').innerHTML = DATA.pillars.map(p => {
      const v = state.weights[p.id];
      return '<div class="pillar-row" data-p="' + p.id + '" title="' + p.desc + '">' +
        '<span class="p-name">' + p.icon + ' ' + p.name + '</span>' +
        '<input type="range" min="0" max="40" value="' + v + '" class="p-range" data-p="' + p.id + '">' +
        '<b class="p-val">' + v + '</b></div>';
    }).join('');
    $('pillarList').querySelectorAll('.p-range').forEach(r => r.addEventListener('input', () => {
      state.weights[r.dataset.p] = +r.value;
      r.parentElement.querySelector('.p-val').textContent = r.value;
    }));
  }
  function renderTechs() {
    $('techList').innerHTML = DATA.techs.map(t => {
      const got = !!state.techs[t.id], visible = state.era >= t.era;
      const prereqOk = t.prereq.every(p => state.techs[p]);
      return '<div class="tech-item ' + (got ? 'bought' : '') + '" title="' + (t.card ? t.card.body : '') + '">' +
        '<span class="t-name">' + t.icon + ' ' + t.name + '</span>' +
        '<span class="t-flag">' + (got ? '✅' : visible && prereqOk ? '🔬' : '🔒') + '</span>' +
        '<span class="t-cost">' + (got ? '' : fmtN(t.cost)) + '</span></div>';
    }).join('');
  }
  function renderRegions() {
    $('regionList').innerHTML = DATA.regions.map(r => {
      const rec = state.regions[r.id] || { prog: 0, done: false };
      const done = rec.done, focus = state.agenda === r.id;
      return '<div class="region-item ' + (done ? 'done' : '') + (focus ? 'focus' : '') + '" data-region="' + r.id + '" title="' + r.desc + '">' +
        '<span class="t-name">' + r.icon + ' ' + r.name + '</span>' +
        '<span class="t-desc">' + (done ? '已发现 · 解锁 ' + DATA.nodes[r.unlock].icon + DATA.nodes[r.unlock].name : '探索中 ' + Math.floor(rec.prog) + '%') + '</span></div>';
    }).join('');
    $('regionList').querySelectorAll('[data-region]').forEach(d => d.addEventListener('click', () => {
      state.agenda = (state.agenda === d.dataset.region) ? 'auto' : d.dataset.region;
      renderRegions();
    }));
  }
  function renderPalette() {
    const el = $('palette');
    if (!el) return;
    el.innerHTML = Object.keys(DATA.nodes).map(k => {
      const t = DATA.nodes[k];
      const unlocked = nodeUnlocked(k);
      const lock = !unlocked ? (t.tech && !state.techs[t.tech] ? '🔒 ' + DATA.techs.find(x=>x.id===t.tech).name : t.region && !regionDiscovered(t.region) ? '🗺️ ' + DATA.regions.find(x=>x.id===t.region).name : '纪元') : '';
      return '<div class="pal-btn ' + (unlocked ? '' : 'locked') + '" title="' + t.card.body + '">' +
        t.icon + ' ' + t.name + '<span class="pal-cost">' + (unlocked ? fmtN(t.cost) + 'J' : lock) + '</span></div>';
    }).join('');
  }
  function renderCrisis() {
    const el = $('eventBanner');
    const c = state.activeCrisis;
    if (!c) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '<div class="ev-tag">⚖️ 文明危机：' + c.icon + ' ' + c.name + '</div>' +
      '<div class="ev-cause">' + c.cause.join(' → ') + '</div>' +
      c.options.map((o, i) => '<button class="btn ev-btn" data-opt="' + i + '">' + o.text + '</button>').join('');
    el.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => applyCrisisChoice(c.options[+b.dataset.opt])));
  }
  function renderLog() { $('logList').innerHTML = state.log.map(l => '<div class="' + (l.cls||'') + '">' + l.msg + '</div>').join(''); }
  function renderNodePanel() {
    const box = $('nodePanel');
    const n = state.nodes.find(x => x.id === state.selectedId);
    if (!n) { box.innerHTML = '<p class="hint">👆 在「文明图」里点节点查看详情。<br><br>你不需要手动操作——文明会自己长大。你负责：定国策、调权重、设探索焦点、裁决危机。</p>'; return; }
    const t = nodeType(n);
    let html = '<div class="ni-head">' + t.icon + ' <b>' + t.name + '</b> <span class="' + (n.staffed && !n.shortage ? 'ni-on' : 'ni-off') + '">' + (n.shortage ? '⚠ 缺料' : n.staffed ? '● 运行' : '👷 缺工') + '</span></div>';
    if (t.cat === 'source') html += '<div class="ni-row">产出：' + Object.entries(t.out).map(([k,v]) => DATA.resources[k].icon + ' ' + (v*levelMult(n)*(n.debuff||1)).toFixed(1) + '/s').join(' ') + '</div>';
    if (t.cat === 'farm') html += '<div class="ni-row">🌾 产粮 ' + (t.food*levelMult(n)).toFixed(1) + '/s（养人）</div>';
    if (t.cat === 'energy') html += '<div class="ni-row">⚡ ' + fmtP(n.power) + ' ｜ EROI ' + t.eroi + ' ｜ 耗 ' + Object.entries(t.in).map(([k,v]) => DATA.resources[k].icon + v + '/s').join('') + '</div>';
    if (t.cat === 'research') html += '<div class="ni-row">🔬 +' + t.rps*levelMult(n) + '/s（耗 ⚡' + t.power + 'W）</div>';
    html += '<div class="ni-row">👷 ' + n.workers + '/' + (t.workers||0) + ' ｜ Lv' + (n.level||1) + '</div>';
    box.innerHTML = html;
  }
  function renderAll() {
    renderCreedList(); renderPillars(); renderTechs(); renderRegions(); renderPalette(); renderCrisis(); renderLog(); renderNodePanel();
  }

  // ---- 视图切换 ----
  function setView(v) {
    $('map').classList.toggle('hidden', v !== 'map');
    $('graph').classList.toggle('hidden', v !== 'graph');
    $('tab-map').classList.toggle('active', v === 'map');
    $('tab-graph').classList.toggle('active', v === 'graph');
  }

  // ---- 静态绑定 ----
  $('tab-map').addEventListener('click', () => setView('map'));
  $('tab-graph').addEventListener('click', () => setView('graph'));
  $('btn-upgrade-era').addEventListener('click', tryUpgrade);
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
  $('traitOverlay').addEventListener('click', (e) => { if (e.target.id === 'traitOverlay') $('traitOverlay').classList.add('hidden'); });
  $('btnLogToggle').addEventListener('click', () => $('logBox').classList.toggle('collapsed'));
  $('btnDebugToggle').addEventListener('click', () => $('debugBox').classList.toggle('collapsed'));
  const dbg = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  dbg('btn-save', () => { save(); log('💾 已保存', ''); });
  dbg('btn-export', exportSave);
  dbg('btn-import', importSave);
  dbg('btn-reset', () => { if (confirm('完整重置？')) hardReset(); });
  dbg('btn-cheat-e', () => { state.energyPool += 100000; log('⚡ 调试 +100k J', ''); });
  dbg('btn-cheat-r', () => { state.research += 5000; log('🧪 调试 +5000 科研', ''); });

  // ---- 模板（开局火种，破解死锁）----
  function seedTemplate() {
    if (state.nodes.length > 0) return;
    const mk = (type, x, y, workers) => state.nodes.push({ id: 'n' + (state.idSeq++), type, x, y, workers, level: 1, staffed: true, power: 0, shortage: false });
    mk('forest', 120, 60, 0); mk('campfire', 400, 60, 1);
    mk('forest', 120, 126, 0); mk('campfire', 400, 126, 1);
    log('🔥 火种点燃：森林 → 篝火。文明开始自己长大。', 'era-log');
    log('🧭 你是引导者，不是工匠：定国策、调权重、设探索焦点。', '');
  }

  // ---- 启动 ----
  load();
  seedTemplate();
  renderAll();
  refresh();
  setView('map');

  // ---- 对外 ----
  window.EXP = {
    game: {
      state, log, renderAll, renderNodePanel,
      setSelected: (id) => { state.selectedId = id; renderNodePanel(); },
      fmtP, fmtN,
    },
    graph: state, fmtP, fmtN, DATA,
  };
})();
