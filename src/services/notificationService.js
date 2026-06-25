import api from './api'

function normalizeNotificationCollection(payload) {
  const notifications = Array.isArray(payload?.notifications) ? payload.notifications : []
  const unreadCount = Number(payload?.unread_count ?? 0)

  return {
    notifications,
    unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
  }
}

export async function listNotifications() {
  const response = await api.get('/notifications')
  return normalizeNotificationCollection(response.data)
}

export async function markNotificationAsRead(notificationId) {
  const response = await api.post(`/notifications/${notificationId}/read`)
  return response.data
}

export async function markAllNotificationsAsRead() {
  const response = await api.post('/notifications/read-all')
  return response.data
}

export async function listNotificationPreferences() {
  const response = await api.get('/notification-preferences')
  return Array.isArray(response.data?.preferences) ? response.data.preferences : []
}

export async function updateNotificationPreferences(preferences) {
  const response = await api.put('/notification-preferences', { preferences })
  return Array.isArray(response.data?.preferences) ? response.data.preferences : []
}
