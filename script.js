// Reveal-on-scroll. Content stays visible without JS or under reduced motion:
// the hidden state only applies to html.js (see styles.css).
document.documentElement.classList.add('js');

var reveal = function () {
  var items = document.querySelectorAll('.reveal');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach(function (el) { observer.observe(el); });
};

reveal();

// Hero film shot: slow crossfade through three frames of the product film.
// Paused offscreen, while the modal is open, and under reduced motion
// (the first frame stays put as a static poster).
var filmShot = document.querySelector('.shot-live');
var filmFrames = document.querySelectorAll('.shot-frame');
var filmModalOpen = false;
if (filmShot && filmFrames.length > 1 &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    'IntersectionObserver' in window) {
  var frameIdx = 0;
  var frameTimer = 0;
  var nextFrame = function () {
    if (filmModalOpen || document.hidden) return;
    filmFrames[frameIdx].classList.remove('is-current');
    frameIdx = (frameIdx + 1) % filmFrames.length;
    filmFrames[frameIdx].classList.add('is-current');
  };
  new IntersectionObserver(function (entries) {
    clearInterval(frameTimer);
    if (entries[0].isIntersecting) frameTimer = setInterval(nextFrame, 3400);
  }, { threshold: 0.3 }).observe(filmShot);
}

// Product film modal. The shot expands to the full viewport and back
// (transform-only FLIP); the film itself runs in a same-origin iframe
// whose src is only set on first open.
(function () {
  var modal = document.getElementById('film-modal');
  if (!modal || !filmShot) return;
  var dialog = modal.querySelector('.film-dialog');
  var frameEl = document.getElementById('film-frame');
  var closeBtn = document.getElementById('film-close');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var opened = false, lastFocus = null, closeTimer = 0;

  var shotRect = function () {
    var r = filmShot.getBoundingClientRect();
    return {
      x: r.left, y: r.top,
      sx: r.width / window.innerWidth,
      sy: r.height / window.innerHeight
    };
  };

  var lockScroll = function (on) {
    if (on) {
      var gap = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (gap > 0) document.body.style.paddingRight = gap + 'px';
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  };

  var openFilm = function () {
    if (filmModalOpen) return;
    filmModalOpen = true;
    lastFocus = document.activeElement;
    if (!opened) {
      opened = true;
      frameEl.src = frameEl.getAttribute('data-src');
    }
    var r = shotRect();
    dialog.style.transition = 'none';
    dialog.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px) scale(' + r.sx + ',' + r.sy + ')';
    modal.hidden = false;
    void modal.offsetWidth; // commit the collapsed state before animating
    if (reduced) {
      dialog.style.transform = 'none';
      modal.classList.add('open');
    } else {
      dialog.style.transition = '';
      dialog.style.transform = 'none';
      modal.classList.add('open');
    }
    lockScroll(true);
    dialog.focus();
  };

  var finishClose = function () {
    clearTimeout(closeTimer);
    modal.hidden = true;
    modal.classList.remove('open');
    dialog.style.transition = 'none';
    dialog.style.transform = 'none';
    lockScroll(false);
    filmModalOpen = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  var closeFilm = function () {
    if (!filmModalOpen) return;
    if (reduced) { finishClose(); return; }
    var r = shotRect();
    dialog.style.transition = '';
    dialog.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px) scale(' + r.sx + ',' + r.sy + ')';
    modal.classList.remove('open');
    closeTimer = setTimeout(finishClose, 650); // transition is 550ms
  };

  filmShot.addEventListener('click', openFilm);
  closeBtn.addEventListener('click', closeFilm);
  dialog.addEventListener('transitionend', function (e) {
    if (e.target === dialog && modal.classList.contains('open') === false && filmModalOpen) finishClose();
  });

  document.addEventListener('keydown', function (e) {
    if (!filmModalOpen || modal.hidden) return;
    if (e.key === 'Escape') { closeFilm(); return; }
    if (e.key !== 'Tab') return;
    var stops = [closeBtn, frameEl];
    var i = stops.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); frameEl.focus(); }
    else if (!e.shiftKey && i === stops.length - 1) { e.preventDefault(); closeBtn.focus(); }
  });

  // The film asks to close from inside its own document: Escape pressed
  // while the iframe has focus never reaches this page's keydown handler.
  window.addEventListener('message', function (e) {
    if (e.origin === window.location.origin && e.data === 'camog-film:close') closeFilm();
  });
})();
