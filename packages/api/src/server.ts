import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config';
import { logger } from './utils/logger';

const app = Fastify({
  logger: logger,
  trustProxy: true,
});

// Register plugins
await app.register(cors, {
  origin: config.CORS_ORIGIN,
  credentials: true,
});

await app.register(helmet, {
  contentSecurityPolicy: false, // Will configure this properly later
});

await app.register(jwt, {
  secret: config.JWT_SECRET,
  sign: {
    expiresIn: config.JWT_EXPIRES_IN,
  },
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await app.register(websocket);

// Health check
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
try {
  await app.listen({ 
    port: config.PORT, 
    host: config.HOST 
  });
  logger.info(`Server listening on ${config.HOST}:${config.PORT}`);
} catch (err) {
  logger.error(err);
  process.exit(1);
}