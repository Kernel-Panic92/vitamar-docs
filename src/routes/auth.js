const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
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
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const ok = await bcrypt.compare(password, usuario.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Actualizar último acceso
    await db.query(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1',
      [usuario.id]
    );

    const payload = {
      id:         usuario.id,
      nombre:     usuario.nombre,
      email:      usuario.email,
      rol:        usuario.rol,
      area_id:    usuario.area_id,
      area_nombre:usuario.area_nombre,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    res.json({ token, usuario: payload });

  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.area_id, u.ultimo_acceso,
              a.nombre AS area_nombre
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

// POST /api/auth/cambiar-password
router.post('/cambiar-password', authMiddleware, async (req, res) => {
  const { actual, nueva } = req.body;
  if (!actual || !nueva || nueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
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
      'UPDATE usuarios SET password_hash = $1 WHERE id = $2',
      [hash, req.usuario.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
