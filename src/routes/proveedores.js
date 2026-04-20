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
  const { nit, nombre, email_facturacion, telefono, direccion, categoria_default_id } = req.body;
  if (!nit?.trim() || !nombre?.trim()) {
    return res.status(400).json({ error: 'NIT y nombre son requeridos' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO proveedores (nit, nombre, email_facturacion, telefono, direccion, categoria_default_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nit.trim(), nombre.trim(), email_facturacion?.trim() || null,
       telefono?.trim() || null, direccion?.trim() || null, categoria_default_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un proveedor con ese NIT' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/proveedores/:id
router.put('/:id', requireRol('admin', 'contador'), async (req, res) => {
  const { nit, nombre, email_facturacion, telefono, direccion, activo, categoria_default_id } = req.body;
  if (!nit?.trim() || !nombre?.trim()) {
    return res.status(400).json({ error: 'NIT y nombre son requeridos' });
  }
  try {
    const { rows } = await db.query(
      `UPDATE proveedores
       SET nit=$1, nombre=$2, email_facturacion=$3, telefono=$4, direccion=$5, activo=$6, categoria_default_id=$7
       WHERE id=$8 RETURNING *`,
      [nit.trim(), nombre.trim(), email_facturacion?.trim() || null,
       telefono?.trim() || null, direccion?.trim() || null,
       activo !== false, categoria_default_id || null, req.params.id]
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

// GET /api/proveedores/:id/categorias-preferidas - categorías más usadas por proveedor
router.get('/:id/categorias-preferidas', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT cp.id, cp.nombre, pcp.contador, pcp.actualizado_en
       FROM proveedor_categoria_preferencia pcp
       JOIN categorias_compra cp ON cp.id = pcp.categoria_id
       WHERE pcp.proveedor_id = $1
       ORDER BY pcp.contador DESC
       LIMIT 5`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
