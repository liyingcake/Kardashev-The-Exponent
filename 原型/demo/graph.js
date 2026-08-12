/* ============================================================
 * 《文明指数》节点图 — graph.js
 * Canvas 节点图：渲染节点/连线、放置、选择、两击连线
 * 交互状态由 game.js 持有（window.EXP.graph）
 * ============================================================ */
(function () {
  'use strict';
  const canvas = document.getElementById('graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GRID = 42;

  // 从 game.js 取图状态
  function G() { return window.EXP.graph; }

  // 放置模式：从 palette 选择节点类型后为 true
  let placingType = null;
  let selectedId = null;
  let linkFromId = null;

  const CAT_COLOR = {
    source: '#2f8f4f',
    work:   '#8a6a2a',
    energy: '#c84848',
    research: '#8f6fd8',
  };

  function snap(v) { return Math.round(v / GRID) * GRID; }

  function nodePos(n) { return { x: n.x, y: n.y, w: 128, h: 64 }; }

  // ---- 命中检测 ----
  function hitNode(mx, my) {
    for (const n of G().nodes) {
      const p = nodePos(n);
      if (mx >= p.x - p.w / 2 && mx <= p.x + p.w / 2 && my >= p.y - p.h / 2 && my <= p.y + p.h / 2) return n;
    }
    return null;
  }

  // ---- 画节点 ----
  function drawNode(n) {
    const t = DATA.nodes[n.type];
    const p = nodePos(n);
    const isSel = n.id === selectedId;
    const isLinkFrom = n.id === linkFromId;
    const working = n.work !== false;

    ctx.save();
    // 主体
    ctx.shadowColor = isSel ? '#53d8ff' : (isLinkFrom ? '#ffd97a' : 'rgba(0,0,0,.4)');
    ctx.shadowBlur = isSel || isLinkFrom ? 14 : 4;
    ctx.fillStyle = n.active ? (t.color || CAT_COLOR[t.cat]) : '#3a3f4e';
    ctx.strokeStyle = isSel ? '#53d8ff' : (isLinkFrom ? '#ffd97a' : (working ? '#4a72c4' : '#7a2020'));
    ctx.lineWidth = isSel || isLinkFrom ? 2.5 : 1.5;
    rrect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 10);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // 状态徽标
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const status = !n.active ? '🔌 未连线' : n.shortage ? '⚠️ 缺料' : n.work === false ? '👷 缺工人' : (t.cat === 'energy' ? '⚡ 运行' : t.cat === 'source' ? '🌱 产出' : '🛠️ 加工');
    ctx.fillStyle = n.shortage ? '#ff8a5d' : '#8fa2cd';
    ctx.fillText(status, p.x, p.y + p.h / 2 - 10);

    // 图标 + 名称
    ctx.font = '22px sans-serif';
    ctx.fillText(t.icon, p.x, p.y - 6);
    ctx.font = 'bold 13px "Segoe UI","Microsoft YaHei"';
    ctx.fillStyle = '#e8f0ff';
    ctx.fillText(t.name, p.x, p.y + 16);

    // 工人标签
    if (t.workers > 0) {
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#7fe0a8';
      ctx.fillText('👷 ' + n.workers + '/' + t.workers, p.x, p.y + 31);
    }
    // 能量节点功率
    if (t.cat === 'energy') {
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#ffd97a';
      ctx.fillText(fmtP(n.power || 0), p.x, p.y + 31);
    }
    // 端口
    const hasIn = t.in || t.cat === 'research';
    const hasOut = t.out;
    if (hasIn) { ctx.fillStyle = '#4a72c4'; ctx.beginPath(); ctx.arc(p.x - p.w / 2, p.y, 5, 0, Math.PI * 2); ctx.fill(); }
    if (hasOut) { ctx.fillStyle = '#7fe0a8'; ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function fmtP(w) {
    if (w >= 1e15) return (w / 1e15).toFixed(2) + ' PW';
    if (w >= 1e12) return (w / 1e12).toFixed(2) + ' TW';
    if (w >= 1e9)  return (w / 1e9).toFixed(2) + ' GW';
    if (w >= 1e6)  return (w / 1e6).toFixed(2) + ' MW';
    if (w >= 1e3)  return (w / 1e3).toFixed(1) + ' kW';
    return w.toFixed(0) + ' W';
  }

  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawLink(l) {
    const a = G().nodes.find(n => n.id === l.from);
    const b = G().nodes.find(n => n.id === l.to);
    if (!a || !b) return;
    const pa = nodePos(a), pb = nodePos(b);
    const x1 = pa.x + pa.w / 2, y1 = pa.y;
    const x2 = pb.x - pb.w / 2, y2 = pb.y;
    const mx = (x1 + x2) / 2;
    ctx.strokeStyle = a.shortage || b.shortage ? 'rgba(255,138,93,.9)' : 'rgba(83,216,255,.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
    ctx.stroke();
    // 流向箭头
    const t = 0.9;
    const ax = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
    const ay = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * y1 + t * t * y2;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 6, ay - 4); ctx.lineTo(ax - 6, ay + 4);
    ctx.closePath(); ctx.fill();
  }

  // 网格
  function drawGrid() {
    ctx.strokeStyle = 'rgba(46,74,120,.25)';
    ctx.lineWidth = 1;
    for (let x = GRID; x < W; x += GRID) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = GRID; y < H; y += GRID) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  // 放置模式提示
  function drawPlacing(mx, my) {
    if (!placingType) return;
    const t = DATA.nodes[placingType];
    ctx.save();
    ctx.globalAlpha = 0.5;
    const p = { x: snap(mx), y: snap(my), w: 128, h: 64 };
    ctx.fillStyle = CAT_COLOR[t.cat];
    rrect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 10);
    ctx.fill();
    ctx.restore();
  }

  // ---- 渲染主循环 ----
  function render() {
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    for (const l of G().links) drawLink(l);
    // 放置幽灵线
    if (linkFromId) {
      const a = G().nodes.find(n => n.id === linkFromId);
      if (a && G().mouse) {
        const pa = nodePos(a);
        ctx.strokeStyle = 'rgba(255,217,122,.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pa.x + pa.w / 2, pa.y);
        ctx.lineTo(G().mouse.x, G().mouse.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    for (const n of G().nodes) drawNode(n);
    if (G().mouse) drawPlacing(G().mouse.x, G().mouse.y);
    requestAnimationFrame(render);
  }

  // ---- 交互 ----
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  canvas.addEventListener('click', (e) => {
    const p = canvasPos(e);
    G().mouse = p;
    const n = hitNode(p.x, p.y);

    if (placingType) {
      // 放置模式
      if (window.EXP.game && window.EXP.game.placeNode(placingType, snap(p.x), snap(p.y))) {
        placingType = null;
        window.EXP.onPlacingChange && window.EXP.onPlacingChange(null);
      }
      return;
    }

    if (n) {
      if (linkFromId) {
        // 第二击：建立连线（A 有输出 → B 有输入）
        const a = G().nodes.find(x => x.id === linkFromId);
        const tb = DATA.nodes[n.type];
        const ta = a ? DATA.nodes[a.type] : null;
        if (a && ta && ta.out && (tb.in || tb.cat === 'research') && a.id !== n.id) {
          window.EXP.game && window.EXP.game.addLink(linkFromId, n.id);
        } else {
          window.EXP.game && window.EXP.game.log('⚠️ 连线不成立：需要「有输出」→「有输入」', '');
        }
        linkFromId = null;
      } else {
        selectedId = n.id;
        linkFromId = n.id;  // 单击即进入连线候选
        window.EXP.onNodeSelect && window.EXP.onNodeSelect(n.id);
      }
    } else {
      selectedId = null;
      linkFromId = null;
      window.EXP.onNodeSelect && window.EXP.onNodeSelect(null);
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    G().mouse = canvasPos(e);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const p = canvasPos(e);
    const n = hitNode(p.x, p.y);
    if (n) {
      G().links = G().links.filter(l => l.from !== n.id && l.to !== n.id);
      if (window.EXP.game) { window.EXP.game.onGraphChanged(); window.EXP.game.log('✂️ 断开 ' + DATA.nodes[n.type].name + ' 的全部连线', ''); }
    }
  });

  // ---- palette 放置入口 ----
  function setPlacing(type) {
    placingType = placingType === type ? null : type;
    if (window.EXP.onPlacingChange) window.EXP.onPlacingChange(placingType);
  }

  // 公开（注意：勿在此覆盖 onNodeSelect / onPlacingChange——game.js 已注册联动回调）
  window.EXP = window.EXP || {};
  window.EXP.graphUI = { setPlacing, render, canvas, W, H };
  requestAnimationFrame(render);
})();
