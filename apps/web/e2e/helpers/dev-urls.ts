import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.development', override: false, quiet: true });

const appHost = process.env.APP_HOST || 'localhost';
const appPort = Number(process.env.APP_PORT || '4173');
const serverPort = Number(process.env.SERVER_PORT || '4100');

const frontend = process.env.VITE_APP_URL || `http://${appHost}:${appPort}`;
const backend = process.env.VITE_API_URL || `http://localhost:${serverPort}`;
const wsBackend = process.env.VITE_WS_URL || `ws://localhost:${serverPort}/api/ws`;

export const DEV_URLS = {
  appHost,
  appPort,
  serverPort,
  frontend,
  backend,
  wsBackend,
} as const;
