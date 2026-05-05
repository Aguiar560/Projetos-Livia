# 🗂️ Projeto Livia — Sistema de Gerenciamento de Projetos

Sistema web completo para gerenciamento de projetos, desenvolvido em **Node.js + Express** com banco de dados **MySQL** hospedado na Hostinger. Interface moderna em dark mode, com autenticação segura e acesso via navegador em qualquer dispositivo.

---

## ✨ Funcionalidades

- **Cadastro de projetos** com nome, descrição, cliente, orçamento, datas e status
- **5 status disponíveis:** Cadastrado, Editais Abertos, Em andamento, Realizado, Recusado
- **Orçamento por projeto** — itens de orçamento com progresso individual, etapas e valor por etapa
- **Etapas por item de orçamento** — total de etapas, etapas realizadas, valor por etapa (igual ou livre)
- **Progresso automático** calculado pela proporção de etapas realizadas
- **Anexos** por item de orçamento (PDF, Word, Excel, imagens, ZIP, etc.)
- **Instituições parceiras** vinculadas a cada projeto
- **URL do edital** por projeto
- **Progresso geral** calculado automaticamente pela média dos itens de orçamento
- **Agenda mensal** com visualização de datas por projeto (início/fim de inscrição, início/fim do projeto)
- **Filtros** por status na sidebar
- **Busca** por nome de projeto
- **Cards** com título, descrição, cliente, orçamento, progresso e anexos — sempre alinhados
- **Tela de login** customizada (sem popup nativo do navegador)
- **Badge de perfil** na topbar com nome do usuário
- **Interface responsiva** — funciona em desktop e celular
- **Seções recolhíveis** — "Orçamento" e "Histórico de Alterações" minimizáveis ao clicar no título
- **Resumo no título do Orçamento** — exibe `(utilizado / total)` em tempo real; vermelho se ultrapassar o limite
- **Histórico detalhado** de alterações — rastreia 16 campos com valores antes → depois

---

## 🛡️ Segurança

- **Helmet** — headers HTTP de segurança + CSP configurado
- **Rate limiting** — 200 requisições/15min geral, 20/15min em uploads
- **HPP** — proteção contra HTTP Parameter Pollution
- **Autenticação Basic** com middleware próprio (sem popup do navegador)
- **Sanitização de IDs** — previne injeção de valores inválidos
- **Sanitização de nomes de arquivo** — previne path traversal
- **Validação de tipo MIME** nos uploads (lista branca de tipos permitidos)
- **Limite de tamanho** — máximo 10MB por arquivo, 10 arquivos por envio
- **0 vulnerabilidades** reportadas pelo `npm audit`

---

## 🗄️ Banco de Dados

- **MySQL** (Hostinger) — conexão via pool `mysql2/promise`
- Tabelas criadas automaticamente no primeiro acesso (`db.init()`)
- Campo `edital_url` adicionado via `ALTER TABLE` automático se não existir
- Colunas de etapas adicionadas automaticamente: `steps_total`, `steps_done`, `steps_equal`, `steps_value`

---

## 🚀 Deploy

O sistema está hospedado no **Railway** com deploy automático:

1. Qualquer `git push` para o GitHub dispara o deploy automaticamente
2. O Railway detecta o novo commit e atualiza o servidor em segundos
3. Não é necessário acessar o painel do Railway para fazer atualizações

**URL de produção:** `https://projetos-livia-production.up.railway.app`

---

## ⚙️ Variáveis de Ambiente

Configure no Railway (ou no arquivo `.env` para rodar localmente):

| Variável | Descrição |
|---|---|
| `MYSQL_HOST` | Host do banco MySQL |
| `MYSQL_PORT` | Porta (padrão: 3306) |
| `MYSQL_USER` | Usuário do banco |
| `MYSQL_PASSWORD` | Senha do banco |
| `MYSQL_DATABASE` | Nome do banco |
| `ADMIN_USER` | Usuário de acesso ao sistema |
| `ADMIN_PASS` | Senha de acesso ao sistema |
| `PORT` | Porta do servidor (Railway define automaticamente) |

---

## 🖥️ Instalação Local

**Pré-requisitos:** Node.js >= 18

```bash
# 1. Clonar o repositório
git clone https://github.com/Aguiar560/Projetos-Livia.git
cd Projetos-Livia

# 2. Instalar dependências
npm install

# 3. Criar arquivo .env com as variáveis acima
# 4. Iniciar o servidor
npm start
```

Acesse `http://localhost:3000` no navegador.

---

## 🧪 Testes

```bash
npm test                  # todos os testes
npm run test:unit         # apenas testes unitários
npm run test:integration  # apenas testes de integração
npm run test:perf         # apenas testes de desempenho
```

**Cobertura:**
- **Unitários** — `sanitizeId`, `sanitizeFilename`, `safeJson`, middleware `requireAuth`
- **Integração** — proteção de rotas (401 sem auth), `/api/me`, CRUD de projetos
- **Desempenho** — 20 req paralelas, 100 req sequenciais, headers de rate limit

---

## � Changelog

### 05/05/2026
- ✅ Seção "Fases do Projeto" renomeada para **"Orçamento"** (itens → "Itens de Orçamento")
- ✅ **Etapas por item de orçamento** — campos `steps_total`, `steps_done`, `steps_equal`, `steps_value` no banco e UI
- ✅ Progresso calculado automaticamente pela proporção de etapas realizadas
- ✅ Seção **Orçamento recolhível** ao clicar no título (igual ao Histórico de Alterações)
- ✅ **Resumo financeiro no título**: exibe `(utilizado / total)` em tempo real; vermelho se ultrapassar
- ✅ Histórico detalhado rastreia 16 campos com valores antes → depois
- ✅ Correção: bug `saveEditPhase` que causava falha silenciosa ao editar item
- ✅ Correção: perda de dados ao reordenar itens (`updatePhase` preserva campos não enviados)
- ✅ Correção: rate limit de upload aplicado apenas quando há arquivos reais
- ✅ Correção: CSP atualizado (`script-src-attr`, `frame-src blob:`, `connect-src jsdelivr`)
- ✅ Service Worker v2 — `app.js` e `index.html` sempre via rede (sem cache)

---

## �🛠️ Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express 4 |
| Banco de dados | MySQL 8 (mysql2/promise) |
| Upload de arquivos | Multer 2.x |
| Segurança | Helmet, HPP, express-rate-limit |
| Frontend | HTML + CSS + JavaScript (Vanilla) |
| Fonte | Inter (Google Fonts) |
| Hospedagem | Railway |
| Banco (produção) | Hostinger MySQL |
| Testes | Jest + Supertest |

---

## 📁 Estrutura do Projeto

```
├── server.js          # Servidor Express + endpoints REST + segurança
├── db.js              # Camada de acesso ao banco MySQL
├── public/
│   ├── index.html     # Frontend completo (HTML + CSS)
│   ├── app.js         # Lógica do frontend (Vanilla JS)
│   └── service-worker.js  # PWA cache (v2 — app.js sempre via rede)
├── uploads/           # Arquivos enviados (ignorado no git)
├── tests/
│   ├── unit/          # Testes unitários
│   ├── integration/   # Testes de integração
│   └── performance/   # Testes de desempenho
├── .env               # Variáveis de ambiente (ignorado no git)
└── package.json
```
