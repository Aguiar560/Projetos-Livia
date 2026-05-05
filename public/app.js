// ── Agenda ────────────────────────────────────────────────────────────────────
let agendaYear  = new Date().getFullYear();
let agendaMonth = new Date().getMonth(); // 0-indexed
let agendaStatusFilter = '';
let agendaDateType = 'all';

const DATE_TYPES = {
  inscription_start:    'Início inscrição',
  inscription_end:      'Fim inscrição',
  inscription_response: 'Resp. inscrição',
  project_start:        'Início projeto',
  project_end:          'Fim projeto'
};

function openAgenda() {
  document.getElementById('grid-view').style.display      = 'none';
  document.getElementById('detail-view').style.display    = 'none';
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('agenda-view').style.display    = 'block';
  document.querySelectorAll('.sidebar-btn[data-filter]').forEach(b => b.classList.remove('active'));
  document.getElementById('agenda-sidebar-btn').classList.add('active');
  document.getElementById('dashboard-sidebar-btn').classList.remove('active');
  renderAgenda();
}

function closeAgenda() {
  document.getElementById('agenda-view').style.display = 'none';
  document.getElementById('grid-view').style.display   = 'block';
  document.getElementById('agenda-sidebar-btn').classList.remove('active');
}

function agendaChangeMonth(delta) {
  agendaMonth += delta;
  if (agendaMonth > 11) { agendaMonth = 0; agendaYear++; }
  if (agendaMonth < 0)  { agendaMonth = 11; agendaYear--; }
  renderAgenda();
}

function agendaGoToday() {
  agendaYear  = new Date().getFullYear();
  agendaMonth = new Date().getMonth();
  renderAgenda();
}

function agendaSetStatus(btn, val) {
  document.querySelectorAll('#agenda-filters .agenda-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  agendaStatusFilter = val;
  renderAgenda();
}

function agendaSetDateType(btn, val) {
  document.querySelectorAll('#agenda-date-filters .agenda-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  agendaDateType = val;
  renderAgenda();
}

function getAgendaEvents() {
  const events = {}; // { 'YYYY-MM-DD': [ { project, type, label } ] }
  const types = agendaDateType === 'all' ? Object.keys(DATE_TYPES) : [agendaDateType];

  allProjects.forEach(p => {
    if (agendaStatusFilter && p.status !== agendaStatusFilter) return;
    types.forEach(type => {
      const raw = p[type];
      if (!raw) return;
      const key = String(raw).substring(0, 10);
      if (!events[key]) events[key] = [];
      events[key].push({ project: p, type, label: DATE_TYPES[type] });
    });
  });
  return events;
}

function agendaSlug(status) {
  if (status === 'em andamento') return 'andamento';
  if (status === 'editais abertos') return 'editais';
  return status;
}

function renderAgenda() {
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const DAYS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  document.getElementById('agenda-month-label').textContent =
    `${MONTHS[agendaMonth]} ${agendaYear}`;

  const events  = getAgendaEvents();
  const today   = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Primeiro dia do mês e quantos dias tem
  const firstDay = new Date(agendaYear, agendaMonth, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(agendaYear, agendaMonth + 1, 0).getDate();
  const daysInPrev  = new Date(agendaYear, agendaMonth, 0).getDate();

  let html = DAYS.map(d => `<div class="agenda-dow">${d}</div>`).join('');

  // Células do mês anterior
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const m   = agendaMonth === 0 ? 12 : agendaMonth;
    const y   = agendaMonth === 0 ? agendaYear - 1 : agendaYear;
    const key = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    html += renderAgendaCell(day, key, events, true);
  }

  // Células do mês atual
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${agendaYear}-${String(agendaMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html += renderAgendaCell(d, key, events, false, key === todayKey);
  }

  // Células do mês seguinte para completar a grade
  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    const m = agendaMonth === 11 ? 1 : agendaMonth + 2;
    const y = agendaMonth === 11 ? agendaYear + 1 : agendaYear;
    const key = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html += renderAgendaCell(d, key, events, true);
  }

  document.getElementById('agenda-grid').innerHTML = html;
}

function renderAgendaCell(dayNum, key, events, otherMonth, isToday = false) {
  const evs = events[key] || [];
  const cls = ['agenda-day',
    otherMonth ? 'other-month' : '',
    isToday    ? 'today'       : '',
    evs.length ? 'has-events'  : ''
  ].filter(Boolean).join(' ');

  const MAX_VISIBLE = 2;
  const visible = evs.slice(0, MAX_VISIBLE);
  const extra   = evs.length - MAX_VISIBLE;

  const evHtml = visible.map(ev => {
    const slug = agendaSlug(ev.project.status);
    const nameShort = esc(ev.project.name).substring(0, 18);
    return `<div class="agenda-event ev-${slug}" onclick="agendaShowPopup(event,'${key}')" title="${esc(ev.project.name)} — ${ev.label}">${nameShort}</div>`;
  }).join('');

  const moreHtml = extra > 0
    ? `<div class="agenda-more" onclick="agendaShowPopup(event,'${key}')">+${extra} mais</div>`
    : '';

  return `<div class="${cls}">
    <div class="agenda-day-num">${dayNum}</div>
    ${evHtml}${moreHtml}
  </div>`;
}

function agendaShowPopup(e, key) {
  e.stopPropagation();
  const events = getAgendaEvents();
  const evs = events[key] || [];
  if (!evs.length) return;

  const [y, m, d] = key.split('-');
  const dateLabel = `${d}/${m}/${y}`;

  const popup  = document.getElementById('agendaPopup');
  const overlay = document.getElementById('agendaOverlay');

  popup.innerHTML = `
    <div class="agenda-popup-title">
      ${dateLabel}
      <button class="agenda-popup-close" onclick="closeAgendaPopup()">✕</button>
    </div>
    ${evs.map(ev => {
      const slug = agendaSlug(ev.project.status);
      return `<div class="agenda-popup-item ev-${slug}" style="background:var(--surface2);border-left:3px solid var(--${slug})"
        onclick="closeAgendaPopup();closeAgenda();openProject(${ev.project.id})">
        <div class="agenda-popup-name">${esc(ev.project.name)}</div>
        <div class="agenda-popup-type">${ev.label} · <span style="text-transform:capitalize">${ev.project.status}</span></div>
      </div>`;
    }).join('')}`;

  // Posiciona o popup perto do clique
  const rect = e.target.closest('.agenda-day').getBoundingClientRect();
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  popup.style.display = 'block';
  const pw = popup.offsetWidth;
  const ph = popup.offsetHeight;
  let left = rect.left;
  let top  = rect.bottom + 6;
  if (left + pw > winW - 10) left = winW - pw - 10;
  if (top + ph > winH - 10)  top  = rect.top - ph - 6;
  popup.style.left = `${Math.max(8, left)}px`;
  popup.style.top  = `${Math.max(8, top)}px`;
  overlay.classList.add('open');
}

function closeAgendaPopup() {
  document.getElementById('agendaPopup').style.display = 'none';
  document.getElementById('agendaOverlay').classList.remove('open');
}

// ── Hamburger Menu ────────────────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const btn = document.getElementById('hamburgerBtn');
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    btn.classList.add('open');
  }
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.getElementById('hamburgerBtn').classList.remove('open');
}

// ── Currency helper ───────────────────────────────────────────────────────────
const CURRENCY_MAP = {
  BRL: { locale: 'pt-BR', code: 'BRL', symbol: 'R$' },
  USD: { locale: 'en-US', code: 'USD', symbol: 'US$' },
  EUR: { locale: 'de-DE', code: 'EUR', symbol: '€' }
};

function formatBudget(value, currency) {
  if (value === null || value === undefined || value === '') return '—';
  const cur = CURRENCY_MAP[currency] || CURRENCY_MAP['BRL'];
  return new Intl.NumberFormat(cur.locale, {
    style: 'currency',
    currency: cur.code,
    minimumFractionDigits: 2
  }).format(Number(value));
}

function formatDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR');
}

function dateVal(val) {
  if (!val) return '';
  return String(val).substring(0, 10);
}

let allProjects = [];
let currentFilter = '';
let editingId = null;
let currentPage = 1;
const PAGE_SIZE = 12;

// ── API helpers ─────────────────────────────────────────────────────────────
function authHeader() {
  const token = sessionStorage.getItem('auth');
  return token ? { 'Authorization': 'Basic ' + token } : {};
}

