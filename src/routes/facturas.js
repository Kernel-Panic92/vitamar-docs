const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

// ─── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_DIR || './uploads/facturas';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_MB) || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xml'];
    if (!allowed.includes(path.extname(file.originalname).toLowerCase())) {
      return cb(new Error('Solo se permiten archivos PDF o XML'));
    }
    cb(null, true);
  },
});

// ─── Helper: registrar evento ─────────────────────────────────────────────────
async function registrarEvento(client, facturaId, usuarioId, tipo, comentario = null, metadata = null) {
  await client.query(
    `INSERT INTO eventos_flujo (factura_id, usuario_id, tipo, comentario, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [facturaId, usuarioId, tipo, comentario, metadata ? JSON.stringify(metadata) : null]
  );
}

// ─── GET /api/facturas ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { estado, area_id, categoria_id, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const where  = ['1=1'];

  if (estado)      { params.push(estado);      where.push(`f.estado = $${params.length}`); }
  if (area_id)     { params.push(area_id);     where.push(`f.area_responsable_id = $${params.length}`); }
  if (categoria_id){ params.push(categoria_id); where.push(`f.categoria_id = $${params.length}`); }

  try {
    params.push(parseInt(limit), offset);
    const { rows } = await db.query(
      `SELECT f.*,
         p.nombre  AS proveedor_nombre, p.nit AS proveedor_nit,
         c.nombre  AS categoria_nombre, c.color AS categoria_color,
         a.nombre  AS area_nombre,
         u.nombre  AS asignado_nombre
       FROM facturas f
       LEFT JOIN proveedores       p ON p.id = f.proveedor_id
       LEFT JOIN categorias_compra c ON c.id = f.categoria_id
       LEFT JOIN areas             a ON a.id = f.area_responsable_id
       LEFT JOIN usuarios          u ON u.id = f.asignado_a_id
       WHERE ${where.join(' AND ')}
       ORDER BY f.recibida_en DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const count = await db.query(
      `SELECT COUNT(*)::int FROM facturas f WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({ data: rows, total: count.rows[0].count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/facturas/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT f.*,
         p.nombre AS proveedor_nombre, p.nit AS proveedor_nit, p.email_facturacion,
         c.nombre AS categoria_nombre, c.color AS categoria_color, c.pasos AS categoria_pasos,
         a.nombre AS area_nombre, a.email AS area_email,
         u.nombre AS asignado_nombre, u.email AS asignado_email
       FROM facturas f
       LEFT JOIN proveedores       p ON p.id = f.proveedor_id
       LEFT JOIN categorias_compra c ON c.id = f.categoria_id
       LEFT JOIN areas             a ON a.id = f.area_responsable_id
       LEFT JOIN usuarios          u ON u.id = f.asignado_a_id
       WHERE f.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Factura no encontrada' });

    // Eventos del flujo
    const eventos = await db.query(
      `SELECT e.*, u.nombre AS usuario_nombre
       FROM eventos_flujo e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       WHERE e.factura_id = $1
       ORDER BY e.creado_en ASC`,
      [req.params.id]
    );

    res.json({ ...rows[0], eventos: eventos.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/facturas ───────────────────────────────────────────────────────
router.post('/', upload.fields([{ name:'pdf', maxCount:1 }, { name:'xml', maxCount:1 }]), async (req, res) => {
  const {
    numero_factura, proveedor_id, categoria_id, area_responsable_id,
    valor, valor_iva, valor_total, limite_pago, observaciones,
  } = req.body;

  if (!numero_factura?.trim()) return res.status(400).json({ error: 'Número de factura requerido' });

  const archivo_pdf = req.files?.pdf?.[0]?.filename || null;
  const archivo_xml = req.files?.xml?.[0]?.filename || null;

  // Calcular límite DIAN: 48h desde ahora
  const limiteDian = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO facturas (
         numero_factura, proveedor_id, categoria_id, area_responsable_id,
         valor, valor_iva, valor_total,
         archivo_pdf, archivo_xml,
         limite_dian, limite_pago, observaciones, estado
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'recibida')
       RETURNING *`,
      [
        numero_factura.trim(),
        proveedor_id   || null,
        categoria_id   || null,
        area_responsable_id || null,
        parseFloat(valor)       || 0,
        parseFloat(valor_iva)   || 0,
        parseFloat(valor_total) || 0,
        archivo_pdf,
        archivo_xml,
        limiteDian,
        limite_pago || null,
        observaciones || null,
      ]
    );

    await registrarEvento(client, rows[0].id, req.usuario.id, 'recibida', 'Factura registrada manualmente');
    await client.query('COMMIT');
    res.status(201).json(rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /api/facturas/:id/asignar ─────────────────────────────────────────
router.patch('/:id/asignar', async (req, res) => {
  const { area_responsable_id, asignado_a_id } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE facturas
       SET area_responsable_id=$1, asignado_a_id=$2, estado='revision'
       WHERE id=$3 RETURNING *`,
      [area_responsable_id || null, asignado_a_id || null, req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Factura no encontrada' }); }

    await registrarEvento(client, req.params.id, req.usuario.id, 'asignada',
      null, { area_id: area_responsable_id, usuario_id: asignado_a_id });
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /api/facturas/:id/centro-costos ────────────────────────────────────
router.patch('/:id/centro-costos', async (req, res) => {
  const { centro_costos, observaciones } = req.body;
  if (!centro_costos?.trim()) return res.status(400).json({ error: 'Centro de costos requerido' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE facturas SET centro_costos=$1, observaciones=COALESCE($2, observaciones)
       WHERE id=$3 RETURNING *`,
      [centro_costos.trim(), observaciones || null, req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Factura no encontrada' }); }

    await registrarEvento(client, req.params.id, req.usuario.id, 'centro_costos_asignado',
      `CC asignado: ${centro_costos}`);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /api/facturas/:id/aprobar ─────────────────────────────────────────
router.patch('/:id/aprobar', async (req, res) => {
  const { comentario } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE facturas SET estado='aprobada', aprobada_en=NOW()
       WHERE id=$1 AND estado IN ('recibida','revision') RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No se puede aprobar en el estado actual' }); }

    await registrarEvento(client, req.params.id, req.usuario.id, 'aprobada', comentario || null);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /api/facturas/:id/rechazar ─────────────────────────────────────────
router.patch('/:id/rechazar', async (req, res) => {
  const { motivo } = req.body;
  if (!motivo?.trim()) return res.status(400).json({ error: 'Motivo de rechazo requerido' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE facturas SET estado='rechazada', motivo_rechazo=$1
       WHERE id=$2 AND estado IN ('recibida','revision') RETURNING *`,
      [motivo.trim(), req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No se puede rechazar en el estado actual' }); }

    await registrarEvento(client, req.params.id, req.usuario.id, 'rechazada', motivo);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /api/facturas/:id/causar ───────────────────────────────────────────
router.patch('/:id/causar', requireRol('admin','contador','tesorero'), async (req, res) => {
  const { comentario } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE facturas SET estado='causada', causada_en=NOW()
       WHERE id=$1 AND estado='aprobada' RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'La factura debe estar aprobada para causar' }); }

    await registrarEvento(client, req.params.id, req.usuario.id, 'causada', comentario || null);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /api/facturas/:id/pagar ────────────────────────────────────────────
router.patch('/:id/pagar', requireRol('admin','tesorero'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE facturas SET estado='pagada', pagada_en=NOW()
       WHERE id=$1 AND estado='causada' RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'La factura debe estar causada para marcar como pagada' }); }

    await registrarEvento(client, req.params.id, req.usuario.id, 'pagada');
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── GET /api/facturas/:id/pdf ─────────────────────────────────────────────────
router.get('/:id/pdf', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT archivo_pdf FROM facturas WHERE id=$1', [req.params.id]);
    if (!rows[0]?.archivo_pdf) return res.status(404).json({ error: 'PDF no disponible' });

    const filePath = path.join(process.env.UPLOAD_DIR || './uploads/facturas', rows[0].archivo_pdf);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].archivo_pdf}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
