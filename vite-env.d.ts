/// <reference types="vite/client" />

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
