# JNH Masonry Pro Desk v1

Local ops tool for Jose (JNH Masonry Inc.) — professional estimates, crew time tracking, weekly payroll, vendors, and receipt capture (OCR hook stubbed).

**Silver + blue UI.** Static HTML/CSS/JS — no build step, easy to host and later link from the Carrd Pro Desk footer.

## Open locally

```bash
cd /workspace/jnh-masonry/pro-desk
# Option A — open file directly
xdg-open index.html   # Linux
# open index.html     # macOS
# start index.html    # Windows

# Option B — simple local server (recommended for camera/file APIs)
python3 -m http.server 8765
# then visit http://localhost:8765/
```

Path: `/workspace/jnh-masonry/pro-desk/index.html`

## Modules

| Tab | What it does |
|-----|----------------|
| **Hub** | Visual project command center — KPIs, jobs kanban, 14-day timeline (appointments + scheduled jobs), payroll & spend snapshot |
| **Appointments** | Admin availability (days/hours/slots) + booked estimate appointments list; drives public booker |
| **Estimates** | Full-viewport workspace (hides topbar; **Back to Pro Desk** returns to Hub). Customer fields, multi-section Scope of Work, **standard vs job labor rate** ($/hr) + optional job hours, labor+material line items with auto totals, disclosures, payment terms placeholders, print/PDF-ready HTML, JSON save/export/import |
| **Employees** | Crew roster with hourly pay rates and pay type: On books (NY payroll) or Cash |
| **Time Log** | Hours per worker / job / day; entries retain the rate used when logged |
| **Weekly Payroll** | Sun–Sat summary split into On books vs Cash totals, with hours and amount owed per person |
| **Vendors** | Supplier list (category, phone, notes) |
| **Rolodex** | Capability-first directory — supplier, excavator, electrician, plumber, landscaper, and any custom capability |
| **Receipts** | Upload or camera snapshot; attach to vendor + job; **OCR stub** fills fields for manual confirm |
| **Jobs** | Kanban: Sold → Scheduled → In progress → Done; linked to estimates & time hours |
| **Price Book** | Cambridge / stone catalog with last cost; add lines to estimates fast |
| **Reviews** | Google review URL + QR (printed on estimates); editable Place ID link |
| **Insurance** | COI / insurance docs (base64), expiry tracking, attach to estimates |
| **Fleet** | Vehicles & equipment (purchase cost/date) + maintenance/repair logs |
| **Client Flow** | Lead→Estimate→Sale→Design→Materials→Delivery→Job→Complete + optional Claim; issues log; Gantt overview |
| **Marketing** | Client list + email/SMS blast composer (send stubbed until Twilio/email API) |
| **Weather** | NOAA/NWS 5-day field window with precipitation + humidity emphasis, active alerts, and NOAA CPC next-month temperature/precipitation outlook |
| **Settings** | Change desk password / lock; **standard labor rate** ($/hr) + optional default hours for new estimates |
| **Payments** | Stripe-ready: publishable key, Payment Link stubs, deposit/invoice, mark paid, refund stub, fee note |

## Estimate print header

Every printed estimate includes:

- **JNH Masonry Inc.**
- 631-965-1754 · jnhmasonry@gmail.com · jnhmas.com
- Licensed & Insured

### Disclosures (on every estimate when checked — NYS / Suffolk–oriented, not legal advice)

- JNH not responsible for material shipping situations
- JNH not responsible for material / manufacturer performance
- Validity / deposit note

## Data storage

All data is stored in the browser **localStorage** key `jnh_pro_desk_v1` (estimates, employees including pay type, time entries, vendors, capability-first Rolodex contacts, weather location, receipts including image data URLs).

- Use **Export JSON** on an estimate, or import a full backup JSON from the Estimates tab.
- Clearing site data / using another browser loses local data — export backups for important jobs.
- Large receipt images can fill quota; compress photos if save fails.

## OCR integration hook

In `app.js`, function `runOcrStub(fileName, mime, dataUrl)` is the placeholder.

Replace with a real call, e.g. `POST /api/ocr/receipt`, returning:

```json
{
  "vendorName": "Home Depot",
  "amount": 128.45,
  "date": "2026-10-01",
  "category": "Materials — Other",
  "confidence": 0.92,
  "rawText": "...",
  "engine": "your-ocr"
}
```

UI already maps those fields and lets Jose confirm before save.

## Sample structure

Modeled after `jose-estimate-sample.docx` — numbered scope sections, customer fields, materials, total, payment schedule, acceptance signatures.

## Stack

- `index.html` — shell + views
- `styles.css` — silver + blue theme
- `app.js` — all logic (no framework)

## Public estimate booker

- **`book.html`** — customer-facing scheduler. Copy: **Request appointment — Jose will confirm** (status `pending` until Confirm).
- Live: https://miltonchoto-boop.github.io/jnh-pro-desk/book.html
- Embed: `?embed=1`
- **`confirm.html`** — mobile pending queue for Jose.
- Until Google OAuth + Worker are live: localStorage fallback + mailto (`jnhmass@gmail.com`).
- Carrd link steps (no wallpaper change): **[BOOK-CARRD-STEPS.md](./BOOK-CARRD-STEPS.md)**

## Google Calendar + Contacts sync (scaffold)

See **[BOOKING-SYNC.md](./BOOKING-SYNC.md)**. Same OAuth for `jnhmass@gmail.com` (ops sync — not the public marketing inbox):

- Calendar freeBusy + pending hold events (Cloudflare Worker under `worker/`)
- Rolodex ↔ Gmail Contacts two-way sync (People API; Pull / Push / Sync in Rolodex tab)
- Human OAuth checklist: **[BOOKING-OAUTH-STEPS.md](./BOOKING-OAUTH-STEPS.md)**

Secrets stay in Worker env — never in this repo. Set `booking-config.js` `mode` to `"api"` after deploy.


## Chat Advisor (JNH only)

In-desk ChatGPT advisor for Jose — **not shared** with other Milton businesses. See **[CHAT-ADVISOR.md](./CHAT-ADVISOR.md)**.

- Hub card **Login to Chat** reuses the existing Pro Desk session (`sessionStorage` key `jnh_pro_desk_unlocked`, default password `jnh2026`).
- Estimates: **Review with Chat** opens a left-side panel that reviews the current estimate.
- **Accept** writes suggested line items, deposit, payment terms, and job notes into the open estimate (then Save).
- Modes: Estimate · Marketing · Email · Text.
- Default is **demo/mock** advice. Live OpenAI needs Worker secret `OPENAI_API_KEY` (never in the frontend) plus `chat-config.js` `mode: "api"`.

## Later

- Live: https://miltonchoto-boop.github.io/jnh-pro-desk/
- Wire OCR API into `runOcrStub`
- Carrd “Book” button per BOOK-CARRD-STEPS.md
