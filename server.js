require('dotenv').config();
const path    = require('path');
const fs      = require('fs');
const express = require('express');
const multer  = require('multer');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const hpp     = require('hpp');
const app     = express();
const PORT    = process.env.PORT || 3000;
const db      = require('./db');
const PKG_VERSION = require('./package.json').version;
const { checkAndNotify } = require('./notifier');

// ── 0. Access Log ─────────────────────────────────────────────────────────────
const LOG_DIR  = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'access.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function writeLog(line) {
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// ── 1. Security Headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false
}));

// ── 2. HTTP Parameter Pollution ───────────────────────────────────────────────
app.use(hpp());

// ── 3. Rate Limiting ──────────────────────────────────────────────────────────
// Geral: 200 req / 15 min por IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' }
}));

// Upload: 20 req / 15 min por IP (mais restritivo)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Limite de uploads atingido. Aguarde 15 minutos.' }
});

// ── 4. Usuários e Roles ───────────────────────────────────────────────────────
const USER_MAP = {};
const ROLE_MAP = {};

const ADMIN_USER = (process.env.ADMIN_USER || '').trim();
const ADMIN_PASS = (process.env.ADMIN_PASS || '').trim();
const VIEWER_USER = (process.env.VIEWER_USER || '').trim();
const VIEWER_PASS = (process.env.VIEWER_PASS || '').trim();

if (ADMIN_USER && ADMIN_PASS) {
  USER_MAP[ADMIN_USER] = ADMIN_PASS;
  ROLE_MAP[ADMIN_USER] = 'admin';
  console.log(`[AUTH] Usuário admin carregado: ${ADMIN_USER}`);
} else {
  console.warn('[SECURITY] ADMIN_USER/ADMIN_PASS não definidos — autenticação desabilitada!');
}

if (VIEWER_USER && VIEWER_PASS) {
  USER_MAP[VIEWER_USER] = VIEWER_PASS;
  ROLE_MAP[VIEWER_USER] = 'viewer';
  console.log(`[AUTH] Usuário viewer carregado: ${VIEWER_USER}`);
}

// Middleware de auth SEM challenge — não abre popup do browser, retorna 401 silencioso
function requireAuth(req, res, next) {
  if (!ADMIN_USER) return next(); // auth desabilitada
  const authHeader = req.headers['authorization'] || '';
  const base64 = authHeader.replace(/^Basic\s+/i, '');
  let ok = false;
  let resolvedUser = null;
  try {
    const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');
    if (USER_MAP[user] && USER_MAP[user] === pass) {
      ok = true;
      resolvedUser = user;
    }
  } catch { ok = false; }
  if (!ok) return res.status(401).json({ error: 'Não autorizado' });
  req.authUser = resolvedUser;
  req.authRole = ROLE_MAP[resolvedUser] || 'viewer';
  next();
}

// Middleware que bloqueia viewers de operações de escrita
function requireAdmin(req, res, next) {
  if (req.authRole === 'viewer') return res.status(403).json({ error: 'Acesso negado — perfil somente leitura' });
  next();
}

app.use('/api', requireAuth);

// Log de acesso após auth (para registrar usuário resolvido)
app.use('/api', (req, res, next) => {
  const ip   = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '-';
  const user = req.authUser || 'anon';
  const line = `[${new Date().toISOString()}] ${ip} ${user} ${req.method} ${req.originalUrl}`;
  writeLog(line);
  next();
});

// ── 5. Body size limit ────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── 6. Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h'
}));

// ── 7. UTF-8 em todas as respostas JSON ───────────────────────────────────────
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// ── 8. File Upload — validação de tipo e tamanho ─────────────────────────────
const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg','image/png','image/gif','image/webp',
  'application/zip','application/x-rar-compressed',
  'video/mp4','audio/mpeg','text/plain','text/csv'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads/')),
  filename: (req, file, cb) => {
    // Sanitiza nome — remove caracteres perigosos, mantém extensão
    const ext  = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').substring(0, 10);
    const base = path.basename(file.originalname, path.extname(file.originalname))
                    .replace(/[^a-zA-Z0-9\-_]/g, '_')
                    .substring(0, 60);
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMETYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB por arquivo
    files: 10                    // máx 10 arquivos por request
  }
});

