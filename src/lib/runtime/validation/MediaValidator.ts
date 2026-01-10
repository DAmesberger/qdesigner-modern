import type { Questionnaire, Question, StimulusConfig as Stimulus } from '$lib/shared';

export interface MediaValidationResult {
  valid: boolean;
  errors: MediaValidationError[];
  warnings: MediaValidationWarning[];
}

export interface MediaValidationError {
  type: 'missing' | 'invalid' | 'inaccessible' | 'format';
  mediaType: 'image' | 'video' | 'audio';
  url: string;
  questionId?: string;
  message: string;
}

export interface MediaValidationWarning {
  type: 'cors' | 'size' | 'format';
  mediaType: 'image' | 'video' | 'audio';
  url: string;
  questionId?: string;
  message: string;
}

export class MediaValidator {
  private errors: MediaValidationError[] = [];
  private warnings: MediaValidationWarning[] = [];
  private checkedUrls = new Set<string>();

  /**
   * Validate all media in a questionnaire
   */
  public async validateQuestionnaire(questionnaire: Questionnaire): Promise<MediaValidationResult> {
    this.errors = [];
    this.warnings = [];
    this.checkedUrls.clear();

    // Validate all questions
    for (const question of questionnaire.questions) {
      await this.validateQuestion(question);
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  /**
   * Validate media in a single question
   */
  private async validateQuestion(question: Question): Promise<void> {
    // Validate stimulus media
    if (question.stimulus) {
      await this.validateStimulus(question.stimulus, question.id);
    }

    // Validate response option images
    if (question.responseOptions) {
      for (const option of question.responseOptions) {
        if (option.label && this.isMediaUrl(option.label)) {
          await this.validateMediaUrl(option.label, 'image', question.id);
        }
      }
    }
  }

  /**
   * Validate stimulus media
   */
  private async validateStimulus(stimulus: Stimulus, questionId: string): Promise<void> {
    const content = stimulus.content as any;
    
    if (typeof content === 'string') return;

    if (content.imageUrl) {
      await this.validateMediaUrl(content.imageUrl, 'image', questionId);
    }

    if (content.videoUrl) {
      await this.validateMediaUrl(content.videoUrl, 'video', questionId);
    }

    if (content.audioUrl) {
      await this.validateMediaUrl(content.audioUrl, 'audio', questionId);
    }

    // Validate composite stimuli
    if (content.components) {
      for (const component of content.components) {
        await this.validateStimulus(component, questionId);
      }
    }
  }

  /**
   * Check if a string is a media URL
   */
  private isMediaUrl(str: string): boolean {
    return str.includes('http') || 
           str.includes('.png') || 
           str.includes('.jpg') || 
           str.includes('.jpeg') || 
           str.includes('.gif') || 
           str.includes('.webp') ||
           str.includes('.mp4') ||
           str.includes('.webm') ||
           str.includes('.mp3') ||
           str.includes('.wav');
  }

  /**
   * Validate a single media URL
   */
  private async validateMediaUrl(
    url: string, 
    mediaType: 'image' | 'video' | 'audio',
    questionId?: string
  ): Promise<void> {
    // Skip if already checked
    if (this.checkedUrls.has(url)) return;
    this.checkedUrls.add(url);

    try {
      // First, try a HEAD request to check if resource exists
      const response = await fetch(url, { 
        method: 'HEAD',
        mode: 'cors',
        credentials: 'omit'
      });

      if (!response.ok) {
        this.errors.push({
          type: 'inaccessible',
          mediaType,
          url,
          questionId,
          message: `${mediaType} resource returned ${response.status} ${response.statusText}`
        });
        return;
      }

      // Check CORS headers
      const corsHeader = response.headers.get('Access-Control-Allow-Origin');
      if (!corsHeader || (corsHeader !== '*' && !corsHeader.includes(window.location.origin))) {
        this.warnings.push({
          type: 'cors',
          mediaType,
          url,
          questionId,
          message: `${mediaType} may have CORS restrictions`
        });
      }

      // Check content type
      const contentType = response.headers.get('Content-Type');
      if (contentType && !this.isValidContentType(contentType, mediaType)) {
        this.errors.push({
          type: 'format',
          mediaType,
          url,
          questionId,
          message: `Invalid content type: ${contentType}`
        });
      }

      // Check file size
      const contentLength = response.headers.get('Content-Length');
      if (contentLength) {
        const sizeMB = parseInt(contentLength) / (1024 * 1024);
        if (sizeMB > 50) {
          this.warnings.push({
            type: 'size',
            mediaType,
            url,
            questionId,
            message: `Large file size: ${sizeMB.toFixed(1)}MB`
          });
        }
      }

    } catch (error) {
      // Network error or CORS failure
      this.errors.push({
        type: 'inaccessible',
        mediaType,
        url,
        questionId,
        message: error instanceof Error ? error.message : 'Failed to access resource'
      });
    }
  }

  /**
   * Check if content type matches expected media type
   */
  private isValidContentType(contentType: string, mediaType: 'image' | 'video' | 'audio'): boolean {
    const lowerType = contentType.toLowerCase();
    
    switch (mediaType) {
      case 'image':
        return lowerType.includes('image/');
      case 'video':
        return lowerType.includes('video/');
      case 'audio':
        return lowerType.includes('audio/');
      default:
        return false;
    }
  }

  /**
   * Format validation results as error message
   */
  public static formatErrors(result: MediaValidationResult): string {
    if (result.valid) return '';

    const errorLines: string[] = ['Media validation failed:'];
    
    // Group errors by question
    const errorsByQuestion = new Map<string | undefined, MediaValidationError[]>();
    for (const error of result.errors) {
      const key = error.questionId || 'global';
      if (!errorsByQuestion.has(key)) {
        errorsByQuestion.set(key, []);
      }
      errorsByQuestion.get(key)!.push(error);
    }

    // Format errors
    for (const [questionId, errors] of errorsByQuestion) {
      if (questionId !== 'global') {
        errorLines.push(`\nQuestion "${questionId}":`);
      }
      for (const error of errors) {
        errorLines.push(`  - ${error.message} (${error.url})`);
      }
    }

    return errorLines.join('\n');
  }
}