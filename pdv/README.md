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
- **URL da API** (produção atual): `https://totem-totem-api.jgdvyu.easypanel.host/api`
  (o instalador já vem com essa URL como padrão; PWA: https://totem-totem-pwa.jgdvyu.easypanel.host/)

## Instalador Windows

Gerado em:

```text
pdv/release/Totem PDV Setup 1.0.0.exe
```

Para regenerar:

```bash
cd pdv
npm run electron:build
```

## Uso no evento

1. Abrir **Totem PDV**
2. Informar código do evento + URL da API (uma vez)
3. Escolher impressora POS80 (papel **80 × 30 mm**, cutting after one page)
4. Vender → **Finalizar e imprimir fichas**

## Offline

- **Primeiro login** precisa de internet (baixa produtos e salva cache).
- Se a internet cair **depois**, o PDV continua: vende, imprime fichas e enfileira vendas localmente.
- Quando a rede voltar, a fila sincroniza sozinha com a API.
- Reiniciar o app sem rede ainda funciona se o evento já tiver sido logado (cache local).

## 2 vias (barman + cliente)

No admin/portal, marque o produto com **Imprime ficha** + **2 vias**.
Cada unidade imprime (barman primeiro):
1. **BARMAN** — sabor + codigo `B-XXXX` + contador do dia `#047`
2. **CLIENTE** — sabor + o **mesmo** codigo

Extras no PDV:
- **Historico** (tecla `H`) — ultimas vendas do evento
- **LEITOR** (tecla `L`) — escolhe **SumUp** ou **Mercado Pago** na hora
- **Maquininha** — lista/seleciona o leitor SumUp
- **Drinks / Todos** (tecla `B`) — filtra so produtos 2 vias
- **Reimprimir** (tecla `R`) — mesma ultima venda (mesmos codigos)
- Beep + flash laranja ao vender drink 2 vias
- **Tela cheia** no instalador (F11 alterna) + cursor some apos 5s
- **Dinheiro**: digite `100` = R$ 100,00; `,` entra nos centavos

## API usada

- `GET /api/pdv/:codigo`
- `POST /api/pdv/:codigo/vendas` (`dinheiro` | `cartao_fisico`)
