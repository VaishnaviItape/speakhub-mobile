import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Linking } from 'react-native';
import { COLORS } from '../../constants/theme';

const MOCK_NOTES = [
  { id: '1', title: 'Chapter 1: Grammar Basics', type: 'PDF', course: 'Spoken English', url: 'https://example.com/grammar.pdf' },
  { id: '2', title: 'Phonics Sounds Video', type: 'Video', course: 'Scholar Phonics', url: 'https://example.com/phonics.mp4' },
  { id: '3', title: 'Level 1 Practice Sheet', type: 'Worksheet', course: 'Abacus', url: 'https://example.com/sheet.pdf' }
];

export default function NotesScreen() {
  const openNote = (url: string) => {
    // In a real app, you might use expo-web-browser or a PDF viewer
    Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  const renderNoteCard = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{item.title}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{item.type}</Text>
        </View>
      </View>
      <Text style={styles.course}>{item.course}</Text>
      
      <TouchableOpacity style={styles.viewButton} onPress={() => openNote(item.url)}>
        <Text style={styles.viewButtonText}>View Material</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList 
        data={MOCK_NOTES}
        renderItem={renderNoteCard}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  card: {
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    flex: 1,
    marginRight: 10,
  },
  course: {
    fontSize: 14,
    color: COLORS.textMedium,
    marginBottom: 15,
  },
  typeBadge: {
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  typeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  viewButtonText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 16,
  }
});
