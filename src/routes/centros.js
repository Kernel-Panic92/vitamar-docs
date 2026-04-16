const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

// ─── GET /api/centros ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM centros_operacion ORDER BY nombre ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/centros/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM centros_operacion WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Centro no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/centros ────────────────────────────────────────────────────
router.post('/', requireRol('admin'), async (req, res) => {
  const { nombre, codigo, descripcion, direccion, telefono, email, activo } = req.body;
  
  if (!nombre?.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  try {
    const existente = await db.query(
      'SELECT id FROM centros_operacion WHERE nombre = $1',
      [nombre.trim()]
    );
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe un centro con ese nombre' });
    }

    const { rows } = await db.query(
      `INSERT INTO centros_operacion (nombre, codigo, descripcion, direccion, telefono, email, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        nombre.trim(),
        codigo?.trim() || null,
        descripcion?.trim() || null,
        direccion?.trim() || null,
        telefono?.trim() || null,
        email?.trim() || null,
        activo !== false
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/centros/:id ─────────────────────────────────────────────────
router.put('/:id', requireRol('admin'), async (req, res) => {
  const { nombre, codigo, descripcion, direccion, telefono, email, activo } = req.body;
  
  if (!nombre?.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  try {
    const existente = await db.query(
      'SELECT id FROM centros_operacion WHERE nombre = $1 AND id != $2',
      [nombre.trim(), req.params.id]
    );
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe un centro con ese nombre' });
    }

    const { rows } = await db.query(
      `UPDATE centros_operacion 
       SET nombre=$1, codigo=$2, descripcion=$3, direccion=$4, telefono=$5, email=$6, activo=$7
       WHERE id=$8
       RETURNING *`,
      [
        nombre.trim(),
        codigo?.trim() || null,
        descripcion?.trim() || null,
        direccion?.trim() || null,
        telefono?.trim() || null,
        email?.trim() || null,
        activo !== false,
        req.params.id
      ]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Centro no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/centros/:id ───────────────────────────────────────────────
router.delete('/:id', requireRol('admin'), async (req, res) => {
  try {
    const enUso = await db.query(
      'SELECT COUNT(*)::int AS n FROM facturas WHERE centro_operacion_id = $1',
      [req.params.id]
    );
    if (enUso.rows[0].n > 0) {
      return res.status(400).json({ 
        error: `No se puede eliminar: hay ${enUso.rows[0].n} factura(s) asignadas a este centro` 
      });
    }

    const { rows } = await db.query(
      'DELETE FROM centros_operacion WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Centro no encontrado' });
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
