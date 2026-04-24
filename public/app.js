// ─── STATE ───────────────────────────────────────────────────────────────────
const S={
  token:localStorage.getItem('vd_t'),
  usuario:JSON.parse(localStorage.getItem('vd_u')||'null'),
  view:'dashboard',
  areas:[],
  cats:[],
  theme:localStorage.getItem('vd_theme')||'dark'
};
const COLS=['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#F97316','#06B6D4','#84CC16'];
const PASOS=[{id:'recepcion',l:'Recepción',d:'Sistema recibe'},{id:'revision',l:'Revisión',d:'Asigna CC'},{id:'aprobacion',l:'Aprobación',d:'Responsable'},{id:'causacion',l:'Causación',d:'Tesorería'},{id:'pagada',l:'Pagada',d:'Archivada'}];
const EORD=['recibida','revision','aprobada','causada','pagada'];
const EM={recibida:{l:'Recibida',c:'#60A5FA'},revision:{l:'En revisión',c:'#FBBF24'},aprobada:{l:'Aprobada',c:'#34D399'},causada:{l:'Causada',c:'#A78BFA'},rechazada:{l:'Rechazada',c:'#F87171'},pagada:{l:'Pagada',c:'#6EE7B7'}};
const NAV=[
  {id:'dashboard',l:'Dashboard',i:'📊',s:'p'},
  {id:'facturas',l:'Facturas',i:'📄',s:'p'},
  {id:'pendientes',l:'Pendientes',i:'⏰',s:'p'},
  {id:'porpagar',l:'Por Pagar',i:'💳',s:'f',roles:['admin','tesorero']},
  {id:'causacion',l:'Causación',i:'📥',s:'f',roles:['admin','contador','tesorero']},
  {id:'categorias',l:'Categorías',i:'🏷️',s:'c',roles:['admin','contador']},
  {id:'centros',l:'Centros',i:'🗺️',s:'c',roles:['admin','contador']},
  {id:'configuracion',l:'Configuración',i:'⚙️',s:'c',roles:['admin']},
  {id:'backup',l:'Backup',i:'💾',s:'c',roles:['admin']},
  {id:'usuarios',l:'Usuarios',i:'👤',s:'c',roles:['admin']},
  {id:'audit',l:'Auditoría',i:'🔒',s:'c',roles:['admin','auditor']}
];
const SECS=[{id:'p',l:'Principal'},{id:'f',l:'Flujo'},{id:'c',l:'Config'}];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmt(v){return '$'+Math.round(parseFloat(v)||0).toLocaleString('es-CO')}
function fdate(d){if(!d)return'—';return new Date(d).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}
function fdatetime(d){if(!d)return'—';const dt=new Date(d);return dt.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})+' '+dt.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}
function bdg(e){const m=EM[e]||{l:e,c:'#888'};return`<span class="badge b-${e}">${m.l}</span>`}
function ctag(c,n){if(!n)return'<span style="color:var(--muted)">—</span>';return`<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${c||'#888'};flex-shrink:0"></span>${esc(n)}</span>`}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(msg,type='info'){
  const t=$('toast');
  t.className=`toast ${type} show`;
  t.innerHTML=`<span>${type==='success'?'✓':type==='error'?'✗':'ℹ'}</span> ${esc(msg)}`;
  setTimeout(()=>t.classList.remove('show'),4000);
}

// ─── THEME ───────────────────────────────────────────────────────────────────
function toggleTheme(){
  S.theme=S.theme==='dark'?'light':'dark';
  document.body.className=S.theme;
  localStorage.setItem('vd_theme',S.theme);
  $('theme-btn').textContent=S.theme==='dark'?'🌙':'☀️';
}

// ─── SIDEBAR MOBILE ───────────────────────────────────────────────────────────
function toggleSidebar(){$('sidebar').classList.add('open');$('mob-overlay').classList.add('visible')}
function closeSidebar(){$('sidebar').classList.remove('open');$('mob-overlay').classList.remove('visible')}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function showM(title,body,w=560){
  $('mroot').innerHTML=`<div class="modal-overlay open" onclick="if(event.target===this)closeM()">
    <div class="modal" style="max-width:${w}px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <span style="font-family:var(--font-head);font-size:18px;font-weight:700">${title}</span>
        <button class="btn btn-secondary btn-sm" onclick="closeM()">✕</button>
      </div>
      ${body}
    </div>
  </div>`;
}
function closeM(){$('mroot').innerHTML=''}

// ─── API ─────────────────────────────────────────────────────────────────────
async function api(m,p,b,isF){
  const o={method:m,headers:{Authorization:`Bearer ${S.token}`}};
  if(b&&!isF){o.headers['Content-Type']='application/json';o.body=JSON.stringify(b)}
  else if(isF)o.body=b;
  const r=await fetch(`/api${p}`,o);
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);
  return j;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────
async function verPdf(id){
  const token = localStorage.getItem('vd_t');
  try {
    const resp = await fetch(`/api/facturas/${id}/pdf`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      const err = await resp.json().catch(()=>({error:'Error'}));
      toast(err.error || 'Error cargando PDF', 'error');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    $('mroot').innerHTML=`<div class="modal-overlay open" onclick="if(event.target===this){closeM();URL.revokeObjectURL('${url}');}">
      <div class="modal" style="width:90vw;max-width:900px;height:85vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <span style="font-family:var(--font-head);font-size:16px;font-weight:700">Factura PDF</span>
          <button class="btn btn-secondary btn-sm" onclick="closeM();URL.revokeObjectURL('${url}')">✕ Cerrar</button>
        </div>
        <iframe src="${url}" style="flex:1;border:none;border-radius:8px;background:#fff"></iframe>
      </div>
    </div>`;
  } catch(e) {
    toast('Error cargando PDF', 'error');
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function doLogin(){
  const email=$('login-email').value.trim();
  const pass=$('login-pass').value;
  const errEl=$('login-error');
  errEl.classList.remove('show');
  try{
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Error');
    S.token=d.token;S.usuario=d.usuario;
    localStorage.setItem('vd_t',d.token);localStorage.setItem('vd_u',JSON.stringify(d.usuario));
    if(d.cambio_password)showChPass();else showApp();
  }catch(ex){errEl.textContent=ex.message;errEl.classList.add('show')}
}
function doLogout(){localStorage.removeItem('vd_t');localStorage.removeItem('vd_u');S.token=null;S.usuario=null;$('app-screen').classList.remove('show');$('login-screen').style.display='flex'}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&$('login-screen').style.display!=='none')doLogin()});

