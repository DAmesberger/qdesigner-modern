import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaValidator } from './MediaValidator';
import type { Questionnaire, Question, Stimulus } from '$lib/shared';

// Mock fetch
global.fetch = vi.fn();

describe('MediaValidator', () => {
  let validator: MediaValidator;
  
  beforeEach(() => {
    validator = new MediaValidator();
    vi.clearAllMocks();
  });

  const createTestQuestionnaire = (questions: Question[]): Questionnaire => ({
    id: 'test',
    version: '1.0.0',
    name: 'Test Questionnaire',
    description: '',
    pages: [{
      id: 'page1',
      name: 'Page 1',
      questions: questions.map(q => q.id)
    }],
    questions,
    variables: [],
    flow: [],
    settings: {},
    created: new Date(),
    modified: new Date()
  });

  describe('validateQuestionnaire', () => {
    it('should pass validation when no media is present', async () => {
      const questionnaire = createTestQuestionnaire([{
        id: 'q1',
        type: 'text',
        name: 'Text Question',
        text: 'What is your name?',
        responseType: { type: 'text' }
      }]);

      const result = await validator.validateQuestionnaire(questionnaire);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should fail validation when image URL returns 404', async () => {
      const questionnaire = createTestQuestionnaire([{
        id: 'q1',
        type: 'multimedia',
        name: 'Image Question',
        text: 'Look at this image',
        responseType: { 
          type: 'single',
          options: [
            { id: 'opt1', value: 1, label: 'Option 1' },
            { id: 'opt2', value: 2, label: 'Option 2' }
          ]
        },
        stimulus: {
          type: 'image',
          content: {
            imageUrl: 'https://example.com/missing.jpg'
          }
        }
      }]);

      // Mock fetch to return 404
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers()
      } as Response);

      const result = await validator.validateQuestionnaire(questionnaire);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: 'inaccessible',
        mediaType: 'image',
        url: 'https://example.com/missing.jpg',
        questionId: 'q1'
      });
    });

    it('should fail validation when network error occurs', async () => {
      const questionnaire = createTestQuestionnaire([{
        id: 'q1',
        type: 'multimedia',
        name: 'Video Question',
        text: 'Watch this video',
        responseType: { 
          type: 'single',
          options: [
            { id: 'opt1', value: 1, label: 'Option 1' },
            { id: 'opt2', value: 2, label: 'Option 2' }
          ]
        },
        stimulus: {
          type: 'video',
          content: {
            videoUrl: 'https://example.com/video.mp4'
          }
        }
      }]);

      // Mock fetch to throw network error
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await validator.validateQuestionnaire(questionnaire);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: 'inaccessible',
        mediaType: 'video',
        message: 'Network error'
      });
    });

    it('should warn about CORS issues', async () => {
      const questionnaire = createTestQuestionnaire([{
        id: 'q1',
        type: 'multimedia',
        name: 'Audio Question',
        text: 'Listen to this',
        responseType: { 
          type: 'single',
          options: [
            { id: 'opt1', value: 1, label: 'Option 1' },
            { id: 'opt2', value: 2, label: 'Option 2' }
          ]
        },
        stimulus: {
          type: 'audio',
          content: {
            audioUrl: 'https://example.com/audio.mp3'
          }
        }
      }]);

      // Mock fetch to return success but no CORS headers
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'audio/mpeg'
        })
      } as Response);

      const result = await validator.validateQuestionnaire(questionnaire);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        type: 'cors',
        mediaType: 'audio'
      });
    });

    it('should warn about large file sizes', async () => {
      const questionnaire = createTestQuestionnaire([{
        id: 'q1',
        type: 'multimedia',
        name: 'Large Video',
        text: 'Watch this',
        responseType: { 
          type: 'single',
          options: [
            { id: 'opt1', value: 1, label: 'Option 1' },
            { id: 'opt2', value: 2, label: 'Option 2' }
          ]
        },
        stimulus: {
          type: 'video',
          content: {
            videoUrl: 'https://example.com/large-video.mp4'
          }
        }
      }]);

      // Mock fetch to return large content length
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'video/mp4',
          'Content-Length': (100 * 1024 * 1024).toString(), // 100MB
          'Access-Control-Allow-Origin': '*'
        })
      } as Response);

      const result = await validator.validateQuestionnaire(questionnaire);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        type: 'size',
        mediaType: 'video',
        message: expect.stringContaining('100.0MB')
      });
    });

    it('should validate composite stimuli', async () => {
      const questionnaire = createTestQuestionnaire([{
        id: 'q1',
        type: 'multimedia',
        name: 'Composite Question',
        text: 'Multiple media',
        responseType: { 
          type: 'single',
          options: [
            { id: 'opt1', value: 1, label: 'Option 1' },
            { id: 'opt2', value: 2, label: 'Option 2' }
          ]
        },
        stimulus: {
          type: 'composite',
          content: {
            components: [
              {
                type: 'image',
                content: {
                  imageUrl: 'https://example.com/image1.jpg'
                }
              },
              {
                type: 'video',
                content: {
                  videoUrl: 'https://example.com/video1.mp4'
                }
              }
            ]
          }
        }
      }]);

      // Mock successful responses for both media
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            'Content-Type': 'image/jpeg',
            'Access-Control-Allow-Origin': '*'
          })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            'Content-Type': 'video/mp4',
            'Access-Control-Allow-Origin': '*'
          })
        } as Response);

      const result = await validator.validateQuestionnaire(questionnaire);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should check media URLs only once', async () => {
      const questionnaire = createTestQuestionnaire([
        {
          id: 'q1',
          type: 'multimedia',
          name: 'Image 1',
          text: 'Same image',
          responseType: { 
            type: 'single',
            options: [
              { id: 'opt1', value: 1, label: 'Option 1' },
              { id: 'opt2', value: 2, label: 'Option 2' }
            ]
          },
          stimulus: {
            type: 'image',
            content: {
              imageUrl: 'https://example.com/same.jpg'
            }
          }
        },
        {
          id: 'q2',
          type: 'multimedia',
          name: 'Image 2',
          text: 'Same image again',
          responseType: { 
            type: 'single',
            options: [
              { id: 'opt1', value: 1, label: 'Option 1' },
              { id: 'opt2', value: 2, label: 'Option 2' }
            ]
          },
          stimulus: {
            type: 'image',
            content: {
              imageUrl: 'https://example.com/same.jpg'
            }
          }
        }
      ]);

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'image/jpeg',
          'Access-Control-Allow-Origin': '*'
        })
      } as Response);

      await validator.validateQuestionnaire(questionnaire);
      
      // Should only fetch once for the same URL
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatErrors', () => {
    it('should format validation errors clearly', () => {
      const result = {
        valid: false,
        errors: [
          {
            type: 'inaccessible' as const,
            mediaType: 'image' as const,
            url: 'https://example.com/missing1.jpg',
            questionId: 'q1',
            message: 'image resource returned 404 Not Found'
          },
          {
            type: 'inaccessible' as const,
            mediaType: 'video' as const,
            url: 'https://example.com/missing2.mp4',
            questionId: 'q1',
            message: 'video resource returned 404 Not Found'
          },
          {
            type: 'format' as const,
            mediaType: 'image' as const,
            url: 'https://example.com/wrong.txt',
            questionId: 'q2',
            message: 'Invalid content type: text/plain'
          }
        ],
        warnings: []
      };

      const formatted = MediaValidator.formatErrors(result);
      
      expect(formatted).toContain('Media validation failed:');
      expect(formatted).toContain('Question "q1":');
      expect(formatted).toContain('Question "q2":');
      expect(formatted).toContain('404 Not Found');
      expect(formatted).toContain('Invalid content type');
    });

    it('should return empty string for valid results', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: []
      };

      const formatted = MediaValidator.formatErrors(result);
      
      expect(formatted).toBe('');
    });
  });
});