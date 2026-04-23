#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  uninstall.sh — Desinstalador de Vitamar Docs
#
#  Uso:
#    chmod +x uninstall.sh
#    ./uninstall.sh
# ═══════════════════════════════════════════════════════════════

set -e

VERDE="\033[0;32m"; AMARILLO="\033[1;33m"; ROJO="\033[0;31m"; AZUL="\033[0;34m"; RESET="\033[0m"
ok()   { echo -e "${VERDE}  ✓ $1${RESET}"; }
info() { echo -e "${AZUL}  → $1${RESET}"; }
warn() { echo -e "${AMARILLO}  ⚠ $1${RESET}"; }
err()  { echo -e "${ROJO}  ✗ $1${RESET}"; exit 1; }

UNINSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${ROJO}══════════════════════════════════════════════${RESET}"
echo -e "${ROJO}   Vitamar Docs — Desinstalador${RESET}"
echo -e "${ROJO}══════════════════════════════════════════════${RESET}"
echo ""

# Verificar que es root
if [[ "$EUID" -ne 0 ]]; then
  echo -e "${AMARILLO}  ⚠ Este desinstalador requiere permisos de root.${RESET}"
  echo -e "${AMARILLO}  Por favor ejecute con: sudo ./uninstall.sh${RESET}"
  echo ""
  exit 1
fi

# ── 1. Confirmación ─────────────────────────────────────────
echo -e "${AMARILLO}  ⚠ Esta acción es IRREVERSIBLE${RESET}"
echo ""
echo "  Se eliminarán:"
echo "    • Base de datos PostgreSQL completa"
echo "    • Proceso PM2 (docflow)"
echo "    • Archivos de la aplicación"
echo "    • Backups"
echo "    • Configuración de Cron, Nginx, Fail2ban"
echo ""

read -p "¿Estás seguro de continuar? (escribe 'SI' para confirmar): " CONFIRM
if [[ "$CONFIRM" != "SI" ]]; then
  echo "Operación cancelada."
  exit 0
fi

echo ""
echo -e "${AZUL}── Cargando configuración del .env ──────────────${RESET}"

ENV_FILE="$UNINSTALL_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  source <(grep -E '^[^#]*=' "$ENV_FILE" | sed 's/=\(.*\)/="\1"/')
  DB_NAME="${DB_NAME:-docflow}"
  DB_USER="${DB_USER:-postgres}"
  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5432}"
  PUERTO="${PORT:-3100}"
  ok "Configuración cargada desde .env"
else
  warn "No se encontró .env. Usando valores por defecto."
  DB_NAME="docflow"
  DB_USER="postgres"
  DB_HOST="localhost"
  DB_PORT="5432"
  PUERTO="3100"
fi

DB_PASSWORD="${DB_PASSWORD:-}"

# ── 2. Detener PM2 ───────────────────────────────────────
echo ""
echo -e "${AZUL}── Deteniendo servicio PM2 ──────────────────────${RESET}"

if pm2 list 2>/dev/null | grep -q "docflow"; then
  pm2 stop docflow 2>/dev/null || true
  pm2 delete docflow 2>/dev/null || true
  pm2 save 2>/dev/null || true
  ok "Proceso PM2 detenido y eliminado"
else
  info "No había proceso PM2 activo"
fi

# ── 3. Detener servicios del sistema ─────────────────────
echo ""
echo -e "${AZUL}── Deteniendo servicios del sistema ───────────────${RESET}"

# Cron
CRON_LINE=$(sudo crontab -l 2>/dev/null | grep -v "backup_docflow\|backup\.sh.*docflow" || echo "")
echo "$CRON_LINE" | sudo crontab - 2>/dev/null || true
ok "Cron de backup eliminado"

# Nginx
if [[ -f /etc/nginx/sites-enabled/docflow ]]; then
  sudo rm -f /etc/nginx/sites-enabled/docflow
  ok "Configuración Nginx eliminada"
fi

# Fail2ban
if [[ -f /etc/fail2ban/jail.d/docflow.conf ]]; then
  sudo rm -f /etc/fail2ban/jail.d/docflow.conf
  sudo rm -f /etc/fail2ban/filter.d/docflow-login.conf
  sudo systemctl restart fail2ban 2>/dev/null || true
  ok "Fail2ban eliminado"
