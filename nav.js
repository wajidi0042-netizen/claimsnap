// ClaimSnap — shared top nav, injected on every page. Self-contained: no
// dependency on a page's own CSS variables, so it can't be broken by a
// page-specific theme change.
(() => {
  const here = location.pathname.split('/').pop() || 'index.html';
  const links = [
    { href: 'index.html', label: 'Home' },
    { href: 'new-claim.html', label: 'New Claim' },
    { href: 'queue.html', label: 'Claims Queue' },
    { href: 'dashboard.html', label: 'Performance' },
    { href: 'presentation/index.html', label: 'Presentation' },
  ];

  const css = `
  .csnav{position:sticky;top:0;z-index:999;display:flex;align-items:center;gap:4px;
    padding:0 16px;height:52px;background:#0b0f15;border-bottom:1px solid #242e3a;
    font-family:"Archivo","Helvetica Neue",Arial,sans-serif;
    -webkit-font-smoothing:antialiased}
  .csnav a{color:#93a1b2;text-decoration:none;font-size:13.5px;font-weight:600;
    padding:7px 12px;border-radius:7px;letter-spacing:.01em;white-space:nowrap}
  .csnav a:hover{color:#eaeef4;background:#161d27}
  .csnav a.on{color:#0b0f15;background:#e8a33d}
  .csnav .brand{display:flex;align-items:center;gap:8px;margin-right:10px;
    color:#eaeef4;font-weight:800;font-size:16px;letter-spacing:-.01em;text-decoration:none}
  .csnav .brand .dot{width:9px;height:9px;border-radius:50%;background:#e8a33d;
    box-shadow:0 0 0 3px rgba(232,163,61,.25)}
  .csnav .sp{flex:1}
  .csnav .gh{color:#64717f;font-size:12px;font-family:"IBM Plex Mono",ui-monospace,monospace}
  .csnav .gh:hover{color:#93a1b2}
  @media (max-width:640px){ .csnav{overflow-x:auto;gap:2px} .csnav .gh{display:none} }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.className = 'csnav';
  nav.innerHTML =
    `<a class="brand" href="index.html"><span class="dot"></span>ClaimSnap</a>` +
    links.map(l => `<a href="${l.href}"${l.href === here ? ' class="on"' : ''}>${l.label}</a>`).join('') +
    `<span class="sp"></span>` +
    `<a class="gh" href="https://github.com/wajidi0042-netizen/claimsnap" target="_blank" rel="noopener">GitHub ↗</a>`;

  document.body.insertBefore(nav, document.body.firstChild);
})();
