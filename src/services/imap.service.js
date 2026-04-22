require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const AdmZip  = require('adm-zip');
const db      = require('../db');
const syncState = require('./sync-state');

let cachedConfig = null;

async function getConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const { rows } = await db.query('SELECT clave, valor FROM configuracion');
    cachedConfig = {};
    for (const row of rows) {
      cachedConfig[row.clave] = row.valor;
    }
    return cachedConfig;
  } catch (e) {
    console.error('[IMAP] Error cargando config:', e.message);
    return {};
  }
}

function clearConfigCache() {
  cachedConfig = null;
}

function extraerInvoiceEmbebido(xml) {
  const invoiceMatch = xml.match(/<cbc:Description><!\[CDATA\[([\s\S]*?)\]\]><\/cbc:Description>/);
  if (invoiceMatch) {
    const contenido = invoiceMatch[1];
    if (contenido.includes('<Invoice')) {
      return contenido;
    }
  }
  return null;
}

function parsearXml(xmlContent) {
  const data = {
    numeroFactura: null,
    fecha: null,
    cufe: null,
    nombreEmisor: null,
    nitEmisor: null,
    nombreReceptor: null,
    nitReceptor: null,
    valorBruto: 0,
    iva: 0,
    valorTotal: 0,
    ordenCompra: null,
    limitePago: null
  };

  try {
    const xml = xmlContent.toString('utf8');
    
    const invoiceEmbebido = extraerInvoiceEmbebido(xml);
    const xmlFinal = invoiceEmbebido || xml;

    if (invoiceEmbebido) {
      console.log(`  [Parser] Invoice embebido detectado — extrayendo datos`);
    }

    const idMatch = xmlFinal.match(/<cbc:ID>([^<]+)<\/cbc:ID>/);
    if (idMatch) {
      const id = idMatch[1].trim();
      if (id !== '01' && /[A-Z0-9\-]{3,}/i.test(id)) {
        data.numeroFactura = id;
      }
    }

    const fechaMatch = xmlFinal.match(/<cbc:IssueDate>(\d{4}-\d{2}-\d{2})<\/cbc:IssueDate>/);
    if (fechaMatch) data.fecha = fechaMatch[1];

    // Extraer orden de compra / contract reference
    const orderRefMatch = xmlFinal.match(/<cac:OrderReference>([\s\S]*?)<\/cac:OrderReference>/);
    if (orderRefMatch) {
      const orderIdMatch = orderRefMatch[1].match(/<cbc:ID>([^<]+)<\/cbc:ID>/);
      if (orderIdMatch) {
        data.ordenCompra = orderIdMatch[1].trim();
        console.log(`  [Parser] Orden de compra: ${data.ordenCompra}`);
      }
    }

    // También buscar ContractDocumentReference
    if (!data.ordenCompra) {
      const contractMatch = xmlFinal.match(/<cac:ContractDocumentReference>([\s\S]*?)<\/cac:ContractDocumentReference>/);
      if (contractMatch) {
        const contractIdMatch = contractMatch[1].match(/<cbc:ID>([^<]+)<\/cbc:ID>/);
        if (contractIdMatch) {
          data.ordenCompra = contractIdMatch[1].trim();
          console.log(`  [Parser] Referencia contractual: ${data.ordenCompra}`);
        }
      }
    }

    const cufeMatch = xmlFinal.match(/<cbc:UUID[^>]*schemeName="CUFE-SHA384"[^>]*>([^<]+)<\/cbc:UUID>/);
    if (!cufeMatch) {
      const uuidMatch = xmlFinal.match(/<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/);
      data.cufe = uuidMatch ? uuidMatch[1].trim() : null;
    } else {
      data.cufe = cufeMatch[1].trim();
    }

    const supplierMatch = xmlFinal.match(/<cac:AccountingSupplierParty>([\s\S]*?)<\/cac:AccountingSupplierParty>/);
    if (supplierMatch) {
      const supplier = supplierMatch[1];
      const nombreMatch = supplier.match(/<cbc:Name>([^<]+)<\/cbc:Name>/);
      if (nombreMatch) data.nombreEmisor = nombreMatch[1].trim();
      
      const nitMatch = supplier.match(/CompanyID[^>]*schemeName="31"[^>]*>([^<]+)<\/cbc:CompanyID>/);
      if (nitMatch) {
        data.nitEmisor = nitMatch[1].trim().replace(/[^0-9]/g, '');
      } else {
        const nitMatch2 = supplier.match(/<cbc:CompanyID[^>]*>(\d+)<\/cbc:CompanyID>/);
        if (nitMatch2) data.nitEmisor = nitMatch2[1].trim();
      }
    }

    const customerMatch = xmlFinal.match(/<cac:AccountingCustomerParty>([\s\S]*?)<\/cac:AccountingCustomerParty>/);
    if (customerMatch) {
      const customer = customerMatch[1];
      const nombreMatch = customer.match(/<cbc:Name>([^<]+)<\/cbc:Name>/);
      if (nombreMatch) data.nombreReceptor = nombreMatch[1].trim();
      
      const nitMatch = customer.match(/CompanyID[^>]*schemeName="31"[^>]*>([^<]+)<\/cbc:CompanyID>/);
      if (nitMatch) {
        data.nitReceptor = nitMatch[1].trim().replace(/[^0-9]/g, '');
      } else {
        const nitMatch2 = customer.match(/<cbc:CompanyID[^>]*>(\d+)<\/cbc:CompanyID>/);
        if (nitMatch2) data.nitReceptor = nitMatch2[1].trim();
      }
    }

    const monetaryMatch = xmlFinal.match(/<cac:LegalMonetaryTotal>([\s\S]*?)<\/cac:LegalMonetaryTotal>/);
    if (monetaryMatch) {
      const monetary = monetaryMatch[1];
      
      const brutoMatch = monetary.match(/<cbc:LineExtensionAmount[^>]*currencyID="COP">([^<]+)<\/cbc:LineExtensionAmount>/);
      if (brutoMatch) data.valorBruto = parseFloat(brutoMatch[1]);
      
      const taxInclusiveMatch = monetary.match(/<cbc:TaxInclusiveAmount[^>]*currencyID="COP">([^<]+)<\/cbc:TaxInclusiveAmount>/);
      const payableMatch = monetary.match(/<cbc:PayableAmount[^>]*currencyID="COP">([^<]+)<\/cbc:PayableAmount>/);
      
      if (taxInclusiveMatch) {
        data.valorTotal = parseFloat(taxInclusiveMatch[1]);
      } else if (payableMatch) {
        data.valorTotal = parseFloat(payableMatch[1]);
      }
    }

    if (data.valorTotal === 0) {
      const totalMatch = xmlFinal.match(/<cbc:PayableAmount[^>]*currencyID="COP">([^<]+)<\/cbc:PayableAmount>/);
      if (totalMatch) data.valorTotal = parseFloat(totalMatch[1]);
    }

    const taxTotalMatch = xmlFinal.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
    if (taxTotalMatch) {
      const taxTotal = taxTotalMatch[1];
      const taxAmountMatch = taxTotal.match(/<cbc:TaxAmount[^>]*currencyID="COP">([^<]+)<\/cbc:TaxAmount>/);
      if (taxAmountMatch) data.iva = parseFloat(taxAmountMatch[1]);
    }

    if (data.iva === 0 && data.valorTotal > data.valorBruto) {
      data.iva = data.valorTotal - data.valorBruto;
    }

    // Extraer fecha de vencimiento (DueDate)
    const dueDateMatch = xmlFinal.match(/<cbc:DueDate>(\d{4}-\d{2}-\d{2})<\/cbc:DueDate>/);
    if (dueDateMatch) {
      data.limitePago = dueDateMatch[1];
      console.log(`  [Parser] Fecha vencimiento: ${data.limitePago}`);
    } else {
      // Buscar en PaymentTerms
      const paymentTermsMatch = xmlFinal.match(/<cac:PaymentTerms>([\s\S]*?)<\/cac:PaymentTerms>/);
      if (paymentTermsMatch) {
        const dueDateInTerms = paymentTermsMatch[1].match(/<cbc:PaymentDueDate>(\d{4}-\d{2}-\d{2})<\/cbc:PaymentDueDate>/);
        if (dueDateInTerms) {
          data.limitePago = dueDateInTerms[1];
          console.log(`  [Parser] Fecha vencimiento (PaymentTerms): ${data.limitePago}`);
        }
      }
    }

  } catch (err) {
    console.log(`  [Parser] Error: ${err.message}`);
  }

  return data;
}

