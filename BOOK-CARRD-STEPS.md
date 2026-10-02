# Carrd steps — Book / Appointment on jnhmas.com

**Do not change** the Alpha design wallpaper, layout theme, or background.  
**Only** add a clear **Book** / **Appointment** link or button that opens the public booker.

## Live public booker URL

```
https://miltonchoto-boop.github.io/jnh-pro-desk/book.html
```

Embed variant (optional — smaller hero for iframe/section embeds):

```
https://miltonchoto-boop.github.io/jnh-pro-desk/book.html?embed=1
```

Jose confirms pending requests at (admin token added after OAuth):

```
https://miltonchoto-boop.github.io/jnh-pro-desk/confirm.html?token=ADMIN_TOKEN
```

## Recommended: Button / link (simplest, keeps Alpha wallpaper)

1. Open [Carrd](https://carrd.co) → site **jnhmas.com** → Edit.
2. Add an **Element** → **Button** (or **Text** link) near Contact / CTA — same style as existing Alpha buttons if possible.
3. Label (paste one):

   - `Book Appointment`
   - or `Request Estimate Appointment`
   - or `Schedule Free Estimate`

4. Link / URL field — paste **exactly**:

   ```
   https://miltonchoto-boop.github.io/jnh-pro-desk/book.html
   ```

5. Open in: **New tab** (recommended) so Carrd Alpha design stays put.
6. Publish / Update site.
7. Smoke-test on phone: tap Book → lands on booker → pick date → copy says **Request appointment — Jose will confirm**.

## Optional: Embed section (only if you want the calendar on-page)

Carrd Embed / HTML element (if your plan supports it):

```html
<iframe
  src="https://miltonchoto-boop.github.io/jnh-pro-desk/book.html?embed=1"
  title="Book JNH Masonry estimate"
  style="width:100%;min-height:720px;border:0;border-radius:12px;background:#0b1524;"
  loading="lazy"
></iframe>
```

Prefer the **button link** over iframe unless Milton asks for on-page calendar — keeps Alpha wallpaper untouched and avoids mobile iframe quirks.

## What not to do

- Do **not** replace or re-upload the Alpha wallpaper / background image.
- Do **not** rebuild the Carrd site around Pro Desk.
- Do **not** point the Book link at Pro Desk `index.html` (internal tool) — only `book.html`.

## After Google OAuth is live

No Carrd change needed. Same URL keeps working; busy slots hide automatically once `booking-config.js` is set to `mode: "api"` and the Worker is deployed.
