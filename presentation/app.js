/* ClaimSnap presentation - navigation, real-data charts, live inference */

const $ = id => document.getElementById(id);

/* ================= real training history (results.csv, 50 epochs) ========= */
const MAP50 = [.44762,.4085,.40954,.45491,.47326,.4937,.50142,.56447,.55776,.56688,
               .53785,.57868,.58862,.59878,.57797,.59227,.61225,.61721,.63444,.6199,
               .64265,.65236,.66736,.65124,.65998,.6458,.65852,.66994,.68429,.66877,
               .68775,.67901,.68416,.67874,.69499,.68965,.70304,.70065,.69956,.69872,
               .70274,.7113,.70839,.71919,.72043,.71938,.72206,.72358,.72383,.72011];
const TRLOSS = [3.19652,2.87264,2.87763,2.86065,2.77541,2.693,2.6527,2.61394,2.57123,2.52033,
                2.47705,2.47026,2.3868,2.39817,2.37478,2.37772,2.35157,2.29274,2.2932,2.26067,
                2.23945,2.20673,2.2052,2.16078,2.15065,2.13896,2.11677,2.09584,2.10888,2.08051,
                2.04889,2.0376,2.00043,2.00056,1.98503,1.98734,1.93767,1.94067,1.91283,1.88516,
                1.86291,1.77455,1.75288,1.73116,1.71889,1.68252,1.65903,1.63377,1.6334,1.62093];
const VALOSS = [3.39775,3.50085,3.57307,3.26384,3.06763,2.9768,2.98236,2.73613,2.76244,2.79719,
                2.92442,2.66583,2.63434,2.69522,2.73631,2.67415,2.51714,2.56372,2.48822,2.45639,
                2.43746,2.38291,2.32228,2.35389,2.34839,2.45667,2.31997,2.34239,2.32923,2.30511,
                2.2725,2.29925,2.31306,2.26655,2.29612,2.28414,2.24592,2.27771,2.24736,2.26195,
                2.28211,2.25861,2.30413,2.27852,2.29408,2.25535,2.29706,2.29022,2.28717,2.28639];

/* confusion matrix, normalised, test set (rows = predicted, cols = true) */
const CM_LABELS = ['dent','scratch','crack','glass','lamp','tyre','backgr.'];
const CM = [
  [.90,.07,.03,  0,.03,  0,.34],
  [.06,.88,.07,  0,  0,  0,.43],
  [  0,.02,.80,  0,  0,  0,.21],
  [  0,  0,  0,1.00,  0,  0,.01],
  [  0,  0,  0,  0,.94,  0,.01],
  [  0,  0,  0,  0,  0,.97,  0],
  [.04,.03,.10,  0,.03,.03,  0]
];

/* speaker notes, by slide index */
const NOTES = {
0:"Open with the live demo tab already warm in a second window. Twenty seconds here.",
1:"Make the point that triage and decision are different jobs. Everything later rests on the audience accepting that split now.",
2:"Set the colour convention: blue is built and measured, amber is designed but not yet built. Hold it for the rest of the talk.",
3:"If asked why no images are in the repo: the licence forbids redistribution, and a public repo is redistribution. The licence form was signed and access granted on 18 November.",
4:"Point at the gap that opens between the two loss lines after about epoch 20 — training loss keeps falling, validation flattens. That is the model starting to fit the training set harder than it generalises. Early stopping was set at 15 epochs patience and never fired, so the run completed all 50.",
5:"The comparison that matters: validation 0.724, test 0.734. A model that had memorised its validation set would have dropped on test. It did not.",
6:"This is the slide the whole talk turns on. Weakest classes are the commonest claims. Note that crack and flat tyre rest on only 70 and 32 instances, so both are less certain than they look.",
7:"Be precise: the matrix is counted at a fixed 0.25 threshold, while mAP integrates over all thresholds, so the two sets of numbers will not line up exactly. Saying so pre-empts the question.",
8:"Have a photo ready. Step with the down arrow and talk over each stage. If it breaks, move on — slides 6 to 8 carry the results without it. Say the browser timing out loud; it is a real measurement.",
9:"This is where the insurance research paper on human-in-the-loop decision-making connects. Mention the link in one sentence; do not reuse any text from it.",
10:"Do not overclaim privacy. The claim is narrow and true: inference is local, so this app does not transmit the photo. It says nothing about what the insurer does with it elsewhere.",
11:"Lead with the gaps rather than letting them be drawn out in questions. A talk that names its own gaps reads as controlled.",
12:"Likely questions: why YOLO11n and not a bigger model (browser budget); why crack is weak (thin structures at 640 px, 70 test instances); would synthetic data help (the brief requires a public dataset, so only as an addition); what if the VLM contradicts the masks (it is flagged, which is the measurable part)."
};

