import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import LoginScreen from '../screens/auth/LoginScreen'
import DashboardScreen from '../screens/main/DashboardScreen'
import CustomersScreen from '../screens/main/CustomersScreen'
import InvoicesScreen from '../screens/main/InvoicesScreen'
import RouteSessionScreen from '../screens/main/RouteSessionScreen'
import InvoiceCreateScreen from '../screens/shared/InvoiceCreateScreen'
import InvoiceDetailScreen from '../screens/shared/InvoiceDetailScreen'
import ProfileScreen from '../screens/shared/ProfileScreen'
import ReapproScreen from '../screens/main/ReapproScreen'
import { T } from '../theme'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function useTabLayout() {
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, 10)

  return {
    bottomInset,
    tabBarHeight: 60 + bottomInset,
  }
}

function MobileTabs() {
  const { bottomInset, tabBarHeight } = useTabLayout()

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: T.background },
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: T.primary,
        tabBarInactiveTintColor: T.textMuted,
        tabBarStyle: {
          backgroundColor: T.surface,
          borderTopColor: T.border,
          height: tabBarHeight,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginBottom: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        tabBarIcon: ({ color, focused }) => {
          const icons = {
            Accueil: focused ? 'view-dashboard' : 'view-dashboard-outline',
            Clients: focused ? 'account-group' : 'account-group-outline',
            Factures: focused ? 'file-document-multiple' : 'file-document-multiple-outline',
            Session: focused ? 'map-marker-path' : 'map-marker-path',
            Reglages: focused ? 'cog' : 'cog-outline',
          }

          return <MaterialCommunityIcons name={icons[route.name]} size={21} color={color} />
        },
      })}>
      <Tab.Screen name="Accueil" component={DashboardScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen name="Clients" component={CustomersScreen} options={{ title: 'Clients' }} />
      <Tab.Screen name="Factures" component={InvoicesScreen} options={{ title: 'Factures' }} />
      <Tab.Screen name="Session" component={RouteSessionScreen} options={{ title: 'Session' }} />
      <Tab.Screen name="Reglages" component={ProfileScreen} options={{ title: 'Reglages' }} />
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
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: T.surface },
        headerTitleStyle: { color: T.text, fontWeight: '800' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: T.background },
      }}>
      <Stack.Screen
        name="Tabs"
        component={MobileTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="InvoiceCreate" component={InvoiceCreateScreen} options={{ title: 'Nouvelle facture' }} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'Detail facture' }} />
      <Stack.Screen name="Reappro" component={ReapproScreen} options={{ title: 'Reappro camion' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Reglages mobiles' }} />
    </Stack.Navigator>
  )
}

export default function AppNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={s.loadingText}>Initialisation mobile...</Text>
      </View>
    )
  }

  return (
    <NavigationContainer>
      {user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  )
}

const s = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.background,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 13,
    color: T.textMuted,
  },
})