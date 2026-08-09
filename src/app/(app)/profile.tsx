import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity 
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function StudentHubScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.explorerWrapper}>
          <Text style={styles.explorerTitle}>Popular Courses & Categories</Text>
          <View style={styles.pastelGrid}>
            <TouchableOpacity style={[styles.pastelCard, { backgroundColor: '#e6f4ea' }]} onPress={() => router.push('/(app)/fees')}>
              <MaterialIcons name="receipt-long" size={28} color="#137333" />
              <Text style={styles.pastelCardTitle}>Fee Paid</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.pastelCard, { backgroundColor: '#fff8e1' }]} onPress={() => router.push('/(app)/homework')}>
              <MaterialIcons name="menu-book" size={28} color="#b45309" />
              <Text style={styles.pastelCardTitle}>Homework</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.pastelCard, { backgroundColor: '#e8f0fe' }]} onPress={() => router.push('/(app)/exams')}>
              <MaterialIcons name="stars" size={28} color="#1a73e8" />
              <Text style={styles.pastelCardTitle}>Test Results</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.pastelCard, { backgroundColor: '#ffebee' }]} onPress={() => router.push('/(app)/attendance')}>
              <MaterialIcons name="event-available" size={28} color="#c2410c" />
              <Text style={styles.pastelCardTitle}>Attendance</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  explorerWrapper: {
    padding: 20,
    paddingTop: 24,
  },
  explorerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 20,
  },
  pastelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  pastelCard: {
    width: '47%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  pastelCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 10,
  },
});
