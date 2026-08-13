/* ============================================================
 * 《文明指数》demo-v3 — 文明解剖图 graph.js
 * 观察层：节点供需网络可视化（能源流、缺料红、缺工蓝、EROI 状态）
 * 纯表现 + 点选查看详情（不提供放置/连线——那是自动体的事）
 * ============================================================ */
(function () {
  'use strict';
  const canvas = document.getElementById('graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const NW = 128, NH = 76;
  const CAT_COLOR = { source: '#2f8f4f', farm: '#2f8f4f', energy: '#c84848', research: '#8f6fd8' };

  function G() { return window.EXP.graph; }
  function T(n) { return (window.EXP.DATA || DATA).nodes[n.type]; }
  function fmtP(w) { return window.EXP.game.fmtP(w); }

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
    const t = T(n);
    if (n.shortage) return { txt: '⚠️ 缺料', col: '#ff8a5d' };
    if ((t.cat === 'energy' || t.cat === 'research') && !n.staffed) return { txt: '👷 缺工', col: '#53d8ff' };
    return { txt: '● 运行', col: '#7fe0a8' };
  }
  function levelM(n) { return Math.pow((window.EXP.UPGRADE || UPGRADE).powerMult, (n.level || 1) - 1); }

  function drawLink(a, b) {
    // 能源流：源 → 能源（按燃料匹配，纯可视化）
    const x1 = a.x + NW / 2, y1 = a.y, x2 = b.x - NW / 2, y2 = b.y, mx = (x1 + x2) / 2;
    ctx.strokeStyle = b.shortage ? 'rgba(255,138,93,.85)' : 'rgba(83,216,255,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2); ctx.stroke();
  }

  function drawNode(n) {
    const t = T(n);
    const isSel = n.id === G().selectedId;
    const st = statusOf(n);
    ctx.save();
    ctx.shadowColor = isSel ? '#53d8ff' : 'rgba(0,0,0,.45)';
    ctx.shadowBlur = isSel ? 14 : 4;
    ctx.fillStyle = (n.shortage ? '#3a2a1a' : '#14254a');
    ctx.strokeStyle = isSel ? '#53d8ff' : (t.color || CAT_COLOR[t.cat]);
    ctx.lineWidth = isSel ? 2.5 : 1.5;
    rrect(ctx, n.x - NW / 2, n.y - NH / 2, NW, NH, 10);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.icon, n.x - NW / 2 + 10, n.y - NH / 2 + 20);
    ctx.font = 'bold 12px "Segoe UI","Microsoft YaHei"';
    ctx.fillStyle = '#e8f0ff';
    ctx.fillText(t.name, n.x - NW / 2 + 34, n.y - NH / 2 + 18);
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = st.col;
    ctx.fillText(st.txt, n.x + NW / 2 - 8, n.y - NH / 2 + 18);

    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b8c6e8';
    let line2 = '';
    if (t.cat === 'source') { const k = Object.keys(t.out)[0]; line2 = (window.EXP.DATA || DATA).resources[k].icon + ' ' + (t.out[k] * levelM(n) * (n.debuff || 1)).toFixed(1) + '/s'; }
    else if (t.cat === 'farm') { line2 = '🌾 产粮 ' + (t.food * levelM(n)).toFixed(1) + '/s'; }
    else if (t.cat === 'energy') { line2 = '⚡ ' + fmtP(n.power) + ' · EROI ' + (t.eroi >= 3 ? '🟢' : t.eroi >= 1.5 ? '🟡' : '🔴') + t.eroi; }
    else if (t.cat === 'research') { line2 = '🔬 +' + (t.rps * levelM(n)).toFixed(0) + '/s'; }
    ctx.fillText(line2, n.x, n.y - NH / 2 + 38);

    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    if (t.workers) { ctx.fillStyle = n.staffed ? '#7fe0a8' : '#ffd97a'; ctx.fillText('👷' + n.workers + '/' + t.workers, n.x - NW / 2 + 10, n.y + NH / 2 - 10); }
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd97a';
    ctx.fillText('Lv' + (n.level || 1), n.x + NW / 2 - 10, n.y + NH / 2 - 10);
    ctx.restore();
  }

  function render() {
    if (canvas.classList.contains('hidden')) { requestAnimationFrame(render); return; }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060b1c';
    ctx.fillRect(0, 0, W, H);
    // 网格
    ctx.strokeStyle = 'rgba(46,74,120,.18)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // 连线（源→能源，按燃料匹配）
    const energyNodes = G().nodes.filter(n => T(n).cat === 'energy');
    const sources = G().nodes.filter(n => T(n).cat === 'source');
    for (const e of energyNodes) {
      const fuel = Object.keys(T(e).in || {})[0];
      const srcs = sources.filter(s => { const o = T(s).out || {}; return o[fuel]; });
      for (const s of srcs.slice(0, 2)) drawLink(s, e);
    }

    for (const n of G().nodes) drawNode(n);
    requestAnimationFrame(render);
  }

  // 点选查看详情
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  canvas.addEventListener('click', (e) => {
    const p = pos(e);
    for (let i = G().nodes.length - 1; i >= 0; i--) {
      const n = G().nodes[i];
      if (p.x >= n.x - NW / 2 && p.x <= n.x + NW / 2 && p.y >= n.y - NH / 2 && p.y <= n.y + NH / 2) {
        window.EXP.game.setSelected(n.id);
        return;
      }
    }
    window.EXP.game.setSelected(null);
  });

  window.EXP = window.EXP || {};
  window.EXP.graphUI = { canvas, W, H };
  requestAnimationFrame(render);
})();
