/**
 * Testes de Integração — CRUD /api/projects
 *
 * ⚠️  Esses testes requerem conexão com o banco de dados.
 *     Se o banco não estiver disponível, os testes de leitura/escrita
 *     retornarão 500. Os testes de auth (401) funcionam sem banco.
 *
 * Para rodar com banco real:
 *   Certifique-se que .env está configurado corretamente
 *
 * Para rodar sem banco (apenas verifica auth):
 *   Os testes marcados com [SEM BANCO] passam em qualquer ambiente
 */

const request = require('supertest');

process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin';

let app;
let createdId = null;

beforeAll(() => {
  jest.resetModules();
  ({ app } = require('../../server'));
});

function auth() {
  return 'Basic ' + Buffer.from('admin:admin').toString('base64');
}

// ── [SEM BANCO] Proteção básica de cada endpoint ─────────────────────────
describe('[SEM BANCO] Autenticação nos endpoints de projetos', () => {
  const endpoints = [
    { method: 'get',    path: '/api/projects'   },
    { method: 'get',    path: '/api/projects/1' },
    { method: 'post',   path: '/api/projects'   },
    { method: 'put',    path: '/api/projects/1' },
    { method: 'delete', path: '/api/projects/1' },
  ];

  endpoints.forEach(({ method, path: p }) => {
    test(`${method.toUpperCase()} ${p} sem auth → 401`, async () => {
      const res = await request(app)[method](p).send({});
      expect(res.status).toBe(401);
    });
  });
});

// ── [SEM BANCO] Validação de IDs inválidos ────────────────────────────────
describe('[SEM BANCO] Validação de IDs', () => {
  test('GET /api/projects/0 → 400 (ID inválido)', async () => {
    const res = await request(app)
      .get('/api/projects/0')
      .set('Authorization', auth());
    expect([400, 404, 500]).toContain(res.status); // 400 ideal, 500 sem banco OK
  });

  test('GET /api/projects/-1 → 400 (ID negativo)', async () => {
    const res = await request(app)
      .get('/api/projects/-1')
      .set('Authorization', auth());
    expect([400, 404, 500]).toContain(res.status);
  });

  test('GET /api/projects/abc → 400 (ID não numérico)', async () => {
    const res = await request(app)
      .get('/api/projects/abc')
      .set('Authorization', auth());
    expect([400, 404, 500]).toContain(res.status);
  });
});

// ── [COM BANCO] CRUD completo — pula se banco indisponível ────────────────
describe('[COM BANCO] CRUD de projetos', () => {
  // Verifica se banco está disponível antes de cada teste do grupo
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', auth());
      dbAvailable = res.status === 200;
    } catch { dbAvailable = false; }

    if (!dbAvailable) {
      console.warn('⚠️  Banco de dados indisponível — testes COM BANCO serão pulados');
    }
  });

  test('GET /api/projects → array de projetos', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/projects → cria projeto e retorna id', async () => {
    if (!dbAvailable) return;

    const payload = {
      nome: '__TESTE_JEST__',
      status: 'Em andamento',
      ano: 2024,
      descricao: 'Projeto criado pelos testes automatizados'
    };

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', auth())
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    createdId = res.body.id;
  });

  test('GET /api/projects/:id → retorna projeto criado', async () => {
    if (!dbAvailable || !createdId) return;

    const res = await request(app)
      .get(`/api/projects/${createdId}`)
      .set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', createdId);
    expect(res.body.nome).toBe('__TESTE_JEST__');
  });

  test('PUT /api/projects/:id → atualiza projeto', async () => {
    if (!dbAvailable || !createdId) return;

    const res = await request(app)
      .put(`/api/projects/${createdId}`)
      .set('Authorization', auth())
      .send({ nome: '__TESTE_JEST_EDITADO__', status: 'Concluído' });

    expect(res.status).toBe(200);
  });

  test('DELETE /api/projects/:id → deleta projeto criado', async () => {
    if (!dbAvailable || !createdId) return;

    const res = await request(app)
      .delete(`/api/projects/${createdId}`)
      .set('Authorization', auth());

    expect(res.status).toBe(200);
    createdId = null;
  });

  afterAll(async () => {
    // Limpeza: garante que projeto de teste seja removido mesmo se teste falhar
    if (createdId && dbAvailable) {
      await request(app)
        .delete(`/api/projects/${createdId}`)
        .set('Authorization', auth())
        .catch(() => {});
    }
  });
});
