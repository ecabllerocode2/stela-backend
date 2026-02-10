# Formato de Datos de Usuario - Backend

## Resumen de Cambios

Se implementó autenticación gratuita con Firebase (Google Sign-In y Email/Password) + captura obligatoria de datos adicionales (nombre y WhatsApp) para marketing.

## Nuevo Flujo de Autenticación

1. **Usuario se autentica** con Google o Email/Password (gratuito)
2. **Sistema captura** nombre completo y número de WhatsApp
3. **Datos se guardan** en Firestore (`usuarios/{userId}`)
4. **idToken incluye** estos datos cuando llama al backend

---

## Estructura de Datos del Usuario en Firebase

### Colección: `usuarios/{userId}`

```javascript
{
  "nombre": "María García López",
  "whatsapp": "5551234567",          // 10 dígitos sin +52
  "email": "maria@example.com",      // Del auth provider
  "updatedAt": "2025-12-28T10:30:00Z"
}
```

### Campos

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|-------------|-------------|---------|
| `nombre` | String | ✅ Sí | Nombre completo del usuario | `"María García López"` |
| `whatsapp` | String | ✅ Sí | Número de WhatsApp (10 dígitos) | `"5551234567"` |
| `email` | String | ✅ Sí | Email del usuario | `"maria@example.com"` |
| `updatedAt` | String (ISO 8601) | ✅ Sí | Última actualización | `"2025-12-28T10:30:00Z"` |

---

## ID Token de Firebase

El `idToken` que recibes en el backend ahora incluye:

```json
{
  "iss": "https://securetoken.google.com/tu-proyecto",
  "aud": "tu-proyecto",
  "auth_time": 1735387800,
  "user_id": "abc123xyz789",
  "sub": "abc123xyz789",
  "iat": 1735387800,
  "exp": 1735391400,
  "email": "maria@example.com",
  "email_verified": true,
  "firebase": {
    "identities": {
      "google.com": ["1234567890"],
      "email": ["maria@example.com"]
    },
    "sign_in_provider": "google.com"
  }
}
```

### Campos Importantes del Token

- `user_id` / `sub`: ID único del usuario (usar como clave)
- `email`: Email del usuario
- `email_verified`: Si el email está verificado
- `sign_in_provider`: Método de autenticación (`google.com`, `password`)

---

## Cómo Obtener los Datos Adicionales en el Backend

### Opción 1: Consultar Firestore (Recomendado)

```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

async function getUserData(userId) {
  const userDoc = await db.collection('usuarios').doc(userId).get();
  
  if (!userDoc.exists) {
    throw new Error('Usuario no encontrado');
  }
  
  return userDoc.data();
}

// Uso en el endpoint
app.post('/api/asesor-estilo', async (req, res) => {
  const { idToken, mensaje } = req.body;
  
  // Verificar token
  const decodedToken = await admin.auth().verifyIdToken(idToken);
  const userId = decodedToken.uid;
  
  // Obtener datos adicionales
  const userData = await getUserData(userId);
  
  console.log('Usuario:', userData.nombre);
  console.log('WhatsApp:', userData.whatsapp);
  console.log('Email:', userData.email);
  
  // ... resto de la lógica
});
```

### Opción 2: Frontend Envía los Datos (Alternativa)

Si prefieres que el frontend envíe los datos en cada request:

```javascript
// Request del frontend
{
  "mensaje": "Busco ropa elegante",
  "idToken": "eyJhbGciOiJSUzI1...",
  "userData": {
    "nombre": "María García",
    "whatsapp": "5551234567",
    "email": "maria@example.com"
  }
}

// Backend valida el token y usa userData
app.post('/api/asesor-estilo', async (req, res) => {
  const { idToken, mensaje, userData } = req.body;
  
  // Verificar token
  const decodedToken = await admin.auth().verifyIdToken(idToken);
  
  // Validar que el email coincida (seguridad)
  if (userData.email !== decodedToken.email) {
    return res.status(401).json({ 
      success: false, 
      error: 'Datos de usuario no coinciden' 
    });
  }
  
  console.log('Usuario:', userData.nombre);
  console.log('WhatsApp:', userData.whatsapp);
  
  // ... resto de la lógica
});
```

---

