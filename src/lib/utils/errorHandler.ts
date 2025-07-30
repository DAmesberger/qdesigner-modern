import { toast } from '$lib/stores/toast';

export interface APIError {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
  status?: number;
}

export function handleAPIError(error: any): APIError {
  console.error('API Error:', error);
  
  // Handle Supabase/PostgREST specific errors
  if (error?.code) {
    switch (error.code) {
      case 'PGRST200':
      case 'PGRST201':
      case 'PGRST204':
        return {
          code: error.code,
          message: 'Database relationship error',
          details: error.details || 'Failed to load related data',
          hint: error.hint || 'Please check your data relationships',
          status: 400
        };
        
      case '23505':
        return {
          code: error.code,
          message: 'Duplicate entry',
          details: 'This item already exists',
          status: 409
        };
        
      case '23503':
        return {
          code: error.code,
          message: 'Reference error',
          details: 'Cannot perform this action due to existing references',
          status: 400
        };
        
      case '42501':
        return {
          code: error.code,
          message: 'Permission denied',
          details: 'You do not have permission to perform this action',
          status: 403
        };
        
      case 'PGRST301':
        return {
          code: error.code,
          message: 'Authentication required',
          details: 'Please log in to continue',
          status: 401
        };
        
      default:
        return {
          code: error.code,
          message: error.message || 'An unexpected error occurred',
          details: error.details,
          hint: error.hint,
          status: error.status || 500
        };
    }
  }
  
  // Handle network errors
  if (error?.name === 'NetworkError' || !navigator.onLine) {
    return {
      message: 'Network error',
      details: 'Please check your internet connection',
      status: 0
    };
  }
  
  // Handle generic errors
  if (error?.message) {
    return {
      message: 'Error',
      details: error.message,
      status: error.status || 500
    };
  }
  
  // Fallback error
  return {
    message: 'An unexpected error occurred',
    details: 'Please try again later',
    status: 500
  };
}

export function showErrorToast(error: any) {
  const apiError = handleAPIError(error);
  toast.error(apiError.details || apiError.message);
}

export function showSuccessToast(message: string) {
  toast.success(message);
}

export function showInfoToast(message: string) {
  toast.info(message);
}

export class UserFriendlyError extends Error {
  public code?: string;
  public details?: string;
  public hint?: string;
  public status?: number;
  
  constructor(error: APIError) {
    super(error.message);
    this.name = 'UserFriendlyError';
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;
    this.status = error.status;
  }
}