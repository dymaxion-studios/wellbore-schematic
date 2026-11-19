/**
 * Data and geometry for the wellbore schematic. The sample extract in
 * public/wellbore holds synthetic wells and surveys modeled on the DJ Basin
 * (Weld County, Colorado). For wells in that area the map also draws real
 * towns, rivers and highways, approximately; anywhere else it draws the wells
 * on a plain one-mile grid.
 */
export interface Formation { id: number; name: string; ord: number; color: string; target: boolean }

export interface Well {
  id: number; name: string; api: string; op: string; pad: string; fm: string; vintage: number | null;
  firstProd: string | null; spud: string | null; completed: string | null; status: string; traj: string; rel: string;
  lateral: number | null; spacing: number | null; propFt: number | null; fluidFt: number | null; stages: number | null;
  clusters: number | null; fluidSystem: string | null; topPerf: number | null; basePerf: number | null;
  sLat: number; sLon: number; bLat: number; bLon: number; tvd: number; md: number; kb: number; lift: string | null;
  cumOil: number | null; peak: number | null; rate: number | null; eur: number | null; cum12k: number | null;
  county: string; state: string; field: string;
}

export interface Catalog { generated: string; source: string; formations: Formation[]; thickness: Record<string, number>; wells: Well[] }

export interface PadWell {
  survey: { md: number[]; tvd: number[]; inc: number[]; azi: number[]; n: number[]; e: number[]; dls: number[] } | null;
  stages: [number, number][];
  tops: [number, number, number][]; // formation id, top MD, top TVD
}
export type PadFile = Record<string, PadWell>;

export interface Station { md: number; tvd: number; inc: number; azi: number; n: number; e: number; dls: number; hd: number }

export interface Top { fm: Formation; top: number; base: number; projected: boolean }

const BASE = "/wellbore";
let catalogP: Promise<Catalog> | null = null;
const padP = new Map<string, Promise<PadFile>>();

export function loadCatalog(): Promise<Catalog> {
  catalogP ??= fetch(`${BASE}/wells.json`).then((r) => { if (!r.ok) throw new Error("wells"); return r.json(); });
  return catalogP;
}
export function loadPad(pad: string): Promise<PadFile> {
  let p = padP.get(pad);
  if (!p) {
    p = fetch(`${BASE}/pads/${encodeURIComponent(pad)}.json`).then((r) => { if (!r.ok) throw new Error("pad"); return r.json(); });
    padP.set(pad, p);
  }
  return p;
}

/**
 * Stations with horizontal displacement for the section view. Displacement is
 * integrated from inclination (measured depth times the sine of the angle), so
 * a vertical hole plots vertical. The survey's own northing and easting drift
 * sideways down the vertical section in this synthetic data, which is fine on
 * the map (wells fan out from the pad) but would tilt the section.
 */
export function stations(w: PadWell): Station[] {
  const s = w.survey;
  if (!s) return [];
  const out: Station[] = [];
  let hd = 0;
  for (let i = 0; i < s.md.length; i++) {
    if (i > 0) hd += (s.md[i] - s.md[i - 1]) * Math.sin((((s.inc[i] + s.inc[i - 1]) / 2) * Math.PI) / 180);
    out.push({ md: s.md[i], tvd: s.tvd[i], inc: s.inc[i], azi: s.azi[i], n: s.n[i], e: s.e[i], dls: s.dls[i], hd });
  }
  return out;
}

/** Linear interpolation of a station at a measured depth. */
export function at(st: Station[], md: number): Station {
  if (md <= st[0].md) return st[0];
  for (let i = 1; i < st.length; i++) {
    if (md <= st[i].md) {
      const a = st[i - 1], b = st[i], t = (md - a.md) / (b.md - a.md || 1);
      const mix = (x: number, y: number) => x + (y - x) * t;
      return { md, tvd: mix(a.tvd, b.tvd), inc: mix(a.inc, b.inc), azi: b.azi, n: mix(a.n, b.n), e: mix(a.e, b.e), dls: b.dls, hd: mix(a.hd, b.hd) };
    }
  }
  return st[st.length - 1];
}

export const kickoff = (st: Station[]) => st.find((s) => s.inc > 3) ?? st[0];
export const landing = (st: Station[]) => st.find((s) => s.inc >= 87) ?? st[st.length - 1];

/**
 * The stratigraphic column at a well: its picked tops, then the formations it
 * never reached, projected below TD with the regional median thickness.
 */
