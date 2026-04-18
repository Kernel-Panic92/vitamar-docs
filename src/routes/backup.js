const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const { execSync } = require('child_process');
const multer = require('multer');
const AdmZip = require('adm-zip');
const db     = require('../db');
const { authMiddleware, requireRol } = require('../middleware/auth');

router.use(authMiddleware);
const soloAdmin = requireRol('admin');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const APP_DIR = path.resolve(__dirname, '../..');
const HOME_DIR = os.homedir();
const BACKUP_DIR = path.join(HOME_DIR, 'backups', 'vitamar-docs');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(APP_DIR, 'uploads');

console.log('[Backup] Directorio de backups:', BACKUP_DIR);

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getBackupFiles() {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('vitamar_backup_') && f.endsWith('.zip'))
    .map(f => {
      const full = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(full);
      return {
        nombre:  f,
        tamano:  stat.size,
        fecha:   stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

// Helper: genera el ZIP en memoria
// tipo: 'config' (solo DB) | 'completo' (DB + uploads)
async function generarZip(tipo = 'completo') {
  const zip = new AdmZip();

  const query = async (sql, fallback = []) => {
    try {
      const { rows } = await db.query(sql);
      return rows;
    } catch (e) {
      console.warn('[Backup] Query warning:', e.message);
      return fallback;
    }
  };

  const cfg = await query('SELECT clave, valor FROM configuracion');
  const usuarios = await query('SELECT id, nombre, email, rol, area_id, activo, cambio_password, creado_en FROM usuarios');
  const areas = await query('SELECT * FROM areas');
  const cats = await query('SELECT * FROM categorias_compra');
  const centros = await query('SELECT * FROM centros_operacion');
  const facturas = await query(`
    SELECT f.*, p.nombre AS proveedor_nombre, p.nit AS proveedor_nit,
           c.nombre AS categoria_nombre, c.color AS categoria_color
    FROM facturas f
    LEFT JOIN proveedores p ON p.id = f.proveedor_id
    LEFT JOIN categorias_compra c ON c.id = f.categoria_id
    ORDER BY f.recibida_en DESC LIMIT 1000
  `);
  const eventos = await query('SELECT * FROM eventos_flujo ORDER BY creado_en DESC LIMIT 5000');

  const data = {
    app:       'VitamarDocs',
    version:   '1.0',
    tipo:      tipo,
    generado:  new Date().toISOString(),
    config:    cfg,
    usuarios:  usuarios.map(u => ({ ...u, password_hash: '(backup_excluded)' })),
    areas:     areas,
    categorias: cats,
    centros:   centros,
    facturas:  facturas,
    eventos:   eventos.length
  };

  console.log('[Backup] Generando backup:', { tipo, config: cfg.length, usuarios: usuarios.length, facturas: facturas.length });

  zip.addFile('backup.json', Buffer.from(JSON.stringify(data, null, 2), 'utf8'));

  // Solo agregar uploads si es backup completo
  if (tipo === 'completo' && fs.existsSync(UPLOAD_DIR)) {
    const files = fs.readdirSync(UPLOAD_DIR);
    if (files.length > 0) {
      zip.addLocalFolder(UPLOAD_DIR, 'uploads');
    }
  }

  return zip;
}

// GET /api/backup — genera y descarga ZIP inmediatamente
// ?tipo=config (solo DB) | ?tipo=completo (DB + uploads)
router.get('/', soloAdmin, async (req, res) => {
  try {
    const tipo = req.query.tipo === 'config' ? 'config' : 'completo';
    const zip = await generarZip(tipo);
    const buffer = zip.toBuffer();
    const fecha = new Date().toISOString().slice(0, 10);
    const filename = tipo === 'config' 
      ? `vitamar_backup_config_${fecha}.zip`
      : `vitamar_backup_${fecha}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    console.error('[Backup] Error:', err);
    res.status(500).json({ error: 'Error generando backup: ' + err.message });
  }
});

// GET /api/backup/lista — lista backups en el servidor
router.get('/lista', soloAdmin, (req, res) => {
  try {
    const archivos = getBackupFiles().slice(0, 10);
    res.json(archivos);
  } catch (err) {
    res.status(500).json({ error: 'Error listando backups: ' + err.message });
  }
});

// GET /api/backup/descargar/:filename — descarga backup específico
router.get('/descargar/:filename', soloAdmin, (req, res) => {
  const { filename } = req.params;
  if (!/^vitamar_backup_[\w\-]+\.zip$/.test(filename)) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }

  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  res.download(filepath, filename);
});

// POST /api/restore — restaura desde archivo subido
router.post('/restore', soloAdmin, upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

  let zip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: 'Archivo ZIP inválido' });
  }

  const entry = zip.getEntry('backup.json');
  if (!entry) return res.status(400).json({ error: 'El ZIP no contiene backup.json' });

  let data;
  try {
    data = JSON.parse(entry.getData().toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'backup.json corrupto' });
  }

  if (data.app !== 'VitamarDocs') {
    return res.status(400).json({ error: 'Archivo de backup incompatible' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    if (data.config?.length) {
      for (const row of data.config) {
        await client.query(
          'INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ($1, $2, NOW()) ON CONFLICT (clave) DO UPDATE SET valor=$2, actualizado_en=NOW()',
          [row.clave, row.valor]
        );
      }
    }

    if (data.areas?.length) {
      for (const a of data.areas) {
        await client.query(
          `INSERT INTO areas (id, nombre, jefe_id, email, activo, creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO UPDATE SET nombre=$2, jefe_id=$3, email=$4, activo=$5, actualizado_en=NOW()`,
          [a.id, a.nombre, a.jefe_id || null, a.email, a.activo ?? true, a.creado_en]
        );
      }
    }

    if (data.usuarios?.length) {
      for (const u of data.usuarios) {
        if (u.email === req.usuario.email) continue;
        const hash = u.password_hash && u.password_hash !== '(backup_excluded)' 
          ? u.password_hash 
          : '$2a$12$placeholder.for.backup.only.do.not.use';
        await client.query(
          `INSERT INTO usuarios (id, nombre, email, password_hash, rol, area_id, activo, cambio_password, creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (id) DO UPDATE SET nombre=$2, email=$3, password_hash=COALESCE(NULLIF($4, '$2a$12$placeholder.for.backup.only.do.not.use'), usuarios.password_hash), rol=$5, area_id=$6, activo=$7, cambio_password=$8, actualizado_en=NOW()`,
          [u.id, u.nombre, u.email, hash, u.rol, u.area_id, u.activo ?? true, u.cambio_password ?? false, u.creado_en]
        );
      }
    }

    if (data.categorias?.length) {
      for (const c of data.categorias) {
        await client.query(
          `INSERT INTO categorias_compra (id, nombre, descripcion, color, activo, creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO UPDATE SET nombre=$2, descripcion=$3, color=$4, activo=$5, actualizado_en=NOW()`,
          [c.id, c.nombre, c.descripcion, c.color, c.activo ?? true, c.creado_en]
        );
      }
    }

    if (data.centros?.length) {
      for (const c of data.centros) {
        await client.query(
          `INSERT INTO centros_operacion (id, nombre, codigo, descripcion, direccion, telefono, email, activo, creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (id) DO UPDATE SET nombre=$2, codigo=$3, descripcion=$4, direccion=$5, telefono=$6, email=$7, activo=$8, actualizado_en=NOW()`,
          [c.id, c.nombre, c.codigo, c.descripcion, c.direccion, c.telefono, c.email, c.activo ?? true, c.creado_en]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, mensaje: 'Restauración completada correctamente' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Restore] Error:', err);
    res.status(500).json({ error: 'Error en restauración: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/restore/local/:filename — restaura desde backup en servidor
router.post('/restore/local/:filename', soloAdmin, (req, res) => {
  const { filename } = req.params;
  if (!/^vitamar_backup_[\w\-]+\.zip$/.test(filename)) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }

  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  let zip;
  try {
    zip = new AdmZip(filepath);
  } catch (err) {
    return res.status(400).json({ error: 'Archivo ZIP inválido' });
  }

  const entry = zip.getEntry('backup.json');
  if (!entry) return res.status(400).json({ error: 'El ZIP no contiene backup.json' });

  let data;
  try {
    data = JSON.parse(entry.getData().toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'backup.json corrupto' });
  }

  if (data.app !== 'VitamarDocs') {
    return res.status(400).json({ error: 'Archivo de backup incompatible' });
  }

  const client = db; // usar db directo con pool

  (async () => {
    try {
      if (data.config?.length) {
        for (const row of data.config) {
          await db.query(
            'INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ($1, $2, NOW()) ON CONFLICT (clave) DO UPDATE SET valor=$2, actualizado_en=NOW()',
            [row.clave, row.valor]
          );
        }
      }

      if (data.areas?.length) {
        for (const a of data.areas) {
          await db.query(
            `INSERT INTO areas (id, nombre, jefe_id, email, activo, creado_en, actualizado_en)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (id) DO UPDATE SET nombre=$2, jefe_id=$3, email=$4, activo=$5, actualizado_en=NOW()`,
            [a.id, a.nombre, a.jefe_id || null, a.email, a.activo ?? true, a.creado_en]
          );
        }
      }

      if (data.usuarios?.length) {
        for (const u of data.usuarios) {
          if (u.email === req.usuario.email) continue;
          const hash = u.password_hash && u.password_hash !== '(backup_excluded)' 
            ? u.password_hash 
            : '$2a$12$placeholder.for.backup.only.do.not.use';
          await db.query(
            `INSERT INTO usuarios (id, nombre, email, password_hash, rol, area_id, activo, cambio_password, creado_en, actualizado_en)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (id) DO UPDATE SET nombre=$2, email=$3, password_hash=COALESCE(NULLIF($4, '$2a$12$placeholder.for.backup.only.do.not.use'), usuarios.password_hash), rol=$5, area_id=$6, activo=$7, cambio_password=$8, actualizado_en=NOW()`,
            [u.id, u.nombre, u.email, hash, u.rol, u.area_id, u.activo ?? true, u.cambio_password ?? false, u.creado_en]
          );
        }
      }

      if (data.categorias?.length) {
        for (const c of data.categorias) {
          await db.query(
            `INSERT INTO categorias_compra (id, nombre, descripcion, color, activo, creado_en, actualizado_en)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (id) DO UPDATE SET nombre=$2, descripcion=$3, color=$4, activo=$5, actualizado_en=NOW()`,
            [c.id, c.nombre, c.descripcion, c.color, c.activo ?? true, c.creado_en]
          );
        }
      }

      if (data.centros?.length) {
        for (const c of data.centros) {
          await db.query(
            `INSERT INTO centros_operacion (id, nombre, codigo, descripcion, direccion, telefono, email, activo, creado_en, actualizado_en)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (id) DO UPDATE SET nombre=$2, codigo=$3, descripcion=$4, direccion=$5, telefono=$6, email=$7, activo=$8, actualizado_en=NOW()`,
            [c.id, c.nombre, c.codigo, c.descripcion, c.direccion, c.telefono, c.email, c.activo ?? true, c.creado_en]
          );
        }
      }

      res.json({ ok: true, mensaje: 'Restauración completada correctamente' });

    } catch (err) {
      console.error('[Restore local] Error:', err);
      res.status(500).json({ error: 'Error en restauración: ' + err.message });
    }
  })();
});

// DELETE /api/backup/:filename — elimina backup del servidor
router.delete('/:filename', soloAdmin, (req, res) => {
  const { filename } = req.params;
  if (!/^vitamar_backup_[\w\-]+\.zip$/.test(filename)) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }

  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  fs.unlinkSync(filepath);
  res.json({ ok: true });
});

module.exports = router;
