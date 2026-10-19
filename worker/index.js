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
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 256;
const LOGIN_WINDOW_SEC = 900;
const LOGIN_MAX_ATTEMPTS = 10;
const TWOFA_MAX_ATTEMPTS = 5;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BACKUP_PREFIX = 'backup:';
const BACKUP_KEEP = 40; // how many backups to retain (newest kept)

// Applied to every API response. The static site has its own headers in _headers.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cache-Control': 'no-store',
};

export default {
  // Automatic backup: runs on the schedule defined in wrangler.toml ([triggers]).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(createBackup(env, { createdBy: 'automatic', kind: 'auto' }));
  },

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
      // Never return internals to the browser.
      console.error('Unhandled worker error:', (err && err.stack) || err);
      res = json({ error: 'server_error' }, 500);
    }

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
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
  if (path === '/api/unsubscribe' && method === 'GET') return unsubscribe(env, url);

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
  if (path === '/api/files' && method === 'GET') return listFiles(env, user, url);
  if (path === '/api/files' && method === 'POST') return uploadOwnFile(request, env, user);

  const fileMatch = path.match(/^\/api\/files\/([A-Za-z0-9_-]+)$/);
  if (fileMatch && method === 'GET') return downloadFile(env, fileMatch[1], user);
  if (fileMatch && method === 'DELETE') return deleteFile(env, fileMatch[1], user);

  const adminFileMatch = path.match(/^\/api\/admin\/files\/([A-Za-z0-9_-]+)$/);

  if (path === '/api/applications' && method === 'POST') return createApplication(request, env, user);
  if (path === '/api/applications' && method === 'GET') return listMyApplications(env, user);
  if (path === '/api/commissions' && method === 'POST') return createCommission(request, env, user);
  if (path === '/api/commissions' && method === 'GET') return listCommissions(env, user);
  if (path === '/api/notifications' && method === 'POST') return setNotificationPrefs(request, env, user);

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
    if (adminFileMatch && method === 'PATCH') return updateFileMeta(request, env, adminFileMatch[1]);
    if (adminFileMatch && method === 'DELETE') return deleteFile(env, adminFileMatch[1], user);

    if (path === '/api/admin/applications' && method === 'GET') return listApplications(env);
    if (path === '/api/admin/applications' && method === 'PATCH') return updateApplication(request, env);
    if (path === '/api/admin/commissions' && method === 'GET') return listCommissions(env, user);
    if (path === '/api/admin/commissions' && method === 'PATCH') return updateCommission(request, env);
    if (path === '/api/admin/notify' && method === 'POST') return broadcastNotification(request, env, user);

    // ---- Superadmin only: backups ----
    if (path === '/api/admin/backups' && method === 'GET') return listBackups(env, user);
    if (path === '/api/admin/backups' && method === 'POST') return manualBackup(env, user);
    if (path === '/api/admin/backups' && method === 'DELETE') return deleteBackup(env, url, user);
    if (path === '/api/admin/backups/restore' && method === 'POST') return restoreBackup(request, env, user);
    const backupMatch = path.match(/^\/api\/admin\/backups\/([A-Za-z0-9_-]+)$/);
    if (backupMatch && method === 'GET') return downloadBackup(env, backupMatch[1], user);
  }

  return json({ error: 'not_found', path }, 404);
}

