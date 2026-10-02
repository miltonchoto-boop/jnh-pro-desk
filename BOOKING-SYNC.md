# JNH Masonry — Google Calendar + Contacts Sync (Pro Desk)

**Scope:** JNH Pro Desk only (`book.html`, Appointments, Rolodex, Worker). Do **not** change jnhmas.com Carrd except an optional “Book” link later.

**Google ops account (Calendar + Contacts sync):** `jnhmass@gmail.com`  
Jose must authorize OAuth on **this** account — never commit secrets.

**Not for ops:** `jnhmasonry@gmail.com` stays the public marketing / printed contact on estimates & site footers. Do **not** OAuth Calendar sync against it.

One Worker / one OAuth refresh token covers:

1. **Calendar** — public booking, free/busy, pending holds, Jose confirm  
2. **Contacts (People API)** — **bidirectional** Rolodex ↔ Gmail Contacts  

---

## Goals (Milton confirmed)

### Appointments

1. Sync Pro Desk appointments with Google Calendar for `jnhmass@gmail.com`
2. Public users book online (`book.html` on GitHub Pages)
3. Busy / blocked / already-scheduled times must **not** appear as open slots
4. New public bookings are **PENDING** until Jose approves; only then confirm on Calendar + Pro Desk
5. Jose confirms daily on the fly (mobile-friendly `confirm.html` + Appointments tab)

### Rolodex ↔ Gmail Contacts

6. Pro Desk **Rolodex** stays in sync **both ways** with Gmail Contacts on `jnhmass@gmail.com` (same OAuth as Calendar)

---

## Options compared (booking)

| Approach | Fits pending-approval? | Hides busy slots? | Works with static Pages? | Notes |
|----------|------------------------|-------------------|---------------------------|-------|
| **A. Google Appointment Schedules** | Weak (auto-books) | Yes | Yes (embed) | Hard to keep “pending until Jose confirms” |
| **B. Calendly / similar** | Weak without paid workflows | Yes | Yes | Extra vendor |
| **C. Custom book.html + freeBusy + tentative hold events** ✅ | Strong | Yes (freeBusy opaque) | Needs tiny backend | **Recommended** |
| **D. Apps Script web app** | Strong | Yes | Yes (GAS = backend) | Google-only alternative |

Contacts sync has no SaaS alternative in-scope — **People API via the same Worker** is the path.

### Recommended: **C — Custom + Cloudflare Worker**

Static GitHub Pages cannot hold Google OAuth secrets or call Calendar/People APIs safely from the browser. A small Worker (or Apps Script) owns:

- OAuth refresh token for Jose’s Google account
- `freeBusy` → compute open slots; tentative holds on book
- Confirm / decline for Jose (mobile)
- People API list / create / update for Rolodex ↔ Contacts

**Apps Script alternative** under `apps-script/` if Cloudflare is not wanted (Calendar via `CalendarApp`; Contacts via `People` advanced service — stubbed).

---

## Architecture (chosen)

```
┌─────────────────┐     GET /slots, POST /book     ┌──────────────────────┐
│  book.html      │ ─────────────────────────────► │                      │
│  (GitHub Pages) │                                │  Cloudflare Worker   │
└─────────────────┘                                │  (or Apps Script)    │
                                                   │                      │
┌─────────────────┐     GET/POST /pending|confirm  │   Calendar API       │
│  confirm.html   │     GET /contacts              │   People API         │
│  + Appointments │     POST /contacts/push|sync   │                      │
│  + Rolodex UI   │ ─────────────────────────────► └──────────┬───────────┘
└─────────────────┘                                           │
                                                              ▼
                                                   ┌──────────────────────┐
                                                   │  jnhmass@gmail.com│
                                                   │  Calendar + Contacts │
                                                   └──────────────────────┘
```

### Booking — slot rules

1. Worker loads **availability** (`AVAILABILITY_JSON` env — mirrors Pro Desk defaults).
2. Calls Calendar **freeBusy** for the horizon.
3. Builds candidate slots from work days / hours / lunch / lead / horizon.
4. Drops slots overlapping busy blocks (personal events, confirmed estimates, **pending holds**).
5. Returns only free slots to `book.html`.

### Booking — pending hold → confirm

| Stage | Calendar event | Pro Desk / API status | Public slots |
|-------|----------------|------------------------|--------------|
| Customer submits | `status: tentative`, `transparency: opaque`, title `[PENDING] Estimate · {name}` | `pending` | Slot hidden |
| Jose confirms | `status: confirmed`, title `Estimate · {name}` | `confirmed` | Slot stays taken |
| Jose declines | Event deleted | `cancelled` | Slot reappears |

