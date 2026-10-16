// ============================================================================
//  AUS Agent Portal — Cloudflare Worker API
// ----------------------------------------------------------------------------
//  Auth:      PBKDF2-SHA256 password hashing + opaque session tokens
//  2FA:       RFC 6238 TOTP (Google Authenticator / Authy / 1Password)
//  Data:      Cloudflare D1 (accounts, sessions, content, applications)
//  Files:     Cloudflare KV (gated brochures, contracts, media)
//  Access:    Admin-created agents only (no public sign-up)
//
//  Bindings (see wrangler.toml):
//    DB     -> D1 database
//    FILES  -> KV namespace
//    ALLOWED_ORIGINS (var)   comma-separated allowed browser origins
//    ADMIN_TOKEN     (secret) one-time token to bootstrap the first admin
//    RESEND_API_KEY  (secret, optional) for password-reset emails
//    NOTIFY_EMAIL_FROM (secret, optional) e.g. "AUS Portal <noreply@aus.swiss>"
// ============================================================================

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_DAYS = 30;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    let res;
    try {
      res = await route(request, env, new URL(request.url));
    } catch (err) {
      res = json({ error: 'server_error', detail: String((err && err.message) || err) }, 500);
    }

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};

// ---------------------------------------------------------------------------
//  Router
// ---------------------------------------------------------------------------
async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  // ---- Public ----
  if (path === '/' || path === '/api/health') {
    return json({ ok: true, service: 'aus-agent-portal', time: new Date().toISOString() });
  }
  if (path === '/api/config' && method === 'GET') {
    return json({ ok: true, data: { brand: 'AUS Agent Portal', version: 1 } });
  }
  if (path === '/api/auth/bootstrap' && method === 'POST') return bootstrapAdmin(request, env);
  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/2fa/verify' && method === 'POST') return twofaVerify(request, env);
  if (path === '/api/forgot' && method === 'POST') return forgotPassword(request, env);
  if (path === '/api/reset' && method === 'POST') return resetPassword(request, env);

  // ---- Authenticated ----
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  if (path === '/api/me' && method === 'GET') return me(user);
  if (path === '/api/logout' && method === 'POST') return logout(request, env, user);
  if (path === '/api/change-password' && method === 'POST') return changePassword(request, env, user);
  if (path === '/api/sessions' && method === 'GET') return listSessions(env, user);
  if (path === '/api/sessions' && method === 'DELETE') return revokeSession(request, env, user);

  if (path === '/api/2fa/setup' && method === 'POST') return twofaSetup(env, user);
  if (path === '/api/2fa/enable' && method === 'POST') return twofaEnable(request, env, user);
  if (path === '/api/2fa/disable' && method === 'POST') return twofaDisable(request, env, user);

  if (path === '/api/content' && method === 'GET') return getContent(env);
  if (path === '/api/files' && method === 'GET') return listFiles(env, url);

  const fileMatch = path.match(/^\/api\/files\/([A-Za-z0-9_-]+)$/);
  if (fileMatch && method === 'GET') return downloadFile(env, fileMatch[1]);

  if (path === '/api/applications' && method === 'POST') return createApplication(request, env, user);

  // ---- Admin only ----
  if (path.startsWith('/api/admin/')) {
    if (!user.is_admin) return json({ error: 'forbidden' }, 403);

    if (path === '/api/admin/agents' && method === 'GET') return listAgents(env, user);
    if (path === '/api/admin/agents' && method === 'POST') return createAgent(request, env, user);
    if (path === '/api/admin/agents' && method === 'DELETE') return deleteAgent(env, url, user);
    if (path === '/api/admin/agents/password' && method === 'POST') return setAgentPassword(request, env, user);
    if (path === '/api/admin/agents/role' && method === 'POST') return setAgentRole(request, env, user);

    if (path === '/api/admin/content' && method === 'PUT') return putContent(request, env, user);

    if (path === '/api/admin/files' && method === 'POST') return uploadFile(request, env, user);
    if (fileMatch && method === 'DELETE') return deleteFile(env, fileMatch[1], user);

    if (path === '/api/admin/applications' && method === 'GET') return listApplications(env);
    if (path === '/api/admin/applications' && method === 'PATCH') return updateApplication(request, env);
  }

  return json({ error: 'not_found', path }, 404);
}

