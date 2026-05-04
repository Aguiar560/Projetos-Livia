require('dotenv').config();
const path = require('path');
const express = require('express');
const multer = require('multer');
const bodyParser = express.json();
const app = express();
const PORT = process.env.PORT || 3000;

const db = require('./db');

// força UTF-8 em todas as respostas JSON da API
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser);

// file uploads — mantém nome original com timestamp para evitar colisões
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads/')),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });

// CRUD endpoints
app.get('/api/projects', async (req, res) => {
  const projects = await db.getAllProjects();
  res.json(projects);
});

app.get('/api/projects/:id', async (req, res) => {
  const project = await db.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
});

app.post('/api/projects', upload.array('attachments'), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload || JSON.stringify(req.body));
    const files = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename, path: f.path }));
    const id = await db.createProject(payload, files);
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Bad request' });
  }
});

app.put('/api/projects/:id', upload.array('attachments'), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload || JSON.stringify(req.body));
    const files = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename, path: f.path }));
    const changed = await db.updateProject(req.params.id, payload, files);
    if (!changed) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Bad request' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  const deleted = await db.deleteProject(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// download de anexo: GET /api/projects/:id/attachments/:filename
app.get('/api/projects/:id/attachments/:filename', async (req, res) => {
  try {
    const project = await db.getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const att = (project.attachments || []).find(a => a.filename === req.params.filename);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = path.join(__dirname, 'uploads', att.filename);
    res.download(filePath, att.originalname);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ── Institutions ─────────────────────────────────────────────────────────────
app.get('/api/projects/:id/institutions', async (req, res) => {
  try { res.json(await db.getInstitutions(req.params.id)); }
  catch(err){ res.status(500).json({ error: err.message }); }
});
app.post('/api/projects/:id/institutions', async (req, res) => {
  try {
    const id = await db.createInstitution(req.params.id, req.body);
    res.status(201).json({ id });
  } catch(err){ res.status(400).json({ error: err.message }); }
});
app.put('/api/projects/:id/institutions/:iid', async (req, res) => {
  try {
    const ok = await db.updateInstitution(req.params.iid, req.body);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});
app.delete('/api/projects/:id/institutions/:iid', async (req, res) => {
  try {
    const ok = await db.deleteInstitution(req.params.iid);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch(err){ res.status(500).json({ error: err.message }); }
});

// ── Phases ───────────────────────────────────────────────────────────────────
app.get('/api/projects/:id/phases', async (req, res) => {
  try { res.json(await db.getPhases(req.params.id)); }
  catch(err){ res.status(500).json({ error: err.message }); }
});
app.post('/api/projects/:id/phases', async (req, res) => {
  try {
    const id = await db.createPhase(req.params.id, req.body);
    res.status(201).json({ id });
  } catch(err){ res.status(400).json({ error: err.message }); }
});
app.put('/api/projects/:id/phases/:pid', upload.array('phase_attachments'), async (req, res) => {
  try {
    const data = req.body.payload ? JSON.parse(req.body.payload) : req.body;
    const newFiles = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
    const ok = await db.updatePhase(req.params.pid, data, newFiles);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});
app.delete('/api/projects/:id/phases/:pid', async (req, res) => {
  try {
    const ok = await db.deletePhase(req.params.pid);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch(err){ res.status(500).json({ error: err.message }); }
});

// Upload de anexo de fase
app.post('/api/projects/:id/phases/:pid/attachments', upload.array('phase_attachments'), async (req, res) => {
  try {
    const newFiles = (req.files || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
    if (!newFiles.length) return res.status(400).json({ error: 'No files' });
    const phase = await db.getPhaseById(req.params.pid);
    if (!phase) return res.status(404).json({ error: 'Phase not found' });
    const attachments = (phase.attachments || []).concat(newFiles);
    await db.updatePhase(req.params.pid, phase, newFiles);
    res.json({ ok: true, added: newFiles.length });
  } catch(err){ res.status(500).json({ error: err.message }); }
});

// Download de anexo de fase
app.get('/api/projects/:id/phases/:pid/attachments/:filename', async (req, res) => {
  try {
    const phase = await db.getPhaseById(req.params.pid);
    if (!phase) return res.status(404).json({ error: 'Phase not found' });
    const att = (phase.attachments || []).find(a => a.filename === req.params.filename);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    res.download(path.join(__dirname, 'uploads', att.filename), att.originalname);
  } catch(err){ res.status(500).json({ error: err.message }); }
});

// Remover anexo de fase
app.delete('/api/projects/:id/phases/:pid/attachments/:filename', async (req, res) => {
  try {
    const ok = await db.removePhaseAttachment(req.params.pid, req.params.filename);
    ok ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
  } catch(err){ res.status(500).json({ error: err.message }); }
});

// initialize DB then start server
db.init().then(()=>{
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
}).catch(err=>{
  console.error('Failed to initialize DB', err);
  process.exit(1);
});
