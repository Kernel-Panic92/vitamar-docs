const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/usuarios/simple - para dropdowns (solo id y nombre)
router.get('/simple', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nombre FROM usuarios WHERE activo = TRUE ORDER BY nombre`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/usuarios
router.get('/', requireRol('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.ultimo_acceso, u.creado_en,
              a.id AS area_id, a.nombre AS area_nombre,
              (SELECT COUNT(*)::int FROM categorias_usuario cu WHERE cu.usuario_id = u.id) AS categorias_count,
              (SELECT ARRAY_AGG(categoria_id) FROM categorias_usuario cu WHERE cu.usuario_id = u.id) AS categoria_ids
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
  const { nombre, email, rol, area_id, activo, password } = req.body;
  
  try {
    // Normalizar area_id - si es string vacío, convertir a null
    const areaIdValue = (area_id === '' || area_id === null || !area_id) ? null : String(area_id);
    
    // Construir query dinámicamente
    const updates = ['nombre=$1', 'rol=$2', 'activo=CAST($3 AS boolean)'];
    const values = [nombre?.trim(), rol, activo === true ? 'true' : 'false'];
    
    // Agregar area_id como texto (PostgreSQL lo maneja mejor así)
    if (areaIdValue) {
      updates.push(`area_id=$${updates.length + 1}`);
      values.push(areaIdValue);
    }
    
    let query = `UPDATE usuarios SET ${updates.join(', ')}`;
    
    if (password && password.trim()) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash=$${updates.length + 1}`);
      values.push(String(hash));
    }
    
    values.push(req.params.id);
    query += ` WHERE id=$${values.length} RETURNING id, nombre, email, rol, area_id, activo`;
    
    const { rows } = await db.query(query, values);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/usuarios/:id
router.delete('/:id', requireRol('admin'), async (req, res) => {
  if (req.params.id === req.usuario.id) {
    return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  }
  try {
    await db.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
