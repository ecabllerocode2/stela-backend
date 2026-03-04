import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
try {
  const content = readFileSync(new URL('./service-account-key.json', import.meta.url), 'utf8');
  const serviceAccount = JSON.parse(content);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }
} catch (err) {
  console.error('❌ Error inicializando Firebase Admin:', err.message);
  process.exit(1);
}

const db = admin.firestore();
const targetUserId = 'AMGV7yNH8Paw8LExLblWDK2s3gs1';

// Utilities
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(array) {
  return array[randomInt(0, array.length - 1)];
}

const CATEGORIES = [
  'Blusas', 'Pantalones', 'Vestidos', 'Zapatos', 'Accesorios', 
  'Playeras', 'Abrigos', 'Deportivo', 'Trajes de Baño', 'Lencería'
];
const COLORS = [
  { name: 'Rojo', hex: '#FF0000' }, { name: 'Azul', hex: '#0000FF' }, 
  { name: 'Negro', hex: '#000000' }, { name: 'Blanco', hex: '#FFFFFF' }, 
  { name: 'Gris', hex: '#808080' }, { name: 'Verde', hex: '#008000' }
];

const METODOS_PAGO = ['Efectivo', 'Tarjeta de Crédito', 'Transferencia', 'Tarjeta de Débito', 'PayPal'];
const ESTADOS_PEDIDO = ['entregado', 'pendiente', 'en-ruta', 'cancelado', 'preprocesamiento'];

async function clearOldData() {
  console.log('Borrando datos demo antiguos (opcional, pero ayuda a evitar duplicados)');
  const collections = ['productos', 'productos_public', 'clientes', 'proveedores', 'ordenes', 'finanzas'];
  
  for (const coll of collections) {
    const snaps = await db.collection(coll).where('userId', '==', targetUserId).where('isDemo', '==', true).get();
    const batch = db.batch();
    snaps.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    if (snaps.size > 0) {
      await batch.commit();
      console.log(`Borrados ${snaps.size} documentos demo de ${coll}`);
    }
  }
}

async function populateProveedores(count = 5) {
  console.log(`Generando ${count} proveedores...`);
  const providers = [];
  for (let i = 1; i <= count; i++) {
    const docRef = db.collection('proveedores').doc();
    const data = {
      nombre: `Proveedor Demo ${i} - ${randomItem(['Textiles', 'Zapatos', 'Importaciones', 'Moda'])}`,
      contacto: `Contacto ${i}`,
      telefono: `555-100-${String(i).padStart(4, '0')}`,
      email: `proveedor${i}@demo.com`,
      userId: targetUserId,
      isDemo: true,
      fechaCreacion: new Date().toISOString()
    };
    await docRef.set(data);
    providers.push({ id: docRef.id, ...data });
  }
  return providers;
}

