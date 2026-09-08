import React from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';

interface MarkdownRendererProps {
  content: string;
  baseFontSize?: number;
  textColor?: string;
  isCompact?: boolean;
}

/**
 * Parses inline text tokens (bold, italic, bold-italic, code, links, blanks)
 */
export const renderInlineText = (
  text: string,
  baseStyle: any = {},
  keyPrefix: string = 'inline'
): React.ReactNode[] => {
  if (!text) return [];

  // Regex pattern matching:
  // 1. Links: [label](url)
  // 2. Bold Italic: ***text*** or ___text___
  // 3. Bold: **text** or __text__
  // 4. Italic: *text* or _text_
  // 5. Inline Code: `code`
  // 6. Fill-in-blanks: series of underscores (e.g. _______)
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|_{3,})/g;

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    // Push preceding plain text
    if (match.index > lastIdx) {
      parts.push(
        <Text key={`${keyPrefix}-txt-${lastIdx}`} style={baseStyle}>
          {text.substring(lastIdx, match.index)}
        </Text>
      );
    }

    const token = match[0];
    const tokenKey = `${keyPrefix}-tok-${match.index}`;

    if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      // Markdown link [title](url)
      const labelMatch = token.match(/\[([^\]]+)\]/);
      const urlMatch = token.match(/\(([^)]+)\)/);
      const label = labelMatch ? labelMatch[1] : token;
      const url = urlMatch ? urlMatch[1] : '';

      parts.push(
        <Text
          key={tokenKey}
          style={[baseStyle, styles.inlineLink]}
          onPress={() => {
            if (url) {
              const target = url.startsWith('http') ? url : `https://${url}`;
              Linking.openURL(target).catch(() => {});
            }
          }}
        >
          {label}
        </Text>
      );
    } else if ((token.startsWith('***') && token.endsWith('***')) || (token.startsWith('___') && token.endsWith('___') && token.length > 6)) {
      // Bold Italic
      const inner = token.slice(3, -3);
      parts.push(
        <Text key={tokenKey} style={[baseStyle, styles.inlineBoldItalic]}>
          {inner}
        </Text>
      );
    } else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      // Bold
      const inner = token.slice(2, -2);
      parts.push(
        <Text key={tokenKey} style={[baseStyle, styles.inlineBold]}>
          {inner}
        </Text>
      );
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_') && !token.startsWith('___'))) {
      // Italic
      const inner = token.slice(1, -1);
      parts.push(
        <Text key={tokenKey} style={[baseStyle, styles.inlineItalic]}>
          {inner}
        </Text>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      // Code
      const inner = token.slice(1, -1);
      parts.push(
        <Text key={tokenKey} style={[baseStyle, styles.inlineCode]}>
          {inner}
        </Text>
      );
    } else if (/^_{3,}$/.test(token)) {
      // Fill-in-the-blank line representation (e.g. __________)
      parts.push(
        <Text key={tokenKey} style={[baseStyle, styles.inlineBlank]}>
          {' ' + '＿'.repeat(Math.min(Math.max(Math.floor(token.length / 2), 4), 16)) + ' '}
        </Text>
      );
    } else {
      parts.push(
        <Text key={tokenKey} style={baseStyle}>
          {token}
        </Text>
      );
    }

    lastIdx = tokenRegex.lastIndex;
  }

  // Push trailing plain text
  if (lastIdx < text.length) {
    parts.push(
      <Text key={`${keyPrefix}-txt-${lastIdx}`} style={baseStyle}>
        {text.substring(lastIdx)}
      </Text>
    );
  }

  return parts;
};

