import { expandFichaTickets, type FichaTicket } from '../utils/fichas';

interface PrintFichasProps {
  items: Array<{
    id?: string;
    nome: string;
    quantidade: number;
    imprime_ficha?: boolean;
  }>;
  tickets?: FichaTicket[];
  tenantName?: string;
}

/**
 * Fallback visual (print CSS da página). A impressão principal usa iframe
 * em printFichasViaIframe com o layout completo de ingresso.
 */
export default function PrintFichas({
  items,
  tickets: ticketsProp,
  tenantName,
}: PrintFichasProps) {
  const tickets = ticketsProp ?? expandFichaTickets(items);
  if (tickets.length === 0) return null;
  const festival = (tenantName || 'Festival').toUpperCase();

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
          <div className="print-ficha-ticket">
            <div className="print-ficha-edge print-ficha-edge-l" />
            <div className="print-ficha-body">
              <div className="print-ficha-top">
                <span>★★★</span>
                <span className="print-ficha-festival">{festival}</span>
                <span>★★★</span>
              </div>
              <div className="print-ficha-rule" />
              <div className="print-ficha-nome-wrap">
                <div className="print-ficha-nome">
                  {ticket.nome.toUpperCase()}
                </div>
              </div>
              <div className="print-ficha-rule" />
              <div className="print-ficha-bottom">
                <span>✦ FICHA ✦</span>
                <span>VALIDA NO BALCAO</span>
              </div>
            </div>
            <div className="print-ficha-edge print-ficha-edge-r" />
          </div>
        </div>
      ))}
    </div>
  );
}
