import 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from './src/contexts/AuthContext'
import { TrackingProvider } from './src/contexts/TrackingContext'
import AppNavigator from './src/navigation/AppNavigator'

export default function App() {
  return (
    <AuthProvider>
      <TrackingProvider>
        <StatusBar style="dark" backgroundColor="#edf6f5" />
        <AppNavigator />
      </TrackingProvider>
    </AuthProvider>
  )
}
