"use client";
import { useMemo } from "react";
import { CACHE_LA_POUDRE, estimateLateral, fmColor, inDJ, proper, landing, lateralDir, plss, projection, shortName, SOUTH_PLATTE, stations, TOWNS, US34, US85, type PadFile, type Well } from "./data";
import { useSize } from "./useSize";

/**
 * Plan view. The selected pad's wells are drawn from their directional
 * surveys, so the step-out from the pad shows; every other well is a straight
 * stick from surface to bottom hole. The grid is an approximate one-mile
 * grid. For wells in the DJ Basin (see inDJ) the grid carries approximate
 * township and section labels, and the map and its locator show real towns,
 * the South Platte and two highways, drawn approximately. Anywhere else the
 * map is the wells on a plain one-mile grid.
 */
const MI = 5280;
const LOC = { lat0: 40.05, lat1: 40.47, lon0: -104.95, lon1: -104.45 };

export type MapScope = "pad" | "area";

export default function AreaMap({ wells, well, padFile, onSelect, scope }: { wells: Well[]; well: Well; padFile: PadFile; onSelect: (w: Well) => void; scope: MapScope }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const W = Math.max(240, size.w), H = Math.max(220, size.h);

  const g = useMemo(() => {
    const P = projection(well.sLat, well.sLon);
    const pts: [number, number][] = [[0, 0], [P.x(well.bLon), P.y(well.bLat)]];
    const padLines: { w: Well; d: [number, number][]; heel: [number, number] | null }[] = [];
    const mine = padFile[String(well.id)];
    const dir = mine ? lateralDir(stations(mine)) : null;
    for (const w of wells.filter((x) => x.pad === well.pad)) {
      const pw = padFile[String(w.id)];
      const st = pw ? stations(pw) : [];
      const ox = P.x(w.sLon), oy = P.y(w.sLat);
      const d = st.length ? st.map((s) => [ox + s.e, oy + s.n] as [number, number]) : estimateLateral(P, w, dir).path;
      const h = st.length ? landing(st) : null;
      padLines.push({ w, d, heel: h ? [ox + h.e, oy + h.n] : null });
      for (const p of d) pts.push(p);
    }
    if (scope === "area" && inDJ(well.sLat, well.sLon)) {
      // The whole asset, with room for Greeley to the north and Fort Lupton to the south.
      const x0 = P.x(-104.9), x1 = P.x(-104.47), y0 = P.y(40.07), y1 = P.y(40.46);
      return { P, padLines, dir, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, half: Math.max(x1 - x0, y1 - y0) / 2 };
    }
    if (scope === "area") {
      // Every well within about 30 miles, so one stray location cannot shrink the rest to a dot.
      const near = wells.filter((w) => Math.hypot(P.x(w.sLon), P.y(w.sLat)) < 30 * MI);
      const ax = [...near.map((w) => P.x(w.sLon)), ...near.map((w) => P.x(w.bLon)), 0], ay = [...near.map((w) => P.y(w.sLat)), ...near.map((w) => P.y(w.bLat)), 0];
      const x0 = Math.min(...ax), x1 = Math.max(...ax), y0 = Math.min(...ay), y1 = Math.max(...ay);
      return { P, padLines, dir, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, half: Math.max(1.5 * MI, (x1 - x0) / 2 + MI, (y1 - y0) / 2 + MI) };
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = Math.max(1.15 * MI, (Math.max(...xs) - Math.min(...xs)) / 2 + 0.5 * MI, (Math.max(...ys) - Math.min(...ys)) / 2 + 0.5 * MI);
    return { P, padLines, dir, cx, cy, half };
  }, [wells, well, padFile, scope]);
  const area = scope === "area";
  const dj = inDJ(well.sLat, well.sLon);

  const { P, padLines, dir, cx, cy, half } = g;
  const k = Math.min(W, H) / (2 * half);
  const X = (x: number) => W / 2 + (x - cx) * k;
  const Y = (y: number) => H / 2 - (y - cy) * k;
  const halfX = W / 2 / k, halfY = H / 2 / k;
  const inView = (x: number, y: number, m = 0) => Math.abs(x - cx) < halfX + m && Math.abs(y - cy) < halfY + m;

  // One-mile grid on the approximate survey lines.
  const grid = useMemo(() => {
    const kLon = Math.cos((well.sLat * Math.PI) / 180) * 365_220;
    const westMi = (lon: number) => ((-97.3667 - lon) * kLon) / MI, northMi = (lat: number) => ((lat - 40) * 364_000) / MI;
    const lonOf = (mi: number) => -97.3667 - (mi * MI) / kLon, latOf = (mi: number) => 40 + (mi * MI) / 364_000;
    const lonL = P.lon0 + (cx - halfX) / kLon, lonR = P.lon0 + (cx + halfX) / kLon;
    const latB = P.lat0 + (cy - halfY) / 364_000, latT = P.lat0 + (cy + halfY) / 364_000;
    const v: { x: number; twp: boolean }[] = [], h: { y: number; twp: boolean }[] = [];
    for (let m = Math.floor(westMi(lonR)); m <= Math.ceil(westMi(lonL)); m++) v.push({ x: P.x(lonOf(m)), twp: m % 6 === 0 });
    for (let m = Math.floor(northMi(latB)); m <= Math.ceil(northMi(latT)); m++) h.push({ y: P.y(latOf(m)), twp: m % 6 === 0 });
    const cells: { x: number; y: number; n: number }[] = [];
    for (let a = Math.floor(westMi(lonR)); a < Math.ceil(westMi(lonL)); a++) {
      for (let b = Math.floor(northMi(latB)); b < Math.ceil(northMi(latT)); b++) {
        const lat = latOf(b + 0.5), lon = lonOf(a + 0.5);
        cells.push({ x: P.x(lon), y: P.y(lat), n: plss(lat, lon).section });
      }
    }
    // Township labels at each township's north-west corner.
    const twps: { x: number; y: number; label: string }[] = [];
    for (let a = Math.floor(westMi(lonR) / 6) * 6; a <= westMi(lonL) + 6; a += 6) {
      for (let b = Math.floor(northMi(latB) / 6) * 6; b <= northMi(latT) + 6; b += 6) {
        twps.push({ x: P.x(lonOf(a + 6)), y: P.y(latOf(b + 6)), label: `T${b / 6 + 1}N R${a / 6 + 1}W` });
      }
    }
    return { v, h, cells, twps };
  }, [P, cx, cy, halfX, halfY, well.sLat]);

  const others = wells.filter((w) => w.pad !== well.pad && w.traj === "HORIZONTAL" && (inView(P.x(w.sLon), P.y(w.sLat), MI) || inView(P.x(w.bLon), P.y(w.bLat), MI)));
  const pads = useMemo(() => {
    const m = new Map<string, Well>();
    for (const w of wells) if (!m.has(w.pad)) m.set(w.pad, w);
    return [...m.values()];
  }, [wells]);
  const poly = (ll: [number, number][]) => ll.map(([lat, lon], i) => `${i ? "L" : "M"}${X(P.x(lon)).toFixed(1)},${Y(P.y(lat)).toFixed(1)}`).join("");
  const here = plss(well.sLat, well.sLon);
  const barFt = area ? 6 * MI : k * MI > 150 ? MI / 2 : MI;

  // locator inset
  const iw = Math.min(176, W * 0.44), ih = iw * 0.86;
  const LX = (lon: number) => ((lon - LOC.lon0) / (LOC.lon1 - LOC.lon0)) * iw;
  const LY = (lat: number) => ih - ((lat - LOC.lat0) / (LOC.lat1 - LOC.lat0)) * ih;
  const lpoly = (ll: [number, number][]) => ll.map(([lat, lon], i) => `${i ? "L" : "M"}${LX(lon).toFixed(1)},${LY(lat).toFixed(1)}`).join("");
  // Put the locator in the first corner the selected well does not pass through; hide it if none is free.
  const selPts = [...(padLines.find((l) => l.w.id === well.id)?.d ?? []), [0, 0] as [number, number]];
  const corners: { x: number; y: number; name: "bl" | "br" | "tr" }[] = [
    { x: 8, y: H - ih - 8, name: "bl" }, { x: W - iw - 8, y: H - ih - 8, name: "br" }, { x: W - iw - 8, y: 26, name: "tr" },
  ];
  const free = area || !dj ? undefined : corners.find((c) => !selPts.some(([x, y]) => X(x) > c.x - 26 && X(x) < c.x + iw + 26 && Y(y) > c.y - 22 && Y(y) < c.y + ih + 22));
  const locX = free?.x ?? 8, locY = free?.y ?? 0;
  const blocked = free?.name === "br";
  const kLon0 = Math.cos((well.sLat * Math.PI) / 180) * 365_220;
  const winLon = (x: number) => P.lon0 + x / kLon0, winLat = (y: number) => P.lat0 + y / 364_000;

  return (
    <div ref={ref} className="wb-plot wb-map">
      <svg width={W} height={H} role="img" aria-label={dj ? `Map of ${well.pad} and neighbouring wells near ${nearestTown(well)}, Weld County, Colorado` : `Map of ${well.pad} and neighbouring wells`}>
        <rect width={W} height={H} fill="var(--wb-land)" />
        {grid.v.filter((l) => !area || l.twp).map((l, i) => <line key={`v${i}`} x1={X(l.x)} x2={X(l.x)} y1={0} y2={H} stroke="var(--wb-grid)" strokeWidth={l.twp ? 1.6 : 0.8} />)}
        {grid.h.filter((l) => !area || l.twp).map((l, i) => <line key={`h${i}`} x1={0} x2={W} y1={Y(l.y)} y2={Y(l.y)} stroke="var(--wb-grid)" strokeWidth={l.twp ? 1.6 : 0.8} />)}
        {area && dj ? grid.twps.map((t, i) => <text key={i} x={X(t.x) + 5} y={Y(t.y) + 13} className="wb-sec">{t.label}</text>) : null}
        {!area && dj && k * MI > 54 ? grid.cells.map((c, i) => <text key={i} x={X(c.x)} y={Y(c.y)} textAnchor="middle" dominantBaseline="middle" className="wb-sec">{c.n}</text>) : null}

        {dj ? <g>
        <path d={poly(SOUTH_PLATTE)} fill="none" stroke="var(--water)" strokeWidth={3} opacity={0.5} strokeLinecap="round" strokeLinejoin="round" />
        <path d={poly(CACHE_LA_POUDRE)} fill="none" stroke="var(--water)" strokeWidth={2} opacity={0.45} />
        <path d={poly(US85)} fill="none" stroke="var(--wb-road)" strokeWidth={2.2} />
        <path d={poly(US34)} fill="none" stroke="var(--wb-road)" strokeWidth={2.2} />
        {area ? (
          <g>
            <text x={X(P.x(-104.655))} y={Y(P.y(40.372)) + 16} className="wb-water-t">South Platte River</text>
            <text x={X(P.x(-104.79))} y={Y(P.y(40.455)) - 5} className="wb-water-t">Cache la Poudre</text>
            <text x={X(P.x(-104.797))} y={Y(P.y(40.25))} className="wb-road-t" textAnchor="end">US 85</text>
            <text x={X(P.x(-104.61))} y={Y(P.y(40.391)) - 6} className="wb-road-t">US 34</text>
          </g>
        ) : null}
        {TOWNS.filter((t) => inView(P.x(t.lon), P.y(t.lat))).map((t) => (
          <g key={t.name}>
            <rect x={X(P.x(t.lon)) - 3} y={Y(P.y(t.lat)) - 3} width={6} height={6} fill="var(--muted)" />
            <text x={X(P.x(t.lon)) + 7} y={Y(P.y(t.lat)) + 4} className="wb-town">{t.name}</text>
          </g>
        ))}
        </g> : null}

        {/* neighbouring wells: straight sticks */}
        {others.map((w) => {
          const d = estimateLateral(P, w, dir).path.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("");
          return (
            <g key={w.id} className="wb-hit" onClick={() => onSelect(w)} role="button" tabIndex={0} aria-label={`Select ${w.name}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(w); } }}>
              <title>{`${w.name} · ${w.fm} · click to select`}</title>
              <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
              <path d={d} fill="none" stroke={fmColor(w.fm)} strokeWidth={area ? 1 : 1.6} opacity={0.6} />
            </g>
          );
        })}
        {pads.filter((p) => p.pad !== well.pad && inView(P.x(p.sLon), P.y(p.sLat))).map((p) => (
          <g key={p.pad} className={area ? "wb-hit" : undefined} onClick={area ? () => onSelect(firstHorizontal(wells, p.pad) ?? p) : undefined}>
            {area ? <title>{`${p.pad} · click to select`}</title> : null}
            <rect x={X(P.x(p.sLon)) - (area ? 3 : 4)} y={Y(P.y(p.sLat)) - (area ? 3 : 4)} width={area ? 6 : 8} height={area ? 6 : 8} fill="var(--panel)" stroke="var(--muted)" strokeWidth={1.2} />
            {k * MI > 70 ? <text x={X(P.x(p.sLon)) + 7} y={Y(P.y(p.sLat)) - 6} className="wb-sub">{p.pad}</text> : null}
          </g>
        ))}

        {/* this pad: surveyed paths */}
        {padLines.filter((l) => l.w.id !== well.id).map((l) => (
          <g key={l.w.id} className="wb-hit" onClick={() => onSelect(l.w)} role="button" tabIndex={0} aria-label={`Select ${l.w.name}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(l.w); } }}>
            <title>{`${l.w.name} · ${l.w.fm} · click to select`}</title>
            <path d={l.d.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("")} fill="none" stroke="transparent" strokeWidth={10} />
            <path d={l.d.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("")} fill="none" stroke={fmColor(l.w.fm)} strokeWidth={2.2} />
          </g>
        ))}
        {padLines.filter((l) => l.w.id === well.id).map((l) => {
          const toe = l.d[l.d.length - 1];
          return (
            <g key="sel">
              <path d={l.d.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("")} fill="none" stroke="var(--panel)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
              <path d={l.d.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("")} fill="none" stroke="var(--ink)" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
              {l.heel ? <circle cx={X(l.heel[0])} cy={Y(l.heel[1])} r={4} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.6} /> : null}
              <circle cx={X(toe[0])} cy={Y(toe[1])} r={4} fill="var(--ink)" />
              <text x={X(toe[0]) + 8} y={Y(toe[1]) + 4} className="wb-callout-t">{shortName(well.name)}</text>
            </g>
          );
        })}
        <rect x={X(0) - 6} y={Y(0) - 6} width={12} height={12} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
        <text x={X(0) + 10} y={Y(0) + 15} className="wb-callout-t">{well.pad}</text>

        {/* legal location, north arrow, scale */}
        <text x={10} y={18} className="wb-callout-t">{!dj ? [well.county ? `${proper(well.county)} County` : "", well.state].filter(Boolean).join(", ") : area ? "Weld County, Colorado · townships approximate" : `T${here.township}N R${here.range}W, section ${here.section} (approx.)`}</text>
        <g transform={`translate(${free?.name === "tr" ? W - iw - 30 : W - 26},${30})`}>
          <path d="M0 -16L6 6L0 2L-6 6Z" fill="var(--ink)" /><text x={0} y={19} textAnchor="middle" className="wb-callout-t">N</text>
        </g>
        <g transform={`translate(${blocked ? 16 : W - 16 - barFt * k},${H - 16})`}>
          <path d={`M0 -5V0H${barFt * k}V-5`} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
          <text x={(barFt * k) / 2} y={-7} textAnchor="middle" className="wb-sub">{barFt === MI ? "1 mile" : barFt > MI ? "6 miles" : "½ mile"}</text>
        </g>

        {/* locator */}
        <g transform={`translate(${locX},${locY})`} display={free ? undefined : "none"}>
          <rect width={iw} height={ih} rx={6} fill="var(--panel)" stroke="var(--rule-strong)" />
          <clipPath id="wb-loc"><rect width={iw} height={ih} rx={6} /></clipPath>
          <g clipPath="url(#wb-loc)">
            <path d={lpoly(SOUTH_PLATTE)} fill="none" stroke="var(--water)" strokeWidth={1.6} opacity={0.6} />
            <path d={lpoly(CACHE_LA_POUDRE)} fill="none" stroke="var(--water)" strokeWidth={1.2} opacity={0.5} />
            <path d={lpoly(US85)} fill="none" stroke="var(--wb-road)" strokeWidth={1.1} />
            <path d={lpoly(US34)} fill="none" stroke="var(--wb-road)" strokeWidth={1.1} />
            {pads.map((p) => <circle key={p.pad} cx={LX(p.sLon)} cy={LY(p.sLat)} r={1.5} fill={p.pad === well.pad ? "var(--accent)" : "var(--faint)"} />)}
            {TOWNS.filter((t) => ["Greeley", "Kersey", "Platteville", "Fort Lupton", "Keenesburg"].includes(t.name)).map((t) => (
              <text key={t.name} x={LX(t.lon) + 3} y={LY(t.lat) + 3} className="wb-loc-t">{t.name}</text>
            ))}
            <rect x={LX(winLon(cx - halfX))} y={LY(winLat(cy + halfY))} width={Math.max(5, LX(winLon(cx + halfX)) - LX(winLon(cx - halfX)))} height={Math.max(5, LY(winLat(cy - halfY)) - LY(winLat(cy + halfY)))} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
          </g>
          <text x={6} y={12} className="wb-loc-t wb-loc-h">Weld County, Colorado</text>
        </g>
      </svg>
    </div>
  );
}

function firstHorizontal(wells: Well[], pad: string): Well | undefined {
  return wells.find((w) => w.pad === pad && w.traj === "HORIZONTAL");
}

export function nearestTown(w: Well): string {
  let best = TOWNS[0], bd = Infinity;
  for (const t of TOWNS) {
    const d = Math.hypot((t.lat - w.sLat) * 69, (t.lon - w.sLon) * 53);
    if (d < bd) { bd = d; best = t; }
  }
  return best.name;
}

/** "3 mi SE of LaSalle", or nothing outside the area the built-in towns cover. */
export function whereabouts(w: Well): string {
  if (!inDJ(w.sLat, w.sLon)) return "";
  let best = TOWNS[0], bd = Infinity;
  for (const t of TOWNS) {
    const d = Math.hypot((t.lat - w.sLat) * 69, (t.lon - w.sLon) * 53);
    if (d < bd) { bd = d; best = t; }
  }
  const dy = (w.sLat - best.lat) * 69, dx = (w.sLon - best.lon) * 53;
  const dirs = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
  const dir = dirs[Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) / 45) % 8];
  return bd < 0.7 ? `at ${best.name}` : `${bd < 10 ? bd.toFixed(1) : Math.round(bd)} mi ${dir} of ${best.name}`;
}
