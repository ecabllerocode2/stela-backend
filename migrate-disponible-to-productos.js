// migrate-disponible-to-productos.js
// Script para migrar datos de la colección "disponible" a "productos"

import admin from "firebase-admin";
import { readFileSync } from 'fs';

// --- CONFIGURACIÓN DE FIREBASE ADMIN ---
if (!admin.apps.length) {
    try {
        // Opción 1: Usar variables de entorno (recomendado para producción)
        const privateKeyString = process.env.FIREBASE_PRIVATE_KEY;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const projectId = process.env.FIREBASE_PROJECT_ID;

        if (privateKeyString && clientEmail && projectId) {
            // Configuración con variables de entorno
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
            // Opción 2: Usar archivo serviceAccountKey.json (para desarrollo local)
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

// --- FUNCIONES AUXILIARES ---

/**
 * Genera un SKU único para el producto
 * Formato: MAL-[CATEGORIA]-[NOMBRE]-[RANDOM]
 */
function generateProductSku(categoria, nombre) {
    // Extraer primeras 3 letras de categoría y nombre (en mayúsculas)
    const catCode = categoria.substring(0, 3).toUpperCase().replace(/\s/g, '');
    const nameCode = nombre.substring(0, 3).toUpperCase().replace(/\s/g, '');
    
    // Generar código aleatorio de 5 caracteres
    const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    return `MAL-${catCode}-${nameCode}-${randomCode}`;
}

/**
 * Genera un SKU único para la variante
 * Formato: MAL-[CATEGORIA]-[NOMBRE]-[INDEX]-[RANDOM]
 */
function generateVariantSku(categoria, nombre, variantIndex) {
    const catCode = categoria.substring(0, 3).toUpperCase().replace(/\s/g, '');
    const nameCode = nombre.substring(0, 3).toUpperCase().replace(/\s/g, '');
    const randomCode = Math.random().toString(36).substring(2, 5).toUpperCase();
    
    return `MAL-${catCode}-${nameCode}-V${variantIndex}-${randomCode}`;
}

/**
 * Normaliza las tallas al formato estándar
 */
function normalizeTallas(tallas) {
    // Si las tallas son números (5, 7, 9, etc.), las mantenemos como están
    // Si son letras (S, M, L), las convertimos a mayúsculas
    return tallas.map(talla => {
        const tallaNorm = talla.toString().trim().toUpperCase();
        return tallaNorm;
    });
}

/**
 * Genera una descripción larga basada en los datos disponibles
 */
function generateLongDescription(prenda, categoria, detalles) {
    return `¡Descubre **${prenda}**! Perfecta para tu día a día, esta prenda de ${categoria} destaca por ${detalles || 'su calidad y comodidad'}.`;
}

/**
 * Convierte un documento de "disponible" al formato de "productos"
 */
function transformDisponibleToProductos(doc) {
    const data = doc.data();
    const docId = doc.id;
    
    console.log(`\n📦 Procesando: ${data.prenda} (ID: ${docId})`);
    
    // Generar SKU del producto
    const productSku = generateProductSku(data.categoria, data.prenda);
    
    // Crear variantes (una por cada imagen)
    const variants = [];
    const fotos = data.fotos || [];
    const tallas = normalizeTallas(data.talla || []);
    
    // Si no hay fotos, crear al menos una variante con color por defecto
    const numVariants = fotos.length > 0 ? fotos.length : 1;
    
    for (let i = 0; i < numVariants; i++) {
        const variantId = Date.now() + i; // ID único basado en timestamp
        const imageUrl = fotos[i] || '';
        
        // Crear array de tallas con stock 0
        const sizes = tallas.map(talla => ({
            size: talla,
            stock: 0,
            isInStock: false
        }));
        
        const variant = {
            id: variantId,
            variantSku: generateVariantSku(data.categoria, data.prenda, i + 1),
            colorName: `Color ${i + 1}`,
            hexColor: '#808080', // Color gris por defecto - cambiar manualmente
            imageUrls: imageUrl ? [imageUrl] : [],
            imageIds: [],
            sizes: sizes
        };
        
        variants.push(variant);
        console.log(`  ✓ Variante ${i + 1} creada con ${sizes.length} tallas`);
    }
    
    // Crear fecha de creación en formato legible
    const now = new Date();
    const creationDate = now.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    
    // Construir el documento final
    const productDoc = {
        // Datos básicos
        name: data.prenda,
        category: data.categoria.toUpperCase(),
        supplier: data.proveedor || 'Sin proveedor',
        
        // Precios
        cost: data.costo || 0,
        publicPrice: data.precio || 0,
        offerPercentage: 0,
        
        // Descripciones
        shortDetails: data.detalles || '',
        longDescription: generateLongDescription(data.prenda, data.categoria, data.detalles),
        
        // SKU y metadata
        productSku: productSku,
        creationDate: creationDate,
        dateAdded: Date.now(),
        publishOnline: true, // Por defecto true, ajustar según necesidad
        
        // Variantes
        variants: variants,
        
        // Campos adicionales para referencia
        _migratedFrom: 'disponible',
        _migrationDate: now.toISOString(),
        _originalDocId: docId,
        _originalFecha: data.fecha || null
    };
    
    return productDoc;
}

// --- FUNCIÓN PRINCIPAL DE MIGRACIÓN ---
async function migrateData() {
    console.log('🚀 Iniciando migración de "disponible" a "productos"...\n');
    
    try {
        // Obtener todos los documentos de "disponible"
        const disponibleSnapshot = await db.collection('disponible').get();
        
        if (disponibleSnapshot.empty) {
            console.log('⚠️  No se encontraron documentos en la colección "disponible"');
            return;
        }
        
        console.log(`📊 Total de documentos encontrados: ${disponibleSnapshot.size}\n`);
        console.log('=' .repeat(60));
        
        let migrados = 0;
        let errores = 0;
        const batch = db.batch(); // Usar batch para operaciones más eficientes
        const batchSize = 500; // Firestore permite máximo 500 operaciones por batch
        let operationsCount = 0;
        let batchesCommitted = 0;
        
        for (const doc of disponibleSnapshot.docs) {
            try {
                // Transformar documento
                const nuevoProducto = transformDisponibleToProductos(doc);
                
                // Agregar al batch
                const docRef = db.collection('productos').doc(nuevoProducto.productSku);
                batch.set(docRef, nuevoProducto);
                operationsCount++;
                
                // Si alcanzamos el límite del batch, commitear y crear uno nuevo
                if (operationsCount >= batchSize) {
                    await batch.commit();
                    batchesCommitted++;
                    console.log(`\n💾 Batch ${batchesCommitted} guardado (${operationsCount} documentos)`);
                    operationsCount = 0;
                }
                
                migrados++;
                console.log(`✅ ${nuevoProducto.name} → ${nuevoProducto.productSku}`);
                
            } catch (error) {
                errores++;
                console.error(`❌ Error procesando documento ${doc.id}:`, error.message);
            }
        }
        
        // Commitear el último batch si hay operaciones pendientes
        if (operationsCount > 0) {
            await batch.commit();
            batchesCommitted++;
            console.log(`\n💾 Último batch guardado (${operationsCount} documentos)`);
        }
        
        // Resumen final
        console.log('\n' + '='.repeat(60));
        console.log('📈 RESUMEN DE MIGRACIÓN');
        console.log('='.repeat(60));
        console.log(`✅ Documentos migrados exitosamente: ${migrados}`);
        console.log(`❌ Documentos con errores: ${errores}`);
        console.log(`📦 Total de batches guardados: ${batchesCommitted}`);
        console.log('='.repeat(60));
        
        if (errores === 0) {
            console.log('\n🎉 ¡Migración completada exitosamente!');
        } else {
            console.log('\n⚠️  Migración completada con algunos errores. Revisa los logs.');
        }
        
    } catch (error) {
        console.error('🚨 Error crítico durante la migración:', error);
        throw error;
    }
}

// --- FUNCIÓN PARA PREVISUALIZAR SIN GUARDAR ---
async function previewMigration(limit = 3) {
    console.log(`🔍 Vista previa de migración (primeros ${limit} documentos)...\n`);
    
    try {
        const disponibleSnapshot = await db.collection('disponible').limit(limit).get();
        
        if (disponibleSnapshot.empty) {
            console.log('⚠️  No se encontraron documentos en la colección "disponible"');
            return;
        }
        
        for (const doc of disponibleSnapshot.docs) {
            const original = doc.data();
            const transformado = transformDisponibleToProductos(doc);
            
            console.log('\n' + '='.repeat(60));
            console.log('DOCUMENTO ORIGINAL:');
            console.log(JSON.stringify(original, null, 2));
            console.log('\n' + '-'.repeat(60));
            console.log('DOCUMENTO TRANSFORMADO:');
            console.log(JSON.stringify(transformado, null, 2));
            console.log('='.repeat(60));
        }
        
        console.log('\n✅ Vista previa completada');
        
    } catch (error) {
        console.error('🚨 Error en vista previa:', error);
    }
}

// --- EJECUCIÓN ---
const args = process.argv.slice(2);
const mode = args[0] || 'preview';

if (mode === 'migrate') {
    // Ejecutar migración real
    migrateData()
        .then(() => {
            console.log('\n👋 Proceso finalizado');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Error fatal:', error);
            process.exit(1);
        });
} else if (mode === 'preview') {
    // Solo previsualizar sin guardar
    const limit = parseInt(args[1]) || 3;
    previewMigration(limit)
        .then(() => {
            console.log('\n👋 Vista previa finalizada');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Error fatal:', error);
            process.exit(1);
        });
} else {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🔄 Script de Migración: disponible → productos              ║
╚══════════════════════════════════════════════════════════════╝

MODOS DE USO:

1️⃣  Vista previa (sin guardar):
   node migrate-disponible-to-productos.js preview [cantidad]
   
   Ejemplo: node migrate-disponible-to-productos.js preview 5
   
   Por defecto muestra 3 documentos.

2️⃣  Migración real (guarda en Firestore):
   node migrate-disponible-to-productos.js migrate
   
   ⚠️  ADVERTENCIA: Esto creará documentos en la colección "productos"

═══════════════════════════════════════════════════════════════

📋 NOTAS IMPORTANTES:

• Cada imagen en "disponible" generará una variante separada
• Todas las tallas tendrán stock = 0 e isInStock = false
• Los colores por defecto serán #808080 (gris)
• Se generarán SKUs únicos automáticamente
• Los documentos incluirán campos de metadata de migración

═══════════════════════════════════════════════════════════════
`);
    process.exit(0);
}
