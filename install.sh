#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  install.sh — Instalador automático de Vitamar Docs v1.0.0
#
#  Uso:
#    chmod +x install.sh
#    ./install.sh
# ═══════════════════════════════════════════════════════════════

set -e

VERDE="\033[0;32m"; AMARILLO="\033[1;33m"; ROJO="\033[0;31m"; AZUL="\033[0;34m"; RESET="\033[0m"
ok()   { echo -e "${VERDE}  ✓ $1${RESET}"; }
info() { echo -e "${AZUL}  → $1${RESET}"; }
warn() { echo -e "${AMARILLO}  ⚠ $1${RESET}"; }
err()  { echo -e "${ROJO}  ✗ $1${RESET}"; exit 1; }

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION="1.0.0"

echo ""
echo -e "${AZUL}══════════════════════════════════════════════${RESET}"
echo -e "${AZUL}   Vitamar Docs — Instalador v${VERSION}${RESET}"
echo -e "${AZUL}   Sistema de Gestión Documental${RESET}"
echo -e "${AZUL}══════════════════════════════════════════════${RESET}"
echo ""

[[ "$OSTYPE" != "linux-gnu"* ]] && err "Este instalador es para Linux (Ubuntu/Debian)."

# ── 1. Node.js ────────────────────────────────────────────────
info "Verificando Node.js..."
if ! command -v node &>/dev/null; then
  warn "Node.js no encontrado. Instalando v20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
NODE_VER=$(node -e 'process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)' 2>&1) \
  || err "Se requiere Node.js 18 o superior. Versión actual: $(node -v)"
ok "Node.js $(node -e 'console.log(process.version)')"

# ── 2. PM2 ────────────────────────────────────────────────────
info "Verificando PM2..."
if ! command -v pm2 &>/dev/null; then
  warn "PM2 no encontrado. Instalando..."
  sudo npm install -g pm2
fi
ok "PM2 $(pm2 -v)"

# ── 3. PostgreSQL ─────────────────────────────────────────────
info "Verificando PostgreSQL..."
if ! command -v psql &>/dev/null; then
  warn "PostgreSQL no encontrado. Instalando..."
  sudo apt-get update -qq
  sudo apt-get install -y postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
fi
PG_VER=$(psql --version | awk '{print $3}')
ok "PostgreSQL $PG_VER"

# ── 4. Dependencias npm ───────────────────────────────────────
info "Instalando dependencias npm..."
npm install --production --prefix "$INSTALL_DIR"
ok "Dependencias instaladas"

# ── 5. Configuración general ──────────────────────────────────
echo ""
echo -e "${AZUL}── Configuración general ────────────────────${RESET}"

read -p "  Puerto del servidor [3100]: " PUERTO
PUERTO=${PUERTO:-3100}

read -p "  Nombre de la empresa [Vitamar]: " EMPRESA
EMPRESA=${EMPRESA:-"Vitamar"}

# ── 6. Base de datos ──────────────────────────────────────────
echo ""
echo -e "${AZUL}── Base de datos PostgreSQL ─────────────────${RESET}"

read -p "  Host de PostgreSQL [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-"localhost"}

read -p "  Puerto de PostgreSQL [5432]: " DB_PORT
DB_PORT=${DB_PORT:-"5432"}

read -p "  Nombre de la base de datos [vitamar_docs]: " DB_NAME
DB_NAME=${DB_NAME:-"vitamar_docs"}

read -p "  Usuario de PostgreSQL [postgres]: " DB_USER
DB_USER=${DB_USER:-"postgres"}

read -s -p "  Contraseña de PostgreSQL: " DB_PASSWORD
echo ""
[[ -z "$DB_PASSWORD" ]] && err "La contraseña de PostgreSQL es requerida."

# Verificar conexión
info "Verificando conexión a PostgreSQL..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c '\q' 2>/dev/null \
  || err "No se pudo conectar a PostgreSQL. Verifica host, usuario y contraseña."
ok "Conexión a PostgreSQL exitosa"

# Crear base de datos si no existe
info "Verificando base de datos '$DB_NAME'..."
DB_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
  -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")
