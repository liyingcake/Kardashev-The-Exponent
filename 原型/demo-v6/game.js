/* ============================================================
 * 《文明指数》demo-v6 — 引擎 game.js
 * 表现层转向：可视化节点编辑器（中间演示图 + 下面操作窗口）
 * 引擎复用 v5：通配符匹配 + 逆熵结算 + 权重 + EROI。
 * 新增：节点自动布局坐标 + 人类可读命名 + 底部操作窗口。
 * ============================================================ */
(function () {
  'use strict';
  const SAVE_KEY = 'exponent-demo-v6';
  const TICK = 250;

  // 节点自动布局：按窗口类型分列
  const COL_X = { source: 150, process: 400, route: 540, settle: 680, collect: 900 };
  const ROW_Y = 70, ROW_GAP = 135;

  const state = {
    era: 0, P: 0, pop: 120, research: 0,
    streams: { 'matter:raw': 20, 'energy:raw': 10 },
    nodes: [],            // { id, winType, name, input, output, weights, level, x, y }
    creeds: {}, techs: {},
    idSeq: 1, selectedId: null, log: [],
  };

  const $ = (id) => document.getElementById(id);
  const fmtP = (w) => w >= 1e15 ? (w/1e15).toFixed(2)+' PW' : w >= 1e12 ? (w/1e12).toFixed(2)+' TW'
    : w >= 1e9 ? (w/1e9).toFixed(2)+' GW' : w >= 1e6 ? (w/1e6).toFixed(2)+' MW'
    : w >= 1e3 ? (w/1e3).toFixed(1)+' kW' : w.toFixed(0)+' W';
  const fmtN = (n) => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'k' : n.toFixed(1);
  const kOf = (p) => (Math.log10(Math.max(p,1)) - 6) / 10;
  const nextTarget = (era) => Math.pow(10, 6 + era + 1);
  const WT = (n) => DATA.windows[n.winType];

  // ---- 人类可读命名 ----
  function humanStream(k) {
    const si = DATA.streamNames[k];
    return si ? si.icon + ' ' + si.name : k;
  }
  function humanWildcard(pattern) {
    if (!pattern) return '';
    if (pattern === '*') return '✦ 任意流';
    const [d, s] = pattern.split(':');
    if (d === '*') return { raw:'任意原料', refined:'任意精炼物', useful:'任意有用物', waste:'任意废料' }[s] || pattern;
    if (s === '*') return { matter:'任意物质', energy:'任意能量', info:'任意信息' }[d] || pattern;
    return humanStream(pattern);
  }
  function wildcardOptions(selected) {
    const opts = ['*', 'matter:*', 'energy:*', 'info:*', '*:raw', '*:refined', '*:useful', '*:waste',
      'matter:raw', 'energy:raw', 'info:raw', 'matter:refined', 'energy:refined', 'info:refined',
      'matter:useful', 'energy:useful', 'info:useful', 'matter:waste', 'energy:waste', 'info:waste'];
    return opts.map(o => '<option value="' + o + '" ' + (o === selected ? 'selected' : '') + '>' + humanWildcard(o) + '</option>').join('');
  }

  // ---- 通配符匹配 ----
  function matchWildcard(pattern, streamKey) {
    if (!pattern) return false;
    if (pattern === '*') return true;
    const [pd, ps] = pattern.split(':');
    const [sd, ss] = streamKey.split(':');
    return (pd === '*' || pd === sd) && (ps === undefined || ps === '*' || ps === ss);
  }
  function streamsMatching(pattern) {
    return Object.keys(state.streams).filter(k => matchWildcard(pattern, k) && state.streams[k] > 0);
  }

  // ---- 权重 ----
  function weightVal(n, key) { return (n.weights[key] !== undefined ? n.weights[key] : 50) / 100; }

  // ---- 乘数 ----
  function techMult(winType) { let m = 1; for (const t of DATA.techs) if (state.techs[t.id] && t.win === winType) m *= t.mult; return m; }
  function creedMult(winType) { let m = 1; for (const c of DATA.creeds) if (state.creeds[c.id] && c.win === winType) m *= c.mult; return m; }
  function researchMult() { let m = 1; for (const c of DATA.creeds) if (state.creeds[c.id] && c.research) m *= c.research; return m; }

  // ---- 节点 EROI ----
  function nodeEROI(n) {
    if (n.winType !== 'process') return null;
    const eff = weightVal(n, 'efficiency'), thr = weightVal(n, 'throughput');
    return 2 + 6 * eff * (1 - 0.4 * thr) * techMult('process') * creedMult('process');
  }

  // ---- 自动布局 ----
  function layoutNodes() {
    const colCount = {};
    for (const n of state.nodes) {
      const col = COL_X[n.winType] !== undefined ? COL_X[n.winType] : 540;
      const idx = colCount[n.winType] || 0;
      colCount[n.winType] = idx + 1;
      n.x = col;
      n.y = ROW_Y + idx * ROW_GAP;
    }
  }

  // ---- 建造窗口 ----
  function buildWindow(winType) {
    const t = DATA.windows[winType];
    const id = 'w' + (state.idSeq++);
    const n = { id, winType, name: t.name + ' ' + (state.nodes.length + 1),
      input: t.input, output: t.output, weights: {}, level: 1, x: 0, y: 0 };
    for (const w of t.weights) n.weights[w.key] = 50;
    state.nodes.push(n);
    layoutNodes();
    log('🪟 新建：' + t.icon + ' ' + n.name, '');
    return n;
  }

  // ---- 结算 ----
  const ENERGY_PER_USEFUL = 1.5e6;
  function settle() {
    const now = Date.now();
    const dt = Math.min(500, now - last) / 1000;
    last = now;

    // 1. 采集
    for (const n of state.nodes) {
      if (n.winType !== 'source') continue;
      const t = WT(n);
      const yieldMult = weightVal(n, 'yield');
      const rate = 2.0 * (0.4 + 0.6 * yieldMult) * techMult('source') * creedMult('source');
      add(n.output, rate * (t.outputRatio || 1) * dt);
      if (t.secondOutput) add(t.secondOutput, rate * (1 - (t.outputRatio || 0.7)) * dt);
    }
    // 2. 加工（逆熵）
    for (const n of state.nodes) {
      if (n.winType !== 'process') continue;
      const t = WT(n);
      const eff = weightVal(n, 'efficiency'), thr = weightVal(n, 'throughput');
      const inKeys = streamsMatching(n.input);
      if (!inKeys.length) continue;
      const prefer = inKeys.filter(k => k.endsWith(':raw'));
      const pool = (prefer.length ? prefer : inKeys);
      pool.sort((a, b) => state.streams[b] - state.streams[a]);
      const src = pool[0];
      const consume = 1.5 * (0.4 + 0.6 * thr) * dt;
      if (state.streams[src] < consume) continue;
      state.streams[src] -= consume;
      const eroi = nodeEROI(n);
      add(n.output, consume * eroi * 0.5);
      add(t.waste, consume * (1 - eff * 0.7));
    }
    // 3. 消费
    let usefulConsumed = 0;
    for (const n of state.nodes) {
      if (n.winType !== 'settle') continue;
      const t = WT(n);
      const grow = weightVal(n, 'growth'), res = weightVal(n, 'research');
      const inKeys = streamsMatching(n.input);
      if (!inKeys.length) continue;
      const src = inKeys[0];
      const consumeRate = 1.2 * (0.3 + 0.7 * grow);
      const consume = consumeRate * dt;
      if (state.streams[src] < consume) continue;
      state.streams[src] -= consume;
      usefulConsumed += consumeRate;
      add(n.output, consume * 0.8 * techMult('settle') * creedMult('settle'));
      state.research += consume * 0.5 * (0.3 + 0.7 * res) * researchMult();
    }
    const targetP = usefulConsumed * ENERGY_PER_USEFUL;
    state.P += (targetP - state.P) * 0.1;

    // 4. 人口
    const usefulEnergy = state.streams['energy:useful'] || 0;
    const popTarget = 100 + usefulEnergy * 40;
    state.pop += (popTarget - state.pop) * 0.02 * dt;
    if (state.pop < 10) state.pop = 10;

    autoResearch();
    checkEra();
    refresh();
  }
  let last = Date.now();
  setInterval(settle, TICK);

  function add(key, amt) { if (amt <= 0) return; state.streams[key] = (state.streams[key] || 0) + amt; }

  function autoResearch() {
    const av = DATA.techs.filter(t => !state.techs[t.id] && state.era >= t.era && state.research >= t.cost);
    if (!av.length) return;
    av.sort((a, b) => a.cost - b.cost);
    const t = av[0];
    state.research -= t.cost;
    state.techs[t.id] = true;
    log('🧪 研发出：' + t.name, 'era-log');
    renderTechs();
  }

  // ---- 纪元 ----
  function checkEra() {
    const reached = state.P >= nextTarget(state.era);
    const box = $('eraupgrade-box');
    if (box) box.classList.toggle('hidden', !(reached && state.era < 4));
  }
  function tryUpgrade() {
    if (state.P < nextTarget(state.era)) return;
    const nextEra = DATA.eras[state.era + 1];
    if (!nextEra) { log('🏆 教学段完成 K=0.4！', 'era-log'); return; }
    state.era += 1;
    log('⚜️ 纪元更替 → ' + nextEra.icon + ' ' + nextEra.name, 'era-log');
    renderTechs();
  }

  // ---- 存档 ----
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s || !s.nodes) return false;
      Object.assign(state, s);
      if (!state.log) state.log = [];
      if (!state.streams) state.streams = {};
      layoutNodes();
      return true;
    } catch (e) { return false; }
  }
  function hardReset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); }

  // ---- 日志 ----
  function log(msg, cls) { state.log.unshift({ t: Date.now(), msg, cls }); if (state.log.length > 40) state.log.length = 40; renderLog(); }

  // ---- 渲染：数值刷新 ----
  function refresh() {
    const k = kOf(state.P);
    $('kval').textContent = k.toFixed(3);
    $('kbar-fill').style.width = Math.min(100, Math.max(0, k / 0.4 * 100)) + '%';
    $('eraname').textContent = DATA.eras[state.era].icon + ' ' + DATA.eras[state.era].name;
    $('pval').textContent = fmtP(state.P);
    $('popval').textContent = fmtN(state.pop) + ' 人';
    $('researchval').textContent = fmtN(state.research);

    // 流库存（人类可读）
    $('streamList').innerHTML = Object.keys(state.streams)
      .filter(k => state.streams[k] > 0.01)
      .sort((a, b) => state.streams[b] - state.streams[a])
      .slice(0, 10)
      .map(k => {
        const si = DATA.streamNames[k];
        return '<div class="stream-row"><span style="color:' + si.color + '">' + si.icon + ' ' + si.name + '</span>' +
          '<b>' + fmtN(state.streams[k]) + '</b></div>';
      }).join('') || '<p class="hint">暂无流动的流</p>';

    const nt = nextTarget(state.era);
    $('milestoneTarget').textContent = fmtP(nt);
    $('milestoneBar').style.width = Math.min(100, state.P / nt * 100) + '%';
  }

  // ---- 渲染：底部操作窗口 ----
  function renderOpsPanel() {
    const box = $('opsPanel');
    const n = state.nodes.find(x => x.id === state.selectedId);
    if (!n) {
      box.innerHTML = '<div class="ops-placeholder">👆 点击上面演示图中的节点，这里会出现它的操作窗口。<br>节点 = 窗口：改「吃什么/产什么」、拖「策略权重」，看整条链怎么变。</div>';
      return;
    }
    const t = WT(n);
    let html = '<div class="ops-head"><span class="ops-icon" style="color:' + t.color + '">' + t.icon + '</span>' +
      '<div class="ops-title"><b>' + n.name + '</b><small>' + t.name + '</small></div>' +
      '<span class="ops-close" data-close>✕</span></div>';
    html += '<div class="ops-body">';

    // 通配符
    if (t.input !== null) html += '<div class="ops-field"><label>📥 吃什么（输入通配符）</label><select data-winput>' + wildcardOptions(n.input) + '</select></div>';
    if (t.output !== null) html += '<div class="ops-field"><label>📤 产什么（输出通配符）</label><select data-woutput>' + wildcardOptions(n.output) + '</select></div>';

    // 权重滑块
    for (const w of t.weights) {
      const v = n.weights[w.key];
      html += '<div class="ops-field"><label>' + w.name + ' <b class="w-val">' + v + '%</b></label>' +
        '<input type="range" min="0" max="100" value="' + v + '" data-weight="' + w.key + '"></div>';
    }

    // EROI / 废热
    if (n.winType === 'process') {
      const eroi = nodeEROI(n);
      const waste = Math.round((1 - weightVal(n, 'efficiency') * 0.7) * 100);
      html += '<div class="ops-stats"><span>EROI ≈ <b>' + eroi.toFixed(1) + '</b></span>' +
        '<span>废热 <b>' + waste + '%</b></span></div>';
    }
    html += '</div>';
    box.innerHTML = html;

    box.querySelector('[data-close]').addEventListener('click', () => { state.selectedId = null; renderOpsPanel(); });
    box.querySelector('[data-winput]')?.addEventListener('change', (e) => { n.input = e.target.value; log('🔧 ' + n.name + ' 改吃「' + humanWildcard(e.target.value) + '」', ''); });
    box.querySelector('[data-woutput]')?.addEventListener('change', (e) => { n.output = e.target.value; log('🔧 ' + n.name + ' 改产「' + humanWildcard(e.target.value) + '」', ''); });
    box.querySelectorAll('[data-weight]').forEach(r => r.addEventListener('input', () => {
      n.weights[r.dataset.weight] = +r.value;
      r.parentElement.querySelector('.w-val').textContent = r.value + '%';
    }));
  }

  // ---- 渲染：国策 / 科技 / 日志 ----
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
      return '<div class="tech-item ' + (got ? 'bought' : '') + '" title="' + t.desc + '">' +
        '<span class="t-name">' + t.icon + ' ' + t.name + '</span>' +
        '<span class="t-flag">' + (got ? '✅' : visible ? '🔬' : '🔒') + '</span>' +
        '<span class="t-cost">' + (got ? '' : fmtN(t.cost)) + '</span></div>';
    }).join('');
  }
  function renderLog() { $('logList').innerHTML = state.log.map(l => '<div class="' + (l.cls || '') + '">' + l.msg + '</div>').join(''); }
  function renderAll() { renderOpsPanel(); renderCreedList(); renderTechs(); renderLog(); }

  // ---- 静态绑定 ----
  $('btn-upgrade-era').addEventListener('click', tryUpgrade);
  $('btn-add-process').addEventListener('click', () => { buildWindow('process'); renderAll(); });
  $('btnLogToggle').addEventListener('click', () => $('logBox').classList.toggle('collapsed'));
  $('btnDebugToggle').addEventListener('click', () => $('debugBox').classList.toggle('collapsed'));
  const dbg = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  dbg('btn-save', () => { save(); log('💾 已保存', ''); });
  dbg('btn-reset', () => { if (confirm('完整重置？')) hardReset(); });
  dbg('btn-cheat', () => { state.research += 500; state.streams['energy:useful'] = (state.streams['energy:useful'] || 0) + 100; log('🔆 调试 +科研 +有用能量', ''); });

  // ---- 模板 ----
  function seedTemplate() {
    if (state.nodes.length > 0) return;
    buildWindow('source');
    buildWindow('process');
    buildWindow('settle');
    buildWindow('collect');
    layoutNodes();
    log('🔥 逆熵系统启动：采集 → 加工 → 消费 → 收集。', 'era-log');
    log('🧭 点上面演示图里的节点，在下面调它的窗口。', '');
  }

  // ---- 启动 ----
  load();
  seedTemplate();
  renderAll();
  refresh();

  // ---- 对外 ----
  window.EXP = {
    game: {
      state, nodeEROI, humanWildcard, humanStream,
      setSelected: (id) => { state.selectedId = id; renderOpsPanel(); },
      fmtP, fmtN,
    },
    graph: state, DATA,
  };
})();
