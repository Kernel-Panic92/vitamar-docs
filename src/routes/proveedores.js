const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/proveedores
router.get('/', async (req, res) => {
  const { q } = req.query;
  try {
    const params = [];
    let where = 'activo = TRUE';
    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      where += ` AND (nombre ILIKE $1 OR nit ILIKE $1 OR email_facturacion ILIKE $1)`;
    }
    const { rows } = await db.query(
      `SELECT p.*,
         COUNT(f.id)::int AS total_facturas,
         SUM(f.valor_total)::numeric AS valor_total_facturas
       FROM proveedores p
       LEFT JOIN facturas f ON f.proveedor_id = p.id
       WHERE ${where}
       GROUP BY p.id
       ORDER BY p.nombre`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proveedores/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM proveedores WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proveedores
router.post('/', requireRol('admin', 'contador'), async (req, res) => {
  const { nit, nombre, email_facturacion, telefono, direccion } = req.body;
  if (!nit?.trim() || !nombre?.trim()) {
    return res.status(400).json({ error: 'NIT y nombre son requeridos' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO proveedores (nit, nombre, email_facturacion, telefono, direccion)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nit.trim(), nombre.trim(), email_facturacion?.trim() || null,
       telefono?.trim() || null, direccion?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un proveedor con ese NIT' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/proveedores/:id
router.put('/:id', requireRol('admin', 'contador'), async (req, res) => {
  const { nit, nombre, email_facturacion, telefono, direccion, activo } = req.body;
  if (!nit?.trim() || !nombre?.trim()) {
    return res.status(400).json({ error: 'NIT y nombre son requeridos' });
  }
  try {
    const { rows } = await db.query(
      `UPDATE proveedores
       SET nit=$1, nombre=$2, email_facturacion=$3, telefono=$4, direccion=$5, activo=$6
       WHERE id=$7 RETURNING *`,
      [nit.trim(), nombre.trim(), email_facturacion?.trim() || null,
       telefono?.trim() || null, direccion?.trim() || null,
       activo !== false, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un proveedor con ese NIT' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/proveedores/:id (soft)
router.delete('/:id', requireRol('admin'), async (req, res) => {
  try {
    await db.query('UPDATE proveedores SET activo=FALSE WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