if [[ "$DB_EXISTS" != "1" ]]; then
  warn "Base de datos '$DB_NAME' no existe. Creando..."
  PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" \
    || err "No se pudo crear la base de datos '$DB_NAME'."
  ok "Base de datos '$DB_NAME' creada"
else
  ok "Base de datos '$DB_NAME' ya existe"
fi

# ── 7. FortiMail / IMAP ───────────────────────────────────────
echo ""
echo -e "${AZUL}── Integración FortiMail (IMAP) ─────────────${RESET}"
warn "El sistema leerá facturas automáticamente desde el correo."

read -p "  ¿Configurar FortiMail ahora? [s/N]: " CONF_IMAP
IMAP_HOST="" IMAP_PORT="993" IMAP_USER="" IMAP_PASSWORD="" IMAP_TLS="true" IMAP_POLL="5"

if [[ "$CONF_IMAP" =~ ^[Ss]$ ]]; then
  read -p "  Host FortiMail (ej: mail.vitamar.com): " IMAP_HOST
  [[ -z "$IMAP_HOST" ]] && err "El host de FortiMail es requerido."

  read -p "  Puerto IMAP [993]: " IMAP_PORT
  IMAP_PORT=${IMAP_PORT:-"993"}

  read -p "  Correo de facturas (ej: facturas@vitamar.com): " IMAP_USER
  [[ -z "$IMAP_USER" ]] && err "El correo es requerido."

  read -s -p "  Contraseña del correo: " IMAP_PASSWORD
  echo ""

  read -p "  Minutos entre revisiones [5]: " IMAP_POLL
  IMAP_POLL=${IMAP_POLL:-"5"}

  ok "FortiMail configurado: $IMAP_USER @ $IMAP_HOST"
else
  warn "FortiMail no configurado. Puedes activarlo después en el archivo .env"
fi

# ── 8. Correo saliente (notificaciones) ───────────────────────
echo ""
echo -e "${AZUL}── Correo de notificaciones (SMTP) ──────────${RESET}"
read -p "  ¿Configurar correo saliente para notificaciones? [s/N]: " CONF_SMTP
SMTP_HOST="" SMTP_PORT="587" SMTP_USER="" SMTP_PASSWORD="" SMTP_FROM=""

if [[ "$CONF_SMTP" =~ ^[Ss]$ ]]; then
  read -p "  Host SMTP (ej: mail.vitamar.com): " SMTP_HOST
  read -p "  Puerto SMTP [587]: " SMTP_PORT
  SMTP_PORT=${SMTP_PORT:-"587"}
  read -p "  Usuario SMTP: " SMTP_USER
  read -s -p "  Contraseña SMTP: " SMTP_PASSWORD; echo ""
  read -p "  Nombre remitente [Vitamar Docs]: " SMTP_FROM_NAME
  SMTP_FROM_NAME=${SMTP_FROM_NAME:-"Vitamar Docs"}
  SMTP_FROM="$SMTP_FROM_NAME <$SMTP_USER>"
  ok "SMTP configurado: $SMTP_HOST:$SMTP_PORT"
else
  warn "SMTP no configurado. Las notificaciones por correo estarán desactivadas."
fi

# ── 9. Escalaciones ───────────────────────────────────────────
echo ""
echo -e "${AZUL}── Parámetros del flujo de aprobación ───────${RESET}"
warn "Estos valores definen cuándo escalar una factura sin respuesta."

read -p "  Horas para escalar al jefe si nadie revisa [24]: " HORAS_ESC1
HORAS_ESC1=${HORAS_ESC1:-"24"}

read -p "  Horas adicionales para escalar a gerencia [48]: " HORAS_ESC2
HORAS_ESC2=${HORAS_ESC2:-"48"}

read -p "  Horas para aceptación tácita DIAN [48]: " HORAS_DIAN
HORAS_DIAN=${HORAS_DIAN:-"48"}

ok "Flujo configurado: escalar a jefe en ${HORAS_ESC1}h, gerencia en $((HORAS_ESC1 + HORAS_ESC2))h, DIAN en ${HORAS_DIAN}h"

