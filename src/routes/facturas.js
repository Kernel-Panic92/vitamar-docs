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

// ─── Helper: construir filtro de categorías por usuario ───────────────────────
function construirFiltroCategorias(usuario) {
  const { rol, area_id, categorias } = usuario;
  
  // Admin y contador ven todo
  if (['admin', 'contador', 'auditor'].includes(rol)) {
    return null; // Sin filtro
  }
  
  // Si tiene categorías explícitamente asignadas
  if (categorias && Array.isArray(categorias) && categorias.length > 0) {
    return categorias;
  }
  
  // Si tiene área, obtener categorías del área
  if (area_id) {
    return 'AREA'; // Flag especial para indicar que se filtrará por área
  }
  
  // Si no tiene nada, no ve facturas (devuelve array vacío)
  return [];
}

// GET /api/facturas/badge-stats
router.get('/badge-stats', async (req, res) => {
  try {
    const totalRes = await db.query('SELECT COUNT(*) as total FROM facturas');
    
    const tresDias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const urgenteRes = await db.query(
      `SELECT COUNT(*) as total FROM facturas f 
       WHERE f.estado IN ('recibida','aprobada') 
       AND f.fecha_limite_pago IS NOT NULL
       AND f.fecha_limite_pago <= $1`,
      [tresDias]
    );
    
    res.json({ 
      total: parseInt(totalRes.rows[0].total), 
      pendientes_urgentes: parseInt(urgenteRes.rows[0].total) 
    });
  } catch (err) {
    console.error('[badge-stats] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/facturas/pendientes
router.get('/pendientes', async (req, res) => {
  try {
    const hoy = new Date();
    const en3dias = new Date(hoy.getTime() + 3 * 24 * 60 * 60 * 1000);
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
    const hace7dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { rows } = await db.query(
      `SELECT f.*,
        p.nombre AS proveedor_nombre, p.nit AS proveedor_nit,
        c.nombre AS categoria_nombre, c.color AS categoria_color,
        a.nombre AS area_nombre,
        CASE 
          WHEN f.limite_dian <= $2 THEN 'critico'
          WHEN f.limite_dian <= $3 THEN 'alerta'
          WHEN f.estado = 'causada' AND f.soporte_pago IS NULL THEN 'alerta'
          WHEN f.estado = 'revision' AND f.recibida_en < $4 THEN 'alerta'
          ELSE 'normal'
        END AS prioridad,
        CASE
          WHEN f.limite_dian IS NOT NULL THEN 'dian'
          WHEN f.estado = 'causada' AND f.soporte_pago IS NULL THEN 'soporte'
          WHEN f.estado = 'revision' THEN 'revision'
          ELSE 'normal'
        END AS tipo_urgencia
       FROM facturas f
       LEFT JOIN proveedores p ON p.id = f.proveedor_id
       LEFT JOIN categorias_compra c ON c.id = f.categoria_id
       LEFT JOIN areas a ON a.id = f.area_responsable_id
       WHERE (
         (f.limite_dian IS NOT NULL AND f.limite_dian <= $3 AND f.limite_dian >= $1 AND f.estado IN ('recibida', 'revision'))
         OR
         (f.estado = 'causada' AND f.soporte_pago IS NULL)
         OR
         (f.estado = 'revision' AND f.recibida_en < $4)
       )
       ORDER BY 
         CASE 
           WHEN f.limite_dian <= $2 THEN 1 
           WHEN f.limite_dian <= $3 THEN 2 
           WHEN f.estado = 'causada' AND f.soporte_pago IS NULL THEN 2
           WHEN f.estado = 'revision' THEN 3 
           ELSE 4 
         END,
         f.limite_dian ASC NULLS LAST
       LIMIT 100`,
      [hoy.toISOString(), en3dias.toISOString(), en7dias.toISOString(), hace7dias.toISOString()]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/facturas ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { 
    estado, area_id, categoria_id, proveedor_id,
    numero, nit_emisor, fecha_desde, fecha_hasta,
    valor_min, valor_max,
    buscar,
    page = 1, limit = 50 
  } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const where  = ['1=1'];

  // ─── FILTRO DE CATEGORÍAS POR USUARIO ───────────────────────────────────
  const filtroCats = construirFiltroCategorias(req.usuario);
  
  if (filtroCats === null) {
    // Admin/contador/auditor ven todo - sin filtro adicional
  } else if (filtroCats.length === 0) {
    // Usuario sin acceso a categorías - no ve facturas
    return res.json({ data: [], total: 0, page: 1, limit: parseInt(limit) });
  } else if (filtroCats === 'AREA') {
    // Filtrar por categorías del área del usuario
    where.push(`f.categoria_id IN (
      SELECT ca.categoria_id FROM categoria_area ca 
      WHERE ca.area_id = $${params.length + 1}
    )`);
    params.push(req.usuario.area_id);
  } else {
    // Filtrar por categorías explícitamente asignadas
    const placeholders = filtroCats.map((_, i) => `$${params.length + 1 + i}`).join(',');
    where.push(`f.categoria_id IN (${placeholders})`);
    params.push(...filtroCats);
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (estado)      { params.push(estado);      where.push(`f.estado = $${params.length}`); }
  if (area_id)     { params.push(area_id);     where.push(`f.area_responsable_id = $${params.length}`); }
  if (categoria_id){ params.push(categoria_id); where.push(`f.categoria_id = $${params.length}`); }
  if (proveedor_id){ params.push(proveedor_id); where.push(`f.proveedor_id = $${params.length}`); }
  
  // Búsqueda por número de factura
  if (numero) {
    params.push(`%${numero}%`);
    where.push(`f.numero_factura ILIKE $${params.length}`);
  }
  
  // Búsqueda por NIT emisor
  if (nit_emisor) {
    params.push(`%${nit_emisor}%`);
    where.push(`f.nit_emisor ILIKE $${params.length}`);
  }
  
  // Filtro por rango de fechas
  if (fecha_desde) {
    params.push(fecha_desde);
    where.push(`f.recibida_en::date >= $${params.length}`);
  }
  if (fecha_hasta) {
    params.push(fecha_hasta);
    where.push(`f.recibida_en::date <= $${params.length}`);
  }
  
  // Filtro por rango de valores
  if (valor_min) {
    params.push(parseFloat(valor_min));
    where.push(`f.valor_total >= $${params.length}`);
  }
  if (valor_max) {
    params.push(parseFloat(valor_max));
    where.push(`f.valor_total <= $${params.length}`);
  }
  
  // Búsqueda general
  if (buscar) {
    params.push(`%${buscar}%`);
    where.push(`(
      f.numero_factura ILIKE $${params.length} OR
      p.nombre ILIKE $${params.length} OR
      p.nit ILIKE $${params.length} OR
      f.nit_emisor ILIKE $${params.length} OR
      f.nombre_emisor ILIKE $${params.length} OR
      f.cufe ILIKE $${params.length}
    )`);
  }

  try {
    const countParams = [...params];
    params.push(parseInt(limit), offset);
    
    const { rows } = await db.query(
      `SELECT f.*,
         p.nombre  AS proveedor_nombre, p.nit AS proveedor_nit,
         c.nombre  AS categoria_nombre, c.color AS categoria_color,
         a.nombre  AS area_nombre,
         co.nombre AS centro_operacion_nombre,
         u.nombre  AS asignado_nombre,
         f.soporte_pago IS NOT NULL AS tiene_soporte
       FROM facturas f
       LEFT JOIN proveedores         p ON p.id = f.proveedor_id
       LEFT JOIN categorias_compra   c ON c.id = f.categoria_id
       LEFT JOIN areas               a ON a.id = f.area_responsable_id
       LEFT JOIN centros_operacion  co ON co.id = f.centro_operacion_id
       LEFT JOIN usuarios            u ON u.id = f.asignado_a_id
       WHERE ${where.join(' AND ')}
       ORDER BY f.recibida_en DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const count = await db.query(
      `SELECT COUNT(*)::int FROM facturas f
       LEFT JOIN proveedores p ON p.id = f.proveedor_id
       WHERE ${where.join(' AND ')}`,
      countParams
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
         co.nombre AS centro_operacion_nombre,
         u.nombre AS asignado_nombre, u.email AS asignado_email
       FROM facturas f
       LEFT JOIN proveedores         p ON p.id = f.proveedor_id
       LEFT JOIN categorias_compra   c ON c.id = f.categoria_id
       LEFT JOIN areas               a ON a.id = f.area_responsable_id
       LEFT JOIN centros_operacion co ON co.id = f.centro_operacion_id
       LEFT JOIN usuarios            u ON u.id = f.asignado_a_id
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
  const { 
    centro_operacion_id, area_responsable_id, centro_costos, descripcion_gasto, referencia, comentario 
  } = req.body;
  
  if (!centro_operacion_id) {
    return res.status(400).json({ error: 'El centro de operación es requerido' });
  }
  if (!area_responsable_id) {
    return res.status(400).json({ error: 'El área de destino es requerida' });
  }
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    // Actualizar datos de la factura antes de aprobar
    const { rows } = await client.query(
      `UPDATE facturas SET 
         centro_operacion_id = $1,
         area_responsable_id = $2,
         centro_costos = $3,
         descripcion_gasto = $4,
         referencia = $5,
         estado = 'aprobada',
         aprobada_en = NOW()
       WHERE id=$6 AND estado IN ('recibida','revision') 
       RETURNING *`,
      [centro_operacion_id, area_responsable_id, centro_costos || null, descripcion_gasto || null, referencia || null, req.params.id]
    );
    
    if (!rows[0]) { 
      await client.query('ROLLBACK'); 
      return res.status(400).json({ error: 'No se puede aprobar en el estado actual' }); 
    }

    await registrarEvento(client, req.params.id, req.usuario.id, 'aprobada', 
      comentario || `Aprobada para centro ${centro_operacion_id}, área ${area_responsable_id}${centro_costos ? ', CC: ' + centro_costos : ''}`);
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

    await registrarEvento(client, req.params.id, req.usuario.id, 'pagada', 'Factura marcada como pagada');
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── POST /api/facturas/:id/soporte-pago ───────────────────────────────────
router.post('/:id/soporte-pago', requireRol('admin','tesorero'), upload.single('soporte'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo requerido' });
  }

  const uploadDir = process.env.UPLOAD_DIR || './uploads/soportes';
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
  if (!allowedTypes.includes(ext)) {
    return res.status(400).json({ error: 'Tipo de archivo no permitido. Use PDF, PNG, JPG o GIF' });
  }

  const filename = `soporte_${req.params.id}_${Date.now()}${ext}`;
  const filepath = path.join(uploadDir, filename);

  fs.writeFileSync(filepath, req.file.buffer);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE facturas SET soporte_pago=$1, soporte_pago_nombre=$2 WHERE id=$3 RETURNING *`,
      [filename, req.file.originalname, req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Factura no encontrada' }); }

    await registrarEvento(client, req.params.id, req.usuario.id, 'soporte_adjuntado', `Soporte de pago: ${req.file.originalname}`);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    fs.unlinkSync(filepath);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── GET /api/facturas/:id/soporte-pago ────────────────────────────────────
router.get('/:id/soporte-pago', async (req, res) => {
  const { rows } = await db.query(
    'SELECT soporte_pago, soporte_pago_nombre FROM facturas WHERE id=$1',
    [req.params.id]
  );
  if (!rows[0] || !rows[0].soporte_pago) {
    return res.status(404).json({ error: 'Soporte no encontrado' });
  }

  const filepath = path.join(process.env.UPLOAD_DIR || './uploads/soportes', rows[0].soporte_pago);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  res.download(filepath, rows[0].soporte_pago_nombre);
});

// ─── GET /api/facturas/:id/pdf ─────────────────────────────────────────────────
router.get('/:id/pdf', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    try {
      const jwt = require('jsonwebtoken');
      jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido' });
    }

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
