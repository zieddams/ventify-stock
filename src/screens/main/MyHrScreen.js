import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatDate } from '../../utils/format'

function describeApiError(err, fallback) {
  return err?.response?.data?.message || err?.message || fallback
}

function toYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const LEAVE_TYPES = ['annuel', 'maladie', 'sans_solde', 'autre']

export default function MyHrScreen() {
  const { user } = useAuth()
  const { t } = useI18n()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [profile, setProfile] = useState(null)
  const [leaveData, setLeaveData] = useState({ accrued_balance: 0, leaves: [] })
  const [transactions, setTransactions] = useState([])
  const [performance, setPerformance] = useState(null)

  const [leaveType, setLeaveType] = useState('annuel')
  const [dateStart, setDateStart] = useState(null)
  const [dateEnd, setDateEnd] = useState(null)
  const [activePicker, setActivePicker] = useState(null)
  const [submittingLeave, setSubmittingLeave] = useState(false)

  const load = useCallback(async () => {
    const [profileRes, leaveRes, transactionsRes, performanceRes] = await Promise.all([
      api.get('/employees/me'),
      api.get('/employees/me/leaves'),
      api.get('/employees/me/transactions'),
      api.get('/employees/me/performance'),
    ])

    setProfile(profileRes.data?.profile ?? null)
    setLeaveData(leaveRes.data ?? { accrued_balance: 0, leaves: [] })
    setTransactions(Array.isArray(transactionsRes.data) ? transactionsRes.data : [])
    setPerformance(performanceRes.data ?? null)
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const submitLeaveRequest = async () => {
    if (!dateStart || !dateEnd) {
      Alert.alert(t('myHr.leave.title'), t('myHr.leave.datesRequired'))
      return
    }

    setSubmittingLeave(true)

    try {
      await api.post('/employees/me/leaves', {
        type: leaveType,
        date_start: toYmd(dateStart),
        date_end: toYmd(dateEnd),
      })
      setDateStart(null)
      setDateEnd(null)
      await load()
      Alert.alert(t('myHr.leave.title'), t('myHr.leave.requestSent'))
    } catch (error) {
      Alert.alert(t('myHr.leave.title'), describeApiError(error, t('myHr.leave.requestFailed')))
    } finally {
      setSubmittingLeave(false)
    }
  }

  const onPickerChange = (event, selected) => {
    const target = activePicker
    setActivePicker(null)
    if (event.type !== 'set' || !selected) return
    if (target === 'start') setDateStart(selected)
    else if (target === 'end') setDateEnd(selected)
  }

  if (loading) {
    return (
      <View style={s.loadingRoot}>
        <ActivityIndicator size="large" color={T.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
    >
      <PageHeader title={t('myHr.title')} subtitle={t('myHr.subtitle')} />

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>{t('myHr.profile.title')}</Text>
        {profile ? (
          <>
            <InfoRow label={t('myHr.profile.hireDate')} value={profile.hire_date ? formatDate(profile.hire_date) : '--'} />
            <InfoRow label={t('myHr.profile.baseSalary')} value={profile.base_salary != null ? `${profile.base_salary} TND` : '--'} />
            <InfoRow label={t('myHr.profile.phone')} value={profile.phone || '--'} />
            <InfoRow label={t('myHr.profile.cnssEnrolled')} value={profile.cnss_enrolled ? t('common.yes') : t('common.no')} />
          </>
        ) : (
          <Text style={s.emptyText}>{t('myHr.profile.empty')}</Text>
        )}
      </View>

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>{t('myHr.leave.title')}</Text>
        <View style={s.balanceBox}>
          <Text style={s.balanceValue}>{leaveData.accrued_balance} {t('myHr.leave.days')}</Text>
          <Text style={s.balanceHint}>{t('myHr.leave.accrualHint')}</Text>
        </View>

        <View style={s.chipRow}>
          {LEAVE_TYPES.map((type) => {
            const active = leaveType === type
            return (
              <TouchableOpacity
                key={type}
                style={[s.choiceChip, active && s.choiceChipActive]}
                onPress={() => setLeaveType(type)}
              >
                <Text style={[s.choiceChipText, active && s.choiceChipTextActive]}>{t(`myHr.leave.types.${type}`)}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={s.dateRow}>
          <TouchableOpacity style={s.dateInput} onPress={() => setActivePicker('start')}>
            <Text style={dateStart ? s.dateValueText : s.datePlaceholderText}>
              {dateStart ? formatDate(dateStart) : t('myHr.leave.dateStartPlaceholder')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dateInput} onPress={() => setActivePicker('end')}>
            <Text style={dateEnd ? s.dateValueText : s.datePlaceholderText}>
              {dateEnd ? formatDate(dateEnd) : t('myHr.leave.dateEndPlaceholder')}
            </Text>
          </TouchableOpacity>
        </View>

        {activePicker && (
          <DateTimePicker
            value={(activePicker === 'start' ? dateStart : dateEnd) || new Date()}
            mode="date"
            display="default"
            minimumDate={activePicker === 'end' ? (dateStart || undefined) : undefined}
            onChange={onPickerChange}
          />
        )}

        <TouchableOpacity
          style={[s.primaryButton, submittingLeave && s.buttonDisabled]}
          onPress={submitLeaveRequest}
          disabled={submittingLeave}
        >
          {submittingLeave ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>{t('myHr.leave.request')}</Text>}
        </TouchableOpacity>

        {leaveData.leaves.length > 0 && (
          <View style={s.listWrap}>
            {leaveData.leaves.slice(0, 6).map((leave) => (
              <View key={leave.id} style={s.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.listRowTitle}>
                    {t(`myHr.leave.types.${leave.type}`)} · {formatDate(leave.date_start)} - {formatDate(leave.date_end)}
                  </Text>
                  <Text style={s.listRowMeta}>{t(`myHr.leave.statuses.${leave.status}`)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>{t('myHr.ledger.title')}</Text>
        {transactions.length === 0 ? (
          <Text style={s.emptyText}>{t('myHr.ledger.empty')}</Text>
        ) : (
          <View style={s.listWrap}>
            {transactions.slice(0, 8).map((transaction) => (
              <View key={transaction.id} style={s.listRow}>
                <MaterialCommunityIcons
                  name={transaction.type === 'avance' ? 'cash-minus' : transaction.type === 'prime' ? 'cash-plus' : 'cash'}
                  size={18}
                  color={T.primary}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.listRowTitle}>{t(`myHr.ledger.types.${transaction.type}`)} · {transaction.amount} TND</Text>
                  <Text style={s.listRowMeta}>{formatDate(transaction.created_at)}{transaction.note ? ` · ${transaction.note}` : ''}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {performance && (
        <View style={[s.card, cardShadow]}>
          <Text style={s.cardTitle}>{t('myHr.performance.title')}</Text>
          <View style={s.statsGrid}>
            <StatBox label={t('myHr.performance.sessionCount')} value={performance.session_count} />
            <StatBox label={t('myHr.performance.invoiceCount')} value={performance.invoice_count} />
            <StatBox label={t('myHr.performance.totalSold')} value={`${performance.total_sold} TND`} />
            <StatBox label={t('myHr.performance.profitTotal')} value={`${performance.profit_total} TND`} />
          </View>
        </View>
      )}
    </ScrollView>
  )
}

function InfoRow({ label, value }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  )
}

function StatBox({ label, value }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  content: { padding: 20, paddingBottom: 40 },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.background },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: T.text },
  emptyText: { marginTop: 10, fontSize: 13, color: T.textMuted },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  infoLabel: { fontSize: 12, color: T.textMuted },
  infoValue: { fontSize: 13, fontWeight: '700', color: T.text, textAlign: 'right' },
  balanceBox: { marginTop: 10, marginBottom: 4 },
  balanceValue: { fontSize: 24, fontWeight: '800', color: T.primary },
  balanceHint: { marginTop: 4, fontSize: 12, color: T.textMuted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  choiceChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  choiceChipActive: { borderColor: T.primary, backgroundColor: T.primary },
  choiceChipText: { fontSize: 12, fontWeight: '700', color: T.textSecondary },
  choiceChipTextActive: { color: '#fff' },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dateInput: {
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
  },
  dateValueText: { fontSize: 13, fontWeight: '700', color: T.text },
  datePlaceholderText: { fontSize: 13, color: T.textMuted },
  primaryButton: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: T.primary,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  buttonDisabled: { opacity: 0.7 },
  listWrap: { marginTop: 14, gap: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center' },
  listRowTitle: { fontSize: 13, fontWeight: '700', color: T.text },
  listRowMeta: { marginTop: 2, fontSize: 11, color: T.textMuted },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  statBox: {
    flexBasis: '47%',
    borderRadius: 16,
    padding: 14,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.border,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: T.text },
  statLabel: { marginTop: 4, fontSize: 11, color: T.textMuted },
})
