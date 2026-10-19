# AUS Agent Portal

A private portal for selected AUS Business School agents — **contracts, specialization
info, brochures, a media library, a facilitated application process, news and
commission offers**, all in one place. It replaces the shared Google Drive folder.

It is intentionally **separate from the Webflow website (aus.swiss)**: the public
site stays marketing-only, and the portal lives on its own host with
password-protected access.

```
aus.swiss                     -> Webflow (public marketing site, untouched)
abbassmokashar.github.io/     -> Agent Portal front-end (this repo, GitHub Pages)
  agent-portal/
aus-agent-portal.<you>.workers.dev -> Cloudflare Worker API (auth, 2FA, files)
```

## How it works

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Front-end | Plain HTML/CSS/JS (no build step) | The portal UI, hosted on **GitHub Pages** |
| API | **Cloudflare Worker** | Login, sessions, TOTP 2FA, gated content & files |
| Database | **Cloudflare D1** | Agents, sessions, content, applications |
| File storage | **Cloudflare KV** | Brochures, contracts, media (access-checked) |

Access is **by invitation only** — there is no public sign-up. An administrator
creates each agent's credentials in the Admin view.

## Features

- **Secure agent login** — PBKDF2-hashed passwords, opaque session tokens
- **Two-factor authentication (2FA)** — TOTP (Google Authenticator / Authy / 1Password)
- **Admin agent management** — create / remove agents, reset passwords
- **Dashboard** — active offer banner, latest news, quick links
- **Offers** — e.g. the CHF 1'000 January 2027 commission bonus, linkable for newsletters/SMS
- **Specializations** — 21 programs with level, duration, language, intakes, fees, filterable
- **Brochures** — downloadable, filterable by region; real PDFs included
- **Contracts** — global documents plus per-agent uploads (agent uploads are private)
- **Media library** — photos, articles and marketing assets
- **Applications** — agents choose AUS or Helvetic Business School, then complete the application and scholarship forms embedded from HubSpot
- **Commissions** — agents request commissions/invoices; finance tracks status
- **Email notifications** — first-login opt-in with unsubscribe; transactional email via Resend
- **Swiss details** — CHF formatting (`28'000`), January/April/September intakes derived from today's date, live Montreux clock and booking links
- **Content manager** — admins upload and edit brochures, offers and images from
  the portal (no code, no JSON required)
- **Backups (superadmin)** — an automatic daily snapshot to KV plus a snapshot
  before every content change; restore any point in time with one click, or
  download a backup as JSON for off-site storage
- **Sessions & security** — view and revoke active devices, change password

## Project structure

```
agent portal/
├── index.html            # App shell (login + portal)
├── css/style.css         # AUS-branded styling
├── js/config.js          # <-- put your Worker URL here
├── js/app.js             # The whole front-end app
├── assets/
│   ├── img/favicon.png   # Same favicon as aus.swiss
│   ├── brochures/        # Sample downloadable PDFs
│   └── media/            # Placeholder media (replace with real assets)
├── worker/               # Cloudflare Worker backend
│   ├── index.js          # API: auth, 2FA, files, content, applications
│   ├── schema.sql        # D1 schema
│   └── wrangler.toml     # Worker config
└── .nojekyll             # Allows GitHub Pages to serve the site as-is
```

## Try it locally

Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000     # then open http://localhost:8000
```

With **no Worker URL set**, the portal runs in **offline demo mode** using the
built-in sample content. Demo logins:

- Agent: `demo` / `demo1234`
- Admin: `admin` / `admin1234`

This is perfect for **presenting the concept** before the backend is connected.

## Deploy the Cloudflare Worker backend

> You need a free Cloudflare account. All commands are run inside the `worker/` folder.

```bash
cd worker

# 1. Log in
npx wrangler login

# 2. Create the D1 database and copy the returned database_id into wrangler.toml
npx wrangler d1 create aus-agent-portal

# 3. Apply the schema
npx wrangler d1 execute aus-agent-portal --remote --file schema.sql

# 4. Create the KV namespace for gated files and copy the returned id into wrangler.toml
npx wrangler kv namespace create FILES

# 5. Set the one-time setup token (used once to create the first admin)
npx wrangler secret put ADMIN_TOKEN          # choose a long random string

# 6. (Optional) password-reset emails
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put NOTIFY_EMAIL_FROM

# 7. Deploy
npx wrangler deploy
```

Then edit `js/config.js` and set:

```js
window.AUS_CONFIG = { WORKER_URL: 'https://aus-agent-portal.<you>.workers.dev' };
```

Also update `ALLOWED_ORIGINS` in `worker/wrangler.toml` (already lists
`https://abbassmokashar.github.io`) and re-deploy if your Pages URL differs.