// ---------------------------------------------------------------------------
//  CORS
// ---------------------------------------------------------------------------
function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

// ---------------------------------------------------------------------------
//  Crypto helpers
// ---------------------------------------------------------------------------
function bytesToB64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomToken(nbytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(nbytes));
  return bytesToB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derivePassword(password, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bytesToB64(new Uint8Array(bits));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt);
  return { salt: bytesToB64(salt), hash };
}
async function verifyPassword(password, saltB64, expectedHash) {
  const hash = await derivePassword(password, b64ToBytes(saltB64));
  return timingSafeEqual(hash, expectedHash);
}

// ---- TOTP (RFC 6238) ----
function base32Decode(str) {
  const clean = String(str).replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of new Uint8Array(bytes)) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
async function hotp(secretBytes, counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const high = Math.floor(counter / 2 ** 32);
  view.setUint32(0, high);
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = sig[sig.length - 1] & 0xf;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}
async function totpNow(secret, forTime = Date.now()) {
  return hotp(base32Decode(secret), Math.floor(forTime / 1000 / 30));
}
async function verifyTotp(secret, code, window = 1) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const candidate = await hotp(base32Decode(secret), step + i);
    if (timingSafeEqual(candidate, clean)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
//  DB helpers
// ---------------------------------------------------------------------------
const nowIso = () => new Date().toISOString();

async function requireUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE token = ?').bind(token).first();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
  if (!u || u.status !== 'active') return null;
  await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').bind(nowIso(), token).run();
  return u;
}

async function createSession(env, user, device) {
  const token = randomToken(32);
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, device, created_at, last_seen, expires_at) VALUES (?,?,?,?,?,?)'
  )
    .bind(token, user.id, device || 'Unknown device', created, created, expires)
    .run();
  await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(created, user.id).run();
  return token;
}

function publicUser(u) {
  return {
    username: u.username,
    name: u.name || '',
    email: u.email,
    phone: u.phone || '',
    isAdmin: !!u.is_admin,
    isSuperAdmin: !!u.is_superadmin,
    agency: u.agency || '',
    country: u.country || '',
    twoFA: !!u.totp_enabled,
    memberSince: u.created_at,
    lastLogin: u.last_login || null,
  };
}

// ---------------------------------------------------------------------------
//  Auth endpoints
// ---------------------------------------------------------------------------
async function bootstrapAdmin(request, env) {
  const existing = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
  if (existing && existing.c > 0) {
    return json({ error: 'already_initialized' }, 409);
  }
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || '');
  const expected = env.ADMIN_TOKEN || '';
  if (!expected || token !== expected) return json({ error: 'invalid_token' }, 403);

  const username = String(body.username || '').trim().toLowerCase();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || password.length < 8) return json({ error: 'weak_input' }, 400);

  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (username, name, email, pass_hash, salt, is_admin, is_superadmin, status, created_at) VALUES (?,?,?,?,?,1,1,?,?)'
  )
    .bind(username, String(body.name || 'Administrator'), email, hash, salt, 'active', nowIso())
    .run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  const session = await createSession(env, user, 'Setup');
  return json({ ok: true, token: session, user: publicUser(user) });
}

async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const device = String(body.device || 'Unknown device');
  if (!username || !password) return json({ error: 'missing_credentials' }, 400);

  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!user || user.status !== 'active') return json({ error: 'invalid_credentials' }, 401);

  const ok = await verifyPassword(password, user.salt, user.pass_hash);
  if (!ok) return json({ error: 'invalid_credentials' }, 401);

  if (user.totp_enabled && user.totp_secret) {
    const challenge = randomToken(24);
    const key = `2fa:${challenge}`;
    await env.FILES.put(key, String(user.id), { expirationTtl: 300 });
    return json({ ok: true, twofa: true, challenge });
  }

  const session = await createSession(env, user, device);
  return json({ ok: true, token: session, user: publicUser(user) });
}

