// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface Error {
      message: string;
      // Fillout availability screens (R1-3): a machine-readable marker so
      // +error.svelte can distinguish a not-yet-open study from a plain 403,
      // plus the ISO open date to show participants when it becomes available.
      code?: 'not_yet_open';
      openDate?: string;
    }
    interface Locals {
      getSession: () => Promise<{
        user: unknown;
      } | null>;
      user?: unknown;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
