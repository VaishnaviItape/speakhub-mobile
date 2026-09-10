import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../constants/theme';
import {
  AppNotification,
  subscribeToUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  NotificationType,
} from '../../utils/notificationService';

export default function NotificationCenterScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'FEE_DUE' | 'ACADEMIC'>('ALL');

  const userId = user?.id || user?.documentId || '';

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToUserNotifications(userId, (list, unread) => {
      setNotifications(list);
      setUnreadCount(unread);
      setLoading(false);
      setRefreshing(false);

      // When the user views this notifications screen, mark all as read so the badge clears
      if (unread > 0) {
        setTimeout(() => {
          markAllNotificationsAsRead(userId);
        }, 1200);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  const onRefresh = () => {
    setRefreshing(true);
    // Realtime listener will automatically update state
    setTimeout(() => setRefreshing(false), 800);
  };

  const handleNotificationPress = async (item: AppNotification) => {
    if (!item.read) {
      markNotificationAsRead(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    // Determine target route based on notification data or type
    if (item.data?.screen) {
      try {
        router.push(item.data.screen as any);
        return;
      } catch (e) {
        console.log('Navigation error:', e);
      }
    }

    switch (item.type) {
      case 'FEE_DUE':
        router.push('/(app)/fees');
        break;
      case 'HOMEWORK':
        router.push('/(app)/homework');
        break;
      case 'EXAM':
        router.push('/(app)/exams');
        break;
      case 'BATCH':
        router.push('/(app)/notes');
        break;
      default:
        break;
    }
  };

  const handleMarkAllRead = async () => {
    if (userId && unreadCount > 0) {
      await markAllNotificationsAsRead(userId);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    let date: Date;
    if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return 'Recently';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'FEE_DUE':
        return { name: 'account-balance-wallet', bg: '#fee2e2', color: '#e11d48' };
      case 'HOMEWORK':
        return { name: 'menu-book', bg: '#e0e7ff', color: '#4f46e5' };
      case 'EXAM':
        return { name: 'assignment', bg: '#fef3c7', color: '#d97706' };
      case 'BATCH':
        return { name: 'groups', bg: '#d1fae5', color: '#059669' };
      default:
        return { name: 'notifications', bg: '#f1f5f9', color: '#64748b' };
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    if (filter === 'UNREAD') return !item.read;
    if (filter === 'FEE_DUE') return item.type === 'FEE_DUE';
    if (filter === 'ACADEMIC') return item.type === 'HOMEWORK' || item.type === 'EXAM' || item.type === 'BATCH';
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.textDark} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSubtitle}>
              {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
            </Text>
          </View>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <MaterialIcons name="done-all" size={16} color={COLORS.primary} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'ALL' && styles.filterChipActive]}
          onPress={() => setFilter('ALL')}
        >
          <Text style={[styles.filterChipText, filter === 'ALL' && styles.filterChipTextActive]}>
            All ({notifications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'UNREAD' && styles.filterChipActive]}
          onPress={() => setFilter('UNREAD')}
        >
          <Text style={[styles.filterChipText, filter === 'UNREAD' && styles.filterChipTextActive]}>
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'FEE_DUE' && styles.filterChipActive]}
          onPress={() => setFilter('FEE_DUE')}
        >
          <Text style={[styles.filterChipText, filter === 'FEE_DUE' && styles.filterChipTextActive]}>
            Fees
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'ACADEMIC' && styles.filterChipActive]}
          onPress={() => setFilter('ACADEMIC')}
        >
          <Text style={[styles.filterChipText, filter === 'ACADEMIC' && styles.filterChipTextActive]}>
            Classes & Tests
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : filteredNotifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <MaterialIcons name="notifications-none" size={48} color="#94a3b8" />
          </View>
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptySubtitle}>
            {filter === 'UNREAD' 
              ? "You have read all your notifications!" 
              : "You're all caught up. New fee dues, exams, and homework updates will appear here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const iconConfig = getNotificationIcon(item.type);
            return (
              <TouchableOpacity
                style={[styles.notifCard, !item.read && styles.notifCardUnread]}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBox, { backgroundColor: iconConfig.bg }]}>
                  <MaterialIcons name={iconConfig.name as any} size={22} color={iconConfig.color} />
                </View>

                <View style={styles.notifBody}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.notifTitle, !item.read && styles.notifTitleBold]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {!item.read && <View style={styles.unreadDot} />}
                  </View>

                  <Text style={styles.notifMessage} numberOfLines={3}>
                    {item.body}
                  </Text>

                  <View style={styles.footerRow}>
                    <Text style={styles.timeText}>{formatTimeAgo(item.createdAt)}</Text>
                    <TouchableOpacity
                      onPress={() => handleDelete(item.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.deleteBtn}
                    >
                      <MaterialIcons name="close" size={14} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 1,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff1f2',
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  notifCard: {
    flexDirection: 'row',
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  notifCardUnread: {
    backgroundColor: '#ffffff',
    borderColor: '#fecdd3',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  notifTitleBold: {
    fontWeight: '800',
    color: '#0f172a',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 6,
  },
  notifMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
  },
});
