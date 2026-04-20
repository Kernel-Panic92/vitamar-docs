#!/bin/bash
cd /root/vitamar-docs
/usr/bin/node -e "require('./src/services/cron.service').enviarNotificaciones()" >> /root/vitamar-docs/logs/cron.log 2>&1