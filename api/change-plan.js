// api/change-plan.js
// Cambia el plan de suscripción del usuario (Emprendedor ↔ Business)
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

const PLANS = {
  emprendedor: process.env.STRIPE_PRICE_EMPRENDEDOR,
  business: process.env.STRIPE_PRICE_BUSINESS,
};

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { userId, newPlanId } = req.body;

    if (!userId || !newPlanId) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren userId y newPlanId.',
      });
    }

    // Verificar autenticación
    const auth = await requireAuth(req, res, userId);
    if (!auth.authenticated) return;

    if (!PLANS[newPlanId]) {
      return res.status(400).json({
        success: false,
        error: `Plan inválido: ${newPlanId}. Opciones: emprendedor, business.`,
      });
    }

    // Buscar la suscripción del usuario
    const subDoc = await db.collection('subscriptions').doc(userId).get();

    if (!subDoc.exists || !subDoc.data().stripeSubscriptionId) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró una suscripción activa para este usuario.',
      });
    }

    const { stripeSubscriptionId, plan: currentPlan, status } = subDoc.data();

    if (!['active', 'trialing'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: `No se puede cambiar el plan (estado: ${status}).`,
      });
    }

    // Obtener la suscripción actual de Stripe
    const currentSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    if (currentPlan === newPlanId && !currentSub.cancel_at_period_end) {
      return res.status(400).json({
        success: false,
        error: `Ya estás en el plan ${newPlanId}.`,
      });
    }

    // Si es el mismo plan pero tiene cancelación pendiente, solo reactivar
    if (currentPlan === newPlanId && currentSub.cancel_at_period_end) {
      const reactivated = await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      await db.collection('subscriptions').doc(userId).set(
        {
          cancelAtPeriodEnd: false,
          status: reactivated.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`✅ Suscripción reactivada para ${userId}`);

      return res.status(200).json({
        success: true,
        message: 'Suscripción reactivada exitosamente.',
        subscription: {
          plan: currentPlan,
          status: reactivated.status,
          currentPeriodEnd: getSubscriptionPeriod(reactivated).currentPeriodEnd?.toISOString() || null,
        },
      });
    }

    const subscriptionItemId = currentSub.items.data[0]?.id;

    if (!subscriptionItemId) {
      return res.status(500).json({
        success: false,
        error: 'No se encontró el item de suscripción en Stripe.',
      });
    }

    // Actualizar la suscripción con el nuevo precio
    // proration_behavior: 'create_prorations' aplica prorrateo automático
    const updatedSub = await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [
        {
          id: subscriptionItemId,
          price: PLANS[newPlanId],
        },
      ],
      proration_behavior: 'create_prorations',
      // Si tenía cancelación pendiente, reactivar
      cancel_at_period_end: false,
      // Actualizar metadata con el nuevo plan
      metadata: {
        ...currentSub.metadata,
        planId: newPlanId,
      },
    });

    // Actualizar Firestore - subscriptions
    await db.collection('subscriptions').doc(userId).set(
      {
        plan: newPlanId,
        status: updatedSub.status,
        ...getSubscriptionPeriod(updatedSub),
        cancelAtPeriodEnd: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Actualizar flag de tienda activa en el perfil del usuario
    // Solo Business tiene acceso a tienda en línea
    const tiendaActiva = newPlanId === 'business';
    await db.collection('users').doc(userId).set(
      {
        tiendaActiva,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`✅ Plan cambiado para ${userId}: ${currentPlan} → ${newPlanId} (tiendaActiva: ${tiendaActiva})`);
    return res.status(200).json({
      success: true,
      message: `Plan cambiado exitosamente de ${currentPlan} a ${newPlanId}.`,
      subscription: {
        plan: newPlanId,
        status: updatedSub.status,
        currentPeriodEnd: getSubscriptionPeriod(updatedSub).currentPeriodEnd?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('❌ Error al cambiar plan:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al cambiar el plan de suscripción',
      message: error.message,
    });
  }
}
