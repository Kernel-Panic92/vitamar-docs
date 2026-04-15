const cron = require('node-cron');
const db   = require('../db');

/**
 * Jobs programados:
 * 1. Cada 30 min: revisar facturas sin acción y escalar
 * 2. Cada hora:   marcar aceptación tácita DIAN
 */

async function verificarEscalaciones() {
  const client = await db.getClient();
  try {
    const horasNivel1 = parseInt(
      (await db.query("SELECT valor FROM configuracion WHERE clave='horas_limite_revision'")).rows[0]?.valor || '24'
    );
    const horasNivel2 = parseInt(
      (await db.query("SELECT valor FROM configuracion WHERE clave='horas_escalacion_nivel2'")).rows[0]?.valor || '48'
    );

    // Facturas en revision sin escalación nivel 1 que superaron el límite
    const paraEscalar1 = await client.query(
      `SELECT f.id, f.numero_factura, f.area_responsable_id, a.jefe_nombre, a.email AS area_email
       FROM facturas f
       LEFT JOIN areas a ON a.id = f.area_responsable_id
       WHERE f.estado IN ('recibida','revision')
         AND f.recibida_en < NOW() - INTERVAL '${horasNivel1} hours'
         AND NOT EXISTS (
           SELECT 1 FROM escalaciones e
           WHERE e.factura_id = f.id AND e.nivel = 1
         )`
    );

    for (const f of paraEscalar1.rows) {
      // Buscar jefe del área para notificar
      const jefe = await client.query(
        `SELECT u.id FROM usuarios u
         WHERE u.area_id = $1 AND u.activo = TRUE
         ORDER BY u.creado_en ASC LIMIT 1`,
        [f.area_responsable_id]
      );
      const notificadoId = jefe.rows[0]?.id || null;

      await client.query(
        `INSERT INTO escalaciones (factura_id, nivel, notificado_a_id)
         VALUES ($1, 1, $2)`,
        [f.id, notificadoId]
      );
      await client.query(
        `INSERT INTO eventos_flujo (factura_id, tipo, comentario)
         VALUES ($1, 'escalacion_nivel1', $2)`,
        [f.id, `Escalada nivel 1 tras ${horasNivel1}h sin acción`]
      );
      console.log(`[Cron] Escalación nivel 1: ${f.numero_factura}`);
    }

    // Facturas con escalación nivel 1 resuelta=false que superaron otras N horas
    const paraEscalar2 = await client.query(
      `SELECT f.id, f.numero_factura
       FROM facturas f
       WHERE f.estado IN ('recibida','revision')
         AND EXISTS (
           SELECT 1 FROM escalaciones e
           WHERE e.factura_id = f.id AND e.nivel = 1 AND e.resuelta = FALSE
             AND e.enviada_en < NOW() - INTERVAL '${horasNivel2 - horasNivel1} hours'
         )
         AND NOT EXISTS (
           SELECT 1 FROM escalaciones e
           WHERE e.factura_id = f.id AND e.nivel = 2
         )`
    );

    for (const f of paraEscalar2.rows) {
      // Buscar usuario de gerencia
      const gerencia = await client.query(
        `SELECT u.id FROM usuarios u
         JOIN areas a ON a.id = u.area_id
         WHERE a.nombre = 'Gerencia' AND u.activo = TRUE LIMIT 1`
      );
      const gerenciaId = gerencia.rows[0]?.id || null;

      await client.query(
        `INSERT INTO escalaciones (factura_id, nivel, notificado_a_id)
         VALUES ($1, 2, $2)`,
        [f.id, gerenciaId]
      );
      await client.query(
        `INSERT INTO eventos_flujo (factura_id, tipo, comentario)
         VALUES ($1, 'escalacion_nivel2', $2)`,
        [f.id, `Escalada nivel 2 a gerencia`]
      );
      console.log(`[Cron] Escalación nivel 2: ${f.numero_factura}`);
    }

  } catch (err) {
    console.error('[Cron] Error en escalaciones:', err.message);
  } finally {
    client.release();
  }
}

async function verificarDianTacita() {
  try {
    const { rows } = await db.query(
      `UPDATE facturas
       SET dian_tacita = TRUE
       WHERE estado IN ('recibida','revision')
         AND limite_dian < NOW()
         AND dian_tacita = FALSE
       RETURNING id, numero_factura`
    );

    for (const f of rows) {
      await db.query(
        `INSERT INTO eventos_flujo (factura_id, tipo, comentario)
         VALUES ($1, 'dian_tacita', 'Aceptación tácita DIAN registrada automáticamente')`,
        [f.id]
      );
      console.log(`[Cron] DIAN tácita: ${f.numero_factura}`);
    }

    if (rows.length > 0) {
      console.log(`[Cron] ${rows.length} factura(s) marcadas con aceptación tácita DIAN`);
    }
  } catch (err) {
    console.error('[Cron] Error en DIAN tácita:', err.message);
  }
}

function iniciarCronJobs() {
  // Cada 30 minutos: escalaciones
  cron.schedule('*/30 * * * *', () => {
    console.log('[Cron] Verificando escalaciones...');
    verificarEscalaciones();
  });

  // Cada hora en punto: DIAN tácita
  cron.schedule('0 * * * *', () => {
    console.log('[Cron] Verificando DIAN tácita...');
    verificarDianTacita();
  });

  console.log('[Cron] Jobs iniciados: escalaciones (c/30min) + DIAN tácita (c/1h)');
}

module.exports = { iniciarCronJobs, verificarEscalaciones, verificarDianTacita };
