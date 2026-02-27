/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_APP_URL: string;
  readonly VITE_TEST_MODE_EMAIL?: string;
  readonly VITE_TEST_MODE_PASSWORD?: string;
  readonly VITE_DEV_QUICK_LOGIN_ENABLED?: string;
  readonly VITE_DEV_LOGIN_ADMIN_EMAIL?: string;
  readonly VITE_DEV_LOGIN_ADMIN_PASSWORD?: string;
  readonly VITE_DEV_LOGIN_EDITOR_EMAIL?: string;
  readonly VITE_DEV_LOGIN_EDITOR_PASSWORD?: string;
  readonly VITE_DEV_LOGIN_VIEWER_EMAIL?: string;
  readonly VITE_DEV_LOGIN_VIEWER_PASSWORD?: string;
  readonly VITE_DEV_LOGIN_PARTICIPANT_EMAIL?: string;
  readonly VITE_DEV_LOGIN_PARTICIPANT_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
