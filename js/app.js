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
      title: 'CHF 1,000 commission bonus per new student',
      subtitle: 'Celebrating our 50th Anniversary and building new agent relationships',
      body: 'For every new student you recruit for the January 2027 intake, you earn an extra CHF 1,000 commission bonus — on top of your standard commission.',
      bullets: [
        'CHF 1,000 bonus for every new student recruited for the January 2027 intake',
        'Applies to new agents and existing partners',
        'Follow-up from Jonathan Hilton with direct links to this offer',
      ],
      cta: 'Submit an application', contact: 'For more information contact Jonathan Hilton — j.hilton@aus.swiss',
      image: 'assets/media/offer-50th.svg' },
  ],
  brochures: [
    { id: 'b1', title: 'AUS Global Brochure', programme: 'All programmes', region: 'Global',
      url: 'assets/brochures/AUS-Global-Brochure.pdf', size: '8.4 MB', updated: '2026-10-01' },
    { id: 'b2', title: 'Hospitality Management 2027', programme: 'Bachelor · Hospitality Management', region: 'Switzerland',
      url: 'assets/brochures/AUS-Hospitality-Management-Brochure-2027.pdf', size: '1.4 MB', updated: '2026-10-01' },
  ],
  contracts: [
    { id: 'c1', title: 'Agent Representation Agreement (template)', note: 'Standard representation agreement for new agent partners. Counter-signed by AUS.', url: 'assets/brochures/AUS-Global-Brochure.pdf', updated: '2026-10-01' },
    { id: 'c2', title: 'Student Enrolment Contract (template)', note: 'Template enrolment contract to share with students before registration.', url: 'assets/brochures/AUS-Global-Brochure.pdf', updated: '2026-10-01' },
  ],
  programmes: [
    { id: 'p1', level: 'Bachelor', title: 'Hospitality Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 24,900 / year', description: 'Practice-led hospitality degree on the Swiss Riviera with paid internship options.' },
    { id: 'p2', level: 'Bachelor', title: 'Business Administration', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 22,900 / year', description: 'Core business foundations with specialisations in marketing, finance and entrepreneurship.' },
    { id: 'p3', level: 'Master', title: 'Business Administration (MBA)', region: 'Switzerland', duration: '18 months', language: 'English', intakes: 'January · September', fees: 'CHF 29,500 total', description: 'Executive-format MBA for working professionals and career changers.' },
    { id: 'p4', level: 'Doctorate', title: 'Doctor of Business Administration (DBA)', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'Rolling', fees: 'On request', description: 'Research-based doctorate for senior practitioners and consultants.' },
    { id: 'p5', level: 'Diploma', title: 'Swiss Federal Diploma', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'September', fees: 'CHF 18,500 / year', description: 'Federally recognised diploma combining theory with a structured apprenticeship.' },
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
  { id: 'programmes', label: 'Programmes', icon: 'fa-graduation-cap' },
  { id: 'brochures', label: 'Brochures', icon: 'fa-file-pdf' },
  { id: 'contracts', label: 'Contracts', icon: 'fa-file-signature' },
  { id: 'media', label: 'Media', icon: 'fa-photo-film' },
  { id: 'apply', label: 'Applications', icon: 'fa-paper-plane' },
  { id: 'account', label: 'Account & Security', icon: 'fa-shield-halved' },
  { id: 'admin', label: 'Admin', icon: 'fa-user-gear', admin: true },
];

const TITLES = {
  dashboard: ['Dashboard', 'Everything you need to recruit for AUS — in one place.'],
  offers: ['Offers & incentives', 'Commission offers and campaigns you can promote.'],
  programmes: ['Programmes', 'Courses, intakes, fees and entry information.'],
  brochures: ['Brochures', 'Download the latest programme brochures.'],
  contracts: ['Contracts', 'Representation and enrolment agreements.'],
  media: ['Media library', 'Photos, articles and marketing assets you can use.'],
  apply: ['Applications', 'Submit a student application — we handle the rest.'],
  account: ['Account & Security', 'Your profile, two-factor authentication and sessions.'],
  admin: ['Admin', 'Manage agents, content and applications.'],
};

function renderShell() {
  const u = state.user || {};
  $('whoName').textContent = u.username || 'Agent';
  $('whoRole').textContent = u.isAdmin ? 'Administrator' : 'AUS Agent';
  $('whoAvatar').textContent = initials(u.username);
  $('nav').innerHTML = NAV.filter((n) => !n.admin || u.isAdmin)
    .map((n) => `<button class="nav-item" data-nav="${n.id}" onclick="go('${n.id}')"><i class="fa-solid ${n.icon}"></i><span>${n.label}</span></button>`)
    .join('');
}

function go(view) {
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
    apply: renderApply, account: renderAccount, admin: renderAdmin,
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
        ${statTile('fa-graduation-cap', (c.programmes || []).length, 'Programmes listed')}
        ${statTile('fa-photo-film', (c.media || []).length, 'Media assets')}
        ${statTile('fa-paper-plane', state.localApps.length, 'Applications submitted')}
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
            ${quickLink('fa-file-arrow-down', 'Download brochures', 'The latest programme brochures, ready to share.', 'brochures')}
            ${quickLink('fa-file-signature', 'Contracts', 'Representation and enrolment agreements.', 'contracts')}
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
        </div>`).join('') || emptyInline('No programmes match this filter.')}
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
  const list = C().contracts || [];
  v.innerHTML = `
    <div class="card" style="margin-bottom:20px;display:flex;gap:14px;align-items:flex-start">
      <i class="fa-solid fa-circle-info" style="color:var(--crimson);font-size:18px;margin-top:2px"></i>
      <p style="font-size:13.5px">These documents are for selected AUS agents. Templates marked "template" must be completed and counter-signed by AUS before use.</p>
    </div>
    <div class="item-list">
      ${list.map((c) => `
        <div class="item">
          <div class="item-icon"><i class="fa-solid fa-file-signature"></i></div>
          <div class="item-body">
            <h4>${esc(c.title)}</h4>
            <p>${esc(c.note || '')}</p>
            <div class="item-meta"><span>Updated ${fmtDate(c.updated)}</span></div>
          </div>
          <div class="item-actions">
            <button class="btn btn-navy btn-sm" onclick="openFile('${esc(c.url)}','${esc(c.title)}')"><i class="fa-solid fa-download"></i><span>Download</span></button>
          </div>
        </div>`).join('') || emptyInline('No contracts uploaded yet.')}
    </div>`;
}

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
function renderApply(v) {
  const programmes = (C().programmes || []).map((p) => `<option value="${esc(p.title)}">${esc(p.level)} · ${esc(p.title)}</option>`).join('');
  v.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3 style="margin-bottom:6px">Submit a student application</h3>
        <p style="font-size:13px;margin-bottom:20px">Fill this in and AUS will follow up with you and the student. Fields marked * are required.</p>
        <div class="field-row">
          <div class="field"><label>Student full name *</label><input id="apName" placeholder="First and last name"></div>
          <div class="field"><label>Student email</label><input id="apEmail" type="email" placeholder="student@email.com"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Phone</label><input id="apPhone" placeholder="+961 …"></div>
          <div class="field"><label>Nationality</label><input id="apNat" placeholder="e.g. Lebanese"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Programme</label><select id="apProgramme"><option value="">Select a programme…</option>${programmes}</select></div>
          <div class="field"><label>Intake</label><select id="apIntake"><option>January 2027</option><option>September 2027</option><option>Other / to discuss</option></select></div>
        </div>
        <div class="field"><label>Notes / context</label><textarea id="apNotes" placeholder="Grades, English level, budget, preferred start date…"></textarea></div>
        <button class="btn btn-primary btn-block" onclick="submitApplication()"><i class="fa-solid fa-paper-plane"></i><span>Submit application</span></button>
      </div>

      <div>
        <div class="section-head"><div><h2>Your submissions</h2><p>Applications you've sent to AUS.</p></div></div>
        <div class="item-list" id="appList">
          ${state.localApps.length ? state.localApps.slice().reverse().map((a) => `
            <div class="item">
              <div class="item-icon"><i class="fa-solid fa-user-graduate"></i></div>
              <div class="item-body">
                <h4>${esc(a.studentName)}</h4>
                <p>${esc(a.programme || 'Programme TBC')} · ${esc(a.intake || '')}</p>
                <div class="item-meta"><span>Sent ${fmtDate(a.created)}</span></div>
              </div>
              <span class="tag ${a.status === 'new' ? 'amber' : 'green'}">${esc(a.status)}</span>
            </div>`).join('') : emptyInline('You have not submitted any applications yet.')}
        </div>
      </div>
    </div>`;
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
   View: Account & Security
   --------------------------------------------------------------------------- */
function renderAccount(v) {
  const u = state.user || {};
  v.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3>Profile</h3>
        <p style="font-size:13px;margin-bottom:18px">Your agent account details.</p>
        <div class="sec-row"><div class="sec-info"><h4>Username</h4><p>${esc(u.username)}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Email</h4><p>${esc(u.email || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Agency</h4><p>${esc(u.agency || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Country</h4><p>${esc(u.country || '—')}</p></div></div>
        <div class="sec-row"><div class="sec-info"><h4>Role</h4><p>${u.isAdmin ? 'Administrator' : 'AUS Agent'}</p></div></div>
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
          <div class="section-head"><div><h2>Content</h2><p>Edit the portal's news, offers and resources.</p></div>
            <button class="btn btn-outline btn-sm" onclick="editContentPrompt()"><i class="fa-solid fa-pen"></i><span>Edit content</span></button></div>
          <div class="card">
            <div class="sec-row"><div class="sec-info"><h4>Upload a gated file</h4><p>Brochures, contracts or media served privately through the worker.</p></div></div>
            <div class="field-row" style="margin-top:14px">
              <div class="field"><label>Category</label><select id="upCategory"><option value="brochures">Brochure</option><option value="contracts">Contract</option><option value="media">Media</option></select></div>
              <div class="field"><label>File</label><input id="upFile" type="file"></div>
            </div>
            <button class="btn btn-navy btn-sm" onclick="uploadFile()"><i class="fa-solid fa-upload"></i><span>Upload to worker</span></button>
          </div>
        </div>
      </div>
    </div>`;
  if (!DEMO_MODE) { loadAgents(); loadAdminApps(); }
}

async function loadAgents() {
  try {
    const res = await api('/api/admin/agents');
    const el = $('agentTable');
    if (!res.data.length) { el.innerHTML = emptyInline('No agents yet.'); return; }
    el.innerHTML = `<table class="table">
      <thead><tr><th>Agent</th><th>Agency</th><th>2FA</th><th>Last login</th><th></th></tr></thead>
      <tbody>${res.data.map((a) => `
        <tr>
          <td><b>${esc(a.username)}</b><br><span style="color:var(--slate);font-size:12px">${esc(a.email || '')}</span></td>
          <td>${esc(a.agency || '—')}</td>
          <td>${a.twoFA ? '<span class="tag green">On</span>' : '<span class="tag amber">Off</span>'}</td>
          <td>${a.lastLogin ? fmtDate(a.lastLogin) : '—'}</td>
          <td style="text-align:right">
            <button class="btn btn-ghost btn-sm" onclick="resetAgentPrompt('${esc(a.username)}')">Reset password</button>
            ${a.isAdmin ? '' : `<button class="btn btn-ghost btn-sm" onclick="deleteAgent('${esc(a.username)}')">Remove</button>`}
          </td>
        </tr>`).join('')}</tbody>
    </table>`;
  } catch (e) { $('agentTable').innerHTML = emptyInline(friendlyError(e)); }
}

function newAgentPrompt() {
  openModal(`
    <h2>Add an agent</h2>
    <p class="modal-sub">Create login credentials for a selected agent. No public sign-up is allowed.</p>
    <div class="field-row">
      <div class="field"><label>Username *</label><input id="naUser" placeholder="e.g. agenthause"></div>
      <div class="field"><label>Email</label><input id="naEmail" type="email" placeholder="agent@agency.com"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Agency</label><input id="naAgency" placeholder="Agency name"></div>
      <div class="field"><label>Country</label><input id="naCountry" placeholder="Country"></div>
    </div>
    <div class="field"><label>Temporary password *</label><input id="naPass" placeholder="At least 8 characters"></div>
    <label style="display:flex;gap:9px;align-items:center;font-size:13px;color:var(--ink-soft)"><input type="checkbox" id="naAdmin" style="width:auto"> Grant administrator access</label>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="createAgent()"><span>Create agent</span></button>
    </div>`);
}
window.newAgentPrompt = newAgentPrompt;

async function createAgent() {
  const body = {
    username: $('naUser').value.trim().toLowerCase(),
    email: $('naEmail').value.trim(),
    agency: $('naAgency').value.trim(),
    country: $('naCountry').value.trim(),
    password: $('naPass').value,
    isAdmin: $('naAdmin').checked,
  };
  if (!body.username || body.password.length < 8) { toast('Username and an 8+ character password are required.', 'err'); return; }
  try {
    await api('/api/admin/agents', { method: 'POST', body });
    closeModal(); toast('Agent created.', 'ok'); loadAgents();
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
    el.innerHTML = `<table class="table">
      <thead><tr><th>Student</th><th>Programme</th><th>Agent</th><th>Status</th></tr></thead>
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
    </table>`;
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
    <p class="modal-sub">Edit the JSON below (news, offers, brochures, contracts, programmes, media). Save to publish to all agents.</p>
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

async function uploadFile() {
  if (DEMO_MODE) { toast('File upload needs the Cloudflare worker connected.', 'info'); return; }
  const input = $('upFile');
  if (!input.files.length) { toast('Choose a file first.', 'err'); return; }
  const fd = new FormData();
  fd.append('file', input.files[0]);
  fd.append('category', $('upCategory').value);
  fd.append('name', input.files[0].name);
  try {
    await api('/api/admin/files', { method: 'POST', body: fd });
    toast('File uploaded to the worker.', 'ok');
    input.value = '';
  } catch (e) { toast(friendlyError(e), 'err'); }
}
window.uploadFile = uploadFile;

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

  restoreSession();
})();
