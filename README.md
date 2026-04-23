# DocFlow

Sistema de gestión documental para facturas electrónicas colombianas (DIAN). Importa automáticamente facturas desde correo IMAP, las procesa mediante un flujo de aprobación configurable y las envía a causación y pago.

## Stack

- **Backend:** Node.js 18+ / Express
- **Base de datos:** PostgreSQL 14+
- **Auth:** JWT con rate limiting
- **Correo:** IMAP (FortiMail Cloud)
- **Jobs:** node-cron

---

## Instalación rápida (recomendada)

```bash
# Clonar el repositorio
git clone https://github.com/Kernel-Panic92/docflow.git
cd docflow

# Ejecutar el instalador interactivo
chmod +x install.sh
./install.sh
```

El instalador configurará automáticamente:
- Node.js y PM2
- PostgreSQL
- Base de datos y migraciones
- Variables de entorno (.env)
- Proxy reverso con Nginx (opcional)
- HTTPS con Let's Encrypt (opcional)
- Backup automático (opcional)
- Fail2ban para protección

---

## Requisitos del servidor

- Ubuntu Server 22.04 LTS (o cualquier distribución basada en Debian)
- 2 vCPU, 4GB RAM, 40GB disco (mínimo)
- PostgreSQL 14+
- Node.js 18+

---

## Instalación rápida

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/docflow.git
cd docflow
```

### 2. Instalar dependencias del sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm postgresql postgresql-contrib nginx \
  certbot python3-certbot-nginx git
```

### 3. Configurar PostgreSQL

