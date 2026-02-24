// api/asesor-estilo.js
// Endpoint para el asesor de estilo IA "Mia" usando Gemini 2.0 Flash

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

// --- FUNCIÓN PARA VERIFICAR ID TOKEN DE FIREBASE AUTH ---
async function verifyUserAuth(idToken) {
    try {
        if (!idToken) return null;
        
        // Verificar el ID Token con Firebase Admin
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // Obtener datos completos del usuario
        const userRecord = await admin.auth().getUser(decodedToken.uid);
        
        console.log(`✅ Usuario autenticado: ${userRecord.uid} (${userRecord.email})`);
        return {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName || null,
            emailVerified: userRecord.emailVerified,
            metadata: userRecord.metadata,
            providers: userRecord.providerData.map(p => p.providerId)
        };
    } catch (error) {
        console.error('❌ Error al verificar token:', error.message);
        return null;
    }
}

// --- FUNCIÓN PARA VALIDAR DATOS DEL USUARIO ---
function validateUserData(userData) {
    const errors = [];
    
    // Validar nombre (opcional pero si viene debe ser válido)
    if (userData.nombre && userData.nombre.trim().length < 2) {
        errors.push('El nombre debe tener al menos 2 caracteres');
    }
    
    // Validar WhatsApp (10 dígitos, opcional pero si viene debe ser válido)
    if (userData.whatsapp) {
        const whatsappRegex = /^[0-9]{10}$/;
        if (!whatsappRegex.test(userData.whatsapp)) {
            errors.push('WhatsApp debe tener exactamente 10 dígitos');
        }
    }
    
    // Validar email (obligatorio)
    if (!userData.email) {
        errors.push('Email es requerido');
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
            errors.push('Email inválido');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// --- FUNCIÓN PARA CREAR/ACTUALIZAR USUARIO EN COLECCIÓN users_asistant ---
async function saveUserForRemarketing(userAuth, userData = {}) {
    try {
        const userRef = db.collection('users_asistant').doc(userAuth.uid);
        const userDoc = await userRef.get();
        
        // Usar datos enviados por el frontend
        const nombre = userData.nombre || userAuth.displayName || null;
        const whatsapp = userData.whatsapp || null;
        
        const userDataToSave = {
            uid: userAuth.uid,
            email: userAuth.email,
            nombre: nombre,
            whatsapp: whatsapp,
            emailVerified: userAuth.emailVerified,
            providers: userAuth.providers,
            ultimaInteraccion: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: new Date().toISOString(),
            origen: 'asesor_estilo',
            activo: true
        };
        
        if (userDoc.exists) {
            // Actualizar usuario existente
            const updateData = {
                email: userAuth.email,
                emailVerified: userAuth.emailVerified,
                ultimaInteraccion: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: new Date().toISOString(),
                totalInteracciones: admin.firestore.FieldValue.increment(1)
            };
            
            // Solo actualizar nombre y whatsapp si vienen en userData
            if (nombre) updateData.nombre = nombre;
            if (whatsapp) updateData.whatsapp = whatsapp;
            
            await userRef.update(updateData);
            console.log(`✅ Usuario actualizado en users_asistant: ${userAuth.uid}`, { nombre, whatsapp });
        } else {
            // Crear nuevo usuario
            userDataToSave.fechaCreacion = admin.firestore.FieldValue.serverTimestamp();
            userDataToSave.totalInteracciones = 1;
            userDataToSave.conversaciones = [];
            
            await userRef.set(userDataToSave);
            console.log(`✅ Nuevo usuario creado en users_asistant: ${userAuth.uid}`, { nombre, whatsapp });
        }
        
        return userRef.id;
    } catch (error) {
        console.error('❌ Error al guardar usuario en users_asistant:', error);
        throw error;
    }
}

// --- SISTEMA DE MENSAJES DINÁMICOS (SIN LLM) ---
function generarMensajePersonalizado(tipo, contexto = {}) {
    const { nombre, categoria, tallas, esRepregunta, numIntercambios, categoriaCorrecta } = contexto;
    const nombreCariñoso = nombre || seleccionarAleatoriamente(['hermosa', 'linda', 'bonita', 'reina', 'preciosa']);
    
    // Helper para seleccionar aleatoriamente
    function seleccionarAleatoriamente(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    
    switch(tipo) {
        case 'saludo_inicial':
            return seleccionarAleatoriamente([
                `¡Hola ${nombreCariñoso}! 💕 Soy Mia, tu asesora personal de Stela. ¿Qué prenda buscas hoy y qué talla usas? Así te muestro las opciones perfectas para ti`,
                `¡Hola preciosa! Soy Mia 💖 Ayudo a mujeres como tú a encontrar lo que buscas en Stela. Dime: ¿qué tipo de prenda quieres y qué talla eres? (chica, mediana, grande o tu número)`,
                `¡Hola linda! 💝 Soy Mia y estoy aquí para ayudarte a encontrar la prenda perfecta. ¿Qué estás buscando y qué talla usas? Así vamos directas al punto`,
                `Hey ${nombreCariñoso}! 💕 Soy Mia, tu asesora de estilo en Stela. Para mostrarte las mejores opciones necesito saber: ¿qué prenda buscas y qué talla eres?`,
                `¡Hola hermosa! Soy Mia 💖 Estoy aquí para ayudarte. Cuéntame: ¿qué tipo de prenda necesitas hoy y qué talla usas? (puede ser chica, mediana, grande o tu número como 32, 36...)`
            ]);
            
        case 'faltan_ambos':
            return seleccionarAleatoriamente([
                `${nombreCariñoso}, necesito dos cositas para ayudarte mejor: ¿Qué tipo de prenda buscas? (vestido, blusa, pantalón, sudadera...) y ¿qué talla usas? 💕`,
                `Linda, para mostrarte lo mejor que tenemos necesito saber: ¿Qué prenda buscas y qué talla eres? 💝`,
                `${nombreCariñoso}, dime por favor: ¿Qué tipo de prenda quieres? y ¿cuál es tu talla? (chica, mediana, grande o tu número) 💖`,
                `Hermosa, ayúdame con esto: ¿Qué prenda estás buscando? y ¿qué talla usas normalmente? Así te muestro justo lo que necesitas 💕`
            ]);
            
        case 'falta_categoria':
            return seleccionarAleatoriamente([
                `¿Qué tipo de prenda buscas, ${nombreCariñoso}? ¿Un vestido, blusa, pantalón, sudadera, chamarra...? 💕`,
                `Linda, ¿qué estás buscando hoy? ¿Vestido, blusa, pantalón...? Cuéntame para ayudarte mejor 💝`,
                `${nombreCariñoso}, ¿qué tipo de prenda necesitas? Tenemos vestidos, blusas, pantalones, sudaderas... ¡Dime y te ayudo! 💖`,
                `Hermosa, ¿qué prenda tienes en mente? ¿Algo casual, elegante, deportivo? ¿Vestido, blusa...? 💕`
            ]);
            
        case 'falta_talla':
            const categoriaTexto = categoria ? categoria : 'prendas';
            return seleccionarAleatoriamente([
                `¡Perfecto ${nombreCariñoso}! Me encanta${categoria ? ` que busques ${categoria}` : ''}. Ahora dime: ¿Qué talla usas? (chica, mediana, grande, o tu número como 28, 32, 36...) 💕`,
                `¡Genial! ${categoria ? `Tenemos ${categoria} hermosas.` : ''} ¿Qué talla eres, linda? (chica, mediana, grande o tu número) 💝`,
                `¡Excelente elección${categoria ? ` ${nombreCariñoso}, ${categoria} son lo máximo` : ''}! ¿Cuál es tu talla? (puedes decirme chica, mediana, grande o tu número como 32, 36, 40...) 💖`,
                `¡Me encanta! ${categoria ? `Las ${categoria} están increíbles ahorita.` : ''} Dime tu talla para mostrarte las mejores opciones, ${nombreCariñoso} (chica, mediana, grande o número) 💕`,
                `Perfecto linda${categoria ? `, ${categoria} son perfectas` : ''}. Solo necesito saber tu talla: ¿eres chica, mediana, grande? O dime tu número (28, 30, 32...) 💝`
            ]);
            
        case 'pedir_auth':
            return seleccionarAleatoriamente([
                `¡Perfecto ${nombreCariñoso}! 💖 Ya sé exactamente lo que buscas. Para mostrarte nuestros productos exclusivos y que puedas comprar, necesito que inicies sesión con tu correo o Google. ¿Lista para ver las opciones?`,
                `¡Listo linda! 💝 Tengo las opciones perfectas para ti. Solo necesito que inicies sesión rápido (con correo o Google) para mostrarte todo y que puedas comprar. ¿Te parece?`,
                `¡Excelente ${nombreCariñoso}! 💕 Ya tengo todo listo. Para mostrarte los productos y que puedas hacer tu compra, inicia sesión con tu correo o Google. Es rápido y seguro ✨`,
                `¡Genial hermosa! 💖 Tengo justo lo que buscas. Para ver los productos y comprar, necesito que te registres con tu correo o Google. ¿Iniciamos sesión?`
            ]);
            
        case 'no_productos':
            return seleccionarAleatoriamente([
                `Lo siento mucho ${nombreCariñoso} 😔 No encontré productos disponibles que coincidan exactamente con lo que buscas en este momento. Estamos actualizando nuestro inventario constantemente. ¿Te gustaría que te avisara cuando tengamos algo similar? O puedo ayudarte a buscar algo diferente, linda 💝`,
                `Ay ${nombreCariñoso}, disculpa 😔 Justo ahora no tenemos disponible lo que buscas. Pero estamos recibiendo productos nuevos todo el tiempo. ¿Quieres que te avise cuando llegue algo similar? O podemos buscar otra opción juntas 💕`,
                `Lo siento linda 😔 No tengo disponibles esas opciones en este momento. ¿Te gustaría explorar algo diferente? O puedo anotarte para avisarte cuando tengamos lo que buscas 💝`,
                `${nombreCariñoso}, qué pena 😔 No encuentro justo eso ahorita. ¿Quieres que veamos otras opciones similares? O te aviso cuando tengamos exactamente lo que buscas 💖`
            ]);
            
        case 'intro_recomendaciones_1':
            return seleccionarAleatoriamente([
                `¡${nombreCariñoso}, encontré algo PERFECTO para ti! 😍 Mira esta opción que va ideal con lo que buscas:`,
                `¡Linda, esto te va a encantar! 💕 Encontré justo lo que necesitas:`,
                `¡${nombreCariñoso}, tengo LA opción perfecta para ti! ✨ Mira esto:`,
                `¡Hermosa, mira esto! 😍 Es justo lo que estabas buscando:`,
                `¡${nombreCariñoso}, encontré un tesoro para ti! 💎 Esta opción es perfecta:`
            ]);
            
        case 'intro_recomendaciones_2':
            return seleccionarAleatoriamente([
                `¡${nombreCariñoso}, encontré 2 opciones HERMOSAS para ti! 😍 Las dos son perfectas para lo que buscas:`,
                `¡Linda, tengo 2 opciones increíbles! 💕 Ambas van perfecto con tu estilo:`,
                `¡${nombreCariñoso}, mira estas 2 joyas que encontré! ✨ Las dos te van a encantar:`,
                `¡Hermosa, tengo 2 opciones perfectas! 😍 Escoge la que más te guste:`,
                `¡${nombreCariñoso}, mira estas 2 bellezas! 💖 Cualquiera de las dos es ideal para ti:`
            ]);
            
        case 'intro_recomendaciones_3':
            return seleccionarAleatoriamente([
                `¡${nombreCariñoso}, encontré 3 opciones INCREÍBLES para ti! 😍 Las tres son perfectas:`,
                `¡Linda, tengo 3 joyas para ti! 💕 Todas van perfecto con lo que buscas:`,
                `¡${nombreCariñoso}, mira estas 3 bellezas! ✨ Escoge tu favorita:`,
                `¡Hermosa, encontré 3 opciones perfectas! 😍 Las tres te van a encantar:`,
                `¡${nombreCariñoso}, tengo 3 tesoros para ti! 💎 Todas son ideales:`
            ]);
            
        case 'cierre_venta':
            return seleccionarAleatoriamente([
                `\n\n¿Cuál te gustó más, ${nombreCariñoso}? 😍 Haz clic en el enlace para ver detalles y comprar. ¡Están volando! 🔥`,
                `\n\n¿Ya tienes tu favorita, linda? 💕 Da clic para ver más fotos y agregarla a tu carrito. ¡No te quedes sin ella!`,
                `\n\n¿Cuál es la ganadora, ${nombreCariñoso}? ✨ Entra al enlace para ver todas las fotos y comprar. ¡Quedan pocas!`,
                `\n\nHaz clic en tu favorita para ver más detalles y comprar, hermosa 💖 ¡No dejes que se te escape!`,
                `\n\n¿Lista para tu nueva adquisición, ${nombreCariñoso}? 😍 Da clic para ver más y añadirla a tu carrito. ¡Aprovecha!`
            ]);
            
        default:
            return `¡Hola ${nombreCariñoso}! 💕 ¿En qué puedo ayudarte hoy?`;
    }
}

// --- CONFIGURACIÓN DE GEMINI CON ROUND-ROBIN ---
const GEMINI_API_KEYS = [
    "AIzaSyCcgS-dG3tl30ynacPKutpdfxgTr6YOgoQ",
    "AIzaSyBr4atfxH6ACSASUUAXa6g40j7duWPhgLA",
    "AIzaSyB1kpCiFBpQfLoTFxYM90CSOuAyr02-U5E"
];

let currentKeyIndex = 0;

// Función para obtener la siguiente API key mediante round-robin
function getNextApiKey() {
    const apiKey = GEMINI_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
    console.log(`🔑 Usando API key #${currentKeyIndex === 0 ? GEMINI_API_KEYS.length : currentKeyIndex}`);
    return apiKey;
}

// Modelo GRATUITO con mejor balance precio/performance
// gemini-2.5-flash: 100% gratuito, rápido, soporta imágenes y multimodal
const GEMINI_MODEL = "gemini-2.5-flash";

// --- FUNCIÓN HELPER PARA LLAMAR A GEMINI CON RETRY (SIN STREAMING) ---
async function callGemini(messages, systemPrompt, maxTokens = 800) {
    // Convertir mensajes al formato de Gemini UNA VEZ
    const contents = [];
    
    // Agregar el system prompt como primer mensaje del usuario si existe
    if (systemPrompt) {
        contents.push({
            role: "user",
            parts: [{ text: systemPrompt }]
        });
        contents.push({
            role: "model",
            parts: [{ text: "Entendido. Actuaré exactamente como se especifica." }]
        });
    }
    
    // Convertir mensajes del historial
    for (const msg of messages) {
        const role = msg.role === "assistant" ? "model" : "user";
        
        // Manejar contenido que puede ser string o array (con imágenes)
        if (typeof msg.content === 'string') {
            contents.push({
                role: role,
                parts: [{ text: msg.content }]
            });
        } else if (Array.isArray(msg.content)) {
            // Contenido mixto (texto + imagen)
            const parts = [];
            for (const item of msg.content) {
                if (item.type === 'text') {
                    parts.push({ text: item.text });
                } else if (item.type === 'image_url') {
                    // Extraer el base64 de la URL de datos
                    const base64Data = item.image_url.url.split(',')[1];
                    const mimeType = item.image_url.url.match(/data:(image\/\w+);/)[1];
                    parts.push({
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    });
                }
            }
            contents.push({ role: role, parts: parts });
        }
    }
    
    const requestBody = {
        contents: contents,
        generationConfig: {
            temperature: 0.8,
            maxOutputTokens: maxTokens,
            topP: 0.95,
            topK: 40
        },
        safetySettings: [
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_NONE"
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE"
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE"
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE"
            }
        ]
    };
    
    // Intentar con cada API key hasta que una funcione
    let lastError = null;
    
    for (let attempt = 0; attempt < GEMINI_API_KEYS.length; attempt++) {
        const apiKey = getNextApiKey();
        
        try {
            console.log(`🤖 Intento ${attempt + 1}/${GEMINI_API_KEYS.length}: Llamando a Gemini ${GEMINI_MODEL}...`);
            
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(requestBody)
                }
            );
            
            if (!response.ok) {
                const status = response.status;
                const errorText = await response.text();
                console.error(`❌ Error de Gemini con API key #${attempt + 1} (${status}):`, errorText);
                
                lastError = { status, message: errorText };
                
                if (status === 429) {
                    console.log(`⚠️ Rate limit en API key #${attempt + 1}, intentando con la siguiente...`);
                    // Pequeño delay antes de intentar con la siguiente
                    if (attempt < GEMINI_API_KEYS.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    continue; // Intentar con la siguiente API key
                }
                
                // Para otros errores, lanzar inmediatamente
                throw new Error(`Error ${status} de Gemini: ${errorText}`);
            }
            
            // Si llegamos aquí, la respuesta fue exitosa
            console.log(`✅ Conexión exitosa con Gemini usando API key #${attempt + 1}`);
            
            // Procesar respuesta JSON completa (sin streaming)
            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Respuesta de Gemini sin contenido válido');
            }
            
            const fullText = data.candidates[0].content.parts
                .map(part => part.text || '')
                .join('');
            
            console.log(`✅ Respuesta completa de Gemini (${fullText.length} caracteres)`);
            
            return fullText;
            
        } catch (error) {
            console.error(`❌ Error con API key #${attempt + 1}:`, error.message);
            lastError = error;
            
            // Si no es un error de rate limit, no intentar con otras keys
            if (!error.message.includes('429') && !error.message.includes('Rate limit')) {
                throw error;
            }
            
            // Si es el último intento, lanzar el error
            if (attempt === GEMINI_API_KEYS.length - 1) {
                throw new Error(`Todas las API keys de Gemini agotadas. Último error: ${error.message}`);
            }
            
            // Pequeño delay antes del siguiente intento
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    // Si llegamos aquí, todas las API keys fallaron
    throw new Error(`No se pudo obtener respuesta de Gemini después de ${GEMINI_API_KEYS.length} intentos. Último error: ${lastError?.status || lastError?.message || 'desconocido'}`);
}

// --- FUNCIÓN PARA NORMALIZAR TALLAS ---
function normalizeSizes(userSizes) {
    // Mapeo de tallas habladas a rangos de nuestra BD
    const sizeMap = {
        'chica': ['28', '30', '28-30'],
        'ch': ['28', '30', '28-30'],
        'pequeña': ['28', '30', '28-30'],
        'xs': ['28', '30', '28-30'],
        'small': ['28', '30', '28-30'],
        's': ['28', '30', '28-30'],
        
        'mediana': ['32', '34', '32-34', '32-36'],
        'm': ['32', '34', '32-34', '32-36'],
        'medium': ['32', '34', '32-34', '32-36'],
        
        'grande': ['36', '38', '40', '36-38', '38-40'],
        'g': ['36', '38', '40', '36-38', '38-40'],
        'large': ['36', '38', '40', '36-38', '38-40'],
        'l': ['36', '38', '40', '36-38', '38-40'],
        
        'xl': ['42', '42-44'],
        'extra grande': ['42', '42-44'],
        'xg': ['42', '42-44'],
        
        '2xl': ['44', '46'],
        'xxl': ['44', '46'],
        '2xg': ['44', '46']
    };
    
    const normalizedSizes = [];
    
    for (const userSize of userSizes) {
        const lower = userSize.toLowerCase().trim();
        
        // Si es una talla directa (número o rango exacto)
        if (/^\d+(-\d+)?$/.test(lower)) {
            normalizedSizes.push(lower);
        }
        // Si es una talla hablada, expandir
        else if (sizeMap[lower]) {
            normalizedSizes.push(...sizeMap[lower]);
        }
    }
    
    return [...new Set(normalizedSizes)];
}

// --- FUNCIÓN PARA EXTRAER TALLAS DEL MENSAJE ---
function extractSizes(text) {
    const found = [];
    const lower = text.toLowerCase();
    
    // Patrones de tallas exactas: 28, 30, 32-34, etc.
    const exactSizes = lower.match(/\b(\d{2})(-\d{2})?\b/g) || [];
    found.push(...exactSizes);
    
    // Tallas habladas
    const spokenSizes = ['chica', 'ch', 'pequeña', 'xs', 'small', 's',
                         'mediana', 'm', 'medium',
                         'grande', 'g', 'large', 'l',
                         'xl', 'extra grande', 'xg',
                         '2xl', 'xxl', '2xg'];
    
    for (const size of spokenSizes) {
        if (lower.includes(size)) {
            found.push(size);
        }
    }
    
    return found;
}

// --- FUNCIÓN PARA EXTRAER DATOS ESTRUCTURADOS DE LA CONVERSACIÓN ACTUAL ---
function extractUserPreferences(conversationMessages) {
    // Estrategia: Priorizar el ÚLTIMO mensaje del usuario
    // Si el último mensaje tiene una categoría nueva, IGNORAR categorías anteriores
    
    const preferences = {
        ocasiones: [],
        prendas: [],
        colores: [],
        estilos: [],
        tallas: [],
        caracteristicas: []
    };
    
    // Si no hay mensajes, retornar vacío
    if (!conversationMessages || conversationMessages.length === 0) {
        return preferences;
    }
    
    // Obtener el último mensaje del usuario (el más reciente)
    const ultimoMensaje = conversationMessages[conversationMessages.length - 1] || '';
    const ultimoMensajeLower = ultimoMensaje.toLowerCase();
    
    // Obtener TODA la conversación para tallas y detalles
    const allText = conversationMessages.join(' ').toLowerCase();
    
    // Mapeo de ocasiones con variantes y errores comunes
    const ocasionesMap = {
        'trabajo': ['trabajo', 'oficina', 'reunión', 'reunion', 'junta', 'profesional', 'laboral', 'oficna', 'trabjo', 'formal trabajo'],
        'fiesta': ['fiesta', 'party', 'celebración', 'celebracion', 'graduación', 'graduacion', 'antro', 'bar', 'disco', 'discoteca', 'festejo', 'parrandear'],
        'boda': ['boda', 'matrimonio', 'evento formal', 'ceremonia', 'wedding', 'vodas', 'casamiento'],
        'casual': ['casual', 'diario', 'cómodo', 'comodo', 'día a día', 'dia a dia', 'salir', 'paseo', 'andar', 'casul'],
        'elegante': ['elegante', 'formal', 'gala', 'cocktail', 'coctel', 'sofisticado', 'elegane', 'fino', 'elegancia'],
        'playa': ['playa', 'vacaciones', 'verano', 'resort', 'alberca', 'piscina', 'pool', 'beach', 'piscina', 'costa', 'mar'],
        'deportivo': ['gym', 'gimnasio', 'deporte', 'ejercicio', 'correr', 'yoga', 'entrenar', 'fitness', 'sport', 'entrenamiento', 'gym', 'ejercitar'],
        'invierno': ['frío', 'frio', 'invierno', 'abrigar', 'abrigado', 'caliente', 'inbierno', 'abrigada', 'clima frio'],
        'infantil': ['niña', 'nina', 'niño', 'nino', 'bebé', 'bebe', 'infantil', 'pequeño', 'pequeña', 'hija', 'hijo', 'kid', 'kids', 'baby'],
        'casa': ['casa', 'hogar', 'home', 'estar en casa', 'comodo casa', 'cómodo casa', 'loungewear', 'homewear']
    };
    
    // Mapeo completo de prendas con TODAS las variantes (errores comunes, acentos, typos)
    const prendasMap = {
        // Ropa Superior
        'BLUSAS': ['blusa', 'blusas', 'bluza', 'bluca', 'vlusa', 'blosas', 'bluzas', 'blusita', 'blusitas'],
        'PLAYERAS': ['playera', 'playeras', 'camiseta', 'camisetas', 't-shirt', 'tshirt', 'remera', 'remeras', 'playera', 'polera', 'poleras', 'camizeta', 'camieta', 'player', 'playra'],
        'POLOS': ['polo', 'polos', 'plos', 'playera polo', 'camisa polo'],
        'CAMISAS': ['camisa', 'camisas', 'camiza', 'camissa', 'blusa formal', 'kamisa', 'camissa'],
        'TOPS_CORTOS': ['top', 'tops', 'crop', 'cropped', 'top corto', 'tops cortos', 'toop', 'croptop', 'crop top'],
        'BRAS_BRALETTES': ['bra', 'bralette', 'bralettes', 'sujetador', 'sosten', 'sostén', 'brasier', 'brassiere', 'sugetador'],
        'BLUSONES': ['blusón', 'bluson', 'blusones', 'túnica', 'tunica', 'tunicas', 'túnicas', 'bluzon'],
        'CHALECOS': ['chaleco', 'chalecos', 'vest', 'chaleko', 'chaleco', 'vest'],
        
        // Ropa Inferior
        'PANTALONES': ['pantalón', 'pantalon', 'pantalones', 'pants', 'pantalone', 'pant', 'pantalon', 'pantalón casual', 'pantalon formal', 'pantalón', 'pantalón', 'pantalonez', 'pantalon'],
        'PANTS_JOGGERS': ['pants', 'jogger', 'joggers', 'pants deportivos', 'jogers', 'yoggers', 'pans', 'jogger', 'pants deportivo'],
        'SHORTS': ['short', 'shorts', 'bermuda', 'bermudas', 'short', 'sort', 'shot', 'short', 'shots'],
        'FALDAS': ['falda', 'faldas', 'falda', 'skirt', 'falda', 'faladas'],
        'LEGGINGS_MALLONES': ['legging', 'leggings', 'malla', 'mallas', 'mallones', 'leggins', 'leging', 'leggin', 'mallone', 'legings', 'lycra', 'licra', 'legins', 'legin'],
        
        // Ropa Exterior
        'ABRIGOS': ['abrigo', 'abrigos', 'coat', 'abrigo largo', 'avrigo', 'abrigos'],
        'CHAMARRAS': ['chamarra', 'chamarras', 'chaqueta', 'chaquetas', 'jacket', 'chamara', 'chaquetta', 'jaketa', 'chaketa', 'chamarra', 'chmarras'],
        'SUDADERAS': ['sudadera', 'sudaderas', 'hoodie', 'hoody', 'suadera', 'sudera', 'hoddie', 'hudie', 'sudadera con gorro', 'buzo', 'sudader', 'sudadera', 'zuadera', 'suaderas', 'sudadara', 'sudadra'],
        'MAXI_SUDADERAS': ['maxi sudadera', 'sudadera grande', 'sudadera larga', 'oversized hoodie', 'maxi sudader'],
        'SACOS_BLAZERS': ['saco', 'sacos', 'blazer', 'blazers', 'blaser', 'blayzer', 'americana', 'blazer', 'blazzer'],
        'CAPAS_GABARDINAS': ['capa', 'capas', 'gabardina', 'gabardinas', 'gabardina', 'trench', 'kapas'],
        'ENSAMBLES': ['ensamble', 'ensambles', 'cardigan', 'cardigans', 'rebeca', 'cárdigan', 'cardigan', 'kardigan'],
        'SUETERES': ['suéter', 'suéteres', 'sueter', 'sueteres', 'sweater', 'sweaters', 'suetr', 'sweter', 'zueter', 'sueter', 'suéter acolchado', 'pullover', 'jersey', 'sueter', 'sueters', 'sueteres', 'sweters', 'sueteres'],
        
        // Prendas Completas
        'VESTIDOS': ['vestido', 'vestidos', 'vestído', 'bestido', 'vestido', 'dress', 'bvestido', 'vestido', 'besidos', 'vestido'],
        'MAXI_VESTIDOS': ['maxi vestido', 'vestido largo', 'maxivestido', 'vestido maxi', 'maxi dress'],
        'OVEROLES': ['overol', 'overoles', 'overall', 'dungaree', 'overol', 'oberol', 'peto', 'overol'],
        'JUMPSUITS': ['jumpsuit', 'jumpsuits', 'enterizo', 'enterizos', 'enteriso', 'jumsuit', 'jompsuit', 'mono'],
        'BODIES': ['body', 'bodies', 'bodysuit', 'bodys', 'bodi', 'body suit'],
        'PALAZZOS': ['palazzo', 'palazzos', 'palazzo', 'palaso', 'palazzo'],
        
        // Ropa Interior
        'ROPA_INTERIOR': ['ropa interior', 'calzón', 'calzon', 'calzones', 'calzoncillo', 'brasier', 'brassier', 'brasiere', 'interior', 'interiores', 'panty', 'pantys', 'panties'],
        'MEDIAS': ['media', 'medias', 'pantimedia', 'pantimedias', 'calceta', 'calcetas', 'calcetín', 'calcetines', 'calcetin', 'medias veladas', 'medias nylon'],
        'PIJAMAS': ['pijama', 'pijamas', 'pj', 'piyama', 'piyamas', 'pajama', 'pajamas', 'pijama'],
        
        // Deportiva
        'PLAYERAS_DEPORTIVAS': ['playera deportiva', 'top deportivo', 'playera gym', 'playera ejercicio', 'camiseta deportiva', 'sport shirt'],
        'CONJUNTOS_DEPORTIVOS': ['conjunto deportivo', 'set deportivo', 'outfit gym', 'conjunto gym', 'conjunto ejercicio', 'set gym', 'conjunto sport'],
        
        // Calzado
        'TENNIS': ['tenis', 'tennis', 'sneaker', 'sneakers', 'zapatilla', 'zapatillas', 'teniz', 'teni', 'sniker', 'zapatilla deportiva'],
        'BOTAS_BOTINES': ['bota', 'botas', 'botín', 'botines', 'botin', 'votines', 'votín', 'botita', 'botitas', 'ankle boot'],
        'SANDALIAS': ['sandalia', 'sandalias', 'chancla', 'chanclas', 'huarache', 'huaraches', 'chancleta', 'sandal', 'sandal'],
        'TACONES': ['tacón', 'tacon', 'tacones', 'takon', 'stiletto', 'stilettos', 'zapato alto', 'zapatos altos', 'taco', 'tacos', 'heel', 'heels'],
        'PLATAFORMAS': ['plataforma', 'plataformas', 'platforma', 'plataforma'],
        'CALZADO_OTRO': ['zapato', 'zapatos', 'calzado', 'sapato', 'zapato', 'shoe', 'shoes'],
        
        // Accesorios
        'BOLSOS_CARTERAS': ['bolso', 'bolsos', 'bolsa', 'bolsas', 'cartera', 'carteras', 'mochila', 'mochilas', 'handbag', 'bag', 'volsa', 'volso'],
        'JOYERIA': ['joyería', 'joyeria', 'collar', 'collares', 'aretes', 'arete', 'pendientes', 'pulsera', 'pulseras', 'anillo', 'anillos', 'brazalete', 'joya', 'joyas'],
        'CINTURONES': ['cinturón', 'cinturon', 'cinturones', 'cinto', 'cintos', 'belt', 'cinturón'],
        'SOMBREROS_GORROS': ['sombrero', 'sombreros', 'gorro', 'gorros', 'gorra', 'gorras', 'hat', 'cap', 'sombrero', 'goro'],
        'GUANTES': ['guante', 'guantes', 'glove', 'gloves', 'manopla', 'manoplas'],
        'BUFANDAS': ['bufanda', 'bufandas', 'pañuelo', 'pañuelos', 'panuelo', 'panuelos', 'scarf', 'pashmina', 'echarpe'],
        'ACCESORIOS_CABELLO': ['diadema', 'diademas', 'liga', 'ligas', 'accesorio cabello', 'accesorio pelo', 'scrunchie', 'scrunchies', 'hebilla', 'hebillas', 'coleta', 'clip', 'clips'],
        'MAXI_COBIJAS': ['cobija', 'cobijas', 'poncho', 'ponchos', 'manta', 'mantas', 'cobija grande', 'maxi cobija'],
        
        // Infantil
        'NINIA': ['niña', 'nina', 'infantil niña', 'ropa niña', 'girl', 'nena'],
        'NINIO': ['niño', 'nino', 'infantil niño', 'ropa niño', 'boy', 'nene'],
        'UNISEX_INFANTIL': ['unisex', 'infantil', 'niños', 'ninos', 'kids', 'bebé', 'bebe', 'baby'],
        
        // Conjuntos
        'CONJUNTOS_COMPLETOS': ['conjunto', 'conjuntos', 'set', 'outfit completo', 'outfit', 'conjuto', 'outfit', 'look completo', 'conjunto completo']
    };
    
    // Mapeo de colores con TODAS las variantes (errores, acentos, typos)
    const coloresMap = {
        'negro': ['negro', 'black', 'obscuro', 'oscuro', 'negra', 'negros', 'negras', 'blak', 'negrp'],
        'blanco': ['blanco', 'white', 'hueso', 'marfil', 'blanca', 'blancos', 'blancas', 'blanko', 'wite'],
        'rojo': ['rojo', 'red', 'vino', 'guinda', 'roja', 'rojos', 'rojas', 'rogo', 'roj', 'borgoña', 'borgona', 'burgundy'],
        'azul': ['azul', 'blue', 'marino', 'celeste', 'sky', 'azules', 'asul', 'azúl', 'azul marino', 'navy', 'aqua'],
        'verde': ['verde', 'green', 'olivo', 'menta', 'verdes', 'berde', 'verde olivo', 'verde agua', 'militar', 'oliva'],
        'rosa': ['rosa', 'pink', 'rosado', 'fucsia', 'fuchsia', 'rosas', 'rosada', 'roza', 'fucia'],
        'beige': ['beige', 'nude', 'café', 'marrón', 'marron', 'camel', 'arena', 'beig', 'beish', 'kaki', 'khaki', 'caqui', 'tierra'],
        'amarillo': ['amarillo', 'yellow', 'mostaza', 'dorado claro', 'amarilla', 'amarillos', 'amarillas', 'amarilo', 'amarrillo', 'canario', 'limón', 'limon'],
        'morado': ['morado', 'purple', 'violeta', 'lila', 'morada', 'morados', 'moradas', 'purpura', 'púrpura', 'lavanda', 'malva'],
        'gris': ['gris', 'gray', 'grey', 'plata', 'grise', 'grises', 'grís', 'gri', 'silver', 'plateado', 'acero'],
        'naranja': ['naranja', 'orange', 'durazno', 'coral', 'naranjas', 'naranja', 'naraja', 'oranje', 'terracota', 'salmon', 'salmón'],
        'dorado': ['dorado', 'gold', 'oro', 'dorada', 'dorados', 'doradas', 'golden', 'dorado'],
        'plateado': ['plateado', 'plata', 'silver', 'plateada', 'plateados', 'plateadas', 'plate'],
        'multicolor': ['multicolor', 'varios colores', 'estampado', 'print', 'floral', 'rayas', 'cuadros', 'animal print']
    };
    
    // Mapeo de estilos con variantes
    const estilosMap = {
        'casual': ['casual', 'cómodo', 'comodo', 'relajado', 'informal', 'casul', 'relax'],
        'elegante': ['elegante', 'formal', 'sofisticado', 'chic', 'shik', 'elegane', 'fino', 'distinguido'],
        'moderno': ['moderno', 'actual', 'trendy', 'moda', 'moderno', 'contemporáneo', 'contemporaneo', 'fashion'],
        'clásico': ['clásico', 'clasico', 'atemporal', 'básico', 'basico', 'tradicional', 'clasic'],
        'juvenil': ['juvenil', 'fresco', 'joven', 'divertido', 'jovial', 'youth', 'fresh'],
        'sexy': ['sexy', 'sensual', 'atrevido', 'provocativo', 'sexi', 'sexys', 'provocador'],
        'deportivo': ['deportivo', 'sport', 'activo', 'fitness', 'deportiba', 'sporty', 'atlético', 'atletico']
    };
    
    // Extraer ocasiones
    for (const [ocasion, keywords] of Object.entries(ocasionesMap)) {
        if (keywords.some(kw => allText.includes(kw))) {
            preferences.ocasiones.push(ocasion);
        }
    }
    
    // 🎯 EXTRAER PRENDAS CON PRIORIDAD AL ÚLTIMO MENSAJE
    // Si el último mensaje menciona una categoría, SOLO usar esa
    let prendasDelUltimoMensaje = [];
    for (const [prenda, keywords] of Object.entries(prendasMap)) {
        if (keywords.some(kw => ultimoMensajeLower.includes(kw))) {
            prendasDelUltimoMensaje.push(prenda);
        }
    }
    
    if (prendasDelUltimoMensaje.length > 0) {
        // El último mensaje tiene categorías → USAR SOLO ESAS (ignorar anteriores)
        preferences.prendas = prendasDelUltimoMensaje;
        console.log('🎯 Categoría detectada en último mensaje:', prendasDelUltimoMensaje);
    } else {
        // El último mensaje NO tiene categorías → buscar en toda la conversación
        for (const [prenda, keywords] of Object.entries(prendasMap)) {
            if (keywords.some(kw => allText.includes(kw))) {
                preferences.prendas.push(prenda);
            }
        }
        console.log('📜 Categorías de toda la conversación:', preferences.prendas);
    }
    
    // Extraer colores
    for (const [color, keywords] of Object.entries(coloresMap)) {
        if (keywords.some(kw => allText.includes(kw))) {
            preferences.colores.push(color);
        }
    }
    
    // Extraer estilos
    for (const [estilo, keywords] of Object.entries(estilosMap)) {
        if (keywords.some(kw => allText.includes(kw))) {
            preferences.estilos.push(estilo);
        }
    }
    
    // Extraer tallas
    const sizesFound = extractSizes(allText);
    if (sizesFound.length > 0) {
        preferences.tallas = normalizeSizes(sizesFound);
    }
    
    console.log('📊 Preferencias extraídas:', preferences);
    return preferences;
}

// --- ALGORITMO PARA CALCULAR SCORE DE COINCIDENCIA ---
function calculateProductScore(product, preferences) {
    let score = 0;
    const factors = [];
    
    // ⚠️ VALIDACIÓN CRÍTICA 1: Si NO hay tallas en preferencias, NO recomendar NADA
    if (!preferences.tallas || preferences.tallas.length === 0) {
        score = -1000;
        factors.push('❌ NO se especificó talla - NO recomendar');
        return { score, factors };
    }
    
    // ⚠️ VALIDACIÓN CRÍTICA 2: Si NO hay categoría en preferencias, NO recomendar NADA
    if (!preferences.prendas || preferences.prendas.length === 0) {
        score = -1000;
        factors.push('❌ NO se especificó categoría - NO recomendar');
        return { score, factors };
    }
    
    // VALIDACIÓN DE CATEGORÍA (CRÍTICO - DEBE SER EXACTA)
    let categoryMatch = false;
    const categoryLower = product.category.toLowerCase();
    const nameLower = product.name.toLowerCase();
    
    console.log(`🔍 Evaluando producto: "${product.name}" (${product.category})`);
    console.log(`   Buscando: ${preferences.prendas.join(', ')}`);
    
    for (const prenda of preferences.prendas) {
        const prendaLower = prenda.toLowerCase();
        
        console.log(`   ¿"${categoryLower}" coincide con "${prendaLower}"?`);
        
        // Coincidencia EXACTA en categoría o nombre
        const exactMatch = categoryLower === prendaLower;
        const categoryContains = categoryLower.includes(prendaLower);
        const nameContains = nameLower.includes(prendaLower);
        const strictMatch = product.category === prenda;
        
        console.log(`      - exactMatch: ${exactMatch}`);
        console.log(`      - categoryContains: ${categoryContains}`);
        console.log(`      - nameContains: ${nameContains}`);
        console.log(`      - strictMatch: ${strictMatch}`);
        
        if (exactMatch || categoryContains || nameContains || strictMatch) {
            score += 100; // Peso más alto para categoría
            factors.push(`✅ Categoría EXACTA: ${prenda}`);
            categoryMatch = true;
            console.log(`      → ✅ COINCIDE!`);
            break;
        }
    }
    
    // Si NO es la categoría solicitada = DESCARTAR COMPLETAMENTE
    if (!categoryMatch) {
        score = -1000;
        factors.push(`❌ NO es la categoría solicitada (${preferences.prendas.join(', ')})`);
        console.log(`   → ❌ NO COINCIDE - score = -1000`);
        return { score, factors };
    }
    console.log(`   → ✅ Producto APROBADO con score actual: ${score}`);
    
    // VALIDACIÓN DE TALLA (CRÍTICO - OBLIGATORIO)
    let tallaMatch = false;
    
    for (const userSize of preferences.tallas) {
        // Verificar si el producto tiene esta talla
        if (product.sizes.some(s => {
            const sLower = s.toLowerCase();
            const userLower = userSize.toLowerCase();
            
            // Coincidencia exacta
            if (sLower === userLower) return true;
            
            // Coincidencia de número dentro de rango
            if (sLower.includes('-')) {
                const [min, max] = sLower.split('-').map(n => parseInt(n));
                const userNum = parseInt(userLower);
                if (!isNaN(userNum) && userNum >= min && userNum <= max) {
                    return true;
                }
            }
            
            // Si el usuario dio un rango, verificar si el producto cae dentro
            if (userLower.includes('-')) {
                const [userMin, userMax] = userLower.split('-').map(n => parseInt(n));
                const productNum = parseInt(sLower);
                if (!isNaN(productNum) && productNum >= userMin && productNum <= userMax) {
                    return true;
                }
            }
            
            return false;
        })) {
            tallaMatch = true;
            break;
        }
    }
    
    // Si NO tiene la talla = DESCARTAR COMPLETAMENTE
    if (!tallaMatch) {
        score = -1000;
        factors.push(`❌ No tiene tallas solicitadas (${preferences.tallas.join(', ')})`);
        return { score, factors };
    } else {
        score += 100; // Bonus por tener talla correcta
        factors.push('✅ Talla disponible');
    }
    
    // Bonificaciones secundarias (solo si ya pasó las validaciones críticas)
    
    // Coincidencia de colores (peso: 15 puntos)
    if (preferences.colores.length > 0 && product.colors.length > 0) {
        for (const colorPref of preferences.colores) {
            if (product.colors.some(c => c.toLowerCase().includes(colorPref))) {
                score += 15;
                factors.push(`Color coincide: ${colorPref}`);
                break;
            }
        }
    }
    
    // Bonus por productos en oferta (peso: 5 puntos)
    if (product.offer > 0) {
        score += 5;
        factors.push(`En oferta: ${product.offer}%`);
    }
    
    return { score, factors };
}

// --- FUNCIÓN PARA OBTENER LAS MEJORES RECOMENDACIONES (1-3 productos) ---
function getTopRecommendations(catalog, preferences) {
    console.log('🎯 Buscando recomendaciones en', catalog.length, 'productos');
    console.log('📊 Preferencias del usuario:', JSON.stringify(preferences, null, 2));
    
    if (catalog.length === 0) {
        console.log('⚠️ Catálogo vacío');
        return [];
    }
    
    // Validar que tenga categoría Y talla ANTES de calcular scores
    if (!preferences.prendas || preferences.prendas.length === 0) {
        console.error('❌ ERROR CRÍTICO: No hay categoría en preferencias');
        return [];
    }
    
    if (!preferences.tallas || preferences.tallas.length === 0) {
        console.error('❌ ERROR CRÍTICO: No hay tallas en preferencias');
        return [];
    }
    
    // Calcular score para cada producto
    const productsWithScore = catalog.map(product => {
        const { score, factors } = calculateProductScore(product, preferences);
        return { ...product, score, factors };
    });
    
    // Ordenar por score descendente
    productsWithScore.sort((a, b) => b.score - a.score);
    
    // Filtrar SOLO productos con score positivo (> 0)
    // Esto elimina productos que no coinciden con lo solicitado
    const relevantProducts = productsWithScore.filter(p => p.score > 0);
    
    console.log(`📈 Productos con score > 0: ${relevantProducts.length}`);
    
    // Si NO hay productos relevantes
    if (relevantProducts.length === 0) {
        console.log('⚠️ No se encontraron productos que coincidan con las preferencias');
        return [];
    }
    
    // Tomar hasta 3 productos con mejor score
    const finalProducts = relevantProducts.slice(0, Math.min(3, relevantProducts.length));
    
    console.log(`🏆 Top ${finalProducts.length} productos seleccionados:`, finalProducts.map(p => ({
        name: p.name,
        sku: p.sku,
        category: p.category,
        score: p.score,
        factors: p.factors
    })));
    
    return finalProducts;
}

// --- FUNCIÓN PARA VALIDAR SI TIENE DATOS OBLIGATORIOS ---
function checkRequiredData(preferences) {
    const missing = [];
    
    // OBLIGATORIO: Categoría/tipo de prenda
    if (!preferences.prendas || preferences.prendas.length === 0) {
        missing.push('categoria');
    }
    
    // OBLIGATORIO: Talla
    if (!preferences.tallas || preferences.tallas.length === 0) {
        missing.push('talla');
    }
    
    return {
        ready: missing.length === 0,
        missing: missing
    };
}

// --- FUNCIÓN PARA OBTENER EL CATÁLOGO DE PRODUCTOS ---
async function fetchProductCatalog() {
    try {
        const productsRef = db.collection('productos_public');
        const snapshot = await productsRef
            .where('publishOnline', '==', true)
            .get();
        
        if (snapshot.empty) {
            console.log('⚠️ No se encontraron productos publicados');
            return [];
        }

        const products = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            products.push({
                name: data.name,
                sku: data.productSku,
                category: data.category,
                price: parseFloat(data.publicPrice) || 0,  // ✅ Convertir a número
                offer: parseFloat(data.offerPercentage) || 0,  // ✅ Convertir a número
                description: data.shortDetails || data.longDescription || '',
                colors: data.variants?.map(v => v.colorName).filter(Boolean) || [],
                sizes: data.variants?.[0]?.sizes?.map(s => s.size).filter(Boolean) || []
            });
        });

        console.log(`✅ Catálogo cargado: ${products.length} productos`);
        return products;
    } catch (error) {
        console.error('❌ Error al cargar catálogo:', error);
        throw error;
    }
}

