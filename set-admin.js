import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  try {
    // Intentar con variables de entorno primero
    const privateKeyString = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (privateKeyString && clientEmail && projectId) {
      const cleanedPrivateKey = privateKeyString
        .replace(/\\n/g, '\n')
        .replace(/\\\\n/g, '\n');

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: cleanedPrivateKey,
        })
      });
      console.log("✅ Firebase inicializado con variables de entorno");
    } else {
      // Fallback: buscar archivos de credenciales en rutas comunes
      const possiblePaths = [
        './serviceAccountKey.json',
        './service-account-key.json',
        './scripts/service-account-key.json',
        './scripts/firebase-admin-key.json',
        './service-account-key.json'
      ];

      let serviceAccount = null;
      for (const p of possiblePaths) {
        try {
          const content = readFileSync(p, 'utf8');
          serviceAccount = JSON.parse(content);
          console.log(`✅ Usando credenciales desde ${p}`);
          break;
        } catch (e) {
          // Ignorar si el archivo no existe o no puede parsearse
        }
      }

      if (!serviceAccount) {
        console.error('❌ No se encontró ningún archivo de credenciales (buscando: ' + possiblePaths.join(', ') + ').');
        throw new Error('No se encontró credenciales de Firebase Admin');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || undefined
      });
      console.log("✅ Firebase inicializado con archivo de service account");
    }
  } catch (e) {
    console.error("🚨 Error al inicializar Firebase:", e.message);
    process.exit(1);
  }
}

// ⚠️ REEMPLAZA ESTO con tu UID de usuario de la Intranet
// Puedes encontrar el UID en Firebase Console > Authentication > Users
const uid = '2wJxEXYGtlSRtUKaea8QOE4GM7V2';

async function grantAdminRole(userUid) {
  try {
    // Establecer Custom Claims para el usuario
    await admin.auth().setCustomUserClaims(userUid, { admin: true });
    console.log(`✅ Éxito: El usuario ${userUid} ahora tiene permisos de admin.`);
    console.log('ℹ️  El usuario debe cerrar sesión y volver a iniciar para que los cambios surtan efecto.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al asignar permisos:', error);
    process.exit(1);
  }
}

grantAdminRole(uid);