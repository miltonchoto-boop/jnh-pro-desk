# Google OAuth — human steps for Milton / Jose

**Ops Google account (required):** `jnhmass@gmail.com`  
**Do not use** `jnhmasonry@gmail.com` for Calendar / Contacts OAuth.

Until these steps finish, `book.html` stays on **localStorage + mailto** fallback (still usable; busy times from Google Calendar are **not** hidden yet).

---

## A. Google Cloud project (once)

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) as **`jnhmass@gmail.com`** (or a Milton admin who can share the OAuth client with that account).
2. Create or pick a project (e.g. `jnh-pro-desk`).
3. **APIs & Services → Library** → enable:
   - **Google Calendar API**
   - **People API** (Contacts)
4. **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal if Workspace)
   - App name: `JNH Pro Desk Booking`
   - User support email / developer contact: `jnhmass@gmail.com`
   - Scopes → Add:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/calendar.events`
     - `https://www.googleapis.com/auth/contacts`
   - Test users → add **`jnhmass@gmail.com`** (required while app is in Testing)
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Desktop app** (simplest for one-time refresh token)  
     or **Web application** if you prefer a redirect URI
   - Copy **Client ID** and **Client secret** (store in a password manager — never commit to git)

---

## B. Get a refresh token (Jose signs in as jnhmass@gmail.com)

Easiest path — OAuth Playground (Desktop client):

1. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Gear icon (top right) → check **Use your own OAuth credentials** → paste Client ID + Client secret.
3. Left panel → select the three scopes above (or paste them) → **Authorize APIs**.
4. Choose Google account **`jnhmass@gmail.com`** → Allow.
5. **Exchange authorization code for tokens** → copy **Refresh token**.
6. Save refresh token with Client ID / Secret (password manager).

If the token was created earlier **without** Contacts scope, revoke it and re-run this section with all three scopes.

---

## C. Deploy Cloudflare Worker + secrets

From a machine with Node + Cloudflare login (`npx wrangler login`):

```bash
cd worker
npm install
npx wrangler secret put GOOGLE_CLIENT_ID      # paste Client ID
npx wrangler secret put GOOGLE_CLIENT_SECRET  # paste Client secret
npx wrangler secret put GOOGLE_REFRESH_TOKEN  # paste refresh token
npx wrangler secret put ADMIN_TOKEN           # long random string (e.g. openssl rand -hex 24)
npx wrangler deploy
```

Note the Worker URL, e.g. `https://jnh-booking.<subdomain>.workers.dev`.

Confirm: `curl https://jnh-booking.<subdomain>.workers.dev/health`

---

## D. Point Pages booker at the Worker

Edit `booking-config.js` in this repo:

```js
mode: "api",
apiBase: "https://jnh-booking.<subdomain>.workers.dev",
calendarEmail: "jnhmass@gmail.com",
```

Commit + push to `miltonchoto-boop/jnh-pro-desk` `main` (GitHub Pages updates in ~1–2 min).

Jose bookmarks on phone:

```
https://miltonchoto-boop.github.io/jnh-pro-desk/confirm.html?token=<ADMIN_TOKEN>
```

---

## E. Smoke test

1. Put a busy block on **`jnhmass@gmail.com`** Google Calendar for tomorrow 10:00 AM ET.
2. Open public booker → tomorrow’s **10:00** slot must **not** appear.
3. Book another open slot as a test customer → status **pending**; calendar shows `[PENDING] Estimate · …` (tentative / opaque).
4. Open `confirm.html?token=…` → **Confirm** → event becomes confirmed; title drops `[PENDING]`.
5. **Decline** a second test → slot reappears.

---

## Apps Script alternative (no Cloudflare)

If Milton prefers Google-only hosting: see `apps-script/README.md`.  
Create / deploy the web app **while signed in as `jnhmass@gmail.com`**, then set `booking-config.js` `apiBase` to the Apps Script `/exec` URL.

---

## Blockers checklist

| Item | Owner | Status |
|------|--------|--------|
| OAuth client + refresh token as `jnhmass@gmail.com` | Jose / Milton | **Required — human** |
| Cloudflare account + `wrangler deploy` | Milton | Required unless Apps Script |
| `booking-config.js` → `mode: "api"` | Milton / agent after Worker URL known | After deploy |
| Carrd Book button | Milton / Jose | See BOOK-CARRD-STEPS.md (no wallpaper change) |