// ---------------------------------------------------------------------------
//  CORS
// ---------------------------------------------------------------------------
function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  // Deny by default: no wildcard, and never echo an origin that is not listed.
  if (!origin || !allowed.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
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
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
// Verified against for unknown users so login timing does not reveal accounts.
const DUMMY_SALT_B64 = 'AAAAAAAAAAAAAAAAAAAAAA==';
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
function passwordProblem(password, username = '') {
  if (typeof password !== 'string') return 'weak_password';
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return 'weak_password';
  }
  const lower = password.toLowerCase();
  const name = String(username || '').toLowerCase();
  if (name && lower.includes(name)) return 'weak_password';
  return '';
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

function clientIp(request) {
  return (
    (request.headers.get('CF-Connecting-IP') || '').trim() ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    'unknown'
  );
}

// D1-backed fixed-window limiter. Keys are per action + IP (+ account where useful).
async function rateLimit(env, key, limit, windowSec) {
  const now = nowIso();
  const resetAt = new Date(Date.now() + windowSec * 1000).toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END`
    )
      .bind(key, resetAt, now, now)
      .run();
    const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
      .bind(key)
      .first();
    await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now).run();
    if (row && row.count > limit) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000)),
      };
    }
    return { allowed: true, retryAfter: 0 };
  } catch (err) {
    // A limiter failure must not lock out every user.
    console.error('rateLimit failed:', (err && err.message) || err);
    return { allowed: true, retryAfter: 0 };
  }
}

function tooMany(retryAfter) {
  return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(retryAfter || 60) });
}

async function requireUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE token = ?').bind(tokenHash).first();
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
  const tokenHash = await sha256Hex(token);
  const tokenId = token.slice(0, 8);
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token, token_id, user_id, device, created_at, last_seen, expires_at) VALUES (?,?,?,?,?,?,?)'
  )
    .bind(tokenHash, tokenId, user.id, device || 'Unknown device', created, created, expires)
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
    addressLine1: u.address_line1 || '',
    addressLine2: u.address_line2 || '',
    city: u.city || '',
    postalCode: u.postal_code || '',
    region: u.region || '',
    notifyEmail: !!u.notify_email,
    notifiedAsked: !!u.notified_asked,
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
  if (!username || passwordProblem(password, username)) return json({ error: 'weak_input' }, 400);

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

  const ip = clientIp(request);
  const ipLimit = await rateLimit(env, `login:ip:${ip}`, LOGIN_MAX_ATTEMPTS * 3, LOGIN_WINDOW_SEC);
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfter);
  const pairLimit = await rateLimit(env, `login:${ip}:${username}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SEC);
  if (!pairLimit.allowed) return tooMany(pairLimit.retryAfter);

  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!user || user.status !== 'active') {
    // Spend the same PBKDF2 work as a real verification to avoid timing leaks.
    await derivePassword(password, b64ToBytes(DUMMY_SALT_B64)).catch(() => {});
    return json({ error: 'invalid_credentials' }, 401);
  }

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

  const ipLimit = await rateLimit(env, `2fa:ip:${clientIp(request)}`, 15, 600);
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfter);

  const key = `2fa:${challenge}`;
  const attemptsKey = `2fa:attempts:${challenge}`;
  const userId = await env.FILES.get(key);
  if (!userId) return json({ error: 'challenge_expired' }, 400);

  const failures = Number((await env.FILES.get(attemptsKey)) || 0);
  if (failures >= TWOFA_MAX_ATTEMPTS) {
    await env.FILES.delete(key);
    await env.FILES.delete(attemptsKey);
    return json({ error: 'challenge_expired' }, 400);
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(Number(userId)).first();
  if (!user) return json({ error: 'invalid_credentials' }, 401);

  const cleanCode = String(code).replace(/\D/g, '');
  const usedKey = `2fa:used:${user.id}:${cleanCode}`;
  if (await env.FILES.get(usedKey)) return json({ error: 'invalid_code' }, 401);

  const ok = await verifyTotp(user.totp_secret, code);
  if (!ok) {
    await env.FILES.put(attemptsKey, String(failures + 1), { expirationTtl: 600 });
    return json({ error: 'invalid_code' }, 401);
  }

  await env.FILES.delete(key);
  await env.FILES.delete(attemptsKey);
  await env.FILES.put(usedKey, '1', { expirationTtl: 120 });
  const session = await createSession(env, user, device);
  return json({ ok: true, token: session, user: publicUser(user) });
}

function me(user) {
  return json({ ok: true, user: publicUser(user) });
}

async function logout(request, env, user) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(tokenHash).run();
  return json({ ok: true });
}

