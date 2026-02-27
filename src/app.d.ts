// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      getSession: () => Promise<{
        user: unknown;
        access_token: string;
      } | null>;
      user?: unknown;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};