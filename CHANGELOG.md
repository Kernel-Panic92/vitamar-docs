# DocFlow - Changelog

## v1.1.12 - Updater Fix
Fecha: 2026-04-24

### Updater (Fix crítico)
- ✅ Fix: git fetch con flag inválido `--all` → usar solo `git fetch origin --prune`
- ✅ Mostrar commits local y remote directamente en la UI
- ✅ No depende de archivo de log (funciona sin permisos de escritura en logs/)
- ✅ Detecta nueva versión correctamente

## v1.1.11 - Updater Improvements
Fecha: 2026-04-24

### Updater
- ✅ Log local y remote commits en verificación
- ✅ Añadir remoteCommit a la respuesta del API

## v1.1.10 - Updater Fix
Fecha: 2026-04-24

### Updater
- ✅ Fix: compare commits directly (HEAD vs origin/main)
- ✅ Force fetch all remotes and prune
- ✅ Show actual commit hash when update available

## v1.1.9 - NAS Backup Fixes
Fecha: 2026-04-24

### NAS Backup Configuration
- ✅ Added RUTA COMPARTIDA input field (was missing)
- ✅ Fix sanitizeShellArg corrupting "nas" in paths (nas → as)
- ✅ Backup now copies to NAS using smbclient
- ✅ Allow guest access without password
- ✅ Fix host sanitization preserving dots (192.168.0.10)

### IMAP Sync
- ✅ Fix cron validation allowing */120 format
- ✅ Allow empty cron to disable sync

## v1.1.8 - SMTP & UI Improvements
Fecha: 2026-04-24

### NAS Backup Configuration
- ✅ Added RUTA COMPARTIDA input field (was missing)
- ✅ Fix sanitizeShellArg corrupting "nas" in paths (nas → as)
- ✅ Backup now copies to NAS using smbclient
- ✅ Allow guest access without password
- ✅ Fix host sanitization preserving dots (192.168.0.10)

### IMAP Sync
- ✅ Fix cron validation allowing */120 format
- ✅ Allow empty cron to disable sync

## v1.1.8 - SMTP & UI Improvements
Fecha: 2026-04-24

### Security Updates
- ✅ Updated all dependencies to fix vulnerabilities:
  - adm-zip: 0.5.14 → 0.5.17 (path traversal fix)
  - express: 4.19.2 → 4.21.0 (security headers)
  - multer: 1.4.5-lts.1 → 2.1.1 (8 DoS fixes)
  - nodemailer: 6.9.16 → 8.0.5 (SMTP injection fixes)
  - uuid: 10.0.0 → 11.0.5 (buffer bounds check)
- ✅ Added Node.js 20+ requirement (engines field)
- ✅ Added overrides for transitive dependencies
- ✅ All 12 vulnerabilities resolved

### SMTP Configuration
- ✅ SSL/TLS options: STARTTLS (587) or SSL (465)
- ✅ UI dropdown to select encryption method
- ✅ Load SMTP config from database, not just .env
- ✅ Clear cache when config changes
- ✅ Fix: from address must match authenticated user (550 error)
- ✅ Added SMTP_SECURE, SMTP_REQUIRE_TLS env variables

### UI Improvements
- ✅ New module: Áreas (manage organizational areas)
- ✅ New module: Por Pagar (for tesorero/admin)
- ✅ Dashboard: stats for admin include all metrics
- ✅ Fix: isAdmin not defined error
- ✅ Fix: APP_DIR undefined in backups UI
- ✅ Fix: SyntaxError with backticks in onclick attributes

### Bug Fixes (Pending)
- ⏳ **413 Payload Too Large** when restoring backups
  - File upload size limit needs adjustment

## v1.1.7 - Security Hardening
Fecha: 2026-04-23