# ── 10. Generar .env ──────────────────────────────────────────
info "Generando archivo .env..."
JWT_SECRET=$(openssl rand -hex 32)

cat > "$INSTALL_DIR/.env" << ENVEOF
# ─── Base de datos ─────────────────────────────────────────────
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# ─── JWT ───────────────────────────────────────────────────────
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=8h

# ─── Servidor ──────────────────────────────────────────────────
PORT=$PUERTO
NODE_ENV=production
EMPRESA_NOMBRE=$EMPRESA

# ─── FortiMail / IMAP ──────────────────────────────────────────
IMAP_HOST=$IMAP_HOST
IMAP_PORT=$IMAP_PORT
IMAP_USER=$IMAP_USER
IMAP_PASSWORD=$IMAP_PASSWORD
IMAP_TLS=$IMAP_TLS
IMAP_FOLDER=INBOX
IMAP_POLL_MINUTES=$IMAP_POLL

# ─── SMTP (notificaciones) ─────────────────────────────────────
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASSWORD=$SMTP_PASSWORD
SMTP_FROM=$SMTP_FROM

# ─── Archivos ──────────────────────────────────────────────────
UPLOAD_DIR=./uploads/facturas
MAX_FILE_MB=10
ENVEOF

chmod 600 "$INSTALL_DIR/.env"
ok ".env generado y asegurado (chmod 600)"

# ── 11. Migraciones ───────────────────────────────────────────
echo ""
info "Ejecutando migraciones de base de datos..."
node "$INSTALL_DIR/src/db/migrate.js" \
  || err "Falló la migración. Revisa la conexión a PostgreSQL y los logs."
ok "Migraciones ejecutadas"

# ── 12. Seed inicial ──────────────────────────────────────────
info "Cargando datos iniciales (áreas, categorías, usuario admin)..."
node "$INSTALL_DIR/src/db/seed.js" \
  || err "Falló la carga de datos iniciales."
ok "Datos iniciales cargados"

# Actualizar parámetros de escalación en BD
info "Configurando parámetros del flujo en base de datos..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -c "UPDATE configuracion SET valor='$HORAS_ESC1'  WHERE clave='horas_limite_revision';" \
  -c "UPDATE configuracion SET valor='$HORAS_ESC2'  WHERE clave='horas_escalacion_nivel2';" \
  -c "UPDATE configuracion SET valor='$HORAS_DIAN'  WHERE clave='horas_dian_tacita';" \
  -c "UPDATE configuracion SET valor='$EMPRESA'     WHERE clave='empresa_nombre';" \
  > /dev/null 2>&1 || warn "No se pudieron actualizar los parámetros del flujo en BD."
ok "Parámetros del flujo configurados"

# ── 13. Carpeta de uploads ────────────────────────────────────
mkdir -p "$INSTALL_DIR/uploads/facturas"
chmod 755 "$INSTALL_DIR/uploads/facturas"
ok "Carpeta de archivos: $INSTALL_DIR/uploads/facturas"

# ── 14. Backup ────────────────────────────────────────────────
echo ""
echo -e "${AZUL}── Configuración de Backup ──────────────────${RESET}"
BACKUP_LOCAL="$HOME/backups/vitamar-docs"
mkdir -p "$BACKUP_LOCAL"
ok "Carpeta de backups: $BACKUP_LOCAL"

read -p "  ¿Configurar backup en servidor NAS/red? [s/N]: " CONF_NAS
USAR_NAS="false"
SMB_SERVER="" SMB_MOUNT="/mnt/nas_backup" SMB_USER="" SMB_PASS="" BACKUP_RED=""

if [[ "$CONF_NAS" =~ ^[Ss]$ ]]; then
  USAR_NAS="true"
  read -p "  IP/ruta del share (ej: //192.168.1.10/Backups): " SMB_SERVER
  read -p "  Usuario del NAS: " SMB_USER
  read -s -p "  Contraseña del NAS: " SMB_PASS; echo ""
  read -p "  Subcarpeta en el NAS [VitamarDocs_Backups]: " NAS_SUB
  NAS_SUB=${NAS_SUB:-"VitamarDocs_Backups"}
  BACKUP_RED="$SMB_MOUNT/$NAS_SUB"
  ok "NAS configurado: $SMB_SERVER"
