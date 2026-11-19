import type { Metadata } from "next";
import Loader from "./Loader";

export const metadata: Metadata = { title: "Sigma plugin" };

// The Sigma plugin. Register this URL in Sigma under Administration > Plugins.
// A Sigma workbook is light, so the plugin is light.
const theme = `try{document.documentElement.setAttribute('data-theme','light')}catch(e){}`;

export default function WellborePluginPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: theme }} />
      <Loader />
    </>
  );
}
