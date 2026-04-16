const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);

// ─── GET /api/audit/accesos ────────────────────────────────────────────────
router.get('/accesos', requireRol('admin', 'auditor'), async (req, res) => {
  const { page = 1, limit = 50, usuario_id, exito, desde, hasta } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const where = ['1=1'];

  if (usuario_id) {
    params.push(usuario_id);
    where.push(`l.usuario_id = $${params.length}`);
  }
  if (exito !== undefined) {
    params.push(exito === 'true');
    where.push(`l.exito = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    where.push(`l.creado_en::date >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    where.push(`l.creado_en::date <= $${params.length}`);
  }

  try {
    const { rows } = await db.query(
      `SELECT l.*, u.nombre AS usuario_nombre, u.email AS usuario_email
       FROM log_accesos l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.creado_en DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    const count = await db.query(
      `SELECT COUNT(*)::int FROM log_accesos l WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({
      data: rows,
      total: count.rows[0].count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/audit/eventos ────────────────────────────────────────────────
router.get('/eventos', requireRol('admin', 'auditor'), async (req, res) => {
  const { page = 1, limit = 50, tipo, usuario_id, factura_id } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const where = ['1=1'];

  if (tipo) {
    params.push(tipo);
    where.push(`e.tipo = $${params.length}`);
  }
  if (usuario_id) {
    params.push(usuario_id);
    where.push(`e.usuario_id = $${params.length}`);
  }
  if (factura_id) {
    params.push(factura_id);
    where.push(`e.factura_id = $${params.length}`);
  }

  try {
    const { rows } = await db.query(
      `SELECT e.*, u.nombre AS usuario_nombre, u.email AS usuario_email,
              f.numero_factura
       FROM eventos_flujo e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       LEFT JOIN facturas f ON f.id = e.factura_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.creado_en DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    const count = await db.query(
      `SELECT COUNT(*)::int FROM eventos_flujo e WHERE ${where.join(' AND ')}`,
      params
    );

    res.json({
      data: rows,
      total: count.rows[0].count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/audit/estadisticas ───────────────────────────────────────────
router.get('/estadisticas', requireRol('admin', 'auditor'), async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [accesosHoy, accesos7d, accesos30d, loginsFallidos, eventosTotales, usuariosActivos] = await Promise.all([
      db.query(`SELECT COUNT(*)::int FROM log_accesos WHERE creado_en::date = $1`, [hoy]),
      db.query(`SELECT COUNT(*)::int FROM log_accesos WHERE creado_en::date >= $1`, [hace7]),
      db.query(`SELECT COUNT(*)::int FROM log_accesos WHERE creado_en::date >= $1`, [hace30]),
      db.query(`SELECT COUNT(*)::int FROM log_accesos WHERE exito = FALSE AND creado_en::date >= $1`, [hace7]),
      db.query(`SELECT COUNT(*)::int FROM eventos_flujo WHERE creado_en >= $1`, [hace30]),
      db.query(`SELECT COUNT(DISTINCT usuario_id)::int FROM log_accesos WHERE exito = TRUE AND creado_en::date >= $1`, [hace7]),
    ]);

    const topErrores = await db.query(
      `SELECT ip, COUNT(*)::int AS intentos, MAX(creado_en) AS ultimo_intento
       FROM log_accesos WHERE exito = FALSE AND creado_en::date >= $1
       GROUP BY ip ORDER BY intentos DESC LIMIT 5`,
      [hace7]
    );

    res.json({
      accesos_hoy: accesosHoy.rows[0].count,
      accesos_7d: accesos7d.rows[0].count,
      accesos_30d: accesos30d.rows[0].count,
      logins_fallidos_7d: loginsFallidos.rows[0].count,
      eventos_30d: eventosTotales.rows[0].count,
      usuarios_activos_7d: usuariosActivos.rows[0].count,
      top_ip_bloqueadas: topErrores.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/audit/log ───────────────────────────────────────────────────
router.post('/log', async (req, res) => {
  const { tipo, usuario_id, ip, user_agent, exito, motivo, metadata } = req.body;

  try {
    await db.query(
      `INSERT INTO log_accesos (usuario_id, email, ip, user_agent, exito, motivo, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        usuario_id || null,
        null,
        ip || null,
        user_agent || null,
        exito !== false,
        motivo || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Audit] Error logging:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
