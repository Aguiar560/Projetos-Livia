require('dotenv').config();
const path    = require('path');
const express = require('express');
const multer  = require('multer');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const hpp     = require('hpp');
const app     = express();
const PORT    = process.env.PORT || 3000;
const db      = require('./db');

// ── 1. Security Headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],   // inline JS do frontend
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false // evita bloquear downloads
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
// Formato no .env: USERS=admin:senha1:admin,livia:senha2:comum
const USER_MAP  = {}; // { usuario: senha }
const ROLE_MAP  = {}; // { usuario: 'admin' | 'comum' }

(process.env.USERS || '').split(',').forEach(entry => {
  const parts = entry.trim().split(':');
  if (parts.length >= 3) {
    const user = parts[0];
    const pass = parts[1];
    const role = parts[2].trim(); // trim para remover espaços/quebras de linha
    USER_MAP[user]  = pass;
    ROLE_MAP[user]  = role === 'admin' ? 'admin' : 'comum';
    console.log(`[AUTH] Usuário carregado: ${user} → role: ${ROLE_MAP[user]}`);
  }
});

if (Object.keys(USER_MAP).length === 0) {
  console.warn('[SECURITY] Nenhum usuário configurado em USERS — autenticação desabilitada!');
} else {
  app.use(basicAuth({
    users: USER_MAP,
    challenge: true,
    realm: 'Projeto Livia'
  }));
}

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
  const user = req.auth?.user || null;
  const role = ROLE_MAP[user] || 'comum';
  res.json({ user, role });
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

app.post('/api/projects', uploadLimiter, upload.array('attachments'), async (req, res) => {
  try {
    const payload = safeJson(req.body.payload || req.body);
    if (!payload.name || String(payload.name).trim().length === 0)
      return res.status(400).json({ error: 'Nome é obrigatório' });
    const files = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
    const id = await db.createProject(payload, files);
    res.status(201).json({ id });
  } catch (err) {
    console.error('[POST /api/projects]', err.message);
    res.status(400).json({ error: 'Bad request' });
  }
});

app.put('/api/projects/:id', uploadLimiter, upload.array('attachments'), async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const payload = safeJson(req.body.payload || req.body);
    const files = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
    const changed = await db.updateProject(id, payload, files);
    if (!changed) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /api/projects]', err.message);
    res.status(400).json({ error: 'Bad request' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  // Apenas admins podem excluir
  if (ROLE_MAP[req.auth?.user] !== 'admin')
    return res.status(403).json({ error: 'Apenas administradores podem excluir projetos.' });
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const deleted = await db.deleteProject(id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
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

app.post('/api/projects/:id/institutions', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!req.body.name || String(req.body.name).trim().length === 0)
    return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const iid = await db.createInstitution(id, req.body);
    res.status(201).json({ id: iid });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

app.put('/api/projects/:id/institutions/:iid', async (req, res) => {
  const id  = sanitizeId(req.params.id);
  const iid = sanitizeId(req.params.iid);
  if (!id || !iid) return res.status(400).json({ error: 'ID inválido' });
  try {
    const ok = await db.updateInstitution(iid, req.body);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

app.delete('/api/projects/:id/institutions/:iid', async (req, res) => {
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

app.post('/api/projects/:id/phases', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!req.body.name || String(req.body.name).trim().length === 0)
    return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const pid = await db.createPhase(id, req.body);
    res.status(201).json({ id: pid });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

app.put('/api/projects/:id/phases/:pid', uploadLimiter, upload.array('phase_attachments'), async (req, res) => {
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

app.delete('/api/projects/:id/phases/:pid', async (req, res) => {
  const pid = sanitizeId(req.params.pid);
  if (!pid) return res.status(400).json({ error: 'ID inválido' });
  try {
    const ok = await db.deletePhase(pid);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch { res.status(500).json({ error: 'Erro interno' }); }
});

// ── Phase Attachments ─────────────────────────────────────────────────────────
app.post('/api/projects/:id/phases/:pid/attachments', uploadLimiter, upload.array('phase_attachments'), async (req, res) => {
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

app.delete('/api/projects/:id/phases/:pid/attachments/:filename', async (req, res) => {
  const pid      = sanitizeId(req.params.pid);
  const filename = sanitizeFilename(req.params.filename);
  if (!pid || !filename) return res.status(400).json({ error: 'Parâmetros inválidos' });
  try {
    const ok = await db.removePhaseAttachment(pid, filename);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch { res.status(500).json({ error: 'Erro interno' }); }
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
db.init().then(()=>{
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
}).catch(err=>{
  console.error('Failed to initialize DB', err);
  process.exit(1);
});
