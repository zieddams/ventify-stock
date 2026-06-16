import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const BASE_URL = 'https://irtiwaa.ziedtech.com/api/v1'
const TOKEN_KEY = 'irtiwaa_token'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
})

// Attach saved token to every request
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
  } catch {}
  return config
})

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export default api
