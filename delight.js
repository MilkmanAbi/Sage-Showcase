/* =========================================================================
   Sage — little delights
   Cursor-curious fireflies live in app.js. This file adds the playful bits:
   click to release a firefly, a keyboard charm, the >_ launcher, and the
   hidden shell — which is now powered by the REAL Sage REPL emulator
   (sage-repl.js). Our panel keeps the window chrome, traffic lights, and
   the sparkle send-off; the interpreter does the thinking.
   ========================================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fire(detail) {
    if (reduceMotion) return;
    window.dispatchEvent(new CustomEvent('sage:firefly', { detail: detail || {} }));
  }

  /* ---- click empty space to release a firefly ------------------------ */
  document.addEventListener('click', function (e) {
    if (reduceMotion) return;
    if (e.target.closest('a, button, input, textarea, label, .sage-repl, .flick-stage, .hamburger')) return;
    if (window.getSelection && String(window.getSelection())) return;   // not while selecting text
    fire({ x: e.clientX, y: e.clientY, count: 3 });
  });

  /* ---- the hidden sage repl (real interpreter inside our shell) ------ */
  var repl = null, mount = null, sage = null, opened = false;

  function build() {
    repl = document.createElement('div');
    repl.className = 'sage-repl';
    repl.setAttribute('role', 'dialog');
    repl.setAttribute('aria-label', 'Sage REPL');
    repl.innerHTML =
      '<div class="repl-chrome">' +
        '<button class="dot dot-red repl-light" type="button" data-act="reset" aria-label="Close and reset" title="close + reset"></button>' +
        '<button class="dot dot-yellow repl-light" type="button" data-act="min" aria-label="Minimize" title="minimize"></button>' +
        '<button class="dot dot-green repl-light" type="button" data-act="spark" aria-label="Close with a sparkle" title="close \u2726"></button>' +
        '<span class="repl-title"><span class="glyph">\u2726</span> sage repl</span>' +
        '<button class="repl-close" type="button" aria-label="Close">esc</button>' +
      '</div>' +
      '<div class="repl-mount"></div>' +
      '<div class="repl-foot">the full thing lives at ' +
        '<a href="https://milkmanabi.github.io/Sage-Playground/" target="_blank" rel="noopener">Sage Playground</a></div>';
    document.body.appendChild(repl);
    mount = repl.querySelector('.repl-mount');

    // Mount the real Sage REPL emulator inside our body.
    if (window.sageInjectCSS) window.sageInjectCSS();
    if (window.SageREPL) {
      sage = new window.SageREPL(mount, {
        noChrome: true,                       // we provide our own window chrome
        onFirefly: function () { fire({ count: 4 }); }   // Firefly errors stir the swarm
      });
    } else {
      mount.innerHTML = '<div class="repl-missing">\u2726 the sage interpreter didn\u2019t load.</div>';
    }

    repl.querySelector('.repl-close').addEventListener('click', closeRepl);
    repl.querySelectorAll('.repl-light').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var act = b.dataset.act;
        if (act === 'reset') resetRepl();
        else if (act === 'min') toggleMin();
        else if (act === 'spark') sparkleClose();
      });
    });
    repl.querySelector('.repl-chrome').addEventListener('click', function (e) {
      if (e.target.closest('.repl-light') || e.target.closest('.repl-close')) return;
      if (repl.classList.contains('minimized')) { repl.classList.remove('minimized'); focusSage(); }
    });
    // Esc closes from anywhere inside the panel (the interpreter ignores Esc itself)
    repl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeRepl(); }
    });
  }

  function focusSage() { if (sage) setTimeout(function () { sage.focus(); }, 50); }

  function openRepl() {
    if (!repl) build();
    repl.classList.add('open');
    repl.classList.remove('minimized');
    opened = true;
    var l = document.querySelector('.sage-launch'); if (l) l.classList.add('is-active');
    focusSage();
  }
  function closeRepl() {
    if (!repl) return;
    repl.classList.remove('open');
    opened = false;
    var l = document.querySelector('.sage-launch'); if (l) l.classList.remove('is-active');
  }

  // red — close and wipe the slate clean (fresh environment)
  function resetRepl() {
    if (sage) sage.reset();
    repl.classList.remove('minimized');
    closeRepl();
  }
  // yellow — collapse to the title bar, but keep everything (env + history intact)
  function toggleMin() {
    if (repl.classList.toggle('minimized')) { /* collapsed */ }
    else { focusSage(); }
  }
  // green — send it off with a little shower of light, state intact
  function sparkleClose() {
    var r = repl.getBoundingClientRect();
    fire({ x: r.left + r.width / 2, y: r.top + 12, count: 8 });
    fire({ count: 6 });
    repl.classList.remove('minimized');
    closeRepl();
  }

  /* ---- keyboard charms: type "sage" or "firefly" anywhere ------------ */
  var seq = '';
  window.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!e.key || e.key.length !== 1) return;
    seq = (seq + e.key.toLowerCase()).slice(-10);
    if (/sage$/.test(seq)) openRepl();
    else if (/firefly$/.test(seq)) fire({ count: 12 });
  });

  /* ---- a quiet way in: the footer sparkle ---------------------------- */
  function wireFooter() {
    var fm = document.querySelector('.footer-mark');
    if (!fm) return;
    fm.style.cursor = 'pointer';
    fm.title = 'psst \u2726';
    fm.addEventListener('click', function () { opened ? closeRepl() : openRepl(); });
  }

  /* ---- an obvious way in: the >_ launcher chip ----------------------- */
  function buildLauncher() {
    var btn = document.createElement('button');
    btn.className = 'sage-launch';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open the sage shell');
    btn.title = 'a little shell \u2726';
    btn.innerHTML = '<span class="sage-launch-glyph">&gt;_</span>';
    btn.addEventListener('click', function () { opened ? closeRepl() : openRepl(); });
    document.body.appendChild(btn);
  }

  function init() { wireFooter(); buildLauncher(); }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
