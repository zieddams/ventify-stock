import api from './api'
import {
  getCurrentMobileScreen,
  getMobileActivitySessionId,
  setCurrentMobileScreen,
} from './activityClient'

export async function trackMobileActivity({
  eventType = 'screen_view',
  screenName,
  screenLabel,
  actionLabel = null,
  metadata = {},
} = {}) {
  if (screenName) {
    setCurrentMobileScreen(screenName, screenLabel || screenName)
  }

  const currentScreen = getCurrentMobileScreen()
  const clientSessionId = await getMobileActivitySessionId()

  return api.post('/activity/track', {
    event_type: eventType,
    event_name: eventType === 'heartbeat' ? 'heartbeat' : 'screen-view',
    action_label: actionLabel,
    route_path: currentScreen.routePath,
    screen_name: currentScreen.name,
    page_title: currentScreen.label,
    channel: 'mobile',
    platform: 'mobile',
    client_session_id: clientSessionId,
    metadata,
  }, {
    headers: {
      'X-App-Screen': currentScreen.name,
      'X-Front-Page-Title': currentScreen.label,
      'X-Front-Path': currentScreen.routePath,
    },
  })
}
