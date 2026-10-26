import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowRight,
  Bell,
  Camera,
  CarFront,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Flower2,
  Heart,
  Leaf,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Star,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import {
  api,
  dateTime,
  post,
  put,
  rupees,
  toUTC,
  type CartItem,
  type Category,
  type Listing,
  type User,
} from './api'
import { AccountPage, AdminPage, BusinessPage, CartPage, TransactionsPage } from './dashboards'

type Context = { user: User | null; refresh: () => void; toast: (message: string) => void }
const SessionContext = createContext<Context>({ user: null, refresh: () => {}, toast: () => {} })
export const useSession = () => useContext(SessionContext)
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
export function Loading() {
  return (
    <div className="loading">
      <span className="spinner" /> Finding good things nearby…
    </div>
  )
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow || 'YOUR NEIGHBOURHOOD, CONNECTED'}</span>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  )
}

function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user } = useSession()
  const location = useLocation()
  if (!user) return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  if (admin && !user.roles.includes('admin'))
    return <Notice error>Administrator access is required.</Notice>
  return children
}

export default function App() {
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [menu, setMenu] = useState(false)
  const { data: user, isPending } = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      sessionStorage.getItem('velora-token') ? api<User>('/me') : Promise.resolve(null),
    retry: false,
  })
  const { data: cart } = useQuery({
    queryKey: ['cart'],
    queryFn: () => api<CartItem[]>('/cart'),
    enabled: !!user,
  })
  const location = useLocation()
  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
  }, [location.pathname])
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 4500)
      return () => clearTimeout(timer)
    }
  }, [message])
  useEffect(() => {
    const expired = () => {
      // Keep the observed identity query attached so protected routes rerender immediately.
      client.setQueryData(['me'], null)
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
      setMessage('Your session expired. Please sign in again.')
    }
    window.addEventListener('velora-session-expired', expired)
    return () => window.removeEventListener('velora-session-expired', expired)
  }, [client])
  const refresh = () => {
    void client.invalidateQueries()
  }
  const logout = async () => {
    try {
      await post('/auth/logout')
    } catch {
      setMessage('Signed out on this device. Server sign-out could not be confirmed.')
    } finally {
      sessionStorage.removeItem('velora-token')
      client.setQueryData(['me'], null)
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
    }
  }
  return (
    <SessionContext.Provider value={{ user: user || null, refresh, toast: setMessage }}>
      <div className="announcement">
        <span>
          <Leaf size={13} /> A little more local. A lot more possible.
        </span>
        <span>
          Now in Mahabubabad <span className="live-dot" />
        </span>
      </div>
      <header>
        <div className="header-inner">
          <Link className="logo" to="/" aria-label="Velora home">
            <span className="logo-mark">
              <Flower2 size={25} />
            </span>
            velora<span className="logo-period">.</span>
          </Link>
          <div className="location-label">
            <MapPin size={18} />
            <div>
              <small>YOUR NEIGHBOURHOOD</small>
              <select aria-label="Town (initial launch area)" defaultValue="Mahabubabad">
                <option>Mahabubabad</option>
              </select>
            </div>
          </div>
          <nav className="desktop-nav">
            <NavLink to="/explore?kind=service">Services</NavLink>
            <NavLink to="/explore?kind=vegetable">Fresh market</NavLink>
            <NavLink to="/explore?kind=vehicle">Rentals</NavLink>
          </nav>
          <div className="header-actions">
            <Link
              to="/cart"
              className="icon-button cart-icon"
              aria-label={`Shopping bag, ${cart?.length || 0} products`}
            >
              <ShoppingBag size={21} />
              {!!cart?.length && <i>{cart.length}</i>}
            </Link>
            {user ? (
              <>
                <Link to="/account" className="account-link">
                  <UserRound size={18} />
                  <span>{user.name.split(' ')[0]}</span>
                </Link>
                <button className="text-button desktop-only" onClick={logout}>
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/signin" className="signin">
                Sign in <ArrowRight size={15} />
              </Link>
            )}
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {menu && (
        <nav className="mobile-nav">
          <Link to="/explore?kind=service">Services</Link>
          <Link to="/explore?kind=vegetable">Fresh market</Link>
          <Link to="/explore?kind=vehicle">Rentals</Link>
          <Link to="/account">My account</Link>
          {user && <button onClick={logout}>Sign out</button>}
        </nav>
      )}
      <main>
        {isPending ? (
          <Loading />
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/listing/:id" element={<ListingPage />} />
            <Route path="/business/:id" element={<PublicBusiness />} />
            <Route path="/signin" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
            <Route
              path="/account"
              element={
                <Protected>
                  <AccountPage />
                </Protected>
              }
            />
            <Route
              path="/activity"
              element={
                <Protected>
                  <TransactionsPage />
                </Protected>
              }
            />
            <Route
              path="/cart"
              element={
                <Protected>
                  <CartPage />
                </Protected>
              }
            />
            <Route
              path="/business"
              element={
                <Protected>
                  <BusinessPage />
                </Protected>
              }
            />
            <Route
              path="/admin/*"
              element={
                <Protected admin>
                  <AdminPage />
                </Protected>
              }
            />
            <Route
              path="/favourites"
              element={
                <Protected>
                  <SavedPage />
                </Protected>
              }
            />
            <Route
              path="/notifications"
              element={
                <Protected>
                  <NotificationsPage />
                </Protected>
              }
            />
            <Route path="/about" element={<InfoPage kind="about" />} />
            <Route path="/support" element={<InfoPage kind="support" />} />
            <Route path="/terms" element={<InfoPage kind="terms" />} />
            <Route path="/privacy" element={<InfoPage kind="privacy" />} />
            <Route
              path="*"
              element={
                <div className="container section">
                  <PageTitle title="A little off the beaten path." />
                  <Link to="/" className="button">
                    Back to home
                  </Link>
                </div>
              }
            />
          </Routes>
        )}
      </main>
      <footer>
        <div className="container footer-grid">
          <div>
            <Link className="logo" to="/">
              <Flower2 size={25} />
              velora.
            </Link>
            <p>
              Good things, closer to home.
              <br />
              Made for Mahabubabad. Built around you.
            </p>
            <span className="small">
              Local development marketplace · Online payments unavailable
            </span>
          </div>
          <div>
            <b>Explore your neighbourhood</b>
            <Link to="/explore?kind=service">Local services</Link>
            <Link to="/explore?kind=vegetable">Fresh vegetables</Link>
            <Link to="/explore?kind=vehicle">Vehicle rentals</Link>
          </div>
          <div>
            <b>A little about us</b>
            <Link to="/about">Our story</Link>
            <Link to="/register">Grow your business</Link>
            <Link to="/support">Help & support</Link>
          </div>
          <div className="footer-note">
            <MapPin size={20} />
            <b>Rooted in Mahabubabad.</b>
            <p>Connecting local people with local possibilities.</p>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Velora. All things local.</span>
          <div>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
          <span>
            Made with care, for our community <Heart size={12} />
          </span>
        </div>
      </footer>
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </SessionContext.Provider>
  )
}

