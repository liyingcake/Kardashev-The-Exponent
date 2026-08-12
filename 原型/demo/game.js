/* ============================================================
 * 《文明指数》教学段垂直切片 — 游戏逻辑 game.js
 * 核心循环：P 指数增长（能源+科技+特质叠加增长率）→ 能量储备
 *           → 扩建(跳升) / 科研(购买科技) → 冲纪元门槛 → 更替
 * 验证点：核心循环手感 / 科学卡 / 因果链事件 / 纪元演出+特质
 * ============================================================ */
(function () {
  'use strict';
  const SAVE_KEY = 'exponent-demo-v1';

  // ---- 状态 ----
  const state = {
    era: 0,
    P: 1e6,                 // 总功率 W
    energy: 0,              // 能量储备（可花，单位 W·s ≈ J）
    research: 0,            // 科研点
    growthBase: 0.002,      // 基础每秒增长率
    sourceId: 'fire',
    techs: {},              // id -> bought
    traits: {},             // id -> owned
    buildings: {},          // id -> count
    events: {},             // id -> done
    eventQueue: [],         // 待触发事件 id
    nextEventTimer: 0,
    traitPending: false,    // 等待特质选择
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

  // ---- 科研点速率 ----
  function researchRate() { return state.P / 1e5; }

  // ---- 保存 / 加载 ----
  function save() {
    state.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      Object.assign(state, s);
      // 重建缺失字段
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

  // ---- 科学卡 ----
  function openCard(title, body, extra) {
    const box = $('modal-box');
    box.innerHTML = '<div class="card-title">' + title + '</div>' +
      '<div class="card-body">' + body + '</div>' +
      (extra ? '<div class="card-body" style="margin-top:10px;color:#9fb2dd;font-size:12px">' + extra + '</div>' : '') +
      '<button class="btn btn-gold card-close" onclick="document.getElementById(\'modal\').classList.add(\'hidden\')">关闭</button>';
    $('modal').classList.remove('hidden');
  }

  // ---- 渲染 ----
  function render() {
    // 顶部 K
    const k = kOf(state.P);
    $('kval').textContent = k.toFixed(3);
    const pct = Math.min(100, Math.max(0, (k - 0) / 0.4 * 100));
    $('kbar-fill').style.width = pct + '%';
    const next = nextTarget(state.era);
    $('kbar-next').textContent = state.P >= next ? '🎉 可更替！' : '';
    $('kbar-next').style.cssText = state.P >= next ? 'color:#7fe0a8;margin-left:10px;' : '';

    const era = currentEra();
    $('eraname').textContent = era.icon + ' ' + era.name;
    $('pval').textContent = fmtP(state.P);
    $('growthval').textContent = (growthRate() * 100).toFixed(2) + '%/s';
    $('energyval').textContent = fmtE(state.energy);
    $('researchval').textContent = fmtN(state.research);
    const pop = Math.max(1, Math.round(Math.pow(state.P / 1e6, 0.6) * 100));
    $('popval').textContent = fmtN(pop) + ' 人';
    $('nexttarget').textContent = 'K ' + (state.era + 1) / 10 + ' · ' + fmtP(nextTarget(state.era));

    // 更替按钮
    const canUp = state.P >= next && !state.traitPending;
    $('eraupgrade-box').classList.toggle('hidden', !canUp);

    // 能源
    renderSources();
    // 建筑
    renderBuildings();
    // 科技
    renderTechs();
    // 事件
    renderEvent();
  }

  function renderSources() {
    const el = $('sourceList');
    el.innerHTML = DATA.sources.map(s => {
      const unlocked = state.era >= s.era;
      const active = state.sourceId === s.id;
      return '<div class="src-item ' + (active ? 'active' : '') + '" data-src="' + s.id + '" title="点击查看科学卡">' +
        '<span>' + s.icon + ' ' + s.name + '</span>' +
        (unlocked
          ? '<span class="s-growth">+' + (s.growth * 100).toFixed(1) + '%/s</span>'
          : '<span class="s-lock">🔒 ' + s.unlock + '</span>') +
        '</div>';
    }).join('');
    el.querySelectorAll('[data-src]').forEach(d => {
      d.addEventListener('click', () => {
        const s = DATA.sources.find(x => x.id === d.dataset.src);
        if (state.era >= s.era) state.sourceId = s.id;
        openCard(s.card.title, s.card.body, '解锁：' + s.unlock + '｜ 增长率 +' + (s.growth * 100).toFixed(1) + '%/s｜来源见卡内');
        if (state.era >= s.era && state.sourceId !== s.id) log('能源切换：' + s.name, '');
        render();
      });
    });
  }

  function renderBuildings() {
    const el = $('buildList');
    el.innerHTML = DATA.buildings.filter(b => state.era >= b.era).map(b => {
      const cost = state.P * b.sec;
      const afford = state.energy >= cost;
      const cnt = state.buildings[b.id] || 0;
      return '<div class="bld-item" data-bld="' + b.id + '">' +
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
        render();
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
      const canBuy = visible && !bought && prereqOk && afford;
      const flag = !visible ? '🔒 未来纪元' : !prereqOk ? '🔒 需前置' : bought ? '✅' : canBuy ? '可购买' : '科研不足';
      return '<div class="tech-item ' + (bought ? 'bought' : '') + '" data-tech="' + t.id + '" title="点击查看科学卡">' +
        '<span class="t-name">' + t.icon + ' ' + t.name + '</span>' +
        '<span class="t-flag">' + flag + '</span>' +
        '<span class="t-cost">' + (bought ? '' : fmtN(t.cost) + ' 点') + '</span></div>';
    }).join('');
    el.querySelectorAll('[data-tech]').forEach(d => {
      d.addEventListener('click', () => {
        const t = DATA.techs.find(x => x.id === d.dataset.tech);
        const visible = state.era >= t.era;
        const prereqOk = t.prereq.every(p => state.techs[p]);
        if (visible && !state.techs[t.id] && prereqOk && state.research >= t.cost) {
          state.research -= t.cost;
          state.techs[t.id] = true;
          if (t.unlock) state.sourceId = t.unlock;
          log('🧪 科技解锁：' + t.name + (t.unlock ? '（能源：' + DATA.sources.find(s => s.id === t.unlock).name + '）' : ''), '');
          render();
        } else if (!state.techs[t.id]) {
          openCard(t.card.title, t.card.body, '成本 ' + fmtN(t.cost) + ' 科研点｜增长率 +' + (t.growth * 100).toFixed(2) + '%/s');
        }
      });
    });
  }

  // ---- 事件 ----
  function scheduleEvent() {
    // 按纪元顺序排一个待触发事件（每个纪元一个）
    const candidates = DATA.events.filter(e => state.era >= e.eraMin && !state.events[e.id]);
    if (!candidates.length) { state.nextEventTimer = -1; return; }
    const e = candidates[0];
    state.nextEventTimer = 18 + Math.random() * 12; // 18-30s 后触发
  }
  function renderEvent() {
    const el = $('eventPanel');
    const ev = state.activeEvent;
    if (!ev) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = '<h3>⚠️ 文明事件：' + ev.name + '</h3>' +
      '<div class="cause-chain">因果链：<br>' + ev.cause.map(c => '▸ ' + c).join('<br>') + '</div>' +
      ev.options.map((o, i) => '<button class="btn opt-btn" data-opt="' + i + '">' + o.text + '</button>').join('') +
      '<div id="eventResult" class="hint" style="margin-top:6px"></div>';
    el.querySelectorAll('[data-opt]').forEach(b => {
      b.addEventListener('click', () => {
        const idx = +b.dataset.opt;
        const opt = ev.options[idx];
        const r = applyEventChoice(ev, opt);
        $('eventResult').textContent = '结果：' + r;
        el.querySelectorAll('.opt-btn').forEach(x => x.disabled = true);
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
    render();
    return res;
  }

  // ---- 纪元更替 ----
  function tryUpgrade() {
    if (state.P < nextTarget(state.era)) return;
    if (state.traitPending) return;
    state.traitPending = true;
    // 演出
    const nextEra = DATA.eras[state.era + 1];
    if (!nextEra) { log('🏆 已达到教学段终点 K=0.4！', 'era-log'); return; }
    $('erao-icon').textContent = nextEra.icon;
    $('erao-name').textContent = nextEra.name;
    $('erao-desc').textContent = nextEra.desc;
    $('eraOverlay').classList.remove('hidden');
    // 抽 3 个特质
    const pool = DATA.traits.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const tl = $('traitList');
    tl.innerHTML = pool.map(t =>
      '<div class="trait-item" data-trait="' + t.id + '">' +
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
        render();
      });
    });
  }

  // ---- 主循环 ----
  const TICK = 100; // ms
  let last = Date.now();
  function tick() {
    const now = Date.now();
    const dt = Math.min(500, now - last) / 1000;
    last = now;
    if (!state.traitPending) {
      const g = growthRate();
      state.P *= (1 + g * dt);
      state.energy += state.P * 0.2 * dt;   // 20% 产出进储备
      state.research += researchRate() * dt;
    }
    // 事件调度
    if (state.nextEventTimer > 0) {
      state.nextEventTimer -= dt;
      if (state.nextEventTimer <= 0 && !state.activeEvent && !state.traitPending) {
        const candidates = DATA.events.filter(e => state.era >= e.eraMin && !state.events[e.id]);
        if (candidates.length) { state.activeEvent = candidates[0]; render(); }
      }
    }
    render();
    // 自动更替提示
    if (state.P >= nextTarget(state.era) && !state.traitPending && state.era < 4) {
      $('eraupgrade-box').classList.remove('hidden');
    }
    save();
  }
  setInterval(tick, TICK);
  setInterval(() => save(), 5000);

  // ---- 事件绑定（非动态） ----
  $('btn-upgrade').addEventListener('click', tryUpgrade);
  $('btn-trait').addEventListener('click', () => { $('traitOverlay').classList.remove('hidden'); });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
  $('traitOverlay').addEventListener('click', (e) => { if (e.target.id === 'traitOverlay') $('traitOverlay').classList.add('hidden'); });
  // 重置（双击标题）
  document.querySelector('.title').addEventListener('dblclick', () => { if (confirm('重置进度？')) hardReset(); });

  function renderLog() {
    const el = $('log');
    el.innerHTML = state.log.map(l =>
      '<div class="' + (l.cls || '') + '">[' + new Date(l.t).toLocaleTimeString() + '] ' + l.msg + '</div>').join('');
  }

  // ---- 启动 ----
  load();
  if (state.log.length === 0) {
    log('🔥 文明诞生于火种。点击左侧能源/科技查看科学卡。', 'era-log');
  }
  renderLog();
  render();
  scheduleEvent();
})();
