/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the hosted runtime. Not a secret. Defaults to the SDK's local development address. */
  readonly VITE_AOC_RUNTIME_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
