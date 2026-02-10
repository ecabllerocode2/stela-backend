# 📱 Documentación de Integración - Asesor de Estilo "Mia"

## 🎯 Resumen del Sistema

El backend implementa un **sistema híbrido inteligente**:
- **LLM (Gemini/LLaMA)**: Conversación natural, preguntas creativas
- **Algoritmo**: Selección precisa de productos reales (evita alucinaciones)
- **Soporte completo**: Todas las categorías + manejo de 0-3 productos

---

## 🔌 Endpoint

```
POST https://malim-backend.vercel.app/api/asesor-estilo
```

---

## 📤 Request Body

```typescript
interface AsesorEstiloRequest {
  mensaje: string;              // Requerido: mensaje del usuario
  imagen?: string;               // Opcional: imagen en base64 (data:image/...)
  idToken?: string;              // Opcional: Firebase Auth ID Token
  userData?: {                   // Opcional: datos del usuario
    nombre?: string;             // Mínimo 2 caracteres
    whatsapp?: string;           // 10 dígitos exactos
    email: string;               // Requerido si userData existe
  };
}
```

### ⚠️ Validaciones Importantes

- **mensaje**: No puede estar vacío, debe ser string
- **imagen**: Máximo 4MB, formato `data:image/...`
- **whatsapp**: Exactamente 10 dígitos numéricos
- **email**: Formato válido de email

---

## 📥 Response Structure

```typescript
interface AsesorEstiloResponse {
  success: boolean;
  response?: string;            // Respuesta de Mia
  mode?: 'discovery' | 'recommendation' | 'auth_required';
  isAuthenticated?: boolean;
  userId?: string;
  requiresAuth?: boolean;       // true = necesita login
  message?: string;             // Mensaje especial (ej: pedir auth)
  error?: string;               // En caso de error
  details?: string;             // Solo en desarrollo
}
```

---

## 🔄 Flujo de Estados

### 1️⃣ **MODO DESCUBRIMIENTO** (`mode: 'discovery'`)
- Mia hace preguntas para conocer preferencias
- Puede ocurrir con o sin autenticación
- El LLM **NO recomienda productos** (solo conversa)
- Extrae datos: ocasión, prendas, colores, estilos

**Ejemplo de conversación:**
```
Usuario: "Hola!"
Mia: "¡Hola! 💖 ¿Para qué ocasión buscas ropa?"

Usuario: "Para una fiesta"
Mia: "¡Perfecto! ¿Prefieres vestido o conjunto? ¿Algún color en especial?"

Usuario: "Un vestido rojo"
Mia: "¡Excelente elección! Déjame buscar las opciones perfectas para ti..."
→ CAMBIA A MODO RECOMENDACIÓN
```

### 2️⃣ **MODO AUTH_REQUIRED** (`requiresAuth: true`)
- Se activa cuando:
  - Usuario ya dio suficiente información
  - Pero NO está autenticado
- Backend responde con `requiresAuth: true`
- Frontend debe mostrar modal de login

**Response ejemplo:**
```json
{
  "success": true,
  "requiresAuth": true,
  "message": "¡Perfecto! 💝 Para mostrarte nuestros productos necesito que inicies sesión...",
  "mode": "auth_required"
}
```

**Implementación recomendada:**
```javascript
if (response.requiresAuth) {
  // Guardar el contexto de la conversación
  saveConversationContext();
  
  // Mostrar el mensaje de Mia
  addMessageToChat(response.message, 'assistant');
  
  // Abrir modal de login/registro
  showAuthModal();
  
  // Después del login exitoso:
  // - Enviar el último mensaje otra vez con idToken
  // - El backend retomará desde donde quedó
}
```

### 3️⃣ **MODO RECOMENDACIÓN** (`mode: 'recommendation'`)
- Usuario autenticado + suficiente información
- **Algoritmo** selecciona los mejores productos (1-3)
- **LLM** presenta los productos creativamente
- Incluye enlaces directos a productos

**Casos posibles:**

