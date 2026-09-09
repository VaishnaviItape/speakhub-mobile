import React from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
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
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|_{2,})/g;

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index === tokenRegex.lastIndex) {
      tokenRegex.lastIndex++;
    }
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
    } else if (/^_{2,}$/.test(token)) {
      // Fill-in-the-blank line representation (solid neat line)
      parts.push(
        <Text key={tokenKey} style={[baseStyle, styles.inlineBlank]}>
          {' ________________ '}
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
 * Premium Mobile Worksheet & Markdown Renderer for React Native
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  baseFontSize = 14,
  textColor = '#0f172a',
  isCompact = false,
}) => {
  if (!content || typeof content !== 'string') return null;

  const rawLines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines = rawLines.map(l => l.trim());
  const renderedElements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineKey = `md-line-${i}`;

    // Empty line -> spacing
    if (!line) {
      renderedElements.push(<View key={lineKey} style={styles.emptyLine} />);
      i++;
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
      i++;
      continue;
    }

    // 2. Institute / Course Banner Header
    // E.g. "JUNIOR SPOKEN ENGLISH COURSE" or "# SPEAK HUB ACADEMY"
    const isInstituteCourseHeader =
      /^(junior spoken english|spoken english|speak hub|grammar masterclass|english fluency|foundation course|advanced english)/i.test(line) &&
      !line.includes(':') &&
      line.length < 60;

    if (isInstituteCourseHeader && i < 3) {
      renderedElements.push(
        <View key={lineKey} style={styles.instituteHeaderCard}>
          <View style={styles.instituteIconCircle}>
            <MaterialIcons name="school" size={18} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.instituteHeaderSubtitle}>SPEAK HUB ACADEMY</Text>
            <Text style={styles.instituteHeaderTitle}>{line.replace(/^#+\s*/, '')}</Text>
          </View>
        </View>
      );
      i++;
      continue;
    }

    // 3. Worksheet Title Header
    // E.g. "HOMEWORK – PAST PERFECT TENSE" or "# HOMEWORK - PRESENT TENSE"
    const isWorksheetTitle =
      /^(homework|assignment|practice worksheet|worksheet|daily task)\s*[-–—:]/i.test(line) ||
      /^#\s+(homework|assignment|daily practice)/i.test(line);

    if (isWorksheetTitle) {
      const cleanTitle = line.replace(/^#+\s*/, '');
      renderedElements.push(
        <View key={lineKey} style={styles.worksheetTitleCard}>
          <View style={styles.worksheetTitleTag}>
            <MaterialIcons name="menu-book" size={13} color="#be123c" />
            <Text style={styles.worksheetTitleTagText}>WORKSHEET</Text>
          </View>
          <Text style={styles.worksheetMainTitle}>{cleanTitle}</Text>
        </View>
      );
      i++;
      continue;
    }

    // 4. Student Meta Info Box Detection (Student Name, Date, Batch, Topic, Marathi, Total Marks)
    // If consecutive lines are student meta fields, bundle them together into a nice card
    const isMetaField = (str: string) =>
      /^(student name|name|date|batch|topic|मराठी|marathi|total marks|marks|roll no)\s*[:：]/i.test(str) ||
      /^\*\*(student name|name|date|batch|topic|मराठी|marathi|total marks|marks)\*\*/i.test(str);

    if (isMetaField(line)) {
      const metaItems: { label: string; value: string }[] = [];

      while (i < lines.length && (isMetaField(lines[i]) || lines[i] === '')) {
        if (lines[i] !== '') {
          const mLine = lines[i].replace(/\*\*/g, '');
          const colonIdx = mLine.indexOf(':') !== -1 ? mLine.indexOf(':') : mLine.indexOf('：');
          if (colonIdx !== -1) {
            const lbl = mLine.substring(0, colonIdx).trim();
            const val = mLine.substring(colonIdx + 1).trim();
            metaItems.push({ label: lbl, value: val });
          } else {
            metaItems.push({ label: 'Info', value: mLine });
          }
        }
        i++;
      }

      renderedElements.push(
        <View key={lineKey} style={styles.studentMetaCard}>
          <View style={styles.studentMetaHeader}>
            <MaterialIcons name="assignment-ind" size={16} color={COLORS.primary} />
            <Text style={styles.studentMetaHeaderTitle}>Student & Worksheet Details</Text>
          </View>
          <View style={styles.studentMetaGrid}>
            {metaItems.map((item, idx) => (
              <View key={`meta-${idx}`} style={styles.studentMetaRow}>
                <Text style={styles.studentMetaLabel}>{item.label}:</Text>
                <Text style={styles.studentMetaValue} numberOfLines={2}>
                  {item.value || '__________________'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      );
      continue;
    }

    // 5. Section / Part Header: e.g. "PART A – FILL IN THE BLANKS", "## Part A", "SECTION 1"
    const partMatch = line.match(/^(?:##\s+)?(PART\s+[A-Z0-9]+|SECTION\s+[A-Z0-9]+)\s*[-–—:]?\s*(.*)$/i);
    if (partMatch) {
      const partTag = partMatch[1].toUpperCase();
      const partTitle = partMatch[2] ? partMatch[2].trim() : '';

      renderedElements.push(
        <View key={lineKey} style={styles.partCardContainer}>
          <View style={styles.partHeaderRow}>
            <View style={styles.partBadgePill}>
              <MaterialIcons name="task-alt" size={14} color="#ffffff" />
              <Text style={styles.partBadgeText}>{partTag}</Text>
            </View>
            {partTitle ? (
              <Text style={styles.partTitleText}>{partTitle}</Text>
            ) : null}
          </View>
        </View>
      );
      i++;
      continue;
    }

    // 6. Markdown Headings (# Heading, ## Heading, ### Heading, #### Heading)
    if (/^#+\s+(.+)$/.test(line)) {
      const hMatch = line.match(/^(#+)\s+(.+)$/);
      const level = hMatch ? hMatch[1].length : 1;
      const headingText = hMatch ? hMatch[2].trim() : '';

      const isSpeaking = /speaking\s*practice/i.test(headingText);
      const isRule = /important\s*rule|rule|grammar\s*rule|formula/i.test(headingText);

      renderedElements.push(
        <View
          key={lineKey}
          style={[
            level === 1 ? styles.h1Container : styles.h2Container,
            isSpeaking && styles.speakingHeaderContainer,
            isRule && styles.ruleHeaderContainer,
          ]}
        >
          {isSpeaking ? (
            <MaterialIcons name="record-voice-over" size={18} color="#0284c7" style={{ marginRight: 6 }} />
          ) : isRule ? (
            <MaterialIcons name="lightbulb" size={18} color="#d97706" style={{ marginRight: 6 }} />
          ) : (
            <MaterialIcons name="menu-book" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
          )}
          <Text style={[styles.h1Text, { fontSize: level === 1 ? baseFontSize + 3 : baseFontSize + 1 }]}>
            {renderInlineText(headingText, styles.h1Text, `${lineKey}-h`)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 7. Marks Badge: e.g. "(5 Marks – 1 mark each)", "**(5 Marks)**", "[Total Marks: 30]"
    if (/^\(+\s*\d+\s*Marks.*?\)+$/i.test(line) || /^\*\*\(\s*\d+\s*Marks.*?\)\*\*$/i.test(line) || /^\[\s*Total Marks:.*\]$/i.test(line)) {
      const cleanText = line.replace(/[*[\]()]/g, '').trim();
      renderedElements.push(
        <View key={lineKey} style={styles.marksBadge}>
          <MaterialIcons name="stars" size={14} color="#b45309" />
          <Text style={styles.marksBadgeText}>{cleanText}</Text>
        </View>
      );
      i++;
      continue;
    }

    // 8. Instructions Prompt: e.g. "Complete the sentences using HAD + V3 (past participle)."
    const isInstructionLine =
      /^(complete the sentences|fill in the blanks|choose the correct|translate into|write the correct|read the following|convert the sentences|change into)/i.test(line) ||
      /^instructions?:\s*/i.test(line);

    if (isInstructionLine) {
      renderedElements.push(
        <View key={lineKey} style={styles.instructionPromptCard}>
          <MaterialIcons name="info-outline" size={16} color="#4338ca" style={{ marginRight: 6, marginTop: 1 }} />
          <Text style={styles.instructionPromptText}>
            {renderInlineText(line.replace(/^instructions?:\s*/i, ''), styles.instructionPromptText, `${lineKey}-inst`)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 9. Numbered Question Items (e.g. "1. I _____ my homework before dinner.")
    // AND automatically merge next-line verb prompts like "(complete)", "(eat)", "(watch)"!
    const numberedMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (numberedMatch) {
      const num = numberedMatch[1];
      let questionText = numberedMatch[2].trim();
      let verbPrompt = '';

      // Check if next line is a verb prompt in parenthesis e.g. "(complete)"
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const verbMatch = nextLine.match(/^\(([a-zA-Z\s,/-]+)\)$/);
        if (verbMatch && verbMatch[1].length < 30 && !nextLine.toLowerCase().includes('marks')) {
          verbPrompt = verbMatch[1].trim();
          i++; // Consume the verb prompt line
        }
      }

      // Check if verb prompt is at the end of the current line e.g. "1. I _____ dinner. (eat)"
      const inlineVerbMatch = questionText.match(/\(([a-zA-Z\s,/-]+)\)$/);
      if (!verbPrompt && inlineVerbMatch && inlineVerbMatch[1].length < 30 && !questionText.toLowerCase().includes('marks')) {
        verbPrompt = inlineVerbMatch[1].trim();
        questionText = questionText.replace(/\(([a-zA-Z\s,/-]+)\)$/, '').trim();
      }

      renderedElements.push(
        <View key={lineKey} style={styles.numberedQuestionCard}>
          <View style={styles.numberedQuestionRow}>
            {/* Number Circle Badge */}
            <View style={styles.numberBadgeCircle}>
              <Text style={styles.numberBadgeText}>{num}</Text>
            </View>

            {/* Question Text */}
            <View style={styles.questionTextCol}>
              <Text style={[styles.questionMainText, { fontSize: baseFontSize }]}>
                {renderInlineText(questionText, { fontSize: baseFontSize, color: '#0f172a' }, `${lineKey}-q`)}
              </Text>

              {/* Verb Prompt Pill if available */}
              {verbPrompt ? (
                <View style={styles.verbPromptPill}>
                  <MaterialIcons name="edit" size={11} color="#0369a1" />
                  <Text style={styles.verbPromptText}>verb: <Text style={{ fontWeight: '800' }}>{verbPrompt}</Text></Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      );
      i++;
      continue;
    }

    // 10. Multiple Choice Options (e.g. "A. She have finished her work." or "A) ...")
    const optionMatch = line.match(/^([A-D|a-d])[\.\)]\s+(.+)$/);
    if (optionMatch) {
      const optionLetter = optionMatch[1].toUpperCase();
      const optionContent = optionMatch[2];

      renderedElements.push(
        <View key={lineKey} style={styles.choiceOptionCard}>
          <View style={styles.choiceLetterBadge}>
            <Text style={styles.choiceLetterText}>{optionLetter}</Text>
          </View>
          <View style={styles.choiceTextCol}>
            <Text style={[styles.choiceText, { fontSize: baseFontSize }]}>
              {renderInlineText(optionContent, { fontSize: baseFontSize, color: '#1e293b' }, `${lineKey}-opt`)}
            </Text>
          </View>
        </View>
      );
      i++;
      continue;
    }

    // 11. Answer / Correct Blank Prompt Line (e.g. "**Answer:** ___________________")
    if (/^\s*\*\*(Answer|Correct|उत्तर):\*\*/i.test(line) || /^(Answer|Correct|उत्तर):/i.test(line)) {
      renderedElements.push(
        <View key={lineKey} style={styles.answerBoxContainer}>
          <MaterialIcons name="edit-note" size={18} color="#6366f1" style={{ marginRight: 6 }} />
          <Text style={[styles.answerText, { fontSize: baseFontSize }]}>
            {renderInlineText(line, styles.answerText, `${lineKey}-ans`)}
          </Text>
        </View>
      );
      i++;
      continue;
    }

    // 12. Bullet items (- item, * item, • item)
    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      const bulletContent = bulletMatch[1];
      renderedElements.push(
        <View key={lineKey} style={styles.bulletItemContainer}>
          <View style={styles.bulletDot} />
          <View style={styles.choiceTextCol}>
            <Text style={[styles.paragraphText, { fontSize: baseFontSize, color: textColor }]}>
              {renderInlineText(bulletContent, { fontSize: baseFontSize, color: textColor }, `${lineKey}-bul`)}
            </Text>
          </View>
        </View>
      );
      i++;
      continue;
    }

    // 13. Blockquote / Callout (> text)
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
      i++;
      continue;
    }

    // 14. Default Paragraph Line
    renderedElements.push(
      <View key={lineKey} style={styles.paragraphContainer}>
        <Text style={[styles.paragraphText, { fontSize: baseFontSize, color: textColor, lineHeight: baseFontSize * 1.55 }]}>
          {renderInlineText(line, { fontSize: baseFontSize, color: textColor }, `${lineKey}-p`)}
        </Text>
      </View>
    );
    i++;
  }

  return <View style={styles.container}>{renderedElements}</View>;
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  emptyLine: {
    height: 8,
  },

  // Inline Token Styles
  inlineBold: {
    fontWeight: '800',
    color: '#0f172a',
  },
  inlineItalic: {
    fontStyle: 'italic',
    color: '#334155',
  },
  inlineBoldItalic: {
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#0f172a',
  },
  inlineCode: {
    fontFamily: 'monospace',
    backgroundColor: '#f1f5f9',
    color: '#e11d48',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    fontSize: 13,
  },
  inlineLink: {
    color: '#2563eb',
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  inlineBlank: {
    color: '#64748b',
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Dividers
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
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

  // 1. Institute Header Card
  instituteHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  instituteIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instituteHeaderSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.8,
  },
  instituteHeaderTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 1,
  },

  // 2. Worksheet Title Card
  worksheetTitleCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  worksheetTitleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF1F2',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FFE4E6',
  },
  worksheetTitleTagText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#be123c',
    letterSpacing: 0.5,
  },
  worksheetMainTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    lineHeight: 22,
  },

  // 3. Student Meta Details Card
  studentMetaCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  studentMetaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 8,
  },
  studentMetaHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  studentMetaGrid: {
    gap: 6,
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  studentMetaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    minWidth: 90,
  },
  studentMetaValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    textAlign: 'right',
  },

  // 4. Part / Section Card
  partCardContainer: {
    backgroundColor: '#F1F5F9',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  partHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  partBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  partBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  partTitleText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
  },

  // Headings
  h1Container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  h2Container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  speakingHeaderContainer: {
    backgroundColor: '#f0f9ff',
    borderLeftColor: '#0284c7',
  },
  ruleHeaderContainer: {
    backgroundColor: '#fffbeb',
    borderLeftColor: '#d97706',
  },
  h1Text: {
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.3,
    flex: 1,
  },

  // Marks Badge
  marksBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  marksBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#92400E',
  },

  // Instruction Prompt Card
  instructionPromptCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    padding: 9,
    marginVertical: 6,
  },
  instructionPromptText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3730A3',
    flex: 1,
    lineHeight: 18,
  },

  // Numbered Question Card (with merged verb pill)
  numberedQuestionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  numberedQuestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  numberBadgeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  numberBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E293B',
  },
  questionTextCol: {
    flex: 1,
  },
  questionMainText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    lineHeight: 20,
  },
  verbPromptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  verbPromptText: {
    fontSize: 11.5,
    color: '#0369A1',
    fontWeight: '600',
  },

  // Multiple Choice Options
  choiceOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginVertical: 3,
    marginLeft: 12,
  },
  choiceLetterBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  choiceLetterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  choiceTextCol: {
    flex: 1,
  },
  choiceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },

  // Answer Box
  answerBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 4,
    marginLeft: 8,
  },
  answerText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },

  // Bullets
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
    marginTop: 7,
    marginRight: 8,
  },

  // Quotes
  quoteContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
    padding: 8,
    borderRadius: 6,
    marginVertical: 4,
  },
  quoteText: {
    fontStyle: 'italic',
    color: '#334155',
    flex: 1,
  },

  // Paragraphs
  paragraphContainer: {
    marginVertical: 2,
  },
  paragraphText: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '500',
  },
});

export default MarkdownRenderer;
