# artesynal_os_extesion_system

## Persistência em MySQL

O sistema foi migrado para persistir dados no MySQL via API PHP.

### Páginas principais já apontando para MySQL
- `os.html` e `lista.html` via `api/ordens_servico.php`.
- `orcamentos.html`, `solicitacao.html`, `detalhes-visita.html`, `estoque.html`, `estserralheria.html` e `estimpressao.html` via camada de compatibilidade `mysql-firestore-compat.js` + `api/firestore_compat.php`.

### Arquivos da API
- `api/db.php`: conexão MySQL e criação das tabelas `ordem_servico` e `documents`.
- `api/ordens_servico.php`: CRUD de O.S.
- `api/firestore_compat.php`: CRUD genérico por coleção/documento para módulos migrados do Firestore.

### Variáveis de ambiente do servidor
- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`

Se não definir variáveis, o código usa:
- host `localhost`
- usuário `artesynal`
- banco `artesynal`
- senha vazia

> Recomendação: configure a senha via ambiente no servidor e não versione credenciais no GitHub.
