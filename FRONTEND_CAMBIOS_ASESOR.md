# Cambios Requeridos en el Frontend - Asesor de Estilo

## 🎯 Resumen de Cambios

El backend ahora implementa un **flujo estructurado** donde:
- El **algoritmo** se encarga de la recopilación y validación de datos (no el LLM)
- El **LLM** solo maneja la parte creativa (mensajes dulces y personalizados)
- La **conversación actual** se maneja en el frontend (localStorage/sessionStorage)
- Las **conversaciones se guardan en Firebase** solo para marketing/remarketing

---

## 📋 Cambios Obligatorios en el Frontend

### 1. **Gestión de Conversación Actual**

El frontend debe mantener un array con la conversación actual y enviarlo en cada request:

```javascript
// Estado de la conversación (usar localStorage para persistencia)
const [currentConversation, setCurrentConversation] = useState(() => {
  const saved = localStorage.getItem('mia_current_conversation');
  return saved ? JSON.parse(saved) : [];
});

// Al enviar un mensaje
const handleSendMessage = async (mensaje, imagen, forceIdToken = null) => {
  try {
    const response = await fetch('API_URL/asesor-estilo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mensaje: mensaje,
        imagen: imagen, // Base64 opcional
        idToken: forceIdToken || userIdToken, // Token de Firebase Auth
        userData: {
          nombre: userName,
          email: userEmail,
          whatsapp: userWhatsapp
        },
        currentConversation: currentConversation // ✅ CRÍTICO: SIEMPRE enviar conversación actual
      })
    });

    const data = await response.json();
    
    if (data.success) {
      // ⚠️ IMPORTANTE: Verificar que NO se haya pedido auth anteriormente
      // Si ya se pidió auth en esta conversación, NO volver a mostrar modal
      if ((data.requiresAuth || data.mode === 'auth_required') && !localStorage.getItem('mia_auth_requested')) {
        // Marcar que ya se pidió auth para esta conversación
        localStorage.setItem('mia_auth_requested', 'true');
        // Guardar el último mensaje para reenviarlo después del login
        localStorage.setItem('mia_pending_message', mensaje);
        showLoginModal();
        return;
      }
      
      // Actualizar conversación actual
      const newConversation = [
        ...currentConversation,
        mensaje,           // Mensaje del usuario
        data.respuesta     // Respuesta de Mia
      ];
      
      setCurrentConversation(newConversation);
      localStorage.setItem('mia_current_conversation', JSON.stringify(newConversation));
      
      // Limpiar mensaje pendiente y flag de auth
      localStorage.removeItem('mia_pending_message');
      localStorage.removeItem('mia_auth_requested');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
};

// ⚠️ CRÍTICO: Después del login exitoso, reenviar el último mensaje UNA SOLA VEZ
const handleLoginSuccess = async (idToken) => {
  console.log('✅ Login exitoso, reenviando mensaje...');
  
  // Obtener el último mensaje del usuario (antes de que Mia pidiera auth)
  const pendingMessage = localStorage.getItem('mia_pending_message');
  
  if (pendingMessage && currentConversation.length > 0) {
    // Limpiar flag de auth antes de reenviar
    localStorage.removeItem('mia_auth_requested');
    
    // Reenviar el mensaje con el nuevo token y la conversación completa
    await handleSendMessage(pendingMessage, null, idToken);
  } else {
    console.warn('⚠️ No hay mensaje pendiente para reenviar');
  }
};

// Al iniciar nueva conversación, limpiar TODOS los flags
const handleNewConversation = () => {
  setCurrentConversation([]);
  localStorage.removeItem('mia_current_conversation');
  localStorage.removeItem('mia_pending_message');
  localStorage.removeItem('mia_auth_requested');
};
```

### 2. **Limpiar Conversación al Salir o Refrescar**

**⚠️ CRÍTICO**: La conversación actual debe limpiarse al refrescar la página para evitar usar contexto antiguo.

```javascript
// Opción 1: Usar sessionStorage (se borra automáticamente al cerrar pestaña)
// RECOMENDADO para evitar problemas de contexto antiguo
const storage = sessionStorage;

const [currentConversation, setCurrentConversation] = useState(() => {
  const saved = storage.getItem('mia_current_conversation');
  return saved ? JSON.parse(saved) : [];
});

// Guardar en sessionStorage cada vez que cambie
useEffect(() => {
  if (currentConversation.length > 0) {
    storage.setItem('mia_current_conversation', JSON.stringify(currentConversation));
  }
}, [currentConversation]);

// Opción 2: Si usas localStorage, limpiar al montar el componente
useEffect(() => {
  // Limpiar conversación anterior al iniciar
  localStorage.removeItem('mia_current_conversation');
  localStorage.removeItem('mia_pending_message');
  localStorage.removeItem('mia_auth_requested');
  setCurrentConversation([]);
}, []); // Solo al montar

// Al cerrar sesión
const handleLogout = () => {
  sessionStorage.removeItem('mia_current_conversation');
  localStorage.removeItem('mia_pending_message');
  localStorage.removeItem('mia_auth_requested');
  setCurrentConversation([]);
  // ... resto del logout
};
```