async function twofaVerify(request, env) {
  const body = await request.json().catch(() => ({}));
  const challenge = String(body.challenge || '');
  const code = String(body.code || '');
  const device = String(body.device || 'Unknown device');
  if (!challenge) return json({ error: 'missing_challenge' }, 400);

  const key = `2fa:${challenge}`;
  const userId = await env.FILES.get(key);
  if (!userId) return json({ error: 'challenge_expired' }, 400);

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(Number(userId)).first();
  if (!user) return json({ error: 'invalid_credentials' }, 401);

  const ok = await verifyTotp(user.totp_secret, code);
  if (!ok) return json({ error: 'invalid_code' }, 401);

  await env.FILES.delete(key);
  const session = await createSession(env, user, device);
  return json({ ok: true, token: session, user: publicUser(user) });
}

function me(user) {
  return json({ ok: true, user: publicUser(user) });
}

async function logout(request, env, user) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true });
}

async function changePassword(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (next.length < 8) return json({ error: 'weak_password' }, 400);
  const ok = await verifyPassword(current, user.salt, user.pass_hash);
  if (!ok) return json({ error: 'invalid_current' }, 401);
  const { salt, hash } = await hashPassword(next);
  await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?')
    .bind(hash, salt, user.id)
    .run();
  // Log out every other device.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  const session = await createSession(env, user, 'Password change');
  return json({ ok: true, token: session });
}

async function listSessions(env, user) {
  const rows = await env.DB.prepare(
    'SELECT token, device, created_at, last_seen, expires_at FROM sessions WHERE user_id = ? ORDER BY last_seen DESC'
  )
    .bind(user.id)
    .all();
  const data = (rows.results || []).map((s) => ({
    id: s.token.slice(0, 8),
    device: s.device,
    created: s.created_at,
    lastSeen: s.last_seen,
    expires: s.expires_at,
  }));
  return json({ ok: true, data });
}

async function revokeSession(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  const rows = await env.DB.prepare('SELECT token FROM sessions WHERE user_id = ?').bind(user.id).all();
  const match = (rows.results || []).find((s) => s.token.slice(0, 8) === id);
  if (!match) return json({ error: 'not_found' }, 404);
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(match.token).run();
  return json({ ok: true });
}

async function twofaSetup(env, user) {
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  const label = encodeURIComponent(`AUS Agent Portal:${user.username}`);
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=AUS%20Agent%20Portal&algorithm=SHA1&digits=6&period=30`;
  return json({ ok: true, secret, otpauth });
}

async function twofaEnable(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const secret = String(body.secret || '');
  const code = String(body.code || '');
  if (!secret || !(await verifyTotp(secret, code))) return json({ error: 'invalid_code' }, 400);
  await env.DB.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?')
    .bind(secret, user.id)
    .run();
  return json({ ok: true });
}

async function twofaDisable(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '');
  if (!(await verifyTotp(user.totp_secret, code))) return json({ error: 'invalid_code' }, 400);
  await env.DB.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?')
    .bind(user.id)
    .run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
//  Forgot / reset password (optional, needs Resend)
// ---------------------------------------------------------------------------
async function forgotPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const user = email
    ? await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    : null;
  if (user && env.RESEND_API_KEY) {
    const token = randomToken(24);
    await env.FILES.put(`reset:${token}`, String(user.id), { expirationTtl: 1800 });
    const link = `${(env.ALLOWED_ORIGINS || '').split(',')[0].trim()}/#reset=${token}`;
    await sendEmail(env, user.email, 'Reset your AUS Agent Portal password', resetEmailHtml(link));
  }
  // Always succeed to avoid account enumeration.
  return json({ ok: true });
}

async function resetPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || '');
  const next = String(body.next || '');
  if (next.length < 8) return json({ error: 'weak_password' }, 400);
  const userId = await env.FILES.get(`reset:${token}`);
  if (!userId) return json({ error: 'invalid_token' }, 400);
  const { salt, hash } = await hashPassword(next);
  await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?')
    .bind(hash, salt, Number(userId))
    .run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(Number(userId)).run();
  await env.FILES.delete(`reset:${token}`);
  return json({ ok: true });
}