#### **A) 0 productos disponibles**
```json
{
  "success": true,
  "response": "Lo siento mucho, no encontré productos disponibles...",
  "mode": "recommendation"
}
```

#### **B) 1 producto**
```json
{
  "success": true,
  "response": "¡Tengo LA opción perfecta!\n\n✨ Vestido Rojo Elegante: Perfecto para tu fiesta...\nVer: https://malim-shop.vercel.app/producto/SKU123",
  "mode": "recommendation"
}
```

#### **C) 2 productos**
```json
{
  "success": true,
  "response": "¡Encontré 2 opciones INCREÍBLES!\n\n1️⃣ Vestido A...\n2️⃣ Vestido B...",
  "mode": "recommendation"
}
```

#### **D) 3 productos (normal)**
```json
{
  "success": true,
  "response": "¡Encontré opciones INCREÍBLES!\n\n1️⃣...\n2️⃣...\n3️⃣...",
  "mode": "recommendation"
}
```

---

## 🎨 Categorías Soportadas

El sistema ahora maneja **TODAS** las categorías de tu tienda:

### ✅ Ropa Superior
- `BLUSAS` - Blusas
- `PLAYERAS` - Playeras / T-Shirts
- `POLOS` - Camisas Polo
- `CAMISAS` - Camisas (Formal/Casual)
- `TOPS_CORTOS` - Tops / Cropped Tops
- `BRAS_BRALETTES` - Bras / Bralettes
- `BLUSONES` - Blusones
- `CHALECOS` - Chalecos

### ✅ Ropa Inferior
- `PANTALONES` - Pantalones (Casual/Formal)
- `PANTS_JOGGERS` - Pants / Joggers
- `SHORTS` - Shorts
- `FALDAS` - Faldas
- `LEGGINGS_MALLONES` - Leggins / Mallones

### ✅ Ropa Exterior
- `ABRIGOS` - Abrigos (Coats)
- `CHAMARRAS` - Chamarras / Chaquetas (Jackets)
- `SUDADERAS` - Sudaderas (Hoodies / Sweatshirts)
- `MAXI_SUDADERAS` - Maxi Sudaderas
- `SACOS_BLAZERS` - Sacos / Blazers
- `CAPAS_GABARDINAS` - Capas / Gabardinas
- `ENSAMBLES` - Ensambles / Cardigans
- `SUETERES` - Suéteres (Sweaters)

### ✅ Prendas de una pieza
- `VESTIDOS` - Vestidos
- `MAXI_VESTIDOS` - Maxi Vestidos
- `OVEROLES` - Overoles (Dungarees)
- `JUMPSUITS` - Jumpsuits
- `BODIES` - Bodys / Bodysuits
- `PALAZZOS` - Palazzos

### ✅ Lencería y Ropa Interior
- `ROPA_INTERIOR` - Ropa Interior
- `MEDIAS` - Medias / Pantimedias
- `PIJAMAS` - Pijamas

### ✅ Ropa Deportiva
- `PLAYERAS_DEPORTIVAS` - Playeras Deportivas
- `CONJUNTOS_DEPORTIVOS` - Conjuntos Deportivos

### ✅ Calzado
- `TENNIS` - Tenis / Sneakers
- `BOTAS_BOTINES` - Botas / Botines
- `SANDALIAS` - Sandalias / Chanclas
- `TACONES` - Zapatos de Tacón
- `PLATAFORMAS` - Plataformas
- `CALZADO_OTRO` - Otros Tipos de Calzado

### ✅ Accesorios
- `BOLSOS_CARTERAS` - Bolsos y Carteras
- `JOYERIA` - Joyería (Collares, Aretes, Pulseras)
- `CINTURONES` - Cinturones
- `SOMBREROS_GORROS` - Sombreros y Gorros
- `GUANTES` - Guantes
- `BUFANDAS` - Bufandas y Pañuelos
- `ACCESORIOS_CABELLO` - Accesorios para Cabello
- `MAXI_COBIJAS` - Maxi Cobijas / Ponchos