function extraerZip(zipBuffer) {
  const archivos = { pdf: null, xml: null };
  try {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    for (const entry of entries) {
      const nombre = entry.entryName.toLowerCase();
      if (nombre.endsWith('.pdf') && !archivos.pdf) {
        archivos.pdf = { nombre: entry.entryName, contenido: entry.getData() };
        console.log(`  [ZIP] PDF: ${entry.entryName}`);
      } else if (nombre.endsWith('.xml')) {
        if (!archivos.xml) {
          archivos.xml = { nombre: entry.entryName, contenido: entry.getData() };
          console.log(`  [ZIP] XML: ${entry.entryName}`);
        }
      }
    }
  } catch (err) {
    console.log(`  [ZIP] Error extrayendo: ${err.message}`);
  }
  return archivos;
}

async function crearProveedorSiNoExiste(client, nitEmisor, nombreEmisor, emailOrigen) {
  if (!nitEmisor) return { id: null, categoria_default_id: null };
  
  const existente = await client.query(
    'SELECT id, categoria_default_id FROM proveedores WHERE nit = $1 AND activo = TRUE LIMIT 1',
    [nitEmisor]
  );
  
  if (existente.rows.length > 0) {
    const row = existente.rows[0];
    return { id: row.id, categoria_default_id: row.categoria_default_id };
  }
  
  const nombre = nombreEmisor || `Proveedor NIT ${nitEmisor}`;
  const email = emailOrigen || null;
  
  const result = await client.query(
    `INSERT INTO proveedores (nit, nombre, email_facturacion, telefono, direccion)
     VALUES ($1, $2, $3, NULL, NULL)
     ON CONFLICT (nit) DO UPDATE SET nombre = EXCLUDED.nombre, email_facturacion = COALESCE(EXCLUDED.email_facturacion, proveedores.email_facturacion)
     RETURNING id, categoria_default_id`,
    [nitEmisor, nombre, email]
  );
  
  console.log(`  [IMAP] Proveedor creado/encontrado: ${nombre} (NIT: ${nitEmisor})`);
  const row = result.rows[0];
  return { id: row.id, categoria_default_id: row.categoria_default_id };
}

