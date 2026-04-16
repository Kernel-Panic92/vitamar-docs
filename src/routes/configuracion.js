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

module.exports = router;
