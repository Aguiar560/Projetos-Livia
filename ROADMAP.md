# 🛣️ Roadmap — O que falta para o sistema ser vendável

Análise do estado atual do sistema e o que precisa ser feito antes de comercializá-lo.

---

## 🔴 Crítico — bloqueadores de venda

Esses itens impedem a venda do sistema para qualquer cliente.

- [ ] **Remover nome "Livia" hardcoded** — `index.html` (título, topbar, rodapé), `manifest.json`, `docker-compose.yml` e `package.json` precisam ser genéricos ou configuráveis via variável de ambiente
- [ ] **Gerenciamento de usuários via UI** — hoje usuários são definidos em variáveis de ambiente (máx. 2: admin + viewer); cliente real precisa criar/remover usuários sem reiniciar o servidor
- [ ] **Troca de senha pelo próprio usuário** — sem isso nenhum cliente aceita o sistema em produção
- [ ] **Página de 404 e erro customizada** — qualquer rota inexistente retorna o HTML do `index.html` ou um erro nu sem formatação
- [ ] **Suporte a mais de 2 usuários simultâneos** — arquitetura atual limita a 1 admin + 1 viewer fixos no processo via variáveis de ambiente

---

## 🟠 Alta prioridade — esperado em qualquer produto

Funcionalidades que todo cliente vai perguntar no primeiro contato.

- [ ] **Exportação de projetos** — PDF ou Excel com os dados; o backup atual é um dump SQL bruto que expõe a estrutura interna do banco
- [ ] **Backup automático agendado** — hoje só funciona via botão manual; sem agendamento real (cron) configurável pelo administrador
- [ ] **Logs de acesso acessíveis via UI** — o `access.log` existe no servidor mas não há interface para visualizar ou filtrar
- [ ] **Health check endpoint `/health`** — necessário para monitoramento externo (Railway, UptimeRobot, etc.)
- [ ] **Política de privacidade / LGPD** — página mínima exigida pela lei brasileira antes de qualquer comercialização
- [ ] **E-mail de recuperação de acesso** — o notifier de alertas existe mas não há fluxo de "esqueci minha senha"
- [ ] **Onboarding / tela de primeiro acesso** — hoje se `ADMIN_USER` não está configurado a autenticação é desabilitada silenciosamente sem nenhum aviso claro ao usuário

---

## 🟡 Média prioridade — qualidade percebida

Itens que fazem a diferença na percepção de produto acabado.

- [ ] **White-label completo** — logo, cores primárias e nome do sistema configuráveis sem tocar no código
- [ ] **Soft delete de projetos** — exclusão permanente sem recuperação; clientes esperam uma lixeira
- [ ] **Confirmação antes de deletar arquivos/fases/instituições** — alguns deletes não têm confirmação no front, risco de perda de dados
- [ ] **Paginação server-side** — hoje carrega todos os projetos de uma vez no frontend; com 500+ projetos o sistema fica lento
- [ ] **Busca server-side** — filtro e busca feitos 100% no client após carregar tudo; inviável com volume grande
- [ ] **Armazenamento de arquivos externo (S3/R2)** — arquivos em LONGBLOB no MySQL fazem o banco crescer indefinidamente e não escala
- [ ] **Modo tema claro funcional** — o botão existe mas o light mode tem problemas de contraste em vários elementos
- [ ] **Termos de uso** — exibido no primeiro login com aceite registrado no banco

---

## 🔵 Diferenciais competitivos

Funcionalidades que agregam valor e diferenciam de concorrentes.

- [ ] **Status personalizáveis** — hoje são 5 fixos no código; clientes de outros setores precisam de status próprios
- [ ] **Notificações in-app** (badge/toast) além do e-mail — alertas de prazo sem depender de SMTP configurado
- [ ] **Relatório de dashboard exportável** — gráficos do dashboard em PDF ou imagem
- [ ] **Templates de projeto** — criar novo projeto a partir de um modelo pré-configurado
- [ ] **Campos customizados por projeto** — formulário flexível sem precisar alterar o banco de dados
- [ ] **Histórico de acessos por usuário** — quem entrou, quando e de qual IP (além do `access.log` atual)
- [ ] **API REST documentada** (Swagger/OpenAPI) — para integrações com outros sistemas do cliente
- [ ] **Multi-idioma** — pelo menos PT-BR + EN para ampliar mercado

---

## 📊 Resumo

| Prioridade | Quantidade | Status |
|---|---|---|
| 🔴 Crítico | 5 | Bloqueiam a venda |
| 🟠 Alta | 7 | Clientes vão pedir no primeiro contato |
| 🟡 Média | 8 | Percepção de produto acabado |
| 🔵 Diferencial | 8 | Vantagem competitiva |
| **Total** | **28** | |
