# Dashboard image: build the static bundle, serve it with nginx, proxy /api/ to an
# optional API container (docker/nginx.conf). Quality gates run in
# .github/workflows/ci.yml, not here; the image only has to build what the gate checked.
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts: `prepare` only installs the git pre-push hook.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
