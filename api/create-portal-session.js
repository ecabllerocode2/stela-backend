// api/create-portal-session.js
// Crea una sesión del portal de cliente de Stripe para gestionar suscripciones
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

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere userId.',
      });
    }

    // Buscar el Stripe Customer ID del usuario
    const subDoc = await db.collection('subscriptions').doc(userId).get();

    if (!subDoc.exists || !subDoc.data().stripeCustomerId) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró una suscripción para este usuario.',
      });
    }

    const stripeCustomerId = subDoc.data().stripeCustomerId;

    const origin =
      req.headers.origin ||
      req.headers.referer?.replace(/\/$/, '') ||
      'http://localhost:5173';

    // Crear sesión del portal de cliente
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/dashboard`,
    });

    console.log(`✅ Sesión de portal creada para usuario ${userId}`);

    return res.status(200).json({
      success: true,
      url: portalSession.url,
    });
  } catch (error) {
    console.error('❌ Error al crear sesión del portal:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al crear sesión del portal de cliente',
      message: error.message,
    });
  }
}
