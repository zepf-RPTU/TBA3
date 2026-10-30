# Dashboard image: build the static bundle and the wiki (/docs/), serve both with nginx,
# proxy /api/ to an optional API container (docker/nginx.conf). Quality gates run in
# .github/workflows/ci.yml, not here; the image only has to build what the gate checked.
FROM node:24-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts: `prepare` only installs the git pre-push hook.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && node docker/csp-conf.mjs > csp.conf
# Compress the static files once, here, rather than per request (docker/nginx.conf,
# gzip_static): the same types and floor nginx would compress on the fly.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.html' \) \
        -size +1023c -exec gzip -k -9 {} +

FROM nginx:1.30-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/csp.conf /etc/nginx/conf.d/csp.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
