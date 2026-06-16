import api from './api'

export async function getTodayRouteSession() {
  const response = await api.get('/route-sessions/today')
  return response.data
}

export async function getRouteSession(id) {
  const response = await api.get(`/route-sessions/${id}`)
  return response.data
}

export async function openRouteSession(payload = {}) {
  const response = await api.post('/route-sessions', payload)
  return response.data
}

export async function addRouteSessionLoad(id, lines) {
  const response = await api.post(`/route-sessions/${id}/load`, { lines })
  return response.data
}

export async function recordRouteSessionReturns(id, lines) {
  const response = await api.post(`/route-sessions/${id}/returns`, { lines })
  return response.data
}

export async function closeRouteSession(id, payload = {}) {
  const response = await api.post(`/route-sessions/${id}/close`, payload)
  return response.data
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

