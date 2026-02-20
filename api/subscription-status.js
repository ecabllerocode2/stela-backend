// api/subscription-status.js
// Consulta el estado de suscripción de un usuario
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { setCORS, handlePreflight } from './_lib/cors.js';
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
  } catch (e) {
    console.error('🚨 Error al inicializar Firebase:', e.message);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(req, res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el parámetro userId.',
      });
    }

    // Si se proporciona sessionId, obtener datos frescos directamente de Stripe
    // (útil cuando el webhook aún no ha procesado el evento)
    const sessionId = req.query.sessionId;
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.subscription && session.metadata?.userId === userId) {
          const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
          const planId =
            session.metadata?.planId ||
            (stripeSub.items.data[0]?.price?.id === process.env.STRIPE_PRICE_EMPRENDEDOR
              ? 'emprendedor'
              : stripeSub.items.data[0]?.price?.id === process.env.STRIPE_PRICE_BUSINESS
              ? 'business'
              : 'unknown');

          const period = getSubscriptionPeriod(stripeSub);
          const freshData = {
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            plan: planId,
            status: stripeSub.status,
            currentPeriodStart: period.currentPeriodStart,
            currentPeriodEnd: period.currentPeriodEnd,
            trialEnd: stripeSub.trial_end
              ? new Date(stripeSub.trial_end * 1000)
              : null,
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          await db.collection('subscriptions').doc(userId).set(freshData, { merge: true });

          console.log(`✅ Suscripción sincronizada via sessionId para ${userId}: ${stripeSub.status}`);

          return res.status(200).json({
            success: true,
            hasSubscription: true,
            isActive: ['active', 'trialing'].includes(stripeSub.status),
            subscription: {
              plan: planId,
              status: stripeSub.status,
              currentPeriodStart: freshData.currentPeriodStart,
              currentPeriodEnd: freshData.currentPeriodEnd,
              trialEnd: freshData.trialEnd,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              hasHadTrial: stripeSub.trial_end ? true : false,
            },
          });
        }
      } catch (sessionErr) {
        console.warn('⚠️ No se pudo obtener sesión de Stripe:', sessionErr.message);
        // Continuamos con el flujo normal
      }
    }

    // Buscar suscripción en Firestore
    const subDoc = await db.collection('subscriptions').doc(userId).get();

    if (!subDoc.exists) {
      return res.status(200).json({
        success: true,
        hasSubscription: false,
        subscription: null,
      });
    }

    const subData = subDoc.data();

    // Si tiene suscripción activa, verificar con Stripe para datos frescos
    if (subData.stripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(subData.status)) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(subData.stripeSubscriptionId);

        // Actualizar Firestore con datos frescos si cambió el status
        if (stripeSub.status !== subData.status) {
          const period2 = getSubscriptionPeriod(stripeSub);
          await db.collection('subscriptions').doc(userId).set(
            {
              status: stripeSub.status,
              currentPeriodStart: period2.currentPeriodStart,
              currentPeriodEnd: period2.currentPeriodEnd,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          subData.status = stripeSub.status;
          subData.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
        }
      } catch (stripeErr) {
        console.warn('⚠️ No se pudo verificar con Stripe:', stripeErr.message);
        // Continuamos con los datos de Firestore
      }
    }

    // Determinar si el acceso está activo
    const isActive = ['active', 'trialing'].includes(subData.status);

    return res.status(200).json({
      success: true,
      hasSubscription: true,
      isActive,
      subscription: {
        plan: subData.plan || null,
        status: subData.status || null,
        currentPeriodStart: subData.currentPeriodStart || null,
        currentPeriodEnd: subData.currentPeriodEnd || null,
        trialEnd: subData.trialEnd || null,
        cancelAtPeriodEnd: subData.cancelAtPeriodEnd || false,
        hasHadTrial: subData.hasHadTrial || false,
      },
    });
  } catch (error) {
    console.error('❌ Error consultando suscripción:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al consultar el estado de la suscripción',
      message: error.message,
    });
  }
}
