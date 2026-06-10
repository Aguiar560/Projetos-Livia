/**
 * Testes Unitários — makeFilename (geração segura e única de nomes de arquivo)
 * Testa a função que cria nomes seguros para arquivos armazenados no servidor.
 */

const path = require('path');

// Reimplementação local (mesma lógica do server.js)
function makeFilename(originalname) {
  const ext  = path.extname(originalname).replace(/[^a-zA-Z0-9.]/g, '').substring(0, 10);
  const base = path.basename(originalname, path.extname(originalname))
                  .replace(/[^a-zA-Z0-9\-_]/g, '_')
                  .substring(0, 60);
  return `${Date.now()}_${base}${ext}`;
}

// ── Formato e estrutura ────────────────────────────────────────────────────
describe('makeFilename — formato e estrutura', () => {
  test('retorna uma string não vazia', () => {
    const result = makeFilename('relatorio.pdf');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('começa com timestamp numérico válido', () => {
    const before = Date.now();
    const result = makeFilename('arquivo.pdf');
    const after  = Date.now();

    const ts = parseInt(result.split('_')[0], 10);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test('preserva extensão .pdf', () => {
    expect(makeFilename('documento.pdf')).toMatch(/\.pdf$/);
  });

  test('preserva extensão .xlsx', () => {
    expect(makeFilename('planilha.xlsx')).toMatch(/\.xlsx$/);
  });

  test('preserva extensão .jpg', () => {
    expect(makeFilename('foto.jpg')).toMatch(/\.jpg$/);
  });

  test('preserva extensão .docx', () => {
    expect(makeFilename('relatorio.docx')).toMatch(/\.docx$/);
  });
});

// ── Sanitização de caracteres ──────────────────────────────────────────────
describe('makeFilename — sanitização de caracteres', () => {
  test('substitui espaços no nome base por underscore', () => {
    const result = makeFilename('meu arquivo.pdf');
    expect(result).not.toContain(' ');
  });

  test('substitui ! e @ e # por underscore', () => {
    const result = makeFilename('arquivo!@#$%.pdf');
    expect(result).not.toContain('!');
    expect(result).not.toContain('@');
    expect(result).not.toContain('#');
    expect(result).not.toContain('$');
    expect(result).not.toContain('%');
  });

  test('substitui acentos e caracteres não-ASCII', () => {
    const result = makeFilename('relatório_final.pdf');
    // ó → _
    const base = result.replace(/^\d+_/, '').replace(/\.pdf$/, '');
    expect(/^[a-zA-Z0-9\-_]+$/.test(base)).toBe(true);
  });

  test('não contém barras (prevenção de path traversal)', () => {
    const result = makeFilename('../../../etc/passwd.sh');
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
  });

  test('não contém sequências de path traversal (..)', () => {
    const result = makeFilename('../../secret.txt');
    expect(result).not.toContain('..');
  });

  test('permite hífens e underscores no nome base', () => {
    const result = makeFilename('nome-do-arquivo_v2.pdf');
    expect(result).toContain('nome-do-arquivo_v2');
  });
});

// ── Limites de tamanho ─────────────────────────────────────────────────────
describe('makeFilename — limites de tamanho', () => {
  test('limita o nome base a 60 caracteres', () => {
    const longBase = 'a'.repeat(100);
    const result   = makeFilename(`${longBase}.pdf`);
    // Extrai o base sem timestamp e sem extensão
    const withoutTs  = result.replace(/^\d+_/, '');
    const withoutExt = withoutTs.replace(/\.pdf$/, '');
    expect(withoutExt.length).toBeLessThanOrEqual(60);
  });

  test('limita a extensão a 10 caracteres', () => {
    const result = makeFilename('arquivo.extensaoMuitoLongaDemais');
    const ext = path.extname(result);
    expect(ext.length).toBeLessThanOrEqual(10);
  });

  test('nome muito longo não lança exceção', () => {
    const longName = 'x'.repeat(500) + '.pdf';
    expect(() => makeFilename(longName)).not.toThrow();
  });
});

// ── Unicidade e colisões ───────────────────────────────────────────────────
describe('makeFilename — unicidade', () => {
  test('gera nomes únicos para arquivos distintos no mesmo instante', () => {
    // Como usa Date.now(), dois arquivos no mesmo ms podem ter mesmo ts,
    // mas o nome base os diferencia
    const a = makeFilename('arquivo_a.pdf');
    const b = makeFilename('arquivo_b.pdf');
    expect(a).not.toBe(b);
  });

  test('gera nomes únicos com timestamps diferentes', async () => {
    const a = makeFilename('foto.jpg');
    await new Promise(r => setTimeout(r, 5));
    const b = makeFilename('foto.jpg');
    expect(a).not.toBe(b);
  }, 10000);

  test('100 chamadas produzem pelo menos 95 nomes distintos', () => {
    const nomes = new Set();
    for (let i = 0; i < 100; i++) {
      nomes.add(makeFilename(`arquivo_${i}.pdf`));
    }
    expect(nomes.size).toBeGreaterThanOrEqual(95);
  });
});

// ── Casos extremos ─────────────────────────────────────────────────────────
describe('makeFilename — casos extremos', () => {
  test('lida com arquivo sem extensão', () => {
    expect(() => makeFilename('arquivosemext')).not.toThrow();
    const result = makeFilename('arquivosemext');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('lida com nome só com ponto (".") sem lançar erro', () => {
    expect(() => makeFilename('.')).not.toThrow();
  });

  test('lida com nome ".." sem lançar erro', () => {
    expect(() => makeFilename('..')).not.toThrow();
  });

  test('lida com extensão em maiúsculas (.PDF)', () => {
    const result = makeFilename('documento.PDF');
    expect(result).toMatch(/\.PDF$/);
  });

  test('lida com múltiplos pontos no nome (arquivo.min.js)', () => {
    expect(() => makeFilename('script.min.js')).not.toThrow();
    const result = makeFilename('script.min.js');
    expect(result).toMatch(/\.js$/); // mantém a última extensão
  });
});
