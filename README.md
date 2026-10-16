# AUS Agent Portal

A private portal for selected AUS Business School agents — **contracts, programme
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
- **Offers** — e.g. the CHF 1,000 January 2027 commission bonus, linkable for newsletters/SMS
- **Programmes** — levels, duration, language, intakes, fees, filterable
- **Brochures** — downloadable, filterable by region; real PDFs included
- **Contracts** — representation & enrolment templates
- **Media library** — photos, articles and marketing assets
- **Applications** — agents submit student applications; admins track status
- **Editable content** — admins update news/offers/resources without touching code
- **Sessions & security** — view and revoke active devices, change password

## Project structure

```
agent portal/
├── index.html            # App shell (login + portal)
├── css/style.css         # AUS-branded styling
├── js/config.js          # <-- put your Worker URL here
├── js/app.js             # The whole front-end app
├── assets/
│   ├── img/favicon.svg
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

Then sign in to the portal as `admin`, open **Admin → Add agent**, and create your
agents. (You can also enable 2FA under **Account & Security**.)

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
| `/api/files` | GET | List files (optionally `?category=`) |
| `/api/files/:id` | GET | Download a gated file |
| `/api/applications` | POST | Submit a student application |
| `/api/admin/agents` | GET / POST / DELETE | Manage agents |
| `/api/admin/agents/password` | POST | Reset an agent's password |
| `/api/admin/content` | PUT | Save portal content |
| `/api/admin/files` | POST / DELETE | Upload / delete gated files |
| `/api/admin/applications` | GET / PATCH | List / update applications |

## Security notes

- Passwords are salted and PBKDF2-hashed (100k iterations, SHA-256) on the worker —
  never stored or sent in plain text.
- 2FA secrets and sessions live server-side; session tokens expire after 30 days.
- Gated files are streamed through the worker only for authenticated sessions.
- **Demo mode is not secure** — it is a static preview for presentations only.
  Always deploy the worker and use real accounts for actual agent access.

## Replacing the placeholders

- Swap `assets/media/*.svg` for real photography.
- Replace the sample PDFs in `assets/brochures/` (or upload via **Admin → Content → Upload**).
- Update news, offers, programmes and contracts in **Admin → Edit content**.
