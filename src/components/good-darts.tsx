"use client";

import { useEffect, useId, useRef, useState } from "react";
import { type SoundEffect, play } from "@/lib/caller";

/**
 * Our 26: twenty, five and one. Every time it lands the table laughs and says "Good darts", so the app does too,
 * with a different show each time. It sits over the scorer without taking a tap, so play carries straight on.
 */
const DURATION_MS = 4200;

type Ctx = CanvasRenderingContext2D;
type Box = { x: number; y: number; w: number; h: number };
/** Where the lettering and, when someone's being crowned, the crown sit on the screen. */
type Stage = { text: Box; crown: Box | null };
/** Sets up a show for a w×h screen; the returned step draws one frame, t seconds in, dt since the last. */
type Effect = (w: number, h: number, font: string, stage: Stage) => (ctx: Ctx, t: number, dt: number) => void;

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
/** Fades in over the first `inS` seconds and out over the last `outS` before the end. */
const envelope = (t: number, inS = 0.25, outS = 0.6, end = DURATION_MS / 1000) =>
  Math.min(1, t / inS, Math.max(0, (end - t) / outS));

const PARTY = ["#e23b3b", "#22a45d", "#e0a83a", "#f2efe4", "#3ab4f2", "#c04df9", "#ff8a00", "#ffd84d"];
const BOARD = ["#e23b3b", "#22a45d", "#f2efe4", "#111111"];
const NEON = ["#39ff14", "#ff2d55", "#00e5ff", "#ff00e1", "#ffe600"];

type Bit = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

/** Sparks that fly, fall and fade. Shared by the shows that blow things up. */
function sparks() {
  const bits: Bit[] = [];
  return {
    burst(x: number, y: number, n: number, speed: number, colors: readonly string[], life = 1.4, size = 2.5) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const v = speed * Math.sqrt(Math.random());
        const max = life * rand(0.6, 1.1);
        bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, color: pick(colors), size: size * rand(0.7, 1.3) });
      }
    },
    draw(ctx: Ctx, dt: number, gravity: number) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          bits.splice(i, 1);
          continue;
        }
        const drag = 1 - 1.6 * dt;
        b.vx *= drag;
        b.vy = b.vy * drag + gravity * dt;
        const px = b.x;
        const py = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const k = b.life / b.max;
        ctx.globalAlpha = k * (Math.random() < 0.15 ? 0.4 : 1);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.size * (0.5 + k);
        ctx.beginPath();
        ctx.moveTo(px - b.vx * 0.03, py - b.vy * 0.03);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    },
  };
}

const confetti: Effect = (w, h) => {
  type Piece = { x: number; y: number; vx: number; vy: number; r: number; vr: number; flip: number; vf: number; pw: number; ph: number; color: string };
  const pieces: Piece[] = [];
  const fire = (x: number, y: number, angle: number, n: number, speed: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-spread, spread);
      const v = speed * rand(0.55, 1.15);
      pieces.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(0, TAU), vr: rand(-10, 10), flip: rand(0, TAU), vf: rand(5, 12),
        pw: rand(6, 11), ph: rand(10, 18), color: pick(PARTY),
      });
    }
  };
  fire(0, h, -Math.PI / 3, 160, h * 2.1, 0.32);
  fire(w, h, (-2 * Math.PI) / 3, 160, h * 2.1, 0.32);
  let second = false;
  return (ctx, t, dt) => {
    if (!second && t > 0.8) {
      second = true;
      fire(w * 0.5, h, -Math.PI / 2, 140, h * 2.2, 0.45);
    }
    for (const p of pieces) {
      const drag = 1 - 2.2 * dt;
      p.vx *= drag;
      p.vy = p.vy * drag + h * 1.4 * dt;
      p.flip += p.vf * dt;
      p.r += p.vr * dt;
      p.x += (p.vx + Math.sin(p.flip) * 40) * dt;
      p.y += p.vy * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(1, Math.cos(p.flip));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.pw / 2, -p.ph / 2, p.pw, p.ph);
      ctx.restore();
    }
  };
};