### ✅ Ropa Infantil
- `NINIA` - Infantil Niña
- `NINIO` - Infantil Niño
- `UNISEX_INFANTIL` - Niños Unisex

### ✅ Categorías Especiales
- `PATRIA` - Patria
- `CONJUNTOS_COMPLETOS` - Conjuntos (No deportivos)
- `OTROS` - Otros
- `SIN_CATEGORIA` - Sin Categoría

---

## 🧠 Algoritmo de Scoring

El backend calcula un score (0-100) para cada producto:

| Factor | Puntos | Descripción |
|--------|--------|-------------|
| **Tipo de prenda** | 40 pts | Coincide categoría/nombre |
| **Color** | 25 pts | Color disponible coincide |
| **Ocasión/Estilo** | 20 pts | En descripción |
| **Oferta activa** | 10 pts | Tiene descuento |
| **Buena descripción** | 5 pts | >50 caracteres |

**Productos se ordenan por score y se toman los top 1-3**

### Ejemplo de Scoring:
```javascript
// Usuario: "Busco un vestido rojo para boda"
// 
// Producto A - Vestido Elegante Rojo
// + 40 pts (categoría: VESTIDOS)
// + 25 pts (color: rojo disponible)
// + 20 pts (descripción menciona "elegante")
// + 10 pts (tiene 15% descuento)
// + 5 pts (descripción >50 chars)
// = 100 pts ⭐ TOP 1
//
// Producto B - Vestido Negro Casual
// + 40 pts (categoría: VESTIDOS)
// + 0 pts (no tiene rojo)
// + 0 pts (estilo no coincide)
// + 10 pts (tiene oferta)
// + 5 pts (bien descrito)
// = 55 pts → TOP 2
```

---

## 💡 Ejemplos de Implementación Frontend

### 1. **Envío Básico de Mensaje**

```javascript
const sendMessageToMia = async (mensaje, idToken = null, imagen = null) => {
  try {
    const response = await fetch('https://malim-backend.vercel.app/api/asesor-estilo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mensaje,
        idToken,
        imagen,
        userData: idToken ? {
          nombre: currentUser.displayName,
          email: currentUser.email,
          whatsapp: currentUser.phoneNumber
        } : undefined
      })
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Error al conectar con Mia');
    }

    return data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
```

### 2. **Componente Chat Completo (React)**

```jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from './auth-context';

function ChatMia() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const messagesEndRef = useRef(null);
  const { user, getIdToken } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    // Agregar mensaje del usuario
    setMessages(prev => [...prev, { 
      text: userMessage, 
      sender: 'user',
      timestamp: new Date()
    }]);

    setIsLoading(true);

    try {
      const idToken = user ? await getIdToken() : null;
      
      const response = await fetch('https://malim-backend.vercel.app/api/asesor-estilo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: userMessage,
          idToken,
          userData: user ? {
            nombre: user.displayName,
            email: user.email,
            whatsapp: user.phoneNumber?.replace(/\D/g, '').slice(-10)
          } : undefined
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Manejar requerimiento de auth
      if (data.requiresAuth) {
        setMessages(prev => [...prev, {
          text: data.message,
          sender: 'assistant',
          timestamp: new Date(),
          requiresAuth: true
        }]);
        setShowAuthModal(true);
        return;
      }

      // Agregar respuesta de Mia
      setMessages(prev => [...prev, {
        text: data.response,
        sender: 'assistant',
        timestamp: new Date(),
        mode: data.mode
      }]);

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        text: '😔 Lo siento, tuve un problema. ¿Puedes intentar de nuevo?',
        sender: 'assistant',
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatMessage = (text) => {
    // Convertir URLs en enlaces clickeables
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" class="text-blue-500 underline">Ver producto</a>');
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-pink-500 text-white p-4">
        <h1 className="text-xl font-bold">💖 Mia - Tu Asesora de Estilo</h1>
        {user && (
          <p className="text-sm opacity-90">¡Hola {user.displayName}!</p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-4 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}
          >
            <div
              className={`inline-block max-w-[80%] p-3 rounded-lg ${
                msg.sender === 'user'
                  ? 'bg-pink-500 text-white'
                  : 'bg-white text-gray-800 shadow'
              }`}
              dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
            />
            <div className="text-xs text-gray-500 mt-1">
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="text-left mb-4">
            <div className="inline-block bg-white p-3 rounded-lg shadow">
              <span className="animate-pulse">Mia está escribiendo...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Escribe tu mensaje..."
            className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enviar
          </button>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal 
          onClose={() => setShowAuthModal(false)}
          onSuccess={async () => {
            setShowAuthModal(false);
            // Reenviar último mensaje con auth
            const lastUserMsg = messages.filter(m => m.sender === 'user').pop();
            if (lastUserMsg) {
              // Simular reenvío
              handleSend();
            }
          }}
        />
      )}
    </div>
  );
}

export default ChatMia;
```

