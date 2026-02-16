#!/usr/bin/env bash

# Script específico para configurar variables de Stela en Vercel
# Este script carga las variables desde .env.production y las sube a Vercel

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Script de configuración de variables de entorno para Stela en Vercel${NC}"

# Verificar que estamos en el directorio correcto (backend)
if [ ! -f ".env.production" ]; then
    echo -e "${RED}❌ Error: No se encontró el archivo .env.production${NC}"
    echo -e "${RED}   Ejecuta este script desde el directorio stela-backend${NC}"
    exit 1
fi

# Cargar variables desde .env.production
echo -e "${YELLOW}📋 Cargando variables desde .env.production...${NC}"

# Cargar variables una por una para evitar problemas con caracteres especiales
while IFS='=' read -r key value; do
    # Ignorar líneas vacías y comentarios
    [[ -z "$key" || "$key" =~ ^#.* ]] && continue
    
    # Limpiar espacios y exportar
    key=$(echo "$key" | tr -d ' ')
    value=$(echo "$value" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
    
    # Exportar la variable
    export "$key"="$value"
done < .env.production

# Verificar variables críticas de R2
if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY" ] || [ -z "$R2_SECRET_KEY" ] || [ -z "$R2_BUCKET" ]; then
    echo -e "${RED}❌ Error: Variables R2 incompletas en .env.production${NC}"
    echo -e "${RED}   Verifica que R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY y R2_BUCKET estén definidas${NC}"
    exit 1
fi

# Configurar proyecto para Stela
export VERCEL_PROJECT="stela-backend"
ENV=${1:-production}

echo -e "${YELLOW}🔧 Configurando variables para proyecto: $VERCEL_PROJECT (entorno: $ENV)${NC}"

# Verificar si Vercel CLI está instalado
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Error: Vercel CLI no está instalado${NC}"
    echo -e "${YELLOW}   Instalar con: npm i -g vercel${NC}"
    exit 1
fi

# Verificar login en Vercel
if ! vercel whoami &> /dev/null; then
    echo -e "${RED}❌ Error: No estás logueado en Vercel${NC}"
    echo -e "${YELLOW}   Ejecuta: vercel login${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Configurando variables de R2 para bucket: $R2_BUCKET${NC}"

# Configurar variables de R2 (las importantes para el upload)
vercel env add R2_ACCOUNT_ID "$R2_ACCOUNT_ID" $ENV --yes 2>/dev/null || echo "R2_ACCOUNT_ID ya existe"
vercel env add R2_ACCESS_KEY "$R2_ACCESS_KEY" $ENV --yes 2>/dev/null || echo "R2_ACCESS_KEY ya existe"
vercel env add R2_SECRET_KEY "$R2_SECRET_KEY" $ENV --yes 2>/dev/null || echo "R2_SECRET_KEY ya existe"
vercel env add R2_BUCKET "$R2_BUCKET" $ENV --yes 2>/dev/null || echo "R2_BUCKET ya existe"
vercel env add R2_DEV_URL "$R2_DEV_URL" $ENV --yes 2>/dev/null || echo "R2_DEV_URL ya existe"

echo -e "${GREEN}✅ Configurando variables de Firebase Admin${NC}"

# Configurar variables de Firebase
vercel env add FIREBASE_PROJECT_ID "$FIREBASE_PROJECT_ID" $ENV --yes 2>/dev/null || echo "FIREBASE_PROJECT_ID ya existe"
vercel env add FIREBASE_CLIENT_EMAIL "$FIREBASE_CLIENT_EMAIL" $ENV --yes 2>/dev/null || echo "FIREBASE_CLIENT_EMAIL ya existe"
vercel env add FIREBASE_PRIVATE_KEY "$FIREBASE_PRIVATE_KEY" $ENV --yes 2>/dev/null || echo "FIREBASE_PRIVATE_KEY ya existe"

echo -e "${GREEN}🎉 ¡Configuración completada!${NC}"
echo -e "${YELLOW}📝 Resumen de configuración:${NC}"
echo -e "   • Proyecto: $VERCEL_PROJECT"
echo -e "   • Entorno: $ENV"
echo -e "   • Bucket R2: $R2_BUCKET"
echo -e "   • URL R2: $R2_DEV_URL"
echo -e ""
echo -e "${YELLOW}🔄 Próximos pasos:${NC}"
echo -e "   1. Verifica que el proyecto esté desplegado: vercel --prod"
echo -e "   2. Prueba el endpoint de upload desde el frontend"
echo -e ""
echo -e "${GREEN}✨ Las imágenes ahora se subirán al bucket correcto: $R2_BUCKET${NC}"