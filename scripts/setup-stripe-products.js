// scripts/setup-stripe-products.js
// Script para crear los productos y precios de suscripción en Stripe
// Ejecutar: node scripts/setup-stripe-products.js
//
// Requiere la variable de entorno STRIPE_SECRET_KEY
// Ejemplo: STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-products.js

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('❌ Falta la variable de entorno STRIPE_SECRET_KEY');
  console.error('   Uso: STRIPE_SECRET_KEY=sk_test_xxx node scripts/setup-stripe-products.js');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function setup() {
  console.log('🚀 Configurando productos de suscripción en Stripe...\n');

  // ─── 1. Crear producto "Stela SaaS" ──────────────────────────────
  console.log('📦 Creando producto...');
  const product = await stripe.products.create({
    name: 'Stela - Plataforma de Gestión',
    description: 'Suscripción mensual a la plataforma Stela para gestión de inventario, pedidos y clientes.',
    metadata: {
      app: 'stela',
    },
  });
  console.log(`   ✅ Producto creado: ${product.id}\n`);

  // ─── 2. Crear precio Plan Emprendedor ($250 MXN/mes) ─────────────
  console.log('💰 Creando precio: Plan Emprendedor ($250 MXN/mes)...');
  const priceEmprendedor = await stripe.prices.create({
    product: product.id,
    unit_amount: 250_00, // $250.00 MXN en centavos
    currency: 'mxn',
    recurring: {
      interval: 'month',
    },
    metadata: {
      planId: 'emprendedor',
    },
    nickname: 'Plan Emprendedor',
  });
  console.log(`   ✅ Precio creado: ${priceEmprendedor.id}\n`);

  // ─── 3. Crear precio Plan Business ($499 MXN/mes) ────────────────
  console.log('💰 Creando precio: Plan Business ($499 MXN/mes)...');
  const priceBusiness = await stripe.prices.create({
    product: product.id,
    unit_amount: 499_00, // $499.00 MXN en centavos
    currency: 'mxn',
    recurring: {
      interval: 'month',
    },
    metadata: {
      planId: 'business',
    },
    nickname: 'Plan Business',
  });
  console.log(`   ✅ Precio creado: ${priceBusiness.id}\n`);

  // ─── 4. Resumen ──────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ ¡Configuración completada!');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('Agrega estas variables de entorno a tu proyecto:\n');
  console.log(`STRIPE_PRICE_EMPRENDEDOR=${priceEmprendedor.id}`);
  console.log(`STRIPE_PRICE_BUSINESS=${priceBusiness.id}`);
  console.log('');
  console.log('También necesitas configurar el Customer Portal en el dashboard de Stripe:');
  console.log('https://dashboard.stripe.com/test/settings/billing/portal');
  console.log('');
  console.log('Y configurar el webhook en:');
  console.log('https://dashboard.stripe.com/test/webhooks');
  console.log('URL del webhook: https://tu-dominio.vercel.app/api/stripe-webhook');
  console.log('Eventos a escuchar:');
  console.log('  - checkout.session.completed');
  console.log('  - customer.subscription.created');
  console.log('  - customer.subscription.updated');
  console.log('  - customer.subscription.deleted');
  console.log('  - invoice.payment_succeeded');
  console.log('  - invoice.payment_failed');
  console.log('  - customer.subscription.trial_will_end');
}

setup().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
