import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator }  from '@react-navigation/native-stack'
import { createBottomTabNavigator }    from '@react-navigation/bottom-tabs'
import { Text, View, ActivityIndicator } from 'react-native'
import { useAuth } from '../contexts/AuthContext'

// Screens
import LoginScreen    from '../screens/auth/LoginScreen'
import DashboardScreen from '../screens/main/DashboardScreen'
import InvoicesScreen  from '../screens/main/InvoicesScreen'
import CamionScreen    from '../screens/main/CamionScreen'

const Stack = createNativeStackNavigator()
const Tab   = createBottomTabNavigator()

const T = { teal: '#0d9488', bg: '#ffffff', border: '#e2e8f0', muted: '#94a3b8' }

function TabIcon({ name, focused }) {
  const icons = {
    Dashboard: focused ? '📊' : '📈',
    Factures:  focused ? '🧾' : '📄',
    Camion:    focused ? '🚚' : '🚛',
  }
  return <Text style={{ fontSize: 20 }}>{icons[name] ?? '●'}</Text>
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: T.teal,
        tabBarInactiveTintColor: T.muted,
        tabBarStyle: { backgroundColor: T.bg, borderTopColor: T.border, paddingBottom: 6, height: 60 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: T.bg },
        headerTitleStyle: { color: '#0f172a', fontWeight: '700' },
        headerShadowVisible: false,
      })}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Tableau de bord' }} />
      <Tab.Screen name="Factures"  component={InvoicesScreen}  options={{ title: 'Factures'         }} />
      <Tab.Screen name="Camion"    component={CamionScreen}    options={{ title: 'Mon camion'       }} />
    </Tab.Navigator>
  )
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  )
}

function AppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Main"          component={MainTabs}   options={{ headerShown: false }} />
      <Stack.Screen name="InvoiceCreate" component={require('../screens/main/InvoicesScreen').default}
        options={{ title: 'Nouvelle facture', headerTintColor: T.teal }} />
      <Stack.Screen name="InvoiceDetail" component={require('../screens/main/InvoicesScreen').default}
        options={{ title: 'Facture', headerTintColor: T.teal }} />
    </Stack.Navigator>
  )
}

export default function AppNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' }}>
        <ActivityIndicator size="large" color={T.teal} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  )
}
