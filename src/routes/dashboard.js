const router = require('express').Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/dashboard
router.get('/', async (req, res) => {
  try {
    const [estados, porCategoria, porArea, vencimientos, recientes] = await Promise.all([

      // Conteo por estado
      db.query(`
        SELECT estado, COUNT(*)::int AS total, SUM(valor_total)::numeric AS valor
        FROM facturas
        GROUP BY estado
      `),

      // Por categoría (top 5)
      db.query(`
        SELECT c.nombre, c.color, COUNT(f.id)::int AS total
        FROM categorias_compra c
        LEFT JOIN facturas f ON f.categoria_id = c.id
        WHERE c.activo = TRUE
        GROUP BY c.id
        ORDER BY total DESC
        LIMIT 5
      `),

      // Por área (pendientes)
      db.query(`
        SELECT a.nombre, COUNT(f.id)::int AS pendientes
        FROM areas a
        LEFT JOIN facturas f ON f.area_responsable_id = a.id
          AND f.estado IN ('recibida','revision')
        WHERE a.activo = TRUE
        GROUP BY a.id
        ORDER BY pendientes DESC
      `),

      // Próximas a vencer (límite pago en los próximos 7 días)
      db.query(`
        SELECT f.id, f.numero_factura, f.valor_total, f.limite_pago, f.estado,
               p.nombre AS proveedor_nombre
        FROM facturas f
        LEFT JOIN proveedores p ON p.id = f.proveedor_id
        WHERE f.limite_pago IS NOT NULL
          AND f.limite_pago <= CURRENT_DATE + INTERVAL '7 days'
          AND f.estado NOT IN ('pagada','rechazada')
        ORDER BY f.limite_pago ASC
        LIMIT 5
      `),

      // Últimas 8 facturas
      db.query(`
        SELECT f.id, f.numero_factura, f.valor_total, f.estado, f.recibida_en,
               p.nombre AS proveedor_nombre,
               c.nombre AS categoria_nombre, c.color AS categoria_color
        FROM facturas f
        LEFT JOIN proveedores p ON p.id = f.proveedor_id
        LEFT JOIN categorias_compra c ON c.id = f.categoria_id
        ORDER BY f.recibida_en DESC
        LIMIT 8
      `),
    ]);

    // Resumen global
    const resumen = {
      total:     0,
      recibidas: 0,
      revision:  0,
      aprobadas: 0,
      causadas:  0,
      pagadas:   0,
      rechazadas:0,
      valor_mes: 0,
    };
    for (const row of estados.rows) {
      resumen.total += row.total;
      if (row.estado === 'recibida')   resumen.recibidas  = row.total;
      if (row.estado === 'revision')   resumen.revision   = row.total;
      if (row.estado === 'aprobada')   resumen.aprobadas  = row.total;
      if (row.estado === 'causada')    resumen.causadas   = row.total;
      if (row.estado === 'pagada')     resumen.pagadas    = row.total;
      if (row.estado === 'rechazada')  resumen.rechazadas = row.total;
      resumen.valor_mes += parseFloat(row.valor || 0);
    }

    res.json({
      resumen,
      por_categoria: porCategoria.rows,
      por_area:      porArea.rows,
      vencimientos:  vencimientos.rows,
      recientes:     recientes.rows,
    });

  } catch (err) {
    console.error('[dashboard]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
