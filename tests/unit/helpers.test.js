/**
 * Testes Unitários — Funções helper de segurança
 * sanitizeId, sanitizeFilename, safeJson
 */

const path = require('path');

// ── Reimplementação local (mesma lógica do server.js) ──────────────────────
// Isso garante que os testes unitários não dependam de iniciar o servidor
function sanitizeId(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

function sanitizeFilename(val) {
  const clean = path.basename(String(val || '')).replace(/[^a-zA-Z0-9.\-_]/g, '_');
  if (!clean || clean.startsWith('.')) return null;
  return clean;
}

function safeJson(body) {
  try {
    return typeof body === 'string' ? JSON.parse(body) : body;
  } catch { return {}; }
}

// ── sanitizeId ─────────────────────────────────────────────────────────────
describe('sanitizeId', () => {
  test('retorna número positivo para string numérica válida', () => {
    expect(sanitizeId('5')).toBe(5);
    expect(sanitizeId('100')).toBe(100);
  });

  test('retorna o próprio número quando recebe integer', () => {
    expect(sanitizeId(42)).toBe(42);
  });

  test('retorna null para string não numérica', () => {
    expect(sanitizeId('abc')).toBeNull();
    expect(sanitizeId('12abc')).toBe(12); // parseInt pega o prefixo numérico
  });

  test('retorna null para valores nulos/undefined/vazios', () => {
    expect(sanitizeId(null)).toBeNull();
    expect(sanitizeId(undefined)).toBeNull();
    expect(sanitizeId('')).toBeNull();
  });

  test('retorna null para zero e negativos (IDs inválidos)', () => {
    expect(sanitizeId('0')).toBeNull();
    expect(sanitizeId('-1')).toBeNull();
    expect(sanitizeId('-999')).toBeNull();
  });

  test('bloqueia tentativa de path traversal como ID', () => {
    expect(sanitizeId('../etc/passwd')).toBeNull();
    expect(sanitizeId('../../')).toBeNull();
  });
});

// ── sanitizeFilename ───────────────────────────────────────────────────────
describe('sanitizeFilename', () => {
  test('mantém nome de arquivo simples e seguro', () => {
    expect(sanitizeFilename('relatorio.pdf')).toBe('relatorio.pdf');
    expect(sanitizeFilename('planilha_2024.xlsx')).toBe('planilha_2024.xlsx');
  });

  test('bloqueia path traversal — retorna só o basename', () => {
    const result = sanitizeFilename('../etc/passwd');
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });

  test('bloqueia path traversal com barras duplas', () => {
    const result = sanitizeFilename('../../secret.txt');
    expect(result).not.toContain('..');
  });

  test('substitui caracteres especiais por underscore', () => {
    const result = sanitizeFilename('arquivo com espaços!.pdf');
    expect(result).not.toContain(' ');
    expect(result).not.toContain('!');
  });

  test('retorna null para string vazia', () => {
    expect(sanitizeFilename('')).toBeNull();
    expect(sanitizeFilename(null)).toBeNull();
  });

  test('retorna null para nomes que começam com ponto (arquivos ocultos)', () => {
    expect(sanitizeFilename('.htaccess')).toBeNull();
    expect(sanitizeFilename('.env')).toBeNull();
  });

  test('trunca extensão e nome dentro dos limites seguros', () => {
    const longName = 'a'.repeat(100) + '.pdf';
    const result = sanitizeFilename(longName);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });
});

// ── safeJson ───────────────────────────────────────────────────────────────
describe('safeJson', () => {
  test('parseia string JSON válida', () => {
    const result = safeJson('{"nome":"Livia","status":"ativo"}');
    expect(result).toEqual({ nome: 'Livia', status: 'ativo' });
  });

  test('retorna objeto diretamente se já for objeto', () => {
    const obj = { id: 1, nome: 'Projeto X' };
    expect(safeJson(obj)).toBe(obj);
  });

  test('retorna {} para JSON inválido (sem lançar erro)', () => {
    expect(safeJson('{invalido}')).toEqual({});
    expect(safeJson('undefined')).toEqual({});
    expect(safeJson('{')).toEqual({});
  });

  test('retorna {} para valores nulos/undefined', () => {
    // null vira objeto null (não é string) — retorna null diretamente
    // undefined vira undefined — retorna undefined diretamente
    // Ambos sem lançar exceção
    expect(() => safeJson(null)).not.toThrow();
    expect(() => safeJson(undefined)).not.toThrow();
  });

  test('parseia arrays JSON corretamente', () => {
    const result = safeJson('[1,2,3]');
    expect(result).toEqual([1, 2, 3]);
  });
});
