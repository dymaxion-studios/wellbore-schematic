-- Example warehouse structure for the wellbore schematic plugin.
--
-- Four tables, one per source the plugin binds to. Written for Snowflake;
-- the types are plain enough to adapt to BigQuery, Databricks, Redshift or
-- Postgres. Units are feet and degrees throughout.
--
-- The column names matter: Sigma shows WELL_NAME as "Well Name", and the
-- plugin finds its columns by those display names. If your columns are named
-- differently, rename them in the Sigma table rather than in the warehouse.
--
-- Columns marked REQUIRED are needed for anything to draw. The rest improve
-- the drawing or fill in the header and the facts row, and can be left null.

create schema if not exists WELLBORE;

-- 1. One row per well. Not filtered in Sigma: the map and the spacing view
--    use every well as a neighbour.
create or replace table WELLBORE.WELLS (
  WELL_ID              number        not null,  -- REQUIRED. Unique number per well.
  WELL_NAME            varchar       not null,  -- REQUIRED. The value the Sigma control holds; must match the other tables.
  API_NUMBER           varchar,
  OPERATOR_NAME        varchar,
  PAD_ID               varchar,                 -- Wells sharing a pad are drawn together on the map.
  FORMATION            varchar,                 -- Target (landing) formation. Match a FORMATION_NAME in FORMATION_TOPS for the in-zone figure.
  RELATIONSHIP         varchar,                 -- e.g. Parent, Child, Co-Developed. Shown as a label.
  WELL_STATUS          varchar,                 -- e.g. PRODUCING. Shown as a label.
  TRAJECTORY_TYPE      varchar,                 -- HORIZONTAL for wells to draw. If null, a well with a lateral length is treated as horizontal.
  LATERAL_LENGTH_FT    number,
  WELL_SPACING_FT      number,
  PROPPANT_LB_PER_FT   number,
  FLUID_BBL_PER_FT     number(10,1),
  STAGE_COUNT          number,
  FLUID_SYSTEM         varchar,                 -- e.g. SLICKWATER, HYBRID.
  SURFACE_LATITUDE     float         not null,  -- REQUIRED. Decimal degrees, WGS84.
  SURFACE_LONGITUDE    float         not null,  -- REQUIRED. Negative in the western hemisphere.
  BH_LATITUDE          float,                   -- Bottom hole. Places neighbours that have no survey to hand.
  BH_LONGITUDE         float,
  TOTAL_TVD_FT         number,
  TOTAL_MD_FT          number,
  KB_ELEVATION_FT      number,
  ARTIFICIAL_LIFT_TYPE varchar,                 -- ROD PUMP draws a pumping unit at surface; anything else a wellhead.
  FIRST_PROD_DATE      date,
  EUR_OIL_BBL          number,
  COUNTY               varchar,
  STATE                varchar
);

-- 2. Directional survey: one row per station. In Sigma, filter this table by
--    the Well control so it holds the selected well only.
create or replace table WELLBORE.DIRECTIONAL_SURVEY (
  WELL_ID          number   not null,
  WELL_NAME        varchar  not null,  -- REQUIRED. Filtered by the Well control.
  STATION_NO       number,
  MD_FT            number   not null,  -- REQUIRED. Measured depth.
  TVD_FT           number   not null,  -- REQUIRED. True vertical depth.
  INCLINATION_DEG  float    not null,  -- REQUIRED. 0 is vertical, 90 is horizontal.
  AZIMUTH_DEG      float,
  NORTHING_FT      number,             -- Offset north of the surface location, in feet (not a grid coordinate).
  EASTING_FT       number,             -- Offset east of the surface location, in feet.
  DLS_DEG_100_FT   float               -- Dogleg severity, degrees per 100 ft.
);

-- 3. Completion stages: one row per stage. Filter by the Well control.
create or replace table WELLBORE.COMPLETION_STAGES (
  WELL_ID     number   not null,
  WELL_NAME   varchar  not null,  -- REQUIRED.
  STAGE_NO    number   not null,  -- REQUIRED. 1 is the toe stage.
  TOP_MD_FT   number   not null,  -- REQUIRED. Shallower end of the stage, measured depth.
  BASE_MD_FT  number   not null   -- REQUIRED. Deeper end of the stage, measured depth.
);

-- 4. Formation tops with the formation's name and order on each row, so no
--    join is needed in Sigma. Filter by the Well control.
create or replace table WELLBORE.FORMATION_TOPS (
  WELL_ID         number   not null,
  WELL_NAME       varchar  not null,  -- REQUIRED.
  FORMATION_ID    number   not null,  -- REQUIRED. Unique number per formation.
  FORMATION_NAME  varchar  not null,  -- REQUIRED.
  STRAT_ORDER     number   not null,  -- REQUIRED. 1 is the shallowest formation.
  IS_TARGET       boolean,            -- TRUE for landing zones; they are drawn in colour.
  TOP_MD_FT       number,
  TOP_TVD_FT      number   not null   -- REQUIRED.
);

-- Loading the sample data (Snowflake, from SnowSQL in this repository's root):
--
--   create or replace file format WELLBORE.CSV type = csv skip_header = 1 field_optionally_enclosed_by = '"' empty_field_as_null = true;
--   create or replace stage WELLBORE.SAMPLE file_format = WELLBORE.CSV;
--   put file://warehouse/sample/*.csv @WELLBORE.SAMPLE auto_compress = true;
--   copy into WELLBORE.WELLS              from @WELLBORE.SAMPLE/wells.csv.gz;
--   copy into WELLBORE.DIRECTIONAL_SURVEY from @WELLBORE.SAMPLE/directional_survey.csv.gz;
--   copy into WELLBORE.COMPLETION_STAGES  from @WELLBORE.SAMPLE/completion_stages.csv.gz;
--   copy into WELLBORE.FORMATION_TOPS     from @WELLBORE.SAMPLE/formation_tops.csv.gz;
