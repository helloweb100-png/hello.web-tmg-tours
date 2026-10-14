/*! TMG Tours · script.js
 *
 * Índice
 *  0. Configuración  (EDITAR el número de WhatsApp aquí)
 *  1. Utilidades
 *  2. WhatsApp (enlaces, formulario, burbuja flotante)
 *  3. Loader
 *  4. Scroll: Lenis + bucle único (rAF) que alimenta todas las escenas
 *  5. Escenas ligadas al scroll (manifiesto, imagen que se abre, tours horizontales, zoom, ruta)
 *  6. Hero (rotador de palabras, partículas, tilt 3D)
 *  7. UI (menú, FAQ, videos, contadores, efectos de cursor)
 *
 * Nota de rendimiento: no se usa ningún listener de "scroll". Un solo requestAnimationFrame lee la
 * posición y escribe variables CSS (--p, --pe, --pz...) solo en las escenas visibles.
 */
(function () {
  'use strict';

  /* ===================================================================
     0. CONFIGURACIÓN
  =================================================================== */
  var CONFIG = {
    // TODO: número de WhatsApp del cliente con lada de país, solo dígitos (sin "+" ni espacios).
    // Ejemplo México (Cancún): '529981234567'
    whatsappNumber: '52XXXXXXXXXX',
    defaultMessage: 'Hola TMG Tours, quiero información de sus tours en Cancún.',
    loaderMinMs: 1900,
    loaderMaxMs: 6500
  };

  /* ===================================================================
     1. UTILIDADES
  =================================================================== */
  var html = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var damp = function (a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); };
  var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeInOutSine = function (t) { return (1 - Math.cos(Math.PI * t)) / 2; };
  var easeOutExpo = function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); };

  var reduce = html.classList.contains('rm') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reduce) html.classList.add('rm');
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var mqDesktop = window.matchMedia('(min-width: 1024px)');

  var lenis = null;
  var viewport = { w: window.innerWidth, h: window.innerHeight };
  var scrollY = function () { return lenis ? lenis.scroll : (window.pageYOffset || 0); };
  var absTop = function (el) { return el.getBoundingClientRect().top + (window.pageYOffset || 0); };
  var safe = function (name, fn) { try { fn(); } catch (err) { if (window.console) console.warn('[TMG] ' + name + ':', err); } };

  /* ===================================================================
     2. WHATSAPP
  =================================================================== */
  var waDigits = CONFIG.whatsappNumber.replace(/\D/g, '');
  var waIsPlaceholder = /x/i.test(CONFIG.whatsappNumber);

  function waUrl(message) {
    return 'https://wa.me/' + waDigits + '?text=' + encodeURIComponent(message || CONFIG.defaultMessage);
  }

  function openWhatsApp(message) {
    // Un <a> temporal disparado desde un gesto del usuario evita el bloqueo de ventanas emergentes.
    var a = document.createElement('a');
    a.href = waUrl(message);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function initWhatsAppLinks() {
    if (waIsPlaceholder && window.console) {
      console.warn('[TMG Tours] Falta configurar CONFIG.whatsappNumber en script.js (ahora: ' + CONFIG.whatsappNumber + ').');
    }
    $$('[data-wa]').forEach(function (a) {
      a.href = waUrl(a.getAttribute('data-wa-msg'));
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    if (!waIsPlaceholder) {
      var pretty = waDigits;
      if (/^52\d{10}$/.test(waDigits)) pretty = '+52 ' + waDigits.slice(2, 5) + ' ' + waDigits.slice(5, 8) + ' ' + waDigits.slice(8);
      $$('[data-wa-display]').forEach(function (el) { el.textContent = pretty; });
    }
  }

  function initForm() {
    var form = $('#wa-form');
    if (!form) return;
    var submit = $('.form__submit', form);
    var status = $('#form-status');
    var fields = {
      nombre: $('#f-nombre'), tour: $('#f-tour'), fecha: $('#f-fecha'),
      adultos: $('#f-adultos'), menores: $('#f-menores'), msg: $('#f-msg')
    };

    // La fecha mínima es hoy (en hora local)
    var now = new Date();
    var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    fields.fecha.min = today;

    // Accesibilidad: cada campo apunta a su mensaje de error
    [['nombre', 'e-nombre'], ['tour', 'e-tour'], ['fecha', 'e-fecha'], ['adultos', 'e-adultos']].forEach(function (p) {
      fields[p[0]].setAttribute('aria-describedby', p[1]);
    });

    function setError(key, message) {
      var input = fields[key];
      var wrap = input.closest('.field');
      var out = $('#e-' + key);
      wrap.classList.toggle('has-error', !!message);
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (out) out.textContent = message || '';
    }

    function validate() {
      var first = null;
      function check(key, message) {
        setError(key, message);
        if (message && !first) first = fields[key];
      }
      check('nombre', fields.nombre.value.trim().length < 2 ? 'Escribe tu nombre para saber cómo llamarte.' : '');
      check('tour', !fields.tour.value ? 'Elige el tour que te interesa.' : '');
      check('fecha', fields.fecha.value && fields.fecha.value < today ? 'Elige una fecha de hoy en adelante.' : '');
      var adults = parseInt(fields.adultos.value, 10);
      check('adultos', !(adults >= 1) ? 'Debe viajar al menos 1 adulto.' : '');
      if (first) first.focus();
      return !first;
    }

    function buildMessage() {
      var lines = ['Hola TMG Tours, quiero cotizar un tour.', ''];
      lines.push('Nombre: ' + fields.nombre.value.trim());
      lines.push('Tour: ' + fields.tour.value);
      if (fields.fecha.value) {
        var p = fields.fecha.value.split('-');
        lines.push('Fecha aproximada: ' + p[2] + '/' + p[1] + '/' + p[0]);
      } else {
        lines.push('Fecha aproximada: por definir');
      }
      lines.push('Adultos: ' + (parseInt(fields.adultos.value, 10) || 1));
      lines.push('Menores: ' + (parseInt(fields.menores.value, 10) || 0));
      var extra = fields.msg.value.trim();
      if (extra) lines.push('Comentarios: ' + extra);
      return lines.join('\n');
    }

    ['nombre', 'tour', 'fecha', 'adultos'].forEach(function (k) {
      fields[k].addEventListener('input', function () { setError(k, ''); });
      fields[k].addEventListener('change', function () { setError(k, ''); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) {
        status.textContent = 'Revisa los campos marcados.';
        status.classList.add('is-error');
        return;
      }
      status.classList.remove('is-error');
      submit.classList.add('is-loading');
      status.textContent = 'Abriendo WhatsApp con tu mensaje listo...';
      openWhatsApp(buildMessage());

      setTimeout(function () {
        submit.classList.remove('is-loading');
        submit.classList.add('is-done');
        status.textContent = 'Listo. Si WhatsApp no se abrió, revisa que tu navegador permita ventanas emergentes.';
      }, 900);
      setTimeout(function () {
        submit.classList.remove('is-done');
        status.textContent = '';
      }, 7000);
    });

    // Contadores +/-
    $$('[data-stepper]', form).forEach(function (box) {
      var input = $('input', box);
      $$('button', box).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var step = parseInt(btn.getAttribute('data-step'), 10);
          var min = parseInt(input.min, 10); var max = parseInt(input.max, 10);
          var val = (parseInt(input.value, 10) || 0) + step;
          input.value = clamp(val, isNaN(min) ? 0 : min, isNaN(max) ? 99 : max);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    });
  }

  function initWaFloat() {
    var wrap = $('#wa-float');
    var bubble = $('#wa-bubble');
    var close = $('#wa-bubble-x');
    if (!wrap || !bubble) return;
    var dismissed = false;
    try { dismissed = sessionStorage.getItem('tmg-bubble') === '1'; } catch (e) { /* sin storage */ }

    function hide(persist) {
      wrap.classList.remove('show-bubble');
      if (persist) { try { sessionStorage.setItem('tmg-bubble', '1'); } catch (e) { /* sin storage */ } }
    }
    close.addEventListener('click', function () { hide(true); });
    if (dismissed) return;
    setTimeout(function () { wrap.classList.add('show-bubble'); }, 7000);
    setTimeout(function () { hide(false); }, 17000);
  }

  /* ===================================================================
     3. LOADER (progreso real + tiempo mínimo, salida tipo "iris")
  =================================================================== */
  var loaderDone = false;
  var onReadyCallbacks = [];

  function finishLoading() {
    if (loaderDone) return;
    loaderDone = true;
    var loader = $('#loader');
    html.classList.remove('is-loading');
    html.classList.add('is-ready');
    if (lenis) lenis.start();
    measureAll();
    onReadyCallbacks.forEach(function (fn) { safe('onReady', fn); });
    if (loader) {
      loader.classList.add('is-done');
      setTimeout(function () { loader.remove(); }, 1500);
    }
  }

  function initLoader() {
    var loader = $('#loader');
    if (!loader || reduce) {
      if (loader) loader.remove();
      setTimeout(finishLoading, 0);
      return;
    }
    var num = $('#loader-num');
    var started = performance.now();
    var total = 0; var settled = 0;
    var shown = 0;
    var closing = false;

    function track(promise) {
      total++;
      var done = function () { settled++; };
      promise.then(done, done);
    }
    function imgPromise(src) {
      return new Promise(function (res) { var im = new Image(); im.onload = im.onerror = res; im.src = src; });
    }
    if (document.fonts && document.fonts.ready) track(document.fonts.ready);
    track(new Promise(function (res) {
      if (document.readyState === 'complete') res(); else window.addEventListener('load', res, { once: true });
    }));
    ['assets/img/logo-256.webp', 'assets/img/poster-catamaran.webp', 'assets/img/poster-snorkel.webp'].forEach(function (s) { track(imgPromise(s)); });

    var last = started;
    function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var elapsed = now - started;
      var real = total ? settled / total : 1;
      var timeBased = clamp(elapsed / CONFIG.loaderMinMs, 0, 1);
      var target = Math.min(real, timeBased) * 100;
      if (elapsed > CONFIG.loaderMaxMs) target = 100;
      shown = damp(shown, target, 5, dt);
      if (target >= 100 && shown > 99.4) shown = 100;
      loader.style.setProperty('--lp', shown.toFixed(2));
      num.textContent = Math.round(shown);
      if (shown >= 100 && !closing) {
        closing = true;
        setTimeout(finishLoading, 420);
        return;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    setTimeout(finishLoading, CONFIG.loaderMaxMs + 1500); // red de seguridad
  }

  /* ===================================================================
     4. SCROLL: Lenis + bucle único
  =================================================================== */
  var scrubs = [];
  var parallaxItems = [];
  var frameHooks = [];
  var state = { y: 0, vy: 0, last: 0, docH: 1 };

  function initLenis() {
    if (reduce || !window.Lenis) return;
    try {
      lenis = new window.Lenis({
        duration: 1.25,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
        wheelMultiplier: 0.9,
        touchMultiplier: 1.3
      });
      if (!loaderDone) lenis.stop();
    } catch (err) { lenis = null; }
  }

  function scrollToY(y, immediate) {
    y = Math.max(0, Math.round(y));
    if (lenis) { lenis.scrollTo(y, { immediate: !!immediate, duration: 1.7, easing: easeInOutCubic, lock: false }); return; }
    window.scrollTo({ top: y, behavior: immediate || reduce ? 'auto' : 'smooth' });
  }

  function initAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.hasAttribute('data-wa')) return;
      var id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      var target = document.getElementById(id.slice(1));
      if (!target) return;
      e.preventDefault();
      closeMenu(true);
      scrollToY(id === '#inicio' ? 0 : absTop(target));
    });
  }

  function measureAll() {
    viewport.w = window.innerWidth;
    viewport.h = window.innerHeight;
    scrubs.forEach(function (s) { if (s.measure) s.measure(); });
    parallaxItems.forEach(function (p) {
      p.top = absTop(p.el.parentElement || p.el);
      p.h = (p.el.parentElement || p.el).offsetHeight;
    });
    state.docH = Math.max(1, document.documentElement.scrollHeight - viewport.h);
  }

  var measureTimer = null;
  function queueMeasure(delay) {
    clearTimeout(measureTimer);
    measureTimer = setTimeout(measureAll, delay || 150);
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - state.last) / 1000 || 0.016);
    state.last = now;
    if (lenis) lenis.raf(now);
    var y = scrollY();
    state.vy = damp(state.vy, (y - state.y) / Math.max(dt, 0.001), 7, dt);
    state.y = y;

    // Barra de progreso y header
    if (frame.bar) frame.bar.style.transform = 'scaleX(' + clamp(y / state.docH, 0, 1).toFixed(4) + ')';
    if (frame.header) frame.header.classList.toggle('is-scrolled', y > 24);

    for (var i = 0; i < scrubs.length; i++) scrubs[i].tick(y, dt);
    for (var j = 0; j < parallaxItems.length; j++) parallaxTick(parallaxItems[j], y);
    for (var k = 0; k < frameHooks.length; k++) frameHooks[k](now, dt, y);

    requestAnimationFrame(frame);
  }

  function parallaxTick(p, y) {
    var vh = viewport.h;
    if (y + vh < p.top - 200 || y > p.top + p.h + 200) return;
    var center = p.top + p.h / 2 - y - vh / 2;
    p.el.style.transform = 'translate3d(0,' + (-center * p.factor).toFixed(1) + 'px,0) scale(1.14)';
  }

  function startScroll() {
    initLenis();
    initAnchors();
    frame.bar = $('.progress__bar');
    frame.header = $('#header');
    state.y = scrollY();
    requestAnimationFrame(function (t) { state.last = t; requestAnimationFrame(frame); });
    window.addEventListener('resize', function () { queueMeasure(200); });
    if (window.ResizeObserver) {
      var lastH = document.body.scrollHeight;
      new ResizeObserver(function () {
        var h = document.body.scrollHeight;
        if (Math.abs(h - lastH) > 2) { lastH = h; queueMeasure(250); }
      }).observe(document.body);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { queueMeasure(50); });
    window.addEventListener('load', function () { queueMeasure(100); });
    if (mqDesktop.addEventListener) mqDesktop.addEventListener('change', function () { queueMeasure(50); });
  }

  /* ===================================================================
     5. ESCENAS LIGADAS AL SCROLL
  =================================================================== */
  function makeScrub(el, apply, opts) {
    opts = opts || {};
    var s = { el: el, top: 0, h: 0, cur: -1, last: -1, enabled: true, apply: apply, opts: opts };
    s.measure = function () {
      if (opts.beforeMeasure) opts.beforeMeasure(s);
      s.top = absTop(el);
      s.h = el.offsetHeight;
      s.cur = -1; s.last = -1; // fuerza reaplicar
      if (opts.afterMeasure) opts.afterMeasure(s);
    };
    s.raw = function (y) {
      if (opts.raw) return opts.raw(s, y);
      var range = Math.max(1, s.h - viewport.h);
      return (y - s.top) / range;
    };
    s.tick = function (y, dt) {
      if (!s.enabled) return;
      var target = clamp(s.raw(y), 0, 1);
      if (s.cur < 0) s.cur = target;
      var lambda = lenis ? 22 : 9;
      s.cur = damp(s.cur, target, lambda, dt || 0.016);
      if (Math.abs(s.cur - target) < 0.0006) s.cur = target;
      if (s.cur !== s.last) { s.last = s.cur; s.apply(s, s.cur); }
    };
    scrubs.push(s);
    return s;
  }

  function splitWords(el, wordClass, innerClass) {
    var index = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.textContent.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            var outer = document.createElement('span');
            outer.className = wordClass;
            outer.style.setProperty('--i', index++);
            if (innerClass) {
              var inner = document.createElement('span');
              inner.className = innerClass;
              inner.textContent = part;
              outer.appendChild(inner);
            } else {
              outer.textContent = part;
            }
            frag.appendChild(outer);
          });
          child.parentNode.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    })(el);
    return index;
  }

  function initManifesto() {
    var section = $('[data-scrub="manifesto"]');
    if (!section) return;
    var text = $('[data-words]', section);
    var n = splitWords(text, 'w');
    text.style.setProperty('--n', n);
    if (reduce) return;
    makeScrub(section, function (s, p) { section.style.setProperty('--p', p.toFixed(4)); });
  }

  function initScene() {
    var section = $('[data-scrub="scene"]');
    if (!section || reduce) return;
    makeScrub(section, function (s, p) {
      var pe = easeInOutCubic(clamp(p / 0.58, 0, 1));
      var pc = easeOutCubic(clamp((p - 0.5) / 0.32, 0, 1));
      section.style.setProperty('--pe', pe.toFixed(4));
      section.style.setProperty('--pc', pc.toFixed(4));
    });
  }

  function initZoom() {
    var section = $('[data-scrub="zoom"]');
    if (!section || reduce) return;
    makeScrub(section, function (s, p) {
      var pz = easeInOutSine(clamp(p / 0.8, 0, 1));
      var pc = clamp((p - 0.78) / 0.17, 0, 1);
      section.style.setProperty('--pz', pz.toFixed(4));
      section.style.setProperty('--pc', pc.toFixed(4));
      section.classList.toggle('is-end', pc > 0.55);
    });
    // Foco por teclado: si el CTA recibe foco antes de aparecer, llevamos la página al final de la escena
    var link = $('.zoom__end a', section);
    if (link) link.addEventListener('focus', function () {
      if (section.classList.contains('is-end')) return;
      scrollToY(absTop(section) + (section.offsetHeight - viewport.h) * 0.97, true);
    });
  }

  function initTours() {
    var section = $('[data-hscroll]');
    if (!section) return;
    var pin = $('.tours__pin', section);
    var track = $('.tours__track', section);
    var cards = $$('.tour', section);
    var info = { distance: 0, cards: [] };

    function enabled() { return mqDesktop.matches && !reduce; }

    var s = makeScrub(section, function (sc, p) {
      if (!enabled()) return;
      section.style.setProperty('--p', p.toFixed(4));
      var tx = p * info.distance;
      section.style.setProperty('--tx', tx.toFixed(1));
      for (var i = 0; i < info.cards.length; i++) {
        var c = info.cards[i];
        var cx = c.left + c.w / 2 - tx;
        var rel = clamp((cx - viewport.w / 2) / viewport.w, -1, 1);
        c.el.style.setProperty('--ix', (rel * -6).toFixed(2) + '%');
      }
    }, {
      beforeMeasure: function (sc) {
        if (!enabled()) {
          section.style.removeProperty('--th');
          section.style.removeProperty('--tx');
          sc.enabled = false;
          return;
        }
        sc.enabled = true;
        section.style.removeProperty('--th');
        info.distance = Math.max(0, track.scrollWidth - viewport.w);
        section.style.setProperty('--th', Math.round(info.distance + viewport.h) + 'px');
      },
      afterMeasure: function () {
        if (!enabled()) return;
        var trackLeft = track.getBoundingClientRect().left;
        info.cards = cards.map(function (el) {
          var r = el.getBoundingClientRect();
          return { el: el, left: r.left - trackLeft, w: r.width };
        });
      }
    });

    // Foco por teclado dentro del carril: movemos la página, no el overflow oculto
    section.addEventListener('focusin', function (e) {
      if (!enabled()) return;
      pin.scrollLeft = 0;
      var card = e.target.closest && e.target.closest('.tour');
      if (!card) return;
      var item = info.cards.filter(function (c) { return c.el === card; })[0];
      if (!item) return;
      var wantedTx = clamp(item.left + item.w / 2 - viewport.w / 2, 0, info.distance);
      var p = info.distance ? wantedTx / info.distance : 0;
      scrollToY(s.top + p * Math.max(1, s.h - viewport.h), true);
    });
    pin.addEventListener('scroll', function () { pin.scrollLeft = 0; }, { passive: true });
  }

  function initRoute() {
    var timeline = $('[data-scrub="route"]');
    if (!timeline) return;
    var line = $('.route__line', timeline);
    var steps = $$('.step', timeline);
    if (reduce) { steps.forEach(function (st) { st.classList.add('is-active'); }); return; }

    makeScrub(timeline, function (s, p) {
      timeline.style.setProperty('--p', p.toFixed(4));
      var markerY = line.offsetTop + p * line.offsetHeight;
      for (var i = 0; i < steps.length; i++) {
        var on = markerY >= steps[i].offsetTop + 12;
        if (steps[i].classList.contains('is-active') !== on) steps[i].classList.toggle('is-active', on);
      }
    }, {
      raw: function (s, y) { return (y + viewport.h * 0.62 - s.top - 24) / Math.max(1, s.h - 24); },
      afterMeasure: function () { timeline.style.setProperty('--lh', line.offsetHeight); }
    });
  }

  function initParallax() {
    if (reduce) return;
    $$('[data-parallax]').forEach(function (el) {
      parallaxItems.push({ el: el, factor: parseFloat(el.getAttribute('data-parallax')) || 0.1, top: 0, h: 0 });
    });
  }

  /* ---------- Marquee (velocidad ligada al scroll) ---------- */
  function initMarquee() {
    var root = $('[data-marquee]');
    if (!root || reduce) return;
    var track = $('.marquee__track', root);
    var group = $('.marquee__group', root);
    var copies = 1;
    function fill() {
      var gw = group.getBoundingClientRect().width || 1;
      var need = Math.ceil(window.innerWidth / gw) + 1;
      while (copies < need) { track.appendChild(group.cloneNode(true)); copies++; }
      return gw;
    }
    var gw = fill();
    var x = 0; var skew = 0; var visible = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { gw = fill(); });
    window.addEventListener('resize', function () { gw = fill(); });
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(root);

    frameHooks.push(function (now, dt) {
      if (!visible) return;
      var speed = 70 + clamp(state.vy, -2500, 2500) * 0.16;
      x -= speed * dt;
      if (x <= -gw) x += gw;
      if (x > 0) x -= gw;
      skew = damp(skew, clamp(-state.vy * 0.0016, -7, 7), 6, dt);
      track.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0) skewX(' + skew.toFixed(2) + 'deg)';
    });
  }

  /* ===================================================================
     6. HERO
  =================================================================== */
  function initRotator() {
    var items = $$('.rot__item');
    if (items.length < 2 || reduce) return;
    var idx = 0; var timer = null; var visible = true;
    function next() {
      if (!visible || document.hidden) return;
      var cur = items[idx];
      idx = (idx + 1) % items.length;
      var nxt = items[idx];
      cur.classList.remove('is-on'); cur.classList.add('is-off');
      nxt.classList.remove('is-off'); nxt.classList.add('is-on');
      setTimeout(function () { cur.classList.remove('is-off'); }, 1000);
    }
    onReadyCallbacks.push(function () { timer = setInterval(next, 2800); });
    var hero = $('.hero');
    if (hero && window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(hero);
  }

  /* Partículas: destellos de sol sobre el agua + brasas del atardecer */
  function initSparkles() {
    var canvas = $('#sparkles');
    if (!canvas || reduce) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var hero = canvas.closest('.hero');
    var W = 0; var H = 0; var dpr = 1;
    var parts = [];
    var pointer = { x: -9999, y: -9999, on: false };
    var visible = true;

    function makeSprite(draw) {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      draw(c.getContext('2d')); return c;
    }
    function glow(rgb) {
      return makeSprite(function (g) {
        var r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        r.addColorStop(0, 'rgba(' + rgb + ',1)'); r.addColorStop(0.25, 'rgba(' + rgb + ',0.55)'); r.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      });
    }
    function star(rgb) {
      return makeSprite(function (g) {
        var r = g.createRadialGradient(32, 32, 0, 32, 32, 10);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        var h = g.createLinearGradient(0, 32, 64, 32);
        h.addColorStop(0, 'rgba(' + rgb + ',0)'); h.addColorStop(0.5, 'rgba(255,255,255,0.95)'); h.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = h; g.fillRect(0, 31, 64, 2);
        var v = g.createLinearGradient(32, 0, 32, 64);
        v.addColorStop(0, 'rgba(' + rgb + ',0)'); v.addColorStop(0.5, 'rgba(255,255,255,0.95)'); v.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = v; g.fillRect(31, 0, 2, 64);
      });
    }
    var sprites = [glow('170,230,255'), glow('255,190,90'), star('140,215,255'), star('255,205,120')];

    function spawn(p, fresh) {
      var kind = Math.random();
      p.sprite = kind < 0.4 ? 0 : kind < 0.7 ? 1 : kind < 0.88 ? 2 : 3;
      p.x = Math.random() * W;
      p.y = fresh ? Math.random() * H : H + 20;
      p.size = (p.sprite > 1 ? 14 + Math.random() * 20 : 6 + Math.random() * 16) * (dpr > 1.5 ? 1.2 : 1);
      p.vx = (Math.random() - 0.5) * 10;
      p.vy = -(6 + Math.random() * 22) * (p.sprite === 1 ? 1.5 : 1);
      p.phase = Math.random() * 6.28;
      p.tw = 0.8 + Math.random() * 2.2;
      p.base = 0.25 + Math.random() * 0.6;
      return p;
    }
    function resize() {
      var r = hero.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      var count = Math.round(clamp(W * H / 13000, 30, 120));
      parts.length = 0;
      for (var i = 0; i < count; i++) parts.push(spawn({}, true));
    }
    resize();
    window.addEventListener('resize', function () { setTimeout(resize, 120); });
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(hero);

    if (finePointer) {
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.on = true;
      });
      hero.addEventListener('pointerleave', function () { pointer.on = false; pointer.x = pointer.y = -9999; });
    }

    var t = 0;
    frameHooks.push(function (now, dt) {
      if (!visible || document.hidden) return;
      t += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += (p.vx + Math.sin(t * 0.5 + p.phase) * 6) * dt;
        p.y += p.vy * dt;
        var boost = 0;
        if (pointer.on) {
          var dx = p.x - pointer.x; var dy = p.y - pointer.y; var d2 = dx * dx + dy * dy;
          if (d2 < 22000) {
            var d = Math.sqrt(d2) || 1; var f = (1 - d / 148);
            p.x += (dx / d) * f * 60 * dt; p.y += (dy / d) * f * 60 * dt;
            boost = f * 0.6;
          }
        }
        if (p.y < -30 || p.x < -30 || p.x > W + 30) spawn(p, false);
        var a = clamp(p.base * (0.55 + 0.45 * Math.sin(t * p.tw + p.phase)) + boost, 0, 1);
        // aparecen suavemente cerca del borde inferior
        a *= clamp((H - p.y) / 60, 0, 1) * clamp(p.y / 80, 0, 1);
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        var s = p.size * (1 + boost);
        ctx.drawImage(sprites[p.sprite], p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    });
  }

  /* Tilt 3D de los teléfonos + salida del hero con el scroll */
  function initHeroMotion() {
    // Al terminar la animación de entrada se libera el elemento para poder aplicar parallax inline
    $$('.hero [data-hero]').forEach(function (el) {
      el.addEventListener('animationend', function (e) { if (e.target === el) el.classList.add('is-shown'); });
    });
    var stage = $('[data-tilt]');
    var hero = $('.hero');
    var copy = $('.hero__copy');
    if (!stage || !hero || reduce) return;
    var tx = 0; var ty = 0; var cx = 0; var cy = 0;

    if (finePointer) {
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5);
        ty = ((e.clientY - r.top) / r.height - 0.5);
      });
      hero.addEventListener('pointerleave', function () { tx = 0; ty = 0; });
    }
    frameHooks.push(function (now, dt, y) {
      if (y > viewport.h * 1.1) return;
      cx = damp(cx, tx, 4, dt); cy = damp(cy, ty, 4, dt);
      stage.style.setProperty('--ry', (cx * 12).toFixed(2) + 'deg');
      stage.style.setProperty('--rx', (-cy * 9).toFixed(2) + 'deg');
      var out = clamp(y / (viewport.h * 0.85), 0, 1);
      copy.style.transform = 'translate3d(0,' + (y * 0.16).toFixed(1) + 'px,0)';
      copy.style.opacity = (1 - out * 0.9).toFixed(3);
      stage.style.translate = '0 ' + (y * 0.1).toFixed(1) + 'px';
    });
  }

  /* ===================================================================
     7. UI
  =================================================================== */
  var menu, burger;
  function openMenu() {
    menu.classList.add('is-open'); menu.inert = false;
    burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Cerrar menú');
    html.style.overflow = 'hidden'; if (lenis) lenis.stop();
  }
  function closeMenu(silent) {
    if (!menu || !menu.classList.contains('is-open')) return;
    menu.classList.remove('is-open'); menu.inert = true;
    burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menú');
    html.style.overflow = ''; if (lenis && loaderDone) lenis.start();
    if (!silent) burger.focus();
  }
  function initMenu() {
    menu = $('#menu'); burger = $('#burger');
    if (!menu || !burger) return;
    menu.inert = true;
    burger.addEventListener('click', function () { menu.classList.contains('is-open') ? closeMenu() : openMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { if (a.hasAttribute('data-wa')) closeMenu(true); }); });
    if (mqDesktop.addEventListener) mqDesktop.addEventListener('change', function (e) { if (e.matches) closeMenu(true); });
  }

  function initNavSpy() {
    if (!window.IntersectionObserver) return;
    var links = {};
    $$('.nav__list a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle('is-active', k === e.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(links).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  function initPauseOffscreen() {
    if (reduce || !window.IntersectionObserver) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('is-paused', !e.isIntersecting); });
    }, { rootMargin: '120px 0px' });
    $$('[data-pause-offscreen]').forEach(function (el) { io.observe(el); });
  }

  function initReveal() {
    var targets = $$('[data-reveal], [data-reveal-group], [data-split]');
    $$('[data-delay]').forEach(function (el) { el.style.setProperty('--d', el.getAttribute('data-delay')); });
    $$('[data-reveal-group]').forEach(function (g) {
      Array.prototype.forEach.call(g.children, function (c, i) { c.style.setProperty('--i', i); });
    });
    $$('[data-split]').forEach(function (el) { splitWords(el, 'sp', 'sp__i'); });
    if (reduce || !window.IntersectionObserver) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }

  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length) return;
    function run(el) {
      var to = parseInt(el.getAttribute('data-count'), 10);
      if (reduce) { el.textContent = to; return; }
      var start = performance.now(); var dur = 1600;
      (function step(now) {
        var t = clamp((now - start) / dur, 0, 1);
        el.textContent = Math.round(to * easeOutExpo(t));
        if (t < 1) requestAnimationFrame(step);
      })(start);
    }
    if (!window.IntersectionObserver || reduce) return;
    els.forEach(function (el) { el.textContent = '0'; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  function initAccordion() {
    var root = $('[data-accordion]');
    if (!root) return;
    var items = $$('.qa', root);
    items.forEach(function (item) {
      var btn = $('.qa__q', item);
      btn.addEventListener('click', function () {
        var open = !item.classList.contains('is-open');
        items.forEach(function (it) {
          var on = it === item ? open : false;
          it.classList.toggle('is-open', on);
          $('.qa__q', it).setAttribute('aria-expanded', on ? 'true' : 'false');
        });
      });
    });
    // El primero abierto por defecto
    if (items[0]) { items[0].classList.add('is-open'); $('.qa__q', items[0]).setAttribute('aria-expanded', 'true'); }
  }

  function initVideos() {
    var vids = $$('video[data-video]');
    if (!vids.length) return;
    function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () { /* autoplay bloqueado */ }); }
    var io = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { if (!reduce && !v.dataset.userPaused) play(v); } else { v.pause(); }
      });
    }, { threshold: 0.25 }) : null;
    vids.forEach(function (v) { if (io) io.observe(v); else if (!reduce) play(v); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) vids.forEach(function (v) { v.pause(); }); });

    // Controles del video destacado
    var feature = $('#cata-video');
    if (!feature) return;
    var playBtn = $('[data-video-play]'); var muteBtn = $('[data-video-mute]');
    function syncPlay() {
      var playing = !feature.paused;
      playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      playBtn.setAttribute('aria-label', playing ? 'Pausar video' : 'Reproducir video');
    }
    function syncMute() {
      var sound = !feature.muted;
      muteBtn.setAttribute('aria-pressed', sound ? 'true' : 'false');
      muteBtn.setAttribute('aria-label', sound ? 'Silenciar video' : 'Activar sonido');
    }
    feature.addEventListener('play', syncPlay); feature.addEventListener('pause', syncPlay);
    playBtn.addEventListener('click', function () {
      if (feature.paused) { delete feature.dataset.userPaused; play(feature); } else { feature.dataset.userPaused = '1'; feature.pause(); }
    });
    muteBtn.addEventListener('click', function () {
      feature.muted = !feature.muted; syncMute();
      if (!feature.muted && feature.paused) { delete feature.dataset.userPaused; play(feature); }
    });
    syncPlay(); syncMute();
  }

  function initPointerEffects() {
    if (!finePointer || reduce) return;
    // Spotlight en las tarjetas del bento
    $$('[data-spot]').forEach(function (cell) {
      cell.addEventListener('pointermove', function (e) {
        var r = cell.getBoundingClientRect();
        cell.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        cell.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
    // Botones magnéticos
    $$('[data-magnetic]').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.translate = (dx * 14).toFixed(1) + 'px ' + (dy * 10).toFixed(1) + 'px';
      });
      btn.addEventListener('pointerleave', function () { btn.style.translate = ''; });
    });
  }

  /* ===================================================================
     ARRANQUE
  =================================================================== */
  function boot() {
    if (window.__tmgBoot) { clearTimeout(window.__tmgBoot); window.__tmgBoot = null; }
    if ('scrollRestoration' in history && !location.hash) history.scrollRestoration = 'manual';
    if (!location.hash) window.scrollTo(0, 0);

    var year = $('#year'); if (year) year.textContent = new Date().getFullYear();

    safe('whatsapp', initWhatsAppLinks);
    safe('form', initForm);
    safe('waFloat', initWaFloat);
    safe('menu', initMenu);

    safe('manifesto', initManifesto);
    safe('scene', initScene);
    safe('tours', initTours);
    safe('zoom', initZoom);
    safe('route', initRoute);
    safe('parallax', initParallax);
    safe('marquee', initMarquee);
    safe('rotator', initRotator);
    safe('sparkles', initSparkles);
    safe('heroMotion', initHeroMotion);
    safe('pauseOffscreen', initPauseOffscreen);
    safe('reveal', initReveal);
    safe('counters', initCounters);
    safe('accordion', initAccordion);
    safe('videos', initVideos);
    safe('navSpy', initNavSpy);
    safe('pointer', initPointerEffects);
    safe('scroll', startScroll);

    measureAll();
    initLoader();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
