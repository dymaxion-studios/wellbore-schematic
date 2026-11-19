"use client";
import { at, fmColor, landing, lithology, n0, proper, type Station, type Top, type Well } from "./data";
import { useSize } from "./useSize";

/**
 * The lateral, close up: true vertical depth against measured depth from the
 * heel to the toe, with the target bench and its neighbours as bands. This is
 * the geosteering view: did the well stay in zone, and where are the stages.
 * Bench tops are the picks at this well, drawn flat; there is no structure
 * surface in the model.
 */
export default function ZoneStrip({ well, st, col, stages }: { well: Well; st: Station[]; col: Top[]; stages: [number, number][] }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const W = Math.max(300, size.w), H = Math.max(120, size.h);
  const pad = { t: 10, r: 16, b: 40, l: 58 };
  const land = landing(st), td = st[st.length - 1];
  const target = col.find((c) => c.fm.name === well.fm);
  if (!target || td.md - land.md < 200) return <div ref={ref} className="wb-plot wb-empty">No lateral to show for this well.</div>;

  const m0 = land.md - 120, m1 = td.md + 40;
  const lat = st.filter((s) => s.md >= m0);
  const lo = Math.min(target.top, ...lat.map((s) => s.tvd)) - 22;
  const hi = Math.max(target.base, ...lat.map((s) => s.tvd)) + 22;
  const X = (md: number) => pad.l + ((md - m0) / (m1 - m0)) * (W - pad.l - pad.r);
  const Y = (tvd: number) => pad.t + ((tvd - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = [at(st, m0), ...lat].map((s, i) => `${i ? "L" : "M"}${X(s.md).toFixed(1)},${Y(s.tvd).toFixed(1)}`).join("");
  const railY = H - pad.b + 8;
  const step = stages.length > 40 ? 10 : stages.length > 20 ? 5 : 4;
  const yTicks = [target.top, target.base].filter((d) => d > lo && d < hi);

  return (
    <div ref={ref} className="wb-plot">
      <svg width={W} height={H} role="img" aria-label={`Lateral of ${well.name} in true vertical depth against measured depth, with the ${proper(well.fm)} bench and completion stages`}>
        <defs><clipPath id="wb-zoneclip"><rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} /></clipPath></defs>
        <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="var(--wb-overburden)" />
        <g clipPath="url(#wb-zoneclip)">
          {col.map((c) => (
            <g key={c.fm.id}>
              <rect x={pad.l} y={Y(c.top)} width={W - pad.l - pad.r} height={Math.max(0, Y(c.base) - Y(c.top))} fill={fmColor(c.fm.name)} opacity={c.fm.name === well.fm ? 0.42 : 0.2} />
              <rect x={pad.l} y={Y(c.top)} width={W - pad.l - pad.r} height={Math.max(0, Y(c.base) - Y(c.top))} fill={`url(#wb-${lithology(c.fm.name)})`} />
              <line x1={pad.l} x2={W - pad.r} y1={Y(c.top)} y2={Y(c.top)} stroke="var(--wb-ink)" strokeWidth={0.8} opacity={0.4} strokeDasharray={c.projected ? "5 4" : undefined} />
              {Y(c.base) - Y(c.top) > 13 ? <text x={W - pad.r - 6} y={Y(c.top) + 12} textAnchor="end" className={`wb-fm${c.fm.name === well.fm ? " on" : ""}`}>{proper(c.fm.name)}</text> : null}
            </g>
          ))}
          <path d={line} fill="none" stroke="var(--panel)" strokeWidth={5} strokeLinejoin="round" />
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" />
        </g>
        {yTicks.map((d) => (
          <text key={d} x={pad.l - 6} y={Y(d)} textAnchor="end" dominantBaseline="middle" className="wb-tick">{n0(d)}</text>
        ))}
        <text x={pad.l - 6} y={pad.t + 6} textAnchor="end" className="wb-sub">ft TVD</text>

        {/* stage rail */}
        {stages.map(([a, b], i) => {
          const x1 = X(Math.min(a, b)), x2 = X(Math.max(a, b));
          const no = i + 1;
          return (
            <g key={i}>
              <rect x={x1 + 0.5} y={railY} width={Math.max(1, x2 - x1 - 1)} height={9} rx={2} fill={i % 2 ? "var(--accent)" : "var(--brand)"}>
                <title>{`Stage ${no}: ${n0(Math.min(a, b))} to ${n0(Math.max(a, b))} ft MD`}</title>
              </rect>
              {no === 1 || no % step === 0 ? <text x={(x1 + x2) / 2} y={railY + 21} textAnchor="middle" className="wb-tick">{no}</text> : null}
            </g>
          );
        })}
        <text x={pad.l - 6} y={railY + 8} textAnchor="end" className="wb-sub">Stages</text>
        <text x={X(land.md)} y={pad.t + 12} className="wb-callout-t" textAnchor="start">{`Heel ${n0(land.md)} ft`}</text>
        <text x={X(td.md)} y={H - pad.b - 5} className="wb-callout-t" textAnchor="end">{`Toe ${n0(td.md)} ft MD`}</text>
      </svg>
    </div>
  );
}
