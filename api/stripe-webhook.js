// api/stripe-webhook.js
import Stripe from 'stripe';
import admin from "firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
    try {
        const privateKeyString = process.env.FIREBASE_PRIVATE_KEY;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const projectId = process.env.FIREBASE_PROJECT_ID;

        if (!privateKeyString || !clientEmail || !projectId) {
            throw new Error("Faltan variables de entorno de Firebase esenciales.");
        }

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

        console.log("✅ Firebase Admin inicializado en webhook.");
    } catch (e) {
        console.error("🚨 Error al inicializar Firebase:", e.message);
        throw e;
    }
}

const db = admin.firestore();

// Configuración especial para Vercel: desactivar el bodyParser
export const config = {
  api: {
    bodyParser: false,
  },
};

// Función auxiliar para leer el buffer del body
async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Función para descontar el stock
async function updateStock(items) {
  console.log('📦 Iniciando actualización de stock para', items.length, 'items');
  
  const results = {
    success: [],
    errors: [],
    warnings: []
  };

  for (const item of items) {
    try {
      const { variantSku, productId, size, quantity, productName } = item;
      
      console.log(`🔍 Procesando: ${productName}`);
      console.log(`   ProductId: ${productId}, VariantSku: ${variantSku}, Talla: ${size}, Cantidad: ${quantity}`);

      // Si tenemos productId, buscar directamente por ID
      let productDoc = null;
      let productData = null;

      if (productId) {
        console.log(`   Buscando producto por ID: ${productId}`);
        const docRef = db.collection('productos').doc(productId);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
          productDoc = docSnap;
          productData = docSnap.data();
          console.log(`   ✓ Producto encontrado por ID`);
        } else {
          console.log(`   ⚠️ Producto no encontrado por ID, buscando manualmente...`);
        }
      }

      // Si no encontramos por ID, buscar manualmente en todos los productos
      if (!productData) {
        console.log('   🔍 Buscando en todos los productos por variantSku...');
        const allProductsSnapshot = await db.collection('productos').get();
        
        let found = false;
        for (const doc of allProductsSnapshot.docs) {
          const data = doc.data();
          if (data.variants && Array.isArray(data.variants)) {
            // Buscar en las variantes -> sizes -> variantSku
            for (const variant of data.variants) {
              if (variant.sizes && Array.isArray(variant.sizes)) {
                const foundSize = variant.sizes.find(s => s.variantSku === variantSku);
                if (foundSize) {
                  productDoc = doc;
                  productData = data;
                  found = true;
                  console.log(`   ✓ Producto encontrado: ${doc.id}`);
                  break;
                }
              }
            }
            if (found) break;
          }
        }

        if (!productData) {
          const error = `Producto con variantSku ${variantSku} no encontrado`;
          console.error('❌', error);
          results.errors.push({ item, error });
          continue;
        }
      }

      // Buscar la variante y talla usando variantId y size
      let variantIndex = -1;
      let sizeIndex = -1;
      let found = false;

      const { variantId } = item;
      
      console.log(`   🔍 Buscando: variantId=${variantId}, size="${size}"`);

      // Primero buscar por variantId (más confiable)
      if (variantId) {
        for (let i = 0; i < productData.variants.length; i++) {
          const variant = productData.variants[i];
          // El variantId puede ser string o number
          if (variant.id == variantId) {
            console.log(`   ✓ Variante encontrada en variant[${i}] (id: ${variant.id})`);
            
            // Ahora buscar la talla dentro de esta variante
            if (variant.sizes && Array.isArray(variant.sizes)) {
              for (let j = 0; j < variant.sizes.length; j++) {
                const sizeObj = variant.sizes[j];
                if (sizeObj.size === size) {
                  variantIndex = i;
                  sizeIndex = j;
                  found = true;
                  console.log(`   ✓ Talla encontrada en sizes[${j}] (stock actual: ${sizeObj.stock})`);
                  break;
                }
              }
            }
            break;
          }
        }
      }

      // Si no encontramos por variantId, buscar solo por talla en la primera variante
      if (!found && productData.variants.length > 0) {
        console.log(`   ⚠️ No se encontró por variantId, buscando solo por talla...`);
        for (let i = 0; i < productData.variants.length; i++) {
          const variant = productData.variants[i];
          if (variant.sizes && Array.isArray(variant.sizes)) {
            for (let j = 0; j < variant.sizes.length; j++) {
              const sizeObj = variant.sizes[j];
              if (sizeObj.size === size) {
                variantIndex = i;
                sizeIndex = j;
                found = true;
                console.log(`   ✓ Talla encontrada en variant[${i}].sizes[${j}]`);
                break;
              }
            }
            if (found) break;
          }
        }
      }

      if (!found) {
        const error = `Talla "${size}" no encontrada en el producto (variantId: ${variantId})`;
        console.error('❌', error);
        results.errors.push({ item, error });
        continue;
      }

      // Obtener el stock actual
      const currentSize = productData.variants[variantIndex].sizes[sizeIndex];
      const currentStock = currentSize.stock || 0;
      const newStock = Math.max(0, currentStock - quantity);

      // Advertencia si no hay suficiente stock
      if (currentStock < quantity) {
        results.warnings.push({
          productName,
          variantSku,
          size,
          message: `Stock insuficiente: disponible=${currentStock}, solicitado=${quantity}`
        });
      }

      console.log(`   📉 Stock: ${currentStock} → ${newStock}`);

      // IMPORTANTE: Para evitar perder campos, clonar toda la estructura y modificar solo lo necesario
      const updatedVariants = JSON.parse(JSON.stringify(productData.variants));
      
      // Actualizar solo los campos de stock e isInStock
      updatedVariants[variantIndex].sizes[sizeIndex].stock = Number(newStock);
      updatedVariants[variantIndex].sizes[sizeIndex].isInStock = newStock > 0;
      
      // Actualizar el array completo de variantes (esto preserva todos los campos)
      await productDoc.ref.update({
        variants: updatedVariants
      });
      
      console.log(`   💾 Stock actualizado: ${currentStock} → ${newStock}, isInStock: ${newStock > 0}`);

      results.success.push({
        productName,
        variantSku,
        size,
        oldStock: currentStock,
        newStock,
        quantity
      });

      console.log(`   ✅ Stock actualizado correctamente`);

    } catch (error) {
      console.error(`❌ Error actualizando stock para ${item.productName}:`, error);
      results.errors.push({ item, error: error.message });
    }
  }

  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  // Verificar que exista el webhook secret
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('⚠️ STRIPE_WEBHOOK_SECRET no configurado');
    return res.status(500).json({ 
      error: 'Webhook secret no configurado',
      message: 'Configura STRIPE_WEBHOOK_SECRET en las variables de entorno'
    });
  }

  let event;

  try {
    // Obtener el body raw y la firma
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      console.error('❌ No se encontró la firma de Stripe');
      return res.status(400).json({ error: 'No stripe-signature header' });
    }

    // Verificar la firma del webhook
    try {
      event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
      console.log('✅ Firma del webhook verificada correctamente');
    } catch (err) {
      console.error(`❌ Error verificando firma del webhook:`, err.message);
      return res.status(400).json({ 
        error: 'Webhook signature verification failed',
        message: err.message 
      });
    }

  } catch (err) {
    console.error('❌ Error procesando el webhook:', err);
    return res.status(400).json({ 
      error: 'Error processing webhook',
      message: err.message 
    });
  }

  // Manejar eventos de Stripe
  console.log('📨 Evento recibido:', event.type);

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      console.log('💳 Pago completado:', session.id);
      console.log('📧 Cliente:', session.customer_email);
      console.log('💰 Total:', session.amount_total / 100, 'MXN');
      
      try {
        // Extraer los items del metadata
        const itemsJson = session.metadata?.items;
        
        if (!itemsJson) {
          console.error('⚠️ No se encontraron items en el metadata de la sesión');
          return res.status(200).json({ 
            received: true,
            warning: 'No items to process'
          });
        }

        const items = JSON.parse(itemsJson);
        console.log('📦 Items a procesar:', items.length);

        // Actualizar el stock
        const stockResults = await updateStock(items);

        console.log('\n📊 Resumen de actualización de stock:');
        console.log(`  ✅ Exitosos: ${stockResults.success.length}`);
        console.log(`  ❌ Errores: ${stockResults.errors.length}`);
        console.log(`  ⚠️ Advertencias: ${stockResults.warnings.length}`);

        // Log detallado
        if (stockResults.errors.length > 0) {
          console.error('\n❌ Errores encontrados:');
          stockResults.errors.forEach(err => {
            console.error(`  - ${err.item.productName}: ${err.error}`);
          });
        }

        if (stockResults.warnings.length > 0) {
          console.warn('\n⚠️ Advertencias:');
          stockResults.warnings.forEach(warn => {
            console.warn(`  - ${warn.productName}: ${warn.message}`);
          });
        }

        // Aquí puedes agregar más lógica:
        // - Guardar el pedido en una colección "pedidos"
        // - Enviar email de confirmación
        // - Notificar al equipo por Slack/Discord/etc
        // - Actualizar dashboard de ventas

        return res.status(200).json({ 
          received: true,
          stockUpdate: {
            success: stockResults.success.length,
            errors: stockResults.errors.length,
            warnings: stockResults.warnings.length
          }
        });

      } catch (error) {
        console.error('❌ Error procesando el checkout:', error);
        // Aún así respondemos 200 para que Stripe no reintente
        return res.status(200).json({ 
          received: true, 
          error: error.message 
        });
      }

    case 'payment_intent.payment_failed':
      const paymentIntent = event.data.object;
      console.log('❌ Pago fallido:', paymentIntent.id);
      console.log('   Razón:', paymentIntent.last_payment_error?.message);
      break;

    default:
      console.log(`ℹ️ Evento no manejado: ${event.type}`);
  }

  // Siempre responder 200 para que Stripe no reintente
  res.json({ received: true });
}
