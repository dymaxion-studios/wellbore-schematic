"use client";
import { useMemo, useState } from "react";
import AreaMap, { whereabouts, type MapScope } from "./AreaMap";
import { column, fmColor, ft, inDJ, inZone, n0, plss, proper, stations, type Catalog, type PadFile, type Well } from "./data";
import Section, { type ColorMode } from "./Section";
import Spacing from "./Spacing";
import ZoneStrip from "./ZoneStrip";

/**
 * The schematic itself, with no opinion about where its data comes from.
 * WellboreApp feeds it the baked extract; WellborePlugin feeds it live rows
 * from Sigma elements. `padFile` holds surveys, stages and tops keyed by well
 * id: the whole pad from the extract, or just the selected well from Sigma.
 */
export interface WellboreViewProps {
  cat: Catalog;
  well: Well;
  padFile: PadFile | null;
  onSelect: (w: Well) => void;
  /** Shown as a "Review production" button when the host has somewhere to send the user. */
  onReview?: () => void;
  footer: string;
  /** Extra lines shown when there is nothing to draw, for telling why. */
  diagnostics?: string[];
}

export default function WellboreView({ cat, well, padFile, onSelect, onReview, footer, diagnostics }: WellboreViewProps) {
  const [mode, setMode] = useState<ColorMode>("stages");
  const [scope, setScope] = useState<MapScope>("pad");

  const pw = well && padFile ? padFile[String(well.id)] : undefined;
  const st = useMemo(() => (pw ? stations(pw) : []), [pw]);
  const col = useMemo(() => (cat && pw ? column(cat, pw) : []), [cat, pw]);

  const loc = plss(well.sLat, well.sLon);
  const share = st.length ? inZone(st, col, well.fm) : null;
  const horizontal = well.traj === "HORIZONTAL" && st.length > 3;
  const padWells = cat.wells.filter((w) => w.pad === well.pad);

  return (
    <div className="wb-root">
      <header className="wb-head">
        <div className="wb-title">
          <h1>{well.name}</h1>
          <p>
            {[
              proper(well.op),
              whereabouts(well),
              inDJ(well.sLat, well.sLon) ? `T${loc.township}N R${loc.range}W sec. ${loc.section} (approx.)` : "",
              [well.county ? `${proper(well.county)} County` : "", well.state].filter(Boolean).join(", "),
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="wb-chips">
          <span className="wb-chip"><i style={{ background: fmColor(well.fm) }} />{proper(well.fm)}</span>
          <span className="wb-chip">{proper(well.rel)} well</span>
          <span className="wb-chip">{proper(well.status)}</span>
          {share != null ? <span className={`wb-chip ${share >= 0.9 ? "good" : share >= 0.7 ? "warn" : "bad"}`}>{`${Math.round(share * 100)}% in zone`}</span> : null}
        </div>
        <div className="wb-tools">
          <label className="wb-pick">
            <span className="sr">Well</span>
            <select value={well.id} onChange={(e) => { const w = cat.wells.find((x) => x.id === Number(e.target.value)); if (w) onSelect(w); }}>
              <optgroup label={`${well.pad} (this pad)`}>
                {padWells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </optgroup>
              <optgroup label="All wells">
                {cat.wells.filter((w) => w.pad !== well.pad).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </optgroup>
            </select>
          </label>
          {onReview ? <button className="wb-btn" onClick={onReview}>Review production</button> : null}
        </div>
      </header>

      {!horizontal ? (
        <div className="wb-center wb-card" style={{ display: "block" }}>
          {!padFile ? "Loading the survey" : well.traj === "HORIZONTAL" ? `No directional survey has arrived for ${well.name} yet.` : `${well.name} is a vertical pilot well: there is no lateral to draw. Pick a horizontal well on the map or in the list.`}
          {diagnostics?.length ? <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.6, textAlign: "left" }}>{diagnostics.map((d) => <div key={d}>{d}</div>)}</div> : null}
        </div>
      ) : (
        <div className="wb-grid">
          <section className="wb-card wb-a" aria-label="Section view">
            <div className="wb-ch">
              <h2>Section: surface to total depth</h2>
              <div className="wb-seg" role="group" aria-label="Colour the lateral by">
                <button className={mode === "stages" ? "on" : ""} onClick={() => setMode("stages")} aria-pressed={mode === "stages"}>Completion stages</button>
                <button className={mode === "dogleg" ? "on" : ""} onClick={() => setMode("dogleg")} aria-pressed={mode === "dogleg"}>Dogleg severity</button>
              </div>
            </div>
            <Section well={well} st={st} col={col} stages={pw!.stages} colorMode={mode} />
            {mode === "dogleg" ? (
              <div className="wb-legend">
                <span><i style={{ background: "var(--good)" }} />under 2°/100 ft</span><span><i style={{ background: "var(--warn)" }} />2 to 4</span>
                <span><i style={{ background: "var(--f3)" }} />4 to 8</span><span><i style={{ background: "var(--bad)" }} />over 8</span>
              </div>
            ) : null}
          </section>

          <section className="wb-card wb-b" aria-label="Lateral in zone">
            <div className="wb-ch"><h2>Lateral in zone: heel to toe</h2><span className="wb-hint">True vertical depth against measured depth</span></div>
            <ZoneStrip well={well} st={st} col={col} stages={pw!.stages} />
          </section>

          <section className="wb-card wb-c" aria-label="Map">
            <div className="wb-ch">
              <h2>Where it is</h2>
              <div className="wb-seg" role="group" aria-label="Map extent">
                <button className={scope === "pad" ? "on" : ""} onClick={() => setScope("pad")} aria-pressed={scope === "pad"}>Pad</button>
                <button className={scope === "area" ? "on" : ""} onClick={() => setScope("area")} aria-pressed={scope === "area"}>Area</button>
              </div>
            </div>
            <AreaMap wells={cat.wells} well={well} padFile={padFile!} onSelect={onSelect} scope={scope} />
          </section>

          <section className="wb-card wb-d" aria-label="Spacing">
            <div className="wb-ch"><h2>Spacing: looking down the lateral</h2><span className="wb-hint">Feet across strike</span></div>
            <Spacing wells={cat.wells} well={well} padFile={padFile!} col={col} onSelect={onSelect} />
          </section>

          <section className="wb-card wb-e" aria-label="Completion">
            <dl className="wb-facts">
              <div><dt>Lateral</dt><dd>{ft(well.lateral)}</dd></div>
              <div><dt>Total depth</dt><dd>{well.md ? `${n0(well.md)} ft MD` : "n/a"}</dd></div>
              <div><dt>Stages</dt><dd>{well.clusters ? `${n0(well.stages)} × ${n0(well.clusters)} clusters` : n0(well.stages)}</dd></div>
              <div><dt>Proppant</dt><dd>{well.propFt == null ? "n/a" : `${n0(well.propFt)} lb/ft`}</dd></div>
              <div><dt>Fluid</dt><dd>{[`${n0(well.fluidFt)} bbl/ft`, (well.fluidSystem ?? "").toLowerCase()].filter(Boolean).join(", ")}</dd></div>
              <div><dt>Design spacing</dt><dd>{ft(well.spacing)}</dd></div>
              <div><dt>First production</dt><dd>{well.firstProd ? new Date(`${well.firstProd}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "Not yet"}</dd></div>
              <div><dt>EUR</dt><dd>{well.eur ? `${n0(well.eur / 1000)} Mbbl` : "n/a"}</dd></div>
            </dl>
          </section>
        </div>
      )}
      <footer className="wb-foot">{footer}</footer>
    </div>
  );
}
