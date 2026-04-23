#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  update.sh — Actualizador de Vitamar Docs
#
#  Uso:
#    chmod +x update.sh
#    ./update.sh
#
#  Requiere:
#    - GitHub Personal Access Token en ~/.vitamar_token
#    - Repo público o token con acceso al repo privado
# ═══════════════════════════════════════════════════════════════
set -e

VERDE="\033[0;32m"; AMARILLO="\033[1;33m"; ROJO="\033[0;31m"; AZUL="\033[0;34m"; RESET="\033[0m"
ok()   { echo -e "${VERDE}  ✓ $1${RESET}"; }
info() { echo -e "${AZUL}  → $1${RESET}"; }
warn() { echo -e "${AMARILLO}  ⚠ $1${RESET}"; }
err()  { echo -e "${ROJO}  ✗ $1${RESET}"; exit 1; }

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="Kernel-Panic92/docflow"
PM2_NAME="docflow"

echo ""
echo -e "${AZUL}══════════════════════════════════════════════${RESET}"
echo -e "${AZUL}   DocFlow — Actualizador${RESET}"
echo -e "${AZUL}══════════════════════════════════════════════${RESET}"
echo ""

# ── Validaciones ──────────────────────────────────────────────
[[ "$OSTYPE" != "linux-gnu"* ]] && err "Este script es para Linux (Ubuntu/Debian)."
command -v jq &>/dev/null || { warn "jq no encontrado. Instalando..."; sudo apt-get install -y jq; }
command -v pm2 &>/dev/null || err "PM2 no encontrado. ¿Está instalado Vitamar Docs?"
[[ ! -f "$INSTALL_DIR/src/server.js" ]] && err "No se encontró src/server.js. Ejecuta desde el directorio de Vitamar Docs."

# ── Token de GitHub ──────────────────────────────────────────
USER_HOME=$(eval echo ~${SUDO_USER:-$USER})
GITHUB_TOKEN=$(xargs < "$USER_HOME/.vitamar_token" 2>/dev/null || echo '')

if [[ -n "$GITHUB_TOKEN" ]]; then
  AUTH_HEADER="Authorization: Bearer $GITHUB_TOKEN"
  ok "Token de GitHub cargado"
else
  AUTH_HEADER=""
  warn "Sin token (funcionará solo si el repo es público)"
fi

# ── Versión actual ───────────────────────────────────────────
CURRENT_VERSION=$(node -e "console.log(require('./package.json').version || 'desconocida')" 2>/dev/null || echo "desconocida")
info "Versión actual: $CURRENT_VERSION"

# ── Obtener última release ───────────────────────────────────
info "Buscando última release en GitHub..."

RESPONSE=$(curl -sL -H "$AUTH_HEADER" "https://api.github.com/repos/$REPO/releases/latest")

if echo "$RESPONSE" | jq -e '.message' >/dev/null 2>&1; then
  err "GitHub API: $(echo "$RESPONSE" | jq -r '.message')"
fi

RELEASE_TAG=$(echo "$RESPONSE" | jq -r '.tag_name')
RELEASE_URL=$(echo "$RESPONSE" | jq -r '.zipball_url')
RELEASE_NAME=$(echo "$RESPONSE" | jq -r '.name')
RELEASE_DATE=$(echo "$RESPONSE" | jq -r '.published_at' | cut -d'T' -f1)

ok "Release: $RELEASE_TAG ($RELEASE_DATE)"
[[ -n "$RELEASE_NAME" && "$RELEASE_NAME" != "null" ]] && info "Nombre: $RELEASE_NAME"

# ── Comparar versiones ────────────────────────────────────────
if [[ "$RELEASE_TAG" == "$CURRENT_VERSION" ]]; then
  echo ""
  echo -e "${AMARILLO}  Ya tienes la última versión ($CURRENT_VERSION)${RESET}"
  read -p "  ¿Actualizar de todas formas? [s/N]: " FORCE
  [[ ! "$FORCE" =~ ^[Ss]$ ]] && { echo "Actualización cancelada."; exit 0; }
