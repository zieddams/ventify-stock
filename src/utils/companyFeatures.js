function hasCompanyFeature(user, key) {
  return user?.company?.features?.[key] === true
}

export function isCustomerGeolocationEnabled(user) {
  return hasCompanyFeature(user, 'customer_geolocation_enabled')
}

export function isTerrainTrackingEnabled(user) {
  return hasCompanyFeature(user, 'terrain_tracking_enabled')
}

export function buildMobileCommercialAccessMessage(user) {
  const adminName = user?.mobile_access?.contact_admin_name

  if (adminName) {
    return `Ce compte est valide, mais l'application mobile est reservee aux commerciaux. Contactez ${adminName} pour obtenir un acces mobile.`
  }

  return "Ce compte est valide, mais l'application mobile est reservee aux commerciaux. Contactez votre administrateur pour obtenir un acces mobile."
}