// ── 9. Helpers de validação ───────────────────────────────────────────────────
function sanitizeId(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

function sanitizeFilename(val) {
  // Previne path traversal: remove ../ e caracteres perigosos
  const clean = path.basename(String(val || '')).replace(/[^a-zA-Z0-9.\-_]/g, '_');
  if (!clean || clean.startsWith('.')) return null;
  return clean;
}

function safeJson(body) {
  try {
    return typeof body === 'string' ? JSON.parse(body) : body;
  } catch { return {}; }
}

// ── CRUD endpoints ────────────────────────────────────────────────────────────
// Quem sou eu? — retorna usuário e role para o frontend
app.get('/api/me', (req, res) => {
  const user = req.authUser || null;
  const role = req.authRole || (user === ADMIN_USER ? 'admin' : 'viewer');
  res.json({ user, role });
});

// Versão da aplicação
app.get('/api/version', (req, res) => {
  res.json({ version: PKG_VERSION });
});

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await db.getAllProjects();
    res.json(projects);
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/projects/:id', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const project = await db.getProjectById(id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/projects', requireAdmin, uploadLimiter, upload.array('attachments'), async (req, res) => {
  try {
    const payload = safeJson(req.body.payload || req.body);
    if (!payload.name || String(payload.name).trim().length === 0)
      return res.status(400).json({ error: 'Nome é obrigatório' });
    const files = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
    const id = await db.createProject(payload, files);
    await db.addHistory(id, req.authUser, 'criou', `Projeto "${payload.name}" criado com status "${payload.status || 'cadastrado'}"`);
    res.status(201).json({ id });
  } catch (err) {
    console.error('[POST /api/projects]', err.message);
    res.status(400).json({ error: 'Bad request' });
  }
});

app.put('/api/projects/:id', requireAdmin, uploadLimiter, upload.array('attachments'), async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const payload = safeJson(req.body.payload || req.body);
    const files = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
    const existing = await db.getProjectById(id);
    const changed = await db.updateProject(id, payload, files);
    if (!changed) return res.status(404).json({ error: 'Not found' });
    // Registra histórico com campos que mudaram
    const changes = [];
    if (existing && payload.status && payload.status !== existing.status)
      changes.push(`status: "${existing.status}" → "${payload.status}"`);
    if (existing && payload.name && payload.name !== existing.name)
      changes.push(`nome: "${existing.name}" → "${payload.name}"`);
    if (payload.progress !== undefined && existing && Number(payload.progress) !== Number(existing.progress))
      changes.push(`progresso: ${existing.progress}% → ${payload.progress}%`);
    const detail = changes.length ? changes.join('; ') : 'Dados atualizados';
    await db.addHistory(id, req.authUser, 'editou', detail);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/projects]', err.message);
    res.status(400).json({ error: 'Bad request' });
  }
});

