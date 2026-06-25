import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useNotifications } from '../contexts/NotificationsContext'
import { T } from '../theme'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const getLoginScreen = () => require('../screens/auth/LoginScreen').default
const getDashboardScreen = () => require('../screens/main/DashboardScreen').default
const getCustomersScreen = () => require('../screens/main/CustomersScreen').default
const getInvoicesScreen = () => require('../screens/main/InvoicesScreen').default
const getRouteSessionScreen = () => require('../screens/main/RouteSessionScreen').default
const getCamionScreen = () => require('../screens/main/CamionScreen').default
const getNotificationsScreen = () => require('../screens/main/NotificationsScreen').default
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
  const { t } = useI18n()
  const { unreadCount } = useNotifications()
  const unreadBadge = unreadCount > 99 ? '99+' : unreadCount

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
        tabBarBadgeStyle: {
          backgroundColor: T.danger,
          color: '#fff',
          fontSize: 10,
          fontWeight: '800',
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        tabBarIcon: ({ color, focused }) => {
          const icons = {
            [t('navigation.home')]: focused ? 'view-dashboard' : 'view-dashboard-outline',
            [t('navigation.customers')]: focused ? 'account-group' : 'account-group-outline',
            [t('navigation.invoices')]: focused ? 'file-document-multiple' : 'file-document-multiple-outline',
            [t('navigation.notifications')]: focused ? 'bell' : 'bell-outline',
            [t('navigation.session')]: focused ? 'truck-fast' : 'truck-fast-outline',
            [t('navigation.stock')]: focused ? 'truck-cargo-container' : 'truck-cargo-container',
          }

          return <MaterialCommunityIcons name={icons[route.name]} size={21} color={color} />
        },
      })}
    >
      <Tab.Screen name={t('navigation.home')} getComponent={getDashboardScreen} options={{ title: t('navigation.home') }} />
      <Tab.Screen name={t('navigation.customers')} getComponent={getCustomersScreen} options={{ title: t('navigation.customers') }} />
      <Tab.Screen name={t('navigation.invoices')} getComponent={getInvoicesScreen} options={{ title: t('navigation.invoices') }} />
      <Tab.Screen
        name={t('navigation.notifications')}
        getComponent={getNotificationsScreen}
        options={{
          title: t('navigation.notifications'),
          tabBarBadge: unreadCount > 0 ? unreadBadge : undefined,
        }}
      />
      <Tab.Screen name={t('navigation.session')} getComponent={getRouteSessionScreen} options={{ title: t('navigation.session') }} />
      <Tab.Screen name={t('navigation.stock')} getComponent={getCamionScreen} options={{ title: t('navigation.stock') }} />
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
  const { t } = useI18n()

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: T.surface },
        headerTitleStyle: { color: T.text, fontWeight: '800' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: T.background },
      }}
    >
      <Stack.Screen
        name="Tabs"
        component={MobileTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="InvoiceCreate" getComponent={getInvoiceCreateScreen} options={{ title: t('navigation.createInvoice') }} />
      <Stack.Screen name="InvoiceDetail" getComponent={getInvoiceDetailScreen} options={{ title: t('navigation.invoiceDetail') }} />
      <Stack.Screen name="Reappro" getComponent={getReapproScreen} options={{ title: t('navigation.reappro') }} />
      <Stack.Screen name="Profile" getComponent={getProfileScreen} options={{ title: t('navigation.profile') }} />
    </Stack.Navigator>
  )
}

export default function AppNavigator() {
  const { user, loading, isRep } = useAuth()
  const { t } = useI18n()

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={s.loadingText}>{t('navigation.initializing')}</Text>
      </View>
    )
  }

  return (
    <NavigationContainer>
      {user && isRep() ? <AppStack /> : <AuthStack />}
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
