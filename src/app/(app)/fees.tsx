import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function FeesScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [feePlan, setFeePlan] = useState<any>(null);
  const [planDetails, setPlanDetails] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    fetchFees();
  }, [user]);

  const fetchFees = async () => {
    if (!user) return;
    try {
      // 1. Fetch Student Fee Plan
      const q = query(collection(db, 'student_fee_plans'), where('studentId', '==', user.id));
      const pSnap = await getDocs(q);
      
      if (!pSnap.empty) {
        const pDoc = pSnap.docs[0];
        const sfpData = { id: pDoc.id, ...pDoc.data() };
        setFeePlan(sfpData);

        // 2. Fetch Fee Plan Details
        const fpq = query(collection(db, 'fee_plans'));
        const fpSnap = await getDocs(fpq);
        const planDef = fpSnap.docs.map(d => ({id: d.id, ...d.data()})).find((p:any) => p.id === sfpData.feePlanId);
        setPlanDetails(planDef);

        // 3. Fetch Transactions
        const tq = query(collection(db, 'fee_transactions'), where('studentFeePlanId', '==', sfpData.id));
        const tSnap = await getDocs(tq);
        const trans = tSnap.docs.map(d => {
          const dt = d.data();
          return {
             id: d.id, 
             ...dt, 
             paymentDate: dt.paymentDate?.toDate ? dt.paymentDate.toDate() : new Date(dt.paymentDate)
          };
        }).sort((a:any, b:any) => b.paymentDate - a.paymentDate);
        setTransactions(trans);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchFees();
    setRefreshing(false);
  }, []);

  const generatePDF = async (t: any) => {
    try {
      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px; }
              h1 { color: #1e3a8a; margin: 0; font-size: 24px; }
              p { margin: 5px 0; font-size: 14px; }
              .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
              .section { margin-bottom: 20px; }
              .label { font-weight: bold; display: inline-block; width: 120px; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
              th { background-color: #f8fafc; }
              .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; }
              .signature { border-top: 1px solid #000; width: 150px; text-align: center; padding-top: 5px; margin-top: 30px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Speak Hub Academy</h1>
              <p>FEE PAYMENT RECEIPT</p>
            </div>
            
            <div class="meta">
              <div>
                <p><span class="label">Receipt No:</span> ${t.receiptNumber}</p>
                <p><span class="label">Date:</span> ${t.paymentDate.toLocaleDateString()}</p>
              </div>
              <div>
                <p><span class="label">Acad Year:</span> ${t.academicYear || '2026-27'}</p>
                <p><span class="label">Status:</span> ${t.status || 'PAID'}</p>
              </div>
            </div>

            <div class="section">
              <p><span class="label">Student Name:</span> ${user?.name}</p>
              <p><span class="label">Fee Plan:</span> ${planDetails?.planName}</p>
              <p><span class="label">Billing Period:</span> ${t.billingPeriod || 'N/A'}</p>
              <p><span class="label">Payment Mode:</span> ${t.paymentMode}</p>
              ${t.transactionNumber ? `<p><span class="label">Ref No:</span> ${t.transactionNumber}</p>` : ''}
            </div>

            <table>
              <tr><th>Description</th><th>Amount (₹)</th></tr>
              <tr><td>Course Fee Payment</td><td>${t.amountPaid + (t.discount || 0) - (t.lateFee || 0)}</td></tr>
              ${t.lateFee ? `<tr><td>Late Fee</td><td>${t.lateFee}</td></tr>` : ''}
              ${t.discount ? `<tr><td>Discount</td><td>-${t.discount}</td></tr>` : ''}
              <tr><td><strong>Total Paid</strong></td><td><strong>${t.amountPaid}</strong></td></tr>
            </table>

            <div class="footer">
              <div>
                <p><strong>Next Due:</strong> ${t.nextDueDate?.toDate ? t.nextDueDate.toDate().toLocaleDateString() : (t.nextDueDate ? new Date(t.nextDueDate.seconds * 1000).toLocaleDateString() : 'N/A')}</p>
                <p><strong>Remaining:</strong> ₹${t.remainingBalance || 0}</p>
                <p>Collected By: ${t.receivedBy}</p>
              </div>
              <div class="signature">Authorized Signature</div>
            </div>
            <p style="text-align: center; margin-top: 30px; font-style: italic; color: #666;">Thank You!</p>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Success", "Receipt generated, but sharing is not available on this device.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to generate receipt PDF.");
    }
  };

  const openPaymentInstructions = () => {
    Alert.alert(
      "Payment Instructions",
      "Please contact the administration or use the WhatsApp payment link sent by your teacher to complete payments online.\n\nUPI ID: speakhub@okaxis\nBank: HDFC Bank",
      [{ text: "OK" }]
    );
  };

  if (!feePlan) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20}}>
         <MaterialIcons name="info-outline" size={48} color={COLORS.textLight} />
         <Text style={{marginTop: 16, fontSize: 16, color: COLORS.textLight, textAlign: 'center'}}>No active fee plan found. If you recently enrolled, please wait for the admin to assign your plan.</Text>
      </View>
    );
  }

  const nextDue = feePlan.nextDueDate?.toDate ? feePlan.nextDueDate.toDate() : new Date(feePlan.nextDueDate);
  const isOverdue = nextDue < new Date();
  const total = planDetails?.totalFee || 0;
  const paid = feePlan.totalPaid || 0;
  const remaining = total - paid;

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.planHeader}>
          <Text style={styles.planName}>{planDetails?.planName || 'Assigned Plan'}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{feePlan.billingFrequency} Billing</Text>
          </View>
        </View>

        <View style={styles.amountsRow}>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Total Fee</Text>
            <Text style={styles.amountValue}>₹{total}</Text>
          </View>
          <View style={[styles.amountBox, {borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e2e8f0'}]}>
            <Text style={styles.amountLabel}>Paid</Text>
            <Text style={[styles.amountValue, {color: COLORS.successText}]}>₹{paid}</Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Remaining</Text>
            <Text style={[styles.amountValue, {color: COLORS.error}]}>₹{remaining}</Text>
          </View>
        </View>
      </View>

      {/* Due Date Alert */}
      {remaining > 0 && (
        <View style={[styles.alertBox, isOverdue ? styles.alertOverdue : styles.alertUpcoming]}>
          <MaterialIcons name={isOverdue ? "error-outline" : "event"} size={24} color={isOverdue ? COLORS.error : COLORS.primary} />
          <View style={{marginLeft: 12, flex: 1}}>
            <Text style={[styles.alertTitle, {color: isOverdue ? COLORS.error : COLORS.primary}]}>
              {isOverdue ? "Payment Overdue" : "Upcoming Due Date"}
            </Text>
            <Text style={styles.alertText}>
              {isOverdue ? `Your payment was due on ${nextDue.toLocaleDateString()}. Please pay immediately.` : `Your next payment is due on ${nextDue.toLocaleDateString()}.`}
            </Text>
          </View>
        </View>
      )}

      {/* Pay Now Button */}
      {remaining > 0 && (
        <TouchableOpacity style={styles.payButton} onPress={openPaymentInstructions}>
          <MaterialIcons name="payment" size={20} color={COLORS.surface} />
          <Text style={styles.payButtonText}>How to Pay</Text>
        </TouchableOpacity>
      )}

      {/* Transactions */}
      <Text style={styles.sectionTitle}>Payment History</Text>
      {transactions.length === 0 ? (
        <Text style={styles.emptyText}>No payments recorded yet.</Text>
      ) : (
        transactions.map((t, index) => (
          <View key={index} style={styles.transactionCard}>
            <View style={styles.transLeft}>
              <View style={styles.iconBox}>
                <MaterialIcons name="check-circle" size={24} color={COLORS.successText} />
              </View>
              <View>
                <Text style={styles.transAmount}>₹{t.amountPaid}</Text>
                <Text style={styles.transDate}>{t.paymentDate.toLocaleDateString()}</Text>
              </View>
            </View>
            <View style={styles.transRight}>
              <Text style={styles.transMode}>{t.paymentMode}</Text>
              <TouchableOpacity style={styles.receiptButton} onPress={() => generatePDF(t)}>
                <MaterialIcons name="picture-as-pdf" size={16} color={COLORS.primary} />
                <Text style={styles.receiptText}>Download</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      
      <View style={{height: 40}} />
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
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  badge: {
    backgroundColor: COLORS.primaryLightest,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  amountBox: {
    flex: 1,
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  alertBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  alertUpcoming: {
    backgroundColor: COLORS.primaryLightest,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  alertOverdue: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 13,
    color: COLORS.textDark,
  },
  payButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  payButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginBottom: 16,
  },
  emptyText: {
    color: COLORS.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  transactionCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  transLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.successBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  transDate: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  transRight: {
    alignItems: 'flex-end',
  },
  transMode: {
    fontSize: 12,
    color: COLORS.textLight,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  }
});
