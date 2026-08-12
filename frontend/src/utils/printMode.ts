export type PrintMode = 'fichas' | 'receipt';

/** Impressão do comprovante na página atual (mantém CSS .print-receipt). */
export function printWithMode(mode: PrintMode): void {
  const body = document.body;
  const className =
    mode === 'fichas' ? 'print-mode-fichas' : 'print-mode-receipt';
  body.classList.remove('print-mode-fichas', 'print-mode-receipt');
  body.classList.add(className);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    body.classList.remove('print-mode-fichas', 'print-mode-receipt');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // NÃO remover a classe em 1.5s — isso apagava a impressão com o diálogo aberto.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
      // Fallback longo só se afterprint nunca vier (alguns WebViews).
      window.setTimeout(cleanup, 60_000);
    });
  });
}
