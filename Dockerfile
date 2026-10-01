# JNH Masonry Pro Desk — static nginx (v1)
# Later: Node/Python sidecar for Stripe Checkout Sessions, webhooks, Refunds API
# Never expose Stripe secret keys in the static frontend
FROM nginx:alpine
COPY index.html app.js styles.css jnh-logo-official-cinematic.png /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
