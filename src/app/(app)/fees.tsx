import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLoader } from '../../contexts/LoaderContext';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function FeesScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const { showLoader, hideLoader } = useLoader();
  const [courseInfo, setCourseInfo] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [latestNextDueDate, setLatestNextDueDate] = useState<string>('');
  const [studentDetails, setStudentDetails] = useState<any>(null);

  useEffect(() => {
    if (!user) {
      hideLoader();
      return;
    }

    let unsubscribeFees: () => void = () => {};

    const setupRealtimeFees = async () => {
      showLoader();
      try {
        // 1. Collect all student identifier keys
        const studentIds: string[] = [];
        if (user.id) studentIds.push(user.id);
        if (user.documentId) studentIds.push(user.documentId);
        if (user.uid) studentIds.push(user.uid);

        let studentData: any = {};
        if (user.id) {
          try {
            const uSnap = await getDoc(doc(db, 'users', user.id));
            if (uSnap.exists()) {
              studentData = uSnap.data();
              if (uSnap.id) studentIds.push(uSnap.id);
            }
          } catch (e) {}
        }
        setStudentDetails(studentData);

        // 2. Fetch Assigned Course Info
        const courseId = studentData.courseIds?.[0] || user.courses?.[0];
        if (courseId) {
          try {
            const cSnap = await getDoc(doc(db, 'courses', courseId));
            if (cSnap.exists()) {
              setCourseInfo({ id: cSnap.id, ...cSnap.data() });
            }
          } catch (e) {}
        }

        // 3. Setup REALTIME Listener for Fee Transactions
        unsubscribeFees = onSnapshot(collection(db, 'fee_transactions'), (snapshot) => {
          const studentTransactions: any[] = [];
          snapshot.forEach(d => {
            const data = d.data();
            if (studentIds.includes(data.studentId)) {
              studentTransactions.push({
                id: d.id,
                ...data,
                paymentDate: data.paymentDate?.toDate ? data.paymentDate.toDate() : (data.paymentDate?.seconds ? new Date(data.paymentDate.seconds * 1000) : new Date())
              });
            }
          });

          // Sort by latest payment date
          studentTransactions.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
          setTransactions(studentTransactions);

          // Latest Next Due Date from newest transaction
          if (studentTransactions.length > 0 && studentTransactions[0].nextDueDate) {
            const dueVal = studentTransactions[0].nextDueDate;
            if (typeof dueVal === 'string') {
              setLatestNextDueDate(dueVal);
            } else if (dueVal.seconds) {
              const d = new Date(dueVal.seconds * 1000);
              setLatestNextDueDate(d.toISOString().split('T')[0]);
            }
          }
          hideLoader();
        }, (err) => {
          console.error("Realtime fee transactions listener error:", err);
          hideLoader();
        });

      } catch (e) {
        console.error("Error setting up fees listener:", e);
        hideLoader();
      }
    };

    setupRealtimeFees();

    return () => {
      if (unsubscribeFees) unsubscribeFees();
    };
  }, [user]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    // Realtime listener handles updates automatically
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const formatDateDisplay = (dateVal?: any): string => {
    if (!dateVal) return 'N/A';
    let d: Date;
    if (dateVal instanceof Date) {
      d = dateVal;
    } else if (typeof dateVal === 'string') {
      d = new Date(dateVal);
    } else if (dateVal.seconds) {
      d = new Date(dateVal.seconds * 1000);
    } else {
      d = new Date();
    }
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Generate PDF Receipt 100% Identical to Web App Receipt Template
  const generatePDF = async (t: any) => {
    try {
      const pDateStr = formatDateDisplay(t.paymentDate);
      const nDueStr = t.nextDueDate ? formatDateDisplay(t.nextDueDate) : 'N/A';
      const joiningDateStr = studentDetails?.joiningDate ? formatDateDisplay(studentDetails.joiningDate) : '01 Jan 2026';
      const courseNameStr = courseInfo?.courseName || 'Enrolled Course';
      const studentNameStr = user?.name || studentDetails?.name || 'Student';
      const studentIdStr = user?.id || user?.documentId || 'N/A';
      const studentPhoneStr = user?.phone || user?.mobile || studentDetails?.phone || studentDetails?.mobile || 'N/A';

      const baseFee = (t.amountPaid || 0) + (t.discount || 0) - (t.lateFee || 0);

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { 
                font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                padding: 24px; 
                color: #0f172a; 
                background: #ffffff; 
                line-height: 1.5;
                box-sizing: border-box;
                position: relative;
              }

              /* Background Watermark Logo */
              .watermark-logo {
                position: absolute;
                top: 45%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 380px;
                height: auto;
                opacity: 0.06;
                z-index: 0;
                pointer-events: none;
              }

              .content-wrapper {
                position: relative;
                z-index: 1;
              }

              /* Header Wrapper with Crimson Red Accent Bar */
              .header-wrapper { 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-start; 
                padding-bottom: 16px; 
                border-bottom: 3px solid #E31837; 
                margin-bottom: 16px; 
              }

              .brand-title { 
                font-size: 24px; 
                font-weight: 800; 
                color: #E31837; 
                margin: 0; 
                letter-spacing: -0.02em;
              }

              .brand-tagline { 
                font-size: 11px; 
                color: #64748b; 
                margin: 3px 0 0 0; 
                font-weight: 600;
              }

              .academy-address-block { 
                text-align: right; 
                font-size: 11px; 
                color: #475569; 
                line-height: 1.4; 
              }

              .address-line { margin: 0; }

              /* Main Receipt Title Bar */
              .title-bar { 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                background-color: #fff0f0; 
                border: 1px solid #fecdd3; 
                padding: 10px 16px; 
                border-radius: 8px; 
                margin-bottom: 16px; 
              }

              .main-title { 
                font-size: 16px; 
                font-weight: 800; 
                color: #E31837; 
                margin: 0; 
                letter-spacing: 0.05em;
              }

              .status-badge { 
                background-color: #dcfce7; 
                color: #15803d; 
                font-weight: 800; 
                font-size: 12px; 
                padding: 4px 12px; 
                border-radius: 20px; 
                border: 1px solid #bbf7d0; 
              }

              /* Meta Grid */
              .meta-grid { 
                display: grid; 
                grid-template-columns: repeat(4, 1fr); 
                gap: 12px; 
                background-color: #ffffff; 
                border: 1px solid #e2e8f0; 
                padding: 12px; 
                border-radius: 8px; 
                margin-bottom: 16px; 
                font-size: 12px; 
              }

              .meta-item { display: flex; flex-direction: column; }
              .meta-label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; }
              .meta-value { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px; }

              /* Section Subtitle */
              .section-subtitle {
                font-size: 11px;
                font-weight: 800;
                color: #991b1b;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin: 0 0 8px 0;
              }

              /* Details Grid */
              .details-box { margin-bottom: 16px; }
              .details-grid { 
                display: grid; 
                grid-template-columns: repeat(2, 1fr); 
                gap: 8px 16px; 
                border: 1px solid #e2e8f0; 
                padding: 12px; 
                border-radius: 8px; 
                font-size: 12px; 
                background-color: #ffffff; 
              }

              .detail-cell { display: flex; align-items: center; }
              .cell-label { width: 140px; color: #64748b; font-weight: 600; }
              .cell-value { color: #0f172a; font-weight: 600; }
              .cell-value.bold { font-weight: 800; color: #1e293b; }

              /* Breakdown Table */
              table { 
                width: 100%; 
                border-collapse: collapse; 
                border: 1px solid #cbd5e1; 
                margin-bottom: 16px; 
                font-size: 12px; 
              }

              th { 
                background-color: #fff0f0; 
                color: #991b1b; 
                font-weight: 800; 
                text-transform: uppercase; 
                font-size: 11px; 
                padding: 8px 12px; 
                border-bottom: 2px solid #E31837; 
                text-align: left; 
              }

              td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
              tfoot td { background-color: #fff0f0; padding: 10px 12px; border-top: 2px solid #E31837; font-size: 13px; }
              .total-cell { font-size: 16px; color: #E31837; font-weight: 800; text-align: right; }

              /* Next Due Date Banner */
              .due-banner { 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                background-color: #fff0f0; 
                border: 2px solid #E31837; 
                border-radius: 10px; 
                padding: 12px 18px; 
                margin-bottom: 20px; 
              }

              .due-banner-left { display: flex; align-items: center; gap: 12px; }
              .due-banner-icon { font-size: 22px; }
              .due-banner-title { font-size: 12px; font-weight: 800; color: #991b1b; display: block; letter-spacing: 0.05em; }
              .due-banner-sub { font-size: 10px; color: #be123c; display: block; margin-top: 2px; }
              .due-banner-date { font-size: 16px; font-weight: 800; color: #E31837; background-color: #ffffff; padding: 6px 14px; border-radius: 8px; border: 1px solid #fecdd3; }

              /* Footer Grid */
              .footer-grid { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 12px; font-size: 12px; }
              .footer-left p { margin: 3px 0; color: #475569; }
              .printed-time { font-size: 10px; color: #94a3b8; margin-top: 6px !important; }
              .signature-box { width: 180px; border-top: 1.5px solid #0f172a; padding-top: 6px; text-align: center; }
              .signature-title { font-weight: 700; font-size: 12px; margin: 0; color: #0f172a; }
              .signature-sub { font-size: 10px; color: #64748b; margin: 2px 0 0 0; }
              .bottom-note { text-align: center; font-size: 11px; font-style: italic; color: #64748b; margin-top: 24px; padding-top: 12px; border-top: 1px dashed #e2e8f0; }
            </style>
          </head>
          <body>
            <div class="content-wrapper">
              <!-- Header -->
              <div class="header-wrapper">
                <div>
                  <h1 class="brand-title">SPEAK HUB ACADEMY</h1>
                  <p class="brand-tagline">Excellence in Communication & Learning</p>
                </div>
                <div class="academy-address-block">
                  <p class="address-line font-bold"><strong>Speak Hub Academy</strong></p>
                  <p class="address-line">Shop No. 6 & 7, Omkar Apartment, Swami Samarth Mandir Chowk,</p>
                  <p class="address-line">NDA Road, near Canara Bank, Giridhar Nagar, Warje, Pune, Maharashtra</p>
                  <p class="address-line"><strong>Contact:</strong> +91-99709-64742</p>
                  <p class="address-line"><strong>E-Mail:</strong> speakhubgallery@gmail.com</p>
                  <p class="address-line"><strong>Follow on:</strong> youtube.com/speakhubacademy</p>
                </div>
              </div>

              <!-- Title Bar -->
              <div class="title-bar">
                <h2 class="main-title">FEE PAYMENT RECEIPT</h2>
                <span class="status-badge">PAID ✓</span>
              </div>

              <!-- Meta Grid -->
              <div class="meta-grid">
                <div class="meta-item">
                  <span class="meta-label">Receipt Number:</span>
                  <span class="meta-value">${t.receiptNumber || 'REC-2026-PAID'}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Payment Date:</span>
                  <span class="meta-value">${pDateStr}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Academic Year:</span>
                  <span class="meta-value">${t.academicYear || '2026-27'}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Payment Mode:</span>
                  <span class="meta-value">${t.paymentMode || 'Cash'}</span>
                </div>
              </div>

              <!-- Student & Course Details Box -->
              <div class="details-box">
                <h3 class="section-subtitle">STUDENT & COURSE INFORMATION</h3>
                <div class="details-grid">
                  <div class="detail-cell">
                    <span class="cell-label">Student Name:</span>
                    <span class="cell-value bold">${studentNameStr}</span>
                  </div>
                  <div class="detail-cell">
                    <span class="cell-label">Student ID:</span>
                    <span class="cell-value">${studentIdStr}</span>
                  </div>
                  <div class="detail-cell">
                    <span class="cell-label">Assigned Course:</span>
                    <span class="cell-value">${courseNameStr}</span>
                  </div>
                  <div class="detail-cell">
                    <span class="cell-label">Mobile Number:</span>
                    <span class="cell-value">${studentPhoneStr}</span>
                  </div>
                  <div class="detail-cell">
                    <span class="cell-label">Student Joining Date:</span>
                    <span class="cell-value">${joiningDateStr}</span>
                  </div>
                  <div class="detail-cell">
                    <span class="cell-label">Billing Period / Duration:</span>
                    <span class="cell-value">${t.billingPeriod || 'Monthly Fee'}</span>
                  </div>
                </div>
              </div>

              <!-- Breakdown Table -->
              <table>
                <thead>
                  <tr>
                    <th style="width: 60%;">Description</th>
                    <th style="width: 20%;">Period / Months</th>
                    <th style="width: 20%; text-align: right;">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Course Fee Payment</strong>
                      <span style="font-size: 11px; color: #64748b; display: block;">${courseNameStr}</span>
                    </td>
                    <td>${t.monthsCount ? `${t.monthsCount} ${t.monthsCount === 1 ? 'Month' : 'Months'}` : '1 Month'}</td>
                    <td style="text-align: right;">₹${baseFee.toLocaleString()}</td>
                  </tr>
                  ${t.lateFee ? `
                    <tr>
                      <td>Late Payment Penalty</td>
                      <td>-</td>
                      <td style="text-align: right; color: #b91c1c;">+₹${t.lateFee.toLocaleString()}</td>
                    </tr>
                  ` : ''}
                  ${t.discount ? `
                    <tr>
                      <td>Discount Special Concession</td>
                      <td>-</td>
                      <td style="text-align: right; color: #15803d;">-₹${t.discount.toLocaleString()}</td>
                    </tr>
                  ` : ''}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="2" style="text-align: right;"><strong>TOTAL AMOUNT PAID:</strong></td>
                    <td class="total-cell">₹${t.amountPaid.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>

              <!-- Next Payment Due Date Banner -->
              <div class="due-banner">
                <div class="due-banner-left">
                  <span class="due-banner-icon">📅</span>
                  <div>
                    <span class="due-banner-title">NEXT PAYMENT DUE DATE</span>
                    <span class="due-banner-sub">Please make sure to complete your next fee installment before this date.</span>
                  </div>
                </div>
                <div class="due-banner-date">${nDueStr}</div>
              </div>

              <!-- Signatures & Footer -->
              <div class="footer-grid">
                <div class="footer-left">
                  <p><strong>Payment Status:</strong> PAID IN FULL</p>
                  <p><strong>Collected By:</strong> ${t.receivedBy || 'Admin'}</p>
                  <p class="printed-time">Printed on: ${new Date().toLocaleString()}</p>
                </div>

                <div class="footer-right">
                  <div class="signature-box">
                    <p class="signature-title">Authorized Signatory</p>
                    <p class="signature-sub">Speak Hub Academy</p>
                  </div>
                </div>
              </div>

              <div class="bottom-note">
                Thank you for your payment! Please retain this official receipt for your records.
              </div>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Success", "Receipt generated cleanly.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to generate receipt PDF.");
    }
  };

  const openPaymentInstructions = () => {
    Alert.alert(
      "Online Fee Payment",
      "Please contact Speak Hub Academy administration or complete your payment via UPI / Bank transfer.\n\nContact: +91-99709-64742\nEmail: speakhubgallery@gmail.com",
      [{ text: "OK" }]
    );
  };

  const totalPaidSum = transactions.reduce((acc, curr) => acc + (Number(curr.amountPaid) || 0), 0);

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} color={COLORS.primary} />}
    >
      {/* Course & Fee Overview Card */}
      <View style={styles.summaryCard}>
        <View style={styles.planHeader}>
          <Text style={styles.planName}>{courseInfo?.courseName || 'Enrolled Course'}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Active Student</Text>
          </View>
        </View>

        <View style={styles.amountsRow}>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Monthly Fee</Text>
            <Text style={styles.amountValue}>₹{courseInfo?.monthlyFee || 0}</Text>
          </View>
          <View style={[styles.amountBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#fecdd3' }]}>
            <Text style={styles.amountLabel}>Total Paid</Text>
            <Text style={[styles.amountValue, { color: COLORS.successText }]}>₹{totalPaidSum.toLocaleString()}</Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Receipts</Text>
            <Text style={[styles.amountValue, { color: COLORS.primary }]}>{transactions.length}</Text>
          </View>
        </View>
      </View>

      {/* Latest Next Due Date Callout */}
      {latestNextDueDate ? (
        <View style={styles.dueAlertCard}>
          <MaterialIcons name="event" size={24} color={COLORS.primary} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.dueAlertTitle}>Next Fee Due Date</Text>
            <Text style={styles.dueAlertText}>
              Your next fee installment is due on <Text style={{ fontWeight: '800' }}>{formatDateDisplay(latestNextDueDate)}</Text>.
            </Text>
          </View>
        </View>
      ) : null}


      {/* Fee Payment Transactions List */}
      <View style={styles.sectionHeaderRow}>
        <MaterialIcons name="receipt-long" size={20} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>Fee Payment History & Receipts</Text>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="receipt" size={40} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>No Fee Receipts Found</Text>
          <Text style={styles.emptyText}>When admin records your fee payments, official receipts will be synced here automatically.</Text>
        </View>
      ) : (
        transactions.map((t, index) => (
          <View key={t.id || index} style={styles.transactionCard}>
            <View style={styles.transLeft}>
              <View style={styles.iconBox}>
                <MaterialIcons name="check-circle" size={24} color="#15803d" />
              </View>
              <View>
                <Text style={styles.transAmount}>₹{t.amountPaid.toLocaleString()}</Text>
                <Text style={styles.transPeriod}>{t.billingPeriod || 'Monthly Fee'}</Text>
                <Text style={styles.transDate}>Paid on: {formatDateDisplay(t.paymentDate)}</Text>
              </View>
            </View>

            <View style={styles.transRight}>
              <View style={styles.modeBadge}>
                <Text style={styles.modeText}>{t.paymentMode || 'Cash'}</Text>
              </View>
              
              <TouchableOpacity style={styles.receiptButton} onPress={() => generatePDF(t)} activeOpacity={0.7}>
                <MaterialIcons name="picture-as-pdf" size={16} color="#ffffff" />
                <Text style={styles.receiptText}>Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: '#fff0f0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  planName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
  },
  badge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  amountBox: {
    flex: 1,
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 11,
    color: COLORS.textMedium,
    fontWeight: '600',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
    marginTop: 2,
  },
  dueAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff0f0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(227, 24, 55, 0.3)',
  },
  dueAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  dueAlertText: {
    fontSize: 12,
    color: COLORS.textDark,
    marginTop: 2,
  },
  payButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  payButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  transactionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  transLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
  },
  transPeriod: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 1,
  },
  transDate: {
    fontSize: 11,
    color: COLORS.textMedium,
    marginTop: 2,
  },
  transRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  modeBadge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMedium,
  },
  receiptButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  receiptText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginTop: 10,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMedium,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 30,
  },
});
