import api from './api'

function normalizeRouteSession(session) {
  if (!session || typeof session !== 'object') {
    return session ?? null
  }

  const latestLocation = session.latestLocation ?? session.latest_location ?? null

  return {
    ...session,
    latestLocation,
    latest_location: latestLocation,
  }
}

function normalizeCollectionPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeRouteSession)
  }

  if (Array.isArray(payload?.data)) {
    return {
      ...payload,
      data: payload.data.map(normalizeRouteSession),
    }
  }

  return payload
}

export async function getTodayRouteSession() {
  const response = await api.get('/route-sessions/today')
  return normalizeRouteSession(response.data)
}

export async function getRouteSession(id) {
  const response = await api.get(`/route-sessions/${id}`)
  return normalizeRouteSession(response.data)
}

export async function listRouteSessions(params = {}) {
  const response = await api.get('/route-sessions', { params })
  return normalizeCollectionPayload(response.data)
}

export async function openRouteSession(payload = {}) {
  const response = await api.post('/route-sessions', payload)
  return normalizeRouteSession(response.data)
}

export async function addRouteSessionLoad(id, lines) {
  const response = await api.post(`/route-sessions/${id}/load`, { lines })
  return normalizeRouteSession(response.data)
}

export async function recordRouteSessionReturns(id, lines) {
  const response = await api.post(`/route-sessions/${id}/returns`, { lines })
  return normalizeRouteSession(response.data)
}

export async function closeRouteSession(id, payload = {}) {
  const response = await api.post(`/route-sessions/${id}/close`, payload)
  return normalizeRouteSession(response.data)
}

export async function listRouteLocations(id, limit = 120) {
  const response = await api.get(`/route-sessions/${id}/locations`, {
    params: { limit },
  })
  return response.data
}

export async function storeRouteLocation(id, payload) {
  const response = await api.post(`/route-sessions/${id}/locations`, payload)
  return response.data
}
