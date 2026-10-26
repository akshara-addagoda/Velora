import { describe, expect, it } from 'vitest'
import { apiEndpoint, apiMediaUrl, normalizeApiOrigin } from './api-url'

describe('separate frontend and backend deployment URLs', () => {
  it('preserves the existing local API proxy and placeholder images', () => {
    expect(apiEndpoint('/cart')).toBe('/api/cart')
    expect(apiMediaUrl('/placeholder.svg')).toBe('/placeholder.svg')
  })
  it('uses the hosted API for JSON requests and uploaded images', () => {
    const origin = normalizeApiOrigin('https://api.example.com///', true)
    expect(apiEndpoint('/auth/login', origin)).toBe('https://api.example.com/api/auth/login')
    expect(apiMediaUrl('/api/uploads/image.png', origin)).toBe(
      'https://api.example.com/api/uploads/image.png',
    )
    expect(apiMediaUrl('https://images.example.com/photo.jpg', origin)).toBe(
      'https://images.example.com/photo.jpg',
    )
  })
  it.each([
    'https://user:password@api.example.com',
    'https://api.example.com/api',
    'https://api.example.com?secret=value',
    'javascript:alert(1)',
  ])('rejects invalid API configuration without echoing it: %s', (value) => {
    expect(() => normalizeApiOrigin(value)).toThrow('VITE_API_BASE_URL')
  })
  it.each(['http://api.example.com', 'https://localhost:8000', 'https://127.0.0.1'])(
    'rejects an insecure public deployment origin: %s',
    (value) => {
      expect(() => normalizeApiOrigin(value, true)).toThrow('public HTTPS')
    },
  )
})
