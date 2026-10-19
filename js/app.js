/* ==========================================================================
   AUS Agent Portal — front-end app
   Works against the Cloudflare Worker (js/config.js -> WORKER_URL), and falls
   back to a self-contained OFFLINE DEMO MODE when no worker is configured.
   ========================================================================== */

const CFG = window.AUS_CONFIG || { WORKER_URL: '' };
const WORKER = (CFG.WORKER_URL || '').replace(/\/+$/, '');
const DEMO_MODE = !WORKER;

const state = {
  token: localStorage.getItem('aus_portal_token') || '',
  user: null,
  content: null,
  view: 'dashboard',
  filters: {},
  apps: [],
  localApps: JSON.parse(localStorage.getItem('aus_portal_apps') || '[]'),
  twofaChallenge: '',
};

/* ---------------------------------------------------------------------------
   Demo content (used only in OFFLINE DEMO MODE)
   --------------------------------------------------------------------------- */
const DEMO_CONTENT = {
  news: [
    { id: 'n1', tag: '50th Anniversary', date: '2026-10-08',
      title: '50 years of AUS — and a new chapter with our agents',
      excerpt: 'This year AUS celebrates its 50th Anniversary. To mark it, we are investing in our agent network like never before.',
      body: 'As part of our 50th Anniversary we are building closer, more personal relationships with the agents who send students to us. Jonathan Hilton now leads agent relations and will be your direct contact for key markets.',
      image: 'assets/media/anniversary.svg' },
    { id: 'n2', tag: 'New role', date: '2026-10-08',
      title: 'Meet Jonathan Hilton, your new agent contact',
      excerpt: 'Jonathan joins us to build and support our global agent network, starting with the January 2027 intake.',
      body: 'Jonathan Hilton is now responsible for agent relations at AUS. Reach him directly for any recruitment or student-application question.',
      image: 'assets/media/agent-contact.svg' },
  ],
  offers: [
    { id: 'o1', active: true, badge: 'January 2027 intake',
      title: "CHF 1'000 commission bonus per new student",
      subtitle: 'Celebrating our 50th Anniversary and building new agent relationships',
      body: "For every new student you recruit for the January 2027 intake, you earn an extra CHF 1'000 commission bonus — on top of your standard commission.",
      bullets: [
        "CHF 1'000 bonus for every new student recruited for the January 2027 intake",
        'Applies to new agents and existing partners',
        'Follow-up from Jonathan Hilton with direct links to this offer',
      ],
      cta: 'Submit an application', contact: 'For more information contact Jonathan Hilton — j.hilton@aus.swiss',
      image: 'assets/media/offer-50th.svg' },
  ],
  brochures: [
    { id: 'b1', title: 'AUS Global Brochure', programme: 'All specializations', region: 'Global',
      url: 'assets/brochures/AUS-Global-Brochure.pdf', size: '8.4 MB', updated: '2026-10-01' },
    { id: 'b2', title: 'Hospitality Management 2027', programme: 'Bachelor · Hospitality Management', region: 'Switzerland',
      url: 'assets/brochures/AUS-Hospitality-Management-Brochure-2027.pdf', size: '1.4 MB', updated: '2026-10-01' },
  ],
  contracts: [
    { id: 'c1', title: 'Agent Representation Agreement (template)', note: 'Standard representation agreement for new agent partners. Counter-signed by AUS.', url: 'assets/brochures/AUS-Global-Brochure.pdf', updated: '2026-10-01' },
    { id: 'c2', title: 'Student Enrolment Contract (template)', note: 'Template enrolment contract to share with students before registration.', url: 'assets/brochures/AUS-Global-Brochure.pdf', updated: '2026-10-01' },
  ],
  programmes: [
    { id: 'p1', level: 'Bachelor', title: 'Accounting', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'The language of business, mastered.' },
    { id: 'p2', level: 'Bachelor', title: 'Business Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'Lead organizations from day one.' },
    { id: 'p3', level: 'Bachelor', title: 'Healthcare Administration', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'Healthcare needs better leaders.' },
    { id: 'p4', level: 'Bachelor', title: 'Human Resource Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'People are the strategy.' },
    { id: 'p5', level: 'Bachelor', title: 'Integrated & Digital Marketing', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'Strategy meets execution.' },
    { id: 'p6', level: 'Bachelor', title: 'International Business', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'Think beyond borders.' },
    { id: 'p7', level: 'Bachelor', title: 'Sports Management — Athletic Administration', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'Run the game, not the sidelines.' },
    { id: 'p8', level: 'Bachelor', title: 'Sports Management — Sports Marketing', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'Build brands that move people.' },
    { id: 'p9', level: 'Bachelor', title: 'Hospitality Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 30'000 / year", description: 'Excellence is the experience.' },
    { id: 'p10', level: 'Bachelor', title: 'Aviation Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'The business of getting there.' },
    { id: 'p11', level: 'Master', title: 'Finance', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Markets reward precision.' },
    { id: 'p12', level: 'Master', title: 'Data Analytics', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Turn noise into signal.' },
    { id: 'p13', level: 'Master', title: 'Healthcare Administration', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Systems that save lives.' },
    { id: 'p14', level: 'Master', title: 'Human Resource Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Talent is the competitive edge.' },
    { id: 'p15', level: 'Master', title: 'International Business', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Lead across markets.' },
    { id: 'p16', level: 'Master', title: 'Leadership & Change', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Move organizations forward.' },
    { id: 'p17', level: 'Master', title: 'Sports Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'The business behind the game.' },
    { id: 'p18', level: 'Master', title: 'Strategic Brand & Digital Marketing', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Brand is the business model.' },
    { id: 'p19', level: 'Master', title: 'Aviation Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Altitude requires strategy.' },
    { id: 'p20', level: 'Doctorate', title: 'Business Administration (DBA)', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 26'000 / year", description: 'Original research that advances practice for experienced leaders.' },
    { id: 'p21', level: 'Diploma', title: 'Swiss Federal Diploma — Business Administration', region: 'Switzerland', duration: '2 years (part-time)', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'The nationally recognized Swiss professional qualification, valued across European industries.' },
  ],
  regions: [
    { id: 'r1', name: 'Switzerland', blurb: 'Campus in Montreux on the Swiss Riviera.' },
    { id: 'r2', name: 'Middle East & Gulf', blurb: 'High demand for hospitality and business pathways.' },
    { id: 'r3', name: 'Africa', blurb: 'Growing partner network; regional counsellor support.' },
    { id: 'r4', name: 'Asia', blurb: 'Pathway and articulation routes into AUS degrees.' },
  ],
  media: [
    { id: 'm1', title: 'AUS campus on the Swiss Riviera', type: 'Photo', url: 'assets/media/campus.svg', tags: 'campus, switzerland' },
    { id: 'm2', title: '50th Anniversary event', type: 'Photo', url: 'assets/media/anniversary.svg', tags: 'anniversary, event' },
    { id: 'm3', title: 'Hospitality training kitchen', type: 'Photo', url: 'assets/media/hospitality.svg', tags: 'hospitality, facilities' },
    { id: 'm4', title: 'AUS Business School logo pack', type: 'Asset', url: 'assets/media/logo-pack.svg', tags: 'brand, logo' },
  ],
};

/* ---------------------------------------------------------------------------
   Tiny API client
   --------------------------------------------------------------------------- */
async function api(path, { method = 'GET', body = null, auth = true, raw = false } = {}) {
  const headers = {};
  if (auth && state.token) headers.Authorization = 'Bearer ' + state.token;
  let payload = null;
  if (body !== null) {
    if (body instanceof FormData) { payload = body; }
    else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  }
  const res = await fetch(WORKER + path, { method, headers, body: payload });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: res.status, data });
  return data;
}

/* ---------------------------------------------------------------------------
   Utilities
   --------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? d : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const initials = (n) => (n || '?').trim().charAt(0).toUpperCase();
const uid = (prefix) => (prefix || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const today = () => new Date().toISOString().slice(0, 10);
function fileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(bytes) || 0;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
}

// AUS intakes fall in January, April and September. Derive the next few from
// today's date so the application form never goes stale.
function nextIntakes(count = 4) {
  const months = [{ name: 'January', m: 0 }, { name: 'April', m: 3 }, { name: 'September', m: 8 }];
  const now = new Date();
  const out = [];
  for (let y = now.getFullYear(); out.length < count && y <= now.getFullYear() + 4; y++) {
    for (const mo of months) {
      if (out.length >= count) break;
      if (new Date(y, mo.m, 1) > now) out.push(mo.name + ' ' + y);
    }
  }
  return out;
}

function toast(msg, kind = 'ok') {
  const wrap = $('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  const icon = kind === 'ok' ? 'fa-circle-check' : kind === 'err' ? 'fa-circle-exclamation' : 'fa-circle-info';
  el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3600);
}

function openModal(html, wide = false) {
  $('modalContent').className = 'modal' + (wide ? ' wide' : '');
  $('modalContent').innerHTML = html;
  $('modalOverlay').classList.add('open');
}
function closeModal() { $('modalOverlay').classList.remove('open'); }
window.closeModal = closeModal;

/* ---------------------------------------------------------------------------
   Country list + searchable combobox
   --------------------------------------------------------------------------- */
const COUNTRIES = [
  { name: 'Afghanistan', code: 'AF' }, { name: 'Albania', code: 'AL' }, { name: 'Algeria', code: 'DZ' },
  { name: 'Andorra', code: 'AD' }, { name: 'Angola', code: 'AO' }, { name: 'Argentina', code: 'AR' },
  { name: 'Armenia', code: 'AM' }, { name: 'Australia', code: 'AU' }, { name: 'Austria', code: 'AT' },
  { name: 'Azerbaijan', code: 'AZ' }, { name: 'Bahrain', code: 'BH' }, { name: 'Bangladesh', code: 'BD' },
  { name: 'Belarus', code: 'BY' }, { name: 'Belgium', code: 'BE' }, { name: 'Benin', code: 'BJ' },
  { name: 'Bolivia', code: 'BO' }, { name: 'Bosnia and Herzegovina', code: 'BA' }, { name: 'Botswana', code: 'BW' },
  { name: 'Brazil', code: 'BR' }, { name: 'Brunei', code: 'BN' }, { name: 'Bulgaria', code: 'BG' },
  { name: 'Burkina Faso', code: 'BF' }, { name: 'Cambodia', code: 'KH' }, { name: 'Cameroon', code: 'CM' },
  { name: 'Canada', code: 'CA' }, { name: 'Chad', code: 'TD' }, { name: 'Chile', code: 'CL' },
  { name: 'China', code: 'CN' }, { name: 'Colombia', code: 'CO' }, { name: 'Congo', code: 'CG' },
  { name: 'Costa Rica', code: 'CR' }, { name: 'Croatia', code: 'HR' }, { name: 'Cuba', code: 'CU' },
  { name: 'Cyprus', code: 'CY' }, { name: 'Czechia', code: 'CZ' }, { name: 'Denmark', code: 'DK' },
  { name: 'Dominican Republic', code: 'DO' }, { name: 'Ecuador', code: 'EC' }, { name: 'Egypt', code: 'EG' },
  { name: 'El Salvador', code: 'SV' }, { name: 'Estonia', code: 'EE' }, { name: 'Ethiopia', code: 'ET' },
  { name: 'Finland', code: 'FI' }, { name: 'France', code: 'FR' }, { name: 'Gabon', code: 'GA' },
  { name: 'Georgia', code: 'GE' }, { name: 'Germany', code: 'DE' }, { name: 'Ghana', code: 'GH' },
  { name: 'Greece', code: 'GR' }, { name: 'Guatemala', code: 'GT' }, { name: 'Honduras', code: 'HN' },
  { name: 'Hong Kong', code: 'HK' }, { name: 'Hungary', code: 'HU' }, { name: 'Iceland', code: 'IS' },
  { name: 'India', code: 'IN' }, { name: 'Indonesia', code: 'ID' }, { name: 'Iran', code: 'IR' },
  { name: 'Iraq', code: 'IQ' }, { name: 'Ireland', code: 'IE' }, { name: 'Israel', code: 'IL' },
  { name: 'Italy', code: 'IT' }, { name: 'Ivory Coast', code: 'CI' }, { name: 'Jamaica', code: 'JM' },
  { name: 'Japan', code: 'JP' }, { name: 'Jordan', code: 'JO' }, { name: 'Kazakhstan', code: 'KZ' },
  { name: 'Kenya', code: 'KE' }, { name: 'Kuwait', code: 'KW' }, { name: 'Kyrgyzstan', code: 'KG' },
  { name: 'Laos', code: 'LA' }, { name: 'Latvia', code: 'LV' }, { name: 'Lebanon', code: 'LB' },
  { name: 'Libya', code: 'LY' }, { name: 'Liechtenstein', code: 'LI' }, { name: 'Lithuania', code: 'LT' },
  { name: 'Luxembourg', code: 'LU' }, { name: 'Madagascar', code: 'MG' }, { name: 'Malaysia', code: 'MY' },
  { name: 'Maldives', code: 'MV' }, { name: 'Mali', code: 'ML' }, { name: 'Malta', code: 'MT' },
  { name: 'Mauritius', code: 'MU' }, { name: 'Mexico', code: 'MX' }, { name: 'Moldova', code: 'MD' },
  { name: 'Monaco', code: 'MC' }, { name: 'Mongolia', code: 'MN' }, { name: 'Montenegro', code: 'ME' },
  { name: 'Morocco', code: 'MA' }, { name: 'Mozambique', code: 'MZ' }, { name: 'Myanmar', code: 'MM' },
  { name: 'Namibia', code: 'NA' }, { name: 'Nepal', code: 'NP' }, { name: 'Netherlands', code: 'NL' },
  { name: 'New Zealand', code: 'NZ' }, { name: 'Nicaragua', code: 'NI' }, { name: 'Nigeria', code: 'NG' },
  { name: 'North Macedonia', code: 'MK' }, { name: 'Norway', code: 'NO' }, { name: 'Oman', code: 'OM' },
  { name: 'Pakistan', code: 'PK' }, { name: 'Palestine', code: 'PS' }, { name: 'Panama', code: 'PA' },
  { name: 'Paraguay', code: 'PY' }, { name: 'Peru', code: 'PE' }, { name: 'Philippines', code: 'PH' },
  { name: 'Poland', code: 'PL' }, { name: 'Portugal', code: 'PT' }, { name: 'Qatar', code: 'QA' },
  { name: 'Romania', code: 'RO' }, { name: 'Russia', code: 'RU' }, { name: 'Rwanda', code: 'RW' },
  { name: 'Saudi Arabia', code: 'SA' }, { name: 'Senegal', code: 'SN' }, { name: 'Serbia', code: 'RS' },
  { name: 'Singapore', code: 'SG' }, { name: 'Slovakia', code: 'SK' }, { name: 'Slovenia', code: 'SI' },
  { name: 'Somalia', code: 'SO' }, { name: 'South Africa', code: 'ZA' }, { name: 'South Korea', code: 'KR' },
  { name: 'Spain', code: 'ES' }, { name: 'Sri Lanka', code: 'LK' }, { name: 'Sudan', code: 'SD' },
  { name: 'Sweden', code: 'SE' }, { name: 'Switzerland', code: 'CH' }, { name: 'Syria', code: 'SY' },
  { name: 'Taiwan', code: 'TW' }, { name: 'Tanzania', code: 'TZ' }, { name: 'Thailand', code: 'TH' },
  { name: 'Tunisia', code: 'TN' }, { name: 'Turkey', code: 'TR' }, { name: 'Uganda', code: 'UG' },
  { name: 'Ukraine', code: 'UA' }, { name: 'United Arab Emirates', code: 'AE' }, { name: 'United Kingdom', code: 'GB' },
  { name: 'United States', code: 'US' }, { name: 'Uruguay', code: 'UY' }, { name: 'Uzbekistan', code: 'UZ' },
  { name: 'Venezuela', code: 'VE' }, { name: 'Vietnam', code: 'VN' }, { name: 'Yemen', code: 'YE' },
  { name: 'Zambia', code: 'ZM' }, { name: 'Zimbabwe', code: 'ZW' },
];

function renderComboList(inputId, listId) {
  const input = $(inputId);
  const list = $(listId);
  const q = (input.value || '').trim().toLowerCase();
  const items = COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 80);
  list.innerHTML = items.length
    ? items.map((c) => `<div class="combo-opt" data-name="${esc(c.name)}" onmousedown="pickCombo('${inputId}','${listId}',this)">${esc(c.name)}<span class="cc">${c.code}</span></div>`).join('')
    : '<div class="combo-empty">No match — check the spelling</div>';
}
function openCombo(inputId, listId) { renderComboList(inputId, listId); $(listId).classList.add('open'); }
function onComboInput(inputId, listId) { $(inputId).dataset.value = ''; openCombo(inputId, listId); }
function closeCombo(listId) { setTimeout(() => { const l = $(listId); if (l) l.classList.remove('open'); }, 160); }
function pickCombo(inputId, listId, el) {
  const input = $(inputId);
  input.value = el.dataset.name;
  input.dataset.value = el.dataset.name;
  $(listId).classList.remove('open');
}
window.openCombo = openCombo; window.onComboInput = onComboInput; window.closeCombo = closeCombo; window.pickCombo = pickCombo;

function countryField(id, label) {
  return `<div class="field">
    <label>${label} <span class="req">*</span></label>
    <div class="combo">
      <input id="${id}" placeholder="Start typing to search…" autocomplete="off"
        oninput="onComboInput('${id}','${id}List')"
        onfocus="openCombo('${id}','${id}List')"
        onblur="closeCombo('${id}List')">
      <div class="combo-list" id="${id}List"></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------------
   Auth
   --------------------------------------------------------------------------- */
function setConnPill(kind, label) {
  const p = $('connPill');
  if (!p) return;
  p.className = 'conn-pill ' + kind;
  p.querySelector('span').textContent = label;
}

async function doLogin() {
  const username = $('loginUser').value.trim().toLowerCase();
  const password = $('loginPass').value;
  const err = $('authError');
  err.classList.remove('show');
  if (!username || !password) { err.textContent = 'Enter your username and password.'; err.classList.add('show'); return; }

  const btn = $('authSubmit'); btn.disabled = true;
  try {
    if (DEMO_MODE) {
      const d = CFG.DEMO || {};
      const match = [d.user, d.admin].find((u) => u && u.username === username && u.password === password);
      if (!match) throw Object.assign(new Error('invalid_credentials'), { status: 401 });
      finishLogin({ username: match.username, email: match.username + '@demo.local', isAdmin: !!match.isAdmin, agency: match.agency, country: match.country, twoFA: false, memberSince: new Date().toISOString() });
      return;
    }
    const res = await api('/api/login', { method: 'POST', auth: false, body: { username, password, device: deviceLabel() } });
    if (res.twofa) { showTwofa(res.challenge); return; }
    persistToken(res.token);
    finishLogin(res.user);
  } catch (e) {
    err.textContent = friendlyError(e);
    err.classList.add('show');
  } finally {
    btn.disabled = false;
    if (DEMO_MODE) btn.innerHTML = '<span>Sign in</span>';
  }
}
window.doLogin = doLogin;

async function doTwofa() {
  const code = $('twofaCode').value.trim();
  const err = $('authError');
  err.classList.remove('show');
  try {
    const res = await api('/api/2fa/verify', { method: 'POST', auth: false, body: { challenge: state.twofaChallenge, code, device: deviceLabel() } });
    persistToken(res.token);
    finishLogin(res.user);
  } catch (e) {
    err.textContent = friendlyError(e);
    err.classList.add('show');
  }
}
window.doTwofa = doTwofa;

function showTwofa(challenge) {
  state.twofaChallenge = challenge;
  $('loginFields').classList.add('hidden');
  $('authSubmit').classList.add('hidden');
  $('twofaFields').classList.remove('hidden');
  $('twofaSubmit').classList.remove('hidden');
  $('authTitle').textContent = 'Two-factor verification';
  $('authSub').textContent = 'One more step to keep your account secure.';
  $('twofaCode').focus();
}

function showLoginForm() {
  $('loginFields').classList.remove('hidden');
  $('authSubmit').classList.remove('hidden');
  $('twofaFields').classList.add('hidden');
  $('twofaSubmit').classList.add('hidden');
  $('resetFields').classList.add('hidden');
  $('authTitle').textContent = 'Agent sign in';
  $('authSub').textContent = 'Access is by invitation. Use the credentials AUS sent you.';
  $('authError').classList.remove('show');
}
window.showLoginForm = showLoginForm;

function showForgot() {
  if (DEMO_MODE) { toast('Password reset needs the Cloudflare worker connected.', 'info'); return; }
  $('loginFields').classList.add('hidden');
  $('authSubmit').classList.add('hidden');
  $('authTitle').textContent = 'Reset your password';
  $('authSub').textContent = 'We will email you a reset link (needs email configured on the worker).';
  openModal(`
    <h2>Reset password</h2>
    <p class="modal-sub">Enter the email on your agent account. If it matches, we'll send a reset link.</p>
    <div class="field"><label>Email</label><input id="forgotEmail" type="email" placeholder="you@agency.com"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();showLoginForm()">Cancel</button>
      <button class="btn btn-primary" onclick="sendForgot()"><span>Send reset link</span></button>
    </div>`);
}
window.showForgot = showForgot;

async function sendForgot() {
  const email = $('forgotEmail').value.trim();
  try { await api('/api/forgot', { method: 'POST', auth: false, body: { email } }); } catch {}
  closeModal();
  showLoginForm();
  toast('If that email exists, a reset link is on its way.', 'ok');
}
window.sendForgot = sendForgot;

async function doReset() {
  const token = (location.hash.match(/reset=([^&]+)/) || [])[1];
  const next = $('resetPass').value;
  const err = $('authError');
  try {
    await api('/api/reset', { method: 'POST', auth: false, body: { token, next } });
    location.hash = '';
    toast('Password updated. Please sign in.', 'ok');
    showLoginForm();
  } catch (e) {
    err.textContent = friendlyError(e); err.classList.add('show');
  }
}
window.doReset = doReset;

function persistToken(t) { state.token = t; localStorage.setItem('aus_portal_token', t); }
function clearToken() { state.token = ''; localStorage.removeItem('aus_portal_token'); }

function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Device';
  return browser + ' · ' + os;
}

async function finishLogin(user) {
  state.user = user;
  try {
    if (DEMO_MODE) { state.content = DEMO_CONTENT; }
    else { const res = await api('/api/content'); state.content = res.data; }
  } catch { state.content = DEMO_CONTENT; }
  $('authScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  setConnPill(DEMO_MODE ? 'demo' : 'ok', DEMO_MODE ? 'Demo mode' : 'Connected');
  renderShell();
  go('dashboard');
  setTimeout(askNotificationPref, 600);
}

async function logout() {
  if (!DEMO_MODE && state.token) { try { await api('/api/logout', { method: 'POST' }); } catch {} }
  clearToken();
  state.user = null;
  $('app').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
  showLoginForm();
  $('loginPass').value = '';
}
window.logout = logout;

async function restoreSession() {
  if (!state.token) return;
  if (DEMO_MODE) { clearToken(); return; }
  try {
    const res = await api('/api/me');
    await finishLogin(res.user);
  } catch { clearToken(); }
}

function friendlyError(e) {
  const map = {
    invalid_credentials: 'Incorrect username or password.',
    invalid_code: 'That code is not valid. Check your authenticator and try again.',
    challenge_expired: 'This login timed out. Please sign in again.',
    weak_password: 'Password must be at least 8 characters.',
    invalid_current: 'Your current password is incorrect.',
    username_taken: 'That username already exists.',
    email_taken: 'That email is already registered.',
    invalid_email: 'Enter a valid email address.',
    missing_fields: 'Full name, email, phone and country are required.',
    weak_input: 'Username and an 8+ character password are required.',
    forbidden: 'You do not have permission to do that.',
    protected: 'That account is protected and cannot be changed.',
    cannot_delete_self: 'You cannot remove your own account.',
    file_too_large: 'That file is larger than the 25 MB limit.',
    missing_file: 'Choose a file to upload.',
    corrupt_backup: 'That backup file is unreadable.',
    nothing_restored: 'There was nothing to restore from that backup.',
    not_found: 'Not found.',
    unauthorized: 'Your session expired. Please sign in again.',
  };
  return map[e.message] || 'Something went wrong. Please try again.';
}

/* ---------------------------------------------------------------------------
   Shell + navigation
   --------------------------------------------------------------------------- */
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
  { id: 'offers', label: 'Offers', icon: 'fa-tags' },
  { id: 'programmes', label: 'Specializations', icon: 'fa-graduation-cap' },
  { id: 'brochures', label: 'Brochures', icon: 'fa-file-pdf' },
  { id: 'contracts', label: 'Contracts', icon: 'fa-file-signature' },
  { id: 'media', label: 'Media', icon: 'fa-photo-film' },
  { id: 'apply', label: 'Applications', icon: 'fa-paper-plane' },
  { id: 'commissions', label: 'Commissions', icon: 'fa-coins' },
  { id: 'account', label: 'Account & Security', icon: 'fa-shield-halved' },
  { id: 'admin', label: 'Admin', icon: 'fa-user-gear', admin: true },
];

const TITLES = {
  dashboard: ['Dashboard', 'Everything you need to recruit for AUS — in one place.'],
  offers: ['Offers & incentives', 'Commission offers and campaigns you can promote.'],
  programmes: ['Specializations', 'Programs, intakes, fees and entry information.'],
  brochures: ['Brochures', 'Download the latest specialization brochures.'],
  contracts: ['Contracts', 'Representation and enrollment agreements.'],
  media: ['Media library', 'Photos, articles and marketing assets you can use.'],
  apply: ['Applications', 'Submit a student application — we handle the rest.'],
  commissions: ['Commissions', 'Request and track your commission payments.'],
  account: ['Account & Security', 'Your profile, two-factor authentication and sessions.'],
  admin: ['Admin', 'Manage agents, content and applications.'],
};

function renderShell() {
  const u = state.user || {};
  $('whoName').textContent = u.name || u.username || 'Agent';
  $('whoRole').textContent = u.isSuperAdmin ? 'Superadmin' : u.isAdmin ? 'Administrator' : 'AUS Agent';
  $('whoAvatar').textContent = initials(u.name || u.username);
  $('nav').innerHTML = NAV.filter((n) => !n.admin || u.isAdmin)
    .map((n) => `<button class="nav-item" data-nav="${n.id}" onclick="go('${n.id}')"><i class="fa-solid ${n.icon}"></i><span>${n.label}</span></button>`)
    .join('');
  startSwissClock();
}

// Live clock for the AUS campus in Montreux (Switzerland).
let _clockTimer = null;
function startSwissClock() {
  const t = $('sidebarClockTime');
  const d = $('sidebarClockDate');
  if (!t || !d) return;
  const tick = () => {
    const now = new Date();
    t.textContent = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    d.textContent = now.toLocaleDateString('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };
  tick();
  if (_clockTimer) clearInterval(_clockTimer);
  _clockTimer = setInterval(tick, 1000);
}

function toggleSidebar() {
  const s = document.querySelector('.sidebar');
  if (!s) return;
  const willOpen = !s.classList.contains('open');
  s.classList.toggle('open', willOpen);
  const b = $('sidebarBackdrop');
  if (b) b.classList.toggle('open', willOpen);
  const t = $('navToggle');
  if (t) t.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  document.body.style.overflow = willOpen ? 'hidden' : '';
}
function closeSidebar() {
  const s = document.querySelector('.sidebar');
  if (s) s.classList.remove('open');
  const b = $('sidebarBackdrop');
  if (b) b.classList.remove('open');
  const t = $('navToggle');
  if (t) t.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;

function go(view) {
  closeSidebar();
  state.view = view;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  const [t, s] = TITLES[view] || ['', ''];
  $('viewTitle').textContent = t;
  $('viewSub').textContent = s;
  const v = $('view');
  v.scrollIntoView({ block: 'start' });
  window.scrollTo(0, 0);
  const renderers = {
    dashboard: renderDashboard, offers: renderOffers, programmes: renderProgrammes,
    brochures: renderBrochures, contracts: renderContracts, media: renderMedia,
    apply: renderApply, commissions: renderCommissions, account: renderAccount, admin: renderAdmin,
  };
  (renderers[view] || renderDashboard)(v);
}
window.go = go;

const C = () => state.content || DEMO_CONTENT;

/* ---------------------------------------------------------------------------
   View: Dashboard
   --------------------------------------------------------------------------- */
function renderDashboard(v) {
  const c = C();
  const u = state.user || {};
  const active = (c.offers || []).filter((o) => o.active !== false)[0] || (c.offers || [])[0];
  v.innerHTML = `
    <div class="grid" style="gap:24px">
      <div>
        <h2 style="font-size:22px;font-weight:800;letter-spacing:-.01em;color:var(--navy)">Welcome back, ${esc(u.username)}</h2>
        <p style="color:var(--ink-soft);font-size:14px;margin-top:4px">Here's the latest for ${esc(u.agency || 'your agency')}.</p>
      </div>

      ${active ? `
      <div class="offer-banner">
        <span class="offer-badge"><i class="fa-solid fa-gift"></i> ${esc(active.badge || 'Active offer')}</span>
        <h2>${esc(active.title)}</h2>
        <p>${esc(active.subtitle || '')}</p>
        <div class="offer-actions">
          <button class="btn btn-primary" onclick="go('offers')"><span>View the offer</span></button>
          <button class="btn btn-outline" onclick="go('apply')"><span>Submit an application</span></button>
        </div>
      </div>` : ''}

      <div class="grid cols-4">
        ${statTile('fa-file-pdf', (c.brochures || []).length, 'Brochures available')}
        ${statTile('fa-graduation-cap', (c.programmes || []).length, 'Specializations listed')}
        ${statTile('fa-photo-film', (c.media || []).length, 'Media assets')}
        ${statTile('fa-paper-plane', (state.apps.length || state.localApps.length), 'Applications submitted')}
      </div>

      <div class="grid cols-2">
        <div>
          <div class="section-head"><div><h2>Latest news</h2><p>Updates from the AUS team.</p></div><button class="link-btn" onclick="go('offers')">See all offers →</button></div>
          <div class="item-list">
            ${(c.news || []).slice(0, 3).map((n) => `
              <div class="item" style="cursor:pointer" onclick="openNews('${n.id}')">
                <div class="item-icon crimson"><i class="fa-solid fa-bullhorn"></i></div>
                <div class="item-body">
                  <h4>${esc(n.title)}</h4>
                  <p>${esc(n.excerpt || '')}</p>
                  <div class="item-meta"><span class="tag">${esc(n.tag || 'News')}</span><span>${fmtDate(n.date)}</span></div>
                </div>
              </div>`).join('') || emptyInline('No news yet')}
          </div>
        </div>
        <div>
          <div class="section-head"><div><h2>Quick links</h2><p>Jump straight to what you need.</p></div></div>
          <div class="grid" style="gap:12px">
            ${quickLink('fa-file-arrow-down', 'Download brochures', 'The latest specialization brochures, ready to share.', 'brochures')}
            ${quickLink('fa-file-signature', 'Contracts', 'Representation and enrollment agreements.', 'contracts')}
            ${quickLink('fa-coins', 'Request a commission', 'Send AUS your invoice details for a student.', 'commissions')}
            ${quickLink('fa-paper-plane', 'Start an application', 'Submit a student application in a few steps.', 'apply')}
            ${quickLink('fa-address-book', 'Talk to AUS', 'Reach Jonathan Hilton for recruitment support.', 'mailto:j.hilton@aus.swiss')}
          </div>
        </div>
      </div>
    </div>`;
}

function statTile(icon, num, cap) {
  return `<div class="card"><div class="stat"><div class="stat-icon"><i class="fa-solid ${icon}"></i></div><span class="stat-num">${num}</span><span class="stat-cap">${cap}</span></div></div>`;
}
function quickLink(icon, title, text, target) {
  const action = target.startsWith('mailto') ? `location.href='${target}'` : `go('${target}')`;
  return `<button class="item" style="text-align:left;width:100%" onclick="${action}">
    <div class="item-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="item-body"><h4>${title}</h4><p>${text}</p></div>
    <i class="fa-solid fa-arrow-right" style="color:var(--slate)"></i>
  </button>`;
}
function emptyInline(msg) { return `<div class="empty"><i class="fa-regular fa-folder-open"></i><p>${msg}</p></div>`; }

function openNews(id) {
  const n = (C().news || []).find((x) => x.id === id);
  if (!n) return;
  openModal(`
    <span class="tag crimson">${esc(n.tag || 'News')}</span>
    <h2 style="margin-top:12px">${esc(n.title)}</h2>
    <p class="modal-sub">${fmtDate(n.date)}</p>
    <p style="font-size:14.5px;line-height:1.7;color:var(--ink-soft)">${esc(n.body || n.excerpt || '')}</p>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Close</button></div>`);
}
window.openNews = openNews;

/* ---------------------------------------------------------------------------
   View: Offers
   --------------------------------------------------------------------------- */
function renderOffers(v) {
  const offers = C().offers || [];
  v.innerHTML = offers.length ? offers.map((o, i) => `
    <div class="offer-banner" style="margin-bottom:20px;${i % 2 ? 'filter:hue-rotate(-12deg)' : ''}">
      <span class="offer-badge"><i class="fa-solid fa-gift"></i> ${esc(o.badge || 'Offer')}</span>
      <h2>${esc(o.title)}</h2>
      <p>${esc(o.subtitle || '')}</p>
      <p style="margin-top:12px">${esc(o.body || '')}</p>
      ${o.bullets && o.bullets.length ? `<ul style="margin:16px 0 0;padding-left:0;list-style:none;position:relative">
        ${o.bullets.map((b) => `<li style="display:flex;gap:10px;align-items:flex-start;margin-top:8px;color:rgba(255,255,255,.9);font-size:14px"><i class="fa-solid fa-circle-check" style="color:var(--yellow);margin-top:3px"></i><span>${esc(b)}</span></li>`).join('')}
      </ul>` : ''}
      <div class="offer-actions">
        <button class="btn btn-primary" onclick="go('apply')"><span>${esc(o.cta || 'Submit an application')}</span></button>
        <a class="btn btn-outline" href="mailto:j.hilton@aus.swiss"><span>Ask a question</span></a>
      </div>
      ${o.contact ? `<p style="margin-top:16px;font-size:12.5px;color:rgba(255,255,255,.6);position:relative">${esc(o.contact)}</p>` : ''}
    </div>`).join('') : emptyInline('No offers are active right now.');
}

/* ---------------------------------------------------------------------------
   View: Programmes
   --------------------------------------------------------------------------- */
function renderProgrammes(v) {
  const all = C().programmes || [];
  const levels = ['All', ...Array.from(new Set(all.map((p) => p.level)))];
  const active = state.filters.programmeLevel || 'All';
  const list = active === 'All' ? all : all.filter((p) => p.level === active);
  v.innerHTML = `
    <div class="filters">
      ${levels.map((l) => `<button class="chip ${l === active ? 'active' : ''}" onclick="filterProgrammes('${esc(l)}')">${esc(l)}</button>`).join('')}
      <span class="tag green" style="margin-left:auto"><i class="fa-solid fa-calendar-check"></i> Next intake: ${esc(nextIntakes()[0] || '—')}</span>
    </div>
    <div class="grid cols-3">
      ${list.map((p) => `
        <div class="card programme-card">
          <div class="prog-head"><h4>${esc(p.title)}</h4><span class="tag crimson">${esc(p.level)}</span></div>
          <p>${esc(p.description || '')}</p>
          <div class="prog-specs">
            <div class="prog-spec"><b>Duration</b>${esc(p.duration || '—')}</div>
            <div class="prog-spec"><b>Language</b>${esc(p.language || '—')}</div>
            <div class="prog-spec"><b>Intakes</b>${esc(p.intakes || '—')}</div>
            <div class="prog-spec"><b>Tuition</b>${esc(p.fees || '—')}</div>
          </div>
          <div style="margin-top:6px;display:flex;gap:8px">
            <button class="btn btn-outline btn-sm" onclick="go('brochures')"><span>Brochure</span></button>
            <button class="btn btn-primary btn-sm" onclick="go('apply')"><span>Apply</span></button>
          </div>
        </div>`).join('') || emptyInline('No specializations match this filter.')}
    </div>`;
}
function filterProgrammes(level) { state.filters.programmeLevel = level; renderProgrammes($('view')); }
window.filterProgrammes = filterProgrammes;

/* ---------------------------------------------------------------------------
   View: Brochures
   --------------------------------------------------------------------------- */
function renderBrochures(v) {
  const all = C().brochures || [];
  const regions = ['All', ...Array.from(new Set(all.map((b) => b.region).filter(Boolean)))];
  const active = state.filters.brochureRegion || 'All';
  const list = active === 'All' ? all : all.filter((b) => b.region === active);
  v.innerHTML = `
    <div class="filters">
      ${regions.map((r) => `<button class="chip ${r === active ? 'active' : ''}" onclick="filterBrochures('${esc(r)}')">${esc(r)}</button>`).join('')}
    </div>
    <div class="item-list">
      ${list.map((b) => `
        <div class="item">
          <div class="item-icon crimson"><i class="fa-solid fa-file-pdf"></i></div>
          <div class="item-body">
            <h4>${esc(b.title)}</h4>
            <p>${esc(b.programme || '')}</p>
            <div class="item-meta"><span class="tag">${esc(b.region || 'Global')}</span><span>${esc(b.size || '')}</span><span>Updated ${fmtDate(b.updated)}</span></div>
          </div>
          <div class="item-actions">
            <button class="btn btn-navy btn-sm" onclick="openFile('${esc(b.url)}','${esc(b.title)}')"><i class="fa-solid fa-download"></i><span>Download</span></button>
          </div>
        </div>`).join('') || emptyInline('No brochures in this region yet.')}
    </div>`;
}
function filterBrochures(r) { state.filters.brochureRegion = r; renderBrochures($('view')); }
window.filterBrochures = filterBrochures;

/* ---------------------------------------------------------------------------
   View: Contracts
   --------------------------------------------------------------------------- */
function renderContracts(v) {
  const u = state.user || {};
  v.innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;gap:14px;align-items:flex-start">
        <i class="fa-solid fa-circle-info" style="color:var(--crimson);font-size:18px;margin-top:2px"></i>
        <p style="font-size:13.5px">Agreements and policies shared with your account. Documents assigned to you are private — no other agent can see them.</p>
      </div>
      <div style="margin-top:14px">
        ${u.isAdmin
          ? `<button class="btn btn-primary btn-sm" onclick="uploadContractPrompt()"><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload &amp; assign</span></button>`
          : `<button class="btn btn-primary btn-sm" onclick="uploadMyContractPrompt()"><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload signed document</span></button>`}
      </div>
    </div>
    <div id="contractList">${emptyInline('Loading…')}</div>`;
  loadContracts();
}

async function loadContracts() {
  const el = $('contractList');
  if (!el) return;
  const u = state.user || {};
  const contentDocs = (C().contracts || []).map((c) => ({ ...c, kind: 'content' }));
  let fileDocs = [];
  if (!DEMO_MODE) {
    try {
      const res = await api('/api/files?category=contracts');
      fileDocs = (res.data || []).map((f) => ({
        id: f.id, title: f.name, url: f.url, size: fileSize(f.size),
        updated: f.created, assignedTo: f.assignedTo, uploadedBy: f.uploadedBy, kind: 'file',
      }));
    } catch { /* fall back to content documents */ }
  }
  const list = [...fileDocs, ...contentDocs];
  el.innerHTML = list.length ? `<div class="item-list">
      ${list.map((c) => {
        const mine = c.kind === 'file' && (u.isAdmin || c.uploadedBy === u.username);
        const assigned = c.kind === 'file'
          ? (c.assignedTo ? (c.assignedTo === u.username ? 'Assigned to you' : 'Assigned to ' + c.assignedTo) : 'All agents')
          : 'All agents';
        return `<div class="item">
          <div class="item-icon"><i class="fa-solid fa-file-signature"></i></div>
          <div class="item-body">
            <h4>${esc(c.title)}</h4>
            <p>${esc(c.note || '')}</p>
            <div class="item-meta"><span class="tag">${esc(assigned)}</span>${c.size ? `<span>${esc(c.size)}</span>` : ''}<span>Updated ${fmtDate(c.updated)}</span></div>
          </div>
          <div class="item-actions">
            <button class="btn btn-navy btn-sm" onclick="openFile('${esc(c.url)}','${esc(c.title)}')"><i class="fa-solid fa-download"></i><span>Download</span></button>
            ${mine ? `<button class="btn btn-ghost btn-sm" onclick="deleteContract('${esc(c.id)}')"><span>Delete</span></button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>` : emptyInline('No contracts uploaded yet.');
}

async function uploadContractPrompt() {
  let agents = [];
  try { const res = await api('/api/admin/agents'); agents = (res.data || []).filter((a) => a.role === 'agent'); } catch {}
  openModal(`
    <h2>Upload a contract or policy</h2>
    <p class="modal-sub">Share a PDF with all agents, or assign it to one person. Only the assignee (and admins) can download it.</p>
    <div class="field"><label>PDF file <span class="req">*</span></label><input id="ctFile" type="file" accept=".pdf,application/pdf"></div>
    <div class="field"><label>Display name</label><input id="ctName" placeholder="Leave blank to use the file name"></div>
    <div class="field"><label>Assign to</label><select id="ctAssign"><option value="">All agents</option>${agents.map((a) => `<option value="${esc(a.username)}">${esc(a.name || a.username)} (@${esc(a.username)})</option>`).join('')}</select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="uploadContract()"><span>Upload</span></button>
    </div>`);
}
window.uploadContractPrompt = uploadContractPrompt;

async function uploadContract() {
  const f = $('ctFile') && $('ctFile').files ? $('ctFile').files[0] : null;
  if (!f) { toast('Choose a PDF to upload.', 'err'); return; }
  const fd = new FormData();
  fd.append('file', f);
  fd.append('category', 'contracts');
  fd.append('name', $('ctName').value.trim() || f.name);
  fd.append('assignedTo', $('ctAssign').value);
  try {
    await api('/api/admin/files', { method: 'POST', body: fd });
    closeModal(); toast('Document uploaded.', 'ok'); renderContracts($('view'));
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.uploadContract = uploadContract;

function uploadMyContractPrompt() {
  openModal(`
    <h2>Upload a signed document</h2>
    <p class="modal-sub">Upload your signed agreement or any document AUS asked for. Only you and AUS can see it.</p>
    <div class="field"><label>PDF file <span class="req">*</span></label><input id="ctFile" type="file" accept=".pdf,application/pdf"></div>
    <div class="field"><label>Display name</label><input id="ctName" placeholder="Leave blank to use the file name"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="uploadMyContract()"><span>Upload</span></button>
    </div>`);
}
window.uploadMyContractPrompt = uploadMyContractPrompt;

async function uploadMyContract() {
  const f = $('ctFile') && $('ctFile').files ? $('ctFile').files[0] : null;
  if (!f) { toast('Choose a PDF to upload.', 'err'); return; }
  const fd = new FormData();
  fd.append('file', f);
  fd.append('category', 'contracts');
  fd.append('name', $('ctName').value.trim() || f.name);
  try {
    await api('/api/files', { method: 'POST', body: fd });
    closeModal(); toast('Document uploaded.', 'ok'); renderContracts($('view'));
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.uploadMyContract = uploadMyContract;

async function deleteContract(id) {
  if (!confirm('Delete this document? This cannot be undone.')) return;
  try {
    await api('/api/files/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Document deleted.', 'ok');
    loadContracts();
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.deleteContract = deleteContract;

/* ---------------------------------------------------------------------------
   View: Media
   --------------------------------------------------------------------------- */
function renderMedia(v) {
  const list = C().media || [];
  v.innerHTML = `
    <div class="filters">
      <button class="chip active" onclick="void 0">All assets</button>
    </div>
    <div class="gallery">
      ${list.map((m) => `
        <div class="gallery-item">
          <div class="g-thumb"><img src="${esc(m.url)}" alt="${esc(m.title)}" loading="lazy" onerror="this.style.display='none'"></div>
          <div class="g-cap">
            <span>${esc(m.title)}</span>
            <button class="icon-btn" title="Open" onclick="openFile('${esc(m.url)}','${esc(m.title)}')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
          </div>
        </div>`).join('') || `<div class="empty" style="grid-column:1/-1"><i class="fa-regular fa-images"></i><p>No media yet.</p></div>`}
    </div>`;
}

/* ---------------------------------------------------------------------------
   View: Applications
   --------------------------------------------------------------------------- */
function submissionsHtml() {
  const apps = state.apps.length ? state.apps : state.localApps;
  return `
    <div>
      <div class="section-head"><div><h2>Your submissions</h2><p>Applications you've sent to AUS.</p></div></div>
      <div class="item-list" id="appList">
        ${apps.length ? apps.slice().reverse().map((a) => `
          <div class="item">
            <div class="item-icon"><i class="fa-solid fa-user-graduate"></i></div>
            <div class="item-body">
              <h4>${esc(a.studentName)}</h4>
              <p>${esc(a.programme || 'Specialization TBC')} · ${esc(a.intake || '')}</p>
              <div class="item-meta"><span>Sent ${fmtDate(a.created)}</span></div>
            </div>
            <span class="tag ${a.status === 'new' ? 'amber' : 'green'}">${esc(a.status)}</span>
          </div>`).join('') : emptyInline('You have not submitted any applications yet.')}
      </div>
    </div>`;
}

async function loadMyApps() {
  if (DEMO_MODE || !state.token) return;
  try {
    const res = await api('/api/applications');
    state.apps = (res.data || []).map((a) => ({
      studentName: a.student_name, programme: a.programme, intake: a.intake,
      status: a.status, created: a.created_at,
    }));
    const el = $('appList');
    if (el) {
      const wrap = el.parentElement;
      if (wrap) wrap.outerHTML = submissionsHtml();
    }
  } catch { /* keep whatever is already shown */ }
}

function renderApply(v) {
  const HS = CFG.HUBSPOT || {};
  if (HS.enabled && HS.portalId && HS.formId) { renderApplyHubspot(v, HS); return; }

  const programmes = (C().programmes || []).map((p) => `<option value="${esc(p.title)}">${esc(p.level)} · ${esc(p.title)}</option>`).join('');
  v.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3 style="margin-bottom:6px">Submit a student application</h3>
        <p style="font-size:13px;margin-bottom:20px">Fill this in and AUS will follow up with you and the student. Fields marked * are required.</p>
        <div class="field-row">
          <div class="field"><label>Student full name <span class="req">*</span></label><input id="apName" placeholder="First and last name"></div>
          <div class="field"><label>Student email</label><input id="apEmail" type="email" placeholder="student@email.com"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Phone</label><input id="apPhone" placeholder="+961 …"></div>
          <div class="field"><label>Nationality</label><input id="apNat" placeholder="e.g. Lebanese"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Specialization</label><select id="apProgramme"><option value="">Select a specialization…</option>${programmes}</select></div>
          <div class="field"><label>Intake</label><select id="apIntake">${nextIntakes().map((i) => `<option>${i}</option>`).join('')}<option>Other / to discuss</option></select></div>
        </div>
        <div class="field"><label>Notes / context</label><textarea id="apNotes" placeholder="Grades, English level, budget, preferred start date…"></textarea></div>
        <button class="btn btn-primary btn-block" onclick="submitApplication()"><i class="fa-solid fa-paper-plane"></i><span>Submit application</span></button>
      </div>
      ${submissionsHtml()}
    </div>`;
  loadMyApps();
}

let _hubspotLoaded = null;
function loadHubspotScript() {
  if (_hubspotLoaded) return _hubspotLoaded;
  _hubspotLoaded = new Promise((resolve, reject) => {
    if (window.hbspt && window.hbspt.forms) return resolve();
    const s = document.createElement('script');
    s.src = 'https://js.hsforms.net/forms/embed/v2.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('hubspot_load_failed'));
    document.head.appendChild(s);
  });
  return _hubspotLoaded;
}

function renderApplyHubspot(v, HS) {
  v.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3 style="margin-bottom:6px">Submit a student application</h3>
        <p style="font-size:13px;margin-bottom:16px">Complete the form below — AUS will follow up with you and the student.</p>
        <div class="hs-embed" id="hubspotForm"></div>
      </div>
      ${submissionsHtml()}
    </div>`;
  loadMyApps();
  loadHubspotScript()
    .then(() => {
      if (window.hbspt && window.hbspt.forms) {
        window.hbspt.forms.create({
          region: HS.region || 'eu1',
          portalId: HS.portalId,
          formId: HS.formId,
          target: '#hubspotForm',
        });
      }
    })
    .catch(() => {
      $('hubspotForm').innerHTML = '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>HubSpot form unavailable</h3><p>Check the portalId and formId in <code>js/config.js</code>.</p></div>';
    });
}

async function submitApplication() {
  const name = $('apName').value.trim();
  if (!name) { toast('Please enter the student name.', 'err'); return; }
  const payload = {
    studentName: name,
    studentEmail: $('apEmail').value.trim(),
    studentPhone: $('apPhone').value.trim(),
    nationality: $('apNat').value.trim(),
    programme: $('apProgramme').value,
    intake: $('apIntake').value,
    notes: $('apNotes').value.trim(),
  };
  try {
    if (!DEMO_MODE) await api('/api/applications', { method: 'POST', body: payload });
    const record = { ...payload, id: 'local-' + Date.now(), status: 'new', created: new Date().toISOString() };
    state.localApps.push(record);
    localStorage.setItem('aus_portal_apps', JSON.stringify(state.localApps));
    toast('Application submitted. AUS will follow up shortly.', 'ok');
    renderApply($('view'));
  } catch (e) {
    toast(friendlyError(e), 'err');
  }
}
window.submitApplication = submitApplication;

/* ---------------------------------------------------------------------------
   View: Commissions
   --------------------------------------------------------------------------- */
function renderCommissions(v) {
  const u = state.user || {};
  v.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3 style="margin-bottom:6px">Request a commission</h3>
        <p style="font-size:13px;margin-bottom:20px">Send your commission or invoice details to AUS. Finance will review the request and update the status.</p>
        <div class="field-row">
          <div class="field"><label>Amount</label><input id="cmAmount" placeholder="1'000"></div>
          <div class="field"><label>Currency</label><select id="cmCurrency"><option>CHF</option><option>EUR</option><option>USD</option><option>GBP</option></select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Student reference</label><input id="cmStudent" placeholder="Student name or AUS ID"></div>
          <div class="field"><label>Invoice number</label><input id="cmInvoice" placeholder="INV-2027-001"></div>
        </div>
        <div class="field"><label>Period</label><input id="cmPeriod" placeholder="e.g. January 2027 intake"></div>
        <div class="field"><label>Notes</label><textarea id="cmNotes" placeholder="Anything finance should know…"></textarea></div>
        <button class="btn btn-primary btn-block" onclick="submitCommission()"><i class="fa-solid fa-coins"></i><span>Submit request</span></button>
      </div>
      <div>
        <div class="section-head"><div><h2>${u.isAdmin ? 'All requests' : 'Your requests'}</h2><p>${u.isAdmin ? 'Commission requests from every agent.' : 'Track what you have sent to AUS.'}</p></div></div>
        <div id="commissionList">${emptyInline('Loading…')}</div>
      </div>
    </div>`;
  loadCommissions();
}

async function loadCommissions() {
  const el = $('commissionList');
  if (!el) return;
  if (DEMO_MODE) { el.innerHTML = emptyInline('Commission requests need the Cloudflare worker.'); return; }
  const u = state.user || {};
  try {
    const res = await api('/api/commissions');
    const rows = res.data || [];
    if (!rows.length) { el.innerHTML = emptyInline('No commission requests yet.'); return; }
    const statusTag = (s) => {
      const cls = s === 'paid' || s === 'approved' ? 'green' : s === 'rejected' ? 'crimson' : 'amber';
      return `<span class="tag ${cls}">${esc(s)}</span>`;
    };
    el.innerHTML = `<div class="item-list">
      ${rows.map((c) => `
        <div class="item">
          <div class="item-icon"><i class="fa-solid fa-coins"></i></div>
          <div class="item-body">
            <h4>${esc(c.currency || 'CHF')} ${esc(c.amount || '—')}</h4>
            <p>${esc(c.student_ref || 'No student reference')}${c.invoice_no ? ' · ' + esc(c.invoice_no) : ''}</p>
            <div class="item-meta">
              ${u.isAdmin ? `<span class="tag">@${esc(c.agent)}</span>` : ''}
              ${c.period ? `<span>${esc(c.period)}</span>` : ''}
              <span>Sent ${fmtDate(c.created_at)}</span>
            </div>
            ${c.notes ? `<p style="margin-top:6px;font-size:12.5px;color:var(--slate)">${esc(c.notes)}</p>` : ''}
          </div>
          <div class="item-actions" style="text-align:right">
            ${u.isAdmin
              ? `<select onchange="setCommissionStatus('${esc(c.id)}', this.value)" style="font-size:12px;padding:5px 8px;border-radius:8px;border:1px solid var(--line)">
                  ${['new', 'reviewing', 'approved', 'paid', 'rejected'].map((s) => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>`
              : statusTag(c.status)}
          </div>
        </div>`).join('')}
    </div>`;
  } catch (e) { el.innerHTML = emptyInline(friendlyError(e)); }
}

async function submitCommission() {
  const body = {
    amount: $('cmAmount').value.trim(),
    currency: $('cmCurrency').value,
    studentRef: $('cmStudent').value.trim(),
    invoiceNo: $('cmInvoice').value.trim(),
    period: $('cmPeriod').value.trim(),
    notes: $('cmNotes').value.trim(),
  };
  if (!body.amount && !body.notes) { toast('Enter an amount or a note for finance.', 'err'); return; }
  if (DEMO_MODE) { toast('Commission requests need the Cloudflare worker.', 'info'); return; }
  try {
    await api('/api/commissions', { method: 'POST', body });
    toast('Commission request submitted.', 'ok');
    renderCommissions($('view'));
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.submitCommission = submitCommission;

async function sendBroadcast() {
  const subject = $('notifySubject').value.trim();
  const message = $('notifyMessage').value.trim();
  if (!subject || !message) { toast('Enter a subject and a message.', 'err'); return; }
  if (!confirm('Send this email to all opted-in agents?')) return;
  try {
    const res = await api('/api/admin/notify', { method: 'POST', body: { subject, message } });
    const d = res.data || {};
    if (!d.emailConfigured) toast('Saved, but email is not configured on the worker (RESEND_API_KEY).', 'info');
    else toast(`Email sent to ${d.sent} of ${d.recipients} opted-in agents.`, 'ok');
    $('notifySubject').value = ''; $('notifyMessage').value = '';
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.sendBroadcast = sendBroadcast;

async function setCommissionStatus(id, status) {
  try {
    await api('/api/admin/commissions', { method: 'PATCH', body: { id, status } });
    toast('Status updated.', 'ok');
    loadCommissions();
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.setCommissionStatus = setCommissionStatus;

/* ---------------------------------------------------------------------------
   View: Account & Security
   --------------------------------------------------------------------------- */
function renderAccount(v) {
  const u = state.user || {};
  v.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3>Profile</h3>
        <p style="font-size:13px;margin-bottom:18px">Your agent account details.</p>
        <div class="sec-row"><div class="sec-info"><h4>Name</h4><p>${esc(u.name || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Username</h4><p>${esc(u.username)}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Email</h4><p>${esc(u.email || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Phone</h4><p>${esc(u.phone || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Agency</h4><p>${esc(u.agency || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Country</h4><p>${esc(u.country || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Address</h4><p>${esc([u.addressLine1, u.addressLine2, [u.postalCode, u.city].filter(Boolean).join(' '), u.region].filter(Boolean).join(', ') || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Role</h4><p>${u.isSuperAdmin ? 'Superadmin' : u.isAdmin ? 'Administrator' : 'AUS Agent'}</p></div></div>
        <div class="sec-row">
          <div class="sec-info"><h4>Email updates</h4><p>${u.notifyEmail ? 'You receive email notifications from AUS.' : 'Email notifications are turned off.'}</p></div>
          <button class="btn btn-ghost btn-sm" onclick="toggleNotifications()"><span>${u.notifyEmail ? 'Turn off' : 'Turn on'}</span></button>
        </div>
      </div>

      <div class="card">
        <h3>Two-factor authentication</h3>
        <p style="font-size:13px;margin-bottom:18px">Add a 6-digit code from an authenticator app to protect your account.</p>
        <div class="sec-row">
          <div class="sec-info"><h4>Status</h4><p>${u.twoFA ? 'Enabled' : 'Not enabled'}</p></div>
          <span class="tag ${u.twoFA ? 'green' : 'amber'}">${u.twoFA ? 'On' : 'Off'}</span>
        </div>
        <div style="margin-top:16px">
          ${u.twoFA
            ? `<button class="btn btn-outline" onclick="twofaDisablePrompt()"><span>Disable 2FA</span></button>`
            : `<button class="btn btn-primary" onclick="twofaSetupPrompt()"><i class="fa-solid fa-shield-halved"></i><span>Enable 2FA</span></button>`}
        </div>
      </div>

      <div class="card">
        <h3>Change password</h3>
        <p style="font-size:13px;margin-bottom:18px">Changing your password signs out your other devices.</p>
        <div class="field"><label>Current password</label><input id="cpCurrent" type="password" autocomplete="current-password"></div>
        <div class="field"><label>New password</label><input id="cpNext" type="password" autocomplete="new-password" placeholder="At least 8 characters"></div>
        <button class="btn btn-primary" onclick="changePassword()"><span>Update password</span></button>
      </div>

      <div class="card">
        <h3>Active sessions</h3>
        <p style="font-size:13px;margin-bottom:18px">Devices currently signed in to your account.</p>
        ${DEMO_MODE ? `<div class="empty" style="padding:24px 0"><i class="fa-solid fa-cloud"></i><p>Connect the Cloudflare worker to see live sessions.</p></div>` : `<div id="sessionList">${emptyInline('Loading…')}</div>`}
      </div>
    </div>`;
  if (!DEMO_MODE) loadSessions();
}

async function saveNotificationPref(enabled) {
  if (DEMO_MODE) {
    state.user.notifyEmail = enabled;
    state.user.notifiedAsked = true;
    return;
  }
  const res = await api('/api/notifications', { method: 'POST', body: { notifyEmail: enabled } });
  state.user.notifyEmail = !!(res.data && res.data.notifyEmail);
  state.user.notifiedAsked = true;
}

async function toggleNotifications() {
  try {
    await saveNotificationPref(!state.user.notifyEmail);
    toast(state.user.notifyEmail ? 'Email notifications enabled.' : 'Email notifications turned off.', 'ok');
    renderAccount($('view'));
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.toggleNotifications = toggleNotifications;

// Shown once, after the first sign-in, to ask whether AUS may email updates.
function askNotificationPref() {
  const u = state.user || {};
  if (DEMO_MODE || u.isAdmin || u.notifiedAsked) return;
  openModal(`
    <h2>Stay up to date</h2>
    <p class="modal-sub">May we email you when new brochures, contracts or offers are published? We will only send useful updates — you can unsubscribe at any time.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="answerNotifications(false)">Not now</button>
      <button class="btn btn-primary" onclick="answerNotifications(true)"><i class="fa-solid fa-envelope"></i><span>Yes, email me</span></button>
    </div>`);
}
window.askNotificationPref = askNotificationPref;

async function answerNotifications(enabled) {
  try {
    await saveNotificationPref(enabled);
    closeModal();
    if (enabled) toast('You are subscribed to AUS email updates.', 'ok');
  } catch (e) { closeModal(); toast(friendlyError(e), 'err'); }
}
window.answerNotifications = answerNotifications;

async function changePassword() {
  const current = $('cpCurrent').value;
  const next = $('cpNext').value;
  if (DEMO_MODE) { toast('Password change needs the Cloudflare worker.', 'info'); return; }
  try {
    const res = await api('/api/change-password', { method: 'POST', body: { current, next } });
    if (res.token) persistToken(res.token);
    $('cpCurrent').value = ''; $('cpNext').value = '';
    toast('Password updated.', 'ok');
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.changePassword = changePassword;

async function loadSessions() {
  try {
    const res = await api('/api/sessions');
    const el = $('sessionList');
    if (!res.data || !res.data.length) { el.innerHTML = emptyInline('No active sessions.'); return; }
    el.innerHTML = res.data.map((s) => `
      <div class="sec-row">
        <div class="sec-info"><h4>${esc(s.device || 'Unknown device')}</h4><p>Last active ${fmtDate(s.lastSeen)}</p></div>
        <button class="btn btn-ghost btn-sm" onclick="revokeSession('${s.id}')"><span>Revoke</span></button>
      </div>`).join('');
  } catch { $('sessionList').innerHTML = emptyInline('Could not load sessions.'); }
}
async function revokeSession(id) {
  try { await api('/api/sessions', { method: 'DELETE', body: { id } }); loadSessions(); toast('Session revoked.', 'ok'); }
  catch (e) { toast(friendlyError(e), 'err'); }
}
window.revokeSession = revokeSession;

async function twofaSetupPrompt() {
  if (DEMO_MODE) { toast('2FA setup needs the Cloudflare worker connected.', 'info'); return; }
  try {
    const res = await api('/api/2fa/setup', { method: 'POST' });
    openModal(`
      <h2>Enable two-factor authentication</h2>
      <p class="modal-sub">1. Add this key to Google Authenticator, Authy or 1Password.<br>2. Enter the 6-digit code it generates.</p>
      <div class="totp-secret" style="margin-bottom:18px">${esc(res.secret)}</div>
      <div class="field"><label>6-digit code</label><input id="setupCode" class="code-input" inputmode="numeric" maxlength="6" placeholder="000000"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="twofaConfirm('${esc(res.secret)}')"><span>Verify &amp; enable</span></button>
      </div>`);
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.twofaSetupPrompt = twofaSetupPrompt;

async function twofaConfirm(secret) {
  const code = $('setupCode').value.trim();
  try {
    await api('/api/2fa/enable', { method: 'POST', body: { secret, code } });
    state.user.twoFA = true;
    closeModal(); toast('Two-factor authentication is now enabled.', 'ok'); renderAccount($('view'));
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.twofaConfirm = twofaConfirm;

function twofaDisablePrompt() {
  openModal(`
    <h2>Disable two-factor authentication</h2>
    <p class="modal-sub">Enter the current 6-digit code from your authenticator to confirm.</p>
    <div class="field"><label>6-digit code</label><input id="disableCode" class="code-input" inputmode="numeric" maxlength="6" placeholder="000000"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="twofaDisable()"><span>Disable 2FA</span></button>
    </div>`);
}
window.twofaDisablePrompt = twofaDisablePrompt;

async function twofaDisable() {
  const code = $('disableCode').value.trim();
  try {
    await api('/api/2fa/disable', { method: 'POST', body: { code } });
    state.user.twoFA = false;
    closeModal(); toast('Two-factor authentication disabled.', 'ok'); renderAccount($('view'));
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.twofaDisable = twofaDisable;

/* ---------------------------------------------------------------------------
   View: Admin
   --------------------------------------------------------------------------- */
function renderAdmin(v) {
  v.innerHTML = `
    <div class="grid" style="gap:24px">
      <div>
        <div class="section-head">
          <div><h2>Agents</h2><p>Only these accounts can access the portal.</p></div>
          <button class="btn btn-primary btn-sm" onclick="newAgentPrompt()"><i class="fa-solid fa-user-plus"></i><span>Add agent</span></button>
        </div>
        <div id="agentTable">${emptyInline('Loading agents…')}</div>
      </div>

      <div class="grid cols-2" style="align-items:start">
        <div>
          <div class="section-head"><div><h2>Applications</h2><p>Student applications from agents.</p></div></div>
          <div id="adminApps">${DEMO_MODE ? emptyInline('Applications appear here once the worker is connected.') : emptyInline('Loading…')}</div>
        </div>
        <div>
          <div class="section-head"><div><h2>Content</h2><p>Upload and edit brochures, offers and images.</p></div></div>
          <div class="card">
            ${contentRow('brochures', 'Brochures', 'PDFs agents can download and share.', 'fa-file-pdf')}
            ${contentRow('offers', 'Offers', 'Promotions shown to your agents.', 'fa-gift')}
            ${contentRow('media', 'Images & media', 'Marketing assets for agents.', 'fa-image')}
          </div>
          <div class="section-head" style="margin-top:22px"><div><h2>Email update</h2><p>Send a note to agents who opted in.</p></div></div>
          <div class="card">
            <div class="field"><label>Subject</label><input id="notifySubject" placeholder="New brochure available"></div>
            <div class="field"><label>Message</label><textarea id="notifyMessage" placeholder="Write a short update for your agents…"></textarea></div>
            <button class="btn btn-primary btn-sm" onclick="sendBroadcast()"><i class="fa-solid fa-paper-plane"></i><span>Send to opted-in agents</span></button>
            <p class="field-hint" style="margin-top:8px">Requires <code>RESEND_API_KEY</code> on the worker. Each email includes an unsubscribe link.</p>
          </div>
        </div>
      </div>

      ${(state.user && state.user.isSuperAdmin) ? `
      <div>
        <div class="section-head">
          <div><h2>Backups</h2><p>Automatic daily snapshots — restore any point in time.</p></div>
          <button class="btn btn-primary btn-sm" onclick="backupNow()"><i class="fa-solid fa-cloud-arrow-up"></i><span>Back up now</span></button>
        </div>
        <div id="backupList">${DEMO_MODE ? emptyInline('Backups require the Cloudflare worker.') : emptyInline('Loading backups…')}</div>
      </div>` : ''}
    </div>`;
  if (!DEMO_MODE) { loadAgents(); loadAdminApps(); }
  if (state.user && state.user.isSuperAdmin) loadBackups();
}

function contentRow(type, title, sub, icon) {
  const count = (C()[type] || []).length;
  return `<div class="sec-row">
    <div class="sec-info"><h4>${title} <span style="color:var(--slate);font-weight:600">· ${count}</span></h4><p>${sub}</p></div>
    <button class="btn btn-outline btn-sm" onclick="openResource('${type}')"><i class="fa-solid ${icon}"></i><span>Manage</span></button>
  </div>`;
}

async function loadAgents() {
  const me = state.user || {};
  try {
    const res = await api('/api/admin/agents');
    const el = $('agentTable');
    if (!res.data.length) { el.innerHTML = emptyInline('No accounts yet.'); return; }
    el.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Name</th><th>Contact</th><th>Country</th><th>Role</th><th>2FA</th><th></th></tr></thead>
      <tbody>${res.data.map((a) => {
        const roleTag = a.role === 'superadmin'
          ? '<span class="tag role-super">Superadmin</span>'
          : a.role === 'admin' ? '<span class="tag role-admin">Admin</span>' : '<span class="tag role-agent">Agent</span>';
        const canManage = !a.isSuperAdmin && (me.isSuperAdmin || a.role !== 'admin');
        return `<tr>
          <td><b>${esc(a.name || a.username)}</b><br><span style="color:var(--slate);font-size:12px">@${esc(a.username)}</span></td>
          <td>${esc(a.email || '—')}<br><span style="color:var(--slate);font-size:12px">${esc(a.phone || '')}</span></td>
          <td>${esc(a.country || '—')}${a.agency ? '<br><span style="color:var(--slate);font-size:12px">' + esc(a.agency) + '</span>' : ''}</td>
          <td>${roleTag}</td>
          <td>${a.twoFA ? '<span class="tag green">On</span>' : '<span class="tag amber">Off</span>'}</td>
          <td style="text-align:right;white-space:nowrap">
            ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="resetAgentPrompt('${esc(a.username)}')">Reset password</button>` : ''}
            ${me.isSuperAdmin && !a.isSuperAdmin ? `<button class="btn btn-ghost btn-sm" onclick="toggleAgentRole('${esc(a.username)}', ${a.role === 'admin' ? 'false' : 'true'})">${a.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>` : ''}
            ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="deleteAgent('${esc(a.username)}')">Remove</button>` : ''}
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  } catch (e) { $('agentTable').innerHTML = emptyInline(friendlyError(e)); }
}

async function toggleAgentRole(username, isAdmin) {
  try {
    await api('/api/admin/agents/role', { method: 'POST', body: { username, isAdmin } });
    toast(isAdmin ? 'Promoted to administrator.' : 'Administrator access removed.', 'ok');
    loadAgents();
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.toggleAgentRole = toggleAgentRole;

function newAgentPrompt() {
  const me = state.user || {};
  openModal(`
    <h2>Add an account</h2>
    <p class="modal-sub">Create login credentials for a selected agent. Fields marked * are required.</p>
    <div class="field-row">
      <div class="field"><label>Full name <span class="req">*</span></label><input id="naName" placeholder="e.g. Maria Rossi"></div>
      <div class="field"><label>Email <span class="req">*</span></label><input id="naEmail" type="email" placeholder="agent@agency.com"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Phone <span class="req">*</span></label><input id="naPhone" placeholder="+961 …"></div>
      ${countryField('naCountry', 'Country')}
    </div>
    <div class="field-row">
      <div class="field"><label>Agency</label><input id="naAgency" placeholder="Agency name"></div>
      <div class="field"><label>Username <span class="req">*</span></label><input id="naUser" placeholder="login name"></div>
    </div>
    <div class="field"><label>Address line 1</label><input id="naAddr1" placeholder="Street and number"></div>
    <div class="field-row">
      <div class="field"><label>Address line 2</label><input id="naAddr2" placeholder="Building, floor…"></div>
      <div class="field"><label>City</label><input id="naCity" placeholder="City"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Postal code</label><input id="naPostal" placeholder="1000"></div>
      <div class="field"><label>Region / state</label><input id="naRegion" placeholder="Region"></div>
    </div>
    <div class="field"><label>Temporary password <span class="req">*</span></label><input id="naPass" placeholder="At least 8 characters"></div>
    <div class="field">
      <label>Contracts &amp; documents</label>
      <input id="naFiles" type="file" accept=".pdf,application/pdf" multiple>
      <p class="field-hint">Optional. These are assigned to this agent only.</p>
    </div>
    ${me.isSuperAdmin ? `<label style="display:flex;gap:9px;align-items:center;font-size:13px;color:var(--ink-soft);margin-top:4px"><input type="checkbox" id="naAdmin" style="width:auto"> Grant administrator access</label>` : ''}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="createAgent()"><span>Create account</span></button>
    </div>`);
}
window.newAgentPrompt = newAgentPrompt;

async function createAgent() {
  const country = ($('naCountry').dataset.value || $('naCountry').value || '').trim();
  const known = COUNTRIES.some((c) => c.name.toLowerCase() === country.toLowerCase());
  const body = {
    name: $('naName').value.trim(),
    email: $('naEmail').value.trim(),
    phone: $('naPhone').value.trim(),
    country,
    agency: $('naAgency').value.trim(),
    addressLine1: $('naAddr1').value.trim(),
    addressLine2: $('naAddr2').value.trim(),
    city: $('naCity').value.trim(),
    postalCode: $('naPostal').value.trim(),
    region: $('naRegion').value.trim(),
    username: $('naUser').value.trim().toLowerCase(),
    password: $('naPass').value,
    isAdmin: $('naAdmin') ? $('naAdmin').checked : false,
  };
  if (!body.name || !body.email || !body.phone || !body.country) { toast('Full name, email, phone and country are required.', 'err'); return; }
  if (!known) { toast('Please choose the country from the list.', 'err'); return; }
  if (!body.username || body.password.length < 8) { toast('A username and an 8+ character password are required.', 'err'); return; }
  if (DEMO_MODE) { toast('Demo mode: accounts are not stored. Connect the worker.', 'info'); closeModal(); return; }
  try {
    await api('/api/admin/agents', { method: 'POST', body });
    const fileEl = $('naFiles');
    const files = fileEl && fileEl.files ? Array.from(fileEl.files) : [];
    let uploaded = 0;
    for (const f of files) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('category', 'contracts');
      fd.append('name', f.name);
      fd.append('assignedTo', body.username);
      try { await api('/api/admin/files', { method: 'POST', body: fd }); uploaded += 1; } catch {}
    }
    closeModal();
    toast(uploaded ? `Account created with ${uploaded} document${uploaded > 1 ? 's' : ''}.` : 'Account created.', 'ok');
    loadAgents();
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.createAgent = createAgent;

function resetAgentPrompt(username) {
  openModal(`
    <h2>Reset password</h2>
    <p class="modal-sub">Set a new password for <b>${esc(username)}</b>. They will be signed out of all devices.</p>
    <div class="field"><label>New password</label><input id="raPass" placeholder="At least 8 characters"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="resetAgentPassword('${esc(username)}')"><span>Update password</span></button>
    </div>`);
}
window.resetAgentPrompt = resetAgentPrompt;

async function resetAgentPassword(username) {
  try {
    await api('/api/admin/agents/password', { method: 'POST', body: { username, password: $('raPass').value } });
    closeModal(); toast('Password updated.', 'ok');
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.resetAgentPassword = resetAgentPassword;

async function deleteAgent(username) {
  if (!confirm('Remove agent "' + username + '"? This cannot be undone.')) return;
  try { await api('/api/admin/agents?username=' + encodeURIComponent(username), { method: 'DELETE' }); toast('Agent removed.', 'ok'); loadAgents(); }
  catch (e) { toast(friendlyError(e), 'err'); }
}
window.deleteAgent = deleteAgent;

async function loadAdminApps() {
  try {
    const res = await api('/api/admin/applications');
    const el = $('adminApps');
    if (!res.data.length) { el.innerHTML = emptyInline('No applications yet.'); return; }
    el.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Student</th><th>Specialization</th><th>Agent</th><th>Status</th></tr></thead>
      <tbody>${res.data.map((a) => `
        <tr>
          <td><b>${esc(a.student_name)}</b><br><span style="color:var(--slate);font-size:12px">${esc(a.student_email || '')}</span></td>
          <td>${esc(a.programme || '—')}<br><span style="color:var(--slate);font-size:12px">${esc(a.intake || '')}</span></td>
          <td>${esc(a.agent)}</td>
          <td>
            <select onchange="setAppStatus('${esc(a.id)}', this.value)" style="font-size:12px;padding:5px 8px;border-radius:8px;border:1px solid var(--line)">
              ${['new', 'contacted', 'offer', 'enrolled', 'closed'].map((s) => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
        </tr>`).join('')}</tbody>
    </table></div>`;
  } catch (e) { $('adminApps').innerHTML = emptyInline(friendlyError(e)); }
}
async function setAppStatus(id, status) {
  try { await api('/api/admin/applications', { method: 'PATCH', body: { id, status } }); toast('Status updated.', 'ok'); }
  catch (e) { toast(friendlyError(e), 'err'); }
}
window.setAppStatus = setAppStatus;

function editContentPrompt() {
  openModal(`
    <h2>Edit portal content</h2>
    <p class="modal-sub">Edit the JSON below (news, offers, brochures, contracts, specializations, media). Save to publish to all agents.</p>
    <div class="field"><textarea id="contentJson" style="min-height:360px;font-family:ui-monospace,monospace;font-size:12.5px">${esc(JSON.stringify(C(), null, 2))}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveContent()"><span>Save content</span></button>
    </div>`, true);
}
window.editContentPrompt = editContentPrompt;

async function saveContent() {
  let parsed;
  try { parsed = JSON.parse($('contentJson').value); }
  catch (e) { toast('That is not valid JSON: ' + e.message, 'err'); return; }
  if (DEMO_MODE) { state.content = parsed; closeModal(); toast('Content updated (demo only).', 'ok'); return; }
  try {
    await api('/api/admin/content', { method: 'PUT', body: { content: parsed } });
    state.content = parsed; closeModal(); toast('Content published to all agents.', 'ok'); go(state.view);
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.saveContent = saveContent;

/* ---------------------------------------------------------------------------
   Content manager — upload + add/edit/remove brochures, offers and images.
   Changes are written into the portal content blob (brochures/offers/media);
   uploaded files are stored in the worker's KV and referenced by URL.
   --------------------------------------------------------------------------- */
const RESOURCES = {
  brochures: {
    label: 'Brochures', singular: 'brochure', icon: 'fa-file-pdf', category: 'brochures', urlKey: 'url',
    title: (b) => b.title,
    summary: (b) => [b.programme, b.region, b.size].filter(Boolean).join(' · '),
    upload: { label: 'Brochure PDF', accept: '.pdf,application/pdf', required: true },
    fields: [
      { key: 'title', label: 'Title', required: true, placeholder: 'AUS Global Brochure' },
      { key: 'programme', label: 'Specialization', placeholder: 'All specializations' },
      { key: 'region', label: 'Region', placeholder: 'Global' },
    ],
    blank: () => ({ id: uid('b'), title: '', programme: '', region: '', url: '', size: '', updated: today() }),
  },
  offers: {
    label: 'Offers', singular: 'offer', icon: 'fa-gift', category: 'media', urlKey: 'image',
    title: (o) => o.title,
    summary: (o) => [o.badge, o.subtitle].filter(Boolean).join(' · '),
    upload: { label: 'Offer image (optional)', accept: 'image/*', required: false },
    fields: [
      { key: 'title', label: 'Title', required: true, placeholder: "CHF 1'000 commission bonus per new student" },
      { key: 'badge', label: 'Badge', placeholder: 'January 2027 intake' },
      { key: 'subtitle', label: 'Subtitle' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'bullets', label: 'Bullet points (one per line)', type: 'textarea' },
      { key: 'cta', label: 'Button label', placeholder: 'Submit an application' },
      { key: 'contact', label: 'Contact line' },
      { key: 'active', label: 'Show this offer to agents', type: 'checkbox' },
    ],
    blank: () => ({ id: uid('o'), active: true, badge: '', title: '', subtitle: '', body: '', bullets: [], cta: 'Submit an application', contact: '', image: '' }),
  },
  media: {
    label: 'Images & media', singular: 'image', icon: 'fa-image', category: 'media', urlKey: 'url',
    title: (m) => m.title,
    summary: (m) => [m.type, m.tags].filter(Boolean).join(' · '),
    upload: { label: 'Image file', accept: 'image/*', required: true },
    fields: [
      { key: 'title', label: 'Title', required: true, placeholder: 'AUS campus on the Swiss Riviera' },
      { key: 'type', label: 'Type', placeholder: 'Photo' },
      { key: 'tags', label: 'Tags (comma separated)', placeholder: 'campus, switzerland' },
    ],
    blank: () => ({ id: uid('m'), title: '', type: 'Photo', tags: '', url: '' }),
  },
};
let resEdit = null; // { type, id, base } while the edit modal is open

async function uploadToWorker(file, category) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('category', category || 'media');
  fd.append('name', file.name);
  const res = await api('/api/admin/files', { method: 'POST', body: fd });
  return res.data;
}

async function putContentObject(content, okMsg) {
  if (DEMO_MODE) { state.content = content; toast((okMsg || 'Saved.') + ' (demo only).', 'ok'); return; }
  await api('/api/admin/content', { method: 'PUT', body: { content } });
  state.content = content;
  toast(okMsg || 'Saved.', 'ok');
}

function openResource(type) {
  const def = RESOURCES[type];
  const items = C()[type] || [];
  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px">
      <div><h2>${def.label}</h2><p class="modal-sub" style="margin-bottom:0">Add, edit or remove entries. Changes publish to all agents immediately.</p></div>
      <button class="btn btn-primary btn-sm" onclick="editResourceItem('${type}')"><i class="fa-solid fa-plus"></i><span>Add</span></button>
    </div>
    <div class="item-list" style="margin-top:18px">
      ${items.length ? items.map((it) => `
        <div class="item">
          <div class="item-icon crimson"><i class="fa-solid ${def.icon}"></i></div>
          <div class="item-body"><h4>${esc(def.title(it) || 'Untitled')}</h4><p>${esc(def.summary(it) || '')}</p></div>
          <div class="item-actions">
            <button class="btn btn-ghost btn-sm" onclick="editResourceItem('${type}','${esc(it.id)}')">Edit</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteResourceItem('${type}','${esc(it.id)}')">Remove</button>
          </div>
        </div>`).join('') : emptyInline('Nothing here yet — add the first one.')}
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Done</button></div>`, true);
}
window.openResource = openResource;

function resField(f, value) {
  if (f.type === 'checkbox') {
    return `<label style="display:flex;gap:9px;align-items:center;font-size:13.5px;color:var(--ink-soft);margin:10px 0">
      <input type="checkbox" id="rf_${f.key}" style="width:auto" ${value ? 'checked' : ''}> ${esc(f.label)}</label>`;
  }
  const v = f.key === 'bullets' && Array.isArray(value) ? value.join('\n') : (value || '');
  if (f.type === 'textarea') {
    return `<div class="field"><label>${esc(f.label)}</label><textarea id="rf_${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea></div>`;
  }
  return `<div class="field"><label>${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>
    <input id="rf_${f.key}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"></div>`;
}

function editResourceItem(type, id) {
  const def = RESOURCES[type];
  const base = id ? (C()[type] || []).find((x) => x.id === id) : def.blank();
  if (!base) { toast('That item no longer exists.', 'err'); return; }
  resEdit = { type, id: id || null, base: JSON.parse(JSON.stringify(base)) };
  const currentUrl = base[def.urlKey];
  openModal(`
    <h2>${id ? 'Edit' : 'Add'} ${def.singular}</h2>
    <p class="modal-sub">${def.upload ? 'Upload a file and fill in the details below.' : 'Fill in the details below.'}</p>
    ${def.fields.map((f) => resField(f, base[f.key])).join('')}
    ${def.upload ? `<div class="field">
      <label>${def.upload.label}${def.upload.required ? ' <span class="req">*</span>' : ''}</label>
      ${currentUrl ? `<p class="field-hint" style="margin-bottom:6px"><i class="fa-solid fa-paperclip"></i> ${esc(currentUrl)}</p>` : ''}
      <input id="rf_file" type="file" accept="${def.upload.accept}">
    </div>` : ''}
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="editResourceItemBack()">Back</button>
      <button class="btn btn-primary" onclick="saveResourceItem()"><span>${id ? 'Save' : 'Add'}</span></button>
    </div>`, true);
}
window.editResourceItem = editResourceItem;
function editResourceItemBack() { if (resEdit) openResource(resEdit.type); }
window.editResourceItemBack = editResourceItemBack;

async function saveResourceItem() {
  if (!resEdit) return;
  const def = RESOURCES[resEdit.type];
  const item = JSON.parse(JSON.stringify(resEdit.base));
  for (const f of def.fields) {
    const el = $('rf_' + f.key);
    if (!el) continue;
    if (f.type === 'checkbox') item[f.key] = el.checked;
    else if (f.key === 'bullets') item[f.key] = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    else item[f.key] = el.value.trim();
  }
  const missing = def.fields.find((f) => f.required && !String(item[f.key] || '').trim());
  if (missing) { toast(missing.label + ' is required.', 'err'); return; }

  const fileEl = def.upload ? $('rf_file') : null;
  const file = fileEl && fileEl.files ? fileEl.files[0] : null;
  if (def.upload && def.upload.required && !file && !item[def.urlKey]) {
    toast(def.upload.label + ' is required.', 'err'); return;
  }

  try {
    if (file) {
      const up = await uploadToWorker(file, def.category);
      item[def.urlKey] = up.url;
      if (resEdit.type === 'brochures') { item.size = fileSize(up.size); item.updated = today(); }
    }
    const content = JSON.parse(JSON.stringify(C()));
    content[resEdit.type] = content[resEdit.type] || [];
    if (resEdit.id) {
      const i = content[resEdit.type].findIndex((x) => x.id === resEdit.id);
      if (i >= 0) content[resEdit.type][i] = item;
      else content[resEdit.type].unshift(item);
    } else {
      content[resEdit.type].unshift(item);
    }
    await putContentObject(content, 'Saved.');
    openResource(resEdit.type);
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.saveResourceItem = saveResourceItem;

async function deleteResourceItem(type, id) {
  const def = RESOURCES[type];
  const it = (C()[type] || []).find((x) => x.id === id);
  if (!confirm('Remove "' + (def.title(it) || 'this item') + '"? This cannot be undone.')) return;
  const content = JSON.parse(JSON.stringify(C()));
  content[type] = (content[type] || []).filter((x) => x.id !== id);
  try { await putContentObject(content, 'Removed.'); openResource(type); }
  catch (e) { toast(friendlyError(e), 'err'); }
}
window.deleteResourceItem = deleteResourceItem;

/* ---------------------------------------------------------------------------
   Backups (superadmin only)
   --------------------------------------------------------------------------- */
function backupKindLabel(kind) {
  return { auto: 'Automatic', manual: 'Manual', 'pre-change': 'Before an edit', 'pre-restore': 'Before a restore' }[kind] || 'Backup';
}

async function loadBackups() {
  const el = $('backupList');
  if (!el) return;
  if (DEMO_MODE) { el.innerHTML = emptyInline('Backups require the Cloudflare worker.'); return; }
  try {
    const res = await api('/api/admin/backups');
    if (!res.data.length) { el.innerHTML = emptyInline('No backups yet. One is taken automatically each day.'); return; }
    const last = res.data[0];
    el.innerHTML = `
      <div class="card" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <i class="fa-solid fa-clock-rotate-left" style="color:var(--crimson);font-size:16px"></i>
        <span style="font-size:13.5px">Last backup: <b>${fmtDate(last.createdAt)}</b> · ${esc(backupKindLabel(last.kind))}${last.counts ? ' · ' + last.counts.content + ' content items, ' + last.counts.users + ' accounts' : ''}</span>
        <span style="margin-left:auto;font-size:12.5px;color:var(--slate)">Keeping the latest ${res.keep}</span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>When</th><th>Type</th><th>Contents</th><th>Size</th><th></th></tr></thead>
        <tbody>${res.data.map((b) => `
          <tr>
            <td>${fmtDate(b.createdAt)}<br><span style="color:var(--slate);font-size:12px">${esc(String(b.createdAt || '').slice(11, 16))} UTC</span></td>
            <td><span class="tag">${esc(backupKindLabel(b.kind))}</span></td>
            <td>${b.counts ? `${b.counts.content} content · ${b.counts.applications} apps · ${b.counts.users} accounts` : '—'}<br><span style="color:var(--slate);font-size:12px">by ${esc(b.createdBy || '—')}</span></td>
            <td>${fileSize(b.bytes)}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="downloadBackup('${esc(b.id)}')">Download</button>
              <button class="btn btn-ghost btn-sm" onclick="restoreBackupPrompt('${esc(b.id)}')">Restore</button>
              <button class="btn btn-ghost btn-sm" onclick="deleteBackup('${esc(b.id)}')">Delete</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>`;
  } catch (e) { el.innerHTML = emptyInline(friendlyError(e)); }
}

async function backupNow() {
  if (DEMO_MODE) { toast('Backups require the Cloudflare worker.', 'info'); return; }
  try { await api('/api/admin/backups', { method: 'POST' }); toast('Backup created.', 'ok'); loadBackups(); }
  catch (e) { toast(friendlyError(e), 'err'); }
}
window.backupNow = backupNow;

function restoreBackupPrompt(id) {
  openModal(`
    <h2>Restore a backup</h2>
    <p class="modal-sub">Choose what to restore. The current state is backed up automatically first, so a restore can itself be undone.</p>
    <label style="display:flex;gap:9px;align-items:center;font-size:13.5px;margin:8px 0"><input type="checkbox" id="rs_content" checked style="width:auto"> Portal content (brochures, offers, images, news…)</label>
    <label style="display:flex;gap:9px;align-items:center;font-size:13.5px;margin:8px 0"><input type="checkbox" id="rs_apps" style="width:auto"> Student applications</label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="restoreBackup('${esc(id)}')"><span>Restore now</span></button>
    </div>`);
}
window.restoreBackupPrompt = restoreBackupPrompt;

async function restoreBackup(id) {
  const scope = [];
  if ($('rs_content') && $('rs_content').checked) scope.push('content');
  if ($('rs_apps') && $('rs_apps').checked) scope.push('applications');
  if (!scope.length) { toast('Select at least one thing to restore.', 'err'); return; }
  try {
    await api('/api/admin/backups/restore', { method: 'POST', body: { id, scope } });
    closeModal();
    toast('Backup restored.', 'ok');
    try { const res = await api('/api/content'); state.content = res.data; } catch {}
    renderAdmin($('view'));
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.restoreBackup = restoreBackup;

async function deleteBackup(id) {
  if (!confirm('Delete this backup? This cannot be undone.')) return;
  try { await api('/api/admin/backups?id=' + encodeURIComponent(id), { method: 'DELETE' }); toast('Backup deleted.', 'ok'); loadBackups(); }
  catch (e) { toast(friendlyError(e), 'err'); }
}
window.deleteBackup = deleteBackup;

async function downloadBackup(id) {
  try {
    const res = await fetch(WORKER + '/api/admin/backups/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + state.token } });
    if (!res.ok) throw new Error('download_failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aus-portal-backup-' + id + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { toast('Could not download this backup.', 'err'); }
}
window.downloadBackup = downloadBackup;

/* ---------------------------------------------------------------------------
   File opening (gated worker files need an authenticated fetch)
   --------------------------------------------------------------------------- */
async function openFile(url, name) {
  if (WORKER && url.startsWith('/api/')) {
    try {
      const res = await fetch(WORKER + url, { headers: { Authorization: 'Bearer ' + state.token } });
      if (!res.ok) throw new Error('download_failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast('Could not download this file.', 'err'); }
    return;
  }
  window.open(url, '_blank', 'noopener');
}
window.openFile = openFile;

/* ---------------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------------- */
(function boot() {
  // Reset-link landing
  if (/reset=/.test(location.hash)) {
    $('loginFields').classList.add('hidden');
    $('authSubmit').classList.add('hidden');
    $('resetFields').classList.remove('hidden');
    $('authTitle').textContent = 'Choose a new password';
    $('authSub').textContent = 'Enter a new password for your account.';
  }

  const demoText = $('demoNoteText');
  if (DEMO_MODE) {
    demoText.innerHTML = 'Demo mode — not connected to Cloudflare yet. Try <b>demo</b> / <b>demo1234</b> or <b>admin</b> / <b>admin1234</b>.';
  } else {
    $('demoNote').classList.add('hidden');
  }

  window.addEventListener('resize', () => { if (window.innerWidth > 820) closeSidebar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

  restoreSession();
})();
