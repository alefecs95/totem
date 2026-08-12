# Totem PDV (Electron)

App de balcão: digita o **código do evento**, vende produtos e imprime fichas na térmica **sem diálogo do Chrome** (impressão silenciosa + 1 job por ficha para o cortador).

## Pré-requisitos

1. API (`totem-api`) no ar com a migration `codigo_evento`
2. No admin, cada organizador tem um **Código PDV** (gerado automaticamente ou editável)
3. Produtos com **Imprime ficha** + logo individual (se quiser)

## Desenvolvimento

```bash
# terminal 1 — API
cd backend && npm run dev

# terminal 2 — UI Vite
cd pdv && npm install && npm run dev

# terminal 3 — Electron
cd pdv && npx electron .
```

Ou: `npm run electron:dev` (Vite + Electron juntos).

Na tela de login:
- **Código**: o do admin (ex. `FESTA3K9`)
- **URL da API**: `http://localhost:3001/api` (ou a URL pública `/api`)

## Build Windows

```bash
cd pdv
npm install
npm run electron:build
```

Instalador em `pdv/release/`.

## Uso no evento

1. Abrir **Totem PDV**
2. Informar código do evento + URL da API (uma vez)
3. Escolher impressora POS80 (papel **80 × 35 mm**, cutting after one page)
4. Vender → **Finalizar e imprimir fichas**

## API usada

- `GET /api/pdv/:codigo`
- `POST /api/pdv/:codigo/vendas` (`dinheiro` | `cartao_fisico`)