fi

# ── Confirmar ────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "  Actualizar de $CURRENT_VERSION → $RELEASE_TAG"
echo "─────────────────────────────────────────"
read -p "  ¿Continuar? [S/n]: " CONFIRM
CONFIRM=${CONFIRM:-S}
[[ ! "$CONFIRM" =~ ^[Ss]$ ]] && { echo "Actualización cancelada."; exit 0; }

# ── Backup preventivo ─────────────────────────────────────────
info "Creando backup preventivo..."
BACKUP_DIR="$HOME/backups/docflow"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/pre_update_$(date +%Y%m%d_%H%M%S).tar.gz"

tar -czf "$BACKUP_FILE" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='uploads' \
  --exclude='backups' \
  --exclude='logs' \
  .

ok "Backup creado: $BACKUP_FILE"

# ── Descargar release ────────────────────────────────────────
TMPDIR=$(mktemp -d)
info "Descargando release..."
curl -sL -H "$AUTH_HEADER" "$RELEASE_URL" -o "$TMPDIR/release.zip"

if [[ ! -s "$TMPDIR/release.zip" ]]; then
  rm -rf "$TMPDIR"
  err "Error descargando release"
fi

# ── Extraer ──────────────────────────────────────────────────
info "Extrayendo archivos..."
unzip -q "$TMPDIR/release.zip" -d "$TMPDIR/extracted"
DIR=$(ls "$TMPDIR/extracted")

# ── Actualizar con rsync ────────────────────────────────────
info "Actualizando archivos..."

rsync -av \
  --delete \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='uploads/' \
  --exclude='backups/' \
  --exclude='logs/' \
  --exclude='.git/' \
  "$TMPDIR/extracted/$DIR/" \
  "$INSTALL_DIR/" || {
    warn "Error en rsync. Restaurando backup..."
    tar -xzf "$BACKUP_FILE" -C "$INSTALL_DIR"
    exit 1
  }

rm -rf "$TMPDIR"

# ── Instalar dependencias ────────────────────────────────────
info "Actualizando dependencias..."
npm install --omit=dev

# ── Migraciones (si hay) ────────────────────────────────────
if [[ -f "src/db/migrate.js" ]]; then
  echo ""
  read -p "  ¿Ejecutar migraciones de base de datos? [S/n]: " RUN_MIGRATE
  RUN_MIGRATE=${RUN_MIGRATE:-S}
  if [[ "$RUN_MIGRATE" =~ ^[Ss]$ ]]; then
    info "Ejecutando migraciones..."
    node src/db/migrate.js || warn "Migraciones finalizaron con errores"
  fi
fi

# ── Reiniciar ────────────────────────────────────────────────
pm2 restart "$PM2_NAME"
sleep 2

if pm2 list | grep -q "$PM2_NAME"; then
  ok "Servicio reiniciado"
else
  warn "El servicio no parece estar corriendo. Verifica: pm2 logs $PM2_NAME"
fi

# ── Resumen ──────────────────────────────────────────────────
NEW_VERSION=$(node -e "console.log(require('./package.json').version || 'desconocida')" 2>/dev/null || echo "desconocida")

echo ""
echo -e "${VERDE}══════════════════════════════════════════════${RESET}"
echo -e "${VERDE}  ✅ Vitamar Docs actualizado${RESET}"
echo -e "${VERDE}══════════════════════════════════════════════${RESET}"
echo ""
echo -e "  📦 Versión anterior: $CURRENT_VERSION"
echo -e "  📦 Nueva versión:   $NEW_VERSION"
echo -e "  🗄  Backup:         $BACKUP_FILE"
echo ""
echo -e "  pm2 logs $PM2_NAME    # Ver logs"
echo ""
