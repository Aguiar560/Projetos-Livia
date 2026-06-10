/**
 * Testes Unitários — Middleware requireAuth
 * Testa autenticação Basic sem precisar de banco de dados
 */

// Simula variáveis de ambiente ANTES de qualquer require do server
process.env.ADMIN_USER = 'testuser';
process.env.ADMIN_PASS = 'testpass';
// Evita conexão real com banco durante testes unitários
process.env.MYSQL_HOST = 'localhost';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test';
process.env.MYSQL_DATABASE = 'test';

// ── Reimplementação do middleware (mesma lógica do server.js) ──────────────
// Testes unitários não devem depender de inicializar o servidor completo
const ADMIN_USER = process.env.ADMIN_USER.trim();
const ADMIN_PASS = process.env.ADMIN_PASS.trim();

function requireAuth(req, res, next) {
  if (!ADMIN_USER) return next();
  const authHeader = req.headers['authorization'] || '';
  const base64 = authHeader.replace(/^Basic\s+/i, '');
  let ok = false;
  try {
    const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');
    ok = user === ADMIN_USER && pass === ADMIN_PASS;
  } catch { ok = false; }
  if (!ok) return res.status(401).json({ error: 'Não autorizado' });
  req.authUser = ADMIN_USER;
  next();
}

// ── Helpers de mock ────────────────────────────────────────────────────────
function makeToken(user, pass) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

function mockRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body; return this; }
  };
  return res;
}

// ── Testes ─────────────────────────────────────────────────────────────────
describe('requireAuth middleware', () => {
  test('chama next() com credenciais corretas', () => {
    const req = { headers: { authorization: makeToken('testuser', 'testpass') } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.authUser).toBe('testuser');
  });

  test('retorna 401 sem cabeçalho Authorization', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._body).toHaveProperty('error');
  });

  test('retorna 401 com senha errada', () => {
    const req = { headers: { authorization: makeToken('testuser', 'senhaerrada') } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('retorna 401 com usuário errado', () => {
    const req = { headers: { authorization: makeToken('hacker', 'testpass') } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('retorna 401 com token Base64 corrompido', () => {
    const req = { headers: { authorization: 'Basic !!!invalido!!!' } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('retorna 401 com token vazio', () => {
    const req = { headers: { authorization: 'Basic ' } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('NÃO inclui header WWW-Authenticate (evita popup do browser)', () => {
    const headersSet = [];
    const req = { headers: {} };
    const res = {
      ...mockRes(),
      setHeader(name) { headersSet.push(name); }
    };
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(headersSet).not.toContain('WWW-Authenticate');
  });
});
