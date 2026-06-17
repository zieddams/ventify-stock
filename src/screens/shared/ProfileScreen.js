import Constants from 'expo-constants'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../contexts/AuthContext'
import { useTracking } from '../../contexts/TrackingContext'
import { getLatestMobileReleases, getMobileReleaseHubUrl, compareReleaseVersions } from '../../services/releaseService'
import { getDevicePayload } from '../../services/sessionService'
import { T, cardShadow } from '../../theme'
import { formatDateTime } from '../../utils/format'

function currentCoords(location) {
  const source = location?.coords ?? location
  if (!Number.isFinite(source?.latitude) || !Number.isFinite(source?.longitude)) return 'Position non capturee'
  return `${source.latitude.toFixed(5)}, ${source.longitude.toFixed(5)}`
}

function normalizeReleaseLine(line) {
  return line.replace(/^[-*]\s*/, '').trim()
}

export default function ProfileScreen() {
  const { user, logout, sessionStatus } = useAuth()
  const {
    session,
    busy,
    currentLocation,
    locationPermission,
    trackingState,
    refreshSessionDetails,
    captureCurrentLocation,
  } = useTracking()

  const [releases, setReleases] = useState([])
  const [releaseLoading, setReleaseLoading] = useState(true)
  const [releaseError, setReleaseError] = useState('')
  const [releaseCheckedAt, setReleaseCheckedAt] = useState(null)

  const appVersion = Constants.expoConfig?.version || '1.3.0'
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl || 'API non definie'
  const devicePayload = getDevicePayload()

  const loadReleases = useCallback(async () => {
    setReleaseLoading(true)
    try {
      const latest = await getLatestMobileReleases(5)
      setReleases(latest)
      setReleaseError('')
      setReleaseCheckedAt(new Date().toISOString())
    } catch (error) {
      setReleaseError(error.message || 'Les releases GitHub ne sont pas accessibles pour le moment.')
    } finally {
      setReleaseLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    loadReleases()
  }, [loadReleases]))

  const latestRelease = releases[0] || null
  const hasUpdate = latestRelease
    ? compareReleaseVersions(latestRelease.version, appVersion) > 0
    : false

  const releaseHubUrl = latestRelease?.pageUrl || getMobileReleaseHubUrl()

  const openUrl = useCallback(async (url, label) => {
    if (!url) {
      Alert.alert('Lien indisponible', `Aucun lien ${label} n est disponible pour le moment.`)
      return
    }

    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Ouverture impossible', `Le lien ${label} n a pas pu etre ouvert.`)
    }
  }, [])

  const releaseTone = useMemo(() => {
    if (!latestRelease) return 'neutral'
    return hasUpdate ? 'warning' : 'success'
  }, [hasUpdate, latestRelease])

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <PageHeader
        title="Reglages mobiles"
        subtitle="Compte, tracking terrain, impression thermique et releases."
        actionIcon="refresh"
        actionLabel="Verifier"
        onActionPress={loadReleases}
      />

      <View style={[s.hero, cardShadow]}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{user?.name?.slice(0, 1)?.toUpperCase() || 'U'}</Text>
        </View>
        <Text style={s.heroName}>{user?.name}</Text>
        <Text style={s.heroMeta}>{user?.email}</Text>
        <View style={s.heroBadges}>
          <StatusChip
            label={user?.role === 'rep' ? 'Profil rep' : `Profil ${user?.role || 'staff'}`}
            tone={user?.role === 'rep' ? 'success' : 'info'}
          />
          <StatusChip label={hasUpdate ? 'Update disponible' : 'Canal stable'} tone={releaseTone} />
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Pipeline & releases</Text>
          {releaseLoading ? <ActivityIndicator color={T.primary} size="small" /> : null}
        </View>

        <View style={s.infoRow}>
          <MaterialCommunityIcons name="cellphone-cog" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Version installee</Text>
          <Text style={s.infoValue}>{appVersion}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="download-network-outline" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Derniere stable</Text>
          <Text style={s.infoValue}>{latestRelease?.tagName || 'Verification en cours'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="source-branch" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Canal</Text>
          <Text style={s.infoValue}>stable / GitHub releases</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Derniere verification</Text>
          <Text style={s.infoValue}>{formatDateTime(releaseCheckedAt)}</Text>
        </View>

        {!!releaseError && (
          <View style={s.noticeWarning}>
            <MaterialCommunityIcons name="alert-outline" size={18} color={T.warning} />
            <Text style={s.noticeWarningText}>{releaseError}</Text>
          </View>
        )}

        <View style={s.actions}>
          <TouchableOpacity style={s.primaryButton} onPress={() => openUrl(latestRelease?.apkUrl, 'APK')}>
            <Text style={s.primaryButtonText}>Telecharger la derniere APK</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryButton} onPress={() => openUrl(releaseHubUrl, 'release')}>
            <Text style={s.secondaryButtonText}>Ouvrir la page release</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.releaseHint}>
          Le mobile lit maintenant les 5 dernieres releases GitHub pour verifier si une nouvelle version stable existe.
        </Text>

        {releases.map((release) => (
          <View key={release.id || release.tagName} style={s.releaseCard}>
            <View style={s.releaseTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.releaseTitle}>{release.name}</Text>
                <Text style={s.releaseMeta}>{release.tagName} · {formatDateTime(release.publishedAt)}</Text>
              </View>
              <StatusChip
                label={compareReleaseVersions(release.version, appVersion) > 0 ? 'Nouvelle' : 'Installee ou precedente'}
                tone={compareReleaseVersions(release.version, appVersion) > 0 ? 'warning' : 'success'}
              />
            </View>

            <Text style={s.releaseAsset}>
              {release.apkName
                ? `${release.apkName} · ${Math.round((release.apkSize || 0) / 1024 / 1024)} Mo`
                : 'APK non attachee sur cette release'}
            </Text>

            <View style={s.releaseNotesWrap}>
              {(release.notesLines.length > 0 ? release.notesLines : [release.notes]).map((line, index) => (
                <Text key={`${release.id || release.tagName}-${index}`} style={s.releaseNoteLine}>
                  - {normalizeReleaseLine(line)}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Tracking terrain</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="connection" size={18} color={T.primary} />
          <Text style={s.infoLabel}>Etat presence</Text>
          <Text style={s.infoValue}>{sessionStatus.state || 'idle'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="pulse" size={18} color={T.primary} />
          <Text style={s.infoLabel}>Heartbeat</Text>
          <Text style={s.infoValue}>20 s</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={T.primary} />
          <Text style={s.infoLabel}>Dernier heartbeat</Text>
          <Text style={s.infoValue}>{formatDateTime(sessionStatus.lastPingAt)}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="route" size={18} color={T.info} />
          <Text style={s.infoLabel}>Session terrain</Text>
          <Text style={s.infoValue}>{session?.id ? `#${session.id} · ${session.status}` : 'Aucune'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color={T.info} />
          <Text style={s.infoLabel}>Permission GPS</Text>
          <Text style={s.infoValue}>{locationPermission}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="map-marker" size={18} color={T.info} />
          <Text style={s.infoLabel}>Position actuelle</Text>
          <Text style={s.infoValue}>{currentCoords(currentLocation || session?.latestLocation)}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="sync" size={18} color={T.info} />
          <Text style={s.infoLabel}>Dernier sync GPS</Text>
          <Text style={s.infoValue}>{formatDateTime(trackingState.lastSyncAt)}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="progress-clock" size={18} color={T.info} />
          <Text style={s.infoLabel}>Motif sync</Text>
          <Text style={s.infoValue}>{trackingState.lastSyncReason || 'Aucun'}</Text>
        </View>

        {!!sessionStatus.error && (
          <View style={s.noticeWarning}>
            <MaterialCommunityIcons name="crosshairs-question" size={18} color={T.warning} />
            <Text style={s.noticeWarningText}>{sessionStatus.error}</Text>
          </View>
        )}

        {!!trackingState.error && (
          <View style={s.noticeWarning}>
            <MaterialCommunityIcons name="map-marker-alert-outline" size={18} color={T.warning} />
            <Text style={s.noticeWarningText}>{trackingState.error}</Text>
          </View>
        )}

        <View style={s.actions}>
          <TouchableOpacity style={s.primaryButton} onPress={() => captureCurrentLocation('settings-manual')}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Envoyer ma position</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryButton} onPress={refreshSessionDetails}>
            <Text style={s.secondaryButtonText}>Rafraichir la session</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Impression thermique</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="printer-wireless" size={18} color={T.warning} />
          <Text style={s.infoLabel}>Workflow</Text>
          <Text style={s.infoValue}>Application Bluetooth externe</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="receipt-text-outline" size={18} color={T.warning} />
          <Text style={s.infoLabel}>Factures</Text>
          <Text style={s.infoValue}>Bouton Thermique actif</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="file-pdf-box" size={18} color={T.warning} />
          <Text style={s.infoLabel}>Copie partagee</Text>
          <Text style={s.infoValue}>PDF manuel conserve</Text>
        </View>
        <Text style={s.releaseHint}>
          Les impressions facture utilisent maintenant le flux thermique externe, sans confondre le PDF standard et le ticket Bluetooth.
        </Text>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Build & appareil</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="android" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Plateforme</Text>
          <Text style={s.infoValue}>{devicePayload.platform || 'android'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="numeric" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Build natif</Text>
          <Text style={s.infoValue}>{devicePayload.native_build_version || 'Non defini'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="application-outline" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Execution</Text>
          <Text style={s.infoValue}>{devicePayload.execution_environment || 'Non definie'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="account-cog-outline" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Propriete app</Text>
          <Text style={s.infoValue}>{devicePayload.app_ownership || 'standalone'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="cellphone-information" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Appareil</Text>
          <Text style={s.infoValueSmall}>{devicePayload.device_name || devicePayload.model || 'Appareil inconnu'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="api" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>API cible</Text>
          <Text style={s.infoValueSmall}>{apiBaseUrl}</Text>
        </View>
      </View>

      <TouchableOpacity style={s.logoutButton} onPress={logout}>
        <MaterialCommunityIcons name="logout" size={18} color="#fff" />
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
  hero: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 22,
    marginBottom: 14,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.primary,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  heroName: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: '800',
    color: T.text,
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 13,
    color: T.textMuted,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
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
    gap: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    maxWidth: '50%',
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: T.text,
  },
  infoValueSmall: {
    maxWidth: '50%',
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: T.text,
  },
  actions: {
    gap: 10,
    marginTop: 12,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: T.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.border,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  releaseHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: T.textMuted,
  },
  releaseCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  releaseTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  releaseTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  releaseMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  releaseAsset: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: T.primaryDark,
  },
  releaseNotesWrap: {
    marginTop: 10,
    gap: 4,
  },
  releaseNoteLine: {
    fontSize: 12,
    lineHeight: 18,
    color: T.textSecondary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 16,
    backgroundColor: T.danger,
    marginTop: 6,
  },
  logoutText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  noticeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
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
})
