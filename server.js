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
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'self'"],
      baseUri:    ["'self'"],
      formAction: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
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
    const decoded = Buffer.from(base64, 'base64').toString();
    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 1) throw new Error('invalid');
    const user = decoded.substring(0, colonIdx);
    const pass = decoded.substring(colonIdx + 1);
    const storedPass = USER_MAP[user];
    if (storedPass) {
      // timing-safe comparison para evitar timing attacks
      const a = Buffer.from(pass.padEnd(storedPass.length));
      const b = Buffer.from(storedPass);
      if (a.length === b.length && require('crypto').timingSafeEqual(a, b)) {
        ok = true;
        resolvedUser = user;
      }
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
  // x-forwarded-for pode ter múltiplos IPs (proxies encadeados) — pega só o primeiro real
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? forwarded.split(',')[0].trim().replace(/[^0-9a-fA-F.:]/g, '')
    : (req.socket.remoteAddress || '-');
  const user = req.authUser || 'anon';
  const line = `[${new Date().toISOString()}] ${ip} ${user} ${req.method} ${req.originalUrl}`;
  writeLog(line);
  next();
});

// ── JSON Content-Type apenas para rotas que retornam JSON ──────────────────────
app.use('/api', (req, res, next) => {
  // Não sobrescreve rotas de arquivos binários (attachments)
  if (!req.path.includes('/attachments/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── 6. Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1h'
}));

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

const storage = multer.memoryStorage();

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

// Gera filename único sanitizado para novos uploads
function makeFilename(originalname) {
  const ext  = path.extname(originalname).replace(/[^a-zA-Z0-9.]/g, '').substring(0, 10);
  const base = path.basename(originalname, path.extname(originalname))
                  .replace(/[^a-zA-Z0-9\-_]/g, '_')
                  .substring(0, 60);
  return `${Date.now()}_${base}${ext}`;
}

// Salva arquivos do req.files (memoryStorage) no DB e retorna array de metadados
async function persistFiles(files) {
  const result = [];
  for (const f of (files || [])) {
    const filename = makeFilename(f.originalname);
    await db.saveFileBlob(filename, f.originalname, f.mimetype, f.buffer);
    result.push({ originalname: f.originalname, filename, mimetype: f.mimetype });
  }
  return result;
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
    const files = await persistFiles(req.files);
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
    const files = await persistFiles(req.files);
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

// ── Attachments serve ─────────────────────────────────────────────────────────
// ?dl=1  → força download   (padrão para tipos não visualizáveis)
// sem ?dl → tenta abrir inline no browser (imagens, PDF)
const INLINE_TYPES = new Set(['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf']);

app.get('/api/projects/:id/attachments/:filename', async (req, res) => {
  const id = sanitizeId(req.params.id);
  const filename = sanitizeFilename(req.params.filename);
  if (!id || !filename) return res.status(400).json({ error: 'Parâmetros inválidos' });
  try {
    const blob = await db.getFileBlob(filename);
    if (!blob) return res.status(404).send('Arquivo não encontrado');
    const forceDownload = req.query.dl === '1' || !INLINE_TYPES.has(blob.mimetype);
    res.setHeader('Content-Type', blob.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(blob.originalname)}"`);
    res.setHeader('Content-Length', blob.data.length);
    res.send(blob.data);
  } catch (err) {
    console.error('[GET attachment]', err.message);
    res.status(500).json({ error: 'Erro ao servir arquivo' });
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
    const newFiles = await persistFiles(req.files);
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
    const newFiles = await persistFiles(req.files);
    if (!newFiles.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const phase = await db.getPhaseById(pid);
    if (!phase) return res.status(404).json({ error: 'Phase not found' });
    await db.updatePhase(pid, phase, newFiles);
    res.json({ ok: true, added: newFiles.length });
  } catch(err){ res.status(500).json({ error: 'Erro interno' }); }
});

app.get('/api/projects/:id/phases/:pid/attachments/:filename', async (req, res) => {
  const pid      = sanitizeId(req.params.pid);
  const filename = sanitizeFilename(req.params.filename);
  if (!pid || !filename) return res.status(400).json({ error: 'Parâmetros inválidos' });
  try {
    const blob = await db.getFileBlob(filename);
    if (!blob) return res.status(404).send('Arquivo não encontrado');
    const forceDownload = req.query.dl === '1' || !INLINE_TYPES.has(blob.mimetype);
    res.setHeader('Content-Type', blob.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(blob.originalname)}"`);
    res.setHeader('Content-Length', blob.data.length);
    res.send(blob.data);
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
      const budget  = isFinite(Number(p.budget)) ? Number(p.budget) : 0;
      const progress = isFinite(Number(p.progress)) ? Math.max(0, Math.min(100, Number(p.progress))) : 0;
      const currency = (p.currency || 'BRL').replace(/[^A-Z]/g, '').substring(0,3);
      const d = v => v ? `'${String(v).replace(/[^0-9\-]/g,'')}'` : 'NULL';
      lines.push(`INSERT INTO projects (id, name, description, status, client, budget, currency, progress, inscription_start, inscription_end, inscription_response, project_start, project_end, created_at) VALUES (`);
      lines.push(`  ${p.id}, '${name}', '${desc}', '${status}', '${client}', ${budget}, '${currency}', ${progress},`);
      lines.push(`  ${d(p.inscription_start)}, ${d(p.inscription_end)}, ${d(p.inscription_response)},`);
      lines.push(`  ${d(p.project_start)}, ${d(p.project_end)}, NOW()`);
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
