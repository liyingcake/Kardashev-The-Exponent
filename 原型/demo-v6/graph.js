/* ============================================================
 * 《文明指数》demo-v6 — 演示图 graph.js
 * 可视化节点编辑器：窗口式节点（标题栏+数据+端口）+ 贝塞尔连线 + 状态着色
 * 纯表现层，读 window.EXP.graph（state）+ window.EXP.game
 * ============================================================ */
(function () {
  'use strict';
  const canvas = document.getElementById('graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const NW = 180, NH = 108, RAD = 10, TITLE_H = 30;

  function G() { return window.EXP.graph; }
  function T(n) { return window.EXP.DATA.windows[n.winType]; }
  function fmtP(w) { return window.EXP.game.fmtP(w); }
  function fmtN(n) { return window.EXP.game.fmtN(n); }

  // 逆熵链的连线顺序（推断：source→process→settle→collect）
  const CHAIN = ['source', 'process', 'settle', 'collect'];
  const LINK_COLOR = { 'source→process': '#5fd07f', 'process→settle': '#ffd97a', 'settle→collect': '#53d8ff', default: '#4a72c4' };

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
    if (n.winType === 'process') {
      const eroi = window.EXP.game.nodeEROI(n);
      if (eroi >= 5.5) return { txt: '高效', dot: '#7fe0a8' };
      if (eroi >= 3) return { txt: '临界', dot: '#ffd97a' };
      return { txt: '低效', dot: '#ff5d5d' };
    }
    return { txt: '运行', dot: '#7fe0a8' };
  }

  function drawNode(n) {
    const t = T(n);
    const isSel = n.id === G().selectedId;
    const st = statusOf(n);
    const x = n.x - NW / 2, y = n.y - NH / 2;

    ctx.save();
    // 主体
    ctx.shadowColor = isSel ? '#53d8ff' : 'rgba(0,0,0,.5)';
    ctx.shadowBlur = isSel ? 16 : 6;
    ctx.fillStyle = '#101b38';
    ctx.strokeStyle = isSel ? '#53d8ff' : t.color;
    ctx.lineWidth = isSel ? 2.5 : 1.5;
    rrect(ctx, x, y, NW, NH, RAD);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // 标题栏（分类色）
    ctx.save();
    rrect(ctx, x, y, NW, TITLE_H, RAD);
    ctx.clip();
    ctx.fillStyle = t.color + 'cc';
    ctx.fillRect(x, y, NW, TITLE_H);
    ctx.restore();
    // 标题栏底边
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.moveTo(x, y + TITLE_H); ctx.lineTo(x + NW, y + TITLE_H); ctx.stroke();

    // 图标 + 名称
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.icon, x + 12, y + 21);
    ctx.font = 'bold 13px "Segoe UI","Microsoft YaHei"';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(n.name, x + 36, y + 21);

    // 状态徽标（右上角）
    ctx.textAlign = 'right';
    ctx.fillStyle = st.dot;
    ctx.beginPath(); ctx.arc(x + NW - 14, y + 15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '9px sans-serif';
    ctx.fillText(st.txt, x + NW - 22, y + 18);

    // 主体数据行
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b8c6e8';
    ctx.font = '12px sans-serif';
    const line2 = dataLine(n);
    ctx.fillText(line2, x + NW / 2, y + TITLE_H + 24);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#8fa2cd';
    ctx.fillText(subLine(n), x + NW / 2, y + TITLE_H + 44);

    // 端口
    const hasIn = T(n).input !== null;
    const hasOut = T(n).output !== null;
    const py = y + TITLE_H + 62;
    if (hasIn) {
      ctx.fillStyle = '#53d8ff';
      ctx.beginPath(); ctx.arc(x, py, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (hasOut) {
      ctx.fillStyle = '#7fe0a8';
      ctx.beginPath(); ctx.arc(x + NW, py, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // 端口标签
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#7184af';
    ctx.textAlign = 'left';
    if (hasIn) ctx.fillText('入', x + 11, py + 3);
    ctx.textAlign = 'right';
    if (hasOut) ctx.fillText('出', x + NW - 11, py + 3);

    ctx.restore();
  }

  function dataLine(n) {
    const t = T(n);
    if (n.winType === 'source') return '⛏️ 采集原料';
    if (n.winType === 'process') return '⚡ EROI ' + window.EXP.game.nodeEROI(n).toFixed(1);
    if (n.winType === 'settle') return '🏘️ 消费产人·科技';
    if (n.winType === 'collect') return '📊 K 指数汇聚';
    return t.name;
  }
  function subLine(n) {
    const t = T(n);
    if (n.winType === 'source') return '物质·原料 + 能量·原料';
    if (n.winType === 'process') return window.EXP.game.humanWildcard(n.input) + ' → ' + window.EXP.game.humanWildcard(n.output);
    if (n.winType === 'settle') return '能量·有用 → 信息·有用';
    if (n.winType === 'collect') return '承载文明乘数';
    return '';
  }

  function drawLink(fromType, toType) {
    const froms = G().nodes.filter(n => n.winType === fromType);
    const tos = G().nodes.filter(n => n.winType === toType);
    if (!froms.length || !tos.length) return;
    const key = fromType + '→' + toType;
    ctx.strokeStyle = LINK_COLOR[key] || LINK_COLOR.default;
    ctx.lineWidth = 2.5;
    for (const a of froms) {
      for (const b of tos) {
        const x1 = a.x + NW / 2, y1 = a.y + TITLE_H / 2;
        const x2 = b.x - NW / 2, y2 = b.y + TITLE_H / 2;
        const mx = (x1 + x2) / 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
        ctx.stroke();
        // 箭头
        const t = 0.9;
        const ax = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
        const ay = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * y1 + t * t * y2;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(ax - 6, ay - 4); ctx.lineTo(ax - 6, ay + 4);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#060b1c');
    bg.addColorStop(1, '#0a1430');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = 'rgba(46,74,120,.16)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // 连线（按逆熵链顺序推断）
    for (let i = 0; i < CHAIN.length - 1; i++) drawLink(CHAIN[i], CHAIN[i + 1]);

    // 节点
    for (const n of G().nodes) drawNode(n);

    requestAnimationFrame(render);
  }

  // 点选
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
