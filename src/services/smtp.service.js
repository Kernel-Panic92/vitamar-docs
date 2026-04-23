const nodemailer = require('nodemailer');
const crypto     = require('crypto');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host     = process.env.SMTP_HOST;
  const port     = parseInt(process.env.SMTP_PORT || '587');
  const user     = process.env.SMTP_USER;
  const pass     = process.env.SMTP_PASSWORD;
  const secure   = port === 465;

  if (!host || !user) {
    console.warn('[SMTP] Servicio de correo no configurado');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  return transporter;
}

function getFromAddress() {
  return process.env.SMTP_FROM || 'DocFlow <noreply@tu-dominio.com>';
}

function getBaseUrl(reqHost) {
  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  return `${proto}://${reqHost || 'localhost:${PORT}'}`;
}

async function enviar({ para, asunto, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.warn(`[SMTP] No configurado — omitiendo email a ${para}`);
    return null;
  }

  try {
    const info = await t.sendMail({
      from:    getFromAddress(),
      to:      para,
      subject: asunto,
      text:    text || html.replace(/<[^>]+>/g, ''),
      html,
    });
    console.log(`[SMTP] Enviado a ${para}: ${asunto}`);
    return info;
  } catch (err) {
    console.error(`[SMTP] Error enviando a ${para}:`, err.message);
    throw err;
  }
}

async function enviarRecuperacion(usuario, token, reqHost) {
  const baseUrl = getBaseUrl(reqHost);
  const enlace  = `${baseUrl}/reset-password.html?token=${token}`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperar contraseña — Vitamar Docs</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 15px">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr>
            <td style="background:#1a56db;padding:28px 32px;text-align:center">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600">Vitamar Docs</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Gestión Documental</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:18px;font-weight:600">Hola ${usuario.nombre},</h2>
              <p style="margin:0 0 20px;color:#4a5568;font-size:14px;line-height:1.6">
                Recibimos una solicitud para restablecer tu contraseña en <strong>Vitamar Docs</strong>.
              </p>
              <p style="margin:0 0 24px;color:#4a5568;font-size:14px;line-height:1.6">
                Haz clic en el siguiente botón para crear una nueva contraseña. Este enlace es válido por <strong>30 minutos</strong>.
              </p>
              <!-- CTA Button -->
              <div style="text-align:center;margin:28px 0">
                <a href="${enlace}" style="display:inline-block;background:#1a56db;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px">
                  Restablecer contraseña
                </a>
              </div>
              <!-- Link alternativo -->
              <p style="margin:20px 0 0;color:#718096;font-size:12px;line-height:1.5">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${enlace}" style="color:#1a56db;word-break:break-all">${enlace}</a>
              </p>
              <!-- Warning -->
              <div style="margin-top:28px;padding:14px;background:#fffbeb;border-radius:8px;border-left:3px solid #f59e0b">
                <p style="margin:0;color:#92400e;font-size:12px;line-height:1.5">
                  ⚠️ Si no solicitaste este cambio, puedes ignorar este correo con seguridad. Tu contraseña actual no cambiará hasta que uses el enlace.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center">
                Este es un mensaje automático de Vitamar Docs. Por favor no respondas a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return enviar({
    para:    usuario.email,
    asunto:  'Recuperar contraseña — Vitamar Docs',
    html,
    text: `Hola ${usuario.nombre},

Recibimos una solicitud para restablecer tu contraseña en Vitamar Docs.

Para crear una nueva contraseña, visita este enlace (válido por 30 minutos):
${enlace}

Si no solicitaste este cambio, puedes ignorar este correo.

— Vitamar Docs`,
  });
}

