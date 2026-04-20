require('dotenv').config();
const { pool } = require('./index');

const migrations = [

// ─── 001: Extensiones ────────────────────────────────────────────────────────
`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

// ─── 002: Áreas ──────────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS areas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  email       VARCHAR(200),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 003: Usuarios ────────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id       UUID REFERENCES areas(id) ON DELETE SET NULL,
  nombre        VARCHAR(150) NOT NULL,
  email         VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol           VARCHAR(50)  NOT NULL DEFAULT 'comprador'
                  CHECK (rol IN ('admin','contador','tesorero','comprador','auditor')),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_acceso TIMESTAMPTZ,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 004: Categorías de compra ───────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS categorias_compra (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(150) NOT NULL UNIQUE,
  descripcion TEXT,
  color       VARCHAR(7)   NOT NULL DEFAULT '#3B82F6',
  pasos       JSONB        NOT NULL DEFAULT '["recepcion","revision","aprobacion","causacion"]',
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 005: Categoría ↔ Área (many-to-many) ────────────────────────────────────
`CREATE TABLE IF NOT EXISTS categoria_area (
  categoria_id UUID NOT NULL REFERENCES categorias_compra(id) ON DELETE CASCADE,
  area_id      UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  PRIMARY KEY (categoria_id, area_id)
)`,

// ─── 006: Proveedores ────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS proveedores (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nit               VARCHAR(30)  NOT NULL UNIQUE,
  nombre            VARCHAR(200) NOT NULL,
  email_facturacion VARCHAR(200),
  telefono          VARCHAR(30),
  direccion         TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 007: Facturas ────────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS facturas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_factura      VARCHAR(100) NOT NULL,
  proveedor_id        UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  categoria_id        UUID REFERENCES categorias_compra(id) ON DELETE SET NULL,
  area_responsable_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  asignado_a_id       UUID REFERENCES usuarios(id) ON DELETE SET NULL,

  valor               NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_iva           NUMERIC(18,2) NOT NULL DEFAULT 0,
  valor_total         NUMERIC(18,2) NOT NULL DEFAULT 0,

  estado              VARCHAR(30) NOT NULL DEFAULT 'recibida'
                        CHECK (estado IN ('recibida','revision','aprobada','rechazada','causada','pagada')),

  centro_costos       VARCHAR(50),
  observaciones       TEXT,
  motivo_rechazo      TEXT,

  archivo_pdf         VARCHAR(500),
  archivo_xml         VARCHAR(500),

  email_origen        VARCHAR(200),
  email_asunto        VARCHAR(500),

  recibida_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  limite_dian         TIMESTAMPTZ,
  limite_pago         DATE,
  aprobada_en         TIMESTAMPTZ,
  causada_en          TIMESTAMPTZ,
  pagada_en           TIMESTAMPTZ,

  dian_tacita         BOOLEAN NOT NULL DEFAULT FALSE,

  fecha_factura       DATE,
  nit_emisor          VARCHAR(30),
  nombre_emisor       VARCHAR(200),
  cufe                VARCHAR(100),

  creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 008: Índices facturas ────────────────────────────────────────────────────
`CREATE INDEX IF NOT EXISTS idx_facturas_estado        ON facturas(estado)`,
`CREATE INDEX IF NOT EXISTS idx_facturas_proveedor     ON facturas(proveedor_id)`,
`CREATE INDEX IF NOT EXISTS idx_facturas_area          ON facturas(area_responsable_id)`,
`CREATE INDEX IF NOT EXISTS idx_facturas_limite_dian   ON facturas(limite_dian)`,
`CREATE INDEX IF NOT EXISTS idx_facturas_recibida_en   ON facturas(recibida_en DESC)`,

// ─── 009: Eventos del flujo (auditoría) ──────────────────────────────────────
`CREATE TABLE IF NOT EXISTS eventos_flujo (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  factura_id  UUID NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo        VARCHAR(50) NOT NULL
                CHECK (tipo IN (
                  'recibida','asignada','revision_iniciada',
                  'aprobada','rechazada','reenviada',
                  'centro_costos_asignado','causada','pagada',
                  'escalacion_nivel1','escalacion_nivel2','dian_tacita','comentario'
                )),
  comentario  TEXT,
  metadata    JSONB,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

`CREATE INDEX IF NOT EXISTS idx_eventos_factura ON eventos_flujo(factura_id)`,
`CREATE INDEX IF NOT EXISTS idx_eventos_tipo    ON eventos_flujo(tipo)`,

// ─── 010: Escalaciones ───────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS escalaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  factura_id      UUID NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  nivel           SMALLINT NOT NULL CHECK (nivel IN (1, 2)),
  notificado_a_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  enviada_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelta        BOOLEAN NOT NULL DEFAULT FALSE,
  resuelta_en     TIMESTAMPTZ
)`,

`CREATE INDEX IF NOT EXISTS idx_escalaciones_factura ON escalaciones(factura_id)`,
`CREATE INDEX IF NOT EXISTS idx_escalaciones_resuelta ON escalaciones(resuelta)`,

// ─── 011: Configuración global ───────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS configuracion (
  clave       VARCHAR(100) PRIMARY KEY,
  valor       TEXT,
  descripcion VARCHAR(300),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

`INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('horas_limite_revision',   '24',   'Horas antes de escalar al jefe si nadie revisa'),
  ('horas_escalacion_nivel2', '48',   'Horas antes de escalar a gerencia'),
  ('horas_dian_tacita',       '48',   'Horas para aceptación tácita DIAN'),
  ('email_notificaciones',    '',     'Correo para copia de notificaciones'),
  ('empresa_nombre',          'Vitamar', 'Nombre de la empresa'),
  ('moneda',                  'COP',  'Moneda por defecto')
ON CONFLICT (clave) DO NOTHING`,

// ─── 012: Tokens de recuperación de contraseña ───────────────────────────────
`CREATE TABLE IF NOT EXISTS tokens_reset (
  token      VARCHAR(100) PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira     TIMESTAMPTZ NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 013: Sesiones (para logout y gestión) ───────────────────────────────────
`CREATE TABLE IF NOT EXISTS sesiones (
  token      VARCHAR(100) PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira     TIMESTAMPTZ NOT NULL,
  ip         VARCHAR(50),
  user_agent TEXT,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 014: Log de accesos (auditoría login) ───────────────────────────────────
`CREATE TABLE IF NOT EXISTS log_accesos (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  email      VARCHAR(200),
  ip         VARCHAR(50),
  user_agent TEXT,
  exito      BOOLEAN NOT NULL,
  motivo     VARCHAR(100),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 015: Actualizar tabla usuarios ────────────────────────────────────────────
`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cambio_password BOOLEAN NOT NULL DEFAULT FALSE`,

// ─── 015b: Agregar jefe_id a áreas ──────────────────────────────────────────────
`ALTER TABLE areas ADD COLUMN IF NOT EXISTS jefe_id UUID REFERENCES usuarios(id) ON DELETE SET NULL`,

// ─── 016: Función updated_at automático ──────────────────────────────────────
`CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,

`DO $$ BEGIN
  CREATE TRIGGER trg_areas_updated_at
    BEFORE UPDATE ON areas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

`DO $$ BEGIN
  CREATE TRIGGER trg_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

`DO $$ BEGIN
  CREATE TRIGGER trg_facturas_updated_at
    BEFORE UPDATE ON facturas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

`DO $$ BEGIN
  CREATE TRIGGER trg_categorias_updated_at
    BEFORE UPDATE ON categorias_compra
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

// ─── 017: Campos adicionales para aprobación ──────────────────────────────────
`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS descripcion_gasto TEXT`,
`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS referencia VARCHAR(100)`,

// ─── 018: Centros de operación ────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS centros_operacion (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(200) NOT NULL UNIQUE,
  codigo      VARCHAR(50),
  descripcion TEXT,
  direccion   TEXT,
  telefono    VARCHAR(50),
  email       VARCHAR(200),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,

// ─── 019: Vincular facturas a centros de operación ────────────────────────────
`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS centro_operacion_id UUID REFERENCES centros_operacion(id) ON DELETE SET NULL`,

// ─── 020: Orden de compra del XML ────────────────────────────────────────────
`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS orden_compra VARCHAR(100)`,

// ─── 021: Permisos de categorías por usuario ───────────────────────────────────
`CREATE TABLE IF NOT EXISTS categorias_usuario (
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias_compra(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, categoria_id)
)`,

`CREATE INDEX IF NOT EXISTS idx_categorias_usuario_usuario ON categorias_usuario(usuario_id)`,

// ─── 022: Soporte de pago ────────────────────────────────────────────────────
`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS soporte_pago VARCHAR(255)`,
`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS soporte_pago_nombre VARCHAR(255)`,
`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pagada_en TIMESTAMPTZ`,

// ─── 023: Proveedor → Categoría (aprendizaje automático) ──────────────────
`CREATE TABLE IF NOT EXISTS proveedor_categoria_preferencia (
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias_compra(id) ON DELETE CASCADE,
  contador INTEGER NOT NULL DEFAULT 1,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proveedor_id, categoria_id)
)`,

// ─── 024: Categoría por defecto en proveedor ────────────────────────────────
`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS categoria_default_id UUID REFERENCES categorias_compra(id) ON DELETE SET NULL`,

];

async function migrate() {
  const client = await pool.connect();
  console.log('🔧 Ejecutando migraciones...\n');
  try {
    for (let i = 0; i < migrations.length; i++) {
      const sql = migrations[i].trim();
      const preview = sql.split('\n')[0].substring(0, 70);
      try {
        await client.query(sql);
        console.log(`  ✓ [${String(i+1).padStart(2,'0')}] ${preview}`);
      } catch (err) {
        console.error(`  ✗ [${String(i+1).padStart(2,'0')}] ${preview}`);
        console.error(`     → ${err.message}`);
        throw err;
      }
    }
    console.log('\n✅ Todas las migraciones ejecutadas correctamente.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('\n❌ Migración fallida:', err.message);
  process.exit(1);
});
