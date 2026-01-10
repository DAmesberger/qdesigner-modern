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
  const rt = responseType as any;
  switch (responseType.type) {
    case 'scale':
      return {
        min: rt.min,
        max: rt.max,
        step: rt.step,
        labels: rt.labels,
        minLabel: rt.minLabel,
        maxLabel: rt.maxLabel,
        required: rt.required,
        timeout: rt.timeout
      };
    case 'single':
    case 'multiple':
      return {
        options: rt.options,
        required: rt.required,
        timeout: rt.timeout,
        ...(responseType.type === 'multiple' ? {
          minChoices: rt.minChoices,
          maxChoices: rt.maxChoices
        } : {})
      };
    case 'text':
      return {
        minLength: rt.minLength,
        maxLength: rt.maxLength,
        pattern: rt.pattern,
        required: rt.required,
        timeout: rt.timeout
      };
    case 'number':
      return {
        min: rt.min,
        max: rt.max,
        step: rt.step,
        required: rt.required,
        timeout: rt.timeout
      };
    case 'keypress':
      return {
        keys: rt.keys,
        recordAllKeys: rt.recordAllKeys,
        required: rt.required,
        timeout: rt.timeout
      };
    case 'click':
      return {
        allowedTargets: rt.allowedTargets,
        required: rt.required,
        timeout: rt.timeout
      };
    case 'none':
      return {
        autoAdvance: rt.autoAdvance,
        delay: rt.delay
      };
    case 'webgl':
      return {
        validKeys: rt.validKeys,
        validTargets: rt.validTargets,
        recordAllResponses: rt.recordAllResponses,
        required: rt.required,
        timeout: rt.timeout
      };
    case 'custom':
      return {
        customType: rt.customType,
        config: rt.config,
        required: rt.required,
        timeout: rt.timeout
      };
    default:
      return {};
  }
}