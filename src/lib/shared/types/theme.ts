// Theme system types for WYSIWYG designer

export interface ColorPalette {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: {
    primary: string;
    secondary: string;
    disabled: string;
  };
  border: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface TypographySystem {
  fontFamily: {
    sans: string;
    serif: string;
    mono: string;
  };
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
  };
  fontWeight: {
    light: number;
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
  letterSpacing: {
    tight: string;
    normal: string;
    wide: string;
  };
}

export interface SpacingScale {
  px: string;
  0: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: string;
  8: string;
  10: string;
  12: string;
  16: string;
  20: string;
  24: string;
  32: string;
}

export interface ShadowPresets {
  none: string;
  sm: string;
  base: string;
  md: string;
  lg: string;
  xl: string;
  inner: string;
}

export interface AnimationPresets {
  duration: {
    fast: number;
    normal: number;
    slow: number;
  };
  easing: {
    linear: string;
    easeIn: string;
    easeOut: string;
    easeInOut: string;
    bounce: string;
  };
}

export interface BorderRadius {
  none: string;
  sm: string;
  base: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface QuestionStyles {
  container: {
    padding?: string;
    margin?: string;
    background?: string;
    border?: string;
    borderRadius?: string;
    boxShadow?: string;
  };
  prompt: {
    fontSize?: string;
    fontWeight?: number;
    color?: string;
    marginBottom?: string;
    textAlign?: 'left' | 'center' | 'right';
  };
  description: {
    fontSize?: string;
    color?: string;
    marginBottom?: string;
  };
  response: {
    gap?: string;
  };
}

export interface PageStyles {
  background?: string;
  padding?: string;
  maxWidth?: string;
  margin?: string;
}

export interface ResponseOptionStyles {
  base: {
    padding?: string;
    border?: string;
    borderRadius?: string;
    background?: string;
    color?: string;
    transition?: string;
  };
  hover?: {
    background?: string;
    borderColor?: string;
    transform?: string;
  };
  selected?: {
    background?: string;
    borderColor?: string;
    color?: string;
  };
  disabled?: {
    opacity?: number;
    cursor?: string;
  };
}

export interface BreakpointSystem {
  mobile: number;
  tablet: number;
  desktop: number;
  wide: number;
}

export interface QuestionnaireTheme {
  id: string;
  name: string;
  global: {
    colors: ColorPalette;
    typography: TypographySystem;
    spacing: SpacingScale;
    borders: {
      radius: BorderRadius;
      width: {
        thin: string;
        base: string;
        thick: string;
      };
    };
    effects: {
      shadows: ShadowPresets;
      animations: AnimationPresets;
      transitions: {
        fast: string;
        normal: string;
        slow: string;
      };
    };
  };
  components: {
    question: QuestionStyles;
    page: PageStyles;
    response: {
      choice: ResponseOptionStyles;
      scale: ResponseOptionStyles;
      text: {
        input: ResponseOptionStyles;
        textarea: ResponseOptionStyles;
      };
    };
    button: {
      primary: ResponseOptionStyles;
      secondary: ResponseOptionStyles;
    };
    navigation: {
      container: any;
      button: ResponseOptionStyles;
    };
  };
  breakpoints: BreakpointSystem;
  customCSS?: string;
}

// Default theme
export const defaultTheme: QuestionnaireTheme = {
  id: 'default',
  name: 'Default Theme',
  global: {
    colors: {
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      background: '#FFFFFF',
      surface: '#F9FAFB',
      text: {
        primary: '#111827',
        secondary: '#6B7280',
        disabled: '#9CA3AF',
      },
      border: '#E5E7EB',
      error: '#EF4444',
      warning: '#F59E0B',
      success: '#10B981',
      info: '#3B82F6',
    },
    typography: {
      fontFamily: {
        sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        serif: 'Georgia, serif',
        mono: 'Menlo, Monaco, Consolas, monospace',
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
      },
      fontWeight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
      },
      letterSpacing: {
        tight: '-0.05em',
        normal: '0',
        wide: '0.05em',
      },
    },
    spacing: {
      px: '1px',
      0: '0',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
      8: '2rem',
      10: '2.5rem',
      12: '3rem',
      16: '4rem',
      20: '5rem',
      24: '6rem',
      32: '8rem',
    },
    borders: {
      radius: {
        none: '0',
        sm: '0.125rem',
        base: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      width: {
        thin: '1px',
        base: '2px',
        thick: '4px',
      },
    },
    effects: {
      shadows: {
        none: 'none',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
      },
      animations: {
        duration: {
          fast: 150,
          normal: 300,
          slow: 500,
        },
        easing: {
          linear: 'linear',
          easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
          easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
          easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
          bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        },
      },
      transitions: {
        fast: 'all 150ms ease-in-out',
        normal: 'all 300ms ease-in-out',
        slow: 'all 500ms ease-in-out',
      },
    },
  },
  components: {
    question: {
      container: {
        padding: '1.5rem',
        background: '#FFFFFF',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      },
      prompt: {
        fontSize: '1.125rem',
        fontWeight: 600,
        color: '#111827',
        marginBottom: '0.75rem',
      },
      description: {
        fontSize: '0.875rem',
        color: '#6B7280',
        marginBottom: '1rem',
      },
      response: {
        gap: '0.75rem',
      },
    },
    page: {
      background: '#F9FAFB',
      padding: '2rem',
      maxWidth: '48rem',
      margin: '0 auto',
    },
    response: {
      choice: {
        base: {
          padding: '0.75rem 1rem',
          border: '2px solid #E5E7EB',
          borderRadius: '0.375rem',
          background: '#FFFFFF',
          transition: 'all 150ms ease-in-out',
        },
        hover: {
          borderColor: '#3B82F6',
          background: '#EFF6FF',
        },
        selected: {
          borderColor: '#3B82F6',
          background: '#3B82F6',
          color: '#FFFFFF',
        },
      },
      scale: {
        base: {
          padding: '0.5rem 0.75rem',
          border: '2px solid #E5E7EB',
          borderRadius: '0.25rem',
          background: '#FFFFFF',
        },
        hover: {
          borderColor: '#3B82F6',
          transform: 'scale(1.05)',
        },
        selected: {
          borderColor: '#3B82F6',
          background: '#3B82F6',
          color: '#FFFFFF',
        },
      },
      text: {
        input: {
          base: {
            padding: '0.5rem 0.75rem',
            border: '1px solid #E5E7EB',
            borderRadius: '0.375rem',
            background: '#FFFFFF',
          },
        },
        textarea: {
          base: {
            padding: '0.5rem 0.75rem',
            border: '1px solid #E5E7EB',
            borderRadius: '0.375rem',
            background: '#FFFFFF',
          },
        },
      },
    },
    button: {
      primary: {
        base: {
          padding: '0.5rem 1rem',
          background: '#3B82F6',
          color: '#FFFFFF',
          borderRadius: '0.375rem',
          transition: 'all 150ms ease-in-out',
        },
        hover: {
          background: '#2563EB',
        },
      },
      secondary: {
        base: {
          padding: '0.5rem 1rem',
          background: '#FFFFFF',
          color: '#374151',
          border: '1px solid #E5E7EB',
          borderRadius: '0.375rem',
          transition: 'all 150ms ease-in-out',
        },
        hover: {
          background: '#F9FAFB',
        },
      },
    },
    navigation: {
      container: {},
      button: {
        base: {
          padding: '0.5rem 1rem',
          background: '#3B82F6',
          color: '#FFFFFF',
          borderRadius: '0.375rem',
        },
      },
    },
  },
  breakpoints: {
    mobile: 640,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
  },
};