### Create the first administrator

Send one request (replace values). This only works while no users exist:

```bash
curl -X POST https://aus-agent-portal.<you>.workers.dev/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_ADMIN_TOKEN","username":"admin","email":"you@aus.swiss","password":"a-strong-password"}'
```

Then sign in to the portal as `admin`, open **Admin → Add account**, and create your
agents. (You can also enable 2FA under **Account & Security**.)

### Superadmin

The first account created via `/api/auth/bootstrap` is a **superadmin**:

- **Invisible** — superadmins are hidden from the account list for everyone except
  another superadmin.
- **Full control** — can create/remove administrators, promote or demote any
  account (**Make admin / Remove admin**), reset anyone's password, and manage all
  content. Regular administrators can only create and manage agents.
- **Protected** — a superadmin account cannot be deleted or demoted, including by
  itself.

### Content management

Admins manage **brochures, offers and images** directly from the Admin view
(**Content → Manage**): upload a file, fill in the details, and it publishes to
all agents immediately. Existing entries can be edited or removed. Under the
hood this writes to the portal content blob and stores uploaded files in the
worker's KV namespace. An **Advanced → Edit JSON** option remains for bulk edits.

### Backups (superadmin)

Backups are automatic and manual:

- **Automatic** — a snapshot is written to KV every day (see `[triggers] crons` in
  `wrangler.toml`), and another is taken automatically **before every content
  change**. The newest 40 are kept; older ones are pruned.
- **Manual** — click **Back up now** in the Admin view.
- **Restore** — pick any snapshot and restore **content**, **applications**, or
  both. The current state is snapshotted first, so a restore can itself be undone.
- **Download** — export any snapshot as a JSON file for off-site storage.

A backup captures the portal content, applications, file metadata and the account
roster (the roster is for reference only — restoring accounts is intentionally not
supported, to avoid lock-outs).

### Agent account rules

When adding an account, **full name, email, phone and country are required**, plus
a username and a 10+ character password that does not contain the username. Country is chosen from a searchable
dropdown.

### HubSpot application and scholarship forms

The Applications view first asks the agent to choose **AUS Business School** or
**Helvetic Business School**, then shows that school's application and
scholarship forms. The portal ids and form ids live in `APPLY_ORGS` near the top
of the Applications section in `js/app.js` (region `eu1`). Replace those ids to
swap a form; no worker changes are needed.

## Publish the front-end on GitHub Pages

```bash
git init
git add .
git commit -m "AUS Agent Portal"
git branch -M main
git remote add origin https://github.com/abbassmokashar/agent-portal.git
git push -u origin main
```

Then in **GitHub → repo → Settings → Pages**, set **Source = Deploy from a branch,
Branch = main / (root)**. The portal will be live at:

```
https://abbassmokashar.github.io/agent-portal/
```

## API reference (worker/index.js)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/auth/bootstrap` | POST | Create the first admin (needs `ADMIN_TOKEN`) |
| `/api/login` | POST | Sign in (returns token, or a 2FA challenge) |
| `/api/2fa/verify` | POST | Finish login with a 6-digit code |
| `/api/me` | GET | Current user |
| `/api/logout` | POST | End the current session |
| `/api/change-password` | POST | Change password (signs out other devices) |
| `/api/sessions` | GET / DELETE | List / revoke sessions |
| `/api/2fa/setup` · `/enable` · `/disable` | POST | Manage TOTP 2FA |
| `/api/forgot` · `/api/reset` | POST | Password reset by email (optional) |
| `/api/content` | GET | Portal content (news, offers, resources…) |
| `/api/files` | GET | List visible files (global, own, or all for admins) |
| `/api/files` | POST | Agent uploads a contract/document for their own account |
| `/api/files/:id` | GET / DELETE | Download a permitted file / delete an own upload |
| `/api/applications` | GET / POST | List own submissions / submit a student application |
| `/api/commissions` | GET / POST | List own commission requests / create one |
| `/api/notifications` | POST | Save email-notification preference |
| `/api/unsubscribe?token=` | GET | Public unsubscribe link (no auth) |
| `/api/admin/agents` | GET / POST / DELETE | Manage agents (incl. address fields) |
| `/api/admin/agents/password` | POST | Reset an agent's password |
| `/api/admin/content` | PUT | Save portal content (auto-snapshots the previous version) |
| `/api/admin/files` | POST | Upload a gated file (`assignedTo` = username or blank for all) |
| `/api/admin/files/:id` | PATCH / DELETE | Rename/re-categorise/reassign or delete a file |
| `/api/admin/applications` | GET / PATCH | List all / update applications |
| `/api/admin/commissions` | GET / PATCH | List all / update commission requests |
| `/api/admin/notify` | POST | Email opted-in agents (needs `RESEND_API_KEY`) |
| `/api/admin/backups` | GET / POST / DELETE | List / create / delete backups (superadmin) |
| `/api/admin/backups/:id` | GET | Download a backup as JSON (superadmin) |
| `/api/admin/backups/restore` | POST | Restore a backup (superadmin) |

