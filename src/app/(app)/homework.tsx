import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../../constants/theme';

const MOCK_HOMEWORK = [
  { id: '1', title: 'Phonics Worksheet 1', subject: 'Scholar Phonics', dueDate: 'Tomorrow, 5:00 PM', status: 'pending' },
  { id: '2', title: 'Abacus Practice Sheet', subject: 'Abacus', dueDate: 'Today, 8:00 PM', status: 'submitted' },
];

export default function HomeworkScreen() {
  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({});
      if (result.type === 'success') {
        Alert.alert('Success', 'File uploaded successfully');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const renderHomeworkCard = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.subject}>{item.subject}</Text>
        <View style={[styles.statusBadge, item.status === 'submitted' ? styles.statusCompleted : styles.statusPending]}>
          <Text style={item.status === 'submitted' ? styles.statusTextCompleted : styles.statusTextPending}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.date}>Due: {item.dueDate}</Text>
      
      {item.status === 'pending' && (
        <TouchableOpacity style={styles.uploadButton} onPress={handleUpload}>
          <Text style={styles.uploadButtonText}>Upload Submission</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList 
        data={MOCK_HOMEWORK}
        renderItem={renderHomeworkCard}
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
    marginBottom: 10,
  },
  subject: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    flex: 1,
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: '#fff3cd',
  },
  statusCompleted: {
    backgroundColor: COLORS.successBackground,
  },
  statusTextPending: {
    color: '#856404',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusTextCompleted: {
    color: COLORS.successText,
    fontSize: 12,
    fontWeight: 'bold',
  },
  date: {
    fontSize: 14,
    color: COLORS.textMedium,
    marginBottom: 15,
  },
  uploadButton: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: COLORS.textInverse,
    fontWeight: 'bold',
    fontSize: 16,
  }
});
