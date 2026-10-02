/* Chat advisor config — NO secrets. API key lives only on the Cloudflare Worker. */
(function (global) {
  "use strict";
  global.JNH_CHAT_CONFIG = {
    /* "mock" = demo advice in-browser (default until Worker + OPENAI_API_KEY)
       "api"  = POST to Worker /chat (OpenAI proxied server-side) */
    mode: "mock",
    apiBase: "", // e.g. "https://jnh-booking.YOUR_SUBDOMAIN.workers.dev"
    model: "gpt-4o-mini",
    business: "JNH Masonry Inc.",
    note: "Set mode to \"api\" and apiBase after: wrangler secret put OPENAI_API_KEY && wrangler deploy"
  };
})(typeof window !== "undefined" ? window : this);
