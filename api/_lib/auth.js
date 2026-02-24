// api/_lib/auth.js
// Verificación de Firebase ID Token para proteger endpoints
import admin from 'firebase-admin';

/**
 * Verifica el token de Firebase del header Authorization.
 * Retorna el UID del usuario si es válido.
 * Retorna null si no hay token o es inválido.
 */
export async function verifyFirebaseToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) return null;

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    console.error('❌ Token de Firebase inválido:', error.message);
    return null;
  }
}

/**
 * Middleware de autenticación.
 * Verifica que el userId del request coincida con el token.
 * Retorna { authenticated: true, uid } si es válido.
 * Retorna { authenticated: false, response } si falla (ya envió la respuesta).
 */
export async function requireAuth(req, res, requestedUserId) {
  const authenticatedUid = await verifyFirebaseToken(req);

  if (!authenticatedUid) {
    res.status(401).json({
      success: false,
      error: 'No autorizado. Token de autenticación requerido.',
    });
    return { authenticated: false };
  }

  if (authenticatedUid !== requestedUserId) {
    res.status(403).json({
      success: false,
      error: 'No tienes permiso para realizar esta acción.',
    });
    return { authenticated: false };
  }

  return { authenticated: true, uid: authenticatedUid };
}
