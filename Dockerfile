# JNH Masonry Pro Desk — static nginx (v1)
# Later: add OCR API sidecar or multi-stage Node/Python service on /api/ocr
FROM nginx:alpine
COPY index.html app.js styles.css /usr/share/nginx/html/
# Optional: uncomment when adding API reverse-proxy
# COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