async function sendEmail(env, to, subject, html) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.NOTIFY_EMAIL_FROM || 'AUS Agent Portal <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  });
}

function resetEmailHtml(link) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px">
    <h2 style="color:#22295f">Reset your password</h2>
    <p>We received a request to reset your AUS Agent Portal password. This link expires in 30 minutes.</p>
    <p><a href="${link}" style="background:#be1f3d;color:#fff;padding:12px 22px;border-radius:30px;text-decoration:none;display:inline-block">Choose a new password</a></p>
    <p style="color:#768cb0;font-size:12px">If you didn't request this, you can ignore this email.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
//  Admin — agent management
// ---------------------------------------------------------------------------
async function listAgents(env, admin) {
  const rows = await env.DB.prepare(
    'SELECT id, username, name, email, phone, agency, country, is_admin, is_superadmin, status, totp_enabled, created_at, last_login FROM users ORDER BY created_at DESC'
  ).all();
  const data = (rows.results || [])
    // The superadmin is invisible to everyone except another superadmin.
    .filter((u) => admin.is_superadmin || !u.is_superadmin)
    .map((u) => ({
      username: u.username,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      agency: u.agency || '',
      country: u.country || '',
      role: u.is_superadmin ? 'superadmin' : u.is_admin ? 'admin' : 'agent',
      isAdmin: !!u.is_admin,
      isSuperAdmin: !!u.is_superadmin,
      status: u.status,
      twoFA: !!u.totp_enabled,
      created: u.created_at,
      lastLogin: u.last_login || null,
    }));
  return json({ ok: true, data });
}

async function createAgent(request, env, admin) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const country = String(body.country || '').trim();
  const password = String(body.password || '');

  // Name, email, phone and country are mandatory.
  if (!name || !email || !phone || !country) return json({ error: 'missing_fields' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'invalid_email' }, 400);
  if (!username || password.length < 8) return json({ error: 'weak_input' }, 400);

  // Only a superadmin may create other administrators.
  const makeAdmin = !!body.isAdmin;
  if (makeAdmin && !admin.is_superadmin) return json({ error: 'forbidden' }, 403);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (exists) return json({ error: 'username_taken' }, 409);
  const emailExists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (emailExists) return json({ error: 'email_taken' }, 409);

  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (username, name, email, phone, pass_hash, salt, agency, country, is_admin, is_superadmin, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)'
  )
    .bind(
      username, name, email, phone, hash, salt,
      String(body.agency || ''), country,
      makeAdmin ? 1 : 0, 'active', nowIso()
    )
    .run();
  return json({ ok: true, createdBy: admin.username });
}

async function deleteAgent(env, url, admin) {
  const username = (url.searchParams.get('username') || '').toLowerCase();
  if (!username) return json({ error: 'missing_username' }, 400);
  if (username === admin.username) return json({ error: 'cannot_delete_self' }, 400);

  const user = await env.DB.prepare('SELECT id, is_admin, is_superadmin FROM users WHERE username = ?').bind(username).first();
  if (!user) return json({ error: 'not_found' }, 404);
  if (user.is_superadmin) return json({ error: 'protected' }, 403);
  // Only a superadmin can remove another administrator.
  if (user.is_admin && !admin.is_superadmin) return json({ error: 'forbidden' }, 403);

  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  return json({ ok: true });
}

async function setAgentPassword(request, env, admin) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').toLowerCase();
  const password = String(body.password || '');
  if (!username || password.length < 8) return json({ error: 'weak_input' }, 400);

  const user = await env.DB.prepare('SELECT id, is_admin, is_superadmin FROM users WHERE username = ?').bind(username).first();
  if (!user) return json({ error: 'not_found' }, 404);
  if (user.is_superadmin && !admin.is_superadmin) return json({ error: 'forbidden' }, 403);
  if (user.is_admin && !admin.is_superadmin) return json({ error: 'forbidden' }, 403);

  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?')
    .bind(hash, salt, user.id)
    .run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true, updatedBy: admin.username });
}