fi

# Generar script de backup
info "Generando script de backup..."
cat > "$INSTALL_DIR/backup.sh" << BACKUPEOF
#!/bin/bash
# ── Backup automático Vitamar Docs ──────────────────────────────
set -e
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
BACKUP_LOCAL="$BACKUP_LOCAL"
USAR_NAS="$USAR_NAS"
BACKUP_RED="$BACKUP_RED"
SMB_SERVER="$SMB_SERVER"
SMB_MOUNT="$SMB_MOUNT"
SMB_USER="$SMB_USER"
SMB_PASS="$SMB_PASS"
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"
DB_HOST="$DB_HOST"
DB_PORT="$DB_PORT"
PGPASSWORD="$DB_PASSWORD"
UPLOAD_DIR="$INSTALL_DIR/uploads/facturas"

mkdir -p "\$BACKUP_LOCAL"
FILENAME="vitamar_docs_\${TIMESTAMP}"

# Dump PostgreSQL
echo "[\$(date '+%H:%M:%S')] Exportando base de datos..."
PGPASSWORD="\$PGPASSWORD" pg_dump -h "\$DB_HOST" -p "\$DB_PORT" -U "\$DB_USER" \
  -Fc "\$DB_NAME" > "\$BACKUP_LOCAL/\${FILENAME}.dump"

# Comprimir adjuntos (PDFs/XMLs)
if [[ -d "\$UPLOAD_DIR" ]] && [[ -n "\$(ls -A \$UPLOAD_DIR 2>/dev/null)" ]]; then
  echo "[\$(date '+%H:%M:%S')] Comprimiendo adjuntos..."
  tar -czf "\$BACKUP_LOCAL/\${FILENAME}_files.tar.gz" -C "\$(dirname \$UPLOAD_DIR)" "\$(basename \$UPLOAD_DIR)" 2>/dev/null || true
fi

echo "[\$(date '+%H:%M:%S')] Backup local: \$BACKUP_LOCAL/\${FILENAME}.dump"

# Copiar a NAS si está configurado
if [[ "\$USAR_NAS" == "true" ]] && [[ -n "\$SMB_SERVER" ]]; then
  if ! mountpoint -q "\$SMB_MOUNT" 2>/dev/null; then
    sudo mkdir -p "\$SMB_MOUNT"
    sudo mount -t cifs "\$SMB_SERVER" "\$SMB_MOUNT" \
      -o username="\$SMB_USER",password="\$SMB_PASS",vers=3.0 2>/dev/null || {
      echo "[\$(date '+%H:%M:%S')] WARN: No se pudo montar NAS"; exit 0
    }
  fi
  mkdir -p "\$BACKUP_RED"
  cp "\$BACKUP_LOCAL/\${FILENAME}.dump" "\$BACKUP_RED/"
  [[ -f "\$BACKUP_LOCAL/\${FILENAME}_files.tar.gz" ]] && \
    cp "\$BACKUP_LOCAL/\${FILENAME}_files.tar.gz" "\$BACKUP_RED/"
  echo "[\$(date '+%H:%M:%S')] Backup copiado a NAS: \$BACKUP_RED"
fi

