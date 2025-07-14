import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SingleChoiceRenderer from './SingleChoiceRenderer.svelte';
import { QuestionFactory } from '$lib/shared/factories/question-factory';
import { QuestionTypes } from '$lib/shared/types/questionnaire';
import type { SingleChoiceQuestion } from '$lib/shared/types/questionnaire';

describe('SingleChoiceRenderer', () => {
  const createTestQuestion = (): SingleChoiceQuestion => {
    const question = QuestionFactory.create(QuestionTypes.SINGLE_CHOICE) as SingleChoiceQuestion;
    question.display.prompt = 'Test Question';
    question.display.options = [
      { id: '1', label: 'Option 1', value: 'opt1' },
      { id: '2', label: 'Option 2', value: 'opt2' },
      { id: '3', label: 'Option 3', value: 'opt3' }
    ];
    return question;
  };

  it('renders question prompt and options', () => {
    const question = createTestQuestion();
    const { getByText } = render(SingleChoiceRenderer, { 
      props: { question } 
    });
    
    expect(getByText('Test Question')).toBeTruthy();
    expect(getByText('Option 1')).toBeTruthy();
    expect(getByText('Option 2')).toBeTruthy();
    expect(getByText('Option 3')).toBeTruthy();
  });

  it('handles option selection', async () => {
    const question = createTestQuestion();
    const onChange = vi.fn();
    
    const { getByLabelText } = render(SingleChoiceRenderer, { 
      props: { question, onChange } 
    });
    
    const option2 = getByLabelText('Option 2') as HTMLInputElement;
    await fireEvent.click(option2);
    
    expect(onChange).toHaveBeenCalledWith('opt2');
  });

  it('shows required indicator when question is required', () => {
    const question = createTestQuestion();
    question.required = true;
    
    const { getByLabelText } = render(SingleChoiceRenderer, { 
      props: { question } 
    });
    
    expect(getByLabelText('Required')).toBeTruthy();
  });

  it('disables inputs when disabled prop is true', () => {
    const question = createTestQuestion();
    
    const { container } = render(SingleChoiceRenderer, { 
      props: { question, disabled: true } 
    });
    
    const inputs = container.querySelectorAll('input[type="radio"]');
    inputs.forEach(input => {
      expect((input as HTMLInputElement).disabled).toBe(true);
    });
  });

  it('calls onNext when next button is clicked', async () => {
    const question = createTestQuestion();
    const onNext = vi.fn();
    
    const { getByText, getByLabelText } = render(SingleChoiceRenderer, { 
      props: { question, onNext, value: 'opt1' } 
    });
    
    const nextButton = getByText('Next');
    await fireEvent.click(nextButton);
    
    expect(onNext).toHaveBeenCalled();
  });

  it('prevents navigation when required and no value', async () => {
    const question = createTestQuestion();
    question.required = true;
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    
    const { getByText } = render(SingleChoiceRenderer, { 
      props: { question, onNext, onPrevious } 
    });
    
    const nextButton = getByText('Next');
    await fireEvent.click(nextButton);
    
    expect(onNext).not.toHaveBeenCalled();
  });

  it('auto-advances when configured', async () => {
    const question = createTestQuestion();
    question.navigation = {
      autoAdvance: true,
      advanceDelay: 100
    };
    const onNext = vi.fn();
    
    const { getByLabelText } = render(SingleChoiceRenderer, { 
      props: { question, onNext } 
    });
    
    const option1 = getByLabelText('Option 1');
    await fireEvent.click(option1);
    
    // Wait for auto-advance
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(onNext).toHaveBeenCalled();
  });

  it('supports keyboard navigation', async () => {
    const question = createTestQuestion();
    const onChange = vi.fn();
    
    const { container } = render(SingleChoiceRenderer, { 
      props: { question, onChange, value: 'opt1' } 
    });
    
    // Simulate arrow down key
    await fireEvent.keyDown(window, { key: 'ArrowDown' });
    
    expect(onChange).toHaveBeenCalledWith('opt2');
  });

  it('displays custom instruction when provided', () => {
    const question = createTestQuestion();
    question.display.instruction = 'Please select one option';
    
    const { getByText } = render(SingleChoiceRenderer, { 
      props: { question } 
    });
    
    expect(getByText('Please select one option')).toBeTruthy();
  });

  it('shows validation errors when showValidation is true', async () => {
    const question = createTestQuestion();
    question.required = true;
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    
    const { getByText, container } = render(SingleChoiceRenderer, { 
      props: { 
        question, 
        showValidation: true,
        onNext,
        onPrevious
      } 
    });
    
    // Click next to trigger validation
    const nextButton = getByText('Next');
    await fireEvent.click(nextButton);
    
    // Since onNext is prevented when required and no value,
    // check that onNext was not called
    expect(onNext).not.toHaveBeenCalled();
    
    // The next button should be disabled
    expect(nextButton).toHaveProperty('disabled', true);
  });
});