/* ================= navigation ============================================ */
const slides = Array.from(document.querySelectorAll('.slide'));
const LIVE = slides.findIndex(s => s.id === 's-live');
let cur = 0;

function show(i){
  cur = Math.max(0, Math.min(slides.length-1, i));
  slides.forEach((s,k)=>s.classList.toggle('on', k===cur));
  $('bar').style.width = ((cur+1)/slides.length*100)+'%';
  $('count').textContent = (cur+1)+' / '+slides.length;
  $('notesText').textContent = NOTES[cur] || '';
  if (slides[cur].id === 's-perclass') animateBars();
  if (slides[cur].id === 's-train') drawChart();
  if (slides[cur].id === 's-cm') animateCM();
  location.hash = 'slide-'+(cur+1);
}
function animateBars(){
  document.querySelectorAll('#s-perclass .bar-fill').forEach((b,i)=>{
    b.style.width='0';
    setTimeout(()=>{b.style.width=b.dataset.w+'%';}, 90+i*95);
  });
}
$('prev').onclick=()=>show(cur-1);
$('next').onclick=()=>show(cur+1);
$('full').onclick=()=>{try{
  if(document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}catch(e){}};

document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT') return;
  const k=e.key;
  if(k==='ArrowRight'||k==='PageDown'){show(cur+1);e.preventDefault();}
  else if(k==='ArrowLeft'||k==='PageUp'){show(cur-1);e.preventDefault();}
  else if(k==='ArrowDown'||k===' '){ if(cur===LIVE){nextStage();}else{show(cur+1);} e.preventDefault(); }
  else if(k==='ArrowUp'){ if(cur===LIVE){prevStage();e.preventDefault();} }
  else if(k==='n'||k==='N') $('notes').classList.toggle('on');
  else if(k==='f'||k==='F') $('full').click();
  else if(k==='Home') show(0);
  else if(k==='End') show(slides.length-1);
});

