/**
 * Script para Limpiar Campos de Migración
 * 
 * Elimina los campos internos de migración (_migratedFrom, _migrationDate, etc.)
 * de todos los documentos en la colección "productos".
 * 
 * Uso:
 * - Preview: node cleanup-migration-fields.js preview
 * - Ejecutar: node cleanup-migration-fields.js cleanup
 */

import admin from "firebase-admin";
import { readFileSync } from 'fs';

// --- CONFIGURACIÓN DE FIREBASE ADMIN ---
if (!admin.apps.length) {
    try {
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
            console.log("✅ Firebase Admin inicializado con variables de entorno.");
        } else {
            const serviceAccount = JSON.parse(
                readFileSync('./serviceAccountKey.json', 'utf8')
            );
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ Firebase Admin inicializado con serviceAccountKey.json.");
        }
    } catch (e) {
        console.error("🚨 Error al inicializar Firebase:", e.message);
        process.exit(1);
    }
}

const db = admin.firestore();

/**
 * Campos de migración a eliminar
 */
const MIGRATION_FIELDS = [
    '_migratedFrom',
    '_migrationDate',
    '_originalDocId',
    '_originalFecha'
];

/**
 * Vista previa de documentos a limpiar
 */
async function previewCleanup() {
    console.log('🔍 Preview de limpieza de campos de migración...\n');
    
    try {
        const productsSnapshot = await db.collection('productos').get();
        
        if (productsSnapshot.empty) {
            console.log('⚠️  No se encontraron documentos en la colección "productos"');
            return;
        }

        let documentsToClean = 0;
        let totalFieldsToRemove = 0;

        for (const doc of productsSnapshot.docs) {
            const data = doc.data();
            let fieldsToRemove = 0;

            for (const field of MIGRATION_FIELDS) {
                if (field in data) {
                    fieldsToRemove++;
                }
            }

            if (fieldsToRemove > 0) {
                documentsToClean++;
                totalFieldsToRemove += fieldsToRemove;
                console.log(`📦 ${data.name || 'Sin nombre'} (${doc.id})`);
                for (const field of MIGRATION_FIELDS) {
                    if (field in data) {
                        console.log(`   ✓ Eliminar: ${field} = "${data[field]}"`);
                    }
                }
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 Resumen de Preview');
        console.log('='.repeat(60));
        console.log(`📄 Documentos con campos de migración: ${documentsToClean}/${productsSnapshot.size}`);
        console.log(`🗑️  Total de campos a eliminar: ${totalFieldsToRemove}`);
        console.log('='.repeat(60));
        
        if (documentsToClean === 0) {
            console.log('\n✅ No hay campos de migración para limpiar');
        } else {
            console.log('\n💡 Ejecuta: node cleanup-migration-fields.js cleanup');
        }

    } catch (error) {
        console.error('🚨 Error durante preview:', error);
        throw error;
    }
}

/**
 * Ejecuta la limpieza real
 */
async function executeCleanup() {
    console.log('🧹 Limpiando campos de migración...\n');
    
    try {
        const productsSnapshot = await db.collection('productos').get();
        
        if (productsSnapshot.empty) {
            console.log('⚠️  No se encontraron documentos en la colección "productos"');
            return;
        }

        const batch = db.batch();
        let operationsCount = 0;
        let documentsUpdated = 0;
        let batchesCommitted = 0;

        for (const doc of productsSnapshot.docs) {
            const data = doc.data();
            let hasFieldsToRemove = false;
            const updateObj = {};

            for (const field of MIGRATION_FIELDS) {
                if (field in data) {
                    hasFieldsToRemove = true;
                    updateObj[field] = admin.firestore.FieldValue.delete();
                }
            }

            if (hasFieldsToRemove) {
                batch.update(doc.ref, updateObj);
                operationsCount++;
                documentsUpdated++;

                // Si alcanzamos el límite del batch, commitear
                if (operationsCount >= 500) {
                    await batch.commit();
                    batchesCommitted++;
                    console.log(`💾 Batch ${batchesCommitted} guardado (${operationsCount} actualizaciones)`);
                    operationsCount = 0;
                }

                console.log(`✅ Limpiado: ${data.name || 'Sin nombre'} (${doc.id})`);
            }
        }

        // Commitear el último batch
        if (operationsCount > 0) {
            await batch.commit();
            batchesCommitted++;
            console.log(`💾 Último batch guardado (${operationsCount} actualizaciones)`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('📈 RESUMEN DE LIMPIEZA');
        console.log('='.repeat(60));
        console.log(`✅ Documentos actualizados: ${documentsUpdated}`);
        console.log(`📦 Total de batches guardados: ${batchesCommitted}`);
        console.log('='.repeat(60));

        if (documentsUpdated === 0) {
            console.log('\n✅ No había campos de migración para eliminar');
        } else {
            console.log('\n🎉 ¡Limpieza completada exitosamente!');
        }

    } catch (error) {
        console.error('🚨 Error durante limpieza:', error);
        throw error;
    }
}

// --- EJECUCIÓN ---
const args = process.argv.slice(2);
const mode = args[0] || 'preview';

if (mode === 'cleanup') {
    executeCleanup()
        .then(() => {
            console.log('\n👋 Proceso finalizado');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Error fatal:', error);
            process.exit(1);
        });
} else if (mode === 'preview') {
    previewCleanup()
        .then(() => {
            console.log('\n👋 Preview finalizado');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Error fatal:', error);
            process.exit(1);
        });
} else {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🧹 Script de Limpieza: Campos de Migración                  ║
╚══════════════════════════════════════════════════════════════╝

MODOS DE USO:

1️⃣  Vista previa (sin hacer cambios):
   node cleanup-migration-fields.js preview
   
   Muestra qué se eliminará sin hacer nada.

2️⃣  Limpieza real (elimina los campos):
   node cleanup-migration-fields.js cleanup
   
   ⚠️  ADVERTENCIA: Esto eliminará permanentemente los campos
       de migración de todos los documentos.

═══════════════════════════════════════════════════════════════

📋 CAMPOS A ELIMINAR:

• _migratedFrom      → Origen de la migración
• _migrationDate     → Fecha de migración
• _originalDocId     → ID original en colección "disponible"
• _originalFecha     → Fecha original

═══════════════════════════════════════════════════════════════
`);
    process.exit(0);
}
