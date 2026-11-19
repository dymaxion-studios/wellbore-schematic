"use client";
import { useMemo, useState } from "react";
import { at, fmColor, ft, inDJ, kickoff, landing, lithology, n0, proper, type Station, type Top, type Well } from "./data";
import { useSize } from "./useSize";

/**
 * The well in section: surface, aquifer, the stratigraphic column, the casing
 * strings, the build and the lateral with its completion stages.
 *
 * The depth axis is deliberately not to scale. A Wattenberg well spends
 * thousands of feet in shale to reach a target a few tens of feet thick, so a
 * true-scale drawing shows the target as a hairline. The axis is piecewise:
 * the overburden is compressed and the target interval expanded, with real
 * depths on the ticks and a break mark where the scale changes.
 *
 * Illustrative, not from the well file: the aquifer interval and the casing
 * program (a typical two-string design). Both are labelled as such.
 */
const AQUIFER_BASE = 1100;
const SURFACE_SHOE = 1500;
const CONDUCTOR = 80;

export type ColorMode = "stages" | "dogleg";

const dlsColor = (d: number) => (d < 2 ? "var(--good)" : d < 4 ? "var(--warn)" : d < 8 ? "var(--f3)" : "var(--bad)");

export default function Section({ well, st, col, stages, colorMode }: { well: Well; st: Station[]; col: Top[]; stages: [number, number][]; colorMode: ColorMode }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<Station | null>(null);

  const W = Math.max(320, size.w), H = Math.max(260, size.h);
  const narrow = W < 620;
  const gutter = narrow ? 104 : 158;
  const nameW = gutter - 46; // formation names; the depth ticks get the rest
  const pad = { t: 70, r: 18, b: 34, l: gutter };
  const plotH = H - pad.t - pad.b;
  const x0 = pad.l + (narrow ? 30 : 46);
  const plotR = W - pad.r;

  const kop = kickoff(st), land = landing(st), td = st[st.length - 1];
  // Depth anchors for the piecewise axis: [depth, fraction of plot height].
  const anchors = useMemo(() => {
    const zoneTop = col.find((c) => c.fm.name === "SHARON SPRINGS")?.top ?? land.tvd - 300;
    const bottom = Math.max((col[col.length - 1]?.top ?? land.tvd) + 45, td.tvd + 60);
    const a = Math.min(SURFACE_SHOE + 250, zoneTop - 900);
    const k = Math.min(Math.max(a + 250, kop.tvd - 160), zoneTop - 220);
    return [[0, 0], [a, 0.17], [k, 0.25], [zoneTop, 0.5], [bottom, 1]] as [number, number][];
  }, [col, kop.tvd, land.tvd, td.tvd]);

  const Y = (d: number) => {
    const A = anchors;
    if (d <= 0) return pad.t;
    for (let i = 1; i < A.length; i++) {
      if (d <= A[i][0]) {
        const t = (d - A[i - 1][0]) / (A[i][0] - A[i - 1][0]);
        return pad.t + (A[i - 1][1] + t * (A[i][1] - A[i - 1][1])) * plotH;
      }
    }
    return pad.t + plotH;
  };
  const maxHd = Math.max(1, td.hd);
  const X = (hd: number) => x0 + (hd / maxHd) * (plotR - x0 - 34);

  const pts = st.map((s) => [X(s.hd), Y(s.tvd)] as const);
  const pathD = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const sub = (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const mid = st.filter((s) => s.md > lo && s.md < hi);
    return [at(st, lo), ...mid, at(st, hi)].map((s, i) => `${i ? "L" : "M"}${X(s.hd).toFixed(1)},${Y(s.tvd).toFixed(1)}`).join("");
  };

  const ticks = useMemo(() => {
    const out: number[] = [];
    const [a, k, z, b] = [anchors[1][0], anchors[2][0], anchors[3][0], anchors[4][0]];
    for (let d = 0; d <= a; d += 500) out.push(d);
    for (let d = Math.ceil(k / 250) * 250; d < z - 60; d += 250) out.push(d);
    const step = ((plotH * 0.5) / Math.max(1, b - z)) * 50 < 15 ? 100 : 50;
    for (let d = Math.ceil(z / step) * step; d <= b; d += step) out.push(d);
    return out;
  }, [anchors, plotH]);

  const clusters = Math.max(1, well.clusters ?? 3);
  const perfs = useMemo(() => {
    const out: Station[] = [];
    for (const [a, b] of stages) {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (let c = 0; c < clusters; c++) out.push(at(st, lo + ((c + 0.5) / clusters) * (hi - lo)));
    }
    return out;
  }, [stages, clusters, st]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best: Station | null = null, bd = 28 * 28;
    for (let i = 0; i < st.length; i++) {
      const dx = pts[i][0] - mx, dy = pts[i][1] - my, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = st[i]; }
    }
    setHover(best);
  };
  const fmAt = (tvd: number) => col.find((c) => tvd >= c.top && tvd < c.base)?.fm.name ?? (tvd < (col[0]?.top ?? 0) ? "Overburden" : "");

  const groundY = Y(0);
  const breakY = (Y(anchors[1][0]) + Y(anchors[2][0])) / 2;
  const zig = (y: number) => {
    let d = `M${pad.l},${y}`;
    for (let x = pad.l, i = 0; x < plotR; x += 9, i++) d += `L${Math.min(plotR, x + 9)},${y + (i % 2 ? 3 : -3)}`;
    return d;
  };
  const latMidX = (X(land.hd) + X(td.hd)) / 2;
  const underY = Math.min(H - 8, Math.max(Y(land.tvd), Y(td.tvd)) + 30);
  const rod = well.lift === "ROD PUMP";

  return (
    <div ref={ref} className="wb-plot">
      <svg width={W} height={H} role="img" aria-label={`Section view of ${well.name}: surface to total depth with formations, casing and completion stages`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="wb-shale" width="14" height="6" patternUnits="userSpaceOnUse"><path d="M0 3h8" stroke="var(--wb-ink)" strokeWidth="0.8" opacity="0.28" /></pattern>
          <pattern id="wb-blackshale" width="9" height="4" patternUnits="userSpaceOnUse"><path d="M0 2h6" stroke="var(--wb-ink)" strokeWidth="1" opacity="0.5" /></pattern>
          <pattern id="wb-chalk" width="22" height="12" patternUnits="userSpaceOnUse"><path d="M0 0h22M0 6h22M6 0v6M17 6v6" stroke="var(--wb-ink)" strokeWidth="0.7" opacity="0.26" fill="none" /></pattern>
          <pattern id="wb-lime" width="18" height="9" patternUnits="userSpaceOnUse"><path d="M0 0h18M0 4.5h18M5 0v4.5M13 4.5v4.5" stroke="var(--wb-ink)" strokeWidth="0.7" opacity="0.32" fill="none" /></pattern>
          <pattern id="wb-sand" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.9" fill="var(--wb-ink)" opacity="0.4" /><circle cx="6" cy="6" r="0.9" fill="var(--wb-ink)" opacity="0.4" /></pattern>
          <pattern id="wb-water" width="16" height="8" patternUnits="userSpaceOnUse"><path d="M0 4q4-4 8 0t8 0" stroke="var(--water)" strokeWidth="0.9" fill="none" opacity="0.55" /></pattern>
          <pattern id="wb-cement" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 5L5 0" stroke="var(--wb-ink)" strokeWidth="0.7" opacity="0.5" /></pattern>
          <linearGradient id="wb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--wb-sky-1)" /><stop offset="1" stopColor="var(--wb-sky-2)" /></linearGradient>
          <clipPath id="wb-plotclip"><rect x={pad.l} y={pad.t} width={plotR - pad.l} height={plotH} /></clipPath>
        </defs>

        {/* sky and overburden */}
        <rect x={pad.l} y={0} width={plotR - pad.l} height={groundY} fill="url(#wb-sky)" />
        <rect x={pad.l} y={groundY} width={plotR - pad.l} height={plotH} fill="var(--wb-overburden)" />
        <rect x={pad.l} y={groundY} width={plotR - pad.l} height={Y(AQUIFER_BASE) - groundY} fill="url(#wb-water)" />
        <text x={plotR - 8} y={Y(AQUIFER_BASE) - 6} textAnchor="end" className="wb-note">{inDJ(well.sLat, well.sLon) ? "Freshwater aquifers, Laramie–Fox Hills (typical depth)" : "Freshwater aquifer (typical depth, for illustration)"}</text>

        {/* formations */}
        <g clipPath="url(#wb-plotclip)">
          {col.map((c) => {
            const y1 = Y(c.top), y2 = Y(c.base);
            const isTarget = c.fm.name === well.fm;
            return (
              <g key={c.fm.id}>
                <rect x={pad.l} y={y1} width={plotR - pad.l} height={Math.max(0, y2 - y1)} fill={fmColor(c.fm.name)} opacity={isTarget ? 0.42 : c.fm.target ? 0.24 : 0.3} />
                <rect x={pad.l} y={y1} width={plotR - pad.l} height={Math.max(0, y2 - y1)} fill={`url(#wb-${lithology(c.fm.name)})`} />
                <line x1={pad.l} x2={plotR} y1={y1} y2={y1} stroke="var(--wb-ink)" strokeWidth={0.8} opacity={0.45} strokeDasharray={c.projected ? "5 4" : undefined} />
              </g>
            );
          })}
        </g>

        {/* formation names in the gutter */}
        <clipPath id="wb-nameclip"><rect x={0} y={0} width={nameW} height={H} /></clipPath>
        <g clipPath="url(#wb-nameclip)">
          {col.map((c) => {
            const y1 = Y(c.top), y2 = Math.min(Y(c.base), pad.t + plotH);
            if (y2 - y1 < 11) return null;
            const isTarget = c.fm.name === well.fm;
            const two = y2 - y1 > 25 && !narrow;
            return (
              <g key={`l${c.fm.id}`}>
                <rect x={6} y={y1 + 1.5} width={4} height={Math.max(2, y2 - y1 - 3)} rx={2} fill={fmColor(c.fm.name)} />
                <text x={15} y={(y1 + y2) / 2 + (two ? -5 : 1)} className={`wb-fm${isTarget ? " on" : ""}`} dominantBaseline="middle">{proper(c.fm.name)}</text>
                {two ? <text x={15} y={(y1 + y2) / 2 + 8} className="wb-sub" dominantBaseline="middle">{c.projected ? "projected" : isTarget ? `target, ${n0(c.base - c.top)} ft thick` : `top ${n0(c.top)} ft`}</text> : null}
              </g>
            );
          })}
          <text x={15} y={(groundY + Y(col[0]?.top ?? 2000)) / 2} className="wb-fm" dominantBaseline="middle">Overburden</text>
        </g>

        {/* depth axis */}
        {ticks.map((d) => (
          <g key={d}>
            <line x1={pad.l - 4} x2={pad.l} y1={Y(d)} y2={Y(d)} stroke="var(--rule-strong)" />
            <text x={pad.l - 7} y={Y(d)} textAnchor="end" dominantBaseline="middle" className="wb-tick">{n0(d)}</text>
          </g>
        ))}
        <path d={zig(breakY)} fill="none" stroke="var(--panel)" strokeWidth={5} />
        <path d={zig(breakY)} fill="none" stroke="var(--rule-strong)" strokeWidth={1} />
        <text x={plotR - 8} y={breakY - 7} textAnchor="end" className="wb-note">Depth axis not to scale: overburden compressed, target interval expanded</text>

        {/* surface */}
        <line x1={pad.l} x2={plotR} y1={groundY} y2={groundY} stroke="var(--wb-ground)" strokeWidth={2.5} />
        <rect x={x0 - 34} y={groundY - 3} width={narrow ? 86 : 132} height={3} fill="var(--wb-ink)" opacity={0.55} />
        {rod ? (
          <g transform={`translate(${x0},${groundY})`} stroke="var(--wb-ink)" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-2 -3L8 -30L18 -3M-13 -34L27 -26" /><path d="M-13 -34q-7 3 -5 11" /><path d="M-18 -23V-3" /><circle cx="24" cy="-12" r="5" /><path d="M24 -12L27 -26" />
          </g>
        ) : (
          <g transform={`translate(${x0},${groundY})`} stroke="var(--wb-ink)" strokeWidth={1.6} fill="var(--panel)" strokeLinejoin="round">
            <rect x={-4} y={-13} width={8} height={10} /><rect x={-7} y={-18} width={14} height={5} /><path d="M0 -18V-27M-9 -23H9" fill="none" /><circle cx={-9} cy={-23} r={2.4} /><circle cx={9} cy={-23} r={2.4} /><circle cx={0} cy={-29} r={2.6} />
          </g>
        )}
        {!narrow ? (
          <g transform={`translate(${x0 + 52},${groundY})`} stroke="var(--wb-ink)" strokeWidth={1.3} fill="var(--panel)">
            <rect x={0} y={-20} width={13} height={17} rx={1.5} /><rect x={17} y={-20} width={13} height={17} rx={1.5} /><rect x={34} y={-14} width={11} height={11} rx={1.5} />
          </g>
        ) : null}
        <text x={x0 - 34} y={groundY - 42} className="wb-callout-t">{well.pad}</text>
        <text x={x0 - 34} y={groundY - 54} className="wb-sub">{`KB ${n0(well.kb)} ft above sea level · ${proper(well.lift ?? "")}`}</text>

        {/* casing: conductor, surface string with cement, shoes */}
        <rect x={x0 - 13} y={groundY} width={26} height={Math.max(3, Y(CONDUCTOR) - groundY)} fill="var(--wb-pipe)" opacity={0.55} />
        <rect x={x0 - 11} y={groundY} width={22} height={Y(SURFACE_SHOE) - groundY} fill="url(#wb-cement)" />
        <rect x={x0 - 11} y={groundY} width={22} height={Y(SURFACE_SHOE) - groundY} fill="var(--wb-pipe)" opacity={0.14} />
        <path d={`M${x0 - 7},${groundY}V${Y(SURFACE_SHOE)}M${x0 + 7},${groundY}V${Y(SURFACE_SHOE)}`} stroke="var(--wb-pipe)" strokeWidth={2.2} />
        <path d={`M${x0 - 7},${Y(SURFACE_SHOE)}l-6,0l6,-8zM${x0 + 7},${Y(SURFACE_SHOE)}l6,0l-6,-8z`} fill="var(--wb-pipe)" />
        {!narrow ? (
          <g>
            <path d={`M${x0 + 15},${Y(SURFACE_SHOE) - 4}h22`} stroke="var(--faint)" />
            <text x={x0 + 41} y={Y(SURFACE_SHOE) - 6} className="wb-callout-t">Surface casing, cemented</text>
            <text x={x0 + 41} y={Y(SURFACE_SHOE) + 6} className="wb-sub">set below the aquifer (typical design)</text>
          </g>
        ) : null}

        {/* production string: the whole path */}
        <path d={pathD} fill="none" stroke="var(--wb-pipe)" strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathD} fill="none" stroke="var(--panel)" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />

        {colorMode === "dogleg"
          ? st.slice(1).map((s, i) => (
              <path key={i} d={`M${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}L${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`} stroke={dlsColor(s.dls)} strokeWidth={3.6} strokeLinecap="round" />
            ))
          : (
            <g>
              {perfs.map((p, i) => (
                <path key={`p${i}`} d={`M${X(p.hd).toFixed(1)},${(Y(p.tvd) - 13).toFixed(1)}V${(Y(p.tvd) + 13).toFixed(1)}`} stroke="var(--accent)" strokeWidth={1} opacity={0.5} />
              ))}
              {stages.map(([a, b], i) => (
                <path key={`s${i}`} d={sub(a, b)} fill="none" stroke={i % 2 ? "var(--accent)" : "var(--brand)"} strokeWidth={5.2} strokeLinecap="butt" />
              ))}
            </g>
          )}

        {/* lateral dimension */}
        {stages.length ? (
          <g>
            <path d={`M${X(land.hd)},${underY - 9}v6H${X(td.hd)}v-6`} fill="none" stroke="var(--muted)" strokeWidth={1} />
            <text x={latMidX} y={underY + 9} textAnchor="middle" className="wb-callout-t">
              {`Lateral ${n0(well.lateral)} ft · ${stages.length} stages${narrow ? "" : ` · ${clusters} perforation clusters per stage`}`}
            </text>
          </g>
        ) : null}

        {/* callouts */}
        {([["Kick-off", kop, -1], ["Landing (heel)", land, -1], ["Total depth (toe)", td, 1]] as const).map(([label, s, side]) => {
          const cx = X(s.hd), cy = Y(s.tvd);
          const lx = side < 0 ? cx + 12 : cx - 12;
          const ly = label === "Kick-off" ? cy - 4 : cy - 30;
          return (
            <g key={label}>
              <path d={`M${cx},${cy}L${lx},${ly + 4}`} stroke="var(--muted)" strokeWidth={1} />
              <circle cx={cx} cy={cy} r={4.5} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.6} />
              <text x={lx + (side < 0 ? 3 : -3)} y={ly} textAnchor={side < 0 ? "start" : "end"} className="wb-callout-t">{label}</text>
              <text x={lx + (side < 0 ? 3 : -3)} y={ly + 12} textAnchor={side < 0 ? "start" : "end"} className="wb-sub">{`${n0(s.md)} ft MD · ${n0(s.tvd)} ft TVD`}</text>
            </g>
          );
        })}
        {hover ? <circle cx={X(hover.hd)} cy={Y(hover.tvd)} r={6} fill="none" stroke="var(--ink)" strokeWidth={2} /> : null}
      </svg>
      {hover ? (
        <div className="wb-tip" style={{ left: Math.min(W - 190, X(hover.hd) + 14), top: Math.max(6, Y(hover.tvd) - 74) }}>
          <b>{ft(hover.md)} measured depth</b>
          <span>{ft(hover.tvd)} true vertical depth</span>
          <span>{`${hover.inc.toFixed(1)}° inclination · dogleg ${hover.dls.toFixed(1)}°/100 ft`}</span>
          <span>{proper(fmAt(hover.tvd))}</span>
        </div>
      ) : null}
    </div>
  );
}
