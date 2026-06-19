import 'react-native-gesture-handler'

if (typeof globalThis.FormData === 'undefined') {
  const ReactNativeFormData = require('react-native/Libraries/Network/FormData').default
  globalThis.FormData = ReactNativeFormData
}

const { registerRootComponent } = require('expo')
const App = require('./App').default

registerRootComponent(App)

