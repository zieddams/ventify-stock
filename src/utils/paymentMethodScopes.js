const ALL_SCOPE = 'all'

export function normalizePaymentMethodScopes(method) {
  const scopes = Array.isArray(method?.scopes) ? method.scopes : []

  if (scopes.length > 0) {
    return scopes
  }

  return String(method?.value) === 'cash' ? [ALL_SCOPE] : ['customer', 'expense']
}

export function supportsPaymentMethodScope(method, scope) {
  if (!scope) {
    return true
  }

  const scopes = normalizePaymentMethodScopes(method)
  return scopes.includes(ALL_SCOPE) || scopes.includes(scope)
}

export function filterPaymentMethodsByScope(methods, scope) {
  return (methods ?? []).filter((method) => supportsPaymentMethodScope(method, scope))
}