function showForgot(e){e.preventDefault();$('forgot-modal').classList.add('open')}
function closeForgot(){$('forgot-modal').classList.remove('open');$('forgot-email').value='';$('forgot-msg').innerHTML=''}
async function doForgot(){
  const email=$('forgot-email').value.trim();
  if(!email)return;
  try{
    await fetch('/api/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    $('forgot-msg').innerHTML=`<span style="color:var(--success)">✓ Se envió un enlace a tu correo.</span>`;
    setTimeout(closeForgot,3000);
  }catch(e){$('forgot-msg').innerHTML=`<span style="color:var(--danger)">${e.message}</span>`}
}

function showChPass(){$('chpass-modal').classList.add('open')}
$('chpass-new').addEventListener('input',function(){
  const p=this.value;
  $('req-len').style.color=p.length>=8?'var(--success)':'';
  $('req-up').style.color=/[A-Z]/.test(p)?'var(--success)':'';
  $('req-num').style.color=/[0-9]/.test(p)?'var(--success)':'';
  $('req-sym').style.color=/[!@#$%^&*(),.?":{}|<>_\-+=]/.test(p)?'var(--success)':'';
});
async function doChangePass(){
  const p1=$('chpass-new').value,p2=$('chpass-confirm').value;
  if(p1!==p2){$('chpass-msg').innerHTML='<span style="color:var(--danger)">Las contraseñas no coinciden</span>';return}
  try{
    await api('POST','/auth/cambio-forzado',{password:p1});
    $('chpass-modal').classList.remove('open');
    toast('Contraseña actualizada','success');
    showApp();
  }catch(e){$('chpass-msg').innerHTML=`<span style="color:var(--danger)">${e.message}</span>`}
}

// ─── APP ─────────────────────────────────────────────────────────────────────
function showApp(){
  $('login-screen').style.display='none';
  $('app-screen').classList.add('show');
  document.body.className=S.theme;
  $('theme-btn').textContent=S.theme==='dark'?'🌙':'☀️';
  $('u-name').textContent=S.usuario?.nombre||'—';
  $('u-role').textContent=S.usuario?.rol||'—';
  const rolClass={'admin':'role-admin','contador':'role-contador','tesorero':'role-tesorero','comprador':'role-comprador','auditor':'role-auditor'};
  $('u-badge').className=`role-badge ${rolClass[S.usuario?.rol]||'role-comprador'}`;
  $('u-badge').textContent=S.usuario?.rol||'';
  initFiltros();
  
  // Cargar versión
  fetch('/api/version').then(r=>r.json()).then(d=>{
    const el=document.getElementById('app-version');
    if(el&&d.version)el.textContent='v'+d.version+' — DocFlow';
    const cr=document.getElementById('app-copyright');
    if(cr&&d.author)cr.textContent=d.author;
  }).catch(()=>{});
  if(S.empresaLogo){
    $('header-logo').innerHTML='<img src="'+S.empresaLogo+'" style="height:32px;border-radius:6px"/>';
    const loginLogo=$('login-logo-container');
    if(loginLogo)loginLogo.innerHTML='<img src="'+S.empresaLogo+'" style="max-height:60px;max-width:200px;border-radius:8px"/>';
  }else if(S.appNombre){
    $('header-logo').innerHTML=S.appNombre.toUpperCase();
  }
  buildNav();goTo('dashboard');
}

function buildNav(){
  let h='';
  for(const sec of SECS){
    const items=NAV.filter(n=>n.s===sec.id&&(!n.roles||n.roles.includes(S.usuario?.rol)));
    if(!items.length)continue;
    h+=`<div style="font-size:9px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;padding:10px 24px 4px;margin-top:4px">${sec.l}</div>`;
    for(const n of items)h+=`<div class="nav-item" id="nv-${n.id}" onclick="goNav('${n.id}')">${n.i}<span style="flex:1">${n.l}</span>${n.badge?`<span class="badge" style="font-size:10px;padding:2px 6px;background:${n.w?'rgba(251,191,36,.15)':'rgba(79,142,247,.15)'};color:${n.w?'var(--warning)':'var(--accent)'}" id="nb-${n.badge}">0</span>`:''}</div>`;
  }
  $('nav').innerHTML=h;
}
function goNav(v){closeSidebar();goTo(v)}
function setNav(id){
  document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));
  const e=$(`nv-${id}`);if(e)e.classList.add('active');
  const T={'dashboard':'Dashboard','facturas':'Facturas','pendientes':'Pendientes','aprobaciones':'Aprobaciones','causacion':'Causación','categorias':'Categorías','usuarios':'Usuarios','backup':'Backup'};
  $('content').parentElement.querySelector('.page-title')?.remove();
  $('content').parentElement.querySelector('.page-sub')?.remove();
}
async function goTo(v){
  S.view=v;setNav(v);
  const el=$('content');el.innerHTML='<div class="empty">Cargando…</div>';
  try{
    if(v==='dashboard')await rDash();
    else if(v==='facturas')await rFacturas();
    else if(v==='pendientes')await rPend();
    else if(v==='causacion')await rCaus();
    else if(v==='porpagar')await rPorPagar();
    else if(v==='categorias')await rCats();
    else if(v==='centros')await rCentros();
    else if(v==='usuarios')await rUsers();
    else if(v==='backup')await rBackup();
    else if(v==='configuracion')await rConfig();
    else if(v==='audit')await rAudit();
    else el.innerHTML='<div class="empty">Módulo en construcción</div>';
  }catch(ex){el.innerHTML=`<div class="empty" style="color:var(--danger)">${ex.message}</div>`}
}
async function refreshBadges(){
  // Badges removed from menu - badges only shown when opening modals
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function rDash(){
  const d=await api('GET','/dashboard');
  const r=d.resumen;
  const rol=S.usuario?.rol;
  const esComprador=rol==='comprador';
  const esTesorero=['tesorero','admin'].includes(rol);
  const sync=await checkSyncStatus();
  if(sync.sincronizando){
    startSyncPoll();
  }else{
    stopSyncPoll();
  }
  let stats='';
  if(esComprador){
    stats+=stat('Pendientes aprobar',r.recibidas+r.revision,'var(--accent2)','orange');
  }else if(rol==='admin'){
    stats+=stat('Recibidas',r.recibidas,'var(--accent)','blue');
    stats+=stat('En revisión',r.revision,'var(--accent2)','orange');
    stats+=stat('Por causar',r.aprobadas,'var(--success)','green');
    stats+=stat('Por pagar',r.causadas,'var(--accent)','blue');
    stats+=stat('Valor mes',fmt(r.valor_mes),'var(--warning)','yellow');
  }else if(esTesorero){
    stats+=stat('Por causar',r.aprobadas,'var(--success)','green');
    stats+=stat('Por pagar',r.causadas,'var(--accent)','blue');
    stats+=stat('Valor mes',fmt(r.valor_mes),'var(--warning)','yellow');
  }else{
    stats+=stat('Recibidas',r.recibidas,'var(--accent)','blue');
    stats+=stat('En revisión',r.revision,'var(--accent2)','orange');
    stats+=stat('Por causar',r.aprobadas,'var(--success)','green');
    stats+=stat('Valor mes',fmt(r.valor_mes),'var(--warning)','yellow');
  }
  const rc=d.recientes||[];
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Dashboard</div><div class="page-sub">${esTesorero?'Gestión de pagos':esComprador?'Facturas por aprobar':'Resumen general'}</div></div></div>
    ${!esComprador?sync.bar:''}
    <div class="stats-row">${stats}</div>
    <div class="tbl">
      <div class="tbl-head"><div class="tbl-title">Actividad reciente</div><button class="btn btn-primary btn-sm" onclick="mNuevaF()">+ Nueva</button></div>
      <table><thead><tr><th># Factura</th><th>Proveedor</th><th>Categoría</th><th>Valor</th><th>Estado</th><th>Recibida</th><th></th></tr></thead>
      <tbody>${rc.length?rc.map(f=>`<tr onclick="abrirF('${f.id}')"><td class="mono">${esc(f.numero_factura)}</td><td style="font-weight:500">${esc(f.proveedor_nombre||'—')}</td><td>${ctag(f.categoria_color,f.categoria_nombre)}</td><td style="font-weight:500">${fmt(f.valor_total||f.valor||0)}</td><td>${bdg(f.estado)}</td><td style="color:var(--muted);font-size:12px">${fdatetime(f.recibida_en)}</td><td>${f.archivo_pdf?`<span onclick="event.stopPropagation();verPdf('${f.id}')" title="Ver PDF" style="color:var(--accent);font-size:16px;cursor:pointer">📄</span>`:''}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">Sin facturas</td></tr>'}</tbody></table>
    </div>`;
  refreshBadges();
}
function stat(l,v,c){return`<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value ${c}">${v}</div></div>`}

async function checkSyncStatus(){
  try{
    const r=await api('GET','/sync/status');
    if(r.sincronizando){
      return{sincronizando:true,bar:`<div style="background:rgba(79,142,247,.1);border:1px solid rgba(79,142,247,.3);border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-weight:600;color:var(--accent)">Sincronizando correo...</span>
          <span style="color:var(--muted);font-size:13px">${r.procesando}/${r.totalMensajes} — ${r.creadas} nuevas</span>
        </div>
        <div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden">
          <div style="background:var(--accent);height:100%;width:${r.progreso}%;transition:width .3s"></div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--muted)">${r.mensaje}</div>
      </div>`};
    }else{
      return{sincronizando:false,bar:`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:13px;color:var(--muted)">Ultima sync: ${r.ultimoSyncFormateado||'Nunca'} — ${r.mensaje||''}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="rescanearTodo()" title="Re-escanear todos los mensajes (incluye leídos)"><span style="font-size:12px">⟲</span> Rescanear</button>
          <button class="btn btn-secondary btn-sm" onclick="iniciarSync()" title="Sincronizar solo mensajes no leídos"><span style="font-size:14px">↻</span> Sync</button>
        </div>
      </div>`};
    }
  }catch(e){return{sincronizando:false,bar:`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:13px;color:var(--muted)">Sincronización manual</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="rescanearTodo()"><span style="font-size:12px">⟲</span> Rescanear</button>
          <button class="btn btn-secondary btn-sm" onclick="iniciarSync()"><span style="font-size:14px">↻</span> Sync</button>
        </div>
      </div>`}}
}
let syncPollInterval=null;
async function iniciarSync(){
  try{
    await api('POST','/sync');
    toast('Sincronizacion iniciada','info');
    if(S.view==='dashboard')rDash();
  }catch(e){toast(e.message,'error')}
}
async function rescanearTodo(){
  try{
    await api('POST','/sync',{rescanAll:true});
    toast('Reescaneo iniciado','info');
    if(S.view==='dashboard')rDash();
  }catch(e){toast(e.message,'error')}
}
function startSyncPoll(){
  if(syncPollInterval)return;
  syncPollInterval=setInterval(async()=>{
    if(S.view==='dashboard')await rDash();
  },2000);
}
function stopSyncPoll(){
  if(syncPollInterval){clearInterval(syncPollInterval);syncPollInterval=null}
}

// ─── FACTURAS ────────────────────────────────────────────────────────────────
let fFiltro='todas';
function getFiltrosKey(){return'vd_f_'+S.usuario?.id}
let fBusqueda=JSON.parse(localStorage.getItem(getFiltrosKey())||'{}');
// Ensure date fields are never undefined
fBusqueda.fecha_desde=fBusqueda.fecha_desde||'';
fBusqueda.fecha_hasta=fBusqueda.fecha_hasta||'';
function initFiltros(){const k=getFiltrosKey();const f=JSON.parse(localStorage.getItem(k)||'{}');f.fecha_desde=f.fecha_desde||'';f.fecha_hasta=f.fecha_hasta||'';if(f.categoria_id||f.proveedor_id)fBusqueda=f}

async function rFacturas(filtro){
  if(filtro!==undefined)fFiltro=filtro;
  
  // Construir query params
  const params=new URLSearchParams();
  if(fFiltro!=='todas')params.set('estado',fFiltro);
  if(fBusqueda.numero)params.set('numero',fBusqueda.numero);
  if(fBusqueda.nit)params.set('nit_emisor',fBusqueda.nit);
  if(fBusqueda.fecha_desde)params.set('fecha_desde',fBusqueda.fecha_desde);
  if(fBusqueda.fecha_hasta)params.set('fecha_hasta',fBusqueda.fecha_hasta);
  if(fBusqueda.valor_min)params.set('valor_min',fBusqueda.valor_min);
  if(fBusqueda.valor_max)params.set('valor_max',fBusqueda.valor_max);
  if(fBusqueda.proveedor_id)params.set('proveedor_id',fBusqueda.proveedor_id);
  if(fBusqueda.categoria_id)params.set('categoria_id',fBusqueda.categoria_id);
  if(fBusqueda.buscar)params.set('buscar',fBusqueda.buscar);
  params.set('limit','100');

  const f=await api('GET',`/facturas?${params.toString()}`);S.facturas=f.data||[];
  const all=f.data||[];
  const isAdmin=S.usuario?.rol==='admin';
  const cnts={todas:f.total||all.length};
  ['recibida','revision','aprobada','causada','rechazada'].forEach(e=>cnts[e]=all.filter(x=>x.estado===e).length);
  const fbs=[{id:'todas',l:'Todas'},{id:'recibida',l:'Recibidas'},{id:'revision',l:'En revisión'},{id:'aprobada',l:'Aprobadas'},{id:'causada',l:'Causadas'},{id:'rechazada',l:'Rechazadas'}].map(fb=>`<button class="fb${fFiltro===fb.id?' active':''}" onclick="rFacturas('${fb.id}')">${fb.l}<span class="fc">${cnts[fb.id]||0}</span></button>`).join('');
  
  // Cargar proveedores y categorías para el filtro
  if(!S.proveedores)S.proveedores=await api('GET','/proveedores');
  if(!S.cats?.length)S.cats=await api('GET','/categorias');
  const provOpts=S.proveedores.map(p=>`<option value="${p.id}" ${fBusqueda.proveedor_id===p.id?'selected':''}>${esc(p.nombre)}</option>`).join('');
  const catOpts=S.cats.map(c=>`<option value="${c.id}" ${fBusqueda.categoria_id===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('');
  
  const hayFiltros=fBusqueda.numero||fBusqueda.nit||fBusqueda.fecha_desde||fBusqueda.fecha_hasta||fBusqueda.valor_min||fBusqueda.valor_max||fBusqueda.proveedor_id||fBusqueda.categoria_id||fBusqueda.buscar;
  
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Facturas</div><div class="page-sub">${f.total||0} factura(s) encontrada(s)</div></div><button class="btn btn-primary" onclick="mNuevaF()">+ Nueva factura</button></div>
    <div class="filters">${fbs}</div>
    
    <!-- Filtros avanzados -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-weight:600;font-size:13px">Filtros de búsqueda</span>
        ${hayFiltros?`<button onclick="limpiarFiltrosF()" style="background:rgba(247,97,79,.1);border:1px solid rgba(247,97,79,.2);color:var(--danger);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">✕ Limpiar</button>`:''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Buscar</label>
          <input type="text" id="ff-buscar" placeholder="N°, proveedor, NIT, CUFE..." value="${esc(fBusqueda.buscar)}" onkeydown="if(event.key==='Enter')aplicarFiltrosF()">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">N° Factura</label>
          <input type="text" id="ff-numero" placeholder="Ej: 59826" value="${esc(fBusqueda.numero)}">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">NIT Emisor</label>
          <input type="text" id="ff-nit" placeholder="Ej: 900768941" value="${esc(fBusqueda.nit)}">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Proveedor</label>
          <select id="ff-proveedor"><option value="">Todos</option>${provOpts}</select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Categoría</label>
          <select id="ff-categoria"><option value="">Todas</option>${catOpts}</select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Desde fecha</label>
          <input type="date" id="ff-fd" value="${fBusqueda.fecha_desde||''}">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Hasta fecha</label>
          <input type="date" id="ff-fh" value="${fBusqueda.fecha_hasta||''}">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Valor mín ($)</label>
          <input type="number" id="ff-vmin" placeholder="0" value="${fBusqueda.valor_min}">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Valor máx ($)</label>
          <input type="number" id="ff-vmax" placeholder="999999999" value="${fBusqueda.valor_max}">
        </div>
      </div>
      <button onclick="aplicarFiltrosF()" class="btn btn-primary btn-sm" style="margin-top:12px">🔍 Buscar</button>
    </div>
    
    <div class="tbl">
      <div class="tbl-head"><div class="tbl-title">${all.length} factura(s)</div></div>
      <table><thead><tr><th># Factura</th><th>Centro</th><th>Proveedor</th><th>Categoría</th><th>Valor</th><th>Estado</th><th>Recibida</th><th></th></tr></thead>
      <tbody>${all.length?all.map(f=>`<tr onclick="abrirF('${f.id}')"><td class="mono" data-label="Factura">${esc(f.numero_factura)}</td><td data-label="Centro" style="font-size:12px;color:var(--muted)">${esc(f.centro_operacion_nombre||'—')}</td><td data-label="Proveedor" style="font-weight:500">${esc(f.proveedor_nombre||f.nombre_emisor||'—')}</td><td data-label="Categoría">${ctag(f.categoria_color,f.categoria_nombre)}</td><td data-label="Valor" style="font-weight:500">${fmt(f.valor_total||f.valor||0)}</td><td data-label="Estado">${bdg(f.estado)}</td><td data-label="Recibida" style="color:var(--muted);font-size:12px">${fdatetime(f.recibida_en)}</td><td>${f.archivo_pdf?`<span onclick="event.stopPropagation();verPdf('${f.id}')" title="Ver PDF" style="color:var(--accent);font-size:16px;cursor:pointer">📄</span>`:''}${isAdmin?`<span onclick="event.stopPropagation();delFactura('${f.id}','${esc(f.numero_factura)}')" title="Eliminar" style="color:var(--danger);font-size:14px;cursor:pointer;margin-left:6px">🗑️</span>`:''}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">Sin facturas</td></tr>'}</tbody></table>
    </div>`;
  refreshBadges();
}

function aplicarFiltrosF(){
  fBusqueda={
    numero:$('ff-numero')?.value||'',
    nit:$('ff-nit')?.value||'',
    fecha_desde:$('ff-fd')?.value||'',
    fecha_hasta:$('ff-fh')?.value||'',
    valor_min:$('ff-vmin')?.value||'',
    valor_max:$('ff-vmax')?.value||'',
    proveedor_id:$('ff-proveedor')?.value||'',
    categoria_id:$('ff-categoria')?.value||'',
    buscar:$('ff-buscar')?.value||''
  };
  guardarFiltros();
  rFacturas();
}
function guardarFiltros(){
  localStorage.setItem(getFiltrosKey(),JSON.stringify(fBusqueda))}

function limpiarFiltrosF(){
  fBusqueda={numero:'',nit:'',fecha_desde:'',fecha_hasta:'',valor_min:'',valor_max:'',proveedor_id:'',categoria_id:'',buscar:''};
  guardarFiltros();
  rFacturas();
}

// ─── PENDIENTES ──────────────────────────────────────────────────────────────
let pendFiltro='todas';
let pendBusqueda='';
async function rPend(){
  const savedSearch=pendBusqueda;
  let savedCursorPos=0;
  const input=$('pend-buscar');
  if(input)savedCursorPos=input.selectionStart||0;
  const f=await api('GET','/facturas/pendientes');
  let all=f.data||[];
  
  if(pendBusqueda.trim()){
    const b=pendBusqueda.toLowerCase();
    all=all.filter(x=>{
      const num=(x.numero_factura||'').toLowerCase();
      const prov=(x.proveedor_nombre||'').toLowerCase();
      return num.includes(b)||prov.includes(b);
    });
  }
  
  const sinAprobar=all.filter(x=>['recibida','revision'].includes(x.estado));
  const sinPagar=all.filter(x=>['aprobada','causada'].includes(x.estado)&&x.estado!=='pagada');
  const porVencer=all.filter(x=>{
    if(!x.limite_pago)return false;
    const dias=Math.ceil((new Date(x.limite_pago)-new Date())/(1000*60*60*24));
    return dias>=0&&dias<=7;
  });
  
  let criticas,alertas,normales;
  if(pendFiltro==='sinaprobar'){criticas=all.filter(x=>['recibida','revision'].includes(x.estado));alertas=[];normales=[];}
  else if(pendFiltro==='sinpagar'){criticas=all.filter(x=>['aprobada','causada'].includes(x.estado));alertas=[];normales=[];}
  else if(pendFiltro==='vencer'){criticas=porVencer;alertas=[];normales=[];}
  else{
    criticas=all.filter(x=>['critico','sinaprobar'].includes(x.prioridad));
    alertas=all.filter(x=>['alerta','sinpagar'].includes(x.prioridad));
    normales=all.filter(x=>x.prioridad==='normal');
  }
  
function renderItem(f){
    let colorBarra='var(--accent)';
    let badgeExtra='';
    if(['recibida','revision'].includes(f.estado)){
      colorBarra='var(--warning)';
      badgeExtra='<span class="badge" style="background:rgba(251,191,36,.2);color:#f7d44f">⏳ Sin aprobar</span>';
    }else if(['aprobada','causada'].includes(f.estado)){
      colorBarra='#A78BFA';
      badgeExtra='<span class="badge" style="background:rgba(167,139,250,.2);color:#A78BFA">💳 Sin pagar</span>';
    }else if(f.limite_pago){
      const dias=Math.ceil((new Date(f.limite_pago)-new Date())/(1000*60*60*24));
      if(dias>=0&&dias<=7){colorBarra='var(--danger)';badgeExtra='<span class="badge" style="background:rgba(248,113,113,.2);color:#f7614f">⏰ Vence pronto</span>'}
    }
    const priorBadge=f.prioridad==='critico'?'<span class="badge" style="background:rgba(248,113,113,.2);color:#f7614f">🔴 Crítico</span>':
                          f.prioridad==='alerta'?'<span class="badge" style="background:rgba(251,191,36,.2);color:#f7d44f">🟡 Alerta</span>':
                          f.prioridad==='sinaprobar'?'<span class="badge" style="background:rgba(251,191,36,.2);color:#f7d44f">⏳ Sin aprobar</span>':
                          f.prioridad==='sinpagar'?'<span class="badge" style="background:rgba(167,139,250,.2);color:#A78BFA">💳 Sin pagar</span>':'';
    const tipoBadge=f.tipo_urgencia==='dian'?'<span class="badge b-revision">DIAN</span>':
                    f.tipo_urgencia==='soporte'?'<span class="badge b-causada">Sin soporte</span>':
                    f.tipo_urgencia==='revision'?'<span class="badge b-recibida">Sin revisar</span>':'';
    return `<div class="tbl" style="cursor:pointer;padding:16px 20px;display:flex;align-items:center;gap:20px;border-left:4px solid ${colorBarra}" onclick="abrirF('${f.id}')">
      <div style="flex:1"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span class="mono">${esc(f.numero_factura)}</span>${bdg(f.estado)}${priorBadge}${badgeExtra}${tipoBadge}</div>
      <div style="font-weight:500;margin-bottom:4px">${esc(f.proveedor_nombre||'Desconocido')}</div>
      <div style="font-size:12px;color:var(--muted)">${esc(f.area_nombre||'Sin área')} · Recibida: ${fdatetime(f.recibida_en)}</div></div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px"><div style="font-size:18px;font-weight:700">${fmt(f.valor_total||f.valor||0)}</div>${f.archivo_pdf?`<button onclick="event.stopPropagation();verPdf('${f.id}')" class="btn btn-secondary btn-sm">📄 PDF</button>`:''}${f.limite_pago?`<div style="font-size:12px;color:${new Date(f.limite_pago)<new Date()?'var(--danger)':f.prioridad==='alerta'?'var(--warning)':'var(--muted)'}">Vence: ${fdate(f.limite_pago)}</div>`:f.limite_dian?`<div style="font-size:12px;color:${f.prioridad==='critico'?'var(--danger)':'var(--muted)'}">DIAN: ${fdate(f.limite_dian)}</div>`:''}</div>
    </div>`;
  }
  
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Pendientes</div><div class="page-sub">${all.length} factura(s) requieren atención</div></div></div>
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <input type="text" id="pend-buscar" placeholder="🔍 Buscar factura o proveedor..." value="${esc(pendBusqueda)}" style="flex:1;min-width:200px;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text)" oninput="pendBusqueda=this.value;rPend()"/>
      <button class="fb${pendFiltro==='todas'?' active':''}" onclick="pendFiltro='todas';rPend()">Todas</button>
      <button class="fb${pendFiltro==='sinaprobar'?' active':''}" onclick="pendFiltro='sinaprobar';rPend()">⏳ Sin aprobar</button>
      <button class="fb${pendFiltro==='sinpagar'?' active':''}" onclick="pendFiltro='sinpagar';rPend()">💳 Sin pagar</button>
      <button class="fb${pendFiltro==='vencer'?' active':''}" onclick="pendFiltro='vencer';rPend()">⏰ Por vencer</button>
    </div>
    ${criticas.length?`<div style="margin-bottom:20px">
      <div style="font-size:11px;text-transform:uppercase;color:var(--danger);font-weight:600;margin-bottom:10px">🔴 Críticas (vencen pronto)</div>
      ${criticas.map(renderItem).join('')}
    </div>`:''}
    ${alertas.length?`<div style="margin-bottom:20px">
      <div style="font-size:11px;text-transform:uppercase;color:var(--warning);font-weight:600;margin-bottom:10px">🟡 Alertas</div>
      ${alertas.map(renderItem).join('')}
    </div>`:''}
    ${normales.length?`<div>
      <div style="font-size:11px;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:10px">Pendientes</div>
      ${normales.map(renderItem).join('')}
    </div>`:''}
    ${all.length===0?'<div class="empty">No hay facturas pendientes ✓</div>':''}
  `;
  const inp=$('pend-buscar');
  if(inp){
    inp.value=savedSearch;
    inp.setSelectionRange(savedCursorPos,savedCursorPos);
    inp.focus();
  }
}

// ─── CAUSACIÓN ───────────────────────────────────────────────────────────────
let causBusqueda='';
async function rCaus(){
  causBusqueda=$('caus-buscar')?.value||'';
  const params=new URLSearchParams();
  params.set('estado','aprobada');
  if(causBusqueda){
    params.set('buscar',causBusqueda);
  }
  const f=await api('GET',`/facturas?${params.toString()}&limit=100`);
  const all=f.data||[];
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Causación</div><div class="page-sub">${all.length} factura(s) por causar</div></div></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
      <input type="text" id="caus-buscar" placeholder="Buscar por # factura o proveedor..." value="${esc(causBusqueda)}" onkeydown="if(event.key==='Enter')rCaus()" style="width:100%">
    </div>
    <div style="display:grid;gap:12px">${all.length?all.map(f=>`<div class="tbl" style="cursor:pointer;padding:16px 20px;display:flex;align-items:center;gap:20px" onclick="abrirF('${f.id}')">
      <div style="flex:1"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span class="mono">${esc(f.numero_factura)}</span>${bdg(f.estado)}</div>
      <div style="font-weight:500;margin-bottom:4px">${esc(f.proveedor_nombre||'Desconocido')}</div>
      <div style="font-size:12px;color:var(--muted)">${esc(f.centro_operacion_nombre||'Sin CO')} · ${f.fecha_factura?'Fact: '+fdate(f.fecha_factura):''} ${f.limite_pago?'· Vence: '+fdate(f.limite_pago):''}</div></div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px"><div style="font-size:18px;font-weight:700">${fmt(f.valor_total||f.valor||0)}</div>${f.archivo_pdf?`<button onclick="event.stopPropagation();verPdf('${f.id}')" class="btn btn-secondary btn-sm">📄 PDF</button>`:''}</div>
    </div>`).join(''):'<div class="empty">No hay facturas por causar ✓</div>'}</div>`;
}

// ─── POR PAGAR ───────────────────────────────────────────────────────────
let porPagarBusqueda='';
async function rPorPagar(){
  porPagarBusqueda=$('porpagar-buscar')?.value||'';
  const params=new URLSearchParams();
  params.set('estado','causada');
  if(porPagarBusqueda){
    params.set('buscar',porPagarBusqueda);
  }
  const f=await api('GET',`/facturas?${params.toString()}&limit=100`);
  const all=f.data||[];
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Por Pagar</div><div class="page-sub">${all.length} factura(s) causadas pendientes de pago</div></div></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
      <input type="text" id="porpagar-buscar" placeholder="Buscar por # factura o proveedor..." value="${esc(porPagarBusqueda)}" onkeydown="if(event.key==='Enter')rPorPagar()" style="width:100%">
    </div>
    <div style="display:grid;gap:12px">${all.length?all.map(f=>`<div class="tbl" style="cursor:pointer;padding:16px 20px;display:flex;align-items:center;gap:20px" onclick="abrirF('${f.id}')">
      <div style="flex:1"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span class="mono">${esc(f.numero_factura)}</span>${bdg(f.estado)}</div>
      <div style="font-weight:500;margin-bottom:4px">${esc(f.proveedor_nombre||'Desconocido')}</div>
      <div style="font-size:12px;color:var(--muted)">${esc(f.centro_operacion_nombre||'Sin CO')} · ${f.fecha_factura?'Fact: '+fdate(f.fecha_factura):''} ${f.limite_pago?'· Vence: '+fdate(f.limite_pago):''}</div></div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <div style="font-size:18px;font-weight:700">${fmt(f.valor_total||f.valor||0)}</div>
        ${f.archivo_pdf?`<button onclick="event.stopPropagation();verPdf('${f.id}')" class="btn btn-secondary btn-sm">📄 PDF</button>`:''}
        ${f.soporte_pago?`<button onclick="event.stopPropagation();verSoporte('${f.id}')" class="btn btn-secondary btn-sm">📎 Soporte</button>`:''}
      </div>
    </div>`).join(''):'<div class="empty">No hay facturas por pagar ✓</div>'}</div>`;
}

// ─── FACTURA DETALLE ─────────────────────────────────────────────────────────
async function abrirF(id){
  const f=await api('GET',`/facturas/${id}`);
  if(!S.areas?.length)S.areas=await api('GET','/areas');
  if(!S.cats?.length)S.cats=await api('GET','/categorias');
  const catsPref=f.proveedor_id?(await api('GET',`/proveedores/${f.proveedor_id}/categorias-preferidas`)||[]):[];
  const ei=EORD.indexOf(f.estado);
  const prog=EORD.map((e,i)=>{const d=i<=ei;return`<div style="display:flex;align-items:center"><div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:50%;border:2px solid var(--border);background:${d?'var(--accent)':'var(--surface2)'};flex-shrink:0"></div><span style="font-size:10px;color:${d?'var(--accent)':'var(--muted)'};margin-top:4px">${EM[e]?.l||e}</span></div>${i<EORD.length-1?`<div style="width:24px;height:2px;background:${d?'var(--accent)':'var(--border)'}"></div>`:''}</div>`}).join('');
  const acc=[];
  if(['recibida','revision'].includes(f.estado)){acc.push(`<button class="btn btn-success btn-sm" onclick="mAprobar('${id}')">✓ Aprobar</button>`);acc.push(`<button class="btn btn-danger btn-sm" onclick="mRechazar('${id}')">✗ Rechazar</button>`);}
  if(f.estado==='aprobada')acc.push(`<button class="btn btn-success btn-sm" onclick="acF('${id}','causar')">📥 Causar</button>`);
  const isTesorero=['admin','tesorero'].includes(S.usuario?.rol);
  const isAdmin=S.usuario?.rol==='admin';
  if(f.estado==='causada'&&isTesorero){
    if(!f.soporte_pago)acc.push(`<button class="btn btn-warning btn-sm" onclick="mSubirSoporte('${id}')">📤 Adjuntar soporte</button>`);
    if(f.soporte_pago)acc.push(`<button class="btn btn-secondary btn-sm" onclick="verSoporte('${id}')">📎 Ver soporte</button>`);
    acc.push(`<button class="btn btn-primary btn-sm" onclick="mPagar('${id}')">✓ Marcar pagada</button>`);
  }
  if(isAdmin)acc.push(`<button class="btn btn-danger btn-sm" onclick="delFactura('${id}','${esc(f.numero_factura)}')">🗑️ Eliminar</button>`);
  showM(`Factura ${f.numero_factura}`,`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Proveedor</div><div style="font-weight:600;margin-top:4px">${esc(f.proveedor_nombre||f.nombre_emisor||'—')}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">NIT Emisor</div><div style="font-weight:600;margin-top:4px">${esc(f.nit_emisor||f.proveedor_nit||'—')}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Valor total</div><div style="font-weight:700;font-size:18px;margin-top:4px">${fmt(f.valor_total||0)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">IVA</div><div style="font-weight:600;margin-top:4px">${fmt(f.valor_iva||0)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Fecha factura</div><div style="font-weight:500;margin-top:4px">${fdate(f.fecha_factura||f.recibida_en)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Estado</div><div style="margin-top:4px">${bdg(f.estado)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Centro de operación</div><div style="font-weight:600;margin-top:4px">${esc(f.centro_operacion_nombre||'—')}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Área</div><div style="font-weight:500;margin-top:4px">${esc(f.area_nombre||'—')}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Categoría</div><select id="fc-cat" style="margin-top:4px;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);width:100%" onchange="cambiarCat('${id}',this.value)"><option value="">— Seleccionar categoría —</option>${S.cats.sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(c=>`<option value="${c.id}" ${f.categoria_id===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}</select>${catsPref.length?`<div style="font-size:11px;color:var(--muted);margin-top:8px">💡 Más usadas para este proveedor:</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${catsPref.map(cp=>`<span onclick="cambiarCat('${id}','${cp.id}')" style="cursor:pointer;padding:4px 8px;background:var(--surface);border-radius:4px;font-size:12px;color:var(--text);border:1px solid var(--border)">${esc(cp.nombre)} (${cp.contador})</span>`).join('')}</div>`:''}</div>
      ${f.centro_costos?`<div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Centro de costos</div><div style="font-weight:600;margin-top:4px">${esc(f.centro_costos)}</div></div>`:''}
      ${f.referencia?`<div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Orden de compra</div><div style="font-weight:500;margin-top:4px">${esc(f.referencia)}</div></div>`:''}
      ${f.descripcion_gasto?`<div style="grid-column:1/-1;background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Descripción del gasto</div><div style="margin-top:4px">${esc(f.descripcion_gasto)}</div></div>`:''}
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Recibida</div><div style="font-weight:500;margin-top:4px">${fdate(f.recibida_en)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Límite DIAN</div><div style="font-weight:500;margin-top:4px;color:${f.dian_tacita?'var(--warning)':'inherit'}">${fdate(f.limite_dian)}${f.dian_tacita?' (tácita)':''}</div></div>
      ${f.limite_pago?`<div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Límite de pago</div><div style="font-weight:600;margin-top:4px;color:${new Date(f.limite_pago)<new Date()?'var(--danger)':'var(--success)'}">${fdate(f.limite_pago)} ${new Date(f.limite_pago)<new Date()?'(vencida)':''}</div></div>`:''}
      ${f.cufe?`<div style="grid-column:1/-1;background:var(--surface2);padding:10px 12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">CUFE</div><div style="font-family:monospace;font-size:11px;margin-top:4px;word-break:break-all">${esc(f.cufe)}</div></div>`:''}
      ${f.soporte_pago?`<div style="grid-column:1/-1;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--success);text-transform:uppercase;letter-spacing:.5px;font-weight:600">✓ Soporte de pago adjunto</div><div style="color:var(--muted);font-size:13px;margin-top:4px">${esc(f.soporte_pago_nombre||f.soporte_pago)}</div></div>`:''}
      ${f.pagada_en?`<div style="grid-column:1/-1;background:rgba(110,231,183,.1);border:1px solid rgba(110,231,183,.2);padding:12px;border-radius:8px"><div style="font-size:10px;color:#6EE7B7;text-transform:uppercase;letter-spacing:.5px;font-weight:600">✓ Pagada</div><div style="color:var(--muted);font-size:13px;margin-top:4px">${fdate(f.pagada_en)}</div></div>`:''}
    </div>
    ${f.motivo_rechazo?`<div style="background:rgba(248,113,113,.1);border-left:3px solid var(--danger);padding:12px;border-radius:0 8px 8px 0;margin-bottom:16px"><div style="font-size:11px;color:var(--danger);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Motivo de rechazo</div><div style="color:var(--danger);margin-top:4px">${esc(f.motivo_rechazo)}</div></div>`:''}
    <div style="margin-bottom:16px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Progreso del flujo</div><div style="display:flex;align-items:center;overflow-x:auto;padding-bottom:4px">${prog}</div></div>
    <div style="margin-bottom:16px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Historial</div>
    <div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
      ${(f.eventos||[]).map(ev=>`<div style="display:flex;gap:10px;font-size:13px;padding:8px;background:var(--surface2);border-radius:6px"><span style="color:var(--muted);white-space:nowrap">${fdate(ev.creado_en)}</span><span style="color:var(--accent)">${ev.tipo}</span><span style="color:var(--text);flex:1">${esc(ev.comentario||'')}${ev.usuario_nombre?` <em style="color:var(--muted)">— ${esc(ev.usuario_nombre)}</em>`:''}</span></div>`).join('')||'<div style="color:var(--muted);font-size:13px">Sin eventos</div>'}
    </div></div>
    <div class="modal-footer">${f.archivo_pdf?`<button onclick="verPdf('${id}')" class="btn btn-secondary btn-sm">📄 Ver PDF</button>`:''}<button class="btn btn-secondary btn-sm" onclick="closeM()">Cerrar</button>${acc.join('')}</div>`,640);
}

async function mAprobar(id){
  const f=await api('GET',`/facturas/${id}`);
  if(!S.centros)S.centros=await api('GET','/centros');
  const ao=S.areas.map(a=>`<option value="${a.id}" ${f.area_responsable_id===a.id?'selected':''}>${esc(a.nombre)}</option>`).join('');
  const co=S.centros.map(c=>`<option value="${c.id}" ${f.centro_operacion_id===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('');
  const ordenDelXml=f.orden_compra?`<div style="font-size:11px;color:var(--success);margin-top:4px">✓ Orden de compra detectada del XML: <strong>${esc(f.orden_compra)}</strong></div>`:'';
  showM('Información de aprobación',`
    <div style="margin-bottom:16px;padding:12px;background:rgba(79,142,247,.1);border-radius:8px;border:1px solid rgba(79,142,247,.2)">
      <div style="font-size:12px;color:var(--muted)">Factura</div>
      <div style="font-weight:700;font-size:16px">${esc(f.numero_factura)}</div>
      <div style="font-size:14px;margin-top:4px">${esc(f.proveedor_nombre||f.nombre_emisor||'—')}</div>
      <div style="font-size:20px;font-weight:700;color:var(--accent);margin-top:8px">${fmt(f.valor_total||0)}</div>
      ${ordenDelXml}
    </div>
    <div class="form-grid">
      <div class="field"><label>CENTRO DE OPERACIÓN *</label><select id="ap-centro"><option value="">— Seleccionar centro —</option>${co}</select></div>
      <div class="field"><label>ÁREA DE DESTINO</label><select id="ap-area"><option value="">— Seleccionar área —</option>${ao}</select></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>CENTRO DE COSTOS</label><input type="text" id="ap-cc" value="${esc(f.centro_costos||'')}" placeholder="Ej: CC-001"/></div>
      <div class="field"><label>ORDEN DE COMPRA / REFERENCIA</label><input type="text" id="ap-ref" value="${esc(f.orden_compra||f.referencia||'')}" placeholder="OC-2025-0042"/></div>
    </div>
    <div class="field"><label>DESCRIPCIÓN DEL GASTO</label><textarea id="ap-desc" rows="3" placeholder="Ej: Compra de teclado ergonomic para el area de sistemas...">${esc(f.descripcion_gasto||'')}</textarea></div>
    <div class="field"><label>COMENTARIO (Opcional)</label><textarea id="ap-com" rows="2" placeholder="Observaciones adicionales..."></textarea></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-success" onclick="doAprobar('${id}')">✓ Confirmar aprobación</button></div>
  `,560);
}

async function doAprobar(id){
  const centro_id=$('ap-centro')?.value;
  const area_id=$('ap-area')?.value;
  if(!centro_id){toast('Selecciona el centro de operación','error');return}
  const b={
    centro_operacion_id:centro_id,
    ...(area_id && {area_responsable_id:area_id}),
    centro_costos:$('ap-cc')?.value?.trim()||null,
    descripcion_gasto:$('ap-desc')?.value?.trim()||null,
    referencia:$('ap-ref')?.value?.trim()||null,
    comentario:$('ap-com')?.value?.trim()||null
  };
  try{
    await api('PATCH',`/facturas/${id}/aprobar`,b);
    closeM();
    toast('Factura aprobada','success');
    goTo(S.view);
  }catch(e){toast(e.message,'error')}
}

async function mRechazar(id){
  showM('Rechazar factura',`
    <div style="margin-bottom:16px;padding:12px;background:rgba(248,113,113,.1);border-radius:8px;border:1px solid rgba(248,113,113,.2)">
      <div style="font-size:12px;color:var(--muted)">¿Por qué rechazas esta factura?</div>
    </div>
    <div class="field"><label>MOTIVO DEL RECHAZO *</label><textarea id="rechazo-motivo" rows="4" placeholder="Ej: Factura duplicada, valores incorrectos, falta orden de compra..."></textarea></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-danger" onclick="doRechazar('${id}')">✗ Confirmar rechazo</button></div>
  `,400);
}

async function doRechazar(id){
  const motivo=$('rechazo-motivo')?.value?.trim();
  if(!motivo){toast('Ingresa el motivo del rechazo','error');return}
  try{
    await api('PATCH',`/facturas/${id}/rechazar`,{motivo});
    closeM();
    toast('Factura rechazada','success');
    goTo(S.view);
  }catch(e){toast(e.message,'error')}
}

async function acF(id,a){
  let b={};
  try{await api('PATCH',`/facturas/${id}/${a}`,b);closeM();toast('Acción ejecutada','success');goTo(S.view)}catch(e){toast(e.message,'error')}
}

// ─── NUEVA FACTURA ───────────────────────────────────────────────────────────
async function mNuevaF(){
  if(!S.areas?.length)S.areas=await api('GET','/areas');
  if(!S.cats?.length)S.cats=await api('GET','/categorias');
  const ao=S.areas.map(a=>`<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
  const co=S.cats.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  window.gF=async()=>{
    const n=$('fn-num').value.trim();if(!n){toast('Número de factura requerido','error');return}
    const v=parseFloat($('fn-val').value)||0,iv=parseFloat($('fn-iva').value)||0;
    const fd=new FormData();
    fd.append('numero_factura',n);fd.append('valor',v);fd.append('valor_iva',iv);fd.append('valor_total',v+iv);
    if($('fn-cat').value)fd.append('categoria_id',$('fn-cat').value);
    if($('fn-area').value)fd.append('area_responsable_id',$('fn-area').value);
    if($('fn-lp').value)fd.append('limite_pago',$('fn-lp').value);
    if($('fn-ob').value)fd.append('observaciones',$('fn-ob').value);
    if($('fn-pdf').files[0])fd.append('pdf',$('fn-pdf').files[0]);
    try{await api('POST','/facturas',fd,true);closeM();toast('Factura creada','success');goTo('facturas')}catch(e){toast(e.message,'error')}
  };
  showM('Nueva factura',`
    <div class="field"><label>NÚMERO DE FACTURA *</label><input id="fn-num" placeholder="FV-2025-0001"/></div>
    <div class="form-grid">
      <div class="field"><label>VALOR BASE</label><input id="fn-val" type="number" placeholder="0"/></div>
      <div class="field"><label>IVA</label><input id="fn-iva" type="number" placeholder="0"/></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>CATEGORÍA</label><select id="fn-cat"><option value="">— Seleccionar —</option>${co}</select></div>
      <div class="field"><label>ÁREA</label><select id="fn-area"><option value="">— Seleccionar —</option>${ao}</select></div>
    </div>
    <div class="field"><label>LÍMITE DE PAGO</label><input id="fn-lp" type="date"/></div>
    <div class="field"><label>OBSERVACIONES</label><textarea id="fn-ob" rows="2" placeholder="Notas adicionales..."></textarea></div>
    <div class="field"><label>ARCHIVO PDF</label><input id="fn-pdf" type="file" accept=".pdf" style="color:var(--text)"/></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="gF()">Crear factura</button></div>`,560);
}

// ─── SOPORTE DE PAGO ────────────────────────────────────────────────────────
function mSubirSoporte(id){
  showM('Adjuntar soporte de pago',`
    <div style="padding:8px 0">
      <p style="color:var(--muted);margin-bottom:16px">Adjunta el comprobante de pago (transferencia, screenshot, etc.)</p>
      <div class="field"><label>ARCHIVO (PDF, PNG, JPG)</label><input type="file" id="sp-archivo" accept=".pdf,.png,.jpg,.jpeg,.gif" style="color:var(--text)"/></div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">Formatos: PDF, PNG, JPG, GIF. Máximo 10MB.</div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="doSubirSoporte('${id}')">Subir archivo</button></div>
  `,400);
}

async function doSubirSoporte(id){
  const fileInput=$('sp-archivo');
  if(!fileInput?.files?.length){toast('Selecciona un archivo','error');return}
  const file=fileInput.files[0];
  const fd=new FormData();
  fd.append('soporte',file);
  try{
    await api('POST',`/facturas/${id}/soporte-pago`,fd,true);
    closeM();
    toast('Soporte adjuntado','success');
    abrirF(id);
  }catch(e){toast(e.message,'error')}
}

function verSoporte(id){window.open(`/api/facturas/${id}/soporte-pago`,'_blank')}

function mPagar(id){
  showM('Confirmar pago',`
    <div style="padding:8px 0;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">💰</div>
      <p style="color:var(--muted);margin-bottom:8px">¿Confirmar que esta factura ha sido pagada?</p>
      <p style="font-size:13px;color:var(--muted)">Esta acción registrará la fecha de pago y moverá la factura a estado "Pagada".</p>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="acF('${id}','pagar')">✓ Confirmar pago</button></div>
  `,380);
}

// ─── CATEGORÍAS ─────────────────────────────────────────────────────────────
let catExp=null;
async function rCats(){
  S.areas=await api('GET','/areas');S.cats=await api('GET','/categorias');
  $('content').innerHTML=`<div class="page-header"><div><div class="page-title">Categorías</div><div class="page-sub">Tipos de compra y flujo de aprobación</div></div><button class="btn btn-primary" onclick="mCat()">+ Nueva</button></div><div id="clist"></div>`;
  renderClist();
}
function renderClist(){
  const el=$('clist');if(!el)return;
  if(!S.cats.length){el.innerHTML='<div class="empty">No hay categorías</div>';return}
  el.innerHTML=S.cats.map(cat=>{const an=(cat.areas||[]).map(a=>a.nombre);const ex=catExp===cat.id;
    return`<div class="tbl" style="margin-bottom:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:14px;padding:14px 20px;cursor:pointer" onclick="togCat('${cat.id}')">
        <span style="width:12px;height:12px;border-radius:50%;background:${cat.color};flex-shrink:0"></span>
        <div style="flex:1"><div style="font-weight:600">${esc(cat.nombre)}</div><div style="font-size:12px;color:var(--muted)">${esc(cat.descripcion||'')}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${an.map(n=>`<span class="tag">${esc(n)}</span>`).join('')}</div>
        <div style="display:flex;gap:6px" onclick="event.stopPropagation()"><button class="btn btn-secondary btn-sm" onclick="mCat('${cat.id}')">✏️</button><button class="btn btn-danger btn-sm" onclick="delCat('${cat.id}')">🗑️</button></div>
        <span style="color:var(--muted)">${ex?'▲':'▼'}</span>
      </div>
      ${ex?`<div style="padding:16px 20px;border-top:1px solid var(--border)">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Flujo de aprobación</div>
        <div class="progress-line">${PASOS.map((p,i)=>{const a=(cat.pasos||[]).includes(p.id);return`<div class="fs${a?' active':''}"><div class="fs-l">${p.l}</div><div class="fs-d">${p.d}</div></div>${i<PASOS.length-1?`<div class="fc2${a?' active':''}"></div>`:''}`}).join('')}</div>
      </div>`:''}
    </div>`}).join('');
}
function togCat(id){catExp=catExp===id?null:id;renderClist()}
async function mCat(id){
  let cat=null;
  if(id)cat=S.cats.find(c=>c.id===id)||await api('GET',`/categorias/${id}`);
  const form=cat?{nombre:cat.nombre,desc:cat.descripcion||'',color:cat.color||'#3B82F6',pasos:[...(cat.pasos||[])]}:{nombre:'',desc:'',color:'#3B82F6',pasos:['recepcion','revision','aprobacion','causacion']};
  function rr(){
    const cp=$('cp');if(cp)cp.innerHTML=COLS.map(c=>`<div class="cd${form.color===c?' sel':''}" style="background:${c};outline-color:${c}" onclick="sCo('${c}')"></div>`).join('');
    const cpa=$('cpa');if(cpa)cpa.innerHTML=PASOS.map(p=>{const s=form.pasos.includes(p.id);const f=p.id==='recepcion';return`<div class="ci${s&&!f?' sel':''}" style="${f?'opacity:.5':''}" ${f?'':'onclick="tP(\''+p.id+'\')"'}><div class="cb${s&&!f?' sel':''}">${s&&!f?'✓':''}</div><div style="flex:1"><span style="font-size:13px">${p.l}</span><span style="font-size:11px;color:var(--muted);margin-left:8px">${p.d}</span></div>${f?'<span class="tag">obligatorio</span>':''}</div>`}).join('');
  }
  window.sCo=c=>{form.color=c;rr()};
  window.tP=pid=>{form.pasos=form.pasos.includes(pid)?form.pasos.filter(x=>x!==pid):[...form.pasos,pid];rr()};
  window.saveCat=async()=>{const n=$('cn').value.trim();if(!n){toast('Nombre requerido','error');return}form.nombre=n;form.desc=$('cd').value.trim();try{if(id)await api('PUT',`/categorias/${id}`,{nombre:form.nombre,descripcion:form.desc,color:form.color,pasos:form.pasos});else await api('POST','/categorias',{nombre:form.nombre,descripcion:form.desc,color:form.color,pasos:form.pasos});closeM();toast('Categoría guardada','success');await rCats()}catch(e){toast(e.message,'error')}};
  showM(id?'Editar categoría':'Nueva categoría',`
    <div class="field"><label>NOMBRE *</label><input id="cn" value="${esc(form.nombre)}" placeholder="Ej: Tecnología"/></div>
    <div class="field"><label>DESCRIPCIÓN</label><textarea id="cd" rows="2">${esc(form.desc)}</textarea></div>
    <div style="margin-bottom:14px"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600;display:block;margin-bottom:8px">COLOR</label><div class="cp" id="cp"></div></div>
    <div style="margin-bottom:14px"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600;display:block;margin-bottom:8px">PASOS DEL FLUJO</label><div id="cpa"></div></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="saveCat()">Guardar</button></div>`,560);
  rr();
}
async function delCat(id){if(!confirm('¿Desactivar esta categoría?'))return;try{await api('DELETE',`/categorias/${id}`);toast('Categoría desactivada','success');await rCats()}catch(e){toast(e.message,'error')}}

// ─── ÁREAS ──────────────────────────────────────────────────────────────────
async function rAreas(){
  S.areas=await api('GET','/areas');
  const isAdmin=S.usuario?.rol==='admin';
  $('content').innerHTML=`<div class="page-header"><div><div class="page-title">Áreas</div><div class="page-sub">Unidades organizativas</div></div><button class="btn btn-primary" onclick="mArea()">+ Nueva área</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px">
      ${S.areas.map(a=>`<div class="tbl" style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div style="font-weight:700;font-size:15px">${esc(a.nombre)}</div>
          <span class="badge ${a.activo?'b-aprobada':'b-rechazada'}" style="font-size:10px">${a.activo?'Activa':'Inactiva'}</span>
        </div>
        <div style="font-size:13px;color:var(--muted)">Jefe: ${esc(a.jefe_nombre||'—')}</div>
        ${a.email?`<div style="font-size:12px;color:var(--muted);margin-top:4px">${esc(a.email)}</div>`:''}
        ${isAdmin?`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="mArea('${a.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="delArea('${a.id}','${esc(a.nombre)}')">🗑️</button>
        </div>`:''}
      </div>`).join('')}
    </div>`;
}

async function mArea(id){
  let area=null;
  if(id){
    area=S.areas.find(a=>a.id===id);
    if(!area)return;
  }
  if(!S.usuariosList){
    try{const u=await api('GET','/usuarios/simple');S.usuariosList=u;}catch(e){S.usuariosList=[]}
  }
  window.saveArea=async()=>{
    const n=$('an')?.value?.trim();
    if(!n){toast('Nombre requerido','error');return}
    try{
      if(id){
        await api('PUT',`/areas/${id}`,{
          nombre:n,
          jefe_id:$('aj')?.value||null,
          email:$('ae')?.value?.trim()||null,
          activo:$('aa-activo')?.checked??true
        });
      }else{
        await api('POST','/areas',{
          nombre:n,
          jefe_id:$('aj')?.value||null,
          email:$('ae')?.value?.trim()||null
        });
      }
      closeM();
      toast(id?'Área actualizada':'Área creada','success');
      rAreas();
    }catch(e){toast(e.message,'error')}
  };
  const opts=S.usuariosList.map(u=>`<option value="${u.id}" ${area?.jefe_id===u.id?'selected':''}>${esc(u.nombre)}</option>`).join('');
  showM(id?'Editar área':'Nueva área',`
    <div class="field"><label>NOMBRE *</label><input id="an" value="${esc(area?.nombre||'')}" placeholder="Ej: Sistemas"/></div>
    <div class="field"><label>JEFE</label><select id="aj"><option value="">— Sin asignar —</option>${opts}</select></div>
    <div class="field"><label>CORREO</label><input id="ae" type="email" value="${esc(area?.email||'')}" placeholder="area@tu-dominio.com"/></div>
    ${id?`<div class="field"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="aa-activo" ${area?.ativo!==false?'checked':''}/> Área activa</label></div>`:''}
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="saveArea()">Guardar</button></div>
  `,400);
}

async function delArea(id,nombre){
  if(!confirm(`¿Eliminar el área "${nombre}"?`))return;
  try{
    await api('DELETE',`/areas/${id}`);
    toast('Área eliminada','success');
    rAreas();
  }catch(e){toast(e.message,'error')}
}

// ─── USUARIOS ────────────────────────────────────────────────────────────────
async function rUsers(){
  const [us, areas, cats] = await Promise.all([
    api('GET','/usuarios'),
    api('GET','/areas'),
    api('GET','/categorias')
  ]);
  S.areas=areas;
  S.cats=cats;
  const isAdmin=S.usuario?.rol==='admin';
  $('content').innerHTML=`<div class="page-header"><div><div class="page-title">Usuarios</div><div class="page-sub">Gestión de accesos y permisos</div></div><button class="btn btn-primary" onclick="mUser()">+ Nuevo</button></div>
    <div class="tbl">
      <table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Área</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
      <tbody>${us.map(u=>`<tr>
        <td style="font-weight:500">${esc(u.nombre)}</td>
        <td style="color:var(--muted)">${esc(u.email)}</td>
        <td><span class="tag">${u.rol}</span></td>
        <td style="color:var(--muted)">${esc(u.area_nombre||'—')}</td>
        <td style="color:var(--muted)">${u.ultimo_acceso?fdate(u.ultimo_acceso):'Nunca'}</td>
        <td><span class="badge ${u.activo?'b-aprobada':'b-rechazada'}">${u.activo?'Activo':'Inactivo'}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="mUser('${u.id}')">✏️</button>
          ${isAdmin&&u.id!==S.usuario?.id?(u.activo?
            `<button class="btn btn-warning btn-sm" onclick="toggleUser('${u.id}',false)" title="Inactivar">⛔</button>`:
            `<button class="btn btn-success btn-sm" onclick="toggleUser('${u.id}',true)" title="Activar">✅</button>`):''}
          ${isAdmin&&u.id!==S.usuario?.id?`<button class="btn btn-danger btn-sm" onclick="delUser('${u.id}','${esc(u.nombre)}')" title="Eliminar">🗑️</button>`:''}
        </td>
      </tr>`).join('')}</tbody></table>
    </div>`;
}

async function toggleUser(id,activo){
  try{
    await api('PUT',`/usuarios/${id}`,{activo});
    toast(activo?'Usuario activado':'Usuario inactivado','success');
    rUsers();
  }catch(e){toast(e.message,'error')}
}

async function delUser(id,nombre){
  if(!confirm(`¿Eliminar definitivamente al usuario "${nombre}"?`))return;
  try{
    await api('DELETE',`/usuarios/${id}`);
    toast('Usuario eliminado','success');
    rUsers();
  }catch(e){toast(e.message,'error')}
}

async function delFactura(id,numero){
  if(!confirm(`¿Eliminar la factura "${numero}"? Esta acción no se puede deshacer.`))return;
  try{
    await api('DELETE',`/facturas/${id}`);
    toast('Factura eliminada','success');
    if(S.view==='facturas')rFacturas();
    closeM();
  }catch(e){toast(e.message,'error')}
}

async function mUser(id){
  let usr=null;
  if(id){
    const us=await api('GET','/usuarios');
    usr=us.find(u=>u.id===id);
    if(!usr)return;
  }
  if(!S.cats)S.cats=await api('GET','/categorias/todas');
  const ao=S.areas.map(a=>`<option value="${a.id}" ${usr?.area_id===a.id?'selected':''}>${esc(a.nombre)}</option>`).join('');
  const catsIds=usr?.categoria_ids||[];
  const co=S.cats.map(c=>`<div class="cat-item" onclick="togCatU('${c.id}')">
    <div class="cat-check" id="cc-${c.id}">${catsIds.includes(c.id)?'✓':''}</div>
    <div class="cat-dot" style="background:${c.color}"></div>
    <div class="cat-name">${esc(c.nombre)}</div>
    <input type="checkbox" class="ucat" value="${c.id}" ${catsIds.includes(c.id)?'checked':''} style="display:none"/>
  </div>`).join('');
  
  window.saveUser=async()=>{
    const catIds=[...document.querySelectorAll('.ucat:checked')].map(el=>el.value);
    try{
      if(id){
        await api('PUT',`/usuarios/${id}`,{
          nombre:$('un')?.value?.trim(),
          email:$('ue')?.value?.trim(),
          rol:$('ur')?.value,
          area_id:$('ua')?.value||null,
          activo:$('ua-activo')?.checked??true,
          password:$('up')?.value||null
        });
        await api('PUT',`/categorias/usuario/${id}`,{categoria_ids:catIds});
      }else{
        await api('POST','/usuarios',{
          nombre:$('un')?.value?.trim(),
          email:$('ue')?.value?.trim(),
          password:$('up')?.value,
          rol:$('ur')?.value,
          area_id:$('ua')?.value||null
        });
      }
      closeM();
      toast('Usuario guardado','success');
      await rUsers();
    }catch(e){toast(e.message,'error')}
  };
  
  showM(id?'Editar usuario':'Nuevo usuario',`
    <div class="field"><label>NOMBRE *</label><input id="un" value="${esc(usr?.nombre||'')}" placeholder="Nombre completo"/></div>
    <div class="field"><label>EMAIL *</label><input id="ue" type="email" value="${esc(usr?.email||'')}" placeholder="usuario@tu-dominio.com"/></div>
    <div class="field"><label>CONTRASEÑA ${id?'(dejar vacío para no cambiar)':''}</label><input id="up" type="password" placeholder="••••••••"/></div>
    <div class="form-grid">
      <div class="field"><label>ROL</label><select id="ur"><option value="comprador" ${usr?.rol==='comprador'?'selected':''}>Comprador</option><option value="contador" ${usr?.rol==='contador'?'selected':''}>Contador</option><option value="tesorero" ${usr?.rol==='tesorero'?'selected':''}>Tesorero</option><option value="auditor" ${usr?.rol==='auditor'?'selected':''}>Auditor</option><option value="admin" ${usr?.rol==='admin'?'selected':''}>Admin</option></select></div>
      <div class="field"><label>ÁREA</label><select id="ua"><option value="">— Sin área —</option>${ao}</select></div>
    </div>
    ${id?`<div class="field"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="ua-activo" ${usr?.activo!==false?'checked':''}/> Usuario activo</label></div>`:''}
    <div style="margin-top:16px"><div style="font-size:11px;text-transform:uppercase;color:var(--muted);margin-bottom:10px">CATEGORÍAS PERMITIDAS</div>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto">${co}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">Selecciona las categorías que puede ver. Sin selección: ve según su área.</div></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="saveUser()">Guardar</button></div>
  `,560);
}

window.togCatU=function(id){
  const cb=$('cc-'+id)?.parentElement.querySelector('.ucat');
  if(!cb)return;
  cb.checked=!cb.checked;
  const el=$('cc-'+id);
  if(el)el.textContent=cb.checked?'✓':'';
};

// ─── BACKUP ─────────────────────────────────────────────────────────────────
async function rBackup(){
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Backup y Restauración</div><div class="page-sub">Exporta o restaura toda la información del sistema</div></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;">
        <div style="font-weight:700;font-size:16px;margin-bottom:6px;">📦 Exportar Backup</div>
        <p style="color:var(--muted);font-size:13px;margin-bottom:20px;line-height:1.6;">
          Descarga un archivo <strong style="color:var(--text)">ZIP</strong> con la información del sistema.
          Incluye un <code style="color:var(--accent)">backup.json</code> para restaurar.
        </p>
        <div style="background:var(--surface2);border-radius:10px;padding:16px;margin-bottom:20px;font-size:13px;">
          <div style="font-weight:600;margin-bottom:10px;">Opciones de backup:</div>
          <div style="display:flex;flex-direction:column;gap:6px;color:var(--muted);">
            <span>✓ Solo configuración (∼20KB): Facturas, categorías, usuarios, áreas, configuración</span>
            <span>✓ Completo (∼variable): Lo anterior + archivos subidos (PDFs, facturas, adjuntos)</span>
          </div>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-secondary" id="btn-descargar-backup-config" onclick="descargarBackup('config')" style="flex:1;justify-content:center;padding:11px;">⚙️ Solo Config</button>
          <button class="btn btn-primary" id="btn-descargar-backup" onclick="descargarBackup('completo')" style="flex:1;justify-content:center;padding:11px;">💾 Completo</button>
        </div>
        <div id="backup-ok" style="display:none;margin-top:14px;padding:10px 14px;background:rgba(79,190,150,0.1);border:1px solid rgba(79,190,150,0.3);border-radius:9px;font-size:13px;color:var(--success);">✓ Backup generado y descargado correctamente.</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;">
        <div style="font-weight:700;font-size:16px;margin-bottom:6px;">♻️ Restaurar Backup</div>
        <div style="background:rgba(231,76,60,0.06);border:1px solid rgba(231,76,60,0.2);border-radius:10px;padding:14px;margin-bottom:20px;font-size:12px;color:var(--danger);">
          ⚠ Los datos actuales serán reemplazados por los del backup. Tu usuario administrador actual no será afectado.
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
            <span>📁 Backups en el Servidor</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-primary btn-sm" onclick="generarBackupServidor()">➕ Generar</button>
              <button class="btn btn-secondary btn-sm" onclick="cargarListaBackups()">🔄 Actualizar</button>
            </div>
          </div>
          <div id="lista-backups-loading" style="text-align:center;padding:16px;color:var(--muted);font-size:13px;">Cargando...</div>
          <div id="lista-backups-none" style="display:none;text-align:center;padding:16px;color:var(--muted);font-size:12px;background:var(--surface2);border-radius:9px;">🕐 No hay backups disponibles</div>
          <div id="lista-backups-body" style="display:none;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;"></div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:20px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:10px;">📂 Restaurar desde Archivo</div>
          <p style="color:var(--muted);font-size:12px;margin-bottom:14px;line-height:1.6;">
            Sube un <strong style="color:var(--text)">.zip</strong> generado por DocFlow.
          </p>
          <div id="restore-drop" onclick="document.getElementById('restore-file').click()"
            style="border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;cursor:pointer;margin-bottom:12px;transition:border-color 0.2s;"
            onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'"
            ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
            ondragleave="this.style.borderColor='var(--border)'"
            ondrop="handleRestoreDrop(event)">
            <div style="font-size:28px;margin-bottom:6px;">📂</div>
            <div style="font-size:13px;color:var(--muted);">Clic o arrastra tu archivo <strong style="color:var(--text)">.zip</strong></div>
            <div id="restore-filename" style="margin-top:6px;font-size:12px;color:var(--accent);display:none;"></div>
          </div>
          <input type="file" id="restore-file" accept=".zip" style="display:none"/>
          <button class="btn btn-danger" id="btn-restaurar" onclick="restaurarBackup()" disabled style="width:100%;justify-content:center;padding:11px;opacity:0.5;">
            ♻️ Restaurar desde Archivo
          </button>
        </div>
        <div id="restore-ok" style="display:none;margin-top:14px;padding:10px 14px;background:rgba(79,190,150,0.1);border:1px solid rgba(79,190,150,0.3);border-radius:9px;font-size:13px;color:var(--success);"></div>
        <div id="restore-err" style="display:none;margin-top:14px;padding:10px 14px;background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3);border-radius:9px;font-size:13px;color:var(--danger);"></div>
      </div>
    </div>`;
  initBackupListeners();
  cargarListaBackups();
}

let _backupListenerInit=false;
let restoreFile=null;

function initBackupListeners(){
  if(_backupListenerInit)return;
  _backupListenerInit=true;
  const inp=document.getElementById('restore-file');
  if(inp){
    inp.addEventListener('change',function(){
      restoreFile=this.files[0];
      document.getElementById('restore-filename').textContent='📄 '+restoreFile.name;
      document.getElementById('restore-filename').style.display='block';
      document.getElementById('btn-restaurar').disabled=false;
      document.getElementById('btn-restaurar').style.opacity='1';
      document.getElementById('restore-ok').style.display='none';
      document.getElementById('restore-err').style.display='none';
    });
  }
}

function handleRestoreDrop(e){
  e.preventDefault();
  document.getElementById('restore-drop').style.borderColor='var(--border)';
  const file=e.dataTransfer.files[0];
  if(file&&file.name.endsWith('.zip')){
    restoreFile=file;
    document.getElementById('restore-filename').textContent='📄 '+restoreFile.name;
    document.getElementById('restore-filename').style.display='block';
    document.getElementById('btn-restaurar').disabled=false;
    document.getElementById('btn-restaurar').style.opacity='1';
  }
}

async function descargarBackup(tipo='completo'){
  const btn=tipo==='config'?document.getElementById('btn-descargar-backup-config'):document.getElementById('btn-descargar-backup');
  const label=tipo==='config'?'⚙️ Solo Config':'💾 Completo';
  btn.disabled=true;btn.textContent='Verificando...';
  
  const token=localStorage.getItem('vd_t');
  
  // Verificar conexión primero
  try{
    await fetch('/api/backup?action=generate&tipo=config',{headers:{Authorization:`Bearer ${token}`}});
  }catch(e){
    btn.disabled=false;btn.textContent=label;
    toast('Sin conexión al servidor','error');
    return;
  }
  
  btn.textContent='Generando...';
  const progresoEl=document.getElementById('mroot');
  progresoEl.innerHTML=`<div class="modal-overlay open">
    <div class="modal" style="max-width:520px">
      <div style="font-family:var(--font-head);font-size:18px;font-weight:700;margin-bottom:16px">
        ${tipo==='config'?'⚙️ Backup de Configuración':'💾 Backup Completo'}
      </div>
      <div id="backup-progress-msg" style="font-size:14px;color:var(--muted);margin-bottom:12px">Iniciando...</div>
      <div style="background:var(--surface2);border-radius:6px;height:10px;overflow:hidden;margin-bottom:16px">
        <div id="backup-progress-bar" style="background:var(--accent);height:100%;width:0%;transition:width .5s"></div>
      </div>
      <div id="backup-terminal" style="background:#1a1a1a;color:#00ff00;font-family:monospace;font-size:11px;padding:12px;border-radius:6px;height:120px;overflow-y:auto;line-height:1.6;margin-bottom:16px">
        <div style="opacity:0.7">[...] Iniciando backup...</div>
      </div>
      <div style="display:flex;justify-content:center">
        <button class="btn btn-secondary" onclick="window.cancelarBackupGen()">Cancelar</button>
      </div>
    </div>
  </div>`;
  
  let cancelled=false;
  let pollInterval=null;
  
  window.cancelarBackupGen=async function(){
      cancelled=true;
      if(pollInterval)clearInterval(pollInterval);
      try{await fetch('/api/backup/cancelar',{method:'POST',headers:{Authorization:'Bearer '+token}})}catch(_){}
      closeM();
      btn.disabled=false;
      btn.textContent=label;
    };
  
  try{
    // Paso 1: Generar backup
    const url=tipo==='config'?'/api/backup?action=generate&tipo=config&_='+Date.now():'/api/backup?action=generate&tipo=completo&_='+Date.now();
    document.getElementById('backup-terminal').innerHTML+='<div>[INFO] URL: '+url+'</div>';
    document.getElementById('backup-terminal').innerHTML+='<div>[INFO] Tipo: '+(tipo==='completo'?'COMPLETO (puede tardar)' : 'CONFIG (rápido)')+'</div>';
    document.getElementById('backup-terminal').innerHTML+='<div>[INFO] Token: '+(token?'presente':'FALTA')+'</div>';
    let resp;
    try{
      const startTime = Date.now();
      resp=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
      const elapsed = Date.now() - startTime;
      document.getElementById('backup-terminal').innerHTML+='<div>[INFO] Tiempo: '+elapsed+'ms, Status: '+resp.status+'</div>';
    }catch(e){
      document.getElementById('backup-terminal').innerHTML+='<div style="color:red">[ERROR] Fetch falló: '+e.name+' - '+e.message+'</div>';
      throw e;
    }
    
    if(!resp.ok){
      const errData=await resp.json().catch(()=>({}));
      document.getElementById('backup-terminal').innerHTML+='<div style="color:red">[ERROR] '+ (errData.error||'Error '+resp.status) +'</div>';
      throw new Error(errData.error||'Error generando');
    }
    
    const data=await resp.json();
    if(cancelled)return;
    
    document.getElementById('backup-progress-bar').style.width='100%';
    document.getElementById('backup-progress-msg').textContent='Completado! Descargando...';
    document.getElementById('backup-progress-msg').style.color='var(--success)';
    document.getElementById('backup-terminal').innerHTML+='<div style="color:#00ff00;margin-top:8px">[OK] Backup completado</div>';
    
    // Paso 2: Descargar
    setTimeout(function(){
      document.getElementById('backup-terminal').innerHTML+='<div>[DESCARGANDO] Descargando archivo...</div>';
      (async function(){
        try{
        const dlUrl=`/api/backup?action=download&filename=${encodeURIComponent(data.filename)}`;
        const dlResp=await fetch(dlUrl,{headers:{Authorization:`Bearer ${token}`}});
        if(!dlResp.ok)throw new Error('Error descargando');
        
        const blob=await dlResp.blob();
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=data.filename;a.click();
        URL.revokeObjectURL(a.href);
        
        document.getElementById('backup-terminal').innerHTML+='<div style="color:#00ff00">[OK] Descarga completada!</div>';
        setTimeout(function(){
          closeM();
          toast('Backup descargado','success');
          cargarListaBackups();
        },1000);
      }catch(e){
        document.getElementById('backup-terminal').innerHTML+='<div style="color:red">[X] Error: '+e.message+'</div>';
        closeM();
        toast(e.message,'error');
      }
      })();
      btn.disabled=false;btn.textContent=label;
    },500);
    
    // Polling para progreso mientras genera
    pollInterval=setInterval(async()=>{
      try{
        const p=await fetch('/api/backup/progreso',{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
        if(p.stage && p.stage!=='done'){
          const pct=Math.round((p.current/p.total)*100)||0;
          document.getElementById('backup-progress-bar').style.width=pct+'%';
          document.getElementById('backup-progress-msg').textContent=p.message||'Procesando...';
          // Agregar al terminal
          const term=document.getElementById('backup-terminal');
          if(term && p.message){
            term.innerHTML+=`<div>→ ${p.message}</div>`;
            term.scrollTop=term.scrollHeight;
          }
        }
      }catch(_){}
    },800);
    
  }catch(e){
    if(cancelled)return;
    document.getElementById('backup-terminal').innerHTML+='<div style="color:red">[ERROR] '+e.message+'</div>';
    document.getElementById('backup-progress-msg').textContent='Error: '+e.message;
    document.getElementById('backup-progress-msg').style.color='var(--danger)';
    btn.disabled=false;btn.textContent=label;
    btn.onclick=function(){closeM()};
    btn.textContent='Cerrar';
  }
}

async function cargarListaBackups(){
  const loading=document.getElementById('lista-backups-loading');
  const none=document.getElementById('lista-backups-none');
  const body=document.getElementById('lista-backups-body');
  loading.style.display='block';none.style.display='none';body.style.display='none';
  try{
    const lista=await api('GET','/backup/lista');
    loading.style.display='none';
    if(!lista.length){none.style.display='block';return}
    body.style.display='flex';
    body.innerHTML=lista.map(b=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface2);border-radius:8px;font-size:13px;">
        <div>
          <div style="font-weight:500">${esc(b.nombre)}</div>
          <div style="color:var(--muted);font-size:11px">${(b.tamano/1024/1024).toFixed(2)} MB — ${fdate(b.fecha)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="descargarBackupLocal('${esc(b.nombre)}')">⬇</button>
          <button class="btn btn-danger btn-sm" onclick="restaurarBackupLocal('${esc(b.nombre)}')">♻️</button>
          <button class="btn btn-secondary btn-sm" onclick="eliminarBackup('${esc(b.nombre)}')">🗑️</button>
        </div>
      </div>`).join('');
  }catch(e){
    loading.style.display='none';
    none.style.display='block';none.textContent='Error: '+e.message;
  }
}

async function descargarBackupLocal(n){
  try{
    const token=localStorage.getItem('vd_t');
    const resp=await fetch('/api/backup/descargar/'+encodeURIComponent(n),{headers:{Authorization:`Bearer ${token}`}});
    if(!resp.ok)throw new Error('Error descargando');
    const blob=await resp.blob();
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=n;a.click();
    URL.revokeObjectURL(a.href);
  }catch(e){toast(e.message,'error')}
}

async function restaurarBackupLocal(n){
  if(!confirm('¿Restaurar el backup "'+n+'"?\n\nLos datos actuales serán reemplazados. Tu sesión no se verá afectada.'))return;
  const ok=document.getElementById('restore-ok');
  const err=document.getElementById('restore-err');
  ok.style.display='none';err.style.display='none';
  try{
    const token=localStorage.getItem('vd_t');
    const resp=await fetch('/api/backup/restore/local/'+encodeURIComponent(n),{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({})
    });
    const j=await resp.json();
    if(!resp.ok)throw new Error(j.error||'Error');
    ok.textContent='✓ Restauración completada correctamente';
    ok.style.display='block';
    setTimeout(()=>{ok.style.display='none'},5000);
  }catch(e){
    err.textContent='Error: '+e.message;
    err.style.display='block';
  }
}

async function restaurarBackup(){
  if(!restoreFile)return;
  const archivoARestaurar=restoreFile;
  const ok=document.getElementById('restore-ok');
  const err=document.getElementById('restore-err');
  ok.style.display='none';err.style.display='none';
  if(!confirm('¿Restaurar el backup "'+archivoARestaurar.name+'"?\n\nLos datos actuales serán reemplazados.'))return;
  try{
    const token=localStorage.getItem('vd_t');
    const form=new FormData();
    form.append('backup',archivoARestaurar);
    const resp=await fetch('/api/backup/restore',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
    const j=await resp.json();
    if(!resp.ok)throw new Error(j.error||'Error');
    ok.textContent='✓ Restauración completada correctamente';
    ok.style.display='block';
    restoreFile=null;
    document.getElementById('restore-file').value='';
    document.getElementById('restore-filename').style.display='none';
    document.getElementById('btn-restaurar').disabled=true;
    document.getElementById('btn-restaurar').style.opacity='0.5';
    await cargarListaBackups();
  }catch(e){
    err.textContent='Error: '+e.message;
    err.style.display='block';
  }
}

async function eliminarBackup(n){if(!confirm('¿Eliminar este backup?'))return;try{await api('DELETE',`/backup/${n}`);toast('Backup eliminado','success');await cargarListaBackups()}catch(e){toast(e.message,'error')}}

// ─── CONFIGURACIÓN ─────────────────────────────────────────────────────────
let cfgTabs='imap';
async function rConfig(){
  const cfg=await api('GET','/configuracion');
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Configuración</div><div class="page-sub">Parámetros del sistema</div></div></div>
    
    <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap">
      <button class="fb${cfgTabs==='general'?' active':''}" onclick="cfgTabs='general';rConfig()">🏢 General</button>
      <button class="fb${cfgTabs==='imap'?' active':''}" onclick="cfgTabs='imap';rConfig()">📧 IMAP</button>
      <button class="fb${cfgTabs==='smtp'?' active':''}" onclick="cfgTabs='smtp';rConfig()">📤 SMTP</button>
      <button class="fb${cfgTabs==='horas'?' active':''}" onclick="cfgTabs='horas';rConfig()">⏱️ Tiempos</button>
      <button class="fb${cfgTabs==='areas'?' active':''}" onclick="cfgTabs='areas';rConfig()">🏠 Áreas</button>
      <button class="fb${cfgTabs==='seguridad'?' active':''}" onclick="cfgTabs='seguridad';rConfig()">🔒 Seguridad</button>
      <button class="fb${cfgTabs==='backups'?' active':''}" onclick="cfgTabs='backups';rConfig()">💾 Backups</button>
      <button class="fb${cfgTabs==='cron'?' active':''}" onclick="cfgTabs='cron';rConfig()">⏰ Tareas</button>
      <button class="fb${cfgTabs==='actualizar'?' active':''}" onclick="cfgTabs='actualizar';rConfig()">🚀 Actualizar</button>
    </div>
    
    <div id="cfg-content">Cargando...</div>
  `;
  await renderCfgTab(cfg);
}

async function renderCfgTab(cfg){
  const c=$('cfg-content');
  if(!c)return;
  
  if(cfgTabs==='general'){
    const logoPreview=cfg.empresa_logo?.valor?'<img src="'+cfg.empresa_logo.valor+'" style="max-height:60px;max-width:200px;border-radius:8px;margin-top:12px"/>':'<div style="width:120px;height:60px;background:var(--surface2);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;margin-top:12px">Sin logo</div>';
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="font-family:var(--font-head);font-size:16px;font-weight:700;margin-bottom:20px">Personalización</div>
        <div class="form-grid">
          <div class="field"><label>NOMBRE DE LA EMPRESA</label><input type="text" id="cfg-empresa-nombre" value="${esc(cfg.empresa_nombre?.valor||'')}" placeholder="Mi Empresa S.A.S."/></div>
          <div class="field"><label>NIT DE LA EMPRESA</label><input type="text" id="cfg-empresa-nit" value="${esc(cfg.empresa_nit?.valor||'')}" placeholder="901234567-1"/></div>
        </div>
        <div class="field"><label>LOGO DE LA EMPRESA (URL o subir)</label>
          <input type="text" id="cfg-empresa-logo-url" value="${esc(cfg.empresa_logo?.valor||'')}" placeholder="https://ejemplo.com/logo.png"/>
          <div style="margin-top:12px">
            <input type="file" id="cfg-empresa-logo-file" accept="image/*" style="display:none" onchange="subirLogoEmpresa(this)"/>
            <button class="btn btn-secondary btn-sm" onclick="$('cfg-empresa-logo-file').click()">📤 Subir imagen</button>
            <button class="btn btn-secondary btn-sm" onclick="previsualizarLogoUrl()" style="margin-left:8px">👁️ Previsualizar</button>
          </div>
          <div id="cfg-logo-preview" style="margin-top:12px">${logoPreview}</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('general')">💾 Guardar</button>
        </div>
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="font-family:var(--font-head);font-size:16px;font-weight:700;margin-bottom:12px">Nombre de la aplicación</div>
        <div class="field"><label>NOMBRE</label><input type="text" id="cfg-app-nombre" value="${esc(cfg.app_nombre?.valor||'DocFlow')}" placeholder="DocFlow"/></div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" onclick="guardarCfg('general')">💾 Guardar</button>
        </div>
      </div>
    `;
  }
  else if(cfgTabs==='imap'){
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div><div style="font-family:var(--font-head);font-size:16px;font-weight:700">Conexión IMAP</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Configuración para recibir facturas por correo electrónico</div></div>
          <span class="badge ${cfg.imap_host?.valor?'b-aprobada':'b-revision'}">${cfg.imap_host?.valor?'Configurado':'Sin configurar'}</span>
        </div>
        <div class="form-grid">
          <div class="field"><label>HOST IMAP</label><input type="text" id="cfg-imap-host" value="${esc(cfg.imap_host?.valor||'')}" placeholder="mail.dominio.com"/></div>
          <div class="field"><label>PUERTO</label><input type="number" id="cfg-imap-port" value="${esc(cfg.imap_port?.valor||'993')}" placeholder="993"/></div>
          <div class="field"><label>USUARIO (EMAIL)</label><input type="email" id="cfg-imap-user" value="${esc(cfg.imap_user?.valor||'')}" placeholder="facturas@dominio.com"/></div>
          <div class="field"><label>CONTRASEÑA</label><input type="password" id="cfg-imap-pass" value="${esc(cfg.imap_password?.valor||'')}" placeholder="••••••••"/></div>
          <div class="field"><label>CARPETA</label><input type="text" id="cfg-imap-folder" value="${esc(cfg.imap_folder?.valor||'INBOX')}" placeholder="INBOX"/></div>
          <div class="field"><label>USAR TLS/SSL</label>
            <select id="cfg-imap-tls">
              <option value="true" ${cfg.imap_tls?.valor!=='false'?'selected':''}>Sí (puerto 993)</option>
              <option value="false" ${cfg.imap_tls?.valor==='false'?'selected':''}>No (puerto 143)</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('imap')">💾 Guardar</button>
          <button class="btn btn-secondary" onclick="testImap()">🧪 Probar conexión</button>
        </div>
        <div id="cfg-test-imap" style="margin-top:12px"></div>
      </div>
      
      <div style="background:rgba(79,142,247,.08);border:1px solid rgba(79,142,247,.2);border-radius:12px;padding:16px">
        <div style="font-size:13px;color:var(--accent);font-weight:600;margin-bottom:8px">ℹ️ Nota sobre configuración IMAP</div>
        <div style="font-size:13px;color:var(--muted)">Esta configuración se usa para sincronizar automáticamente las facturas electrónicas recibidas por correo. El sistema buscará adjuntos PDF y XML en los mensajes no leídos de la carpeta configurada.</div>
      </div>
    `;
  }
  else if(cfgTabs==='smtp'){
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div><div style="font-family:var(--font-head);font-size:16px;font-weight:700">Servidor SMTP</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Configuración para enviar notificaciones por correo</div></div>
          <span class="badge ${cfg.smtp_host?.valor?'b-aprobada':'b-revision'}">${cfg.smtp_host?.valor?'Configurado':'Sin configurar'}</span>
        </div>
        <div class="form-grid">
          <div class="field"><label>HOST SMTP</label><input type="text" id="cfg-smtp-host" value="${esc(cfg.smtp_host?.valor||'')}" placeholder="smtp.dominio.com"/></div>
          <div class="field"><label>PUERTO</label><input type="number" id="cfg-smtp-port" value="${esc(cfg.smtp_port?.valor||'587')}" placeholder="587"/></div>
          <div class="field"><label>USUARIO</label><input type="text" id="cfg-smtp-user" value="${esc(cfg.smtp_user?.valor||'')}" placeholder="notificaciones@dominio.com"/></div>
          <div class="field"><label>CONTRASEÑA</label><input type="password" id="cfg-smtp-pass" value="${esc(cfg.smtp_password?.valor||'')}" placeholder="••••••••"/></div>
          <div class="field"><label>REMITENTE (FROM)</label><input type="text" id="cfg-smtp-from" value="${esc(cfg.smtp_from?.valor||'')}" placeholder="notificaciones@dominio.com"/></div>
          <div class="field">
            <label>ENCRIPTACIÓN</label>
            <select id="cfg-smtp-secure">
              <option value="false" ${cfg.smtp_secure?.valor!=='true'?'selected':''}>STARTTLS (puerto 587)</option>
              <option value="true" ${cfg.smtp_secure?.valor==='true'?'selected':''}>SSL (puerto 465)</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('smtp')">💾 Guardar</button>
          <button class="btn btn-secondary" onclick="testSmtp()">🧪 Probar conexión</button>
        </div>
        <div id="cfg-test-smtp" style="margin-top:12px"></div>
      </div>
      
      <div style="background:rgba(79,142,247,.08);border:1px solid rgba(79,142,247,.2);border-radius:12px;padding:16px">
        <div style="font-size:13px;color:var(--accent);font-weight:600;margin-bottom:8px">ℹ️ Nota sobre SMTP</div>
        <div style="font-size:13px;color:var(--muted)">El servidor SMTP se usa para enviar notificaciones a los usuarios cuando hay facturas que requieren atención. Configure un servidor SMTP válido para activar las notificaciones.</div>
      </div>
    `;
  }
  else if(cfgTabs==='horas'){
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="font-family:var(--font-head);font-size:16px;font-weight:700;margin-bottom:20px">Tiempos y escalaciones</div>
        <div class="form-grid">
          <div class="field"><label>HORAS PARA REVISIÓN</label><input type="number" id="cfg-horas-revision" value="${esc(cfg.horas_limite_revision?.valor||'24')}" placeholder="24"/><div style="font-size:11px;color:var(--muted);margin-top:4px">Horas antes de escalar al jefe de área</div></div>
          <div class="field"><label>HORAS ESCALACIÓN NIVEL 2</label><input type="number" id="cfg-horas-nivel2" value="${esc(cfg.horas_escalacion_nivel2?.valor||'48')}" placeholder="48"/><div style="font-size:11px;color:var(--muted);margin-top:4px">Horas antes de escalar a gerencia</div></div>
          <div class="field"><label>HORAS DIAN TÁCITA</label><input type="number" id="cfg-horas-dian" value="${esc(cfg.horas_dian_tacita?.valor||'48')}" placeholder="48"/><div style="font-size:11px;color:var(--muted);margin-top:4px">Horas para aceptación tácita DIAN</div></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('horas')">💾 Guardar</button>
        </div>
      </div>
    `;
  }
  else if(cfgTabs==='areas'){
    if(!S.usuarios)S.usuarios=await api('GET','/usuarios');
    const areas=await api('GET','/areas');
    const users=S.usuarios.filter(u=>u.rol==='jefe'||u.rol==='admin');
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div><div style="font-family:var(--font-head);font-size:16px;font-weight:700">Áreas</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Gestión de áreas organizacionales</div></div>
          <button class="btn btn-primary btn-sm" onclick="showM('Nueva área','<div class=form-grid><div class=field full><label>NOMBRE</label><input type=text id=new-area-nombre placeholder=Nombre del área/></div><div class=field><label>JEFE (opcional)</label><select id=new-area-jefe><option value=>— Sin jefe —</option>'+users.map(u=>'<option value='+u.id+'>'+esc(u.nombre)+'</option>').join('')+'</select></div><div class=field><label>EMAIL</label><input type=email id=new-area-email placeholder=area@empresa.com/></div></div><div class=modal-footer><button class=btn btn-primary onclick=crearArea()>Crear área</button></div>')">➕ Nueva área</button>
        </div>
        <div style="display:grid;gap:12px">${areas.length?areas.map(a=>`<div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--surface2);border-radius:10px">
          <div style="flex:1"><div style="font-weight:600">${esc(a.nombre)}</div><div style="font-size:12px;color:var(--muted)">${a.jefe_nombre?'Jefe: '+esc(a.jefe_nombre):'Sin jefe asignado'} · ${a.total_usuarios||0} usuario(s)</div></div>
          <button class="btn btn-secondary btn-sm" onclick="editarArea('${a.id}','${esc(a.nombre)}','${a.jefe_id||''}','${esc(a.email||'')}')">✏️</button>
        </div>`).join(''):'<div style="text-align:center;padding:40px;color:var(--muted)">No hay áreas configuradas</div>'}</div>
      </div>
    `;
  }
  else if(cfgTabs==='actualizar'){
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="font-family:var(--font-head);font-size:16px;font-weight:700;margin-bottom:20px">Actualización del sistema</div>
        
        <div id="update-status" style="margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--surface2);border-radius:10px;margin-bottom:12px">
            <div style="width:10px;height:10px;border-radius:50%;background:var(--accent)"></div>
            <div style="flex:1">
              <div style="font-weight:600" id="update-version">Versión: ${cfg.version||'—'}</div>
              <div style="font-size:12px;color:var(--muted)" id="update-commit">Commit: ${cfg.commit||'—'}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="checkUpdates()" id="btn-check-update">🔍 Verificar</button>
          </div>
          
          <div id="update-available" style="display:none;padding:16px;background:rgba(79,190,150,.1);border:1px solid rgba(79,190,150,.3);border-radius:10px;margin-bottom:12px">
            <div style="font-weight:600;color:var(--success);margin-bottom:8px">🎉 Nueva versión disponible</div>
            <div id="update-changes" style="font-size:13px;color:var(--text);margin-bottom:12px"></div>
            <div style="display:flex;gap:10px">
              <button class="btn btn-primary" onclick="ejecutarActualizacion()" id="btn-update-now">🚀 Actualizar ahora</button>
            </div>
          </div>
          
          <div id="update-no-changes" style="display:none;padding:14px;background:var(--surface2);border-radius:10px;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px;color:var(--success);font-weight:500">✓ Sistema actualizado</div>
          </div>
        </div>
        
        <div style="margin-top:20px">
          <div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px">Registro de actualizaciones</div>
          <div id="update-log" style="background:#000;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#0f0;max-height:200px;overflow-y:auto;white-space:pre-wrap">Cargando...</div>
        </div>
      </div>
    `;
    
    cargarStatusActualizacion();
    cargarLogActualizacion();
  }
  else if(cfgTabs==='seguridad'){
    const r=await api('GET','/configuracion/seguridad');
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div><div style="font-family:var(--font-head);font-size:16px;font-weight:700">Protección Fail2ban</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Protección contra ataques de fuerza bruta</div></div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge ${r.fail2ban?.installed?'b-aprobada':'b-revision'}">${r.fail2ban?.installed?'Instalado':'No instalado'}</span>
            ${r.fail2ban?.installed?'<span class="badge '+(r.fail2ban?.active?'b-aprobada':'b-revision')+'">'+(r.fail2ban?.active?'Activo':'Inactivo')+'</span>':''}
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>HABILITAR FAIL2BAN</label>
            <select id="cfg-fail2ban-enabled">
              <option value="true" ${r.config?.fail2ban_enabled==='true'?'selected':''}>Sí</option>
              <option value="false" ${r.config?.fail2ban_enabled!=='true'?'selected':''}>No</option>
            </select>
          </div>
          <div class="field"><label>TIEMPO DE BAN (segundos)</label><input type="number" id="cfg-fail2ban-bantime" value="${r.config?.fail2ban_bantime||'3600'}" placeholder="3600"/></div>
          <div class="field"><label>VENTANA DE TIEMPO (segundos)</label><input type="number" id="cfg-fail2ban-findtime" value="${r.config?.fail2ban_findtime||'600'}" placeholder="600"/></div>
          <div class="field"><label>MÁXIMO REINTENTOS</label><input type="number" id="cfg-fail2ban-maxretry" value="${r.config?.fail2ban_maxretry||'10'}" placeholder="10"/></div>
        </div>
        ${r.fail2ban?.installed?'<div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-secondary btn-sm" onclick="f2bAction(\'start\')">▶ Iniciar</button><button class="btn btn-secondary btn-sm" onclick="f2bAction(\'stop\')">⏹ Detener</button><button class="btn btn-secondary btn-sm" onclick="f2bAction(\'restart\')">↻ Reiniciar</button></div>':''}
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('seguridad')">💾 Guardar</button>
        </div>
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div><div style="font-family:var(--font-head);font-size:16px;font-weight:700">Rate Limiting</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Límite de peticiones por IP</div></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>VENTANA DE TIEMPO (segundos)</label><input type="number" id="cfg-rate-window" value="${r.config?.rate_limit_window||'900'}" placeholder="900"/></div>
          <div class="field"><label>MÁXIMO PETICIONES</label><input type="number" id="cfg-rate-max" value="${r.config?.rate_limit_max||'100'}" placeholder="100"/></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('seguridad')">💾 Guardar</button>
        </div>
      </div>
    `;
  }
  else if(cfgTabs==='backups'){
    const r=await api('GET','/configuracion/backups-auto');
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div><div style="font-family:var(--font-head);font-size:16px;font-weight:700">Backups Automáticos</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Backups locales siempre se hacen. NAS es opcional como respaldo adicional.</div></div>
          <span class="badge ${r.config?.backup_auto_enabled==='true'?'b-aprobada':'b-revision'}">${r.config?.backup_auto_enabled==='true'?'Activo':'Inactivo'}</span>
        </div>
        <div class="form-grid">
          <div class="field"><label>HABILITAR BACKUPS AUTOMÁTICOS</label>
            <select id="cfg-backup-auto-enabled">
              <option value="true" ${r.config?.backup_auto_enabled==='true'?'selected':''}>Sí</option>
              <option value="false" ${r.config?.backup_auto_enabled!=='true'?'selected':''}>No</option>
            </select>
          </div>
          <div class="field"><label>FRECUENCIA (cron)</label><input type="text" id="cfg-backup-auto-cron" value="${r.config?.backup_auto_cron||'0 2 * * *'}" placeholder="0 2 * * *"/><div style="font-size:11px;color:var(--muted);margin-top:4px">Formato: minuto hora día mes díaSemana. Ej: "0 2 * * *" = diario a las 2am</div></div>
          <div class="field"><label>RETENCIÓN LOCAL (días)</label><input type="number" id="cfg-backup-auto-retention" value="${r.config?.backup_auto_retention||'7'}" placeholder="7"/><div style="font-size:11px;color:var(--success);margin-top:4px">✓ Backup local: ~/backups/docflow</div></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('backups')">💾 Guardar</button>
        </div>
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div><div style="font-family:var(--font-head);font-size:16px;font-weight:700">Backup en NAS (opcional)</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Copia adicional en servidor de red</div></div>
          <span class="badge ${r.config?.backup_auto_type==='smb'?'b-aprobada':'b-revision'}">${r.config?.backup_auto_type==='smb'?'Configurado':'No configurado'}</span>
        </div>
        <div class="form-grid">
          <div class="field"><label>TIPO DE CONEXIÓN</label>
            <select id="cfg-backup-auto-type" onchange="toggleNasCreds()">
              <option value="local" ${r.config?.backup_auto_type!=='smb'?'selected':''}>No usar NAS</option>
              <option value="smb" ${r.config?.backup_auto_type==='smb'?'selected':''}>SMB/CIFS (Windows/NAS)</option>
            </select>
          </div>
          <div class="field full" id="cfg-nas-path-wrap" style="display:${r.config?.backup_auto_type==='smb'?'block':'none'}"><label>RUTA COMPARTIDA</label><input type="text" id="cfg-backup-auto-path" value="${r.config?.backup_auto_path||''}" placeholder="//192.168.0.10/nas"/></div>
          <div class="field full" id="cfg-nas-host-wrap" style="display:${r.config?.backup_auto_type==='smb'?'block':'none'}"><label>SERVIDOR SMB</label><input type="text" id="cfg-backup-auto-host" value="${r.config?.backup_auto_host||''}" placeholder="//192.168.1.100/backup"/></div>
          <div class="field" id="cfg-nas-user-wrap" style="display:${r.config?.backup_auto_type==='smb'?'block':'none'}"><label>USUARIO</label><input type="text" id="cfg-backup-auto-user" value="${r.config?.backup_auto_user||''}" placeholder="admin"/></div>
          <div class="field" id="cfg-nas-pass-wrap" style="display:${r.config?.backup_auto_type==='smb'?'block':'none'}"><label>CONTRASEÑA</label><input type="password" id="cfg-backup-auto-pass" value="${r.config?.backup_auto_pass||''}" placeholder="••••••••"/></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('backups')">💾 Guardar NAS</button>
          <button class="btn btn-secondary" id="cfg-nas-test-btn" style="display:${r.config?.backup_auto_type==='smb'?'inline-flex':'none'}" onclick="testBackupPath()">🧪 Probar conexión</button>
        </div>
      </div>
    `;
  }
  else if(cfgTabs==='cron'){
    const r=await api('GET','/configuracion/cron');
    c.innerHTML=`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div><div style="font-family:var(--font-head);font-size:16px;font-weight:700">Tareas Programadas</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Configura la frecuencia de las tareas automáticas</div></div>
        </div>
        <div class="form-grid">
          <div class="field full"><label>SYNC CORREO IMAP</label><input type="text" id="cfg-cron-imap" value="${r.config?.cron_imap||'*/15 * * * *'}" placeholder="*/15 * * * *"/><div style="font-size:11px;color:var(--muted);margin-top:4px">Ej: "*/15 * * * *" = cada 15 minutos</div></div>
          <div class="field full"><label>ESCALACIONES</label><input type="text" id="cfg-cron-escalaciones" value="${r.config?.cron_escalaciones||'0 * * * *'}" placeholder="0 * * * *"/><div style="font-size:11px;color:var(--muted);margin-top:4px">Ej: "0 * * * *" = cada hora</div></div>
          <div class="field full"><label>VERIFICACIÓN DIAN TÁCITA</label><input type="text" id="cfg-cron-dian" value="${r.config?.cron_dian||'0 6 * * *'}" placeholder="0 6 * * *"/><div style="font-size:11px;color:var(--muted);margin-top:4px">Ej: "0 6 * * *" = diario a las 6am</div></div>
          <div class="field full"><label>NOTIFICACIONES</label><input type="text" id="cfg-cron-notificaciones" value="${r.config?.cron_notificaciones||'0 8 * * *'}" placeholder="0 8 * * *"/><div style="font-size:11px;color:var(--muted);margin-top:4px">Ej: "0 8 * * *" = diario a las 8am</div></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-primary" onclick="guardarCfg('cron')">💾 Guardar</button>
        </div>
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px">
        <div style="font-family:var(--font-head);font-size:14px;font-weight:700;margin-bottom:12px">CRON activo</div>
        <div style="background:#000;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#0f0;max-height:150px;overflow-y:auto;white-space:pre-wrap">${r.crontab?.join('\n')||'(vacío)'}</div>
        <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="verCronLogs()">📋 Ver logs</button>
      </div>
    `;
  }
}

async function guardarCfg(tab){
  const data={};
  if(tab==='imap'){
    data.imap_host=$('cfg-imap-host')?.value?.trim()||'';
    data.imap_port=$('cfg-imap-port')?.value?.trim()||'993';
    data.imap_user=$('cfg-imap-user')?.value?.trim()||'';
    data.imap_password=$('cfg-imap-pass')?.value||'';
    data.imap_folder=$('cfg-imap-folder')?.value?.trim()||'INBOX';
    data.imap_tls=$('cfg-imap-tls')?.value||'true';
  }else if(tab==='smtp'){
    data.smtp_host=$('cfg-smtp-host')?.value?.trim()||'';
    data.smtp_port=$('cfg-smtp-port')?.value?.trim()||'587';
    data.smtp_user=$('cfg-smtp-user')?.value?.trim()||'';
    data.smtp_password=$('cfg-smtp-pass')?.value||'';
    data.smtp_from=$('cfg-smtp-from')?.value?.trim()||'';
    data.smtp_secure=$('cfg-smtp-secure')?.value||'false';
  }else if(tab==='horas'){
    data.horas_limite_revision=$('cfg-horas-revision')?.value?.trim()||'24';
    data.horas_escalacion_nivel2=$('cfg-horas-nivel2')?.value?.trim()||'48';
    data.horas_dian_tacita=$('cfg-horas-dian')?.value?.trim()||'48';
  }else if(tab==='seguridad'){
    data.fail2ban_enabled=$('cfg-fail2ban-enabled')?.value||'false';
    data.fail2ban_bantime=$('cfg-fail2ban-bantime')?.value?.trim()||'3600';
    data.fail2ban_findtime=$('cfg-fail2ban-findtime')?.value?.trim()||'600';
    data.fail2ban_maxretry=$('cfg-fail2ban-maxretry')?.value?.trim()||'10';
    data.rate_limit_window=$('cfg-rate-window')?.value?.trim()||'900';
    data.rate_limit_max=$('cfg-rate-max')?.value?.trim()||'100';
    const r=await api('PUT','/configuracion/seguridad',data);
    toast('Configuración de seguridad guardada','success');
    rConfig();
    return;
  }else if(tab==='backups'){
    data.backup_auto_enabled=$('cfg-backup-auto-enabled')?.value||'false';
    data.backup_auto_cron=$('cfg-backup-auto-cron')?.value?.trim()||'';
    data.backup_auto_path=$('cfg-backup-auto-path')?.value?.trim()||'$HOME/backups/docflow';
    data.backup_auto_type=$('cfg-backup-auto-type')?.value||'local';
    data.backup_auto_host=$('cfg-backup-auto-host')?.value?.trim()||'';
    data.backup_auto_user=$('cfg-backup-auto-user')?.value?.trim()||'';
    data.backup_auto_pass=$('cfg-backup-auto-pass')?.value||'';
    data.backup_auto_retention=$('cfg-backup-auto-retention')?.value?.trim()||'7';
    const r=await api('PUT','/configuracion/backups-auto',data);
    toast('Configuración de backups guardada','success');
    rConfig();
    return;
  }else if(tab==='cron'){
    const r=await api('PUT','/configuracion/cron',{
      cron_imap:$('cfg-cron-imap')?.value?.trim()||'',
      cron_escalaciones:$('cfg-cron-escalaciones')?.value?.trim()||'',
      cron_dian:$('cfg-cron-dian')?.value?.trim()||'',
      cron_notificaciones:$('cfg-cron-notificaciones')?.value?.trim()||''
    });
    toast('Tareas CRON actualizadas','success');
    rConfig();
    return;
  }else if(tab==='general'){
    data.empresa_nombre=$('cfg-empresa-nombre')?.value?.trim()||'';
    data.empresa_nit=$('cfg-empresa-nit')?.value?.trim()||'';
    data.empresa_logo=$('cfg-empresa-logo-url')?.value?.trim()||'';
    data.app_nombre=$('cfg-app-nombre')?.value?.trim()||'DocFlow';
    const r=await api('PUT','/configuracion',data);
    toast('Configuración guardada','success');
    if(data.app_nombre||data.empresa_logo){
      document.title=data.app_nombre||'DocFlow';
    }
    rConfig();
    return;
  }
  try{
    await api('PUT','/configuracion',data);
    toast('Configuración guardada','success');
    if(tab==='horas'){rConfig()}
  }catch(e){toast(e.message,'error')}
}

async function f2bAction(action){
  try{
    const r=await api('POST','/configuracion/seguridad/fail2ban/action',{action});
    toast(r.message||'Acción ejecutada','success');
    rConfig();
  }catch(e){toast(e.message,'error')}
}

async function testBackupPath(){
  const path=$('cfg-backup-auto-path')?.value?.trim();
  if(!path){toast('Ingresa la ruta','error');return}
  const type=$('cfg-backup-auto-type')?.value;
  const data={path,type};
  if(type==='smb'){
    data.host=$('cfg-backup-auto-host')?.value?.trim();
    data.user=$('cfg-backup-auto-user')?.value?.trim();
    data.pass=$('cfg-backup-auto-pass')?.value;
  }
  try{
    const r=await api('POST','/configuracion/backups-auto/test',data);
    toast('Conexión exitosa','success');
  }catch(e){toast(e.message,'error')}
}

function toggleNasCreds(){
  const type=$('cfg-backup-auto-type')?.value;
  const wrap=['cfg-nas-path-wrap','cfg-nas-host-wrap','cfg-nas-user-wrap','cfg-nas-pass-wrap'];
  wrap.forEach(id=>{const el=$(id);if(el)el.style.display=type==='smb'?'block':'none'});
  const testBtn=$('cfg-nas-test-btn');
  if(testBtn)testBtn.style.display=type==='smb'?'inline-flex':'none';
}

async function ejecutarBackupAhora(){
  if(!confirm('¿Ejecutar backup ahora?'))return;
  try{
    const r=await api('POST','/configuracion/backups-auto/now');
    if(r.path){
      toast(`Backup guardado en: ${r.path}`,'success');
    }else{
      toast(r.message||'Backup completado','success');
    }
  }catch(e){toast(e.message,'error')}
}

async function generarBackupServidor(){
  const btn=event.target;
  btn.disabled=true;btn.textContent='Generando...';
  try{
    const r=await api('POST','/configuracion/backups-auto/now');
    toast(r.path?'Backup creado en servidor':'Backup generado','success');
    cargarListaBackups();
  }catch(e){toast(e.message,'error')}
  btn.disabled=false;btn.textContent='➕ Generar';
}

async function verCronLogs(){
  try{
    const r=await api('GET','/configuracion/cron/logs');
    showM('Logs de Tareas',`<div style="background:#000;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#0f0;max-height:400px;overflow-y:auto;white-space:pre-wrap">${r.log||'(sin logs)'}</div>`,600);
  }catch(e){toast(e.message,'error')}
}

async function subirLogoEmpresa(input){
  const file=input?.files?.[0];
  if(!file)return;
  const fd=new FormData();
  fd.append('logo',file);
  try{
    const r=await api('POST','/configuracion/logo',fd,true);
    if(r.url){
      $('cfg-empresa-logo-url').value=r.url;
      $('cfg-logo-preview').innerHTML='<img src="'+r.url+'" style="max-height:60px;max-width:200px;border-radius:8px;margin-top:12px"/>';
      toast('Logo subido','success');
    }
  }catch(e){toast(e.message,'error')}
}

function previsualizarLogoUrl(){
  const url=$('cfg-empresa-logo-url')?.value?.trim();
  if(url){
    $('cfg-logo-preview').innerHTML='<img src="'+esc(url)+'" style="max-height:60px;max-width:200px;border-radius:8px;margin-top:12px" onerror="this.style.display=\'none\'"/>';
  }
}

async function testImap(){
  const host=$('cfg-imap-host')?.value?.trim();
  const port=$('cfg-imap-port')?.value?.trim();
  const user=$('cfg-imap-user')?.value?.trim();
  const pass=$('cfg-imap-pass')?.value;
  const tls=$('cfg-imap-tls')?.value;
  const el=$('cfg-test-imap');
  if(!host||!user||!pass){el.innerHTML='<span style="color:var(--danger)">Completa host, usuario y contraseña</span>';return}
  el.innerHTML='<span style="color:var(--muted)">Probando conexión...</span>';
  try{
    const r=await api('GET',`/configuracion/imap/test?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&secure=${tls}`);
    el.innerHTML='<span style="color:var(--success)">✓ Conexión exitosa</span>';
  }catch(e){
    el.innerHTML=`<span style="color:var(--danger)">✗ Error: ${esc(e.message)}</span>`;
  }
}

async function testSmtp(){
  const host=$('cfg-smtp-host')?.value?.trim();
  const port=$('cfg-smtp-port')?.value?.trim();
  const user=$('cfg-smtp-user')?.value?.trim();
  const pass=$('cfg-smtp-pass')?.value;
  const from=$('cfg-smtp-from')?.value?.trim();
  const secure=$('cfg-smtp-secure')?.value;
  const el=$('cfg-test-smtp');
  if(!host||!user||!pass){el.innerHTML='<span style="color:var(--danger)">Completa host, usuario y contraseña</span>';return}
  el.innerHTML='<span style="color:var(--muted)">Probando conexión...</span>';
  try{
    const r=await api('GET',`/configuracion/smtp/test?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&from=${encodeURIComponent(from)}&secure=${encodeURIComponent(secure)}`);
    el.innerHTML='<span style="color:var(--success)">✓ Configuración SMTP correcta</span>';
  }catch(e){
    el.innerHTML=`<span style="color:var(--danger)">✗ Error: ${esc(e.message)}</span>`;
  }
}

// ─── ACTUALIZACIÓN ─────────────────────────────────────────────────────────
let updatePolling=null;

async function cargarStatusActualizacion(){
  try{
    const r=await api('GET','/configuracion/updater/status');
    if(r.ok){
      $('update-version').textContent=`Versión: ${r.commit||'—'}`;
      $('update-commit').textContent=`Rama: ${r.branch||'—'} | Repo: ${r.remote||'—'}`;
      if(r.lastUpdate){
        const fecha=new Date(r.lastUpdate).toLocaleString('es-CO');
        $('update-commit').textContent+=` | Última update: ${fecha}`;
      }
    }
  }catch(e){console.log('Error cargando status:',e.message)}
}

async function cargarLogActualizacion(){
  try{
    const r=await api('GET','/configuracion/updater/logs');
    const logEl=$('update-log');
    if(logEl)logEl.textContent=r.log||'Sin registros';
    logEl.scrollTop=logEl.scrollHeight;
  }catch(e){console.log('Error cargando logs:',e.message)}
}

async function checkUpdates(){
  const btn=$('btn-check-update');
  btn.disabled=true;
  btn.textContent='Verificando...';
  try{
    const r=await api('POST','/configuracion/updater/check');
    const avEl=$('update-available');
    const ncEl=$('update-no-changes');
    if(r.hasUpdates){
      avEl.style.display='block';
      ncEl.style.display='none';
      const changesEl=$('update-changes');
      changesEl.innerHTML=`<strong>${r.commitsBehind}</strong> actualización(es) pendiente(s)<br>`+
        (r.changes||[]).map(c=>`<div style="margin-left:12px;margin-top:4px">• ${esc(c)}</div>`).join('');
    }else{
      avEl.style.display='none';
      ncEl.style.display='block';
    }
    await cargarLogActualizacion();
  }catch(e){
    toast('Error verificando: '+e.message,'error');
  }finally{
    btn.disabled=false;
    btn.textContent='🔍 Verificar';
  }
}

async function ejecutarActualizacion(){
  if(!confirm('¿Actualizar el sistema? El servicio se reiniciará automáticamente.'))return;
  const btn=$('btn-update-now');
  btn.disabled=true;
  btn.textContent='Actualizando...';
  try{
    const r=await api('POST','/configuracion/updater/update');
    if(r.ok){
      toast('Actualización iniciada. El sistema se reiniciará.','success');
      $('update-available').style.display='none';
      $('update-no-changes').style.display='block';
      
      updatePolling=setInterval(async()=>{
        await cargarLogActualizacion();
        try{
          const status=await api('GET','/configuracion/updater/status');
          if(status&&status.updaterLog?.includes('COMPLETADA')){
            clearInterval(updatePolling);
            toast('Actualización completada, reiniciando...','success');
            try{
              await api('POST','/configuracion/updater/restart');
            }catch(e){}
            // Esperar hasta que el servidor responda
            let intentos=0;
            const esperarServidor=setInterval(async()=>{
              try{
                await fetch('/api/health');
                clearInterval(esperarServidor);
                toast('Servicio reiniciado','success');
                window.location.reload();
              }catch(e){
                intentos++;
                if(intentos>60){
                  clearInterval(esperarServidor);
                  window.location.reload();
                }
              }
            },2000);
          }
        }catch(e){}
      },3000);
    }else{
      toast('Error: '+r.error,'error');
    }
    await cargarLogActualizacion();
  }catch(e){
    clearInterval(updatePolling);
    toast('Error: '+e.message,'error');
  }finally{
    btn.disabled=false;
    btn.textContent='🚀 Actualizar ahora';
  }
}

// ─── AUDITORÍA ─────────────────────────────────────────────────────────────
let auditTab='accesos';
async function rAudit(){
  const [stats, usuarios] = await Promise.all([
    api('GET','/audit/estadisticas'),
    api('GET','/usuarios')
  ]);
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Auditoría</div><div class="page-sub">Registro de actividad y seguridad</div></div></div>
    
    <div class="stats-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card">
        <div class="stat-label">Accesos hoy</div>
        <div class="stat-value blue">${stats.accesos_hoy||0}</div>
        <div class="stat-s">${stats.accesos_7d||0} últimos 7 días</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Eventos flujo (30d)</div>
        <div class="stat-value green">${stats.eventos_30d||0}</div>
        <div class="stat-s">${stats.usuarios_activos_7d||0} usuarios activos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Intentos fallidos (7d)</div>
        <div class="stat-value" style="color:var(--danger)">${stats.logins_fallidos_7d||0}</div>
        ${stats.top_ip_bloqueadas?.length?'<div class="stat-s">IPs con más errores</div>':''}
      </div>
    </div>
    
    ${stats.top_ip_bloqueadas?.length?`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px">IPs con más intentos fallidos (7 días)</div>
      <table style="width:100%"><thead><tr><th style="text-align:left;font-size:11px;color:var(--muted)">IP</th><th style="text-align:left;font-size:11px;color:var(--muted)">Intentos</th><th style="text-align:left;font-size:11px;color:var(--muted)">Último intento</th></tr></thead>
      <tbody>
        ${stats.top_ip_bloqueadas.map(ip=>`<tr><td style="padding:8px 0;font-family:monospace;font-size:12px">${esc(ip.ip)}</td><td style="color:var(--danger);font-weight:600">${ip.intentos}</td><td style="color:var(--muted);font-size:12px">${fdate(ip.ultimo_intento)}</td></tr>`).join('')}
      </tbody></table>
    </div>`:''}
    
    <div style="display:flex;gap:6px;margin-bottom:20px">
      <button class="fb${auditTab==='accesos'?' active':''}" onclick="auditTab='accesos';rAudit()">🔐 Accesos</button>
      <button class="fb${auditTab==='eventos'?' active':''}" onclick="auditTab='eventos';rAudit()">📋 Eventos flujo</button>
    </div>
    
    <div class="tbl">
      <div class="tbl-head"><div class="tbl-title" id="audit-title">Cargando...</div></div>
      <table><thead id="audit-head"></thead>
      <tbody id="audit-body"><tr><td colspan="10" class="empty">Cargando...</td></tr></tbody>
    </div>
  `;
  await cargarAudit(usuarios);
}

async function cargarAudit(usuarios){
  if(auditTab==='accesos'){
    const r=await api('GET','/audit/accesos?limit=100');
    $('audit-title').textContent=`${r.total||0} registros de acceso`;
    $('audit-head').innerHTML=`<tr><th>Fecha</th><th>Usuario</th><th>IP</th><th>Resultado</th><th>Motivo</th></tr>`;
    $('audit-body').innerHTML=r.data?.length?r.data.map(l=>`<tr>
      <td style="color:var(--muted);font-size:12px">${fdate(l.creado_en)}</td>
      <td style="font-weight:500">${esc(l.usuario_nombre||l.email||'—')}</td>
      <td style="font-family:monospace;font-size:12px">${esc(l.ip||'—')}</td>
      <td><span class="badge ${l.exito?'b-aprobada':'b-rechazada'}">${l.exito?'Éxito':'Fallido'}</span></td>
      <td style="color:var(--muted);font-size:12px">${esc(l.motivo||'—')}</td>
    </tr>`).join(''):'<tr><td colspan="5" class="empty">Sin registros</td></tr>';
  }else{
    const r=await api('GET','/audit/eventos?limit=100');
    $('audit-title').textContent=`${r.total||0} eventos de flujo`;
    $('audit-head').innerHTML=`<tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Factura</th><th>Comentario</th></tr>`;
    $('audit-body').innerHTML=r.data?.length?r.data.map(e=>`<tr>
      <td style="color:var(--muted);font-size:12px">${fdate(e.creado_en)}</td>
      <td style="font-weight:500">${esc(e.usuario_nombre||'Sistema')}</td>
      <td><span class="tag">${esc(e.tipo)}</span></td>
      <td class="mono" style="font-size:12px">${esc(e.numero_factura||'—')}</td>
      <td style="color:var(--muted);font-size:12px">${esc(e.comentario||'—')}</td>
    </tr>`).join(''):'<tr><td colspan="5" class="empty">Sin eventos</td></tr>';
  }
}

// ─── CENTROS DE OPERACIÓN ─────────────────────────────────────────────────
async function rCentros(){
  const centros=await api('GET','/centros');
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Centros de Operación</div><div class="page-sub">Territorios y sedes de la compañía</div></div><button class="btn btn-primary" onclick="mCentro()">+ Nuevo centro</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px" id="centros-grid">
      ${centros.length?centros.map(c=>`<div class="tbl" style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div style="font-weight:700;font-size:16px">${esc(c.nombre)}</div>
          <span class="badge ${c.activo?'b-aprobada':'b-rechazada'}">${c.activo?'Activo':'Inactivo'}</span>
        </div>
        ${c.codigo?`<div style="font-size:12px;color:var(--muted);margin-bottom:8px">📍 ${esc(c.codigo)}</div>`:''}
        ${c.direccion?`<div style="font-size:12px;color:var(--muted);margin-bottom:8px">🏠 ${esc(c.direccion)}</div>`:''}
        ${c.telefono?`<div style="font-size:12px;color:var(--muted);margin-bottom:8px">📞 ${esc(c.telefono)}</div>`:''}
        ${c.email?`<div style="font-size:12px;color:var(--muted);margin-bottom:8px">✉️ ${esc(c.email)}</div>`:''}
        ${c.descripcion?`<div style="font-size:12px;color:var(--text);margin-top:8px;border-top:1px solid var(--border);padding-top:8px">${esc(c.descripcion)}</div>`:''}
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="mCentro('${c.id}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="delCentro('${c.id}','${esc(c.nombre)}')">🗑️</button>
        </div>
      </div>`).join(''):'<div class="empty" style="grid-column:1/-1">No hay centros registrados</div>'}
    </div>
  `;
}

async function mCentro(id){
  let centro=null;
  if(id)centro=await api('GET',`/centros/${id}`);
  const esNuevo=!id;
  window.saveCentro=async()=>{
    const n=$('cn-nombre')?.value?.trim();
    if(!n){toast('El nombre es requerido','error');return}
    const data={
      nombre:n,
      codigo:$('cn-codigo')?.value?.trim()||null,
      descripcion:$('cn-desc')?.value?.trim()||null,
      direccion:$('cn-dir')?.value?.trim()||null,
      telefono:$('cn-tel')?.value?.trim()||null,
      email:$('cn-email')?.value?.trim()||null,
      activo:$('cn-activo')?.checked??true
    };
    try{
      if(esNuevo)await api('POST','/centros',data);
      else await api('PUT',`/centros/${id}`,data);
      closeM();
      toast('Centro guardado','success');
      rCentros();
    }catch(e){toast(e.message,'error')}
  };
  showM(esNuevo?'Nuevo centro':'Editar centro',`
    <div class="field"><label>NOMBRE *</label><input id="cn-nombre" value="${esc(centro?.nombre||'')}" placeholder="Ej: Bogotá Centro"/></div>
    <div class="form-grid">
      <div class="field"><label>CÓDIGO</label><input id="cn-codigo" value="${esc(centro?.codigo||'')}" placeholder="Ej: BOG-01"/></div>
      <div class="field"><label>EMAIL</label><input id="cn-email" type="email" value="${esc(centro?.email||'')}" placeholder="sede@tu-dominio.com"/></div>
    </div>
    <div class="field"><label>DIRECCIÓN</label><input id="cn-dir" value="${esc(centro?.direccion||'')}" placeholder="Dirección completa"/></div>
    <div class="form-grid">
      <div class="field"><label>TELÉFONO</label><input id="cn-tel" value="${esc(centro?.telefono||'')}" placeholder="+57 1 234 5678"/></div>
      <div class="field"><label>ESTADO</label><label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="cn-activo" ${centro?.activo!==false?'checked':''}/> Activo</label></div>
    </div>
    <div class="field"><label>DESCRIPCIÓN</label><textarea id="cn-desc" rows="2" placeholder="Descripción u observaciones...">${esc(centro?.descripcion||'')}</textarea></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="saveCentro()">Guardar</button></div>
  `,500);
}

async function delCentro(id,nombre){
  if(!confirm(`¿Eliminar el centro "${nombre}"?`))return;
  try{await api('DELETE',`/centros/${id}`);toast('Centro eliminado','success');rCentros()}catch(e){toast(e.message,'error')}
}

async function cambiarCat(facturaId,catId){
  try{
    await api('PATCH',`/facturas/${facturaId}/categoria`,{categoria_id:catId});
    toast('Categoría actualizada','success');
    abrirF(facturaId);
  }catch(e){toast(e.message,'error')}
}

// ─── INIT ───────────────────────────────────────────────────────────────────
if(S.token&&S.usuario){showApp()}else{$('app-screen').classList.remove('show');$('login-screen').style.display='flex'}
setInterval(refreshBadges,60000);

async function cargarConfigGlobal(){
  try{
    const cfg=await api('GET','/configuracion');
    if(cfg.app_nombre?.valor){
      document.title=cfg.app_nombre.valor;
      S.appNombre=cfg.app_nombre.valor;
    }
    if(cfg.empresa_logo?.valor){
      S.empresaLogo=cfg.empresa_logo.valor;
      const logoEl=$('header-logo');
      if(logoEl)logoEl.innerHTML='<img src="'+cfg.empresa_logo.valor+'" style="height:32px;border-radius:6px"/>';
      const loginLogo=$('login-logo-container');
      if(loginLogo)loginLogo.innerHTML='<img src="'+cfg.empresa_logo.valor+'" style="max-height:60px;max-width:200px;border-radius:8px"/>';
    }
    if(cfg.empresa_nombre?.valor){
      S.empresaNombre=cfg.empresa_nombre.valor;
      const loginLogo=$('login-logo-container');
      if(loginLogo&&!S.empresaLogo)loginLogo.innerHTML='<div class="login-logo">'+cfg.empresa_nombre.valor.toUpperCase()+'</div>';
    }
  }catch(e){}
}
cargarConfigGlobal();

async function crearArea(){
  const nombre=$('new-area-nombre')?.value?.trim();
  const jefe_id=$('new-area-jefe')?.value||null;
  const email=$('new-area-email')?.value?.trim();
  if(!nombre){toast('El nombre es requerido','error');return}
  try{
    await api('POST','/areas',{nombre,jefe_id,email});
    toast('Área creada','success');
    closeM();
    rConfig();
  }catch(e){toast(e.message,'error')}
}

async function editarArea(id,nombre,jefe_id,email){
  const users=(S.usuarios||[]).filter(u=>u.rol==='jefe'||u.rol==='admin');
  showM('Editar área','<div class=form-grid><div class=field full><label>NOMBRE</label><input type=text id=edit-area-nombre value='+esc(nombre)+'/></div><div class=field><label>JEFE (opcional)</label><select id=edit-area-jefe><option value=>— Sin jefe —</option>'+users.map(u=>'<option value='+u.id+' '+(u.id===jefe_id?'selected':'')+'>'+esc(u.nombre)+'</option>').join('')+'</select></div><div class=field><label>EMAIL</label><input type=email id=edit-area-email value='+esc(email||'')+'/></div></div><div style=display:flex;gap:10px;margin-top:16px><button class=btn btn-danger onclick=eliminarArea(\''+id+'\')>Eliminar</button><button class=btn btn-primary style=margin-left:auto onclick=guardarArea(\''+id+'\')>Guardar</button></div>');
}

async function guardarArea(id){
  const nombre=$('edit-area-nombre')?.value?.trim();
  const jefe_id=$('edit-area-jefe')?.value||null;
  const email=$('edit-area-email')?.value?.trim();
  if(!nombre){toast('El nombre es requerido','error');return}
  try{
    await api('PUT',`/areas/${id}`,{nombre,jefe_id,email});
    toast('Área actualizada','success');
    closeM();
    rConfig();
  }catch(e){toast(e.message,'error')}
}

async function eliminarArea(id){
  if(!confirm('¿Eliminar esta área? Los usuarios quedan sin área asignada.'))return;
  try{
    await api('DELETE',`/areas/${id}`);
    toast('Área eliminada','success');
    closeM();
    rConfig();
  }catch(e){toast(e.message,'error')}
}
