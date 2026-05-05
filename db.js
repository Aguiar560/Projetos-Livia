const mysql = require('mysql2/promise');

// Configure via env vars: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'projeto_livia'
};

let POOL = null;

async function ensureDatabaseExists(){
  // O banco já existe na Hostinger — apenas retorna o nome limpo
  const dbName = (DB_CONFIG.database || 'projeto_livia').trim().replace(/`/g, '');
  return dbName;
}

async function init(){
  const dbName = await ensureDatabaseExists();
  POOL = mysql.createPool({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    database: dbName,
    charset: 'utf8mb4',
    timezone: 'local',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // garante encoding em cada nova conexão do pool
  POOL.on('connection', (conn) => {
    conn.query("SET NAMES 'utf8mb4'", (err) => {
      if (err) conn.query("SET NAMES 'utf8'");
    });
    conn.query("SET character_set_client = utf8");
    conn.query("SET character_set_connection = utf8");
    conn.query("SET character_set_results = utf8");
  });

  // create table if not exists
  const createSql = `
  CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL,
    start_date DATE,
    end_date DATE,
    client VARCHAR(255),
    budget DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'BRL',
    progress INT,
    tags TEXT,
    attachments JSON,
    inscription_start DATE,
    inscription_end DATE,
    project_start DATE,
    project_end DATE,
    inscription_response DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `;
  const conn = await POOL.getConnection();
  try{
    try{
      await conn.query(createSql);
    } catch(err){
      if(err && (err.code === 'ER_PARSE_ERROR' || err.code === 'ER_UNKNOWN_TYPE')){
        const alt = createSql.replace('attachments JSON,', 'attachments TEXT,');
        await conn.query(alt);
      } else {
        throw err;
      }
    }
    // add new columns to existing tables (safe - ignores if already exists)
    const alterCols = [
      "ALTER TABLE projects ADD COLUMN currency VARCHAR(3) DEFAULT 'BRL'",
      "ALTER TABLE projects ADD COLUMN inscription_start DATE",
      "ALTER TABLE projects ADD COLUMN inscription_end DATE",
      "ALTER TABLE projects ADD COLUMN project_start DATE",
      "ALTER TABLE projects ADD COLUMN project_end DATE",
      "ALTER TABLE projects ADD COLUMN inscription_response DATE",
      "ALTER TABLE projects ADD COLUMN edital_name VARCHAR(255)",
      "ALTER TABLE projects ADD COLUMN edital_url VARCHAR(1024)",
      "ALTER TABLE project_institutions ADD COLUMN budget_value DECIMAL(12,2) DEFAULT 0"
    ];
    for (const sql of alterCols) {
      try { await conn.query(sql); } catch(e) { /* column already exists, ignore */ }
    }

    // institutions table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS project_institutions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        budget_percent DECIMAL(5,2) DEFAULT 0,
        budget_value DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // phases table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS project_phases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        budget DECIMAL(12,2) DEFAULT 0,
        progress INT DEFAULT 0,
        order_num INT DEFAULT 0,
        attachments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // add attachments column to existing phases tables
    try { await conn.query('ALTER TABLE project_phases ADD COLUMN attachments TEXT'); } catch(e) {}
    // add steps column to existing phases tables
    try { await conn.query('ALTER TABLE project_phases ADD COLUMN steps TEXT'); } catch(e) {}
    try { await conn.query('ALTER TABLE project_phases ADD COLUMN steps_total INT DEFAULT 0'); } catch(e) {}
    try { await conn.query('ALTER TABLE project_phases ADD COLUMN steps_done INT DEFAULT 0'); } catch(e) {}
    try { await conn.query('ALTER TABLE project_phases ADD COLUMN steps_equal TINYINT DEFAULT 1'); } catch(e) {}
    try { await conn.query('ALTER TABLE project_phases ADD COLUMN steps_value DECIMAL(12,2) DEFAULT 0'); } catch(e) {}

    // comments table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS project_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        author VARCHAR(100) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // history table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS project_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        author VARCHAR(100) NOT NULL,
        action VARCHAR(32) NOT NULL,
        detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // file blobs table — persiste arquivos no MySQL (evita perda no Railway)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS file_blobs (
        filename VARCHAR(255) PRIMARY KEY,
        originalname VARCHAR(255) NOT NULL,
        mimetype VARCHAR(100) NOT NULL,
        data LONGBLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } finally {
    conn.release();
  }
}

function parseJsonField(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

module.exports = {
  init,
  async getAllProjects(){
    const [rows] = await POOL.query('SELECT * FROM projects ORDER BY created_at DESC');
    return rows.map(r=>({ ...r, attachments: parseJsonField(r.attachments) }));
  },
  async getProjectById(id){
    const [rows] = await POOL.query('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
    if(rows.length===0) return null;
    const r = rows[0];
    return { ...r, attachments: parseJsonField(r.attachments) };
  },
  async createProject(payload, files){
    const attachments = files || [];
    const [result] = await POOL.query(
      `INSERT INTO projects (name, description, status, start_date, end_date, client, budget, currency, progress, attachments, inscription_start, inscription_end, project_start, project_end, inscription_response, edital_name, edital_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        payload.name || '',
        payload.description || '',
        payload.status || 'futuro',
        payload.start_date || null,
        payload.end_date || null,
        payload.client || '',
        payload.budget ? Number(payload.budget) : null,
        payload.currency || 'BRL',
        payload.progress ? Number(payload.progress) : 0,
        JSON.stringify(attachments),
        payload.inscription_start || null,
        payload.inscription_end || null,
        payload.project_start || null,
        payload.project_end || null,
        payload.inscription_response || null,
        payload.edital_name || null,
        payload.edital_url || null
      ]
    );
    return result.insertId;
  },
  async updateProject(id, payload, files){
    const existing = await this.getProjectById(id);
    if(!existing) return false;
    const attachments = (existing.attachments || []).concat(files || []);
    const [result] = await POOL.query(
      `UPDATE projects SET name=?, description=?, status=?, start_date=?, end_date=?, client=?, budget=?, currency=?, progress=?, attachments=?, inscription_start=?, inscription_end=?, project_start=?, project_end=?, inscription_response=?, edital_name=?, edital_url=? WHERE id=?`,
      [
        payload.name || existing.name,
        payload.description || existing.description,
        payload.status || existing.status,
        payload.start_date || existing.start_date,
        payload.end_date || existing.end_date,
        payload.client || existing.client,
        payload.budget !== undefined ? Number(payload.budget) : existing.budget,
        payload.currency || existing.currency || 'BRL',
        payload.progress !== undefined ? Number(payload.progress) : existing.progress,
        JSON.stringify(attachments),
        payload.inscription_start || existing.inscription_start || null,
        payload.inscription_end || existing.inscription_end || null,
        payload.project_start || existing.project_start || null,
        payload.project_end || existing.project_end || null,
        payload.inscription_response || existing.inscription_response || null,
        payload.edital_name !== undefined ? payload.edital_name : (existing.edital_name || null),
        payload.edital_url !== undefined ? payload.edital_url : (existing.edital_url || null),
        id
      ]
    );
    return result.affectedRows > 0;
  },
  async deleteProject(id){
    const [result] = await POOL.query('DELETE FROM projects WHERE id = ?', [id]);
    return result.affectedRows > 0;
  },

  // ── Institutions ────────────────────────────────────────────────────────────
  async getInstitutions(projectId){
    const [rows] = await POOL.query('SELECT * FROM project_institutions WHERE project_id = ? ORDER BY id', [projectId]);
    return rows;
  },
  async createInstitution(projectId, data){
    const [r] = await POOL.query(
      'INSERT INTO project_institutions (project_id, name, budget_value) VALUES (?,?,?)',
      [projectId, (data.name || '').toUpperCase(), Number(data.budget_value) || 0]
    );
    return r.insertId;
  },
  async updateInstitution(id, data){
    const [r] = await POOL.query(
      'UPDATE project_institutions SET name=?, budget_value=? WHERE id=?',
      [(data.name || '').toUpperCase(), Number(data.budget_value) || 0, id]
    );
    return r.affectedRows > 0;
  },
  async deleteInstitution(id){
    const [r] = await POOL.query('DELETE FROM project_institutions WHERE id=?', [id]);
    return r.affectedRows > 0;
  },

  // ── Phases ──────────────────────────────────────────────────────────────────
  async getPhases(projectId){
    const [rows] = await POOL.query('SELECT * FROM project_phases WHERE project_id = ? ORDER BY order_num, id', [projectId]);
    return rows.map(r => ({ ...r, attachments: parseJsonField(r.attachments), steps: parseJsonField(r.steps) }));
  },
  async getPhaseById(id){
    const [rows] = await POOL.query('SELECT * FROM project_phases WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return { ...r, attachments: parseJsonField(r.attachments), steps: parseJsonField(r.steps) };
  },
  async createPhase(projectId, data){
    const [r] = await POOL.query(
      'INSERT INTO project_phases (project_id, name, description, budget, progress, order_num, attachments, steps_total, steps_done) VALUES (?,?,?,?,?,?,?,?,?)',
      [projectId, data.name || '', data.description || '', Number(data.budget) || 0, Number(data.progress) || 0, Number(data.order_num) || 0, JSON.stringify([]), Number(data.steps_total)||0, Number(data.steps_done)||0]
    );
    return r.insertId;
  },
  async updatePhase(id, data, newFiles){
    const existing = await this.getPhaseById(id);
    if (!existing) return false;
    const attachments = (existing.attachments || []).concat(newFiles || []);
    const name        = data.name        !== undefined ? data.name        : existing.name;
    const description = data.description !== undefined ? data.description : existing.description;
    const budget      = data.budget      !== undefined ? Number(data.budget)   : existing.budget;
    const progress    = data.progress    !== undefined ? Number(data.progress) : existing.progress;
    const order_num   = data.order_num   !== undefined ? Number(data.order_num): existing.order_num;
    const steps       = data.steps       !== undefined ? data.steps            : (existing.steps || []);
    const steps_total = data.steps_total !== undefined ? Number(data.steps_total) : (existing.steps_total || 0);
    const steps_done  = data.steps_done  !== undefined ? Number(data.steps_done)  : (existing.steps_done  || 0);
    const steps_equal = data.steps_equal !== undefined ? Number(data.steps_equal) : (existing.steps_equal ?? 1);
    const steps_value = data.steps_value !== undefined ? Number(data.steps_value) : (existing.steps_value || 0);
    const [r] = await POOL.query(
      'UPDATE project_phases SET name=?, description=?, budget=?, progress=?, order_num=?, attachments=?, steps=?, steps_total=?, steps_done=?, steps_equal=?, steps_value=? WHERE id=?',
      [name, description || '', budget || 0, progress || 0, order_num || 0, JSON.stringify(attachments), JSON.stringify(steps), steps_total, steps_done, steps_equal, steps_value, id]
    );
    return r.affectedRows > 0;
  },
  async removePhaseAttachment(phaseId, filename){
    const phase = await this.getPhaseById(phaseId);
    if (!phase) return false;
    const atts = (phase.attachments || []).filter(a => a.filename !== filename);
    const [r] = await POOL.query('UPDATE project_phases SET attachments=? WHERE id=?', [JSON.stringify(atts), phaseId]);
    return r.affectedRows > 0;
  },
  async removeProjectAttachment(projectId, filename){
    const project = await this.getProjectById(projectId);
    if (!project) return false;
    const atts = (project.attachments || []).filter(a => a.filename !== filename);
    const [r] = await POOL.query('UPDATE projects SET attachments=? WHERE id=?', [JSON.stringify(atts), projectId]);
    if (r.affectedRows > 0) {
      // Remove o blob do banco também para liberar espaço
      await this.deleteFileBlob(filename);
      return true;
    }
    return false;
  },
  async deletePhase(id){
    const [r] = await POOL.query('DELETE FROM project_phases WHERE id=?', [id]);
    return r.affectedRows > 0;
  },

  // ── Comments ────────────────────────────────────────────────────────────────
  async getComments(projectId){
    const [rows] = await POOL.query(
      'SELECT * FROM project_comments WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows;
  },
  async addComment(projectId, author, body){
    const [r] = await POOL.query(
      'INSERT INTO project_comments (project_id, author, body) VALUES (?,?,?)',
      [projectId, author, body]);
    return r.insertId;
  },
  async deleteComment(id){
    const [r] = await POOL.query('DELETE FROM project_comments WHERE id=?', [id]);
    return r.affectedRows > 0;
  },

  // ── History ─────────────────────────────────────────────────────────────────
  async getHistory(projectId){
    const [rows] = await POOL.query(
      'SELECT * FROM project_history WHERE project_id = ? ORDER BY created_at DESC LIMIT 50', [projectId]);
    return rows;
  },
  async addHistory(projectId, author, action, detail){
    await POOL.query(
      'INSERT INTO project_history (project_id, author, action, detail) VALUES (?,?,?,?)',
      [projectId, author, action, detail || null]);
  },

  // ── File Blobs (armazenamento persistente no MySQL) ─────────────────────────
  async saveFileBlob(filename, originalname, mimetype, buffer){
    await POOL.query(
      `INSERT INTO file_blobs (filename, originalname, mimetype, data) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE data=VALUES(data), originalname=VALUES(originalname), mimetype=VALUES(mimetype)`,
      [filename, originalname, mimetype, buffer]
    );
  },
  async getFileBlob(filename){
    const [rows] = await POOL.query(
      'SELECT filename, originalname, mimetype, data FROM file_blobs WHERE filename = ?', [filename]);
    return rows[0] || null;
  },
  async deleteFileBlob(filename){
    await POOL.query('DELETE FROM file_blobs WHERE filename = ?', [filename]);
  }
};
