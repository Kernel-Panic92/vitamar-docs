const db = require('../db');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'facturas');

async function generarBackupAuto() {
  const configResult = await db.query(`SELECT clave, valor FROM configuracion`);
  const cfg = {};
  for (const row of configResult.rows) cfg[row.clave] = row.valor;
  
  const backupPath = cfg.backup_auto_path || '/mnt/vitamar-nas/backup';
  const retention = parseInt(cfg.backup_auto_retention || '7');
  
  if (!fs.existsSync(backupPath)) {
    console.log(`[Backup-Auto] Directorio no existe: ${backupPath}`);
    return;
  }
  
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
  
  if (fs.existsSync(UPLOAD_DIR)) {
    const files = fs.readdirSync(UPLOAD_DIR);
    if (files.length > 0) {
      zip.addLocalFolder(UPLOAD_DIR, 'uploads');
    }
  }
  
  const fecha = new Date().toISOString().slice(0, 10);
  const filename = `vitamar_backup_${fecha}_${Date.now()}.zip`;
  const filepath = path.join(backupPath, filename);
  
  zip.writeZip(filepath);
  console.log(`[Backup-Auto] Backup guardado: ${filename}`);
  
  const archivos = fs.readdirSync(backupPath)
    .filter(f => f.startsWith('vitamar_backup_') && f.endsWith('.zip'))
    .sort()
    .reverse();
  
  if (archivos.length > retention) {
    const eliminar = archivos.slice(retention);
    for (const f of eliminar) {
      try {
        fs.unlinkSync(path.join(backupPath, f));
        console.log(`[Backup-Auto] Eliminado: ${f}`);
      } catch (e) {}
    }
  }
  
  console.log(`[Backup-Auto] Completado. Total backups: ${archivos.length}`);
}

generarBackupAuto().catch(e => {
  console.error('[Backup-Auto] Error:', e.message);
  process.exit(1);
});