async function procesarCorreo(parsed, msgId) {
  const uploadDir = process.env.UPLOAD_DIR || './uploads/facturas';
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  let archivoPdf = null;
  let archivoXml = null;
  let datosFactura = {};

  for (const att of parsed.attachments || []) {
    const filename = att.filename || '';
    const ext = path.extname(filename).toLowerCase();
    
    if (ext === '.zip' || filename.toLowerCase().includes('.zip')) {
      console.log(`  [IMAP] Procesando ZIP: ${filename}`);
      const archivos = extraerZip(att.content);
      
      if (archivos.xml) {
        const xmlNombre = `${uuidv4()}.xml`;
        fs.writeFileSync(path.join(uploadDir, xmlNombre), archivos.xml.contenido);
        archivoXml = xmlNombre;
        console.log(`  [IMAP] XML guardado: ${xmlNombre}`);
        
        datosFactura = parsearXml(archivos.xml.contenido);
        console.log(`  [IMAP] Datos:`, JSON.stringify(datosFactura));
      }
      
      if (archivos.pdf && !archivoPdf) {
        const pdfNombre = `${uuidv4()}.pdf`;
        fs.writeFileSync(path.join(uploadDir, pdfNombre), archivos.pdf.contenido);
        archivoPdf = pdfNombre;
        console.log(`  [IMAP] PDF guardado: ${pdfNombre}`);
      }
    } else if ((ext === '.pdf' || filename.toLowerCase().includes('pdf')) && !archivoPdf) {
      const nombre = `${uuidv4()}.pdf`;
      fs.writeFileSync(path.join(uploadDir, nombre), att.content);
      archivoPdf = nombre;
      console.log(`  [IMAP] PDF directo guardado: ${nombre}`);
    } else if ((ext === '.xml' || filename.toLowerCase().includes('xml')) && !archivoXml) {
      const nombre = `${uuidv4()}.xml`;
      fs.writeFileSync(path.join(uploadDir, nombre), att.content);
      archivoXml = nombre;
      datosFactura = parsearXml(att.content);
      console.log(`  [IMAP] XML directo guardado: ${nombre}`);
    }
  }

  if (!archivoPdf && !archivoXml) {
    console.log(`  [IMAP] Sin adjuntos relevantes en: "${parsed.subject}" — omitiendo`);
    return 'omitido';
  }

  const { numeroFactura, nitEmisor, nombreEmisor, valorTotal, iva, valorBruto, fecha, cufe, ordenCompra, limitePago } = datosFactura;
  const fechaFactura = fecha ? new Date(fecha.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3')) : null;
  const emailOrigen = parsed.from?.value?.[0]?.address || null;
  const asunto = parsed.subject || '';
  
  console.log(`  [IMAP] Número: ${numeroFactura}, Valor: ${valorTotal}, IVA: ${iva}${ordenCompra ? ', OC: ' + ordenCompra : ''}${limitePago ? ', Vence: ' + limitePago : ''}`);

  if (!numeroFactura) {
    console.log(`  [IMAP] No se pudo extraer número de factura — omitiendo`);
    return 'sin_numero';
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const dup = await client.query(
      'SELECT id FROM facturas WHERE numero_factura = $1',
      [numeroFactura]
    );
    if (dup.rows.length > 0) {
      console.log(`  [IMAP] Factura ${numeroFactura} ya existe — omitiendo`);
      await client.query('ROLLBACK');
      client.release();
      return 'duplicada';
    }

    const proveedor = await crearProveedorSiNoExiste(client, nitEmisor, nombreEmisor, emailOrigen);
    const proveedorId = proveedor?.id;
    const categoriaSugerida = proveedor?.categoria_default_id;

    const ahora = new Date();
    const referencia = fechaFactura ? fechaFactura.toISOString().split('T')[0] : ahora.toISOString().split('T')[0];
    const limiteDian = new Date((fechaFactura || ahora).getTime() + 48 * 60 * 60 * 1000);

    const { rows } = await client.query(
      `INSERT INTO facturas (
          numero_factura, proveedor_id, categoria_id, archivo_pdf, archivo_xml,
          email_origen, email_asunto,
          limite_dian, limite_pago, estado,
          valor_total, valor_iva, valor,
          fecha_factura, nit_emisor, nombre_emisor, cufe,
          orden_compra, referencia
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING id, numero_factura`,
      [
        numeroFactura,
        proveedorId,
        categoriaSugerida || null,
        archivoPdf,
        archivoXml,
        emailOrigen,
        asunto.substring(0, 499),
        limiteDian,
        limitePago || null,
        'recibida',
        valorTotal,
        iva,
        valorBruto,
        fechaFactura,
        nitEmisor,
        nombreEmisor,
        cufe,
        ordenCompra || null,
        referencia
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
    client.release();
    return 'creada';

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  [IMAP] Error creando factura:`, err.message);
    client.release();
    return 'error';
  }
}

async function pollCorreo(rescanAll = false) {
  const config = await getConfig();
  
  if (!config.imap_host || !config.imap_user) {
    console.log('[IMAP] Configuración IMAP no definida en BD — servicio desactivado');
    return;
  }

  const client = new ImapFlow({
    host:   config.imap_host,
    port:   parseInt(config.imap_port || '993'),
    secure: config.imap_tls !== 'false',
    auth: {
      user: config.imap_user,
      pass: config.imap_password,
    },
    logger: false, // Desactivado para evitar filtrar credenciales en logs
  });

  const LOTE_SIZE = 50;
  let totalProcesados = 0;
  let totalCreados = 0;
  let totalDuplicados = 0;
  let totalError = 0;

  try {
    await client.connect();
    console.log('[IMAP] ✓ Conexión exitosa');
    const lock = await client.getMailboxLock(config.imap_folder || 'INBOX');

    try {
      let mensajes;
      if (rescanAll) {
        mensajes = await client.search({ all: true });
        mensajes = mensajes.slice(-500);
        console.log(`[IMAP] Rescan: ${mensajes.length} mensajes (últimos 500)`);
      } else {
        mensajes = await client.search({ all: true });
        console.log(`[IMAP] Procesando todos los ${mensajes.length} mensaje(s) del buzón`);
      }
      
      if (mensajes.length === 0) {
        console.log('[IMAP] Sin mensajes para procesar');
        syncState.terminarSync(0, 0, 0);
        return;
      }

      syncState.iniciarSync(mensajes.length);

      while (mensajes.length > 0) {
        const lote = mensajes.splice(0, LOTE_SIZE);
        console.log(`[IMAP] Procesando lote de ${lote.length} mensaje(s)...`);

        for await (const msg of client.fetch(lote, { source: true, flags: true })) {
          try {
            const flags = msg.flags || [];
            const seen = Array.isArray(flags) && flags.includes('\\Seen');
            if (seen) {
              totalDuplicados++;
              totalProcesados++;
              continue;
            }

            const parsed = await simpleParser(msg.source);
            const resultado = await procesarCorreo(parsed, msg.envelope?.messageId);
            
            if (resultado === 'creada') {
              totalCreados++;
              await client.messageFlagsAdd(msg.seq, ['\\Seen']);
            } else if (resultado === 'duplicada') {
              totalDuplicados++;
            }
            
            totalProcesados++;
            
            const restantes = mensajes.length;
            const progreso = `${totalProcesados}/${syncState.obtenerEstado().totalMensajes}`;
            syncState.actualizarProgreso(
              totalProcesados, totalCreados, totalDuplicados, totalError,
              `Procesando ${totalProcesados}/${syncState.obtenerEstado().totalMensajes}...`
            );
            
            console.log(`[IMAP] Progreso: ${progreso} (${totalCreados} creadas)`);
          } catch (err) {
            console.error(`[IMAP] Error mensaje ${msg.seq}:`, err.message);
            totalError++;
            totalProcesados++;
          }
        }
      }

      syncState.terminarSync(totalCreados, totalDuplicados, totalError);
      console.log(`[IMAP] ✓ Resumen: ${totalCreados} creadas, ${totalDuplicados} duplicadas, ${totalError} errores`);

    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[IMAP] Error de conexión:', err.message);
    console.error('[IMAP] Stack:', err.stack);
    console.error('[IMAP] Objeto completo:', JSON.stringify(err, null, 2));
    syncState.terminarSync(0, 0, 0);
  }
}

function iniciarServicioImap() {
  const minutos = parseInt(process.env.IMAP_POLL_MINUTES || '5');
  console.log(`[IMAP] Servicio iniciado — revisando cada ${minutos} minutos`);
  pollCorreo();
  setInterval(pollCorreo, minutos * 60 * 1000);
}

module.exports = { iniciarServicioImap, pollCorreo, clearConfigCache };
