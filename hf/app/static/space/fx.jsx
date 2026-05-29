/* ============================================================
   fx.jsx — Cinematic Matrix effects
   - startMatrixRain: high-quality canvas digital rain
   - <Decode>: per-character scramble→resolve text reveal
   - <Glitch>: occasional RGB-split glitch wrapper
   Exports to window.
   ============================================================ */

/* ---------- Canvas digital rain ---------- */
const RAIN_GLYPHS =
  "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｦｲｸｺｿﾁﾄﾉｧｨｩｪｫｬｭｮ012345789Z:.\"=*+-<>¦｜╌";

function startMatrixRain(canvas) {
  const ctx = canvas.getContext("2d", { alpha: true });
  let width = 0, height = 0, columns = 0, drops = [], speeds = [], dpr = 1;
  const FONT = 16; // logical px per cell

  function opts() {
    return window.__rainOpts || { density: 1, speed: 1, on: true };
  }
  function colors() {
    return window.__rainColors || {
      head: "rgba(210, 255, 223, 0.95)",
      body: "rgba(0, 255, 102, 0.55)",
      glow: "rgba(0, 255, 102, 0.9)",
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.ceil(width / FONT);
    drops = new Array(columns).fill(0).map(() => Math.random() * -50);
    speeds = new Array(columns).fill(0).map(() => 0.06 + Math.random() * 0.16);
    ctx.font = `${FONT}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "top";
  }

  let lastGlyphTick = 0;
  let glyphCache = [];
  function glyphFor(i, row) {
    // mutate occasionally for shimmer
    const key = i * 997 + row;
    if (!glyphCache[key] || Math.random() < 0.012) {
      glyphCache[key] = RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0];
    }
    return glyphCache[key];
  }

  function frame() {
    const o = opts();
    if (!o.on) {
      ctx.clearRect(0, 0, width, height);
      requestAnimationFrame(frame);
      return;
    }

    // fade previous frame -> trailing tails
    ctx.fillStyle = "rgba(0, 4, 2, 0.085)";
    ctx.fillRect(0, 0, width, height);

    const dens = o.density;
    const spd = o.speed;

    for (let i = 0; i < columns; i++) {
      // density gating: skip some columns when density < 1
      if (dens < 1 && (i % 1000) / 1000 > dens && Math.random() > dens) {
        // still advance occasionally so it doesn't freeze
      }
      const x = i * FONT;
      const y = drops[i] * FONT;

      if (y > 0 && y < height) {
        const c = colors();
        const ch = glyphFor(i, Math.floor(drops[i]));
        // bright head
        ctx.fillStyle = c.head;
        ctx.shadowBlur = 0;
        ctx.fillText(ch, x, y);
        // second char (slightly dimmer green) just above for body
        ctx.shadowBlur = 0;
        ctx.fillStyle = c.body;
        ctx.fillText(glyphFor(i, Math.floor(drops[i]) - 1), x, y - FONT);
      }

      // advance
      const active = dens >= 1 || (i % 7) / 7 < dens || i % 2 === 0;
      if (active) {
        drops[i] += speeds[i] * spd;
        if (y > height && Math.random() > 0.975) {
          drops[i] = Math.random() * -30;
          speeds[i] = 0.06 + Math.random() * 0.16;
        }
      }
    }
    requestAnimationFrame(frame);
  }

  resize();
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(resize, 150);
  });
  requestAnimationFrame(frame);
}

/* ---------- <Decode> text reveal ---------- */
const SCRAMBLE = "ｱｲｳｴｵｶｷｸ01<>/\\=+*ﾊﾐﾋ█▓▒░";

function Decode({ text, className = "", style = {}, duration = 720, delay = 0, as = "span", play = true }) {
  const [display, setDisplay] = React.useState(play ? "" : text);
  const frame = React.useRef(0);
  const Tag = as;

  React.useEffect(() => {
    if (!play) { setDisplay(text); return; }
    let raf, start;
    const chars = text.split("");
    const total = duration;
    const startAfter = delay;
    let begun = false;
    let t0;

    function step(ts) {
      if (!t0) t0 = ts;
      const elapsed = ts - t0;
      if (elapsed < startAfter) { raf = requestAnimationFrame(step); return; }
      if (!begun) { begun = true; start = ts; }
      const p = Math.min(1, (ts - start) / total);
      const revealed = Math.floor(p * chars.length);
      let out = "";
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] === " ") { out += " "; continue; }
        if (i < revealed) out += chars[i];
        else out += SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
      }
      setDisplay(out);
      if (p < 1) raf = requestAnimationFrame(step);
      else setDisplay(text);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, play, duration, delay]);

  return <Tag className={className} style={style}>{display}</Tag>;
}

/* ---------- useTypewriter (for console boot) ---------- */
function useTypewriter(lines, speed = 18, active = true) {
  const [out, setOut] = React.useState(active ? [] : lines);
  React.useEffect(() => {
    if (!active) { setOut(lines); return; }
    setOut([]);
    let li = 0, ci = 0, acc = [];
    let raf;
    let last = 0;
    function step(ts) {
      if (ts - last >= speed) {
        last = ts;
        if (li >= lines.length) return;
        acc[li] = (acc[li] || "") + lines[li][ci];
        ci++;
        setOut([...acc]);
        if (ci >= lines[li].length) { li++; ci = 0; acc.push(""); }
      }
      if (li < lines.length) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return out;
}

Object.assign(window, { startMatrixRain, Decode, useTypewriter });
