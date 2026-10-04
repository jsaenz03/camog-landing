/* ============================================================
   CONFIG — Camog: 120 frames, teal on light
============================================================ */
const CONFIG = {
  frameCount: 120,                                          // must match frames-nas/ on disk
  frameSrc:  n => `frames-nas/f_${String(n).padStart(3,'0')}.jpg`,
  accent: 0x00565b,                                         // keep in sync with --accent
  zoomFrom: 1.05,                                           // slow push on the film
  zoomTo:   1.13,
  glideDuration: 1.2,                                       // seconds per section glide
  gestureThreshold: 60,                                     // wheel deltaY to commit a section
};

const FRAMES = CONFIG.frameCount;
const $ = s => document.querySelector(s);
const state = { scrub: 0, fade: 0 };   // fade: film dims + data chrome hides across the outro
window.__state = state; // verification hook

/* ============================================================
   renderer — 2D canvas, cover-fit, no WebGL
============================================================ */
const canvas = $('#film');
const ctx = canvas.getContext('2d');
let dpr = 1;
function sizeCanvas(){
  dpr = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}
sizeCanvas();

/* ============================================================
   assets — plain Image preloader drives the progress bar
============================================================ */
const frames = new Array(FRAMES);
let loaded = 0;
for (let i=1; i<=FRAMES; i++){
  const img = new Image();
  img.onload = img.onerror = () => {
    loaded++;
    const p = Math.round(loaded/FRAMES*100);
    $('#load-bar').style.transform = `scaleX(${p/100})`;
    $('#load-pct').textContent = `LOADING\u00a0\u00a0${String(p).padStart(3,'0')}%`;
    if (loaded === FRAMES) start();
  };
  img.src = CONFIG.frameSrc(i);
  frames[i-1] = img;
}

