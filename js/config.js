// ---------------------------------------------------------------------------
//  AUS Agent Portal — front-end configuration
// ---------------------------------------------------------------------------
//  Paste your deployed Cloudflare Worker URL below (no trailing slash).
//  Example: "https://aus-agent-portal.abbass.workers.dev"
//
//  Leave it empty ("") to run the portal in OFFLINE DEMO MODE using the
//  built-in sample content — handy for presenting before the worker is wired.
// ---------------------------------------------------------------------------
window.AUS_CONFIG = {
  WORKER_URL: 'https://aus-agent-portal.a-mokashar.workers.dev',

  // ---------------------------------------------------------------------------
  //  HubSpot application form (optional, swappable at any time)
  // ---------------------------------------------------------------------------
  //  When enabled, the "Applications" view embeds your HubSpot form instead of
  //  the built-in form. Find the ids in HubSpot: Marketing -> Forms -> Share,
  //  then copy the portalId and formId from the embed code.
  HUBSPOT: {
    enabled: false,
    portalId: '',   // e.g. '44876987'
    formId: '',     // e.g. 'a1b2c3d4-1234-5678-9abc-def012345678'
    region: 'eu1',  // 'na1' | 'eu1' | 'ap1'
  },

  // Demo fallback credentials (only used when WORKER_URL is empty)
  DEMO: {
    user: { username: 'demo', password: 'demo1234', isAdmin: false, agency: 'Demo Travel', country: 'Lebanon' },
    admin: { username: 'admin', password: 'admin1234', isAdmin: true, agency: 'AUS', country: 'Switzerland' },
  },
};