/* ================= training chart ======================================== */
let chartDrawn=false;
function drawChart(){
  if(chartDrawn) return; chartDrawn=true;
  const W=1000,H=420,L=52,R=16,T=18,B=34;
  const x = i => L + (i/(MAP50.length-1))*(W-L-R);
  const yMap = v => T + (1-(v-0.35)/(0.80-0.35))*(H-T-B);     // mAP axis 0.35..0.80
  const yLos = v => T + (1-(v-1.5)/(3.7-1.5))*(H-T-B);        // loss axis 1.5..3.7
  const path = (arr,fn) => arr.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+fn(v).toFixed(1)).join(' ');

  let g='';
  // horizontal guides on the mAP scale
  [0.4,0.5,0.6,0.7,0.8].forEach(v=>{
    g+=`<line x1="${L}" y1="${yMap(v)}" x2="${W-R}" y2="${yMap(v)}" stroke="#223049" stroke-width="1"/>`;
    g+=`<text x="${L-10}" y="${yMap(v)+4}" fill="#7E8CA6" font-size="13" text-anchor="end" font-family="Inter,sans-serif">${v.toFixed(1)}</text>`;
  });
  [1,10,20,30,40,50].forEach(e=>{
    g+=`<text x="${x(e-1)}" y="${H-10}" fill="#7E8CA6" font-size="13" text-anchor="middle" font-family="Inter,sans-serif">${e}</text>`;
  });

  const series=[
    {d:path(VALOSS,yLos), c:'#7E8CA6', w:2},
    {d:path(TRLOSS,yLos), c:'#FFB649', w:2.5},
    {d:path(MAP50,yMap),  c:'#4F8CFF', w:3.5}
  ];
  series.forEach((s,i)=>{ g+=`<path d="${s.d}" fill="none" stroke="${s.c}" stroke-width="${s.w}"
      stroke-linejoin="round" stroke-linecap="round" class="ln" id="ln${i}"/>`; });

  // final mAP marker
  const lx=x(MAP50.length-1), ly=yMap(MAP50[MAP50.length-1]);
  g+=`<circle cx="${lx}" cy="${ly}" r="5" fill="#4F8CFF" opacity="0" id="dotEnd"/>`;
  g+=`<text x="${lx-8}" y="${ly-14}" fill="#4F8CFF" font-size="15" font-weight="600" text-anchor="end"
       font-family="Space Grotesk,sans-serif" opacity="0" id="lblEnd">0.724 validation</text>`;

  $('chart').innerHTML=g;
  // draw each line in
  series.forEach((s,i)=>{
    const el=$('ln'+i), len=el.getTotalLength();
    el.style.strokeDasharray=len; el.style.strokeDashoffset=len;
    el.style.transition=`stroke-dashoffset 1.5s ease-out ${0.15+i*0.18}s`;
    requestAnimationFrame(()=>{ el.style.strokeDashoffset=0; });
  });
  setTimeout(()=>{
    ['dotEnd','lblEnd'].forEach(id=>{ const e=$(id); e.style.transition='opacity .5s'; e.style.opacity=1; });
  },1900);
}

/* ================= confusion matrix ====================================== */
function buildCM(){
  const host=$('cmHost');
  let h='<div class="cm">';
  h+='<div></div>';
  CM_LABELS.forEach(l=>h+=`<div class="h">${l}</div>`);
  CM.forEach((row,r)=>{
    h+=`<div class="rh">${CM_LABELS[r]}</div>`;
    row.forEach((v,c)=>{
      const diag = r===c && r<6;
      const col = diag ? '79,140,255' : (c===6 ? '255,182,73' : '255,92,92');
      const bg = v===0 ? 'background:#121A28' : `background:rgba(${col},${(0.12+v*0.88).toFixed(2)})`;
      h+=`<div class="c${v===0?' z':''}" style="${bg};opacity:0" data-i="${r*7+c}">${v===0?'·':v.toFixed(2)}</div>`;
    });
  });
  h+='</div>';
  host.innerHTML=h;
}
buildCM();
let cmDone=false;
function animateCM(){
  if(cmDone) return; cmDone=true;
  document.querySelectorAll('#cmHost .c').forEach(el=>{
    const i=+el.dataset.i;
    setTimeout(()=>{ el.style.opacity=1; }, 120 + (i%7)*45 + Math.floor(i/7)*55);
  });
}

/* ================= model ================================================= */
const NAMES=['dent','scratch','crack','glass shatter','lamp broken','tire flat'];
const COLORS=[[255,140,0],[255,215,0],[220,20,60],[30,144,255],[148,0,211],[0,200,120]];
const S=640, CONF=.25, IOU=.5, VIZ=.05;
// Severity = damaged mask area as a share of the photo. Thresholds provisional:
// still to be calibrated on 50 manually rated images, and normalising by the car's
// area rather than the photo's needs a car detector.
const SEV_MINOR=.01, SEV_SEVERE=.05;
const sevOf=a=>a<SEV_MINOR?'minor':a<SEV_SEVERE?'moderate':'severe';

let session=null;
const DEF={}; [1,2,3,4,5,6].forEach(n=>DEF[n]=$('t'+n).innerHTML);
const setStatus=(t,busy)=>{ $('status').textContent=t; $('spin').classList.toggle('on',!!busy); };

