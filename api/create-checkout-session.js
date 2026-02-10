// api/create-checkout-session.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // Configurar CORS directamente
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); // O especifica tu dominio
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Manejo de preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    const { cliente, direccion, items, subtotal, costoEnvio, total, metadata } = req.body;

    // Validar datos requeridos
    if (!cliente || !direccion || !items || items.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Datos incompletos. Se requiere cliente, dirección e items.' 
      });
    }

    // Validar estructura del cliente
    if (!cliente.email || !cliente.nombre || !cliente.apellido || !cliente.telefono) {
      return res.status(400).json({
        success: false,
        message: 'Datos del cliente incompletos'
      });
    }

    // Validar estructura de la dirección
    if (!direccion.calle || !direccion.numeroExterior || !direccion.colonia || 
        !direccion.ciudad || !direccion.estado || !direccion.codigoPostal) {
      return res.status(400).json({
        success: false,
        message: 'Datos de dirección incompletos'
      });
    }

    // Crear line items para Stripe
    const lineItems = items.map(item => {
      // Validar campos esenciales
      if (!item.productName || !item.size || !item.price || !item.quantity) {
        throw new Error(`Item inválido - faltan campos requeridos: ${JSON.stringify(item)}`);
      }

      // Generar SKU si no existe
      const variantSku = item.variantSku || `${item.productId}-${item.variantId}-${item.size}`;

      return {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: item.productName,
            description: `Color: ${item.colorName || 'Sin color'} | Talla: ${item.size} | SKU: ${variantSku}`,
            images: item.imageUrl ? [item.imageUrl] : [],
          },
          unit_amount: Math.round(item.price * 100), // Convertir a centavos
        },
        quantity: item.quantity,
      };
    });

    // Agregar el costo de envío si aplica
    if (costoEnvio > 0) {
      lineItems.push({
        price_data: {
          currency: 'mxn',
          product_data: {
            name: 'Envío',
            description: 'Costo de envío a domicilio',
          },
          unit_amount: Math.round(costoEnvio * 100),
        },
        quantity: 1,
      });
    }

    // Preparar metadata para el webhook
    const itemsMetadata = items.map(item => ({
      variantSku: item.variantSku || `${item.productId}-${item.variantId}-${item.size}`,
      productId: item.productId,
      variantId: item.variantId,
      size: item.size,
      quantity: item.quantity,
      productName: item.productName
    }));

    // Obtener el origen desde el header o usar el valor por defecto
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'http://localhost:5173';

    // Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      customer_email: cliente.email,
      metadata: {
        // Información del cliente
        customerName: `${cliente.nombre} ${cliente.apellido}`,
        customerPhone: cliente.telefono,
        customerEmail: cliente.email,
        
        // Información de envío
        shippingAddress: `${direccion.calle} ${direccion.numeroExterior}${direccion.numeroInterior ? ' ' + direccion.numeroInterior : ''}, ${direccion.colonia}, ${direccion.ciudad}, ${direccion.estado}, ${direccion.codigoPostal}`,
        shippingReferences: direccion.referencias || '',
        
        // Información de precios
        subtotal: subtotal.toString(),
        shippingCost: costoEnvio.toString(),
        total: total.toString(),
        isFreeShipping: metadata?.envioGratis ? 'true' : 'false',
        
        // Items para descontar del stock (JSON stringificado)
        items: JSON.stringify(itemsMetadata)
      },
    });

    console.log('✅ Sesión de Stripe creada:', session.id);

    // Retornar la URL de la sesión
    return res.status(200).json({ 
      success: true,
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('❌ Error al crear sesión de Stripe:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Error al procesar el pago',
      error: error.message 
    });
  }
}
