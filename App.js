import 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/contexts/AuthContext'
import { TrackingProvider } from './src/contexts/TrackingContext'
import AppNavigator from './src/navigation/AppNavigator'
import { T } from './src/theme'

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TrackingProvider>
          <StatusBar style="dark" backgroundColor={T.background} translucent={false} />
          <AppNavigator />
        </TrackingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