async function changePassword(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (passwordProblem(next, user.username)) return json({ error: 'weak_password' }, 400);
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
    'SELECT token_id, device, created_at, last_seen, expires_at FROM sessions WHERE user_id = ? ORDER BY last_seen DESC'
  )
    .bind(user.id)
    .all();
  const data = (rows.results || []).map((s) => ({
    id: s.token_id || '',
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
  const rows = await env.DB.prepare('SELECT token, token_id FROM sessions WHERE user_id = ?').bind(user.id).all();
  const match = (rows.results || []).find((s) => s.token_id === id);
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
  const ipLimit = await rateLimit(env, `forgot:ip:${clientIp(request)}`, 5, 900);
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfter);

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();

  // Throttle per address without revealing whether it exists.
  if (email) {
    const emailLimit = await rateLimit(env, `forgot:email:${email}`, 3, 3600);
    if (!emailLimit.allowed) return json({ ok: true });
  }

  const user = email
    ? await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    : null;
  if (user && env.RESEND_API_KEY) {
    const token = randomToken(24);
    await env.FILES.put(`reset:${token}`, String(user.id), { expirationTtl: 1800 });
    const base = String(env.PORTAL_URL || (env.ALLOWED_ORIGINS || '').split(',')[0] || '')
      .trim()
      .replace(/\/+$/, '');
    const link = `${base}/#reset=${token}`;
    await sendEmail(env, user.email, 'Reset your AUS Agent Portal password', resetEmailHtml(link));
  }
  // Always succeed to avoid account enumeration.
  return json({ ok: true });
}

async function resetPassword(request, env) {
  const ipLimit = await rateLimit(env, `reset:ip:${clientIp(request)}`, 10, 900);
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfter);

  const body = await request.json().catch(() => ({}));
  const token = String(body.token || '');
  const next = String(body.next || '');
  if (passwordProblem(next)) return json({ error: 'weak_password' }, 400);
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
  if (!env.RESEND_API_KEY) return { skipped: true };
  const res = await fetch('https://api.resend.com/emails', {
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
  }).catch(() => null);
  return { ok: !!(res && res.ok), status: res ? res.status : 0 };
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
  if (!username || passwordProblem(password, username)) return json({ error: 'weak_input' }, 400);

  // Only a superadmin may create other administrators.
  const makeAdmin = !!body.isAdmin;
  if (makeAdmin && !admin.is_superadmin) return json({ error: 'forbidden' }, 403);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (exists) return json({ error: 'username_taken' }, 409);
  const emailExists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (emailExists) return json({ error: 'email_taken' }, 409);

  const { salt, hash } = await hashPassword(password);
  const agency = String(body.agency || '').trim();
  const addressLine1 = String(body.addressLine1 || '').trim();
  const addressLine2 = String(body.addressLine2 || '').trim();
  const city = String(body.city || '').trim();
  const postalCode = String(body.postalCode || '').trim();
  const region = String(body.region || '').trim();
  await env.DB.prepare(
    'INSERT INTO users (username, name, email, phone, pass_hash, salt, agency, country, address_line1, address_line2, city, postal_code, region, is_admin, is_superadmin, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)'
  )
    .bind(
      username, name, email, phone, hash, salt,
      agency, country, addressLine1, addressLine2, city, postalCode, region,
      makeAdmin ? 1 : 0, 'active', nowIso()
    )
    .run();
  return json({ ok: true, createdBy: admin.username, username });
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
  if (!username || passwordProblem(password, username)) return json({ error: 'weak_input' }, 400);

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

  // Snapshot the current state before overwriting, so the superadmin can roll back.
  const existing = await env.DB.prepare('SELECT value FROM content WHERE key = ?').bind('portal').first();
  if (existing) {
    try { await createBackup(env, { createdBy: admin.username, kind: 'pre-change' }); } catch {}
  }

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
async function listFiles(env, user, url) {
  const category = url.searchParams.get('category');
  const rows = await env.DB.prepare('SELECT * FROM files ORDER BY created_at DESC').all();
  let data = (rows.results || []).filter((f) => {
    if (user.is_admin) return true;
    return !f.assigned_to || f.assigned_to === user.username;
  });
  if (category) data = data.filter((f) => f.category === category);
  return json({ ok: true, data: data.map(fileMeta) });
}

function fileMeta(f) {
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    contentType: f.content_type,
    size: f.size,
    uploadedBy: f.uploaded_by || '',
    assignedTo: f.assigned_to || '',
    created: f.created_at,
    url: `/api/files/${f.id}`,
  };
}

function canSeeFile(file, user) {
  if (user.is_admin) return true;
  if (!file.assigned_to) return true; // global document — visible to all agents
  return file.assigned_to === user.username || file.uploaded_by === user.username;
}

