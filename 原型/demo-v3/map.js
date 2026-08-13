/* ============================================================
 * 《文明指数》demo-v3 — 世界地图 map.js
 * 上帝视角主画面：迷雾 + 区域发现 + 资源分布 + 文明发光
 * 纯表现层（零结算）：读 window.EXP.graph（即 state）
 * ============================================================ */
(function () {
  'use strict';
  const canvas = document.getElementById('map');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  function G() { return window.EXP.graph; }
  function fmtP(w) { return window.EXP.game.fmtP(w); }

  // 区域锚点（与 data.js 的 x/y 对齐）
  function regionAt(id) { return (window.EXP.DATA || DATA).regions.find(r => r.id === id); }

  function drawStars() {
    // 静态星点（按坐标哈希，不闪烁，避免每帧重算）
    for (let i = 0; i < 80; i++) {
      const x = ((i * 73) % W), y = ((i * 151) % H);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + (i % 5) * 0.06) + ')';
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  function drawRegion(r) {
    const rec = G().regions[r.id] || { prog: 0, done: false };
    const done = rec.done;
    const x = r.x, y = r.y, R = r.r;
    const isFocus = G().agenda === r.id;

    // 外圈
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);

    if (done) {
      ctx.fillStyle = 'rgba(47,143,79,.28)';
      ctx.fill();
      ctx.strokeStyle = isFocus ? '#ffd97a' : '#7fe0a8';
      ctx.lineWidth = isFocus ? 3 : 1.5;
      ctx.stroke();
      // 图标 + 名称
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.icon, x, y - 4);
      ctx.font = 'bold 12px "Segoe UI","Microsoft YaHei"';
      ctx.fillStyle = '#e8f0ff';
      ctx.fillText(r.name, x, y + R - 14);
      // 已解锁节点图标
      const un = (window.EXP.DATA || DATA).nodes[r.unlock];
      if (un) { ctx.font = '14px sans-serif'; ctx.fillText(un.icon + ' ' + un.name, x, y + R + 2); }
    } else {
      // 迷雾：暗色 + 进度环
      ctx.fillStyle = 'rgba(8,14,30,.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(83,216,255,.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 进度弧
      ctx.beginPath();
      ctx.strokeStyle = isFocus ? '#ffd97a' : '#53d8ff';
      ctx.lineWidth = 3;
      ctx.arc(x, y, R - 4, -Math.PI / 2, -Math.PI / 2 + (rec.prog / 100) * Math.PI * 2);
      ctx.stroke();
      // 问号 + 名称 + 进度
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8fa2cd';
      ctx.fillText('❓', x, y - 4);
      ctx.font = 'bold 12px "Segoe UI","Microsoft YaHei"';
      ctx.fillText(r.name, x, y + R - 14);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#53d8ff';
      ctx.fillText(Math.floor(rec.prog) + '%', x, y + R + 2);
    }
    ctx.restore();
  }

  function drawCivilization() {
    // 中央文明发光：功率越大越亮
    const p = G().P;
    const k = Math.log10(Math.max(p, 1)) - 6;
    const glow = Math.min(1, Math.max(0.15, k / 0.4));
    const cx = W / 2, cy = H / 2 - 20;
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 90 + glow * 120);
    grad.addColorStop(0, 'rgba(255,233,168,' + (0.5 + glow * 0.5) + ')');
    grad.addColorStop(1, 'rgba(255,233,168,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, 90 + glow * 120, 0, Math.PI * 2); ctx.fill();
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔥', cx, cy + 6);
    ctx.font = 'bold 13px "Segoe UI","Microsoft YaHei"';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(fmtP(p), cx, cy - 26);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#9fb2dd';
    ctx.fillText('你的文明', cx, cy + 26);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#060b1c');
    bg.addColorStop(1, '#0a1430');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawStars();
    drawCivilization();
    for (const r of (window.EXP.DATA || DATA).regions) drawRegion(r);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
