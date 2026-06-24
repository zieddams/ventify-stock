import axios from 'axios'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { getStoredLocale } from '../i18n/locales'

const extra = Constants.expoConfig?.extra ?? {}
export const BASE_URL = extra.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL || 'https://irtiwaa.ziedtech.com/api/v1'
const TOKEN_KEY = 'irtiwaa_token'
const USER_KEY = 'irtiwaa_user'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-App-Client': 'mobile',
  },
})

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
  } catch {}

  try {
    config.headers['X-App-Locale'] = await getStoredLocale()
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

export async function saveStoredUser(user) {
  if (!user) {
    await clearStoredUser()
    return
  }

  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
}

export async function getStoredUser() {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function clearStoredUser() {
  await SecureStore.deleteItemAsync(USER_KEY)
}

export default api
