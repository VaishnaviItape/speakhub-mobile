import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

interface AttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'leave';
  batchName?: string;
  remarks?: string;
  markedBy?: string;
}

export default function AttendanceScreen() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Present' | 'Absent'>('All');

  useEffect(() => {
    if (user?.id) fetchAttendance();
  }, [user]);

  const fetchAttendance = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const q = query(collection(db, 'attendance'), where('studentId', '==', user.id));
      const snapshot = await getDocs(q);

      const batchMap: { [batchId: string]: string } = {};
      const list: AttendanceRecord[] = [];

      for (const d of snapshot.docs) {
        const data = d.data();
        let bName = batchMap[data.batchId];

        if (!bName && data.batchId) {
          try {
            const bSnap = await getDoc(doc(db, 'batches', data.batchId));
            if (bSnap.exists()) {
              bName = bSnap.data().batchName || '';
              batchMap[data.batchId] = bName;
            }
          } catch (e) {}
        }

        list.push({
          id: d.id,
          date: data.date,
          status: data.status || 'present',
          batchName: bName || data.batchId,
          remarks: data.remarks || '',
          markedBy: data.markedBy || ''
        });
      }

      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLogs(list);
    } catch (error) {
      console.error("Error fetching mobile attendance:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const presentCount = logs.filter(l => l.status === 'present').length;
  const absentCount = logs.filter(l => l.status === 'absent').length;
  const lateCount = logs.filter(l => l.status === 'late' || l.status === 'leave').length;
  const totalCount = logs.length;
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

  const filteredLogs = logs.filter(item => {
    if (activeFilter === 'Present') return item.status === 'present';
    if (activeFilter === 'Absent') return item.status === 'absent';
    return true;
  });

  const renderAttendanceCard = ({ item }: { item: AttendanceRecord }) => {
    let badgeBg = '#dcfce7';
    let badgeText = '#15803d';
    let statusLabel = 'Present';

    if (item.status === 'absent') {
      badgeBg = '#fee2e2';
      badgeText = '#b91c1c';
      statusLabel = 'Absent';
    } else if (item.status === 'late') {
      badgeBg = '#fef3c7';
      badgeText = '#b45309';
      statusLabel = 'Late';
    } else if (item.status === 'leave') {
      badgeBg = '#f3e8ff';
      badgeText = '#6b21a8';
      statusLabel = 'Leave';
    }

    const formattedDate = new Date(item.date).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return (
      <View style={styles.recordCard}>
        <View style={styles.recordHeader}>
          <View style={styles.dateContainer}>
            <MaterialIcons name="event" size={18} color={COLORS.primary} />
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: badgeBg }]}>
            <Text style={[styles.badgeText, { color: badgeText }]}>{statusLabel}</Text>
          </View>
        </View>

        {item.batchName ? (
          <Text style={styles.batchText}>Batch: {item.batchName}</Text>
        ) : null}

        {item.remarks ? (
          <Text style={styles.remarksText}>Note: {item.remarks}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Banner Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{attendanceRate}%</Text>
          <Text style={styles.statLabel}>Attendance Rate</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#16a34a' }]}>{presentCount}</Text>
          <Text style={styles.statLabel}>Days Present</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#dc2626' }]}>{absentCount}</Text>
          <Text style={styles.statLabel}>Days Absent</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(['All', 'Present', 'Absent'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, activeFilter === tab && styles.activeFilterTab]}
            onPress={() => setActiveFilter(tab)}
          >
            <Text style={[styles.filterText, activeFilter === tab && styles.activeFilterText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading attendance records...</Text>
        </View>
      ) : filteredLogs.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="event-available" size={48} color={COLORS.textLight} />
          <Text style={styles.emptyText}>No attendance records found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={item => item.id}
          renderItem={renderAttendanceCard}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background || '#f8fafc',
    padding: 16,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary || '#4f46e5',
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMedium || '#64748b',
    marginTop: 4,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: '60%',
    backgroundColor: '#e2e8f0',
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeFilterTab: {
    backgroundColor: COLORS.primary || '#4f46e5',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMedium || '#64748b',
  },
  activeFilterText: {
    color: '#ffffff',
  },
  listContainer: {
    paddingBottom: 20,
  },
  recordCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textDark || '#0f172a',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  batchText: {
    fontSize: 12,
    color: COLORS.textMedium || '#64748b',
    marginTop: 2,
  },
  remarksText: {
    fontSize: 12,
    color: '#6b21a8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMedium || '#64748b',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMedium || '#64748b',
  }
});