// --- FUNCIÓN PARA MODO DESCUBRIMIENTO (100% ALGORITMO - SIN LLM) ---
async function generateDiscoveryMessage(userMessage, currentConversation, userName, preferences) {
    console.log('🔍 MODO DESCUBRIMIENTO - Generando mensaje con templates');
    
    // Analizar qué datos faltan
    const validation = checkRequiredData(preferences);
    const faltanAmbos = validation.missing.includes('categoria') && validation.missing.includes('talla');
    const faltaCategoria = validation.missing.includes('categoria');
    const faltaTalla = validation.missing.includes('talla');
    
    console.log('📋 Estado de datos:', { faltanAmbos, faltaCategoria, faltaTalla });
    
    // Determinar el número de intercambios
    const numIntercambios = Math.floor(currentConversation.length / 2);
    
    let mensaje = '';
    
    if (validation.ready) {
        // NO debe estar aquí - pero manejamos el caso
        console.error('⚠️ ERROR: generateDiscoveryMessage llamado con datos completos');
        mensaje = generarMensajePersonalizado('pedir_auth', { nombre: userName });
    } else {
        if (numIntercambios === 0) {
            // Primer mensaje: saludo inicial
            mensaje = generarMensajePersonalizado('saludo_inicial', { nombre: userName });
        } else if (faltanAmbos) {
            // Faltan ambos datos
            mensaje = generarMensajePersonalizado('faltan_ambos', { nombre: userName });
        } else if (faltaCategoria) {
            // Solo falta categoría
            mensaje = generarMensajePersonalizado('falta_categoria', { nombre: userName });
        } else if (faltaTalla) {
            // Solo falta talla (ya tiene categoría)
            const categoria = preferences.prendas && preferences.prendas.length > 0 
                ? preferences.prendas[0] 
                : null;
            mensaje = generarMensajePersonalizado('falta_talla', { 
                nombre: userName,
                categoria: categoria
            });
        }
    }
    
    console.log('✅ Mensaje generado:', mensaje);
    return mensaje;
}


