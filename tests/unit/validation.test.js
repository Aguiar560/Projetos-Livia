/**
 * Testes Unitários — Lógica de validação de campos de entrada
 * Cobre: validação de nome, orçamento, progresso, moeda, payload JSON.
 */

// ── Validação de nome obrigatório (lógica usada no POST /api/projects) ────
function validateName(payload) {
  if (!payload.name || String(payload.name).trim().length === 0) {
    return { error: 'Nome é obrigatório' };
  }
  return null;
}

// ── Validação e normalização de progresso (0–100%) ────────────────────────
function normalizeProgress(val) {
  const n = isFinite(Number(val)) ? Math.max(0, Math.min(100, Number(val))) : 0;
  return n;
}

// ── Validação de orçamento ─────────────────────────────────────────────────
function normalizeBudget(val) {
  return isFinite(Number(val)) ? Number(val) : 0;
}

// ── Sanitização de moeda (só letras maiúsculas, máx 3 chars) ─────────────
function normalizeCurrency(val) {
  return (val || 'BRL').replace(/[^A-Z]/g, '').substring(0, 3) || 'BRL';
}

// ── Validação de corpo de comentário ──────────────────────────────────────
function validateComment(body) {
  const text = String(body || '').trim();
  if (!text) return { error: 'Comentário vazio' };
  return null;
}

// ── validateName ──────────────────────────────────────────────────────────
describe('validateName', () => {
  test('retorna null para nome válido', () => {
    expect(validateName({ name: 'Projeto Alpha' })).toBeNull();
  });

  test('retorna erro para nome vazio (string vazia)', () => {
    expect(validateName({ name: '' })).toHaveProperty('error');
  });

  test('retorna erro para nome só com espaços', () => {
    expect(validateName({ name: '   ' })).toHaveProperty('error');
  });

  test('retorna erro para name ausente no payload', () => {
    expect(validateName({})).toHaveProperty('error');
  });

  test('retorna erro para name null', () => {
    expect(validateName({ name: null })).toHaveProperty('error');
  });

  test('retorna erro para name undefined', () => {
    expect(validateName({ name: undefined })).toHaveProperty('error');
  });

  test('aceita nome com caracteres especiais (acentos, hífen)', () => {
    expect(validateName({ name: 'Projeto Livia — Fase 1' })).toBeNull();
    expect(validateName({ name: 'Edital nº 12/2024' })).toBeNull();
  });

  test('aceita nome muito longo (> 200 chars)', () => {
    expect(validateName({ name: 'A'.repeat(255) })).toBeNull();
  });
});

// ── normalizeProgress ─────────────────────────────────────────────────────
describe('normalizeProgress', () => {
  test('retorna 0 para valor 0', () => {
    expect(normalizeProgress(0)).toBe(0);
  });

  test('retorna 100 para valor 100', () => {
    expect(normalizeProgress(100)).toBe(100);
  });

  test('clipa valor > 100 para 100', () => {
    expect(normalizeProgress(150)).toBe(100);
    expect(normalizeProgress(999)).toBe(100);
  });

  test('clipa valor < 0 para 0', () => {
    expect(normalizeProgress(-10)).toBe(0);
    expect(normalizeProgress(-999)).toBe(0);
  });

  test('retorna 0 para string não numérica', () => {
    expect(normalizeProgress('abc')).toBe(0);
    expect(normalizeProgress(null)).toBe(0);
    expect(normalizeProgress(undefined)).toBe(0);
  });

  test('converte string numérica "75" para 75', () => {
    expect(normalizeProgress('75')).toBe(75);
  });

  test('retorna 0 para NaN', () => {
    expect(normalizeProgress(NaN)).toBe(0);
  });

  test('retorna 0 para Infinity', () => {
    expect(normalizeProgress(Infinity)).toBe(0);
  });
});

// ── normalizeBudget ───────────────────────────────────────────────────────
describe('normalizeBudget', () => {
  test('retorna 0 para valores não numéricos', () => {
    expect(normalizeBudget('abc')).toBe(0);
    expect(normalizeBudget(null)).toBe(0);
    expect(normalizeBudget(undefined)).toBe(0);
  });

  test('retorna 0 para Infinity', () => {
    expect(normalizeBudget(Infinity)).toBe(0);
    expect(normalizeBudget(-Infinity)).toBe(0);
  });

  test('converte string numérica para número', () => {
    expect(normalizeBudget('50000')).toBe(50000);
    expect(normalizeBudget('1234.56')).toBe(1234.56);
  });

  test('mantém valores negativos (podem ser válidos)', () => {
    expect(normalizeBudget(-100)).toBe(-100);
  });

  test('mantém zero', () => {
    expect(normalizeBudget(0)).toBe(0);
  });

  test('retorna 0 para NaN', () => {
    expect(normalizeBudget(NaN)).toBe(0);
  });
});

// ── normalizeCurrency ─────────────────────────────────────────────────────
describe('normalizeCurrency', () => {
  test('retorna BRL como padrão para valor vazio', () => {
    expect(normalizeCurrency('')).toBe('BRL');
    expect(normalizeCurrency(null)).toBe('BRL');
    expect(normalizeCurrency(undefined)).toBe('BRL');
  });

  test('mantém código de moeda em maiúsculas', () => {
    expect(normalizeCurrency('USD')).toBe('USD');
    expect(normalizeCurrency('EUR')).toBe('EUR');
    expect(normalizeCurrency('BRL')).toBe('BRL');
  });

  test('converte minúsculas para maiúsculas e remove', () => {
    // Remove caracteres não-A-Z, então minúsculas viram vazio → fallback BRL
    expect(normalizeCurrency('usd')).toBe('BRL');
  });

  test('limita a 3 caracteres', () => {
    const result = normalizeCurrency('ABCDEF');
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test('remove números e caracteres especiais', () => {
    const result = normalizeCurrency('U$D');
    expect(result).not.toContain('$');
  });
});

// ── validateComment ───────────────────────────────────────────────────────
describe('validateComment', () => {
  test('retorna null para comentário válido', () => {
    expect(validateComment('Ótimo projeto!')).toBeNull();
  });

  test('retorna erro para comentário vazio', () => {
    expect(validateComment('')).toHaveProperty('error');
  });

  test('retorna erro para comentário só com espaços', () => {
    expect(validateComment('   ')).toHaveProperty('error');
  });

  test('retorna erro para null e undefined', () => {
    expect(validateComment(null)).toHaveProperty('error');
    expect(validateComment(undefined)).toHaveProperty('error');
  });

  test('aceita comentário com caracteres especiais e acentos', () => {
    expect(validateComment('Revisão de escopo — pendente até sexta!')).toBeNull();
  });

  test('aceita comentário longo (> 500 chars)', () => {
    expect(validateComment('x'.repeat(600))).toBeNull();
  });
});
