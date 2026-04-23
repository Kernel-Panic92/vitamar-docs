# DocFlow v1.1.5

## Novedades de esta versión
- Panel de configuración completo con 8 pestañas: General, IMAP, SMTP, Tiempos, Seguridad, Backups, Tareas, Actualizar
- Configuración de empresa: nombre, NIT, logo (subir imagen o URL)
- Test de conexión IMAP y SMTP con feedback visual
- Página de auditoría con estadísticas: accesos hoy, eventos flujo, intentos fallidos
- Registro de IPs con más intentos fallidos
- Fail2ban: instalación, inicio/parada/reinicio, configuración
- Rate limiting configurable
- Backups automáticos con configuración de retención
- Backup en NAS SMB con test de conexión
- Tareas programadas (CRON) configurables
- Sistema de actualización del sistema con verificación y logs en tiempo real
- Módulos de Pendientes y Aprobaciones restaurados

## Funcionalidades del sistema
- Gestión de facturas electrónicas (DIAN)
- Workflow de aprobación (Recepción → Revisión → Aprobación → Causación → Pagada)
- Módulos: Dashboard, Facturas, Pendientes, Aprobaciones, Causación
- Configuración: Áreas, Centros, Categorías
- Gestión de usuarios con roles (admin, contador, tesorero, comprador, auditor)
- Backup completo (DB + uploads)
- Sincronización de correo IMAP
- Sistema de notificaciones
- Seguridad con JWT

## Bug fixes
- Corregido conflicto de merge al actualizar desde UI
- Updater ahora usa reset --hard para evitar conflictos

## Instalación
```bash
git clone https://github.com/Kernel-Panic92/docflow.git
cd docflow
npm install
cp .env.example .env
npm run migrate
pm2 start src/server.js --name docflow
```

## Credenciales por defecto
- Email: admin@docflow.com
- Password: docflow2025