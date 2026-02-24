// api/cancel-subscription.js
// Cancela la suscripción del usuario (al final del período actual)
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { setCORS, handlePreflight } from './_lib/cors.js';
import { getSubscriptionPeriod } from './_lib/stripe-helpers.js';
import { requireAuth } from './_lib/auth.js';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { userId, immediate } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere userId.',
      });
    }

    // Verificar autenticación
    const auth = await requireAuth(req, res, userId);
    if (!auth.authenticated) return;

    // Buscar la suscripción del usuario
    const subDoc = await db.collection('subscriptions').doc(userId).get();

    if (!subDoc.exists || !subDoc.data().stripeSubscriptionId) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró una suscripción activa para este usuario.',
      });
    }

    const { stripeSubscriptionId, status } = subDoc.data();

    if (!['active', 'trialing', 'past_due'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: `La suscripción no se puede cancelar (estado: ${status}).`,
      });
    }

    let updatedSub;

    if (immediate) {
      // Cancelar inmediatamente
      updatedSub = await stripe.subscriptions.cancel(stripeSubscriptionId);
      console.log(`🗑️ Suscripción cancelada inmediatamente: ${stripeSubscriptionId}`);
    } else {
      // Cancelar al final del período de facturación actual
      updatedSub = await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      console.log(`⏳ Suscripción cancelada al final del período: ${stripeSubscriptionId}`);
    }

    // Actualizar Firestore
    await db.collection('subscriptions').doc(userId).set(
      {
        status: immediate ? 'canceled' : updatedSub.status,
        cancelAtPeriodEnd: immediate ? false : true,
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({
      success: true,
      message: immediate
        ? 'Suscripción cancelada inmediatamente.'
        : 'Suscripción se cancelará al final del período de facturación actual.',
      cancelAtPeriodEnd: !immediate,
      currentPeriodEnd: getSubscriptionPeriod(updatedSub).currentPeriodEnd?.toISOString() || null,
    });
  } catch (error) {
    console.error('❌ Error al cancelar suscripción:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al cancelar la suscripción',
      message: error.message,
    });
  }
}
