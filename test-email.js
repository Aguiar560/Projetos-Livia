// Teste rápido de envio de e-mail — rode com: node test-email.js
require('dotenv').config();
const nodemailer = require('nodemailer');

const SMTP_HOST   = process.env.SMTP_HOST;
const SMTP_PORT   = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER   = process.env.SMTP_USER;
const SMTP_PASS   = process.env.SMTP_PASS;
const NOTIFY_TO   = process.env.NOTIFY_TO;

console.log('--- Configurações SMTP ---');
console.log('HOST:  ', SMTP_HOST);
console.log('PORT:  ', SMTP_PORT);
console.log('SECURE:', SMTP_SECURE);
console.log('USER:  ', SMTP_USER);
console.log('TO:    ', NOTIFY_TO);
console.log('--------------------------');

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !NOTIFY_TO) {
  console.error('❌ Variáveis SMTP incompletas no .env');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host:   SMTP_HOST,
  port:   SMTP_PORT,
  secure: SMTP_SECURE,
  auth:   { user: SMTP_USER, pass: SMTP_PASS }
});

transport.sendMail({
  from:    `"Projetos Lívia" <${SMTP_USER}>`,
  to:      NOTIFY_TO,
  subject: '✅ Teste — Sistema de notificações funcionando!',
  html: `
    <div style="font-family:Arial;background:#0f0f1a;color:#c5c7d8;padding:32px;border-radius:12px;max-width:500px">
      <h2 style="color:#6c63ff">✅ E-mail de teste recebido!</h2>
      <p>O sistema de notificações do <strong>Projetos Lívia</strong> está configurado corretamente.</p>
      <p style="color:#8b90b5;font-size:.85rem">Enviado em: ${new Date().toLocaleString('pt-BR')}</p>
    </div>`
}, (err, info) => {
  if (err) {
    console.error('❌ Erro ao enviar:', err.message);
  } else {
    console.log('✅ E-mail enviado com sucesso!');
    console.log('   ID:', info.messageId);
  }
  process.exit(0);
});
