#!/usr/bin/env bash

# Script para subir variables de entorno a Vercel mediante Vercel CLI
# Uso:
#   export VERCEL_TOKEN="<your_token>"
#   export VERCEL_PROJECT="<your-vercel-project-name-or-id>"
#   ./scripts/set-vercel-envs.sh production

set -e
if [ -z "$VERCEL_TOKEN" ]; then
  echo "Falta VERCEL_TOKEN. Exporta VERCEL_TOKEN con un token de acceso de Vercel." >&2
  exit 1
fi
if [ -z "$VERCEL_PROJECT" ]; then
  echo "Falta VERCEL_PROJECT. Exporta VERCEL_PROJECT con el nombre o ID del proyecto en Vercel." >&2
  exit 1
fi
ENV=${1:-production}

echo "Añadiendo variables R2 al proyecto $VERCEL_PROJECT en entorno $ENV"

vercel env add R2_ACCOUNT_ID "$R2_ACCOUNT_ID" $ENV --token "$VERCEL_TOKEN" || true
vercel env add R2_ACCESS_KEY "$R2_ACCESS_KEY" $ENV --token "$VERCEL_TOKEN" || true
vercel env add R2_SECRET_KEY "$R2_SECRET_KEY" $ENV --token "$VERCEL_TOKEN" || true
vercel env add R2_BUCKET "$R2_BUCKET" $ENV --token "$VERCEL_TOKEN" || true
vercel env add R2_DEV_URL "$R2_DEV_URL" $ENV --token "$VERCEL_TOKEN" || true

echo "Variables añadidas (si ya existían, es posible que Vercel te pida confirmación)."