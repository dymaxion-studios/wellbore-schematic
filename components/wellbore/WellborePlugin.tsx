"use client";
import { client } from "@sigmacomputing/plugin";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DJ_FORMATIONS, DJ_THICKNESS, inDJ, registerTargets, type Catalog, type Formation, type PadFile, type Well } from "./data";
import WellboreView from "./WellboreView";

/**
 * Wellbore schematic as a Sigma plugin: the same drawing as the standalone page,
 * on live rows from Sigma elements instead of the baked extract.
 *
 * Binding is by element, not by column. The author picks four tables in the
 * editor panel and the plugin finds the columns it needs by name, so there are
 * four pickers to set instead of forty.
 *
 *   wells    one row per well (header, location, completion summary)
 *   survey   directional survey, filtered to the selected well by the control
 *   stages   completion stages, same filter
 *   tops     formation tops with formation names, same filter
 *   well     the control holding the selected well's name
 *   onSelect optional action to run after a well is picked in the schematic
 *
 * Picking a well in the schematic sets the control, which refilters the three
 * tables, which redraws the schematic: the loop runs through Sigma.
 *
 * Verified in a workbook (2026-11-19): Sigma addresses bound elements, the
 * control and the action trigger by the config value, not the config name.
 * Asking by name raises an error toast in the workbook.
 */
type Rows = Record<string, unknown[]>;
type Cols = Record<string, { id: string; name: string; columnType: string }>;
interface Bound { data: Rows; cols: Cols }

/**
 * Sigma sends a plugin rows only for columns named in its config (verified
 * 2026-11-19: with an element bound and no columns chosen, the column list
 * arrives and the data stays empty). So each table has a multi-column entry,
 * and the plugin fills it in itself by matching these names when the author
 * binds the table. The author can still change the selection by hand.
 */
const NEEDS: Record<string, string[]> = {
  wells: ["Well Id", "Well Name", "Api Number", "Operator Name", "Pad Id", "Formation", "Relationship", "Well Status", "Trajectory Type",
    "Lateral Length Ft", "Well Spacing Ft", "Proppant Lb per Ft", "Fluid Bbl per Ft", "Stage Count", "Fluid System",
    "Surface Latitude", "Surface Longitude", "Bh Latitude", "Bh Longitude", "Total Tvd Ft", "Total Md Ft", "Kb Elevation Ft",
    "Artificial Lift Type", "First Prod Date", "EUR Oil Bbl", "County", "State"],
  survey: ["Well Name", "Md Ft", "Tvd Ft", "Inclination Deg", "Azimuth Deg", "Northing Ft", "Easting Ft", "Dls Deg 100 Ft"],
  stages: ["Well Name", "Stage No", "Top Md Ft", "Base Md Ft"],
  tops: ["Well Name", "Formation Id", "Formation Name", "Strat Order", "Is Target", "Top Md Ft", "Top Tvd Ft"],
};
const colsKey = (k: string) => `${k}Columns`;

