import { beforeAll, describe, expect, it } from 'vitest';
import {
  getModuleDefinition,
  getPortableModuleTypes,
  type QuestionType,
} from '@qdesigner/questionnaire-core';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import { moduleRegistry } from '$lib/modules/registry';
import { QuestionFactory } from './question-factory';

beforeAll(async () => {
  await ensureModulesRegistered();
});

describe('registered form catalogue authoring', () => {
  for (const type of getPortableModuleTypes()) {
    it(`creates ${type} with its declared configuration at the runtime field paths`, () => {
      const definition = getModuleDefinition(type);
      const registered = moduleRegistry.get(type);
      expect(registered?.defaultConfig).toEqual(definition.defaultConfig);
      expect(registered?.components.runtime).toBeTypeOf('function');
      expect(registered?.components.designer).toBeTypeOf('function');
      const question = QuestionFactory.create(type as QuestionType);
      const envelopeKeys = new Set([
        'display',
        'response',
        'navigation',
        'config',
        'dataSource',
        'visualization',
        'autoAdvance',
        'displayDuration',
      ]);
      const expected: Record<string, unknown> = { type };
      const flatConfig: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(definition.defaultConfig ?? {})) {
        if (envelopeKeys.has(key) && !(key === 'autoAdvance' && typeof value === 'object'))
          expected[key] = value;
        else flatConfig[key] = value;
      }
      if (Object.keys(flatConfig).length) expected.config = flatConfig;
      expect(question).toMatchObject(expected);
      expect(question.id).toBeTruthy();
    });
  }
});