/**
 * Premium Mobile Markdown Renderer for React Native
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  baseFontSize = 14,
  textColor = COLORS.textDark,
  isCompact = false,
}) => {
  if (!content || typeof content !== 'string') return null;

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const renderedElements: React.ReactNode[] = [];

  let inSpeakingSection = false;
  let inRuleSection = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    const lineKey = `md-line-${i}`;

    // Empty line -> spacing
    if (!line) {
      renderedElements.push(<View key={lineKey} style={styles.emptyLine} />);
      continue;
    }

    // 1. Horizontal Rule (--- or *** or ___)
    if (/^([-*_]){3,}$/.test(line)) {
      renderedElements.push(
        <View key={lineKey} style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <View style={styles.dividerDiamond} />
          <View style={styles.dividerLine} />
        </View>
      );
      continue;
    }

    // 2. Headings
    // H1 Heading (# Heading)
    if (/^#\s+(.+)$/.test(line)) {
      const match = line.match(/^#\s+(.+)$/);
      const headingText = match ? match[1].trim() : '';

      const isSpeakingHeader = /speaking\s*practice/i.test(headingText);
      const isRuleHeader = /important\s*rule|rule|grammar\s*rule|formula/i.test(headingText);
      if (isSpeakingHeader) inSpeakingSection = true;
      if (isRuleHeader) inRuleSection = true;

      renderedElements.push(
        <View
          key={lineKey}
          style={[
            styles.h1Container,
            isSpeakingHeader && styles.speakingHeaderContainer,
            isRuleHeader && styles.ruleHeaderContainer,
          ]}
        >
          <View style={styles.h1AccentBar} />
          <View style={styles.h1Content}>
            {isSpeakingHeader ? (
              <MaterialIcons name="record-voice-over" size={20} color="#0284c7" style={{ marginRight: 6 }} />
            ) : isRuleHeader ? (
              <MaterialIcons name="lightbulb" size={20} color="#d97706" style={{ marginRight: 6 }} />
            ) : (
              <MaterialIcons name="menu-book" size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
            )}
            <Text style={[styles.h1Text, { fontSize: baseFontSize + 4 }]}>
              {renderInlineText(headingText, styles.h1Text, `${lineKey}-h1`)}
            </Text>
          </View>
        </View>
      );
      continue;
    }

    // H2 Heading (## Heading) - E.g. "## Part A – Fill in the Blanks", "## HOMEWORK – PRESENT PERFECT TENSE"
    if (/^##\s+(.+)$/.test(line)) {
      const match = line.match(/^##\s+(.+)$/);
      const headingText = match ? match[1].trim() : '';
      const isPart = /part\s+[a-z0-9]/i.test(headingText);

      renderedElements.push(
        <View key={lineKey} style={[styles.h2Container, isPart && styles.h2PartContainer]}>
          {isPart && (
            <View style={styles.partBadge}>
              <MaterialIcons name="task-alt" size={14} color="#ffffff" />
            </View>
          )}
          <Text style={[styles.h2Text, { fontSize: baseFontSize + 2 }]}>
            {renderInlineText(headingText, styles.h2Text, `${lineKey}-h2`)}
          </Text>
        </View>
      );
      continue;
    }

    // H3 Heading (### Heading) - E.g. "### Topic: Present Perfect Tense", "### Total Marks: 30"
    if (/^###\s+(.+)$/.test(line)) {
      const match = line.match(/^###\s+(.+)$/);
      const headingText = match ? match[1].trim() : '';

      renderedElements.push(
        <View key={lineKey} style={styles.h3Container}>
          <Text style={[styles.h3Text, { fontSize: baseFontSize + 1 }]}>
            {renderInlineText(headingText, styles.h3Text, `${lineKey}-h3`)}
          </Text>
        </View>
      );
      continue;
    }

    // H4 Heading (#### Heading)
    if (/^####+\s+(.+)$/.test(line)) {
      const match = line.match(/^####+\s+(.+)$/);
      const headingText = match ? match[1].trim() : '';

      renderedElements.push(
        <View key={lineKey} style={styles.h4Container}>
          <Text style={[styles.h4Text, { fontSize: baseFontSize }]}>
            {renderInlineText(headingText, styles.h4Text, `${lineKey}-h4`)}
          </Text>
        </View>
      );
      continue;
    }

    // 3. Marks / Subtitle Callout: e.g. **(5 Marks – 1 mark each)**
    if (/^\*\*\(\s*\d+\s*Marks.*?\)\*\*$/i.test(line) || /^\(\s*\d+\s*Marks.*?\)$/i.test(line)) {
      const cleanText = line.replace(/\*\*/g, '').trim();
      renderedElements.push(
        <View key={lineKey} style={styles.marksBadge}>
          <MaterialIcons name="stars" size={14} color="#d97706" />
          <Text style={styles.marksBadgeText}>{cleanText}</Text>
        </View>
      );
      continue;
    }

    // 4. Numbered Questions or List items (e.g. "1. I __________ __________ my homework." or "26. मी माझे...")
    const numberedMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (numberedMatch) {
      const num = numberedMatch[1];
      const itemContent = numberedMatch[2];

      renderedElements.push(
        <View key={lineKey} style={styles.numberedItemContainer}>
          <View style={styles.numberBadge}>
            <Text style={styles.numberBadgeText}>{num}</Text>
          </View>
          <View style={styles.itemTextContent}>
            <Text style={[styles.paragraphText, { fontSize: baseFontSize, color: textColor }]}>
              {renderInlineText(itemContent, { fontSize: baseFontSize, color: textColor }, `${lineKey}-num`)}
            </Text>
          </View>
        </View>
      );
      continue;
    }

    // 5. Multiple Choice Options (e.g. "A. She have finished her work." or "A) ...")
    const optionMatch = line.match(/^([A-D|a-d])[\.\)]\s+(.+)$/);
    if (optionMatch) {
      const optionLetter = optionMatch[1].toUpperCase();
      const optionContent = optionMatch[2];

      renderedElements.push(
        <View key={lineKey} style={styles.choiceOptionContainer}>
          <View style={styles.choiceLetterBadge}>
            <Text style={styles.choiceLetterText}>{optionLetter}</Text>
          </View>
          <View style={styles.itemTextContent}>
            <Text style={[styles.choiceText, { fontSize: baseFontSize, color: '#334155' }]}>
              {renderInlineText(optionContent, { fontSize: baseFontSize, color: '#334155' }, `${lineKey}-opt`)}
            </Text>
          </View>
        </View>
      );
      continue;
    }

    // 6. Answer / Correct Blank Prompt Line (e.g. "**Answer:** ___________________" or "**Correct:** ________________")
    if (/^\s*\*\*(Answer|Correct|उत्तर):\*\*/i.test(line) || /^(Answer|Correct|उत्तर):/i.test(line)) {
      renderedElements.push(
        <View key={lineKey} style={styles.answerBoxContainer}>
          <View style={styles.answerIcon}>
            <MaterialIcons name="edit" size={13} color="#6366f1" />
          </View>
          <Text style={[styles.answerText, { fontSize: baseFontSize }]}>
            {renderInlineText(line, styles.answerText, `${lineKey}-ans`)}
          </Text>
        </View>
      );
      continue;
    }

    // 7. Bullet items (- item, * item, • item)
    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      const bulletContent = bulletMatch[1];
      renderedElements.push(
        <View key={lineKey} style={styles.bulletItemContainer}>
          <View style={styles.bulletDot} />
          <View style={styles.itemTextContent}>
            <Text style={[styles.paragraphText, { fontSize: baseFontSize, color: textColor }]}>
              {renderInlineText(bulletContent, { fontSize: baseFontSize, color: textColor }, `${lineKey}-bul`)}
            </Text>
          </View>
        </View>
      );
      continue;
    }

    // 8. Blockquote / Callout (> text)
    const quoteMatch = line.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      const quoteContent = quoteMatch[1];
      renderedElements.push(
        <View key={lineKey} style={styles.quoteContainer}>
          <MaterialIcons name="format-quote" size={18} color="#6366f1" style={{ marginRight: 6 }} />
          <Text style={[styles.quoteText, { fontSize: baseFontSize }]}>
            {renderInlineText(quoteContent, styles.quoteText, `${lineKey}-quo`)}
          </Text>
        </View>
      );
      continue;
    }

    // 9. Key-Value Row (e.g. "**Student Name:** ____________________" or "**Batch:** Junior Spoken English")
    if (/^\*\*[^*]+:\*\*/.test(line)) {
      renderedElements.push(
        <View key={lineKey} style={styles.metaRowContainer}>
          <Text style={[styles.paragraphText, { fontSize: baseFontSize, color: textColor }]}>
            {renderInlineText(line, { fontSize: baseFontSize, color: textColor }, `${lineKey}-meta`)}
          </Text>
        </View>
      );
      continue;
    }

    // 10. Default Paragraph Line
    renderedElements.push(
      <View key={lineKey} style={styles.paragraphContainer}>
        <Text style={[styles.paragraphText, { fontSize: baseFontSize, color: textColor, lineHeight: baseFontSize * 1.5 }]}>
          {renderInlineText(line, { fontSize: baseFontSize, color: textColor }, `${lineKey}-p`)}
        </Text>
      </View>
    );
  }

  return <View style={styles.container}>{renderedElements}</View>;
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  emptyLine: {
    height: 6,
  },

  // Inline Token Styles
  inlineBold: {
    fontWeight: '700',
    color: '#0f172a',
  },
  inlineItalic: {
    fontStyle: 'italic',
    color: '#475569',
  },
  inlineBoldItalic: {
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#0f172a',
  },
  inlineCode: {
    fontFamily: 'monospace',
    backgroundColor: '#f1f5f9',
    color: '#e11d48',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    fontSize: 13,
  },
  inlineLink: {
    color: '#2563eb',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  inlineBlank: {
    color: '#94a3b8',
    letterSpacing: 2,
    fontWeight: '600',
  },

  // Dividers
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    justifyContent: 'center',
  },
  dividerLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#e2e8f0',
  },
  dividerDiamond: {
    width: 6,
    height: 6,
    backgroundColor: '#cbd5e1',
    transform: [{ rotate: '45deg' }],
    marginHorizontal: 8,
  },

  // H1 Heading
  h1Container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  speakingHeaderContainer: {
    backgroundColor: '#f0f9ff',
    borderLeftColor: '#0284c7',
  },
  ruleHeaderContainer: {
    backgroundColor: '#fffbeb',
    borderLeftColor: '#d97706',
  },
  h1AccentBar: {
    width: 0,
  },
  h1Content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
  },
  h1Text: {
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.3,
  },

  // H2 Heading
  h2Container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: '#f1f5f9',
  },
  h2PartContainer: {
    backgroundColor: '#f8fafc',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderBottomWidth: 0,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  partBadge: {
    backgroundColor: COLORS.primary,
    padding: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  h2Text: {
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.2,
    flex: 1,
  },

  // H3 Heading
  h3Container: {
    marginTop: 8,
    marginBottom: 4,
  },
  h3Text: {
    fontWeight: '700',
    color: '#334155',
  },

  // H4 Heading
  h4Container: {
    marginTop: 6,
    marginBottom: 2,
  },
  h4Text: {
    fontWeight: '600',
    color: '#475569',
  },

  // Marks Badge
  marksBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  marksBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },

  // Numbered Question Item
  numberedItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 5,
    paddingLeft: 2,
  },
  numberBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  numberBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  itemTextContent: {
    flex: 1,
  },

  // Multiple Choice Option
  choiceOptionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 3,
    marginLeft: 16,
  },
  choiceLetterBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  choiceLetterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  choiceText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Answer Box Line
  answerBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 4,
    marginLeft: 8,
  },
  answerIcon: {
    marginRight: 6,
  },
  answerText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },

  // Bullet items
  bulletItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 8,
    marginRight: 8,
  },

  // Blockquotes
  quoteContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
    padding: 8,
    borderRadius: 6,
    marginVertical: 4,
  },
  quoteText: {
    fontStyle: 'italic',
    color: '#334155',
    flex: 1,
  },

  // Meta Row & Paragraph
  metaRowContainer: {
    marginVertical: 2,
  },
  paragraphContainer: {
    marginVertical: 2,
  },
  paragraphText: {
    fontSize: 14,
    color: '#1e293b',
  },
});

export default MarkdownRenderer;
