require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./index');

async function seed() {
  const client = await pool.connect();
  console.log('🌱 Cargando datos iniciales...\n');

  try {
    await client.query('BEGIN');

    // ─── Áreas ────────────────────────────────────────────────────────────────
    console.log('  → Áreas...');
    const areasData = [
      { nombre: 'Sistemas',             email: 'sistemas@vitamar.com' },
      { nombre: 'Dirección de Planta', email: 'planta@vitamar.com' },
      { nombre: 'Logística',           email: 'logistica@vitamar.com' },
      { nombre: 'Contabilidad',        email: 'contabilidad@vitamar.com' },
      { nombre: 'Gerencia',            email: 'gerencia@vitamar.com' },
    ];

    const areaIds = {};
    for (const a of areasData) {
      const res = await client.query(
        `INSERT INTO areas (nombre, email)
         VALUES ($1, $2)
         ON CONFLICT (nombre) DO UPDATE SET email=$2
         RETURNING id, nombre`,
        [a.nombre, a.email]
      );
      areaIds[a.nombre] = res.rows[0].id;
      console.log(`     ✓ ${a.nombre}`);
    }

    // ─── Usuario admin ─────────────────────────────────────────────────────────
    console.log('\n  → Usuario administrador...');
    const hash = await bcrypt.hash('vitamar2025', 12);
    const adminAreaId = areaIds['Sistemas'];
    const adminRes = await client.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, area_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash=$3, rol=$4
       RETURNING id`,
      ['Administrador', 'admin@vitamar.com', hash, 'admin', adminAreaId]
    );
    const adminId = adminRes.rows[0].id;
    console.log('     ✓ admin@vitamar.com');

    // Asignar admin como jefe de Sistemas
    try {
      await client.query(
        'UPDATE areas SET jefe_id = $1 WHERE nombre = $2',
        [adminId, 'Sistemas']
      );
      console.log('     ✓ Admin asignado como jefe de Sistemas');
    } catch (e) {
      console.log('     ⚠ No se pudo asignar jefe (se hará después)');
    }

    // ─── Categorías de compra ─────────────────────────────────────────────────
    console.log('\n  → Categorías de compra...');
    const categorias = [
      {
        nombre: 'Tecnología y Software',
        descripcion: 'Equipos, licencias, servicios TI y telecomunicaciones',
        color: '#3B82F6',
        pasos: ['recepcion','revision','aprobacion','causacion'],
        areas: ['Sistemas'],
      },
      {
        nombre: 'Empaques y Materiales',
        descripcion: 'Bolsas, cajas e insumos de empaque para producción',
        color: '#10B981',
        pasos: ['recepcion','revision','aprobacion','causacion'],
        areas: ['Dirección de Planta', 'Logística'],
      },
      {
        nombre: 'Logística y Transporte',
        descripcion: 'Fletes nacionales, mensajería y servicios de transporte',
        color: '#F59E0B',
        pasos: ['recepcion','revision','aprobacion','causacion'],
        areas: ['Logística'],
      },
      {
        nombre: 'Mantenimiento',
        descripcion: 'Repuestos, herramientas y servicios técnicos de equipos',
        color: '#8B5CF6',
        pasos: ['recepcion','revision','aprobacion','causacion'],
        areas: ['Dirección de Planta'],
      },
      {
        nombre: 'Servicios Generales',
        descripcion: 'Aseo, cafetería, papelería y servicios de oficina',
        color: '#EC4899',
        pasos: ['recepcion','aprobacion','causacion'],
        areas: ['Contabilidad'],
      },
      {
        nombre: 'Insumos de Producción',
        descripcion: 'Materias primas e insumos directos del proceso productivo',
        color: '#06B6D4',
        pasos: ['recepcion','revision','aprobacion','causacion'],
        areas: ['Dirección de Planta'],
      },
    ];

    for (const cat of categorias) {
      const res = await client.query(
        `INSERT INTO categorias_compra (nombre, descripcion, color, pasos)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (nombre) DO UPDATE SET descripcion=$2, color=$3, pasos=$4
         RETURNING id`,
        [cat.nombre, cat.descripcion, cat.color, JSON.stringify(cat.pasos)]
      );
      const catId = res.rows[0].id;

      // Asociar áreas
      for (const areaNombre of cat.areas) {
        const areaId = areaIds[areaNombre];
        if (areaId) {
          await client.query(
            `INSERT INTO categoria_area (categoria_id, area_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [catId, areaId]
          );
        }
      }
      console.log(`     ✓ ${cat.nombre} → [${cat.areas.join(', ')}]`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Seed completado.\n');
    console.log('  Acceso inicial:');
    console.log('    Email:    admin@vitamar.com');
    console.log('    Password: vitamar2025');
    console.log('  ⚠️  Cambia la contraseña en el primer acceso.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error en seed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
