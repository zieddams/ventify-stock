module.exports = {
  name: 'El Irtiwaa',
  slug: 'ventify-stock',
  version: '1.2.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'irtiwaa',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.ventify.stock',
  },
  android: {
    package: 'com.ventify.stock',
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: '#0d9488',
      foregroundImage: './assets/android-icon-foreground.png',
    },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-secure-store',
    'expo-font',
    'expo-sharing',
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://irtiwaa.ziedtech.com/api/v1',
    reverbHost: process.env.EXPO_PUBLIC_REVERB_HOST || 'irtiwaa.ziedtech.com',
    reverbPort: Number(process.env.EXPO_PUBLIC_REVERB_PORT || 443),
    reverbScheme: process.env.EXPO_PUBLIC_REVERB_SCHEME || 'https',
    reverbAppKey: process.env.EXPO_PUBLIC_REVERB_APP_KEY || '78dp9ud63xntwmvmjybc',
  },
}
