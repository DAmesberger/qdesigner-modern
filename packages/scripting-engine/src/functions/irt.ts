import type { FormulaFunction } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- formula functions operate on dynamic values
type DynamicValue = any;

/**
 * 3PL IRT probability function.
 * P(theta) = c + (1-c) / (1 + exp(-a * (theta - b)))
 */
function irt3pl(theta: number, a: number, b: number, c: number): number {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/**
 * Fisher information for 3PL model.
 * I(theta) = a^2 * ((P - c) / (1 - c))^2 * Q / P
 * where P = P(theta), Q = 1 - P
 */
function irtInfo3pl(theta: number, a: number, b: number, c: number): number {
  const P = irt3pl(theta, a, b, c);
  const Q = 1 - P;
  if (P === 0 || Q === 0) return 0;
  const ratio = (P - c) / (1 - c);
  return a * a * ratio * ratio * Q / P;
}

// IRT Model Functions
export const irtFunctions: FormulaFunction[] = [
  {
    name: 'IRT_1PL',
    category: 'stat',
    description: 'Rasch/1PL IRT model probability',
    parameters: [
      { name: 'theta', type: 'number', description: 'Person ability parameter' },
      { name: 'b', type: 'number', description: 'Item difficulty parameter' }
    ],
    returns: 'number',
    implementation: (theta: number, b: number) => {
      if (typeof theta !== 'number' || typeof b !== 'number') return NaN;
      // 1PL: P = 1 / (1 + exp(-(theta - b)))
      return 1 / (1 + Math.exp(-(theta - b)));
    },
    examples: ['IRT_1PL(0, 0)', 'IRT_1PL(1.5, -0.5)']
  },

  {
    name: 'IRT_2PL',
    category: 'stat',
    description: '2-parameter logistic IRT model probability',
    parameters: [
      { name: 'theta', type: 'number', description: 'Person ability parameter' },
      { name: 'a', type: 'number', description: 'Item discrimination parameter' },
      { name: 'b', type: 'number', description: 'Item difficulty parameter' }
    ],
    returns: 'number',
    implementation: (theta: number, a: number, b: number) => {
      if (typeof theta !== 'number' || typeof a !== 'number' || typeof b !== 'number') return NaN;
      // 2PL: P = 1 / (1 + exp(-a * (theta - b)))
      return 1 / (1 + Math.exp(-a * (theta - b)));
    },
    examples: ['IRT_2PL(0, 1, 0)', 'IRT_2PL(1.5, 1.2, -0.5)']
  },

  {
    name: 'IRT_3PL',
    category: 'stat',
    description: '3-parameter logistic IRT model probability with guessing',
    parameters: [
      { name: 'theta', type: 'number', description: 'Person ability parameter' },
      { name: 'a', type: 'number', description: 'Item discrimination parameter' },
      { name: 'b', type: 'number', description: 'Item difficulty parameter' },
      { name: 'c', type: 'number', description: 'Guessing (pseudo-chance) parameter' }
    ],
    returns: 'number',
    implementation: (theta: number, a: number, b: number, c: number) => {
      if (typeof theta !== 'number' || typeof a !== 'number' ||
          typeof b !== 'number' || typeof c !== 'number') return NaN;
      if (c < 0 || c >= 1) return NaN;
      return irt3pl(theta, a, b, c);
    },
    examples: ['IRT_3PL(0, 1, 0, 0.25)', 'IRT_3PL(1.5, 1.2, -0.5, 0.2)']
  },

  {
    name: 'IRT_INFO',
    category: 'stat',
    description: 'Fisher information for an IRT item',
    parameters: [
      { name: 'theta', type: 'number', description: 'Person ability parameter' },
      { name: 'a', type: 'number', description: 'Item discrimination parameter' },
      { name: 'b', type: 'number', description: 'Item difficulty parameter' },
      { name: 'c', type: 'number', description: 'Guessing parameter (default 0)', optional: true, default: 0 }
    ],
    returns: 'number',
    implementation: (theta: number, a: number, b: number, c: number = 0) => {
      if (typeof theta !== 'number' || typeof a !== 'number' || typeof b !== 'number') return NaN;
      if (typeof c !== 'number') c = 0;
      if (c < 0 || c >= 1) return NaN;

      return irtInfo3pl(theta, a, b, c);
    },
    examples: ['IRT_INFO(0, 1, 0)', 'IRT_INFO(0, 1.5, 0, 0.25)']
  },

  {
    name: 'IRT_THETA_MLE',
    category: 'stat',
    description: 'Maximum likelihood estimate of theta via Newton-Raphson',
    parameters: [
      { name: 'responses', type: 'array', description: 'Array of 0/1 responses' },
      { name: 'items', type: 'array', description: 'Array of item parameter objects {a, b, c?}' }
    ],
    returns: 'number',
    implementation: (responses: DynamicValue, itemParams: DynamicValue) => {
      if (!Array.isArray(responses) || !Array.isArray(itemParams)) return NaN;
      if (responses.length === 0 || responses.length !== itemParams.length) return NaN;

      const n = responses.length;
      const resp: number[] = responses.map(Number);
      const items = itemParams.map((item: DynamicValue) => ({
        a: typeof item.a === 'number' ? item.a : 1,
        b: typeof item.b === 'number' ? item.b : 0,
        c: typeof item.c === 'number' ? item.c : 0
      }));

      // Check if all responses are the same (MLE doesn't converge)
      const allSame = resp.every(r => r === resp[0]);
      if (allSame) {
        // Return a bounded estimate
        return resp[0] === 1 ? 4 : -4;
      }

      // Newton-Raphson iteration
      let theta = 0; // Start at 0
      const maxIter = 20;
      const epsilon = 0.001;

      for (let iter = 0; iter < maxIter; iter++) {
        let firstDeriv = 0;
        let secondDeriv = 0;

        for (let i = 0; i < n; i++) {
          const a = items[i].a;
          const b = items[i].b;
          const c = items[i].c;
          const P = irt3pl(theta, a, b, c);
          const Q = 1 - P;

          if (P === 0 || Q === 0) continue;

          const pStar = (P - c) / (1 - c);

          // First derivative of log-likelihood
          firstDeriv += a * pStar * (resp[i] - P) / P;

          // Second derivative (approximation using expected information)
          secondDeriv -= a * a * pStar * pStar * Q / P;
        }

        if (secondDeriv === 0) break;

        const delta = firstDeriv / secondDeriv;
        theta -= delta;

        // Bound theta to prevent divergence
        if (theta > 5) theta = 5;
        if (theta < -5) theta = -5;

        if (Math.abs(delta) < epsilon) break;
      }

      return theta;
    },
    examples: [
      'IRT_THETA_MLE([1,0,1,1], [{a:1,b:-1},{a:1,b:0},{a:1,b:1},{a:1,b:2}])'
    ]
  }
];
