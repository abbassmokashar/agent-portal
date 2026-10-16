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

  // Demo fallback credentials (only used when WORKER_URL is empty)
  DEMO: {
    user: { username: 'demo', password: 'demo1234', isAdmin: false, agency: 'Demo Travel', country: 'Lebanon' },
    admin: { username: 'admin', password: 'admin1234', isAdmin: true, agency: 'AUS', country: 'Switzerland' },
  },
};
