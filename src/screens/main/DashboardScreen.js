import { useAuth } from '../../contexts/AuthContext'
import AdminDashboardScreen from './AdminDashboardScreen'
import RepDashboardScreen from './RepDashboardScreen'

export default function DashboardScreen(props) {
  const { isRep } = useAuth()
  return isRep() ? <RepDashboardScreen {...props} /> : <AdminDashboardScreen {...props} />
}