(async()=>{
  try{
    ort.env.wasm.wasmPaths='./'; ort.env.wasm.numThreads=1;
    setStatus('Loading model (12 MB, once)…',true);
    const buf=await (await fetch('../models/best.onnx')).arrayBuffer();   // onnx bytes, served as .txt
    session=await ort.InferenceSession.create(new Uint8Array(buf),{executionProviders:['wasm']});
    setStatus('Model ready — drop in a photo.');
    $('file').disabled=false;
  }catch(err){ setStatus('Model failed to load: '+err.message); }
})();

/* ================= pipeline ============================================== */
let st=null, stage=0;

$('file').onchange=e=>{ if(e.target.files[0]) load(e.target.files[0]); };
const drop=$('drop');
['dragover','dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{
  e.preventDefault(); drop.classList.toggle('over', ev==='dragover');
  if(ev==='drop'&&e.dataTransfer.files[0]) load(e.dataTransfer.files[0]);
}));
$('btnNext').onclick=nextStage;
$('btnReset').onclick=reset;

function reset(){
  st=null; stage=0;
  $('stageCanvas').style.display='none'; drop.style.display='';
  $('resultCard').style.display='none'; $('timing').textContent='';
  $('btnNext').disabled=true;
  [1,2,3,4,5,6].forEach(n=>$('t'+n).innerHTML=DEF[n]);
  marks(0);
  setStatus(session?'Model ready — drop in a photo.':'Loading model…',!session);
}
function marks(n){
  document.querySelectorAll('#steps .step').forEach(el=>{
    const s=+el.dataset.s;
    el.classList.toggle('on',s===n); el.classList.toggle('done',s<n);
  });
}
function nextStage(){ if(st&&stage<6) render(stage+1); }
function prevStage(){ if(st&&stage>1) render(stage-1); }
function load(f){ if(!session) return; const img=new Image(); img.onload=()=>run(img); img.src=URL.createObjectURL(f); }

async function run(img){
  setStatus('Running…',true); $('btnNext').disabled=true;
  const t0=performance.now();

  const r=Math.min(S/img.width,S/img.height);
  const nw=Math.round(img.width*r), nh=Math.round(img.height*r);
  const px=Math.floor((S-nw)/2), py=Math.floor((S-nh)/2);
  const lc=document.createElement('canvas'); lc.width=lc.height=S;
  const lx=lc.getContext('2d');
  lx.fillStyle='rgb(114,114,114)'; lx.fillRect(0,0,S,S);
  lx.drawImage(img,px,py,nw,nh);
  const pix=lx.getImageData(0,0,S,S).data;

  const input=new Float32Array(3*S*S);
  for(let i=0;i<S*S;i++){
    input[i]=pix[i*4]/255; input[i+S*S]=pix[i*4+1]/255; input[i+2*S*S]=pix[i*4+2]/255;
  }

  const t1=performance.now();
  const out=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',input,[1,3,S,S])});
  const t2=performance.now();

  let det,proto;
  for(const n of session.outputNames){ if(out[n].dims.length===3) det=out[n]; else proto=out[n]; }
  const D=det.data,P=proto.data,N=det.dims[2],NC=NAMES.length,NM=proto.dims[1];
  const MH=proto.dims[2],MW=proto.dims[3],down=MW/S;

  const raw=[],cands=[];
  for(let i=0;i<N;i++){
    let best=0,cls=-1;
    for(let k=0;k<NC;k++){ const s=D[(4+k)*N+i]; if(s>best){best=s;cls=k;} }
    if(best<VIZ) continue;
    const bx=D[i],by=D[N+i],bw=D[2*N+i],bh=D[3*N+i];
    const box={x1:bx-bw/2,y1:by-bh/2,x2:bx+bw/2,y2:by+bh/2,score:best,cls};
    raw.push(box);
    if(best>=CONF){
      const coef=new Float32Array(NM);
      for(let m=0;m<NM;m++) coef[m]=D[(4+NC+m)*N+i];
      cands.push(Object.assign({coef},box));
    }
  }
  cands.sort((a,b)=>b.score-a.score);
  const keep=[];
  for(const a of cands) if(keep.every(b=>b.cls!==a.cls||iou(a,b)<IOU)) keep.push(a);

  const mc=document.createElement('canvas'); mc.width=MW; mc.height=MH;
  const mx=mc.getContext('2d');
  for(const d of keep){
    const idata=mx.createImageData(MW,MH);
    const [cr,cg,cb]=COLORS[d.cls];
    const bx1=d.x1*down,by1=d.y1*down,bx2=d.x2*down,by2=d.y2*down;
    let npx=0;
    for(let y=0;y<MH;y++){
      if(y<by1||y>by2) continue;
      for(let x=0;x<MW;x++){
        if(x<bx1||x>bx2) continue;
        let v=0;
        for(let m=0;m<NM;m++) v+=d.coef[m]*P[m*MH*MW+y*MW+x];
        if(v>0){ const j=(y*MW+x)*4;
          idata.data[j]=cr; idata.data[j+1]=cg; idata.data[j+2]=cb; idata.data[j+3]=125; npx++; }
      }
    }
    const one=document.createElement('canvas'); one.width=MW; one.height=MH;
    one.getContext('2d').putImageData(idata,0,0);
    d.maskCanvas=one;
    d.areaShare=npx/Math.max(1,nw*down*nh*down);
  }

  const t3=performance.now();
  st={img,lc,lb:{r,nw,nh,px,py},raw,cands,keep,N,down,MW,MH};
  $('timing').textContent=`Model ${(t2-t1).toFixed(0)} ms · total ${(t3-t0).toFixed(0)} ms, in this browser`;
  drop.style.display='none'; $('stageCanvas').style.display='block'; $('btnNext').disabled=false;
  render(1);
}

