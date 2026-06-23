module.exports = {
  name: 'El Irtiwaa',
  slug: 'ventify-stock',
  version: '1.3.17',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'irtiwaa',
  androidStatusBar: {
    barStyle: 'dark-content',
    backgroundColor: '#edf6f5',
    translucent: false,
  },
  androidNavigationBar: {
    barStyle: 'dark-content',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.ventify.stock',
  },
  android: {
    package: 'com.ventify.stock',
    versionCode: 24,
    adaptiveIcon: {
      backgroundColor: '#f8fafc',
      foregroundImage: './assets/android-icon-foreground.png',
    },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'REQUEST_INSTALL_PACKAGES',
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
    './plugins/withApkInstallerSupport',
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://irtiwaa.ziedtech.com/api/v1',
    reverbHost: process.env.EXPO_PUBLIC_REVERB_HOST || 'irtiwaa.ziedtech.com',
    reverbPort: Number(process.env.EXPO_PUBLIC_REVERB_PORT || 443),
    reverbScheme: process.env.EXPO_PUBLIC_REVERB_SCHEME || 'https',
    reverbAppKey: process.env.EXPO_PUBLIC_REVERB_APP_KEY || '78dp9ud63xntwmvmjybc',
    releaseRepoOwner: process.env.EXPO_PUBLIC_RELEASE_REPO_OWNER || 'zieddams',
    releaseRepoName: process.env.EXPO_PUBLIC_RELEASE_REPO_NAME || 'ventify-stock',
    releaseApiUrl: process.env.EXPO_PUBLIC_RELEASE_API_URL || 'https://api.github.com/repos/zieddams/ventify-stock/releases',
    releasePageUrl: process.env.EXPO_PUBLIC_RELEASE_PAGE_URL || 'https://github.com/zieddams/ventify-stock/releases',
  },
}