let lastDrawn = -1, lastW = 0, lastShownIdx = -1, lastFade = -1;
function draw(idx){
  const img = frames[idx];
  if (!img || !img.naturalWidth) return;
  const zoom = CONFIG.zoomFrom + (CONFIG.zoomTo - CONFIG.zoomFrom) * state.scrub;
  const s = Math.max(canvas.width/img.naturalWidth, canvas.height/img.naturalHeight) * zoom;
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.drawImage(img, (canvas.width - w)/2, (canvas.height - h)/2, w, h);
  /* outro hold — the film settles toward the light surface, not to black,
     so the dark-teal CTA stays legible over the dimmed money frame */
  if (state.fade > 0){
    ctx.fillStyle = `rgba(243,247,246,${(state.fade*.72).toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  lastDrawn = idx; lastW = canvas.width;
}

function render(){
  requestAnimationFrame(render);
  const idx = Math.round(state.scrub*(FRAMES-1));
  const fade = Math.round(state.fade*100)/100;
  if (idx !== lastDrawn || canvas.width !== lastW || fade !== lastFade){
    draw(idx); lastFade = fade;
  }
  if (idx !== lastShownIdx){
    $('#hud-count').textContent = `FRAME\u00a0${String(idx+1).padStart(3,'0')}\u00a0/\u00a0${FRAMES}`;
    lastShownIdx = idx;
  }
  $('#hud-track').style.transform = `scaleX(${state.scrub})`;
  /* data chrome fades with the outro dim — render-loop-owned (rule 5) */
  const o = String(Math.max(0, 1 - state.fade*1.6));
  for (const el of document.querySelectorAll('.hud-frame,.hud-phase,.rail')) el.style.opacity = o;
}

/* ============================================================
   scroll choreography — same snap engine as the deck flavor
============================================================ */
function start(){
  $('#loader').classList.add('done');
  requestAnimationFrame(render);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lenis = new Lenis({ smoothWheel:!reduced, lerp:.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time*1000));
  gsap.ticker.lagSmoothing(0);
  gsap.registerPlugin(ScrollTrigger);

  /* hero intro */
  gsap.to('#hero h1 .l i', {y:0, duration:1.2, stagger:.12, ease:'power4.out', delay:.25});
  gsap.to('.fade-in', {opacity:1, y:0, duration:1.1, stagger:.12, ease:'power3.out', delay:.55});
  gsap.to('.chrome', {opacity:1, duration:1, delay:.9});

  /* master timeline — ping-pong scrub: the 8s film plays FORWARD across the
     first two sections' travel (hero + seq1), landing its final frame as seq1
     docks; every section after that plays it in REVERSE back to frame 001.
     Timeline px == scroll px: tween spans sum to the trigger range. */
  const vh = innerHeight;
  const D = el => el.offsetHeight;
  const docTop = el => el.getBoundingClientRect().top + scrollY;
  const allSeqs = document.querySelectorAll('.seq');
  const firstSeq = allSeqs[0];
  const fwdDock = docTop(firstSeq) + D(firstSeq) - vh;   // end of section 2's travel
  const total   = document.documentElement.scrollHeight - vh;
  const tl = gsap.timeline({
    defaults:{ease:'none'},
    scrollTrigger:{trigger:'main', start:'top top', end:'bottom bottom', scrub:.6}
  });
  tl.to(state, {scrub:1, duration:fwdDock}, 0)
    .to(state, {scrub:0, duration:total - fwdDock}, fwdDock)
    .to(state, {fade:1,  duration:total - docTop($('#outro'))}, docTop($('#outro')));

  /* phase HUD */
  const phases = [
    ['#seq1',  '01','THE RECORD'],
    ['#seq2',  '02','THE AUDIT'],
    ['#outro', '03','LAUNCH']
  ];
  phases.forEach(([sel, idx, name]) => {
    ScrollTrigger.create({
      trigger:sel, start:'top 60%', end:'bottom 60%',
      onToggle: self => {
        if (self.isActive){
          $('#hud-idx').textContent = idx;
          $('#hud-name').textContent = name;
        }
      }
    });
  });

  /* ============================================================
     section snap — identical engine to the deck flavor: one
     gesture = one glide, input locked while travelling, re-arm
     after a quiet window. Never lenis.stop().
  ============================================================ */
  const rail = $('#rail');
  const snapSections = ['#hero', '#seq1', '#seq2', '#outro'].map(s => $(s));
  const railNames = ['Intro', 'The record', 'The audit', 'Launch'];
  let snapPoints = [], busy = false, glideEnd = 0, lastWheel = 0, wheelAcc = 0, railIdx = -1, rszT = 0;

  const computeSnap = () => {
    const vh = innerHeight;
    const top = el => el.getBoundingClientRect().top + scrollY;
    /* .seq copy is bottom-anchored, so mid sections dock at top+height-vh
       (section end at viewport bottom) — the copy arrives WITH its film beat.
       The outro dock IS the page end (footer lives inside #outro), and any
       coinciding points collapse so the rail never shows a double stop. */
    const raw = [
      0,
      ...snapSections.slice(1, -1).map(el => top(el) + el.offsetHeight - vh),
      top(snapSections[snapSections.length-1]) + snapSections[snapSections.length-1].offsetHeight - vh,
      document.documentElement.scrollHeight - vh
    ];
    snapPoints = raw.filter((p, i) => i === 0 || p - raw[i-1] > 4);
    rail.innerHTML = '';
    snapPoints.forEach((b, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.title = railNames[i] || ('Section ' + (i + 1));
      d.setAttribute('aria-label', 'Go to section ' + (i + 1) + ': ' + d.title);
      d.innerHTML = '<i></i>';
      d.addEventListener('click', () => go(i));
      rail.appendChild(d);
    });
    railIdx = -1;
  };

  const nearestSnap = () => {
    let best = 0, bd = Infinity;
    snapPoints.forEach((b, i) => { const d = Math.abs(b - scrollY); if (d < bd){ bd = d; best = i; } });
    return best;
  };

  const go = i => {
    if (busy) return;
    i = Math.max(0, Math.min(snapPoints.length - 1, i));
    const target = snapPoints[i];
    if (Math.abs(target - scrollY) < 2) return;
    busy = true;
    lenis.scrollTo(target, {
      duration: CONFIG.glideDuration,
      lock: true,
      easing: t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
      onComplete: () => { glideEnd = performance.now(); }
    });
    setTimeout(() => { if (!glideEnd) glideEnd = performance.now(); }, 1500);
  };

  addEventListener('wheel', e => {
    if (busy){ e.preventDefault(); e.stopImmediatePropagation(); }
  }, {capture:true, passive:false});

  gsap.ticker.add(() => {
    const i = nearestSnap();
    if (i !== railIdx){
      railIdx = i;
      rail.querySelectorAll('button').forEach((s, j) => s.classList.toggle('on', j === i));
    }
    if (busy && glideEnd && performance.now() - Math.max(glideEnd, lastWheel) > 350){
      busy = false;
    }
  });

  addEventListener('wheel', e => {
    lastWheel = performance.now();
    if (busy) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > CONFIG.gestureThreshold){
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      go(nearestSnap() + dir);
    }
  }, {passive:true});

  const step = dir => go(nearestSnap() + dir);
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && window.parent !== window){
      /* embedded in the landing's modal: the parent owns the close button */
      window.parent.postMessage('camog-film:close', location.origin);
      return;
    }
    if (['PageDown','ArrowRight',' '].includes(e.key)){ e.preventDefault(); step(1); }
    else if (['PageUp','ArrowLeft'].includes(e.key)){ e.preventDefault(); step(-1); }
  });
  addEventListener('resize', () => { clearTimeout(rszT); rszT = setTimeout(computeSnap, 250); });
  addEventListener('load', computeSnap);
  computeSnap();

  /* copy drift — each section's copy leaves as the next beat arrives */
  gsap.to('#hero', {opacity:0, ease:'none',
    scrollTrigger:{trigger:'#seq1', start:'top 90%', end:'top 30%', scrub:true}});
  document.querySelectorAll('.seq .copy').forEach((copy, i, all) => {
    const next = all[i+1]?.parentElement || $('#outro');
    gsap.to(copy, {opacity:0, y:-60, ease:'none',
      scrollTrigger:{trigger:next, start:'top 95%', end:'top 40%', scrub:true}});
  });
}

addEventListener('resize', sizeCanvas);
