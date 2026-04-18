const router = require('express').Router();
const fs = require('fs');
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/categorias
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*,
         COALESCE(
           json_agg(
             json_build_object('id', a.id, 'nombre', a.nombre)
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'
         ) AS areas
       FROM categorias_compra c
       LEFT JOIN categoria_area ca ON ca.categoria_id = c.id
       LEFT JOIN areas a ON a.id = ca.area_id AND a.activo = TRUE
       WHERE c.activo = TRUE
       GROUP BY c.id
       ORDER BY c.nombre`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categorias/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*,
         COALESCE(
           json_agg(
             json_build_object('id', a.id, 'nombre', a.nombre, 'email', a.email)
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'
         ) AS areas
       FROM categorias_compra c
       LEFT JOIN categoria_area ca ON ca.categoria_id = c.id
       LEFT JOIN areas a ON a.id = ca.area_id
       WHERE c.id = $1
       GROUP BY c.id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categorias
router.post('/', requireRol('admin', 'contador'), async (req, res) => {
  const { nombre, descripcion, color, pasos, area_ids } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  if (!Array.isArray(pasos) || pasos.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un paso en el flujo' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO categorias_compra (nombre, descripcion, color, pasos)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre.trim(), descripcion?.trim() || null, color || '#3B82F6', JSON.stringify(pasos)]
    );
    const cat = rows[0];

    // Asociar áreas
    if (Array.isArray(area_ids) && area_ids.length > 0) {
      for (const areaId of area_ids) {
        await client.query(
          `INSERT INTO categoria_area (categoria_id, area_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [cat.id, areaId]
        );
      }
    }

    await client.query('COMMIT');

    // Retornar con áreas
    const full = await db.query(
      `SELECT c.*,
         COALESCE(json_agg(json_build_object('id',a.id,'nombre',a.nombre)) FILTER (WHERE a.id IS NOT NULL),'[]') AS areas
       FROM categorias_compra c
       LEFT JOIN categoria_area ca ON ca.categoria_id = c.id
       LEFT JOIN areas a ON a.id = ca.area_id
       WHERE c.id = $1 GROUP BY c.id`,
      [cat.id]
    );
    res.status(201).json(full.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/categorias/:id
router.put('/:id', requireRol('admin', 'contador'), async (req, res) => {
  const { nombre, descripcion, color, pasos, area_ids } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE categorias_compra
       SET nombre=$1, descripcion=$2, color=$3, pasos=$4
       WHERE id=$5 AND activo=TRUE RETURNING *`,
      [nombre.trim(), descripcion?.trim() || null, color || '#3B82F6', JSON.stringify(pasos), req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // Reemplazar áreas
    await client.query('DELETE FROM categoria_area WHERE categoria_id=$1', [req.params.id]);
    if (Array.isArray(area_ids) && area_ids.length > 0) {
      for (const areaId of area_ids) {
        await client.query(
          `INSERT INTO categoria_area (categoria_id, area_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.params.id, areaId]
        );
      }
    }

    await client.query('COMMIT');

    const full = await db.query(
      `SELECT c.*,
         COALESCE(json_agg(json_build_object('id',a.id,'nombre',a.nombre)) FILTER (WHERE a.id IS NOT NULL),'[]') AS areas
       FROM categorias_compra c
       LEFT JOIN categoria_area ca ON ca.categoria_id = c.id
       LEFT JOIN areas a ON a.id = ca.area_id
       WHERE c.id = $1 GROUP BY c.id`,
      [req.params.id]
    );
    res.json(full.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/categorias/:id (soft delete)
router.delete('/:id', requireRol('admin'), async (req, res) => {
  try {
    await db.query('UPDATE categorias_compra SET activo=FALSE WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/categorias/todas (incluye inactivas) ────────────────────────
router.get('/todas', requireRol('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*,
         COALESCE(
           json_agg(
             json_build_object('id', a.id, 'nombre', a.nombre)
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'
         ) AS areas
       FROM categorias_compra c
       LEFT JOIN categoria_area ca ON ca.categoria_id = c.id
       LEFT JOIN areas a ON a.id = ca.area_id
       GROUP BY c.id
       ORDER BY c.nombre`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/categorias/usuario/:usuarioId ───────────────────────────────
router.get('/usuario/:usuarioId', requireRol('admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT categoria_id FROM categorias_usuario WHERE usuario_id = $1`,
      [req.params.usuarioId]
    );
    res.json(rows.map(r => r.categoria_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/categorias/usuario/:usuarioId ───────────────────────────────
router.put('/usuario/:usuarioId', requireRol('admin'), async (req, res) => {
  const { categoria_ids } = req.body;
  const debugLog = '/root/vitamar-docs/logs/debug.log';
  fs.appendFileSync(debugLog, `PUT categorias/usuario/${req.params.usuarioId} body: ${JSON.stringify(req.body)}\n`);
  
  if (!Array.isArray(categoria_ids)) {
    return res.status(400).json({ error: 'categoria_ids debe ser un array' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    await client.query(
      'DELETE FROM categorias_usuario WHERE usuario_id = $1',
      [req.params.usuarioId]
    );
    fs.appendFileSync(debugLog, `DELETE categorias_usuario done\n`);

    for (const catId of categoria_ids) {
      await client.query(
        'INSERT INTO categorias_usuario (usuario_id, categoria_id) VALUES ($1, $2)',
        [req.params.usuarioId, catId]
      );
    }
    fs.appendFileSync(debugLog, `INSERT categorias_usuario done\n`);

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    fs.appendFileSync(debugLog, `ERROR categorias: ${err.message}\n`);
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
