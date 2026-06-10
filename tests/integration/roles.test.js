/**
 * Testes de Integração — Controle de Acesso por Perfil (Roles)
 *
 * Verifica que:
 *  - Viewers podem fazer GET mas não POST/PUT/DELETE
 *  - Admins têm acesso completo
 *  - Endpoints retornam 403 (não 401) para viewers em rotas de escrita
 *
 * ⚠️  Auth é testada em ambos os perfis (admin e viewer).
 *     Rotas que vão ao banco podem retornar 500 sem DB, mas auth/role
 *     é verificada antes — 401/403 devem funcionar em qualquer ambiente.
 */

const request = require('supertest');

process.env.ADMIN_USER  = 'admin';
process.env.ADMIN_PASS  = 'adminpass';
process.env.VIEWER_USER = 'viewer';
process.env.VIEWER_PASS = 'viewerpass';

let app;

beforeAll(() => {
  jest.resetModules();
  ({ app } = require('../../server'));
});

function adminAuth() {
  return 'Basic ' + Buffer.from('admin:adminpass').toString('base64');
}

function viewerAuth() {
  return 'Basic ' + Buffer.from('viewer:viewerpass').toString('base64');
}

// ── /api/me por perfil ─────────────────────────────────────────────────────
describe('Endpoint /api/me — identificação de perfil', () => {
  test('admin recebe role "admin"', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user', 'admin');
    expect(res.body).toHaveProperty('role', 'admin');
  });

  test('viewer recebe role "viewer"', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', viewerAuth());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user', 'viewer');
    expect(res.body).toHaveProperty('role', 'viewer');
  });

  test('sem auth retorna 401 sem campo role', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('role');
  });
});

// ── Viewer: leitura liberada ──────────────────────────────────────────────
describe('Viewer — acesso de leitura (GET)', () => {
  test('GET /api/projects com viewer → não é 401 nem 403', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', viewerAuth());

    // Pode ser 200 (com banco) ou 500 (sem banco), mas nunca 401/403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('GET /api/projects/1 com viewer → não é 401 nem 403', async () => {
    const res = await request(app)
      .get('/api/projects/1')
      .set('Authorization', viewerAuth());

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('GET /api/version com viewer → 200', async () => {
    const res = await request(app)
      .get('/api/version')
      .set('Authorization', viewerAuth());

    expect(res.status).toBe(200);
  });

  test('GET /api/me com viewer → 200', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', viewerAuth());

    expect(res.status).toBe(200);
  });
});

// ── Viewer: escrita bloqueada (403) ───────────────────────────────────────
describe('Viewer — acesso de escrita bloqueado (POST/PUT/DELETE)', () => {
  test('POST /api/projects com viewer → 403', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', viewerAuth())
      .send({ name: 'Projeto Teste Viewer' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  test('PUT /api/projects/1 com viewer → 403', async () => {
    const res = await request(app)
      .put('/api/projects/1')
      .set('Authorization', viewerAuth())
      .send({ name: 'Editado pelo viewer' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  test('DELETE /api/projects/1 com viewer → 403', async () => {
    const res = await request(app)
      .delete('/api/projects/1')
      .set('Authorization', viewerAuth());

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/projects/:id/comments com viewer → 403', async () => {
    const res = await request(app)
      .post('/api/projects/1/comments')
      .set('Authorization', viewerAuth())
      .send({ body: 'Comentário do viewer' });

    expect(res.status).toBe(403);
  });

  test('DELETE /api/projects/1/comments/1 com viewer → 403', async () => {
    const res = await request(app)
      .delete('/api/projects/1/comments/1')
      .set('Authorization', viewerAuth());

    expect(res.status).toBe(403);
  });

  test('POST /api/projects/:id/institutions com viewer → 403', async () => {
    const res = await request(app)
      .post('/api/projects/1/institutions')
      .set('Authorization', viewerAuth())
      .send({ name: 'Instituição teste' });

    expect(res.status).toBe(403);
  });

  test('DELETE /api/projects/:id/institutions/:iid com viewer → 403', async () => {
    const res = await request(app)
      .delete('/api/projects/1/institutions/1')
      .set('Authorization', viewerAuth());

    expect(res.status).toBe(403);
  });

  test('POST /api/projects/:id/phases com viewer → 403', async () => {
    const res = await request(app)
      .post('/api/projects/1/phases')
      .set('Authorization', viewerAuth())
      .send({ name: 'Fase teste' });

    expect(res.status).toBe(403);
  });

  test('DELETE /api/projects/:id/phases/:pid com viewer → 403', async () => {
    const res = await request(app)
      .delete('/api/projects/1/phases/1')
      .set('Authorization', viewerAuth());

    expect(res.status).toBe(403);
  });

  test('GET /api/backup com viewer → 403', async () => {
    const res = await request(app)
      .get('/api/backup')
      .set('Authorization', viewerAuth());

    expect(res.status).toBe(403);
  });
});

// ── Admin: acesso completo ────────────────────────────────────────────────
describe('Admin — acesso de escrita não bloqueado por role', () => {
  test('POST /api/projects com admin → não é 403 (pode ser 400 sem campos ou 500 sem banco)', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', adminAuth())
      .send({});

    // Admin passa pelo requireAdmin; pode falhar por falta de campo (400) ou banco (500)
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test('PUT /api/projects/1 com admin → não é 403 nem 401', async () => {
    const res = await request(app)
      .put('/api/projects/1')
      .set('Authorization', adminAuth())
      .send({ name: 'Editado pelo admin' });

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test('DELETE /api/projects/9999 com admin → não é 403 nem 401 (pode ser 404 sem banco)', async () => {
    const res = await request(app)
      .delete('/api/projects/9999')
      .set('Authorization', adminAuth());

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

// ── Distinção 401 vs 403 ──────────────────────────────────────────────────
describe('Distinção entre 401 (não autenticado) e 403 (viewer)', () => {
  test('sem credenciais → 401, não 403', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'x' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('viewer autenticado → 403, não 401', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', viewerAuth())
      .send({ name: 'x' });

    expect(res.status).toBe(403);
    expect(res.status).not.toBe(401);
  });

  test('resposta 403 de viewer contém campo "error" sem WWW-Authenticate', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', viewerAuth())
      .send({ name: 'x' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
});