const fireworks: Effect = (w, h) => {
  const fx = sparks();
  type Rocket = { x: number; y: number; vy: number; top: number; at: number; colors: string[]; big: boolean };
  const rockets: Rocket[] = Array.from({ length: 9 }, (_, i) => ({
    x: rand(w * 0.15, w * 0.85), y: h, vy: -h * rand(1.2, 1.5), top: rand(h * 0.12, h * 0.45), at: i * 0.32, colors: [pick(PARTY), pick(PARTY), "#ffffff"], big: false,
  }));
  rockets.push({ x: w / 2, y: h, vy: -h * 1.6, top: h * 0.3, at: 2.4, colors: ["#e0a83a", "#ffd84d", "#ffffff"], big: true });
  return (ctx, t, dt) => {
    ctx.globalCompositeOperation = "lighter";
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (t < r.at) continue;
      r.y += r.vy * dt;
      ctx.fillStyle = "#ffe9b0";
      ctx.beginPath();
      ctx.arc(r.x, r.y, 3, 0, TAU);
      ctx.fill();
      fx.burst(r.x, r.y + 4, 2, 60, ["#ffb347", "#ffe9b0"], 0.4, 2);
      if (r.y <= r.top) {
        const size = Math.min(w, h);
        fx.burst(r.x, r.y, r.big ? 260 : 120, size * (r.big ? 1.3 : 0.8), r.colors, r.big ? 2 : 1.5, r.big ? 3.5 : 2.5);
        rockets.splice(i, 1);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    fx.draw(ctx, dt, h * 0.25);
  };
};

const lasers: Effect = (w, h) => {
  const reach = Math.hypot(w, h) * 1.2;
  const emitters = [
    { x: 0, y: h, base: -Math.PI / 4 },
    { x: w, y: h, base: (-3 * Math.PI) / 4 },
    { x: w / 2, y: h + 10, base: -Math.PI / 2 },
    { x: 0, y: 0, base: Math.PI / 4 },
    { x: w, y: 0, base: (3 * Math.PI) / 4 },
  ].map((e, i) => ({ ...e, color: NEON[i % NEON.length], speed: rand(1.5, 3), phase: rand(0, TAU) }));
  return (ctx, t) => {
    const k = envelope(t, 0.15);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(80, 40, 160, ${0.12 * k})`;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    for (const e of emitters) {
      const fan = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.7 + e.phase));
      for (let b = -2; b <= 2; b++) {
        const a = e.base + Math.sin(t * e.speed + e.phase) * 0.55 + b * fan;
        const x2 = e.x + Math.cos(a) * reach;
        const y2 = e.y + Math.sin(a) * reach;
        const g = ctx.createLinearGradient(e.x, e.y, x2, y2);
        g.addColorStop(0, e.color);
        g.addColorStop(1, "transparent");
        ctx.strokeStyle = g;
        ctx.globalAlpha = 0.18 * k;
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 0.9 * k;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.globalAlpha = k;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(e.x, e.y, 10, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };
};

/** Twenty-six darts, thrown in from off screen, sticking wherever they land. */
const dartStorm: Effect = (w, h) => {
  const s = Math.min(w, h) / 650;
  const darts = Array.from({ length: 26 }, (_, i) => {
    const tx = rand(w * 0.05, w * 0.95);
    const ty = rand(h * 0.08, h * 0.92);
    const from = Math.random() < 0.5 ? -1 : 1;
    const angle = from < 0 ? rand(-0.5, -0.1) : Math.PI + rand(0.1, 0.5);
    return { tx, ty, angle, at: 0.08 + i * 0.085, flight: pick(PARTY), sx: tx - Math.cos(angle) * w, sy: ty - Math.sin(angle) * w };
  });
  const travel = 0.16;
  function dart(ctx: Ctx, x: number, y: number, a: number, flight: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI);
    ctx.scale(s, s);
    ctx.fillStyle = "#cfd6d3";
    ctx.fillRect(0, -1.2, 18, 2.4);
    ctx.fillStyle = "#3b3f44";
    ctx.fillRect(18, -4.5, 34, 9);
    ctx.fillStyle = "#9aa3a8";
    for (let r = 22; r < 50; r += 6) ctx.fillRect(r, -4.5, 2, 9);
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(52, -1.8, 26, 3.6);
    ctx.fillStyle = flight;
    ctx.beginPath();
    ctx.moveTo(70, 0);
    ctx.lineTo(96, -17);
    ctx.lineTo(102, -17);
    ctx.lineTo(94, 0);
    ctx.lineTo(102, 17);
    ctx.lineTo(96, 17);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return (ctx, t) => {
    for (const d of darts) {
      const since = t - d.at;
      if (since < 0) continue;
      if (since < travel) {
        const k = since / travel;
        dart(ctx, d.sx + (d.tx - d.sx) * k, d.sy + (d.ty - d.sy) * k, d.angle, d.flight);
        continue;
      }
      const stuck = since - travel;
      if (stuck < 0.35) {
        ctx.strokeStyle = `rgba(242, 239, 228, ${0.7 * (1 - stuck / 0.35)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(d.tx, d.ty, 6 + stuck * 120 * s, 0, TAU);
        ctx.stroke();
      }
      const wobble = Math.sin(stuck * 38) * 0.16 * Math.exp(-stuck * 6);
      dart(ctx, d.tx, d.ty, d.angle + wobble, d.flight);
    }
  };
};

const sunburst: Effect = (w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.hypot(w, h);
  const glitter = sparks();
  return (ctx, t, dt) => {
    const k = envelope(t, 0.3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.6);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
    g.addColorStop(0, `rgba(255, 216, 77, ${0.55 * k})`);
    g.addColorStop(1, "rgba(224, 168, 58, 0)");
    ctx.fillStyle = g;
    const rays = 20;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a, a + TAU / rays / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (Math.random() < 0.8) glitter.burst(rand(0, w), rand(0, h), 6, 80, ["#fff6d5", "#ffd84d"], 0.6, 2);
    glitter.draw(ctx, dt, 0);
  };
};

const warp: Effect = (w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const stars = Array.from({ length: 360 }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.05, 1), color: pick(["#ffffff", "#bfe3ff", "#ffe9b0", "#3ab4f2"]) }));
  const f = Math.max(w, h) * 0.5;
  return (ctx, t, dt) => {
    const k = envelope(t, 0.2);
    const speed = 0.25 + ease(t / 1.2) * 1.6;
    ctx.lineCap = "round";
    for (const st of stars) {
      const pz = st.z;
      st.z -= speed * dt;
      if (st.z <= 0.02) {
        st.x = rand(-1, 1);
        st.y = rand(-1, 1);
        st.z = 1;
        continue;
      }
      const x1 = cx + (st.x / pz) * f;
      const y1 = cy + (st.y / pz) * f;
      const x2 = cx + (st.x / st.z) * f;
      const y2 = cy + (st.y / st.z) * f;
      ctx.globalAlpha = k * Math.min(1, (1 - st.z) * 1.5);
      ctx.strokeStyle = st.color;
      ctx.lineWidth = Math.max(1, 3.5 * (1 - st.z));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
};

/** Rings in the board's own colours, rolling out from the bull. */
const shockwave: Effect = (w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const reach = Math.hypot(w, h) / 2;
  const fx = sparks();
  const waves = Array.from({ length: 8 }, (_, i) => ({ at: i * 0.28, color: BOARD[i % 3], hit: false }));
  return (ctx, t, dt) => {
    for (const wv of waves) {
      const since = t - wv.at;
      if (since < 0) continue;
      if (!wv.hit) {
        wv.hit = true;
        fx.burst(cx, cy, 40, Math.min(w, h) * 0.9, [wv.color, "#ffffff", "#e0a83a"], 1, 3);
      }
      const k = since / 1.6;
      if (k > 1) continue;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = wv.color;
      ctx.lineWidth = 40 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ease(k) * reach, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    fx.draw(ctx, dt, h * 0.3);
  };
};

const balloons: Effect = (w, h, font) => {
  const fx = sparks();
  const size = Math.min(w, h) / 14;
  const list = Array.from({ length: 26 }, (_, i) => ({
    x: rand(size, w - size), y: h + size * rand(1, 6), v: h * rand(0.35, 0.6), phase: rand(0, TAU), color: pick(PARTY), r: size * rand(0.8, 1.2),
    popAt: rand(1.8, 3.8), popped: false, label: i % 3 === 0 ? "26" : "",
  }));
  return (ctx, t, dt) => {
    for (const b of list) {
      if (b.popped) continue;
      if (t > b.popAt && b.y < h) {
        b.popped = true;
        fx.burst(b.x, b.y, 30, size * 6, [b.color, "#ffffff"], 0.7, 3);
        continue;
      }
      b.y -= b.v * dt;
      const x = b.x + Math.sin(t * 2 + b.phase) * size * 0.5;
      ctx.strokeStyle = "rgba(242, 239, 228, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, b.y + b.r * 1.2);
      ctx.quadraticCurveTo(x + Math.sin(t * 3 + b.phase) * 10, b.y + b.r * 2.2, x, b.y + b.r * 3.2);
      ctx.stroke();
      const g = ctx.createRadialGradient(x - b.r * 0.35, b.y - b.r * 0.45, b.r * 0.1, x, b.y, b.r * 1.3);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.25, b.color);
      g.addColorStop(1, "#000000");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, b.y, b.r, b.r * 1.2, 0, 0, TAU);
      ctx.fill();
      if (b.label) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.font = `800 ${b.r * 0.9}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.label, x, b.y);
      }
    }
    fx.draw(ctx, dt, h * 0.5);
  };
};

/** The three darts that make it, flying out of the middle again and again. */
const numberStorm: Effect = (w, h, font) => {
  const size = Math.min(w, h);
  const glyphs = Array.from({ length: 70 }, (_, i) => {
    const a = rand(0, TAU);
    const v = size * rand(0.4, 1.2);
    return {
      text: pick(["26", "20", "5", "1", "26"]), at: (i % 14) * 0.18 + rand(0, 0.1), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      spin: rand(-4, 4), px: rand(size * 0.05, size * 0.14), color: pick(["#e0a83a", "#ffd84d", "#f2efe4", "#e23b3b", "#22a45d"]),
    };
  });
  return (ctx, t) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const g of glyphs) {
      const since = t - g.at;
      if (since < 0) continue;
      ctx.save();
      ctx.translate(w / 2 + g.vx * since, h / 2 + g.vy * since + 0.5 * h * 0.3 * since * since);
      ctx.rotate(g.spin * since);
      const grow = 0.3 + ease(since * 2) * 0.7;
      ctx.globalAlpha = Math.min(1, 3 - since);
      ctx.font = `800 ${g.px * grow}px ${font}`;
      ctx.lineWidth = g.px * 0.08;
      ctx.strokeStyle = "#0c1713";
      ctx.strokeText(g.text, 0, 0);
      ctx.fillStyle = g.color;
      ctx.fillText(g.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };
};

/** Bolts strike the middle of the screen. The flash stays soft and slow, so it never strobes. */
const lightning: Effect = (w, h) => {
  const strikes = Array.from({ length: 7 }, (_, i) => ({ at: 0.05 + i * 0.5 + rand(0, 0.15), x: rand(w * 0.1, w * 0.9) }));
  let bolt: { pts: [number, number][]; branches: [number, number][][]; until: number } | null = null;
  function path(x1: number, y1: number, x2: number, y2: number, jag: number): [number, number][] {
    let pts: [number, number][] = [[x1, y1], [x2, y2]];
    for (let d = jag; d > 2; d /= 2) {
      const next: [number, number][] = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        next.push([(ax + bx) / 2 + rand(-d, d), (ay + by) / 2 + rand(-d / 3, d / 3)], pts[i]);
      }
      pts = next;
    }
    return pts;
  }
  const line = (ctx: Ctx, pts: [number, number][]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.stroke();
  };
  let flash = 0;
  return (ctx, t, dt) => {
    for (const s of strikes) {
      if (s.at > 0 && t >= s.at) {
        s.at = -1;
        const pts = path(s.x, 0, w / 2 + rand(-40, 40), h / 2, w * 0.18);
        const branches = Array.from({ length: 3 }, () => {
          const [bx, by] = pick(pts);
          return path(bx, by, bx + rand(-w * 0.25, w * 0.25), by + rand(h * 0.1, h * 0.3), w * 0.06);
        });
        bolt = { pts, branches, until: t + 0.22 };
        flash = 0.22;
      }
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(200, 220, 255, ${flash})`;
      ctx.fillRect(0, 0, w, h);
      flash = Math.max(0, flash - dt * 0.8);
    }
    if (!bolt || t > bolt.until) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    for (const [width, color] of [[14, "rgba(120, 160, 255, 0.25)"], [6, "rgba(170, 200, 255, 0.6)"], [2, "#ffffff"]] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      line(ctx, bolt.pts);
      ctx.lineWidth = width / 2;
      for (const b of bolt.branches) line(ctx, b);
    }
    ctx.globalCompositeOperation = "source-over";
  };
};