// --- FUNCIÓN PARA MODO RECOMENDACIÓN (ALGORITMO + LLM) ---
async function callMiaRecommendationMode(userMessage, imageBase64, conversationHistory, catalog, userName, currentConversationMessages) {
    console.log('🎯 ENTRANDO A callMiaRecommendationMode');
    console.log('   currentConversationMessages:', currentConversationMessages);
    
    // PASO 1: Extraer preferencias de la conversación ACTUAL (no del historial de Firebase)
    console.log('📊 Extrayendo preferencias de conversación actual:', currentConversationMessages.length, 'mensajes');
    const preferences = extractUserPreferences(currentConversationMessages);
    
    console.log('✅ Preferencias extraídas en callMiaRecommendationMode:', JSON.stringify(preferences, null, 2));
    
    // 🚨 VALIDACIÓN CRÍTICA INMEDIATA: Verificar que tenga categoría Y talla
    const tienePrendas = preferences.prendas && preferences.prendas.length > 0;
    const tieneTallas = preferences.tallas && preferences.tallas.length > 0;
    
    console.log('🚨 VALIDACIÓN INMEDIATA EN callMiaRecommendationMode:');
    console.log('   - Tiene prendas?', tienePrendas, preferences.prendas);
    console.log('   - Tiene tallas?', tieneTallas, preferences.tallas);
    
    if (!tienePrendas) {
        console.error('❌ ERROR CRÍTICO: No se detectó categoría de prenda EN MODO RECOMENDACIÓN');
        return `Lo siento hermosa, no pude identificar qué tipo de prenda buscas. ¿Podrías decirme específicamente? (vestido, blusa, pantalón, sudadera...) 💕`;
    }
    
    if (!tieneTallas) {
        console.error('❌ ERROR CRÍTICO: No se detectó talla EN MODO RECOMENDACIÓN');
        return `Linda, necesito saber tu talla para mostrarte opciones perfectas para ${preferences.prendas.join(', ')}. ¿Eres chica, mediana, grande? O dime tu número (28, 32, 36...) 💝`;
    }
    
    // PASO 2: Algoritmo selecciona los mejores productos (1-3)
    const topProducts = getTopRecommendations(catalog, preferences);
    
    // CASO 0: No hay productos
    if (topProducts.length === 0) {
        return generarMensajePersonalizado('no_productos', { nombre: userName });
    }
    
    // PASO 3: Generar mensaje de recomendación con TEMPLATES (sin LLM)
    const numProductos = topProducts.length;
    let mensaje = '';
    
    // Intro según cantidad de productos
    if (numProductos === 1) {
        mensaje = generarMensajePersonalizado('intro_recomendaciones_1', { nombre: userName });
    } else if (numProductos === 2) {
        mensaje = generarMensajePersonalizado('intro_recomendaciones_2', { nombre: userName });
    } else {
        mensaje = generarMensajePersonalizado('intro_recomendaciones_3', { nombre: userName });
    }
    
    mensaje += '\n\n';
    
    // PASO 4: Formatear cada producto de forma persuasiva
    topProducts.forEach((p, idx) => {
        const price = parseFloat(p.price) || 0;
        const offer = parseFloat(p.offer) || 0;
        const finalPrice = offer > 0 ? price * (1 - offer / 100) : price;
        const link = `https://stela-shop-ecru.vercel.app/producto/${p.sku}`;
        
        // Emoji según categoría
        let emoji = '✨';
        const cat = p.category.toLowerCase();
        if (cat.includes('vestido')) emoji = '👗';
        else if (cat.includes('blusa')) emoji = '👚';
        else if (cat.includes('pantalon') || cat.includes('jeans')) emoji = '👖';
        else if (cat.includes('sudadera')) emoji = '🧥';
        else if (cat.includes('chamarra') || cat.includes('jacket')) emoji = '🧥';
        else if (cat.includes('falda')) emoji = '👗';
        
        mensaje += `${emoji} **${p.name}**\n`;
        
        // Descripción persuasiva (máximo 100 chars)
        if (p.description && p.description.length > 0) {
            const desc = p.description.length > 100 
                ? p.description.substring(0, 97) + '...'
                : p.description;
            mensaje += `${desc}\n`;
        }
        
        // Tallas disponibles
        if (p.sizes && p.sizes.length > 0) {
            mensaje += `📏 Tallas disponibles\n`;
        }
        
        // Precio con énfasis en descuento
        if (offer > 0) {
            mensaje += `💰 ~~$${price.toFixed(2)}~~ **$${finalPrice.toFixed(2)}** (${offer}% OFF) 🔥\n`;
        } else {
            mensaje += `💰 **$${price.toFixed(2)}**\n`;
        }
        
        // Link directo
        mensaje += `🔗 [VER PRODUCTO Y COMPRAR](${link})\n`;
        
        // Separador entre productos
        if (idx < topProducts.length - 1) {
            mensaje += '\n';
        }
    });
    
    // PASO 5: Cierre persuasivo
    mensaje += generarMensajePersonalizado('cierre_venta', { nombre: userName });
    
    console.log('✅ Mensaje de recomendación generado con templates');
    return mensaje;

}

