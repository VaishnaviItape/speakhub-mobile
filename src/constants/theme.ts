export const COLORS = {
  // Brand Colors matching Speak Hub Logo (Crimson Rose / Ruby Red - Elegant, Premium, Non-Harsh)
  primary: '#E11D48', // Speak Hub Logo Brand Crimson Rose
  primaryDark: '#BE123C', // Deep rich ruby for gradients & active states
  primaryHover: '#BE123C', // Pressed / hover state
  primaryLight: 'rgba(225, 29, 72, 0.12)', // Subtle tint for active items & borders
  primaryLightest: '#FFF1F2', // Soft background tint for badges, cards & pills
  
  // Backgrounds
  background: '#f8fafc', // Default app background (modern soft slate)
  surface: '#ffffff', // Card and header backgrounds
  gradientStart: '#E11D48',
  gradientEnd: '#BE123C',
  
  // Text Colors
  textDark: '#0f172a', // Primary text
  textMedium: '#475569', // Secondary text (subtitles, descriptions)
  textLight: '#94a3b8', // Disabled or placeholder text
  textInverse: '#ffffff', // Text on primary colored backgrounds
  textSecondary: '#475569',
  
  // Status Colors (Separate from Brand Primary)
  successText: '#15803d',
  successBackground: '#dcfce7',
  warningText: '#b45309',
  warningBackground: '#fef3c7',
  error: '#dc2626',
  errorBackground: '#fee2e2',
  
  // Borders & Elements
  border: '#e2e8f0',
  backgroundElement: '#f1f5f9',
  backgroundSelected: '#fee2e2',
};

export const Colors = {
  light: {
    ...COLORS,
    text: COLORS.textDark,
    background: COLORS.background,
    tint: COLORS.primary,
    icon: COLORS.textMedium,
    tabIconDefault: '#94a3b8',
    tabIconSelected: COLORS.primary,
  },
  dark: {
    ...COLORS,
    text: '#f8fafc',
    background: '#0f172a',
    tint: COLORS.primary,
    icon: '#94a3b8',
    tabIconDefault: '#64748b',
    tabIconSelected: COLORS.primary,
  },
};

export const Spacing = {
  half: 4,
  one: 8,
  two: 16,
  three: 24,
  four: 32,
  five: 40,
  six: 48,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  twoXl: 40,
  threeXl: 48,
  fourXl: 56,
};

export const Fonts = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  mono: 'monospace',
};

export const MaxContentWidth = 1200;
export type ThemeColor = keyof typeof COLORS | keyof typeof Colors.light;