async function populateClientes(count = 20) {
  console.log(`Generando ${count} clientes...`);
  const clientes = [];
  const nombres = ['Laura', 'Mónica', 'Carlos', 'Andrea', 'Sofía', 'Daniel', 'Jorge', 'Elena', 'Patricia', 'Fernando', 'Carla', 'Raúl', 'Isabel', 'Lucía', 'Diego'];
  const apellidos = ['Gómez', 'López', 'Martínez', 'Rodríguez', 'Pérez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'García'];
  
  for (let i = 1; i <= count; i++) {
    const docRef = db.collection('clientes').doc();
    const nombreCompleto = `${randomItem(nombres)} ${randomItem(apellidos)} ${randomItem(apellidos)}`;
    const fechaRegistro = randomDate(new Date(2023, 0, 1), new Date()).toISOString();
    
    const data = {
      cliente: nombreCompleto,
      telefono: `555-200-${String(i).padStart(4, '0')}`,
      email: `cliente${i}@demo.com`,
      fechaRegistro: fechaRegistro,
      direccion: `Calle Falsa ${randomInt(100, 999)}, Ciudad Demo`,
      comprasTotales: 0,
      valorTotalCompras: 0,
      userId: targetUserId,
      isDemo: true
    };
    await docRef.set(data);
    clientes.push({ id: docRef.id, ...data });
  }
  return clientes;
}

async function populateProductosYPublic(proveedores, count = 20) {
  console.log(`Generando ${count} productos...`);
  const productos = [];
  const adjetivos = ['Elegante', 'Casual', 'Deportivo', 'Premium', 'Básico', 'Vintage', 'Moderno'];
  
  for (let i = 1; i <= count; i++) {
    const cat = randomItem(CATEGORIES);
    const adj = randomItem(adjetivos);
    const prov = randomItem(proveedores);
    const sku = `PROD-${cat.slice(0, 3).toUpperCase()}-${String(i).padStart(3, '0')}`;
    
    const cost = Math.floor(Math.random() * 400 + 100); // 100 to 500
    const price = Math.floor(cost * (1 + (Math.random() * 0.5 + 0.3))); // 30% to 80% markup

    // Variants (2-3)
    const variants = [];
    const numVariants = randomInt(2, 3);
    const chosenColors = [];
    for(let j=0; j<numVariants; j++) {
      let chosenColor;
      do { chosenColor = randomItem(COLORS); } while (chosenColors.includes(chosenColor.name));
      chosenColors.push(chosenColor.name);

      variants.push({
        id: Date.now() + j,
        colorName: chosenColor.name,
        hexColor: chosenColor.hex,
        imageIds: [],
        imageUrls: [],
        sizes: ['CH', 'M', 'G'].map(size => ({
          isInStock: true,
          size,
          stock: randomInt(0, 15),
          variantSku: `${sku}-${chosenColor.name.slice(0, 3).toUpperCase()}-${size}`
        }))
      });
    }

    const docId = `demo-prod-${i}`;
    const productData = {
      name: `${cat} ${adj} Demo ${i}`,
      category: cat.toLowerCase(),
      cost: cost,
      publicPrice: price,
      productSku: sku,
      supplier: prov.nombre,
      publishOnline: true,
      shortDetails: `Hermosa ${cat.toLowerCase()} ${adj.toLowerCase()} ideal para usar todo el día. (Datos de prueba)`,
      longDescription: `Aquí iría la descripción en formato Markdown para ${cat} ${adj}. Creado como una demostración.`,
      offerPercentage: randomItem([0, 0, 0, 10, 15, 20]),
      creationDate: new Date().toISOString(),
      dateAdded: Date.now(),
      variants: variants,
      userId: targetUserId,
      isDemo: true
    };
    
    // Guardar en productos (Admin)
    await db.collection('productos').doc(docId).set(productData);
    
    // Guardar en productos_public (Shop - sin costo/proveedor)
    const publicData = { ...productData };
    delete publicData.cost;
    delete publicData.supplier;
    await db.collection('productos_public').doc(docId).set(publicData);
    
    productos.push({ id: docId, ...productData });
  }
  return productos;
}

async function populateOrdenesYFinanzas(clientes, productos, count = 25) {
  console.log(`Generando ${count} órdenes e historial financiero...`);
  const ordenes = [];
  
  const now = new Date();
  const past6Months = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

  for (let i = 1; i <= count; i++) {
    const numItems = randomInt(1, 4);
    const orderItems = [];
    let totalVenta = 0;
    let totalCosto = 0;
    
    for (let j = 0; j < numItems; j++) {
      const prod = randomItem(productos);
      const variant = randomItem(prod.variants);
      const sizeObj = randomItem(variant.sizes);
      const qty = randomInt(1, 3);
      const isOffer = prod.offerPercentage > 0;
      const finalPrice = isOffer ? prod.publicPrice * (1 - (prod.offerPercentage/100)) : prod.publicPrice;
      
      orderItems.push({
        id: prod.id,
        nombre: prod.name,
        talla: sizeObj.size,
        color: variant.colorName,
        cantidad: qty,
        precio: finalPrice,
        costoUnitario: prod.cost,
        sku: sizeObj.variantSku,
        origen: 'stock'
      });
      totalVenta += (finalPrice * qty);
      totalCosto += (prod.cost * qty);
    }
    
    const cliente = randomItem(clientes);
    const estado = randomItem(ESTADOS_PEDIDO);
    
    const isEntregado = estado === 'entregado';
    const createDate = randomDate(past6Months, now);
    let deliverDate = null;
    if (isEntregado) {
       deliverDate = new Date(createDate.getTime() + (randomInt(1, 7) * 24 * 60 * 60 * 1000));
    }

    const hasDiscount = Math.random() > 0.8;
    const descMonto = hasDiscount ? (totalVenta * 0.1) : 0;
    const finalSale = totalVenta - descMonto;

    // Simulate Payments
    const isPagadoComplete = isEntregado || Math.random() > 0.5;
    const pagoMonto = isPagadoComplete ? finalSale : Math.floor(finalSale * 0.5); // 50% anticipo si no
    const saldoPendiente = finalSale - pagoMonto;
    
    const metodoElegido = randomItem(METODOS_PAGO);

    const orderData = {
      cliente: { nombre: cliente.cliente, telefono: cliente.telefono, uid: cliente.id },
      totalOriginal: totalVenta,
      descuentoMonto: descMonto,
      totalVenta: finalSale,
      costoTotal: totalCosto,
      montoPagado: pagoMonto,
      saldoPendiente: saldoPendiente,
      estadoPedido: estado,
      fechaCreacion: createDate.toISOString(),
      fechaEntrega: deliverDate ? deliverDate.toISOString() : null,
      entrega: randomItem(['local', 'paqueteria', 'entregador']),
      lugar: 'Lugar de Demo',
      items: orderItems,
      pagos: [
        {
           monto: pagoMonto,
           fecha: createDate.toISOString(),
           metodo: metodoElegido,
           registradoPor: 'Admin Demo'
        }
      ],
      userId: targetUserId,
      isDemo: true
    };
    
    const docRef = db.collection('ordenes').doc();
    await docRef.set(orderData);
    
    // Si hubo pago, registrar en Finanzas
    if (pagoMonto > 0) {
      await db.collection('finanzas').add({
        tipo: 'ingreso',
        categoria: 'pago_orden',
        monto: pagoMonto,
        metodo: metodoElegido,
        fecha: createDate.toISOString().split('T')[0],
        referenciaOrden: docRef.id,
        concepto: `Pago orden demo ${docRef.id}`,
        userId: targetUserId,
        isDemo: true
      });
    }
    
    // Si fue entregado, aumentar métricas del cliente
    if (isEntregado) {
       cliente.comprasTotales += 1;
       cliente.valorTotalCompras += finalSale;
       await db.collection('clientes').doc(cliente.id).update({
         comprasTotales: cliente.comprasTotales,
         valorTotalCompras: cliente.valorTotalCompras
       });
    }

    ordenes.push({ id: docRef.id, ...orderData });
  }
}

async function main() {
  console.log(`🚀 Iniciando generación de datos Demo para el usuario: ${targetUserId}`);
  await clearOldData();
  
  const providers = await populateProveedores(15);
  const clientes = await populateClientes(20);
  const productos = await populateProductosYPublic(providers, 20);
  await populateOrdenesYFinanzas(clientes, productos, 30);
  
  console.log('✅ ¡Generación de datos finalizada exitosamente! Todo ha sido populado.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal detectado:', err);
  process.exit(1);
});
