# ── Build do frontend (Vite) ─────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Variáveis do Supabase são embutidas no bundle no build (padrão do Vite).
# No EasyPanel, cadastre-as como variáveis de ambiente do app: elas chegam aqui
# como build args.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . .
RUN test -n "$VITE_SUPABASE_URL" || (echo "FALTOU VITE_SUPABASE_URL (variável de ambiente do app)" && exit 1) \
 && test -n "$VITE_SUPABASE_ANON_KEY" || (echo "FALTOU VITE_SUPABASE_ANON_KEY (variável de ambiente do app)" && exit 1) \
 && npm run build

# ── Servir com nginx ─────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
