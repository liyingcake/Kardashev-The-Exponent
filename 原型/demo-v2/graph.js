/* ============================================================
 * 《文明指数》demo-v2 — 节点图 graph.js
 * 节点框标准（128×76，4 行元素）+ 连线交互 + 可连目标高亮
 * ============================================================ */
(function () {
  'use strict';
  const canvas = document.getElementById('graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GRID = 44, NW = 128, NH = 76;
  const CAT_COLOR = { source: '#2f8f4f', work: '#b39a3a', energy: '#c84848', research: '#8f6fd8' };

  function G() { return window.EXP.graph; }
  function T(n) { return DATA.nodes[n.type]; }

  let placingType = null;
  let selectedId = null;
  let linkFromId = null;

  function snap(v) { return Math.round(v / GRID) * GRID; }
  function npos(n) { return { x: n.x, y: n.y }; }
  function hit(mx, my) {
    for (let i = G().nodes.length - 1; i >= 0; i--) {
      const n = G().nodes[i], p = npos(n);
      if (mx >= p.x - NW / 2 && mx <= p.x + NW / 2 && my >= p.y - NH / 2 && my <= p.y + NH / 2) return n;
    }
    return null;
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

  function statusOf(n) {
    if (!n.active) return { txt: '🔌 未连线', col: '#8a97b8' };
    if (n.shortage) return { txt: '⚠️ 缺料', col: '#ff8a5d' };
    const t = T(n);
    if (t.workers && n.workers < t.workers) return { txt: '👷 缺工人', col: '#53d8ff' };
    return { txt: '● 运行', col: '#7fe0a8' };
  }

  function drawNode(n) {
    const t = T(n);
    const p = npos(n);
    const isSel = n.id === selectedId;
    const isFrom = n.id === linkFromId;
    const linkable = isFrom && t.out; // 这是源，看目标端
    const st = statusOf(n);

    ctx.save();
    ctx.shadowColor = isSel ? '#53d8ff' : isFrom ? '#ffd97a' : 'rgba(0,0,0,.45)';
    ctx.shadowBlur = isSel || isFrom ? 14 : 4;
    ctx.fillStyle = n.active ? (t.color || CAT_COLOR[t.cat]) : '#333a4d';
    ctx.strokeStyle = isSel ? '#53d8ff' : isFrom ? '#ffd97a' : '#4a72c4';
    ctx.lineWidth = isSel || isFrom ? 2.5 : 1.5;
    rrect(ctx, p.x - NW / 2, p.y - NH / 2, NW, NH, 10);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // 行1：图标 + 名称 + 状态徽标
    ctx.font = '20px sans-serif';
    ctx.fillText(t.icon, p.x - NW / 2 + 12, p.y - NH / 2 + 20);
    ctx.font = 'bold 13px "Segoe UI","Microsoft YaHei"';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8f0ff';
    ctx.fillText(t.name, p.x - NW / 2 + 36, p.y - NH / 2 + 18);
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = st.col;
    ctx.fillText(st.txt, p.x + NW / 2 - 8, p.y - NH / 2 + 18);

    // 行2：核心数据
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b8c6e8';
    let line2 = '';
    if (t.cat === 'source') { const k = Object.keys(t.out)[0]; line2 = DATA.resources[k].icon + ' 产出 ' + (t.out[k] * levelM(n) * (n.debuff || 1)).toFixed(1) + '/s'; }
    else if (t.cat === 'work') { line2 = '↻ 加工（+50%）'; }
    else if (t.cat === 'energy') { line2 = '⚡ ' + fmtP(n.power); }
    else if (t.cat === 'research') { line2 = '🔬 +' + (t.rps * levelM(n)).toFixed(0) + '/s'; }
    ctx.fillText(line2, p.x, p.y - NH / 2 + 38);

    // 行3：端口（可视插座）
    const hasIn = t.in || t.cat === 'research';
    const hasOut = t.out;
    if (hasIn) {
      ctx.fillStyle = linkable ? '#53d8ff' : '#4a72c4';
      ctx.beginPath(); ctx.arc(p.x - NW / 2, p.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (hasOut) {
      ctx.fillStyle = '#7fe0a8';
      ctx.beginPath(); ctx.arc(p.x + NW / 2, p.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }

    // 行4：工人 + 等级
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    if (t.workers) { ctx.fillStyle = n.workers >= t.workers ? '#7fe0a8' : '#ffd97a'; ctx.fillText('👷' + n.workers + '/' + t.workers, p.x - NW / 2 + 12, p.y + NH / 2 - 10); }
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd97a';
    ctx.fillText('Lv' + (n.level || 1), p.x + NW / 2 - 12, p.y + NH / 2 - 10);
    ctx.restore();
  }

  function levelM(n) { return Math.pow(UPGRADE.powerMult, (n.level || 1) - 1); }
  function fmtP(w) {
    if (w >= 1e12) return (w / 1e12).toFixed(1) + ' TW';
    if (w >= 1e9) return (w / 1e9).toFixed(1) + ' GW';
    if (w >= 1e6) return (w / 1e6).toFixed(1) + ' MW';
    if (w >= 1e3) return (w / 1e3).toFixed(1) + ' kW';
    return w.toFixed(0) + ' W';
  }

  function drawLink(l) {
    const a = G().nodes.find(n => n.id === l.from), b = G().nodes.find(n => n.id === l.to);
    if (!a || !b) return;
    const pa = npos(a), pb = npos(b);
    const x1 = pa.x + NW / 2, y1 = pa.y, x2 = pb.x - NW / 2, y2 = pb.y, mx = (x1 + x2) / 2;
    ctx.strokeStyle = a.shortage || b.shortage ? 'rgba(255,138,93,.95)' : 'rgba(83,216,255,.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2); ctx.stroke();
    const tt = 0.92;
    const ax = (1 - tt) * (1 - tt) * x1 + 2 * (1 - tt) * tt * mx + tt * tt * x2;
    const ay = (1 - tt) * (1 - tt) * y1 + 2 * (1 - tt) * tt * y1 + tt * tt * y2;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 6, ay - 4); ctx.lineTo(ax - 6, ay + 4); ctx.closePath(); ctx.fill();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    // 网格
    ctx.strokeStyle = 'rgba(46,74,120,.22)';
    ctx.lineWidth = 1;
    for (let x = GRID; x < W; x += GRID) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = GRID; y < H; y += GRID) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // 可连目标高亮（linkFrom 为源时，有输入的目标绿描边）
    if (linkFromId) {
      const a = G().nodes.find(n => n.id === linkFromId);
      if (a && T(a).out) {
        for (const n of G().nodes) {
          if (n.id === linkFromId) continue;
          const t = T(n);
          if (t.in || t.cat === 'research') {
            ctx.strokeStyle = 'rgba(127,224,168,.8)';
            ctx.lineWidth = 2;
            rrect(ctx, npos(n).x - NW / 2 - 3, npos(n).y - NH / 2 - 3, NW + 6, NH + 6, 12);
            ctx.stroke();
          }
        }
      }
    }

    for (const l of G().links) drawLink(l);

    if (linkFromId) {
      const a = G().nodes.find(n => n.id === linkFromId);
      if (a && G().mouse) {
        const pa = npos(a);
        ctx.strokeStyle = 'rgba(255,217,122,.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(pa.x + NW / 2, pa.y); ctx.lineTo(G().mouse.x, G().mouse.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    for (const n of G().nodes) drawNode(n);

    if (placingType && G().mouse) {
      const t = DATA.nodes[placingType];
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = CAT_COLOR[t.cat];
      rrect(ctx, snap(G().mouse.x) - NW / 2, snap(G().mouse.y) - NH / 2, NW, NH, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    requestAnimationFrame(render);
  }

  // ---- 交互 ----
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  canvas.addEventListener('mousemove', (e) => { G().mouse = pos(e); });
  canvas.addEventListener('click', (e) => {
    const p = pos(e);
    G().mouse = p;
    const n = hit(p.x, p.y);

    if (placingType) {
      if (window.EXP.game.placeNode(placingType, snap(p.x), snap(p.y))) {
        placingType = null;
        window.EXP.onPlacingChange(null);
      }
      return;
    }
    if (n) {
      if (linkFromId && linkFromId !== n.id) {
        window.EXP.game.addLink(linkFromId, n.id);
        linkFromId = null;
      } else {
        linkFromId = n.id;
        selectedId = n.id;
        window.EXP.onNodeSelect(n.id);
      }
    } else {
      selectedId = null;
      linkFromId = null;
      window.EXP.onNodeSelect(null);
    }
  });
  canvas.addEventListener('keydown', (e) => { if (e.key === 'Escape') { linkFromId = null; placingType = null; window.EXP.onPlacingChange(null); } });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const n = hit(pos(e).x, pos(e).y);
    if (n) {
      G().links = G().links.filter(l => l.from !== n.id && l.to !== n.id);
      window.EXP.game.onGraphChanged();
      window.EXP.game.log('✂️ 断开 ' + T(n).name + ' 连线', '');
    }
  });

  function setPlacing(t) { placingType = placingType === t ? null : t; if (window.EXP.onPlacingChange) window.EXP.onPlacingChange(placingType); }

  window.EXP = window.EXP || {};
  window.EXP.graphUI = { setPlacing, canvas, W, H };
  requestAnimationFrame(render);
})();
