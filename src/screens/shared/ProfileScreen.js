import Constants from 'expo-constants'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useMobileUpdate } from '../../contexts/MobileUpdateContext'
import { useNotifications } from '../../contexts/NotificationsContext'
import api from '../../services/api'
import { compareReleaseVersions, getLatestMobileReleases } from '../../services/releaseService'
import { T, cardShadow } from '../../theme'
import { formatDateTime } from '../../utils/format'

function firstApiErrorMessage(errors) {
  return Object.values(errors ?? {}).flat().find(Boolean)
}

function describeApiError(err, fallback) {
  if (err?.response?.data) {
    return err.response.data.message || firstApiErrorMessage(err.response.data.errors) || fallback
  }

  return err?.message || fallback
}

function progressPercent(progress) {
  const ratio = Number(progress?.ratio || 0)
  if (!Number.isFinite(ratio) || ratio <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(ratio * 100)))
}

function formatFileSize(value) {
  const bytes = Number(value || 0)

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 MB'
  }

  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`
}

export default function ProfileScreen() {
  const navigation = useNavigation()
  const { user, logout } = useAuth()
  const { locale, savingLocale, setLocale, supportedLocales, t } = useI18n()
  const { unreadCount } = useNotifications()
  const {
    clearUpdateError,
    isSupported: isUpdateSupported,
    startOrResumeUpdate,
    updateState,
  } = useMobileUpdate()
  const [checkingRelease, setCheckingRelease] = useState(false)
  const [releaseError, setReleaseError] = useState('')
  const [latestRelease, setLatestRelease] = useState(null)
  const [bugModalVisible, setBugModalVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)
  const [sendingBug, setSendingBug] = useState(false)
  const [bugSubject, setBugSubject] = useState('')
  const [bugSeverity, setBugSeverity] = useState('medium')
  const [bugDescription, setBugDescription] = useState('')

  const bugSeverities = useMemo(() => ([
    { value: 'low', label: t('profile.severityLow') },
    { value: 'medium', label: t('profile.severityMedium') },
    { value: 'high', label: t('profile.severityHigh') },
  ]), [t])

  const currentVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || '0.0.0'
  const buildVersion = Constants.nativeBuildVersion || String(Constants.expoConfig?.android?.versionCode ?? '')

  const loadLatestRelease = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setCheckingRelease(true)
    }

    try {
      const [release] = await getLatestMobileReleases(1)
      setLatestRelease(release || null)
      setReleaseError('')
      return release || null
    } catch (error) {
      setReleaseError(describeApiError(error, t('profile.verifyUnavailable')))
      return null
    } finally {
      if (!silent) {
        setCheckingRelease(false)
      }
    }
  }, [t])

  useEffect(() => {
    loadLatestRelease({ silent: true })
  }, [loadLatestRelease])

  const hasUpdate = useMemo(() => {
    if (!latestRelease?.version) return false
    return compareReleaseVersions(latestRelease.version, currentVersion) > 0
  }, [currentVersion, latestRelease?.version])

  const isCurrentReleaseDownload = useMemo(() => (
    Boolean(latestRelease?.version) &&
    updateState.version === latestRelease.version
  ), [latestRelease?.version, updateState.version])

  const visibleProgress = isCurrentReleaseDownload ? updateState.progress : null
  const isDownloadingCurrentRelease = isCurrentReleaseDownload && updateState.status === 'downloading'
  const isPausedCurrentRelease = isCurrentReleaseDownload && updateState.status === 'paused'
  const isDownloadedCurrentRelease = isCurrentReleaseDownload && updateState.status === 'downloaded'
  const hasCurrentReleaseError = isCurrentReleaseDownload && Boolean(updateState.errorMessage)

  const updateActionLabel = useMemo(() => {
    if (isDownloadingCurrentRelease) return t('profile.downloadInProgress')
    if (isPausedCurrentRelease) return t('profile.resumeDownload')
    if (isDownloadedCurrentRelease) return t('profile.installDownloaded')
    return hasUpdate ? t('profile.installNow') : t('profile.upToDate')
  }, [hasUpdate, isDownloadedCurrentRelease, isDownloadingCurrentRelease, isPausedCurrentRelease, t])

  const confirmLogout = () => {
    Alert.alert(t('profile.logoutTitle'), t('profile.logoutPrompt'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.logout'), style: 'destructive', onPress: () => logout() },
    ])
  }

  const handleInstallUpdate = async () => {
    const release = latestRelease || await loadLatestRelease()

    if (!release) {
      return
    }

    const comparison = compareReleaseVersions(release.version, currentVersion)
    if (comparison <= 0) {
      Alert.alert(t('common.update'), t('profile.alreadyUpdated'))
      return
    }

    try {
      if (hasCurrentReleaseError) {
        await clearUpdateError()
      }

      await startOrResumeUpdate(release)
    } catch (error) {
      Alert.alert(t('common.update'), describeApiError(error, t('profile.updateFailed')))
    }
  }

  const resetBugForm = () => {
    setBugSubject('')
    setBugSeverity('medium')
    setBugDescription('')
    setSendingBug(false)
    setBugModalVisible(false)
  }

  const submitBugReport = async () => {
    if (!bugSubject.trim()) {
      Alert.alert(t('profile.bugTitle'), t('profile.bugSubjectRequired'))
      return
    }

    if (!bugDescription.trim()) {
      Alert.alert(t('profile.bugTitle'), t('profile.bugDescriptionRequired'))
      return
    }

    setSendingBug(true)

    try {
      await api.post('/bug-reports', {
        subject: bugSubject.trim(),
        area: 'mobile_app',
        severity: bugSeverity,
        description: bugDescription.trim(),
        metadata: {
          source: 'mobile_app',
          platform: Platform.OS,
          app_version: currentVersion,
          build_version: buildVersion || null,
          user_role: user?.role || null,
          locale,
        },
      })

      resetBugForm()
      Alert.alert(t('profile.bugSentTitle'), t('profile.bugSentText'))
    } catch (error) {
      setSendingBug(false)
      Alert.alert(t('profile.bugFailedTitle'), describeApiError(error, t('profile.retry')))
    }
  }

  return (
    <>
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <PageHeader
          title={t('profile.title')}
          subtitle={t('profile.subtitle')}
        />

        <View style={[s.heroCard, cardShadow]}>
          <View style={s.heroTop}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{user?.name?.[0]?.toUpperCase() ?? 'U'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>{user?.name || t('common.account')}</Text>
              <Text style={s.heroSubtitle}>{user?.email || t('profile.noEmail')}</Text>
            </View>
            <StatusChip label={user?.role || t('profile.roleFallback')} tone="info" />
          </View>

          <Text style={s.heroInfo}>
            {t('profile.connectedWith', { name: user?.name || t('common.account') })}
          </Text>
          <Text style={s.heroMeta}>
            {t('common.version')} {currentVersion}{buildVersion ? ` (${buildVersion})` : ''}
          </Text>
        </View>

        <View style={[s.sectionCard, cardShadow]}>
          <Text style={s.sectionTitle}>{t('profile.languageTitle')}</Text>
          <Text style={s.sectionText}>{t('profile.languageText')}</Text>
          <View style={s.chipRow}>
            {supportedLocales.map((item) => {
              const active = item.code === locale

              return (
                <TouchableOpacity
                  key={item.code}
                  style={[s.choiceChip, active && s.choiceChipActive]}
                  onPress={() => { void setLocale(item.code) }}
                  disabled={savingLocale}
                >
                  <Text style={[s.choiceChipText, active && s.choiceChipTextActive]}>
                    {item.short} · {item.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={[s.sectionCard, cardShadow]}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>{t('profile.updatesTitle')}</Text>
            <TouchableOpacity style={s.inlineButton} onPress={() => loadLatestRelease()}>
              {checkingRelease ? <ActivityIndicator size="small" color={T.primary} /> : <Text style={s.inlineButtonText}>{t('common.check')}</Text>}
            </TouchableOpacity>
          </View>

          <View style={s.infoRow}>
            <Text style={s.infoLabel}>{t('profile.installedVersion')}</Text>
            <Text style={s.infoValue}>{currentVersion}{buildVersion ? ` (${buildVersion})` : ''}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>{t('profile.latestRelease')}</Text>
            <Text style={s.infoValue}>{latestRelease?.version || '--'}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>{t('profile.status')}</Text>
            <Text style={s.infoValue}>{hasUpdate ? t('profile.updateAvailable') : t('profile.upToDate')}</Text>
          </View>
          {latestRelease?.publishedAt ? (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>{t('profile.publishedAt')}</Text>
              <Text style={s.infoValue}>{formatDateTime(latestRelease.publishedAt)}</Text>
            </View>
          ) : null}

          {!!releaseError && <Text style={s.inlineError}>{releaseError}</Text>}
          {!!updateState.errorMessage && isCurrentReleaseDownload ? (
            <Text style={s.inlineError}>{updateState.errorMessage}</Text>
          ) : null}

          {latestRelease?.apkSize ? (
            <Text style={s.inlineHint}>
              {t('profile.updatePackageSize', { size: formatFileSize(latestRelease.apkSize) })}
            </Text>
          ) : null}

          {visibleProgress ? (
            <View style={s.progressWrap}>
              <View style={s.progressHeader}>
                <Text style={s.progressLabel}>
                  {isPausedCurrentRelease ? t('profile.downloadPaused') : t('profile.downloadContinuing')}
                </Text>
                <Text style={s.progressMeta}>
                  {formatFileSize(visibleProgress.writtenBytes)} / {formatFileSize(visibleProgress.expectedBytes)}
                </Text>
              </View>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${progressPercent(visibleProgress)}%` }]} />
              </View>
              <Text style={s.progressText}>{progressPercent(visibleProgress)}%</Text>
            </View>
          ) : null}

          {isDownloadedCurrentRelease ? (
            <Text style={s.inlineHint}>{t('profile.downloadReady')}</Text>
          ) : null}

          {isUpdateSupported ? (
            <TouchableOpacity
              style={[s.primaryButton, ((!hasUpdate && !isDownloadedCurrentRelease) || isDownloadingCurrentRelease) && s.buttonDisabled]}
              onPress={handleInstallUpdate}
              disabled={(!hasUpdate && !isDownloadedCurrentRelease) || isDownloadingCurrentRelease}
            >
              {isDownloadingCurrentRelease ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryButtonText}>
                  {updateActionLabel}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={s.inlineHint}>{t('profile.androidOnly')}</Text>
          )}
        </View>

        <View style={[s.sectionCard, cardShadow]}>
          <Text style={s.sectionTitle}>{t('profile.notificationsTitle')}</Text>
          <Text style={s.sectionText}>
            {unreadCount > 0
              ? t('profile.notificationsUnread', { count: unreadCount })
              : t('profile.notificationsEmpty')}
          </Text>

          <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Notifications')}>
            <MaterialCommunityIcons name="bell-outline" size={18} color={T.primary} />
            <Text style={s.secondaryButtonText}>{t('profile.notificationsAction')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.sectionCard, cardShadow]}>
          <Text style={s.sectionTitle}>{t('profile.supportTitle')}</Text>
          <Text style={s.sectionText}>{t('profile.supportText')}</Text>

          <TouchableOpacity style={s.secondaryButton} onPress={() => setBugModalVisible(true)}>
            <MaterialCommunityIcons name="bug-outline" size={18} color={T.primary} />
            <Text style={s.secondaryButtonText}>{t('profile.reportBug')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryButton} onPress={() => setAboutVisible(true)}>
            <MaterialCommunityIcons name="information-outline" size={18} color={T.primary} />
            <Text style={s.secondaryButtonText}>{t('profile.about')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.sectionCard, cardShadow]}>
          <Text style={s.sectionTitle}>{t('profile.sessionTitle')}</Text>
          <Text style={s.sectionText}>
            {t('profile.sessionText', { email: user?.email || '--' })}
          </Text>

          <TouchableOpacity style={s.logoutButton} onPress={confirmLogout}>
            <MaterialCommunityIcons name="logout" size={18} color="#fff" />
            <Text style={s.logoutButtonText}>{t('common.logout')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={bugModalVisible} transparent animationType="fade" onRequestClose={resetBugForm}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{t('profile.bugTitle')}</Text>
            <Text style={s.dialogText}>{t('profile.bugText')}</Text>

            <Text style={s.fieldLabel}>{t('common.subject')}</Text>
            <TextInput
              style={s.input}
              placeholder={t('profile.bugSubjectPlaceholder')}
              placeholderTextColor={T.textMuted}
              value={bugSubject}
              onChangeText={setBugSubject}
            />

            <Text style={s.fieldLabel}>{t('common.priority')}</Text>
            <View style={s.chipRow}>
              {bugSeverities.map((item) => {
                const active = bugSeverity === item.value
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[s.choiceChip, active && s.choiceChipActive]}
                    onPress={() => setBugSeverity(item.value)}
                  >
                    <Text style={[s.choiceChipText, active && s.choiceChipTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={s.fieldLabel}>{t('common.description')}</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder={t('profile.bugDescriptionPlaceholder')}
              placeholderTextColor={T.textMuted}
              multiline
              textAlignVertical="top"
              value={bugDescription}
              onChangeText={setBugDescription}
            />

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={resetBugForm}>
                <Text style={s.dialogSecondaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dialogPrimary, sendingBug && s.buttonDisabled]} onPress={submitBugReport} disabled={sendingBug}>
                {sendingBug ? <ActivityIndicator color="#fff" /> : <Text style={s.dialogPrimaryText}>{t('common.send')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={aboutVisible} transparent animationType="fade" onRequestClose={() => setAboutVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{t('profile.about')}</Text>
            <Text style={s.dialogText}>{t('profile.aboutText')}</Text>

            <View style={s.infoRow}>
              <Text style={s.infoLabel}>{t('common.version')}</Text>
              <Text style={s.infoValue}>{currentVersion}{buildVersion ? ` (${buildVersion})` : ''}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>{t('profile.accountLabel')}</Text>
              <Text style={s.infoValue}>{user?.email || '--'}</Text>
            </View>

            <TouchableOpacity style={s.dialogSecondary} onPress={() => setAboutVisible(false)}>
              <Text style={s.dialogSecondaryText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
    marginBottom: 14,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.primary,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: T.text,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: T.textSecondary,
  },
  heroInfo: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
    color: T.textSecondary,
  },
  heroMeta: {
    marginTop: 6,
    fontSize: 12,
    color: T.textMuted,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  sectionText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: T.textSecondary,
  },
  inlineButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.border,
  },
  inlineButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.primary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  infoLabel: {
    fontSize: 12,
    color: T.textMuted,
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: T.text,
    textAlign: 'right',
  },
  inlineError: {
    marginTop: 12,
    fontSize: 12,
    color: T.danger,
  },
  inlineHint: {
    marginTop: 12,
    fontSize: 12,
    color: T.textMuted,
  },
  progressWrap: {
    marginTop: 14,
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: T.text,
  },
  progressMeta: {
    fontSize: 12,
    color: T.textMuted,
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: T.primary,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textSecondary,
    textAlign: 'right',
  },
  primaryButton: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: T.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: T.danger,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
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
    lineHeight: 20,
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
  textarea: {
    minHeight: 120,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  choiceChip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  choiceChipActive: {
    borderColor: T.primary,
    backgroundColor: T.primary,
  },
  choiceChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
  },
  choiceChipTextActive: {
    color: '#fff',
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
  buttonDisabled: {
    opacity: 0.7,
  },
})