### 3. **Manejo de Autenticación**

```javascript
// auth-helpers.js
export const saveConversationForAuth = (messages) => {
  localStorage.setItem('pendingMiaConversation', JSON.stringify({
    messages,
    timestamp: Date.now()
  }));
};

export const resumeConversationAfterAuth = () => {
  const pending = localStorage.getItem('pendingMiaConversation');
  if (!pending) return null;
  
  const { messages, timestamp } = JSON.parse(pending);
  
  // Solo si no ha pasado más de 1 hora
  if (Date.now() - timestamp > 3600000) {
    localStorage.removeItem('pendingMiaConversation');
    return null;
  }
  
  return messages;
};

export const clearPendingConversation = () => {
  localStorage.removeItem('pendingMiaConversation');
};
```

### 4. **Subir y Enviar Imagen**

```javascript
const handleImageUpload = async (file) => {
  return new Promise((resolve, reject) => {
    // Validar tamaño (máx 4MB)
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error('La imagen es muy grande. Máximo 4MB.'));
      return;
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      reject(new Error('Solo se permiten imágenes.'));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      const base64Image = e.target.result;
      resolve(base64Image);
    };
    
    reader.onerror = () => {
      reject(new Error('Error al leer la imagen.'));
    };
    
    reader.readAsDataURL(file);
  });
};

// Uso:
const sendImageMessage = async (file, mensaje) => {
  try {
    const base64Image = await handleImageUpload(file);
    
    const response = await sendMessageToMia(mensaje, idToken, base64Image);
    
    // Manejar respuesta...
  } catch (error) {
    alert(error.message);
  }
};
```

### 5. **Validación de Datos de Usuario**

```javascript
const validateUserData = (userData) => {
  const errors = [];
  
  if (userData.nombre && userData.nombre.trim().length < 2) {
    errors.push('El nombre debe tener al menos 2 caracteres');
  }
  
  if (userData.whatsapp) {
    const whatsappClean = userData.whatsapp.replace(/\D/g, '');
    if (whatsappClean.length !== 10) {
      errors.push('WhatsApp debe tener 10 dígitos');
    }
  }
  
  if (!userData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
    errors.push('Email inválido');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Uso antes de enviar:
const userData = {
  nombre: user.displayName,
  email: user.email,
  whatsapp: user.phoneNumber?.replace(/\D/g, '').slice(-10)
};

const validation = validateUserData(userData);
if (!validation.isValid) {
  console.error('Datos inválidos:', validation.errors);
  // Solicitar corrección...
}
```

---

## 🐛 Manejo de Errores

### Estados HTTP

| Status | Significado | Acción Frontend |
|--------|-------------|-----------------|
| **200** | Éxito | Mostrar respuesta |
| **400** | Datos inválidos | Mostrar error específico |
| **401** | Auth inválida | Pedir login nuevamente |
| **405** | Método no permitido | Verificar POST |
| **500** | Error del servidor | Mensaje amigable + reintentar |

