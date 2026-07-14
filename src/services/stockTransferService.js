import api from './api'

export async function fetchPosDepots() {
  const response = await api.get('/depots', { params: { type: 'pos' } })
  return Array.isArray(response.data) ? response.data : response.data?.data ?? []
}

export async function dropStockAtPos(toDepotId, lines, note = null) {
  const response = await api.post('/stock-transfers', {
    to_depot_id: toDepotId,
    lines,
    note,
  })
  return response.data
}
