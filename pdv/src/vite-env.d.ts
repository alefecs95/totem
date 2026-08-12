/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    pdvDesktop?: {
      listPrinters: () => Promise<
        Array<{ name: string; displayName: string; isDefault: boolean }>
      >;
      printFichasSilent: (
        pages: string[],
        deviceName?: string
      ) => Promise<{ ok: boolean; count?: number; error?: string }>;
    };
  }
}
