const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/areas
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, COUNT(u.id)::int AS total_usuarios,
              MAX(j.nombre) AS jefe_nombre
       FROM areas a
       LEFT JOIN usuarios u ON u.area_id = a.id AND u.activo = TRUE
       LEFT JOIN usuarios j ON j.id = a.jefe_id
       WHERE a.activo = TRUE
       GROUP BY a.id
       ORDER BY a.nombre`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/areas/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, MAX(j.nombre) AS jefe_nombre,
              json_agg(
                json_build_object('id',u.id,'nombre',u.nombre,'email',u.email,'rol',u.rol)
              ) FILTER (WHERE u.id IS NOT NULL) AS usuarios
       FROM areas a
       LEFT JOIN usuarios u ON u.area_id = a.id AND u.activo = TRUE
       LEFT JOIN usuarios j ON j.id = a.jefe_id
       WHERE a.id = $1
       GROUP BY a.id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Área no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/areas
router.post('/', requireRol('admin'), async (req, res) => {
  const { nombre, jefe_id, email } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

  try {
    const { rows } = await db.query(
      `INSERT INTO areas (nombre, jefe_id, email)
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre.trim(), jefe_id || null, email?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un área con ese nombre' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/areas/:id
router.put('/:id', requireRol('admin'), async (req, res) => {
  const { nombre, jefe_id, email, activo } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

  try {
    const { rows } = await db.query(
      `UPDATE areas SET nombre=$1, jefe_id=$2, email=$3, activo=$4
       WHERE id=$5 RETURNING *`,
      [nombre.trim(), jefe_id || null, email?.trim() || null, activo !== false, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Área no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un área con ese nombre' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/areas/:id (soft delete)
router.delete('/:id', requireRol('admin'), async (req, res) => {
  try {
    await db.query('UPDATE areas SET activo=FALSE WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
