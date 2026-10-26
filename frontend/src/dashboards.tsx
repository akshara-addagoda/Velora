import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Bell,
  Check,
  Heart,
  LayoutDashboard,
  MapPin,
  Package,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  UserRound,
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
  type Transaction,
} from './api'
import { Field, Loading, Notice, PageTitle, useSession } from './App'

const titleCase = (s: string) => s.replaceAll('_', ' ')
export function AccountPage() {
  const { user, toast, refresh } = useSession()
  const {
    data: addresses,
    isPending,
    error,
  } = useQuery({ queryKey: ['addresses'], queryFn: () => api<any[]>('/addresses') })
  const [failure, setFailure] = useState('')
  const saveAddress = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    setFailure('')
    try {
      await post('/addresses', Object.fromEntries(new FormData(form)))
      toast('Address saved')
      form.reset()
      refresh()
    } catch (error) {
      setFailure((error as Error).message)
    }
  }
  const links = [
    {
      to: '/activity',
      icon: Package,
      title: 'My activity',
      text: 'Bookings, fresh orders & rentals',
    },
    {
      to: '/favourites',
      icon: Heart,
      title: 'Saved favourites',
      text: 'Good things to come back to',
    },
    {
      to: '/notifications',
      icon: Bell,
      title: 'Notifications',
      text: 'Updates from your neighbourhood',
    },
    { to: '/cart', icon: ShoppingBag, title: 'Shopping bag', text: 'Fresh picks for your kitchen' },
  ]
  return (
    <div className="container section">
      <PageTitle eyebrow="MAKE YOURSELF AT HOME" title={`Hello, ${user?.name.split(' ')[0]}.`} />
      <div className="account-links">
        {links.map(({ icon: Icon, ...link }) => (
          <Link to={link.to} key={link.to} className="account-tile">
            <Icon size={25} />
            <h3>{link.title}</h3>
            <p>{link.text}</p>
            <ArrowRight size={18} />
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="surface">
          <h2>Your profile</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await api('/me', {
                  method: 'PATCH',
                  body: JSON.stringify({ name: new FormData(e.currentTarget).get('name') }),
                })
                toast('Profile updated')
                refresh()
              } catch (e) {
                toast((e as Error).message)
              }
            }}
          >
            <Field label="Your name">
              <input name="name" defaultValue={user?.name} required minLength={2} />
            </Field>
            <Field label="Email">
              <input value={user?.email || ''} readOnly />
            </Field>
            <p className="muted">Account roles: {user?.roles.join(', ')}</p>
            <button className="button secondary">Save profile</button>
          </form>
          <hr />
          {user?.roles.some((r) => ['provider', 'seller', 'operator'].includes(r)) && (
            <Link className="button" to="/business">
              <Store size={17} />
              Open business dashboard
            </Link>
          )}
          {user?.roles.includes('admin') && (
            <Link className="button secondary" to="/admin">
              <LayoutDashboard size={17} />
              Administration
            </Link>
          )}
          <h3>Grow a business with this account</h3>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              try {
                await api('/me/business-roles', {
                  method: 'PATCH',
                  body: JSON.stringify({
                    roles: new FormData(event.currentTarget).getAll('roles'),
                  }),
                })
                toast('Business roles added to your account')
                refresh()
              } catch (error) {
                toast((error as Error).message)
              }
            }}
          >
            {(
              [
                ['provider', 'Offer local services'],
                ['seller', 'Sell fresh produce'],
                ['operator', 'Rent out vehicles'],
              ] as const
            ).map(([role, label]) => (
              <label className="checkbox" key={role}>
                <input
                  name="roles"
                  type="checkbox"
                  value={role}
                  defaultChecked={user?.roles.includes(role)}
                  disabled={user?.roles.includes(role)}
                />
                {label}
                {user?.roles.includes(role) ? ' · enabled' : ''}
              </label>
            ))}
            <button className="button secondary">Enable selected business roles</button>
          </form>
        </section>
        <section className="surface">
          <h2>Your saved addresses</h2>
          {isPending ? (
            <Loading />
          ) : error ? (
            <Notice error>{error.message}</Notice>
          ) : addresses?.length ? (
            addresses.map((address) => (
              <div className="address-card" key={address.id}>
                <MapPin size={18} />
                <div>
                  <b>{address.label}</b>
                  <p>
                    {address.address}, {address.locality}
                    <br />
                    {address.town} {address.pin}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label={'Delete ' + address.label}
                  onClick={async () => {
                    if (confirm('Delete this saved address?')) {
                      try {
                        await api('/addresses/' + address.id, { method: 'DELETE' })
                        refresh()
                      } catch (e) {
                        toast((e as Error).message)
                      }
                    }
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <p className="muted">Add an address to make your next checkout easier.</p>
          )}
          <h3>Add an address</h3>
          <form onSubmit={saveAddress}>
            <Field label="Label">
              <input name="label" placeholder="Home, work…" required />
            </Field>
            <Field label="Street address & landmark">
              <textarea name="address" required minLength={5} />
            </Field>
            <div className="form-row">
              <Field label="Locality">
                <input name="locality" defaultValue="Mahabubabad" required />
              </Field>
              <Field label="Town">
                <input name="town" defaultValue="Mahabubabad" required />
              </Field>
            </div>
            <Field label="PIN code (optional)">
              <input name="pin" pattern="[0-9]{6}" maxLength={6} />
            </Field>
            {failure && <Notice error>{failure}</Notice>}
            <button className="button secondary">
              <Plus size={16} />
              Save address
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

export function CartPage() {
  const { toast, refresh } = useSession(),
    navigate = useNavigate()
  const {
    data: cart,
    isPending,
    error,
  } = useQuery({ queryKey: ['cart'], queryFn: () => api<CartItem[]>('/cart') })
  const { data: addresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api<any[]>('/addresses'),
  })
  const [address, setAddress] = useState(''),
    [locality, setLocality] = useState('Mahabubabad'),
    [fulfillment, setFulfillment] = useState('delivery'),
    [failure, setFailure] = useState(''),
    [busy, setBusy] = useState(false)
  const updateQuantity = async (id: number, quantity: number) => {
    try {
      await put('/cart', { listing_id: id, quantity })
      refresh()
    } catch (e) {
      setFailure((e as Error).message)
    }
  }
  const checkout = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setFailure('')
    try {
      await post('/checkout', {
        address,
        locality,
        fulfillment,
        notes: new FormData(e.currentTarget).get('notes'),
      })
      toast('Order placed. Your seller will confirm it shortly.')
      refresh()
      navigate('/activity')
    } catch (e) {
      setFailure((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const subtotal =
    cart?.reduce((sum, item) => sum + Number(item.listing.price) * item.quantity, 0) || 0
  const business = cart?.[0]?.listing.business
  return (
    <div className="container section">
      <PageTitle title="A bag full of local goodness." />
      {isPending ? (
        <Loading />
      ) : error ? (
        <Notice error>{error.message}</Notice>
      ) : !cart?.length ? (
        <div className="empty">
          <ShoppingBag size={45} />
          <h2>Your bag is waiting for something fresh.</h2>
          <Link className="button" to="/explore?kind=vegetable">
            Explore the fresh market
          </Link>
        </div>
      ) : (
        <div className="detail-grid">
          <section>
            <h2>{business?.name}</h2>
            <p className="muted">
              One shop per order. Stock and prices are checked again at checkout.
            </p>
            {cart.map(({ listing, quantity }) => (
              <div className="cart-row" key={listing.id}>
                <img src={listing.image || '/placeholder.svg'} alt={listing.title} />
                <div>
                  <Link to={'/listing/' + listing.id}>
                    <h3>{listing.title}</h3>
                  </Link>
                  <span>
                    {rupees(listing.price)} / {listing.unit} · {listing.stock} available
                  </span>
                </div>
                <input
                  aria-label={'Quantity of ' + listing.title}
                  type="number"
                  min={listing.minimum}
                  max={listing.stock}
                  value={quantity}
                  onChange={(e) => updateQuantity(listing.id, Number(e.target.value))}
                />
                <b>{rupees(Number(listing.price) * quantity)}</b>
                <button
                  aria-label={'Remove ' + listing.title}
                  className="icon-button"
                  onClick={() => updateQuantity(listing.id, 0)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
            <Link className="inline-link" to="/explore?kind=vegetable">
              Keep shopping <ArrowRight size={16} />
            </Link>
          </section>
          <aside className="booking-panel">
            <h2>The last little details.</h2>
            <form onSubmit={checkout}>
              {!!addresses?.length && (
                <Field label="Use a saved address">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const selected = addresses.find((a) => a.id === Number(e.target.value))
                      if (selected) {
                        setAddress(selected.address)
                        setLocality(selected.locality)
                      }
                    }}
                  >
                    <option value="">Choose an address</option>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {a.address}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Delivery or pickup">
                <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value)}>
                  <option value="delivery" disabled={!business?.delivery}>
                    Delivery · ₹25
                  </option>
                  <option value="pickup" disabled={!business?.pickup}>
                    Pickup · Free
                  </option>
                </select>
              </Field>
              <Field
                label={
                  fulfillment === 'delivery' ? 'Delivery address' : 'Pickup arrangement / reference'
                }
              >
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  minLength={5}
                />
              </Field>
              <Field label="Locality">
                <input value={locality} onChange={(e) => setLocality(e.target.value)} required />
              </Field>
              <p className="small">Seller coverage: {business?.localities}</p>
              <Field label="Instructions (optional)">
                <textarea name="notes" maxLength={2000} />
              </Field>
              <div className="estimate">
                <div>
                  <span>Subtotal</span>
                  <b>{rupees(subtotal)}</b>
                </div>
                <div>
                  <span>Delivery</span>
                  <b>{rupees(fulfillment === 'delivery' ? 25 : 0)}</b>
                </div>
                <div className="total">
                  <span>Estimated total</span>
                  <b>{rupees(subtotal + (fulfillment === 'delivery' ? 25 : 0))}</b>
                </div>
              </div>
              <Notice>
                Pay directly on {fulfillment}. This shop must enable cash/direct payment. No online
                payment is collected.
              </Notice>
              {failure && <Notice error>{failure}</Notice>}
              <button className="button full" disabled={busy || !business?.cash_enabled}>
                {busy ? 'Placing order…' : 'Place order request'}
                <ArrowRight size={17} />
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}

const transitions: Record<string, Record<string, string[]>> = {
  service: {
    requested: ['accepted', 'rejected'],
    accepted: ['in_progress', 'cancelled'],
    in_progress: ['completed'],
  },
  vegetable: {
    requested: ['accepted', 'rejected'],
    accepted: ['preparing', 'cancelled'],
    preparing: ['ready', 'out_for_delivery'],
    ready: ['delivered'],
    out_for_delivery: ['delivered'],
  },
  vehicle: {
    requested: ['accepted', 'rejected'],
    accepted: ['active', 'cancelled'],
    active: ['returned'],
  },
}

export function TransactionsPage({
  business = false,
  embedded = false,
}: {
  business?: boolean
  embedded?: boolean
}) {
  const { data, isPending, error } = useQuery({
    queryKey: ['transactions', business],
    queryFn: () => api<Transaction[]>('/transactions' + (business ? '?business=true' : '')),
  })
  const [kind, setKind] = useState('')
  const content = (
    <>
      <div className="browse-tabs">
        {[
          ['', 'All activity'],
          ['service', 'Services'],
          ['vegetable', 'Fresh orders'],
          ['vehicle', 'Rentals'],
        ].map(([value, label]) => (
          <button
            className={value === kind ? 'selected' : ''}
            key={value}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <Notice error>{error.message}</Notice>
      ) : !data?.filter((t) => !kind || t.kind === kind).length ? (
        <div className="empty">
          <Package size={40} />
          <h2>A fresh page, full of possibilities.</h2>
          <p>
            {business
              ? 'New customer requests will appear here.'
              : 'Your bookings, orders and rentals will appear here.'}
          </p>
          <Link className="button secondary" to="/explore">
            Explore nearby
          </Link>
        </div>
      ) : (
        data
          .filter((t) => !kind || t.kind === kind)
          .map((transaction) => (
            <TransactionCard key={transaction.id} transaction={transaction} business={business} />
          ))
      )}
    </>
  )
  return embedded ? (
    content
  ) : (
    <div className="container section">
      <PageTitle title="Everything you’ve got going on." eyebrow="YOUR ACTIVITY" />
      {content}
    </div>
  )
}

function TransactionCard({
  transaction: t,
  business,
}: {
  transaction: Transaction
  business: boolean
}) {
  const { toast, refresh } = useSession()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [eta, setEta] = useState(''),
    [scheduled, setScheduled] = useState(''),
    [expanded, setExpanded] = useState(false)
  const change = async (status: string) => {
    if (['cancelled', 'rejected'].includes(status) && !confirm(`Mark this request as ${status}?`))
      return
    setBusy(true)
    setError('')
    try {
      await api('/transactions/' + t.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status, eta, starts_at: toUTC(scheduled) }),
      })
      toast('Request updated')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const review = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    try {
      await post('/reviews', {
        transaction_id: t.id,
        rating: Number(form.get('rating')),
        comment: form.get('comment'),
      })
      toast('Thank you for sharing your experience')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const reorder = async () => {
    setBusy(true)
    try {
      for (const item of t.items)
        await put('/cart', { listing_id: item.listing_id, quantity: item.quantity })
      refresh()
      toast('Available items added to your bag. Review before checkout.')
    } catch (e) {
      setError('Some items could not be added: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="transaction-card">
      <div className="transaction-heading">
        <span className="eyebrow">
          {t.kind} · #{t.id}
        </span>
        <span className={'status status-' + t.status}>{titleCase(t.status)}</span>
      </div>
      <div className="transaction-summary">
        <div>
          <h3>{t.title}</h3>
          <p>
            {t.business.name} · {dateTime(t.starts_at)}
          </p>
        </div>
        <strong>{rupees(t.total)}</strong>
      </div>
      <button className="text-button" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide details' : 'View details & actions'}
      </button>
      {expanded && (
        <>
          <div className="transaction-details">
            <p>
              <b>Location:</b> {t.address}, {t.locality}
            </p>
            <p>
              <b>Notes:</b> {t.notes || 'None'}
            </p>
            {t.ends_at && (
              <p>
                <b>Until:</b> {dateTime(t.ends_at)}
              </p>
            )}
            {t.eta && (
              <p>
                <b>Provider arrival estimate:</b> {t.eta}
              </p>
            )}
            {t.contact && (
              <p>
                <b>Provider contact:</b> {t.contact}
              </p>
            )}
            {['accepted', 'in_progress', 'active'].includes(t.status) && !t.contact && (
              <p className="muted">
                No contact details supplied by this provider. Use support if you need assistance.
              </p>
            )}
            {t.items.map((item) => (
              <p key={item.listing_id}>
                {item.title} × {item.quantity} — {rupees(Number(item.price) * item.quantity)}
              </p>
            ))}
            <p>
              Subtotal {rupees(t.subtotal)} · Delivery {rupees(t.delivery_fee)} · Deposit{' '}
              {rupees(t.deposit)}
            </p>
            <p>
              <b>Payment:</b> {t.payment_status} · Pay directly to provider. Online payment is not
              configured.
            </p>
            {business && (
              <p>
                Platform commission: {rupees(t.commission)} · Provider amount:{' '}
                {rupees(t.provider_earnings)} (accounting estimate; payouts are not configured)
              </p>
            )}
          </div>
          {error && <Notice error>{error}</Notice>}
          {business && t.status === 'requested' && t.kind !== 'vegetable' && (
            <>
              <Field label="Provider arrival estimate / confirmation note">
                <input value={eta} onChange={(e) => setEta(e.target.value)} maxLength={100} />
              </Field>
              {!t.starts_at && (
                <Field label="Confirm earliest available start time (required to accept)">
                  <input
                    type="datetime-local"
                    value={scheduled}
                    onChange={(e) => setScheduled(e.target.value)}
                  />
                </Field>
              )}
            </>
          )}
          <div className="action-row">
            {business
              ? transitions[t.kind]?.[t.status]
                  ?.filter(
                    (status) =>
                      !['ready', 'out_for_delivery'].includes(status) ||
                      status === (t.fulfillment === 'pickup' ? 'ready' : 'out_for_delivery'),
                  )
                  .map((status) => (
                    <button
                      disabled={busy}
                      className={
                        ['cancelled', 'rejected'].includes(status)
                          ? 'button danger'
                          : 'button secondary'
                      }
                      key={status}
                      onClick={() => change(status)}
                    >
                      {titleCase(status)}
                    </button>
                  ))
              : t.status === 'requested' && (
                  <button
                    disabled={busy}
                    className="button danger"
                    onClick={() => change('cancelled')}
                  >
                    Cancel request
                  </button>
                )}
            {!business && t.kind === 'vegetable' && (
              <button disabled={busy} className="button secondary" onClick={reorder}>
                Reorder to bag
              </button>
            )}
          </div>
          {!business &&
            !t.reviewed &&
            ['completed', 'delivered', 'returned'].includes(t.status) && (
              <form className="review-form" onSubmit={review}>
                <h3>How was your experience?</h3>
                <Field label="Rating">
                  <select name="rating">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} stars
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Your review">
                  <textarea name="comment" minLength={3} maxLength={2000} required />
                </Field>
                <button className="button secondary">Share review</button>
              </form>
            )}
        </>
      )}
    </article>
  )
}

export function BusinessPage() {
  const { user, toast, refresh } = useSession()
  const [tab, setTab] = useState('overview'),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<Listing | null>(null),
    [showEditor, setShowEditor] = useState(false)
  const {
    data: business,
    isPending,
    error: loadError,
  } = useQuery({ queryKey: ['business'], queryFn: () => api('/business') })
  const { data: listings } = useQuery({
    queryKey: ['business-listings'],
    queryFn: () => api<Listing[]>('/business/listings'),
    enabled: !!business,
  })
  const { data: transactions } = useQuery({
    queryKey: ['transactions', true],
    queryFn: () => api<Transaction[]>('/transactions?business=true'),
    enabled: !!business,
  })
  if (!user?.roles.some((r) => ['provider', 'seller', 'operator'].includes(r)))
    return (
      <div className="container section">
        <Notice error>
          A business role is required. Enable one from your account profile, then return here.
          <Link className="button secondary" to="/account">
            Open my account
          </Link>
        </Notice>
      </div>
    )
  if (isPending) return <Loading />
  if (loadError) return <Notice error>{loadError.message}</Notice>
  const saveBusiness = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    try {
      await put('/business', {
        ...Object.fromEntries(form),
        cash_enabled: form.get('cash_enabled') === 'on',
        delivery: form.get('delivery') === 'on',
        pickup: form.get('pickup') === 'on',
      })
      toast('Business profile saved. Verification requested.')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const done =
    transactions?.filter((t) => ['completed', 'delivered', 'returned'].includes(t.status)) || []
  return (
    <div className="container section">
      <PageTitle
        eyebrow="YOUR LOCAL BUSINESS"
        title={business?.name || 'Let’s introduce your business.'}
      >
        {business && (
          <span className="pill">
            {business.verified ? 'Verified business' : 'Verification pending'}
          </span>
        )}
      </PageTitle>
      <div className="browse-tabs">
        {['overview', 'requests', 'listings', 'profile'].map((t) => (
          <button className={tab === t ? 'selected' : ''} key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {!business || tab === 'profile' ? (
        <section className="surface narrow">
          <h2>Business profile</h2>
          <p className="muted">
            Changing profile details requests a new administrator verification.
          </p>
          <form onSubmit={saveBusiness}>
            {[
              ['name', 'Business name'],
              ['description', 'About your business'],
              ['town', 'Town'],
              ['localities', 'Service localities (comma-separated)'],
              ['contact', 'Contact phone / email (shared after acceptance)'],
            ].map(([name, label]) => (
              <Field label={label} key={name}>
                <input
                  name={name}
                  defaultValue={
                    business?.[name] ||
                    (name === 'town' || name === 'localities' ? 'Mahabubabad' : '')
                  }
                  required={['name', 'town', 'localities'].includes(name)}
                  maxLength={name === 'description' ? 3000 : 1000}
                />
              </Field>
            ))}
            <label className="checkbox">
              <input
                name="cash_enabled"
                type="checkbox"
                defaultChecked={business?.cash_enabled ?? true}
              />
              Accept cash / direct payment to business
            </label>
            <label className="checkbox">
              <input name="delivery" type="checkbox" defaultChecked={business?.delivery ?? true} />
              Offer produce delivery (₹25 flat fee)
            </label>
            <label className="checkbox">
              <input name="pickup" type="checkbox" defaultChecked={business?.pickup ?? true} />
              Offer produce pickup
            </label>
            {error && <Notice error>{error}</Notice>}
            <button className="button">
              Save business profile <Check size={17} />
            </button>
          </form>
        </section>
      ) : (
        <>
          {tab === 'overview' && (
            <>
              <div className="metric-grid">
                {[
                  ['Local listings', listings?.length || 0],
                  [
                    'Pending requests',
                    transactions?.filter((t) => t.status === 'requested').length || 0,
                  ],
                  ['Completed transactions', done.length],
                  [
                    'Provider earnings estimate',
                    rupees(done.reduce((sum, t) => sum + Number(t.provider_earnings), 0)),
                  ],
                ].map(([label, value]) => (
                  <div className="metric" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <Notice>
                Revenue and commission figures are accounting estimates. Velora does not collect
                payments or settle payouts. Service availability is managed from each listing’s edit
                form.
              </Notice>
              <h2>Recent requests</h2>
              {transactions?.slice(0, 3).map((t) => (
                <TransactionCard key={t.id} transaction={t} business />
              ))}
              {!transactions?.length && (
                <p className="muted">Your first customer request will appear here.</p>
              )}
            </>
          )}
          {tab === 'requests' && <TransactionsPage business embedded />}
          {tab === 'listings' && (
            <>
              <div className="section-heading">
                <h2>Your offerings</h2>
                <button
                  className="button"
                  onClick={() => {
                    setEditing(null)
                    setShowEditor(true)
                  }}
                >
                  <Plus size={17} />
                  New listing
                </button>
              </div>
              {showEditor && (
                <ListingEditor
                  listing={editing}
                  onClose={() => {
                    setShowEditor(false)
                    setEditing(null)
                  }}
                />
              )}
              <div className="manage-listings">
                {listings?.map((listing) => (
                  <div className="manage-row" key={listing.id}>
                    <img src={listing.image || '/placeholder.svg'} alt="" />
                    <div>
                      <h3>{listing.title}</h3>
                      <span>
                        {listing.kind} · {rupees(listing.price)} / {listing.unit}{' '}
                        {listing.kind === 'vegetable' ? `· stock ${listing.stock}` : ''} ·{' '}
                        {listing.active ? 'Active' : 'Hidden'}
                      </span>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setEditing(listing)
                        setShowEditor(true)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      Edit & availability
                    </button>
                  </div>
                ))}
              </div>
              {!listings?.length && (
                <Notice>
                  Add your first service, product or vehicle to start receiving requests.
                </Notice>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function ListingEditor({ listing, onClose }: { listing: Listing | null; onClose: () => void }) {
  const { user, toast, refresh } = useSession()
  const kinds = [
    ['service', 'provider'],
    ['vegetable', 'seller'],
    ['vehicle', 'operator'],
  ].filter(([, role]) => user?.roles.includes(role))
  const [kind, setKind] = useState(listing?.kind || kinds[0][0]),
    [image, setImage] = useState(listing?.image || ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  })
  const { data: detail } = useQuery({
    queryKey: ['listing', listing?.id],
    queryFn: () => api<Listing>('/listings/' + listing!.id),
    enabled: !!listing?.active,
  })
  useEffect(() => {
    setKind(listing?.kind || kinds[0][0])
    setImage(listing?.image || '')
  }, [listing?.id])
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const form = new FormData(e.currentTarget)
    try {
      const details: Record<string, any> = {}
      if (kind === 'vehicle')
        for (const field of [
          'make',
          'model',
          'year',
          'capacity',
          'transmission',
          'fuel',
          'driver',
          'deposit',
          'included_km',
          'extra_km_price',
          'pickup',
          'terms',
        ])
          details[field] =
            form.get(field) ||
            (['year', 'capacity', 'deposit', 'included_km', 'extra_km_price'].includes(field)
              ? '0'
              : '')
      details.ac = form.get('ac') === 'on'
      const body = {
        kind,
        category_id: Number(form.get('category_id')),
        title: form.get('title'),
        description: form.get('description'),
        price: String(form.get('price')),
        unit: form.get('unit'),
        pricing_model: form.get('pricing_model'),
        stock: Number(form.get('stock') || 0),
        minimum: Number(form.get('minimum') || 1),
        active: form.get('active') === 'on',
        image,
        details,
      }
      if (listing) await put('/business/listings/' + listing.id, body)
      else await post('/business/listings', body)
      toast('Listing saved')
      refresh()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="surface editor" key={listing?.id || 'new'}>
      <div className="section-heading">
        <h2>{listing ? 'Edit your listing' : 'Something new for the neighbourhood'}</h2>
        <button className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <form onSubmit={save}>
        <div className="form-row">
          <Field label="Listing type">
            <select value={kind} disabled={!!listing} onChange={(e) => setKind(e.target.value)}>
              {kinds.map(([kind]) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select name="category_id" defaultValue={listing?.category_id} required key={kind}>
              {categories
                ?.filter((c) => c.kind === kind)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Listing title">
          <input
            name="title"
            defaultValue={listing?.title}
            minLength={3}
            maxLength={150}
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            defaultValue={listing?.description}
            minLength={10}
            maxLength={5000}
            required
            rows={3}
          />
        </Field>
        <Field label="Image URL (HTTPS)">
          <input value={image} onChange={(e) => setImage(e.target.value)} />
        </Field>
        <Field label="Or upload PNG, JPEG or WebP (up to 5 MB)">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              if (!e.target.files?.[0]) return
              const data = new FormData()
              data.set('file', e.target.files[0])
              setBusy(true)
              try {
                const result = await api('/uploads', { method: 'POST', body: data })
                setImage(result.url)
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          />
        </Field>
        <div className="form-row">
          <Field label="Price (₹)">
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              max="10000000"
              defaultValue={listing?.price || ''}
              required
            />
          </Field>
          <Field label="Unit">
            <select
              name="unit"
              defaultValue={
                listing?.unit ||
                (kind === 'vehicle' ? 'day' : kind === 'vegetable' ? 'kg' : 'visit')
              }
              key={kind}
            >
              {(kind === 'vehicle'
                ? ['day', 'hour']
                : kind === 'vegetable'
                  ? ['kg', '500 g', '250 g', 'bunch', 'piece']
                  : ['visit', 'hour']
              ).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Pricing model">
            <select name="pricing_model" defaultValue={listing?.pricing_model || 'fixed'}>
              <option value="fixed">Fixed</option>
              {kind === 'service' && (
                <>
                  <option value="hourly">Hourly</option>
                  <option value="quotation">Quotation required</option>
                </>
              )}
            </select>
          </Field>
        </div>
        <div className="form-row">
          {kind === 'vegetable' && (
            <Field label="Available stock (units)">
              <input
                name="stock"
                type="number"
                min="0"
                max="1000000"
                defaultValue={listing?.stock || 0}
                required
              />
            </Field>
          )}
          <Field label={kind === 'vegetable' ? 'Minimum order units' : 'Minimum duration units'}>
            <input
              name="minimum"
              type="number"
              min="1"
              max="10000"
              defaultValue={listing?.minimum || 1}
              required
            />
          </Field>
        </div>
        {kind === 'vehicle' && (
          <>
            <h3>Vehicle & rental details</h3>
            <div className="form-row">
              {[
                'make',
                'model',
                'year',
                'capacity',
                'transmission',
                'fuel',
                'driver',
                'deposit',
                'included_km',
                'extra_km_price',
                'pickup',
              ].map((field) => (
                <Field key={field} label={titleCase(field)}>
                  <input
                    name={field}
                    defaultValue={String(
                      listing?.details[field] ||
                        (['deposit', 'included_km', 'extra_km_price'].includes(field) ? '0' : ''),
                    )}
                    required={['make', 'model', 'year', 'capacity', 'pickup'].includes(field)}
                    type={
                      ['year', 'capacity', 'deposit', 'included_km', 'extra_km_price'].includes(
                        field,
                      )
                        ? 'number'
                        : 'text'
                    }
                    min="0"
                    step={['deposit', 'extra_km_price'].includes(field) ? '0.01' : '1'}
                  />
                </Field>
              ))}
            </div>
            <label className="checkbox">
              <input type="checkbox" name="ac" defaultChecked={Boolean(listing?.details.ac)} />
              Air conditioning
            </label>
            <Field label="Rental terms & cancellation policy">
              <textarea name="terms" defaultValue={String(listing?.details.terms || '')} required />
            </Field>
            <Notice>
              Registration documents and driving licences are not collected in this MVP. Do not put
              private registration numbers or identity documents into public listing fields.
            </Notice>
          </>
        )}
        <label className="checkbox">
          <input name="active" type="checkbox" defaultChecked={listing?.active ?? true} />
          Visible in marketplace
        </label>
        {error && <Notice error>{error}</Notice>}
        <button className="button" disabled={busy}>
          {busy ? 'Saving…' : 'Save listing'}
          <Check size={17} />
        </button>
      </form>
      {listing && kind !== 'vegetable' && (
        <section className="availability-editor">
          <h3>Availability windows</h3>
          <p className="muted">
            Without windows, customers may request any future time. Once added, requests must fit
            inside a window. Existing confirmed bookings remain reserved.
          </p>
          {detail?.availability?.map((slot) => (
            <div className="availability-row" key={slot.id}>
              <span>
                {dateTime(slot.starts_at)} — {dateTime(slot.ends_at)}
              </span>
              <button
                className="icon-button"
                aria-label="Delete availability window"
                onClick={async () => {
                  try {
                    await api('/business/availability/' + slot.id, { method: 'DELETE' })
                    refresh()
                  } catch (e) {
                    setError((e as Error).message)
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              try {
                await post('/business/listings/' + listing.id + '/availability', {
                  starts_at: toUTC(String(form.get('start'))),
                  ends_at: toUTC(String(form.get('end'))),
                })
                toast('Availability added')
                refresh()
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            <div className="form-row">
              <Field label="Available from">
                <input type="datetime-local" name="start" required />
              </Field>
              <Field label="Available until">
                <input type="datetime-local" name="end" required />
              </Field>
            </div>
            <button className="button secondary">Add availability window</button>
          </form>
        </section>
      )}
    </section>
  )
}

export function AdminPage() {
  const location = useLocation(),
    navigate = useNavigate(),
    { toast, refresh } = useSession()
  const section = location.pathname.split('/')[2] || 'overview'
  const { data, isPending, error } = useQuery({
    queryKey: ['admin', section],
    queryFn: () => api('/admin/' + section),
  })
  const act = async (id: number, action: string) => {
    if (!confirm(`${action} this record? This action is recorded in the audit log.`)) return
    try {
      await post(`/admin/${section}/${id}/${action}`)
      toast('Administrative action saved')
      refresh()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <div className="container section">
      <PageTitle eyebrow="VELORA ADMINISTRATION" title="A healthier local marketplace." />
      <div className="browse-tabs admin-tabs">
        {[
          'overview',
          'users',
          'providers',
          'listings',
          'orders',
          'bookings',
          'categories',
          'reports',
          'audit',
        ].map((t) => (
          <button
            className={section === t ? 'selected' : ''}
            key={t}
            onClick={() => navigate('/admin/' + t)}
          >
            {t}
          </button>
        ))}
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <Notice error>{error.message}</Notice>
      ) : section === 'overview' ? (
        <div className="metric-grid">
          {Object.entries(data).map(([key, value]) => (
            <div className="metric" key={key}>
              <span>{titleCase(key)}</span>
              <strong>{key.includes('value') ? rupees(Number(value)) : String(value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <>
          {section === 'categories' && (
            <form
              className="surface inline-form"
              onSubmit={async (e) => {
                e.preventDefault()
                const form = new FormData(e.currentTarget)
                try {
                  await post(
                    '/admin/categories?name=' +
                      encodeURIComponent(String(form.get('name'))) +
                      '&kind=' +
                      form.get('kind'),
                  )
                  toast('Category created')
                  refresh()
                } catch (e) {
                  toast((e as Error).message)
                }
              }}
            >
              <Field label="New category">
                <input name="name" required minLength={2} />
              </Field>
              <Field label="Type">
                <select name="kind">
                  <option>service</option>
                  <option>vegetable</option>
                  <option>vehicle</option>
                </select>
              </Field>
              <button className="button">Create category</button>
            </form>
          )}
          {Array.isArray(data) && data.length ? (
            <div className="admin-records">
              {data.map((record: any) => (
                <div key={record.id} className="surface admin-record">
                  <div>
                    <b>
                      #{record.id}{' '}
                      {record.name ||
                        record.title ||
                        record.message ||
                        record.action ||
                        record.email}
                    </b>
                    {section === 'users' && (
                      <p>
                        {record.email} · {record.roles.join(', ')} ·{' '}
                        {record.suspended ? 'Suspended' : 'Active'}
                      </p>
                    )}
                    {section === 'providers' && (
                      <p>
                        {record.town} · {record.verified ? 'Verified' : 'Pending / unverified'}
                      </p>
                    )}
                    {section === 'listings' && (
                      <p>
                        {record.business.name} · {record.active ? 'Visible' : 'Hidden'}
                      </p>
                    )}
                    {section === 'reports' && (
                      <p>
                        Reporter #{record.user_id} · Listing{' '}
                        {record.listing_id || 'general support'} · {record.status}
                      </p>
                    )}
                    {['orders', 'bookings'].includes(section) && (
                      <p>
                        {record.status} · {record.business.name} · {rupees(record.total)} · Customer
                        #{record.customer_id}
                        <br />
                        {record.address} · {record.notes}
                      </p>
                    )}
                    {section === 'categories' && <p>{record.kind}</p>}
                    {section === 'audit' && (
                      <p>
                        Actor #{record.actor_id} · {dateTime(record.created_at)}
                      </p>
                    )}
                  </div>
                  <div className="action-row">
                    {section === 'users' && !record.roles.includes('admin') && (
                      <button
                        className="button secondary"
                        onClick={() => act(record.id, record.suspended ? 'restore' : 'suspend')}
                      >
                        {record.suspended ? 'Restore' : 'Suspend'}
                      </button>
                    )}
                    {section === 'providers' && (
                      <button
                        className="button secondary"
                        onClick={() => act(record.id, record.verified ? 'unverify' : 'verify')}
                      >
                        {record.verified ? 'Unverify' : 'Verify'}
                      </button>
                    )}
                    {section === 'listings' && (
                      <button
                        className="button secondary"
                        onClick={() => act(record.id, record.active ? 'hide' : 'restore')}
                      >
                        {record.active ? 'Hide' : 'Restore'}
                      </button>
                    )}
                    {section === 'reports' && record.status === 'open' && (
                      <button
                        className="button secondary"
                        onClick={() => act(record.id, 'resolve')}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Notice>No records in this section yet.</Notice>
          )}
        </>
      )}
    </div>
  )
}
