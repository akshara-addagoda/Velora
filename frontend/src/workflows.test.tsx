// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { api } from './api'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const response = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
function page(path: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('core UI states', () => {
  it('removes the signed-in identity and private screen immediately on logout', async () => {
    sessionStorage.setItem('velora-token', 'test-session')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        response(
          url.endsWith('/me')
            ? { id: 2, name: 'Customer', email: 'customer@example.com', roles: ['customer'] }
            : url.endsWith('/auth/logout')
              ? { message: 'Signed out' }
              : [],
        ),
      ),
    )
    page('/account')
    expect(await screen.findByRole('heading', { name: 'Hello, Customer.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Hello, Customer.' })).toBeNull()
    expect(sessionStorage.getItem('velora-token')).toBeNull()
  })
  it('protects private activity and displays the sign-in form', async () => {
    vi.stubGlobal('fetch', vi.fn())
    page('/activity')
    expect(await screen.findByText('Welcome back.')).toBeTruthy()
    expect(screen.getByLabelText('Email address')).toBeTruthy()
  })

  it('shows empty search results and a functional way back to all listings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        response(url.includes('categories') ? [] : { items: [], total: 0, page: 1, pages: 0 }),
      ),
    )
    page('/explore?q=no-match')
    expect(await screen.findByText('No matches just yet.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Explore all listings' }).getAttribute('href')).toBe(
      '/explore',
    )
  })

  it('shows API errors instead of a fabricated catalogue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({ detail: 'Catalogue temporarily unavailable' }, 503)),
    )
    page('/explore')
    expect(await screen.findByText('Catalogue temporarily unavailable')).toBeTruthy()
  })

  it('shows a loading indicator while catalogue requests are pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    page('/explore')
    expect(await screen.findByText('Finding good things nearby…')).toBeTruthy()
  })

  it('submits registration with only selected business roles and surfaces server validation', async () => {
    const fetchMock = vi.fn(() => response({ detail: 'An account already uses this email' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    page('/register')
    await screen.findByText('Make yourself at home.')
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Neighbour' } })
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'hello@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password (at least 10 characters)'), {
      target: { value: 'a-long-password' },
    })
    fireEvent.click(screen.getByLabelText('Sell fresh produce'))
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('An account already uses this email')).toBeTruthy()
    const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(request[1].body)).roles).toEqual(['customer', 'seller'])
  })

  it('clears an expired bearer token and broadcasts a session event', async () => {
    sessionStorage.setItem('velora-token', 'expired')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({ detail: 'Session expired' }, 401)),
    )
    const listener = vi.fn()
    window.addEventListener('velora-session-expired', listener)
    await expect(api('/me')).rejects.toThrow('Session expired')
    expect(sessionStorage.getItem('velora-token')).toBeNull()
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('velora-session-expired', listener)
  })

  it('requires a server estimate before sending a service request', async () => {
    sessionStorage.setItem('velora-token', 'test-session')
    const listing = {
      id: 1,
      kind: 'service',
      category_id: 1,
      title: 'Local electrician',
      description: 'A reliable local repair service.',
      image: '',
      price: '350.00',
      unit: 'visit',
      pricing_model: 'fixed',
      stock: 0,
      minimum: 1,
      active: true,
      details: {},
      rating: null,
      review_count: 0,
      availability: [],
      reviews: [],
      business: {
        id: 1,
        name: 'Home Care',
        town: 'Mahabubabad',
        localities: 'Mahabubabad',
        verified: false,
        cash_enabled: true,
      },
    }
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/me'))
        return response({
          id: 2,
          name: 'Customer',
          email: 'customer@example.com',
          roles: ['customer'],
        })
      if (url.endsWith('/cart')) return response([])
      if (url.endsWith('/bookings/estimate'))
        return response({ subtotal: '350.00', deposit: '0.00', total: '350.00', units: 1 })
      if (url.endsWith('/bookings')) return response({ id: 4 })
      return response(listing)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    page('/listing/1')
    await screen.findByRole('heading', { name: 'Local electrician', level: 1 })
    fireEvent.change(screen.getByLabelText('Preferred date & time (your local time)'), {
      target: { value: '2027-05-01T10:00' },
    })
    fireEvent.change(screen.getByLabelText('Service address'), {
      target: { value: 'Main Road test house' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Get an estimate' }))
    await screen.findByRole('button', { name: 'Confirm & send request' })
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith('/bookings'))).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & send request' }))
    expect(await screen.findByText('Your request is on its way.')).toBeTruthy()
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith('/bookings'))).toHaveLength(1)
  })

  it('places a produce order with the selected address and fulfillment method', async () => {
    sessionStorage.setItem('velora-token', 'test-session')
    const item = {
      quantity: 2,
      listing: {
        id: 10,
        title: 'Tomatoes',
        image: '',
        price: '32.00',
        unit: 'kg',
        stock: 5,
        minimum: 1,
        business: {
          name: 'Local Farm',
          localities: 'Mahabubabad',
          delivery: true,
          pickup: true,
          cash_enabled: true,
        },
      },
    }
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/me'))
        return response({
          id: 2,
          name: 'Customer',
          email: 'customer@example.com',
          roles: ['customer'],
        })
      if (url.endsWith('/cart')) return response([item])
      if (url.endsWith('/addresses') || url.endsWith('/transactions')) return response([])
      return response({ id: 3 })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    page('/cart')
    await screen.findByText('The last little details.')
    fireEvent.change(screen.getByLabelText('Delivery address'), {
      target: { value: 'Test address, Main Road' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Place order request' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => call[0].endsWith('/checkout'))).toBe(true),
    )
    const call = fetchMock.mock.calls.find((call) => call[0].endsWith('/checkout')) as unknown as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      address: 'Test address, Main Road',
      fulfillment: 'delivery',
      locality: 'Mahabubabad',
    })
    expect(
      await screen.findByText('Order placed. Your seller will confirm it shortly.'),
    ).toBeTruthy()
  })
})
