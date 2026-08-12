export type PrintMode = 'fichas' | 'receipt';

/** Dispara impressão com o modo correto (fichas ou comprovante). */
export function printWithMode(mode: PrintMode): void {
  const body = document.body;
  body.classList.remove('print-mode-fichas', 'print-mode-receipt');
  body.classList.add(mode === 'fichas' ? 'print-mode-fichas' : 'print-mode-receipt');

  const cleanup = () => {
    body.classList.remove('print-mode-fichas', 'print-mode-receipt');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // Garante que o CSS de modo aplique antes do diálogo de impressão.
  window.setTimeout(() => {
    window.print();
    // Fallback se afterprint não disparar (alguns WebViews).
    window.setTimeout(cleanup, 1500);
  }, 50);
}
