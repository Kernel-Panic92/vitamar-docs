const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

router.use(authMiddleware);

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const logoDir = path.join(process.cwd(), 'public', 'logos');
      if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });
      cb(null, logoDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `logo_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo imágenes'));
  }
});

router.post('/logo', requireRol('admin'), logoUpload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  
  const url = `/logos/${req.file.filename}`;
  
  await db.query(
    `INSERT INTO configuracion (clave, valor, actualizado_en) 
     VALUES ('empresa_logo', $1, NOW()) 
     ON CONFLICT (clave) DO UPDATE SET valor = $1, actualizado_en = NOW()`,
    [url]
  );
  
  res.json({ ok: true, url });
});

// ─── GET /api/configuracion ─────────────────────────────────────────────────
router.get('/', requireRol('admin', 'contador'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT clave, valor, descripcion, actualizado_en FROM configuracion ORDER BY clave');
    
    const config = {};
    for (const row of rows) {
      config[row.clave] = {
        valor: row.valor || '',
        descripcion: row.descripcion || '',
        actualizado_en: row.actualizado_en
      };
    }
    
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/configuracion ─────────────────────────────────────────────────
router.put('/', requireRol('admin'), async (req, res) => {
  const entries = req.body;
  
  if (!entries || typeof entries !== 'object') {
    return res.status(400).json({ error: 'Cuerpo inválido' });
  }
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    for (const [clave, data] of Object.entries(entries)) {
      const valor = typeof data === 'string' ? data : (data.valor || '');
      await client.query(
        `INSERT INTO configuracion (clave, valor, actualizado_en) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (clave) DO UPDATE SET valor = $2, actualizado_en = NOW()`,
        [clave, valor]
      );
    }
    
    await client.query('COMMIT');
    
    try {
      const imapService = require('../services/imap.service');
      if (imapService.clearConfigCache) imapService.clearConfigCache();
    } catch (e) {}
    
    const { rows } = await db.query('SELECT clave, valor, descripcion, actualizado_en FROM configuracion ORDER BY clave');
    const config = {};
    for (const row of rows) {
      config[row.clave] = {
        valor: row.valor || '',
        descripcion: row.descripcion || '',
        actualizado_en: row.actualizado_en
      };
    }
    
    res.json(config);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── GET /api/configuracion/imap/test ───────────────────────────────────────
router.get('/imap/test', async (req, res) => {
  const { ImapFlow } = require('imapflow');
  
  const host = req.query.host;
  const port = parseInt(req.query.port || '993');
  const user = req.query.user;
  const pass = req.query.pass;
  const secure = req.query.secure !== 'false';
  
  if (!host || !user || !pass) {
    return res.status(400).json({ error: 'Host, usuario y contraseña son requeridos' });
  }
  
  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false,
  });
  
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    lock.release();
    await client.logout();
    res.json({ ok: true, mensaje: 'Conexión exitosa' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/configuracion/smtp/test ───────────────────────────────────────
router.get('/smtp/test', async (req, res) => {
  const nodemailer = require('nodemailer');
  
  const host = req.query.host;
  const port = parseInt(req.query.port || '587');
  const user = req.query.user;
  const pass = req.query.pass;
  const from = req.query.from;
  
  if (!host || !user || !pass) {
    return res.status(400).json({ error: 'Host, usuario y contraseña son requeridos' });
  }
  
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    
    await transporter.verify();
    
    if (from) {
      await transporter.sendMail({
        from,
        to: user,
        subject: 'Prueba SMTP - Vitamar Docs',
        text: 'Esta es una prueba de configuracion SMTP.\n\nSi recibes este correo, la configuracion es correcta.',
      });
    }
    
    res.json({ ok: true, mensaje: 'Configuracion SMTP correcta' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/configuracion/horas ───────────────────────────────────────────
router.get('/horas', requireRol('admin', 'contador', 'tesorero'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT clave, valor FROM configuracion 
       WHERE clave IN ('horas_limite_revision', 'horas_escalacion_nivel2', 'horas_dian_tacita')
       ORDER BY clave`
    );
    
    const horas = {};
    for (const row of rows) {
      horas[row.clave] = row.valor || '';
    }
    
    res.json(horas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/configuracion/horas ───────────────────────────────────────────
router.put('/horas', requireRol('admin', 'contador'), async (req, res) => {
  const { horas_limite_revision, horas_escalacion_nivel2, horas_dian_tacita } = req.body;
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    const updates = [
      ['horas_limite_revision', horas_limite_revision],
      ['horas_escalacion_nivel2', horas_escalacion_nivel2],
      ['horas_dian_tacita', horas_dian_tacita],
    ];
    
    for (const [clave, valor] of updates) {
      if (valor !== undefined) {
        await client.query(
          `INSERT INTO configuracion (clave, valor, actualizado_en) 
           VALUES ($1, $2, NOW()) 
           ON CONFLICT (clave) DO UPDATE SET valor = $2, actualizado_en = NOW()`,
          [clave, String(valor || '')]
        );
      }
    }
    
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── UPDATER ────────────────────────────────────────────────────────────────
const { execSync, exec } = require('child_process');

const APP_DIR = process.cwd();
const UPDATER_LOG = path.join(APP_DIR, 'logs', 'updater.log');

function logUpdater(msg) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${msg}`;
  try {
    const logsDir = path.dirname(UPDATER_LOG);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(UPDATER_LOG, logLine + '\n');
  } catch (e) {}
  console.log(`[Updater] ${msg}`);
}

function getUpdaterLog() {
  try {
    if (fs.existsSync(UPDATER_LOG)) {
      const content = fs.readFileSync(UPDATER_LOG, 'utf8');
      const lines = content.split('\n').filter(l => l.trim()).slice(-100);
      return lines.join('\n');
    }
  } catch (e) {}
  return '';
}

function asyncExec(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: APP_DIR, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

router.get('/updater/status', requireRol('admin'), async (req, res) => {
  try {
    const gitBranch = execSync('git branch --show-current 2>/dev/null || echo "-"', { cwd: APP_DIR }).toString().trim();
    const gitCommit = execSync('git rev-parse --short HEAD 2>/dev/null || echo "-"', { cwd: APP_DIR }).toString().trim();
    const gitRemote = execSync('git remote get-url origin 2>/dev/null || echo "-"', { cwd: APP_DIR }).toString().trim();
    
    const lastUpdate = fs.existsSync(path.join(APP_DIR, '.last-update'))
      ? fs.readFileSync(path.join(APP_DIR, '.last-update'), 'utf8').trim()
      : null;
    
    res.json({
      ok: true,
      branch: gitBranch,
      commit: gitCommit,
      remote: gitRemote,
      lastUpdate,
      updaterLog: getUpdaterLog()
    });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

router.post('/updater/check', requireRol('admin'), async (req, res) => {
  try {
    logUpdater('Verificando actualizaciones...');
    execSync('git fetch origin', { cwd: APP_DIR, stdio: 'pipe' });
    
    const currentCommit = execSync('git rev-parse --short HEAD', { cwd: APP_DIR }).toString().trim();
    
    let behind = 0;
    try {
      behind = parseInt(execSync('git rev-list HEAD..origin/main --count 2>/dev/null || git rev-list HEAD..origin/master --count 2>/dev/null || echo 0', { cwd: APP_DIR }).toString().trim());
    } catch (e) { behind = 0; }
    
    let changes = [];
    if (behind > 0) {
      try {
        const diff = execSync('git log HEAD..origin/main --oneline 2>/dev/null || git log HEAD..origin/master --oneline 2>/dev/null', { cwd: APP_DIR }).toString().trim();
        changes = diff.split('\n').filter(l => l.trim()).slice(0, 10);
      } catch (e) {}
    }
    
    logUpdater(`Verificación completada: ${behind} actualización(es) disponible(s)`);
    
    res.json({
      ok: true,
      hasUpdates: behind > 0,
      commitsBehind: behind,
      currentCommit,
      changes
    });
  } catch (err) {
    logUpdater(`Error verificando: ${err.message}`);
    res.json({ ok: false, error: err.message });
  }
});

router.post('/updater/update', requireRol('admin'), async (req, res) => {
  try {
    logUpdater('========================================');
    logUpdater('INICIANDO ACTUALIZACION');
    logUpdater('========================================');
    
    logUpdater('1. Guardando cambios locales...');
    execSync('git add -A && git stash 2>/dev/null || true', { cwd: APP_DIR, stdio: 'pipe' });
    
    logUpdater('2. Pulling latest changes...');
    execSync('git pull origin main 2>/dev/null || git pull origin master 2>/dev/null', { cwd: APP_DIR, stdio: 'pipe' });
    
    logUpdater('3. Instalando dependencias...');
    try {
      await asyncExec('npm install --production');
      logUpdater('Dependencias instaladas');
    } catch (e) {
      logUpdater(`npm install: ${e.message}`);
    }
    
    logUpdater('4. Ejecutando migraciones...');
    try {
      execSync('npm run migrate', { cwd: APP_DIR, stdio: 'pipe' });
      logUpdater('Migraciones ejecutadas');
    } catch (e) {
      logUpdater(`Migraciones: ${e.message}`);
    }
    
    logUpdater('5. Restaurando cambios locales...');
    execSync('git stash pop 2>/dev/null || true', { cwd: APP_DIR, stdio: 'pipe' });
    
    const newCommit = execSync('git rev-parse --short HEAD', { cwd: APP_DIR }).toString().trim();
    
    logUpdater('========================================');
    logUpdater('ACTUALIZACION COMPLETADA - Commit: ' + newCommit);
    logUpdater('========================================');
    
    fs.writeFileSync(path.join(APP_DIR, '.last-update'), new Date().toISOString());
    
    res.json({ ok: true, message: 'Actualización completada', newCommit });
  } catch (err) {
    logUpdater(`ERROR: ${err.message}`);
    res.json({ ok: false, error: err.message });
  }
});

router.post('/updater/restart', requireRol('admin'), async (req, res) => {
  try {
    logUpdater('Reiniciando servicio...');
    execSync('pm2 restart vitamar-docs', { cwd: APP_DIR, stdio: 'pipe' });
    logUpdater('Servicio reiniciado');
    res.json({ ok: true, message: 'Servicio reiniciado' });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

router.get('/updater/logs', requireRol('admin'), (req, res) => {
  res.json({ log: getUpdaterLog() });
});

// ─── SEGURIDAD ───────────────────────────────────────────────────────────────
router.get('/seguridad', requireRol('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT clave, valor FROM configuracion 
       WHERE clave IN ('rate_limit_window','rate_limit_max','fail2ban_enabled','fail2ban_bantime','fail2ban_findtime','fail2ban_maxretry')
       ORDER BY clave`
    );
    
    const cfg = {};
    for (const row of rows) cfg[row.clave] = row.valor || '';
    
    let fail2banStatus = { installed: false, active: false };
    try {
      const installed = execSync('which fail2ban-client 2>/dev/null && echo yes || echo no').toString().trim();
      fail2banStatus.installed = installed === 'yes';
      if (fail2banStatus.installed) {
        const active = execSync('systemctl is-active fail2ban 2>/dev/null || echo inactive').toString().trim();
        fail2banStatus.active = active === 'active';
      }
    } catch (e) {}
    
    res.json({ config: cfg, fail2ban: fail2banStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/seguridad', requireRol('admin'), async (req, res) => {
  const { rate_limit_window, rate_limit_max, fail2ban_enabled, fail2ban_bantime, fail2ban_findtime, fail2ban_maxretry } = req.body;
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    const updates = [
      ['rate_limit_window', rate_limit_window],
      ['rate_limit_max', rate_limit_max],
      ['fail2ban_enabled', fail2ban_enabled],
      ['fail2ban_bantime', fail2ban_bantime],
      ['fail2ban_findtime', fail2ban_findtime],
      ['fail2ban_maxretry', fail2ban_maxretry],
    ];
    
    for (const [clave, valor] of updates) {
      if (valor !== undefined) {
        await client.query(
          `INSERT INTO configuracion (clave, valor, actualizado_en) 
           VALUES ($1, $2, NOW()) 
           ON CONFLICT (clave) DO UPDATE SET valor = $2, actualizado_en = NOW()`,
          [clave, String(valor || '')]
        );
      }
    }
    
    if (fail2ban_enabled === 'true') {
      try {
        execSync(`cat > /etc/fail2ban/jail.local << 'EOF'
[vitamar-api]
enabled = true
port = 3100
filter = vitamar-api
logpath = /root/vitamar-docs/logs/*.log
maxretry = ${fail2ban_maxretry || 10}
bantime = ${fail2ban_bantime || 3600}
findtime = ${fail2ban_findtime || 600}
action = iptables-allports[name=vitamar]
EOF`, { stdio: 'pipe' });
        
        execSync('systemctl restart fail2ban 2>/dev/null || true', { stdio: 'pipe' });
      } catch (e) {}
    }
    
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Configuración de seguridad guardada' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post('/seguridad/fail2ban/action', requireRol('admin'), async (req, res) => {
  const { action } = req.body;
  
  if (!['start', 'stop', 'restart', 'reload'].includes(action)) {
    return res.status(400).json({ error: 'Acción inválida' });
  }
  
  try {
    execSync(`systemctl ${action} fail2ban 2>/dev/null || true`, { stdio: 'pipe' });
    res.json({ ok: true, message: `Fail2ban ${action}ido` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BACKUPS AUTOMÁTICOS ───────────────────────────────────────────────────
router.get('/backups-auto', requireRol('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT clave, valor FROM configuracion 
       WHERE clave IN ('backup_auto_enabled','backup_auto_cron','backup_auto_path','backup_auto_retention','backup_auto_type','backup_auto_host','backup_auto_user','backup_auto_pass')
       ORDER BY clave`
    );
    
    const cfg = {};
    for (const row of rows) cfg[row.clave] = row.valor || '';
    
    let nasMounted = false;
    if (cfg.backup_auto_type === 'smb') {
      nasMounted = true;
    } else {
      nasMounted = fs.existsSync(cfg.backup_auto_path || '/mnt/vitamar-nas/backup');
    }
    
    let lastBackup = null;
    const backupsPath = cfg.backup_auto_path || '/mnt/vitamar-nas/backup';
    if (cfg.backup_auto_type === 'smb') {
      lastBackup = '(SMB - se actualiza tras el próximo backup)';
    } else if (fs.existsSync(backupsPath)) {
      const files = execSync(`ls -t ${backupsPath}/vitamar_backup_*.zip 2>/dev/null | head -1 || echo none`).toString().trim();
      lastBackup = files !== 'none' ? files : null;
    }
    
    res.json({ 
      config: cfg, 
      nasMounted,
      lastBackup: lastBackup !== 'none' ? lastBackup : null,
      availablePath: backupsPath
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/backups-auto', requireRol('admin'), async (req, res) => {
  const { backup_auto_enabled, backup_auto_cron, backup_auto_path, backup_auto_retention, backup_auto_type, backup_auto_host, backup_auto_user, backup_auto_pass } = req.body;
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    const updates = [
      ['backup_auto_enabled', backup_auto_enabled],
      ['backup_auto_cron', backup_auto_cron],
      ['backup_auto_path', backup_auto_path],
      ['backup_auto_retention', backup_auto_retention],
      ['backup_auto_type', backup_auto_type],
      ['backup_auto_host', backup_auto_host],
      ['backup_auto_user', backup_auto_user],
      ['backup_auto_pass', backup_auto_pass],
    ];
    
    for (const [clave, valor] of updates) {
      if (valor !== undefined) {
        await client.query(
          `INSERT INTO configuracion (clave, valor, actualizado_en) 
           VALUES ($1, $2, NOW()) 
           ON CONFLICT (clave) DO UPDATE SET valor = $2, actualizado_en = NOW()`,
          [clave, String(valor || '')]
        );
      }
    }
    
    if (backup_auto_enabled === 'true' && backup_auto_cron) {
      const cronCmd = `cd /root/vitamar-docs && /usr/bin/node src/scripts/backup-auto.js >> /root/vitamar-docs/logs/backup-auto.log 2>&1`;
      execSync(`(crontab -l 2>/dev/null | grep -v 'backup-auto'; echo "${backup_auto_cron} ${cronCmd}") | crontab -`, { stdio: 'pipe' });
    } else {
      execSync(`crontab -l 2>/dev/null | grep -v 'backup-auto' | crontab -`, { stdio: 'pipe' });
    }
    
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Configuración de backups automáticos guardada' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post('/backups-auto/test', requireRol('admin'), async (req, res) => {
  const { path: backupPath, type, host, user, pass } = req.body;
  
  try {
    if (type === 'smb' && host) {
      const test = execSync(`curl -s -u "${user}:${pass}" --connect-timeout 5 "smb://${host.replace(/\\/g, '/')}/" 2>&1 || echo "FAIL"`, { stdio: 'pipe' }).toString();
      if (test.includes('FAIL')) {
        return res.status(400).json({ ok: false, error: 'No se pudo conectar al servidor SMB' });
      }
      res.json({ ok: true, message: 'Conexión SMB exitosa' });
    } else {
      const testDir = backupPath || '/mnt/vitamar-nas/backup';
      if (!fs.existsSync(testDir)) {
        return res.status(400).json({ ok: false, error: `Directorio no existe: ${testDir}` });
      }
      const testFile = path.join(testDir, '.vitamar-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      res.json({ ok: true, message: 'Ruta accesible para escritura' });
    }
  } catch (err) {
    res.status(400).json({ ok: false, error: `Error probando conexión: ${err.message}` });
  }
});

router.post('/backups-auto/now', requireRol('admin'), async (req, res) => {
  try {
    const { execSync: exec } = require('child_process');
    const os = require('os');
    const path = require('path');
    
    const homeDir = os.homedir();
    const backupDir = path.join(homeDir, 'backups', 'vitamar-docs');
    
    console.log('[Backup] Home dir:', homeDir);
    console.log('[Backup] Backup dir:', backupDir);
    
    // Verificar y crear directorio
    const fs = require('fs');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      console.log('[Backup] Directorio creado');
    }
    
    const fecha = new Date().toISOString().slice(0, 10);
    const timestamp = Date.now();
    const filename = `vitamar_backup_${fecha}_${timestamp}.zip`;
    const backupPath = path.join(backupDir, filename);
    
    const db = require('../db');
    const AdmZip = require('adm-zip');
    
    const zip = new AdmZip();
    
    const agregarQuery = async (sql, nombre) => {
      try {
        const { rows } = await db.query(sql);
        zip.addFile(`${nombre}.json`, Buffer.from(JSON.stringify(rows, null, 2), 'utf8'));
      } catch (e) {
        console.log(`[Backup] Error ${nombre}: ${e.message}`);
      }
    };
    
    await agregarQuery('SELECT * FROM facturas ORDER BY recibida_en DESC LIMIT 2000', 'facturas');
    await agregarQuery('SELECT * FROM eventos_flujo ORDER BY creado_en DESC LIMIT 5000', 'eventos');
    await agregarQuery('SELECT * FROM proveedores', 'proveedores');
    await agregarQuery('SELECT clave, valor FROM configuracion', 'configuracion');
    await agregarQuery('SELECT id, nombre, email, rol, activo, cambio_password, creado_en FROM usuarios', 'usuarios');
    
    // Agregar uploads (facturas y adjuntos)
    const uploadsDir = path.join(APP_DIR, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      if (files.length > 0) {
        console.log('[Backup] Agregando', files.length, 'archivos de uploads');
        zip.addLocalFolder(uploadsDir, 'uploads');
      }
    }
    
    zip.writeZip(backupPath);
    console.log('[Backup] Archivo escrito:', backupPath);
    console.log('[Backup] Existe archivo:', fs.existsSync(backupPath));
    
    res.json({ 
      ok: true, 
      message: 'Backup generado correctamente',
      path: backupPath,
      filename: filename
    });
  } catch (err) {
    console.error('[Backup] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── TAREAS CRON ────────────────────────────────────────────────────────────
router.get('/cron', requireRol('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT clave, valor FROM configuracion 
       WHERE clave IN ('cron_imap','cron_escalaciones','cron_dian','cron_notificaciones')
       ORDER BY clave`
    );
    
    const cfg = {};
    for (const row of rows) cfg[row.clave] = row.valor || '';
    
    let currentCrons = [];
    try {
      const crontab = execSync('crontab -l 2>/dev/null || echo ""').toString();
      currentCrons = crontab.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    } catch (e) {}
    
    res.json({ config: cfg, crontab: currentCrons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/cron', requireRol('admin'), async (req, res) => {
  const { cron_imap, cron_escalaciones, cron_dian, cron_notificaciones } = req.body;
  
  try {
    const SCRIPT_DIR = '/root/vitamar-docs/scripts';
    const APP_DIR_PATH = '/root/vitamar-docs';
    
    const imapCmd = `${SCRIPT_DIR}/cron-imap.sh`;
    const escCmd = `${SCRIPT_DIR}/cron-escalaciones.sh`;
    const dianCmd = `${SCRIPT_DIR}/cron-dian.sh`;
    const notifCmd = `${SCRIPT_DIR}/cron-notificaciones.sh`;
    
    const lines = ['# Vitamar Docs - Tareas programadas'];
    
    if (cron_imap) lines.push(`${cron_imap} ${imapCmd}`);
    if (cron_escalaciones) lines.push(`${cron_escalaciones} ${escCmd}`);
    if (cron_dian) lines.push(`${cron_dian} ${dianCmd}`);
    if (cron_notificaciones) lines.push(`${cron_notificaciones} ${notifCmd}`);
    
    const newCrontab = lines.join('\n') + '\n';
    
    console.log('[CRON] New crontab:', newCrontab);
    
    const cronFile = path.join(APP_DIR_PATH, 'temp_cron.txt');
    fs.writeFileSync(cronFile, newCrontab);
    console.log('[CRON] File written, running crontab command');
    
    execSync(`crontab "${cronFile}"`, { stdio: 'pipe' });
    console.log('[CRON] Crontab installed');
    try { fs.unlinkSync(cronFile); } catch(e) {}
    
    await db.query(
      `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES 
       ('cron_imap', $1, NOW()), ('cron_escalaciones', $2, NOW()), 
       ('cron_dian', $3, NOW()), ('cron_notificaciones', $4, NOW())
       ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor, actualizado_en=NOW()`,
      [cron_imap || '', cron_escalaciones || '', cron_dian || '', cron_notificaciones || '']
    );

    res.json({ ok: true, message: 'Tareas CRON actualizadas' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cron/logs', requireRol('admin'), (req, res) => {
  const logPath = path.join(APP_DIR, 'logs', 'cron.log');
  try {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim()).slice(-50);
      res.json({ log: lines.join('\n') });
    } else {
      res.json({ log: '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