app.delete('/api/projects/:id', requireAdmin, async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const project = await db.getProjectById(id);
    const deleted = await db.deleteProject(id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    // Histórico do projeto já foi excluído em cascata — não registra mais
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

// ── Attachments download ──────────────────────────────────────────────────────
app.get('/api/projects/:id/attachments/:filename', async (req, res) => {
  const id = sanitizeId(req.params.id);
  const filename = sanitizeFilename(req.params.filename);
  if (!id || !filename) return res.status(400).json({ error: 'Parâmetros inválidos' });
  try {
    const project = await db.getProjectById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const att = (project.attachments || []).find(a => a.filename === filename);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = path.join(__dirname, 'uploads', filename);
    // Garante que o arquivo está dentro da pasta uploads (anti path traversal)
    if (!filePath.startsWith(path.join(__dirname, 'uploads')))
      return res.status(403).json({ error: 'Acesso negado' });
    res.download(filePath, att.originalname);
  } catch (err) {
    console.error('[GET attachment]', err.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ── Institutions ──────────────────────────────────────────────────────────────
app.get('/api/projects/:id/institutions', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try { res.json(await db.getInstitutions(id)); }
  catch { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/projects/:id/institutions', requireAdmin, async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!req.body.name || String(req.body.name).trim().length === 0)
    return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const iid = await db.createInstitution(id, req.body);
    res.status(201).json({ id: iid });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

app.put('/api/projects/:id/institutions/:iid', requireAdmin, async (req, res) => {
  const id  = sanitizeId(req.params.id);
  const iid = sanitizeId(req.params.iid);
  if (!id || !iid) return res.status(400).json({ error: 'ID inválido' });
  try {
    const ok = await db.updateInstitution(iid, req.body);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

app.delete('/api/projects/:id/institutions/:iid', requireAdmin, async (req, res) => {
  const iid = sanitizeId(req.params.iid);
  if (!iid) return res.status(400).json({ error: 'ID inválido' });
  try {
    const ok = await db.deleteInstitution(iid);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

// ── Phases ────────────────────────────────────────────────────────────────────
app.get('/api/projects/:id/phases', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try { res.json(await db.getPhases(id)); }
  catch { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/projects/:id/phases', requireAdmin, async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!req.body.name || String(req.body.name).trim().length === 0)
    return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const pid = await db.createPhase(id, req.body);
    res.status(201).json({ id: pid });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

app.put('/api/projects/:id/phases/:pid', requireAdmin, uploadLimiter, upload.array('phase_attachments'), async (req, res) => {
  const id  = sanitizeId(req.params.id);
  const pid = sanitizeId(req.params.pid);
  if (!id || !pid) return res.status(400).json({ error: 'ID inválido' });
  try {
    const data = safeJson(req.body.payload || req.body);
    const newFiles = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
    const ok = await db.updatePhase(pid, data, newFiles);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

app.delete('/api/projects/:id/phases/:pid', requireAdmin, async (req, res) => {
  const pid = sanitizeId(req.params.pid);
  if (!pid) return res.status(400).json({ error: 'ID inválido' });
  try {
    const ok = await db.deletePhase(pid);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

// ── Phase Attachments ─────────────────────────────────────────────────────────
app.post('/api/projects/:id/phases/:pid/attachments', requireAdmin, uploadLimiter, upload.array('phase_attachments'), async (req, res) => {
  const id  = sanitizeId(req.params.id);
  const pid = sanitizeId(req.params.pid);
  if (!id || !pid) return res.status(400).json({ error: 'ID inválido' });
  try {
    const newFiles = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
    if (!newFiles.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const phase = await db.getPhaseById(pid);
    if (!phase) return res.status(404).json({ error: 'Phase not found' });
    await db.updatePhase(pid, phase, newFiles);
    res.json({ ok: true, added: newFiles.length });
  } catch(err){ res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/projects/:id/phases/:pid/attachments/:filename', async (req, res) => {
  const id       = sanitizeId(req.params.id);
  const pid      = sanitizeId(req.params.pid);
  const filename = sanitizeFilename(req.params.filename);
  if (!id || !pid || !filename) return res.status(400).json({ error: 'Parâmetros inválidos' });
  try {
    const phase = await db.getPhaseById(pid);
    if (!phase) return res.status(404).json({ error: 'Phase not found' });
    const att = (phase.attachments || []).find(a => a.filename === filename);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = path.join(__dirname, 'uploads', filename);
    if (!filePath.startsWith(path.join(__dirname, 'uploads')))
      return res.status(403).json({ error: 'Acesso negado' });
    res.download(filePath, att.originalname);
  } catch(err){ res.status(500).json({ error: 'Erro interno' }); }
});

app.delete('/api/projects/:id/phases/:pid/attachments/:filename', requireAdmin, async (req, res) => {
  const pid      = sanitizeId(req.params.pid);
  const filename = sanitizeFilename(req.params.filename);
  if (!pid || !filename) return res.status(400).json({ error: 'Parâmetros inválidos' });
  try {
    const ok = await db.removePhaseAttachment(pid, filename);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

// ── Comments ──────────────────────────────────────────────────────────────────
app.get('/api/projects/:id/comments', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try { res.json(await db.getComments(id)); }
  catch { res.status(500).json({ error: 'Erro interno' }); }
});

app.post('/api/projects/:id/comments', requireAdmin, async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comentário vazio' });
  try {
    const cid = await db.addComment(id, req.authUser, body);
    await db.addHistory(id, req.authUser, 'comentou', body.substring(0, 100));
    res.status(201).json({ id: cid });
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

app.delete('/api/projects/:id/comments/:cid', requireAdmin, async (req, res) => {
  const cid = sanitizeId(req.params.cid);
  if (!cid) return res.status(400).json({ error: 'ID inválido' });
  try {
    const ok = await db.deleteComment(cid);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

// ── History ───────────────────────────────────────────────────────────────────
app.get('/api/projects/:id/history', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try { res.json(await db.getHistory(id)); }
  catch { res.status(500).json({ error: 'Erro interno' }); }
});

// ── Backup ────────────────────────────────────────────────────────────────────
app.get('/api/backup', requireAdmin, async (req, res) => {
  try {
    const projects = await db.getAllProjects();
    const lines = [];
    const ts = new Date().toISOString();
    lines.push(`-- Backup gerado em ${ts}`);
    lines.push(`-- Total de projetos: ${projects.length}`);
    lines.push('');

    for (const p of projects) {
      const name    = (p.name    || '').replace(/'/g, "''");
      const desc    = (p.description || '').replace(/'/g, "''");
      const client  = (p.client  || '').replace(/'/g, "''");
      const status  = (p.status  || '').replace(/'/g, "''");
      const tags    = JSON.stringify(Array.isArray(p.tags) ? p.tags : []).replace(/'/g, "''");
      lines.push(`INSERT INTO projects (id, name, description, status, client, budget, currency, progress, inscription_start, inscription_end, inscription_response, project_start, project_end, tags, created_at) VALUES (`);
      lines.push(`  ${p.id}, '${name}', '${desc}', '${status}', '${client}', ${p.budget||0}, '${p.currency||'BRL'}', ${p.progress||0},`);
      lines.push(`  ${p.inscription_start ? `'${p.inscription_start}'` : 'NULL'}, ${p.inscription_end ? `'${p.inscription_end}'` : 'NULL'}, ${p.inscription_response ? `'${p.inscription_response}'` : 'NULL'},`);
      lines.push(`  ${p.project_start ? `'${p.project_start}'` : 'NULL'}, ${p.project_end ? `'${p.project_end}'` : 'NULL'}, '${tags}', NOW()`);
      lines.push(`);`);
    }

    const filename = `backup_${ts.substring(0,10)}.sql`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('[GET /api/backup]', err.message);
    res.status(500).json({ error: 'Erro ao gerar backup' });
  }
});

// ── Error handler global ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Erros do multer
  if (err && err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'Arquivo muito grande. Máximo: 10MB' });
  if (err && err.code === 'LIMIT_FILE_COUNT')
    return res.status(400).json({ error: 'Muitos arquivos. Máximo: 10 por envio' });
  if (err && err.message && err.message.includes('não permitido'))
    return res.status(415).json({ error: err.message });
  console.error('[Unhandled Error]', err?.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// initialize DB then start server
// Exporta app para testes de integração (supertest)
module.exports = { app, db };

if (require.main === module) {
  db.init().then(()=>{
    app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));

    // ── Notificações diárias ────────────────────────────────────────────────
    // Executa imediatamente ao subir e depois a cada 24h
    const NOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
    checkAndNotify().catch(err => console.error('[NOTIFIER]', err.message));
    setInterval(() => {
      checkAndNotify().catch(err => console.error('[NOTIFIER]', err.message));
    }, NOTIFY_INTERVAL_MS);

  }).catch(err=>{
    console.error('Failed to initialize DB', err);
    process.exit(1);
  });
}
