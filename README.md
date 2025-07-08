# QDesigner Modern

A modern, high-performance questionnaire platform built with Svelte, TypeScript, and WebGL 2.0.

## Features

- **WebGL 2.0 Rendering**: 120+ FPS support for precise reaction time measurements
- **Sophisticated Variable System**: Mathematical formulas, dependencies, and custom functions
- **Multimedia Stimuli**: Support for images, videos, audio, and composite stimuli
- **High-Precision Timing**: Microsecond-accurate response collection
- **Modern Stack**: Svelte 5, TypeScript, Tailwind CSS, Vite

## Architecture

```
src/
├── lib/
│   ├── questionnaire/
│   │   ├── types/          # TypeScript interfaces for questionnaires
│   │   ├── variables/      # Variable engine with formula evaluation
│   │   └── runtime/        # Questionnaire execution engine
│   ├── renderer/           # WebGL 2.0 rendering system
│   ├── experiments/        # Reaction test and other experiments
│   └── components/         # Svelte components
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Variable System

The variable system supports:

- **Basic Operations**: `+`, `-`, `*`, `/`, `^`, `sqrt()`, etc.
- **Conditional Logic**: `IF(condition, trueValue, falseValue)`
- **Array Functions**: `SUM()`, `AVG()`, `COUNT()`
- **String Functions**: `CONCAT()`, `LENGTH()`
- **Time Functions**: `NOW()`, `TIME_SINCE()`
- **Random Functions**: `RANDOM()`, `RANDINT(min, max)`

Example formula:
```javascript
IF(reactionTime < 300, "Fast", IF(reactionTime < 500, "Normal", "Slow"))
```

## Question Types

- **Text Questions**: Simple text prompts
- **Choice Questions**: Single/multiple choice
- **Scale Questions**: Likert scales, sliders
- **Reaction Tests**: High-precision timing tasks
- **Multimedia Questions**: Image/video/audio stimuli

## Response Collection

- Reaction times with microsecond precision
- All keypress events with timestamps
- Mouse tracking (optional)
- Response corrections and attempts
- Automatic variable updates

## Export Formats

- CSV for Excel
- SPSS for statistical analysis
- JSON for custom processing
- Raw data with timing information

## Requirements

- Node.js 20+
- Modern browser with WebGL 2.0 support
- 120+ Hz display recommended for reaction tests

## Docker

```bash
# Development
docker-compose up qdesigner-dev

# Production
docker-compose up qdesigner-prod
```

## License

See LICENSE file for details.