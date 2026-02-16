#!/usr/bin/env bash

# Script para verificar la configuración actual de variables en Vercel
# Útil para diagnosticar problemas con el bucket de imágenes

set -e

# Colores para output  
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Verificador de configuración Stela - Backend${NC}"

# Verificar archivos de configuración local
echo -e "\n${YELLOW}📋 Verificando archivos de configuración locales...${NC}"

if [ -f ".env.production" ]; then
    echo -e "${GREEN}✅ .env.production encontrado${NC}"
    echo -e "${BLUE}   Bucket configurado:${NC} $(grep 'R2_BUCKET=' .env.production | cut -d'=' -f2)"
    echo -e "${BLUE}   URL R2 configurada:${NC} $(grep 'R2_DEV_URL=' .env.production | cut -d'=' -f2)"
else
    echo -e "${RED}❌ .env.production no encontrado${NC}"
fi

if [ -f ".env.local" ]; then
    echo -e "${GREEN}✅ .env.local encontrado${NC}"
    echo -e "${BLUE}   Bucket configurado:${NC} $(grep 'R2_BUCKET=' .env.local | cut -d'=' -f2)"
else
    echo -e "${YELLOW}⚠️  .env.local no encontrado (opcional)${NC}"
fi

# Verificar Vercel CLI
echo -e "\n${YELLOW}🔧 Verificando Vercel CLI...${NC}"

if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI no está instalado${NC}"
    echo -e "${YELLOW}   Instalar con: npm i -g vercel${NC}"
    exit 1
fi

# Verificar login
if ! vercel whoami &> /dev/null; then
    echo -e "${RED}❌ No estás logueado en Vercel${NC}"
    echo -e "${YELLOW}   Ejecuta: vercel login${NC}"
    exit 1
fi

WHOAMI=$(vercel whoami 2>/dev/null)
echo -e "${GREEN}✅ Logueado como:${NC} $WHOAMI"

# Verificar variables de entorno en Vercel
echo -e "\n${YELLOW}🌐 Verificando variables en Vercel (production)...${NC}"

ENV_OUTPUT=$(vercel env ls production 2>/dev/null || echo "")

if [[ $ENV_OUTPUT == *"R2_BUCKET"* ]]; then
    echo -e "${GREEN}✅ R2_BUCKET configurado en Vercel${NC}"
else
    echo -e "${RED}❌ R2_BUCKET NO configurado en Vercel${NC}"
fi

if [[ $ENV_OUTPUT == *"R2_ACCOUNT_ID"* ]]; then
    echo -e "${GREEN}✅ R2_ACCOUNT_ID configurado en Vercel${NC}"
else
    echo -e "${RED}❌ R2_ACCOUNT_ID NO configurado en Vercel${NC}"
fi

if [[ $ENV_OUTPUT == *"R2_ACCESS_KEY"* ]]; then
    echo -e "${GREEN}✅ R2_ACCESS_KEY configurado en Vercel${NC}"
else
    echo -e "${RED}❌ R2_ACCESS_KEY NO configurado en Vercel${NC}"
fi

if [[ $ENV_OUTPUT == *"R2_SECRET_KEY"* ]]; then
    echo -e "${GREEN}✅ R2_SECRET_KEY configurado en Vercel${NC}"
else
    echo -e "${RED}❌ R2_SECRET_KEY NO configurado en Vercel${NC}"
fi

if [[ $ENV_OUTPUT == *"R2_DEV_URL"* ]]; then
    echo -e "${GREEN}✅ R2_DEV_URL configurado en Vercel${NC}"
else
    echo -e "${RED}❌ R2_DEV_URL NO configurado en Vercel${NC}"
fi

# Test del endpoint (opcional)
echo -e "\n${YELLOW}🧪 ¿Quieres probar el endpoint de upload? (y/N)${NC}"
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🔗 URL del backend: https://stela-backend.vercel.app${NC}"
    echo -e "${BLUE}📍 Endpoint de test: https://stela-backend.vercel.app/api/testR2${NC}"
    echo -e "\n${YELLOW}Ejecutando test...${NC}"
    
    RESPONSE=$(curl -s "https://stela-backend.vercel.app/api/testR2" 2>/dev/null || echo '{"error":"No response"}')
    echo -e "${BLUE}Respuesta:${NC} $RESPONSE"
fi

echo -e "\n${GREEN}🎯 Diagnóstico completado${NC}"
echo -e "\n${YELLOW}💡 Si las variables no están configuradas en Vercel, ejecuta:${NC}"
echo -e "   ${BLUE}./scripts/setup-vercel-envs-stela.sh${NC}"