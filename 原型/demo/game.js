/* ============================================================
 * 《文明指数》教学段垂直切片 — 游戏逻辑 game.js v0.2
 * 核心循环：P 指数增长（能源+科技+特质叠加增长率）→ 能量储备
 *           → 扩建(跳升) / 科研(购买科技) → 冲纪元门槛 → 更替
 * v0.2 修复：渲染分离（R1-R3，消除 hover 闪烁/难点击）
 *           + Tooltip 系统（data-tip 委托）+ 暴露状态给 scene.js
 * ============================================================ */
(function () {
  'use strict';
  const SAVE_KEY = 'exponent-demo-v1';

  // ---- 状态 ----
  const state = {
    era: 0,
    P: 1e6,
    energy: 0,
    research: 0,
    growthBase: 0.002,
    sourceId: 'fire',
    techs: {},
    traits: {},
    buildings: {},
    events: {},
    eventQueue: [],
    activeEvent: null,
    nextEventTimer: 0,
    traitPending: false,
    log: [],
    startedAt: Date.now(),
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
  const fmtE = (e) => {
    if (e >= 1e15) return (e / 1e15).toFixed(2) + ' PJ';
    if (e >= 1e12) return (e / 1e12).toFixed(1) + ' TJ';
    if (e >= 1e9)  return (e / 1e9).toFixed(1) + ' GJ';
    if (e >= 1e6)  return (e / 1e6).toFixed(1) + ' MJ';
    return e.toFixed(0) + ' J';
  };
  const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0));

  const kOf = (p) => (Math.log10(p) - 6) / 10;
  const nextTarget = (era) => Math.pow(10, 6 + era + 1);
  const currentEra = () => DATA.eras[state.era];

  // ---- 增长率 ----
  function growthRate() {
    let g = state.growthBase;
    const src = DATA.sources.find(s => s.id === state.sourceId);
    if (src) g += src.growth;
    for (const t of DATA.techs) if (state.techs[t.id]) g += t.growth;
    for (const tr of DATA.traits) if (state.traits[tr.id]) g += tr.growth;
    return g;
  }
  function researchRate() { return state.P / 1e5; }

  // ---- 保存 / 加载 ----
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      Object.assign(state, s);
      if (!state.eventQueue) state.eventQueue = [];
      if (!state.traits) state.traits = {};
      if (!state.buildings) state.buildings = {};
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

  // ---- 日志 ----
  function log(msg, cls) {
    state.log.unshift({ t: Date.now(), msg, cls });
    if (state.log.length > 60) state.log.length = 60;
    renderLog();
  }

  // ---- 科学卡（点击弹层）----
  function openCard(title, body, extra) {
    const box = $('modal-box');
    box.innerHTML = '<div class="card-title">' + title + '</div>' +
      '<div class="card-body">' + body + '</div>' +
      (extra ? '<div class="card-body" style="margin-top:10px;color:#9fb2dd;font-size:12px">' + extra + '</div>' : '') +
      '<button class="btn btn-gold card-close" onclick="document.getElementById(\'modal\').classList.add(\'hidden\')">关闭</button>';
    $('modal').classList.remove('hidden');
  }

  /* ================= Tooltip 系统 ================= */
  const tipEl = $('tooltip');
  let tipTimer = null;
  function showTip(html, x, y) {
    tipEl.innerHTML = html;
    tipEl.classList.remove('hidden');
    positionTip(x, y);
  }
  function positionTip(x, y) {
    const r = tipEl.getBoundingClientRect();
    let tx = x + 14, ty = y + 14;
    if (tx + r.width > innerWidth - 8) tx = x - r.width - 14;
    if (ty + r.height > innerHeight - 8) ty = y - r.height - 14;
    tipEl.style.left = tx + 'px';
    tipEl.style.top = ty + 'px';
  }
  function hideTip() { tipEl.classList.add('hidden'); }
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { hideTip(); return; }
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { showTip(t.dataset.tip, e.clientX, e.clientY); }, 150);
  });
  document.addEventListener('mousemove', (e) => {
    if (!tipEl.classList.contains('hidden')) positionTip(e.clientX, e.clientY);
  });
  document.addEventListener('mouseout', (e) => {
    if (tipTimer) clearTimeout(tipTimer);
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) hideTip();
  });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---- 科技 DOM 缓存（局部刷新用）----
  const techDom = {};

  /* ================= 结构渲染（仅状态变化时调用） ================= */
  function renderStructure() {
    const era = currentEra();
    $('eraname').textContent = era.icon + ' ' + era.name;

    // 更替按钮
    const canUp = state.P >= nextTarget(state.era) && !state.traitPending;
    $('eraupgrade-box').classList.toggle('hidden', !canUp);

    renderSources();
    renderBuildings();
    renderTechs();
    renderEvent();
    renderLog();
  }

  function renderSources() {
    const el = $('sourceList');
    el.innerHTML = DATA.sources.map(s => {
      const unlocked = state.era >= s.era;
      const active = state.sourceId === s.id;
      const tip = esc(s.card.body) + '<span class="tip-tag">🔖 ' + esc(s.name) + ' ｜ 增长率 +' + (s.growth * 100).toFixed(1) + '%/s ｜ ' + esc(s.unlock) + '</span>';
      return '<div class="src-item ' + (active ? 'active' : '') + '" data-src="' + s.id + '" data-tip="' + tip + '">' +
        '<span>' + s.icon + ' ' + s.name + '</span>' +
        (unlocked
          ? '<span class="s-growth">+' + (s.growth * 100).toFixed(1) + '%/s</span>'
          : '<span class="s-lock">🔒 ' + s.unlock + '</span>') +
        '</div>';
    }).join('');
    el.querySelectorAll('[data-src]').forEach(d => {
      d.addEventListener('click', () => {
        const s = DATA.sources.find(x => x.id === d.dataset.src);
        if (state.era >= s.era && state.sourceId !== s.id) {
          state.sourceId = s.id;
          log('能源切换：' + s.name, '');
        }
        openCard(s.card.title, s.card.body, '解锁：' + s.unlock + ' ｜ 增长率 +' + (s.growth * 100).toFixed(1) + '%/s');
        renderStructure();
      });
    });
  }

  function renderBuildings() {
    const el = $('buildList');
    el.innerHTML = DATA.buildings.filter(b => state.era >= b.era).map(b => {
      const cost = state.P * b.sec;
      const afford = state.energy >= cost;
      const cnt = state.buildings[b.id] || 0;
      const tip = esc(b.desc) + '<span class="tip-tag">🔖 ' + esc(b.name) + ' ｜ 成本 ' + fmtE(cost) + ' ｜ 效果 功率 +' + b.pct + '%</span>';
      return '<div class="bld-item" data-bld="' + b.id + '" data-tip="' + tip + '">' +
        '<span>' + b.icon + ' ' + b.name + ' <small class="hint">×' + cnt + '</small></span>' +
        '<span class="b-cost">' + (afford ? '' : '🔒 ') + fmtE(cost) + '</span>' +
        '<span class="b-pct">+' + b.pct + '%</span></div>';
    }).join('');
    el.querySelectorAll('[data-bld]').forEach(d => {
      d.addEventListener('click', () => {
        const b = DATA.buildings.find(x => x.id === d.dataset.bld);
        if (state.era < b.era) return;
        const cost = state.P * b.sec;
        if (state.energy < cost) { log('能量不足，无法建造：' + b.name, ''); return; }
        state.energy -= cost;
        state.buildings[b.id] = (state.buildings[b.id] || 0) + 1;
        state.P *= (1 + b.pct / 100);
        log('⛏️ 建造 ' + b.name + '：功率 +' + b.pct + '%', '');
        renderStructure();
      });
    });
  }

  function renderTechs() {
    const el = $('techList');
    el.innerHTML = DATA.techs.map(t => {
      const visible = state.era >= t.era;
      const bought = !!state.techs[t.id];
      const prereqOk = t.prereq.every(p => state.techs[p]);
      const afford = state.research >= t.cost;
      const flag = !visible ? '🔒 未来纪元' : !prereqOk ? '🔒 需前置' : bought ? '✅' : afford ? '可购买' : '科研不足';
      const tip = esc(t.card.body) + '<span class="tip-tag">🔖 ' + esc(t.name) + ' ｜ 成本 ' + fmtN(t.cost) + ' 科研点 ｜ 增长率 +' + (t.growth * 100).toFixed(2) + '%/s</span>';
      return '<div class="tech-item ' + (bought ? 'bought' : '') + '" data-tech="' + t.id + '" data-tip="' + tip + '">' +
        '<span class="t-name">' + t.icon + ' ' + t.name + '</span>' +
        '<span class="t-flag">' + flag + '</span>' +
        '<span class="t-cost">' + (bought ? '' : fmtN(t.cost) + ' 点') + '</span></div>';
    }).join('');
    el.querySelectorAll('[data-tech]').forEach(d => {
      const t = DATA.techs.find(x => x.id === d.dataset.tech);
      techDom[t.id] = {
        el: d,
        flag: d.querySelector('.t-flag'),
        cost: d.querySelector('.t-cost'),
      };
      d.addEventListener('click', () => {
        const visible = state.era >= t.era;
        const prereqOk = t.prereq.every(p => state.techs[p]);
        if (visible && !state.techs[t.id] && prereqOk && state.research >= t.cost) {
          state.research -= t.cost;
          state.techs[t.id] = true;
          if (t.unlock) state.sourceId = t.unlock;
          log('🧪 科技解锁：' + t.name + (t.unlock ? '（能源：' + DATA.sources.find(s => s.id === t.unlock).name + '）' : ''), '');
          renderStructure();
        } else if (!state.techs[t.id]) {
          openCard(t.card.title, t.card.body, '成本 ' + fmtN(t.cost) + ' 科研点 ｜ 增长率 +' + (t.growth * 100).toFixed(2) + '%/s');
        }
      });
    });
  }

  // ---- 事件 ----
  function scheduleEvent() {
    const candidates = DATA.events.filter(e => state.era >= e.eraMin && !state.events[e.id]);
    if (!candidates.length) { state.nextEventTimer = -1; return; }
    state.nextEventTimer = 18 + Math.random() * 12;
  }
  function renderEvent() {
    const el = $('eventPanel');
    const ev = state.activeEvent;
    if (!ev) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = '<h3>⚠️ 文明事件：' + ev.name + '</h3>' +
      '<div class="cause-chain">因果链：<br>' + ev.cause.map(c => '▸ ' + c).join('<br>') + '</div>' +
      ev.options.map((o, i) => '<button class="btn opt-btn" data-opt="' + i + '" data-tip="' + esc(o.result) + '">' + o.text + '</button>').join('') +
      '<div id="eventResult" class="hint" style="margin-top:6px"></div>';
    el.querySelectorAll('[data-opt]').forEach(b => {
      b.addEventListener('click', () => {
        const idx = +b.dataset.opt;
        const opt = ev.options[idx];
        const r = applyEventChoice(ev, opt);
        const rEl = $('eventResult');
        if (rEl) rEl.textContent = '结果：' + r;
        el.querySelectorAll('.opt-btn').forEach(x => { x.disabled = true; });
      });
    });
  }
  function applyEventChoice(ev, opt) {
    let res = opt.result;
    if (opt.effect.source) {
      const s = DATA.sources.find(x => x.id === opt.effect.source);
      if (s && state.era >= s.era) { state.sourceId = s.id; res += '（能源切至 ' + s.name + '）'; }
      else res += '（该能源尚未解锁，转型受阻！）';
    }
    if (opt.effect.penalty) {
      const actual = Math.min(opt.effect.penalty, state.growthBase - 0.001);
      state.growthBase -= actual;
      res += '（基础增长率 -' + (actual * 100).toFixed(1) + '%/s）';
    }
    if (opt.effect.pct) { state.P *= (1 - opt.effect.pct); res += '（功率 -' + (opt.effect.pct * 100).toFixed(0) + '%）'; }
    log('🌍 事件应对：' + ev.name + ' — ' + res, '');
    state.events[ev.id] = true;
    state.activeEvent = null;
    scheduleEvent();
    renderStructure();
    return res;
  }

  // ---- 纪元更替 ----
  function tryUpgrade() {
    if (state.P < nextTarget(state.era)) return;
    if (state.traitPending) return;
    const nextEra = DATA.eras[state.era + 1];
    if (!nextEra) { log('🏆 已达到教学段终点 K=0.4！', 'era-log'); return; }
    state.traitPending = true;
    $('erao-icon').textContent = nextEra.icon;
    $('erao-name').textContent = nextEra.name;
    $('erao-desc').textContent = nextEra.desc;
    $('eraOverlay').classList.remove('hidden');
    const pool = DATA.traits.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const tl = $('traitList');
    tl.innerHTML = pool.map(t =>
      '<div class="trait-item" data-trait="' + t.id + '" data-tip="' + esc(t.desc + ' ｜ 增长率 +' + (t.growth * 100).toFixed(1) + '%/s（永久）') + '">' +
      '<span class="t-icon">' + t.icon + '</span>' +
      '<div><div class="t-name">' + t.name + '</div><div class="t-desc">' + t.desc + '</div></div>' +
      '<span class="t-growth">+' + (t.growth * 100).toFixed(1) + '%/s</span></div>').join('');
    tl.querySelectorAll('[data-trait]').forEach(d => {
      d.addEventListener('click', () => {
        const t = DATA.traits.find(x => x.id === d.dataset.trait);
        state.traits[t.id] = true;
        state.era += 1;
        state.traitPending = false;
        state.activeEvent = null;
        $('eraOverlay').classList.add('hidden');
        $('traitOverlay').classList.add('hidden');
        log('⚜️ 纪元更替 → ' + nextEra.icon + ' ' + nextEra.name + '（特质：' + t.name + '）', 'era-log');
        scheduleEvent();
        renderStructure();
      });
    });
  }

  /* ================= 数值刷新（tick 每帧调用，不重建 DOM） ================= */
  function refresh() {
    const k = kOf(state.P);
    $('kval').textContent = k.toFixed(3);
    $('kbar-fill').style.width = Math.min(100, Math.max(0, k / 0.4 * 100)) + '%';
    const reached = state.P >= nextTarget(state.era);
    $('kbar-next').textContent = reached ? '🎉 可更替！' : '';
    $('kbar-next').style.cssText = reached ? 'color:#7fe0a8;margin-left:10px;' : '';

    const era = currentEra();
    $('eraname').textContent = era.icon + ' ' + era.name;
    $('pval').textContent = fmtP(state.P);
    $('growthval').textContent = (growthRate() * 100).toFixed(2) + '%/s';
    $('energyval').textContent = fmtE(state.energy);
    $('researchval').textContent = fmtN(state.research);
    const pop = Math.max(1, Math.round(Math.pow(state.P / 1e6, 0.6) * 100));
    $('popval').textContent = fmtN(pop) + ' 人';
    $('nexttarget').textContent = 'K ' + (state.era + 1) / 10 + ' · ' + fmtP(nextTarget(state.era));

    const canUp = state.P >= nextTarget(state.era) && !state.traitPending && state.era < 4;
    $('eraupgrade-box').classList.toggle('hidden', !canUp);

    // 科技 flag 局部刷新（不重建）
    for (const id in techDom) {
      const t = DATA.techs.find(x => x.id === id);
      const d = techDom[id];
      if (!t || !d) continue;
      const visible = state.era >= t.era;
      const bought = !!state.techs[id];
      const prereqOk = t.prereq.every(p => state.techs[p]);
      const afford = state.research >= t.cost;
      d.el.classList.toggle('bought', bought);
      d.flag.textContent = !visible ? '🔒 未来纪元' : !prereqOk ? '🔒 需前置' : bought ? '✅' : afford ? '可购买' : '科研不足';
      d.cost.textContent = bought ? '' : fmtN(t.cost) + ' 点';
    }
  }

  function renderLog() {
    const el = $('log');
    el.innerHTML = state.log.map(l =>
      '<div class="' + (l.cls || '') + '">[' + new Date(l.t).toLocaleTimeString() + '] ' + l.msg + '</div>').join('');
  }

  // ---- 主循环 ----
  const TICK = 100;
  let last = Date.now();
  function tick() {
    const now = Date.now();
    const dt = Math.min(500, now - last) / 1000;
    last = now;
    if (!state.traitPending) {
      const g = growthRate();
      state.P *= (1 + g * dt);
      state.energy += state.P * 0.2 * dt;
      state.research += researchRate() * dt;
    }
    if (state.nextEventTimer > 0) {
      state.nextEventTimer -= dt;
      if (state.nextEventTimer <= 0 && !state.activeEvent && !state.traitPending) {
        const candidates = DATA.events.filter(e => state.era >= e.eraMin && !state.events[e.id]);
        if (candidates.length) { state.activeEvent = candidates[0]; renderStructure(); }
      }
    }
    refresh();
  }
  setInterval(tick, TICK);
  setInterval(save, 5000);

  // ---- 静态事件绑定 ----
  $('btn-upgrade').addEventListener('click', tryUpgrade);
  $('btn-trait').addEventListener('click', () => { $('traitOverlay').classList.remove('hidden'); });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
  $('traitOverlay').addEventListener('click', (e) => { if (e.target.id === 'traitOverlay') $('traitOverlay').classList.add('hidden'); });
  document.querySelector('.title').addEventListener('dblclick', () => { if (confirm('重置进度？')) hardReset(); });

  // ---- 启动 ----
  load();
  if (state.log.length === 0) {
    log('🔥 文明诞生于火种。点击左侧能源/科技查看科学卡；悬停可看详情。', 'era-log');
  }
  renderStructure();
  refresh();
  scheduleEvent();

  // ---- 暴露给 scene.js ----
  window.EXPONENT = { get state() { return state; }, data: DATA, fmtP: fmtP };
})();