const goldRain: Effect = (w, h) => {
  const flakes = Array.from({ length: 420 }, () => ({
    x: rand(0, w), y: rand(-h * 1.2, 0), v: h * rand(0.25, 0.6), size: rand(2, 6), phase: rand(0, TAU), tw: rand(6, 14),
  }));
  return (ctx, t, dt) => {
    ctx.globalCompositeOperation = "lighter";
    for (const f of flakes) {
      f.y += f.v * dt;
      const x = f.x + Math.sin(t * 2 + f.phase) * 12;
      const shine = 0.5 + 0.5 * Math.sin(t * f.tw + f.phase);
      ctx.globalAlpha = 0.35 + 0.65 * shine;
      ctx.fillStyle = shine > 0.85 ? "#ffffff" : "#ffcf4a";
      const s = f.size * (0.6 + shine * 0.6);
      ctx.beginPath();
      ctx.moveTo(x, f.y - s);
      ctx.lineTo(x + s * 0.5, f.y);
      ctx.lineTo(x, f.y + s);
      ctx.lineTo(x - s * 0.5, f.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };
};

/** A pint-and-bullseye fountain. Each emoji is drawn once and stamped, which keeps it smooth on a phone. */
const fountain: Effect = (w, h) => {
  const px = Math.round(Math.min(w, h) / 11);
  const stamps = new Map<string, HTMLCanvasElement>();
  for (const e of ["🎯", "🍺", "🔥", "⭐", "🎉", "🍻"]) {
    const c = document.createElement("canvas");
    c.width = c.height = px * 2;
    const x = c.getContext("2d")!;
    x.font = `${px * 1.5}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(e, px, px * 1.1);
    stamps.set(e, c);
  }
  const kinds = [...stamps.keys()];
  const drops: { x: number; y: number; vx: number; vy: number; r: number; vr: number; img: HTMLCanvasElement; s: number }[] = [];
  let next = 0;
  return (ctx, t, dt) => {
    while (t < 3 && next <= t) {
      next += 0.025;
      drops.push({
        x: w / 2, y: h + px, vx: rand(-w * 0.45, w * 0.45), vy: -h * rand(1.2, 1.75), r: 0, vr: rand(-5, 5), img: stamps.get(pick(kinds))!, s: rand(0.6, 1.2),
      });
    }
    for (const d of drops) {
      d.vy += h * 1.3 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.r += d.vr * dt;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.r);
      ctx.scale(d.s, d.s);
      ctx.drawImage(d.img, -px, -px);
      ctx.restore();
    }
  };
};

const disco: Effect = (w, h) => {
  const ballR = Math.min(w, h) * 0.09;
  const spots = Array.from({ length: 14 }, (_, i) => ({ color: NEON[i % NEON.length], ax: rand(0.5, 1.4), ay: rand(0.5, 1.4), px: rand(0, TAU), py: rand(0, TAU), r: Math.min(w, h) * rand(0.12, 0.25) }));
  return (ctx, t) => {
    const k = envelope(t, 0.3);
    ctx.globalCompositeOperation = "lighter";
    for (const s of spots) {
      const x = w / 2 + Math.sin(t * s.ax + s.px) * w * 0.48;
      const y = h / 2 + Math.sin(t * s.ay + s.py) * h * 0.48;
      const g = ctx.createRadialGradient(x, y, 0, x, y, s.r);
      g.addColorStop(0, s.color);
      g.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.45 * k;
      ctx.fillStyle = g;
      ctx.fillRect(x - s.r, y - s.r, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = k;
    ctx.globalCompositeOperation = "source-over";
    const by = -ballR + ease(t / 0.8) * ballR * 2.4;
    ctx.strokeStyle = "#93a89e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, by - ballR);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, by, ballR, 0, TAU);
    ctx.clip();
    const tile = ballR / 4;
    for (let y = by - ballR; y < by + ballR; y += tile) {
      for (let x = w / 2 - ballR + ((t * 40) % tile) - tile; x < w / 2 + ballR; x += tile) {
        const l = 50 + 45 * Math.sin(x * 0.9 + y * 1.3 + t * 9);
        ctx.fillStyle = `hsl(${(x + y + t * 200) % 360}, 30%, ${l}%)`;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };
};

/** A sprite drawn once and stamped many times, which keeps the busy shows smooth on a phone. */
function sprite(size: number, paint: (x: Ctx, size: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(size);
  paint(c.getContext("2d")!, size);
  return c;
}

/** A soft round glow in `rgb` ("255, 140, 20"), so stacked flames add up to fire rather than a white blob. */
function glow(size: number, rgb: string) {
  return sprite(size, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, `rgba(${rgb}, 0.9)`);
    g.addColorStop(0.4, `rgba(${rgb}, 0.35)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });
}

function pizza(r: number, slice: boolean) {
  return sprite(r * 2, (x) => {
    x.translate(r, r);
    if (slice) {
      x.beginPath();
      x.moveTo(0, r * 0.2);
      x.arc(0, r * 0.2, r * 1.15, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
      x.closePath();
      x.clip();
      x.translate(0, r * 0.2);
      x.scale(1.15, 1.15);
    }
    x.fillStyle = "#c8812a";
    x.beginPath();
    x.arc(0, 0, r * 0.98, 0, TAU);
    x.fill();
    x.fillStyle = "#b8321f";
    x.beginPath();
    x.arc(0, 0, r * 0.84, 0, TAU);
    x.fill();
    x.fillStyle = "#f5c84c";
    x.beginPath();
    x.arc(0, 0, r * 0.76, 0, TAU);
    x.fill();
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      x.beginPath();
      x.arc(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * rand(0.06, 0.12), 0, TAU);
      x.fill();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rand(-0.3, 0.3);
      const d = r * (i % 2 ? 0.5 : 0.25) + rand(-4, 4);
      x.fillStyle = "#a3221a";
      x.beginPath();
      x.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.13, 0, TAU);
      x.fill();
      x.fillStyle = "rgba(0, 0, 0, 0.18)";
      x.beginPath();
      x.arc(Math.cos(a) * d + r * 0.03, Math.sin(a) * d + r * 0.03, r * 0.04, 0, TAU);
      x.fill();
    }
    x.fillStyle = "#2f8a3a";
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.ellipse(rand(-r * 0.5, r * 0.5), rand(-r * 0.5, r * 0.5), r * 0.09, r * 0.04, rand(0, TAU), 0, TAU);
      x.fill();
    }
  });
}

