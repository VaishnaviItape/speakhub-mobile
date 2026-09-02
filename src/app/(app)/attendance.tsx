import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ScrollView 
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { db } from '../../config/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';

interface AttendanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'late' | 'leave' | 'holiday';
  batchName?: string;
  remarks?: string;
  markedBy?: string;
  isHoliday?: boolean;
}

interface HolidayRecord {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  description?: string;
}

export default function AttendanceScreen() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const { showLoader, hideLoader } = useLoader();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Present' | 'Absent' | 'Holiday'>('All');

  // Calendar State
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(new Date().toISOString().split('T')[0]);

  // ── Fetch Attendance (real-time) ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const userId = user.id || (user as any).uid;
    if (!userId) return;

    showLoader();

    const q = query(collection(db, 'attendance'), where('studentId', '==', userId));
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
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
            markedBy: data.markedBy || '',
            isHoliday: data.isHoliday || data.status === 'holiday'
          });
        }

        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setLogs(list);
        hideLoader();
      },
      (error) => {
        console.error("Realtime attendance snapshot error:", error);
        hideLoader();
      }
    );

    return () => unsubscribe();
  }, [user]);

  // ── Fetch Holidays (real-time) ────────────────────────────────────────────
  useEffect(() => {
    const hq = query(collection(db, 'holidays'));
    const unsubHolidays = onSnapshot(
      hq,
      (snap) => {
        const list: HolidayRecord[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, ...d.data() } as HolidayRecord);
        });
        setHolidays(list);
      },
      (err) => console.error('Holiday snapshot error:', err)
    );
    return () => unsubHolidays();
  }, []);

  // ── Derived maps ──────────────────────────────────────────────────────────
  const holidayMap: { [dateStr: string]: HolidayRecord } = {};
  holidays.forEach(h => { holidayMap[h.date] = h; });

  // Overall Statistics (exclude holidays from rate calc)
  const presentCount = logs.filter(l => l.status === 'present').length;
  const absentCount = logs.filter(l => l.status === 'absent').length;
  const lateCount = logs.filter(l => l.status === 'late' || l.status === 'leave').length;
  const holidayCount = logs.filter(l => l.status === 'holiday' || l.isHoliday).length;
  const totalCount = logs.length;
  // Attendance rate calculated excluding holiday days
  const effectiveTotal = totalCount - holidayCount;
  const attendanceRate = effectiveTotal > 0 ? Math.round((presentCount / effectiveTotal) * 100) : 100;

  // Calendar Helpers
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  // Map logs by date string YYYY-MM-DD
  const logsByDateMap: { [dateStr: string]: AttendanceRecord } = {};
  logs.forEach(log => {
    if (log.date) {
      logsByDateMap[log.date] = log;
    }
  });

  const getMonthDaysGrid = () => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    // Adjust so Monday is 0
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const grid: ({ day: number; dateStr: string } | null)[] = [];
    for (let i = 0; i < startOffset; i++) {
      grid.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const monthPadded = String(month + 1).padStart(2, '0');
      const dayPadded = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthPadded}-${dayPadded}`;
      grid.push({ day: d, dateStr });
    }

    return grid;
  };

  const monthGrid = getMonthDaysGrid();
  const selectedLog = logsByDateMap[selectedDateStr];
  const selectedHoliday = holidayMap[selectedDateStr];

  const monthName = currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().split('T')[0];

  const filteredLogs = logs.filter(item => {
    if (activeFilter === 'Present') return item.status === 'present';
    if (activeFilter === 'Absent') return item.status === 'absent';
    if (activeFilter === 'Holiday') return item.status === 'holiday' || item.isHoliday;
    return true;
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'present':  return { bg: '#dcfce7', text: '#15803d', label: 'Present' };
      case 'absent':   return { bg: '#fee2e2', text: '#b91c1c', label: 'Absent' };
      case 'late':     return { bg: '#fef3c7', text: '#b45309', label: 'Late' };
      case 'leave':    return { bg: '#f3e8ff', text: '#6b21a8', label: 'Leave' };
      case 'holiday':  return { bg: '#fef3c7', text: '#92400e', label: 'Holiday 🎉' };
      default:         return { bg: '#dcfce7', text: '#15803d', label: 'Present' };
    }
  };

  const renderAttendanceCard = ({ item }: { item: AttendanceRecord }) => {
    const { bg, text, label } = getStatusStyle(item.status);
    const holiday = holidayMap[item.date];

    const formattedDate = new Date(item.date + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return (
      <View style={[styles.recordCard, (item.status === 'holiday' || item.isHoliday) && styles.holidayCard]}>
        <View style={styles.recordHeader}>
          <View style={styles.dateContainer}>
            <MaterialIcons name="event" size={18} color={(item.status === 'holiday' || item.isHoliday) ? '#d97706' : COLORS.primary} />
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
          </View>
        </View>

        {/* Holiday name strip */}
        {(item.status === 'holiday' || item.isHoliday) && holiday && (
          <View style={styles.holidayNameRow}>
            <Text style={styles.holidayNameText}>🎉 {holiday.name}</Text>
            {holiday.description ? (
              <Text style={styles.holidayDescText}>{holiday.description}</Text>
            ) : null}
          </View>
        )}

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

        <View style={styles.statDivider} />

        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#d97706' }]}>{holidayCount}</Text>
          <Text style={styles.statLabel}>Holidays</Text>
        </View>
      </View>

      {/* Mode Switcher: Calendar View vs List View */}
      <View style={styles.viewToggleContainer}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'calendar' && styles.activeToggleBtn]}
          onPress={() => setViewMode('calendar')}
        >
          <MaterialIcons 
            name="calendar-month" 
            size={18} 
            color={viewMode === 'calendar' ? '#ffffff' : (COLORS.textMedium || '#64748b')} 
          />
          <Text style={[styles.toggleText, viewMode === 'calendar' && styles.activeToggleText]}>
            Calendar View
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'list' && styles.activeToggleBtn]}
          onPress={() => setViewMode('list')}
        >
          <MaterialIcons 
            name="list-alt" 
            size={18} 
            color={viewMode === 'list' ? '#ffffff' : (COLORS.textMedium || '#64748b')} 
          />
          <Text style={[styles.toggleText, viewMode === 'list' && styles.activeToggleText]}>
            List View
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'calendar' ? (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Monthly Calendar Header */}
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavBtn}>
                <MaterialIcons name="chevron-left" size={26} color={COLORS.textDark || '#0f172a'} />
              </TouchableOpacity>

              <Text style={styles.monthTitle}>{monthName}</Text>

              <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavBtn}>
                <MaterialIcons name="chevron-right" size={26} color={COLORS.textDark || '#0f172a'} />
              </TouchableOpacity>
            </View>

            {/* Day of Week Header */}
            <View style={styles.weekHeaderRow}>
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => (
                <Text key={i} style={[styles.weekDayText, i >= 5 && { color: '#ef4444' }]}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.gridContainer}>
              {monthGrid.map((item, index) => {
                if (!item) {
                  return <View key={`empty-${index}`} style={styles.dayCellEmpty} />;
                }

                const record = logsByDateMap[item.dateStr];
                const isHolidayDate = !!holidayMap[item.dateStr];
                const isSelected = selectedDateStr === item.dateStr;
                const isToday = item.dateStr === todayStr;

                let dotColor = 'transparent';
                let cellBg = '#ffffff';

                // Holiday takes priority in color coding
                if (isHolidayDate && !record) {
                  dotColor = '#f59e0b';
                  cellBg = '#fffbeb';
                } else if (record?.status === 'present') {
                  dotColor = '#16a34a';
                  cellBg = '#f0fdf4';
                } else if (record?.status === 'absent') {
                  dotColor = '#dc2626';
                  cellBg = '#fef2f2';
                } else if (record?.status === 'late') {
                  dotColor = '#d97706';
                  cellBg = '#fffbeb';
                } else if (record?.status === 'leave') {
                  dotColor = '#9333ea';
                  cellBg = '#faf5ff';
                } else if (record?.status === 'holiday' || record?.isHoliday) {
                  dotColor = '#f59e0b';
                  cellBg = '#fffbeb';
                }

                return (
                  <TouchableOpacity
                    key={item.dateStr}
                    style={[
                      styles.dayCell,
                      { backgroundColor: cellBg },
                      isToday && styles.todayCell,
                      isSelected && styles.selectedCell,
                      isHolidayDate && !isSelected && styles.holidayCell
                    ]}
                    onPress={() => setSelectedDateStr(item.dateStr)}
                  >
                    <Text style={[
                      styles.dayNumberText,
                      isSelected && { color: '#ffffff', fontWeight: 'bold' },
                      isHolidayDate && !isSelected && { color: '#92400e' }
                    ]}>
                      {item.day}
                    </Text>

                    {isHolidayDate && !isSelected ? (
                      <Text style={styles.holidayDayEmoji}>🎉</Text>
                    ) : record ? (
                      <View style={[
                        styles.statusDot, 
                        { backgroundColor: isSelected ? '#ffffff' : dotColor }
                      ]} />
                    ) : (
                      <View style={{ height: 6 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Legend Indicators */}
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#16a34a' }]} />
                <Text style={styles.legendText}>Present</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
                <Text style={styles.legendText}>Absent</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#d97706' }]} />
                <Text style={styles.legendText}>Late</Text>
              </View>
              <View style={styles.legendItem}>
                <Text style={styles.legendEmoji}>🎉</Text>
                <Text style={[styles.legendText, { color: '#92400e' }]}>Holiday</Text>
              </View>
            </View>
          </View>

          {/* Selected Date Detail Card */}
          <View style={[styles.detailCard, selectedHoliday && styles.holidayDetailCard]}>
            <Text style={styles.detailCardTitle}>
              {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </Text>

            {/* Holiday Detail Banner */}
            {selectedHoliday && (
              <View style={styles.holidayDetailBanner}>
                <Text style={styles.holidayDetailIcon}>🎉</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.holidayDetailName}>{selectedHoliday.name}</Text>
                  {selectedHoliday.description ? (
                    <Text style={styles.holidayDetailDesc}>{selectedHoliday.description}</Text>
                  ) : null}
                </View>
              </View>
            )}

            {selectedLog ? (
              <View style={styles.selectedDetailBody}>
                <View style={styles.detailRowInline}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <View style={[
                    styles.badge,
                    {
                      backgroundColor: getStatusStyle(selectedLog.status).bg
                    }
                  ]}>
                    <Text style={[
                      styles.badgeText,
                      {
                        color: getStatusStyle(selectedLog.status).text
                      }
                    ]}>
                      {getStatusStyle(selectedLog.status).label}
                    </Text>
                  </View>
                </View>

                {selectedLog.batchName ? (
                  <Text style={styles.detailSubText}>
                    <Text style={{ fontWeight: 'bold' }}>Batch:</Text> {selectedLog.batchName}
                  </Text>
                ) : null}

                {selectedLog.remarks ? (
                  <Text style={styles.detailSubText}>
                    <Text style={{ fontWeight: 'bold' }}>Note:</Text> {selectedLog.remarks}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.noAttendanceText}>
                {selectedHoliday ? 'No class on this holiday.' : 'No attendance recorded for this date.'}
              </Text>
            )}
          </View>
        </ScrollView>
      ) : (
        /* List View Mode */
        <View style={{ flex: 1 }}>
          {/* Filter Tabs */}
          <View style={styles.filterContainer}>
            {(['All', 'Present', 'Absent', 'Holiday'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.filterTab, 
                  activeFilter === tab && styles.activeFilterTab,
                  tab === 'Holiday' && activeFilter === tab && styles.activeHolidayFilterTab
                ]}
                onPress={() => setActiveFilter(tab)}
              >
                <Text style={[
                  styles.filterText, 
                  activeFilter === tab && styles.activeFilterText
                ]}>
                  {tab === 'Holiday' ? '🎉' : ''}{tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredLogs.length === 0 ? (
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
    padding: 14,
    marginBottom: 14,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary || '#4f46e5',
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textMedium || '#64748b',
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: '60%',
    backgroundColor: '#e2e8f0',
  },
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeToggleBtn: {
    backgroundColor: COLORS.primary || '#4f46e5',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMedium || '#64748b',
  },
  activeToggleText: {
    color: '#ffffff',
  },
  calendarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark || '#0f172a',
  },
  monthNavBtn: {
    padding: 4,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMedium || '#64748b',
    width: '14%',
    textAlign: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 48,
  },
  dayCell: {
    width: '14.28%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    marginVertical: 2,
  },
  holidayCell: {
    borderWidth: 1,
    borderColor: '#fde68a',
    borderStyle: 'dashed',
  },
  todayCell: {
    borderWidth: 2,
    borderColor: COLORS.primary || '#4f46e5',
  },
  selectedCell: {
    backgroundColor: COLORS.primary || '#4f46e5',
  },
  dayNumberText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark || '#0f172a',
  },
  holidayDayEmoji: {
    fontSize: 9,
    marginTop: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendEmoji: {
    fontSize: 11,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMedium || '#64748b',
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  holidayDetailCard: {
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffdf7',
  },
  detailCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.textDark || '#0f172a',
    marginBottom: 10,
  },

  // ── Holiday Detail Banner ──────────────────────────────────────────────────
  holidayDetailBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  holidayDetailIcon: {
    fontSize: 22,
    flexShrink: 0,
  },
  holidayDetailName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400e',
    marginBottom: 2,
  },
  holidayDetailDesc: {
    fontSize: 12,
    color: '#b45309',
    fontStyle: 'italic',
  },

  selectedDetailBody: {
    gap: 6,
  },
  detailRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textMedium || '#64748b',
  },
  detailSubText: {
    fontSize: 13,
    color: COLORS.textDark || '#0f172a',
    marginTop: 2,
  },
  noAttendanceText: {
    fontSize: 13,
    color: COLORS.textMedium || '#94a3b8',
    fontStyle: 'italic',
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeFilterTab: {
    backgroundColor: COLORS.primary || '#4f46e5',
  },
  activeHolidayFilterTab: {
    backgroundColor: '#f59e0b',
  },
  filterText: {
    fontSize: 12,
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
  holidayCard: {
    backgroundColor: '#fffdf7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
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

  // ── Holiday Name Row inside list card ──────────────────────────────────────
  holidayNameRow: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  holidayNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  holidayDescText: {
    fontSize: 11,
    color: '#b45309',
    fontStyle: 'italic',
    marginTop: 2,
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
