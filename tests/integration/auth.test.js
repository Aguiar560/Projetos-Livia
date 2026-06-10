/**
 * Testes de Integração — Autenticação nas rotas /api
 * Verifica que todas as rotas protegidas retornam 401 sem credenciais
 * e 200/2xx com credenciais corretas
 *
 * ⚠️  Esses testes fazem requisições HTTP reais ao servidor Express.
 *     O banco de dados pode retornar 500 se não estiver acessível —
 *     mas a autenticação deve funcionar antes de chegar ao banco.
 */

const request = require('supertest');

// Configura credenciais de teste
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin';

let app;

beforeAll(() => {
  // Importa o app sem iniciar o servidor (module.exports = { app, db })
  // O db.init() NÃO é chamado aqui — as rotas podem falhar com 500 por banco,
  // mas autenticação (401) deve ser validada antes
  jest.resetModules();
  ({ app } = require('../../server'));
});

// ── Helper ─────────────────────────────────────────────────────────────────
function authHeader(user = 'admin', pass = 'admin') {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

// ── Rotas sem autenticação → 401 ──────────────────────────────────────────
describe('Proteção de rotas — sem credenciais', () => {
  const rotasGet = [
    '/api/projects',
    '/api/me',
  ];

  rotasGet.forEach(rota => {
    test(`GET ${rota} sem auth → 401`, async () => {
      const res = await request(app).get(rota);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  test('POST /api/projects sem auth → 401', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ nome: 'Teste' });
    expect(res.status).toBe(401);
  });

  test('PUT /api/projects/1 sem auth → 401', async () => {
    const res = await request(app)
      .put('/api/projects/1')
      .send({ nome: 'Editado' });
    expect(res.status).toBe(401);
  });

  test('DELETE /api/projects/1 sem auth → 401', async () => {
    const res = await request(app).delete('/api/projects/1');
    expect(res.status).toBe(401);
  });
});

// ── Rotas com credenciais erradas → 401 ───────────────────────────────────
describe('Proteção de rotas — credenciais erradas', () => {
  test('GET /api/projects com senha errada → 401', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader('admin', 'senha_errada'));
    expect(res.status).toBe(401);
  });

  test('GET /api/me com usuário errado → 401', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', authHeader('hacker', 'admin'));
    expect(res.status).toBe(401);
  });
});

// ── Rota /api/me com auth correta → 200 ───────────────────────────────────
describe('Endpoint /api/me com autenticação válida', () => {
  test('GET /api/me → 200 com user e role', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', authHeader('admin', 'admin'));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user', 'admin');
    expect(res.body).toHaveProperty('role', 'admin');
  });
});

// ── Resposta 401 não expõe WWW-Authenticate (sem popup do browser) ─────────
describe('Segurança — sem popup do browser', () => {
  test('Resposta 401 não tem header WWW-Authenticate', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
});

// ── Arquivo estático — NÃO protegido por auth ──────────────────────────────
describe('Arquivos estáticos — sem autenticação', () => {
  test('GET / → 200 (index.html público)', async () => {
    const res = await request(app).get('/');
    expect([200, 301, 302]).toContain(res.status);
  });
});
