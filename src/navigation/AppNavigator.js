import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import { T } from '../theme'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const getLoginScreen = () => require('../screens/auth/LoginScreen').default
const getDashboardScreen = () => require('../screens/main/DashboardScreen').default
const getCustomersScreen = () => require('../screens/main/CustomersScreen').default
const getInvoicesScreen = () => require('../screens/main/InvoicesScreen').default
const getRouteSessionScreen = () => require('../screens/main/RouteSessionScreen').default
const getInvoiceCreateScreen = () => require('../screens/shared/InvoiceCreateScreen').default
const getInvoiceDetailScreen = () => require('../screens/shared/InvoiceDetailScreen').default
const getProfileScreen = () => require('../screens/shared/ProfileScreen').default
const getReapproScreen = () => require('../screens/main/ReapproScreen').default

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
        lazy: true,
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
      <Tab.Screen name="Accueil" getComponent={getDashboardScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen name="Clients" getComponent={getCustomersScreen} options={{ title: 'Clients' }} />
      <Tab.Screen name="Factures" getComponent={getInvoicesScreen} options={{ title: 'Factures' }} />
      <Tab.Screen name="Session" getComponent={getRouteSessionScreen} options={{ title: 'Session' }} />
      <Tab.Screen name="Reglages" getComponent={getProfileScreen} options={{ title: 'Reglages' }} />
    </Tab.Navigator>
  )
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" getComponent={getLoginScreen} />
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
      <Stack.Screen name="InvoiceCreate" getComponent={getInvoiceCreateScreen} options={{ title: 'Nouvelle facture' }} />
      <Stack.Screen name="InvoiceDetail" getComponent={getInvoiceDetailScreen} options={{ title: 'Detail facture' }} />
      <Stack.Screen name="Reappro" getComponent={getReapproScreen} options={{ title: 'Reappro camion' }} />
      <Stack.Screen name="Profile" getComponent={getProfileScreen} options={{ title: 'Reglages mobiles' }} />
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
