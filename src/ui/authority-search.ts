import type { Jurisdiction } from "../types/extension.js";

// Each authority's own public search, for a reader who wants to look a
// business up at the source. The no-match note links these. The URLs are
// the same search pages card.ts's buildSourceUrl falls back to when a
// record has no per-facility link.
//
// `name` is how a sentence refers to the authority; `link` is the link
// text. Cincinnati publishes a dataset rather than a search page, so its
// link says so. Order here is display order when a note lists several.
//
// FDACS is here for completeness. Its index is not bundled in any build,
// so no note links it today.
export interface AuthoritySearch {
  name: string;
  link: string;
  url: string;
}

export const AUTHORITY_SEARCH: Record<Jurisdiction, AuthoritySearch> = {
  florida: {
    name: "the Florida Department of Business and Professional Regulation (DBPR)",
    link: "Search Florida DBPR records",
    url: "https://www2.myfloridalicense.com/hotels-restaurants/public-records/",
  },
  nyc: {
    name: "the NYC Department of Health and Mental Hygiene (DOHMH)",
    link: "Search NYC DOHMH records (ABC Eats)",
    url: "https://a816-health.nyc.gov/ABCEatsRestaurants/#!/Search",
  },
  columbus: {
    name: "Columbus Public Health",
    link: "Search Columbus Public Health records",
    url: "https://pressagent.envisionconnect.com/main.phtml?agency=COL",
  },
  cincinnati: {
    name: "the Cincinnati Health Department",
    link: "Search the Cincinnati Health Department dataset",
    url: "https://data.cincinnati-oh.gov/d/rg6p-b3h3",
  },
  fdacs: {
    name: "the Florida Department of Agriculture and Consumer Services (FDACS)",
    link: "Search Florida FDACS records",
    url: "https://foodpermit.fdacs.gov/Reports/SearchFoodEntity.aspx",
  },
};