const areas = [
  { icon: Camera, label: 'Photography', query: 'Photography', color: 'peach' },
  { icon: Sparkles, label: 'Beauty & makeup', query: 'Makeup', color: 'pink' },
  { icon: Wrench, label: 'Home repairs', query: 'repair', color: 'blue' },
  { icon: Flower2, label: 'Events & decor', query: 'decoration', color: 'purple' },
  { icon: ShoppingBasket, label: 'Fresh vegetables', kind: 'vegetable', color: 'green' },
  { icon: CarFront, label: 'Car rentals', kind: 'vehicle', color: 'yellow' },
]
function Home() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { data, isPending, error } = useQuery({
    queryKey: ['home-listings'],
    queryFn: () => api<{ items: Listing[] }>('/listings?kind=service&page_size=3'),
  })
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="pill">
              <span className="live-dot" /> YOUR TOWN. YOUR PEOPLE. YOUR PLATFORM.
            </span>
            <h1>
              Good things,
              <br />
              closer to{' '}
              <span>
                home
                <svg viewBox="0 0 240 15" aria-hidden="true">
                  <path d="M3 11Q108-3 235 7" />
                </svg>
              </span>
              .
            </h1>
            <p>
              Trusted local hands. Farm-fresh finds. Your next ride.
              <br className="desktop-only" /> Everything you need, right here in Mahabubabad.
            </p>
            <form
              className="hero-search"
              onSubmit={(e) => {
                e.preventDefault()
                navigate('/explore?q=' + encodeURIComponent(search))
              }}
            >
              <Search size={20} />
              <input
                aria-label="Search your neighbourhood"
                placeholder="What can we help you find?"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="button">
                Explore <ArrowRight size={17} />
              </button>
            </form>
            <div className="popular">
              <b>Popular:</b>
              {['Electrician', 'Photography', 'Fresh vegetables'].map((x, i) => (
                <Link
                  key={x}
                  to={i === 2 ? '/explore?kind=vegetable' : '/explore?q=' + encodeURIComponent(x)}
                >
                  {x}
                </Link>
              ))}
            </div>
            <div className="hero-trust">
              <div className="avatar-stack">
                <span>
                  <Camera size={12} />
                </span>
                <span>
                  <Leaf size={12} />
                </span>
                <span>
                  <Wrench size={12} />
                </span>
                <span>
                  <CarFront size={12} />
                </span>
              </div>
              <div>
                <div className="community-label">ONE LOCAL COMMUNITY</div>
                <span>Built for the people of our town</span>
              </div>
              <span className="trust-divider" />
              <div className="local-note">
                <ShieldCheck size={22} />
                <span>
                  Local connections.
                  <br />
                  <b>Everyday peace of mind.</b>
                </span>
              </div>
            </div>
          </div>
          <div className="hero-art">
            <div className="photo-main">
              <img
                src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1100&q=90"
                alt="Fresh vegetables at a neighbourhood market"
              />
              <div className="photo-overlay">
                <span>FRESH FROM YOUR NEIGHBOURHOOD</span>
                <h3>
                  A little local.
                  <br />A whole lot of good.
                </h3>
              </div>
            </div>
            <div className="floating-card">
              <span className="floating-icon">
                <Check size={20} />
              </span>
              <div>
                <b>Your everyday, made easier.</b>
                <small>One platform. So many possibilities.</small>
              </div>
            </div>
            <div className="round-badge">
              <Leaf size={22} />
              <span>
                LOVE LOCAL
                <br />
                <b>LIVE LOCAL</b>
              </span>
            </div>
            <span className="art-spark">✳</span>
          </div>
        </div>
      </section>
      <section className="trust-strip">
        <div className="container">
          <span>
            <ShieldCheck />
            Local businesses, clear profiles
          </span>
          <span>
            <MapPin />
            Made for your neighbourhood
          </span>
          <span>
            <ShoppingBag />
            Simple booking & shopping
          </span>
          <span>
            <Heart />
            More opportunity for local people
          </span>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A WORLD OF LOCAL POSSIBILITIES</span>
            <h2>What’s on your list today?</h2>
          </div>
          <Link to="/explore" className="inline-link">
            Explore everything <ArrowRight size={17} />
          </Link>
        </div>
        <div className="category-grid">
          {areas.map(({ icon: Icon, ...area }) => (
            <Link
              className="category-card"
              key={area.label}
              to={'/explore?' + (area.kind ? 'kind=' + area.kind : 'kind=service&q=' + area.query)}
            >
              <span className={'category-icon ' + area.color}>
                <Icon size={28} strokeWidth={1.5} />
              </span>
              <b>{area.label}</b>
              <span>
                Find nearby <ChevronRight size={13} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="container discover-grid">
        <Link to="/explore?kind=vegetable" className="discover-card fresh">
          <div>
            <span className="eyebrow">FROM THE MARKET, WITH LOVE</span>
            <h2>
              Fresh picks.
              <br />
              Happy kitchens.
            </h2>
            <p>Everyday goodness from your local sellers.</p>
            <span className="button light">
              Shop fresh <ArrowRight size={16} />
            </span>
          </div>
          <img
            src="https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=650&q=85"
            alt="Fresh seasonal vegetables"
          />
        </Link>
        <Link to="/explore?kind=vehicle" className="discover-card rides">
          <div>
            <span className="eyebrow">A LITTLE ESCAPE OR AN EVERYDAY RIDE</span>
            <h2>
              Your plans.
              <br />
              Your kind of ride.
            </h2>
            <p>Find a local rental for wherever life takes you.</p>
            <span className="button light">
              Explore rentals <ArrowRight size={16} />
            </span>
          </div>
          <CarFront className="car-illustration" strokeWidth={0.7} />
          <span className="road-line" />
        </Link>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">GOOD PEOPLE. GREAT POSSIBILITIES.</span>
            <h2>A helping hand, just around the corner.</h2>
            <p>Discover local professionals for the little things and the big moments.</p>
          </div>
          <Link className="inline-link" to="/explore?kind=service">
            View all services <ArrowRight size={17} />
          </Link>
        </div>
        {isPending ? (
          <Loading />
        ) : error ? (
          <Notice error>{error.message}</Notice>
        ) : (
          <div className="listing-grid">
            {data?.items.map((item) => (
              <ListingCard key={item.id} listing={item} />
            ))}
          </div>
        )}
      </section>
      <section className="container how-section">
        <div>
          <span className="eyebrow">LESS HASSLE. MORE LIVING.</span>
          <h2>Local made simple.</h2>
          <p>
            From “I need” to “all sorted”,
            <br />
            in a few easy steps.
          </p>
          <Link to="/explore" className="inline-link">
            Find your next good thing <ArrowRight size={17} />
          </Link>
        </div>
        {[
          [
            '01',
            'Find your thing',
            'Browse local services, fresh produce or a ride that fits your plans.',
          ],
          [
            '02',
            'Make it happen',
            'Choose what works for you and send a booking or order request.',
          ],
          [
            '03',
            'Get on with your day',
            'Track updates and connect with your provider after acceptance.',
          ],
        ].map(([n, title, text]) => (
          <div className="how-step" key={n}>
            <span>{n}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>
      <section className="container business-banner">
        <span className="business-flower">✳</span>
        <div>
          <span className="eyebrow">SMALL BUSINESS. BIG POSSIBILITIES.</span>
          <h2>Your skills deserve a bigger neighbourhood.</h2>
          <p>Offer a service, sell fresh produce or rent out vehicles. Grow with Velora.</p>
        </div>
        <Link className="button" to="/register">
          Bring your business online <ArrowRight size={17} />
        </Link>
      </section>
    </>
  )
}

export function ListingCard({ listing }: { listing: Listing }) {
  const { user, toast, refresh } = useSession()
  const navigate = useNavigate()
  const save = async () => {
    if (!user) return navigate('/signin')
    try {
      const result = await put('/favourites/' + listing.id, {})
      toast(result.message)
      refresh()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const add = async () => {
    if (!user) return navigate('/signin')
    try {
      const cart = await api<CartItem[]>('/cart')
      const old = cart.find((x) => x.listing.id === listing.id)
      await put('/cart', {
        listing_id: listing.id,
        quantity: (old?.quantity || 0) + listing.minimum,
      })
      toast('Added to your bag')
      refresh()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <article className="listing-card">
      <div className="listing-image">
        <Link to={'/listing/' + listing.id}>
          <img
            src={listing.image || '/placeholder.svg'}
            alt={listing.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = '/placeholder.svg'
            }}
          />
        </Link>
        <span className="image-tag">
          {listing.kind === 'vegetable'
            ? 'LOCAL & FRESH'
            : listing.kind === 'vehicle'
              ? String(listing.details.driver || 'LOCAL RENTAL')
              : 'LOCAL PROFESSIONAL'}
        </span>
        <button className="save-button" onClick={save} aria-label={'Toggle saved ' + listing.title}>
          <Heart size={17} />
        </button>
      </div>
      <div className="listing-content">
        <div className="listing-meta">
          <span>
            <MapPin size={12} />
            {listing.business.town}
          </span>
          <span>
            {listing.rating ? (
              <>
                <Star size={12} fill="currentColor" />
                {listing.rating} ({listing.review_count})
              </>
            ) : (
              'New on Velora'
            )}
          </span>
        </div>
        <Link to={'/listing/' + listing.id}>
          <h3>{listing.title}</h3>
        </Link>
        <Link className="provider" to={'/business/' + listing.business.id}>
          {listing.business.name}
          {listing.business.verified && <ShieldCheck size={13} />}
        </Link>
        <div className="listing-bottom">
          <span>
            <strong>{rupees(listing.price)}</strong>
            <small>
              {' '}
              / {listing.unit}
              {listing.pricing_model === 'quotation' ? ' · estimate' : ''}
            </small>
          </span>
          {listing.kind === 'vegetable' ? (
            <button onClick={add} disabled={listing.stock < listing.minimum} className="add-button">
              {listing.stock < listing.minimum ? 'Sold out' : '+ Add'}
            </button>
          ) : (
            <Link
              className="round-link"
              aria-label={'View ' + listing.title}
              to={'/listing/' + listing.id}
            >
              <ArrowRight size={18} />
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

function Explore() {
  const location = useLocation(),
    navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const [search, setSearch] = useState(params.get('q') || '')
  useEffect(() => setSearch(params.get('q') || ''), [location.search])
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(location.search)
    value ? next.set(key, value) : next.delete(key)
    if (key !== 'page') next.delete('page')
    navigate('/explore?' + next)
  }
  const kind = params.get('kind') || ''
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  })
  const { data, isPending, error } = useQuery({
    queryKey: ['listings', location.search],
    queryFn: () =>
      api<{ items: Listing[]; total: number; page: number; pages: number }>(
        '/listings' + location.search,
      ),
  })
  return (
    <div className="container section">
      <PageTitle
        eyebrow="FIND SOMETHING GOOD, NEARBY"
        title={
          kind === 'service'
            ? 'A local hand for every plan.'
            : kind === 'vegetable'
              ? 'Fresh from your neighbourhood.'
              : kind === 'vehicle'
                ? 'A ride for wherever life takes you.'
                : 'Your neighbourhood, all in one place.'
        }
      />
      <div className="browse-tabs">
        {[
          ['', 'Everything'],
          ['service', 'Local services'],
          ['vegetable', 'Fresh market'],
          ['vehicle', 'Vehicle rentals'],
        ].map(([value, name]) => (
          <button
            className={kind === value ? 'selected' : ''}
            key={name}
            onClick={() => {
              const next = new URLSearchParams()
              if (value) next.set('kind', value)
              navigate('/explore?' + next)
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <form
        className="browse-search"
        onSubmit={(e) => {
          e.preventDefault()
          update('q', search)
        }}
      >
        <Search size={19} />
        <input
          value={search}
          placeholder="Search services, vegetables or vehicles"
          aria-label="Search listings"
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="button">Search</button>
      </form>
      <div className="filters">
        <select
          aria-label="Category"
          value={params.get('category') || ''}
          onChange={(e) => update('category', e.target.value)}
        >
          <option value="">All categories</option>
          {categories
            ?.filter((c) => !kind || c.kind === kind)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Locality"
          value={params.get('locality') || ''}
          onChange={(e) => update('locality', e.target.value)}
        >
          <option value="">All localities</option>
          <option>Mahabubabad</option>
          <option>Station Road</option>
          <option>Bus Stand</option>
        </select>
        <input
          type="number"
          min="0"
          placeholder="Max price (₹)"
          aria-label="Maximum price"
          value={params.get('maximum') || ''}
          onChange={(e) => update('maximum', e.target.value)}
        />
        <select
          aria-label="Minimum rating"
          value={params.get('minimum_rating') || ''}
          onChange={(e) => update('minimum_rating', e.target.value)}
        >
          <option value="">Any rating</option>
          <option value="4">4+ stars</option>
          <option value="3">3+ stars</option>
        </select>
        <select
          aria-label="Sort listings"
          value={params.get('sort') || 'recommended'}
          onChange={(e) => update('sort', e.target.value)}
        >
          <option value="recommended">Recently added</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={params.get('available') === 'true'}
            onChange={(e) => update('available', e.target.checked ? 'true' : '')}
          />
          In stock
        </label>
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <Notice error>{error.message}</Notice>
      ) : (
        <>
          <p className="results-count">
            {data?.total} local possibilities found <span>Mahabubabad, Telangana</span>
          </p>
          {data?.items.length ? (
            <div className="listing-grid">
              {data.items.map((item) => (
                <ListingCard listing={item} key={item.id} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <Search size={40} />
              <h2>No matches just yet.</h2>
              <p>Try another search or clear your filters.</p>
              <Link className="button" to="/explore">
                Explore all listings
              </Link>
            </div>
          )}
          {(data?.pages || 0) > 1 && (
            <div className="pagination">
              <button
                disabled={data?.page === 1}
                onClick={() => update('page', String((data?.page || 1) - 1))}
              >
                Previous
              </button>
              <span>
                Page {data?.page} of {data?.pages}
              </span>
              <button
                disabled={data?.page === data?.pages}
                onClick={() => update('page', String((data?.page || 1) + 1))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ListingPage() {
  const id = useLocation().pathname.split('/').pop()
  const { user, toast, refresh } = useSession()
  const navigate = useNavigate()
  const {
    data: listing,
    isPending,
    error,
  } = useQuery({ queryKey: ['listing', id], queryFn: () => api<Listing>('/listings/' + id) })
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [urgent, setUrgent] = useState(false),
    [address, setAddress] = useState(''),
    [locality, setLocality] = useState('Mahabubabad'),
    [notes, setNotes] = useState(''),
    [quantity, setQuantity] = useState(1)
  const [estimate, setEstimate] = useState<{
    subtotal: string
    deposit: string
    total: string
    units: number
  } | null>(null)
  const [failure, setFailure] = useState(''),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false)
  useEffect(() => {
    setEstimate(null)
  }, [start, end, urgent, address, locality, notes])
  if (isPending) return <Loading />
  if (error || !listing)
    return (
      <div className="container section">
        <Notice error>{error?.message || 'Listing not found'}</Notice>
      </div>
    )
  const book = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return navigate('/signin', { state: { from: '/listing/' + id } })
    setBusy(true)
    setFailure('')
    try {
      if (listing.kind === 'vegetable') {
        await put('/cart', { listing_id: listing.id, quantity })
        toast('Quantity saved in your bag')
        refresh()
        navigate('/cart')
      } else {
        const body = {
          listing_id: listing.id,
          starts_at: toUTC(start),
          ends_at: toUTC(end),
          urgent,
          notes,
          address,
          locality,
        }
        if (!estimate) setEstimate(await post('/bookings/estimate', body))
        else {
          await post('/bookings', body)
          setSubmitted(true)
          toast('Request sent. Your provider will confirm availability.')
          refresh()
        }
      }
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="container section">
      <div className="breadcrumb">
        <Link to="/explore">Explore</Link>
        <ChevronRight size={14} />
        <span>{listing.title}</span>
      </div>
      <div className="detail-grid">
        <div>
          <img
            className="detail-photo"
            src={listing.image || '/placeholder.svg'}
            alt={listing.title}
            onError={(e) => {
              e.currentTarget.src = '/placeholder.svg'
            }}
          />
          <span className="eyebrow">
            {listing.kind.toUpperCase()} · {listing.business.town}
          </span>
          <h1 className="detail-title">{listing.title}</h1>
          <p className="detail-description">{listing.description}</p>
          <div className="provider-box">
            <span className="provider-avatar">{listing.business.name[0]}</span>
            <div>
              <Link to={'/business/' + listing.business.id}>
                <h3>{listing.business.name}</h3>
              </Link>
              <span>
                {listing.business.verified ? 'Verified business' : 'Verification pending'} ·{' '}
                {listing.rating
                  ? `${listing.rating} stars (${listing.review_count} reviews)`
                  : 'New to Velora'}
              </span>
            </div>
          </div>
          <h3>Good to know</h3>
          <div className="details-list">
            <p>
              <MapPin size={18} /> Serves: {listing.business.localities}
            </p>
            <p>
              <Clock3 size={18} /> Availability is confirmed by the provider after your request.
            </p>
            <p>
              <ShoppingBag size={18} /> Direct payment enabled:{' '}
              {listing.business.cash_enabled ? 'Yes' : 'No'}. Online payments are unavailable.
            </p>
          </div>
          {Object.entries(listing.details).length > 0 && (
            <div className="spec-grid">
              {Object.entries(listing.details).map(([key, value]) => (
                <div key={key}>
                  <span>{key.replaceAll('_', ' ')}</span>
                  <b>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</b>
                </div>
              ))}
            </div>
          )}
          {listing.kind === 'vehicle' && (
            <Notice>
              Availability, driving licence requirements, deposits and rental terms depend on the
              operator and applicable law. Confirm these details before pickup.
            </Notice>
          )}
          <h3>Availability windows</h3>
          {listing.availability?.length ? (
            listing.availability.map((slot) => (
              <p key={slot.id}>
                {dateTime(slot.starts_at)} — {dateTime(slot.ends_at)}
              </p>
            ))
          ) : (
            <p className="muted">
              No fixed windows published. Send a request for your preferred time.
            </p>
          )}
          <h3>Community reviews</h3>
          {listing.reviews?.length ? (
            listing.reviews.map((review) => (
              <div className="review" key={review.id}>
                <span className="mini-stars">{'★'.repeat(review.rating)}</span>
                <p>{review.comment}</p>
              </div>
            ))
          ) : (
            <p className="muted">
              Be among the first to share your experience after a completed booking.
            </p>
          )}
          <Link className="text-button" to={'/support?listing=' + id}>
            Report this listing
          </Link>
        </div>
        <aside className="booking-panel">
          <span className="eyebrow">YOUR NEXT GOOD THING</span>
          <h2>
            {rupees(listing.price)} <small>/ {listing.unit}</small>
          </h2>
          <p className="muted">
            {listing.pricing_model === 'quotation'
              ? 'Indicative starting price. Final quotation agreed directly with provider.'
              : 'Clear pricing. Local connection.'}
          </p>
          {submitted ? (
            <div className="empty compact">
              <Check size={36} />
              <h3>Your request is on its way.</h3>
              <p>The provider will confirm availability. Track updates in your activity.</p>
              <Link className="button" to="/activity">
                View my request <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={book}>
              {listing.kind === 'vegetable' ? (
                <>
                  <Field label={`Quantity (${listing.unit}) · ${listing.stock} available`}>
                    <input
                      type="number"
                      min={listing.minimum}
                      max={listing.stock}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      required
                    />
                  </Field>
                  <p>
                    Minimum quantity: {listing.minimum}. Delivery ₹25 or free pickup when supported
                    by the shop.
                  </p>
                </>
              ) : (
                <>
                  {listing.kind === 'service' && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={urgent}
                        onChange={(e) => setUrgent(e.target.checked)}
                      />
                      Request earliest available
                    </label>
                  )}
                  {!urgent && (
                    <Field
                      label={
                        listing.kind === 'vehicle'
                          ? 'Pickup date & time (your local time)'
                          : 'Preferred date & time (your local time)'
                      }
                    >
                      <input
                        type="datetime-local"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        required
                      />
                    </Field>
                  )}
                  {!urgent && (
                    <Field
                      label={
                        listing.kind === 'vehicle'
                          ? 'Return date & time'
                          : 'End time (defaults to one hour)'
                      }
                    >
                      <input
                        type="datetime-local"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                        required={listing.kind === 'vehicle'}
                      />
                    </Field>
                  )}
                  {urgent && (
                    <Notice>
                      Earliest availability is a request. Arrival is confirmed only when the
                      provider supplies an estimate.
                    </Notice>
                  )}
                  <Field
                    label={
                      listing.kind === 'vehicle' ? 'Requested pickup location' : 'Service address'
                    }
                  >
                    <textarea
                      required
                      minLength={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House / street / landmark"
                    />
                  </Field>
                  <Field label="Locality">
                    <select value={locality} onChange={(e) => setLocality(e.target.value)}>
                      {listing.business.localities.split(',').map((x) => (
                        <option key={x} value={x.trim()}>
                          {x.trim()}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tell the provider what you need">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={2000}
                      placeholder="Requirements, preferred arrangements…"
                    />
                  </Field>
                </>
              )}
              {estimate && (
                <div className="estimate">
                  <div>
                    <span>Rental / service ({estimate.units} units)</span>
                    <b>{rupees(estimate.subtotal)}</b>
                  </div>
                  <div>
                    <span>Security deposit</span>
                    <b>{rupees(estimate.deposit)}</b>
                  </div>
                  <div className="total">
                    <span>Estimated total</span>
                    <b>{rupees(estimate.total)}</b>
                  </div>
                  <p>
                    Pay directly to the provider. Payment remains unpaid on Velora. This sends a
                    request, subject to acceptance.
                  </p>
                </div>
              )}
              {failure && <Notice error>{failure}</Notice>}
              <button
                className="button full"
                disabled={busy || (listing.kind === 'vegetable' && listing.stock < listing.minimum)}
              >
                {busy
                  ? 'Working…'
                  : listing.kind === 'vegetable'
                    ? 'Save quantity & view bag'
                    : estimate
                      ? 'Confirm & send request'
                      : 'Get an estimate'}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          <div className="panel-footnote">
            <ShieldCheck size={17} />
            <span>
              Cancel pending requests from My activity.
              <br />
              Accepted bookings require provider assistance.
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}

function AuthPage({ register = false }: { register?: boolean }) {
  const { user, refresh } = useSession(),
    navigate = useNavigate(),
    location = useLocation()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const form = new FormData(e.currentTarget)
    try {
      const result = await post('/auth/' + (register ? 'register' : 'login'), {
        email: form.get('email'),
        password: form.get('password'),
        ...(register
          ? { name: form.get('name'), roles: ['customer', ...form.getAll('roles')] }
          : {}),
      })
      sessionStorage.setItem('velora-token', result.token)
      refresh()
      navigate(location.state?.from || '/account')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (user) return <Navigate to="/account" replace />
  return (
    <div className="auth-layout container">
      <div className="auth-story">
        <span className="eyebrow">GOOD TO HAVE YOU HERE</span>
        <h1>
          Your neighbourhood.
          <br />
          <em>A little closer.</em>
        </h1>
        <p>
          One account for everything local. Find a trusted hand, fill your kitchen or plan your next
          journey.
        </p>
        <Flower2 size={110} strokeWidth={0.8} />
      </div>
      <div className="auth-card">
        <h2>{register ? 'Make yourself at home.' : 'Welcome back.'}</h2>
        <p>
          {register
            ? 'Join your local community on Velora.'
            : 'Sign in to your little world of local.'}
        </p>
        <form onSubmit={submit}>
          {register && (
            <Field label="Your name">
              <input name="name" autoComplete="name" minLength={2} maxLength={100} required />
            </Field>
          )}
          <Field label="Email address">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label={register ? 'Password (at least 10 characters)' : 'Password'}>
            <input
              name="password"
              type="password"
              minLength={register ? 10 : 1}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
              required
            />
          </Field>
          {register && (
            <fieldset>
              <legend>Also want to grow a business? (optional)</legend>
              {[
                ['provider', 'Offer local services'],
                ['seller', 'Sell fresh produce'],
                ['operator', 'Rent out vehicles'],
              ].map(([value, label]) => (
                <label className="checkbox" key={value}>
                  <input type="checkbox" name="roles" value={value} />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {error && <Notice error>{error}</Notice>}
          <button className="button full" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? 'Already part of the neighbourhood?' : 'New around here?'}{' '}
          <Link to={register ? '/signin' : '/register'}>
            {register ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
        {register && (
          <small>
            By registering, you agree to our <Link to="/terms">terms</Link> and{' '}
            <Link to="/privacy">privacy policy</Link>.
          </small>
        )}
      </div>
    </div>
  )
}

function PublicBusiness() {
  const id = useLocation().pathname.split('/').pop()
  const { data, isPending, error } = useQuery({
    queryKey: ['public-business', id],
    queryFn: () => api('/businesses/' + id),
  })
  if (isPending) return <Loading />
  if (error) return <Notice error>{error.message}</Notice>
  return (
    <div className="container section">
      <PageTitle
        title={data.name}
        eyebrow={
          data.verified ? 'VERIFIED LOCAL BUSINESS' : 'LOCAL BUSINESS · VERIFICATION PENDING'
        }
      />
      <p>{data.description}</p>
      <p className="muted">
        Serving {data.localities} · {data.town}
      </p>
      <div className="listing-grid">
        {data.listings.map((listing: Listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  )
}

function SavedPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['favourites'],
    queryFn: () => api<Listing[]>('/favourites'),
  })
  return (
    <div className="container section">
      <PageTitle title="Your local favourites." />
      {isPending ? (
        <Loading />
      ) : error ? (
        <Notice error>{error.message}</Notice>
      ) : data?.length ? (
        <div className="listing-grid">
          {data.map((x) => (
            <ListingCard key={x.id} listing={x} />
          ))}
        </div>
      ) : (
        <Notice>Save something you love by tapping the heart on a listing.</Notice>
      )}
    </div>
  )
}

function NotificationsPage() {
  const { refresh, toast } = useSession()
  const { data, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api<{ id: number; message: string; read: boolean; created_at: string }[]>('/notifications'),
  })
  return (
    <div className="container section narrow">
      <PageTitle title="Your neighbourhood updates." />
      <button
        className="button secondary"
        onClick={async () => {
          try {
            await post('/notifications/read')
            refresh()
          } catch (e) {
            toast((e as Error).message)
          }
        }}
      >
        Mark all as read
      </button>
      {isPending ? (
        <Loading />
      ) : error ? (
        <Notice error>{error.message}</Notice>
      ) : data?.length ? (
        data.map((x) => (
          <div className={'notification ' + (!x.read ? 'unread' : '')} key={x.id}>
            <Bell size={20} />
            <div>
              <b>{x.message}</b>
              <small>{dateTime(x.created_at)}</small>
            </div>
          </div>
        ))
      ) : (
        <Notice>No updates yet. Booking and order updates will appear here.</Notice>
      )}
    </div>
  )
}

function InfoPage({ kind }: { kind: string }) {
  const { user, toast } = useSession()
  const [error, setError] = useState('')
  const listing = new URLSearchParams(useLocation().search).get('listing')
  const content: Record<string, [string, string[]]> = {
    about: [
      'Rooted here. Growing together.',
      [
        'Velora brings local services, fresh produce and vehicle rentals into one simple place for Mahabubabad, Telangana. Our aim is to help neighbours find one another and give small businesses a practical way to grow.',
        'This is a local development MVP. Sample catalogue businesses are illustrative, have not been independently verified and cannot fulfill real requests. Create your own customer and business accounts to test complete workflows.',
        'A verified badge means an administrator reviewed a business profile. It is not a guarantee of work quality, safety, insurance or regulatory compliance.',
      ],
    ],
    terms: [
      'A few things to know.',
      [
        'Development terms — not a final legal agreement. Velora connects customers with independent local businesses. Requests require provider acceptance. No arrival time or availability is guaranteed until confirmed by the provider.',
        'Customers can cancel pending requests. For accepted requests, contact the provider for assistance; providers may cancel before fulfillment starts. There are no automatic refunds because this version does not collect payments.',
        'Prices are in INR. Quotation-based service amounts are estimates. Rentals may have deposits, kilometre limits, fuel costs, licence conditions, tolls or other operator terms. Review them before booking.',
        'Only pay directly when the business explicitly enables that option. Online payments, digital refunds and platform payouts are not configured. Never enter card details, UPI PINs or banking passwords into Velora.',
        'Production launch requires a professionally reviewed legal agreement, privacy notices, grievance handling and applicable business compliance.',
      ],
    ],
    privacy: [
      'Your information, handled with care.',
      [
        'Development privacy notice. We store your account email, name, password hash, saved addresses, requests, orders and in-app activity in the configured database. Passwords are hashed with Argon2. Session tokens are stored as hashes on the server and expire.',
        'Business owners can see the details needed to fulfill requests sent to them. Customers see business contact details after acceptance. Administrators can review marketplace activity for moderation.',
        'This version does not collect identity documents, driving licences, card numbers or banking passwords. Photos uploaded to listings are public. Do not upload private documents.',
        'External listing images are loaded from Unsplash, which receives a browser request when those images load. Email, SMS, WhatsApp and online payment providers are not connected.',
        'Account export, deletion, retention automation and production privacy contacts must be implemented before public launch. For development data removal, contact your local administrator.',
      ],
    ],
    support: [
      'Let’s get it sorted.',
      [
        'For a booking or order, check My activity for the latest status. Provider contact information becomes available after acceptance.',
        'Use the form below to submit a support report to the marketplace administrator. Reports are stored in Velora; no email, SMS or WhatsApp message is sent. This is not an emergency service.',
      ],
    ],
  }
  const [title, paragraphs] = content[kind]
  return (
    <div className="container section prose">
      <PageTitle title={title} />
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
      {kind === 'support' &&
        (user ? (
          <form
            className="surface"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              setError('')
              try {
                await post('/reports', {
                  listing_id: listing ? Number(listing) : null,
                  message: new FormData(form).get('message'),
                })
                toast('Your support report was submitted')
                form.reset()
              } catch (error) {
                setError((error as Error).message)
              }
            }}
          >
            <Field label={listing ? 'Report for listing #' + listing : 'How can we help?'}>
              <textarea name="message" required minLength={10} maxLength={3000} rows={5} />
            </Field>
            {error && <Notice error>{error}</Notice>}
            <button className="button">
              Submit report <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <Link to="/signin" className="button">
            Sign in to submit a report
          </Link>
        ))}
    </div>
  )
}
