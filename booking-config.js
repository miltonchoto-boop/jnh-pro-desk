/* Public booking config — NO secrets. Point apiBase at the deployed Worker / Apps Script after OAuth. */
(function (global) {
  "use strict";
  global.JNH_BOOKING_CONFIG = {
    /* "local" = localStorage only (current Pages behavior until Worker is live)
       "api"   = use Cloudflare Worker / Apps Script at apiBase */
    mode: "local",
    apiBase: "", // e.g. "https://jnh-booking.YOUR_SUBDOMAIN.workers.dev"
    calendarEmail: "jnhmasonry@gmail.com",
    timezone: "America/New_York",
    /* Admin token is NEVER stored here for production.
       confirm.html accepts ?token=… in the URL (Jose’s phone bookmark).
       Optional local-dev only: leave empty. */
    adminTokenHint: "Pass ?token=ADMIN_TOKEN on confirm.html / Rolodex sync (same Worker secret). OAuth covers Calendar + People (Contacts)."
  };
})(typeof window !== "undefined" ? window : this);
