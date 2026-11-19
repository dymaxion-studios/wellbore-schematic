import type { Metadata } from "next";
import WellboreApp from "@/components/wellbore/WellboreApp";

export const metadata: Metadata = { title: "Standalone" };

// The same schematic on the baked extract in public/wellbore, with its own well
// picker. Useful for development and for showing it without a Sigma workbook.
const theme = `try{document.documentElement.setAttribute('data-theme',new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light')}catch(e){}`;

export default function StandalonePage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: theme }} />
      <WellboreApp />
    </>
  );
}
