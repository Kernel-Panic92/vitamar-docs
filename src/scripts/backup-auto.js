const db = require('../db');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const APP_DIR = process.cwd();
const LOCAL_BACKUP_DIR = path.join(APP_DIR, 'backups');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(APP_DIR, 'uploads', 'facturas');

async function generarBackupAuto() {
  if (!fs.existsSync(LOCAL_BACKUP_DIR)) {
    fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
  }

  const configResult = await db.query(`SELECT clave, valor FROM configuracion`);
  const cfg = {};
  for (const row of configResult.rows) cfg[row.clave] = row.valor;

  const retention = parseInt(cfg.backup_auto_retention || '7');
  const fecha = new Date().toISOString().slice(0, 10);
  const filename = `docflow_backup_${fecha}_${Date.now()}.zip`;
  const localPath = path.join(LOCAL_BACKUP_DIR, filename);

  const zip = new AdmZip();

  const agregarQuery = async (sql, nombre) => {
    try {
      const { rows } = await db.query(sql);
      zip.addFile(`${nombre}.json`, Buffer.from(JSON.stringify(rows, null, 2), 'utf8'));
      console.log(`[Backup-Auto] ${nombre}: ${rows.length} registros`);
    } catch (e) {
      console.log(`[Backup-Auto] Error ${nombre}: ${e.message}`);
    }
  };

  await agregarQuery('SELECT * FROM facturas ORDER BY recibida_en DESC LIMIT 2000', 'facturas');
  await agregarQuery('SELECT * FROM eventos_flujo ORDER BY creado_en DESC LIMIT 5000', 'eventos');
  await agregarQuery('SELECT * FROM proveedores', 'proveedores');
  await agregarQuery('SELECT clave, valor FROM configuracion', 'configuracion');
  await agregarQuery('SELECT id, nombre, email, rol, activo, cambio_password, creado_en FROM usuarios', 'usuarios');

  if (fs.existsSync(UPLOAD_DIR)) {
    const files = fs.readdirSync(UPLOAD_DIR);
    if (files.length > 0) {
      zip.addLocalFolder(UPLOAD_DIR, 'uploads');
    }
  }

  zip.writeZip(localPath);
  console.log(`[Backup-Auto] Backup local: ${filename}`);

  const archivos = fs.readdirSync(LOCAL_BACKUP_DIR)
    .filter(f => f.startsWith('docflow_backup_') && f.endsWith('.zip'))
    .sort()
    .reverse();

  if (archivos.length > retention) {
    const eliminar = archivos.slice(retention);
    for (const f of eliminar) {
      try {
        fs.unlinkSync(path.join(LOCAL_BACKUP_DIR, f));
        console.log(`[Backup-Auto] Eliminado local: ${f}`);
      } catch (e) {}
    }
  }

  if (cfg.backup_auto_enabled === 'true' && cfg.backup_auto_type === 'smb') {
    const smbHost = cfg.backup_auto_host || '';
    const smbUser = cfg.backup_auto_user || '';
    const smbPass = cfg.backup_auto_pass || '';

    if (smbHost && smbUser) {
      console.log('[Backup-Auto] Subiendo a NAS...');
      const smbPath = smbHost.startsWith('//') ? smbHost : `//${smbHost}`;

      const cmd = `smbclient "${smbPath}" "${smbPass}" -U "${smbUser}" -c "cd backup 2>/dev/null || mkdir backup; cd backup; put ${localPath} ${filename}" 2>&1`;

      try {
        execSync(cmd, { stdio: 'pipe', timeout: 60000 });
        console.log(`[Backup-Auto] Subido a NAS: ${smbHost}/backup/${filename}`);
      } catch (e) {
        console.log(`[Backup-Auto] Error SMB: ${e.message}`);
      }
    }
  }

  console.log(`[Backup-Auto] Completado. Local: ${archivos.length} backups`);
}

generarBackupAuto().catch(e => {
  console.error('[Backup-Auto] Error:', e.message);
  process.exit(1);
});
