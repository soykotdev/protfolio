// nav, cinematic hero motion, 3D terrain mesh, pointer tilt
(() => {
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- theme: follows the visitor's system unless they pick one ---
  // The head script already stamped data-pref and data-theme before paint;
  // this keeps them in sync on clicks and on OS-level changes.
  const sysLight = matchMedia('(prefers-color-scheme: light)');
  const switchBtns = [...document.querySelectorAll('.theme-switch [data-pref]')];
  const resolveTheme = () => {
    const pref = root.dataset.pref || 'system';
    const light = pref === 'light' || (pref === 'system' && sysLight.matches);
    const was = root.dataset.theme;
    root.dataset.theme = light ? 'light' : 'dark';
    switchBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.pref === pref)));
    if (was !== root.dataset.theme) dispatchEvent(new Event('themechange'));
  };
  switchBtns.forEach((b) => b.addEventListener('click', () => {
    root.dataset.pref = b.dataset.pref;
    try {
      if (b.dataset.pref === 'system') localStorage.removeItem('nt-theme');
      else localStorage.setItem('nt-theme', b.dataset.pref);
    } catch {}
    resolveTheme();
  }));
  sysLight.addEventListener('change', () => { if ((root.dataset.pref || 'system') === 'system') resolveTheme(); });
  resolveTheme();

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

  // --- background: interactive 3D heightfield ---------------------------
  // Hand-projected, no library. The vertex buffers are allocated once and
  // rewritten in place: the previous version built ~1400 objects per frame,
  // which is what made it stutter.
  const cv = $('terrain');
  if (!cv) return;
  const ctx = cv.getContext('2d', { alpha: true });

  const COLS = 40, ROWS = 26, N = COLS * ROWS;
  const SX = new Float32Array(N), SY = new Float32Array(N), HT = new Float32Array(N);
  const CAM_H = 0.5;

  let w = 0, h = 0;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // pointer target vs. eased actual - easing is what makes it feel smooth
  let tx = 0, ty = 0, ax = 0, ay = 0, tScroll = 0, aScroll = 0;
  if (fine) {
    addEventListener('pointermove', (e) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
    }, { passive: true });
  }

  const css = (n, fb) => getComputedStyle(root).getPropertyValue(n).trim() || fb;
  let hot = '#ff3b5c', mag = '#c9256f';
  const readColours = () => { hot = css('--hot', hot); mag = css('--mag', mag); };
  readColours();
  addEventListener('themechange', () => { readColours(); if (still) draw(0); });

  const draw = (ms) => {
    const t = ms * 0.00028;

    // ease toward the targets, then derive the camera from them
    ax += (tx - ax) * 0.045;
    ay += (ty - ay) * 0.045;
    tScroll = Math.min(scrollY / Math.max(innerHeight, 1), 2);
    aScroll += (tScroll - aScroll) * 0.06;

    const yaw = ax * 0.55;                    // sideways drift
    const horizon = h * (0.26 + ay * 0.05 + aScroll * 0.07);
    const travel = t * 0.45 + aScroll * 0.8;  // flying forward
    const focal = w * 0.32;

    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;

    for (let j2 = 0; j2 < ROWS; j2++) {
      const v = j2 / (ROWS - 1);
      const z = 0.5 * Math.pow(14, v);   // geometric: even spacing on screen
      const f = focal / z;
      const row = j2 * COLS;
      for (let i2 = 0; i2 < COLS; i2++) {
        const u = (i2 / (COLS - 1) - 0.5) * 3.6;
        const wz = z + travel;
        // layered sines standing in for fractal terrain
        let y =
          Math.sin(u * 2.0 + wz * 0.9) * Math.cos(wz * 1.5 - t * 0.6) * 0.55 +
          Math.sin(u * 4.1 - wz * 1.2) * 0.2 +
          Math.cos(wz * 2.6 + u * 0.7) * 0.16;

        // a soft swell under the cursor
        const du = u - ax * 3.0, dv = v - (ay + 0.5);
        y += 0.9 * Math.exp(-(du * du * 1.6 + dv * dv * 9.0));

        y *= 0.26;
        const k = row + i2;
        HT[k] = y;
        SX[k] = w / 2 + (u + yaw) * f;
        SY[k] = horizon + (CAM_H - y) * f;
      }
    }

    // depth lines, near rows brightest
    for (let j2 = 0; j2 < ROWS; j2++) {
      const row = j2 * COLS;
      ctx.beginPath();
      ctx.moveTo(SX[row], SY[row]);
      for (let i2 = 1; i2 < COLS; i2++) ctx.lineTo(SX[row + i2], SY[row + i2]);
      ctx.strokeStyle = hot;
      ctx.globalAlpha = 0.09 + (1 - j2 / ROWS) * 0.34;
      ctx.stroke();
    }

    // sparser cross lines
    ctx.strokeStyle = mag;
    ctx.globalAlpha = 0.13;
    for (let i2 = 0; i2 < COLS; i2 += 2) {
      ctx.beginPath();
      ctx.moveTo(SX[i2], SY[i2]);
      for (let j2 = 1; j2 < ROWS; j2++) ctx.lineTo(SX[j2 * COLS + i2], SY[j2 * COLS + i2]);
      ctx.stroke();
    }

    // nodes riding the peaks
    for (let j2 = 2; j2 < ROWS; j2 += 3) {
      const d = 1 - j2 / ROWS;
      for (let i2 = 2; i2 < COLS; i2 += 4) {
        const k = j2 * COLS + i2, y = HT[k];
        if (y < 0.05) continue;
        ctx.beginPath();
        ctx.arc(SX[k], SY[k], 1.4 + y * 5, 0, 6.283);
        ctx.fillStyle = y > 0.11 ? mag : hot;
        ctx.globalAlpha = (0.35 + y * 2.0) * d;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  let raf = 0;
  const loop = (ts) => { draw(ts); raf = requestAnimationFrame(loop); };
  const start = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  addEventListener('resize', () => { resize(); if (still) draw(0); }, { passive: true });
  // don't burn frames on a hidden tab
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : still || start()));

  resize();
  still ? draw(0) : start();
})();
