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
    var pointer = { x: 0, y: 0, active: false };

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
      this.curious = 0;
      this.flash = 0;
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

      // curious: drift toward the pointer and brighten when it's near
      if (pointer.active) {
        var pdx = pointer.x - this.x, pdy = pointer.y - this.y;
        var pd = Math.sqrt(pdx * pdx + pdy * pdy);
        var R = 150;
        if (pd < R) {
          var k = 1 - pd / R;
          this.x += (pdx / (pd || 1)) * k * 0.55;
          this.y += (pdy / (pd || 1)) * k * 0.55;
          if (k > this.curious) this.curious = k;
        }
      }
      if (this.curious > 0.001) {
        this.opacity = Math.min(1, this.opacity * (1 + this.curious * 1.1));
        this.curious *= 0.93;
      }
      // release flash (from clicks / the repl)
      if (this.flash > 0.001) {
        this.opacity = Math.min(1, this.opacity + this.flash * 0.7);
        this.flash *= 0.95;
      }

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

    // Curious fireflies follow the pointer; clicks & the repl can release a few.
    window.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    }, { passive: true });
    window.addEventListener('pointerout', function (e) {
      if (!e.relatedTarget) pointer.active = false;
    });
    window.addEventListener('blur', function () { pointer.active = false; });

    function pickDim(n) {
      return flies.slice().sort(function (a, b) { return a.opacity - b.opacity; }).slice(0, n);
    }
    function release(opts) {
      opts = opts || {};
      var n = Math.min(opts.count || 6, flies.length);
      pickDim(n).forEach(function (f) {
        if (opts.wish) {
          f.x = W * 0.5 + (Math.random() - 0.5) * 70; f.y = H - 36;
          f.vy = -(0.22 + Math.random() * 0.16); f.vx = (Math.random() - 0.5) * 0.12;
          f.size = 2.6; f.flash = 1.5;
        } else if (opts.x != null) {
          f.x = opts.x + (Math.random() - 0.5) * 26; f.y = opts.y + (Math.random() - 0.5) * 18;
          f.vy = -(0.5 + Math.random() * 0.7); f.vx = (Math.random() - 0.5) * 0.6;
          f.size = 1.5 + Math.random() * 1.6; f.flash = 1.1;
        } else {
          f.x = Math.random() * W; f.y = H * 0.62 + Math.random() * H * 0.38;
          f.vy = -(0.4 + Math.random() * 0.7); f.vx = (Math.random() - 0.5) * 0.5;
          f.size = 1.5 + Math.random() * 1.6; f.flash = 1.1;
        }
        f.glow = f.size * (9 + Math.random() * 8);
        f.life = 60; f.baseOp = 0.8 + Math.random() * 0.2; f.curious = 0;
      });
      if (reduceMotion) drawStatic();
    }
    window.addEventListener('sage:firefly', function (e) { release(e.detail || {}); });

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

    // Dogear drag state
    var dragging = false, dragCard = null, dragStartX = 0, dragStartY = 0;

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

    // Standard side-flick (button / card body click)
    function flick() {
      if (busy || dragging) return;
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
        stage.appendChild(top);
        var n = cards().length;
        top.style.transition = 'none';
        top.style.transform = 'translateY(' + ((n - 1) * 18) + 'px) scale(' + (1 - (n - 1) * 0.045) + ')';
        top.style.opacity = '0.26';
        top.style.zIndex = String(30 - (n - 1) * 10);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { layout(); busy = false; });
        });
      }, FLICK_MS + 20);
    }

    // Dogear pull: flick down-left at ~30°
    function flickDownLeft(card) {
      busy = true;
      card.classList.remove('is-top');
      card.style.pointerEvents = 'none';
      card.style.cursor = '';
      card.style.zIndex = '40';
      card.style.transition = 'transform ' + FLICK_MS + 'ms var(--ease-out), opacity ' + FLICK_MS + 'ms var(--ease-out)';
      requestAnimationFrame(function () {
        card.style.transform = 'translate(-92%, 118%) rotate(-30deg)';
        card.style.opacity = '0';
      });
      setTimeout(function () {
        stage.appendChild(card);
        var n = cards().length;
        card.style.transition = 'none';
        card.style.transform = 'translateY(' + ((n - 1) * 18) + 'px) scale(' + (1 - (n - 1) * 0.045) + ')';
        card.style.opacity = '0.26';
        card.style.zIndex = String(30 - (n - 1) * 10);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { layout(); busy = false; });
        });
      }, FLICK_MS + 20);
    }

    // Snap card back to top-of-stack with a little spring
    function snapBack(card) {
      card.style.transition = 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ' + STACK_MS + 'ms var(--ease-out)';
      card.style.transform = 'translateY(0px) scale(1)';
      card.style.opacity = '1';
      card.style.cursor = '';
    }

    // — Dogear: mousedown —
    stage.addEventListener('mousedown', function (e) {
      if (busy) return;
      var dogear = e.target.closest && e.target.closest('.dogear');
      if (!dogear) return;
      var topCard = cards()[0];
      if (!topCard || !topCard.contains(dogear)) return;
      e.preventDefault();
      dragging = true;
      dragCard = topCard;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragCard.style.transition = 'none';
      document.body.style.cursor = 'grabbing';
    });

    // — Dogear: touchstart —
    stage.addEventListener('touchstart', function (e) {
      if (busy) return;
      var dogear = e.target.closest && e.target.closest('.dogear');
      if (!dogear) return;
      var topCard = cards()[0];
      if (!topCard || !topCard.contains(dogear)) return;
      dragging = true;
      dragCard = topCard;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      dragCard.style.transition = 'none';
    }, { passive: true });

    function handleDragMove(cx, cy) {
      if (!dragging || !dragCard) return;
      var dx = cx - dragStartX;
      var dy = cy - dragStartY;
      // Natural CCW rotation as you pull the top-right corner down-left
      var rot = (dx - dy * 0.35) * 0.03;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var fade = Math.max(0.35, 1 - dist / 320);
      dragCard.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(1) rotate(' + rot + 'deg)';
      dragCard.style.opacity = String(fade);
    }

    function handleDragEnd(cx, cy) {
      if (!dragging || !dragCard) return;
      var dx = cx - dragStartX;
      var dy = cy - dragStartY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      document.body.style.cursor = '';
      dragging = false;
      var card = dragCard;
      dragCard = null;
      // Pulled far enough down, OR it was just a tap on the dogear → flick down-left
      if (dy > 55 || dist < 12) {
        flickDownLeft(card);
      } else {
        snapBack(card);
      }
    }

    document.addEventListener('mousemove', function (e) { handleDragMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup',   function (e) { handleDragEnd(e.clientX, e.clientY); });
    document.addEventListener('touchmove', function (e) {
      if (dragging) handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (dragging && e.changedTouches.length) {
        handleDragEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    });

    // Card body click → side flick (skip if dogear was the target)
    stage.addEventListener('click', function (e) {
      if (dragging) return;
      var dog = e.target.closest && e.target.closest('.dogear');
      if (dog) return;  // dogear tap handled via mouseup above
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