async function enviarNotificacionFactura({ para, tipo, factura, usuario, comentario }) {
  const colores = {
    recibida:   { bg: '#dbeafe', text: '#1e40af', accent: '#3b82f6' },
    revision:    { bg: '#fef3c7', text: '#92400e', accent: '#f59e0b' },
    aprobada:    { bg: '#d1fae5', text: '#065f46', accent: '#10b981' },
    rechazada:   { bg: '#fee2e2', text: '#991b1b', accent: '#ef4444' },
    causada:     { bg: '#ede9fe', text: '#5b21b6', accent: '#8b5cf6' },
    pagada:      { bg: '#d1fae5', text: '#065f46', accent: '#059669' },
    escalacion:  { bg: '#fef3c7', text: '#92400e', accent: '#f59e0b' },
  };

  const c = colores[tipo] || colores.recibida;
  const estadoLabels = {
    recibida:   'Recibida',
    revision:   'En Revisión',
    aprobada:   'Aprobada',
    rechazada:  'Rechazada',
    causada:    'Causada',
    pagada:     'Pagada',
    escalacion: 'Escalada',
  };

  consttitulos = {
    recibida:   'Nueva factura recibida',
    revision:    'Factura en revisión',
    aprobada:    'Factura aprobada',
    rechazada:   'Factura rechazada',
    causada:     'Factura causada',
    pagada:      'Factura pagada',
    escalacion:  'Alerta: Factura escalda',
  };

  const fmt = (v) => '$' + Math.round(parseFloat(v) || 0).toLocaleString('es-CO');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulos[tipo] || 'Notificación'} — Vitamar Docs</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 15px">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr>
            <td style="background:${c.accent};padding:24px 32px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600">Vitamar Docs</h1>
                  </td>
                  <td style="text-align:right">
                    <span style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px">
                      ${estadoLabels[tipo] || tipo}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:20px;font-weight:600">
                ${titulos[tipo] || 'Notificación'}
              </h2>
              <p style="margin:0 0 24px;color:#4a5568;font-size:14px">
                ${usuario ? `Por <strong>${usuario}</strong>` : 'Notificación del sistema'}.
              </p>

              <!-- Info Card -->
              <div style="background:${c.bg};border-radius:10px;padding:20px;margin-bottom:20px">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0">
                      <span style="color:${c.text};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Factura</span><br>
                      <strong style="color:${c.text};font-size:15px">${factura.numero_factura}</strong>
                    </td>
                    <td style="padding:6px 0;text-align:right">
                      <span style="color:${c.text};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Valor Total</span><br>
                      <strong style="color:${c.text};font-size:15px">${fmt(factura.valor_total || factura.valor)}</strong>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
                ${factura.proveedor ? `
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
                    <span style="color:#9ca3af;font-size:12px">Proveedor</span><br>
                    <strong style="color:#1a1a2e;font-size:13px">${factura.proveedor}</strong>
                  </td>
                </tr>` : ''}
                ${factura.categoria ? `
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
                    <span style="color:#9ca3af;font-size:12px">Categoría</span><br>
                    <strong style="color:#1a1a2e;font-size:13px">${factura.categoria}</strong>
                  </td>
                </tr>` : ''}
                ${factura.area ? `
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
                    <span style="color:#9ca3af;font-size:12px">Área</span><br>
                    <strong style="color:#1a1a2e;font-size:13px">${factura.area}</strong>
                  </td>
                </tr>` : ''}
                ${factura.fecha ? `
                <tr>
                  <td style="padding:8px 0">
                    <span style="color:#9ca3af;font-size:12px">Fecha</span><br>
                    <strong style="color:#1a1a2e;font-size:13px">${fmtDate(factura.fecha)}</strong>
                  </td>
                </tr>` : ''}
              </table>

              ${comentario ? `
              <!-- Comentario -->
              <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px;border-left:3px solid ${c.accent}">
                <p style="margin:0;color:#4a5568;font-size:13px;line-height:1.5"><strong>Comentario:</strong> ${comentario}</p>
              </div>` : ''}

              ${tipo === 'escalacion' ? `
              <!-- Warning escalación -->
              <div style="background:#fef3c7;border-radius:8px;padding:16px;margin-bottom:20px;border-left:3px solid #f59e0b">
                <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5">
                  ⚠️ Esta factura ha estado sin atención y ha sido escalada automáticamente.
                  Por favor revísala a la brevedad.
                </p>
              </div>` : ''}

              <!-- CTA -->
              <div style="text-align:center;margin-top:24px">
                <a href="${process.env.APP_URL || 'http://localhost:3100'}" style="display:inline-block;background:${c.accent};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 28px;border-radius:8px">
                  Ver en Vitamar Docs
                </a>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center">
                Este es un mensaje automático de Vitamar Docs · No respondas a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return enviar({
    para:    para,
    asunto:  `${titulos[tipo] || 'Notificación'}: Factura ${factura.numero_factura}`,
    html,
    text: `${titulos[tipo] || 'Notificación'}

Factura: ${factura.numero_factura}
Valor: ${fmt(factura.valor_total || factura.valor)}
${factura.proveedor ? `Proveedor: ${factura.proveedor}` : ''}
${comentario ? `\nComentario: ${comentario}` : ''}

Ver en Vitamar Docs: ${process.env.APP_URL || 'http://localhost:3100'}`,
  });
}

async function enviarTest(para) {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Prueba SMTP — Vitamar Docs</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 15px">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
          <tr>
            <td style="background:#10b981;padding:24px 32px;text-align:center">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">✅ Vitamar Docs</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Prueba de configuración SMTP</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;text-align:center">
              <div style="width:60px;height:60px;background:#d1fae5;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px">✓</div>
              <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:18px">¡Configuración correcta!</h2>
              <p style="margin:0;color:#4a5568;font-size:14px;line-height:1.6">
                El servidor SMTP está correctamente configurado y puede enviar correos.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center">
                Enviado desde Vitamar Docs · ${new Date().toLocaleString('es-CO')}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return enviar({
    para:    para,
    asunto:  '✅ Prueba SMTP — Vitamar Docs',
    html,
    text: 'Vitamar Docs - Prueba SMTP\n\n¡Configuración correcta!\n\nEl servidor SMTP está correctamente configurado.',
  });
}

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER);
}

module.exports = {
  enviar,
  enviarRecuperacion,
  enviarNotificacionFactura,
  enviarTest,
  isConfigured,
};
