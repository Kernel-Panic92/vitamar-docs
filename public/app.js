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
  {id:'pendientes',l:'Pendientes',i:'⏳',s:'f',roles:['admin','contador','tesorero']},
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
  
  fetch('/api/version').then(r=>r.json()).then(d=>{
    const el=document.getElementById('app-version');
    if(el&&d.version)el.textContent='v'+d.version+' — Vitamar Docs';
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
  // Badges removed from menu
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function rDash(){
  const d=await api('GET','/dashboard');
  const r=d.resumen;
  const rol=S.usuario?.rol;
  const esComprador=rol==='comprador';
  const esTesorero=['tesorero'].includes(rol);
  const sync=await checkSyncStatus();
  if(sync.sincronizando){
    startSyncPoll();
  }else{
    stopSyncPoll();
  }
  let stats='';
  if(esComprador){
    stats+=stat('Pendientes aprobar',r.recibidas+r.revision,'var(--accent2)','orange');
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
          <button class="btn btn-secondary btn-sm" onclick="rescanearTodo()" title="Re-escanear"><span style="font-size:12px">⟲</span> Rescanear</button>
          <button class="btn btn-secondary btn-sm" onclick="iniciarSync()"><span style="font-size:14px">↻</span> Sync</button>
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
function initFiltros(){const k=getFiltrosKey();const f=JSON.parse(localStorage.getItem(k)||'{}');if(f.categoria_id||f.proveedor_id)fBusqueda=f}

async function rFacturas(filtro){
  if(filtro!==undefined)fFiltro=filtro;
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
  const cnts={todas:f.total||all.length};
  ['recibida','revision','aprobada','causada','rechazada'].forEach(e=>cnts[e]=all.filter(x=>x.estado===e).length);
  const fbs=[{id:'todas',l:'Todas'},{id:'recibida',l:'Recibidas'},{id:'revision',l:'En revisión'},{id:'aprobada',l:'Aprobadas'},{id:'causada',l:'Causadas'},{id:'rechazada',l:'Rechazadas'}].map(fb=>`<button class="fb${fFiltro===fb.id?' active':''}" onclick="rFacturas('${fb.id}')">${fb.l}<span class="fc">${cnts[fb.id]||0}</span></button>`).join('');
  
  if(!S.proveedores)S.proveedores=await api('GET','/proveedores');
  if(!S.cats?.length)S.cats=await api('GET','/categorias');
  const provOpts=S.proveedores.map(p=>`<option value="${p.id}" ${fBusqueda.proveedor_id===p.id?'selected':''}>${esc(p.nombre)}</option>`).join('');
  const catOpts=S.cats.map(c=>`<option value="${c.id}" ${fBusqueda.categoria_id===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('');
  
  const hayFiltros=fBusqueda.numero||fBusqueda.nit||fBusqueda.fecha_desde||fBusqueda.fecha_hasta||fBusqueda.valor_min||fBusqueda.valor_max||fBusqueda.proveedor_id||fBusqueda.categoria_id||fBusqueda.buscar;
  
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Facturas</div><div class="page-sub">${f.total||0} factura(s) encontrada(s)</div></div><button class="btn btn-primary" onclick="mNuevaF()">+ Nueva factura</button></div>
    <div class="filters">${fbs}</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-weight:600;font-size:13px">Filtros de búsqueda</span>
        ${hayFiltros?`<button onclick="limpiarFiltrosF()" style="background:rgba(247,97,79,.1);border:1px solid rgba(247,97,79,.2);color:var(--danger);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">✕ Limpiar</button>`:''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Buscar</label><input type="text" id="ff-buscar" placeholder="N°, proveedor, NIT..." value="${esc(fBusqueda.buscar)}" onkeydown="if(event.key==='Enter')aplicarFiltrosF()"></div>
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">N° Factura</label><input type="text" id="ff-numero" value="${esc(fBusqueda.numero)}"></div>
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">NIT</label><input type="text" id="ff-nit" value="${esc(fBusqueda.nit)}"></div>
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Proveedor</label><select id="ff-proveedor"><option value="">Todos</option>${provOpts}</select></div>
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Categoría</label><select id="ff-categoria"><option value="">Todas</option>${catOpts}</select></div>
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Desde</label><input type="date" id="ff-fd" value="${fBusqueda.fecha_desde}"></div>
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Hasta</label><input type="date" id="ff-fh" value="${fBusqueda.fecha_hasta}"></div>
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Valor mín</label><input type="number" id="ff-vmin" value="${fBusqueda.valor_min}"></div>
        <div><label style="font-size:10px;text-transform:uppercase;color:var(--muted)">Valor máx</label><input type="number" id="ff-vmax" value="${fBusqueda.valor_max}"></div>
      </div>
      <button onclick="aplicarFiltrosF()" class="btn btn-primary btn-sm" style="margin-top:12px">🔍 Buscar</button>
    </div>
    <div class="tbl">
      <div class="tbl-head"><div class="tbl-title">${all.length} factura(s)</div></div>
      <table><thead><tr><th># Factura</th><th>Centro</th><th>Proveedor</th><th>Categoría</th><th>Valor</th><th>Estado</th><th>Recibida</th><th></th></tr></thead>
      <tbody>${all.length?all.map(f=>`<tr onclick="abrirF('${f.id}')"><td class="mono">${esc(f.numero_factura)}</td><td style="font-size:12px;color:var(--muted)">${esc(f.centro_operacion_nombre||'—')}</td><td style="font-weight:500">${esc(f.proveedor_nombre||f.nombre_emisor||'—')}</td><td>${ctag(f.categoria_color,f.categoria_nombre)}</td><td style="font-weight:500">${fmt(f.valor_total||f.valor||0)}</td><td>${bdg(f.estado)}</td><td style="color:var(--muted);font-size:12px">${f.fecha_factura?fdate(f.fecha_factura):fdatetime(f.recibida_en)}</td><td>${f.archivo_pdf?`<span onclick="event.stopPropagation();verPdf('${f.id}')" style="color:var(--accent);font-size:16px;cursor:pointer">📄</span>`:''}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">Sin facturas</td></tr>'}</tbody></table>
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
let pendBusqueda='';
let pendFiltro='todas';
async function rPend(){
  pendBusqueda=$('pend-buscar')?.value||'';
  const [r1,r2,r3]=await Promise.all([
    api('GET','/facturas?estado=recibida&limit=100'),
    api('GET','/facturas?estado=revision&limit=100'),
    api('GET','/facturas?estado=causada&limit=100')
  ]);
  let all=[...(r1.data||[]),...(r2.data||[]),...(r3.data||[])];
  if(pendFiltro!=='todas'){
    if(pendFiltro==='porAprobar')all=all.filter(x=>['recibida','revision'].includes(x.estado));
    else if(pendFiltro==='porVencer')all=all.filter(x=>x.limite_pago&&new Date(x.limite_pago)<=new Date(Date.now()+7*24*60*60*1000));
    else if(pendFiltro==='porPagar')all=all.filter(x=>x.estado==='causada');
  }
  if(pendBusqueda){
    const b=pendBusqueda.toLowerCase();
    all=all.filter(x=>(x.numero_factura||'').toLowerCase().includes(b)||(x.proveedor_nombre||'').toLowerCase().includes(b));
  }
  const porAprobar=pendFiltro==='todas'?all.filter(x=>['recibida','revision'].includes(x.estado)):[];
  const porVencer=pendFiltro==='todas'?all.filter(x=>x.limite_pago&&new Date(x.limite_pago)<=new Date(Date.now()+7*24*60*60*1000)):[];
  const porPagar=pendFiltro==='todas'?all.filter(x=>x.estado==='causada'):[];
  
  function renderItem(f,color){
    const vencio=f.limite_pago&&new Date(f.limite_pago)<new Date();
    return `<div class="tbl" style="cursor:pointer;padding:16px 20px;display:flex;align-items:center;gap:20px;border-left:4px solid ${color}" onclick="abrirF('${f.id}')">
      <div style="flex:1"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span class="mono">${esc(f.numero_factura)}</span>${bdg(f.estado)}</div>
      <div style="font-weight:500;margin-bottom:4px">${esc(f.proveedor_nombre||'Desconocido')}</div>
      <div style="font-size:12px;color:var(--muted)">${esc(f.centro_operacion_nombre||'Sin CO')} - Recibida: ${fdatetime(f.recibida_en)}</div></div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px"><div style="font-size:18px;font-weight:700">${fmt(f.valor_total||f.valor||0)}</div>${f.archivo_pdf?`<button onclick="event.stopPropagation();verPdf('${f.id}')" class="btn btn-secondary btn-sm">PDF</button>`:''}${f.limite_pago?`<div style="font-size:12px;color:${vencio?'var(--danger)':'var(--muted)'}">Vence: ${fdate(f.limite_pago)}</div>`:''}</div>
    </div>`;
  }
  const fbts=[{id:'todas',l:'Todas'},{id:'porAprobar',l:'Por aprobar'},{id:'porVencer',l:'x Vencer'},{id:'porPagar',l:'x Pagar'}].map(x=>`<button class="fb${pendFiltro===x.id?' active':''}" onclick="pendFiltro='${x.id}';rPend()">${x.l}</button>`).join('');
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Pendientes</div><div class="page-sub">${all.length} factura(s)</div></div></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">${fbts}</div>
      <input type="text" id="pend-buscar" placeholder="Buscar por # factura o proveedor..." value="${esc(pendBusqueda)}" onkeydown="if(event.key==='Enter')rPend()" style="width:100%">
    </div>
    ${pendFiltro==='todas'?(porAprobar.length?`<div style="margin-bottom:20px"><div style="font-size:11px;text-transform:uppercase;color:#f97316;font-weight:600;margin-bottom:10px">Por aprobar (${porAprobar.length})</div>${porAprobar.map(f=>renderItem(f,'#f97316')).join('')}</div>`:'')+(porVencer.length?`<div style="margin-bottom:20px"><div style="font-size:11px;text-transform:uppercase;color:var(--danger);font-weight:600;margin-bottom:10px">Proximas a vencer (${porVencer.length})</div>${porVencer.map(f=>renderItem(f,'var(--danger)')).join('')}</div>`:'')+(porPagar.length?`<div style="margin-bottom:20px"><div style="font-size:11px;text-transform:uppercase;color:#A78BFA;font-weight:600;margin-bottom:10px">Por pagar (${porPagar.length})</div>${porPagar.map(f=>renderItem(f,'#A78BFA')).join('')}</div>`:''):all.length?all.map(f=>renderItem(f,'var(--accent)')).join(''):'<div class="empty">Sin resultados</div>'}
    ${all.length===0&&pendFiltro==='todas'?'<div class="empty">No hay facturas pendientes</div>':''}
  `;
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
    <div class="page-header"><div><div class="page-title">Causacion</div><div class="page-sub">${all.length} factura(s) por causar</div></div></div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
      <input type="text" id="caus-buscar" placeholder="Buscar por # factura o proveedor..." value="${esc(causBusqueda)}" onkeydown="if(event.key==='Enter')rCaus()" style="width:100%">
    </div>
    <div style="display:grid;gap:12px">${all.length?all.map(f=>`<div class="tbl" style="cursor:pointer;padding:16px 20px;display:flex;align-items:center;gap:20px" onclick="abrirF('${f.id}')">
      <div style="flex:1"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span class="mono">${esc(f.numero_factura)}</span>${bdg(f.estado)}</div>
      <div style="font-weight:500;margin-bottom:4px">${esc(f.proveedor_nombre||'Desconocido')}</div>
      <div style="font-size:12px;color:var(--muted)">${esc(f.centro_operacion_nombre||'Sin CO')} - ${f.fecha_factura?'Fact: '+fdate(f.fecha_factura):''} ${f.limite_pago?'- Vence: '+fdate(f.limite_pago):''}</div></div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px"><div style="font-size:18px;font-weight:700">${fmt(f.valor_total||f.valor||0)}</div>${f.archivo_pdf?`<button onclick="event.stopPropagation();verPdf('${f.id}')" class="btn btn-secondary btn-sm">PDF</button>`:''}</div>
    </div>`).join(''):'<div class="empty">No hay facturas por causar</div>'}</div>`;
}

// ─── FACTURA DETALLE ─────────────────────────────────────────────────────────
async function abrirF(id){
  const f=await api('GET',`/facturas/${id}`);
  if(!S.cats?.length)S.cats=await api('GET','/categorias');
  const catsPref=f.proveedor_id?(await api('GET',`/proveedores/${f.proveedor_id}/categorias-preferidas`)||[]):[];
  const ei=EORD.indexOf(f.estado);
  const prog=EORD.map((e,i)=>{const d=i<=ei;return`<div style="display:flex;align-items:center"><div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:12px;height:12px;border-radius:50%;border:2px solid var(--border);background:${d?'var(--accent)':'var(--surface2)'};flex-shrink:0"></div><span style="font-size:10px;color:${d?'var(--accent)':'var(--muted)'};margin-top:4px">${EM[e]?.l||e}</span></div>${i<EORD.length-1?`<div style="width:24px;height:2px;background:${d?'var(--accent)':'var(--border)'}"></div>`:''}</div>`}).join('');
  const acc=[];
  if(['recibida','revision'].includes(f.estado)){acc.push(`<button class="btn btn-success btn-sm" onclick="mAprobar('${id}')">Aprobar</button>`);acc.push(`<button class="btn btn-danger btn-sm" onclick="mRechazar('${id}')">Rechazar</button>`);}
  if(f.estado==='aprobada')acc.push(`<button class="btn btn-success btn-sm" onclick="acF('${id}','causar')">Causar</button>`);
  const isTesorero=['admin','tesorero'].includes(S.usuario?.rol);
  if(f.estado==='causada'&&isTesorero){
    if(!f.soporte_pago)acc.push(`<button class="btn btn-warning btn-sm" onclick="mSubirSoporte('${id}')">Adjuntar soporte</button>`);
    if(f.soporte_pago)acc.push(`<button class="btn btn-secondary btn-sm" onclick="verSoporte('${id}')">Ver soporte</button>`);
    acc.push(`<button class="btn btn-primary btn-sm" onclick="mPagar('${id}')">Marcar pagada</button>`);
  }
  showM(`Factura ${f.numero_factura}`,`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Proveedor</div><div style="font-weight:600;margin-top:4px">${esc(f.proveedor_nombre||f.nombre_emisor||'—')}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">NIT</div><div style="font-weight:600;margin-top:4px">${esc(f.nit_emisor||f.proveedor_nit||'—')}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Valor total</div><div style="font-weight:700;font-size:18px;margin-top:4px">${fmt(f.valor_total||0)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">IVA</div><div style="font-weight:600;margin-top:4px">${fmt(f.valor_iva||0)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Fecha factura</div><div style="font-weight:500;margin-top:4px">${fdate(f.fecha_factura||f.recibida_en)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Fecha recibida</div><div style="font-weight:500;margin-top:4px">${fdatetime(f.recibida_en)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Centro operacion</div><div style="font-weight:600;margin-top:4px">${esc(f.centro_operacion_nombre||'—')}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Estado</div><div style="margin-top:4px">${bdg(f.estado)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Limite DIAN</div><div style="font-weight:600;margin-top:4px;color:${f.limite_dian&&new Date(f.limite_dian)<new Date()?'var(--danger)':'var(--success)'}">${fdate(f.limite_dian)}</div></div>
      <div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Limite pago</div><div style="font-weight:600;margin-top:4px;color:${f.limite_pago&&new Date(f.limite_pago)<new Date()?'var(--danger)':'var(--text)'}">${fdate(f.limite_pago||'—')}</div></div>
      ${f.orden_compra||f.referencia?`<div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Orden compra</div><div style="font-weight:600;margin-top:4px">${esc(f.orden_compra||f.referencia||'—')}</div></div>`:''}
      ${f.centro_costos?`<div style="background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Centro costos</div><div style="font-weight:600;margin-top:4px">${esc(f.centro_costos)}</div></div>`:''}
      <div style="grid-column:1/-1;background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Categoria</div><select id="fc-cat" style="margin-top:4px;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);width:100%" onchange="cambiarCat('${id}',this.value)"><option value="">- Seleccionar categoria -</option>${S.cats.sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(c=>`<option value="${c.id}" ${f.categoria_id===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}</select>${catsPref.length?`<div style="font-size:11px;color:var(--muted);margin-top:8px">Mas usadas: ${catsPref.map(cp=>`<span onclick="cambiarCat('${id}','${cp.id}')" style="cursor:pointer;padding:4px 8px;background:var(--surface);border-radius:4px;font-size:12px;margin-right:4px">${esc(cp.nombre)} (${cp.contador})</span>`).join('')}</div>`:''}</div>
      ${f.descripcion_gasto?`<div style="grid-column:1/-1;background:var(--surface2);padding:12px;border-radius:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Descripcion</div><div style="margin-top:4px">${esc(f.descripcion_gasto)}</div></div>`:''}
    </div>
    <div style="margin-bottom:16px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:12px">Progreso</div><div style="display:flex;align-items:center;overflow-x:auto">${prog}</div></div>
    <div class="modal-footer">${f.archivo_pdf?`<button onclick="verPdf('${id}')" class="btn btn-secondary btn-sm">PDF</button>`:''}<button class="btn btn-secondary btn-sm" onclick="closeM()">Cerrar</button>${acc.join('')}</div>`,640);
}

async function mAprobar(id){
  const f=await api('GET',`/facturas/${id}`);
  if(!S.centros)S.centros=await api('GET','/centros');
  const co=S.centros.map(c=>`<option value="${c.id}" ${f.centro_operacion_id===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('');
  showM('Aprobar factura',`
    <div style="margin-bottom:16px;padding:12px;background:rgba(79,142,247,.1);border-radius:8px">
      <div style="font-size:12px;color:var(--muted)">Factura</div>
      <div style="font-weight:700;font-size:16px">${esc(f.numero_factura)}</div>
      <div style="font-size:14px;margin-top:4px">${esc(f.proveedor_nombre||f.nombre_emisor||'—')}</div>
      <div style="font-size:20px;font-weight:700;color:var(--accent);margin-top:8px">${fmt(f.valor_total||0)}</div>
    </div>
    <div class="field"><label>CENTRO DE OPERACION *</label><select id="ap-centro"><option value="">- Seleccionar -</option>${co}</select></div>
    <div class="form-grid">
      <div class="field"><label>CENTRO DE COSTOS</label><input type="text" id="ap-cc" value="${esc(f.centro_costos||'')}"/></div>
      <div class="field"><label>REFERENCIA</label><input type="text" id="ap-ref" value="${esc(f.orden_compra||f.referencia||'')}"/></div>
    </div>
    <div class="field"><label>DESCRIPCION GASTO</label><textarea id="ap-desc" rows="3">${esc(f.descripcion_gasto||'')}</textarea></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-success" onclick="doAprobar('${id}')">Confirmar</button></div>
  `,560);
}

async function doAprobar(id){
  const centro_id=$('ap-centro')?.value;
  if(!centro_id){toast('Selecciona el centro de operacion','error');return}
  const b={
    centro_operacion_id:centro_id,
    centro_costos:$('ap-cc')?.value?.trim()||null,
    descripcion_gasto:$('ap-desc')?.value?.trim()||null,
    referencia:$('ap-ref')?.value?.trim()||null
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
    <div class="field"><label>MOTIVO *</label><textarea id="rechazo-motivo" rows="4" placeholder="Razon del rechazo..."></textarea></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-danger" onclick="doRechazar('${id}')">Confirmar</button></div>
  `,400);
}

async function doRechazar(id){
  const motivo=$('rechazo-motivo')?.value?.trim();
  if(!motivo){toast('Ingresa el motivo','error');return}
  try{
    await api('PATCH',`/facturas/${id}/rechazar`,{motivo});
    closeM();
    toast('Factura rechazada','success');
    goTo(S.view);
  }catch(e){toast(e.message,'error')}
}

async function acF(id,a){
  let b={};
  try{await api('PATCH',`/facturas/${id}/${a}`,b);closeM();toast('Accion ejecutada','success');goTo(S.view)}catch(e){toast(e.message,'error')}
}

// ─── NUEVA FACTURA ───────────────────────────────────────────────────────────
async function mNuevaF(){
  if(!S.areas?.length)S.areas=await api('GET','/areas');
  if(!S.cats?.length)S.cats=await api('GET','/categorias');
  const ao=S.areas.map(a=>`<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
  const co=S.cats.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  window.gF=async()=>{
    const n=$('fn-num').value.trim();if(!n){toast('Numero requerido','error');return}
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
    <div class="field"><label>NUMERO *</label><input id="fn-num" placeholder="FV-2025-0001"/></div>
    <div class="form-grid">
      <div class="field"><label>VALOR</label><input id="fn-val" type="number"/></div>
      <div class="field"><label>IVA</label><input id="fn-iva" type="number"/></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>CATEGORIA</label><select id="fn-cat"><option value="">- Seleccionar -</option>${co}</select></div>
      <div class="field"><label>AREA</label><select id="fn-area"><option value="">- Seleccionar -</option>${ao}</select></div>
    </div>
    <div class="field"><label>LIMITE PAGO</label><input id="fn-lp" type="date"/></div>
    <div class="field"><label>OBSERVACIONES</label><textarea id="fn-ob" rows="2"></textarea></div>
    <div class="field"><label>PDF</label><input id="fn-pdf" type="file" accept=".pdf"/></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="gF()">Crear</button></div>`,560);
}

// ─── SOPORTE PAGO ──────────────────────────────────────────────────────────
function mSubirSoporte(id){
  showM('Soporte de pago',`
    <div class="field"><label>ARCHIVO (PDF, PNG, JPG)</label><input type="file" id="sp-archivo" accept=".pdf,.png,.jpg,.jpeg" style="color:var(--text)"/></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="doSubirSoporte('${id}')">Subir</button></div>
  `,400);
}

async function doSubirSoporte(id){
  const fileInput=$('sp-archivo');
  if(!fileInput?.files?.length){toast('Selecciona archivo','error');return}
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
    <div style="padding:20px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">?</div>
      <p>Esta factura ha sido pagada?</p>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">No</button><button class="btn btn-primary" onclick="acF('${id}','pagar')">Si, pagada</button></div>
  `,380);
}

// ─── CATEGORÍAS ─────────────────────────────────────────────────────────────
let catExp=null;
async function rCats(){
  S.areas=await api('GET','/areas');S.cats=await api('GET','/categorias');
  $('content').innerHTML=`<div class="page-header"><div><div class="page-title">Categorias</div><div class="page-sub">Tipos de compra</div></div><button class="btn btn-primary" onclick="mCat()">+ Nueva</button></div><div id="clist"></div>`;
  renderClist();
}
function renderClist(){
  const el=$('clist');if(!el)return;
  if(!S.cats.length){el.innerHTML='<div class="empty">No hay categorias</div>';return}
  el.innerHTML=S.cats.map(cat=>{const an=(cat.areas||[]).map(a=>a.nombre);const ex=catExp===cat.id;
    return`<div class="tbl" style="margin-bottom:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:14px;padding:14px 20px;cursor:pointer" onclick="togCat('${cat.id}')">
        <span style="width:12px;height:12px;border-radius:50%;background:${cat.color};flex-shrink:0"></span>
        <div style="flex:1"><div style="font-weight:600">${esc(cat.nombre)}</div><div style="font-size:12px;color:var(--muted)">${esc(cat.descripcion||'')}</div></div>
        <div style="display:flex;gap:6px" onclick="event.stopPropagation()"><button class="btn btn-secondary btn-sm" onclick="mCat('${cat.id}')">Edit</button><button class="btn btn-danger btn-sm" onclick="delCat('${cat.id}')">X</button></div>
        <span style="color:var(--muted)">${ex?'-':'+'}</span>
      </div>
    </div>`}).join('');
}
function togCat(id){catExp=catExp===id?null:id;renderClist()}
async function mCat(id){
  let cat=null;
  if(id)cat=S.cats.find(c=>c.id===id)||await api('GET',`/categorias/${id}`);
  const form=cat?{nombre:cat.nombre,desc:cat.descripcion||'',color:cat.color||'#3B82F6',pasos:[...(cat.pasos||[])]}:{nombre:'',desc:'',color:'#3B82F6',pasos:['recepcion','revision','aprobacion','causacion']};
  function rr(){
    const cp=$('cp');if(cp)cp.innerHTML=COLS.map(c=>`<div class="cd${form.color===c?' sel':''}" style="background:${c}" onclick="sCo('${c}')"></div>`).join('');
    const cpa=$('cpa');if(cpa)cpa.innerHTML=PASOS.map(p=>{const s=form.pasos.includes(p.id);const f=p.id==='recepcion';const onclickAttr=f?'':'onclick="tP(\''+p.id+'\')"';const checked=s&&!f?' sel':''; return`<div class="ci${checked}" ${onclickAttr}><div class="cb${checked}">${s&&!f?'✓':''}</div><div style="flex:1"><span style="font-size:13px">${p.l}</span></div>${f?'<span class="tag">oblig</span>':''}</div>`}).join('');
  }
  window.sCo=c=>{form.color=c;rr()};
  window.tP=pid=>{form.pasos=form.pasos.includes(pid)?form.pasos.filter(x=>x!==pid):[...form.pasos,pid];rr()};
  window.saveCat=async()=>{const n=$('cn').value.trim();if(!n){toast('Nombre requerido','error');return}form.nombre=n;form.desc=$('cd').value.trim();try{if(id)await api('PUT',`/categorias/${id}`,{nombre:form.nombre,descripcion:form.desc,color:form.color,pasos:form.pasos});else await api('POST','/categorias',{nombre:form.nombre,descripcion:form.desc,color:form.color,pasos:form.pasos});closeM();toast('Categoria guardada','success');await rCats()}catch(e){toast(e.message,'error')}};
  showM(id?'Editar categoria':'Nueva categoria',`
    <div class="field"><label>NOMBRE *</label><input id="cn" value="${esc(form.nombre)}"/></div>
    <div class="field"><label>DESCRIPCION</label><textarea id="cd" rows="2">${esc(form.desc)}</textarea></div>
    <div style="margin-bottom:14px"><label style="font-size:11px;text-transform:uppercase;margin-bottom:8px;display:block">COLOR</label><div class="cp" id="cp"></div></div>
    <div style="margin-bottom:14px"><label style="font-size:11px;text-transform:uppercase;margin-bottom:8px;display:block">PASOS</label><div id="cpa"></div></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="saveCat()">Guardar</button></div>`,560);
  rr();
}
async function delCat(id){if(!confirm('Desactivar categoria?'))return;try{await api('DELETE',`/categorias/${id}`);toast('Categoria desactivada','success');await rCats()}catch(e){toast(e.message,'error')}}

// ─── CENTROS ──────────────────────────────────────────────────────────────
async function rCentros(){
  const centros=await api('GET','/centros');
  $('content').innerHTML=`
    <div class="page-header"><div><div class="page-title">Centros de Operacion</div><div class="page-sub">Territorios y sedes</div></div><button class="btn btn-primary" onclick="mCentro()">+ Nuevo</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
      ${centros.length?centros.map(c=>`<div class="tbl" style="padding:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <div style="font-weight:700;font-size:16px">${esc(c.nombre)}</div>
          <span class="badge ${c.activo?'b-aprobada':'b-rechazada'}">${c.activo?'Activo':'Inactivo'}</span>
        </div>
        ${c.codigo?`<div style="font-size:12px;color:var(--muted)">${esc(c.codigo)}</div>`:''}
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="mCentro('${c.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="delCentro('${c.id}','${esc(c.nombre)}')">X</button>
        </div>
      </div>`).join(''):'<div class="empty">No hay centros</div>'}
    </div>`;
}

async function mCentro(id){
  let centro=null;
  if(id)centro=await api('GET',`/centros/${id}`);
  const esNuevo=!id;
  window.saveCentro=async()=>{
    const n=$('cn-nombre')?.value?.trim();
    if(!n){toast('Nombre requerido','error');return}
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
    <div class="field"><label>NOMBRE *</label><input id="cn-nombre" value="${esc(centro?.nombre||'')}"/></div>
    <div class="form-grid">
      <div class="field"><label>CODIGO</label><input id="cn-codigo" value="${esc(centro?.codigo||'')}"/></div>
      <div class="field"><label>EMAIL</label><input id="cn-email" value="${esc(centro?.email||'')}"/></div>
    </div>
    <div class="field"><label>DIRECCION</label><input id="cn-dir" value="${esc(centro?.direccion||'')}"/></div>
    <div class="form-grid">
      <div class="field"><label>TELEFONO</label><input id="cn-tel" value="${esc(centro?.telefono||'')}"/></div>
      <div class="field"><label><input type="checkbox" id="cn-activo" ${centro?.activo!==false?'checked':''}/> Activo</label></div>
    </div>
    <div class="field"><label>DESCRIPCION</label><textarea id="cn-desc" rows="2">${esc(centro?.descripcion||'')}</textarea></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeM()">Cancelar</button><button class="btn btn-primary" onclick="saveCentro()">Guardar</button></div>
  `,500);
}

async function delCentro(id,nombre){
  if(!confirm('Eliminar centro "'+nombre+'"?'))return;
  try{await api('DELETE',`/centros/${id}`);toast('Centro eliminado','success');rCentros()}catch(e){toast(e.message,'error')}
}

async function cambiarCat(facturaId,catId){
  try{
    await api('PATCH',`/facturas/${facturaId}/categoria`,{categoria_id:catId});
    toast('Categoria actualizada','success');
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
