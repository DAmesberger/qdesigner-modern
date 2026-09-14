/** A portable study with two observable eligibility outcomes and hand-calculable scores. */
export function portableBehaviorDefinition(name: string) {
  return {
    $schema: 'https://schemas.qdesigner.dev/questionnaire/1.0.0',
    format: 'qdesigner.questionnaire',
    formatVersion: '1.0.0',
    questionnaire: {
      name,
      version: '2.3.4',
      defaultLocale: 'en',
      consent: {
        title: 'Study consent',
        content: 'We record your answers for this study.',
        checkboxes: [{ id: 'agree', label: 'I consent to this study', required: true }],
        requireSignature: true,
      },
    },
    assets: {},
    variables: {},
    questions: {
      age: {
        type: 'number-input',
        required: true,
        display: { prompt: 'Your age' },
        config: { min: 0, max: 120, step: 1 },
      },
      positive: {
        type: 'scale',
        required: true,
        display: { prompt: 'I feel well', min: 1, max: 5, step: 1, style: 'buttons' },
      },
      negative: {
        type: 'scale',
        required: true,
        display: { prompt: 'I feel tired', min: 1, max: 5, step: 1, style: 'buttons' },
      },
    },
    structure: {
      pages: [
        {
          id: 'eligibility',
          name: 'Eligibility',
          blocks: [{ id: 'age-block', type: 'standard', questionIds: ['age'] }],
        },
        {
          id: 'wellbeing',
          name: 'Wellbeing',
          blocks: [{ id: 'score-block', type: 'standard', questionIds: ['positive', 'negative'] }],
        },
      ],
    },
    flow: [
      {
        id: 'adults-only',
        type: 'terminate',
        source: 'eligibility',
        condition: 'age < 18',
        screenOutReason: 'under-age',
        screenOutMessage: 'This study is for adults only.',
      },
    ],
    rules: [],
    settings: {
      requireConsent: true,
      allowAnonymous: true,
      requireAuthentication: false,
      allowBackNavigation: false,
      showProgressBar: true,
      saveProgress: true,
      distribution: { anonymousAccess: true, completionMessage: 'Thank you for participating' },
      scoring: {
        scales: [
          {
            id: 'wellbeing',
            name: 'Wellbeing',
            itemIds: ['positive', 'negative'],
            reverseScoredItemIds: ['negative'],
            itemMin: 1,
            itemMax: 5,
            aggregation: 'mean',
            missingPolicy: 'listwise',
            norm: { mean: 3, sd: 1 },
          },
        ],
      },
      report: {
        enabled: true,
        title: 'Your study results',
        layout: { columns: 12, rowHeight: 100, gap: 12 },
        widgets: [
          {
            id: 'wellbeing-result',
            type: 'score-tile',
            position: { x: 0, y: 0, w: 6, h: 2 },
            binding: { source: 'score', key: 'wellbeing', field: 'value' },
            text: 'Wellbeing score',
          },
        ],
        enablePdfDownload: true,
      },
    },
    translations: {
      de: {
        label: 'Deutsch',
        questions: {
          age: { prompt: 'Ihr Alter' },
          positive: { prompt: 'Ich fühle mich wohl' },
          negative: { prompt: 'Ich fühle mich müde' },
        },
        chrome: { welcome: 'Willkommen', completion: 'Vielen Dank' },
      },
    },
    extensions: {
      'org.example.protocol': { required: false, data: { protocol: 'adult-wellbeing' } },
    },
  };
}
