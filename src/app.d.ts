// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      getSession: () => Promise<{
        user: any;
        access_token: string;
      } | null>;
      user?: any;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};