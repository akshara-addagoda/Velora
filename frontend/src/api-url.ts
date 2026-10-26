/** Public API configuration. Never include a password, token or database URL. */
export function normalizeApiOrigin(value: string, requireHttps = false): string {
  const raw = value.trim().replace(/\/+$/, '')
  if (!raw) return ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('VITE_API_BASE_URL must be a valid API origin.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.hostname.includes('*') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'VITE_API_BASE_URL must be an HTTP(S) origin without credentials, a path, or query parameters.',
    )
  }
  if (
    requireHttps &&
    (url.protocol !== 'https:' ||
      url.hostname.endsWith('.localhost') ||
      /^127\./.test(url.hostname) ||
      ['localhost', '[::1]', '0.0.0.0'].includes(url.hostname))
  ) {
    throw new Error('Public deployment requires a public HTTPS VITE_API_BASE_URL.')
  }
  return url.origin
}

export function apiEndpoint(path: string, origin = ''): string {
  return origin + '/api' + path
}

export function apiMediaUrl(path: string, origin = ''): string {
  return path.startsWith('/api/uploads/') ? origin + path : path
}
