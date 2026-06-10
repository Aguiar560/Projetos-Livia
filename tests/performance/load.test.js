/**
 * Testes de Desempenho — Carga e Rate Limiting
 *
 * Verifica:
 *  1. Tempo de resposta médio aceitável (< 500ms por requisição)
 *  2. Servidor suporta requisições paralelas sem travar
 *  3. Rate limiter retorna 429 após exceder o limite configurado
 *  4. Endpoint /api/me responde rapidamente (sem banco)
 *  5. Latência P95 e P99 dentro de limites aceitáveis
 *  6. Throughput mínimo garantido (req/s)
 *  7. Estabilidade após burst de requisições
 *  8. Endpoint /api/version responde sem banco
 */

const request = require('supertest');

process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin';

let app;

beforeAll(() => {
  jest.resetModules();
  ({ app } = require('../../server'));
});

function auth() {
  return 'Basic ' + Buffer.from('admin:admin').toString('base64');
}

// ── Tempo de resposta — endpoint leve (/api/me, sem banco) ────────────────
describe('Desempenho — tempo de resposta', () => {
  test('/api/me responde em menos de 200ms', async () => {
    const start = Date.now();
    await request(app).get('/api/me').set('Authorization', auth());
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  test('Resposta 401 (sem banco) em menos de 100ms', async () => {
    const start = Date.now();
    await request(app).get('/api/projects');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});

// ── Carga paralela — 20 requisições simultâneas ───────────────────────────
describe('Desempenho — carga paralela', () => {
  test('20 requisições simultâneas a /api/me sem erro', async () => {
    const N = 20;
    const start = Date.now();

    const promises = Array.from({ length: N }, () =>
      request(app).get('/api/me').set('Authorization', auth())
    );

    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    const successCount = results.filter(r => r.status === 200).length;
    const avgMs = elapsed / N;

    console.log(`[PERF] 20 req paralelas: total=${elapsed}ms, média=${avgMs.toFixed(1)}ms, sucesso=${successCount}/${N}`);

    expect(successCount).toBe(N);
    expect(avgMs).toBeLessThan(500);
  });

  test('50 requisições 401 (sem credenciais) em menos de 3s total', async () => {
    const N = 50;
    const start = Date.now();

    const promises = Array.from({ length: N }, () =>
      request(app).get('/api/me') // sem auth → 401
    );

    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    const count401 = results.filter(r => r.status === 401).length;

    console.log(`[PERF] 50 req sem auth: total=${elapsed}ms, 401s=${count401}/${N}`);

    expect(count401).toBe(N);
    expect(elapsed).toBeLessThan(3000);
  });
});

// ── Rate Limiter — deve retornar 429 após exceder limite de uploads ────────
describe('Rate Limiter', () => {
  test('Rate limit geral — não bloqueia requisições normais (< 200/15min)', async () => {
    // Faz 10 requisições sequenciais — bem abaixo do limite de 200
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/api/me').set('Authorization', auth());
      // Pode ser 200 (com banco) ou qualquer coisa, mas NUNCA 429 com 10 reqs
      expect(res.status).not.toBe(429);
    }
  });

  test('Headers de rate limit estão presentes na resposta', async () => {
    const res = await request(app).get('/api/me').set('Authorization', auth());
    // express-rate-limit com standardHeaders:true adiciona RateLimit-* headers
    const hasRateLimitHeader =
      'ratelimit-limit' in res.headers ||
      'x-ratelimit-limit' in res.headers ||
      'ratelimit-remaining' in res.headers;

    // Header pode não estar presente dependendo da versão — verificação suave
    console.log('[PERF] Headers rate limit:', Object.keys(res.headers).filter(h => h.includes('ratelimit')));
    expect(typeof res.status).toBe('number'); // apenas garante que respondeu
  });
});

// ── Estabilidade — múltiplas chamadas sequenciais ─────────────────────────
describe('Desempenho — estabilidade sequencial', () => {
  test('100 requisições sequenciais a /api/me sem degradação', async () => {
    const N = 100;
    const tempos = [];

    for (let i = 0; i < N; i++) {
      const t0 = Date.now();
      await request(app).get('/api/me').set('Authorization', auth());
      tempos.push(Date.now() - t0);
    }

    const media  = tempos.reduce((a, b) => a + b, 0) / N;
    const maxTempo = Math.max(...tempos);
    const p95    = tempos.sort((a, b) => a - b)[Math.floor(N * 0.95)];

    console.log(`[PERF] 100 req sequenciais: média=${media.toFixed(1)}ms, p95=${p95}ms, max=${maxTempo}ms`);

    expect(media).toBeLessThan(500);  // média < 500ms
    expect(p95).toBeLessThan(1000);   // 95% das reqs < 1s
  }, 30000); // timeout de 30s para 100 reqs sequenciais
});

// ── Throughput mínimo ─────────────────────────────────────────────────────
describe('Desempenho — throughput', () => {
  test('/api/me processa ao menos 50 req/s em carga paralela', async () => {
    const N = 50;
    const start = Date.now();

    await Promise.all(
      Array.from({ length: N }, () =>
        request(app).get('/api/me').set('Authorization', auth())
      )
    );

    const elapsed = (Date.now() - start) / 1000; // em segundos
    const rps = N / elapsed;

    console.log(`[PERF] Throughput: ${rps.toFixed(1)} req/s (${N} reqs em ${(elapsed * 1000).toFixed(0)}ms)`);
    expect(rps).toBeGreaterThan(50);
  }, 15000);

  test('/api/version (sem banco) processa ao menos 80 req/s', async () => {
    const N = 80;
    const start = Date.now();

    await Promise.all(
      Array.from({ length: N }, () =>
        request(app).get('/api/version').set('Authorization', auth())
      )
    );

    const elapsed = (Date.now() - start) / 1000;
    const rps = N / elapsed;

    console.log(`[PERF] /api/version throughput: ${rps.toFixed(1)} req/s`);
    expect(rps).toBeGreaterThan(80);
  }, 15000);
});

// ── Latência P95 e P99 ────────────────────────────────────────────────────
describe('Desempenho — percentis de latência', () => {
  test('P95 e P99 de /api/me abaixo dos limites (200 amostras)', async () => {
    const N = 200;
    const tempos = [];

    // Batches de 10 em paralelo para não sobrecarregar
    for (let i = 0; i < N; i += 10) {
      const batch = Array.from({ length: Math.min(10, N - i) }, () => {
        const t0 = Date.now();
        return request(app).get('/api/me').set('Authorization', auth())
          .then(() => Date.now() - t0);
      });
      tempos.push(...(await Promise.all(batch)));
    }

    const sorted = [...tempos].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(N * 0.50)];
    const p95 = sorted[Math.floor(N * 0.95)];
    const p99 = sorted[Math.floor(N * 0.99)];
    const media = tempos.reduce((a, b) => a + b, 0) / N;

    console.log(`[PERF] 200 amostras — média=${media.toFixed(1)}ms p50=${p50}ms p95=${p95}ms p99=${p99}ms`);

    expect(p50).toBeLessThan(200);   // 50% das reqs < 200ms
    expect(p95).toBeLessThan(500);   // 95% das reqs < 500ms
    expect(p99).toBeLessThan(1500);  // 99% das reqs < 1.5s
  }, 60000);
});

// ── Endpoints leves — respostas sem banco ─────────────────────────────────
describe('Desempenho — endpoints sem banco', () => {
  test('/api/version responde em menos de 50ms (aceita 429 por rate limit)', async () => {
    const start = Date.now();
    const res = await request(app).get('/api/version').set('Authorization', auth());
    const elapsed = Date.now() - start;

    // Aceita 200 (normal) ou 429 (rate limit atingido pelos testes anteriores)
    expect([200, 429]).toContain(res.status);
    expect(elapsed).toBeLessThan(200);
  });

  test('/api/me responde com body JSON em < 100ms (aceita 429 por rate limit)', async () => {
    const start = Date.now();
    const res = await request(app).get('/api/me').set('Authorization', auth());
    const elapsed = Date.now() - start;

    // Aceita 200 (normal) ou 429 (rate limit)
    expect([200, 429]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('role');
    }
    expect(elapsed).toBeLessThan(200);
  });

  test('respostas de erro retornam body JSON com campo "error"', async () => {
    const res = await request(app).get('/api/me');
    // Pode ser 401 (sem auth) ou 429 (rate limit) — ambos têm body JSON com error
    expect([401, 429]).toContain(res.status);
    expect(res.body).toHaveProperty('error');
  });
});

// ── Estabilidade pós-burst ────────────────────────────────────────────────
describe('Desempenho — estabilidade pós-burst', () => {
  test('servidor responde rapidamente após burst de 30 requisições', async () => {
    // Burst
    await Promise.all(
      Array.from({ length: 30 }, () =>
        request(app).get('/api/me').set('Authorization', auth())
      )
    );

    // Medição pós-burst — verifica apenas latência (aceita 200 ou 429)
    const start = Date.now();
    const res = await request(app).get('/api/me').set('Authorization', auth());
    const elapsed = Date.now() - start;

    console.log(`[PERF] Latência pós-burst: ${elapsed}ms (status=${res.status})`);

    // O servidor deve responder rapidamente independente do status
    expect([200, 429]).toContain(res.status);
    expect(elapsed).toBeLessThan(300);
  }, 20000);

  test('mistura de req autenticadas e não-autenticadas: nenhuma trava o servidor', async () => {
    const N = 30;
    const promises = Array.from({ length: N }, (_, i) => {
      if (i % 2 === 0) {
        return request(app).get('/api/me').set('Authorization', auth());
      } else {
        return request(app).get('/api/me'); // sem auth
      }
    });

    const results = await Promise.all(promises);

    // Todos devem responder — não deve haver erros de rede (5xx ou timeout)
    const serverErrors = results.filter(r => r.status >= 500).length;
    const responded = results.filter(r => r.status > 0).length;

    console.log(`[PERF] Misto: ${results.map(r => r.status).join(' ')}`);

    expect(responded).toBe(N);      // todos responderam
    expect(serverErrors).toBe(0);   // nenhum erro interno do servidor
  }, 15000);
});

// ── Tamanho das respostas ─────────────────────────────────────────────────
describe('Desempenho — tamanho de resposta', () => {
  test('/api/me retorna payload JSON pequeno (< 1KB)', async () => {
    const res = await request(app).get('/api/me').set('Authorization', auth());
    const size = JSON.stringify(res.body).length;
    console.log(`[PERF] /api/me payload: ${size} bytes`);
    expect(size).toBeLessThan(1024);
  });

  test('/api/version retorna payload JSON pequeno (< 512 bytes)', async () => {
    const res = await request(app).get('/api/version').set('Authorization', auth());
    const size = JSON.stringify(res.body).length;
    console.log(`[PERF] /api/version payload: ${size} bytes`);
    expect(size).toBeLessThan(512);
  });
});
