// api/create-checkout-session.js
// Crea una sesión de Stripe Checkout para suscripción SaaS
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { setCORS, handlePreflight } from './_lib/cors.js';

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

// Mapeo de planes a sus Price IDs de Stripe (configurados vía env vars)
const PLANS = {
  emprendedor: {
    priceId: process.env.STRIPE_PRICE_EMPRENDEDOR,
    name: 'Plan Emprendedor',
    amount: 250_00, // $250 MXN en centavos
  },
  business: {
    priceId: process.env.STRIPE_PRICE_BUSINESS,
    name: 'Plan Business',
    amount: 499_00, // $499 MXN en centavos
  },
};

const TRIAL_DAYS = 15;

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { planId, userId, email, displayName } = req.body;

    // Validaciones
    if (!planId || !userId || !email) {
      return res.status(400).json({
        success: false,
        error: 'Datos incompletos. Se requiere planId, userId y email.',
      });
    }

    const plan = PLANS[planId];
    if (!plan) {
      return res.status(400).json({
        success: false,
        error: `Plan inválido: "${planId}". Opciones: emprendedor, business.`,
      });
    }

    if (!plan.priceId) {
      return res.status(500).json({
        success: false,
        error: `Price ID no configurado para el plan "${planId}". Revisa las variables de entorno.`,
      });
    }

    // Buscar si el usuario ya tiene un Stripe Customer ID guardado
    let stripeCustomerId = null;
    const subDoc = await db.collection('subscriptions').doc(userId).get();

    if (subDoc.exists && subDoc.data().stripeCustomerId) {
      stripeCustomerId = subDoc.data().stripeCustomerId;
      console.log(`♻️ Cliente de Stripe existente: ${stripeCustomerId}`);
    } else {
      // Crear nuevo customer en Stripe
      const customer = await stripe.customers.create({
        email,
        name: displayName || email,
        metadata: {
          firebaseUserId: userId,
        },
      });
      stripeCustomerId = customer.id;
      console.log(`🆕 Nuevo cliente de Stripe creado: ${stripeCustomerId}`);

      // Guardar el customer ID en Firestore
      await db.collection('subscriptions').doc(userId).set(
        {
          stripeCustomerId,
          email,
          displayName: displayName || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Verificar si ya tiene una suscripción REAL de Stripe activa
    // (ignorar trial local creado por el frontend, que no tiene stripeSubscriptionId)
    if (subDoc.exists) {
      const subData = subDoc.data();
      const hasStripeSubscription = !!subData.stripeSubscriptionId;
      if (hasStripeSubscription && ['active', 'trialing'].includes(subData.status)) {
        return res.status(400).json({
          success: false,
          error: 'Ya tienes una suscripción activa. Usa el portal de cliente para cambiar de plan.',
        });
      }
    }

    // Determinar si ofrecer trial (solo si nunca ha tenido uno)
    const hasHadTrial = subDoc.exists && subDoc.data().hasHadTrial === true;

    const origin =
      req.headers.origin ||
      req.headers.referer?.replace(/\/$/, '') ||
      'http://localhost:5173';

    // Configurar la sesión de checkout
    const sessionConfig = {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscription/cancel`,
      metadata: {
        userId,
        planId,
      },
      subscription_data: {
        metadata: {
          userId,
          planId,
        },
      },
      allow_promotion_codes: true,
    };

    // Agregar trial de 15 días solo en plan Business y si nunca ha tenido trial
    if (planId === 'business' && !hasHadTrial) {
      sessionConfig.subscription_data.trial_period_days = TRIAL_DAYS;
      console.log(`🎁 Trial de ${TRIAL_DAYS} días activado para usuario ${userId}`);
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log(`✅ Sesión de checkout creada: ${session.id} (plan: ${planId})`);

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('❌ Error al crear sesión de checkout:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al crear sesión de suscripción',
      message: error.message,
    });
  }
}
