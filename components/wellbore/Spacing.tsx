"use client";
import { useMemo } from "react";
import { at, estimateLateral, fmColor, landing, n0, proper, projection, shortName, stations, type PadFile, type Top, type Well } from "./data";
import { useSize } from "./useSize";

/**
 * Looking down the lateral: every nearby horizontal well as a dot at its
 * landing depth and its distance across strike from the selected well. This is
 * the spacing question (who is the neighbour in the same bench, and how far),
 * which is also the parent and child question.
 *
 * Wells with a survey to hand are placed from it at mid-lateral. The rest are
 * placed back from their bottom hole along the selected well's direction, at
 * their total vertical depth.
 */
interface Dot { w: Well; off: number; tvd: number }

export default function Spacing({ wells, well, padFile, col, onSelect }: { wells: Well[]; well: Well; padFile: PadFile; col: Top[]; onSelect: (w: Well) => void }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const W = Math.max(240, size.w), H = Math.max(130, size.h);
  const pad = { t: 12, r: 14, b: 26, l: 50 };

  const dots = useMemo<Dot[]>(() => {
    const me = padFile[String(well.id)];
    const st = me ? stations(me) : [];
    if (st.length < 3) return [];
    const P = projection(well.sLat, well.sLon);
    const land = landing(st), td = st[st.length - 1];
    const len = Math.hypot(td.e - land.e, td.n - land.n) || 1;
    const ux = (td.e - land.e) / len, uy = (td.n - land.n) / len;
    const mid = at(st, (land.md + td.md) / 2);
    const out: Dot[] = [{ w: well, off: 0, tvd: mid.tvd }];
    for (const w of wells) {
      if (w.id === well.id || w.traj !== "HORIZONTAL") continue;
      let x: number, y: number, tvd: number;
      const pw = w.pad === well.pad ? padFile[String(w.id)] : undefined;
      const ws = pw ? stations(pw) : [];
      if (ws.length > 2) {
        const m = at(ws, (landing(ws).md + ws[ws.length - 1].md) / 2);
        x = P.x(w.sLon) + m.e; y = P.y(w.sLat) + m.n; tvd = m.tvd;
      } else {
        [x, y] = estimateLateral(P, w, [ux, uy]).mid; tvd = w.tvd;
      }
      const dx = x - mid.e, dy = y - mid.n;
      const along = dx * ux + dy * uy, off = dx * uy - dy * ux;
      if (Math.abs(along) < len / 2 + 1500 && Math.abs(off) <= 2640) out.push({ w, off, tvd });
    }
    return out;
  }, [wells, well, padFile]);

  if (!dots.length) return <div ref={ref} className="wb-plot wb-empty">No survey for this well.</div>;

  const R = Math.min(2640, Math.max(900, ...dots.map((d) => Math.abs(d.off))) + 180);
  const lo = Math.min(...dots.map((d) => d.tvd)) - 60, hi = Math.max(...dots.map((d) => d.tvd)) + 60;
  const X = (off: number) => pad.l + ((off + R) / (2 * R)) * (W - pad.l - pad.r);
  const Y = (tvd: number) => pad.t + ((tvd - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const me = dots[0];
  const same = dots.filter((d) => d.w.id !== well.id && d.w.fm === well.fm);
  const left = same.filter((d) => d.off < 0).sort((a, b) => b.off - a.off)[0];
  const right = same.filter((d) => d.off > 0).sort((a, b) => a.off - b.off)[0];
  const tickStep = R > 1500 ? 1000 : 500;
  const ticks: number[] = [];
  for (let t = -Math.floor(R / tickStep) * tickStep; t <= R; t += tickStep) ticks.push(t);

  return (
    <div ref={ref} className="wb-plot">
      <svg width={W} height={H} role="img" aria-label={`Spacing around ${well.name}: neighbouring laterals by distance across strike and landing depth`}>
        <defs><clipPath id="wb-spclip"><rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} /></clipPath></defs>
        <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="var(--wb-overburden)" />
        <g clipPath="url(#wb-spclip)">
          {col.map((c) => (
            <g key={c.fm.id}>
              <rect x={pad.l} y={Y(c.top)} width={W - pad.l - pad.r} height={Math.max(0, Y(c.base) - Y(c.top))} fill={fmColor(c.fm.name)} opacity={0.2} />
              <line x1={pad.l} x2={W - pad.r} y1={Y(c.top)} y2={Y(c.top)} stroke="var(--wb-ink)" strokeWidth={0.7} opacity={0.35} strokeDasharray={c.projected ? "5 4" : undefined} />
              {Y(c.base) - Y(c.top) > 12 ? <text x={pad.l + 5} y={Y(c.top) + 11} className="wb-sub">{proper(c.fm.name)}</text> : null}
            </g>
          ))}
        </g>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={H - pad.b} y2={H - pad.b + 4} stroke="var(--rule-strong)" />
            <text x={X(t)} y={H - pad.b + 15} textAnchor="middle" className="wb-tick">{t === 0 ? "0" : `${t > 0 ? "+" : "−"}${n0(Math.abs(t))}`}</text>
          </g>
        ))}
        <text x={pad.l - 6} y={pad.t + 8} textAnchor="end" className="wb-sub">ft TVD</text>
        <text x={pad.l - 6} y={Y(me.tvd)} textAnchor="end" dominantBaseline="middle" className="wb-tick">{n0(me.tvd)}</text>

        {[left, right].map((nb) => nb ? (
          <g key={nb.w.id}>
            <path d={`M${X(0)},${Y(me.tvd)}L${X(nb.off)},${Y(nb.tvd)}`} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={(X(0) + X(nb.off)) / 2} y={(Y(me.tvd) + Y(nb.tvd)) / 2 - 6} textAnchor="middle" className="wb-callout-t">{`${n0(Math.abs(nb.off))} ft`}</text>
          </g>
        ) : null)}

        {dots.slice(1).map((d) => (
          <g key={d.w.id} className="wb-hit" onClick={() => onSelect(d.w)} role="button" tabIndex={0} aria-label={`Select ${d.w.name}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(d.w); } }}>
            <title>{`${d.w.name} · ${d.w.fm} · ${d.w.rel} · ${n0(Math.abs(d.off))} ft across strike · click to select`}</title>
            <circle cx={X(d.off)} cy={Y(d.tvd)} r={11} fill="transparent" />
            <circle cx={X(d.off)} cy={Y(d.tvd)} r={5} fill={fmColor(d.w.fm)} stroke="var(--panel)" strokeWidth={1.5} />
            {d.w.pad === well.pad ? <text x={X(d.off)} y={Y(d.tvd) - 9} textAnchor="middle" className="wb-sub">{shortName(d.w.name)}</text> : null}
          </g>
        ))}
        <circle cx={X(0)} cy={Y(me.tvd)} r={8.5} fill="none" stroke="var(--ink)" strokeWidth={2} />
        <circle cx={X(0)} cy={Y(me.tvd)} r={5} fill={fmColor(well.fm)} stroke="var(--panel)" strokeWidth={1.5} />
        <text x={X(0)} y={Y(me.tvd) + 21} textAnchor="middle" className="wb-callout-t">{shortName(well.name)}</text>
      </svg>
    </div>
  );
}