/**
 * The darter's diet: a pint pours in until the screen is half beer, and pizzas get thrown into it. The beer is a
 * proper little wave simulation, so every pizza that lands makes it slosh and splash.
 */
const darterDiet: Effect = (w, h) => {
  const cols = 72;
  const dx = w / (cols - 1);
  const disp = new Float32Array(cols);
  const vel = new Float32Array(cols);
  const level = (t: number) => h - h * 0.46 * ease(t / 1.5);
  const surface = (x: number, t: number) => {
    const i = Math.max(0, Math.min(cols - 1, Math.round(x / dx)));
    return level(t) + disp[i];
  };
  const kick = (x: number, v: number, spread: number) => {
    const c = Math.round(x / dx);
    for (let i = Math.max(0, c - spread); i <= Math.min(cols - 1, c + spread); i++) vel[i] += v * (1 - Math.abs(i - c) / (spread + 1));
  };
  const size = Math.min(w, h) / 9;
  const whole = pizza(size, false);
  const slice = pizza(size, true);
  const pizzas = Array.from({ length: 12 }, (_, i) => {
    const left = i % 2 === 0;
    return {
      at: 0.25 + i * 0.22, x: left ? -size : w + size, y: rand(h * 0.3, h * 0.6), vx: (left ? 1 : -1) * w * rand(0.5, 0.85), vy: -h * rand(0.9, 1.25),
      r: rand(0, TAU), vr: rand(-6, 6), img: Math.random() < 0.4 ? slice : whole, s: rand(0.7, 1.15), wet: false,
    };
  });
  const drops: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  const bubbles = Array.from({ length: 70 }, () => ({ x: rand(0, w), y: rand(h * 0.5, h), r: rand(1.5, 4), v: rand(30, 90) }));
  const foam = Array.from({ length: Math.ceil(w / 16) + 1 }, () => ({ r: rand(7, 13), phase: rand(0, TAU) }));
  const splash = (x: number, y: number, n: number, power: number) => {
    for (let i = 0; i < n; i++) drops.push({ x: x + rand(-size / 2, size / 2), y, vx: rand(-1, 1) * power * 0.5, vy: -power * rand(0.5, 1.2), life: 1.2 });
  };
  return (ctx, t, dt) => {
    const k = envelope(t, 0.1, 0.5);
    const base = level(t);
    // The pint pouring in from the top, thinning out as it finishes.
    const pour = 1 - t / 1.6;
    if (pour > 0) {
      const sx = w * 0.5 + Math.sin(t * 7) * 6;
      const pw = 34 * pour + 6;
      const g = ctx.createLinearGradient(sx - pw, 0, sx + pw, 0);
      g.addColorStop(0, "#c97a06");
      g.addColorStop(0.5, "#ffd257");
      g.addColorStop(1, "#c97a06");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - pw / 2, 0);
      for (let y = 0; y <= base; y += 20) ctx.lineTo(sx - pw / 2 + Math.sin(y * 0.05 + t * 20) * 3, y);
      ctx.lineTo(sx + pw / 2, base);
      ctx.lineTo(sx + pw / 2, 0);
      ctx.fill();
      kick(sx, 260 * dt * 60 * pour * 0.05, 2);
      if (Math.random() < 0.5) splash(sx, base, 1, h * 0.5);
    }
    // Waves: each column springs back to the level and pulls its neighbours with it.
    for (let i = 0; i < cols; i++) {
      vel[i] += (-70 * disp[i] - 3.5 * vel[i]) * dt;
      disp[i] += vel[i] * dt;
    }
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 1; i < cols; i++) {
        const d = (disp[i] - disp[i - 1]) * 0.12;
        vel[i - 1] += d * 60 * dt;
        vel[i] -= d * 60 * dt;
      }
    }

    ctx.globalAlpha = k;
    const beer = ctx.createLinearGradient(0, base, 0, h);
    beer.addColorStop(0, "rgba(255, 196, 46, 0.92)");
    beer.addColorStop(1, "rgba(176, 98, 6, 0.95)");
    ctx.fillStyle = beer;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < cols; i++) ctx.lineTo(i * dx, base + disp[i]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 246, 214, 0.75)";
    for (const b of bubbles) {
      b.y -= b.v * dt;
      b.x += Math.sin(t * 3 + b.r) * 0.4;
      if (b.y < surface(b.x, t)) b.y = h + rand(0, 30);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#fff8e8";
    for (let i = 0; i < foam.length; i++) {
      const x = i * 16;
      const f = foam[i];
      ctx.beginPath();
      ctx.arc(x, surface(x, t) - 2 + Math.sin(t * 4 + f.phase) * 2, f.r, 0, TAU);
      ctx.fill();
    }

    for (const p of pizzas) {
      if (t < p.at) continue;
      const top = surface(p.x, t);
      const under = p.y - top;
      if (under > 0) {
        if (!p.wet) {
          p.wet = true;
          kick(p.x, Math.min(900, p.vy * 0.9), 4);
          splash(p.x, top, 26, Math.min(h * 0.9, 200 + Math.abs(p.vy) * 0.8));
        }
        // Pizza floats: buoyancy pushes it back up, the beer slows it and its spin.
        p.vy -= under * 30 * dt;
        p.vy *= 1 - 3 * dt;
        p.vx *= 1 - 2 * dt;
        p.vr *= 1 - 2 * dt;
      }
      p.vy += h * 1.1 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if ((p.x < size / 2 && p.vx < 0) || (p.x > w - size / 2 && p.vx > 0)) p.vx *= -0.6;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(p.s, p.s);
      ctx.drawImage(p.img, -size, -size);
      ctx.restore();
    }

    ctx.fillStyle = "#ffc93c";
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy += h * 1.6 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      if (d.life <= 0 || (d.vy > 0 && d.y > surface(d.x, t))) {
        drops.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 3, 3 + Math.min(6, Math.abs(d.vy) / 120), Math.atan2(d.vy, d.vx) + Math.PI / 2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
};

/** Stage pyro shoots up from the floor, then catches the lettering and sets it alight. */
const IGNITE_S = 0.7;
const inferno: Effect = (w, h, _font, { text }) => {
  const s = Math.max(48, Math.min(w, h) / 7);
  const hot = glow(s, "255, 220, 120");
  const orange = glow(s, "255, 120, 10");
  const red = glow(s, "200, 30, 5");
  type Flame = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
  const flames: Flame[] = [];
  const add = (x: number, y: number, vx: number, vy: number, life: number, size: number) => {
    if (flames.length < 1500) flames.push({ x, y, vx, vy, life, max: life, size });
  };
  const jets = Array.from({ length: 10 }, (_, i) => ({ at: 0.05 + (i % 5) * 0.14 + (i >= 5 ? 1.6 : 0), x: w * (0.1 + 0.8 * ((i * 2) % 5) / 4) }));
  const embers = Array.from({ length: 80 }, () => ({ x: rand(0, w), y: rand(h * 0.3, h * 1.3), v: rand(40, 140), phase: rand(0, TAU) }));
  let flash = 0;
  let lit = false;
  return (ctx, t, dt) => {
    const fading = t > 3.4;
    if (!fading) {
      for (let i = 0; i < 150 * dt * (w / 400); i++) add(rand(0, w), h + 10, rand(-20, 20), -h * rand(0.25, 0.55), rand(0.4, 0.9), rand(0.6, 1.1));
      for (const j of jets) {
        const on = t - j.at;
        if (on < 0 || on > 0.4) continue;
        for (let i = 0; i < 900 * dt; i++) add(j.x + rand(-12, 12), h, rand(-40, 40), -h * rand(1.3, 1.9), rand(0.5, 0.9), rand(0.8, 1.4));
      }
    }
    if (!lit && t > IGNITE_S) {
      lit = true;
      flash = 0.35;
    }
    if (lit && !fading) {
      for (let i = 0; i < 520 * dt; i++) {
        add(rand(text.x + text.w * 0.08, text.x + text.w * 0.92), rand(text.y + text.h * 0.1, text.y + text.h * 0.55), rand(-15, 15), -rand(90, 220), rand(0.3, 0.7), rand(0.35, 0.7));
      }
    }
    ctx.globalCompositeOperation = "lighter";
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 120, 20, ${flash})`;
      ctx.fillRect(0, 0, w, h);
      flash = Math.max(0, flash - dt * 0.9);
    }
    for (let i = flames.length - 1; i >= 0; i--) {
      const f = flames[i];
      f.life -= dt;
      if (f.life <= 0) {
        flames.splice(i, 1);
        continue;
      }
      f.vx += rand(-200, 200) * dt;
      f.vy *= 1 - 0.8 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const k = f.life / f.max;
      const img = k > 0.8 ? hot : k > 0.4 ? orange : red;
      const size = s * f.size * (0.4 + 0.8 * Math.sin(k * Math.PI));
      ctx.globalAlpha = Math.min(1, k * 1.4) * 0.5;
      ctx.drawImage(img, f.x - size / 2, f.y - size / 2, size, size);
    }
    ctx.globalAlpha = envelope(t, 0.3);
    ctx.fillStyle = "#ffd27a";
    for (const e of embers) {
      e.y -= e.v * dt;
      if (e.y < -10) e.y = h + 10;
      ctx.fillRect(e.x + Math.sin(t * 3 + e.phase) * 14, e.y, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };
};

/** The whole pub on its feet: clapping, jumping, and throwing their pints in the air. */
const crowd: Effect = (w, h) => {
  const s = Math.min(w, h) / 600;
  const rows = [
    { y: h * 0.86, scale: 0.75, color: "#070b09", count: Math.ceil(w / (60 * s)) },
    { y: h * 0.95, scale: 0.95, color: "#0b120f", count: Math.ceil(w / (80 * s)) },
    { y: h * 1.06, scale: 1.2, color: "#101a15", count: Math.ceil(w / (110 * s)) },
  ];
  type Person = { x: number; row: (typeof rows)[number]; phase: number; jump: number; mode: "wave" | "clap" | "pint"; throwAt: number; thrown: boolean };
  const people: Person[] = rows.flatMap((row) =>
    Array.from({ length: row.count + 1 }, (_, i) => ({
      x: (i + rand(-0.3, 0.3)) * (w / row.count), row, phase: rand(0, TAU), jump: rand(5, 9),
      mode: pick(["wave", "clap", "clap", "pint"] as const), throwAt: rand(0.5, 2.6), thrown: false,
    })),
  );
  const pints: { x: number; y: number; vx: number; vy: number; r: number; vr: number; s: number }[] = [];
  const beer: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  const claps = sparks();
  const flashes = sparks();
  const fling = (x: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) beer.push({ x, y, vx: rand(-h * 0.35, h * 0.35), vy: -h * rand(0.6, 1.3), life: rand(1, 1.8) });
  };
  function pint(ctx: Ctx, x: number, y: number, r: number, size: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    ctx.scale(size, size);
    ctx.fillStyle = "rgba(255, 190, 40, 0.95)";
    ctx.beginPath();
    ctx.moveTo(-11, -18);
    ctx.lineTo(11, -18);
    ctx.lineTo(9, 18);
    ctx.lineTo(-9, 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff8e8";
    ctx.fillRect(-12, -24, 24, 8);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  return (ctx, t, dt) => {
    const rise = (1 - ease(t / 0.45)) * h * 0.4 + Math.max(0, t - 3.6) * h * 0.6;
    // Warm stage light behind the crowd, so the silhouettes stand out.
    const light = ctx.createLinearGradient(0, h * 0.55 + rise, 0, h);
    light.addColorStop(0, "rgba(224, 168, 58, 0)");
    light.addColorStop(1, `rgba(255, 170, 60, ${0.45 * envelope(t, 0.3)})`);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);
    for (const row of rows) {
      ctx.fillStyle = row.color;
      ctx.lineCap = "round";
      for (const p of people) {
        if (p.row !== row) continue;
        const sc = row.scale * s;
        const hop = Math.max(0, Math.sin(t * p.jump + p.phase)) * 18 * sc;
        const by = row.y - hop + rise;
        const sx = p.x;
        // Arms first, so the body covers the shoulders.
        ctx.lineWidth = 13 * sc;
        ctx.strokeStyle = row.color;
        const shoulder = by - 70 * sc;
        let hands: [number, number][];
        if (p.mode === "clap") {
          const gap = Math.abs(Math.sin(t * 11 + p.phase)) * 22 * sc;
          if (gap < 2 * sc && Math.random() < 0.3) claps.burst(sx, shoulder - 70 * sc, 5, 120 * sc, ["#fff8e8", "#ffd84d"], 0.25, 2);
          hands = [[sx - gap, shoulder - 62 * sc], [sx + gap, shoulder - 62 * sc]];
        } else {
          const swing = Math.sin(t * 6 + p.phase) * 20 * sc;
          hands = [[sx - 34 * sc + swing, shoulder - 66 * sc], [sx + 34 * sc + swing, shoulder - 66 * sc]];
        }
        for (const [i, [hx, hy]] of hands.entries()) {
          ctx.beginPath();
          ctx.moveTo(sx + (i ? 24 : -24) * sc, shoulder + 6 * sc);
          ctx.lineTo(hx, hy);
          ctx.stroke();
        }
        if (p.mode === "pint") {
          const [hx, hy] = hands[1];
          if (!p.thrown && t > p.throwAt) {
            p.thrown = true;
            pints.push({ x: hx, y: hy, vx: rand(-w * 0.2, w * 0.2), vy: -h * rand(0.9, 1.3), r: 0, vr: rand(-9, 9), s: sc * 1.4 });
            fling(hx, hy, 30);
          }
          if (!p.thrown) pint(ctx, hx, hy - 14 * sc, Math.sin(t * 6 + p.phase) * 0.3, sc * 1.4);
        }
        ctx.beginPath();
        ctx.roundRect(sx - 30 * sc, shoulder, 60 * sc, 120 * sc, 22 * sc);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, shoulder - 24 * sc, 21 * sc, 0, TAU);
        ctx.fill();
      }
      if (row === rows[0] && Math.random() < 0.12) flashes.burst(rand(0, w), row.y - 90 * s + rise, 8, 200 * s, ["#ffffff"], 0.18, 3);
    }
    ctx.fillStyle = "rgba(255, 196, 46, 0.9)";
    for (let i = beer.length - 1; i >= 0; i--) {
      const b = beer[i];
      b.vy += h * 1.4 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y > h + 20) {
        beer.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, TAU);
      ctx.fill();
    }
    for (const p of pints) {
      p.vy += h * 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      // A pint upside down in the air spills as it goes.
      if (Math.cos(p.r) < 0 && Math.random() < 0.7) beer.push({ x: p.x, y: p.y, vx: p.vx * 0.3 + rand(-40, 40), vy: p.vy * 0.3, life: 1 });
      pint(ctx, p.x, p.y, p.r, p.s);
    }
    claps.draw(ctx, dt, 0);
    flashes.draw(ctx, dt, 0);
  };
};

/** The crown lands on whoever threw it, with the light and the glitter that deserves. */
const CROWN_LANDS_S = 1.05;
const crowning: Effect = (w, h, _font, { text, crown }) => {
  const c = crown ?? { x: text.x, y: text.y - text.h * 0.4, w: text.w, h: text.h * 0.4 };
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h * 0.55;
  const reach = Math.hypot(w, h);
  const fx = sparks();
  const gold = ["#fff6d5", "#ffd84d", "#e0a83a", "#ffffff"];
  const rain = Array.from({ length: 160 }, () => ({ x: rand(0, w), y: rand(-h, 0), v: rand(80, 220), s: rand(2, 5), phase: rand(0, TAU) }));
  let landed = false;
  return (ctx, t, dt) => {
    if (!landed && t > CROWN_LANDS_S) {
      landed = true;
      fx.burst(cx, cy, 160, Math.min(w, h) * 1.1, gold, 1.6, 3);
      fx.burst(cx, cy, 60, Math.min(w, h) * 0.5, ["#e23b3b", "#22a45d", "#3ab4f2"], 1.2, 3);
    }
    if (landed) {
      const k = envelope(t - CROWN_LANDS_S, 0.2, 0.6, DURATION_MS / 1000 - CROWN_LANDS_S);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.35);
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, reach * 0.55);
      g.addColorStop(0, `rgba(255, 220, 110, ${0.5 * k})`);
      g.addColorStop(1, "rgba(255, 220, 110, 0)");
      ctx.fillStyle = g;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, reach, a, a + TAU / 40);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.globalCompositeOperation = "lighter";
      for (const r of rain) {
        r.y += r.v * dt;
        const shine = 0.5 + 0.5 * Math.sin(t * 10 + r.phase);
        ctx.globalAlpha = k * (0.4 + 0.6 * shine);
        ctx.fillStyle = shine > 0.8 ? "#ffffff" : "#ffcf4a";
        ctx.fillRect(r.x + Math.sin(t * 2 + r.phase) * 10, r.y, r.s, r.s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    fx.draw(ctx, dt, h * 0.35);
  };
};

type Show = {
  draw: Effect;
  /** How the lettering looks for this show. */
  text?: "fire" | "crown";
  sound?: SoundEffect;
  /** Fills the screen on its own, so it never shares it with a second show. */
  solo?: boolean;
};

const SHOWS: Show[] = [
  { draw: confetti },
  { draw: fireworks, sound: "sfx-fireworks" },
  { draw: lasers },
  { draw: dartStorm },
  { draw: sunburst },
  { draw: warp },
  { draw: shockwave },
  { draw: balloons },
  { draw: numberStorm },
  { draw: lightning },
  { draw: goldRain },
  { draw: fountain },
  { draw: disco },
  { draw: darterDiet, sound: "sfx-beer", solo: true },
  { draw: inferno, text: "fire", sound: "sfx-fire", solo: true },
  { draw: crowd, sound: "sfx-applause" },
  { draw: crowning, text: "crown", sound: "sfx-fanfare" },
];

/** Never the same show twice in a row; sometimes a quiet one joins in. Crowning needs someone to crown. */
let last = -1;
function chooseShows(crownable: boolean): Show[] {
  const allowed = SHOWS.map((_, i) => i).filter((i) => i !== last && (crownable || SHOWS[i].text !== "crown"));
  const first = pick(allowed);
  last = first;
  const main = SHOWS[first];
  const extras = SHOWS.filter((s, i) => i !== first && !s.solo && !s.text && !s.sound);
  return !main.solo && Math.random() < 0.35 ? [main, pick(extras)] : [main];
}

/** Where an element sits on the screen, ignoring the transforms it's animating through. */
function layoutBox(el: HTMLElement, stop: HTMLElement): Box {
  let x = 0;
  let y = 0;
  for (let e: HTMLElement | null = el; e && e !== stop; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft;
    y += e.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** `player` is whoever threw it, for the shows that make it about them. */
export function GoodDarts({ player }: { player?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const name = player?.split(" ")[0];
  const [shows] = useState(() => chooseShows(!!name));
  const [done, setDone] = useState(false);
  const look = shows[0].text;

  useEffect(() => {
    const end = setTimeout(() => setDone(true), DURATION_MS);
    navigator.vibrate?.([60, 40, 60, 40, 160]);
    if (shows[0].sound) play(shows[0].sound);
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    const stage = root.current;
    if (!el || !ctx || !stage || matchMedia("(prefers-reduced-motion: reduce)").matches) return () => clearTimeout(end);

    // Sharp enough on a phone without drawing four times the pixels on a 3x screen.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    const font = getComputedStyle(el).fontFamily;
    const text = stage.querySelector<HTMLElement>("[data-gd-text]")!;
    const crown = stage.querySelector<HTMLElement>("[data-gd-crown]");
    const where: Stage = { text: layoutBox(text, stage), crown: crown && layoutBox(crown, stage) };
    const steps = shows.map((s) => s.draw(w, h, font, where));

    let frame = 0;
    let start = 0;
    let prev = 0;
    const tick = (now: number) => {
      if (!start) start = prev = now;
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const step of steps) {
        ctx.save();
        step(ctx, t, dt);
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      clearTimeout(end);
      cancelAnimationFrame(frame);
    };
  }, [shows]);

  if (done) return null;
  return (
    <div ref={root} aria-live="assertive" className={`good-darts pointer-events-none fixed inset-0 z-30 overflow-hidden ${look ? `gd-look-${look}` : ""}`}>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full font-display" />
      <div className="gd-vignette absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="gd-pop relative flex flex-col items-center">
          {look === "crown" && name ? (
            <div data-gd-text className="gd-float flex flex-col items-center">
              <div data-gd-crown className="gd-crown">
                <Crown />
              </div>
              <span className="gd-text gd-name" style={{ fontSize: `min(${Math.min(22, 130 / name.length)}vw, 22vh, 13rem)` }}>
                {name}
              </span>
              <span className="gd-text gd-text-late gd-small">Good Darts!</span>
            </div>
          ) : (
            <div data-gd-text className="gd-float flex flex-col items-center">
              <span className="gd-text">Good</span>
              <span className="gd-text gd-text-late">Darts!</span>
            </div>
          )}
          <span className="gd-sub mt-3 font-display font-bold">
            <span className="text-double">20</span> · <span className="text-treble">5</span> · <span className="text-chalk">1</span>
          </span>
          {SPARKLES.map((s, i) => (
            <span key={i} aria-hidden className="gd-sparkle" style={{ left: s[0], top: s[1], animationDelay: `${s[2]}s`, fontSize: s[3] }}>
              ✦
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Polished gold with a glint running across it, set with the board's red and green and a blue for luck. */
function Crown() {
  const id = useId();
  const points = "M14 104 L22 34 L62 74 L100 8 L138 74 L178 34 L186 104 Z";
  return (
    <svg viewBox="0 0 200 140" className="block h-full w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.3" stopColor="#ffd84d" />
          <stop offset="0.55" stopColor="#e0a83a" />
          <stop offset="0.7" stopColor="#9c650c" />
          <stop offset="1" stopColor="#ffd45e" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="60" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
          <animateTransform attributeName="gradientTransform" type="translate" values="-80 0; 260 0; 260 0" keyTimes="0; 0.6; 1" dur="1.6s" repeatCount="indefinite" />
        </linearGradient>
        <radialGradient id={`${id}r`} cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.25" stopColor="#ff6b6b" />
          <stop offset="1" stopColor="#8f0f0f" />
        </radialGradient>
        <radialGradient id={`${id}e`} cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.25" stopColor="#4fe08a" />
          <stop offset="1" stopColor="#0d5c2c" />
        </radialGradient>
        <radialGradient id={`${id}b`} cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.25" stopColor="#6cc8ff" />
          <stop offset="1" stopColor="#0b3d7a" />
        </radialGradient>
      </defs>
      <g stroke="#6b440c" strokeWidth="3" strokeLinejoin="round">
        <path d={points} fill={`url(#${id}g)`} />
        <rect x="10" y="98" width="180" height="34" rx="7" fill={`url(#${id}g)`} />
        {[22, 100, 178].map((x, i) => (
          <circle key={x} cx={x} cy={i === 1 ? 8 : 32} r="10" fill={`url(#${id}g)`} />
        ))}
      </g>
      <path d={points} fill={`url(#${id}s)`} />
      <rect x="10" y="98" width="180" height="34" rx="7" fill={`url(#${id}s)`} />
      <path d="M100 44 L112 62 L100 80 L88 62 Z" fill={`url(#${id}r)`} stroke="#5a0c0c" strokeWidth="2" />
      <ellipse cx="100" cy="115" rx="13" ry="10" fill={`url(#${id}r)`} stroke="#5a0c0c" strokeWidth="2" />
      <ellipse cx="55" cy="115" rx="10" ry="8" fill={`url(#${id}e)`} stroke="#063018" strokeWidth="2" />
      <ellipse cx="145" cy="115" rx="10" ry="8" fill={`url(#${id}b)`} stroke="#062448" strokeWidth="2" />
      {[30, 78, 122, 170].map((x) => (
        <circle key={x} cx={x} cy="115" r="3.5" fill="#fffbe0" />
      ))}
    </svg>
  );
}

/** Where the glints catch the lettering: left, top, delay, size. */
const SPARKLES: [string, string, number, string][] = [
  ["-6%", "8%", 0.5, "2.5rem"],
  ["88%", "2%", 0.8, "3.5rem"],
  ["96%", "52%", 1.2, "2rem"],
  ["2%", "60%", 1.5, "3rem"],
  ["60%", "40%", 1.9, "2.2rem"],
  ["30%", "-4%", 2.3, "1.8rem"],
];