export function column(cat: Catalog, w: PadWell): Top[] {
  const byId = new Map(cat.formations.map((f) => [f.id, f]));
  const picked = new Map(w.tops.map(([id, , tvd]) => [id, tvd]));
  const out: Top[] = [];
  let prevTop: number | null = null, prevId: number | null = null, prevProjected = false;
  for (const f of [...cat.formations].sort((a, b) => a.ord - b.ord)) {
    let top = picked.get(f.id);
    let projected = false;
    if (top === undefined) {
      if (prevTop === null || prevId === null) continue;
      top = prevTop + (cat.thickness[String(prevId)] ?? 100);
      projected = true;
    }
    if (out.length) out[out.length - 1].base = top;
    out.push({ fm: byId.get(f.id)!, top, base: top + (cat.thickness[String(f.id)] ?? 120), projected });
    prevTop = top; prevId = f.id; prevProjected = projected;
  }
  void prevProjected;
  // A well never drills out of the bench it lands in, so that bench's base is
  // never picked. Where the regional thickness would put the projected base
  // above the lateral itself, push the projected tops down to clear it: the
  // well is the better evidence of where the bench is.
  const firstProjected = out.findIndex((t) => t.projected);
  const deepest = w.survey ? Math.max(...w.survey.tvd) : null;
  if (firstProjected > 0 && deepest !== null) {
    const shift = deepest + 12 - out[firstProjected].top;
    if (shift > 0) {
      for (let i = firstProjected; i < out.length; i++) { out[i].top += shift; out[i].base += shift; }
      out[firstProjected - 1].base = out[firstProjected].top;
    }
  }
  return out;
}

/** Share of the lateral (inclination at least 85 degrees) that sits inside the target formation. */
export function inZone(st: Station[], col: Top[], target: string): number | null {
  const t = col.find((c) => c.fm.name === target);
  const lat = st.filter((s) => s.inc >= 85);
  if (!t || lat.length < 2) return null;
  return lat.filter((s) => s.tvd >= t.top && s.tvd < t.base).length / lat.length;
}

/**
 * The DJ Basin column and its regional thicknesses (median gap between
 * consecutive tops across the 490 wells, computed 2026-11-18). The plugin uses
 * these to project the formations below a well's total depth, since Sigma only
 * sends it the tops of the selected well.
 */
export const DJ_FORMATIONS: Formation[] = [
  { id: 1, name: "PIERRE SHALE", ord: 1, color: "#8C8C8C", target: false },
  { id: 2, name: "SHARON SPRINGS", ord: 2, color: "#5E5E5E", target: false },
  { id: 3, name: "NIOBRARA A", ord: 3, color: "#F2C94C", target: true },
  { id: 4, name: "NIOBRARA B", ord: 4, color: "#F2994A", target: true },
  { id: 5, name: "NIOBRARA C", ord: 5, color: "#EB5757", target: true },
  { id: 6, name: "FORT HAYS", ord: 6, color: "#56CCF2", target: false },
  { id: 7, name: "CODELL", ord: 7, color: "#27AE60", target: true },
  { id: 8, name: "CARLILE", ord: 8, color: "#9B51E0", target: false },
];
export const DJ_THICKNESS: Record<string, number> = { "1": 2449.7, "2": 130.4, "3": 80, "4": 89.7, "5": 90.5, "6": 34.5, "7": 20.1 };

/* ---------- map projection: local feet around an origin ---------- */
const FT_PER_DEG_LAT = 364_000;
export interface Proj { x: (lon: number) => number; y: (lat: number) => number; lat0: number; lon0: number }
export function projection(lat0: number, lon0: number): Proj {
  const k = Math.cos((lat0 * Math.PI) / 180) * 365_220;
  return { x: (lon) => (lon - lon0) * k, y: (lat) => (lat - lat0) * FT_PER_DEG_LAT, lat0, lon0 };
}

/** Unit vector (east, north) along a surveyed well's lateral, heel to toe. */
export function lateralDir(st: Station[]): [number, number] | null {
  if (st.length < 3) return null;
  const a = landing(st), b = st[st.length - 1];
  const len = Math.hypot(b.e - a.e, b.n - a.n);
  return len > 50 ? [(b.e - a.e) / len, (b.n - a.n) / len] : null;
}

/**
 * Where a well's lateral runs when its survey is not to hand: back from the
 * bottom hole by the lateral length, parallel to a surveyed neighbour. Wells on
 * a pad are drilled parallel, so this places the heel and the mid-lateral far
 * better than a straight line from surface to bottom hole.
 */
export function estimateLateral(P: Proj, w: Well, dir: [number, number] | null): { path: [number, number][]; mid: [number, number] } {
  const s: [number, number] = [P.x(w.sLon), P.y(w.sLat)], b: [number, number] = [P.x(w.bLon), P.y(w.bLat)];
  const L = w.lateral ?? 0;
  if (!dir || L < 200) return { path: [s, b], mid: [(s[0] + b[0]) / 2, (s[1] + b[1]) / 2] };
  const sign = (b[0] - s[0]) * dir[0] + (b[1] - s[1]) * dir[1] >= 0 ? 1 : -1;
  const heel: [number, number] = [b[0] - sign * dir[0] * L, b[1] - sign * dir[1] * L];
  return { path: [s, heel, b], mid: [(heel[0] + b[0]) / 2, (heel[1] + b[1]) / 2] };
}

/**
 * Approximate public land survey location from latitude and longitude, off the
 * 40th-parallel base line and the Sixth Principal Meridian. Good to roughly a
 * section; shown as "approx." and never used for anything but a label.
 */