async function api(url, options = {}) {
  options.headers = Object.assign({}, authHeader(), options.headers || {});
  const res = await fetch(url, options);
  if (res.status === 401) {
    // Sessão expirada — volta para login
    sessionStorage.removeItem('auth');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    setTimeout(() => document.getElementById('login-user').focus(), 100);
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function load() {
  showSkeletons(6);
  try {
    // Sempre busca a role atualizada do servidor a cada load
    try {
      const me = await api('/api/me');
      if (me.role) sessionStorage.setItem('role', me.role);
      if (me.user) sessionStorage.setItem('user', me.user);
    } catch(e) { /* ignora se falhar, usa o que tem no sessionStorage */ }

    // Carrega versão e exibe na sidebar
    try {
      const vr = await api('/api/version');
      const vEl = document.getElementById('sidebar-version');
      if (vEl && vr.version) vEl.textContent = `v${vr.version}`;
    } catch(e) {}

    allProjects = await api('/api/projects');
    updateStats();
    renderList();
    // Exibe badge do usuário na topbar
    const badgeEl = document.getElementById('user-badge');
    const nameEl  = document.getElementById('user-badge-name');
    const roleEl  = document.getElementById('user-badge-role');
    const iconEl  = document.getElementById('user-badge-icon');
    const storedUser = sessionStorage.getItem('user');
    const storedRole = userRole();
    if (badgeEl && storedUser) {
      nameEl.textContent = storedUser;
      if (storedRole === 'admin') {
        roleEl.textContent = 'Admin';
        roleEl.style.color = 'var(--warn)';
        roleEl.style.display = 'inline-block';
      } else {
        roleEl.textContent = 'Visualizador';
        roleEl.style.color = 'var(--text2)';
        roleEl.style.display = 'inline-block';
        // Esconde botão "Novo Projeto" para viewers
        const novoBtn = document.querySelector('.btn-primary[onclick="openModal()"]');
        if (novoBtn) novoBtn.style.display = 'none';
      }
      iconEl.textContent = '';
      badgeEl.style.display = 'flex';
    }
    // Esconde botão de backup para viewers
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn && !isAdmin()) backupBtn.style.display = 'none';
  } catch (e) {
    showToast('Erro ao carregar projetos', 'error');
  }
}

// ── Backup ────────────────────────────────────────────────────────────────────
function doBackup() {
  const a = document.createElement('a');
  a.href = '/api/backup';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Backup iniciado!', 'success');
}

// ── Stats ───────────────────────────────────────────────────────────────────
function updateStats() {
  const count = s => allProjects.filter(p => !s || p.status === s).length;
  document.getElementById('s-all').textContent = allProjects.length;
  document.getElementById('s-realizado').textContent = count('realizado');
  document.getElementById('s-andamento').textContent = count('em andamento');
  document.getElementById('s-cadastrado').textContent = count('cadastrado');
  document.getElementById('s-editais').textContent    = count('editais abertos');
  document.getElementById('s-recusado').textContent = count('recusado');
  document.getElementById('cnt-all').textContent = allProjects.length;
  document.getElementById('cnt-realizado').textContent = count('realizado');
  document.getElementById('cnt-andamento').textContent = count('em andamento');
  document.getElementById('cnt-cadastrado').textContent = count('cadastrado');
  document.getElementById('cnt-editais').textContent    = count('editais abertos');
  document.getElementById('cnt-recusado').textContent = count('recusado');
}

// ── Filter ───────────────────────────────────────────────────────────────────
function setFilter(btn, filter) {
  currentFilter = filter;
  currentPage = 1;
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const titles = { '': 'Todos os Projetos', 'realizado': 'Projetos Realizados', 'em andamento': 'Em Andamento', 'cadastrado': 'Projetos Cadastrados', 'editais abertos': 'Editais Abertos', 'recusado': 'Projetos Recusados' };
  document.getElementById('page-title').textContent = titles[filter] || 'Projetos';
  // Se estiver em outra view, volta para o grid
  document.getElementById('grid-view').style.display      = 'block';
  document.getElementById('detail-view').style.display    = 'none';
  document.getElementById('agenda-view').style.display    = 'none';
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('agenda-sidebar-btn').classList.remove('active');
  document.getElementById('dashboard-sidebar-btn').classList.remove('active');
  renderList();
}

// ── Render cards ─────────────────────────────────────────────────────────────
function renderList() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const filtered = allProjects.filter(p => {
    const matchFilter = !currentFilter || p.status === currentFilter;
    const matchSearch = !q ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.client || '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);

  const container = document.getElementById('list');

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <svg width="64" height="64" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.5"/><path d="M8 12h8M8 8h5M8 16h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <p>Nenhum projeto encontrado</p>
    </div>`;
    renderPagination(0, 1);
    return;
  }

  container.innerHTML = paginated.map((p, idx) => {
    const slug = p.status === 'em andamento' ? 'andamento' : p.status === 'editais abertos' ? 'editais' : p.status;
    const progress = Number(p.progress) || 0;
    const progressColor = progress >= 80 ? 'var(--realizado)' : progress >= 40 ? 'var(--andamento)' : 'var(--cadastrado)';
    const budget = formatBudget(p.budget, p.currency);
    const attCount = parseAttachments(p.attachments).filter(a => a && a.filename).length;
    const delay = Math.min(idx * 0.05, 0.4);

    return `<div class="card" style="animation-delay:${delay}s">
      <div class="card-accent-bar bar-${slug}"></div>
      <div class="card-header">
        <div class="card-title">${esc(p.name)}</div>
        <span class="badge badge-${slug}">${esc(p.status)}</span>
      </div>
      <div class="card-desc">${p.description ? esc(p.description) : ''}</div>
      <div class="card-meta">
        <div class="meta-item"><span class="meta-label">Cliente</span><span class="meta-value">${esc(p.client || '—')}</span></div>
        <div class="meta-item"><span class="meta-label">Orçamento</span><span class="meta-value" style="color:var(--realizado);font-weight:700">${budget}</span></div>
      </div>
      <div class="progress-wrap">
        <div class="progress-row">
          <span class="meta-label">Progresso</span>
          <span style="font-size:.82rem;font-weight:700;color:${progressColor}">${progress}%</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${progress}%;background:${progressColor}"></div>
        </div>
      </div>
      <div class="card-att-slot">${attCount > 0 ? `<span style="font-size:.78rem;color:var(--text2)">📎 ${attCount} anexo${attCount > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="card-actions">
        <button class="btn btn-primary" style="flex:2" onclick="openProject(${p.id})">Detalhes</button>
        ${isAdmin() ? `<button class="btn btn-ghost" onclick="editProject(${p.id})">✏️</button>
        <button class="btn btn-danger" onclick="deleteProject(${p.id})">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('');

  renderPagination(filtered.length, totalPages);
}

function renderPagination(total, totalPages) {
  let el = document.getElementById('pagination');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pagination';
    document.getElementById('list').insertAdjacentElement('afterend', el);
  }
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="pagination">
      <button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹ Anterior</button>
      <span class="page-info">Página ${currentPage} de ${totalPages} <span style="color:var(--text2);font-size:.8rem">(${total} projetos)</span></span>
      <button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>Próxima ›</button>
    </div>`;
}

function goPage(n) {
  currentPage = n;
  renderList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📋', pptx:'📋', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', zip:'🗜️', rar:'🗜️', mp4:'🎬', mp3:'🎵' };
  return map[ext] || '📎';
}

function parseAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Mapa de anexos para preview seguro (evita injetar URLs em onclick)
const _attMap = {};

function registerAtt(key, url, name, dl) {
  _attMap[key] = { url, name, dl };
}

function previewAtt(key) {
  const a = _attMap[key];
  if (a) openPreview(a.url, a.name, a.dl);
}

function renderAttachments(p) {
  const atts = parseAttachments(p.attachments).filter(a => a && a.filename);
  if (!atts.length) return '';
  const items = atts.map(a => {
    const url = `/api/projects/${p.id}/attachments/${encodeURIComponent(a.filename)}`;
    const previewable = ['jpg','jpeg','png','gif','webp','pdf'].includes((a.originalname||'').split('.').pop().toLowerCase());
    const key = `proj_${p.id}_${a.filename}`;
    registerAtt(key, url, a.originalname, url + '?dl=1');
    return `<div class="att-item"
        onclick="previewAtt('${key}')"
        style="cursor:pointer"
        title="${previewable ? 'Visualizar' : 'Baixar'} ${esc(a.originalname)}">
      <span class="att-icon">${fileIcon(a.originalname)}</span>
      <span class="att-name">${esc(a.originalname)}</span>
      <span class="att-dl">${previewable ? '🔍' : '⬇'}</span>
    </div>`;
  }).join('');
  return `<div class="att-list">${items}</div>`;
}

// ── Detail view ───────────────────────────────────────────────────────────────
let _detailProjectId = null;

async function openProject(id) {
  const p = allProjects.find(x => x.id === id);
  if (!p) return;
  _detailProjectId = id;

  const slug = p.status === 'em andamento' ? 'andamento' : p.status === 'editais abertos' ? 'editais' : p.status;
  const progress = Number(p.progress) || 0;
  const progressColor = progress >= 80 ? 'var(--realizado)' : progress >= 40 ? 'var(--andamento)' : 'var(--cadastrado)';
  const budget = formatBudget(p.budget, p.currency);
  const atts = parseAttachments(p.attachments).filter(a => a && a.filename);

  const field = (label, value, highlight = false) => `
    <div class="detail-field">
      <span class="detail-label">${label}</span>
      <span class="detail-value${highlight ? ' highlight' : ''}">${value || '—'}</span>
    </div>`;

  const role = sessionStorage.getItem('role') || 'viewer';
  const canEdit = role === 'admin';

  const attHtml = atts.length
    ? atts.map(a => {
        const url = `/api/projects/${p.id}/attachments/${encodeURIComponent(a.filename)}`;
        const previewable = ['jpg','jpeg','png','gif','webp','pdf'].includes((a.originalname||'').split('.').pop().toLowerCase());
        const key = `detail_${p.id}_${a.filename}`;
        registerAtt(key, url, a.originalname, url + '?dl=1');
        return `<div class="att-item" id="att-row-${esc(a.filename)}">
          <div style="flex:1;display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0"
              onclick="previewAtt('${key}')">
            <span class="att-icon">${fileIcon(a.originalname)}</span>
            <span class="att-name">${esc(a.originalname)}</span>
            <span class="att-dl">${previewable ? '🔍 Visualizar' : '⬇ Baixar'}</span>
          </div>
          ${canEdit ? `<button class="btn-sm danger" style="flex-shrink:0"
              onclick="removeProjectAttachment(${p.id},'${encodeURIComponent(a.filename)}')"
              title="Excluir anexo">✕</button>` : ''}
        </div>`;
      }).join('')
    : '<span class="detail-empty">Nenhum anexo</span>';

  const editalVal = p.edital_name ? esc(p.edital_name) : '';
  const editalUrl = p.edital_url ? esc(p.edital_url) : '';

  document.getElementById('detail-view').innerHTML = `
    <button class="detail-back" onclick="closeProject()">← Voltar para lista</button>
    <div class="detail-top">
      <div class="detail-title-area">
        <div style="height:4px;width:60px;border-radius:2px;background:var(--${slug})"></div>
        <div class="detail-title">${esc(p.name)}</div>
        <span class="badge badge-${slug}">${esc(p.status)}</span>
      </div>
      <div class="detail-top-actions">
        <button class="btn btn-ghost" onclick="editProject(${p.id})">✏️ Editar</button>
        <button class="btn btn-danger" onclick="deleteProject(${p.id})">🗑 Excluir</button>
      </div>
    </div>

    <div class="detail-body">

      <div class="detail-section full">
        <div class="detail-section-title">Informações do Edital</div>
        <div class="detail-fields">
          <div class="detail-field wide">
            <span class="detail-label">Nome do Edital</span>
            <div class="edital-edit">
              <span class="edital-val" id="edital-val-display">${editalVal || '<span style="color:var(--text2);font-style:italic">Não informado</span>'}</span>
              <button class="btn-sm ghost" onclick="startEditEdital()">✏️</button>
            </div>
            <div id="edital-edit-form" style="display:none;margin-top:6px">
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input class="edital-input" id="edital-input" value="${editalVal}" placeholder="Nome do edital..." style="flex:1;min-width:180px"/>
                <input class="edital-input" id="edital-url-input" value="${editalUrl}" placeholder="URL do edital (https://...)" style="flex:2;min-width:200px"/>
                <button class="btn-sm primary" onclick="saveEdital(${p.id})">✔ Salvar</button>
                <button class="btn-sm ghost" onclick="cancelEditEdital()">✕</button>
              </div>
            </div>
          </div>
          <div class="detail-field wide" id="edital-url-display-row" style="${editalUrl ? '' : 'display:none'}">
            <span class="detail-label">Link do Edital</span>
            <a id="edital-url-display" href="${p.edital_url || '#'}" target="_blank" rel="noopener"
               style="color:var(--accent);font-size:.9rem;word-break:break-all;text-decoration:none">
              ${editalUrl || ''}
            </a>
          </div>
        </div>
      </div>

      ${p.description ? `
      <div class="detail-section full">
        <div class="detail-section-title">Descrição</div>
        <div class="detail-desc">${esc(p.description)}</div>
      </div>` : ''}

      <div class="detail-section">
        <div class="detail-section-title">Informações Gerais</div>
        <div class="detail-fields">
          ${field('Cliente', esc(p.client))}
          ${field('Orçamento Total', budget, true)}
          ${field('Moeda', p.currency === 'BRL' ? 'Real (R$)' : p.currency === 'USD' ? 'Dólar (US$)' : 'Euro (€)')}
          ${field('Status', esc(p.status))}
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Progresso Geral</div>
        <div class="detail-progress-row">
          <span class="detail-label">Conclusão</span>
          <span style="font-weight:700;color:${progressColor};font-size:1.4rem">${progress}%</span>
        </div>
        <div class="detail-progress-bar">
          <div class="detail-progress-fill" style="width:${progress}%;background:${progressColor}"></div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Inscrição</div>
        <div class="detail-fields">
          ${field('Início das inscrições', formatDate(p.inscription_start))}
          ${field('Final das inscrições', formatDate(p.inscription_end))}
          ${field('Resposta da inscrição', formatDate(p.inscription_response))}
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Execução do Projeto</div>
        <div class="detail-fields">
          ${field('Início do projeto', formatDate(p.project_start))}
          ${field('Final do projeto', formatDate(p.project_end))}
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Anexos</div>
        <div class="att-list">${attHtml}</div>
      </div>

      <!-- Institutions -->
      <div class="detail-section full" id="section-institutions">
        <div class="detail-section-title">
          Instituições Participantes
          <span style="margin-left:auto;font-size:.72rem;color:var(--text2)" id="inst-pct-total"></span>
        </div>
        <div class="inline-section" id="institutions-container">
          <span class="detail-empty">Carregando...</span>
        </div>
        <div class="inline-add-bar" id="inst-add-bar">
          <input id="inst-name-input" placeholder="Nome da instituição..." />
          <input id="inst-val-input" type="number" min="0" step="0.01" placeholder="Valor alocado (R$)" style="max-width:180px" />
          <button class="btn-sm primary" onclick="addInstitution(${p.id})">＋ Adicionar</button>
        </div>
      </div>

      <!-- Phases -->
      <div class="detail-section full" id="section-phases">
        <div class="detail-section-title">Orçamento</div>
        <div class="inline-section" id="phases-container">
          <span class="detail-empty">Carregando...</span>
        </div>
        <div style="margin-top:12px">
          <button class="btn-sm primary" onclick="showNewPhaseForm(${p.id})">＋ Novo Orçamento</button>
        </div>
        <div id="new-phase-form" style="display:none" class="phase-edit-form">
          <div><span class="phase-form-label">Item do Orçamento *</span><input id="nph-name" placeholder="Ex: Elaboração do projeto" /></div>
          <div><span class="phase-form-label">Descrição</span><textarea id="nph-desc" placeholder="Descreva esta fase..."></textarea></div>
          <div class="phase-form-row">
            <div><span class="phase-form-label">Orçamento (R$)</span><input id="nph-budget" type="number" min="0" step="0.01" placeholder="0,00" /></div>
            <div><span class="phase-form-label">Progresso (%)</span><input id="nph-progress" type="number" min="0" max="100" placeholder="0" /></div>
          </div>
          <div class="phase-form-actions">
            <button class="btn-sm ghost" onclick="cancelNewPhase()">Cancelar</button>
            <button class="btn-sm primary" onclick="saveNewPhase(${p.id})">✔ Salvar item</button>
          </div>
        </div>
      </div>

      <!-- Comments -->
      <div class="detail-section full" id="section-comments">
        <div class="detail-section-title">💬 Comentários</div>
        <div class="comment-list" id="comments-container">
          <span class="detail-empty">Carregando...</span>
        </div>
        <div class="comment-form" id="comment-form-wrap">
          <textarea class="comment-input" id="comment-input" placeholder="Adicionar um comentário..." rows="2"></textarea>
          <button class="btn-sm primary" onclick="addComment(${p.id})" style="align-self:flex-end;padding:9px 16px">Enviar</button>
        </div>
      </div>

      <!-- History -->
      <div class="detail-section full" id="section-history">
        <div class="detail-section-title" style="cursor:pointer" onclick="toggleHistory()">
          🕓 Histórico de Alterações
          <span id="history-toggle-icon" style="margin-left:auto;font-size:.8rem">▼</span>
        </div>
        <div id="history-container" style="display:none">
          <div class="history-list" id="history-list">
            <span class="detail-empty">Carregando...</span>
          </div>
        </div>
      </div>

    </div>`;

  document.getElementById('grid-view').style.display = 'none';
  document.getElementById('detail-view').style.display = 'block';
  const mainEl = document.querySelector('.main');
  if (mainEl) mainEl.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Carrega dados dinâmicos
  loadInstitutions(p.id, Number(p.budget) || 0, p.currency);
  loadPhases(p.id, Number(p.budget) || 0, p.currency);
  loadComments(p.id);
  loadHistory(p.id);
}

function closeProject() {
  document.getElementById('detail-view').style.display = 'none';
  document.getElementById('grid-view').style.display = 'block';
  _detailProjectId = null;
}

// ── Edital inline edit ────────────────────────────────────────────────────────
function startEditEdital() {
  document.getElementById('edital-val-display').parentElement.style.display = 'none';
  document.getElementById('edital-edit-form').style.display = 'block';
  document.getElementById('edital-input').focus();
}
function cancelEditEdital() {
  document.getElementById('edital-val-display').parentElement.style.display = 'flex';
  document.getElementById('edital-edit-form').style.display = 'none';
}
async function saveEdital(projectId) {
  const val = document.getElementById('edital-input').value.trim();
  const url = document.getElementById('edital-url-input').value.trim();
  try {
    const fd = new FormData();
    fd.append('payload', JSON.stringify({ edital_name: val, edital_url: url }));
    await fetch(`/api/projects/${projectId}`, { method: 'PUT', body: fd, headers: authHeader() });
    // Atualiza allProjects localmente
    const proj = allProjects.find(x => x.id === projectId);
    if (proj) { proj.edital_name = val; proj.edital_url = url; }
    document.getElementById('edital-val-display').innerHTML = val
      ? esc(val)
      : '<span style="color:var(--text2);font-style:italic">Não informado</span>';
    // Atualiza o link
    const urlRow = document.getElementById('edital-url-display-row');
    const urlEl  = document.getElementById('edital-url-display');
    if (url) {
      urlEl.href = url;
      urlEl.textContent = url;
      urlRow.style.display = '';
    } else {
      urlRow.style.display = 'none';
    }
    cancelEditEdital();
    showToast('Edital atualizado!', 'success');
  } catch { showToast('Erro ao salvar edital', 'error'); }
}

// ── Institutions ──────────────────────────────────────────────────────────────
async function loadInstitutions(projectId, totalBudget, currency) {
  const container = document.getElementById('institutions-container');
  if (!container) return;
  try {
    const list = await api(`/api/projects/${projectId}/institutions`);
    renderInstitutions(container, list, projectId, totalBudget, currency);
  } catch { container.innerHTML = '<span class="detail-empty">Erro ao carregar</span>'; }
}

function renderInstitutions(container, list, projectId, totalBudget, currency) {
  // Calcula com base nos valores absolutos salvos no banco
  const totalAllocated = list.reduce((s, i) => s + Number(i.budget_value || 0), 0);
  const remaining = totalBudget - totalAllocated;
  const totalPct = totalBudget > 0 ? (totalAllocated / totalBudget * 100) : 0;

  const totalEl = document.getElementById('inst-pct-total');
  if (totalEl) {
    if (totalPct > 100) {
      totalEl.innerHTML = `<span style="color:var(--danger)">⚠️ ${formatBudget(totalAllocated, currency)} — ACIMA DO ORÇAMENTO</span>`;
    } else if (Math.round(totalPct * 100) === 10000) {
      totalEl.innerHTML = `<span style="color:var(--realizado)">✅ ${formatBudget(totalAllocated, currency)} — 100% alocado</span>`;
    } else {
      totalEl.innerHTML = `${formatBudget(totalAllocated, currency)} alocado &nbsp;·&nbsp; <span style="color:var(--accent)">Disponível: ${formatBudget(remaining, currency)}</span>`;
    }
  }

  if (!list.length) {
    container.innerHTML = '<span class="detail-empty">Nenhuma instituição cadastrada</span>';
    return;
  }

  container.innerHTML = `
    <table class="inst-table">
      <thead><tr>
        <th>Instituição</th>
        <th style="text-align:right">Valor alocado</th>
        <th style="text-align:right">% do orçamento</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${list.map(inst => {
          const val = Number(inst.budget_value) || 0;
          const pct = totalBudget > 0 ? (val / totalBudget * 100) : 0;
          return `<tr>
            <td>${esc(String(inst.name).toUpperCase())}</td>
            <td style="text-align:right"><span class="inst-val">${formatBudget(val, currency)}</span></td>
            <td style="text-align:right"><span class="inst-pct">${pct.toFixed(2)}%</span></td>
            <td><div class="inst-actions">
              <button class="btn-sm ghost" onclick="editInstitution(${inst.id},${projectId},${totalBudget},'${currency}',${val})">✏️</button>
              <button class="btn-sm danger" onclick="deleteInstitution(${inst.id},${projectId})">🗑</button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

async function addInstitution(projectId) {
  const name = document.getElementById('inst-name-input').value.trim().toUpperCase();
  const rawVal = parseFloat(document.getElementById('inst-val-input').value);
  if (!name) { showToast('Informe o nome da instituição', 'error'); return; }
  if (isNaN(rawVal) || rawVal <= 0) { showToast('Informe um valor válido', 'error'); return; }

  const proj = allProjects.find(x => x.id === projectId);
  const totalBudget = Number(proj?.budget) || 0;

  // Busca lista atual para validar soma
  const currentList = await api(`/api/projects/${projectId}/institutions`);
  const alreadyAllocated = currentList.reduce((s, i) => s + Number(i.budget_value || 0), 0);
  if (totalBudget > 0 && alreadyAllocated + rawVal > totalBudget) {
    const avail = totalBudget - alreadyAllocated;
    showToast(`Valor excede o orçamento! Disponível: ${formatBudget(avail, proj?.currency || 'BRL')}`, 'error');
    return;
  }

  try {
    await api(`/api/projects/${projectId}/institutions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, budget_value: rawVal })
    });
    document.getElementById('inst-name-input').value = '';
    document.getElementById('inst-val-input').value = '';
    await loadInstitutions(projectId, totalBudget, proj?.currency || 'BRL');
    showToast('Instituição adicionada!', 'success');
  } catch { showToast('Erro ao adicionar', 'error'); }
}

