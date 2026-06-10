/**
 * Testes Unitários — Middleware requireAdmin e controle de acesso por perfil
 * Testa isoladamente a lógica de autorização baseada em role.
 */

// Reimplementação local (mesma lógica do server.js)
function requireAdmin(req, res, next) {
  if (req.authRole === 'viewer') {
    return res.status(403).json({ error: 'Acesso negado — perfil somente leitura' });
  }
  next();
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

// ── requireAdmin básico ────────────────────────────────────────────────────
describe('requireAdmin middleware', () => {
  test('permite admin chamar next()', () => {
    const req  = { authRole: 'admin' };
    const res  = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  test('bloqueia viewer com status 403', () => {
    const req  = { authRole: 'viewer' };
    const res  = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._body).toHaveProperty('error');
  });

  test('resposta 403 menciona "somente leitura"', () => {
    const req  = { authRole: 'viewer' };
    const res  = mockRes();

    requireAdmin(req, res, jest.fn());

    expect(res._body.error).toMatch(/somente leitura/i);
  });

  test('perfil desconhecido / undefined não é bloqueado como viewer', () => {
    // A lógica só bloqueia 'viewer' explicitamente — perfis desconhecidos passam
    const req  = { authRole: undefined };
    const res  = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('perfil "superadmin" personalizado não é bloqueado', () => {
    const req  = { authRole: 'superadmin' };
    const res  = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── Controle de acesso por perfil ─────────────────────────────────────────
describe('Controle de acesso baseado em perfil', () => {
  test('admin com authUser definido tem acesso a operações de escrita', () => {
    const req  = { authRole: 'admin', authUser: 'admin' };
    const res  = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('viewer com authUser definido é bloqueado em operações de escrita', () => {
    const req  = { authRole: 'viewer', authUser: 'leitor' };
    const res  = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('resposta 403 não expõe stack trace ou dados internos', () => {
    const req = { authRole: 'viewer' };
    const res = mockRes();

    requireAdmin(req, res, jest.fn());

    expect(res._body).toHaveProperty('error');
    expect(typeof res._body.error).toBe('string');
    expect(res._body).not.toHaveProperty('stack');
    expect(res._body).not.toHaveProperty('trace');
    expect(res._body).not.toHaveProperty('details');
  });

  test('viewer recebe 403 independentemente do authUser', () => {
    for (const user of ['admin_fake', 'root', 'superuser', '']) {
      const req  = { authRole: 'viewer', authUser: user };
      const res  = mockRes();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res._status).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  });
});

// ── Pipeline completo: requireAuth → requireAdmin ──────────────────────────
describe('Pipeline de autenticação + autorização', () => {
  // Reimplementação simplificada do requireAuth para simular o pipeline completo
  const USERS = { admin: 'adminpass', viewer: 'viewerpass' };
  const ROLES = { admin: 'admin', viewer: 'viewer' };

  function requireAuth(req, res, next) {
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
      if (USERS[user] === pass) { ok = true; resolvedUser = user; }
    } catch { ok = false; }
    if (!ok) return res.status(401).json({ error: 'Não autorizado' });
    req.authUser = resolvedUser;
    req.authRole = ROLES[resolvedUser] || 'viewer';
    next();
  }

  function runPipeline(headers) {
    const req  = { headers };
    const res  = mockRes();
    const middlewareNext = jest.fn(() => requireAdmin(req, res, jest.fn()));

    requireAuth(req, res, middlewareNext);
    return { req, res };
  }

  test('admin autenticado passa pelos dois middlewares', () => {
    const { res } = runPipeline({
      authorization: 'Basic ' + Buffer.from('admin:adminpass').toString('base64')
    });
    expect(res._status).toBeNull(); // nenhum erro
  });

  test('viewer autenticado é bloqueado por requireAdmin com 403', () => {
    const { res } = runPipeline({
      authorization: 'Basic ' + Buffer.from('viewer:viewerpass').toString('base64')
    });
    expect(res._status).toBe(403);
  });

  test('usuário sem credenciais é bloqueado por requireAuth com 401', () => {
    const { res } = runPipeline({ authorization: '' });
    expect(res._status).toBe(401);
  });
});
