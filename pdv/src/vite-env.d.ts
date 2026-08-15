/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    pdvDesktop?: {
      listPrinters: () => Promise<
        Array<{ name: string; displayName: string; isDefault: boolean }>
      >;
      printFichasSilent: (
        pages: Array<string | { dataUrl: string; heightMm: number }>,
        deviceName?: string
      ) => Promise<{ ok: boolean; count?: number; error?: string }>;
      focusMainWindow?: () => Promise<boolean>;
      minimizeMainWindow?: () => Promise<boolean>;
      setFullscreen?: (on: boolean) => Promise<boolean>;
      toggleFullscreen?: () => Promise<boolean>;
      isFullscreen?: () => Promise<boolean>;
    };
  }
}