export function plss(lat: number, lon: number): { township: number; range: number; section: number } {
  const MI = 5280;
  const north = ((lat - 40) * FT_PER_DEG_LAT) / MI;
  const west = ((-97.3667 - lon) * Math.cos((lat * Math.PI) / 180) * 365_220) / MI;
  const township = Math.floor(north / 6) + 1, range = Math.floor(west / 6) + 1;
  const row = 5 - Math.min(5, Math.max(0, Math.floor(north - (township - 1) * 6))); // 0 = north row
  const colFromEast = Math.min(5, Math.max(0, Math.floor(west - (range - 1) * 6)));
  const section = row % 2 === 0 ? row * 6 + colFromEast + 1 : row * 6 + (5 - colFromEast) + 1;
  return { township, range, section };
}

/* ---------- real geography, drawn approximately ---------- */
/**
 * True for a location inside the area the built-in geography covers (the DJ
 * Basin around Weld County, Colorado). Towns, rivers, highways, the locator
 * inset and the township and section labels are only drawn there.
 */
export const inDJ = (lat: number, lon: number) => lat > 39.9 && lat < 40.65 && lon > -105.15 && lon < -104.2;

export const TOWNS: { name: string; lat: number; lon: number; major?: boolean }[] = [
  { name: "Greeley", lat: 40.4233, lon: -104.7091, major: true },
  { name: "Evans", lat: 40.3764, lon: -104.6922 },
  { name: "LaSalle", lat: 40.3489, lon: -104.7019 },
  { name: "Kersey", lat: 40.3875, lon: -104.5616 },
  { name: "Gilcrest", lat: 40.2819, lon: -104.7778 },
  { name: "Platteville", lat: 40.215, lon: -104.8228 },
  { name: "Milliken", lat: 40.3294, lon: -104.8553 },
  { name: "Johnstown", lat: 40.3369, lon: -104.9122 },
  { name: "Fort Lupton", lat: 40.0847, lon: -104.813 },
  { name: "Hudson", lat: 40.0736, lon: -104.6431 },
  { name: "Keenesburg", lat: 40.1083, lon: -104.5197 },
];
export const SOUTH_PLATTE: [number, number][] = [
  [40.085, -104.822], [40.15, -104.83], [40.215, -104.835], [40.262, -104.806], [40.29, -104.762], [40.318, -104.728],
  [40.352, -104.714], [40.366, -104.69], [40.378, -104.645], [40.392, -104.6], [40.404, -104.556], [40.412, -104.49],
];
export const CACHE_LA_POUDRE: [number, number][] = [[40.48, -104.9], [40.462, -104.8], [40.44, -104.7], [40.428, -104.64], [40.404, -104.58]];
export const US85: [number, number][] = [[40.085, -104.8], [40.215, -104.822], [40.282, -104.778], [40.349, -104.702], [40.376, -104.692], [40.42, -104.69], [40.53, -104.711]];
export const US34: [number, number][] = [[40.405, -104.93], [40.398, -104.78], [40.395, -104.69], [40.388, -104.562], [40.372, -104.42]];

/* ---------- display helpers ---------- */
export const ft = (v: number | null | undefined) => (v == null ? "n/a" : `${Math.round(v).toLocaleString("en-US")} ft`);
export const n0 = (v: number | null | undefined) => (v == null ? "n/a" : Math.round(v).toLocaleString("en-US"));
export const proper = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
/** "PAD-001 B01H" to "B01H". */
export const shortName = (name: string) => name.split(" ").slice(1).join(" ") || name;

/** Formations to colour as targets when their name is not one of the built-in ones. */
const TARGETS = new Set<string>();
export function registerTargets(names: Iterable<string>) { for (const n of names) if (n) TARGETS.add(n.toUpperCase()); }
const PALETTE = ["var(--f1)", "var(--f2)", "var(--f3)", "var(--f4)", "var(--f5)", "var(--f6)"];
function hashed(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Colour for a formation: fixed for the DJ Basin benches, a stable palette pick for any other target, grey for the rest. */
export function fmColor(name: string): string {
  switch (name) {
    case "NIOBRARA A": return "var(--f1)";
    case "NIOBRARA B": return "var(--f2)";
    case "NIOBRARA C": return "var(--f3)";
    case "CODELL": return "var(--f4)";
    case "FORT HAYS": return "var(--chalk)";
    case "SHARON SPRINGS": return "var(--wb-shale-dark)";
    case "CARLILE": return "var(--wb-shale-mid)";
    default: return TARGETS.has(name) ? hashed(name) : "var(--wb-shale)";
  }
}
export function lithology(name: string): "chalk" | "sand" | "shale" | "blackshale" | "lime" {
  if (name.startsWith("NIOBRARA")) return "chalk";
  if (name === "CODELL") return "sand";
  if (name === "FORT HAYS") return "lime";
  if (name === "SHARON SPRINGS") return "blackshale";
  if (/CHALK/.test(name)) return "chalk";
  if (/SAND|\bSS\b/.test(name)) return "sand";
  if (/LIME|\bLS\b|CARBONATE|DOLO/.test(name)) return "lime";
  return "shale";
}
