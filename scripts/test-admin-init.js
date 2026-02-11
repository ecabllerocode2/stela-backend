#!/usr/bin/env node

/**
 * Test script: inicializa Firebase Admin con el service account local y muestra información básica.
 * No realiza cambios en la base de datos ni en usuarios.
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

try {
  const content = readFileSync(new URL('./service-account-key.json', import.meta.url), 'utf8');
  const serviceAccount = JSON.parse(content);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }

  console.log('✅ Firebase Admin inicializado.');
  console.log('Project ID:', admin.app().options.projectId || '(no disponible)');
  console.log('Service Account client_email:', serviceAccount.client_email);
} catch (err) {
  console.error('❌ Error inicializando Firebase Admin:', err.message);
  process.exit(1);
}