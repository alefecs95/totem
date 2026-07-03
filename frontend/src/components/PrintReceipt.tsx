import type { CartItem } from '../store/cartStore';

interface PrintReceiptProps {
  items: CartItem[];
  total: number;
  paymentMethod: string;
  paymentId: string;
  tenantName: string;
  date: Date;
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

function montarCupom({
  items,
  total,
  paymentMethod,
  paymentId,
  tenantName,
  date,
}: PrintReceiptProps): string {
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
    `  🎪 ${tenantName}`,
    LINHA_DUPLA,
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
    ' Apresente este cupom',
    '   no balcão de troca',
    LINHA_DUPLA,
  ].join('\n');
}

export default function PrintReceipt(props: PrintReceiptProps) {
  return (
    <div className="print-receipt">
      <pre
        style={{
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          lineHeight: 1.4,
          color: '#000',
          background: '#fff',
          margin: 0,
          whiteSpace: 'pre-wrap',
        }}
      >
        {montarCupom(props)}
      </pre>
    </div>
  );
}
