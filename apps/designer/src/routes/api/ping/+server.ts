import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
  return json({
    pong: true,
    timestamp: Date.now()
  });
};