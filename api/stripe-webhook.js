// api/stripe-webhook.js
// Webhook de Stripe para gestionar suscripciones SaaS
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { getSubscriptionPeriod } from './_lib/stripe-helpers.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
  try {
    const privateKeyString = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!privateKeyString || !clientEmail || !projectId) {
      throw new Error('Faltan variables de entorno de Firebase esenciales.');
    }

    const cleanedPrivateKey = privateKeyString
      .replace(/\\n/g, '\n')
      .replace(/\\\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: cleanedPrivateKey,
      }),
    });

    console.log('✅ Firebase Admin inicializado en webhook.');
  } catch (e) {
    console.error('🚨 Error al inicializar Firebase:', e.message);
    throw e;
  }
}

const db = admin.firestore();

// Desactivar bodyParser para Vercel (necesario para verificar firma)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Leer el body raw como Buffer
async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Mapeo de Price ID → planId
function getPlanIdFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_EMPRENDEDOR) return 'emprendedor';
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business';
  return 'unknown';
}

// ─── Handlers de eventos ────────────────────────────────────────────

async function handleCheckoutCompleted(session) {
  console.log('💳 Checkout de suscripción completado:', session.id);
  console.log('📧 Cliente:', session.customer_email);

  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  if (!userId) {
    console.error('⚠️ No se encontró userId en metadata de la sesión');
    return;
  }

  // Obtener la suscripción de Stripe para más detalles
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  await db.collection('subscriptions').doc(userId).set(
    {
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      plan: planId || getPlanIdFromPriceId(subscription.items.data[0]?.price?.id),
      status: subscription.status, // 'active' o 'trialing'
      ...getSubscriptionPeriod(subscription),
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      hasHadTrial: subscription.trial_end ? true : undefined,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      email: session.customer_email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`✅ Suscripción guardada para usuario ${userId} (plan: ${planId}, status: ${subscription.status})`);
}

async function handleSubscriptionUpdated(subscription) {
  console.log('🔄 Suscripción actualizada:', subscription.id);

  const userId = subscription.metadata?.userId;
  if (!userId) {
    // Buscar por stripeSubscriptionId en Firestore
    const snapshot = await db
      .collection('subscriptions')
      .where('stripeSubscriptionId', '==', subscription.id)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.error('⚠️ No se encontró usuario para la suscripción:', subscription.id);
      return;
    }

    const doc = snapshot.docs[0];
    await updateSubscriptionDoc(doc.id, subscription);
    return;
  }

  await updateSubscriptionDoc(userId, subscription);
}

async function updateSubscriptionDoc(userId, subscription) {
  const planId =
    subscription.metadata?.planId ||
    getPlanIdFromPriceId(subscription.items.data[0]?.price?.id);

  const updateData = {
    stripeSubscriptionId: subscription.id,
    plan: planId,
    status: subscription.status,
    ...getSubscriptionPeriod(subscription),
    trialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Si tiene/tuvo trial, marcarlo
  if (subscription.trial_end) {
    updateData.hasHadTrial = true;
  }

  await db.collection('subscriptions').doc(userId).set(updateData, { merge: true });

  console.log(`✅ Suscripción actualizada para ${userId}: status=${subscription.status}, plan=${planId}`);
}

async function handleSubscriptionDeleted(subscription) {
  console.log('🗑️ Suscripción cancelada/eliminada:', subscription.id);

  const userId = subscription.metadata?.userId;
  let docId = userId;

  if (!docId) {
    const snapshot = await db
      .collection('subscriptions')
      .where('stripeSubscriptionId', '==', subscription.id)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.error('⚠️ No se encontró usuario para suscripción eliminada:', subscription.id);
      return;
    }
    docId = snapshot.docs[0].id;
  }

  await db.collection('subscriptions').doc(docId).set(
    {
      status: 'canceled',
      canceledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`✅ Suscripción marcada como cancelada para usuario ${docId}`);
}

async function handleInvoicePaymentSucceeded(invoice) {
  console.log('💰 Pago de factura exitoso:', invoice.id);

  if (!invoice.subscription) return;

  // Buscar el usuario por stripeCustomerId
  const snapshot = await db
    .collection('subscriptions')
    .where('stripeCustomerId', '==', invoice.customer)
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.warn('⚠️ No se encontró usuario para customer:', invoice.customer);
    return;
  }

  const docId = snapshot.docs[0].id;

  await db.collection('subscriptions').doc(docId).set(
    {
      lastPaymentDate: new Date(invoice.status_transitions?.paid_at * 1000 || Date.now()),
      lastPaymentAmount: invoice.amount_paid / 100,
      lastPaymentCurrency: invoice.currency,
      lastInvoiceId: invoice.id,
      lastInvoiceUrl: invoice.hosted_invoice_url,
      status: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`✅ Pago registrado para usuario ${docId}: $${invoice.amount_paid / 100} ${invoice.currency}`);
}

async function handleInvoicePaymentFailed(invoice) {
  console.log('❌ Pago de factura fallido:', invoice.id);

  if (!invoice.subscription) return;

  const snapshot = await db
    .collection('subscriptions')
    .where('stripeCustomerId', '==', invoice.customer)
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.warn('⚠️ No se encontró usuario para customer:', invoice.customer);
    return;
  }

  const docId = snapshot.docs[0].id;

  await db.collection('subscriptions').doc(docId).set(
    {
      status: 'past_due',
      lastPaymentError: invoice.last_finalization_error?.message || 'Pago fallido',
      lastPaymentAttempt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`⚠️ Pago fallido registrado para usuario ${docId}`);
}

// ─── Handler principal ─────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('⚠️ STRIPE_WEBHOOK_SECRET no configurado');
    return res.status(500).json({
      error: 'Webhook secret no configurado',
    });
  }

  let event;

  try {
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      console.error('❌ No se encontró la firma de Stripe');
      return res.status(400).json({ error: 'No stripe-signature header' });
    }

    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    console.log('✅ Firma del webhook verificada');
  } catch (err) {
    console.error('❌ Error verificando webhook:', err.message);
    return res.status(400).json({
      error: 'Webhook signature verification failed',
      message: err.message,
    });
  }

  console.log('📨 Evento recibido:', event.type);

  try {
    switch (event.type) {
      // ─── Checkout completado (primera suscripción) ───
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          await handleCheckoutCompleted(session);
        }
        break;
      }

      // ─── Suscripción creada o actualizada ───
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      // ─── Suscripción eliminada/cancelada ───
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      // ─── Pago de factura exitoso (renovación mensual) ───
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }

      // ─── Pago de factura fallido ───
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      // ─── Trial terminando pronto (3 días antes) ───
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object;
        console.log(`⏰ Trial terminando pronto para suscripción: ${subscription.id}`);
        // Aquí podrías enviar un email/notificación al usuario
        break;
      }

      default:
        console.log(`ℹ️ Evento no manejado: ${event.type}`);
    }
  } catch (error) {
    console.error(`❌ Error procesando evento ${event.type}:`, error);
    // Responder 200 para que Stripe no reintente
    return res.status(200).json({
      received: true,
      error: error.message,
    });
  }

  res.status(200).json({ received: true });
}
