/* ============================================================
 * 《文明指数》demo-v5 — 引擎 game.js
 * 节点窗口 × 通配符 × 策略权重
 * 资源=带标签的流(domain:stage)，通配符匹配，窗口内权重滑块。
 * ============================================================ */
(function () {
  'use strict';
  const SAVE_KEY = 'exponent-demo-v5';
  const TICK = 250;

  const state = {
    era: 0, P: 0, pop: 120, research: 0,
    streams: { 'matter:raw': 20, 'energy:raw': 10 },          // { 'matter:raw': 数量, ... }
    nodes: [],            // { id, winType, name, input, output, weights:{key:val}, level }
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
  const streamInfo = (k) => DATA.streamNames[k] || { name: k, icon: '❔', color: '#8fa2cd' };

  // ---- 通配符匹配 ----
  function matchWildcard(pattern, streamKey) {
    if (!pattern) return false;
    if (pattern === '*') return true;
    const [pd, ps] = pattern.split(':');
    const [sd, ss] = streamKey.split(':');
    const dOk = pd === '*' || pd === sd;
    const sOk = ps === undefined || ps === '*' || ps === ss;
    return dOk && sOk;
  }
  // 枚举所有匹配 pattern 的流
  function streamsMatching(pattern) {
    return Object.keys(state.streams).filter(k => matchWildcard(pattern, k) && state.streams[k] > 0);
  }
  // 通配符选择器用：列出所有 domain:stage 合法组合
  function allStreamKeys() {
    const keys = [];
    for (const d of DATA.domains) for (const s of DATA.stages) keys.push(d + ':' + s);
    return keys;
  }

  // ---- 权重归一（窗口内权重 → 0~1 比例）----
  function weightVal(n, key) { return (n.weights[key] !== undefined ? n.weights[key] : 50) / 100; }

  // ---- 乘数 ----
  function techMult(winType) { let m = 1; for (const t of DATA.techs) if (state.techs[t.id] && t.win === winType) m *= t.mult; return m; }
  function creedMult(winType) { let m = 1; for (const c of DATA.creeds) if (state.creeds[c.id] && c.win === winType) m *= c.mult; return m; }
  function researchMult() { let m = 1; for (const c of DATA.creeds) if (state.creeds[c.id] && c.research) m *= c.research; return m; }

  // ---- 建造窗口 ----
  function buildWindow(winType) {
    const t = DATA.windows[winType];
    const id = 'w' + (state.idSeq++);
    const n = { id, winType, name: t.name + ' #' + (state.nodes.length + 1),
      input: t.input, output: t.output, weights: {}, level: 1 };
    for (const w of t.weights) n.weights[w.key] = 50;
    state.nodes.push(n);
    log('🪟 新建窗口：' + t.icon + ' ' + n.name, '');
    return n;
  }

  // ---- 常量（[软数据]，MVP 定标）----
  const ENERGY_PER_USEFUL = 1.5e6;  // 每单位 energy:useful 每秒 = 1.5e6 W 有用能量流

  // ---- 结算 ----
  function settle() {
    const now = Date.now();
    const dt = Math.min(500, now - last) / 1000;
    last = now;

    // 1. 采集窗口 → 产出原料（每秒速率 × dt）
    for (const n of state.nodes) {
      if (n.winType !== 'source') continue;
      const t = WT(n);
      const yieldMult = weightVal(n, 'yield');
      const rate = 2.0 * (0.4 + 0.6 * yieldMult) * techMult('source') * creedMult('source');
      add(n.output, rate * (t.outputRatio || 1) * dt);
      if (t.secondOutput) add(t.secondOutput, rate * (1 - (t.outputRatio || 0.7)) * dt);
    }

    // 2. 加工窗口 → 逆熵转化（消耗原料，产出有用能量 + 废热）
    for (const n of state.nodes) {
      if (n.winType !== 'process') continue;
      const t = WT(n);
      const eff = weightVal(n, 'efficiency');     // 逆熵效率 → EROI 高、废热少
      const thr = weightVal(n, 'throughput');     // 吞吐 → 量多、废热多
      const inKeys = streamsMatching(n.input);
      if (!inKeys.length) continue;
      // 优先消耗 raw 阶段流；再按库存最多自平衡取料（避免只吃单一流导致停摆）
      const prefer = inKeys.filter(k => k.endsWith(':raw'));
      const pool = (prefer.length ? prefer : inKeys);
      pool.sort((a, b) => state.streams[b] - state.streams[a]);
      const src = pool[0];
      const consumeRate = 1.5 * (0.4 + 0.6 * thr);
      const consume = consumeRate * dt;
      if (state.streams[src] < consume) continue;  // 原料不足
      state.streams[src] -= consume;
      // EROI = 逆熵效率：eff 高 → EROI 高；thr 高 → 废热多
      const eroi = 2 + 6 * eff * (1 - 0.4 * thr) * techMult('process') * creedMult('process');
      add(n.output, consume * eroi * 0.5);
      add(t.waste, consume * (1 - eff * 0.7));
    }

    // 3. 消费窗口 → 消费有用能量，产出 info:useful + 人口 + 科技
    let usefulConsumed = 0;
    for (const n of state.nodes) {
      if (n.winType !== 'settle') continue;
      const t = WT(n);
      const grow = weightVal(n, 'growth');
      const res = weightVal(n, 'research');
      const inKeys = streamsMatching(n.input);
      if (!inKeys.length) continue;
      const src = inKeys[0];
      const consumeRate = 1.2 * (0.3 + 0.7 * grow);
      const consume = consumeRate * dt;
      if (state.streams[src] < consume) continue;
      state.streams[src] -= consume;
      usefulConsumed += consumeRate;
      add(n.output, consume * 0.8 * techMult('settle') * creedMult('settle'));
      // 科技
      state.research += consume * 0.5 * (0.3 + 0.7 * res) * researchMult();
    }
    // 有用能量消费速率 → P（K 指数）；平滑过渡避免抖动
    const targetP = usefulConsumed * ENERGY_PER_USEFUL;
    state.P += (targetP - state.P) * 0.1;

    // 4. 人口动态
    const usefulEnergy = state.streams['energy:useful'] || 0;
    const popTarget = 100 + usefulEnergy * 40;
    state.pop += (popTarget - state.pop) * 0.02 * dt;
    if (state.pop < 10) state.pop = 10;

    // 5. 科技自动研发
    autoResearch();
    // 6. 纪元
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

    // 抽象流库存
    $('streamList').innerHTML = Object.keys(state.streams)
      .filter(k => state.streams[k] > 0.01)
      .sort((a, b) => state.streams[b] - state.streams[a])
      .slice(0, 8)
      .map(k => {
        const si = streamInfo(k);
        return '<div class="stream-row"><span style="color:' + si.color + '">' + si.icon + ' ' + si.name + '</span>' +
          '<b>' + fmtN(state.streams[k]) + '</b></div>';
      }).join('') || '<p class="hint">暂无流动的流</p>';

    // 里程碑
    const nt = nextTarget(state.era);
    $('milestoneTarget').textContent = fmtP(nt);
    $('milestoneBar').style.width = Math.min(100, state.P / nt * 100) + '%';

    renderNodeList();  // 节点列表需要刷新（显示实时 EROI）
  }

  // ---- 渲染：节点窗口列表 ----
  function renderNodeList() {
    const el = $('nodeList');
    el.innerHTML = state.nodes.map(n => {
      const t = WT(n);
      const selected = n.id === state.selectedId;
      const eroi = nodeEROI(n);
      return '<div class="node-item ' + (selected ? 'selected' : '') + '" data-node="' + n.id + '">' +
        '<span class="n-icon">' + t.icon + '</span>' +
        '<span class="n-name">' + n.name + '</span>' +
        '<span class="n-eroi">EROI ' + eroi + '</span></div>';
    }).join('');
    el.querySelectorAll('[data-node]').forEach(d => d.addEventListener('click', () => {
      state.selectedId = d.dataset.node;
      renderNodeList(); renderNodePanel();
    }));
  }
  function nodeEROI(n) {
    if (n.winType !== 'process') return '—';
    const eff = weightVal(n, 'efficiency'), thr = weightVal(n, 'throughput');
    return (2 + 6 * eff * (1 - 0.4 * thr) * techMult('process') * creedMult('process')).toFixed(1);
  }

  // ---- 渲染：节点详情面板（窗口）----
  function renderNodePanel() {
    const box = $('nodePanel');
    const n = state.nodes.find(x => x.id === state.selectedId);
    if (!n) { box.innerHTML = '<p class="hint">👆 点左侧一个节点窗口，展开它的配置面板。<br><br>节点 = 窗口：改通配符、拖权重，看它怎么影响整个逆熵系统。</p>'; return; }
    const t = WT(n);
    let html = '<div class="win-head"><span style="color:' + t.color + '">' + t.icon + '</span> <b>' + n.name + '</b></div>';
    html += '<div class="win-desc">' + t.desc + '</div>';

    // 通配符选择器
    if (t.input !== null) {
      html += '<div class="win-field"><label>输入通配符</label><select data-winput>' +
        wildcardOptions(n.input) + '</select></div>';
    }
    if (t.output !== null) {
      html += '<div class="win-field"><label>输出通配符</label><select data-woutput>' +
        wildcardOptions(n.output) + '</select></div>';
    }

    // 策略权重滑块
    for (const w of t.weights) {
      const v = n.weights[w.key];
      html += '<div class="win-field"><label>' + w.name + ' <b class="w-val">' + v + '%</b></label>' +
        '<input type="range" min="0" max="100" value="' + v + '" data-weight="' + w.key + '"></div>';
    }

    // EROI / 废热
    if (n.winType === 'process') {
      html += '<div class="win-stats">EROI ≈ <b>' + nodeEROI(n) + '</b> ｜ 废热 <b>' + Math.round((1 - weightVal(n, 'efficiency') * 0.7) * 100) + '%</b></div>';
    }
    box.innerHTML = html;

    // 绑定
    box.querySelector('[data-winput]')?.addEventListener('change', (e) => { n.input = e.target.value; log('🔧 ' + n.name + ' 输入改为 ' + e.target.value, ''); });
    box.querySelector('[data-woutput]')?.addEventListener('change', (e) => { n.output = e.target.value; log('🔧 ' + n.name + ' 输出改为 ' + e.target.value, ''); });
    box.querySelectorAll('[data-weight]').forEach(r => r.addEventListener('input', () => {
      n.weights[r.dataset.weight] = +r.value;
      r.parentElement.querySelector('.w-val').textContent = r.value + '%';
    }));
  }
  function wildcardOptions(selected) {
    const opts = ['*', 'matter:*', 'energy:*', 'info:*', '*:raw', '*:refined', '*:useful', '*:waste',
      'matter:raw', 'matter:refined', 'matter:useful', 'matter:waste',
      'energy:raw', 'energy:refined', 'energy:useful', 'energy:waste',
      'info:raw', 'info:refined', 'info:useful', 'info:waste'];
    return opts.map(o => '<option value="' + o + '" ' + (o === selected ? 'selected' : '') + '>' + o + '</option>').join('');
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
  function renderAll() { renderNodeList(); renderNodePanel(); renderCreedList(); renderTechs(); renderLog(); }

  // ---- 静态绑定 ----
  $('btn-upgrade-era').addEventListener('click', tryUpgrade);
  $('btn-add-window').addEventListener('click', () => { buildWindow('process'); renderAll(); });
  $('btnLogToggle').addEventListener('click', () => $('logBox').classList.toggle('collapsed'));
  $('btnDebugToggle').addEventListener('click', () => $('debugBox').classList.toggle('collapsed'));
  const dbg = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  dbg('btn-save', () => { save(); log('💾 已保存', ''); });
  dbg('btn-reset', () => { if (confirm('完整重置？')) hardReset(); });
  dbg('btn-cheat', () => { state.research += 500; state.streams['energy:useful'] = (state.streams['energy:useful'] || 0) + 100; log('🔆 调试 +科研 +有用能量', ''); });

  // ---- 模板（开局：采集 + 加工 + 消费 + 收集 四个窗口）----
  function seedTemplate() {
    if (state.nodes.length > 0) return;
    buildWindow('source');
    buildWindow('process');
    buildWindow('settle');
    buildWindow('collect');
    state.idSeq = 5;
    log('🔥 逆熵系统启动：采集 → 加工 → 消费 → 收集。', 'era-log');
    log('🧭 点节点窗口，改通配符、拖权重，看系统如何变化。', '');
  }

  // ---- 启动 ----
  load();
  seedTemplate();
  renderAll();
  refresh();
})();
