# JNH Masonry Pro Desk v1

Local ops tool for Jose (JNH Masonry Inc.) — professional estimates, crew time tracking, weekly payroll, vendors, and receipt capture (OCR hook stubbed).

**Night + gold UI.** Static HTML/CSS/JS — no build step, easy to host and later link from the Carrd Pro Desk footer.

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
| **Estimates** | Customer fields, multi-section Scope of Work, labor+material line items with auto totals, disclosures, payment terms placeholders, print/PDF-ready HTML, JSON save/export/import |
| **Employees** | Crew roster with hourly pay rates and pay type: On books (NY payroll) or Cash |
| **Time Log** | Hours per worker / job / day; entries retain the rate used when logged |
| **Weekly Payroll** | Sun–Sat summary split into On books vs Cash totals, with hours and amount owed per person |
| **Vendors** | Supplier list (category, phone, notes) |
| **Receipts** | Upload or camera snapshot; attach to vendor + job; **OCR stub** fills fields for manual confirm |
| **Jobs** | Kanban: Sold → Scheduled → In progress → Done; linked to estimates & time hours |
| **Price Book** | Cambridge / stone catalog with last cost; add lines to estimates fast |
| **Reviews** | Google review URL + QR (printed on estimates); editable Place ID link |
| **Payments** | Stripe-ready: publishable key, Payment Link stubs, deposit/invoice, mark paid, refund stub, fee note |

## Estimate print header

Every printed estimate includes:

- **JNH Masonry Inc.**
- 631-965-1754 · jnhmasonry@gmail.com · jnhmas.com
- Licensed & Insured

### Disclosures (on every estimate when checked)

- JNH not responsible for material shipping situations
- JNH not responsible for material / manufacturer performance
- Validity / deposit note

## Data storage

All data is stored in the browser **localStorage** key `jnh_pro_desk_v1` (estimates, employees including pay type, time entries, vendors, receipts including image data URLs).

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
- `styles.css` — dark night + gold theme
- `app.js` — all logic (no framework)

## Later

- Optional PIN gate
- Live: https://miltonchoto-boop.github.io/jnh-pro-desk/ — linked from Carrd Pro Desk footer
- Wire OCR API into `runOcrStub`
