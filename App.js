import 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/contexts/AuthContext'
import { I18nProvider } from './src/contexts/I18nContext'
import { MobileUpdateProvider } from './src/contexts/MobileUpdateContext'
import { NotificationsProvider } from './src/contexts/NotificationsContext'
import { TrackingProvider } from './src/contexts/TrackingContext'
import AppNavigator from './src/navigation/AppNavigator'
import { T } from './src/theme'

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <I18nProvider>
          <NotificationsProvider>
            <TrackingProvider>
              <MobileUpdateProvider>
                <StatusBar style="dark" backgroundColor={T.background} translucent={false} />
                <AppNavigator />
              </MobileUpdateProvider>
            </TrackingProvider>
          </NotificationsProvider>
        </I18nProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
