import { writable, derived } from 'svelte/store';
import { nanoid } from 'nanoid';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastState {
  toasts: Toast[];
}

const DEFAULT_DURATION = 5000;

function createToastStore() {
  const { subscribe, update } = writable<ToastState>({ toasts: [] });

  let timeouts = new Map<string, NodeJS.Timeout>();

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = nanoid();
    const newToast: Toast = {
      id,
      dismissible: true,
      duration: DEFAULT_DURATION,
      ...toast
    };

    update(state => ({
      toasts: [...state.toasts, newToast]
    }));

    // Auto-dismiss if duration is set
    if (newToast.duration && newToast.duration > 0) {
      const timeout = setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
      timeouts.set(id, timeout);
    }

    return id;
  };

  const removeToast = (id: string) => {
    // Clear timeout if exists
    const timeout = timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeouts.delete(id);
    }

    update(state => ({
      toasts: state.toasts.filter(t => t.id !== id)
    }));
  };

  const clearAll = () => {
    // Clear all timeouts
    timeouts.forEach(timeout => clearTimeout(timeout));
    timeouts.clear();

    update(() => ({ toasts: [] }));
  };

  return {
    subscribe,
    
    // Convenience methods
    success: (title: string, options?: Partial<Toast>) => 
      addToast({ type: 'success', title, ...options }),
    
    error: (title: string, options?: Partial<Toast>) => 
      addToast({ type: 'error', title, duration: 0, ...options }), // Errors don't auto-dismiss by default
    
    info: (title: string, options?: Partial<Toast>) => 
      addToast({ type: 'info', title, ...options }),
    
    warning: (title: string, options?: Partial<Toast>) => 
      addToast({ type: 'warning', title, ...options }),

    // Generic add method
    add: addToast,
    
    // Remove methods
    remove: removeToast,
    clearAll,
    
    // Promise-based toast
    promise: async <T>(
      promise: Promise<T>,
      options: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((error: any) => string);
      }
    ): Promise<T> => {
      const id = addToast({ 
        type: 'info', 
        title: options.loading, 
        duration: 0,
        dismissible: false 
      });

      try {
        const result = await promise;
        removeToast(id);
        addToast({
          type: 'success',
          title: typeof options.success === 'function' 
            ? options.success(result) 
            : options.success
        });
        return result;
      } catch (error) {
        removeToast(id);
        addToast({
          type: 'error',
          title: typeof options.error === 'function' 
            ? options.error(error) 
            : options.error,
          duration: 0
        });
        throw error;
      }
    }
  };
}

export const toast = createToastStore();

// Derived store for current toasts (for easier access in components)
export const toasts = derived(toast, $toast => $toast.toasts);