// --- HANDLER PRINCIPAL ---
export default async function handler(req, res) {
    console.log(`📨 [${new Date().toISOString()}] Petición recibida:`, {
        method: req.method,
        origin: req.headers.origin,
        contentType: req.headers['content-type'],
        hasBody: !!req.body
    });
    
    setCORS(req, res);
    if (handlePreflight(req, res)) {
        console.log("✅ Preflight OPTIONS manejado correctamente");
        return;
    }

    console.log("🚀 Procesando petición POST...");

    if (req.method !== "POST") {
        console.log(`❌ Método ${req.method} no permitido`);
        return res.status(405).json({ 
            success: false, 
            error: "Método no permitido. Usa POST." 
        });
    }

    try {
        console.log("📦 Body recibido:", {
            hasMensaje: !!req.body?.mensaje,
            hasImagen: !!req.body?.imagen,
            hasIdToken: !!req.body?.idToken,
            hasUserData: !!req.body?.userData,
            mensajeLength: req.body?.mensaje?.length
        });
        
        const { 
            mensaje, 
            imagen, 
            idToken,
            userData
        } = req.body;

        if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: "El mensaje es requerido y debe ser texto válido." 
            });
        }

        if (imagen) {
            const imageSizeInBytes = (imagen.length * 3) / 4;
            const maxSizeInBytes = 4 * 1024 * 1024;
            
            if (imageSizeInBytes > maxSizeInBytes) {
                return res.status(400).json({ 
                    success: false, 
                    error: "La imagen es demasiado pesada. Máximo 4MB." 
                });
            }

            if (!imagen.startsWith('data:image/')) {
                return res.status(400).json({ 
                    success: false, 
                    error: "La imagen debe estar en formato Base64 válido (data:image/...)." 
                });
            }
        }

        let userAuth = null;
        let userId = null;
        
        // El frontend debe enviar la conversación actual en req.body.currentConversation
        const currentConversation = req.body.currentConversation || [];
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📱 CONVERSACIÓN RECIBIDA DEL FRONTEND:');
        console.log('   Mensajes totales:', currentConversation.length);
        console.log('   Contenido completo:', JSON.stringify(currentConversation, null, 2));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Verificar autenticación si se proporciona token
        if (idToken) {
            userAuth = await verifyUserAuth(idToken);
            
            if (!userAuth) {
                return res.status(401).json({
                    success: false,
                    error: "Token inválido o expiado. Por favor, inicia sesión nuevamente."
                });
            }
            
            // Validar que el email del userData coincida con el del token (seguridad)
            if (userData && userData.email && userData.email !== userAuth.email) {
                console.error('⚠️ Email del userData no coincide con el del token');
                return res.status(401).json({
                    success: false,
                    error: "Los datos de usuario no coinciden con la autenticación."
                });
            }
            
            userId = userAuth.uid;
            
            // Guardar/actualizar usuario con los datos del frontend
            if (userData) {
                // Validar datos del usuario
                const validation = validateUserData(userData);
                if (!validation.valid) {
                    console.error('❌ Datos de usuario inválidos:', validation.errors);
                    return res.status(400).json({
                        success: false,
                        error: `Datos inválidos: ${validation.errors.join(', ')}`
                    });
                }
                
                console.log('📝 Guardando datos de usuario:', { nombre: userData.nombre, whatsapp: userData.whatsapp });
                await saveUserForRemarketing(userAuth, userData);
            } else {
                console.log('⚠️ No se recibieron datos adicionales del usuario');
                await saveUserForRemarketing(userAuth);
            }
        }
        
        // No requerir auth hasta que esté lista para recomendar
        console.log('💬 Permitiendo conversación sin autenticación');

        // Extraer preferencias de la conversación ACTUAL
        const allMessages = [...currentConversation, mensaje];
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 EXTRAYENDO PREFERENCIAS');
        console.log('Mensaje del usuario:', mensaje);
        console.log('Mensajes previos en conversación:', currentConversation.length);
        console.log('Total mensajes para análisis:', allMessages.length);
        console.log('Contenido completo para análisis:', JSON.stringify(allMessages, null, 2));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const preferences = extractUserPreferences(allMessages);
        const validation = checkRequiredData(preferences);
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 ANÁLISIS DE CONVERSACIÓN ACTUAL');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 Mensajes en conversación:', currentConversation.length);
        console.log('👤 Último mensaje usuario:', mensaje);
        console.log('🎯 Preferencias extraídas:');
        console.log('   - Prendas:', preferences.prendas, '(length:', preferences.prendas?.length || 0, ')');
        console.log('   - Tallas:', preferences.tallas, '(length:', preferences.tallas?.length || 0, ')');
        console.log('   - Colores:', preferences.colores);
        console.log('   - Ocasiones:', preferences.ocasiones);
        console.log('   - Estilos:', preferences.estilos);
        console.log('✅ Validación:', validation);
        console.log('   - ready:', validation.ready);
        console.log('   - missing:', validation.missing);
        console.log('🔐 Usuario autenticado:', !!userAuth);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        let response;
        let mode = 'discovery';
        const userName = userData?.nombre || userAuth?.displayName || null;

        // ⚠️ VALIDACIÓN SUPER ESTRICTA ADICIONAL
        const tienePrendas = preferences.prendas && preferences.prendas.length > 0;
        const tieneTallas = preferences.tallas && preferences.tallas.length > 0;
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️ VALIDACIÓN SUPER ESTRICTA:');
        console.log('   - Tiene prendas?', tienePrendas, preferences.prendas);
        console.log('   - Tiene tallas?', tieneTallas, preferences.tallas);
        console.log('   - validation.ready?', validation.ready);
        console.log('   - Tiene auth?', !!userAuth);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // 🚨 PROTECCIÓN BRUTAL: Si NO tiene tallas, ABORTAR CUALQUIER RECOMENDACIÓN
        if (!tieneTallas) {
            console.log('🚨 ABORT: NO tiene tallas - FORZANDO modo discovery');
            response = await generateDiscoveryMessage(mensaje, currentConversation, userName, preferences);
            mode = 'discovery';
        } else if (!tienePrendas) {
            console.log('🚨 ABORT: NO tiene prendas - FORZANDO modo discovery');
            response = await generateDiscoveryMessage(mensaje, currentConversation, userName, preferences);
            mode = 'discovery';
        } else if (tienePrendas && tieneTallas && !userAuth) {
            // Tiene datos completos pero NO está autenticada → pedir auth
            console.log("🔐 Datos completos, solicitando autenticación");
            console.log("   ✅ Prenda:", preferences.prendas);
            console.log("   ✅ Talla:", preferences.tallas);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            const authMessage = generarMensajePersonalizado('pedir_auth', { nombre: userName });
            return res.status(200).json({
                success: true,
                requiresAuth: true,
                message: authMessage,
                mode: 'auth_required',
                datosExtraidos: preferences,
                datosCompletos: true,
                conversationLength: currentConversation.length
            });
        } else if (validation.ready && userAuth) {
            // Tiene datos completos Y está autenticada → RECOMENDAR
            console.log("🎯 ACTIVANDO MODO RECOMENDACIÓN");
            console.log("   ✅ Usuario autenticado:", userAuth.email);
            console.log("   ✅ Prenda:", preferences.prendas);
            console.log("   ✅ Tallas:", preferences.tallas);
            console.log("   📦 Conversación actual:", currentConversation.length, "mensajes");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            
            const catalog = await fetchProductCatalog();
            
            if (catalog.length === 0) {
                return res.status(200).json({
                    success: false,
                    error: 'No hay productos disponibles en el catálogo.',
                    mode: 'recommendation'
                });
            }

            // Construir historial para el LLM solo de la conversación actual
            const conversationForLLM = [];
            for (let i = 0; i < currentConversation.length; i++) {
                conversationForLLM.push({
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: currentConversation[i]
                });
            }
            
            // Pasar TODA la conversación actual (incluyendo el mensaje actual)
            const allCurrentMessages = [...currentConversation, mensaje];

            response = await callMiaRecommendationMode(
                mensaje, 
                imagen, 
                conversationForLLM, 
                catalog, 
                userName,
                allCurrentMessages  // ✅ CRÍTICO: pasar conversación actual completa
            );
            mode = 'recommendation';
        } else {
            // Caso de seguridad - NO debería llegar aquí
            console.error('❌ ERROR: Estado inesperado en el flujo');
            console.error('   tienePrendas:', tienePrendas);
            console.error('   tieneTallas:', tieneTallas);
            console.error('   userAuth:', !!userAuth);
            
            // Por seguridad, entrar a modo discovery
            response = await generateDiscoveryMessage(mensaje, currentConversation, userName, preferences);
            mode = 'discovery';
        }

        // Guardar la conversación solo si está autenticado (para marketing/remarketing)
        if (userAuth) {
            const conversationEntry = {
                fecha: new Date().toISOString(),
                mensaje: mensaje,
                respuesta: response,
                tieneImagen: !!imagen,
                modo: mode,
                datosExtraidos: {
                    prendas: preferences.prendas,
                    tallas: preferences.tallas,
                    colores: preferences.colores,
                    ocasiones: preferences.ocasiones,
                    estilos: preferences.estilos
                }
            };

            await db.collection('users_asistant').doc(userId).update({
                conversaciones: admin.firestore.FieldValue.arrayUnion(conversationEntry),
                ultimaInteraccion: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        console.log("✅ Respuesta generada exitosamente");
        console.log(`📤 Respuesta completada (${response.length} caracteres) en modo: ${mode}`);

        // Validación final estricta para el JSON de respuesta
        const finalTienePrendas = preferences.prendas && preferences.prendas.length > 0;
        const finalTieneTallas = preferences.tallas && preferences.tallas.length > 0;
        const finalDatosCompletos = finalTienePrendas && finalTieneTallas;
        const finalDatosFaltantes = [];
        
        if (!finalTienePrendas) finalDatosFaltantes.push('categoria');
        if (!finalTieneTallas) finalDatosFaltantes.push('talla');
        
        console.log('📊 Validación final para respuesta:');
        console.log('   - Tiene prendas?', finalTienePrendas);
        console.log('   - Tiene tallas?', finalTieneTallas);
        console.log('   - Datos completos?', finalDatosCompletos);
        console.log('   - Datos faltantes:', finalDatosFaltantes);

        // Devolver respuesta JSON con datos extraídos VALIDADOS
        return res.status(200).json({
            success: true,
            respuesta: response,
            mode: mode,
            userId: userId,
            datosExtraidos: preferences,
            datosCompletos: finalDatosCompletos,  // ← Usar validación estricta
            datosFaltantes: finalDatosFaltantes   // ← Usar lista calculada
        });

    } catch (error) {
        console.error("❌ Error en handler:", {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        let errorMessage = "Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo.";
        let statusCode = 500;
        
        // Detectar errores específicos de rate limit
        if (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('Rate limit')) {
            errorMessage = "🌟 Mia está muy ocupada ahora mismo. Por favor intenta de nuevo en unos segundos. ¡Gracias por tu paciencia! 💝";
            statusCode = 429;
        }
        // Detectar errores de modelos no disponibles
        else if (error.message.includes('404') || error.message.includes('No se pudo obtener respuesta')) {
            errorMessage = "😔 Tenemos problemas técnicos temporales. Estamos trabajando en solucionarlo. Por favor intenta en unos minutos.";
            statusCode = 503;
        }
        // Errores de API
        else if (error.message.includes('API') || error.message.includes('GEMINI')) {
            errorMessage = "Estamos teniendo problemas con nuestro servicio. Por favor intenta en unos momentos.";
            statusCode = 503;
        } 
        // Errores de Firebase
        else if (error.message.includes('Firebase') || error.message.includes('firestore')) {
            errorMessage = "Error al acceder a la base de datos. Por favor intenta de nuevo.";
            statusCode = 500;
        }

        // Devolver error como JSON
        return res.status(statusCode).json({ 
            success: false, 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