async function uploadFile(request, env, admin) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'missing_file' }, 400);
  const category = String(form.get('category') || 'media');
  const name = String(form.get('name') || file.name || 'file');
  const assignedTo = String(form.get('assignedTo') || '').trim().toLowerCase();
  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'file_too_large' }, 413);

  const id = randomToken(12);
  const contentType = file.type || 'application/octet-stream';
  await env.FILES.put(`file:${id}`, buf, { metadata: { contentType, name } });
  await env.DB.prepare(
    'INSERT INTO files (id, name, category, content_type, size, uploaded_by, assigned_to, created_at) VALUES (?,?,?,?,?,?,?,?)'
  )
    .bind(id, name, category, contentType, buf.byteLength, admin.username, assignedTo || null, nowIso())
    .run();
  return json({ ok: true, data: { id, url: `/api/files/${id}`, name, category, contentType, size: buf.byteLength, assignedTo } });
}

// An agent may upload a document (e.g. signed contract). It is visible to them
// and to admins, never to other agents.
async function uploadOwnFile(request, env, user) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'missing_file' }, 400);
  const name = String(form.get('name') || file.name || 'file');
  const category = String(form.get('category') || 'contracts');
  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'file_too_large' }, 413);
  const id = randomToken(12);
  const contentType = file.type || 'application/octet-stream';
  await env.FILES.put(`file:${id}`, buf, { metadata: { contentType, name } });
  await env.DB.prepare(
    'INSERT INTO files (id, name, category, content_type, size, uploaded_by, assigned_to, created_at) VALUES (?,?,?,?,?,?,?,?)'
  )
    .bind(id, name, category, contentType, buf.byteLength, user.username, user.username, nowIso())
    .run();
  return json({ ok: true, data: { id, url: `/api/files/${id}`, name, category, contentType, size: buf.byteLength, assignedTo: user.username } });
}

// Rename, re-categorise or reassign a file (admin only).
async function updateFileMeta(request, env, id) {
  const body = await request.json().catch(() => ({}));
  const name = body.name != null ? String(body.name).trim() : null;
  const category = body.category != null ? String(body.category).trim() : null;
  const assignedTo = body.assignedTo != null ? String(body.assignedTo).trim().toLowerCase() : null;
  if (!name && !category && assignedTo === null) return json({ error: 'nothing_to_update' }, 400);
  const file = await env.DB.prepare('SELECT id FROM files WHERE id = ?').bind(id).first();
  if (!file) return json({ error: 'not_found' }, 404);
  if (name) await env.DB.prepare('UPDATE files SET name = ? WHERE id = ?').bind(name, id).run();
  if (category) await env.DB.prepare('UPDATE files SET category = ? WHERE id = ?').bind(category, id).run();
  if (assignedTo !== null) await env.DB.prepare('UPDATE files SET assigned_to = ? WHERE id = ?').bind(assignedTo || null, id).run();
  return json({ ok: true });
}