### Rolodex ↔ Gmail Contacts — bidirectional

| Action (Pro Desk Rolodex) | API | Behavior |
|---------------------------|-----|----------|
| **Pull from Gmail** | `GET /contacts` | List People connections → merge into local Rolodex (match by `resourceName`, else email, else phone) |
| **Push to Gmail** | `POST /contacts/push` | Upsert each Rolodex row (create or patch by `googleContactResourceName`) |
| **Sync both ways** | Pull then Push | Remote wins on empty local fields; capabilities stored in People `userDefined` |

**Match / merge keys (client):**

1. `googleContactResourceName` ↔ People `resourceName`  
2. else normalized email  
3. else digits-only phone (≥7)

**Field map:**

| Rolodex | Google People |
|---------|---------------|
| name | names[0] |
| phone | phoneNumbers[0] |
| email | emailAddresses[0] |
| company | organizations[0].name |
| notes | biographies[0] |
| capabilities[] | userDefined `jnh_capabilities` |
| area | userDefined `jnh_area` |
| id | userDefined `jnh_pro_desk_id` |

Conflict policy (v1 scaffold): last write via Push wins on Google; Pull overwrites local name/phone/email/company when remote present. Capabilities from Google only applied when `jnh_capabilities` is set. Refine later if Milton wants last-modified timestamps.

---

## What Jose / Milton must authorize (no secrets in git)

1. **Google Cloud project** with **Calendar API** + **People API** enabled.
2. **OAuth consent** for `jnhmass@gmail.com` with scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/contacts`
3. Store in Cloudflare Worker secrets (or Apps Script Script Properties) — **never** commit:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN` (must include Contacts scopes — re-consent if token was calendar-only)
   - `CALENDAR_ID` (usually `primary`)
   - `ADMIN_TOKEN` (confirm.html + Rolodex sync buttons)
4. Public `booking-config.js` → `apiBase` = Worker URL only (`mode: "api"`).

---

## Repo layout (this scaffold)

```
BOOKING-SYNC.md          ← this doc (Calendar + Contacts)
booking-config.js        ← public API base URL + mode (placeholders)
booking-api.js           ← fetch wrapper (slots, book, confirm, contacts)
booking-store.js         ← local fallback; public status defaults to pending
book.html                ← “Request appointment — Jose will confirm”
confirm.html             ← mobile confirm/decline for Jose
index.html / app.js      ← Appointments pending + Rolodex Pull/Push/Sync
worker/                  ← Cloudflare Worker (Calendar + People)
apps-script/             ← optional Google Apps Script twin
```

---

## Live vs not live

| Piece | Status |
|-------|--------|
| Header condense (logo-left / nav-right) | **Live** on Pages |
| Estimates fullscreen (`body.estimates-fullscreen` + Back to Pro Desk) | **Live** on Pages |
| `book.html` pending copy + API hooks | Scaffold; **localStorage fallback** until Worker + OAuth |
| Rolodex Pull / Push / Sync UI | Scaffold; needs Worker + People scopes |
| Real freeBusy / Calendar / Contacts | **Needs Jose OAuth** + Worker deploy |
| Carrd / jnhmas.com | **Untouched** — steps in BOOK-CARRD-STEPS.md |

---

## Next steps for Milton

1. Create Google Cloud OAuth client; enable Calendar + People APIs.
2. Jose signs in as `jnhmass@gmail.com`; save refresh token **with contacts scope** as Worker secret.
3. `cd worker && npm i && npx wrangler secret put …` then `npx wrangler deploy`.
4. Set `booking-config.js` → `mode: "api"`, `apiBase: <Worker URL>`; commit; push Pages.
5. Jose bookmarks `confirm.html?token=…` on phone for daily pending confirms.
6. In Pro Desk → Rolodex: **Sync both ways** once (ADMIN_TOKEN) to seed links; then use Pull/Push as needed.
7. Carrd “Book / Appointment” link only (no wallpaper change) — exact steps in **[BOOK-CARRD-STEPS.md](./BOOK-CARRD-STEPS.md)** → `https://miltonchoto-boop.github.io/jnh-pro-desk/book.html`.
8. OAuth human checklist: **[BOOKING-OAUTH-STEPS.md](./BOOKING-OAUTH-STEPS.md)** (sign in as `jnhmass@gmail.com`).
