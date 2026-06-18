import Constants from 'expo-constants'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { downloadAndLaunchApkUpdate, isInAppUpdateSupported } from '../../services/mobileUpdateService'
import { compareReleaseVersions, getLatestMobileReleases } from '../../services/releaseService'
import { getDevicePayload } from '../../services/sessionService'
import { T, cardShadow } from '../../theme'
import { formatDateTime } from '../../utils/format'

const UPDATE_PHASES = {
  IDLE: 'idle',
  CHECKING: 'checking',
  UP_TO_DATE: 'upToDate',
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  INSTALLER: 'installer',
  ERROR: 'error',
}

function currentCoords(location) {
  const source = location?.coords ?? location
  if (!Number.isFinite(source?.latitude) || !Number.isFinite(source?.longitude)) return 'Position non capturee'
  return `${source.latitude.toFixed(5)}, ${source.longitude.toFixed(5)}`
}

function normalizeReleaseLine(line) {
  return line.replace(/^[-*]\s*/, '').trim()
}

function releaseKey(release) {
  return String(release?.tagName || release?.version || release?.id || 'release')
}

function releaseSizeLabel(size) {
  const normalizedSize = Number(size || 0)

  if (normalizedSize <= 0) return 'Taille non communiquee'

  const sizeInMb = normalizedSize / 1024 / 1024
  return `${sizeInMb >= 10 ? sizeInMb.toFixed(0) : sizeInMb.toFixed(1)} Mo`
}

