#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# updateprod.sh  —  Vitamar Docs deployment script
# Uso: bash updateprod.sh [canal]    canal default: stable
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CANAL="${1:-stable}"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/deploy.log"
APP_NAME="docflow"
PM2_NAME="docflow"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
err() { log "ERROR: $*"; exit 1; }

log "═══════════════════════════════════════════"
log "Iniciando deploy — canal: $CANAL"
log "Directorio: $APP_DIR"

# ─── 1. Verificar dependencias ────────────────────────────────────────────────
command -v git  >/dev/null 2>&1 || err "git no está instalado"
command -v node >/dev/null 2>&1 || err "node no está instalado"
command -v npm  >/dev/null 2>&1 || err "npm no está instalado"
command -v pm2  >/dev/null 2>&1 || err "pm2 no está instalado (npm i -g pm2)"

NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>&1) \
  || err "Se requiere Node.js 18 o superior"

# ─── 2. Obtener release del canal ─────────────────────────────────────────────
log "Obteniendo release para canal '$CANAL'..."

REMOTE_URL=$(git -C "$APP_DIR" remote get-url origin 2>/dev/null) \
  || err "No se pudo obtener el remote origin. ¿Es un repositorio git?"

# Fetch de tags y ramas
git -C "$APP_DIR" fetch --tags --prune origin 2>>"$LOG_FILE" \
  || err "No se pudo hacer fetch del repositorio"

if [ "$CANAL" = "stable" ]; then
  # Último tag semver vX.Y.Z
  TARGET=$(git -C "$APP_DIR" tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
  [ -z "$TARGET" ] && TARGET="origin/main"
elif [ "$CANAL" = "beta" ]; then
  TARGET="origin/develop"
else
  err "Canal desconocido: '$CANAL'. Usa 'stable' o 'beta'"
fi

log "Target: $TARGET"

# ─── 3. Backup de .env ────────────────────────────────────────────────────────
if [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "$APP_DIR/.env.backup"
  log ".env respaldado → .env.backup"
fi

# ─── 4. Pull / checkout ───────────────────────────────────────────────────────
PREV_COMMIT=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo "none")

git -C "$APP_DIR" checkout "$TARGET" -- 2>>"$LOG_FILE" \
  || git -C "$APP_DIR" reset --hard "$TARGET" 2>>"$LOG_FILE" \
  || err "No se pudo actualizar al target '$TARGET'"

NEW_COMMIT=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
log "Commit: $PREV_COMMIT → $NEW_COMMIT"

# ─── 5. Restaurar .env ────────────────────────────────────────────────────────
if [ -f "$APP_DIR/.env.backup" ]; then
  cp "$APP_DIR/.env.backup" "$APP_DIR/.env"
  log ".env restaurado"
fi

# ─── 6. Instalar dependencias ─────────────────────────────────────────────────
log "Instalando dependencias..."
npm ci --omit=dev --prefix "$APP_DIR" >>"$LOG_FILE" 2>&1 \
  || err "Falló npm ci"

# ─── 7. Migraciones ───────────────────────────────────────────────────────────
log "Ejecutando migraciones..."
node "$APP_DIR/src/db/migrate.js" >>"$LOG_FILE" 2>&1 \
  || err "Falló la migración de base de datos"

# ─── 8. Reiniciar con PM2 ─────────────────────────────────────────────────────
log "Reiniciando aplicación con PM2..."

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 reload "$PM2_NAME" >>"$LOG_FILE" 2>&1 \
    || err "Falló pm2 reload"
  log "PM2: reload exitoso"
else
  pm2 start "$APP_DIR/src/server.js" \
    --name "$PM2_NAME" \
    --env production \
    >>"$LOG_FILE" 2>&1 \
    || err "Falló pm2 start"
  pm2 save >>"$LOG_FILE" 2>&1
  log "PM2: proceso creado y guardado"
fi

# ─── 9. Health check ──────────────────────────────────────────────────────────
log "Verificando health check..."
sleep 3

PORT=$(grep -E '^PORT=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "3100")
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/health" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  log "Health check OK (HTTP $HTTP_CODE)"
else
  log "ADVERTENCIA: Health check retornó HTTP $HTTP_CODE"
fi

# ─── 10. Resumen ──────────────────────────────────────────────────────────────
log "═══════════════════════════════════════════"
log "Deploy completado exitosamente"
log "  App:    http://localhost:${PORT}"
log "  Canal:  $CANAL"
log "  Commit: $NEW_COMMIT"
log "  PM2:    pm2 logs $PM2_NAME"
log "═══════════════════════════════════════════"
