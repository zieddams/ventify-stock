import 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from './src/contexts/AuthContext'
import AppNavigator from './src/navigation/AppNavigator'

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="dark" backgroundColor="#f1f5f9" />
      <AppNavigator />
    </AuthProvider>
  )
}
