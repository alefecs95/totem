# Deploy no EasyPanel

Guia para publicar o Totem Festival no EasyPanel (Docker + Traefik + SSL automático).
São **4 serviços** dentro de um projeto (ex.: `totem`):

| Serviço       | Tipo     | Origem              | Porta |
|---------------|----------|---------------------|-------|
| `totem-db`    | Postgres | template EasyPanel  | 5432  |
| `totem-api`   | App      | GitHub `backend/`   | 3001  |
| `totem-pwa`   | App      | GitHub `frontend/`  | 80    |
| `totem-admin` | App      | GitHub `admin/`     | 80    |

Repositório: https://github.com/alefecs95/totem (branch `main`).

> A ordem importa: a API precisa existir antes de buildar PWA/admin, porque o
> domínio da API entra como **build arg** (`VITE_API_URL`) nos front-ends.

---

## 1. Criar o projeto e o banco

1. **Create Project** → nome `totem`.
2. Dentro dele: **+ Service → Postgres**.
   - Name: `totem-db`
   - Password: gere uma senha forte
   - Database: `totem_festival`
   - Deploy.
3. Abra `totem-db` → aba **Credentials**. Guarde a **Connection URL interna**, algo como:
   ```
   postgres://postgres:SENHA@totem_totem-db:5432/totem_festival
   ```
   (o host é `projeto_serviço` na rede interna do Docker.)

---

## 2. API (`totem-api`)

1. **+ Service → App** → name `totem-api`.
2. **Source**:
   - Type: GitHub → repo `alefecs95/totem`, branch `main`.
   - **Build Path / Root**: `backend`
3. **Build**: type **Dockerfile** (o `backend/Dockerfile` já existe).
4. **Environment** (aba Environment):
   ```
   DATABASE_URL=postgres://postgres:SENHA@totem_totem-db:5432/totem_festival
   PORT=3001
   ADMIN_JWT_SECRET=<string aleatoria longa, min 32 chars>
   COMISSAO_PADRAO=5
   # preencha depois de conhecer os dominios do PWA e do admin (passo 5):
   FRONTEND_URL=
   ADMIN_URL=
   PUBLIC_URL=
   # opcionais (pagamentos):
   MP_ACCESS_TOKEN=
   MP_WEBHOOK_SECRET=
   SUMUP_API_KEY=
   ```
5. **Domains**: adicione um domínio. Sem domínio próprio, o EasyPanel gera um
   automático (ex.: `totem-api-xxxx.easypanel.host`).
   - **Container Port: 3001**
   - HTTPS ligado.
6. **Deploy**. Nos logs deve aparecer `Totem Festival backend rodando na porta 3001`
   e `Migrations aplicadas com sucesso.` (as tabelas são criadas no boot).
7. Teste: `https://<dominio-da-api>/api/health` → `{"ok":true}`.

Anote o domínio final da API: `https://<dominio-da-api>` → o `VITE_API_URL` será
esse valor **+ `/api`**.

---

## 3. PWA do totem (`totem-pwa`)

1. **+ Service → App** → name `totem-pwa`.
2. **Source**: GitHub `alefecs95/totem`, branch `main`, **Build Path**: `frontend`.
3. **Build**: **Dockerfile**.
   - **Build Args**:
     ```
     VITE_API_URL=https://<dominio-da-api>/api
     ```
4. **Domains**: adicione domínio (ou use o automático), **Container Port: 80**, HTTPS.
5. **Deploy**.

---

## 4. Admin (`totem-admin`)

1. **+ Service → App** → name `totem-admin`.
2. **Source**: GitHub `alefecs95/totem`, branch `main`, **Build Path**: `admin`.
3. **Build**: **Dockerfile**.
   - **Build Args**:
     ```
     VITE_API_URL=https://<dominio-da-api>/api
     ```
4. **Domains**: domínio, **Container Port: 80**, HTTPS.
5. **Deploy**.

---

## 5. Fechar o CORS e os webhooks

Volte em `totem-api` → Environment e preencha com os domínios reais:

```
FRONTEND_URL=https://<dominio-do-pwa>
ADMIN_URL=https://<dominio-do-admin>
PUBLIC_URL=https://<dominio-da-api>
```

**Redeploy** a `totem-api`. (Sem isso o navegador bloqueia as chamadas por CORS.)

---

## 6. Primeiro uso

1. Acesse o admin: `https://<dominio-do-admin>`
   - Login: `admin@totem.com` / `admin123` → **troque a senha depois**.
2. **Organizadores → + Novo Tenant** (configure gateway e comissão).
3. **Totens → criar** → exibe o **QR Code**. A URL aponta para
   `https://<dominio-do-pwa>/setup?tenantId=...&totemId=...`.
4. No tablet, abra essa URL (ou escaneie o QR) → o totem se configura e vai para a Home.

---

## Notas

- **Migrations**: automáticas no start da API. Não há passo manual de SQL.
- **Trocar `VITE_API_URL`**: se o domínio da API mudar, é preciso **rebuildar**
  `totem-pwa` e `totem-admin` (o valor é embutido no bundle em build-time).
- **Webhook do Mercado Pago**: usa `PUBLIC_URL`. Ao migrar para um domínio próprio,
  atualize `PUBLIC_URL` e faça redeploy da API. O PWA também faz *polling* do status,
  então pagamentos Pix funcionam mesmo sem webhook configurado.
- **Auto-deploy**: habilite o webhook do GitHub no EasyPanel para reconstruir a cada push.