### Implementación:

```javascript
const handleApiError = (response, data) => {
  switch (response.status) {
    case 400:
      return {
        title: 'Datos inválidos',
        message: data.error || 'Verifica la información enviada',
        action: 'retry'
      };
      
    case 401:
      return {
        title: 'Sesión expirada',
        message: 'Por favor, inicia sesión nuevamente',
        action: 'login'
      };
      
    case 500:
      return {
        title: 'Mia está descansando',
        message: 'Tenemos un problema técnico. Intenta en unos momentos 💤',
        action: 'retry-later'
      };
      
    default:
      return {
        title: 'Error inesperado',
        message: 'Algo salió mal. Por favor intenta de nuevo.',
        action: 'retry'
      };
  }
};

// Uso:
try {
  const response = await fetch(endpoint, options);
  const data = await response.json();
  
  if (!response.ok) {
    const errorInfo = handleApiError(response, data);
    showErrorModal(errorInfo);
    
    if (errorInfo.action === 'login') {
      redirectToLogin();
    }
  }
} catch (error) {
  showErrorModal({
    title: 'Sin conexión',
    message: 'Verifica tu conexión a internet 📡',
    action: 'retry'
  });
}
```

---

## 📊 Logs y Debugging

### En Producción (Vercel):

Ver logs en tiempo real:
```bash
vercel logs https://malim-backend.vercel.app
```

### Logs del Backend (ejemplos):

```
✅ Firebase Admin inicializado correctamente
✅ Usuario autenticado: uid123 (usuario@email.com)
📊 Preferencias extraídas: { 
  ocasiones: ['fiesta', 'elegante'],
  prendas: ['VESTIDOS'],
  colores: ['rojo', 'negro'],
  estilos: ['elegante']
}
🎯 Buscando recomendaciones en 127 productos
🏆 Top 3 productos: [
  { name: 'Vestido Rojo Elegante', sku: 'VST001', score: 85 },
  { name: 'Vestido Negro Fiesta', sku: 'VST002', score: 75 },
  { name: 'Vestido Largo Gala', sku: 'VST003', score: 65 }
]
📡 Llamando a Mia en MODO RECOMENDACIÓN (3 productos)...
✅ Respuesta exitosa con modelo: google/gemini-flash-1.5:free
✅ Respuesta generada exitosamente
```

### Debugging en Frontend:

```javascript
// Habilitar logs detallados
const DEBUG = process.env.NODE_ENV === 'development';

const sendMessageToMia = async (mensaje, idToken, imagen) => {
  if (DEBUG) {
    console.log('🚀 Enviando a Mia:', {
      mensaje,
      hasAuth: !!idToken,
      hasImage: !!imagen,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const response = await fetch(endpoint, options);
    const data = await response.json();
    
    if (DEBUG) {
      console.log('📥 Respuesta de Mia:', {
        success: data.success,
        mode: data.mode,
        isAuthenticated: data.isAuthenticated,
        responseLength: data.response?.length
      });
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error con Mia:', error);
    throw error;
  }
};
```

---

## ✅ Checklist de Implementación

### Básico (MVP)
- [ ] Configurar endpoint API
- [ ] Implementar envío de mensajes
- [ ] Mostrar respuestas en chat
- [ ] Loading states ("Mia está escribiendo...")
- [ ] Manejo de errores básico

### Autenticación
- [ ] Integrar Firebase Auth
- [ ] Obtener y enviar `idToken`
- [ ] Manejar `requiresAuth` → modal de login
- [ ] Guardar contexto pre-login
- [ ] Reanudar conversación post-login

### Características Avanzadas
- [ ] Subir y comprimir imágenes
- [ ] Validar datos de usuario
- [ ] Formatear enlaces clickeables
- [ ] Detección de productos en mensajes
- [ ] Guardar historial local (backup)
- [ ] Animaciones de typing
- [ ] Scroll automático