fi

# Sudoers para mount NAS
if [[ -f /etc/sudoers.d/docflow-mount ]]; then
  sudo rm -f /etc/sudoers.d/docflow-mount
  ok "Permisos sudo para mount eliminados"
fi

# ── 4. Eliminar base de datos ──────────────────────────────
echo ""
echo -e "${AZUL}── Eliminando base de datos ──────────────────────${RESET}"

if [[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
  if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    warn "Eliminando base de datos '$DB_NAME'..."
    sudo -u postgres dropdb "$DB_NAME" 2>/dev/null && ok "Base de datos '$DB_NAME' eliminada" || warn "No se pudo eliminar la base de datos"
  else
    info "Base de datos '$DB_NAME' no existe"
  fi

  if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "${DB_NAME}_test"; then
    sudo -u postgres dropdb "${DB_NAME}_test" 2>/dev/null && ok "Base de datos test eliminada" || true
  fi
else
  if [[ -n "$DB_PASSWORD" ]]; then
    DB_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")
    if [[ "$DB_EXISTS" == "1" ]]; then
      warn "Eliminando base de datos remota '$DB_NAME'..."
      PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" \
        && ok "Base de datos '$DB_NAME' eliminada" || warn "No se pudo eliminar la base de datos"
    else
      info "Base de datos '$DB_NAME' no existe"
    fi
  else
    warn "No hay contraseña de BD. No se puede eliminar base de datos remota."
  fi
fi

# ── 5. Eliminar archivos de la aplicación ───────────────
echo ""
echo -e "${AZUL}── Eliminando archivos ──────────────────────────${RESET}"

if [[ -d "$UNINSTALL_DIR" ]]; then
  # Hacer backup de logs antes de eliminar si existen
  if [[ -d "$UNINSTALL_DIR/logs" ]] && [[ -n "$(ls -A "$UNINSTALL_DIR/logs" 2>/dev/null)" ]]; then
    LOGS_BACKUP="$HOME/docflow_logs_$(date +%Y%m%d_%H%M%S)"
    cp -r "$UNINSTALL_DIR/logs" "$LOGS_BACKUP"
    ok "Logs respaldados en: $LOGS_BACKUP"
  fi

  if [[ -d "$UNINSTALL_DIR/uploads" ]] && [[ -n "$(ls -A "$UNINSTALL_DIR/uploads" 2>/dev/null)" ]]; then
    UPLOADS_BACKUP="$HOME/docflow_uploads_$(date +%Y%m%d_%H%M%S)"
    cp -r "$UNINSTALL_DIR/uploads" "$UPLOADS_BACKUP"
    ok "Uploads respaldados en: $UPLOADS_BACKUP"
  fi

  rm -rf "$UNINSTALL_DIR"
  ok "Archivos de aplicación eliminados"
else
  info "Directorio de aplicación no encontrado"
fi

# ── 6. Limpiar dependencias globales ───────────────────
echo ""
echo -e "${AZUL}── Limpiando dependencias globales ─────────────${RESET}"

if command -v pm2 &>/dev/null; then
  pm2 delete all 2>/dev/null || true
  pm2 cleardump 2>/dev/null || true
fi

# ── 7. Resumen final ────────────────────────────────────
echo ""
echo -e "${VERDE}══════════════════════════════════════════════${RESET}"
echo -e "${VERDE}  ✅ Vitamar Docs desinstalado correctamente${RESET}"
echo -e "${VERDE}══════════════════════════════════════════════${RESET}"
echo ""
echo "  Eliminaciones completadas:"
echo "    • Proceso PM2"
echo "    • Base de datos PostgreSQL"
echo "    • Archivos de la aplicación"
echo "    • Cron, Nginx, Fail2ban"
echo ""
echo -e "${AMARILLO}  ⚠ Si instalaste Node.js o PostgreSQL con este script,${RESET}"
echo -e "${AMARILLO}     debes desinstalarlos manualmente si ya no los necesitas.${RESET}"
echo ""
ok "Desinstalación completa"