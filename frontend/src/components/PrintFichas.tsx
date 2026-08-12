import { expandFichaTickets, type FichaTicket } from '../utils/fichas';

interface PrintFichasProps {
  items: Array<{
    id?: string;
    nome: string;
    quantidade: number;
    imprime_ficha?: boolean;
  }>;
  /** Se informado, imprime exatamente estas fichas (ex.: após venda no operador). */
  tickets?: FichaTicket[];
  tenantName?: string;
}

/**
 * Fichas térmicas 80mm × 2,5cm — uma página por unidade.
 * Visível só em @media print (classe .print-fichas).
 */
export default function PrintFichas({
  items,
  tickets: ticketsProp,
  tenantName,
}: PrintFichasProps) {
  const tickets = ticketsProp ?? expandFichaTickets(items);
  if (tickets.length === 0) return null;

  return (
    <div className="print-fichas">
      {tickets.map((ticket, index) => (
        <div
          key={ticket.key}
          className="print-ficha-page"
          style={{
            pageBreakAfter: index < tickets.length - 1 ? 'always' : 'auto',
          }}
        >
          <div className="print-ficha-inner">
            {tenantName ? (
              <div className="print-ficha-festival">{tenantName}</div>
            ) : null}
            <div className="print-ficha-nome">{ticket.nome.toUpperCase()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