### UX/UI
- [ ] Diseño responsive
- [ ] Modo oscuro
- [ ] Notificaciones/toast
- [ ] Estados vacíos
- [ ] Skeleton loaders
- [ ] Accesibilidad (ARIA labels)

### Testing
- [ ] Probar sin autenticación
- [ ] Probar con autenticación
- [ ] Probar flujo completo: saludo → preguntas → auth → recomendaciones
- [ ] Probar con imágenes
- [ ] Probar errores (sin internet, server down, etc.)
- [ ] Probar en móvil

---

## 🚀 Ventajas de esta Implementación

1. ✅ **Cero alucinaciones**: Solo recomienda productos reales del catálogo
2. ✅ **Flexible**: Maneja 0-3 productos dinámicamente según disponibilidad
3. ✅ **Completo**: Soporta todas las 60+ categorías de productos
4. ✅ **Escalable**: Agrega productos → algoritmo los considera automáticamente
5. ✅ **Personalizado**: LLM presenta creativamente según contexto de conversación
6. ✅ **Seguro**: Valida autenticación y datos de usuario
7. ✅ **Trazable**: Logs detallados para debugging y análisis
8. ✅ **Inteligente**: Algoritmo de scoring preciso (100 puntos max)
9. ✅ **Conversacional**: Flujo natural con detección de momento de recomendación
10. ✅ **Histórico**: Guarda conversaciones en Firestore para remarketing

---

## 🔗 Enlaces Útiles

- **Endpoint API**: `https://malim-backend.vercel.app/api/asesor-estilo`
- **Frontend (shop)**: `https://malim-shop.vercel.app`
- **Firestore Collection**: `users_asistant` (para historial)
- **Firebase Auth**: Requerido para recomendaciones y historial

---

## 📞 Soporte

Si encuentras problemas o necesitas ayuda:

1. Revisa los logs del backend en Vercel
2. Verifica que las variables de entorno estén configuradas
3. Confirma que Firebase Auth esté funcionando
4. Prueba con un `console.log` en cada paso del flujo

---

## 🎉 Ejemplo de Flujo Completo

```
1. Usuario sin auth abre chat
   ↓
2. Usuario: "Hola"
   ↓
3. Mia: "¡Hola! 💖 ¿Para qué ocasión buscas ropa?"
   mode: 'discovery', isAuthenticated: false
   ↓
4. Usuario: "Para una boda"
   ↓
5. Mia: "¿Qué tipo de prenda prefieres? ¿Vestido o conjunto?"
   mode: 'discovery', isAuthenticated: false
   ↓
6. Usuario: "Un vestido rojo"
   ↓
7. Mia: "Para mostrarte productos, necesito que inicies sesión..."
   mode: 'auth_required', requiresAuth: true
   ↓
8. Frontend muestra modal de login
   ↓
9. Usuario inicia sesión con Google
   ↓
10. Frontend reenvía último mensaje con idToken
    ↓
11. Backend:
    - Extrae preferencias: {ocasiones: ['boda'], prendas: ['VESTIDOS'], colores: ['rojo']}
    - Algoritmo busca en 127 productos
    - Encuentra 3 vestidos con scores: 85, 70, 65
    - LLM presenta creativamente
    ↓
12. Mia: "¡Encontré opciones INCREÍBLES! 💝
    
    1️⃣ Vestido Rojo Elegante: Perfecto para boda...
    Ver: https://malim-shop.vercel.app/producto/VST001
    
    2️⃣ Vestido Vino Largo: Ideal para ceremonia...
    Ver: https://malim-shop.vercel.app/producto/VST002
    
    3️⃣ Vestido Bordado Rojo: Sofisticado y único...
    Ver: https://malim-shop.vercel.app/producto/VST003
    
    ¿Cuál te gustó más? 💖"
    mode: 'recommendation', isAuthenticated: true
    ↓
13. Conversación guardada en Firestore: users_asistant/{uid}
```

---

**Última actualización**: Diciembre 29, 2025
**Versión del API**: 2.0 (Sistema Híbrido LLM + Algoritmo)
