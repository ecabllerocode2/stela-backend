// api/generate-description.js
// Endpoint para generar descripciones emocionales de productos usando OpenRouter AI

import admin from "firebase-admin";
import { setCORS, handlePreflight } from "./_lib/cors.js";

// --- CONFIGURACIÓN DE FIREBASE ADMIN ---
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

        console.log("✅ Firebase Admin inicializado correctamente.");
    } catch (e) {
        console.error("🚨 Error al inicializar Firebase:", e.message);
        throw e;
    }
}

const db = admin.firestore();

// --- FUNCIÓN PARA LLAMAR A OPENROUTER ---
async function generateDescriptionWithAI(productData) {
    // Intentar leer la API key con diferentes nombres
    let apiKey = process.env.OPENROUTER_API_KEY || 
                 process.env.OPENROUTER_KEY || 
                 process.env.VITE_OPENROUTER_KEY;

    if (!apiKey) {
        console.error("❌ No se encontró la API key. Variables disponibles:", Object.keys(process.env).filter(k => k.includes('OPEN')));
        throw new Error("OPENROUTER_API_KEY no está configurada en las variables de entorno");
    }

    // Limpiar la key de comillas y espacios
    apiKey = apiKey.trim().replace(/^["']|["']$/g, '');

    console.log("✅ API Key encontrada");
    console.log("   - Longitud:", apiKey.length);
    console.log("   - Primeros 15 caracteres:", apiKey.substring(0, 15) + "...");
    console.log("   - Últimos 5 caracteres:", "..." + apiKey.substring(apiKey.length - 5));

    // Construir contexto del producto
    const productContext = {
        nombre: productData.name,
        categoria: productData.category,
        precio: productData.publicPrice,
        precioOriginal: productData.cost,
        oferta: productData.offerPercentage || 0,
        detalles: productData.shortDetails || '',
        proveedor: productData.supplier,
        variantes: productData.variants?.map(v => ({
            color: v.colorName,
            tallas: v.sizes?.map(s => s.size).join(', ')
        }))
    };

    // Calcular precio con oferta si aplica
    const tieneOferta = productContext.oferta > 0;
    const precioFinal = tieneOferta 
        ? productContext.precio * (1 - productContext.oferta / 100)
        : productContext.precio;

    // Obtener tallas únicas
    const tallasDisponibles = productContext.variantes && productContext.variantes.length > 0 && productContext.variantes[0].tallas
        ? productContext.variantes[0].tallas
        : 'Talla única';

    // Estilos de inicio variados para evitar repetición
    const estilosInicio = [
        "Basándote en los detalles del producto",
        "Conecta emocionalmente con estos detalles",
        "Inspírate en las características",
        "Crea magia con esta información",
        "Enamora con estos detalles"
    ];
    
    const estiloSeleccionado = estilosInicio[Math.floor(Math.random() * estilosInicio.length)];

    // Prompt optimizado para descripciones cortas, emocionales y MUY variadas
    const prompt = `Eres un experto en copywriting emocional para tiendas en línea. Crea UNA SOLA descripción de producto persuasiva y atractiva.

INFORMACIÓN DEL PRODUCTO:
Nombre: ${productContext.nombre}
Categoría: ${productContext.categoria}
${productContext.detalles ? `Detalles: ${productContext.detalles}` : ''}
Precio: $${productContext.precio.toFixed(2)}
${tieneOferta ? `OFERTA ESPECIAL: ${productContext.oferta}% de descuento = $${precioFinal.toFixed(2)}` : ''}
Tallas disponibles: ${tallasDisponibles}
${productContext.variantes && productContext.variantes.length > 0 ? `Colores: ${productContext.variantes.map(v => v.color).join(', ')}` : ''}

INSTRUCCIONES IMPORTANTES:
1. Genera SOLO UNA descripción (no opciones ni variantes)
2. Máximo 80-100 palabras (corta y fácil de leer). Si necesitas un poco más de palabras para que la descripción no quede cortada, está bien. Prioriza que sea completa y natural.
3. Sé persuasiva pero natural y linda
4. Usa un tono cercano y emocional (tutea al cliente)
5. Menciona los detalles clave del producto de forma atractiva
6. Si hay oferta, destácala con entusiasmo
${tieneOferta ? '7. Celebra el descuento de forma emocionante' : ''}
8. Al final incluye: "Revisa todo nuestro catálogo en el primer comentario. 💝"

GENERA SOLO UNA DESCRIPCIÓN, no múltiples opciones. Responde directamente con la descripción, sin preámbulos ni títulos.`;

    try {
        console.log("📡 Enviando request a OpenRouter...");
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://malim-backend.vercel.app",
                "X-Title": "Malim Product Descriptions"
            },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "Eres un experto copywriter para tiendas en línea. Generas SOLO UNA descripción por producto, nunca múltiples opciones. Tus descripciones son cortas, persuasivas y fáciles de leer. Si necesitas un poco más de palabras para que la descripción no quede cortada, está bien. Prioriza que sea completa y natural."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.8,
                max_tokens: 320,
                top_p: 0.9,
                frequency_penalty: 0.3,
                presence_penalty: 0.3
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Error de OpenRouter: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error("Respuesta inválida de OpenRouter");
        }

        return data.choices[0].message.content.trim();

    } catch (error) {
        console.error("Error al llamar a OpenRouter:", error);
        throw error;
    }
}

// --- HANDLER PRINCIPAL ---
export default async function handler(req, res) {
    // Manejo de CORS
    if (req.method === 'OPTIONS') {
        handlePreflight(req, res);
        return;
    }

    setCORS(req, res);

    // Solo permitir POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: "Método no permitido. Use POST." 
        });
    }

    try {
        const { productSku, autoSave = false } = req.body;

        if (!productSku) {
            return res.status(400).json({
                success: false,
                error: "productSku es requerido"
            });
        }

        // Obtener el producto de Firestore
        const productRef = db.collection("productos").doc(productSku);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                success: false,
                error: `Producto con SKU ${productSku} no encontrado`
            });
        }

        const productData = productDoc.data();

        // Generar la descripción con IA
        console.log(`🤖 Generando descripción para: ${productData.name}`);
        const generatedDescription = await generateDescriptionWithAI(productData);

        // Si autoSave es true, actualizar el producto en Firestore
        if (autoSave) {
            await productRef.update({
                longDescription: generatedDescription,
                lastDescriptionUpdate: new Date().toISOString()
            });

            console.log(`✅ Descripción guardada automáticamente para ${productSku}`);

            return res.status(200).json({
                success: true,
                message: "Descripción generada y guardada exitosamente",
                data: {
                    productSku,
                    description: generatedDescription,
                    saved: true
                }
            });
        }

        // Si no es autoSave, solo devolver la descripción para revisión
        return res.status(200).json({
            success: true,
            message: "Descripción generada exitosamente",
            data: {
                productSku,
                productName: productData.name,
                description: generatedDescription,
                saved: false
            }
        });

    } catch (error) {
        console.error("🔴 Error en generate-description:", error);
        
        // Proporcionar más contexto en el error
        let errorMessage = "Error al generar la descripción";
        if (error.message.includes("OpenRouter")) {
            errorMessage = `Error de OpenRouter: ${error.message}`;
        } else if (error.message.includes("Firebase")) {
            errorMessage = `Error de base de datos: ${error.message}`;
        }

        return res.status(500).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