// Superadmin-only: promote an agent to admin, or demote an admin back to agent.
async function setAgentRole(request, env, admin) {
  if (!admin.is_superadmin) return json({ error: 'forbidden' }, 403);
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').toLowerCase();
  const isAdmin = !!body.isAdmin;
  const user = await env.DB.prepare('SELECT id, is_superadmin FROM users WHERE username = ?').bind(username).first();
  if (!user) return json({ error: 'not_found' }, 404);
  if (user.is_superadmin) return json({ error: 'protected' }, 403);
  await env.DB.prepare('UPDATE users SET is_admin = ? WHERE id = ?').bind(isAdmin ? 1 : 0, user.id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
//  Content (news, offers, brochures, contracts, media, programmes, regions)
// ---------------------------------------------------------------------------
async function getContent(env) {
  const row = await env.DB.prepare('SELECT value, updated_at FROM content WHERE key = ?')
    .bind('portal')
    .first();
  if (!row) return json({ ok: true, data: DEFAULT_CONTENT, updatedAt: null, seeded: true });
  let parsed;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    parsed = DEFAULT_CONTENT;
  }
  return json({ ok: true, data: parsed, updatedAt: row.updated_at, seeded: false });
}

async function putContent(request, env, admin) {
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body.content !== 'object') return json({ error: 'invalid_content' }, 400);
  await env.DB.prepare(
    'INSERT INTO content (key, value, updated_at, updated_by) VALUES (?,?,?,?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
  )
    .bind('portal', JSON.stringify(body.content), nowIso(), admin.username)
    .run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
//  Files (KV-backed, gated)
// ---------------------------------------------------------------------------
async function listFiles(env, url) {
  const category = url.searchParams.get('category');
  const rows = await env.DB.prepare(
    category ? 'SELECT * FROM files WHERE category = ? ORDER BY created_at DESC'
             : 'SELECT * FROM files ORDER BY created_at DESC'
  )
    .bind(...(category ? [category] : []))
    .all();
  const data = (rows.results || []).map(fileMeta);
  return json({ ok: true, data });
}

function fileMeta(f) {
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    contentType: f.content_type,
    size: f.size,
    uploadedBy: f.uploaded_by,
    created: f.created_at,
    url: `/api/files/${f.id}`,
  };
}

async function uploadFile(request, env, admin) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'missing_file' }, 400);
  const category = String(form.get('category') || 'media');
  const name = String(form.get('name') || file.name || 'file');
  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'file_too_large' }, 413);

  const id = randomToken(12);
  const contentType = file.type || 'application/octet-stream';
  await env.FILES.put(`file:${id}`, buf, { metadata: { contentType, name } });
  await env.DB.prepare(
    'INSERT INTO files (id, name, category, content_type, size, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?)'
  )
    .bind(id, name, category, contentType, buf.byteLength, admin.username, nowIso())
    .run();
  return json({ ok: true, data: { id, url: `/api/files/${id}`, name, category } });
}

