// Continents and regions as lists of ISO 3166-1 alpha-2 country codes.

export interface Region {
  id: string;
  name: string;
  kind: "continent" | "region";
  countries: string[];
}

const EUROPE =
  "AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GI GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM UA VA XK GG JE IM AX".split(" ");
const ASIA =
  "AE AF AM AZ BD BH BN BT CN GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE".split(" ");
const AFRICA =
  "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW EH RE YT SH".split(" ");
const NORTH_AMERICA =
  "AG BS BB BZ CA CR CU DM DO GD GT HN HT JM KN LC MX NI PA SV TT US VC PR GL BM KY AW CW".split(" ");
const SOUTH_AMERICA = "AR BO BR CL CO EC GY PE PY SR UY VE GF FK".split(" ");
const OCEANIA = "AU FJ FM KI MH NR NZ PG PW SB TO TV VU WS NC PF GU".split(" ");

export const REGIONS: Region[] = [
  { id: "europe", name: "Europe", kind: "continent", countries: EUROPE },
  { id: "asia", name: "Asia", kind: "continent", countries: ASIA },
  { id: "africa", name: "Africa", kind: "continent", countries: AFRICA },
  { id: "north-america", name: "North America", kind: "continent", countries: NORTH_AMERICA },
  { id: "south-america", name: "South America", kind: "continent", countries: SOUTH_AMERICA },
  { id: "oceania", name: "Oceania", kind: "continent", countries: OCEANIA },
  { id: "nordics", name: "Nordic countries", kind: "region", countries: ["FI", "SE", "NO", "DK", "IS"] },
  {
    id: "eu",
    name: "European Union",
    kind: "region",
    countries: "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "),
  },
  { id: "dach", name: "DACH (Germany, Austria, Switzerland)", kind: "region", countries: ["DE", "AT", "CH"] },
  { id: "benelux", name: "Benelux", kind: "region", countries: ["BE", "NL", "LU"] },
  { id: "uk-ireland", name: "UK & Ireland", kind: "region", countries: ["GB", "IE"] },
  { id: "middle-east", name: "Middle East", kind: "region", countries: "AE BH IL IQ IR JO KW LB OM PS QA SA SY TR YE EG".split(" ") },
  { id: "southeast-asia", name: "Southeast Asia", kind: "region", countries: "BN KH ID LA MY MM PH SG TH TL VN".split(" ") },
  { id: "latin-america", name: "Latin America", kind: "region", countries: [...SOUTH_AMERICA, "MX", "GT", "HN", "SV", "NI", "CR", "PA", "CU", "DO", "PR"] },
];

export function regionById(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

/** Words used in remote-job eligibility text ("Europe", "EMEA", "Americas") → country codes. */
export const SCOPE_WORDS: Record<string, string[]> = {
  worldwide: ["*"],
  anywhere: ["*"],
  global: ["*"],
  europe: EUROPE,
  "european union": regionById("eu")!.countries,
  eu: regionById("eu")!.countries,
  emea: [...EUROPE, ...AFRICA, ...regionById("middle-east")!.countries],
  americas: [...NORTH_AMERICA, ...SOUTH_AMERICA],
  "north america": NORTH_AMERICA,
  "latin america": regionById("latin-america")!.countries,
  latam: regionById("latin-america")!.countries,
  "south america": SOUTH_AMERICA,
  asia: ASIA,
  apac: [...ASIA, ...OCEANIA],
  africa: AFRICA,
  oceania: OCEANIA,
  nordics: regionById("nordics")!.countries,
  scandinavia: ["SE", "NO", "DK"],
  "middle east": regionById("middle-east")!.countries,
  uk: ["GB"],
  usa: ["US"],
  us: ["US"],
};