## Formato del Request al Backend

### Endpoint: `POST /api/asesor-estilo`

```javascript
{
  "mensaje": "Busco ropa elegante para la oficina",
  "imagen": null,  // o base64 con imagen
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE...",
  "userData": {    // Opcional si consultas Firestore
    "nombre": "María García López",
    "whatsapp": "5551234567",
    "email": "maria@example.com"
  }
}
```

---

## Guardar Datos para Marketing

### Estructura Recomendada para Marketing

Crea una colección separada para marketing:

```javascript
// Colección: marketing_contacts/{userId}
{
  "nombre": "María García López",
  "whatsapp": "+525551234567",       // Formato internacional
  "email": "maria@example.com",
  "primeraInteraccion": "2025-12-28T10:30:00Z",
  "ultimaInteraccion": "2025-12-28T14:45:00Z",
  "totalInteracciones": 5,
  "consentimiento": true,             // Aceptó recibir mensajes
  "preferencias": {
    "categorias": ["oficina", "casual"],
    "colores": ["negro", "blanco"],
    "presupuesto": "medio"
  },
  "conversiones": {
    "productosVistos": ["BL-001", "PT-004"],
    "productosComprados": []
  }
}
```

### Script de Migración/Guardado

```javascript
async function saveMarketingContact(userId, userData, conversationData) {
  const marketingRef = db.collection('marketing_contacts').doc(userId);
  
  await marketingRef.set({
    nombre: userData.nombre,
    whatsapp: `+52${userData.whatsapp}`,  // Agregar +52
    email: userData.email,
    primeraInteraccion: admin.firestore.FieldValue.serverTimestamp(),
    ultimaInteraccion: admin.firestore.FieldValue.serverTimestamp(),
    totalInteracciones: admin.firestore.FieldValue.increment(1),
    consentimiento: true,
    preferencias: conversationData.preferencias || {},
    conversiones: {
      productosVistos: conversationData.productosVistos || [],
      productosComprados: []
    }
  }, { merge: true });
}
```

---

## Validaciones Importantes

### En el Backend

```javascript
function validateUserData(userData) {
  const errors = [];
  
  // Validar nombre
  if (!userData.nombre || userData.nombre.trim().length < 2) {
    errors.push('Nombre inválido');
  }
  
  // Validar WhatsApp (10 dígitos)
  const whatsappRegex = /^[0-9]{10}$/;
  if (!userData.whatsapp || !whatsappRegex.test(userData.whatsapp)) {
    errors.push('WhatsApp debe tener 10 dígitos');
  }
  
  // Validar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!userData.email || !emailRegex.test(userData.email)) {
    errors.push('Email inválido');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Uso
const validation = validateUserData(userData);
if (!validation.valid) {
  return res.status(400).json({
    success: false,
    error: validation.errors.join(', ')
  });
}
```

---

## Exportar Datos para Marketing

### Query de Firestore

```javascript
async function exportMarketingContacts() {
  const snapshot = await db.collection('marketing_contacts')
    .where('consentimiento', '==', true)
    .get();
  
  const contacts = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    contacts.push({
      nombre: data.nombre,
      whatsapp: data.whatsapp,
      email: data.email,
      totalInteracciones: data.totalInteracciones,
      ultimaInteraccion: data.ultimaInteraccion
    });
  });
  
  return contacts;
}
```

### Formato CSV para Exportación

```csv
nombre,whatsapp,email,total_interacciones,ultima_interaccion
María García López,+525551234567,maria@example.com,5,2025-12-28T14:45:00Z
Juan Pérez,+525559876543,juan@example.com,3,2025-12-27T10:30:00Z
```

---

## Métodos de Autenticación Soportados

| Método | Proveedor Firebase | Gratuito | Email Verificado |
|--------|-------------------|----------|------------------|
| Google Sign-In | `google.com` | ✅ Sí | ✅ Sí (automático) |
| Email/Password | `password` | ✅ Sí | ⚠️ Opcional |

### Identificar Método de Autenticación

```javascript
const decodedToken = await admin.auth().verifyIdToken(idToken);
const provider = decodedToken.firebase.sign_in_provider;

if (provider === 'google.com') {
  console.log('Usuario autenticado con Google');
} else if (provider === 'password') {
  console.log('Usuario autenticado con Email/Password');
}
```

