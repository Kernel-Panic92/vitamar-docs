#!/bin/bash
cd /root/vitamar-docs
/usr/bin/node -e "require('./src/services/imap.service').pollCorreo()" >> /root/vitamar-docs/logs/imap.log 2>&1