# Vitamar Docs - Changelog

## v1.0.1 - Release estable
Fecha: 2026-04-18

### Features implementados
- ✅ Gestión de facturas electrónicas (DIAN)
- ✅ Workflow de aprobación (Recepción → Revisión → Aprobación → Causación → Pagada)
- ✅ Múltiples módulos: Dashboard, Facturas, Pendientes, Aprobaciones, Causación
- ✅ Configuración: Áreas, Centros, Categorías
- ✅ Gestión de usuarios con roles (admin, contador, tesorero, comprador, auditor)
- ✅ Backup completo (DB + uploads) ~1GB
- ✅ Sincronización de correo IMAP para recibir facturas automáticamente
- ✅ Sistema de notificaciones
- ✅ Seguridad con JWT

---

## Bugs conocidos / Notas técnicas

### ⚠️ Código de backup.js roto
Los commits `73dd3b8` y `0dae77f` tienen errores de sintaxis en `src/routes/backup.js`. Causado por código async incompleto. Versión estable: `35315d6`.

### ⚠️ Password hardcoded en seed.js
Línea 135: `console.log('    Password: vitamar2025');` - Debería usar variable de entorno.

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
| v1.1.2 | 2026-04-18 | Actualizaciones via release (con bugs) |
| v1.1.0 | 2026-04-18 | Corrección bug backup completo |
| v1.0.1 | 2026-04-18 | Release estable |

---

## Instalación

```bash
#克隆项目
git clone https://github.com/Kernel-Panic92/vitamar-docs.git
cd vitamar-docs

#安装依赖
npm install

#配置环境变量
cp .env.example .env
# editar .env con credenciales

#Ejecutar migraciones
npm run migrate

#Iniciar
pm2 start src/server.js --name vitamar-docs
```

## Acceso inicial
- Email: admin@vitamar.com
- Password: (configurado en .env o durante setup)