```bash
sudo -u postgres psql -c "CREATE DATABASE docflow;"
sudo -u postgres psql -c "CREATE USER docflow WITH ENCRYPTED PASSWORD 'TU_PASSWORD_FUERTE';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE docflow TO docflow;"
sudo -u postgres psql -d docflow -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### 4. Instalar dependencias de Node

```bash
npm install
```

### 5. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Valores mínimos necesarios:

```env
NODE_ENV=production
PORT=3100
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=5432
DB_NAME=docflow
DB_USER=docflow
DB_PASSWORD=TU_PASSWORD_FUERTE
JWT_SECRET=$(openssl rand -hex 32)
UPLOAD_DIR=./uploads
```

### 6. Ejecutar migraciones

```bash
node src/db/migrate.js
```

### 7. Cargar datos iniciales (opcional)

```bash
node src/db/seed.js
```

### 8. Instalar PM2 y arrancar

```bash
sudo npm install -g pm2
pm2 start src/server.js --name docflow
pm2 startup  # Seguir instrucciones para persistir al reiniciar
pm2 save
```

### 9. Crear carpetas de uploads

```bash
mkdir -p uploads/facturas uploads/soportes
```

---

## Proxy reverso con Nginx

### Crear configuración

```bash
sudo nano /etc/nginx/sites-available/docflow
```

```nginx
server {
    listen 80;
    server_name TU_DOMINIO_O_IP;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/docflow /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### SSL con Let's Encrypt (opcional)

```bash
sudo certbot --nginx -d TU_DOMINIO
```

---

## Verificación

```bash
# Verificar que el servicio está corriendo
pm2 status

# Ver logs en tiempo real
pm2 logs docflow

# Reiniciar si es necesario
pm2 restart docflow
```

Accede a `http://TU_SERVIDOR:3100` o a través de Nginx en `http://TU_DOMINIO`

---

## Acceso inicial

```
Email:    admin@docflow.com
Password: docflow2025
```

⚠️ Cambiar la contraseña en el primer acceso.

---

## Migraciones adicionales (si se actualiza desde versión anterior)

Si ya tenías una base de datos, ejecuta estas migraciones manualmente:

```bash
psql -h localhost -U docflow -d docflow -c "
-- Agregar columna jefe_id a áreas (FK a usuarios)
ALTER TABLE areas ADD COLUMN IF NOT EXISTS jefe_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Agregar columna referencia a facturas
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS referencia VARCHAR(100);

-- Agregar columna orden_compra
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS orden_compra VARCHAR(100);

-- Agregar columnas para soporte de pago
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS soporte_pago VARCHAR(255);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS soporte_pago_nombre VARCHAR(255);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pagada_en TIMESTAMPTZ;

-- Crear tabla categorías de usuario
CREATE TABLE IF NOT EXISTS categorias_usuario (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias_compra(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, categoria_id)
);
"
```

---

## Estructura del proyecto

```
docflow/
├── src/
│   ├── server.js              # Entry point
│   ├── db/
│   │   ├── index.js           # Pool PostgreSQL
│   │   ├── migrate.js         # Schema migrations
│   │   └── seed.js            # Datos iniciales
│   ├── middleware/
│   │   └── auth.js            # JWT + roles
│   ├── routes/
│   │   ├── auth.js            # Login, logout, password
│   │   ├── areas.js           # CRUD áreas
│   │   ├── facturas.js        # CRUD + flujo estados
│   │   ├── categorias.js      # Categorías de compra
│   │   ├── centros.js         # Centros de operación
│   │   ├── usuarios.js        # CRUD usuarios
│   │   ├── configuracion.js   # Config IMAP/SMTP
│   │   ├── audit.js           # Log de auditoría
│   │   ├── backup.js          # Backup/Restore
│   │   └── sync.js           # Sincronización IMAP
│   └── services/
│       ├── imap.service.js    # Ingesta correo
│       ├── sync-state.js      # Estado de sincronización
│       ├── cron.service.js    # Escalaciones + DIAN
│       └── notifications.service.js
├── public/
│   ├── index.html             # SPA frontend
│   ├── app.js                 # JavaScript frontend
│   └── reset-password.html
├── uploads/                   # PDFs y XMLs
├── backups/                   # Backups generados
├── logs/                      # Logs de sync
└── README.md
```

---

## Variables de entorno

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `NODE_ENV` | Modo de operación | `development` |
| `PORT` | Puerto del servidor | `3100` |
| `HOST` | Host de绑定 | `0.0.0.0` |
| `DB_HOST` | Host PostgreSQL | `localhost` |
| `DB_PORT` | Puerto PostgreSQL | `5432` |
| `DB_NAME` | Nombre base de datos | `docflow` |
| `DB_USER` | Usuario PostgreSQL | `postgres` |
| `DB_PASSWORD` | Password PostgreSQL | — |
| `JWT_SECRET` | Clave secreta JWT | — |
| `UPLOAD_DIR` | Carpeta uploads | `./uploads` |

---

## Roles de usuario

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso total, configuración |
| `contador` | Categorías, causación |
| `tesorero` | Causación, pagos |
| `comprador` | Revisar y aprobar facturas |
| `auditor` | Solo lectura |

---

## Flujo de estados

```
recibida → revision → aprobada → causada → pagada
                   ↘ rechazada
```

### Jobs automáticos
- **Cada 30 min:** Verifica facturas sin acción → escalaciones
- **Cada hora:** Marca aceptación tácita DIAN (48h sin respuesta)

---

## Configuración IMAP

La configuración de IMAP/SMTP se gestiona desde la GUI en **Configuración** → **IMAP**. Los valores se guardan en la tabla `configuracion` de la base de datos.

---

## Backup

El sistema incluye backup/restore completo desde la GUI (**Backup y Restauración**):

- Exportar: Genera y descarga un ZIP con todos los datos
- Restaurar desde servidor: Lista backups en el servidor
- Restaurar desde archivo: Drag & drop de un ZIP

---

## Rate Limiting

- Máximo 5 intentos de login en 5 minutos
- Bloqueo de 30 min tras intentos fallidos
- Admin puede ver IPs bloqueadas

---

## Actualización

### Método automático (recomendado)

```bash
cd docflow
chmod +x update.sh
./update.sh
```

El actualizador:
1. Hace backup preventivo automáticamente
2. Descarga la última release desde GitHub
3. Actualiza archivos (mantiene `.env`, `uploads/`, `backups/`)
4. Instala dependencias
5. Ofrece ejecutar migraciones
6. Reinicia el servicio

**Requiere:** Token de GitHub en `~/.docflow_token` (para repos privados).

### Método manual

```bash
cd docflow
git pull
npm install
node src/db/migrate.js  # si hay migraciones pendientes
pm2 restart docflow
```


## Solución de problemas

### La app no inicia
```bash
pm2 logs docflow
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql
```

### Error de conexión a BD
Verificar credenciales en `.env` y que PostgreSQL acepta conexiones desde `localhost`.

### IMAP no sincroniza
Verificar configuración en la GUI y que las credenciales IMAP son correctas.

### Permisos en uploads
```bash
sudo chown -R $USER:$USER uploads backups logs
```
