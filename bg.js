// Animated background: a scanning grid with drifting "damage masks".
// Drawn in code, no photographs, so nothing here is redistributed data.
(() => {
  const st = document.createElement('style');
  st.textContent = 'html{background:var(--bg)}body{background:transparent!important}' +
    '#bgfx{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}';
  document.head.appendChild(st);
  const c = document.createElement('canvas'); c.id = 'bgfx'; document.body.prepend(c);
  const x = c.getContext('2d');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#58a6ff';
  let W, H, t0 = performance.now();
  const fit = () => { const d = devicePixelRatio || 1; W = c.width = innerWidth * d; H = c.height = innerHeight * d; };
  addEventListener('resize', fit); fit();
  const blobs = Array.from({ length: 9 }, (_, i) => ({
    x: Math.random(), y: Math.random(), r: 40 + Math.random() * 70,
    s: 0.02 + Math.random() * 0.04, p: Math.random() * 6.28, k: i % 3, n: 7 + (i % 4),
  }));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(now) {
    const t = (now - t0) / 1000, d = devicePixelRatio || 1;
    x.clearRect(0, 0, W, H);
    const accent = css('--accent'), warn = css('--warn'), bad = css('--bad'), line = css('--line');
    x.lineWidth = 1 * d; x.strokeStyle = line; x.globalAlpha = 0.55;
    const g = 48 * d;
    x.beginPath();
    for (let gx = (t * 6 * d) % g; gx < W; gx += g) { x.moveTo(gx, 0); x.lineTo(gx, H); }
    for (let gy = 0; gy < H; gy += g) { x.moveTo(0, gy); x.lineTo(W, gy); }
    x.stroke();
    const cols = [accent, warn, bad];
    for (const b of blobs) {
      const cx = ((b.x + t * b.s * 0.3) % 1) * W, cy = (b.y + Math.sin(t * 0.2 + b.p) * 0.03) * H;
      x.beginPath();
      for (let i = 0; i <= b.n; i++) {
        const a = (i / b.n) * 6.283, rr = b.r * d * (1 + 0.28 * Math.sin(t * 0.8 + i * 1.7 + b.p));
        const px = cx + Math.cos(a) * rr * 1.4, py = cy + Math.sin(a) * rr;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.closePath(); x.globalAlpha = 0.10; x.fillStyle = cols[b.k]; x.fill();
      x.globalAlpha = 0.45; x.strokeStyle = cols[b.k]; x.lineWidth = 1.5 * d; x.stroke();
    }
    const sy = ((t * 0.12) % 1) * H;
    const gr = x.createLinearGradient(0, sy - 80 * d, 0, sy + 2 * d);
    gr.addColorStop(0, 'transparent'); gr.addColorStop(1, accent);
    x.globalAlpha = 0.22; x.fillStyle = gr; x.fillRect(0, sy - 80 * d, W, 82 * d);
    x.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
