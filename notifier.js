// ── notifier.js ───────────────────────────────────────────────────────────────
// Envia e-mail de alerta quando faltam 7 dias para o fim das inscrições
// de projetos com status "editais abertos".
//
// Uso:
//   node notifier.js            → executa uma vez e sai
//   (Railway: agendar via cron ou chamar no startup com setInterval)
//
require('dotenv').config();
const nodemailer = require('nodemailer');
const db         = require('./db');

const SMTP_HOST   = process.env.SMTP_HOST   || '';
const SMTP_PORT   = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false'; // padrão true
const SMTP_USER   = process.env.SMTP_USER   || '';
const SMTP_PASS   = process.env.SMTP_PASS   || '';
const NOTIFY_TO   = process.env.NOTIFY_TO   || '';

// ── Cria transporter ─────────────────────────────────────────────────────────
function createTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !NOTIFY_TO) {
    console.warn('[NOTIFIER] Variáveis SMTP_HOST, SMTP_USER, SMTP_PASS ou NOTIFY_TO não configuradas. Notificações desabilitadas.');
    return null;
  }
  return nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   SMTP_PORT,
    secure: SMTP_SECURE,
    auth:   { user: SMTP_USER, pass: SMTP_PASS }
  });
}

// ── Lógica principal ─────────────────────────────────────────────────────────
async function checkAndNotify() {
  const transport = createTransport();
  if (!transport) return;

  await db.init();

  const projects = await db.getAllProjects();
  const now      = new Date();

  // Filtra: status "editais abertos" + inscription_end nos próximos 7 dias
  const TARGET_DAYS = 7;
  const alerts = projects.filter(p => {
    if (p.status !== 'editais abertos') return false;
    if (!p.inscription_end) return false;
    const end      = new Date(p.inscription_end);
    const diffMs   = end - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= TARGET_DAYS;
  });

  if (!alerts.length) {
    console.log('[NOTIFIER] Nenhum projeto com prazo de inscrição em 7 dias.');
    return;
  }

  // Monta HTML do e-mail
  const rows = alerts.map(p => {
    const end  = new Date(p.inscription_end);
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a">${p.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;white-space:nowrap">${p.client || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;white-space:nowrap;color:#f97316;font-weight:700">
          ${end.toLocaleDateString('pt-BR')}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;text-align:center;color:${diff <= 2 ? '#ff5c6e' : '#ffb547'};font-weight:700">
          ${diff} dia${diff !== 1 ? 's' : ''}
        </td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:Arial,sans-serif;color:#c5c7d8">
  <div style="max-width:600px;margin:32px auto;background:#1a1a2e;border-radius:12px;overflow:hidden;border:1px solid #2a2a3a">
    <div style="background:#6c63ff;padding:20px 24px">
      <h2 style="margin:0;color:#fff;font-size:1.2rem">⏰ Alerta — Fim das Inscrições em 7 dias</h2>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 16px">Os seguintes projetos com status <strong>Editais Abertos</strong> têm prazo de inscrição se encerrando em breve:</p>
      <table style="width:100%;border-collapse:collapse;font-size:.9rem">
        <thead>
          <tr style="background:#12122a">
            <th style="padding:8px 12px;text-align:left;color:#8b90b5">Projeto</th>
            <th style="padding:8px 12px;text-align:left;color:#8b90b5">Cliente</th>
            <th style="padding:8px 12px;text-align:left;color:#8b90b5">Fim Inscrição</th>
            <th style="padding:8px 12px;text-align:center;color:#8b90b5">Dias restantes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:20px 0 0;font-size:.8rem;color:#5a5c7a">Este e-mail foi enviado automaticamente pelo sistema de gerenciamento de projetos.</p>
    </div>
  </div>
</body>
</html>`;

  await transport.sendMail({
    from:    `"Projetos Lívia" <${SMTP_USER}>`,
    to:      NOTIFY_TO,
    subject: `⏰ ${alerts.length} projeto(s) com inscrição encerrando em 7 dias`,
    html
  });

  console.log(`[NOTIFIER] E-mail enviado para ${NOTIFY_TO} — ${alerts.length} projeto(s) alertados.`);
}

// ── Execução ─────────────────────────────────────────────────────────────────
// Exporta para uso no server.js (agendamento diário)
module.exports = { checkAndNotify };

// Execução direta: node notifier.js
if (require.main === module) {
  checkAndNotify()
    .catch(err => console.error('[NOTIFIER] Erro:', err.message))
    .finally(() => process.exit(0));
}
