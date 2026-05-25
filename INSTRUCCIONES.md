# 📋 Liquidación de Viáticos — Guía de instalación

## ¿Qué vas a lograr?
Una app instalada en tu escritorio (como si fuera un programa), accesible desde cualquier dispositivo,
que procesa facturas con IA y exporta liquidaciones en Excel.

---

## PASO 1 — Conseguir tu API Key de Anthropic (gratis)

1. Entrá a https://console.anthropic.com
2. Creá una cuenta (es gratis)
3. Ir a "API Keys" → "Create Key"
4. Copiá la clave (empieza con `sk-ant-...`)
5. **Guardala**, la vas a necesitar después

> La API tiene créditos gratis para empezar (~$5 USD de uso).

---

## PASO 2 — Subir la app a Vercel (gratis, 5 minutos)

### Opción A: Con GitHub (recomendada)

1. Crear cuenta en https://github.com (si no tenés)
2. Crear repositorio nuevo → "New repository" → nombre: `viaticos-app`
3. Subir estos archivos al repositorio
4. Ir a https://vercel.com → "Sign up with GitHub"
5. Click en "Add New Project" → seleccionar `viaticos-app`
6. Click en "Deploy" — Vercel lo configura solo
7. En ~2 minutos tenés tu URL: `viaticos-app.vercel.app`

### Opción B: Subida directa (más simple)

1. Crear cuenta en https://vercel.com
2. Ir a https://vercel.com/new
3. Arrastrar la carpeta del proyecto
4. Click "Deploy"

---

## PASO 3 — Instalar en el escritorio

### En Windows / Mac (Chrome o Edge):
1. Abrir la URL de tu app en Chrome o Edge
2. En la barra de direcciones aparece un ícono de "Instalar" (➕)
3. O click en el botón naranja **"📲 Instalar en escritorio"** que aparece en la app
4. Confirmar → se crea el ícono en el escritorio

### En iPhone (Safari):
1. Abrir la URL en Safari
2. Click en el botón de compartir (□↑)
3. "Añadir a la pantalla de inicio"

### En Android (Chrome):
1. Abrir la URL en Chrome
2. Click en los tres puntos → "Añadir a pantalla de inicio"

---

## PASO 4 — Primer uso

1. Abrir la app (desde el escritorio o la URL)
2. Click en 🔑 **API Key** → pegar tu clave de Anthropic → Guardar
3. Completar nombre, departamento y período
4. ¡Empezar a cargar comprobantes!

---

## Estructura de archivos

```
viaticos-app/
├── public/
│   ├── index.html        ← HTML base con configuración PWA
│   ├── manifest.json     ← Configuración de la app instalable
│   └── sw.js             ← Service Worker (funciona offline)
├── src/
│   ├── index.js          ← Punto de entrada
│   └── App.js            ← La app completa
├── package.json          ← Dependencias
└── vercel.json           ← Configuración de Vercel
```

---

## Preguntas frecuentes

**¿La API Key es segura?**
Sí, se guarda solo en tu navegador (localStorage). Nunca pasa por ningún servidor externo.

**¿Funciona sin internet?**
La interfaz carga offline, pero necesitás conexión para procesar facturas con IA.

**¿Cuánto cuesta?**
- Vercel: gratis para uso personal
- Anthropic API: ~$0.003 por factura procesada (muy barato)

**¿Puedo usarlo desde el celular?**
Sí, la URL funciona en cualquier dispositivo. Podés "instalarlo" también en el celular.

---

## Soporte y actualizaciones

Para agregar Google Drive o el bot de WhatsApp en el futuro,
el proyecto ya está preparado para esas integraciones.
