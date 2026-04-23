const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ─────────────────────────────────────────────
// RATE LIMITING — protección fuerza bruta
// ─────────────────────────────────────────────
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS    = 5 * 60 * 1000;   // 5 min
const LOGIN_BLOCK_MS     = 30 * 60 * 1000;  // 30 min

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (data.blockedUntil && now > data.blockedUntil) loginAttempts.delete(ip);
    else if (now - data.firstAttempt > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
}, 10 * 60 * 1000);

function getRealIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(s => s && s !== '127.0.0.1');
  return fwd[0] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
}

function loginRateLimit(req, res, next) {
  const ip  = getRealIp(req);
  const now = Date.now();
  let data  = loginAttempts.get(ip) || { count: 0, firstAttempt: now, blockedUntil: null };

  if (data.blockedUntil && now < data.blockedUntil) {
    const mins = Math.ceil((data.blockedUntil - now) / 60000);
    res.set('X-RateLimit-Limit',    LOGIN_MAX_ATTEMPTS);
    res.set('X-RateLimit-Remaining', 0);
    res.set('X-RateLimit-Reset',    Math.ceil(data.blockedUntil / 1000));
    res.set('Retry-After',           Math.ceil((data.blockedUntil - now) / 1000));
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Intenta de nuevo en ${mins} minuto${mins !== 1 ? 's' : ''}.`,
      blocked: true,
    });
  }

  if (now - data.firstAttempt > LOGIN_WINDOW_MS) {
    data = { count: 0, firstAttempt: now, blockedUntil: null };
  }

  loginAttempts.set(ip, data);
  req._loginIp   = ip;
  req._loginData = data;

  res.set('X-RateLimit-Limit',    LOGIN_MAX_ATTEMPTS);
  res.set('X-RateLimit-Remaining', Math.max(0, LOGIN_MAX_ATTEMPTS - data.count - 1));
  res.set('X-RateLimit-Reset',    Math.ceil((data.firstAttempt + LOGIN_WINDOW_MS) / 1000));

  next();
}

function loginRegisterFail(ip) {
  const now  = Date.now();
  const data = loginAttempts.get(ip) || { count: 0, firstAttempt: now, blockedUntil: null };
  data.count++;
  if (data.count >= LOGIN_MAX_ATTEMPTS) {
    data.blockedUntil = now + LOGIN_BLOCK_MS;
    console.warn(`[Auth] 🔒 IP bloqueada por fuerza bruta: ${ip} (${data.count} intentos)`);
  }
  loginAttempts.set(ip, data);
}

function loginRegisterSuccess(ip) {
  loginAttempts.delete(ip);
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function validarPassword(p) {
  const errores = [];
  if (!p || p.length < 8)              errores.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(p))                errores.push('Al menos una mayúscula');
  if (!/[0-9]/.test(p))                errores.push('Al menos un número');
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=]/.test(p)) errores.push('Al menos un carácter especial');
  return errores;
}

function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

// ─────────────────────────────────────────────
// SMTP (lazy load para evitar circular)
// ─────────────────────────────────────────────
let smtpService = null;
function getSmtpService() {
  if (!smtpService) {
    smtpService = require('../services/smtp.service');
  }
  return smtpService;
}

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
router.post('/login', loginRateLimit, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const { rows } = await db.query(
      `SELECT u.*, a.nombre AS area_nombre
       FROM usuarios u
       LEFT JOIN areas a ON a.id = u.area_id
       WHERE u.email = $1 AND u.activo = TRUE`,
      [email.toLowerCase().trim()]
    );

    const usuario = rows[0];
    if (!usuario) {
      loginRegisterFail(req._loginIp);
      db.query(
        `INSERT INTO log_accesos (email, ip, user_agent, exito, motivo) VALUES ($1, $2, $3, FALSE, 'Usuario no encontrado')`,
        [email.toLowerCase().trim(), req._loginIp, req.headers['user-agent'] || null]
      ).catch(() => {});
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const ok = await bcrypt.compare(password, usuario.password_hash);
    if (!ok) {
      loginRegisterFail(req._loginIp);
      db.query(
        `INSERT INTO log_accesos (usuario_id, email, ip, user_agent, exito, motivo) VALUES ($1, $2, $3, $4, FALSE, 'Contraseña incorrecta')`,
        [usuario.id, email.toLowerCase().trim(), req._loginIp, req.headers['user-agent'] || null]
      ).catch(() => {});
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    loginRegisterSuccess(req._loginIp);

    // Log acceso exitoso
    db.query(
      `INSERT INTO log_accesos (usuario_id, email, ip, user_agent, exito) VALUES ($1, $2, $3, $4, TRUE)`,
      [usuario.id, usuario.email, req._loginIp, req.headers['user-agent'] || null]
    ).catch(() => {});

    // Actualizar último acceso
    await db.query(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1',
      [usuario.id]
    );

    // Cargar categorías permitidas del usuario
    let categoriasPermitidas = [];
    if (usuario.area_id) {
      // Categorías del área del usuario
      const catsArea = await db.query(
        `SELECT DISTINCT c.id FROM categorias_compra c
         JOIN categoria_area ca ON ca.categoria_id = c.id
         WHERE ca.area_id = $1 AND c.activo = TRUE`,
        [usuario.area_id]
      );
      categoriasPermitidas = catsArea.rows.map(r => r.id);
    }
    // Agregar categorías asignadas explícitamente
    const catsExtras = await db.query(
      `SELECT categoria_id FROM categorias_usuario WHERE usuario_id = $1`,
      [usuario.id]
    );
    const catsExtraIds = catsExtras.rows.map(r => r.categoria_id);
    categoriasPermitidas = [...new Set([...categoriasPermitidas, ...catsExtraIds])];

    const payload = {
      id:          usuario.id,
      nombre:      usuario.nombre,
      email:       usuario.email,
      rol:         usuario.rol,
      area_id:     usuario.area_id,
      area_nombre: usuario.area_nombre,
      categorias:  categoriasPermitidas,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    res.json({
      token,
      usuario: payload,
      cambio_password: usuario.cambio_password || false,
    });

  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.area_id, u.ultimo_acceso,
              u.cambio_password, a.nombre AS area_nombre
       FROM usuarios u
       LEFT JOIN areas a ON a.id = u.area_id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/cambiar-password
// ─────────────────────────────────────────────
router.post('/cambiar-password', authMiddleware, async (req, res) => {
  const { actual, nueva } = req.body;
  if (!actual || !nueva) {
    return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
  }

  const errores = validarPassword(nueva);
  if (errores.length) {
    return res.status(400).json({ error: errores.join(', ') });
  }

  try {
    const { rows } = await db.query(
      'SELECT password_hash FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );

    const ok = await bcrypt.compare(actual, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(nueva, 12);
    await db.query(
      'UPDATE usuarios SET password_hash = $1, cambio_password = FALSE WHERE id = $2',
      [hash, req.usuario.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Correo requerido' });

  try {
    const { rows } = await db.query(
      'SELECT id, nombre, email FROM usuarios WHERE email = $1 AND activo = TRUE',
      [email.toLowerCase().trim()]
    );

    if (!rows[0]) {
      // No revelar si el email existe o no
      return res.json({ ok: true });
    }

    const usuario = rows[0];

    // Invalidar tokens anteriores
    await db.query('DELETE FROM tokens_reset WHERE usuario_id = $1', [usuario.id]);

    // Generar nuevo token
    const token  = generateToken();
    const expira = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await db.query(
      'INSERT INTO tokens_reset (token, usuario_id, expira) VALUES ($1, $2, $3)',
      [token, usuario.id, expira]
    );

    // Enviar email
    try {
      console.log('[Auth] Enviando recovery a:', usuario.email);
      const smtp = getSmtpService();
      await smtp.enviarRecuperacion(usuario, token, req.headers.host || 'localhost');
      console.log('[Auth] Email enviado exitosamente');
      res.json({ ok: true });
    } catch (mailErr) {
      console.error('[Auth] Error enviando correo:', mailErr.message);
      res.json({ ok: true }); // No revelar error al cliente
    }

  } catch (err) {
    console.error('[Auth/forgot]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/reset-password
// ─────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token y contraseña requeridos' });

  const errores = validarPassword(password);
  if (errores.length) {
    return res.status(400).json({ error: 'Contraseña inválida: ' + errores.join(', ') });
  }

  try {
    const { rows } = await db.query(
      'SELECT * FROM tokens_reset WHERE token = $1',
      [token]
    );

    if (!rows[0] || new Date(rows[0].expira) < new Date()) {
      if (rows[0]) {
        await db.query('DELETE FROM tokens_reset WHERE token = $1', [token]);
      }
      return res.status(400).json({ error: 'El enlace es inválido o ya expiró' });
    }

    const hash = await bcrypt.hash(password, 12);
    await db.query(
      'UPDATE usuarios SET password_hash = $1, cambio_password = FALSE WHERE id = $2',
      [hash, rows[0].usuario_id]
    );

    // Invalidar token
    await db.query('DELETE FROM tokens_reset WHERE token = $1', [token]);
    // Invalidar todas las sesiones del usuario
    await db.query('DELETE FROM sesiones WHERE usuario_id = $1', [rows[0].usuario_id]);

    res.json({ ok: true });

  } catch (err) {
    console.error('[Auth/reset]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/cambio-forzado (cambio obligatorio al iniciar)
// ─────────────────────────────────────────────
router.post('/cambio-forzado', authMiddleware, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Contraseña requerida' });

  const errores = validarPassword(password);
  if (errores.length) {
    return res.status(400).json({ error: errores.join(', ') });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    await db.query(
      'UPDATE usuarios SET password_hash = $1, cambio_password = FALSE WHERE id = $2',
      [hash, req.usuario.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM sesiones WHERE token = $1', [req.usuario._token]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─────────────────────────────────────────────
// GET /api/auth/ratelimit-status (solo admin)
// ─────────────────────────────────────────────
router.get('/ratelimit-status', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const now = Date.now();
  const bloqueadas    = [];
  const enSeguimiento = [];

  for (const [ip, data] of loginAttempts.entries()) {
    if (data.blockedUntil && now < data.blockedUntil) {
      bloqueadas.push({
        ip,
        intentos:         data.count,
        bloqueadaHasta:   new Date(data.blockedUntil).toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        minutosRestantes: Math.ceil((data.blockedUntil - now) / 60000),
      });
    } else if (data.count > 0) {
      enSeguimiento.push({
        ip,
        intentos:       data.count,
        ventanaExpiraEn: Math.ceil((LOGIN_WINDOW_MS - (now - data.firstAttempt)) / 60000),
      });
    }
  }

  res.json({
    configuracion: {
      maxIntentos:    LOGIN_MAX_ATTEMPTS,
      ventanaMinutos: LOGIN_WINDOW_MS / 60000,
      bloqueoMinutos: LOGIN_BLOCK_MS / 60000,
    },
    totalIpsEnSeguimiento: loginAttempts.size,
    totalBloqueadas:        bloqueadas.length,
    bloqueadas,
    enSeguimiento,
  });
});

// DELETE /api/auth/ratelimit-status/:ip (desbloquear IP manualmente)
router.delete('/ratelimit-status/:ip', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const ip = decodeURIComponent(req.params.ip);
  if (loginAttempts.has(ip)) {
    loginAttempts.delete(ip);
    console.log(`[Auth] 🔓 IP desbloqueada manualmente por admin: ${ip}`);
    res.json({ ok: true, mensaje: 'IP desbloqueada correctamente' });
  } else {
    res.status(404).json({ error: 'IP no encontrada en el rate limiter' });
  }
});

module.exports = router;
