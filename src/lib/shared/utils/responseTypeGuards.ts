import type { ResponseType } from '../types/questionnaire';

// Type guard functions for ResponseType union
export function isScaleResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'scale' }> {
  return responseType.type === 'scale';
}

export function isSingleChoiceResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'single' }> {
  return responseType.type === 'single';
}

export function isMultipleChoiceResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'multiple' }> {
  return responseType.type === 'multiple';
}

export function isTextResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'text' }> {
  return responseType.type === 'text';
}

export function isNumberResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'number' }> {
  return responseType.type === 'number';
}

export function isKeypressResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'keypress' }> {
  return responseType.type === 'keypress';
}

export function isClickResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'click' }> {
  return responseType.type === 'click';
}

export function isNoneResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'none' }> {
  return responseType.type === 'none';
}

export function isWebGLResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'webgl' }> {
  return responseType.type === 'webgl';
}

export function isCustomResponse(responseType: ResponseType): responseType is Extract<ResponseType, { type: 'custom' }> {
  return responseType.type === 'custom';
}

// Helper to safely access response type properties
export function getResponseTypeProperties(responseType: ResponseType) {
  switch (responseType.type) {
    case 'scale':
      return {
        min: responseType.min,
        max: responseType.max,
        step: responseType.step,
        labels: responseType.labels,
        minLabel: responseType.minLabel,
        maxLabel: responseType.maxLabel,
        required: responseType.required,
        timeout: responseType.timeout
      };
    case 'single':
    case 'multiple':
      return {
        options: responseType.options,
        required: responseType.required,
        timeout: responseType.timeout,
        ...(responseType.type === 'multiple' ? {
          minChoices: responseType.minChoices,
          maxChoices: responseType.maxChoices
        } : {})
      };
    case 'text':
      return {
        minLength: responseType.minLength,
        maxLength: responseType.maxLength,
        pattern: responseType.pattern,
        required: responseType.required,
        timeout: responseType.timeout
      };
    case 'number':
      return {
        min: responseType.min,
        max: responseType.max,
        step: responseType.step,
        required: responseType.required,
        timeout: responseType.timeout
      };
    case 'keypress':
      return {
        keys: responseType.keys,
        recordAllKeys: responseType.recordAllKeys,
        required: responseType.required,
        timeout: responseType.timeout
      };
    case 'click':
      return {
        allowedTargets: responseType.allowedTargets,
        required: responseType.required,
        timeout: responseType.timeout
      };
    case 'none':
      return {
        autoAdvance: responseType.autoAdvance,
        delay: responseType.delay
      };
    case 'webgl':
      return {
        validKeys: responseType.validKeys,
        validTargets: responseType.validTargets,
        recordAllResponses: responseType.recordAllResponses,
        required: responseType.required,
        timeout: responseType.timeout
      };
    case 'custom':
      return {
        customType: responseType.customType,
        config: responseType.config,
        required: responseType.required,
        timeout: responseType.timeout
      };
    default:
      return {};
  }
}