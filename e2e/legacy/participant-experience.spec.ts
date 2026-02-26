import { test, expect, devices } from '@playwright/test';

test.describe('Participant Experience Journey', () => {
  const studyUrl = 'https://qdesigner.app/study/cognitive-load-2024';
  const participantId = 'P' + Date.now();
  
  test('complete study on desktop with optimal experience', async ({ page }) => {
    // Step 1: Receive and click study invitation
    await page.goto(studyUrl + '?pid=' + participantId);
    
    // Verify study landing page
    await expect(page.locator('[data-testid="study-title"]')).toContainText('Cognitive Load Study');
    await expect(page.locator('[data-testid="estimated-time"]')).toContainText('25 minutes');
    await expect(page.locator('[data-testid="researcher-info"]')).toContainText('Dr. Lisa Chang');
    await expect(page.locator('[data-testid="institution"]')).toContainText('Advanced Research Institute');
    
    // Check browser compatibility
    await expect(page.locator('[data-testid="compatibility-check"]')).toBeVisible();
    await expect(page.locator('[data-testid="browser-compatible"]')).toHaveClass(/success/);
    await expect(page.locator('[data-testid="webgl-compatible"]')).toHaveClass(/success/);
    
    // Step 2: Review and accept consent
    await page.click('[data-testid="begin-study"]');
    await page.waitForSelector('[data-testid="consent-form"]');
    
    // Read consent form
    await expect(page.locator('[data-testid="consent-title"]')).toContainText('Informed Consent');
    await expect(page.locator('[data-testid="irb-approval"]')).toContainText('IRB-2024-001');
    
    // Scroll through consent
    const consentContent = page.locator('[data-testid="consent-content"]');
    await consentContent.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const element = document.querySelector('[data-testid="consent-content"]');
      if (element) element.scrollTop = element.scrollHeight;
    });
    
    // Accept consent
    await page.check('[data-testid="consent-understand"]');
    await page.check('[data-testid="consent-voluntary"]');
    await page.check('[data-testid="consent-age-18"]');
    await page.fill('[data-testid="consent-signature"]', 'John Doe');
    await page.click('[data-testid="consent-agree"]');
    
    // Step 3: Clear onboarding and instructions
    await page.waitForSelector('[data-testid="study-instructions"]');
    
    // Verify instructions are clear
    await expect(page.locator('[data-testid="instruction-step-1"]')).toContainText('quiet environment');
    await expect(page.locator('[data-testid="instruction-step-2"]')).toContainText('25 minutes');
    await expect(page.locator('[data-testid="instruction-step-3"]')).toContainText('Press specific keys');
    
    // Check audio/video if required
    await page.click('[data-testid="test-audio"]');
    await expect(page.locator('[data-testid="audio-working"]')).toBeVisible();
    
    await page.click('[data-testid="continue-to-study"]');
    
    // Step 4: Complete demographic questions
    await page.waitForSelector('[data-testid="demographics-section"]');
    
    // Fill demographic info
    await page.fill('[data-testid="age"]', '28');
    await page.selectOption('[data-testid="gender"]', 'male');
    await page.selectOption('[data-testid="education"]', 'bachelors');
    await page.selectOption('[data-testid="handedness"]', 'right');
    
    // Vision question
    await page.click('[data-testid="vision-corrected"]');
    
    await page.click('[data-testid="continue"]');
    
    // Step 5: Practice trials with feedback
    await page.waitForSelector('[data-testid="practice-section"]');
    await expect(page.locator('[data-testid="practice-header"]')).toContainText('Practice Trials');
    
    // Complete practice trials
    for (let i = 0; i < 5; i++) {
      // Wait for fixation
      await page.waitForSelector('[data-testid="fixation-cross"]');
      
      // Wait for stimulus
      await page.waitForSelector('[data-testid="stimulus-word"]');
      const word = await page.locator('[data-testid="stimulus-word"]').textContent();
      const color = await page.locator('[data-testid="stimulus-word"]').evaluate(el => 
        window.getComputedStyle(el).color
      );
      
      // Respond based on color
      if (color.includes('255, 0, 0')) {
        await page.keyboard.press('f'); // Red
      } else if (color.includes('0, 255, 0')) {
        await page.keyboard.press('j'); // Green  
      }
      
      // Check feedback
      await page.waitForSelector('[data-testid="trial-feedback"]');
      const feedback = await page.locator('[data-testid="feedback-text"]').textContent();
      
      if (feedback?.includes('Correct')) {
        await expect(page.locator('[data-testid="reaction-time"]')).toBeVisible();
      }
      
      await page.waitForTimeout(1000); // ITI
    }
    
    // Practice complete message
    await expect(page.locator('[data-testid="practice-complete"]')).toContainText('Great job!');
    await page.click('[data-testid="start-main-task"]');
    
    // Step 6: Main experimental task
    await page.waitForSelector('[data-testid="main-task"]');
    
    // Progress indicator
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="trial-counter"]')).toContainText('1 / 60');
    
    // Complete several trials (abbreviated for test)
    for (let i = 0; i < 10; i++) {
      await page.waitForSelector('[data-testid="fixation-cross"]');
      await page.waitForSelector('[data-testid="stimulus-word"]');
      
      // Simulate realistic response times
      await page.waitForTimeout(300 + Math.random() * 400);
      
      // Make response
      const keys = ['f', 'j', 'k', 'l'];
      await page.keyboard.press(keys[Math.floor(Math.random() * keys.length)]);
      
      // Check progress update
      await expect(page.locator('[data-testid="trial-counter"]')).toContainText(`${i + 2} / 60`);
    }
    
    // Simulate task completion (skip remaining trials for test)
    await page.evaluate(() => {
      (window as any).__skipToEnd = true;
    });
    
    // Step 7: Break between tasks
    await page.waitForSelector('[data-testid="task-break"]');
    await expect(page.locator('[data-testid="break-message"]')).toContainText('Take a short break');
    await expect(page.locator('[data-testid="next-task-info"]')).toContainText('Working Memory Task');
    
    // Optional break timer
    await expect(page.locator('[data-testid="break-timer"]')).toBeVisible();
    
    // Continue when ready
    await page.click('[data-testid="continue-when-ready"]');
    
    // Step 8: Second task (Working Memory)
    await page.waitForSelector('[data-testid="working-memory-task"]');
    
    // Task instructions
    await expect(page.locator('[data-testid="nback-instructions"]')).toContainText('2-back task');
    await page.click('[data-testid="understood"]');
    
    // Complete a few n-back trials
    const stimuliHistory: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForSelector('[data-testid="nback-stimulus"]');
      const stimulus = await page.locator('[data-testid="nback-letter"]').textContent();
      stimuliHistory.push(stimulus!);
      
      if (i >= 2 && stimuliHistory[i] === stimuliHistory[i - 2]) {
        await page.keyboard.press('Space'); // Match
      }
      
      await page.waitForTimeout(2500); // Stimulus + ISI
    }
    
    // Step 9: Post-task questions
    await page.waitForSelector('[data-testid="post-task-questions"]');
    
    // Effort rating
    await page.click('[data-testid="effort-rating-7"]'); // 1-10 scale
    
    // Strategy question
    await page.fill('[data-testid="strategy-used"]', 'I focused on the color and ignored the word meaning');
    
    // Difficulty rating
    await page.click('[data-testid="difficulty-moderate"]');
    
    // Technical issues
    await page.click('[data-testid="no-technical-issues"]');
    
    await page.click('[data-testid="submit-feedback"]');
    
    // Step 10: Study completion
    await page.waitForSelector('[data-testid="study-complete"]');
    
    // Verify completion message
    await expect(page.locator('[data-testid="thank-you"]')).toContainText('Thank you for participating');
    await expect(page.locator('[data-testid="completion-code"]')).toBeVisible();
    
    // Get completion code
    const completionCode = await page.locator('[data-testid="completion-code"]').textContent();
    expect(completionCode).toMatch(/^[A-Z0-9]{8}$/);
    
    // Verify data saved indicator
    await expect(page.locator('[data-testid="data-saved"]')).toContainText('Your responses have been saved');
    
    // Optional results preview
    await page.click('[data-testid="view-results-preview"]');
    await expect(page.locator('[data-testid="avg-reaction-time"]')).toBeVisible();
    await expect(page.locator('[data-testid="accuracy-rate"]')).toBeVisible();
    
    // Download participation certificate
    await page.click('[data-testid="download-certificate"]');
    const download = await page.waitForEvent('download');
    expect(download.suggestedFilename()).toContain('participation-certificate');
  });
  
  test('complete study on mobile device', async ({ browser }) => {
    // Create mobile context
    const iPhone = devices['iPhone 13'];
    const context = await browser.newContext({
      ...iPhone,
      permissions: ['geolocation'],
      geolocation: { latitude: 40.7128, longitude: -74.0060 }
    });
    const page = await context.newPage();
    
    // Navigate to study
    await page.goto(studyUrl + '?pid=mobile-' + participantId);
    
    // Mobile-optimized landing
    await expect(page.locator('[data-testid="mobile-optimized"]')).toBeVisible();
    await expect(page.locator('[data-testid="rotate-device-warning"]')).not.toBeVisible();
    
    // Swipe through instructions
    await page.locator('[data-testid="instruction-carousel"]').swipe({ direction: 'left' });
    await page.waitForTimeout(300);
    await page.locator('[data-testid="instruction-carousel"]').swipe({ direction: 'left' });
    
    // Complete consent with touch
    await page.tap('[data-testid="consent-checkbox"]');
    await page.fill('[data-testid="consent-signature"]', 'Jane Smith');
    await page.tap('[data-testid="consent-agree"]');
    
    // Touch-optimized response buttons for mobile
    await page.waitForSelector('[data-testid="mobile-response-buttons"]');
    
    // Complete a trial with touch
    await page.waitForSelector('[data-testid="stimulus"]');
    await page.tap('[data-testid="response-button-red"]');
    
    // Verify touch feedback
    await expect(page.locator('[data-testid="touch-feedback"]')).toBeVisible();
    
    // Check save progress works on mobile
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    await expect(page.locator('[data-testid="progress-saved"]')).toBeVisible();
    
    await context.close();
  });
  
  test('handle interruption and resume', async ({ page, context }) => {
    // Start study
    await page.goto(studyUrl + '?pid=interrupt-' + participantId);
    await page.click('[data-testid="begin-study"]');
    
    // Accept consent and complete some trials
    await page.check('[data-testid="consent-understand"]');
    await page.check('[data-testid="consent-voluntary"]'); 
    await page.check('[data-testid="consent-age-18"]');
    await page.fill('[data-testid="consent-signature"]', 'Test User');
    await page.click('[data-testid="consent-agree"]');
    
    // Complete demographics
    await page.fill('[data-testid="age"]', '30');
    await page.click('[data-testid="continue"]');
    
    // Start main task
    await page.waitForSelector('[data-testid="main-task"]');
    
    // Complete 5 trials
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('[data-testid="stimulus-word"]');
      await page.keyboard.press('f');
      await page.waitForTimeout(1000);
    }
    
    // Note progress
    const progress = await page.locator('[data-testid="trial-counter"]').textContent();
    expect(progress).toContain('6 / 60');
    
    // Simulate interruption - close tab
    const pageUrl = page.url();
    await page.close();
    
    // Open new tab and return to study
    const newPage = await context.newPage();
    await newPage.goto(pageUrl);
    
    // Should detect previous session
    await newPage.waitForSelector('[data-testid="resume-dialog"]');
    await expect(newPage.locator('[data-testid="resume-message"]')).toContainText('Welcome back!');
    await expect(newPage.locator('[data-testid="previous-progress"]')).toContainText('5 trials completed');
    
    // Resume from where left off
    await newPage.click('[data-testid="resume-study"]');
    
    // Verify resumed at correct position
    await newPage.waitForSelector('[data-testid="main-task"]');
    await expect(newPage.locator('[data-testid="trial-counter"]')).toContainText('6 / 60');
    
    // Complete one more trial to ensure continuity
    await newPage.waitForSelector('[data-testid="stimulus-word"]');
    await newPage.keyboard.press('j');
    
    await expect(newPage.locator('[data-testid="trial-counter"]')).toContainText('7 / 60');
  });
  
  test('accessibility features work correctly', async ({ page }) => {
    // Navigate with screen reader announcements
    await page.goto(studyUrl + '?pid=a11y-' + participantId);
    
    // Enable accessibility mode
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); // Activate accessibility options
    
    await page.waitForSelector('[data-testid="accessibility-menu"]');
    
    // Enable high contrast
    await page.click('[data-testid="high-contrast-mode"]');
    await expect(page.locator('body')).toHaveClass(/high-contrast/);
    
    // Increase font size
    await page.click('[data-testid="increase-font-size"]');
    await page.click('[data-testid="increase-font-size"]');
    
    // Enable keyboard navigation hints
    await page.click('[data-testid="show-keyboard-hints"]');
    await expect(page.locator('[data-testid="keyboard-hint"]').first()).toBeVisible();
    
    // Navigate with keyboard only
    await page.click('[data-testid="begin-study"]');
    
    // Tab through consent form
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Space'); // Check consent
    
    // Verify focus indicators
    const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedElement).toBeTruthy();
    
    // Screen reader announcements
    await expect(page.locator('[aria-live="polite"]')).toContainText(/consent/i);
    
    // Complete task with keyboard only
    await page.keyboard.press('Enter'); // Continue
    
    // Audio cues for timing
    await page.waitForSelector('[data-testid="enable-audio-cues"]');
    await page.click('[data-testid="enable-audio-cues"]');
    
    // Verify audio cue plays
    await page.waitForSelector('[data-testid="stimulus-word"]');
    const audioPlayed = await page.evaluate(() => {
      return (window as any).__lastAudioCue === 'stimulus-presented';
    });
    expect(audioPlayed).toBe(true);
  });
});