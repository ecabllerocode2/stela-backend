import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// Config
const TARGET_USER_ID = 'AMGV7yNH8Paw8LExLblWDK2s3gs1';
const DATA_DIR = path.resolve('./scripts/colecciones-muestra');

// Firebase Init
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

// Names helpers
const nombres = ['Ana', 'Maria', 'Laura', 'Carmen', 'Cristina', 'Marta', 'Isabel', 'Sandra', 'Paula', 'Elena', 'Sofia', 'Lucia', 'Daniela', 'Valeria', 'Andrea', 'Fernanda', 'Diana', 'Victoria', 'Camila', 'Alejandra', 'Lorena', 'Monica', 'Patricia', 'Adriana', 'Claudia', 'Beatriz', 'Raquel', 'Silvia', 'Carolina', 'Natalia'];
const apellidos = ['Garcia', 'Martinez', 'Rodriguez', 'Lopez', 'Perez', 'Sanchez', 'Gonzalez', 'Gomez', 'Fernandez', 'Moreno', 'Alvarez', 'Romero', 'Alonso', 'Gutierrez', 'Navarro', 'Torres', 'Dominguez', 'Vazquez', 'Ramos', 'Gil', 'Ramirez', 'Serrano', 'Blanco', 'Suarez', 'Molina', 'Morales', 'Ortega', 'Delgado', 'Castro', 'Ortiz'];
const proveedoresGen = ['Textiles', 'Importaciones', 'Moda', 'Distribuidora', 'Comercializadora', 'Telas', 'Vanguardia', 'Estilo'];
const proveedoresNombres = ['Norte', 'Sur', 'Global', 'Express', 'Elite', 'Premium', 'Star', 'Zenith', 'Nova', 'Plus'];

function getRandomName() {
  const n = nombres[Math.floor(Math.random() * nombres.length)];
  const a1 = apellidos[Math.floor(Math.random() * apellidos.length)];
  const a2 = apellidos[Math.floor(Math.random() * apellidos.length)];
  return `${n} ${a1} ${a2}`;
}

function getRandomProviderName() {
  const t = proveedoresGen[Math.floor(Math.random() * proveedoresGen.length)];
  const n = proveedoresNombres[Math.floor(Math.random() * proveedoresNombres.length)];
  return `${t} ${n} S.A. de C.V.`;
}

// Maps
const provMap = {};
const clienteMap = {};
const productMap = {}; // mapping old SKU to a new valid Product/Variant struct so we remap identically for same products
let validItemsPool = [];

// Clear existing items in user tenant
async function clearAllUserItems() {
  console.log(`🧹 Borrando datos anteriores del usuario ${TARGET_USER_ID} en colecciones seleccionadas...`);
  const collections = ['productos', 'productos_public', 'clientes', 'proveedores', 'ordenes', 'finanzas', 'devoluciones', 'clientes_credito', 'inventory_movements', 'mermas'];
  
  for (const coll of collections) {
    const snaps = await db.collection(coll).where('userId', '==', TARGET_USER_ID).get();
    const batch = db.batch();
    snaps.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    if (snaps.size > 0) {
      await batch.commit();
      console.log(`  Borrados ${snaps.size} de ${coll}`);
    }
  }
}

function loadJson(filename) {
  const p = path.join(DATA_DIR, filename);
  if (existsSync(p)) {
    return JSON.parse(readFileSync(p, 'utf8'));
  }
  return [];
}

async function uploadCollection(collectionName, items) {
  console.log(`⬆️  Subiendo ${items.length} docs a ${collectionName}...`);
  const batchSize = 400;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const batch = db.batch();
    chunk.forEach(item => {
      const docId = item.id;
      delete item.id;
      // Replace Firebase Timestamp stubs with current date if any exist to prevent write failures
      for (const [k, v] of Object.entries(item)) {
        if (v && v._seconds !== undefined && v._nanoseconds !== undefined) {
           item[k] = new Date(v._seconds * 1000);
        }
      }
      batch.set(db.collection(collectionName).doc(docId), item);
    });
    await batch.commit();
  }
}

