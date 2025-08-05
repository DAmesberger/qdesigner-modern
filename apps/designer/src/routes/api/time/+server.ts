import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
  // Return current server time with microsecond precision
  const timestamp = Date.now() + (performance.now() % 1);
  
  return json({
    timestamp,
    iso: new Date().toISOString(),
    precision: 'microsecond'
  });
};