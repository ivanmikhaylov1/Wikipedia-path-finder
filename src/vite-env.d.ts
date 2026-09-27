/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LINK_SOURCE?: 'api' | 'local';
  readonly VITE_GITHUB_URL?: string;
}