async function main() {
  await clearAllUserItems();

  const proveedores = loadJson('proveedores.json');
  const clientes = loadJson('clientes.json');
  const clientesCredito = loadJson('clientes_credito.json');
  const productos = loadJson('productos.json');
  const productosPublic = loadJson('productos_public.json');
  const ordenes = loadJson('ordenes.json');
  const devoluciones = loadJson('devoluciones.json');
  const finanzas = loadJson('finanzas.json');
  const invMovements = loadJson('inventory_movements.json');

  // 1. Process Proveedores
  proveedores.forEach(p => {
    if (!provMap[p.proveedor]) {
      provMap[p.proveedor] = getRandomProviderName();
    }
    p.proveedor = provMap[p.proveedor];
    p.nombre = p.proveedor; // Add nombre just in case UI expects it as seen previously
    p.userId = TARGET_USER_ID;
  });

  // 2. Process Clientes
  clientes.forEach(c => {
    if (!clienteMap[c.cliente]) {
      clienteMap[c.cliente] = getRandomName();
    }
    c.cliente = clienteMap[c.cliente];
    // if 'nombre' is missing but expected
    if(!c.nombre) c.nombre = c.cliente;
    c.userId = TARGET_USER_ID;
  });

  // Clientes credito
  clientesCredito.forEach(c => {
    if (clienteMap[c.cliente]) {
      c.cliente = clienteMap[c.cliente];
    }
    c.userId = TARGET_USER_ID;
  });

  // 3. Process Productos and extract pool
  const realSkusSet = new Set();
  
  productos.forEach(p => {
    if (p.supplier && provMap[p.supplier]) {
      p.supplier = provMap[p.supplier];
    } else if (p.supplier) {
       provMap[p.supplier] = getRandomProviderName();
       p.supplier = provMap[p.supplier];
    }
    p.userId = TARGET_USER_ID;
    
    // Fill pool
    if (p.variants && p.variants.length > 0) {
      p.variants.forEach(v => {
        if (v.sizes && v.sizes.length > 0) {
          v.sizes.forEach(s => {
            const skuVal = s.variantSku || `${p.productSku}-${v.colorName}-${s.size}`;
            realSkusSet.add(skuVal);
            realSkusSet.add(p.productSku);
            
            validItemsPool.push({
              productoId: p.productSku || p.id,
              sku: skuVal,
              nombre: p.name,
              categoria: p.category || '',
              color: v.colorName || '',
              talla: s.size || '',
              foto: (v.imageUrls && v.imageUrls.length > 0) ? v.imageUrls[0] : (p.imageUrls?.[0] || ''),
            });
          });
        }
      });
    }
  });

  productosPublic.forEach(p => {
    p.userId = TARGET_USER_ID;
  });
  
  invMovements.forEach(m => {
    m.userId = TARGET_USER_ID;
  });

  // helper to fix items
  const processItem = (item) => {
      // Fix supplier
      if (item.proveedor) {
         if(!provMap[item.proveedor]) provMap[item.proveedor] = getRandomProviderName();
         item.proveedor = provMap[item.proveedor];
      }
      
      const identifier = item.sku || item.productoId;
      // If we know this product really exists, we don't need to spoof it
      if (realSkusSet.has(identifier)) {
         return;
      }
      
      // We need to remap
      if (!productMap[identifier]) {
        // pick random from pool
        const randEl = validItemsPool[Math.floor(Math.random() * validItemsPool.length)];
        if (randEl) productMap[identifier] = randEl;
      }
      
      const mapped = productMap[identifier];
      if (mapped) {
        item.productoId = mapped.productoId;
        item.sku = mapped.sku;
        item.nombre = mapped.nombre;
        item.categoria = mapped.categoria || item.categoria;
        item.color = mapped.color || item.color;
        item.talla = mapped.talla || item.talla;
        item.foto = mapped.foto || item.foto;
        // we leave precio, costo, cantidad untouched!
      }
  };

  // 4. Process Orders
  ordenes.forEach(o => {
    // client name
    if (o.cliente) {
      const gName = typeof o.cliente === 'string' ? o.cliente : o.cliente.nombre;
      if (gName) {
         if (!clienteMap[gName]) clienteMap[gName] = getRandomName();
         const newName = clienteMap[gName];
         if (typeof o.cliente === 'string') o.cliente = newName;
         else {
            o.cliente.nombre = newName;
         }
      }
    }
    
    // items
    if (o.items && Array.isArray(o.items)) {
      o.items.forEach(processItem);
    }
    
    o.userId = TARGET_USER_ID;
  });

  // 5. Process Devoluciones
  devoluciones.forEach(o => {
    if (o.cliente) {
      const gName = typeof o.cliente === 'string' ? o.cliente : o.cliente.nombre;
      if (gName) {
         if (!clienteMap[gName]) clienteMap[gName] = getRandomName();
         const newName = clienteMap[gName];
         if (typeof o.cliente === 'string') o.cliente = newName;
         else {
            o.cliente.nombre = newName;
         }
      }
    }
    if (o.items && Array.isArray(o.items)) {
      o.items.forEach(processItem);
    }
    o.userId = TARGET_USER_ID;
  });

  // 6. Process Finanzas
  finanzas.forEach(f => {
    if (f.cliente && clienteMap[f.cliente]) {
       f.cliente = clienteMap[f.cliente];
    }
    if (f.proveedor && provMap[f.proveedor]) {
       f.proveedor = provMap[f.proveedor];
    }
    f.userId = TARGET_USER_ID;
  });

  // Upload
  if (proveedores.length > 0) await uploadCollection('proveedores', proveedores);
  if (clientes.length > 0) await uploadCollection('clientes', clientes);
  if(clientesCredito.length > 0) await uploadCollection('clientes_credito', clientesCredito);
  if (productos.length > 0) await uploadCollection('productos', productos);
  if (productosPublic.length > 0) await uploadCollection('productos_public', productosPublic);
  if (ordenes.length > 0) await uploadCollection('ordenes', ordenes);
  if (devoluciones.length > 0) await uploadCollection('devoluciones', devoluciones);
  if (finanzas.length > 0) await uploadCollection('finanzas', finanzas);
  if (invMovements.length > 0) await uploadCollection('inventory_movements', invMovements);

  console.log('✅ Carga completa. Verifique los datos en Firestore.');
  process.exit(0);
}

main().catch(console.error);
