/// <reference types="vite/client" />

declare namespace JSX {
  type Element = import('react').JSX.Element;
  interface IntrinsicElements extends import('react').JSX.IntrinsicElements {}
}

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  electron?: {
    platform: string;
    openExternalUrl?: (url: string) => Promise<void>;
  };
}
