"use client";
import dynamic from "next/dynamic";

// Sigma's plugin library talks to its parent window as soon as it loads, so it
// must never run on the server.
const WellborePlugin = dynamic(() => import("@/components/wellbore/WellborePlugin"), {
  ssr: false,
  loading: () => <div className="wb-root wb-center">Loading the wellbore schematic</div>,
});

export default function Loader() {
  return <WellborePlugin />;
}
