import Constants from 'expo-constants'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import api from '../../services/api'
import { downloadAndLaunchApkUpdate, isInAppUpdateSupported } from '../../services/mobileUpdateService'
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

const BUG_SEVERITIES = [
  { value: 'low', label: 'Faible' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
]

export default function ProfileScreen() {
  const { user, logout } = useAuth()
  const [checkingRelease, setCheckingRelease] = useState(false)
  const [releaseError, setReleaseError] = useState('')
  const [latestRelease, setLatestRelease] = useState(null)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [bugModalVisible, setBugModalVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)
  const [sendingBug, setSendingBug] = useState(false)
  const [bugSubject, setBugSubject] = useState('')
  const [bugSeverity, setBugSeverity] = useState('medium')
  const [bugDescription, setBugDescription] = useState('')

  const currentVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || '1.3.15'
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
      setReleaseError(describeApiError(error, 'Vérification des mises à jour indisponible.'))
      return null
    } finally {
      if (!silent) {
        setCheckingRelease(false)
      }
    }
  }, [])

  useEffect(() => {
    loadLatestRelease({ silent: true })
  }, [loadLatestRelease])

  const hasUpdate = useMemo(() => {
    if (!latestRelease?.version) return false
    return compareReleaseVersions(latestRelease.version, currentVersion) > 0
  }, [currentVersion, latestRelease?.version])

  const confirmLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous fermer la session mobile ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
    ])
  }

  const handleInstallUpdate = async () => {
    const release = latestRelease || await loadLatestRelease()

    if (!release) {
      return
    }

    const comparison = compareReleaseVersions(release.version, currentVersion)
    if (comparison <= 0) {
      Alert.alert('Application', 'Cette version est déjà à jour.')
      return
    }

    setInstallingUpdate(true)
    setDownloadProgress({ ratio: 0, writtenBytes: 0, expectedBytes: release.apkSize || 0 })

    try {
      await downloadAndLaunchApkUpdate({
        url: release.apkUrl,
        version: release.version,
        expectedBytes: release.apkSize || 0,
        onProgress: setDownloadProgress,
      })
    } catch (error) {
      Alert.alert('Mise à jour', describeApiError(error, 'Installation impossible.'))
    } finally {
      setInstallingUpdate(false)
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
      Alert.alert('Signalement', 'Le sujet est obligatoire.')
      return
    }

    if (!bugDescription.trim()) {
      Alert.alert('Signalement', 'Ajoutez une description du problème.')
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
        },
      })

      resetBugForm()
      Alert.alert('Signalement envoyé', 'Votre signalement a été transmis à l’équipe support.')
    } catch (error) {
      setSendingBug(false)
      Alert.alert('Signalement impossible', describeApiError(error, 'Veuillez réessayer.'))
    }
  }

  return (
    <>
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <PageHeader
          title="Compte"
          subtitle="Application, support et déconnexion."
        />

        <View style={[s.heroCard, cardShadow]}>
          <View style={s.heroTop}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{user?.name?.[0]?.toUpperCase() ?? 'U'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>{user?.name || 'Compte mobile'}</Text>
              <Text style={s.heroSubtitle}>{user?.email || 'Email non renseigné'}</Text>
            </View>
            <StatusChip label={user?.role || 'mobile'} tone="info" />
          </View>

          <Text style={s.heroInfo}>
            Vous êtes connecté avec le compte {user?.name || 'mobile'}.
          </Text>
          <Text style={s.heroMeta}>
            Version {currentVersion}{buildVersion ? ` (${buildVersion})` : ''}
          </Text>
        </View>

        <View style={[s.sectionCard, cardShadow]}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Mise à jour</Text>
            <TouchableOpacity style={s.inlineButton} onPress={() => loadLatestRelease()}>
              {checkingRelease ? <ActivityIndicator size="small" color={T.primary} /> : <Text style={s.inlineButtonText}>Vérifier</Text>}
            </TouchableOpacity>
          </View>

          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Version installée</Text>
            <Text style={s.infoValue}>{currentVersion}{buildVersion ? ` (${buildVersion})` : ''}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Dernière release</Text>
            <Text style={s.infoValue}>{latestRelease?.version || '--'}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>État</Text>
            <Text style={s.infoValue}>{hasUpdate ? 'Mise à jour disponible' : 'Application à jour'}</Text>
          </View>
          {latestRelease?.publishedAt ? (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Publication</Text>
              <Text style={s.infoValue}>{formatDateTime(latestRelease.publishedAt)}</Text>
            </View>
          ) : null}

          {!!releaseError && <Text style={s.inlineError}>{releaseError}</Text>}

          {installingUpdate && (
            <View style={s.progressWrap}>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${progressPercent(downloadProgress)}%` }]} />
              </View>
              <Text style={s.progressText}>{progressPercent(downloadProgress)}%</Text>
            </View>
          )}

          {isInAppUpdateSupported() ? (
            <TouchableOpacity
              style={[s.primaryButton, (!hasUpdate || installingUpdate) && s.buttonDisabled]}
              onPress={handleInstallUpdate}
              disabled={!hasUpdate || installingUpdate}
            >
              {installingUpdate ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryButtonText}>
                  {hasUpdate ? 'Télécharger et installer' : 'Application à jour'}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={s.inlineHint}>L’installation intégrée est disponible uniquement sur Android.</Text>
          )}
        </View>

        <View style={[s.sectionCard, cardShadow]}>
          <Text style={s.sectionTitle}>Support</Text>
          <Text style={s.sectionText}>
            Un signalement mobile est envoyé au même centre support que la plateforme web.
          </Text>

          <TouchableOpacity style={s.secondaryButton} onPress={() => setBugModalVisible(true)}>
            <MaterialCommunityIcons name="bug-outline" size={18} color={T.primary} />
            <Text style={s.secondaryButtonText}>Signaler un bug</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryButton} onPress={() => setAboutVisible(true)}>
            <MaterialCommunityIcons name="information-outline" size={18} color={T.primary} />
            <Text style={s.secondaryButtonText}>À propos</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.sectionCard, cardShadow]}>
          <Text style={s.sectionTitle}>Session mobile</Text>
          <Text style={s.sectionText}>
            Vous êtes connecté avec le compte {user?.email || 'mobile'}.
          </Text>

          <TouchableOpacity style={s.logoutButton} onPress={confirmLogout}>
            <MaterialCommunityIcons name="logout" size={18} color="#fff" />
            <Text style={s.logoutButtonText}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={bugModalVisible} transparent animationType="fade" onRequestClose={resetBugForm}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Signaler un bug</Text>
            <Text style={s.dialogText}>Décrivez simplement le problème rencontré sur le mobile.</Text>

            <Text style={s.fieldLabel}>Sujet</Text>
            <TextInput
              style={s.input}
              placeholder="Exemple : facture bloquée"
              placeholderTextColor={T.textMuted}
              value={bugSubject}
              onChangeText={setBugSubject}
            />

            <Text style={s.fieldLabel}>Priorité</Text>
            <View style={s.severityRow}>
              {BUG_SEVERITIES.map((item) => {
                const active = bugSeverity === item.value
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[s.severityChip, active && s.severityChipActive]}
                    onPress={() => setBugSeverity(item.value)}
                  >
                    <Text style={[s.severityChipText, active && s.severityChipTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Que s’est-il passé ?"
              placeholderTextColor={T.textMuted}
              multiline
              textAlignVertical="top"
              value={bugDescription}
              onChangeText={setBugDescription}
            />

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={resetBugForm}>
                <Text style={s.dialogSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dialogPrimary, sendingBug && s.buttonDisabled]} onPress={submitBugReport} disabled={sendingBug}>
                {sendingBug ? <ActivityIndicator color="#fff" /> : <Text style={s.dialogPrimaryText}>Envoyer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={aboutVisible} transparent animationType="fade" onRequestClose={() => setAboutVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>À propos</Text>
            <Text style={s.dialogText}>
              El Irtiwaa Mobile accompagne la session commerciale, le stock camion et la facturation terrain.
            </Text>

            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Version</Text>
              <Text style={s.infoValue}>{currentVersion}{buildVersion ? ` (${buildVersion})` : ''}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Compte</Text>
              <Text style={s.infoValue}>{user?.email || '--'}</Text>
            </View>

            <TouchableOpacity style={s.dialogSecondary} onPress={() => setAboutVisible(false)}>
              <Text style={s.dialogSecondaryText}>Fermer</Text>
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
  severityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  severityChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  severityChipActive: {
    borderColor: T.primary,
    backgroundColor: T.primary,
  },
  severityChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
  },
  severityChipTextActive: {
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