async function downloadFile(env, id) {
  const { value, metadata } = await env.FILES.getWithMetadata(`file:${id}`, { type: 'arrayBuffer' });
  if (!value) return json({ error: 'not_found' }, 404);
  return new Response(value, {
    status: 200,
    headers: {
      'Content-Type': (metadata && metadata.contentType) || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent((metadata && metadata.name) || id)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}

async function deleteFile(env, id, admin) {
  await env.FILES.delete(`file:${id}`);
  await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
//  Applications (facilitated application process -> leads)
// ---------------------------------------------------------------------------
async function createApplication(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const studentName = String(body.studentName || '').trim();
  if (!studentName) return json({ error: 'missing_student' }, 400);

  const id = randomToken(10);
  await env.DB.prepare(
    'INSERT INTO applications (id, agent, student_name, student_email, student_phone, programme, intake, nationality, notes, status, created_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  )
    .bind(
      id,
      user.username,
      studentName,
      String(body.studentEmail || ''),
      String(body.studentPhone || ''),
      String(body.programme || ''),
      String(body.intake || ''),
      String(body.nationality || ''),
      String(body.notes || ''),
      'new',
      nowIso()
    )
    .run();
  return json({ ok: true, data: { id, status: 'new' } });
}

async function listApplications(env) {
  const rows = await env.DB.prepare('SELECT * FROM applications ORDER BY created_at DESC').all();
  return json({ ok: true, data: rows.results || [] });
}

async function updateApplication(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  const status = String(body.status || 'new');
  if (!id) return json({ error: 'missing_id' }, 400);
  await env.DB.prepare('UPDATE applications SET status = ? WHERE id = ?').bind(status, id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
//  Seed content — used until an admin saves their own version
// ---------------------------------------------------------------------------
const DEFAULT_CONTENT = {
  news: [
    {
      id: 'n1',
      tag: '50th Anniversary',
      date: '2026-10-08',
      title: '50 years of AUS — and a new chapter with our agents',
      excerpt:
        'This year AUS celebrates its 50th Anniversary. To mark it, we are investing in our agent network like never before.',
      body:
        'As part of our 50th Anniversary we are building closer, more personal relationships with the agents who send students to us. Jonathan Hilton now leads agent relations and will be your direct contact for key markets. Look out for the launch offer for the January 2027 intake in the Offers section.',
      image: 'assets/media/anniversary.svg',
    },
    {
      id: 'n2',
      tag: 'New role',
      date: '2026-10-08',
      title: 'Meet Jonathan Hilton, your new agent contact',
      excerpt:
        'Jonathan joins us to build and support our global agent network, starting with the January 2027 intake.',
      body:
        'Jonathan Hilton is now responsible for agent relations at AUS. He will follow up personally with key agents, and you can reach him directly for any recruitment or student-application question. Contact details are in the portal footer.',
      image: 'assets/media/agent-contact.svg',
    },
  ],
  offers: [
    {
      id: 'o1',
      active: true,
      badge: 'January 2027 intake',
      title: 'CHF 1,000 commission bonus per new student',
      subtitle: 'Celebrating our 50th Anniversary and building new agent relationships',
      body:
        'For every new student you recruit for the January 2027 intake, you earn an extra CHF 1,000 commission bonus — on top of your standard commission. This offer is made for two reasons: to celebrate our 50th Anniversary, and to start building relationships with new agents through Jonathan Hilton.',
      bullets: [
        'CHF 1,000 bonus for every new student recruited for the January 2027 intake',
        'Applies to new agents and existing partners',
        'Follow-up from Jonathan Hilton with direct links to this offer',
      ],
      cta: 'Submit an application',
      contact: 'For more information contact Jonathan Hilton — j.hilton@aus.swiss',
      image: 'assets/media/offer-50th.svg',
    },
  ],
  brochures: [
    {
      id: 'b1',
      title: 'AUS Global Brochure',
      programme: 'All programmes',
      region: 'Global',
      url: 'assets/brochures/AUS-Global-Brochure.pdf',
      size: '8.4 MB',
      updated: '2026-10-01',
    },
    {
      id: 'b2',
      title: 'Hospitality Management 2027',
      programme: 'Bachelor · Hospitality Management',
      region: 'Switzerland',
      url: 'assets/brochures/AUS-Hospitality-Management-Brochure-2027.pdf',
      size: '1.4 MB',
      updated: '2026-10-01',
    },
  ],
  contracts: [
    {
      id: 'c1',
      title: 'Agent Representation Agreement (template)',
      note: 'Standard representation agreement for new agent partners. Counter-signed by AUS.',
      url: 'assets/brochures/AUS-Global-Brochure.pdf',
      updated: '2026-10-01',
    },
    {
      id: 'c2',
      title: 'Student Enrolment Contract (template)',
      note: 'Template enrolment contract to share with students before registration.',
      url: 'assets/brochures/AUS-Global-Brochure.pdf',
      updated: '2026-10-01',
    },
  ],
  programmes: [
    // ----- Bachelor's (3 years) -----
    { id: 'p1', level: 'Bachelor', title: 'Accounting', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'The language of business, mastered.' },
    { id: 'p2', level: 'Bachelor', title: 'Business Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'Lead organizations from day one.' },
    { id: 'p3', level: 'Bachelor', title: 'Healthcare Administration', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'Healthcare needs better leaders.' },
    { id: 'p4', level: 'Bachelor', title: 'Human Resource Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'People are the strategy.' },
    { id: 'p5', level: 'Bachelor', title: 'Integrated & Digital Marketing', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'Strategy meets execution.' },
    { id: 'p6', level: 'Bachelor', title: 'International Business', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'Think beyond borders.' },
    { id: 'p7', level: 'Bachelor', title: 'Sports Management — Athletic Administration', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'Run the game, not the sidelines.' },
    { id: 'p8', level: 'Bachelor', title: 'Sports Management — Sports Marketing', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'Build brands that move people.' },
    { id: 'p9', level: 'Bachelor', title: 'Hospitality Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 30,000 / year', description: 'Excellence is the experience.' },
    { id: 'p10', level: 'Bachelor', title: 'Aviation Management', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 28,000 / year', description: 'The business of getting there.' },
    // ----- Master's (2 years) -----
    { id: 'p11', level: 'Master', title: 'Finance', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'Markets reward precision.' },
    { id: 'p12', level: 'Master', title: 'Data Analytics', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'Turn noise into signal.' },
    { id: 'p13', level: 'Master', title: 'Healthcare Administration', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'Systems that save lives.' },
    { id: 'p14', level: 'Master', title: 'Human Resource Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'Talent is the competitive edge.' },
    { id: 'p15', level: 'Master', title: 'International Business', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'Lead across markets.' },
    { id: 'p16', level: 'Master', title: 'Leadership & Change', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'Move organizations forward.' },
    { id: 'p17', level: 'Master', title: 'Sports Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'The business behind the game.' },
    { id: 'p18', level: 'Master', title: 'Strategic Brand & Digital Marketing', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'Brand is the business model.' },
    { id: 'p19', level: 'Master', title: 'Aviation Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · September', fees: 'CHF 25,000 / year', description: 'Altitude requires strategy.' },
    // ----- Doctorate -----
    { id: 'p20', level: 'Doctorate', title: 'Business Administration (DBA)', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · September', fees: 'CHF 26,000 / year', description: 'Original research that advances practice for experienced leaders.' },
    // ----- Swiss Federal Diploma -----
    { id: 'p21', level: 'Diploma', title: 'Swiss Federal Diploma — Business Administration', region: 'Switzerland', duration: '2 years (part-time)', language: 'English', intakes: 'September', fees: 'CHF 28,000 / year', description: 'The nationally recognized Swiss professional qualification, valued across European industries.' },
  ],
  regions: [
    { id: 'r1', name: 'Switzerland', blurb: 'Campus in Montreux on the Swiss Riviera. On-campus and blended delivery.' },
    { id: 'r2', name: 'Middle East & Gulf', blurb: 'High demand for hospitality and business pathways with strong scholarship options.' },
    { id: 'r3', name: 'Africa', blurb: 'Growing partner network; regional counsellor support available.' },
    { id: 'r4', name: 'Asia', blurb: 'Pathway and articulation routes into AUS degrees.' },
  ],
  media: [
    { id: 'm1', title: 'AUS campus on the Swiss Riviera', type: 'Photo', url: 'assets/media/campus.svg', tags: 'campus, switzerland' },
    { id: 'm2', title: '50th Anniversary event', type: 'Photo', url: 'assets/media/anniversary.svg', tags: 'anniversary, event' },
    { id: 'm3', title: 'Hospitality training kitchen', type: 'Photo', url: 'assets/media/hospitality.svg', tags: 'hospitality, facilities' },
    { id: 'm4', title: 'AUS Business School logo pack', type: 'Asset', url: 'assets/media/logo-pack.svg', tags: 'brand, logo' },
  ],
};
