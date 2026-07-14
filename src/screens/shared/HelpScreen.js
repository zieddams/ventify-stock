import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { T, cardShadow } from '../../theme'

const TOPICS = [
  { icon: 'truck-fast-outline', key: 'startRoute' },
  { icon: 'truck-delivery-outline', key: 'restock' },
  { icon: 'storefront-outline', key: 'dropToPos' },
  { icon: 'file-document-plus-outline', key: 'createInvoice' },
  { icon: 'cash-register', key: 'recordPayment' },
  { icon: 'account-search-outline', key: 'customerBalance' },
  { icon: 'calendar-heart', key: 'requestLeave' },
]

export default function HelpScreen() {
  const { t } = useI18n()

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <PageHeader title={t('help.title')} subtitle={t('help.subtitle')} />

      {TOPICS.map((topic) => (
        <View key={topic.key} style={[s.card, cardShadow]}>
          <View style={s.iconWrap}>
            <MaterialCommunityIcons name={topic.icon} size={20} color={T.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{t(`help.topics.${topic.key}.title`)}</Text>
            <Text style={s.cardText}>{t(`help.topics.${topic.key}.text`)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  content: { padding: 20, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 16,
    marginBottom: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecfeff',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  cardText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: T.textSecondary,
  },
})
