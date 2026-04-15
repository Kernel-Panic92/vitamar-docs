const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/usuarios
router.get('/', requireRol('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.ultimo_acceso, u.creado_en,
              a.id AS area_id, a.nombre AS area_nombre
       FROM usuarios u
       LEFT JOIN areas a ON a.id = u.area_id
       ORDER BY u.nombre`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/usuarios
router.post('/', requireRol('admin'), async (req, res) => {
  const { nombre, email, password, rol, area_id } = req.body;
  if (!nombre?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, area_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, email, rol, area_id, creado_en`,
      [nombre.trim(), email.toLowerCase().trim(), hash, rol || 'comprador', area_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', requireRol('admin'), async (req, res) => {
  const { nombre, rol, area_id, activo } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE usuarios SET nombre=$1, rol=$2, area_id=$3, activo=$4
       WHERE id=$5 RETURNING id, nombre, email, rol, area_id, activo`,
      [nombre?.trim(), rol, area_id || null, activo !== false, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