# Rotar backups locales (conservar últimos 14)
ls -t "\$BACKUP_LOCAL"/*.dump 2>/dev/null | tail -n +15 | xargs rm -f
ls -t "\$BACKUP_LOCAL"/*.tar.gz 2>/dev/null | tail -n +15 | xargs rm -f

echo "[\$(date '+%H:%M:%S')] Backup completado: \${FILENAME}"
BACKUPEOF

chmod +x "$INSTALL_DIR/backup.sh"
ok "backup.sh generado"

# Permisos sudo para NAS
if [[ "$USAR_NAS" == "true" ]]; then
  echo "$USER ALL=(ALL) NOPASSWD: /bin/mount, /bin/umount, /usr/bin/mkdir, /bin/mkdir" | \
    sudo tee /etc/sudoers.d/vitamar-docs-mount > /dev/null
  sudo chmod 440 /etc/sudoers.d/vitamar-docs-mount
  ok "Permisos sudo para mount configurados"
fi

# ── 15. PM2 ───────────────────────────────────────────────────
echo ""
info "Iniciando Vitamar Docs con PM2..."

# Generar ecosystem.config.js
cat > "$INSTALL_DIR/ecosystem.config.js" << PM2EOF
module.exports = {
  apps: [{
    name:        'vitamar-docs',
    script:      'src/server.js',
    cwd:         '$INSTALL_DIR',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production',
    },
    error_file: '$INSTALL_DIR/logs/error.log',
    out_file:   '$INSTALL_DIR/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
PM2EOF

mkdir -p "$INSTALL_DIR/logs"

if pm2 list | grep -q "vitamar-docs"; then
  pm2 reload vitamar-docs
  ok "PM2: recargado"
else
  pm2 start "$INSTALL_DIR/ecosystem.config.js" --env production
  ok "PM2: proceso creado"
fi

pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || warn "Ejecuta manualmente: pm2 startup"
ok "PM2 configurado para arrancar con el sistema"

# ── 16. Cron de backup ────────────────────────────────────────
echo ""
read -p "  ¿Configurar backup automático diario a las 2 AM? [s/N]: " CONF_CRON
if [[ "$CONF_CRON" =~ ^[Ss]$ ]]; then
  CRON_LINE="0 2 * * * $INSTALL_DIR/backup.sh >> /var/log/backup_vitamar_docs.log 2>&1"
  (sudo crontab -l 2>/dev/null | grep -v "backup_vitamar_docs\|backup\.sh.*vitamar"; echo "$CRON_LINE") | sudo crontab -
  ok "Cron configurado: backup diario a las 2:00 AM"
fi

# ── 17. HTTPS con Nginx ───────────────────────────────────────
echo ""
echo -e "${AZUL}── Configuración HTTPS (opcional) ───────────${RESET}"
read -p "  ¿Configurar HTTPS con Nginx? [s/N]: " CONF_HTTPS
HTTPS_URL=""
CERT_TIPO=""

if [[ "$CONF_HTTPS" =~ ^[Ss]$ ]]; then

  if ! command -v nginx &>/dev/null; then
    info "Instalando Nginx..."
    sudo apt-get install -y nginx
  fi
  ok "Nginx: $(nginx -v 2>&1)"

  read -p "  Dominio del servidor (ej: docs.vitamar.com): " HTTPS_DOMAIN
  while [[ -z "$HTTPS_DOMAIN" ]]; do
    warn "El dominio es requerido."
    read -p "  Dominio: " HTTPS_DOMAIN
  done

  read -p "  Puerto HTTPS [8443]: " HTTPS_PORT
  HTTPS_PORT=${HTTPS_PORT:-8443}

  echo ""
  echo -e "${AZUL}  Tipo de certificado SSL:${RESET}"
  echo -e "  1) Autofirmado       — red interna, sin dominio público"
  echo -e "  2) Let's Encrypt     — dominio público, puertos 80/443 expuestos"
  read -p "  Selecciona [1/2]: " CERT_TIPO
  CERT_TIPO=${CERT_TIPO:-1}

  NGINX_CONF="/etc/nginx/sites-available/vitamar-docs"

  if [[ "$CERT_TIPO" == "2" ]]; then
    if ! command -v certbot &>/dev/null; then
      info "Instalando Certbot..."
      sudo apt-get install -y certbot python3-certbot-nginx
    fi
    ok "Certbot: $(certbot --version 2>&1)"

    if sudo ss -tlnp | grep -q ':80.*apache'; then
      warn "Apache2 detectado en el puerto 80. Deteniéndolo temporalmente..."
      sudo systemctl stop apache2
      APACHE_DETENIDO=true
    fi

    sudo tee /etc/nginx/sites-available/vitamar-certbot > /dev/null << CERTEOF
server {
    listen 80;
    server_name $HTTPS_DOMAIN;
    location / { return 200 'ok'; }
}
CERTEOF
    sudo ln -sf /etc/nginx/sites-available/vitamar-certbot /etc/nginx/sites-enabled/vitamar-certbot
    sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    sudo systemctl restart nginx

    info "Obteniendo certificado Let's Encrypt para $HTTPS_DOMAIN..."
    read -p "  Email para notificaciones de Let's Encrypt: " CERTBOT_EMAIL
    sudo certbot certonly --nginx -d "$HTTPS_DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" \
      || err "Certbot falló. Verifica que el dominio resuelva a esta IP y los puertos 80/443 estén abiertos."

    sudo rm -f /etc/nginx/sites-enabled/vitamar-certbot
    SSL_CERT="/etc/letsencrypt/live/$HTTPS_DOMAIN/fullchain.pem"
    SSL_KEY="/etc/letsencrypt/live/$HTTPS_DOMAIN/privkey.pem"
    ok "Certificado Let's Encrypt obtenido"

    [[ "${APACHE_DETENIDO:-false}" == "true" ]] && sudo systemctl start apache2

  else
    CERT_DIR="/etc/ssl/vitamar-docs"
    info "Generando certificado SSL autofirmado (válido 10 años)..."
    sudo mkdir -p "$CERT_DIR"
    sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$CERT_DIR/key.pem" \
      -out    "$CERT_DIR/cert.pem" \
      -subj "/C=CO/ST=Magdalena/L=SantaMarta/O=$EMPRESA/CN=$HTTPS_DOMAIN" \
      -addext "subjectAltName=DNS:$HTTPS_DOMAIN,DNS:localhost,IP:127.0.0.1" 2>/dev/null
    sudo chmod 600 "$CERT_DIR/key.pem"
    sudo chmod 644 "$CERT_DIR/cert.pem"
    SSL_CERT="$CERT_DIR/cert.pem"
    SSL_KEY="$CERT_DIR/key.pem"
    CERT_EXPORT="$HOME/vitamar_docs_cert.crt"
    sudo cp "$CERT_DIR/cert.pem" "$CERT_EXPORT"
    sudo chown "$USER" "$CERT_EXPORT"
    ok "Certificado autofirmado generado → $CERT_EXPORT"
  fi

  info "Configurando Nginx..."
  sudo tee "$NGINX_CONF" > /dev/null << NGINXEOF
server {
    listen $HTTPS_PORT ssl;
    server_name $HTTPS_DOMAIN;

    ssl_certificate     $SSL_CERT;
    ssl_certificate_key $SSL_KEY;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;

    # Aumentar límite para subida de facturas PDF
    client_max_body_size 25M;

    location / {
        proxy_pass         http://127.0.0.1:$PUERTO;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }
}

# Redirigir HTTP → HTTPS
server {
    listen 80;
    server_name $HTTPS_DOMAIN;
    return 301 https://\$host:$HTTPS_PORT\$request_uri;
}
NGINXEOF

  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/vitamar-docs
  sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  sudo nginx -t || err "Error en configuración de Nginx"
  sudo systemctl restart nginx
  sudo systemctl enable nginx
  ok "Nginx activo"

  if sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    sudo ufw allow "$HTTPS_PORT/tcp"
    sudo ufw allow 80/tcp
    ok "Puertos $HTTPS_PORT y 80 abiertos en firewall"
  fi

  HTTPS_URL="https://$HTTPS_DOMAIN:$HTTPS_PORT"
fi

# ── 18. Fail2ban ──────────────────────────────────────────────
echo ""
echo -e "${AZUL}── Protección contra fuerza bruta (opcional) ─${RESET}"
read -p "  ¿Instalar y configurar Fail2ban? [s/N]: " CONF_F2B
if [[ "$CONF_F2B" =~ ^[Ss]$ ]]; then
  if ! command -v fail2ban-client &>/dev/null; then
    info "Instalando Fail2ban..."
    sudo apt-get install -y fail2ban
  fi
  ok "Fail2ban: $(fail2ban-client --version 2>&1 | head -1)"

  NGINX_LOG="/var/log/nginx/access.log"
  F2B_PORT=${HTTPS_PORT:-$PUERTO}

  [[ ! "$CONF_HTTPS" =~ ^[Ss]$ ]] && \
    warn "HTTPS no configurado — Fail2ban solo funcionará si Nginx está activo."

  sudo tee /etc/fail2ban/filter.d/vitamar-docs-login.conf > /dev/null << 'F2BFILTER'
[Definition]
failregex = ^<HOST> .* "POST /api/auth/login HTTP.*" 401
ignoreregex =
F2BFILTER

  sudo tee /etc/fail2ban/jail.d/vitamar-docs.conf > /dev/null << F2BJAIL
[vitamar-docs-login]
enabled   = true
port      = $F2B_PORT,80,443
filter    = vitamar-docs-login
logpath   = $NGINX_LOG
backend   = polling
maxretry  = 5
findtime  = 300
bantime   = 600
ignoreip  = 127.0.0.1/8
F2BJAIL

  sudo systemctl enable fail2ban
  sudo systemctl restart fail2ban
  ok "Fail2ban activo en puerto $F2B_PORT"
fi

# ── 19. Health check ──────────────────────────────────────────
echo ""
info "Verificando que la app responde..."
sleep 4

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:${PUERTO}/api/health" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  ok "Health check OK (HTTP $HTTP_CODE)"
else
  warn "Health check retornó HTTP $HTTP_CODE — la app puede estar iniciando, espera unos segundos."
  warn "Verifica con: pm2 logs vitamar-docs"
fi

# ── 20. Resumen final ─────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')
RAMA=$(git -C "$INSTALL_DIR" branch --show-current 2>/dev/null || echo "—")

echo ""
echo -e "${VERDE}══════════════════════════════════════════════${RESET}"
echo -e "${VERDE}  ✅ Vitamar Docs v${VERSION} instalado correctamente${RESET}"
echo -e "${VERDE}══════════════════════════════════════════════${RESET}"
echo ""
echo -e "  🏢 Empresa:    $EMPRESA"
echo -e "  🌐 HTTP:       http://$SERVER_IP:$PUERTO"
[[ -n "$HTTPS_URL" ]] && echo -e "  🔒 HTTPS:      $HTTPS_URL"
echo -e "  🗄️  Base datos: $DB_NAME @ $DB_HOST:$DB_PORT"
[[ -n "$IMAP_USER" ]] && echo -e "  📧 FortiMail:  $IMAP_USER (cada ${IMAP_POLL}min)"
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     CREDENCIALES POR DEFECTO         ║"
echo "  ║  Usuario: admin@vitamar.com          ║"
echo "  ║  Password: vitamar2025               ║"
echo "  ║  ⚠  Cambia la contraseña            ║"
echo "  ║     tras el primer login             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo -e "${AMARILLO}  ⚠  Escalación nivel 1: sin acción en ${HORAS_ESC1}h → jefe del área${RESET}"
echo -e "${AMARILLO}  ⚠  Escalación nivel 2: sin acción en $((HORAS_ESC1 + HORAS_ESC2))h → gerencia${RESET}"
echo -e "${AMARILLO}  ⚠  DIAN tácita automática a las ${HORAS_DIAN}h${RESET}"
[[ "$CERT_TIPO" == "1" && -n "$HTTPS_URL" ]] && \
  echo -e "${AMARILLO}  ⚠  Instala el certificado ~/vitamar_docs_cert.crt en los equipos clientes.${RESET}"
[[ "$CERT_TIPO" == "1" && -n "$HTTPS_URL" ]] && \
  echo -e "${AMARILLO}  ⚠  Agrega al DNS interno: $SERVER_IP  $HTTPS_DOMAIN${RESET}"
echo -e "  🌿 Rama:       $RAMA"
echo ""
echo -e "  pm2 logs vitamar-docs      # Ver logs en tiempo real"
echo -e "  pm2 restart vitamar-docs   # Reiniciar"
echo -e "  bash $INSTALL_DIR/backup.sh   # Backup manual"
echo ""
