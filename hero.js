// Local-only photo hero. Reads local-photos/manifest.json; that folder is in
// .gitignore, so on a public deploy the fetch fails and the page keeps the
// code-drawn animated background (bg.js). Licensed dataset photos therefore
// never leave this machine.
(async () => {
  let list = [];
  try {
    const r = await fetch('local-photos/manifest.json', { cache: 'no-store' });
    if (r.ok) list = (await r.json()).photos || [];
  } catch { /* no local photos: keep the animated background */ }
  if (!list.length) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = document.createElement('style');
  st.textContent = `
  #photohero{position:absolute;top:0;left:0;right:0;height:680px;z-index:-2;overflow:hidden;pointer-events:none;
    -webkit-mask-image:linear-gradient(#000 62%,transparent);mask-image:linear-gradient(#000 62%,transparent)}
  #photohero .ph{position:absolute;inset:-4%;background-size:cover;background-position:center;opacity:0;
    filter:blur(1.5px) brightness(.55) saturate(.9);transition:opacity 1.8s ease}
  #photohero .ph.on{opacity:1}
  #photohero .ph.kb{animation:kb 12s ease-in-out forwards}
  @keyframes kb{from{transform:scale(1) translate(0,0)}to{transform:scale(1.12) translate(-1.5%,-1%)}}
  #photohero:after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(11,15,21,.35),rgba(11,15,21,.8))}
  .has-photos #bgfx{opacity:.35}`;
  document.head.appendChild(st);
  document.documentElement.classList.add('has-photos');

  const box = document.createElement('div'); box.id = 'photohero';
  const layers = [0, 1].map(() => { const d = document.createElement('div'); d.className = 'ph'; box.appendChild(d); return d; });
  document.body.prepend(box);

  let i = 0, top = 0;
  const show = () => {
    const el = layers[top]; el.style.backgroundImage = `url("local-photos/${list[i % list.length]}")`;
    el.classList.remove('kb'); void el.offsetWidth;
    if (!reduce) el.classList.add('kb');
    el.classList.add('on'); layers[1 - top].classList.remove('on');
    top = 1 - top; i++;
  };
  show();
  if (list.length > 1) setInterval(show, 7000);
})();