client.config.configureEditorPanel([
  { name: "wells", type: "element", label: "Wells (one row per well)" },
  { name: colsKey("wells"), type: "column", source: "wells", allowMultiple: true, label: "Wells columns (filled in automatically)" },
  { name: "survey", type: "element", label: "Directional survey (selected well)" },
  { name: colsKey("survey"), type: "column", source: "survey", allowMultiple: true, label: "Survey columns (filled in automatically)" },
  { name: "stages", type: "element", label: "Completion stages (selected well)" },
  { name: colsKey("stages"), type: "column", source: "stages", allowMultiple: true, label: "Stage columns (filled in automatically)" },
  { name: "tops", type: "element", label: "Formation tops (selected well)" },
  { name: colsKey("tops"), type: "column", source: "tops", allowMultiple: true, label: "Tops columns (filled in automatically)" },
  { name: "well", type: "variable", label: "Well control", allowedTypes: ["text", "text-list"] },
  { name: "onSelect", type: "action-trigger", label: "After a well is picked" },
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Subscribes to one bound element. */
function useBound(key: string, value: unknown): Bound {
  const [state, setState] = useState<Bound>({ data: {}, cols: {} });
  useEffect(() => {
    // Sigma addresses a bound element by the config value (a plugin-scoped id).
    // Verified 2026-11-19: asking by the config name raises "No such element".
    const ids = typeof value === "string" && value ? [value] : [];
    const offs: (() => void)[] = [];
    const gotCols = (cols: unknown) => { if (cols && typeof cols === "object" && Object.keys(cols).length) setState((s) => ({ ...s, cols: cols as Cols })); };
    for (const id of ids) {
      try {
        offs.push(client.elements.subscribeToElementColumns(id, gotCols));
        offs.push(client.elements.subscribeToElementData(id, (data) => { if (data && Object.keys(data).length) setState((s) => ({ ...s, data: data as Rows })); }));
      } catch { /* Sigma does not know that id */ }
    }
    // The subscription does not always deliver the first column list (seen
    // 2026-11-19: two of four tables never got one), so ask until it arrives.
    let tries = 0, got = false, timer: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      if (got || !ids.length || tries++ > 40) return;
      for (const id of ids) {
        client.elements.getElementColumns(id).then((cols) => {
          if (cols && Object.keys(cols).length) { got = true; gotCols(cols); }
        }).catch(() => undefined);
      }
      timer = setTimeout(ask, 1500);
    };
    ask();
    return () => { got = true; if (timer) clearTimeout(timer); offs.forEach((off) => { try { off(); } catch { /* already gone */ } }); };
  }, [key, value]);
  return state;
}

/** What has arrived for one binding, for the status readout while nothing draws. */
function status(label: string, value: unknown, b: Bound): string {
  const cols = Object.values(b.cols), keys = Object.keys(b.data);
  const rows = Math.max(0, ...Object.values(b.data).map((v) => (Array.isArray(v) ? v.length : 0)));
  const bound = typeof value === "string" ? value : value ? JSON.stringify(value).slice(0, 40) : "not set";
  return `${label}: bound to ${bound}; ${cols.length} columns${cols.length ? ` (${cols.slice(0, 4).map((c) => c.name).join(", ")}…)` : ""}; ${keys.length} data columns, ${rows} rows`;
}

/**
 * Names for a table's columns when Sigma sends its rows but never its column
 * list (seen 2026-11-19 for two of the four tables, cause unknown). The columns
 * in the plugin's setting are then read by position: the text column is the
 * well name, and the numeric ones are taken in the order listed in NEEDS. So
 * when picking such a table's columns by hand, pick the numeric ones in that order.
 */
function positional(key: string, ids: unknown, data: Rows): Cols {
  if (!Array.isArray(ids)) return {};
  const present = (ids as unknown[]).filter((id): id is string => typeof id === "string" && Array.isArray(data[id]));
  const isText = (id: string) => { const v = data[id].find((x) => x !== null && x !== undefined && x !== ""); return typeof v === "string" && !Number.isFinite(Number(v)); };
  const textNames: string[] = NEEDS[key].filter((n) => n === "Well Name" || n === "Formation Name");
  const numNames = NEEDS[key].filter((n) => !textNames.includes(n));
  const out: Cols = {};
  let t = 0, n = 0;
  for (const id of present) {
    const name = isText(id) ? textNames[t++] : numNames[n++];
    if (name) out[id] = { id, name, columnType: "text" };
  }
  return out;
}

/** A column's values by its display name, whatever its opaque id. */
function reader(b: Bound) {
  const byName = new Map<string, string>();
  for (const c of Object.values(b.cols)) byName.set(norm(c.name), c.id);
  const col = (...names: string[]): unknown[] => {
    for (const n of names) {
      const id = byName.get(norm(n));
      if (id && b.data[id]) return b.data[id];
    }
    return [];
  };
  const rows = Math.max(0, ...Object.values(b.data).map((v) => (Array.isArray(v) ? v.length : 0)));
  return { col, rows };
}

const num = (v: unknown): number | null => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const isoDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const varText = (v: unknown): string | null => {
  const raw = (v as { defaultValue?: { value?: unknown } } | undefined)?.defaultValue?.value;
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s === null || s === undefined || s === "" ? null : String(s);
};

export default function WellborePlugin() {
  const [config, setConfig] = useState<Record<string, unknown>>(() => (client.config.get() as Record<string, unknown> | undefined) ?? {});
  useEffect(() => client.config.subscribe((c) => setConfig({ ...(c as Record<string, unknown>) })), []);

  const wellsB = useBound("wells", config.wells);
  const surveyRaw = useBound("survey", config.survey);
  const stagesRaw = useBound("stages", config.stages);
  const topsB = useBound("tops", config.tops);
  const surveyCfg = config[colsKey("survey")], stagesCfg = config[colsKey("stages")];
  const surveyB = useMemo<Bound>(() => (Object.keys(surveyRaw.cols).length ? surveyRaw : { data: surveyRaw.data, cols: positional("survey", surveyCfg, surveyRaw.data) }), [surveyRaw, surveyCfg]);
  const stagesB = useMemo<Bound>(() => (Object.keys(stagesRaw.cols).length ? stagesRaw : { data: stagesRaw.data, cols: positional("stages", stagesCfg, stagesRaw.data) }), [stagesRaw, stagesCfg]);

  // Fill in each table's column selection by name, once its column list is known.
  useEffect(() => {
    const bounds: Record<string, Bound> = { wells: wellsB, survey: surveyRaw, stages: stagesRaw, tops: topsB };
    for (const key of Object.keys(NEEDS)) {
      const cols = Object.values(bounds[key].cols);
      if (!cols.length || typeof config[key] !== "string") continue;
      const byName = new Map(cols.map((c) => [norm(c.name), c.id]));
      const want = NEEDS[key].map((n) => byName.get(norm(n))).filter((id): id is string => !!id);
      const have = Array.isArray(config[colsKey(key)]) ? (config[colsKey(key)] as string[]) : [];
      if (want.length && want.some((id) => !have.includes(id))) {
        try { (client.config.setKey as (k: string, v: unknown) => void)(colsKey(key), [...new Set([...have, ...want])]); } catch { /* read-only here */ }
      }
    }
  }, [config, wellsB.cols, surveyRaw.cols, stagesRaw.cols, topsB.cols]); // eslint-disable-line react-hooks/exhaustive-deps

  // The control. Sigma addresses it by the config value; asking by the config name raises a toast in the workbook.
  const [controlValue, setControlValue] = useState<string | null>(null);
  const [varSource, setVarSource] = useState<string>("");
  const varIds = useMemo(() => (typeof config.well === "string" && config.well ? [config.well] : []), [config.well]);
  useEffect(() => {
    const offs: (() => void)[] = [];
    for (const id of varIds) {
      try {
        const now = varText(client.config.getVariable(id));
        if (now) { setControlValue(now); setVarSource((x) => (x.includes(`get:${id}`) ? x : `${x} get:${id}`)); }
        offs.push(client.config.subscribeToWorkbookVariable(id, (v) => { const t = varText(v); if (t) { setControlValue(t); setVarSource((x) => (x.includes(`sub:${id}`) ? x : `${x} sub:${id}`)); } }));
      } catch { /* that key is not one Sigma knows */ }
    }
    return () => offs.forEach((off) => { try { off(); } catch { /* already gone */ } });
  }, [varIds]);

  // What the schematic picked, held until the control echoes it back.
  const [picked, setPicked] = useState<string | null>(null);
  const pickedAt = useRef(0);

  const wells = useMemo<Well[]>(() => {
    const r = reader(wellsB);
    const c = {
      id: r.col("Well Id"), name: r.col("Well Name"), api: r.col("Api Number"), op: r.col("Operator Name"), pad: r.col("Pad Id"),
      fm: r.col("Formation", "Target Formation", "Formation Name"), rel: r.col("Relationship", "Parent Child Flag"), status: r.col("Well Status"),
      traj: r.col("Trajectory Type"), lateral: r.col("Lateral Length Ft"), spacing: r.col("Well Spacing Ft"), propFt: r.col("Proppant Lb per Ft"),
      fluidFt: r.col("Fluid Bbl per Ft"), stages: r.col("Stage Count"), clusters: r.col("Clusters per Stage"), fluidSystem: r.col("Fluid System"),
      sLat: r.col("Surface Latitude"), sLon: r.col("Surface Longitude"), bLat: r.col("Bh Latitude"), bLon: r.col("Bh Longitude"),
      tvd: r.col("Total Tvd Ft"), md: r.col("Total Md Ft"), kb: r.col("Kb Elevation Ft"), lift: r.col("Artificial Lift Type"),
      firstProd: r.col("First Prod Date"), eur: r.col("EUR Oil Bbl"), county: r.col("County"), state: r.col("State"),
    };
    const out: Well[] = [];
    for (let i = 0; i < r.rows; i++) {
      const id = num(c.id[i]), sLat = num(c.sLat[i]), sLon = num(c.sLon[i]);
      if (id === null || sLat === null || sLon === null) continue;
      out.push({
        id, name: text(c.name[i]), api: text(c.api[i]), op: text(c.op[i]), pad: text(c.pad[i]), fm: text(c.fm[i]).toUpperCase(), vintage: null,
        firstProd: isoDate(c.firstProd[i]), spud: null, completed: null, status: text(c.status[i]), traj: text(c.traj[i]).toUpperCase() || ((num(c.lateral[i]) ?? 0) > 0 ? "HORIZONTAL" : ""), rel: text(c.rel[i]),
        lateral: num(c.lateral[i]), spacing: num(c.spacing[i]), propFt: num(c.propFt[i]), fluidFt: num(c.fluidFt[i]), stages: num(c.stages[i]),
        clusters: num(c.clusters[i]), fluidSystem: text(c.fluidSystem[i]) || null, topPerf: null, basePerf: null,
        sLat, sLon, bLat: num(c.bLat[i]) ?? sLat, bLon: num(c.bLon[i]) ?? sLon, tvd: num(c.tvd[i]) ?? 0, md: num(c.md[i]) ?? 0, kb: num(c.kb[i]) ?? 0,
        lift: text(c.lift[i]) || null, cumOil: null, peak: null, rate: null, eur: num(c.eur[i]), cum12k: null,
        county: text(c.county[i]), state: text(c.state[i]), field: "",
      });
    }
    return out;
  }, [wellsB]);

  const selectedName = picked && Date.now() - pickedAt.current < 15_000 ? picked : controlValue;
  const well = useMemo(() => {
    const k = selectedName?.trim().toUpperCase();
    return (k ? wells.find((w) => w.name.toUpperCase() === k) ?? wells.find((w) => String(w.id) === k) : undefined) ?? null;
  }, [wells, selectedName]);

  // Survey, stages and tops for the selected well, in the shape the view expects.
  const padFile = useMemo<PadFile | null>(() => {
    if (!well) return null;
    const mine = (names: unknown[], i: number) => !names.length || text(names[i]).toUpperCase() === well.name.toUpperCase();

    const s = reader(surveyB);
    const sName = s.col("Well Name"), md = s.col("Md Ft"), tvd = s.col("Tvd Ft"), inc = s.col("Inclination Deg"), azi = s.col("Azimuth Deg"),
      nn = s.col("Northing Ft"), ee = s.col("Easting Ft"), dls = s.col("Dls Deg 100 Ft", "Dls Deg 100ft");
    const st: { md: number; tvd: number; inc: number; azi: number; n: number; e: number; dls: number }[] = [];
    for (let i = 0; i < s.rows; i++) {
      const m = num(md[i]), t = num(tvd[i]);
      if (m === null || t === null || !mine(sName, i)) continue;
      st.push({ md: m, tvd: t, inc: num(inc[i]) ?? 0, azi: num(azi[i]) ?? 0, n: num(nn[i]) ?? 0, e: num(ee[i]) ?? 0, dls: num(dls[i]) ?? 0 });
    }
    st.sort((a, b) => a.md - b.md);
    // More stations than one well has means the control is not filtering the table yet.
    if (st.length < 3 || st.length > 2000) return {};

    const g = reader(stagesB);
    const gName = g.col("Well Name"), gNo = g.col("Stage No"), gTop = g.col("Top Md Ft"), gBase = g.col("Base Md Ft");
    const stages: { no: number; a: number; b: number }[] = [];
    for (let i = 0; i < g.rows; i++) {
      const a = num(gTop[i]), b = num(gBase[i]);
      if (a !== null && b !== null && mine(gName, i)) stages.push({ no: num(gNo[i]) ?? i + 1, a, b });
    }
    stages.sort((x, y) => x.no - y.no);

    const t = reader(topsB);
    const tName = t.col("Well Name"), fId = t.col("Formation Id"), tMd = t.col("Top Md Ft"), tTvd = t.col("Top Tvd Ft");
    const tops: [number, number, number][] = [];
    for (let i = 0; i < t.rows; i++) {
      const id = num(fId[i]), m = num(tMd[i]), v = num(tTvd[i]);
      if (id !== null && v !== null && mine(tName, i)) tops.push([id, m ?? v, v]);
    }
    tops.sort((x, y) => x[2] - y[2]);

    return {
      [String(well.id)]: {
        survey: { md: st.map((x) => x.md), tvd: st.map((x) => x.tvd), inc: st.map((x) => x.inc), azi: st.map((x) => x.azi), n: st.map((x) => x.n), e: st.map((x) => x.e), dls: st.map((x) => x.dls) },
        stages: stages.slice(0, 400).map((x) => [x.a, x.b] as [number, number]),
        tops,
      },
    };
  }, [well, surveyB, stagesB, topsB]);

  // Formation names and order come from the tops table where it has them.
  const cat = useMemo<Catalog>(() => {
    const t = reader(topsB);
    const fId = t.col("Formation Id"), fName = t.col("Formation Name"), ord = t.col("Strat Order"), target = t.col("Is Target");
    // The built-in DJ Basin column (names, order and regional thicknesses) is
    // only a starting point when the tops are DJ Basin formations. For any other
    // basin the column is exactly what the tops table holds.
    const djNames = new Set(DJ_FORMATIONS.map((f) => f.name));
    const dj = fName.some((n) => djNames.has(text(n).toUpperCase()));
    const seen = new Map<number, Formation>(dj ? DJ_FORMATIONS.map((f) => [f.id, f]) : []);
    const yes = (v: unknown) => v === true || v === 1 || ["true", "1", "y", "yes"].includes(text(v).toLowerCase());
    for (let i = 0; i < t.rows; i++) {
      const id = num(fId[i]);
      if (id === null || !text(fName[i])) continue;
      const base = seen.get(id);
      seen.set(id, { id, name: text(fName[i]).toUpperCase(), ord: num(ord[i]) ?? base?.ord ?? id, color: base?.color ?? "#888", target: target.length ? yes(target[i]) : base?.target ?? false });
    }
    registerTargets([...wells.map((w) => w.fm), ...[...seen.values()].filter((f) => f.target).map((f) => f.name)]);
    return { generated: "", source: "Sigma", formations: [...seen.values()].sort((a, b) => a.ord - b.ord), thickness: dj ? DJ_THICKNESS : {}, wells };
  }, [topsB, wells]);

  const select = useCallback((w: Well) => {
    pickedAt.current = Date.now();
    setPicked(w.name);
    for (const id of varIds) { try { client.config.setVariable(id, w.name); } catch { /* not that key */ } }
    for (const id of typeof config.onSelect === "string" && config.onSelect ? [config.onSelect] : []) {
      try { client.config.triggerAction(id); } catch { /* no action bound */ }
    }
  }, [varIds, config.onSelect]);

  // Once the control catches up with the pick, the control is the truth again.
  useEffect(() => { if (picked && controlValue && controlValue.toUpperCase() === picked.toUpperCase()) setPicked(null); }, [picked, controlValue]);

  if (!config.wells && !wells.length) {
    return (
      <div className="wb-root wb-center">
        <div>
          <p style={{ fontWeight: 650, color: "var(--ink)", margin: "0 0 6px" }}>Wellbore schematic</p>
          <p style={{ margin: 0, maxWidth: 420 }}>In the editor panel, pick the four source tables (wells, directional survey, completion stages, formation tops) and the Well control. Columns are matched by name.</p>
        </div>
      </div>
    );
  }
  if (!wells.length) {
    return (
      <div className="wb-root wb-center">
        <div style={{ textAlign: "left", fontSize: 12, lineHeight: 1.6 }}>
          <p style={{ fontWeight: 650, color: "var(--ink)", margin: "0 0 6px" }}>Waiting for wells from Sigma</p>
          {[status("Wells", config.wells, wellsB), status("Survey", config.survey, surveyB), status("Stages", config.stages, stagesB), status("Tops", config.tops, topsB)].map((t) => <div key={t}>{t}</div>)}
          <div>{`Column settings: ${Object.keys(NEEDS).map((k) => `${k} ${Array.isArray(config[colsKey(k)]) ? (config[colsKey(k)] as unknown[]).length : 0}/${NEEDS[k].length}`).join(", ")}; environment ${client.sigmaEnv}`}</div>
          <div>{`Well control: ${typeof config.well === "string" ? config.well : "not set"}; value ${controlValue ?? "none yet"}; answered by${varSource || " nothing yet"}`}</div>
        </div>
      </div>
    );
  }
  if (!well) return <div className="wb-root wb-center">Pick a well in the Well control to draw it.</div>;

  return (
    <WellboreView
      cat={cat}
      well={well}
      padFile={padFile}
      onSelect={select}
      diagnostics={[status("Survey", config.survey, surveyB), status("Stages", config.stages, stagesB), status("Tops", config.tops, topsB),
        `Survey data keys: ${Object.keys(surveyB.data).slice(0, 9).join(", ") || "none"}; survey column setting: ${JSON.stringify(config[colsKey("survey")] ?? null).slice(0, 160)}`]}
      footer={`Live from Sigma: wells, directional survey, completion stages and formation tops. The aquifer interval and casing program are typical values shown for illustration; neighbouring laterals are placed from their bottom hole and lateral length.${inDJ(well.sLat, well.sLon) ? " Towns, river and highways are real and drawn approximately." : ""}`}
    />
  );
}