### 3. **Manejo de Respuestas del Backend**

El backend ahora devuelve información adicional:

```javascript
{
  "success": true,
  "respuesta": "¡Hola hermosa! ¿Qué tipo de prenda buscas? 💕",
  "mode": "discovery" | "recommendation" | "auth_required",
  "userId": "uid123...",
  "datosExtraidos": {
    "prendas": ["VESTIDOS", "BLUSAS"],
    "tallas": ["32", "34", "32-34"],
    "colores": ["rojo", "negro"],
    "ocasiones": ["fiesta", "elegante"],
    "estilos": ["elegante", "sexy"]
  },
  "datosCompletos": true | false,
  "datosFaltantes": ["categoria", "talla"]
}
```

**Uso recomendado:**

```javascript
const handleResponse = (data) => {
  // Mostrar respuesta de Mia
  addMessageToUI(data.respuesta, 'assistant');
  
  // Mostrar indicador visual de progreso (opcional)
  if (data.mode === 'discovery' && !data.datosCompletos) {
    showProgressIndicator(data.datosExtraidos, data.datosFaltantes);
  }
  
  // Si requiere autenticación
  if (data.mode === 'auth_required' || data.requiresAuth) {
    showLoginModal();
  }
  
  // Si ya está en modo recomendación
  if (data.mode === 'recommendation') {
    highlightRecommendedProducts();
  }
};

// Ejemplo de indicador visual
const showProgressIndicator = (extraidos, faltantes) => {
  return (
    <div className="progress-indicator">
      {extraidos.prendas.length > 0 && <Badge>✅ Prenda: {extraidos.prendas[0]}</Badge>}
      {extraidos.tallas.length > 0 && <Badge>✅ Talla: {extraidos.tallas.join(', ')}</Badge>}
      {faltantes.includes('categoria') && <Badge variant="outline">⏳ Necesito saber qué prenda buscas</Badge>}
      {faltantes.includes('talla') && <Badge variant="outline">⏳ Necesito saber tu talla</Badge>}
    </div>
  );
};
```

### 4. **Botón "Nueva Conversación"**

Agregar un botón para iniciar una nueva conversación:

```javascript
const handleNewConversation = () => {
  const confirmar = confirm('¿Iniciar una nueva búsqueda? Se perderá la conversación actual.');
  
  if (confirmar) {
    setCurrentConversation([]);
    localStorage.removeItem('mia_current_conversation');
    // Opcionalmente, enviar un mensaje inicial
    // handleSendMessage('Hola');
  }
};

// En el UI
<Button onClick={handleNewConversation}>
  🔄 Nueva Búsqueda
</Button>
```

---

## 🆕 Cambios Opcionales pero Recomendados

### 5. **Validación de Tallas en el UI**

Agregar botones rápidos para tallas comunes:

```javascript
const TallaSelector = ({ onSelect }) => {
  const tallas = ['Chica (28-30)', 'Mediana (32-34)', 'Grande (36-40)', 'XL (42)', '2XL (44)'];
  
  return (
    <div className="talla-selector">
      <p>¿Cuál es tu talla?</p>
      {tallas.map(talla => (
        <Button key={talla} onClick={() => onSelect(talla)}>
          {talla}
        </Button>
      ))}
      <Input 
        placeholder="O escribe tu talla exacta (ej: 32, 36)" 
        onBlur={(e) => onSelect(e.target.value)}
      />
    </div>
  );
};
```

### 6. **Persistencia con sessionStorage vs localStorage**

```javascript
// localStorage: persiste entre sesiones (incluso si cierra el navegador)
// sessionStorage: se borra al cerrar la pestaña

// Recomendación:
// - Usar sessionStorage para conversación actual (se borra al cerrar)
// - Usar localStorage solo si quieres que persista entre sesiones

const storage = sessionStorage; // o localStorage

const [currentConversation, setCurrentConversation] = useState(() => {
  const saved = storage.getItem('mia_current_conversation');
  return saved ? JSON.parse(saved) : [];
});

useEffect(() => {
  storage.setItem('mia_current_conversation', JSON.stringify(currentConversation));
}, [currentConversation]);
```

---

## 🔍 Flujo Completo del Usuario

