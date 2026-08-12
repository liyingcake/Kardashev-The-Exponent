/* ============================================================
 * 《文明指数》主画面场景 scene.js
 * 纯视觉层：文明发展 / 能源方式 / 环境资源 / 60s 昼夜循环
 * 与玩法零耦合（不读取/修改任何游戏状态，只读展示）
 * ============================================================ */
(function () {
  'use strict';
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const DAY_CYCLE = 60000; // 60 秒昼夜

  // 确定性伪随机（固定布局，不随帧跳动）
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // 预生成布局：树、建筑、星星
  const trees = [];
  {
    const r = mulberry32(42);
    for (let i = 0; i < 10; i++) trees.push({ x: 20 + r() * (W - 60), s: 0.7 + r() * 0.8 });
  }
  const buildings = [];
  {
    const r = mulberry32(7);
    for (let i = 0; i < 12; i++) buildings.push({ x: 90 + r() * (W - 200), s: 0.8 + r() * 0.9 });
  }
  const stars = [];
  {
    const r = mulberry32(99);
    for (let i = 0; i < 60; i++) stars.push({ x: r() * W, y: r() * H * 0.55, a: 0.3 + r() * 0.7 });
  }

  // 纪元地面色
  const GROUND = ['#3a2a1a', '#4a5a2a', '#6a4a2a', '#2a4a4a', '#4a3a3a'];

  function skyColor(day) {
    // day: 0=午夜 .. 0.5=正午 .. 1=午夜（用 sin 弧）
    const d = Math.max(0, Math.min(1, Math.sin(day * Math.PI)));
    const night = [10, 14, 40], dusk = [110, 100, 140], noon = [135, 180, 235];
    let c;
    if (d < 0.55) c = lerpC(night, dusk, d / 0.55);
    else c = lerpC(dusk, noon, (d - 0.55) / 0.45);
    return c;
  }
  function lerpC(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  const clamp255 = (c) => c.map(v => Math.round(Math.max(0, Math.min(255, v))));

  function drawScene(t) {
    const ex = window.EXP;
    if (!ex || !ex.game) { requestAnimationFrame(drawScene); return; }
    const st = ex.game.state;
    const era = DATA.eras[st.era] || DATA.eras[0];
    const src = ex.game.dominantSource() || DATA.nodes.campfire;

    const dayPhase = ((t % DAY_CYCLE) / DAY_CYCLE);         // 0..1（太阳一整天）
    const day = Math.sin(dayPhase * Math.PI);                // 0=夜 .. 1=正午
    const isNight = day < 0.18;
    const sky = skyColor(dayPhase);

    // ---- 天空 ----
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    skyGrad.addColorStop(0, 'rgb(' + clamp255(lerpC(sky, [sky[0] * 0.6, sky[1] * 0.6, sky[2] * 0.8], 0.3)).join(',') + ')');
    skyGrad.addColorStop(1, 'rgb(' + clamp255(sky).join(',') + ')');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // ---- 星星（夜晚渐显）----
    if (day < 0.45) {
      const a = (1 - day / 0.45) * 0.9;
      ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
      for (const s of stars) {
        ctx.globalAlpha = s.a * a;
        ctx.fillRect(s.x, s.y, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    }

    // ---- 太阳 / 月亮 ----
    const sunX = W * (0.06 + 0.88 * dayPhase);
    const sunY = H * 0.72 - Math.sin(dayPhase * Math.PI) * H * 0.52;
    if (day > 0.15) {
      const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 34);
      glow.addColorStop(0, 'rgba(255,220,130,' + (0.5 * day) + ')');
      glow.addColorStop(1, 'rgba(255,220,130,0)');
      ctx.fillStyle = glow; ctx.fillRect(sunX - 34, sunY - 34, 68, 68);
      ctx.fillStyle = 'rgb(' + clamp255(lerpC([255, 200, 120], [255, 250, 210], day)).join(',') + ')';
      ctx.beginPath(); ctx.arc(sunX, sunY, 12, 0, Math.PI * 2); ctx.fill();
    }
    if (day < 0.5) {
      const mX = W - sunX, mY = sunY - 30;
      ctx.fillStyle = 'rgba(225,230,245,0.85)';
      ctx.beginPath(); ctx.arc(mX, mY, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,170,200,0.5)';
      ctx.beginPath(); ctx.arc(mX - 3, mY - 2, 2.5, 0, Math.PI * 2); ctx.arc(mX + 2, mY + 3, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    // ---- 云 ----
    ctx.fillStyle = 'rgba(255,255,255,' + (0.22 + 0.18 * day) + ')';
    for (let i = 0; i < 3; i++) {
      const cx = ((t / 40000) * 40 + i * 220) % (W + 160) - 80;
      const cy = 40 + i * 26;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 42, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 26, cy + 4, 28, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- 远山 ----
    ctx.fillStyle = 'rgb(' + clamp255(lerpC(sky, [30, 30, 50], 0.55)).join(',') + ')';
    ctx.beginPath(); ctx.moveTo(0, H * 0.62);
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H * 0.62 - Math.sin(x / 90) * 22 - Math.sin(x / 33) * 8);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

    // ---- 地面 ----
    const gcol = GROUND[st.era] || GROUND[0];
    ctx.fillStyle = gcol;
    ctx.fillRect(0, H * 0.64, W, H * 0.36);

    // ---- 河流（水车/水力时高亮）----
    const waterStrong = src.id === 'waterwheel' || src.id === 'hydro';
    ctx.strokeStyle = waterStrong ? 'rgba(110,190,235,0.9)' : 'rgba(70,130,180,0.5)';
    ctx.lineWidth = waterStrong ? 6 : 4;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = H * 0.66 + Math.sin(x / 70 + t / 1400) * 3;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ---- 森林（森林枯竭事件后减半）----
    const deforest = !!st.events.deforest;
    ctx.fillStyle = deforest ? 'rgba(40,60,40,0.7)' : 'rgba(30,90,50,0.85)';
    for (let i = 0; i < trees.length; i++) {
      if (deforest && i % 2 === 0) continue;
      const tr = trees[i];
      ctx.beginPath(); ctx.arc(tr.x, H * 0.60, tr.s * 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a2a12';
      ctx.fillRect(tr.x - 1.5, H * 0.60, 3, 8);
      ctx.fillStyle = deforest ? 'rgba(40,60,40,0.7)' : 'rgba(30,90,50,0.85)';
    }

    // ---- 聚落（随功率对数增长）----
    const nHouses = Math.min(10, 1 + Math.floor(Math.log10(st.P / 1e6) * 1.8));
    ctx.fillStyle = '#8a6a3a';
    ctx.strokeStyle = '#5a4422';
    for (let i = 0; i < nHouses; i++) {
      const b = buildings[i];
      const bx = b.x, by = H * 0.72 + (i % 2) * 14, bs = b.s;
      ctx.beginPath(); ctx.moveTo(bx, by - 12 * bs);
      ctx.lineTo(bx + 11 * bs, by); ctx.lineTo(bx - 11 * bs, by); ctx.closePath(); ctx.fill();
      ctx.fillRect(bx - 8 * bs, by, 16 * bs, 9 * bs);
      ctx.fillStyle = 'rgba(255,210,120,0.85)';
      ctx.fillRect(bx - 1.5, by + 2, 3, 5);
      ctx.fillStyle = '#8a6a3a';
    }

    // ---- 能源设施动画 ----
    drawSource(src, t, st);

    // ---- 矿堆（冶金后）----
    if (st.techs.metallurgy) {
      ctx.fillStyle = '#555';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(W - 40 - i * 9, H * 0.86 - (i % 3) * 5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(W - 46, H * 0.88, 30, 8);
    }

    // ---- HUD ----
    const dayLabel = isNight ? '🌙 夜晚' : dayPhase < 0.5 ? '🌞 白天' : '🌆 黄昏';
    document.getElementById('sh-era').textContent = era.icon + ' ' + era.name;
    document.getElementById('sh-src').textContent = '⚡ ' + src.name;
    document.getElementById('sh-day').textContent = dayLabel;
    document.getElementById('sh-p').textContent = ex.fmtP(st.P);
    requestAnimationFrame(drawScene);
  }

  function drawSource(src, t, st) {
    const gx = W * 0.5, gy = H * 0.78;
    switch (src.id) {
      case 'campfire': {
        const flick = Math.sin(t / 90) * 3;
        const glow = ctx.createRadialGradient(gx, gy - 12, 2, gx, gy - 12, 30);
        glow.addColorStop(0, 'rgba(255,140,40,0.75)');
        glow.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = glow; ctx.fillRect(gx - 30, gy - 42, 60, 60);
        for (let i = 0; i < 4; i++) {
          const fx = gx + Math.sin(t / 120 + i * 1.7) * 6;
          const fy = gy - 12 - i * 8 - flick * (i % 2);
          ctx.fillStyle = i % 2 ? '#ffb35c' : '#ff7a3d';
          ctx.beginPath(); ctx.arc(fx, fy, 5 - i * 0.7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#5a3a20';
        ctx.beginPath(); ctx.ellipse(gx, gy, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'animal': {
        // 麦田
        ctx.strokeStyle = '#8a8a2a'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const mx = gx - 50 + i * 14;
          ctx.beginPath(); ctx.moveTo(mx, gy + 8); ctx.lineTo(mx + 3, gy - 4); ctx.stroke();
        }
        // 牛（简单行走）
        const ox = gx - 40 + Math.sin(t / 900) * 30;
        ctx.fillStyle = '#5a4a3a';
        ctx.beginPath(); ctx.ellipse(ox, gy - 6, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ox + 13, gy - 8, 5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'watermill': {
        const ang = t / 700;
        ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(gx, gy - 8, 22, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = ang + i * Math.PI / 3;
          ctx.beginPath();
          ctx.moveTo(gx, gy - 8);
          ctx.lineTo(gx + Math.cos(a) * 22, gy - 8 + Math.sin(a) * 22);
          ctx.stroke();
        }
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(gx - 4, gy + 6, 8, 16);
        break;
      }
      case 'sail': {
        const sway = Math.sin(t / 600) * 0.14;
        ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 34); ctx.stroke();
        ctx.fillStyle = '#c8d8e8';
        ctx.beginPath();
        ctx.moveTo(gx, gy - 32);
        ctx.quadraticCurveTo(gx + 22 * Math.cos(sway), gy - 16, gx, gy - 2);
        ctx.quadraticCurveTo(gx - 8 * Math.cos(sway), gy - 16, gx, gy - 32);
        ctx.fill();
        ctx.fillStyle = '#6a4a2a';
        ctx.beginPath(); ctx.ellipse(gx, gy + 2, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'hydro': {
        // 大坝
        ctx.fillStyle = '#7a8088';
        ctx.beginPath();
        ctx.moveTo(gx - 24, gy); ctx.lineTo(gx - 10, gy - 22);
        ctx.lineTo(gx + 10, gy - 22); ctx.lineTo(gx + 24, gy); ctx.closePath(); ctx.fill();
        // 水线
        ctx.strokeStyle = 'rgba(110,190,235,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = gx + 24; x <= gx + 70; x += 6) {
          const y = gy + 4 + Math.sin(t / 500 + x / 20) * 3;
          x === gx + 24 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
      case 'steam': {
        // 烟囱
        ctx.fillStyle = '#5a4a4a';
        ctx.fillRect(gx - 8, gy - 36, 16, 36);
        ctx.fillStyle = '#8a5a3a';
        ctx.fillRect(gx - 18, gy, 36, 10);
        // 冒烟粒子
        for (let i = 0; i < 5; i++) {
          const ph = ((t / 900 + i / 5) % 1);
          const py = gy - 40 - ph * 42;
          const px = gx + Math.sin(ph * 6 + i) * 6;
          ctx.fillStyle = 'rgba(200,200,210,' + (0.45 * (1 - ph)) + ')';
          ctx.beginPath(); ctx.arc(px, py, 5 + ph * 5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      default: break;
    }
  }

  requestAnimationFrame(drawScene);
})();
