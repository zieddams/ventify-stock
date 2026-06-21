import Constants from 'expo-constants'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { downloadAndLaunchApkUpdate, isInAppUpdateSupported } from '../../services/mobileUpdateService'
import { compareReleaseVersions, getLatestMobileReleases } from '../../services/releaseService'
import { T, cardShadow } from '../../theme'
import { formatDateTime, routeStatusLabel } from '../../utils/format'

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

export default function ProfileScreen() {
  const { user, refreshUser, logout, sessionStatus } = useAuth()
  const { session, trackingState, locationPermission } = useTracking()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [checkingRelease, setCheckingRelease] = useState(false)
  const [releaseError, setReleaseError] = useState('')
  const [latestRelease, setLatestRelease] = useState(null)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(null)

  const currentVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || '1.3.11'
  const buildVersion = Constants.nativeBuildVersion || String(Constants.expoConfig?.android?.versionCode ?? '')

  useEffect(() => {
    setName(user?.name || '')
    setEmail(user?.email || '')
  }, [user?.name, user?.email])

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
      const message = describeApiError(error, 'Vérification des mises à jour indisponible.')
      setReleaseError(message)
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

  const sessionTone = !session
    ? 'warning'
    : session.status === 'open'
      ? 'success'
      : 'info'

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Profil', 'Le nom est obligatoire.')
      return
    }

    if (!email.trim()) {
      Alert.alert('Profil', 'L email est obligatoire.')
      return
    }

    setSavingProfile(true)

    try {
      await api.put('/auth/profile', {
        name: name.trim(),
        email: email.trim(),
      })
      await refreshUser()
      Alert.alert('Profil', 'Vos informations ont été mises à jour.')
    } catch (error) {
      Alert.alert('Profil', describeApiError(error, 'Mise à jour impossible.'))
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Mot de passe', 'Renseignez les trois champs.')
      return
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mot de passe', 'La confirmation ne correspond pas.')
      return
    }

    setSavingPassword(true)

    try {
      await api.put('/auth/password', {
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      Alert.alert('Mot de passe', 'Votre mot de passe a été mis à jour.')
    } catch (error) {
      Alert.alert('Mot de passe', describeApiError(error, 'Changement impossible.'))
    } finally {
      setSavingPassword(false)
    }
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

  const confirmLogout = () => {
    Alert.alert('Deconnexion', 'Voulez-vous fermer la session mobile ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se deconnecter', style: 'destructive', onPress: () => logout() },
    ])
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <PageHeader
        title="Réglages mobiles"
        subtitle="Compte, session, tracking et mise à jour."
      />

      <View style={[s.heroCard, cardShadow]}>
        <View style={s.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>{user?.name || 'Compte mobile'}</Text>
            <Text style={s.heroSubtitle}>{user?.email || 'Email non renseigne'}</Text>
          </View>
          <StatusChip label={user?.role || 'mobile'} tone="info" />
        </View>

        <View style={s.heroMetaRow}>
          <StatusChip
            label={session ? routeStatusLabel(session.status) : 'Sans session'}
            tone={sessionTone}
          />
          <StatusChip
            label={trackingState.active ? 'Tracking actif' : 'Tracking en attente'}
            tone={trackingState.active ? 'success' : 'warning'}
          />
          <StatusChip
            label={locationPermission === 'granted' ? 'GPS autorisé' : 'GPS à vérifier'}
            tone={locationPermission === 'granted' ? 'success' : 'warning'}
          />
        </View>

        <Text style={s.heroInfo}>
          Version {currentVersion}{buildVersion ? ` (${buildVersion})` : ''} | Dernier heartbeat {sessionStatus.lastPingAt ? formatDateTime(sessionStatus.lastPingAt) : '--'}
        </Text>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Mon profil</Text>

        <Text style={s.fieldLabel}>Nom</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Nom complet"
          placeholderTextColor={T.textMuted}
        />

        <Text style={s.fieldLabel}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Adresse email"
          placeholderTextColor={T.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TouchableOpacity style={[s.primaryButton, savingProfile && s.buttonDisabled]} onPress={handleSaveProfile} disabled={savingProfile}>
          {savingProfile ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Enregistrer le profil</Text>}
        </TouchableOpacity>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Mot de passe</Text>

        <Text style={s.fieldLabel}>Mot de passe actuel</Text>
        <TextInput
          style={s.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Mot de passe actuel"
          placeholderTextColor={T.textMuted}
          secureTextEntry
        />

        <Text style={s.fieldLabel}>Nouveau mot de passe</Text>
        <TextInput
          style={s.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Nouveau mot de passe"
          placeholderTextColor={T.textMuted}
          secureTextEntry
        />

        <Text style={s.fieldLabel}>Confirmation</Text>
        <TextInput
          style={s.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirmer le mot de passe"
          placeholderTextColor={T.textMuted}
          secureTextEntry
        />

        <TouchableOpacity style={[s.primaryButton, savingPassword && s.buttonDisabled]} onPress={handleSavePassword} disabled={savingPassword}>
          {savingPassword ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Changer le mot de passe</Text>}
        </TouchableOpacity>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Application</Text>
          <TouchableOpacity style={s.secondaryInlineButton} onPress={() => loadLatestRelease()}>
            {checkingRelease ? <ActivityIndicator size="small" color={T.primary} /> : <Text style={s.secondaryInlineButtonText}>Vérifier</Text>}
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
          <Text style={s.infoLabel}>Etat</Text>
          <Text style={s.infoValue}>{hasUpdate ? 'Mise à jour disponible' : 'Application à jour'}</Text>
        </View>

        {!!releaseError && <Text style={s.inlineError}>{releaseError}</Text>}

        {isInAppUpdateSupported() ? (
          <TouchableOpacity
            style={[s.primaryButton, (!hasUpdate || installingUpdate) && s.buttonDisabled]}
            onPress={handleInstallUpdate}
            disabled={!hasUpdate || installingUpdate}
          >
            {installingUpdate ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Télécharger et installer</Text>}
          </TouchableOpacity>
        ) : (
          <Text style={s.helperText}>L’installation intégrée est réservée à Android.</Text>
        )}

        {downloadProgress ? (
          <View style={s.progressWrap}>
            <View style={s.progressTrack}>
              <View style={[s.progressBar, { width: `${progressPercent(downloadProgress)}%` }]} />
            </View>
            <Text style={s.progressText}>{progressPercent(downloadProgress)}%</Text>
          </View>
        ) : null}
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Etat mobile</Text>

        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Session du jour</Text>
          <Text style={s.infoValue}>{session ? `#${session.id} - ${routeStatusLabel(session.status)}` : 'Aucune session'}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Dernier report</Text>
          <Text style={s.infoValue}>{sessionStatus.lastReportAt ? formatDateTime(sessionStatus.lastReportAt) : '--'}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Dernier ping</Text>
          <Text style={s.infoValue}>{sessionStatus.lastPingAt ? formatDateTime(sessionStatus.lastPingAt) : '--'}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Dernière sync tracking</Text>
          <Text style={s.infoValue}>{trackingState.lastSyncAt ? formatDateTime(trackingState.lastSyncAt) : '--'}</Text>
        </View>

        {trackingState.error ? (
          <View style={s.noticeWarning}>
            <MaterialCommunityIcons name="map-marker-alert-outline" size={18} color={T.warning} />
            <Text style={s.noticeWarningText}>{trackingState.error}</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity style={s.logoutButton} onPress={confirmLogout}>
        <MaterialCommunityIcons name="logout" size={18} color={T.danger} />
        <Text style={s.logoutText}>Se deconnecter</Text>
      </TouchableOpacity>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: T.text,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: T.textSecondary,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  heroInfo: {
    marginTop: 12,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
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
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: T.primary,
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  secondaryInlineButton: {
    minWidth: 86,
    minHeight: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryInlineButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.primary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  infoLabel: {
    flex: 1,
    fontSize: 13,
    color: T.textSecondary,
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    color: T.text,
  },
  helperText: {
    marginTop: 12,
    fontSize: 13,
    color: T.textMuted,
  },
  inlineError: {
    marginTop: 12,
    fontSize: 13,
    color: T.danger,
  },
  progressWrap: {
    marginTop: 14,
    gap: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: T.primary,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textSecondary,
  },
  noticeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  noticeWarningText: {
    flex: 1,
    fontSize: 13,
    color: T.warning,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
    paddingVertical: 15,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '800',
    color: T.danger,
  },
})