1. **Usuario inicia conversación** → Frontend envía mensaje sin auth, `currentConversation = []`
2. **Backend pregunta por prenda Y talla** (intenta obtener ambos) → Frontend actualiza `currentConversation`
3. **Usuario responde "vestido mediana"** → Backend extrae `prendas: ["VESTIDOS"]`, `tallas: ["32", "34"]`, detecta datos completos
4. **Backend pide autenticación** → Frontend muestra modal de login
5. **⚠️ CRÍTICO: Usuario inicia sesión** → Frontend **DEBE reenviar el ÚLTIMO mensaje CON la conversación completa** para que el backend tenga contexto
6. **Backend recomienda productos** → Filtra catálogo con algoritmo (solo vestidos con tallas 32-34)
7. **Usuario termina o sale** → Frontend limpia `localStorage/sessionStorage`

### ⚠️ IMPORTANTE: Reenvío después del Login

Cuando el usuario hace login, el frontend DEBE:
```javascript
const handleLoginSuccess = async (idToken) => {
  // ✅ REENVIAR el último mensaje con el token nuevo
  // para que el backend tenga toda la conversación
  const lastUserMessage = currentConversation[currentConversation.length - 2]; // Penúltimo (último del usuario)
  
  await handleSendMessage(lastUserMessage, null, idToken); // Reenviar con auth
};
```

---

## 🐛 Debugging

Agregar logs para verificar el flujo:

```javascript
console.log('📤 Enviando a Mia:', {
  mensajeLength: mensaje.length,
  tieneImagen: !!imagen,
  conversacionActual: currentConversation.length,
  autenticado: !!idToken
});

console.log('📥 Respuesta de Mia:', {
  modo: data.mode,
  datosCompletos: data.datosCompletos,
  datosFaltantes: data.datosFaltantes,
  datosExtraidos: data.datosExtraidos
});
```

---

## ✅ Checklist de Implementación

- [ ] Agregar estado `currentConversation` con localStorage/sessionStorage
- [ ] Enviar `currentConversation` en cada request al backend
- [ ] Actualizar `currentConversation` después de cada respuesta
- [ ] **⚠️ CRÍTICO**: Guardar mensaje pendiente cuando pide auth
- [ ] **⚠️ CRÍTICO**: Reenviar mensaje después del login con token + conversación
- [ ] Limpiar conversación al logout
- [ ] Manejar `mode: 'auth_required'` mostrando modal de login
- [ ] Mostrar indicador visual de progreso (opcional)
- [ ] Agregar botón "Nueva Conversación"
- [ ] Agregar selector rápido de tallas (opcional)
- [ ] Agregar logs de debugging

---

## 📞 Notas Importantes

1. **✅ USAR sessionStorage en lugar de localStorage** para la conversación actual. Esto asegura que se limpie automáticamente al cerrar la pestaña y evita problemas de contexto antiguo.

2. **⚠️ LIMPIAR al refrescar la página**: Si usas localStorage, debes limpiar la conversación al montar el componente para evitar que use contexto de conversaciones anteriores.

3. **SÍ eliminar la conversación** al:
   - Refrescar la página (automático con sessionStorage)
   - Cerrar sesión
   - Hacer clic en "Nueva Conversación"

4. **⚠️ EVITAR DOBLE LOGIN**: 
   - Usar flag `mia_auth_requested` para evitar mostrar modal de login múltiples veces
   - Solo reenviar el mensaje pendiente UNA VEZ después del login
   - Limpiar todos los flags al iniciar nueva conversación

5. **⚠️ CRÍTICO: Después del login, REENVIAR el último mensaje** con la conversación completa y el nuevo token. De lo contrario, el backend perderá el contexto.

6. **El backend SOLO usa la conversación actual** del frontend. NO usa historial previo de Firebase para recomendaciones.

7. **Las conversaciones se guardan en Firebase** automáticamente cuando el usuario está autenticado (para marketing), pero NO afectan las recomendaciones futuras.

8. **NUNCA enviar `currentConversation` vacío** después del primer mensaje. Siempre debe incluir toda la conversación hasta el momento.

---

## 🎨 Ejemplo de UI Mejorado

```jsx
const AsesorEstilo = () => {
  const [messages, setMessages] = useState([]);
  const [currentConversation, setCurrentConversation] = useState([]);
  const [datosExtraidos, setDatosExtraidos] = useState({});
  const [datosFaltantes, setDatosFaltantes] = useState([]);
  
  return (
    <div className="asesor-container">
      <Header>
        <h1>Mia - Tu Asesora de Estilo</h1>
        <Button onClick={handleNewConversation}>🔄 Nueva Búsqueda</Button>
      </Header>
      
      {/* Indicador de progreso */}
      {datosFaltantes.length > 0 && (
        <ProgressBar datos={datosExtraidos} faltantes={datosFaltantes} />
      )}
      
      {/* Mensajes */}
      <MessageList messages={messages} />
      
      {/* Input */}
      <MessageInput onSend={handleSendMessage} />
    </div>
  );
};
```

---

¿Necesitas ayuda con alguna parte específica de la implementación en el frontend?
