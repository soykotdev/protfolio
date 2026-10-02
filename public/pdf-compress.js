// Browser-side PDF compression for the admin panel.
//
// Each page is rendered once at the target DPI, then re-encoded as JPEG into a
// new PDF with the original page size. If the result is still over the size
// target, only the JPEG quality steps down: resolution never drops below the
// requested DPI. Text in the output is no longer selectable, which is fine for
// scanned certificates, the files this is for.
//
//   const r = await compressPdf(file, { maxBytes: 2 * 1024 * 1024, dpi: 200 });
//   r.blob, r.dpi, r.quality, r.pages, r.before, r.after, r.overTarget
(() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];
  // browsers refuse canvases much past this; only matters for oversized pages
  const MAX_SIDE = 12000, MAX_AREA = 100e6;

  const loadScript = (src) => new Promise((ok, fail) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });

  let libs;
  const loadLibs = () => (libs ||= Promise.all([loadScript(PDFJS), loadScript(PDFLIB)]).then(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
  }));

  const toJpeg = (canvas, q) => new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', q));

  async function compressPdf(file, { maxBytes = 2 * 1024 * 1024, dpi = 200, onProgress } = {}) {
    await loadLibs();
    const src = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

    // 1. rasterise every page once
    const pages = [];
    let usedDpi = dpi;
    for (let n = 1; n <= src.numPages; n++) {
      onProgress?.(`Rendering page ${n} of ${src.numPages} at ${dpi} DPI…`);
      const page = await src.getPage(n);
      const pt = page.getViewport({ scale: 1 });           // size in points (1/72 in)
      let scale = dpi / 72;
      const w0 = pt.width * scale, h0 = pt.height * scale;
      const shrink = Math.min(1, MAX_SIDE / Math.max(w0, h0), Math.sqrt(MAX_AREA / (w0 * h0)));
      if (shrink < 1) { scale *= shrink; usedDpi = Math.min(usedDpi, Math.floor(scale * 72)); }

      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';                               // JPEG has no alpha: transparent would turn black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      pages.push({ canvas, w: pt.width, h: pt.height });
      page.cleanup();
    }
    await src.destroy();

    // 2. re-encode, stepping quality down until it fits
    let best;
    for (const q of QUALITIES) {
      onProgress?.(`Compressing (JPEG quality ${Math.round(q * 100)})…`);
      const out = await window.PDFLib.PDFDocument.create();
      for (const p of pages) {
        const img = await out.embedJpg(await (await toJpeg(p.canvas, q)).arrayBuffer());
        out.addPage([p.w, p.h]).drawImage(img, { x: 0, y: 0, width: p.w, height: p.h });
      }
      const bytes = await out.save();
      best = { bytes, q };
      if (bytes.length <= maxBytes) break;
    }

    pages.forEach((p) => { p.canvas.width = p.canvas.height = 0; }); // release canvas memory
    return {
      blob: new Blob([best.bytes], { type: 'application/pdf' }),
      dpi: usedDpi,
      quality: best.q,
      pages: pages.length,
      before: file.size,
      after: best.bytes.length,
      overTarget: best.bytes.length > maxBytes,
    };
  }

  window.compressPdf = compressPdf;
})();
