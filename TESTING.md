# Como testar localmente

## 1. PostgreSQL

O PostgreSQL 17 já foi instalado nesta máquina. Falta **criar o banco**:

### Via pgAdmin (mais fácil no Windows)
1. Abra **pgAdmin 4** no menu Iniciar
2. Conecte no servidor local (senha definida na instalação do PostgreSQL)
3. Clique com botão direito em **postgres** → **Query Tool**
4. Abra e execute o arquivo `scripts/init-db.sql` deste projeto
5. Clique **Execute** (F5)

### Via linha de comando (se souber a senha do postgres)
```powershell
$env:PGPASSWORD = "SUA_SENHA_DO_POSTGRES"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -f scripts/init-db.sql
```

O `backend/.env` já aponta para:
`postgresql://totem_user:totem_dev@localhost:5432/totem_festival`

## 2. Subir os 3 serviços

Na raiz do projeto:
```powershell
npm install
npm run dev
```

| Serviço   | URL                        |
|-----------|----------------------------|
| Totem PWA | http://localhost:5173      |
| Admin     | http://localhost:5174/admin/ |
| API       | http://localhost:3001/api/health |

## 3. Fluxo de teste

### Admin
1. Abra http://localhost:5174/admin/
2. Login: `admin@totem.com` / `admin123`
3. **Organizadores** → **+ Novo Tenant** (ex.: "Festival Teste")
4. Clique **Totens** → crie um totem (ex.: "Totem Entrada")
5. Copie a URL do QR Code ou clique para exibir o QR

### Totem (tablet / navegador)
1. Abra a URL de setup, por exemplo:
   ```
   http://localhost:5173/setup?tenantId=UUID&totemId=UUID
   ```
   (use os UUIDs da URL exibida no admin)
2. O totem redireciona para a Home com os 4 produtos padrão
3. Adicione itens → Carrinho → Pagamento

### Testar API direto
```powershell
curl http://localhost:3001/api/health

curl -H "x-tenant-id: SEU_TENANT_ID" -H "x-totem-id: SEU_TOTEM_ID" http://localhost:3001/api/config
```

## Problemas comuns

| Erro | Solução |
|------|---------|
| `Falha ao aplicar migrations` | PostgreSQL não está rodando na porta 5432 |
| Tela `/setup` sem parar | Abra a URL com `tenantId` e `totemId` |
| Admin 401 | Login novamente (`admin@totem.com` / `admin123`) |
| Pagamento Pix/Cartão falha | Preencha `MP_ACCESS_TOKEN` no `backend/.env` |
