/** Link do adm do evento: mesmo site do super admin (/evento). */
export function portalEventUrl(_codigo?: string | null): string {
  return `${window.location.origin}/evento`;
}