function progressPercent(ratio) {
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(ratio, 1)) : 0
  return Math.round(safeRatio * 100)
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
  const [releaseCheckedAt, setReleaseCheckedAt] = useState(null)
  const [updateState, setUpdateState] = useState({
    phase: UPDATE_PHASES.IDLE,
    progress: 0,
    message: '',
    targetTag: null,
  })

  const appVersion = Constants.expoConfig?.version || '1.3.2'
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl || 'API non definie'
  const devicePayload = getDevicePayload()
  const updateSupported = isInAppUpdateSupported()

  const loadReleases = useCallback(async ({ showChecking = false } = {}) => {
    if (showChecking) {
      setUpdateState((current) => ({
        ...current,
        phase: UPDATE_PHASES.CHECKING,
        progress: 0,
        message: 'Verification de la derniere release GitHub...',
        targetTag: null,
      }))
    }

    setReleaseLoading(true)

    try {
      const nextReleases = await getLatestMobileReleases(5)
      const checkedAt = new Date().toISOString()
      const nextLatestRelease = nextReleases[0] || null
      const updateAvailable = nextLatestRelease
        ? compareReleaseVersions(nextLatestRelease.version, appVersion) > 0
        : false

      setReleases(nextReleases)
      setReleaseCheckedAt(checkedAt)
      setUpdateState((current) => {
        if (current.phase === UPDATE_PHASES.DOWNLOADING) {
          return current
        }

        return {
          phase: nextLatestRelease
            ? (updateAvailable ? UPDATE_PHASES.AVAILABLE : UPDATE_PHASES.UP_TO_DATE)
            : UPDATE_PHASES.IDLE,
          progress: nextLatestRelease && !updateAvailable ? 1 : 0,
          message: nextLatestRelease
            ? updateAvailable
              ? `Version ${nextLatestRelease.tagName || nextLatestRelease.version} disponible au telechargement.`
              : `Application deja alignee avec ${nextLatestRelease.tagName || nextLatestRelease.version}.`
            : 'Aucune release stable n est disponible pour le moment.',
          targetTag: null,
        }
      })
    } catch (error) {
      const message = error.message || 'Les releases GitHub ne sont pas accessibles pour le moment.'

      setUpdateState((current) => {
        if (current.phase === UPDATE_PHASES.DOWNLOADING) {
          return current
        }

        return {
          phase: UPDATE_PHASES.ERROR,
          progress: 0,
          message,
          targetTag: null,
        }
      })
    } finally {
      setReleaseLoading(false)
    }
  }, [appVersion])

  useFocusEffect(useCallback(() => {
    loadReleases()
  }, [loadReleases]))

  const latestRelease = releases[0] || null
  const hasUpdate = latestRelease
    ? compareReleaseVersions(latestRelease.version, appVersion) > 0
    : false

  const installRelease = useCallback(async (release) => {
    if (!release?.apkUrl) {
      Alert.alert('APK indisponible', 'Aucun fichier APK n est attache a cette release stable.')
      return
    }

    const targetTag = releaseKey(release)
    const targetLabel = release.tagName || release.version || 'stable'

    try {
      setUpdateState({
        phase: UPDATE_PHASES.DOWNLOADING,
        progress: 0,
        message: `Telechargement de ${targetLabel} en cours...`,
        targetTag,
      })

      await downloadAndLaunchApkUpdate({
        url: release.apkUrl,
        version: release.version || release.tagName,
        expectedBytes: release.apkSize,
        onProgress: ({ ratio }) => {
          const safeProgress = Number.isFinite(ratio) ? Math.max(0, Math.min(ratio, 1)) : 0

          setUpdateState({
            phase: UPDATE_PHASES.DOWNLOADING,
            progress: safeProgress,
            message: `Telechargement ${progressPercent(safeProgress)}% - ${targetLabel}`,
            targetTag,
          })
        },
      })

      setUpdateState({
        phase: UPDATE_PHASES.INSTALLER,
        progress: 1,
        message: `Installateur Android lance pour ${targetLabel}. Confirmez la mise a jour sur le telephone.`,
        targetTag,
      })
    } catch (error) {
      const message = error.message || 'La mise a jour integree a echoue.'

      setUpdateState({
        phase: UPDATE_PHASES.ERROR,
        progress: 0,
        message,
        targetTag,
      })

      Alert.alert('Mise a jour impossible', message)
    }
  }, [])

  const installLatestUpdate = useCallback(() => {
    installRelease(latestRelease)
  }, [installRelease, latestRelease])

  const releaseTone = useMemo(() => {
    if (!latestRelease) return 'neutral'
    return hasUpdate ? 'warning' : 'success'
  }, [hasUpdate, latestRelease])

  const updateProgress = progressPercent(updateState.progress)
  const activeReleaseTag = updateState.targetTag
  const downloadingLatest = updateState.phase === UPDATE_PHASES.DOWNLOADING
    && activeReleaseTag === releaseKey(latestRelease)

  const renderUpdateStatusCard = () => {
    if (updateState.phase === UPDATE_PHASES.CHECKING) {
      return (
        <View style={[s.statusCard, s.statusCardInfo]}>
          <ActivityIndicator color={T.primary} size="small" />
          <View style={s.statusCopy}>
            <Text style={s.statusTitle}>Verification des releases</Text>
            <Text style={s.statusSubtitle}>Connexion a GitHub pour comparer la build locale a la derniere stable.</Text>
          </View>
        </View>
      )
    }

    if (updateState.phase === UPDATE_PHASES.UP_TO_DATE) {
      return (
        <View style={[s.statusCard, s.statusCardSuccess]}>
          <MaterialCommunityIcons name="check-decagram-outline" size={20} color="#047857" />
          <View style={s.statusCopy}>
            <Text style={s.statusTitle}>Application a jour</Text>
            <Text style={s.statusSubtitle}>{`Version ${appVersion} deja alignee avec ${latestRelease?.tagName || 'la stable'}.`}</Text>
          </View>
        </View>
      )
    }

    if (updateState.phase === UPDATE_PHASES.AVAILABLE) {
      return (
        <View style={[s.statusCard, s.statusCardWarning]}>
          <MaterialCommunityIcons name="arrow-up-circle-outline" size={20} color={T.primary} />
          <View style={s.statusCopy}>
            <Text style={s.statusTitle}>Mise a jour disponible</Text>
            <Text style={s.statusSubtitle}>{`Version ${appVersion} -> ${latestRelease?.tagName || latestRelease?.version || 'stable'}`}</Text>
            {(latestRelease?.notesLines || []).slice(0, 2).map((line, index) => (
              <Text key={`latest-note-${index}`} style={s.statusNote}>
                - {normalizeReleaseLine(line)}
              </Text>
            ))}
          </View>
        </View>
      )
    }

    if (updateState.phase === UPDATE_PHASES.DOWNLOADING) {
      return (
        <View style={[s.statusCard, s.statusCardWarning]}>
          <ActivityIndicator color={T.primary} size="small" />
          <View style={s.statusCopy}>
            <Text style={s.statusTitle}>{updateState.message || 'Telechargement en cours...'}</Text>
            <Text style={s.statusSubtitle}>Le fichier APK est telecharge dans l application avant de lancer l installateur Android.</Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${Math.max(8, updateProgress)}%` }]} />
            </View>
          </View>
        </View>
      )
    }

    if (updateState.phase === UPDATE_PHASES.INSTALLER) {
      return (
        <View style={[s.statusCard, s.statusCardInfo]}>
          <MaterialCommunityIcons name="open-in-app" size={20} color={T.info} />
          <View style={s.statusCopy}>
            <Text style={s.statusTitle}>Installation prete</Text>
            <Text style={s.statusSubtitle}>{updateState.message}</Text>
          </View>
        </View>
      )
    }

    if (updateState.phase === UPDATE_PHASES.ERROR) {
      return (
        <View style={[s.statusCard, s.statusCardError]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={T.danger} />
          <View style={s.statusCopy}>
            <Text style={s.statusTitle}>Verification ou installation impossible</Text>
            <Text style={s.statusSubtitle}>{updateState.message}</Text>
          </View>
        </View>
      )
    }

    return (
      <View style={[s.statusCard, s.statusCardInfo]}>
        <MaterialCommunityIcons name="download-circle-outline" size={20} color={T.info} />
        <View style={s.statusCopy}>
          <Text style={s.statusTitle}>Canal mobile stable</Text>
          <Text style={s.statusSubtitle}>L application peut verifier les 5 dernieres releases GitHub et installer l APK sans quitter l app.</Text>
        </View>
      </View>
    )
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <PageHeader
        title="Reglages mobiles"
        subtitle="Compte, tracking terrain, impression thermique et releases."
        actionIcon="refresh"
        actionLabel="Verifier"
        onActionPress={() => loadReleases({ showChecking: true })}
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
          <Text style={s.sectionTitle}>Pipeline et releases</Text>
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
          <Text style={s.infoValue}>stable / installateur integre</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Derniere verification</Text>
          <Text style={s.infoValue}>{formatDateTime(releaseCheckedAt)}</Text>
        </View>

        {renderUpdateStatusCard()}

        <View style={s.actions}>
          <TouchableOpacity
            style={[
              s.primaryButton,
              (!updateSupported || !latestRelease?.apkUrl || updateState.phase === UPDATE_PHASES.DOWNLOADING) && s.buttonDisabled,
            ]}
            onPress={installLatestUpdate}
            disabled={!updateSupported || !latestRelease?.apkUrl || updateState.phase === UPDATE_PHASES.DOWNLOADING}
          >
            <Text style={s.primaryButtonText}>
              {downloadingLatest
                ? `Telechargement ${updateProgress}%`
                : hasUpdate
                  ? 'Installer la derniere stable'
                  : 'Reinstaller la stable'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.secondaryButton, updateState.phase === UPDATE_PHASES.DOWNLOADING && s.buttonDisabled]}
            onPress={() => loadReleases({ showChecking: true })}
            disabled={updateState.phase === UPDATE_PHASES.DOWNLOADING}
          >
            <Text style={s.secondaryButtonText}>Verifier les mises a jour</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.releaseHint}>
          Le mobile compare la build locale a la derniere release GitHub, affiche la progression du telechargement et ouvre ensuite l installateur Android dans l application.
        </Text>

        {!updateSupported && (
          <Text style={s.releaseHint}>
            Ce mode d installation integree est reserve a Android. Sur les autres plateformes, le changelog reste consultable.
          </Text>
        )}

        {releases.map((release) => {
          const releaseIdentifier = releaseKey(release)
          const releaseIsCurrent = compareReleaseVersions(release.version, appVersion) === 0
          const releaseIsNewer = compareReleaseVersions(release.version, appVersion) > 0
          const installingThisRelease = updateState.phase === UPDATE_PHASES.DOWNLOADING
            && activeReleaseTag === releaseIdentifier

          return (
            <View key={release.id || release.tagName} style={s.releaseCard}>
              <View style={s.releaseTop}>
                <View style={s.releaseCopy}>
                  <Text style={s.releaseTitle}>{release.name}</Text>
                  <Text style={s.releaseMeta}>{`${release.tagName} - ${formatDateTime(release.publishedAt)}`}</Text>
                </View>

                <View style={s.releaseActionsRow}>
                  <StatusChip
                    label={releaseIsCurrent ? 'Version actuelle' : releaseIsNewer ? 'Nouvelle' : 'Archive'}
                    tone={releaseIsCurrent ? 'success' : releaseIsNewer ? 'warning' : 'neutral'}
                  />

                  {updateSupported && release.apkUrl && (
                    <TouchableOpacity
                      style={[
                        s.installReleaseButton,
                        updateState.phase === UPDATE_PHASES.DOWNLOADING && !installingThisRelease && s.buttonDisabled,
                      ]}
                      onPress={() => installRelease(release)}
                      disabled={updateState.phase === UPDATE_PHASES.DOWNLOADING}
                    >
                      {installingThisRelease
                        ? <ActivityIndicator color={T.primary} size="small" />
                        : <Text style={s.installReleaseButtonText}>{releaseIsCurrent ? 'Reinstaller' : 'Installer'}</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Text style={s.releaseAsset}>
                {release.apkName
                  ? `${release.apkName} - ${releaseSizeLabel(release.apkSize)}`
                  : 'APK non attachee sur cette release'}
              </Text>

              {installingThisRelease && (
                <View style={s.releaseProgressWrap}>
                  <Text style={s.releaseProgressLabel}>{`Telechargement ${updateProgress}%`}</Text>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${Math.max(8, updateProgress)}%` }]} />
                  </View>
                </View>
              )}

              <View style={s.releaseNotesWrap}>
                {(release.notesLines.length > 0 ? release.notesLines : [release.notes]).map((line, index) => (
                  <Text key={`${release.id || release.tagName}-${index}`} style={s.releaseNoteLine}>
                    - {normalizeReleaseLine(line)}
                  </Text>
                ))}
              </View>
            </View>
          )
        })}
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
          <Text style={s.infoValue}>{session?.id ? `#${session.id} - ${session.status}` : 'Aucune'}</Text>
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
        <Text style={s.sectionTitle}>Build et appareil</Text>
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
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  statusCardInfo: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  statusCardSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  statusCardWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  statusCardError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusCopy: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  statusSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    color: T.textSecondary,
  },
  statusNote: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: T.textSecondary,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  progressTrack: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#dbeafe',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: T.primary,
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
    gap: 12,
  },
  releaseCopy: {
    flex: 1,
  },
  releaseActionsRow: {
    alignItems: 'flex-end',
    gap: 8,
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
  releaseProgressWrap: {
    marginTop: 10,
  },
  releaseProgressLabel: {
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
  installReleaseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: T.border,
  },
  installReleaseButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: T.primaryDark,
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
