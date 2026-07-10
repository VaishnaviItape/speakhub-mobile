import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // Mock data for children if parent
  const children = [
    { id: "3", name: "Student User", courses: ["Scholar Phonics"] },
    { id: "5", name: "Alice", courses: ["Spoken English", "Abacus"] },
  ];

  if (user?.role === "parent") {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.welcome}>Welcome, {user.name}</Text>
          <Text style={styles.subtitle}>Here are your children's profiles</Text>
        </View>

        {children.map((child) => (
          <TouchableOpacity
            key={child.id}
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/(app)/profile",
                params: { studentId: child.id },
              })
            }
          >
            <View style={styles.childHeader}>
              <TouchableOpacity
                style={styles.avatarPlaceholder}
                onPress={() => router.push("/(app)/profile")}
              >
                <MaterialIcons name="person" size={30} color="#fff" />
              </TouchableOpacity>
              <View>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.courses}>{child.courses.join(", ")}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // Student Dashboard
  return (
    <ScrollView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          },
        ]}
      >
        <View>
          <Text style={styles.greeting}>Hello, {user?.name}</Text>
          <Text style={styles.subGreeting}>Ready to learn today?</Text>
        </View>
        <TouchableOpacity
          style={styles.avatarPlaceholder}
          onPress={() => router.push("/(app)/profile")}
        >
          <MaterialIcons name="person" size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
        {/* Minimal Class Banner */}
        <View style={styles.bannerCard}>
          <View>
            <Text style={styles.bannerTitle}>Next Class</Text>
            <Text style={styles.bannerSubtitle}>
              Scholar Phonics (10:00 AM)
            </Text>
          </View>
          <TouchableOpacity style={styles.bannerButton}>
            <Text style={styles.bannerButtonText}>Join</Text>
          </TouchableOpacity>
        </View>

        {/* Action Grid */}
        <View style={[styles.grid, { marginTop: 30 }]}>
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => router.push("/(app)/exams")}
          >
            <MaterialIcons
              name="edit-document"
              size={28}
              color={COLORS.primary}
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.gridText}>Exams</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => router.push("/(app)/homework")}
          >
            <MaterialIcons
              name="menu-book"
              size={28}
              color={COLORS.primary}
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.gridText}>Homework</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => router.push("/(app)/profile")}
          >
            <MaterialIcons
              name="payment"
              size={28}
              color={COLORS.primary}
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.gridText}>Fees</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface, // Clean white background for whole page
  },
  header: {
    padding: 20,
    paddingTop: 40,
    // Removed border, shadow, and separate background for a flatter look
  },
  welcome: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.textDark,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMedium,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.textDark,
    marginBottom: 5,
  },
  subGreeting: {
    fontSize: 14,
    color: COLORS.textMedium,
  },
  bannerCard: {
    backgroundColor: COLORS.primaryLightest,
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  bannerTitle: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: "bold",
  },
  bannerSubtitle: {
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: "bold",
    marginTop: 2,
  },
  bannerButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bannerButtonText: {
    color: COLORS.textInverse,
    fontWeight: "bold",
  },
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  gridItem: {
    backgroundColor: COLORS.surface,
    width: "30%",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  gridText: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.textDark,
  },
});