## Security

### In the app and worker

- Passwords are salted and PBKDF2-hashed (100k iterations, SHA-256). Minimum length is
  10 characters and the password may not contain the username.
- Session tokens are random 256-bit values. Only a **SHA-256 hash** is stored in D1, so a
  database leak cannot be replayed as a live login. Tokens expire after 30 days; changing
  a password revokes every session.
- 2FA: TOTP with 5 attempts per challenge, single-use codes, and IP rate limiting.
- Login, 2FA, forgot-password and reset endpoints are rate limited in D1
  (`rate_limits` table). Login also spends the same PBKDF2 work for unknown users, so
  response timing does not reveal which accounts exist.
- CORS is **deny by default**: only exact origins listed in `ALLOWED_ORIGINS` receive an
  `Access-Control-Allow-Origin` header. There is no `*` fallback.
- Every API response sends `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, a restrictive
  `Permissions-Policy`, and HSTS. Errors return a generic `server_error` — no stack traces.
- Gated files are streamed through the worker only for authenticated sessions; agent
  uploads are private and admins see everything.
- Privilege changes are superadmin-only; the superadmin account cannot be deleted or
  edited by other admins.

### Security headers for the static site (`_headers`)

The repo ships a `_headers` file with a Content-Security-Policy, HSTS,
`frame-ancestors 'none'`, nosniff and no-referrer. **Cloudflare Pages applies it
automatically.** GitHub Pages ignores `_headers`; if you keep GitHub Pages behind
Cloudflare, recreate the same headers with a Cloudflare **Response Header Transform
Rule** (or move to Cloudflare Pages). Update the CSP `connect-src`/`script-src` entries
when you add a new API hostname.

### Hosting on an `aus.swiss` subdomain

Recommended split:

- `portal.aus.swiss` → static site (Cloudflare Pages, connected to this repo)
- `api.aus.swiss` → this worker (Cloudflare custom domain)

1. **Cloudflare Pages**: create a project from the repo, no build command, output
   directory `/`. Add the custom domain `portal.aus.swiss`.
2. **Worker custom domain**: add to `worker/wrangler.toml` and deploy:
   ```toml
   routes = [{ pattern = "api.aus.swiss", custom_domain = true }]
   ```
3. Update `js/config.js` → `WORKER_URL: 'https://api.aus.swiss'`.
4. Set the worker vars/secrets:
   ```toml
   [vars]
   ALLOWED_ORIGINS = "https://portal.aus.swiss"
   PORTAL_URL = "https://portal.aus.swiss"
   ```
   Keep the GitHub Pages origin in `ALLOWED_ORIGINS` only during migration.
5. In Cloudflare, enable **SSL/TLS → Full (strict)**, **Always Use HTTPS**, **HSTS**,
   **Bot Fight Mode**, and a **WAF rate-limiting rule** for `/api/login` and
   `/api/2fa/verify` as a second layer. Optionally enable managed WAF rules.
6. Add a DNS TXT record for SPF/DKIM/DMARC on `aus.swiss` so portal email is not spoofed.
7. After the first admin is created, delete the bootstrap secret:
   `npx wrangler secret delete ADMIN_TOKEN` (it is useless once `/api/auth/bootstrap`
   returns `already_initialized`).

### Operational checklist

- Change the superadmin password immediately if it is still the setup default.
- Remove test/demo accounts before going live (`test`, etc.).
- Do not commit `.dev.vars`, `.env`, API keys or reset links. The only secrets are
  Cloudflare secrets (`ADMIN_TOKEN`, `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`).
- Keep `robots.txt` disallowing indexing of the portal.
- **Demo mode is not secure** — it is a static preview for presentations only. Always
  deploy the worker and use real accounts for actual agent access.

## Replacing the placeholders

- Swap `assets/media/*.svg` for real photography.
- Replace the sample PDFs in `assets/brochures/` (or upload via **Admin → Content → Upload**).
- Update news, offers, specializations and contracts in the Admin content manager.