---

## Ejemplo Completo: Endpoint Actualizado

```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

app.post('/api/asesor-estilo', async (req, res) => {
  try {
    const { mensaje, imagen, idToken } = req.body;
    
    // Validar mensaje
    if (!mensaje || typeof mensaje !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'El mensaje es requerido y debe ser texto válido.'
      });
    }
    
    let userId = null;
    let userData = null;
    
    // Si hay token, verificar y obtener datos del usuario
    if (idToken) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        userId = decodedToken.uid;
        
        // Obtener datos adicionales de Firestore
        const userDoc = await db.collection('usuarios').doc(userId).get();
        if (userDoc.exists) {
          userData = userDoc.data();
          
          // Guardar/actualizar en marketing
          await db.collection('marketing_contacts').doc(userId).set({
            nombre: userData.nombre,
            whatsapp: `+52${userData.whatsapp}`,
            email: decodedToken.email,
            ultimaInteraccion: admin.firestore.FieldValue.serverTimestamp(),
            totalInteracciones: admin.firestore.FieldValue.increment(1),
            consentimiento: true
          }, { merge: true });
        }
      } catch (error) {
        console.error('Error al verificar token:', error);
        return res.status(401).json({
          success: false,
          error: 'Token inválido o expirado. Por favor, inicia sesión nuevamente.'
        });
      }
    }
    
    // Contar mensajes del usuario en la sesión actual
    let messageCount = 1;
    if (userId) {
      // Lógica para contar mensajes...
    }
    
    // Si es el segundo mensaje y no hay usuario, pedir auth
    if (messageCount >= 2 && !userId) {
      return res.json({
        success: true,
        requiresAuth: true,
        message: "Para poder recordar tus preferencias y mostrarte los productos perfectos para ti, necesito que inicies sesión. ¿Te parece bien? 💝",
        mode: "auth_required"
      });
    }
    
    // Procesar con OpenAI/Claude
    const respuestaIA = await procesarConIA(mensaje, imagen, userData);
    
    // Guardar en historial si hay usuario
    if (userId) {
      await guardarEnHistorial(userId, mensaje, respuestaIA);
    }
    
    res.json({
      success: true,
      response: respuestaIA,
      mode: determinarModo(messageCount),
      isAuthenticated: !!userId,
      userId
    });
    
  } catch (error) {
    console.error('Error en asesor-estilo:', error);
    res.status(500).json({
      success: false,
      error: 'Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo.'
    });
  }
});
```

---

## Preguntas Frecuentes

### ¿Cómo envío mensajes de WhatsApp a estos usuarios?

Usa una API de WhatsApp Business como:
- **Twilio**: https://www.twilio.com/whatsapp
- **WhatsApp Business API**: Oficial de Meta
- **Gupshup**: https://www.gupshup.io

Ejemplo con Twilio:

```javascript
const twilio = require('twilio');
const client = twilio(accountSid, authToken);

async function sendWhatsAppMessage(phone, message) {
  await client.messages.create({
    from: 'whatsapp:+14155238886',  // Tu número de Twilio
    to: `whatsapp:${phone}`,         // +525551234567
    body: message
  });
}
```

### ¿Cómo validar que el WhatsApp es real?

No hay forma 100% segura sin enviar un código de verificación. Opciones:

1. **Confiar en el usuario** (actual)
2. **Verificación posterior**: Enviar código por WhatsApp después del registro
3. **Validación en lote**: Usar API de WhatsApp para verificar números activos

### ¿El email viene verificado con Google Sign-In?

✅ **Sí**, Google verifica automáticamente el email.

Con Email/Password, puedes forzar verificación:

```javascript
await sendEmailVerification(user);
```

---

## Testing

### Datos de Prueba

```javascript
// Usuario de prueba
{
  "nombre": "Test User",
  "whatsapp": "5500000000",
  "email": "test@example.com"
}
```

### Verificar en Firestore Console

1. Ir a Firebase Console → Firestore Database
2. Buscar colección `usuarios`
3. Verificar que cada usuario autenticado tenga sus datos completos

---

## Contacto

Si tienes dudas sobre esta implementación, contacta al equipo de frontend.
