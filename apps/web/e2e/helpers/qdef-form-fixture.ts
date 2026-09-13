/** Portable inputs exercise both authored display fields and flat module Config. */
export function portableFormDefinition(name: string) {
  const questions = {
    hidden: {
      type: 'text-input',
      required: true,
      text: 'This must be skipped',
      conditions: { show: 'false' },
      config: { inputType: 'text' },
      responseType: { type: 'text' },
    },
    text: {
      type: 'text-input',
      required: true,
      text: 'Describe your experience',
      config: { inputType: 'text', minLength: 5, maxLength: 100 },
      responseType: { type: 'text' },
    },
    number: {
      type: 'number-input',
      required: true,
      text: 'Choose a number',
      display: { min: 1 },
      config: { max: 10, step: 1 },
      responseType: { type: 'number', min: 1 },
    },
    single: {
      type: 'single-choice',
      required: true,
      display: { prompt: 'Pick one fruit' },
      config: {
        responseType: { type: 'single' },
        options: [
          { id: 'apple', label: 'Apple', value: 'apple' },
          { id: 'banana', label: 'Banana', value: 'banana' },
        ],
      },
      responseType: { type: 'single' },
    },
    multiple: {
      type: 'multiple-choice',
      required: true,
      display: { prompt: 'Pick two colors' },
      config: {
        responseType: { type: 'multiple' },
        minSelections: 2,
        maxSelections: 2,
        options: [
          { id: 'red', label: 'Red', value: 'red' },
          { id: 'green', label: 'Green', value: 'green' },
          { id: 'blue', label: 'Blue', value: 'blue' },
        ],
      },
      responseType: { type: 'multiple' },
    },
    scale: {
      type: 'scale',
      required: true,
      display: {
        prompt: 'Agreement',
        min: 1,
        max: 5,
        step: 1,
        style: 'buttons',
        labels: { min: 'Disagree', max: 'Agree' },
        showLabels: true,
      },
      responseType: { type: 'scale' },
    },
    rating: {
      type: 'rating',
      required: true,
      text: 'Enjoyment',
      config: { levels: 5, style: 'stars' },
      responseType: { type: 'scale' },
    },
    matrix: {
      type: 'matrix',
      required: true,
      display: { prompt: 'Rate each aspect' },
      config: {
        responseType: 'radio',
        rows: [
          { id: 'taste', label: 'Taste', required: true },
          { id: 'texture', label: 'Texture', required: true },
        ],
        columns: [
          { id: 'poor', label: 'Poor', value: 1 },
          { id: 'good', label: 'Good', value: 2 },
        ],
      },
      responseType: { type: 'matrix' },
    },
    ranking: {
      type: 'ranking',
      required: true,
      text: 'Rank the items',
      config: {
        items: [
          { id: 'third', label: 'Third' },
          { id: 'first', label: 'First' },
          { id: 'second', label: 'Second' },
        ],
        allowPartial: false,
      },
      responseType: { type: 'ranking' },
    },
    date: {
      type: 'date-time',
      required: true,
      text: 'Pick a date',
      config: {
        mode: 'date',
        format: 'DD/MM/YYYY',
        minDate: '2026-07-10',
        maxDate: '2026-07-20',
        defaultToToday: false,
      },
      responseType: { type: 'datetime' },
    },
    drawing: {
      type: 'drawing',
      required: true,
      text: 'Draw a line',
      config: {
        canvas: { width: 320, height: 240 },
        tools: ['pen', 'eraser'],
        colors: ['#000000'],
      },
      responseType: { type: 'drawing' },
    },
    upload: {
      type: 'file-upload',
      required: true,
      text: 'Upload your note',
      config: { accept: ['text/plain'], maxSize: 1024, maxFiles: 1, dragDrop: true },
      responseType: { type: 'file' },
    },
    recording: {
      type: 'media-response',
      required: true,
      text: 'Record a short answer',
      config: {
        recordingMode: 'audio',
        maxDuration: 10,
        countdown: 0,
        audioQuality: 'low',
        maxFileSize: 1048576,
        allowRerecord: true,
      },
      responseType: { type: 'file' },
    },
  };
  return {
    $schema: 'https://schemas.qdesigner.dev/questionnaire/1.0.0',
    format: 'qdesigner.questionnaire',
    formatVersion: '1.0.0',
    questionnaire: { name, version: '2.1.0' },
    assets: {},
    variables: {},
    questions,
    structure: {
      pages: [
        {
          id: 'page',
          blocks: [{ id: 'block', type: 'standard', questionIds: Object.keys(questions) }],
        },
      ],
    },
    flow: [],
    rules: [],
    settings: { allowBackNavigation: false, showProgressBar: true },
    translations: {},
    extensions: {},
  };
}
