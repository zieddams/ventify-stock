import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import PageHeader from '../../components/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { useNotifications } from '../../contexts/NotificationsContext'
import {
  listNotificationPreferences,
  updateNotificationPreferences,
} from '../../services/notificationService'
import { T, cardShadow } from '../../theme'
import {
  formatNotificationAge,
  notificationChanges,
  notificationMessage,
  resolveNotificationConfig,
  resolveNotificationTarget,
} from '../../utils/notificationActivity'

function StatsCard({ label, value, hint, tone = T.primary }) {
  return (
    <View style={[s.statsCard, cardShadow]}>
      <Text style={s.statsLabel}>{label}</Text>
      <Text style={[s.statsValue, { color: tone }]}>{value}</Text>
      {!!hint && <Text style={s.statsHint}>{hint}</Text>}
    </View>
  )
}

export default function NotificationsScreen() {
  const navigation = useNavigation()
  const { t } = useI18n()
  const {
    notifications,
    unreadCount,
    loading,
    refreshing,
    error,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useNotifications()
  const [preferences, setPreferences] = useState([])
  const [preferencesLoading, setPreferencesLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')

  const activePreferences = useMemo(
    () => preferences.filter((item) => item.enabled).length,
    [preferences],
  )

  const loadPreferences = useCallback(async () => {
    setPreferencesLoading(true)

    try {
      const nextPreferences = await listNotificationPreferences()
      setPreferences(nextPreferences)
      return nextPreferences
    } catch {
      return []
    } finally {
      setPreferencesLoading(false)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshNotifications({ force: true }),
      loadPreferences(),
    ])
  }, [loadPreferences, refreshNotifications])

  useFocusEffect(useCallback(() => {
    refreshAll()
  }, [refreshAll]))

  const togglePreference = useCallback(async (preference) => {
    setSavingKey(preference.key)

    try {
      const nextPreferences = await updateNotificationPreferences([
        {
          key: preference.key,
          enabled: !preference.enabled,
        },
      ])

      setPreferences(nextPreferences)
    } catch {
      // leave the previous preference state in place
    } finally {
      setSavingKey('')
    }
  }, [])

  const openNotification = useCallback(async (notification) => {
    if (!notification.read_at) {
      await markNotificationRead(notification.id)
    }

    const target = resolveNotificationTarget(notification)
    if (!target) {
      return
    }

    if (target.screen) {
      navigation.navigate(target.screen, target.params)
      return
    }

    const tabLabels = {
      home: t('navigation.home'),
      customers: t('navigation.customers'),
      invoices: t('navigation.invoices'),
      notifications: t('navigation.notifications'),
      session: t('navigation.session'),
      stock: t('navigation.stock'),
    }

    if (target.tab && tabLabels[target.tab]) {
      navigation.navigate(tabLabels[target.tab])
    }
  }, [markNotificationRead, navigation, t])

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing || preferencesLoading} onRefresh={refreshAll} tintColor={T.primary} />}
    >
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        actionIcon="refresh"
        actionLabel={t('notifications.refresh')}
        onActionPress={refreshAll}
      />

      <View style={s.statsGrid}>
        <StatsCard
          label={t('notifications.cards.total')}
          value={String(notifications.length)}
          hint={t('notifications.cards.totalHint')}
        />
        <StatsCard
          label={t('notifications.cards.unread')}
          value={String(unreadCount)}
          hint={t('notifications.cards.unreadHint')}
          tone={unreadCount > 0 ? T.danger : T.text}
        />
        <StatsCard
          label={t('notifications.cards.preferences')}
          value={`${activePreferences}/${preferences.length}`}
          hint={t('notifications.cards.preferencesHint')}
          tone={preferences.length > 0 && activePreferences === preferences.length ? T.success : T.primary}
        />
      </View>

      {unreadCount > 0 && (
        <View style={[s.callout, cardShadow]}>
          <View style={s.calloutCopy}>
            <Text style={s.calloutTitle}>{t('notifications.markAllTitle')}</Text>
            <Text style={s.calloutText}>{t('notifications.markAllText', { count: unreadCount })}</Text>
          </View>
          <TouchableOpacity style={s.calloutButton} onPress={markAllNotificationsRead}>
            <Text style={s.calloutButtonText}>{t('notifications.markAll')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!error && (
        <View style={s.noticeDanger}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
          <Text style={s.noticeDangerText}>{error}</Text>
        </View>
      )}

      <View style={[s.sectionCard, cardShadow]}>
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>{t('notifications.preferencesTitle')}</Text>
            <Text style={s.sectionSubtitle}>{t('notifications.preferencesSubtitle')}</Text>
          </View>
          <MaterialCommunityIcons name="tune" size={20} color={T.primary} />
        </View>

        {preferencesLoading && preferences.length === 0 ? (
          <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
        ) : preferences.length === 0 ? (
          <Text style={s.emptyText}>{t('notifications.preferencesEmpty')}</Text>
        ) : (
          <View style={s.preferenceStack}>
            {preferences.map((preference) => (
              <View key={preference.key} style={s.preferenceCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.preferenceTitle}>{preference.label}</Text>
                  <Text style={s.preferenceText}>{preference.description}</Text>
                </View>
                <TouchableOpacity
                  style={[
                    s.preferenceButton,
                    preference.enabled ? s.preferenceButtonEnabled : s.preferenceButtonMuted,
                  ]}
                  disabled={savingKey === preference.key}
                  onPress={() => togglePreference(preference)}
                >
                  {savingKey === preference.key ? (
                    <ActivityIndicator color={preference.enabled ? '#fff' : T.primary} size="small" />
                  ) : (
                    <Text style={[
                      s.preferenceButtonText,
                      preference.enabled ? s.preferenceButtonTextEnabled : s.preferenceButtonTextMuted,
                    ]}
                    >
                      {preference.enabled ? t('notifications.enabled') : t('notifications.disabled')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <View style={s.sectionHeader}>
          <View>
            <Text style={s.sectionTitle}>{t('notifications.historyTitle')}</Text>
            <Text style={s.sectionSubtitle}>{t('notifications.historySubtitle')}</Text>
          </View>
          <MaterialCommunityIcons name="bell-badge-outline" size={20} color={T.info} />
        </View>

        {loading && notifications.length === 0 ? (
          <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
        ) : notifications.length === 0 ? (
          <View style={s.emptyWrap}>
            <MaterialCommunityIcons name="bell-sleep-outline" size={30} color={T.textMuted} />
            <Text style={s.emptyTitle}>{t('notifications.emptyTitle')}</Text>
            <Text style={s.emptyText}>{t('notifications.emptyText')}</Text>
          </View>
        ) : (
          <View style={s.notificationStack}>
            {notifications.map((notification) => {
              const config = resolveNotificationConfig(notification)
              const changes = notificationChanges(notification, 4)
              const unread = !notification.read_at

              return (
                <TouchableOpacity
                  key={notification.id}
                  activeOpacity={0.9}
                  style={[s.notificationCard, unread && s.notificationCardUnread]}
                  onPress={() => openNotification(notification)}
                >
                  <View style={[s.notificationIcon, { backgroundColor: config.bg }]}>
                    <MaterialCommunityIcons name={config.icon} size={20} color={config.color} />
                  </View>
                  <View style={s.notificationBody}>
                    <View style={s.notificationTop}>
                      <Text style={s.notificationLabel}>{config.label}</Text>
                      <Text style={s.notificationAge}>{formatNotificationAge(notification.created_at)}</Text>
                    </View>
                    <Text style={s.notificationMessage}>
                      {notificationMessage(notification, config.label) || t('notifications.newFallback')}
                    </Text>
                    {changes.length > 0 && (
                      <View style={s.changeStack}>
                        {changes.map((change) => (
                          <View key={change} style={s.changeChip}>
                            <Text style={s.changeChipText}>{change}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={s.notificationBottom}>
                      <Text style={[s.notificationHint, { color: config.color }]}>
                        {t('notifications.openLinked')}
                      </Text>
                      {unread ? <Text style={s.unreadBadge}>{t('notifications.markRead')}</Text> : null}
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.background,
  },
  content: {
    padding: 20,
    paddingBottom: 44,
    gap: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statsCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 14,
  },
  statsLabel: {
    fontSize: 11,
    color: T.textMuted,
  },
  statsValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
  },
  statsHint: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    padding: 16,
  },
  calloutCopy: {
    flex: 1,
  },
  calloutTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.info,
  },
  calloutText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: T.textSecondary,
  },
  calloutButton: {
    borderRadius: 16,
    backgroundColor: T.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  calloutButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  noticeDanger: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  noticeDangerText: {
    flex: 1,
    fontSize: 13,
    color: T.danger,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  preferenceStack: {
    gap: 10,
  },
  preferenceCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    padding: 14,
  },
  preferenceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  preferenceText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: T.textSecondary,
  },
  preferenceButton: {
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  preferenceButtonEnabled: {
    backgroundColor: T.primary,
    borderColor: T.primary,
  },
  preferenceButtonMuted: {
    backgroundColor: T.surface,
    borderColor: T.border,
  },
  preferenceButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  preferenceButtonTextEnabled: {
    color: '#fff',
  },
  preferenceButtonTextMuted: {
    color: T.primary,
  },
  notificationStack: {
    gap: 10,
  },
  notificationCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    padding: 14,
  },
  notificationCardUnread: {
    backgroundColor: '#f0fdfa',
    borderColor: '#99f6e4',
  },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBody: {
    flex: 1,
    gap: 8,
  },
  notificationTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  notificationLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  notificationAge: {
    fontSize: 11,
    color: T.textMuted,
  },
  notificationMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: T.textSecondary,
  },
  changeStack: {
    gap: 6,
  },
  changeChip: {
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  changeChipText: {
    fontSize: 11,
    lineHeight: 16,
    color: T.textSecondary,
  },
  notificationBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  notificationHint: {
    fontSize: 12,
    fontWeight: '700',
  },
  unreadBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: T.primary,
    backgroundColor: '#ccfbf1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: T.textSecondary,
  },
})
