# Quick start

From nothing to a working wellbore schematic in a Sigma workbook. Allow about 30 minutes.

You need:

- A Sigma organization where you can register plugins (an admin, or an account type with
  the "Manage plugins" permission) and edit a workbook.
- Somewhere to host a small web app over https. The steps below use Vercel's free tier.
- Either a data warehouse connected to Sigma, or nothing at all: the sample data can be
  uploaded to Sigma as CSV files.

## 1. Host the plugin

A Sigma plugin is a web page that Sigma loads in a frame, so it needs a public https URL.

```bash
git clone https://github.com/dymaxion-studios/wellbore-schematic.git
```

```bash
cd wellbore-schematic && npm install
```

```bash
npx vercel deploy --prod
```

Note the URL Vercel prints. Open `<your URL>/standalone` to confirm it is up: you should see
the schematic drawn on sample data. The plugin itself is at the root, `<your URL>/`, and only
draws inside Sigma.

Any host that can run a Next.js app works the same way (`npm run build`, then `npm start`).

## 2. Register it in Sigma

In Sigma's Administration area, open the plugins page and add a plugin (Sigma's guide:
[Register a plugin with your Sigma organization](https://help.sigmacomputing.com/docs/register-a-plugin-with-your-sigma-organization)):

| Field | Value |
| --- | --- |
| Name | Wellbore Schematic |
| Production URL | the URL from step 1 |

Or with Sigma's REST API:

```bash
curl -X POST https://aws-api.sigmacomputing.com/v2/plugins -H "Authorization: Bearer $SIGMA_TOKEN" -H "Content-Type: application/json" -d '{"name":"Wellbore Schematic","url":"https://your-host","type":"element"}'
```

Use the API base URL for your Sigma cloud; the one above is for AWS US.

## 3. Get the data in place

The plugin reads four tables. `warehouse/schema.sql` creates them and explains every column;
`warehouse/sample/` holds matching sample data for 30 synthetic wells on four pads.

| Table | One row per | Rows in the sample |
| --- | --- | --- |
| `WELLS` | well | 30 |
| `DIRECTIONAL_SURVEY` | survey station | 4,371 |
| `COMPLETION_STAGES` | stage | 981 |
| `FORMATION_TOPS` | formation top in a well | 156 |

Pick one:

- **Try it with the sample, no warehouse work.** In Sigma, create a workbook and add each of
  the four files in `warehouse/sample/` as a table from an uploaded CSV.
- **Load the sample into your warehouse.** Run `warehouse/schema.sql`, then the load commands
  at the bottom of that file.
- **Use your own wells.** Create views in your warehouse with the same column names over your
  own tables. This is the smallest example of each, showing one row:

`WELLS`

| WELL_ID | WELL_NAME | PAD_ID | FORMATION | TRAJECTORY_TYPE | LATERAL_LENGTH_FT | SURFACE_LATITUDE | SURFACE_LONGITUDE | BH_LATITUDE | BH_LONGITUDE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1001 | PAD-001 B01H | PAD-001 | NIOBRARA B | HORIZONTAL | 4851 | 40.174365 | -104.742213 | 40.189483 | -104.746972 |

`DIRECTIONAL_SURVEY`

| WELL_NAME | MD_FT | TVD_FT | INCLINATION_DEG | AZIMUTH_DEG | NORTHING_FT | EASTING_FT | DLS_DEG_100_FT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAD-001 B01H | 7315 | 6846 | 90.4 | 359.7 | 753 | -1317 | 0.6 |

`COMPLETION_STAGES`

| WELL_NAME | STAGE_NO | TOP_MD_FT | BASE_MD_FT |
| --- | --- | --- | --- |
| PAD-001 B01H | 1 | 11735 | 11915 |

`FORMATION_TOPS`

| WELL_NAME | FORMATION_ID | FORMATION_NAME | STRAT_ORDER | IS_TARGET | TOP_MD_FT | TOP_TVD_FT |
| --- | --- | --- | --- | --- | --- | --- |
| PAD-001 B01H | 4 | NIOBRARA B | 4 | TRUE | 6998 | 6808 |

Things that trip people up:

- **Well names must match exactly** across the four tables. The well name is the key.
- **Northing and easting are offsets from the surface location in feet**, not state-plane or
  UTM coordinates. If you only have grid coordinates, subtract the surface location's.
- **Depths are in feet.** Convert metres in your view.
- **`FORMATION` in `WELLS` should match a `FORMATION_NAME` in `FORMATION_TOPS`**, or the
  "in zone" figure is left out.
- **Include formation tops above and below the target** where you have them. The section is
  drawn from the tops; with only one top there is little to show.

## 4. Build the workbook page

On a workbook page:

1. Add the four tables. Sigma shows `WELL_NAME` as "Well Name" and so on; leave those display
   names as they are, because the plugin finds columns by them.
2. Add a **list control** on `Well Name` from the wells table. Turn off multi-select and give
   it a default value. In its **Targets**, add the survey, stages and tops tables (on their
   `Well Name` column) but **not** the wells table: the plugin needs every well for the map.
3. Add a plugin element and choose **Wellbore Schematic** (Sigma's guide:
   [Use your organization's plugins](https://help.sigmacomputing.com/docs/use-your-organizations-plugins)).
4. In the plugin's panel, pick the four tables and the control:

   | Panel entry | Pick |
   | --- | --- |
   | Wells (one row per well) | the wells table |
   | Directional survey (selected well) | the survey table |
   | Completion stages (selected well) | the stages table |
   | Formation tops (selected well) | the tops table |
   | Well control | the control from step 2 |

   The column lists under each table fill in on their own a moment after you pick it.
5. Size the element to the full page width and about 32 grid rows tall, then publish.

Picking a well in the schematic (its own picker, the map or the spacing view) now sets the
control, and changing the control redraws the schematic. To have a Sigma table drive it too,
add an **On select** action to that table that sets the control to the selected row's well name.

## If nothing draws

The plugin says what it is waiting for. The common cases:

| What you see | Cause and fix |
| --- | --- |
| "Pick the four source tables…" | Nothing is bound yet. Pick the tables in the panel. |
| "Waiting for wells from Sigma" with column counts | A table is bound but its column list is empty. See the next row. |
| A column list stays empty after picking a table | For some tables Sigma sends rows but not column names, so the plugin cannot match them. Add the columns yourself with the **+** on that list: numeric columns first, in the order `schema.sql` lists them, then `Well Name` last. The plugin then reads them by position, so the order matters. |
| "Pick a well in the Well control to draw it" | The control is empty, or its value is not a well name in the wells table. |
| "No directional survey has arrived for …" | The survey table has no rows for that well, or the control does not target the survey table. |
| A blank area in an embedded workbook | Check the page in a normal browser tab. Some in-app browsers block the nested frame. |

## Local development

```bash
npm run dev
```

The app runs on http://localhost:3220. `/standalone` works on its own. To develop against a
live workbook, set the plugin's development URL in Sigma to `http://localhost:3220`; Sigma's
plugin guides explain how to switch an element to the development version while editing.