async function downloadFile(env, id, user) {
  const meta = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();
  if (!meta) return json({ error: 'not_found' }, 404);
  if (!canSeeFile(meta, user)) return json({ error: 'forbidden' }, 403);
  const { value, metadata } = await env.FILES.getWithMetadata(`file:${id}`, { type: 'arrayBuffer' });
  if (!value) return json({ error: 'not_found' }, 404);
  return new Response(value, {
    status: 200,
    headers: {
      'Content-Type': (metadata && metadata.contentType) || meta.content_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent((metadata && metadata.name) || meta.name || id)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}

async function deleteFile(env, id, user) {
  const meta = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();
  if (!meta) return json({ error: 'not_found' }, 404);
  // Admins can delete anything; agents only files they uploaded themselves.
  if (!user.is_admin && meta.uploaded_by !== user.username) return json({ error: 'forbidden' }, 403);
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

// Agents only ever see their own submissions; admins see everything.
async function listMyApplications(env, user) {
  if (user.is_admin) return listApplications(env);
  const rows = await env.DB.prepare(
    'SELECT * FROM applications WHERE agent = ? ORDER BY created_at DESC'
  ).bind(user.username).all();
  return json({ ok: true, data: rows.results || [] });
}

// ---------------------------------------------------------------------------
//  Commissions (invoice/commission requests — stored for the finance team)
// ---------------------------------------------------------------------------
async function createCommission(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const amount = String(body.amount || '').trim();
  const notes = String(body.notes || '').trim();
  if (!amount && !notes) return json({ error: 'missing_fields' }, 400);

  const id = randomToken(10);
  await env.DB.prepare(
    'INSERT INTO commission_requests (id, agent, amount, currency, period, student_ref, invoice_no, notes, status, created_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?)'
  )
    .bind(
      id,
      user.username,
      amount,
      String(body.currency || 'CHF').trim() || 'CHF',
      String(body.period || '').trim(),
      String(body.studentRef || '').trim(),
      String(body.invoiceNo || '').trim(),
      notes,
      'new',
      nowIso()
    )
    .run();
  return json({ ok: true, data: { id, status: 'new' } });
}

async function listCommissions(env, user) {
  const rows = user.is_admin
    ? await env.DB.prepare('SELECT * FROM commission_requests ORDER BY created_at DESC').all()
    : await env.DB.prepare('SELECT * FROM commission_requests WHERE agent = ? ORDER BY created_at DESC').bind(user.username).all();
  return json({ ok: true, data: rows.results || [] });
}

async function updateCommission(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  const status = String(body.status || '').trim();
  if (!id || !status) return json({ error: 'missing_fields' }, 400);
  await env.DB.prepare('UPDATE commission_requests SET status = ? WHERE id = ?').bind(status, id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
//  Email notifications (Resend HTTP API — Workers cannot use raw SMTP)
// ---------------------------------------------------------------------------
const PORTAL_URL = 'https://abbassmokashar.github.io/agent-portal/';
const WORKER_BASE = 'https://aus-agent-portal.a-mokashar.workers.dev';

async function setNotificationPrefs(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const enabled = !!body.notifyEmail;
  let token = user.unsub_token || '';
  if (enabled && !token) token = randomToken(20);
  await env.DB.prepare(
    'UPDATE users SET notify_email = ?, notified_asked = 1, unsub_token = ? WHERE username = ?'
  ).bind(enabled ? 1 : 0, token || null, user.username).run();
  return json({ ok: true, data: { notifyEmail: enabled, unsubToken: token } });
}

async function unsubscribe(env, url) {
  const token = String(url.searchParams.get('token') || '');
  const page = (title, message) =>
    new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
        '<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;padding:24px;text-align:center;color:#111}'
        + 'h1{font-size:20px}a{color:#b8860b}</style></head><body><h1>' + title + '</h1><p>' + message + '</p>'
        + '<p><a href="' + PORTAL_URL + '">Back to the agent portal</a></p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  if (!token) return page('Invalid link', 'This unsubscribe link is missing its token.');
  const found = await env.DB.prepare('SELECT username FROM users WHERE unsub_token = ?').bind(token).first();
  if (!found) return page('Link expired', 'We could not match this unsubscribe link to an account.');
  await env.DB.prepare('UPDATE users SET notify_email = 0 WHERE username = ?').bind(found.username).run();
  return page('You are unsubscribed', 'You will no longer receive email notifications from the AUS agent portal.');
}

async function broadcastNotification(request, env, admin) {
  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  if (!subject || !message) return json({ error: 'missing_fields' }, 400);

  const rows = await env.DB.prepare(
    "SELECT username, name, email, unsub_token FROM users WHERE status = 'active' AND notify_email = 1 AND is_admin = 0"
  ).all();
  const recipients = rows.results || [];
  let sent = 0;
  for (const r of recipients) {
    const link = `${WORKER_BASE}/api/unsubscribe?token=${encodeURIComponent(r.unsub_token || '')}`;
    const html =
      `<p>Dear ${escapeHtml(r.name || r.username)},</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` +
      `<p style="color:#777;font-size:12px">You opted in to these updates. ` +
      `<a href="${link}">Unsubscribe</a></p>`;
    const out = await sendEmail(env, r.email, subject, html);
    if (out.ok) sent += 1;
  }
  return json({ ok: true, data: { recipients: recipients.length, sent, emailConfigured: !!env.RESEND_API_KEY } });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
//  Backups (superadmin) — snapshot content, applications, files and roster to KV
// ---------------------------------------------------------------------------
function backupKey(id) {
  return BACKUP_PREFIX + id;
}

async function snapshotAll(env) {
  const contentRow = await env.DB.prepare('SELECT value FROM content WHERE key = ?').bind('portal').first();
  // Until an admin saves, there is no content row — agents see DEFAULT_CONTENT,
  // so that is what a backup must capture (otherwise a fresh backup is empty).
  let content = DEFAULT_CONTENT;
  if (contentRow) {
    try { content = JSON.parse(contentRow.value); } catch { content = DEFAULT_CONTENT; }
  }
  const applications = (await env.DB.prepare('SELECT * FROM applications ORDER BY created_at').all()).results || [];
  const files = (await env.DB.prepare('SELECT * FROM files ORDER BY created_at').all()).results || [];
  const users = (
    await env.DB.prepare(
      'SELECT username, name, email, phone, agency, country, is_admin, is_superadmin, status, totp_enabled, created_at, last_login FROM users ORDER BY created_at'
    ).all()
  ).results || [];
  return { content, applications, files, users };
}

async function createBackup(env, { createdBy = 'system', kind = 'auto' } = {}) {
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const snap = await snapshotAll(env);
  const payload = {
    version: 1,
    id,
    createdAt: nowIso(),
    createdBy,
    kind,
    content: snap.content,
    applications: snap.applications,
    files: snap.files,
    users: snap.users,
  };
  const body = JSON.stringify(payload);
  const contentCount = snap.content
    ? Object.values(snap.content).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
    : 0;
  await env.FILES.put(backupKey(id), body, {
    metadata: {
      id,
      createdAt: payload.createdAt,
      createdBy,
      kind,
      bytes: body.length,
      counts: {
        content: contentCount,
        applications: snap.applications.length,
        files: snap.files.length,
        users: snap.users.length,
      },
    },
  });
  await pruneBackups(env);
  return { id, createdAt: payload.createdAt, createdBy, kind, bytes: body.length };
}

async function pruneBackups(env, keep = BACKUP_KEEP) {
  let cursor;
  const names = [];
  do {
    const res = await env.FILES.list({ prefix: BACKUP_PREFIX, cursor });
    for (const k of res.keys) names.push(k.name);
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  names.sort().reverse(); // ids are ISO timestamps, so lexical reverse = newest first
  for (const name of names.slice(keep)) await env.FILES.delete(name);
}

function backupMeta(id, meta) {
  return {
    id: (meta && meta.id) || id,
    createdAt: (meta && meta.createdAt) || null,
    createdBy: (meta && meta.createdBy) || '',
    kind: (meta && meta.kind) || 'auto',
    bytes: (meta && meta.bytes) || 0,
    counts: (meta && meta.counts) || null,
  };
}

async function listBackups(env, user) {
  if (!user.is_superadmin) return json({ error: 'forbidden' }, 403);
  let cursor;
  const data = [];
  do {
    const res = await env.FILES.list({ prefix: BACKUP_PREFIX, cursor });
    for (const k of res.keys) data.push(backupMeta(k.name.slice(BACKUP_PREFIX.length), k.metadata));
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  data.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return json({ ok: true, data, keep: BACKUP_KEEP });
}

async function manualBackup(env, user) {
  if (!user.is_superadmin) return json({ error: 'forbidden' }, 403);
  const info = await createBackup(env, { createdBy: user.username, kind: 'manual' });
  return json({ ok: true, data: info });
}

async function deleteBackup(env, url, user) {
  if (!user.is_superadmin) return json({ error: 'forbidden' }, 403);
  const id = url.searchParams.get('id') || '';
  if (!id) return json({ error: 'missing_id' }, 400);
  await env.FILES.delete(backupKey(id));
  return json({ ok: true });
}

async function downloadBackup(env, id, user) {
  if (!user.is_superadmin) return json({ error: 'forbidden' }, 403);
  const raw = await env.FILES.get(backupKey(id));
  if (!raw) return json({ error: 'not_found' }, 404);
  return new Response(raw, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="aus-portal-backup-${id}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function restoreBackup(request, env, user) {
  if (!user.is_superadmin) return json({ error: 'forbidden' }, 403);
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!id) return json({ error: 'missing_id' }, 400);
  const raw = await env.FILES.get(backupKey(id));
  if (!raw) return json({ error: 'not_found' }, 404);

  let snap;
  try { snap = JSON.parse(raw); } catch { return json({ error: 'corrupt_backup' }, 400); }

  const scope = Array.isArray(body.scope) && body.scope.length ? body.scope : ['content'];

  // Snapshot the current state first, so a restore is itself reversible.
  await createBackup(env, { createdBy: user.username, kind: 'pre-restore' });

  const restored = [];
  if (scope.includes('content') && snap.content) {
    await env.DB.prepare(
      'INSERT INTO content (key, value, updated_at, updated_by) VALUES (?,?,?,?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
    )
      .bind('portal', JSON.stringify(snap.content), nowIso(), user.username)
      .run();
    restored.push('content');
  }
  if (scope.includes('applications') && Array.isArray(snap.applications)) {
    await env.DB.prepare('DELETE FROM applications').run();
    for (const a of snap.applications) {
      await env.DB.prepare(
        'INSERT INTO applications (id, agent, student_name, student_email, student_phone, programme, intake, nationality, notes, status, created_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      )
        .bind(a.id, a.agent, a.student_name, a.student_email, a.student_phone, a.programme, a.intake, a.nationality, a.notes, a.status, a.created_at)
        .run();
    }
    restored.push('applications');
  }
  if (!restored.length) return json({ error: 'nothing_restored' }, 400);
  return json({ ok: true, restored, from: id });
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
      title: "CHF 1'000 commission bonus per new student",
      subtitle: 'Celebrating our 50th Anniversary and building new agent relationships',
      body:
        "For every new student you recruit for the January 2027 intake, you earn an extra CHF 1'000 commission bonus — on top of your standard commission. This offer is made for two reasons: to celebrate our 50th Anniversary, and to start building relationships with new agents through Jonathan Hilton.",
      bullets: [
        "CHF 1'000 bonus for every new student recruited for the January 2027 intake",
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
      programme: 'All specializations',
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
      title: 'Student Enrollment Contract (template)',
      note: 'Template enrollment contract to share with students before registration.',
      url: 'assets/brochures/AUS-Global-Brochure.pdf',
      updated: '2026-10-01',
    },
  ],
  programmes: [
    // ----- Bachelor's (3 years) -----
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
    // ----- Master's (2 years) -----
    { id: 'p11', level: 'Master', title: 'Finance', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Markets reward precision.' },
    { id: 'p12', level: 'Master', title: 'Data Analytics', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Turn noise into signal.' },
    { id: 'p13', level: 'Master', title: 'Healthcare Administration', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Systems that save lives.' },
    { id: 'p14', level: 'Master', title: 'Human Resource Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Talent is the competitive edge.' },
    { id: 'p15', level: 'Master', title: 'International Business', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Lead across markets.' },
    { id: 'p16', level: 'Master', title: 'Leadership & Change', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Move organizations forward.' },
    { id: 'p17', level: 'Master', title: 'Sports Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'The business behind the game.' },
    { id: 'p18', level: 'Master', title: 'Strategic Brand & Digital Marketing', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Brand is the business model.' },
    { id: 'p19', level: 'Master', title: 'Aviation Management', region: 'Switzerland', duration: '2 years', language: 'English', intakes: 'January · April · September', fees: "CHF 25'000 / year", description: 'Altitude requires strategy.' },
    // ----- Doctorate -----
    { id: 'p20', level: 'Doctorate', title: 'Business Administration (DBA)', region: 'Switzerland', duration: '3 years', language: 'English', intakes: 'January · April · September', fees: "CHF 26'000 / year", description: 'Original research that advances practice for experienced leaders.' },
    // ----- Swiss Federal Diploma -----
    { id: 'p21', level: 'Diploma', title: 'Swiss Federal Diploma — Business Administration', region: 'Switzerland', duration: '2 years (part-time)', language: 'English', intakes: 'January · April · September', fees: "CHF 28'000 / year", description: 'The nationally recognized Swiss professional qualification, valued across European industries.' },
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