### Security Audit Fixes
- ✅ **AUTH**: All routes now require authentication + role checks
  - /facturas/* - all endpoints protected
  - /configuracion/imap/test, /smtp/test - admin only
  - PDF and payment receipt downloads - require auth
- ✅ **COMMAND INJECTION**: Input validation and sanitization
  - Cron expression validation with regex
  - Shell argument sanitization
  - Numeric value range validation
- ✅ **INFORMATION LEAKAGE**: Safe error handling in production
  - Generic error messages returned to clients
  - Detailed errors logged server-side only
- ✅ **CREDENTIALS**: IMAP debug logging disabled
- ✅ **BACKUP**: Placeholder hash improved with documentation

### Usability Improvements
- ✅ Pendientes module with filters and search
- ✅ Filters: Todas, Sin aprobar, Sin pagar, Por vencer
- ✅ Badge de estado visible per invoice
- ✅ Color-coded by type: yellow (pending), purple (unpaid), red (due soon)

### Bug Fixes
- ✅ Fix updater: uses `reset --hard` to avoid merge conflicts
- ✅ CRON jobs disabled (pending DIAN API integration)
- ✅ Fixed undefined dates in facturas filters

### Code Cleanup
- ✅ Removed Aprobaciones module (redundant with Pendientes)
- ✅ Created release v1.1.5 for recovery

---

## v1.1.6 - Mejoras de usabilidad y limpieza de código
Fecha: 2026-04-23

### Nuevas funcionalidades
- ✅ Módulo Pendientes con filtros y búsqueda
- ✅ Filtros en Pendientes: Todas, Sin aprobar, Sin pagar, Por vencer
- ✅ Buscador por número de factura o proveedor
- ✅ Badge de estado visible en cada factura (Recibida, En revisión, Aprobada, Causada, etc.)
- ✅ Colores diferenciados por tipo: amarillo (sin aprobar), morado (sin pagar), rojo (por vencer)

### Mejoras técnicas
- ✅ Fix updater: usa `reset --hard` para evitar conflictos de merge al actualizar desde UI
- ✅ CRON jobs deshabilitados (pendiente integración API DIAN)
- ✅ Arreglado error de fechas undefined en filtros de facturas
- ✅ **SEGURIDAD**: Agregado authMiddleware a todas las rutas vulnerables:
  - /facturas/* (todas las rutas)
  - /configuracion/imap/test, /smtp/test
  - /usuarios/simple
  - Descarga de PDFs y soporte de pago
- ✅ **SEGURIDAD**: Previene command injection:
  - Validación de expresiones cron
  - Sanitización de argumentos shell
  - Validación de valores numéricos en rangos seguros
- ✅ **SEGURIDAD**: Manejo seguro de errores - oculta detalles en producción
- ✅ **SEGURIDAD**: Logger IMAP desactivado (evitaba filtrar credenciales en logs)
- ✅ **SEGURIDAD**: Placeholder hash de backup mejor documentado y seguro

### Limpieza de código
- ✅ Eliminado módulo Aprobaciones (redundante con Pendientes)
- ✅ Creada release v1.1.5 para recuperación

---

## v1.1.5 - Panel de configuración completo + Auditoría
Fecha: 2026-04-22

### Nuevas funcionalidades
- ✅ Panel de configuración con pestañas: General, IMAP, SMTP, Tiempos, Seguridad, Backups, Tareas, Actualizar
- ✅ Configuración de empresa: nombre, NIT, logo (subir imagen o URL)
- ✅ Test de conexión IMAP y SMTP con feedback visual
- ✅ Página de auditoría con estadísticas: accesos hoy, eventos flujo, intentos fallidos
- ✅ Registro de IPs con más intentos fallidos
- ✅ Fail2ban: instalación, inicio/parada/reinicio, configuración (bantime, findtime, maxretry)
- ✅ Rate limiting configurable (ventana, máximo peticiones)
- ✅ Backups automáticos con configuración de retención
- ✅ Backup en NAS SMB con test de conexión
- ✅ Tareas programadas (CRON) configurables: IMAP, Escalaciones, DIAN tácita, Notificaciones
- ✅ Sistema de actualización del sistema con verificación y logs en tiempo real
- ✅ Mejoras en centros de operación: dirección, teléfono, email, descripción

### Mejoras visuales
- ✅ UI de configuración mejorada con badges de estado
- ✅ Verbose paso a paso en actualización del sistema
- ✅ Previsualización de logo por URL

---

## v1.1.4 - Optimización de backups
Fecha: 2026-04-20

### Mejoras implementadas
- ✅ Backup completo usa tar.gz para uploads (mucho más rápido con 80k+ archivos)
- ✅ Verbose paso a paso en el modal de backup
- ✅ Botón cancelar funciona correctamente

### Bugs conocidos
- ⚠️ Backup completo puede fallar con error "value out of range (78095)" - en investigación
- ⚠️ Instalar tiene conflictos de merge al actualizar desde GUI

---

## v1.1.3 - Corrección de vulnerabilidades de seguridad
Fecha: 2026-04-18

### Seguridad corregida
- ✅ RCE en actualizador: Validación de rama git con regex (solo permite main, master, release)
- ✅ RCE en test SMB: Sanitización de host/user/pass, encodeURIComponent en URL
- ✅ Validación de parámetros requeridos en backups-auto/test

---

## v1.0.1 - Release estable
Fecha: 2026-04-18

### Features implementados
- ✅ Gestión de facturas electrónicas (DIAN)
- ✅ Workflow de aprobación (Recepción → Revisión → Aprobación → Causación → Pagada)
- ✅ Módulos: Dashboard, Facturas, Pendientes, Causación
- ✅ Configuración: Áreas, Centros, Categorías
- ✅ Gestión de usuarios con roles (admin, contador, tesorero, comprador, auditor)
- ✅ Backup completo (DB + uploads) ~1GB
- ✅ Sincronización de correo IMAP para recibir facturas automáticamente
- ✅ Sistema de notificaciones
- ✅ Seguridad con JWT
- ✅ Sincronización de correo IMAP para recibir facturas automáticamente
- ✅ Sistema de notificaciones
- ✅ Seguridad con JWT

---

## Bugs conocidos / Notas técnicas

### ⚠️ Código de backup.js roto
Los commits `73dd3b8` y `0dae77f` tienen errores de sintaxis en `src/routes/backup.js`. Causado por código async incompleto. Versión estable: `35315d6`.

### ⚠️ Password hardcoded en seed.js
Línea 135: `console.log('    Password: docflow2025');` - Debería usar variable de entorno.

### ⚠️ Console.log de debug
Hay 88+ occurrences de console.log en el código, algunos con datos sensibles. Para producción debería reducirse.

### ⚠️ IMAP debug activo
`src/services/imap.service.js` línea 402 tiene debug activo que logged datos sensibles.

### ⚠️ Seguridad
- No hay rate limiting visible
- Token JWT no tiene blacklist (logout no invalida tokens anteriores)

### ⚠️ Backup async no funcional
La funcionalidad de backup async/background nunca pudo completarse. Funciona la versión old (sync).

### ⚠️ Sin tests automatizados
No hay tests unitarios ni de integración.

---

## Historial de versiones

| Tag | Fecha | Notas |
|-----|-------|-------|
| v1.1.5 | 2026-04-22 | Panel configuración completo + Auditoría |
| v1.1.4 | 2026-04-20 | Optimización de backups |
| v1.1.3 | 2026-04-18 | Corrección vulnerabilidades RCE |
| v1.1.2 | 2026-04-18 | Actualizaciones via release (con bugs) |
| v1.1.0 | 2026-04-18 | Corrección bug backup completo |
| v1.0.1 | 2026-04-18 | Release estable |

---

## Instalación

```bash
# Clone project
git clone https://github.com/Kernel-Panic92/docflow.git
cd docflow

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# edit .env with credentials

# Run migrations
npm run migrate

# Start
pm2 start src/server.js --name docflow
```

## Acceso inicial
- Email: admin@docflow.com
- Password: (configurado en .env o durante setup)