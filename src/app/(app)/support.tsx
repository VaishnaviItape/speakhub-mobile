import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Linking, 
  LayoutAnimation, 
  Platform, 
  UIManager
} from 'react-native';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SupportScreen() {
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null);

  const handleCall = () => {
    Linking.openURL("tel:+919307829005");
  };

  const handleWhatsApp = () => {
    Linking.openURL("https://wa.me/919307829005");
  };

  const handleEmail = () => {
    Linking.openURL("mailto:speakhubacademy26@gmail.com");
  };

  const toggleFaq = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFaqIndex(expandedFaqIndex === index ? null : index);
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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Modern Gradient Header */}
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark || '#3730A3']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerIconContainer}>
            <MaterialIcons name="support-agent" size={54} color="#ffffff" />
          </View>
          <Text style={styles.headerTitle}>How can we help?</Text>
          <Text style={styles.headerSubtitle}>
            Our team is here to support your learning journey. Choose an option below to connect with us.
          </Text>
        </LinearGradient>

        {/* Quick Contacts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get in Touch</Text>
          
          <View style={styles.contactGrid}>
            <TouchableOpacity 
              style={[styles.contactCard, { backgroundColor: '#ffffff' }]} 
              onPress={handleCall}
              activeOpacity={0.8}
            >
              <View style={[styles.iconWrapper, { backgroundColor: '#eef2ff' }]}>
                <MaterialIcons name="phone-in-talk" size={26} color="#4f46e5" />
              </View>
              <Text style={styles.contactCardTitle}>Call Support</Text>
              <Text style={styles.contactCardSub}>+91 93078 29005</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.contactCard, { backgroundColor: '#ffffff' }]} 
              onPress={handleWhatsApp}
              activeOpacity={0.8}
            >
              <View style={[styles.iconWrapper, { backgroundColor: '#ecfdf5' }]}>
                <FontAwesome5 name="whatsapp" size={26} color="#059669" />
              </View>
              <Text style={styles.contactCardTitle}>WhatsApp</Text>
              <Text style={styles.contactCardSub}>Chat with us</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.emailCard} onPress={handleEmail} activeOpacity={0.8}>
            <View style={[styles.iconWrapper, { backgroundColor: COLORS.primaryLightest || '#ffe4e6', marginRight: 16 }]}>
              <MaterialIcons name="mail-outline" size={26} color={COLORS.primary} />
            </View>
            <View style={styles.emailCardText}>
              <Text style={styles.emailCardTitle}>Send an Email</Text>
              <Text style={styles.emailCardSub}>speakhubacademy26@gmail.com</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>

        {/* FAQs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          
          <View style={styles.faqContainer}>
            {faqs.map((faq, index) => {
              const isExpanded = expandedFaqIndex === index;
              return (
                <TouchableOpacity 
                  key={index} 
                  style={[styles.faqCard, isExpanded && styles.faqCardExpanded]} 
                  onPress={() => toggleFaq(index)}
                  activeOpacity={0.7}
                >
                  <View style={styles.faqHeader}>
                    <Text style={[styles.faqQuestion, isExpanded && { color: COLORS.primary }]}>
                      {faq.q}
                    </Text>
                    <MaterialIcons 
                      name={isExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                      size={24} 
                      color={isExpanded ? COLORS.primary : COLORS.textLight} 
                    />
                  </View>
                  {isExpanded && (
                    <Text style={styles.faqAnswer}>{faq.a}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 40,
    paddingHorizontal: 30,
    alignItems: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    marginBottom: 25,
  },
  headerIconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 35,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  contactGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  contactCard: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  contactCardSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  emailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  emailCardText: {
    flex: 1,
  },
  emailCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  emailCardSub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 3,
    fontWeight: '500',
  },
  faqContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  faqCard: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  faqCardExpanded: {
    backgroundColor: '#fafaf9',
    borderRadius: 12,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
    paddingRight: 10,
    lineHeight: 22,
  },
  faqAnswer: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 22,
    marginTop: 12,
  }
});
