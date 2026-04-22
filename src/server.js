require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const cookieParser = require('cookie-parser');
const fs      = require('fs');

const app = express();

// ─── Middlewares globales ─────────────────────────────────────────────────────
app.use(cookieParser());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN || false
    : true,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rutas API ────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/areas',       require('./routes/areas'));
app.use('/api/categorias',  require('./routes/categorias'));
app.use('/api/facturas',    require('./routes/facturas'));
app.use('/api/usuarios',    require('./routes/usuarios'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/dashboard',   require('./routes/dashboard'));
app.use('/api/backup',         require('./routes/backup'));
app.use('/api/sync',           require('./routes/sync'));
app.use('/api/configuracion',  require('./routes/configuracion'));
app.use('/api/audit',          require('./routes/audit'));
app.use('/api/centros',        require('./routes/centros'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'Vitamar Docs',
    version: '1.0.0',
    env: process.env.NODE_ENV,
    ts: new Date().toISOString(),
  });
});

// ─── Archivos estáticos (frontend) ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

app.get('/app.js', (req, res) => {
  const file = path.join(__dirname, '../public/app.js');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(file);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Error handler global ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Archivo demasiado grande (máximo ${process.env.MAX_FILE_MB || 10}MB)` });
  }
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message });
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3100');

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   Vitamar Docs  —  puerto ${PORT}           ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`  API:   http://localhost:${PORT}/api`);
  console.log(`  App:   http://localhost:${PORT}`);
  console.log(`  Env:   ${process.env.NODE_ENV || 'development'}\n`);

  // Endpoint de versión
  app.get('/api/version', (req, res) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
      
      // Intentar obtener el año del último commit
      let year = new Date().getFullYear().toString();
      try {
        const commitDate = execSync('git log -1 --format=%ai --quiet', { cwd: __dirname, encoding: 'utf8' }).trim();
        if (commitDate) {
          year = commitDate.substring(0, 4); // Solo el año
        }
      } catch (e) { /* ignore - usa año actual */ }
      
      const author = pkg.author || '';
      const displayAuthor = author.includes(year) ? author : `© ${year} - ${author}`;
      
      res.json({ 
        version: pkg.version || '1.0.0', 
        name: pkg.name,
        author: displayAuthor,
        year: year
      });
    } catch { 
      res.json({ version: '1.0.0', name: 'vitamar-docs', author: '', year: new Date().getFullYear().toString() }); 
    }
  });

  // Servicios en background
  if (process.env.NODE_ENV !== 'test') {
    const { iniciarCronJobs }   = require('./services/cron.service');
    const { iniciarServicioImap } = require('./services/imap.service');
    // Sin CRON jobs activos por ahora (escalaciones y DIAN tácita deshabilitados)
    iniciarCronJobs();
    iniciarServicioImap();
  }
});

module.exports = app;
