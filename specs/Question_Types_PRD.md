# Question Types PRD (Product Requirements Document)

## Overview

This document defines the standardized question types for QDesigner Modern, ensuring alignment between the questionnaire designer and fillout runtime. The system supports all standard questionnaire types plus specialized WebGL-based multimedia questions for psychological research.

## Question Type System

### Core Question Types

The system uses a unified type system with clear, descriptive names:

```typescript
export type QuestionType = 
  | 'single-choice'      // Radio buttons - select one option
  | 'multiple-choice'    // Checkboxes - select multiple options
  | 'text-input'         // Short text or long text input
  | 'number-input'       // Numeric input with validation
  | 'scale'              // Likert scale, rating scale, slider
  | 'matrix'             // Grid/matrix questions
  | 'date-time'          // Date and/or time selection
  | 'ranking'            // Drag-and-drop ranking/ordering
  | 'file-upload'        // File attachment upload
  | 'text-display'       // Information/instruction display (no response)
  | 'media-display'      // WebGL-rendered image/video display (no response)
  | 'media-response';    // WebGL-rendered image/video with response capture
```

### Question Type Definitions

#### 1. **single-choice**
- **Purpose**: Select one option from a list
- **UI**: Radio buttons or button group
- **Response**: Single value (string/number)
- **Config**: `options[]`, `layout` (vertical/horizontal/grid), `randomize`

#### 2. **multiple-choice**
- **Purpose**: Select multiple options from a list
- **UI**: Checkboxes or multi-select buttons
- **Response**: Array of values
- **Config**: `options[]`, `minSelections`, `maxSelections`, `layout`, `randomize`

#### 3. **text-input**
- **Purpose**: Free text response
- **UI**: Single-line input or multi-line textarea
- **Response**: String
- **Config**: `multiline`, `maxLength`, `placeholder`, `validation` (email/url/regex)

#### 4. **number-input**
- **Purpose**: Numeric response
- **UI**: Number input with optional spinner
- **Response**: Number
- **Config**: `min`, `max`, `step`, `decimals`, `unit`, `placeholder`

#### 5. **scale**
- **Purpose**: Rating on a defined scale
- **UI**: Likert scale, star rating, slider, or numeric scale
- **Response**: Number
- **Config**: `min`, `max`, `step`, `labels`, `displayType` (likert/stars/slider/numeric)

#### 6. **matrix**
- **Purpose**: Multiple questions with same scale/options
- **UI**: Grid with rows (items) and columns (scale/options)
- **Response**: Object mapping row IDs to values
- **Config**: `rows[]`, `columns[]`, `responseType` (single/multiple), `randomizeRows`

#### 7. **date-time**
- **Purpose**: Date and/or time selection
- **UI**: Date picker, time picker, or combined
- **Response**: ISO 8601 datetime string
- **Config**: `mode` (date/time/datetime), `minDate`, `maxDate`, `format`

#### 8. **ranking**
- **Purpose**: Order items by preference/importance
- **UI**: Drag-and-drop list
- **Response**: Ordered array of item IDs
- **Config**: `items[]`, `minRank`, `maxRank`, `randomizeInitial`

#### 9. **file-upload**
- **Purpose**: Upload files/documents
- **UI**: Drag-and-drop zone or file picker
- **Response**: File metadata array
- **Config**: `accept` (MIME types), `maxFiles`, `maxSizeMB`

#### 10. **text-display**
- **Purpose**: Show instructions or information
- **UI**: Formatted text/HTML display
- **Response**: None (display only)
- **Config**: `content`, `format` (text/markdown/html)

#### 11. **media-display**
- **Purpose**: Display images or videos via WebGL
- **UI**: High-performance WebGL canvas
- **Response**: None (display only)
- **Config**: `mediaUrl`, `mediaType` (image/video), `duration`, `autoplay`

#### 12. **media-response**
- **Purpose**: Show media and capture response
- **UI**: WebGL media display with response overlay
- **Response**: Depends on `responseMode`
- **Config**: `mediaUrl`, `mediaType`, `responseMode` (click-position/reaction-time/rating)

## Migration Plan

### Current State
The codebase currently has misaligned types:
- Enum defines: `text`, `choice`, `scale`, `rating`, `reaction`, `multimedia`, `instruction`, `webgl`, `custom`
- Components use: `text-display`, `multiple-choice`, `scale`, `text-input`, `matrix`, `statistical-feedback`

### Migration Steps

1. **Update QuestionType enum** to match the new standardized types
2. **Update QuestionRenderer** component mappings
3. **Create/rename components** to match new type names
4. **Update QuestionPalette** with proper type assignments
5. **Remove 'custom' type** completely
6. **Add missing question types** (date-time, ranking, file-upload, etc.)

### Type Mapping (Old → New)

```typescript
// Direct mappings
'text' → 'text-display'
'choice' → 'single-choice' or 'multiple-choice' (based on config)
'scale' → 'scale'
'rating' → 'scale' (with star display type)
'instruction' → 'text-display'
'custom' → REMOVED

// New additions
'multimedia' → 'media-display' or 'media-response'
'webgl' → 'media-display' or 'media-response'
'reaction' → 'media-response' (with reaction-time mode)

// Completely new
'number-input' (NEW)
'date-time' (NEW)
'ranking' (NEW)
'file-upload' (NEW)
```

## Implementation Guidelines

### Component Naming Convention
- Component files: `{QuestionType}Question.svelte`
- Example: `SingleChoiceQuestion.svelte`, `MediaDisplayQuestion.svelte`

### Response Type System
Each question type has a corresponding response type:
```typescript
interface QuestionResponse<T> {
  questionId: string;
  timestamp: number;
  value: T;
  reactionTime?: number; // milliseconds
  metadata?: Record<string, any>;
}
```

### Validation
Each question type should support:
- Required/optional validation
- Custom validation rules
- Real-time validation feedback
- Accessibility compliance

## Future Considerations

1. **Plugin System**: Allow researchers to add custom question types
2. **Composite Questions**: Combine multiple question types
3. **Adaptive Questions**: Questions that change based on previous responses
4. **AI-Enhanced Questions**: Natural language processing for open-ended responses

## Conclusion

This standardized question type system provides:
- Clear alignment between designer and runtime
- Comprehensive coverage of research needs
- Extensibility for future requirements
- Consistent naming and behavior
- WebGL integration for high-performance media display

All question types should be implemented following these specifications to ensure consistency across the platform.