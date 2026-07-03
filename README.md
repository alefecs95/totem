# Totem Festival

Plataforma de totem de autoatendimento para festivais, multi-tenant, com pagamento via Pix e cartão (Mercado Pago Point Smart 2 / SumUp Solo) e cobrança de comissão por transação.

## Arquitetura

```
Tablet Android 10"  → roda o PWA (frontend)
Point Smart 2 (MP)  → processa cartão via intenção de pagamento
Impressora BT       → imprime comprovante
```

## Estrutura

- `frontend/` — PWA React (Vite) para o cliente: seleção de produtos, Pix QR, sucesso.
- `backend/` — API Node/Express: orquestra pagamentos, calcula comissão, recebe webhooks. Banco de dados PostgreSQL (multi-tenant / multi-totem, produção). Auth via JWT + bcrypt.
- `admin/` — Painel React: gerencia organizadores (tenants), transações/comissões e configuração de gateway por tenant.

## Modelo de negócio

- Cada totem pertence a um organizador (tenant).
- A plataforma cobra X% de comissão sobre cada transação.
- O backend registra: valor bruto, taxa do gateway, comissão da plataforma e líquido do organizador.
- Repasse manual ao organizador.

## Desenvolvimento

Cada projeto tem seu próprio `package.json`. Em cada pasta:

```bash
npm install
npm run dev
```

Backend: copie `backend/.env.example` para `backend/.env` e preencha as credenciais. É necessário um PostgreSQL acessível (configure `DATABASE_URL` ou as variáveis `PG*`).

> Estrutura inicial gerada com stubs `// TODO: implementar`.
