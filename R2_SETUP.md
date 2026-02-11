# Cloudflare R2 — Setup para `stela` bucket

Este documento describe cómo configurar Cloudflare R2 para este proyecto y cómo añadir las variables de entorno en Vercel.

Variables necesarias (local y en Vercel):
- R2_ACCOUNT_ID
- R2_ACCESS_KEY
- R2_SECRET_KEY
- R2_BUCKET
- R2_DEV_URL (ej: https://<account>.r2.dev)

Pasos locales (desarrollo):
1. Crea un archivo `.env.local` en la raíz de `stela-backend` con las variables anteriores (no lo comites).
2. Prueba con: `node api/testR2.js` o llama a `GET /api/testR2` si el servidor está en marcha.

Añadir en Vercel (recomendado):
1. Crea un token en Vercel (https://vercel.com/account/tokens).
2. Exporta `VERCEL_TOKEN` y `VERCEL_PROJECT` localmente o en tu CI.
3. Ejecuta: `./scripts/set-vercel-envs.sh production` (o `preview`).

Notas:
- Las claves y secretos **no** deben subirse al repositorio.
- `R2_DEV_URL` se usa para construir las URLs públicas devueltas al frontend.
- Si usas un dominio propio o CDN, ponlo como `R2_DEV_URL` o configura `R2_PUBLIC_URL`.
