# Deploy — Totem Festival (VPS Ubuntu + Node.js + PM2 + Caddy)

## Requisitos da VPS

- Ubuntu 22.04+
- Node.js 20 via nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# reabra o shell e:
nvm install 20 && nvm use 20
```

- PM2:

```bash
npm install -g pm2
```

- PostgreSQL 16:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql && sudo systemctl start postgresql
```

- Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

## Configurar PostgreSQL

```bash
sudo -u postgres psql <<EOF
CREATE USER totem_user WITH PASSWORD 'senha_forte_aqui';
CREATE DATABASE totem_festival OWNER totem_user;
GRANT ALL PRIVILEGES ON DATABASE totem_festival TO totem_user;
EOF
```

`DATABASE_URL` ficará:

```
postgresql://totem_user:senha_forte_aqui@localhost:5432/totem_festival
```

> As tabelas são criadas automaticamente pelo backend na inicialização (`runMigrations`).

## Passos do Deploy

### 1. Clonar e instalar

```bash
git clone https://github.com/alefecs95/totem.git /var/www/totem-festival
cd /var/www/totem-festival

cd backend  && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..
cd admin    && npm install && npm run build && cd ..
```

### 2. Configurar ambiente

```bash
cp backend/.env.example backend/.env
nano backend/.env   # preencha DATABASE_URL, ADMIN_JWT_SECRET, PUBLIC_URL, tokens...
```

Defina `PUBLIC_URL=https://seudominio.com` para que os webhooks do Mercado Pago
recebam a URL pública correta.

### 3. PM2

```bash
pm2 start backend/dist/server.js --name totem-api
pm2 save && pm2 startup
# copie e execute o comando que o pm2 startup exibir
```

### 4. Caddy (SSL automático)

```bash
sudo mkdir -p /var/log/caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
# ajuste "seudominio.com" dentro do Caddyfile
sudo systemctl reload caddy
```

### 5. Testar

```bash
curl https://seudominio.com/api/health

# Requer headers do totem configurado no tablet:
curl -H "x-tenant-id: UUID_DO_TENANT" \
     -H "x-totem-id: UUID_DO_TOTEM" \
     https://seudominio.com/api/config
```

## Atualizações

```bash
bash deploy/update.sh
```

## Notas importantes

- O painel admin é servido em `https://seudominio.com/admin/` e é compilado com
  `base: '/admin/'` (veja `admin/vite.config.ts`).
- O backend expõe todas as rotas sob o prefixo `/api` (ex.: `/api/admin/login`,
  `/api/payment/pix`), casando com o proxy do Vite (dev) e o Caddy (prod).
- Login inicial do admin: `admin@totem.com` / `admin123` (troque em produção).