function iou(a,b){
  const ix=Math.max(0,Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1));
  const iy=Math.max(0,Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1));
  const inter=ix*iy;
  const u=(a.x2-a.x1)*(a.y2-a.y1)+(b.x2-b.x1)*(b.y2-b.y1)-inter;
  return u>0?inter/u:0;
}

function render(n){
  stage=n; marks(n);
  $('btnNext').disabled=(n>=6);
  $('resultCard').style.display=(n>=6)?'':'none';

  const cv=$('stageCanvas'), g=cv.getContext('2d');
  const {img,lc,lb,raw,cands,keep,N}=st;
  const onPhoto=(n===1||n>=5);

  if(onPhoto){
    const sc=Math.min(1,1100/img.width);
    cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc);
    g.drawImage(img,0,0,cv.width,cv.height);
  }else{
    cv.width=cv.height=S; g.drawImage(lc,0,0);
  }

  if(n===1){
    $('t1').innerHTML=`As the claimant sent it — <span class="live">${img.width}&times;${img.height}</span>.`;
    setStatus('Stage 1 of 6 — the photograph.');
  }
  if(n===2){
    g.save(); g.fillStyle='rgba(79,140,255,.16)';
    if(lb.py>0){ g.fillRect(0,0,S,lb.py); g.fillRect(0,lb.py+lb.nh,S,S); }
    if(lb.px>0){ g.fillRect(0,0,lb.px,S); g.fillRect(lb.px+lb.nw,0,S,S); }
    g.strokeStyle='#4F8CFF'; g.lineWidth=2; g.strokeRect(lb.px,lb.py,lb.nw,lb.nh); g.restore();
    $('t2').innerHTML=`Scaled to <span class="live">${lb.nw}&times;${lb.nh}</span>, padded to 640. Blue is padding the model ignores.`;
    setStatus('Stage 2 of 6 — letterboxed to the training size.');
  }
  if(n===3){
    g.lineWidth=1;
    for(const d of raw){
      const [cr,cg,cb]=COLORS[d.cls];
      g.strokeStyle=`rgba(${cr},${cg},${cb},${0.12+d.score*0.5})`;
      g.strokeRect(d.x1,d.y1,d.x2-d.x1,d.y2-d.y1);
    }
    $('t3').innerHTML=`<span class="live">${N.toLocaleString()}</span> proposed; <span class="live">${raw.length}</span> above 5% are drawn.`;
    setStatus('Stage 3 of 6 — every proposal, before filtering.');
  }
  if(n===4){
    g.lineWidth=1; g.strokeStyle='rgba(126,140,166,.13)';
    for(const d of raw) g.strokeRect(d.x1,d.y1,d.x2-d.x1,d.y2-d.y1);
    for(const d of keep){
      const [cr,cg,cb]=COLORS[d.cls];
      g.strokeStyle=`rgb(${cr},${cg},${cb})`; g.lineWidth=3;
      g.strokeRect(d.x1,d.y1,d.x2-d.x1,d.y2-d.y1);
    }
    $('t4').innerHTML=`<span class="live">${cands.length}</span> cleared 25%; NMS left <span class="live">${keep.length}</span>.`;
    setStatus('Stage 4 of 6 — thresholded, then de-duplicated.');
  }
  if(n>=5){
    const d2=st.down;
    for(const d of keep)
      g.drawImage(d.maskCanvas, lb.px*d2, lb.py*d2, lb.nw*d2, lb.nh*d2, 0,0, cv.width, cv.height);
    const sx=cv.width/lb.nw, sy=cv.height/lb.nh;
    for(const d of keep){
      const [cr,cg,cb]=COLORS[d.cls];
      const x=(d.x1-lb.px)*sx, y=(d.y1-lb.py)*sy;
      g.strokeStyle=`rgb(${cr},${cg},${cb})`; g.lineWidth=2;
      g.strokeRect(x,y,(d.x2-d.x1)*sx,(d.y2-d.y1)*sy);
      const lab=`${NAMES[d.cls]} ${(d.score*100).toFixed(0)}%`;
      g.font='600 15px Inter, sans-serif';
      g.fillStyle=`rgb(${cr},${cg},${cb})`;
      g.fillRect(x,Math.max(0,y-20),g.measureText(lab).width+12,20);
      g.fillStyle='#06101F'; g.fillText(lab,x+6,Math.max(14,y-6));
    }
    if(n===5){
      $('t5').innerHTML=`<span class="live">${keep.length}</span> mask${keep.length===1?'':'s'} rebuilt from 32 prototypes at 160&times;160.`;
      setStatus('Stage 5 of 6 — masks decoded.');
    }
  }
  if(n===6){
    const tb=$('tbody'); tb.innerHTML='';
    for(const d of keep){
      const [cr,cg,cb]=COLORS[d.cls], sev=sevOf(d.areaShare);
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><span class="swatch" style="background:rgb(${cr},${cg},${cb})"></span>${NAMES[d.cls]}</td>`+
        `<td>${(d.score*100).toFixed(0)}%</td><td>${(d.areaShare*100).toFixed(1)}%</td>`+
        `<td><span class="pill ${sev}">${sev}</span></td>`;
      tb.appendChild(tr);
    }
    if(!keep.length) tb.innerHTML='<tr><td colspan="4">No damage above 25% confidence.</td></tr>';
    const area=keep.reduce((s,d)=>s+d.areaShare,0);
    const lab=keep.length?sevOf(area):'none';
    $('sevText').textContent=lab.charAt(0).toUpperCase()+lab.slice(1);
    $('sevFill').style.width=Math.min(100,area/(SEV_SEVERE*2)*100)+'%';
    $('sevFill').style.background=!keep.length?'var(--dim)':
      area<SEV_MINOR?'var(--green)':area<SEV_SEVERE?'var(--amber)':'var(--red)';
    $('t6').innerHTML=`Damaged area <span class="live">${(area*100).toFixed(1)}%</span> of the photo.`;
    setStatus('Stage 6 of 6 — handed to the adjuster.');
  }
}

const startAt=parseInt((location.hash.match(/slide-(\d+)/)||[])[1],10);
show(startAt?startAt-1:0);
