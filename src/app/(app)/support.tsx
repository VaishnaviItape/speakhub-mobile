import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useRouter } from 'expo-router';

export default function SupportScreen() {
  const router = useRouter();

  const handleCall = () => {
    Linking.openURL("tel:+919876543210");
  };

  const handleWhatsApp = () => {
    Linking.openURL("https://wa.me/919876543210");
  };

  const handleEmail = () => {
    Linking.openURL("mailto:support@speakhubacademy.com");
  };

  const faqs = [
    {
      q: "How can I check my fee receipts?",
      a: "Open the menu drawer by tapping the hamburger icon on the top left, and select 'My Purchases & Receipts'."
    },
    {
      q: "How do I change my assigned batch?",
      a: "Batch changes must be approved by the admin. Please contact your student counselor via WhatsApp to request a change."
    },
    {
      q: "I forgot my password, how to reset?",
      a: "Log out of the app and tap on 'Forgot Password' on the login screen to receive a reset link on your registered email."
    },
    {
      q: "Where do I see my upcoming exams?",
      a: "Tap the 'Exams' tab in the bottom navigation bar to see your upcoming, active, and past exams."
    }
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Banner */}
      <View style={styles.headerBanner}>
        <MaterialIcons name="support-agent" size={64} color={COLORS.primary} style={styles.headerIcon} />
        <Text style={styles.headerTitle}>How can we help?</Text>
        <Text style={styles.headerSubtitle}>Connect directly with our support team or browse our FAQs.</Text>
      </View>

      {/* Quick Contacts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Options</Text>
        
        <View style={styles.contactGrid}>
          <TouchableOpacity style={[styles.contactCard, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]} onPress={handleCall}>
            <MaterialIcons name="phone" size={32} color="#4f46e5" />
            <Text style={[styles.contactCardTitle, { color: '#312e81' }]}>Call Us</Text>
            <Text style={[styles.contactCardSub, { color: '#4f46e5' }]}>+91 98765 43210</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.contactCard, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]} onPress={handleWhatsApp}>
            <MaterialIcons name="chat" size={32} color="#059669" />
            <Text style={[styles.contactCardTitle, { color: '#064e3b' }]}>WhatsApp</Text>
            <Text style={[styles.contactCardSub, { color: '#059669' }]}>Chat Now</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.emailCard} onPress={handleEmail}>
          <MaterialIcons name="email" size={24} color={COLORS.primary} />
          <View style={styles.emailCardText}>
            <Text style={styles.emailCardTitle}>Email Support</Text>
            <Text style={styles.emailCardSub}>support@speakhubacademy.com</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={COLORS.textLight} />
        </TouchableOpacity>
      </View>

      {/* FAQs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        
        {faqs.map((faq, index) => (
          <View key={index} style={styles.faqCard}>
            <Text style={styles.faqQuestion}>{faq.q}</Text>
            <Text style={styles.faqAnswer}>{faq.a}</Text>
          </View>
        ))}
      </View>
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerBanner: {
    backgroundColor: '#fff',
    padding: 30,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 20,
  },
  headerIcon: {
    marginBottom: 16,
    opacity: 0.9,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 16,
  },
  contactGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  contactCard: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
  },
  contactCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 4,
  },
  contactCardSub: {
    fontSize: 13,
    fontWeight: '600',
  },
  emailCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  emailCardText: {
    flex: 1,
    marginLeft: 16,
  },
  emailCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  emailCardSub: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 2,
  },
  faqCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    color: COLORS.textLight,
    lineHeight: 22,
  }
});
