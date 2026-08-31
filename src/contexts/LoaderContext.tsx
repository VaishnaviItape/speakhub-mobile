import React, { createContext, useState, useContext, ReactNode } from 'react';
import { View, StyleSheet, Modal, SafeAreaView, ScrollView } from 'react-native';
import { DashboardSkeleton } from '../components/common/SkeletonLoader';

type LoaderContextType = {
  showLoader: () => void;
  hideLoader: () => void;
  isLoading: boolean;
};

const LoaderContext = createContext<LoaderContextType | undefined>(undefined);

export const LoaderProvider = ({ children }: { children: ReactNode }) => {
  const [isLoading, setIsLoading] = useState(false);

  const showLoader = () => setIsLoading(true);
  const hideLoader = () => setIsLoading(false);

  return (
    <LoaderContext.Provider value={{ showLoader, hideLoader, isLoading }}>
      {children}
      {isLoading && (
        <Modal transparent={false} animationType="fade" visible={isLoading} onRequestClose={() => {}}>
          <SafeAreaView style={styles.skeletonContainer}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <DashboardSkeleton />
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </LoaderContext.Provider>
  );
};

export const useLoader = () => {
  const context = useContext(LoaderContext);
  if (context === undefined) {
    throw new Error('useLoader must be used within a LoaderProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  skeletonContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
});
