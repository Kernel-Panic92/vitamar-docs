const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const path  = require('path');
const fs    = require('fs');
const { v4: uuidv4 } = require('uuid');
const db    = require('../db');

/**
 * Servicio de ingesta de facturas desde FortiMail vía IMAP.
 * Corre cada IMAP_POLL_MINUTES minutos (default 5).
 * Descarga PDFs adjuntos y crea registros de facturas en estado 'recibida'.
 */

async function procesarCorreo(parsed, msgId) {
  const uploadDir = process.env.UPLOAD_DIR || './uploads/facturas';
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  let archivoPdf = null;
  let archivoXml = null;

  // Buscar adjuntos PDF y XML
  for (const att of parsed.attachments || []) {
    const ext = path.extname(att.filename || '').toLowerCase();
    if (ext === '.pdf' && !archivoPdf) {
      const nombre = `${uuidv4()}.pdf`;
      fs.writeFileSync(path.join(uploadDir, nombre), att.content);
      archivoPdf = nombre;
      console.log(`  [IMAP] PDF guardado: ${nombre}`);
    }
    if (ext === '.xml' && !archivoXml) {
      const nombre = `${uuidv4()}.xml`;
      fs.writeFileSync(path.join(uploadDir, nombre), att.content);
      archivoXml = nombre;
    }
  }

  if (!archivoPdf && !archivoXml) {
    console.log(`  [IMAP] Sin adjuntos relevantes en: "${parsed.subject}" — omitiendo`);
    return;
  }

  // Extraer remitente para buscar proveedor
  const emailOrigen = parsed.from?.value?.[0]?.address || null;

  // Buscar proveedor por email
  let proveedorId = null;
  if (emailOrigen) {
    const res = await db.query(
      'SELECT id FROM proveedores WHERE email_facturacion = $1 AND activo = TRUE LIMIT 1',
      [emailOrigen.toLowerCase()]
    );
    proveedorId = res.rows[0]?.id || null;
  }

  // Calcular límite DIAN: +48h desde ahora
  const limiteDian = new Date(Date.now() + 48 * 60 * 60 * 1000);

  // Extraer número de factura del asunto (patrón básico)
  const asunto = parsed.subject || '';
  const matchFV = asunto.match(/\b(FV|FE|FC|FES|FV-?\d+[-\d]*)\b/i);
  const numeroFactura = matchFV?.[0] || `IMPORT-${Date.now()}`;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Verificar que no se importó ya (por número o por message-id)
    const dup = await client.query(
      'SELECT id FROM facturas WHERE numero_factura = $1',
      [numeroFactura]
    );
    if (dup.rows.length > 0) {
      console.log(`  [IMAP] Factura ${numeroFactura} ya existe — omitiendo`);
      await client.query('ROLLBACK');
      return;
    }

    const { rows } = await client.query(
      `INSERT INTO facturas (
         numero_factura, proveedor_id, archivo_pdf, archivo_xml,
         email_origen, email_asunto,
         limite_dian, estado
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'recibida')
       RETURNING id, numero_factura`,
      [
        numeroFactura,
        proveedorId,
        archivoPdf,
        archivoXml,
        emailOrigen,
        asunto.substring(0, 499),
        limiteDian,
      ]
    );

    await client.query(
      `INSERT INTO eventos_flujo (factura_id, usuario_id, tipo, comentario, metadata)
       VALUES ($1, NULL, 'recibida', $2, $3)`,
      [
        rows[0].id,
        `Factura importada automáticamente desde ${emailOrigen}`,
        JSON.stringify({ email_origen: emailOrigen, asunto, message_id: msgId }),
      ]
    );

    await client.query('COMMIT');
    console.log(`  [IMAP] ✓ Factura creada: ${rows[0].numero_factura} (${rows[0].id})`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  [IMAP] Error creando factura:`, err.message);
  } finally {
    client.release();
  }
}

async function pollCorreo() {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER) {
    console.log('[IMAP] Configuración IMAP no definida — servicio desactivado');
    return;
  }

  const client = new ImapFlow({
    host:   process.env.IMAP_HOST,
    port:   parseInt(process.env.IMAP_PORT || '993'),
    secure: process.env.IMAP_TLS !== 'false',
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASSWORD,
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(process.env.IMAP_FOLDER || 'INBOX');

    try {
      // Solo no leídos
      const mensajes = await client.search({ seen: false });
      if (mensajes.length === 0) {
        console.log('[IMAP] Sin mensajes nuevos');
        return;
      }

      console.log(`[IMAP] Procesando ${mensajes.length} mensaje(s) nuevo(s)...`);

      for await (const msg of client.fetch(mensajes, { source: true })) {
        try {
          const parsed = await simpleParser(msg.source);
          await procesarCorreo(parsed, msg.envelope?.messageId);
          // Marcar como leído
          await client.messageFlagsAdd(msg.seq, ['\\Seen']);
        } catch (err) {
          console.error(`[IMAP] Error procesando mensaje ${msg.seq}:`, err.message);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[IMAP] Error de conexión:', err.message);
  }
}

function iniciarServicioImap() {
  const minutos = parseInt(process.env.IMAP_POLL_MINUTES || '5');
  console.log(`[IMAP] Servicio iniciado — revisando cada ${minutos} minutos`);

  // Primera ejecución al arrancar
  pollCorreo();

  // Ejecuciones periódicas
  setInterval(pollCorreo, minutos * 60 * 1000);
}

module.exports = { iniciarServicioImap, pollCorreo };
