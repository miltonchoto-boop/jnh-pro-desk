# Apps Script alternative (optional)

Use this if Milton prefers **no Cloudflare** — Jose’s Google account hosts the API.

1. Create a new Apps Script project while signed in as `jnhmasonry@gmail.com`.
2. Paste `Code.gs`.
3. Project Settings → Script properties → `ADMIN_TOKEN` = random secret.
4. Deploy → Web app → Execute as **Me** → Who has access **Anyone**.
5. In `booking-config.js` set:

```js
mode: "api",
apiBase: "https://script.google.com/macros/s/XXXX/exec"
```

Note: Apps Script web apps use `?path=slots` query style in this scaffold. If you use this path, update `booking-api.js` to append `?path=…` (or switch to the Cloudflare Worker, which uses clean `/slots` paths).

**Recommendation:** Prefer the Cloudflare Worker (`worker/`) for cleaner URLs and CORS; keep Apps Script as a Google-native fallback.
