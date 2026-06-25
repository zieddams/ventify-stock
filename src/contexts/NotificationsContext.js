import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import { useI18n } from './I18nContext'
import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../services/notificationService'
import {
  notificationMessage,
  resolveNotificationConfig,
} from '../utils/notificationActivity'
import { T, cardShadow } from '../theme'

const NotificationsContext = createContext(null)
const NOTIFICATION_POLL_MS = 60 * 1000

function createEmptyState() {
  return {
    notifications: [],
    unreadCount: 0,
    loading: true,
    refreshing: false,
    lastFetchedAt: null,
    error: '',
  }
}

export function NotificationsProvider({ children }) {
  const { user, isRep } = useAuth()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const [state, setState] = useState(createEmptyState)
  const [banner, setBanner] = useState(null)
  const loadInFlightRef = useRef(null)
  const hasLoadedOnceRef = useRef(false)
  const knownNotificationIdsRef = useRef(new Set())
  const bannerTimerRef = useRef(null)
  const appStateRef = useRef(AppState.currentState)
  const canUseNotifications = Boolean(user?.id && isRep())

  const dismissBanner = useCallback(() => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = null
    }

    setBanner(null)
  }, [])

  const resetState = useCallback(() => {
    hasLoadedOnceRef.current = false
    knownNotificationIdsRef.current = new Set()
    loadInFlightRef.current = null
    dismissBanner()
    setState(createEmptyState())
  }, [dismissBanner])

  const showBanner = useCallback((notification) => {
    const config = resolveNotificationConfig(notification)
    const message = notificationMessage(notification, config.label) || t('notifications.newFallback')

    dismissBanner()
    setBanner({
      id: String(notification?.id ?? Date.now()),
      icon: config.icon,
      color: config.color,
      bg: config.bg,
      label: config.label,
      message,
    })

    bannerTimerRef.current = setTimeout(() => {
      setBanner(null)
      bannerTimerRef.current = null
    }, 4500)
  }, [dismissBanner, t])

  const refreshNotifications = useCallback(async ({
    announce = false,
    silent = false,
    force = false,
  } = {}) => {
    if (!canUseNotifications) {
      resetState()
      return []
    }

    if (loadInFlightRef.current && !force) {
      return loadInFlightRef.current
    }

    if (!silent) {
      setState((current) => ({
        ...current,
        loading: !hasLoadedOnceRef.current,
        refreshing: hasLoadedOnceRef.current,
        error: '',
      }))
    }

    const request = listNotifications()
      .then((payload) => {
        const previousIds = knownNotificationIdsRef.current
        const nextNotifications = payload.notifications
        const nextUnread = payload.unreadCount

        setState((current) => ({
          ...current,
          notifications: nextNotifications,
          unreadCount: nextUnread,
          loading: false,
          refreshing: false,
          lastFetchedAt: new Date().toISOString(),
          error: '',
        }))

        if (announce && hasLoadedOnceRef.current) {
          const freshUnread = nextNotifications.find((item) => !item.read_at && !previousIds.has(String(item.id)))
          if (freshUnread) {
            showBanner(freshUnread)
          }
        }

        knownNotificationIdsRef.current = new Set(nextNotifications.map((item) => String(item.id)))
        hasLoadedOnceRef.current = true

        return nextNotifications
      })
      .catch((error) => {
        setState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: error?.response?.data?.message || error?.message || t('notifications.loadError'),
        }))

        return []
      })
      .finally(() => {
        loadInFlightRef.current = null
      })

    loadInFlightRef.current = request
    return request
  }, [canUseNotifications, resetState, showBanner, t])

  const markRead = useCallback(async (notificationId) => {
    setState((current) => ({
      ...current,
      notifications: current.notifications.map((item) => (
        item.id === notificationId && !item.read_at
          ? { ...item, read_at: new Date().toISOString() }
          : item
      )),
      unreadCount: Math.max(
        current.unreadCount - (current.notifications.some((item) => item.id === notificationId && !item.read_at) ? 1 : 0),
        0,
      ),
    }))

    try {
      await markNotificationAsRead(notificationId)
    } finally {
      await refreshNotifications({ silent: true, force: true })
    }
  }, [refreshNotifications])

  const markAllRead = useCallback(async () => {
    setState((current) => ({
      ...current,
      notifications: current.notifications.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })),
      unreadCount: 0,
    }))

    try {
      await markAllNotificationsAsRead()
    } finally {
      await refreshNotifications({ silent: true, force: true })
    }
  }, [refreshNotifications])

  useEffect(() => {
    if (!canUseNotifications) {
      resetState()
      return undefined
    }

    void refreshNotifications({ force: true })

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        void refreshNotifications({ announce: true, silent: true })
      }
    }, NOTIFICATION_POLL_MS)

    const sub = AppState.addEventListener('change', (nextState) => {
      const previous = appStateRef.current
      appStateRef.current = nextState

      if ((previous === 'inactive' || previous === 'background') && nextState === 'active') {
        void refreshNotifications({ announce: true, silent: true, force: true })
      }
    })

    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [canUseNotifications, refreshNotifications, resetState])

  useEffect(() => () => {
    dismissBanner()
  }, [dismissBanner])

  const value = useMemo(() => ({
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    loading: state.loading,
    refreshing: state.refreshing,
    lastFetchedAt: state.lastFetchedAt,
    error: state.error,
    refreshNotifications,
    markNotificationRead: markRead,
    markAllNotificationsRead: markAllRead,
    dismissBanner,
  }), [
    dismissBanner,
    markAllRead,
    markRead,
    refreshNotifications,
    state.error,
    state.lastFetchedAt,
    state.loading,
    state.notifications,
    state.refreshing,
    state.unreadCount,
  ])

  return (
    <NotificationsContext.Provider value={value}>
      <View style={s.root}>
        {children}

        <View pointerEvents="box-none" style={s.overlay}>
          {banner ? (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={dismissBanner}
              style={[
                s.banner,
                {
                  top: insets.top + 10,
                  backgroundColor: banner.bg,
                  borderColor: banner.color,
                },
              ]}
            >
              <View style={[s.bannerIcon, { backgroundColor: banner.color }]}>
                <MaterialCommunityIcons name={banner.icon} size={18} color="#fff" />
              </View>
              <View style={s.bannerBody}>
                <Text style={[s.bannerTitle, { color: banner.color }]} numberOfLines={1}>{banner.label}</Text>
                <Text style={s.bannerMessage} numberOfLines={2}>{banner.message}</Text>
              </View>
              <MaterialCommunityIcons name="close" size={18} color={T.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: T.surface,
    ...cardShadow,
  },
  bannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: {
    flex: 1,
    gap: 3,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  bannerMessage: {
    fontSize: 12,
    lineHeight: 17,
    color: T.text,
  },
})
