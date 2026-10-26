export type User = { id: number; name: string; email: string; roles: string[] }
export type Business = {
  id: number
  name: string
  description: string
  town: string
  localities: string
  verified: boolean
  delivery: boolean
  pickup: boolean
  cash_enabled: boolean
  contact?: string
}
export type Listing = {
  id: number
  kind: string
  category_id: number
  title: string
  description: string
  image: string
  price: string
  unit: string
  pricing_model: string
  stock: number
  minimum: number
  active: boolean
  business: Business
  details: Record<string, string | number | boolean>
  rating: number | null
  review_count: number
  reviews?: { id: number; rating: number; comment: string }[]
  availability?: { id: number; starts_at: string; ends_at: string }[]
}
export type Transaction = {
  id: number
  title: string
  kind: string
  status: string
  total: string
  subtotal: string
  commission: string
  provider_earnings: string
  deposit: string
  delivery_fee: string
  starts_at: string | null
  ends_at: string | null
  urgent: boolean
  notes: string
  eta: string
  contact: string
  address: string
  locality: string
  fulfillment: string
  business: Business
  payment_status: string
  payment_mode: string
  reviewed: boolean
  items: { listing_id: number; title: string; quantity: number; price: string }[]
}
export type Category = { id: number; name: string; kind: string }
export type CartItem = { listing: Listing; quantity: number }

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('velora-token')
  const response = await fetch('/api' + path, {
    ...options,
    headers: {
      ...(!(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      sessionStorage.removeItem('velora-token')
      window.dispatchEvent(new Event('velora-session-expired'))
    }
    const error = await response.json().catch(() => ({}))
    throw new Error(
      typeof error.detail === 'string'
        ? error.detail
        : Array.isArray(error.detail)
          ? error.detail.map((e: any) => `${e.loc.at(-1)}: ${e.msg}`).join('; ')
          : 'Something went wrong. Please try again.',
    )
  }
  return response.json()
}
export const post = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
export const put = <T = any>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const rupees = (value: string | number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value))
export const dateTime = (value: string | null) =>
  value
    ? new Date(value.endsWith('Z') ? value : value + 'Z').toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Earliest available — awaiting provider'
export const toUTC = (value: string) => (value ? new Date(value).toISOString() : null)
