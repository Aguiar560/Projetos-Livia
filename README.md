# Projeto Livia — App de projetos

App simples em Node.js (Express) com SQLite para registrar projetos realizados, em andamento e futuros.

Requisitos:
- Node.js (>=14)

Banco de dados:
- MySQL (instância local ou remota)

Crie o banco e configure as variáveis de ambiente antes de rodar:

```powershell
# exemplo para PowerShell (ajuste conforme sua senha/host)
$env:MYSQL_HOST = 'localhost';
$env:MYSQL_PORT = '3306';
$env:MYSQL_USER = 'root';
$env:MYSQL_PASSWORD = 'sua_senha';
$env:MYSQL_DATABASE = 'projeto_livia';
```

Opção com Docker Compose (levanta MySQL local):

```powershell
cd 'C:\Users\aguia\Documents\Projeto Livia'
docker-compose up -d
# depois use as mesmas variáveis de ambiente ou crie .env com os valores
```

Instalação (PowerShell):

```powershell
cd 'C:\Users\aguia\Documents\Projeto Livia'
npm install
node server.js
```

Acesse: http://localhost:3000

Observações:
- Banco SQLite será criado em `database.sqlite`.
- Arquivos enviados são salvos na pasta `uploads/`.
- Endpoints REST: GET/POST/PUT/DELETE em `/api/projects`.

Observações:
- O projeto agora usa MySQL. A tabela `projects` será criada automaticamente na primeira execução se o usuário tiver permissões.
- Arquivos enviados são salvos na pasta `uploads/`.
- Endpoints REST: GET/POST/PUT/DELETE em `/api/projects`.
