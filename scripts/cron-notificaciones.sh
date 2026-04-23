#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"
/usr/bin/node -e "require('./src/services/cron.service').enviarNotificaciones()" >> "$APP_DIR/logs/cron.log 2>&1