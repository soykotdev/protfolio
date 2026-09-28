// nav, cinematic hero motion, 3D terrain mesh, pointer tilt
(() => {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- mobile drawer ---
  const drawer = $('drawer'), burger = $('burger');
  const setOpen = (v) => {
    drawer.dataset.open = v ? '1' : '0';
    burger.setAttribute('aria-expanded', String(v));
    burger.textContent = v ? '✕' : '☰';
  };
  burger.onclick = () => setOpen(drawer.dataset.open !== '1');
  drawer.addEventListener('click', (e) => { if (e.target.tagName === 'A') setOpen(false); });

  // --- scroll: progress bar, nav backdrop, hero parallax ---
  const links = [...document.querySelectorAll('#navlinks a')];
  const prog = $('prog'), nav = document.querySelector('.nav'), portrait = document.querySelector('.hero-portrait');
  addEventListener('scroll', () => {
    const max = document.body.scrollHeight - innerHeight;
    prog.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + '%';
    nav.dataset.stuck = scrollY > 40 ? '1' : '0';
    if (portrait && !still && scrollY < innerHeight) {
      portrait.style.translate = `0 ${scrollY * 0.12}px`;
    }
  }, { passive: true });

  // active link + the pill that slides behind it
  const pill = document.getElementById('pill');
  const movePill = (a) => {
    if (!pill) return;
    if (!a) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.width = a.offsetWidth + 'px';
    pill.style.transform = `translateX(${a.offsetLeft}px)`;
    // keep the active link visible when the track is scrolled
    const track = a.parentElement;
    if (track.scrollWidth > track.clientWidth) {
      const target = a.offsetLeft - (track.clientWidth - a.offsetWidth) / 2;
      track.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
  };

  const byId = Object.fromEntries(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.remove('on'));
      const a = byId[e.target.id];
      if (a) { a.classList.add('on'); movePill(a); }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('section[id]').forEach((s) => io.observe(s));
  addEventListener('resize', () => movePill(links.find((a) => a.classList.contains('on'))));

  const fine = matchMedia('(pointer: fine)').matches;

  // --- pointer tilt: cards lean toward the cursor ---
  // ponytail: CSS 3D transforms, no library. Fine pointers only — a tilt that
  // needs hover is noise on touch, and transform on :hover never resets there.
  if (!still && fine) {
    document.querySelectorAll('.grid > .card, .certs > .cert, .maps > .map, .gal figure').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        // A running scroll-driven animation outranks inline styles in the
        // cascade, so the entrance has to be switched off while tilting.
        el.style.animation = 'none';
        el.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateZ(12px)`;
        el.style.setProperty('--mx', (x + 0.5) * 100 + '%');
        el.style.setProperty('--my', (y + 0.5) * 100 + '%');
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = '';
        el.style.animation = '';
      });
    });

    // hero portrait drifts against the cursor — the "camera" breathing
    const hero = document.querySelector('.hero');
    if (hero && portrait) {
      hero.addEventListener('pointermove', (e) => {
        const x = e.clientX / innerWidth - 0.5;
        const y = e.clientY / innerHeight - 0.5;
        portrait.style.scale = '1.03';
        portrait.style.rotate = `${x * 1.2}deg`;
        portrait.style.transformOrigin = 'bottom right';
        portrait.style.marginRight = `${-x * 18}px`;
        portrait.style.marginBottom = `${y * 10}px`;
      });
      hero.addEventListener('pointerleave', () => {
        portrait.style.scale = '';
        portrait.style.rotate = '';
        portrait.style.marginRight = '';
        portrait.style.marginBottom = '';
      });
    }
  }

  // --- certificate lightbox: native <dialog>, so Esc / focus trap / backdrop are free ---
  const lb = document.getElementById('lightbox');
  if (lb) {
    const img = document.getElementById('lbImg'), cap = document.getElementById('lbCap');
    document.querySelectorAll('[data-full]').forEach((b) => {
      b.addEventListener('click', () => {
        img.src = b.dataset.full;
        img.alt = b.dataset.title || '';
        cap.textContent = b.dataset.title || '';
        lb.showModal();
      });
    });
    document.getElementById('lbClose').onclick = () => lb.close();
    // click the backdrop (i.e. outside the image) to dismiss
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    lb.addEventListener('close', () => { img.src = ''; });
  }

  // --- hero: 3D wireframe heightfield, perspective-projected by hand ---
  const cv = $('terrain');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const COLS = 46, ROWS = 30;
  let w, h, dpr;

  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const css = (n, fb) => getComputedStyle(root).getPropertyValue(n).trim() || fb;

  const elev = (u, v, t) =>
    Math.sin(u * 2.1 + t) * Math.cos(v * 1.7 - t * 0.7) * 0.6 +
    Math.sin(u * 4.3 - t * 1.3) * 0.22 +
    Math.cos(v * 3.1 + t * 0.9) * 0.18;

  // Camera sits CAM_H above the field looking along +z; classic 1/z divide.
  // Near rows land low and wide, far rows converge on the horizon line.
  const CAM_H = 0.5;
  let pitch = 0;   // nudged by scroll so the camera tilts as the hero leaves
  const project = (x, y, z) => {
    const f = (w * 0.3) / z;
    return { sx: w / 2 + x * f, sy: h * (0.06 + pitch) + (CAM_H - y) * f };
  };

  const draw = (ms) => {
    const t = ms * 0.00035;
    pitch = Math.min(scrollY / innerHeight, 1) * 0.22;
    ctx.clearRect(0, 0, w, h);
    const hot = css('--hot', '#ff3b5c');
    const mag = css('--mag', '#c9256f');

    const P = [];
    for (let j = 0; j < ROWS; j++) {
      const row = [];
      for (let i = 0; i < COLS; i++) {
        const u = (i / (COLS - 1) - 0.5) * 2.8;
        const v = j / (ROWS - 1);
        const z = 0.6 + v * 4.4;
        const y = elev(u, z, t) * 0.16;
        row.push({ ...project(u, y, z), h: y });
      }
      P.push(row);
    }

    const stroke = (pts, alpha, colour) => {
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
      ctx.strokeStyle = colour;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    for (let j = 0; j < ROWS; j++) {
      const d = 1 - j / ROWS;
      stroke(P[j], 0.04 + d * 0.26, hot);
    }
    for (let i = 0; i < COLS; i += 2) {
      stroke(P.map((r) => r[i]), 0.07, mag);
    }

    for (let j = 2; j < ROWS; j += 4) {
      for (let i = 2; i < COLS; i += 5) {
        const p = P[j][i];
        if (p.h < 0.05) continue;
        const d = 1 - j / ROWS;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 1.5 + p.h * 6, 0, 6.284);
        ctx.fillStyle = p.h > 0.1 ? mag : hot;
        ctx.globalAlpha = (0.3 + p.h * 2) * d;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  const loop = (t) => { draw(t); requestAnimationFrame(loop); };
  addEventListener('resize', () => { resize(); if (still) draw(0); });
  resize();
  still ? draw(0) : requestAnimationFrame(loop);
})();
