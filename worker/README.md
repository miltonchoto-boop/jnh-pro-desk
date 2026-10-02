# JNH Booking + Contacts Worker

Cloudflare Worker for:
- Google Calendar freeBusy + pending estimate holds
- Bidirectional **Rolodex ↔ Gmail Contacts** (People API)

Same OAuth identity: `jnhmass@gmail.com`.

## Secrets (Jose / Milton — do this once)

1. Google Cloud project: enable **Calendar API** + **People API**.
2. Create OAuth client (Desktop or Web); get client id + secret.
3. Obtain a **refresh token** signed in as `jnhmass@gmail.com` with scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/contacts`
4. From this folder:

```bash
npm install
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
npx wrangler secret put ADMIN_TOKEN   # long random string for confirm.html + Rolodex sync
npx wrangler deploy
```

5. Set `booking-config.js` on the Pages site:

```js
mode: "api",
apiBase: "https://jnh-booking.<your-subdomain>.workers.dev"
```

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/slots?from=&to=` | public | Free slots (freeBusy − availability rules) |
| POST | `/book` | public | Create tentative hold + return pending appointment |
| GET | `/pending` | Bearer ADMIN_TOKEN | List pending holds |
| POST | `/confirm` | Bearer ADMIN_TOKEN | Confirm event on calendar |
| POST | `/decline` | Bearer ADMIN_TOKEN | Delete/cancel hold |
| GET | `/contacts` | Bearer ADMIN_TOKEN | List Gmail Contacts (→ Rolodex pull) |
| POST | `/contacts/push` | Bearer ADMIN_TOKEN | Upsert Rolodex contacts to Gmail |
| POST | `/contacts/sync` | Bearer ADMIN_TOKEN | List remote + push local batch |
| GET | `/health` | public | Liveness |

CORS is open in the scaffold — tighten to the GitHub Pages origin after deploy.

## Contacts field mapping

| Rolodex | Google People |
|---------|---------------|
| name | names[0] |
| phone | phoneNumbers[0] |
| email | emailAddresses[0] |
| company | organizations[0].name |
| notes | biographies[0] |
| capabilities[] | userDefined key `jnh_capabilities` |
| area | userDefined key `jnh_area` |
| id | userDefined key `jnh_pro_desk_id` |
| googleContactResourceName | resourceName |
