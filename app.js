/* =========================================================================
   Sage — interactions
   ========================================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Lucide icons -------------------------------------------------- */
  function drawIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
  if (document.readyState !== 'loading') drawIcons();
  else document.addEventListener('DOMContentLoaded', drawIcons);

  /* ---- Scroll progress + nav border + scroll cue fade ---------------- */
  var progress = document.getElementById('scroll-progress');
  var nav = document.getElementById('nav');
  var scrollCue = document.getElementById('scroll-cue');
  var ticking = false;

  function onScrollFrame() {
    var y = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var pct = max > 0 ? (y / max) * 100 : 0;
    if (progress) progress.style.width = pct + '%';
    if (nav) nav.classList.toggle('scrolled', y > 10);
    if (scrollCue) scrollCue.style.opacity = y > 80 ? '0' : '1';
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(onScrollFrame); ticking = true; }
  }, { passive: true });
  onScrollFrame();

  /* ---- Mobile menu --------------------------------------------------- */
  var burger = document.getElementById('hamburger');
  var menu = document.getElementById('mobile-menu');
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = burger.classList.toggle('open');
      menu.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        burger.classList.remove('open');
        menu.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- Reveal-on-scroll (shared observer) ---------------------------- */
  var revealEls = document.querySelectorAll('.reveal, .reveal-up');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var group = el.parentElement && el.parentElement.hasAttribute('data-stagger');
          if (group) {
            var idx = Array.prototype.indexOf.call(el.parentElement.children, el);
            el.style.transitionDelay = (idx * 80) + 'ms';
          }
          el.classList.add('in');
          revObs.unobserve(el);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
      else revObs.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- Terminal line-by-line reveal ---------------------------------- */
  var terms = document.querySelectorAll('.terminal-body.stagger');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var termObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var body = entry.target;
          var lines = body.querySelectorAll('.ln');
          body.classList.add('played');
          lines.forEach(function (ln, i) { ln.style.transitionDelay = (i * 60) + 'ms'; });
          termObs.unobserve(body);
        }
      });
    }, { threshold: 0.18 });
    terms.forEach(function (t) { termObs.observe(t); });
  } else {
    terms.forEach(function (t) {
      t.classList.add('played');
      t.querySelectorAll('.ln').forEach(function (ln) { ln.style.opacity = '1'; });
    });
  }

  /* ---- Active nav link (scroll spy) ---------------------------------- */
  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[data-spy]'));
  var spyTargets = spyLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  if ('IntersectionObserver' in window && spyTargets.some(Boolean)) {
    var spyObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = '#' + entry.target.id;
          spyLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === id); });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    spyTargets.forEach(function (t) { if (t) spyObs.observe(t); });
  }

  /* ---- Firefly canvas ------------------------------------------------ */
  var canvas = document.getElementById('firefly-canvas');
  if (canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var flies = [];

    // Warm-white & soft-pastel firefly palette (warm dominant)
    var PALETTE = [
      [255, 236, 188], [255, 226, 160], [255, 244, 214], // warm whites / amber (most common)
      [255, 236, 188], [255, 226, 160],
      [196, 169, 228],                                    // lilac
      [156, 196, 232],                                    // blue
      [168, 216, 188],                                    // sage
      [230, 169, 204]                                     // pink
    ];

    function count() {
      if (window.innerWidth < 480) return 22;
      if (window.innerWidth < 768) return 34;
      return 52;
    }

    function Fly(init) { this.reset(init); }
    Fly.prototype.reset = function (init) {
      this.x = Math.random() * W;
      // bias spawn toward the lower half so the field thins out as it rises
      this.y = init ? H * (1 - Math.pow(Math.random(), 1.7)) : H + 20 + Math.random() * 40;
      this.vy = -(0.20 + Math.random() * 0.5);            // gentle but steady upward drift
      this.vx = (Math.random() - 0.5) * 0.16;
      this.phase = Math.random() * Math.PI * 2;
      this.driftF = 0.008 + Math.random() * 0.018;        // sway frequency
      this.driftA = 0.5 + Math.random() * 1.4;            // sway amplitude
      this.size = 1.1 + Math.random() * 2.2;
      this.glow = this.size * (7 + Math.random() * 9);
      this.baseOp = 0.4 + Math.random() * 0.55;
      this.opacity = 0;
      this.blinkP = Math.random() * Math.PI * 2;
      this.blinkS = 0.02 + Math.random() * 0.05;          // soft blink speed
      this.life = 0;
      var c = PALETTE[(Math.random() * PALETTE.length) | 0];
      this.r = c[0]; this.g = c[1]; this.b = c[2];
    };
    Fly.prototype.update = function () {
      this.life++;
      var fadeIn = Math.min(1, this.life / 55);           // ease in at birth
      // ethereal: dim (and so thin out) as they climb the page
      var yr = this.y / H;                                // 0 top .. 1 bottom
      var heightFade = Math.pow(Math.max(0, Math.min(1, yr * 1.12)), 0.9);
      var blink = 0.6 + 0.4 * Math.sin(this.blinkP + this.life * this.blinkS);
      this.opacity = this.baseOp * fadeIn * heightFade * blink;
      this.x += this.vx + Math.sin(this.phase + this.life * this.driftF) * this.driftA * 0.1;
      this.y += this.vy;
      if (this.y < -30) this.reset(false);               // recycle once off the top
    };
    Fly.prototype.draw = function () {
      if (this.opacity < 0.01) return;
      var x = this.x, y = this.y, r = this.r, g = this.g, b = this.b, op = this.opacity;
      // outer glow
      var og = ctx.createRadialGradient(x, y, 0, x, y, this.glow);
      og.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (op * 0.6) + ')');
      og.addColorStop(0.45, 'rgba(' + r + ',' + g + ',' + b + ',' + (op * 0.16) + ')');
      og.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      ctx.beginPath(); ctx.arc(x, y, this.glow, 0, Math.PI * 2); ctx.fillStyle = og; ctx.fill();
      // warm-white core
      var cg = ctx.createRadialGradient(x, y, 0, x, y, this.size * 2);
      cg.addColorStop(0, 'rgba(255,250,240,' + Math.min(1, op * 1.5) + ')');
      cg.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ',' + op + ')');
      cg.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      ctx.beginPath(); ctx.arc(x, y, this.size * 2, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
    };

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flies = [];
      var n = count();
      for (var i = 0; i < n; i++) flies.push(new Fly(true));
    }

    var raf = null;
    function loop() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < flies.length; i++) { flies[i].update(); flies[i].draw(); }
      ctx.globalCompositeOperation = 'source-over';
      raf = window.requestAnimationFrame(loop);
    }
    function drawStatic() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < flies.length; i++) {
        flies[i].opacity = flies[i].baseOp * 0.85;
        flies[i].draw();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    resize();
    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (raf) window.cancelAnimationFrame(raf);
        resize();
        if (reduceMotion) drawStatic(); else loop();
      }, 180);
    }, { passive: true });

    if (reduceMotion) drawStatic(); else loop();
  }

  /* ---- Flick-card deck (memory modes) -------------------------------- */
  (function flickDeck() {
    var stage = document.getElementById('memStage');
    if (!stage) return;
    var dotsWrap = document.getElementById('memDots');
    var btn = document.getElementById('memFlick');
    var FLICK_MS = reduceMotion ? 1 : 600;
    var STACK_MS = reduceMotion ? 1 : 520;
    var order = ['gc', 'manual', 'hybrid'];
    var flip = 0, busy = false;

    order.forEach(function (name) {
      var d = document.createElement('span');
      d.className = 'flick-dot';
      d.dataset.name = name;
      dotsWrap.appendChild(d);
    });

    function cards() { return Array.prototype.slice.call(stage.querySelectorAll('.flick-card')); }

    function layout() {
      var cs = cards();
      cs.forEach(function (c, i) {
        c.classList.toggle('is-top', i === 0);
        c.style.transition = 'transform ' + STACK_MS + 'ms var(--ease-out), opacity ' + STACK_MS + 'ms var(--ease-out)';
        c.style.transform = 'translateY(' + (i * 18) + 'px) scale(' + (1 - i * 0.045) + ')';
        c.style.opacity = i === 0 ? '1' : (i === 1 ? '0.5' : '0.26');
        c.style.zIndex = String(30 - i * 10);
        c.style.pointerEvents = i === 0 ? 'auto' : 'none';
        c.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
      });
      var topName = cs[0] && cs[0].dataset.name;
      Array.prototype.forEach.call(dotsWrap.children, function (d) {
        d.classList.toggle('active', d.dataset.name === topName);
      });
    }

    function flick() {
      if (busy) return;
      var cs = cards();
      if (cs.length < 2) return;
      busy = true;
      var top = cs[0];
      var dir = (flip++ % 2 === 0) ? 1 : -1;
      top.classList.remove('is-top');
      top.style.pointerEvents = 'none';
      top.style.zIndex = '40';
      top.style.transition = 'transform ' + FLICK_MS + 'ms var(--ease-out), opacity ' + FLICK_MS + 'ms var(--ease-out)';
      requestAnimationFrame(function () {
        top.style.transform = 'translate(' + (dir * 135) + '%, -48%) rotate(' + (dir * 30) + 'deg)';
        top.style.opacity = '0';
      });
      setTimeout(function () {
        stage.appendChild(top);            // send to back of the stack
        var n = cards().length;
        top.style.transition = 'none';     // snap into the back position unseen
        top.style.transform = 'translateY(' + ((n - 1) * 18) + 'px) scale(' + (1 - (n - 1) * 0.045) + ')';
        top.style.opacity = '0.26';
        top.style.zIndex = String(30 - (n - 1) * 10);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { layout(); busy = false; });
        });
      }, FLICK_MS + 20);
    }

    stage.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('.flick-card');
      if (card && card.classList.contains('is-top')) flick();
    });
    if (btn) btn.addEventListener('click', flick);

    requestAnimationFrame(layout);
  })();

  /* ---- Current year -------------------------------------------------- */
  var yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();
})();
