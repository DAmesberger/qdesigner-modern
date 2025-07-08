import { test, expect } from '@playwright/test';

test.describe('Questionnaire Timing Precision', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to test page
    await page.goto('/test-runtime');
  });

  test('measures reaction time with microsecond precision', async ({ page }) => {
    // Start the test
    await page.click('button:has-text("Start Test")');
    
    // Wait for first instruction
    await expect(page.locator('canvas')).toBeVisible();
    
    // Capture performance marks
    const timingData = await page.evaluate(() => {
      // Mark when we're about to press space
      performance.mark('before-keypress');
      return performance.now();
    });
    
    // Press space to continue
    await page.keyboard.press('Space');
    
    // Wait for reaction stimulus
    await page.waitForTimeout(1500); // Wait for fixation + delay
    
    // Measure reaction time
    const reactionStart = await page.evaluate(() => performance.now());
    
    // React to stimulus
    await page.keyboard.press('f');
    
    const reactionEnd = await page.evaluate(() => performance.now());
    
    // Verify timing precision
    const reactionTime = reactionEnd - reactionStart;
    expect(reactionTime).toBeGreaterThan(0);
    expect(reactionTime).toBeLessThan(1000); // Should react within 1 second
    
    // Check that timing has decimal precision (microseconds)
    expect(reactionTime % 1).not.toBe(0);
  });

  test('renders HTML content through WebGL', async ({ page }) => {
    // Check that canvas is used for rendering
    const canvasExists = await page.locator('canvas').isVisible();
    expect(canvasExists).toBe(true);
    
    // Verify WebGL context
    const hasWebGL = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      
      const gl = canvas.getContext('webgl2');
      return gl !== null;
    });
    
    expect(hasWebGL).toBe(true);
  });

  test('preloads all resources before starting', async ({ page }) => {
    // Monitor network requests
    const requests: string[] = [];
    page.on('request', request => {
      if (request.resourceType() === 'image' || 
          request.resourceType() === 'media') {
        requests.push(request.url());
      }
    });
    
    // Start test
    await page.click('button:has-text("Start Test")');
    
    // Wait for loading to complete
    await page.waitForFunction(() => {
      const progressBar = document.querySelector('[style*="width"]');
      return progressBar && progressBar.textContent?.includes('100%');
    });
    
    // Verify resources were loaded during preload phase
    expect(requests.length).toBeGreaterThan(0);
  });

  test('measures frame-accurate video onset', async ({ page }) => {
    // Create a test with video
    await page.evaluate(() => {
      // Inject a video question for testing
      (window as any).testVideoTiming = true;
    });
    
    await page.click('button:has-text("Start Test")');
    
    // Wait for video question
    const videoOnsetTime = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        // Listen for video frame callback
        const checkVideo = () => {
          const video = document.querySelector('video');
          if (video && video.readyState >= 2) {
            resolve(performance.now());
          } else {
            requestAnimationFrame(checkVideo);
          }
        };
        checkVideo();
      });
    });
    
    expect(videoOnsetTime).toBeGreaterThan(0);
  });

  test('handles complex HTML questionnaire content', async ({ page }) => {
    // Test rendering complex HTML through WebGL
    const testHTML = `
      <div class="survey-question">
        <h2>Customer Satisfaction Survey</h2>
        <p>Please rate your experience:</p>
        <div class="rating-scale">
          ${[1,2,3,4,5,6,7,8,9,10].map(n => 
            `<button class="rating-btn">${n}</button>`
          ).join('')}
        </div>
      </div>
    `;
    
    // Inject test question
    await page.evaluate((html) => {
      (window as any).testHTMLContent = html;
    }, testHTML);
    
    await page.click('button:has-text("Start Test")');
    
    // Verify the content is rendered to canvas
    const canvasDataUrl = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      return canvas?.toDataURL()?.length || 0;
    });
    
    // Canvas should have content (not empty)
    expect(canvasDataUrl).toBeGreaterThan(1000);
  });

  test('synchronizes multiple response modalities', async ({ page }) => {
    // Test that keyboard, mouse, and touch all have same timing precision
    await page.click('button:has-text("Start Test")');
    
    // Test keyboard timing
    const keyboardTiming = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const handler = () => {
          resolve(performance.now());
          document.removeEventListener('keydown', handler);
        };
        document.addEventListener('keydown', handler);
      });
    });
    
    await page.keyboard.press('Space');
    
    // Test mouse timing  
    const mouseTiming = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const handler = () => {
          resolve(performance.now());
          document.removeEventListener('click', handler);
        };
        document.addEventListener('click', handler);
      });
    });
    
    await page.mouse.click(400, 300);
    
    // Both should have microsecond precision
    expect(keyboardTiming % 1).not.toBe(0);
    expect(mouseTiming % 1).not.toBe(0);
  });

  test('exports timing data with full precision', async ({ page }) => {
    // Complete a short test
    await page.click('button:has-text("Start Test")');
    await page.keyboard.press('Space');
    await page.waitForTimeout(2000);
    await page.keyboard.press('f');
    
    // Get session data
    const sessionData = await page.evaluate(() => {
      return (window as any).lastSessionData;
    });
    
    expect(sessionData).toBeDefined();
    expect(sessionData.responses).toHaveLength(1);
    
    const response = sessionData.responses[0];
    expect(response.reactionTime).toBeGreaterThan(0);
    expect(response.stimulusOnsetTime).toBeGreaterThan(0);
    
    // Verify microsecond precision in exported data
    expect(response.reactionTime.toString()).toMatch(/\.\d{2,}/);
  });
});

test.describe('Visual Regression Tests', () => {
  test('questionnaire renders consistently', async ({ page }) => {
    await page.goto('/test-runtime');
    await page.click('button:has-text("Start Test")');
    
    // Take screenshot of rendered question
    await page.waitForTimeout(100); // Let WebGL render
    await expect(page.locator('canvas')).toHaveScreenshot('question-render.png');
  });
  
  test('HTML content renders correctly in WebGL', async ({ page }) => {
    await page.goto('/test-runtime');
    
    // Inject HTML question
    await page.evaluate(() => {
      (window as any).testHTMLContent = `
        <div style="padding: 40px; text-align: center;">
          <h1 style="color: #3B82F6;">Test Question</h1>
          <p style="font-size: 18px; margin: 20px 0;">
            This HTML is rendered through WebGL
          </p>
        </div>
      `;
    });
    
    await page.click('button:has-text("Start Test")');
    await page.waitForTimeout(100);
    
    await expect(page.locator('canvas')).toHaveScreenshot('html-in-webgl.png');
  });
});