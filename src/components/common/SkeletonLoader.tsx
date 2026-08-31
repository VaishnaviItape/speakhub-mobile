import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle, DimensionValue } from 'react-native';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Base Shimmer Element - Smooth Instagram-style pulsing opacity
 */
export const SkeletonItem: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0.3,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, [animatedValue]);

  return (
    <Animated.View
      style={[
        styles.skeletonBase,
        {
          width,
          height,
          borderRadius,
          opacity: animatedValue,
        },
        style,
      ]}
    />
  );
};

export const SkeletonCircle: React.FC<{ size?: number; style?: ViewStyle }> = ({
  size = 46,
  style,
}) => {
  return (
    <SkeletonItem
      width={size}
      height={size}
      borderRadius={size / 2}
      style={style}
    />
  );
};

export const SkeletonText: React.FC<{
  lines?: number;
  lineHeight?: number;
  spacing?: number;
  lastLineWidth?: DimensionValue;
  style?: ViewStyle;
}> = ({
  lines = 2,
  lineHeight = 14,
  spacing = 8,
  lastLineWidth = '60%',
  style,
}) => {
  return (
    <View style={[{ gap: spacing }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonItem
          key={i}
          height={lineHeight}
          width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
          borderRadius={lineHeight / 2}
        />
      ))}
    </View>
  );
};

/**
 * Instagram Post / Card Style Skeleton
 */
export const InstagramCardSkeleton: React.FC<{ style?: ViewStyle }> = ({ style }) => {
  return (
    <View style={[styles.instagramCard, style]}>
      {/* Header with Avatar + User Title */}
      <View style={styles.cardHeader}>
        <SkeletonCircle size={42} />
        <View style={styles.headerInfo}>
          <SkeletonItem width="45%" height={14} borderRadius={7} />
          <SkeletonItem width="30%" height={10} borderRadius={5} style={{ marginTop: 6 }} />
        </View>
        <SkeletonItem width={24} height={12} borderRadius={6} />
      </View>

      {/* Media / Content Area Placeholder */}
      <SkeletonItem width="100%" height={190} borderRadius={14} style={styles.mediaBox} />

      {/* Footer Info & Action Bar */}
      <View style={styles.cardFooter}>
        <View style={styles.actionRow}>
          <SkeletonCircle size={22} />
          <SkeletonCircle size={22} />
          <SkeletonCircle size={22} />
        </View>
        <SkeletonItem width="80%" height={12} borderRadius={6} style={{ marginTop: 10 }} />
        <SkeletonItem width="50%" height={10} borderRadius={5} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
};

/**
 * Full Dashboard Skeleton (Shimmer Screen Placeholder)
 */
export const DashboardSkeleton: React.FC = () => {
  return (
    <View style={styles.screenContainer}>
      {/* Top Profile / Greeting Header */}
      <View style={styles.dashboardHeader}>
        <View style={{ flex: 1 }}>
          <SkeletonItem width="35%" height={12} borderRadius={6} />
          <SkeletonItem width="60%" height={22} borderRadius={10} style={{ marginTop: 8 }} />
        </View>
        <SkeletonCircle size={46} />
      </View>

      {/* Hero / Batch Card */}
      <View style={styles.heroCardSkeleton}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SkeletonItem width="40%" height={18} borderRadius={8} />
          <SkeletonItem width={70} height={24} borderRadius={12} />
        </View>
        <SkeletonItem width="85%" height={12} borderRadius={6} style={{ marginTop: 12 }} />
        <SkeletonItem width="100%" height={44} borderRadius={12} style={{ marginTop: 16 }} />
      </View>

      {/* 4-Item Quick Action Grid */}
      <View style={styles.quickGrid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.gridItem}>
            <SkeletonCircle size={40} />
            <SkeletonItem width="70%" height={12} borderRadius={6} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* List Content Skeleton Cards */}
      <InstagramCardSkeleton style={{ marginTop: 16 }} />
    </View>
  );
};

/**
 * Module List / Exams / Notes / Homework Skeleton Screen
 */
export const ModuleListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <View style={styles.screenContainer}>
      {/* Search Bar Placeholder */}
      <SkeletonItem width="100%" height={46} borderRadius={14} style={{ marginBottom: 16 }} />

      {/* Repeating List Items */}
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} style={styles.moduleItemCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SkeletonCircle size={44} />
            <View style={{ flex: 1 }}>
              <SkeletonItem width="55%" height={15} borderRadius={7} />
              <SkeletonItem width="80%" height={11} borderRadius={5} style={{ marginTop: 6 }} />
            </View>
            <SkeletonItem width={60} height={26} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: '#cbd5e1',
  },
  screenContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8fafc',
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    marginTop: 6,
  },
  heroCardSkeleton: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  gridItem: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  instagramCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  mediaBox: {
    marginBottom: 12,
  },
  cardFooter: {
    paddingTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  moduleItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
});
