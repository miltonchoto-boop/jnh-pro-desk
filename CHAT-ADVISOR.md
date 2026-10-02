# JNH Chat Advisor

Separate from booking OAuth and from other Milton businesses. The OpenAI API key **must never** be in GitHub Pages / `chat-config.js` / `app.js`.

## What Jose sees

| Place | Action |
|-------|--------|
| Project Hub | **Login to Chat** card — **Open Chat Advisor** (same unlock session as Pro Desk) |
| Estimates list, editor, fullscreen toolbar | **Review with Chat** — slides the advisor in from the left and reviews the open estimate |
| Marketing tab | **Draft with Chat** |
| Panel chips | Estimate · Marketing · Email · Text |

**Login to Chat** does not add a second password. Unlock Pro Desk once (`jnh2026` by default, changeable in Settings). Session flag: `sessionStorage` `jnh_pro_desk_unlocked=1`. If the desk is locked, Chat stays behind the same gate.

**Accept**

- Estimate suggestions update the open draft: `lines` (description, qty, unit, labor rate, material $), scope `sections`, `depositAmount`, `depositNotes`, `paymentTerms`, `jobNotes`, optional labor hours / rate override. Totals recalculate in the UI. Jose still taps **Save Estimate** (localStorage). Locked estimates refuse Accept.
- Marketing copy fills the blast composer subject + body and opens the Marketing tab (send stays stubbed).
- Email / text open `mailto:` / `sms:` with the draft. Nothing is sent automatically.

## Demo mode (shipped default)

`chat-config.js`:

```js
mode: "mock",
apiBase: ""
```

Advice is generated in the browser (and the Worker `/chat` route also returns a mock if `OPENAI_API_KEY` is missing). Badge: **Demo / mock advice**.

## Live OpenAI

1. From `worker/`:

```bash
npm install
npx wrangler secret put OPENAI_API_KEY
# optional model override is a public var; default gpt-4o-mini
npx wrangler deploy
```

2. Note the workers.dev URL (same Worker as booking: `jnh-booking`).

3. Edit **only** `chat-config.js` on this repo (no secrets):

```js
mode: "api",
apiBase: "https://jnh-booking.<subdomain>.workers.dev"
```

4. Commit + push `main` so GitHub Pages picks up the config. The key stays in Cloudflare secrets.

Endpoint: `POST /chat` JSON `{ mode, message, messages, estimate, business }`. Response `{ reply, suggestions?, copy?, source }`. CORS is `*` in the scaffold — tighten to `https://miltonchoto-boop.github.io` when you lock the booking Worker down.

Health check does **not** echo the key. If the key is unset, `/chat` still returns `source: "mock-worker"`.
