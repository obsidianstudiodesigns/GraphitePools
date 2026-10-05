const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----- header turns solid once the hero scrolls away -----
const header = document.querySelector('.site-header');
const syncHeader = () => header.classList.toggle('is-solid', window.scrollY > 40);
window.addEventListener('scroll', syncHeader, { passive: true });
syncHeader();

// ----- the 3D pool: one scene, driven by whichever block is in view -----
const stageEl = document.getElementById('stage');
const lightBtn = document.getElementById('light-toggle');
const blocks = [...document.querySelectorAll('.scrolly [data-shot]')];
let scene = null;
let shot = 'hero';
let activeEl = null;

import('./scene.js?v=2').then(({ initPoolScene }) => {
  try {
    scene = initPoolScene(stageEl, { reducedMotion });
    scene.setShot(shot);
    if (location.hash === '#debug') window.__pool = scene;
  } catch (err) {
    console.warn('3D scene unavailable, showing the photo instead', err);
  }
}).catch((err) => console.warn('3D scene failed to load', err));

const activate = (el) => {
  if (el === activeEl) return;
  activeEl = el;
  blocks.forEach((b) => b.classList.toggle('is-active', b === el));
  if (el.dataset.shot === shot) return;
  shot = el.dataset.shot;
  scene?.setShot(shot);
  syncLights();
};
// the block crossing the middle band of the viewport drives the camera and the build
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) activate(e.target);
}, { rootMargin: '-45% 0px -45% 0px' });
blocks.forEach((b) => io.observe(b));

// pool lights only make sense once the pool is finished and full
const FINISHED = ['hero', 'fill'];
let lightsOn = false;
function syncLights() {
  const finished = FINISHED.includes(shot);
  lightBtn.hidden = !finished;
  stageEl.classList.toggle('is-night', finished && lightsOn);
  scene?.setNight(finished && lightsOn);
}
lightBtn.addEventListener('click', () => {
  lightsOn = !lightsOn;
  lightBtn.setAttribute('aria-pressed', String(lightsOn));
  lightBtn.querySelector('.light-label').textContent = lightsOn ? 'Back to daylight' : 'Switch on the pool lights';
  syncLights();
});

// ----- our work: tap a photo to see it large, with previous / next -----
const lightbox = document.getElementById('lightbox');
const lbImg = lightbox.querySelector('.lightbox-img');
const lbCap = lightbox.querySelector('.lightbox-caption');
const shots = [...document.querySelectorAll('.work-open')];
let shotIndex = 0;
const showShot = (i) => {
  shotIndex = (i + shots.length) % shots.length;
  const btn = shots[shotIndex];
  lbImg.src = btn.dataset.full;
  lbImg.alt = btn.querySelector('img').alt;
  lbCap.textContent = btn.closest('figure').querySelector('figcaption').textContent;
};
shots.forEach((btn, i) => btn.addEventListener('click', () => { showShot(i); lightbox.showModal(); }));
lightbox.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => showShot(shotIndex + Number(b.dataset.step))));
lightbox.querySelector('.lb-close').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
lightbox.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') showShot(shotIndex + 1);
  if (e.key === 'ArrowLeft') showShot(shotIndex - 1);
});
lightbox.addEventListener('close', () => shots[shotIndex].focus());

// ----- "Ask about ..." links preselect the service in the form -----
const form = document.getElementById('quote-form');
const serviceSel = document.getElementById('f-service');
document.querySelectorAll('[data-service]').forEach((a) => a.addEventListener('click', () => {
  serviceSel.value = a.dataset.service;
}));

// ----- quote form: builds a WhatsApp or email message, no server needed -----
const errorEl = document.getElementById('form-error');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const via = e.submitter?.value || 'whatsapp';
  const f = Object.fromEntries(new FormData(form));
  const missing = [];
  for (const [key, label] of [['name', 'your name'], ['message', 'a few words about the job']]) {
    const input = form.elements[key];
    const empty = !f[key].trim();
    input.setAttribute('aria-invalid', empty ? 'true' : 'false');
    if (empty) missing.push(label);
  }
  if (missing.length) {
    errorEl.textContent = `Add ${missing.join(' and ')} so we know what the job is.`;
    errorEl.hidden = false;
    form.querySelector('[aria-invalid="true"]').focus();
    return;
  }
  errorEl.hidden = true;

  const lines = [`Hi Graphite Pools, this is ${f.name.trim()}.`, `I need help with: ${f.service}.`];
  if (f.area.trim()) lines.push(`Suburb: ${f.area.trim()}`);
  if (f.phone.trim()) lines.push(`My number: ${f.phone.trim()}`);
  lines.push('', f.message.trim());
  const text = lines.join('\n');

  if (via === 'email') {
    window.location.href = `mailto:marangesamuel96@gmail.com?subject=${encodeURIComponent(`Quote request: ${f.service}`)}&body=${encodeURIComponent(text)}`;
  } else {
    window.open(`https://wa.me/27844564106?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
});

document.getElementById('year').textContent = new Date().getFullYear();
