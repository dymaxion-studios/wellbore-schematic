"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadCatalog, loadPad, type Catalog, type PadFile, type Well } from "./data";
import WellboreView from "./WellboreView";

/**
 * The schematic on the sample extract in public/wellbore, with its own well
 * picker and no Sigma. See WellborePlugin for the Sigma plugin on live data.
 *
 * The starting well can be set in the URL: /standalone?well=PAD-001%20B01H, or
 * in the fragment (#well=...), which can change without reloading the page.
 */
const DEFAULT_WELL = "PAD-001 B01H";

const clean = (v: string | null) => {
  if (!v) return null;
  let s = v.trim();
  try { s = decodeURIComponent(s); } catch { /* keep as typed */ }
  return !s || s.includes("{{") ? null : s.split(",")[0].trim();
};

function find(cat: Catalog, key: string | null): Well | undefined {
  if (!key) return undefined;
  const k = key.trim().toUpperCase();
  return cat.wells.find((w) => w.name.toUpperCase() === k) ?? cat.wells.find((w) => String(w.id) === k);
}

export default function WellboreApp() {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [well, setWell] = useState<Well | null>(null);
  const [padFile, setPadFile] = useState<PadFile | null>(null);
  const [failed, setFailed] = useState(false);
  const catRef = useRef<Catalog | null>(null);

  useEffect(() => {
    let alive = true;
    const fromHash = () => clean(new URLSearchParams(window.location.hash.replace(/^#/, "")).get("well"));
    const onHash = () => { const next = catRef.current ? find(catRef.current, fromHash()) : undefined; if (next) setWell(next); };
    window.addEventListener("hashchange", onHash);
    loadCatalog()
      .then((c) => {
        if (!alive) return;
        catRef.current = c;
        setCat(c);
        const qs = new URLSearchParams(window.location.search);
        setWell(find(c, fromHash()) ?? find(c, clean(qs.get("well"))) ?? find(c, DEFAULT_WELL) ?? c.wells.find((w) => w.traj === "HORIZONTAL") ?? c.wells[0]);
      })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; window.removeEventListener("hashchange", onHash); };
  }, []);

  useEffect(() => {
    if (!well) return;
    let alive = true;
    setPadFile(null);
    loadPad(well.pad).then((p) => alive && setPadFile(p)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [well?.pad]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback((w: Well) => setWell(w), []);

  if (failed) return <div className="wb-root wb-center">The schematic’s data didn’t load. Reload the page to try again.</div>;
  if (!cat || !well) return <div className="wb-root wb-center">Loading the wellbore schematic</div>;

  return (
    <WellboreView
      cat={cat}
      well={well}
      padFile={padFile}
      onSelect={select}
      footer="Sample data: synthetic wells modeled on the DJ Basin. The aquifer interval and casing program are typical values shown for illustration. Towns, river and highways are real and drawn approximately."
    />
  );
}
