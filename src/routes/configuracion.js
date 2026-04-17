const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

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
router.get('/imap/test', requireRol('admin'), async (req, res) => {
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
router.get('/smtp/test', requireRol('admin'), async (req, res) => {
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
const fs = require('fs');
const path = require('path');

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

module.exports = router;
