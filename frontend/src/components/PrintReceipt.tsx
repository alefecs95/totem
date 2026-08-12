import type { CartItem } from '../store/cartStore';
import type { ViaComprovante } from '../constants/productCategories';

interface PrintReceiptProps {
  items: CartItem[];
  total: number;
  paymentMethod: string;
  paymentId: string;
  tenantName: string;
  date: Date;
  vias?: ViaComprovante[];
}

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

function formatData(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const aaaa = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${aaaa} ${hh}:${min}`;
}

const LINHA_DUPLA = '━━━━━━━━━━━━━━━━━━━━━━';
const LINHA_SIMPLES = '──────────────────────';

function tituloVia(via: ViaComprovante): string {
  return via === 'barman' ? 'VIA BARMAN' : 'VIA CLIENTE';
}

function instrucaoVia(via: ViaComprovante): string {
  if (via === 'barman') {
    return ' Entregue ao barman\n   para liberação';
  }
  return ' Apresente este cupom\n   no balcão de troca';
}

function montarCupom(
  props: PrintReceiptProps,
  via: ViaComprovante
): string {
  const { items, total, paymentMethod, paymentId, tenantName, date } = props;
  const idCurto = paymentId ? paymentId.slice(0, 8).toUpperCase() : '--------';

  const linhasItens = items
    .map((item) => {
      const nome = item.nome.slice(0, 13).padEnd(13, ' ');
      const qtd = String(item.quantidade).padStart(3, ' ');
      const vlr = formatPreco(item.preco * item.quantidade).padStart(8, ' ');
      return `${nome}${qtd} ${vlr}`;
    })
    .join('\n');

  return [
    LINHA_DUPLA,
    `  ${tituloVia(via)}`,
    LINHA_DUPLA,
    `  🎪 ${tenantName}`,
    '  COMPROVANTE DE VENDA',
    `Data: ${formatData(date)}`,
    `ID: #${idCurto}`,
    LINHA_SIMPLES,
    'PRODUTO        QTD  VLR',
    linhasItens,
    LINHA_SIMPLES,
    `TOTAL:      ${formatPreco(total)}`,
    LINHA_SIMPLES,
    `Pagamento: ${paymentMethod}`,
    'Status: ✓ APROVADO',
    LINHA_SIMPLES,
    instrucaoVia(via),
    LINHA_DUPLA,
  ].join('\n');
}

export default function PrintReceipt({
  vias = ['cliente'],
  ...props
}: PrintReceiptProps) {
  return (
    <div className="print-receipt">
      {vias.map((via, index) => (
        <div
          key={via}
          className={`print-receipt-page print-receipt-${via}`}
          style={{
            pageBreakAfter: index < vias.length - 1 ? 'always' : 'auto',
          }}
        >
          <pre
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: via === 'barman' ? 12 : 11,
              lineHeight: 1.4,
              color: '#000',
              background: via === 'barman' ? '#f5f5f5' : '#fff',
              border: via === 'barman' ? '3px solid #000' : 'none',
              padding: via === 'barman' ? 8 : 0,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {montarCupom(props, via)}
          </pre>
        </div>
      ))}
    </div>
  );
}
