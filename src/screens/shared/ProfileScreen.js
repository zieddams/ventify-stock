import Constants from 'expo-constants'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../contexts/AuthContext'
import { useTracking } from '../../contexts/TrackingContext'
import { getDevicePayload } from '../../services/sessionService'
import { T, cardShadow } from '../../theme'
import { formatDateTime } from '../../utils/format'

function currentCoords(location) {
  const source = location?.coords ?? location
  if (!Number.isFinite(source?.latitude) || !Number.isFinite(source?.longitude)) return 'Position non capturee'
  return `${source.latitude.toFixed(5)}, ${source.longitude.toFixed(5)}`
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

  const appVersion = Constants.expoConfig?.version || '1.1.0'
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl || 'API non definie'
  const devicePayload = getDevicePayload()

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <PageHeader
        title="Compte mobile"
        subtitle="Presence session, GPS et configuration de build."
      />

      <View style={[s.hero, cardShadow]}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{user?.name?.slice(0, 1)?.toUpperCase() || 'U'}</Text>
        </View>
        <Text style={s.heroName}>{user?.name}</Text>
        <Text style={s.heroMeta}>{user?.email}</Text>
        <StatusChip
          label={user?.role === 'rep' ? 'Profil rep' : `Profil ${user?.role || 'staff'}`}
          tone={user?.role === 'rep' ? 'success' : 'info'}
        />
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Presence mobile</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="connection" size={18} color={T.primary} />
          <Text style={s.infoLabel}>Etat</Text>
          <Text style={s.infoValue}>{sessionStatus.state || 'idle'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={T.primary} />
          <Text style={s.infoLabel}>Dernier report</Text>
          <Text style={s.infoValue}>{formatDateTime(sessionStatus.lastReportAt)}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="pulse" size={18} color={T.primary} />
          <Text style={s.infoLabel}>Dernier heartbeat</Text>
          <Text style={s.infoValue}>{formatDateTime(sessionStatus.lastPingAt)}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="close-network-outline" size={18} color={T.primary} />
          <Text style={s.infoLabel}>Dernier offline</Text>
          <Text style={s.infoValue}>{formatDateTime(sessionStatus.lastOfflineAt)}</Text>
        </View>

        {!!sessionStatus.error && (
          <View style={s.noticeWarning}>
            <MaterialCommunityIcons name="crosshairs-question" size={18} color={T.warning} />
            <Text style={s.noticeWarningText}>{sessionStatus.error}</Text>
          </View>
        )}
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Session terrain</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="pound-box-outline" size={18} color={T.info} />
          <Text style={s.infoLabel}>Session ID</Text>
          <Text style={s.infoValue}>{session?.id ? `#${session.id}` : 'Aucune'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="truck-fast-outline" size={18} color={T.info} />
          <Text style={s.infoLabel}>Session du jour</Text>
          <Text style={s.infoValue}>{session?.status || 'Aucune'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="map-outline" size={18} color={T.info} />
          <Text style={s.infoLabel}>Zone terrain</Text>
          <Text style={s.infoValue}>{session?.zone?.name || user?.zone?.name || 'Non definie'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color={T.info} />
          <Text style={s.infoLabel}>Permission GPS</Text>
          <Text style={s.infoValue}>{locationPermission}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={T.info} />
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
          <Text style={s.infoLabel}>Motif dernier sync</Text>
          <Text style={s.infoValue}>{trackingState.lastSyncReason || 'Aucun'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="map-marker-distance" size={18} color={T.info} />
          <Text style={s.infoLabel}>Points GPS session</Text>
          <Text style={s.infoValue}>{session?.locations_count ?? 0}</Text>
        </View>

        {!!trackingState.error && (
          <View style={s.noticeWarning}>
            <MaterialCommunityIcons name="alert-outline" size={18} color={T.warning} />
            <Text style={s.noticeWarningText}>{trackingState.error}</Text>
          </View>
        )}

        <View style={s.actions}>
          <TouchableOpacity style={s.primaryButton} onPress={() => captureCurrentLocation('manual')}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Envoyer ma position</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryButton} onPress={refreshSessionDetails}>
            <Text style={s.secondaryButtonText}>Rafraichir la session</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Build actuel</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="cellphone-cog" size={18} color={T.primaryDark} />
          <Text style={s.infoLabel}>Version app</Text>
          <Text style={s.infoValue}>{appVersion}</Text>
        </View>
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
    marginBottom: 12,
    fontSize: 13,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
    marginBottom: 10,
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
    maxWidth: '48%',
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: T.text,
  },
  infoValueSmall: {
    maxWidth: '48%',
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
