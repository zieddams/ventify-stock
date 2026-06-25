import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCurrency } from '../../utils/format'

function sortByName(items) {
  return [...items].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'fr'))
}

export default function CustomersScreen() {
  const navigation = useNavigation()
  const { canManageAllCustomers } = useAuth()
  const { t } = useI18n()
  const { syncInteraction } = useTracking()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [createVisible, setCreateVisible] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')

  const hasGlobalCustomerAccess = canManageAllCustomers()

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    }

    try {
      const response = await api.get('/customers')
      const items = Array.isArray(response.data) ? response.data : response.data?.data ?? []
      setCustomers(sortByName(items))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    load()
    const interval = setInterval(() => load(), 45000)
    return () => clearInterval(interval)
  }, [load]))

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) {
      return customers
    }

    return customers.filter((item) => (
      item.name?.toLowerCase().includes(needle)
      || item.phone?.toLowerCase().includes(needle)
      || item.address?.toLowerCase().includes(needle)
      || item.owner?.name?.toLowerCase().includes(needle)
      || item.wilaya?.toLowerCase().includes(needle)
    ))
  }, [customers, search])

  const resetCreateForm = () => {
    setCreateVisible(false)
    setNewCustomerName('')
    setNewCustomerPhone('')
    setNewCustomerAddress('')
    setCreating(false)
  }

  const createCustomer = async () => {
    if (!newCustomerName.trim()) {
      Alert.alert(t('customers.requiredTitle'), t('customers.requiredText'))
      return
    }

    setCreating(true)

    try {
      const response = await api.post('/customers', {
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        address: newCustomerAddress.trim() || null,
      })

      setCustomers((current) => sortByName([...current, response.data]))
      await syncInteraction('customer-create', { includeLocation: false, refreshSession: false })
      resetCreateForm()
      Alert.alert(t('customers.createdTitle'), t('customers.createdText'))
    } catch (error) {
      setCreating(false)
      Alert.alert(t('customers.createFailedTitle'), error.response?.data?.message || t('customers.retry'))
    }
  }

  return (
    <View style={s.root}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const hasCredit = Number(item?.credit_balance ?? 0) > 0

          return (
            <View style={[s.row, cardShadow]}>
              <TouchableOpacity
                style={s.rowMain}
                activeOpacity={0.84}
                onPress={() => navigation.navigate('InvoiceCreate', { initialCustomer: item })}
              >
                <View style={s.rowIcon}>
                  <MaterialCommunityIcons name="account-outline" size={18} color={T.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{item.name}</Text>
                  <Text style={s.rowMeta}>{item.phone || t('customers.noPhone')}</Text>
                  <Text style={s.rowMeta}>{item.address || t('customers.noAddress')}</Text>
                  {hasGlobalCustomerAccess && (
                    <Text style={s.rowOwner}>
                      {t('customers.assignedTo', { name: item.owner?.name || t('customers.ownerUnknown') })}
                    </Text>
                  )}
                  {hasCredit && (
                    <View style={s.badges}>
                      <View style={[s.badge, s.badgeDanger]}>
                        <MaterialCommunityIcons name="credit-card-outline" size={14} color="#b91c1c" />
                        <Text style={[s.badgeText, s.badgeTextDanger]}>
                          {t('customers.creditLabel', { value: formatCurrency(item.credit_balance) })}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <View style={s.actionsColumn}>
                <TouchableOpacity
                  style={[s.actionButton, s.secondaryActionButton]}
                  onPress={() => navigation.navigate('CustomerLedger', { customer: item })}
                >
                  <MaterialCommunityIcons name="credit-card-check-outline" size={18} color={T.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.actionButton}
                  onPress={() => navigation.navigate('InvoiceCreate', { initialCustomer: item })}
                >
                  <MaterialCommunityIcons name="file-document-plus-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )
        }}
        ListHeaderComponent={(
          <View style={s.headerWrap}>
            <PageHeader
              title={t('customers.title')}
              subtitle={hasGlobalCustomerAccess ? t('customers.globalSubtitle') : t('customers.personalSubtitle')}
              actionIcon="account-plus-outline"
              actionLabel={t('customers.newAction')}
              onActionPress={() => setCreateVisible(true)}
            />

            <View style={s.searchCard}>
              <MaterialCommunityIcons name="magnify" size={18} color={T.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder={t('customers.searchPlaceholder')}
                placeholderTextColor={T.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <Text style={s.scopeHint}>
              {t('customers.scopeHint')}
            </Text>
          </View>
        )}
        ListEmptyComponent={(
          <View style={s.emptyWrap}>
            {loading ? (
              <ActivityIndicator color={T.primary} size="large" />
            ) : (
              <>
                <MaterialCommunityIcons name="account-group-outline" size={34} color={T.textMuted} />
                <Text style={s.emptyText}>{t('customers.empty')}</Text>
              </>
            )}
          </View>
        )}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
      />

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={resetCreateForm}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{t('customers.dialogTitle')}</Text>
            <Text style={s.dialogText}>
              {t('customers.dialogText')}
            </Text>

            <Text style={s.fieldLabel}>{t('customers.fields.name')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('customers.placeholders.name')}
              placeholderTextColor={T.textMuted}
              value={newCustomerName}
              onChangeText={setNewCustomerName}
            />

            <Text style={s.fieldLabel}>{t('customers.fields.phone')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('customers.placeholders.phone')}
              placeholderTextColor={T.textMuted}
              value={newCustomerPhone}
              onChangeText={setNewCustomerPhone}
            />

            <Text style={s.fieldLabel}>{t('customers.fields.address')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('customers.placeholders.address')}
              placeholderTextColor={T.textMuted}
              value={newCustomerAddress}
              onChangeText={setNewCustomerAddress}
            />

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={resetCreateForm}>
                <Text style={s.dialogSecondaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogPrimary} onPress={createCustomer} disabled={creating}>
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.dialogPrimaryText}>{t('customers.createAction')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.background,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  headerWrap: {
    marginBottom: 6,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: T.text,
  },
  scopeHint: {
    marginBottom: 12,
    fontSize: 12,
    color: T.textMuted,
  },
  row: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    marginBottom: 10,
  },
  rowMain: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surfaceAlt,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  rowOwner: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: T.primaryDark,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeDanger: {
    backgroundColor: '#fee2e2',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextDanger: {
    color: '#b91c1c',
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.primary,
  },
  actionsColumn: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  secondaryActionButton: {
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.border,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: T.textMuted,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    borderRadius: 22,
    backgroundColor: T.surface,
    padding: 20,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: T.text,
  },
  dialogText: {
    marginTop: 6,
    fontSize: 14,
    color: T.textSecondary,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: T.textMuted,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.text,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  dialogSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.border,
  },
  dialogSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  dialogPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: T.primary,
  },
  dialogPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
})