async function editInstitution(instId, projectId, totalBudget, currency, currentVal) {
  const newName = prompt('Nome da instituição:', '');
  const nameEl = document.getElementById(`inst-name-${instId}`);
  const resolvedName = (newName !== null ? newName : (nameEl ? nameEl.textContent : '')).trim().toUpperCase();
  if (!resolvedName) return;

  const newValStr = prompt(`Valor alocado (orçamento total: ${formatBudget(totalBudget, currency)}):`, currentVal);
  if (newValStr === null) return;
  const newVal = parseFloat(newValStr) || 0;

  // Valida: soma dos outros + novo valor <= totalBudget
  const currentList = await api(`/api/projects/${projectId}/institutions`);
  const othersAllocated = currentList
    .filter(i => i.id !== instId)
    .reduce((s, i) => s + Number(i.budget_value || 0), 0);
  if (totalBudget > 0 && othersAllocated + newVal > totalBudget) {
    const avail = totalBudget - othersAllocated;
    showToast(`Valor excede o orçamento! Máximo para esta instituição: ${formatBudget(avail, currency)}`, 'error');
    return;
  }

  try {
    await api(`/api/projects/${projectId}/institutions/${instId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: resolvedName, budget_value: newVal })
    });
    const proj = allProjects.find(x => x.id === projectId);
    await loadInstitutions(projectId, Number(proj?.budget) || 0, proj?.currency || 'BRL');
    showToast('Instituição atualizada!', 'success');
  } catch { showToast('Erro ao editar', 'error'); }
}

async function deleteInstitution(instId, projectId) {
  if (!await confirmDialog('Remover esta instituição?', '🏛️', 'Remover')) return;
  try {
    await api(`/api/projects/${projectId}/institutions/${instId}`, { method: 'DELETE' });
    const proj = allProjects.find(x => x.id === projectId);
    await loadInstitutions(projectId, Number(proj?.budget) || 0, proj?.currency || 'BRL');
    showToast('Instituição removida', 'success');
  } catch { showToast('Erro ao remover', 'error'); }
}

// ── Phases ────────────────────────────────────────────────────────────────────
async function loadPhases(projectId, totalBudget, currency) {
  const container = document.getElementById('phases-container');
  if (!container) return;
  try {
    const list = await api(`/api/projects/${projectId}/phases`);
    renderPhases(container, list, projectId, totalBudget, currency);
    updateGeneralProgress(list);
  } catch { container.innerHTML = '<span class="detail-empty">Erro ao carregar</span>'; }
}

function updateGeneralProgress(phases) {
  if (!phases || !phases.length) return;
  const avg = Math.round(phases.reduce((s, ph) => s + (Number(ph.progress) || 0), 0) / phases.length);
  const progColor = avg >= 80 ? 'var(--realizado)' : avg >= 40 ? 'var(--andamento)' : 'var(--cadastrado)';
  // Atualiza a barra de progresso geral na tela de detalhe
  const fill = document.querySelector('.detail-progress-fill');
  const label = document.querySelector('.detail-progress-row span[style*="font-weight:700"]');
  if (fill) fill.style.width = `${avg}%`, fill.style.background = progColor;
  if (label) label.textContent = `${avg}%`, label.style.color = progColor;
}

function renderPhases(container, list, projectId, totalBudget, currency) {
  if (!list.length) {
    container.innerHTML = '<span class="detail-empty">Nenhum item de orçamento cadastrado</span>';
    return;
  }
  container.innerHTML = `<div class="phase-list" id="phase-list-${projectId}">
    ${list.map((ph, idx) => {
      const prog = Number(ph.progress) || 0;
      const progColor = prog >= 80 ? 'var(--realizado)' : prog >= 40 ? 'var(--andamento)' : 'var(--cadastrado)';
      const atts = parseAttachments(ph.attachments).filter(a => a && a.filename);
      const attHtml = atts.length
        ? `<div class="phase-att-list">${atts.map(a => {
            const attUrl = `/api/projects/${projectId}/phases/${ph.id}/attachments/${encodeURIComponent(a.filename)}`;
            const previewable = ['jpg','jpeg','png','gif','webp','pdf'].includes((a.originalname||'').split('.').pop().toLowerCase());
            const key = `phase_${ph.id}_${a.filename}`;
            registerAtt(key, attUrl, a.originalname, attUrl + '?dl=1');
            return `<div class="phase-att-item">
              <span>${fileIcon(a.originalname)}</span>
              <span class="phase-att-name" title="${esc(a.originalname)}">${esc(a.originalname)}</span>
              <div class="phase-att-actions">
                ${previewable ? `<button class="btn-sm ghost" onclick="previewAtt('${key}')" title="Visualizar">🔍</button>` : ''}
                <a href="${esc(attUrl)}?dl=1" class="btn-sm ghost" title="Baixar">⬇</a>
                <button class="btn-sm danger" onclick="removePhaseAttachment(${ph.id},${projectId},'${encodeURIComponent(a.filename)}')" title="Remover">✕</button>
              </div>
            </div>`;
          }).join('')}</div>`
        : '';

      return `<div class="phase-item" id="phase-item-${ph.id}" draggable="true"
          data-phase-id="${ph.id}" data-project-id="${projectId}" data-currency="${currency}">
        <div class="phase-header">
          <span class="phase-num" style="cursor:grab" title="Arrastar para reordenar">⠿ Item ${idx + 1}</span>
          <span class="phase-name">${esc(ph.name)}</span>
          <div style="display:flex;gap:5px">
            <button class="btn-sm ghost" onclick="showEditPhaseForm(${ph.id},${projectId},'${currency}')">✏️</button>
            <button class="btn-sm danger" onclick="deletePhase(${ph.id},${projectId},'${currency}')">🗑</button>
          </div>
        </div>
        ${ph.description ? `<div class="phase-desc">${esc(ph.description)}</div>` : ''}
        <div class="phase-meta-row">
          <span class="phase-budget">💰 ${formatBudget(ph.budget, currency)}</span>
          <div class="phase-progress-wrap">
            <span class="phase-progress-label">Andamento</span>
            <div class="phase-progress-bar"><div class="phase-progress-fill" style="width:${prog}%;background:${progColor}"></div></div>
            <span class="phase-pct" style="color:${progColor}">${prog}%</span>
          </div>
        </div>

        <div class="phase-steps-section">
          ${(() => {
            const total      = Number(ph.steps_total) || 0;
            const done       = Math.min(Number(ph.steps_done) || 0, total);
            const isEqual    = ph.steps_equal !== 0;
            const stepVal    = Number(ph.steps_value) || 0;
            const budgetUnit = isEqual ? (total > 0 ? (Number(ph.budget) || 0) / total : 0) : stepVal;
            const remaining  = Math.max(0, (Number(ph.budget) || 0) - done * budgetUnit);
            return total > 0
              ? `<span style="font-size:.8rem;color:var(--text2)">Etapas: <strong style="color:var(--text)">${done}/${total}</strong> &nbsp;·&nbsp; Restante: <strong style="color:var(--text)">${formatBudget(remaining, currency)}</strong></span>`
              : `<span style="font-size:.75rem;color:var(--text2)">Sem etapas definidas — edite para configurar</span>`;
          })()}
        </div>

        <div class="phase-att-section">
          <div class="phase-att-title">
            <span>📎 Anexos ${atts.length ? `(${atts.length})` : ''}</span>
          </div>
          ${attHtml}
          <div class="phase-upload-row">
            <input type="file" id="phase-file-${ph.id}" multiple />
            <button class="btn-sm primary" onclick="uploadPhaseAttachments(${ph.id},${projectId})">⬆ Enviar</button>
          </div>
        </div>

        <div id="phase-edit-form-${ph.id}" style="display:none" class="phase-edit-form">
          <div><span class="phase-form-label">Item do Orçamento *</span><input id="eph-name-${ph.id}" value="${esc(ph.name)}" /></div>
          <div><span class="phase-form-label">Descrição</span><textarea id="eph-desc-${ph.id}">${esc(ph.description || '')}</textarea></div>
          <div class="phase-form-row">
            <div><span class="phase-form-label">Orçamento</span><input id="eph-budget-${ph.id}" type="number" min="0" step="0.01" value="${ph.budget || 0}" /></div>
            <div><span class="phase-form-label">Progresso (%)</span><input id="eph-progress-${ph.id}" type="number" min="0" max="100" value="${ph.progress || 0}" /></div>
          </div>
          <div class="phase-form-row">
            <div><span class="phase-form-label">Total de etapas</span><input id="eph-stotal-${ph.id}" type="number" min="0" value="${ph.steps_total || 0}" /></div>
            <div><span class="phase-form-label">Etapas realizadas</span><input id="eph-sdone-${ph.id}" type="number" min="0" value="${ph.steps_done || 0}" /></div>
          </div>
          <div class="phase-form-row" style="align-items:center">
            <div style="display:flex;align-items:center;gap:6px">
              <input type="checkbox" id="eph-sequal-${ph.id}" ${ph.steps_equal !== 0 ? 'checked' : ''} style="accent-color:var(--accent)" />
              <span class="phase-form-label" style="margin:0">Valor igual por etapa</span>
            </div>
            <div><span class="phase-form-label">Valor por etapa (R$)</span><input id="eph-svalue-${ph.id}" type="number" min="0" step="0.01" value="${ph.steps_value || 0}" /></div>
          </div>
          <div class="phase-form-actions">
            <button class="btn-sm ghost" onclick="document.getElementById('phase-edit-form-${ph.id}').style.display='none'">Cancelar</button>
            <button class="btn-sm primary" onclick="saveEditPhase(${ph.id},${projectId},'${currency}')">✔ Salvar</button>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;

  // Inicializa drag & drop
  initPhaseDragDrop(projectId, currency);
}

// ── Phase Drag & Drop ─────────────────────────────────────────────────────────
function initPhaseDragDrop(projectId, currency) {
  const list = document.getElementById(`phase-list-${projectId}`);
  if (!list) return;

  let dragSrc = null;

  list.querySelectorAll('.phase-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.phase-item').forEach(i => i.classList.remove('drag-over'));
      // Salva nova ordem
      savePhasesOrder(projectId, currency);
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragSrc && item !== dragSrc) {
        list.querySelectorAll('.phase-item').forEach(i => i.classList.remove('drag-over'));
        item.classList.add('drag-over');
        // Reordena no DOM
        const items = [...list.querySelectorAll('.phase-item')];
        const srcIdx = items.indexOf(dragSrc);
        const tgtIdx = items.indexOf(item);
        if (srcIdx < tgtIdx) item.after(dragSrc);
        else item.before(dragSrc);
      }
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
    });
  });

  // ── Swipe para deletar no mobile ──────────────────────────────────────────
  if (!isAdmin()) return; // só admin pode deletar
  list.querySelectorAll('.phase-item').forEach(item => {
    let touchStartX = 0;
    let touchDeltaX = 0;
    const SWIPE_THRESHOLD = 80;

    item.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchDeltaX = 0;
      item.style.transition = 'none';
    }, { passive: true });

    item.addEventListener('touchmove', e => {
      touchDeltaX = e.touches[0].clientX - touchStartX;
      if (touchDeltaX < 0) {
        // Só arrasta para esquerda
        item.style.transform = `translateX(${Math.max(touchDeltaX, -SWIPE_THRESHOLD - 20)}px)`;
        // Mostra fundo vermelho
        item.style.setProperty('--swipe-bg', 'rgba(255,92,110,.15)');
      }
    }, { passive: true });

    item.addEventListener('touchend', () => {
      item.style.transition = 'transform .25s ease';
      if (touchDeltaX < -SWIPE_THRESHOLD) {
        // Disparou o swipe — confirma exclusão
        item.style.transform = `translateX(-100%)`;
        const phaseId   = Number(item.dataset.phaseId);
        const projectId = Number(item.dataset.projectId);
        const currency  = item.dataset.currency;
        setTimeout(() => deletePhase(phaseId, projectId, currency), 200);
      } else {
        item.style.transform = 'translateX(0)';
      }
    });
  });
}

async function savePhasesOrder(projectId, currency) {
  const list = document.getElementById(`phase-list-${projectId}`);
  if (!list) return;
  const items = [...list.querySelectorAll('.phase-item')];
  // Atualiza numeração visual das fases
  items.forEach((el, idx) => {
    const numEl = el.querySelector('.phase-num');
    if (numEl) numEl.textContent = `⠿ Item ${idx + 1}`;
  });
  // Persiste nova ordem via API
  try {
    const updates = items.map((el, idx) => ({
      id: Number(el.dataset.phaseId),
      order_num: idx
    }));
    await Promise.all(updates.map(u => {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ order_num: u.order_num }));
      return fetch(`/api/projects/${projectId}/phases/${u.id}`, { method: 'PUT', body: fd, headers: authHeader() });
    }));
    showToast('Ordem dos itens salva!', 'success');
  } catch { showToast('Erro ao salvar ordem', 'error'); }
}

function showNewPhaseForm(projectId) {
  document.getElementById('new-phase-form').style.display = 'flex';
  document.getElementById('new-phase-form').style.flexDirection = 'column';
  document.getElementById('nph-name').focus();
}
function cancelNewPhase() {
  document.getElementById('new-phase-form').style.display = 'none';
  ['nph-name','nph-desc','nph-budget','nph-progress'].forEach(id => { document.getElementById(id).value = ''; });
}
async function saveNewPhase(projectId) {
  const name = document.getElementById('nph-name').value.trim();
  if (!name) { showToast('Item do orçamento é obrigatório', 'error'); return; }
  const data = {
    name,
    description: document.getElementById('nph-desc').value,
    budget: document.getElementById('nph-budget').value || 0,
    progress: document.getElementById('nph-progress').value || 0,
    order_num: document.querySelectorAll('.phase-item').length
  };
  try {
    await api(`/api/projects/${projectId}/phases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    cancelNewPhase();
    const proj = allProjects.find(x => x.id === projectId);
    await loadPhases(projectId, Number(proj?.budget) || 0, proj?.currency || 'BRL');
    showToast('Item criado!', 'success');
  } catch { showToast('Erro ao criar item', 'error'); }
}
function showEditPhaseForm(phaseId, projectId, currency) {
  document.getElementById(`phase-edit-form-${phaseId}`).style.display = 'flex';
  document.getElementById(`phase-edit-form-${phaseId}`).style.flexDirection = 'column';
}
async function saveEditPhase(phaseId, projectId, currency) {
  const name = document.getElementById(`eph-name-${phaseId}`).value.trim();
  if (!name) { showToast('Nome é obrigatório', 'error'); return; }
  const steps_total = Math.max(0, Number(document.getElementById(`eph-stotal-${phaseId}`).value) || 0);
  const steps_done  = Math.min(steps_total, Math.max(0, Number(document.getElementById(`eph-sdone-${phaseId}`).value) || 0));
  const steps_equal = document.getElementById(`eph-sequal-${phaseId}`).checked ? 1 : 0;
  const steps_value = Number(document.getElementById(`eph-svalue-${phaseId}`).value) || 0;
  // Progresso automático pelas etapas se houver total definido
  const autoProgress = steps_total > 0 ? Math.round((steps_done / steps_total) * 100) : Number(document.getElementById(`eph-progress-${phaseId}`).value) || 0;
  const data = {
    name,
    description: document.getElementById(`eph-desc-${phaseId}`).value,
    budget:       document.getElementById(`eph-budget-${phaseId}`).value || 0,
    progress:     autoProgress,
    steps_total,
    steps_done,
    steps_equal,
    steps_value,
  };
  try {
    const fd = new FormData();
    fd.append('payload', JSON.stringify(data));
    const res = await fetch(`/api/projects/${projectId}/phases/${phaseId}`, { method: 'PUT', body: fd, headers: authHeader() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const proj = allProjects.find(x => x.id === projectId);
    await loadPhases(projectId, Number(proj?.budget) || 0, proj?.currency || 'BRL');
    showToast('Item atualizado!', 'success');
  } catch(e) { showToast('Erro ao salvar item: ' + e.message, 'error'); }
}

// ── Etapas de Fase (numérico simples) ────────────────────────────────────────
async function _saveStepsNum(phaseId, projectId, payload) {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payload));
  const res = await fetch(`/api/projects/${projectId}/phases/${phaseId}`, { method: 'PUT', body: fd, headers: authHeader() });
  if (!res.ok) { showToast('Erro ao salvar etapas', 'error'); return; }
  const proj = allProjects.find(x => x.id === projectId);
  await loadPhases(projectId, Number(proj?.budget) || 0, proj?.currency || 'BRL');
}
async function updateStepsDone(phaseId, projectId, done, total) {
  total = Math.max(0, Number(total) || 0);
  done  = Math.min(Math.max(0, Number(done) || 0), total);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  await _saveStepsNum(phaseId, projectId, { steps_done: done, steps_total: total, progress });
}
async function updateStepsTotal(phaseId, projectId, done, total) {
  total = Math.max(0, Number(total) || 0);
  done  = Math.min(Math.max(0, Number(done) || 0), total);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  await _saveStepsNum(phaseId, projectId, { steps_done: done, steps_total: total, progress });
}
async function updateStepsEqual(phaseId, projectId, isEqual) {
  await _saveStepsNum(phaseId, projectId, { steps_equal: isEqual ? 1 : 0 });
}
async function updateStepsValue(phaseId, projectId, value) {
  await _saveStepsNum(phaseId, projectId, { steps_value: Number(value) || 0 });
}

async function uploadPhaseAttachments(phaseId, projectId) {
  const input = document.getElementById(`phase-file-${phaseId}`);
  if (!input || !input.files.length) { showToast('Selecione um arquivo', 'error'); return; }
  const fd = new FormData();
  for (const f of input.files) fd.append('phase_attachments', f);
  try {
    const res = await fetch(`/api/projects/${projectId}/phases/${phaseId}/attachments`, { method: 'POST', body: fd, headers: authHeader() });
    if (!res.ok) throw new Error();
    const proj = allProjects.find(x => x.id === projectId);
    await loadPhases(projectId, Number(proj?.budget) || 0, proj?.currency || 'BRL');
    showToast('Arquivo(s) enviado(s)!', 'success');
  } catch { showToast('Erro ao enviar arquivo', 'error'); }
}

async function removePhaseAttachment(phaseId, projectId, encodedFilename) {
  if (!await confirmDialog('Remover este anexo?', '📎', 'Remover')) return;
  try {
    await api(`/api/projects/${projectId}/phases/${phaseId}/attachments/${encodedFilename}`, { method: 'DELETE' });
    const proj = allProjects.find(x => x.id === projectId);
    await loadPhases(projectId, Number(proj?.budget) || 0, proj?.currency || 'BRL');
    showToast('Anexo removido', 'success');
  } catch { showToast('Erro ao remover anexo', 'error'); }
}
async function deletePhase(phaseId, projectId) {
  if (!await confirmDialog('Remover este item do orçamento? Os anexos também serão removidos.', '🗑️', 'Remover item')) return;
  try {
    await api(`/api/projects/${projectId}/phases/${phaseId}`, { method: 'DELETE' });
    const proj = allProjects.find(x => x.id === projectId);
    await loadPhases(projectId, Number(proj?.budget) || 0, proj?.currency || 'BRL');
    showToast('Item removido', 'success');
  } catch { showToast('Erro ao remover item', 'error'); }
}


const RECUSADO_OPTION_HTML = '<option value="recusado">🚫 Recusado</option>';

function removeRecusadoOption() {
  const sel = document.getElementById('statusSelect');
  const opt = sel.querySelector('option[value="recusado"]');
  if (opt) opt.remove();
}

function addRecusadoOption(selectedValue) {
  const sel = document.getElementById('statusSelect');
  if (!sel.querySelector('option[value="recusado"]')) {
    sel.insertAdjacentHTML('beforeend', RECUSADO_OPTION_HTML);
  }
  sel.value = selectedValue;
}

// ── Modal ────────────────────────────────────────────────────────────────────
function openModal(title = 'Novo Projeto') {
  editingId = null;
  document.getElementById('projectForm').reset();
  document.getElementById('modal-title').textContent = title;
  document.getElementById('submitBtn').textContent = 'Salvar projeto';
  removeRecusadoOption(); // nunca aparece ao criar
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

async function editProject(id) {
  const p = allProjects.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  const form = document.getElementById('projectForm');
  form.name.value = p.name || '';
  form.description.value = p.description || '';
  form.status.value = p.status || 'cadastrado';
  form.client.value = p.client || '';
  form.budget.value = p.budget || '';
  form.currency.value = p.currency || 'BRL';
  form.inscription_start.value = dateVal(p.inscription_start);
  form.inscription_end.value   = dateVal(p.inscription_end);
  form.inscription_response.value = dateVal(p.inscription_response);
  form.project_start.value = dateVal(p.project_start);
  form.project_end.value   = dateVal(p.project_end);
  // adiciona opção Recusado sempre na edição
  addRecusadoOption(p.status);
  document.getElementById('statusSelect').value = p.status || 'cadastrado';
  document.getElementById('modal-title').textContent = 'Editar Projeto';
  document.getElementById('submitBtn').textContent = 'Salvar alterações';
  document.getElementById('modalOverlay').classList.add('open');
}

async function deleteProject(id) {
  if (!await confirmDialog('Confirma a exclusão deste projeto? Esta ação não pode ser desfeita.', '🗑️', 'Excluir projeto')) return;
  try {
    await api(`/api/projects/${id}`, { method: 'DELETE' });
    showToast('Projeto excluído', 'success');
    closeProject();
    load();
  } catch(e) {
    showToast('Erro ao excluir: ' + (e.message || 'tente novamente'), 'error');
  }
}

async function removeProjectAttachment(projectId, encodedFilename) {
  if (!await confirmDialog('Excluir este anexo? A ação não pode ser desfeita.', '🗑️', 'Excluir anexo')) return;
  try {
    await api(`/api/projects/${projectId}/attachments/${encodedFilename}`, { method: 'DELETE' });
    showToast('Anexo excluído', 'success');
    // Remove a linha da UI sem recarregar tudo
    const row = document.getElementById(`att-row-${decodeURIComponent(encodedFilename)}`);
    if (row) {
      row.style.transition = 'opacity .25s';
      row.style.opacity = '0';
      setTimeout(() => {
        row.remove();
        // Se não sobrou nenhum anexo, mostra mensagem vazia
        const list = document.querySelector('.att-list');
        if (list && !list.querySelector('.att-item')) {
          list.innerHTML = '<span class="detail-empty">Nenhum anexo</span>';
        }
        // Atualiza também o projeto em memória
        const p = allProjects.find(x => x.id === projectId);
        if (p) p.attachments = (p.attachments || []).filter(a => a.filename !== decodeURIComponent(encodedFilename));
      }, 250);
    }
  } catch(e) {
    showToast('Erro ao excluir anexo: ' + (e.message || 'tente novamente'), 'error');
  }
}

// ── Form submit ───────────────────────────────────────────────────────────────
const _projectForm = document.getElementById('projectForm');
if (_projectForm) _projectForm.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const fd = new FormData();
  const obj = {
    name: form.name.value,
    description: form.description.value,
    status: form.status.value,
    client: form.client.value,
    budget: form.budget.value || null,
    currency: form.currency.value || 'BRL',
    progress: editingId ? (allProjects.find(x => x.id === editingId)?.progress || 0) : 0,
    inscription_start: form.inscription_start.value || null,
    inscription_end: form.inscription_end.value || null,
    inscription_response: form.inscription_response.value || null,
    project_start: form.project_start.value || null,
    project_end: form.project_end.value || null
  };
  fd.append('payload', JSON.stringify(obj));
  const files = form.attachments.files;
  for (const f of files) fd.append('attachments', f);

  const url = editingId ? `/api/projects/${editingId}` : '/api/projects';
  const method = editingId ? 'PUT' : 'POST';

  try {
    await fetch(url, { method, body: fd, headers: authHeader() });
    const savedId = editingId;
    closeModal();
    showToast(savedId ? 'Projeto atualizado!' : 'Projeto criado!', 'success');
    await load();
    // Se estava na tela de detalhe, recarrega o detalhe com dados atualizados
    if (savedId && document.getElementById('detail-view').style.display !== 'none') {
      openProject(savedId);
    }
  } catch {
    showToast('Erro ao salvar', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'Salvar alterações' : 'Salvar projeto';
  }
}); // fim addEventListener submit

// ── Login ─────────────────────────────────────────────────────────────────────
// Helper de role — retorna 'admin' ou 'viewer'
function userRole() {
  return sessionStorage.getItem('role') || 'viewer';
}
function isAdmin() {
  return userRole() === 'admin';
}

(function initLogin() {
  try {
    // Verifica se já está autenticado nesta sessão
    if (sessionStorage.getItem('auth')) {
      const ls = document.getElementById('login-screen');
      if (ls) ls.classList.add('hidden');
      return;
    }
    // Permite entrar com Enter nos campos
    ['login-user', 'login-pass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });
    // Foca no campo usuário ao abrir
    setTimeout(() => {
      const el = document.getElementById('login-user');
      if (el) el.focus();
    }, 100);
  } catch(e) {
    console.error('[initLogin]', e);
  }
})();

async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const btn  = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  const card  = document.getElementById('login-card');

  if (!user || !pass) {
    errEl.textContent = 'Preencha usuário e senha';
    errEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Verificando...';
  errEl.classList.remove('show');

  try {
    const token = btoa(user + ':' + pass);
    const headers = { 'Authorization': 'Basic ' + token };

    // 1. Valida credenciais
    const res = await fetch('/api/projects', { headers });
    if (!res.ok) throw new Error('unauthorized');

    // 2. Busca role do usuário
    const me = await fetch('/api/me', { headers }).then(r => r.json());

    sessionStorage.setItem('auth', token);
    sessionStorage.setItem('role', me.role || 'viewer');
    sessionStorage.setItem('user', me.user || user);

    document.getElementById('login-screen').classList.add('hidden');
    load();
  } catch {
    errEl.textContent = 'Usuário ou senha incorretos';
    errEl.classList.add('show');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 450);
    document.getElementById('login-pass').value = '';
    document.getElementById('login-pass').focus();
  } finally {
    btn.disabled = false;
    btn.textContent = '🔓 Entrar';
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function doLogout() {
  if (!await confirmDialog('Deseja sair do sistema?', '⬅️', 'Sair', false)) return;
  sessionStorage.removeItem('auth');
  sessionStorage.removeItem('role');
  sessionStorage.removeItem('user');
  const badgeEl = document.getElementById('user-badge');
  if (badgeEl) badgeEl.style.display = 'none';
  allProjects = [];
  ['detail-view', 'agenda-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const gv = document.getElementById('grid-view');
  if (gv) gv.style.display = 'block';
  const ls = document.getElementById('login-screen');
  if (ls) ls.classList.remove('hidden');
  const lu = document.getElementById('login-user');
  const lp = document.getElementById('login-pass');
  const le = document.getElementById('login-error');
  if (lu) lu.value = '';
  if (lp) lp.value = '';
  if (le) le.classList.remove('show');
  setTimeout(() => { if (lu) lu.focus(); }, 100);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
let _confirmResolve = null;
function confirmDialog(msg, icon = '⚠️', okLabel = 'Confirmar', isDanger = true) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-icon').textContent = icon;
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.textContent = okLabel;
    okBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
    document.getElementById('confirmOverlay').classList.add('open');
  });
}
function _confirmOk() {
  document.getElementById('confirmOverlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
}
function _confirmCancel() {
  document.getElementById('confirmOverlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
}

// ── Comments ──────────────────────────────────────────────────────────────────
async function loadComments(projectId) {
  const container = document.getElementById('comments-container');
  if (!container) return;
  try {
    const list = await api(`/api/projects/${projectId}/comments`);
    if (!list.length) {
      container.innerHTML = '<span class="detail-empty">Nenhum comentário ainda.</span>';
      return;
    }
    container.innerHTML = list.map(c => `
      <div class="comment-item">
        <div class="comment-header">
          <span class="comment-author">👤 ${esc(c.author)}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="comment-time">${new Date(c.created_at).toLocaleString('pt-BR')}</span>
            ${isAdmin() ? `<button class="btn-sm danger" onclick="deleteComment(${c.id},${projectId})" style="padding:2px 8px;font-size:.7rem">✕</button>` : ''}
          </div>
        </div>
        <div class="comment-body">${esc(c.body)}</div>
      </div>`).join('');
  } catch { container.innerHTML = '<span class="detail-empty">Erro ao carregar comentários.</span>'; }
}

async function addComment(projectId) {
  const input = document.getElementById('comment-input');
  const body = (input?.value || '').trim();
  if (!body) { showToast('Digite um comentário', 'error'); return; }
  try {
    await api(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
    input.value = '';
    await loadComments(projectId);
    showToast('Comentário adicionado!', 'success');
  } catch { showToast('Erro ao enviar comentário', 'error'); }
}

async function deleteComment(commentId, projectId) {
  if (!await confirmDialog('Remover este comentário?', '💬', 'Remover')) return;
  try {
    await api(`/api/projects/${projectId}/comments/${commentId}`, { method: 'DELETE' });
    await loadComments(projectId);
    showToast('Comentário removido', 'success');
  } catch { showToast('Erro ao remover', 'error'); }
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory(projectId) {
  const container = document.getElementById('history-list');
  if (!container) return;
  try {
    const list = await api(`/api/projects/${projectId}/history`);
    if (!list.length) {
      container.innerHTML = '<span class="detail-empty">Nenhum registro ainda.</span>';
      return;
    }
    const actionColors = { criou: 'var(--realizado)', editou: 'var(--andamento)', excluiu: 'var(--recusado)', comentou: 'var(--editais)' };
    container.innerHTML = list.map(h => {
      // Formata o detail: se contém " | " quebra em linhas separadas
      let detailHtml = '';
      if (h.detail) {
        const parts = h.detail.split(' | ');
        if (parts.length > 1) {
          detailHtml = `<ul style="margin:4px 0 0 0;padding-left:14px;list-style:disc">${
            parts.map(p => `<li style="color:var(--text2);font-size:.8rem">${esc(p)}</li>`).join('')
          }</ul>`;
        } else {
          detailHtml = ` — <span style="color:var(--text2)">${esc(h.detail)}</span>`;
        }
      }
      return `
      <div class="history-item">
        <div class="history-dot" style="background:${actionColors[h.action] || 'var(--accent)'}"></div>
        <div class="history-text" style="flex:1">
          <strong>${esc(h.author)}</strong> ${esc(h.action)}${detailHtml}
        </div>
        <span class="history-time">${new Date(h.created_at).toLocaleString('pt-BR')}</span>
      </div>`;
    }).join('');
  } catch { container.innerHTML = '<span class="detail-empty">Erro ao carregar histórico.</span>'; }
}

function toggleHistory() {
  const container = document.getElementById('history-container');
  const icon = document.getElementById('history-toggle-icon');
  if (!container) return;
  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  if (icon) icon.textContent = isHidden ? '▲' : '▼';
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
let _dashCharts = {};

function openDashboard() {
  document.getElementById('grid-view').style.display      = 'none';
  document.getElementById('detail-view').style.display    = 'none';
  document.getElementById('agenda-view').style.display    = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  document.querySelectorAll('.sidebar-btn[data-filter]').forEach(b => b.classList.remove('active'));
  document.getElementById('dashboard-sidebar-btn').classList.add('active');
  document.getElementById('agenda-sidebar-btn').classList.remove('active');
  renderDashboard();
}

function closeDashboard() {
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('grid-view').style.display = 'block';
  document.getElementById('dashboard-sidebar-btn').classList.remove('active');
}

function renderDashboard() {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js não carregado — gráficos indisponíveis');
    return;
  }
  const STATUS_LIST = ['cadastrado','editais abertos','em andamento','realizado','recusado'];
  const STATUS_LABELS = { cadastrado:'Cadastrado', 'editais abertos':'Editais Abertos', 'em andamento':'Em Andamento', realizado:'Realizado', recusado:'Recusado' };
  const STATUS_COLORS = { cadastrado:'#ffb547', 'editais abertos':'#f97316', 'em andamento':'#6c63ff', realizado:'#00c9a7', recusado:'#ff5c6e' };
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
  const textColor = isDark ? '#8b90b5' : '#6b6f8e';

  // KPIs
  const total = allProjects.length;
  const totalBudget = allProjects.reduce((s,p) => s + (Number(p.budget) || 0), 0);
  const avgProgress = total ? Math.round(allProjects.reduce((s,p) => s + (Number(p.progress)||0), 0) / total) : 0;
  const kpiEl = document.getElementById('dash-kpis');
  if (kpiEl) kpiEl.innerHTML = `
    <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--text)">${total}</div><div class="dash-kpi-label">Total de Projetos</div></div>
    <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--realizado)">${allProjects.filter(p=>p.status==='realizado').length}</div><div class="dash-kpi-label">Realizados</div></div>
    <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--andamento)">${allProjects.filter(p=>p.status==='em andamento').length}</div><div class="dash-kpi-label">Em Andamento</div></div>
    <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--accent)">${avgProgress}%</div><div class="dash-kpi-label">Progresso Médio</div></div>
    <div class="dash-kpi"><div class="dash-kpi-num" style="color:var(--realizado);font-size:0.9rem;white-space:nowrap">${formatBudget(totalBudget,'BRL')}</div><div class="dash-kpi-label">Orçamento Total</div></div>`;

  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;

  // Destrói gráficos anteriores
  Object.values(_dashCharts).forEach(c => c.destroy());
  _dashCharts = {};

  const counts = STATUS_LIST.map(s => allProjects.filter(p => p.status === s).length);
  const budgets = STATUS_LIST.map(s => allProjects.filter(p => p.status === s).reduce((sum,p) => sum + (Number(p.budget)||0), 0));
  const progresses = STATUS_LIST.map(s => {
    const group = allProjects.filter(p => p.status === s);
    return group.length ? Math.round(group.reduce((sum,p) => sum + (Number(p.progress)||0), 0) / group.length) : 0;
  });
  const labels = STATUS_LIST.map(s => STATUS_LABELS[s]);
  const colors = STATUS_LIST.map(s => STATUS_COLORS[s]);

  // Pizza de status
  const ctxStatus = document.getElementById('chart-status');
  if (ctxStatus) {
    _dashCharts.status = new Chart(ctxStatus, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderWidth: 2, borderColor: isDark ? '#1a1d27' : '#fff' }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ padding:14, font:{ size:11 } } } } }
    });
  }

  // Barras de orçamento
  const ctxBudget = document.getElementById('chart-budget');
  if (ctxBudget) {
    _dashCharts.budget = new Chart(ctxBudget, {
      type: 'bar',
      data: { labels, datasets: [{ data: budgets, backgroundColor: colors, borderRadius: 6, borderSkipped: false }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
        scales:{ y:{ grid:{ color:gridColor }, ticks:{ callback: v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v } }, x:{ grid:{ display:false } } } }
    });
  }

  // Barras de progresso médio
  const ctxProg = document.getElementById('chart-progress');
  if (ctxProg) {
    _dashCharts.progress = new Chart(ctxProg, {
      type: 'bar',
      data: { labels, datasets: [{ data: progresses, backgroundColor: colors, borderRadius: 6, borderSkipped: false }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
        scales:{ y:{ min:0, max:100, grid:{ color:gridColor }, ticks:{ callback: v => `${v}%` } }, x:{ grid:{ display:false } } } }
    });
  }
}

// ── Viewer restrictions ───────────────────────────────────────────────────────
function applyViewerRestrictions() {
  const role = sessionStorage.getItem('role') || 'viewer';
  if (role === 'viewer') {
    // Esconde botões de criar/editar/excluir
    document.querySelectorAll('[id="novo-projeto-btn"]').forEach(el => el.style.display = 'none');
    // Remove formulário de comentários
    const cf = document.getElementById('comment-form-wrap');
    if (cf) cf.style.display = 'none';
  }
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// ── Attachment Preview ────────────────────────────────────────────────────────
// Mantém referência ao blob URL atual para revogar ao fechar (evita memory leak)
let _previewBlobUrl = null;

async function openPreview(url, name, downloadUrl) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const content = document.getElementById('preview-content');
  const nameEl  = document.getElementById('preview-name');
  const dlEl    = document.getElementById('preview-download');

  nameEl.textContent = name;
  // O botão de download usa a URL com ?dl=1 (força attachment no servidor)
  dlEl.href = downloadUrl || url;
  dlEl.download = name;

  // Mostra spinner enquanto carrega
  content.innerHTML = `<div style="color:var(--text2);font-size:1.1rem">⏳ Carregando...</div>`;
  document.getElementById('previewOverlay').classList.add('open');

  const imgExts = ['jpg','jpeg','png','gif','webp','svg','bmp'];
  const isImg = imgExts.includes(ext);
  const isPdf = ext === 'pdf';

  if (isImg || isPdf) {
    try {
      // Fetch com Authorization header — necessário pois <img>/<iframe> não enviam credenciais Basic Auth
      const res = await fetch(url, { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // Revoga blob URL anterior para evitar memory leak
      if (_previewBlobUrl) { URL.revokeObjectURL(_previewBlobUrl); _previewBlobUrl = null; }
      _previewBlobUrl = URL.createObjectURL(blob);
      if (isImg) {
        content.innerHTML = `<img src="${_previewBlobUrl}" alt="${esc(name)}">`;
      } else {
        content.innerHTML = `<iframe src="${_previewBlobUrl}" title="${esc(name)}"></iframe>`;
      }
    } catch(e) {
      content.innerHTML = `<div class="preview-fallback">
        <div style="font-size:3rem;margin-bottom:12px">⚠️</div>
        <div style="margin-bottom:16px;color:var(--text)">Não foi possível carregar o arquivo.</div>
        <a class="preview-download" href="${esc(downloadUrl || url)}" download="${esc(name)}">⬇ Baixar ${esc(name)}</a>
      </div>`;
    }
  } else {
    content.innerHTML = `<div class="preview-fallback">
      <div style="font-size:3rem;margin-bottom:12px">📎</div>
      <div style="margin-bottom:16px;color:var(--text)">Preview não disponível para este tipo de arquivo.</div>
      <a class="preview-download" href="${esc(downloadUrl || url)}" download="${esc(name)}">⬇ Baixar ${esc(name)}</a>
    </div>`;
  }
}

function closePreview(e) {
  if (e && e.target !== document.getElementById('previewOverlay')) return;
  document.getElementById('previewOverlay').classList.remove('open');
  document.getElementById('preview-content').innerHTML = '';
  // Libera memória do blob URL
  if (_previewBlobUrl) { URL.revokeObjectURL(_previewBlobUrl); _previewBlobUrl = null; }
}

// ── Skeleton Loading ──────────────────────────────────────────────────────────
function showSkeletons(count = 6) {
  const container = document.getElementById('list');
  if (!container) return;
  container.innerHTML = Array.from({length: count}, () => `
    <div class="skeleton">
      <div class="skel-row"><div class="skel-line skel-title"></div><div class="skel-line skel-badge"></div></div>
      <div class="skel-line skel-desc"></div>
      <div class="skel-line skel-desc2"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-top:4px">
        <div class="skel-line" style="height:32px;border-radius:8px"></div>
        <div class="skel-line" style="height:32px;border-radius:8px"></div>
      </div>
      <div class="skel-line skel-bar" style="margin-top:4px"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <div class="skel-line skel-btn" style="flex:2"></div>
        <div class="skel-line skel-btn" style="flex:1"></div>
        <div class="skel-line skel-btn" style="flex:1"></div>
      </div>
    </div>`).join('');
}


// ── Init ──────────────────────────────────────────────────────────────────────
// Aplica tema salvo (antes de qualquer render)
applyTheme(localStorage.getItem('theme') || 'dark');

// load() só é chamado após login bem-sucedido (ou se já autenticado)
if (sessionStorage.getItem('auth')) load();

// ── PWA — Registra Service Worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Falha ao registrar:', err));
  });
}

// ── PWA — Banner de instalação iOS ───────────────────────────────────────────
(function() {
  const isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari  = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem('pwa-dismissed');
  if (isIOS && isSafari && !isStandalone && !dismissed) {
    setTimeout(() => {
      const el = document.getElementById('pwa-banner');
      if (el) el.style.display = 'flex';
    }, 3000); // aparece 3s após carregar
  }
})();
