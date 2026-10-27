import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Clock3, Filter, MapPin, Minus, Package, Plus, Search, ShoppingCart, Sprout, Trash2, Truck, X } from 'lucide-react';
import { useApp } from '../../app/providers';
import { EmptyState, Money, Notice, ProductCard, StatusBadge, dateLabel, freshnessLabel } from '../../components/shared';
import { canTransition, resolveFulfillment, validateQuantity } from '../../lib/orderLogic';
import type { CartLine, Order, OrderStatus, Product } from '../../types';

function cartKey(uid: string) { return 'harvestlink.cart.' + uid; }
function readCart(uid: string): CartLine[] {
  try { return JSON.parse(localStorage.getItem(cartKey(uid)) || '[]') as CartLine[]; } catch { return []; }
}
function writeCart(uid: string, lines: CartLine[]) { localStorage.setItem(cartKey(uid), JSON.stringify(lines)); }
function addCart(uid: string, product: Product, quantity?: number) {
  const lines = readCart(uid);
  const found = lines.find(line => line.productId === product.id);
  if (found) found.quantity += quantity ?? product.minOrderQty;
  else lines.push({ productId: product.id, quantity: quantity ?? product.minOrderQty });
  writeCart(uid, lines);
}
function formatDateTime(value: string) { return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }

export function MarketplacePage() {
  const { user, products, productsReady, toast } = useApp();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All produce');
  const [location, setLocation] = useState('All locations');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [availableDate, setAvailableDate] = useState('');
  const [stockOnly, setStockOnly] = useState(true);
  const [fulfillment, setFulfillment] = useState('any');
  const [sort, setSort] = useState('featured');
  const [showFilters, setShowFilters] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  useEffect(() => { if (user) setCartCount(readCart(user.uid).reduce((n, line) => n + line.quantity, 0)); }, [user, products]);
  const locations = Array.from(new Set(products.map(p => p.location.split(',')[0]))).sort();
  const visible = useMemo(() => {
    let list = products.filter(p => p.isActive && !p.isDeleted && p.farmerId !== user?.uid);
    if (search.trim()) list = list.filter(p => (p.name + ' ' + p.farmName + ' ' + p.location + ' ' + p.category).toLowerCase().includes(search.trim().toLowerCase()));
    if (category !== 'All produce') list = list.filter(p => p.category === category);
    if (location !== 'All locations') list = list.filter(p => p.location.startsWith(location));
    if (minPrice !== '' && Number.isFinite(Number(minPrice))) list = list.filter(p => p.price >= Number(minPrice));
    if (maxPrice !== '' && Number.isFinite(Number(maxPrice))) list = list.filter(p => p.price <= Number(maxPrice));
    if (availableDate) list = list.filter(p => p.availableFrom <= availableDate);
    if (stockOnly) list = list.filter(p => p.quantityAvailable > 0);
    if (fulfillment !== 'any') list = list.filter(p => p.fulfillmentMethod === 'both' || p.fulfillmentMethod === fulfillment);
    if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
    if (sort === 'date') list = [...list].sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));
    if (sort === 'fresh') list = [...list].sort((a, b) => b.lastAvailabilityConfirmedAt.localeCompare(a.lastAvailabilityConfirmedAt));
    return list;
  }, [products, user, search, category, location, minPrice, maxPrice, availableDate, stockOnly, fulfillment, sort]);
  const quickAdd = (product: Product) => {
    if (!user) return;
    addCart(user.uid, product);
    setCartCount(readCart(user.uid).reduce((n, line) => n + line.quantity, 0));
    toast(product.name + ' added to cart', 'success', 'Minimum order quantity added. You can adjust it at checkout.');
  };
  const resetFilters = () => { setSearch(''); setCategory('All produce'); setLocation('All locations'); setMinPrice(''); setMaxPrice(''); setAvailableDate(''); setStockOnly(true); setFulfillment('any'); setSort('featured'); };
  return <main className="market-page">
    <section className="market-hero">
      <div className="market-hero-copy"><span className="eyebrow">GOOD FOOD, CLOSER TO HOME</span><h1>Meet your food<br/>before it meets <em>your table.</em></h1><p>Shop this week's harvest from independent farms across Telangana and Andhra Pradesh.</p>
        <div className="hero-proof"><span><Sprout size={15}/> Grown close by</span><span><Check size={15}/> Clear prices, clear stock</span></div></div>
      <div className="market-hero-photo"><img src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=86" alt="Fresh vegetables displayed at a local market"/><div className="hero-photo-note"><span>IN SEASON</span><strong>From local soil,<br/>to your kitchen.</strong></div></div>
      <div className="hero-index"><span>01</span><span>FARM TO TABLE</span><span>02</span></div>
    </section>
    <section className="market-controls">
      <div className="market-search"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tomatoes, mangoes, farmers…" aria-label="Search produce"/></div>
      <button type="button" className={'filter-toggle ' + (showFilters ? 'active' : '')} onClick={() => setShowFilters(v => !v)}><Filter size={16}/> Filters <ChevronDown size={15}/></button>
      <div className="market-count"><strong>{visible.length.toString().padStart(2, '0')}</strong> products <span>available to explore</span></div>
      <Link to="/buyer/cart" className="market-cart-button"><ShoppingCart size={17}/> Cart <span>{cartCount}</span></Link>
      {showFilters && <div className="filter-panel">
        <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option>All produce</option><option>Vegetables</option><option>Fruits</option><option>Grains</option><option>Spices</option><option>Oilseeds</option></select></label>
        <label>Near<select value={location} onChange={e => setLocation(e.target.value)}><option>All locations</option>{locations.map(l => <option key={l}>{l}</option>)}</select></label>
        <label>Min price (₹/unit)<input type="number" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Any price"/></label>
        <label>Max price (₹/unit)<input type="number" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Any price"/></label>
        <label>Available by<input type="date" value={availableDate} onChange={e => setAvailableDate(e.target.value)}/></label>
        <label>Fulfillment<select value={fulfillment} onChange={e => setFulfillment(e.target.value)}><option value="any">Any option</option><option value="pickup">Pickup</option><option value="delivery">Delivery (demo)</option></select></label>
        <label className="check-filter"><input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)}/> In stock only</label>
        <button type="button" className="text-link" onClick={resetFilters}>Reset filters <X size={13}/></button>
      </div>}
    </section>
    <section className="listing-heading"><div><span className="eyebrow">THE HARVEST EDIT</span><h2>Good things, growing now.</h2><p>Listed by the people who grow them.</p></div><label className="sort-control">Sort by <select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Recommended</option><option value="fresh">Recently confirmed</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="date">Harvest date</option></select></label></section>
    {!productsReady ? <div className="product-grid">{Array.from({ length: 8 }, (_, i) => <div className="product-skeleton" key={i}><div className="skeleton-image"/><div className="skeleton-content"><span/><span/><span/></div></div>)}</div> : visible.length ? <div className="product-grid">{visible.map(product => <ProductCard key={product.id} product={product} onAdd={quickAdd}/>)}</div> :
      <EmptyState title="No produce found" detail="Try a different search or loosen a filter to see more of the harvest." action={<button type="button" className="button button-outline" onClick={resetFilters}>Clear filters</button>}/>}
    <div className="market-footer-note"><span className="tiny-leaf"><Sprout size={17}/></span><div><strong>Know what's actually available.</strong><p>We show the date each farmer last confirmed their stock—because confidence starts with clear information.</p></div></div>
  </main>;
}

export function ProductPage() {
  const { id } = useParams();
  const { user, products, productsReady, toast } = useApp();
  const navigate = useNavigate();
  const product = products.find(p => p.id === id && !p.isDeleted);
  const [quantity, setQuantity] = useState(product?.minOrderQty ?? 1);
  const [quantityError, setQuantityError] = useState('');
  useEffect(() => { if (product) setQuantity(product.minOrderQty); }, [product?.id]);
  if (!product && !productsReady) return <main className="page-wrap"><div className="product-detail-skeleton"><div/><div><span/><span/><span/><span/></div></div></main>;
  if (!product || (!product.isActive && user?.role === 'buyer')) return <main className="page-wrap"><EmptyState title="This listing isn't available" detail="It may have been paused or sold out. Browse the current harvest for more options." action={<Link className="button button-primary" to="/marketplace">Back to marketplace</Link>}/></main>;
  const others = products.filter(p => p.farmerId === product.farmerId && p.id !== product.id && p.isActive && !p.isDeleted).slice(0, 4);
  const freshness = freshnessLabel(product.lastAvailabilityConfirmedAt);
  const add = () => {
    if (!user) return;
    const err = validateQuantity(quantity, product);
    if (err) { setQuantityError(err); return; }
    addCart(user.uid, product, quantity); toast('Added to your cart', 'success', quantity + ' ' + product.unit + ' of ' + product.name); navigate('/buyer/cart');
  };
  return <main className="page-wrap product-detail-page">
    <Link to="/marketplace" className="back-link"><ArrowLeft size={15}/> Back to the harvest</Link>
    <div className="product-detail-layout">
      <div className="detail-image-wrap"><img src={product.imageUrl} alt={product.name}/><span className="detail-image-caption">{product.category} · From the farm</span></div>
      <div className="detail-copy"><div className="detail-label-row"><span className="eyebrow">{product.category.toUpperCase()}</span><span className={product.quantityAvailable > 0 ? 'stock-label' : 'stock-label stock-empty'}>{product.quantityAvailable > 0 ? '● In stock' : '● Currently out'}</span></div>
        <h1>{product.name}</h1><div className="detail-price"><Money value={product.price} unit={product.unit}/><span>per {product.unit}</span></div><p className="detail-description">{product.description}</p>
        <div className="detail-facts"><div><span>Available quantity</span><strong>{product.quantityAvailable} {product.unit}</strong></div><div><span>Minimum order</span><strong>{product.minOrderQty} {product.unit}</strong></div><div><span>Harvest / available</span><strong>{dateLabel(product.availableFrom)}</strong></div><div><span>Stock confirmation</span><strong>{freshness}</strong></div></div>
        <div className="detail-fulfillment"><span><MapPin size={16}/> Farm pickup {product.fulfillmentMethod === 'delivery' ? 'not offered' : 'available'}</span><span><Truck size={16}/> {product.fulfillmentMethod === 'pickup' ? 'Pickup only' : 'Delivery represented in demo'}</span></div>
        {product.fulfillmentMethod !== 'pickup' && <Notice kind="warning">Delivery is represented in this demo only; no logistics network is connected.</Notice>}
        <div className="detail-buy-row"><div className="quantity-control"><button type="button" aria-label="Decrease quantity" onClick={() => { setQuantity(q => Math.max(0, q - 1)); setQuantityError(''); }}><Minus size={15}/></button><input type="number" min={product.minOrderQty} max={product.quantityAvailable} value={quantity} onChange={e => { setQuantity(e.target.value === '' ? 0 : Number(e.target.value)); setQuantityError(''); }} aria-label="Quantity to order"/><button type="button" aria-label="Increase quantity" onClick={() => { setQuantity(q => q + 1); setQuantityError(''); }}><Plus size={15}/></button></div><button className="button button-primary detail-add" type="button" disabled={product.quantityAvailable <= 0} onClick={add}>Add to cart <ArrowRight size={16}/></button></div>
        {quantityError && <p className="field-error">{quantityError}</p>}<p className="payment-note">Cash on pickup or simulated payment only. No card details collected.</p>
      </div>
    </div>
    <section className="farmer-story-row"><div className="farmer-story-icon"><Sprout size={25}/></div><div><span className="eyebrow">{product.farmName === 'HarvestLink Official Market' ? 'OFFICIAL MARKET' : 'THE GROWER'}</span><h2>{product.farmName}</h2><p>{product.farmerStory}</p><span className="farm-location"><MapPin size={14}/>{product.location}</span></div><div className="farmer-story-aside"><span>{product.farmName === 'HarvestLink Official Market' ? 'Marketplace seller' : 'Farmer'}</span><strong>{product.farmerName}</strong><small>HarvestLink seller</small></div></section>
    {others.length > 0 && <section className="related-section"><div className="section-title-row"><div><span className="eyebrow">MORE FROM THIS FARM</span><h2>Also growing here.</h2></div></div><div className="product-grid product-grid-related">{others.map(p => <ProductCard key={p.id} product={p}/>)}</div></section>}
  </main>;
}

export function CartPage() {
  const { user, products, checkout } = useApp();
  const navigate = useNavigate();
  const [lines, setLines] = useState<CartLine[]>(() => user ? readCart(user.uid) : []);
  const [fulfillment, setFulfillment] = useState<Record<string, 'pickup' | 'delivery'>>({});
  const [payment, setPayment] = useState<'cash-on-pickup' | 'simulated'>('cash-on-pickup');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) setLines(readCart(user.uid)); }, [user]);
  useEffect(() => { if (user) writeCart(user.uid, lines); }, [user, lines]);
  const entries = lines.map(line => ({ line, product: products.find(p => p.id === line.productId) })).filter((x): x is { line: CartLine; product: Product } => Boolean(x.product));
  const missingCount = lines.length - entries.length;
  const groups = new Map<string, typeof entries>();
  entries.forEach(entry => groups.set(entry.product.farmerId, [...(groups.get(entry.product.farmerId) ?? []), entry]));
  const subtotal = entries.reduce((sum, entry) => sum + entry.line.quantity * entry.product.price, 0);
  const hasDelivery = Array.from(groups.entries()).some(([farmerId, group]) => resolveFulfillment(group.map(entry => entry.product), fulfillment[farmerId]) === 'delivery');
  useEffect(() => { if (hasDelivery && payment === 'cash-on-pickup') setPayment('simulated'); }, [hasDelivery, payment]);
  const update = (productId: string, quantity: number) => setLines(prev => prev.map(line => line.productId === productId ? { ...line, quantity } : line));
  const remove = (productId: string) => setLines(prev => prev.filter(line => line.productId !== productId));
  const submit = async () => {
    setError('');
    if (!entries.length) { setError('Your cart is empty. Add a few things from the harvest first.'); return; }
    for (const entry of entries) {
      const problem = validateQuantity(entry.line.quantity, entry.product);
      if (problem) { setError(entry.product.name + ': ' + problem); return; }
      if (!entry.product.isActive || entry.product.isDeleted) { setError(entry.product.name + ' is no longer available. Remove it to continue.'); return; }
    }
    const resolvedFulfillment: Record<string, 'pickup' | 'delivery'> = {};
    for (const [farmerId, group] of groups) {
      const chosen = resolveFulfillment(group.map(entry => entry.product), fulfillment[farmerId]);
      if (!chosen) { setError('These products require different fulfillment methods for ' + group[0].product.farmName + '. Remove an item to continue.'); return; }
      resolvedFulfillment[farmerId] = chosen;
    }
    const resolvedPayment = Object.values(resolvedFulfillment).includes('delivery') && payment === 'cash-on-pickup' ? 'simulated' : payment;
    if (resolvedPayment !== payment) setPayment(resolvedPayment);
    setBusy(true);
    try {
      const orders = await checkout(lines, resolvedFulfillment, resolvedPayment);
      writeCart(user!.uid, []); setLines([]); navigate('/buyer/orders/' + orders[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Checkout failed. Please review your cart.'); }
    finally { setBusy(false); }
  };
  return <main className="page-wrap cart-page">
    <div className="page-heading-row"><div><Link to="/marketplace" className="back-link"><ArrowLeft size={15}/> Continue shopping</Link><span className="eyebrow">YOUR HARVEST BAG</span><h1>Review your basket.</h1><p>Your order is reserved only after checkout succeeds.</p></div><span className="basket-count">{entries.length} items</span></div>
    {missingCount > 0 && <div className="stale-cart-row"><Notice kind="warning">{missingCount} item(s) are no longer available in the current catalog. Remove them to continue.</Notice><button type="button" className="button button-outline" onClick={() => setLines(current => current.filter(line => products.some(p => p.id === line.productId && !p.isDeleted)))}>Remove unavailable items</button></div>}
    {entries.length === 0 ? <EmptyState title="Your basket is waiting" detail="Find produce listed by nearby farmers and add what you need." action={<Link to="/marketplace" className="button button-primary">Explore the harvest</Link>}/> :
      <div className="checkout-layout"><div className="cart-items-column">
        {Array.from(groups.entries()).map(([farmerId, group]) => {
          const canPickup = group.every(x => x.product.fulfillmentMethod === 'both' || x.product.fulfillmentMethod === 'pickup');
          const canDelivery = group.every(x => x.product.fulfillmentMethod === 'both' || x.product.fulfillmentMethod === 'delivery');
          const chosen = resolveFulfillment(group.map(entry => entry.product), fulfillment[farmerId]) ?? 'pickup';
          return <section className="cart-farmer-group" key={farmerId}><div className="cart-farmer-header"><div className="tiny-farmer-mark"><Sprout size={16}/></div><div><span>FROM THE FARM</span><strong>{group[0].product.farmName}</strong><small><MapPin size={12}/>{group[0].product.location}</small></div></div>
            {group.map(({ line, product }) => { const problem = validateQuantity(line.quantity, product); return <div className="cart-line" key={line.productId}>
              <img src={product.imageUrl} alt={product.name}/><div className="cart-line-main"><Link to={'/product/' + product.id}>{product.name}</Link><span><Money value={product.price} unit={product.unit}/></span><small>{product.quantityAvailable} {product.unit} available · Min {product.minOrderQty} {product.unit}</small>
                {problem && <span className="field-error">{problem}</span>}</div>
              <div className="cart-line-actions"><div className="quantity-control quantity-small"><button type="button" aria-label={'Decrease ' + product.name} onClick={() => update(product.id, line.quantity - 1)}><Minus size={13}/></button><input type="number" min={product.minOrderQty} max={product.quantityAvailable} value={line.quantity} onChange={e => update(product.id, e.target.value === '' ? 0 : Number(e.target.value))} aria-label={product.name + ' quantity'}/><button type="button" aria-label={'Increase ' + product.name} onClick={() => update(product.id, line.quantity + 1)}><Plus size={13}/></button></div><strong><Money value={line.quantity * product.price}/></strong><button type="button" className="remove-line" aria-label={'Remove ' + product.name} onClick={() => remove(product.id)}><Trash2 size={14}/></button></div>
            </div>; })}
            <div className="fulfillment-choice"><p>How would you like to receive it?</p><div className="choice-row"><button type="button" disabled={!canPickup} className={chosen === 'pickup' ? 'choice active' : 'choice'} onClick={() => setFulfillment(prev => ({ ...prev, [farmerId]: 'pickup' }))}><MapPin size={15}/> Farm pickup</button><button type="button" disabled={!canDelivery} className={chosen === 'delivery' ? 'choice active' : 'choice'} onClick={() => setFulfillment(prev => ({ ...prev, [farmerId]: 'delivery' }))}><Truck size={15}/> Delivery (demo)</button></div>
            {!canPickup && !canDelivery && <p className="field-error">These items require different fulfillment methods. Remove an item to continue.</p>}
            {canDelivery && <p className="delivery-disclaimer">Delivery is represented in this demo only; no logistics network is connected.</p>}</div>
          </section>;
        })}
      </div><aside className="order-summary"><span className="eyebrow">ORDER SUMMARY</span><h2>Almost there.</h2><div className="summary-row"><span>Produce subtotal</span><strong><Money value={subtotal}/></strong></div><div className="summary-row"><span>Delivery / service fees</span><strong>₹0</strong></div><div className="summary-total"><span>Total</span><strong><Money value={subtotal}/></strong></div><p className="summary-hint">Each farmer receives a separate order so status updates stay clear.</p>
        <label className="payment-select-label">Payment method<select value={payment} onChange={e => setPayment(e.target.value as typeof payment)}><option value="cash-on-pickup">Cash on pickup</option><option value="simulated">Simulated payment (demo only)</option></select></label>
        {payment === 'simulated' && <Notice kind="info">This is a simulation only. No money is collected and no card details are requested.</Notice>}
        {error && <div className="inline-error" role="alert">{error}</div>}<button className="button button-primary checkout-button" type="button" onClick={submit} disabled={busy}>{busy ? <span className="spinner"/> : <>Place order request <ArrowRight size={16}/></>}</button><p className="summary-terms"><Check size={13}/> Stock is checked again when you place the order.</p>
      </aside></div>}
  </main>;
}

function OrderTimeline({ order }: { order: Order }) {
  return <div className="timeline">{order.statusHistory.map((event, i) => <div className="timeline-event" key={event.timestamp + event.status + i}><span className={'timeline-dot ' + (i === order.statusHistory.length - 1 ? 'current' : '')}>{i === order.statusHistory.length - 1 ? <Check size={11}/> : null}</span><div><strong>{event.status.charAt(0).toUpperCase() + event.status.slice(1)}</strong><small>{formatDateTime(event.timestamp)} · {event.actorRole}</small>{event.reason && <p>{event.reason}</p>}</div></div>)}</div>;
}
function OrderContent({ order, onCancel, onTransition, busy = false }: { order: Order; onCancel?: () => void; onTransition?: (next: OrderStatus, reason?: string) => void; busy?: boolean }) {
  return <div className="order-detail-content">
    <div className="order-detail-top"><div><span className="eyebrow">ORDER REFERENCE</span><h2>{order.id.slice(-10).toUpperCase()}</h2><small>Placed {formatDateTime(order.createdAt)}</small></div><StatusBadge status={order.status}/></div>
    <div className="order-detail-facts"><div><span>Farmer</span><strong>{order.farmerName}</strong></div><div><span>Fulfillment</span><strong>{order.fulfillmentMethod === 'pickup' ? 'Farm pickup' : 'Delivery (demo)'}</strong></div><div><span>Payment</span><strong>{order.paymentMethod === 'simulated' ? 'Simulated · unpaid' : 'Cash on pickup'}</strong></div><div><span>Total</span><strong><Money value={order.totalAmount}/></strong></div></div>
    {order.fulfillmentMethod === 'delivery' && <Notice kind="warning">Delivery is represented in this demo only; no logistics network is connected.</Notice>}
    <h3 className="order-items-title">Items in this order</h3>{order.items.map(item => <div className="order-line-item" key={item.productId}><img src={item.imageUrl} alt={item.productName}/><div><strong>{item.productName}</strong><small>{item.quantity} {item.unit} × <Money value={item.unitPrice} unit={item.unit}/></small></div><strong><Money value={item.lineTotal}/></strong></div>)}
    {order.cancellationReason && <div className="cancellation-note"><strong>Cancellation / rejection note</strong><p>{order.cancellationReason}</p></div>}
    <h3 className="order-items-title">Order timeline</h3><OrderTimeline order={order}/>
    {(onCancel || onTransition) && <div className="order-detail-actions">
      {onCancel && <button type="button" className="button button-danger-outline" disabled={busy} onClick={onCancel}>Cancel request</button>}
      {onTransition && order.status === 'requested' && <><button type="button" className="button button-outline" disabled={busy} onClick={() => onTransition('cancelled', 'Rejected by farmer')}>Reject request</button><button type="button" className="button button-primary" disabled={busy} onClick={() => onTransition('accepted')}>Accept order <Check size={15}/></button></>}
      {onTransition && order.status === 'accepted' && <><button type="button" className="button button-danger-outline" disabled={busy} onClick={() => onTransition('cancelled', 'Cancelled by farmer before ready')}>Cancel order</button><button type="button" className="button button-primary" disabled={busy} onClick={() => onTransition('ready')}>Mark ready <Check size={15}/></button></>}
      {onTransition && order.status === 'ready' && <button type="button" className="button button-primary" disabled={busy} onClick={() => onTransition('completed')}>Mark completed <Check size={15}/></button>}
    </div>}
    {order.status === 'ready' && <p className="order-policy-note">Once an order is ready, cancellation is disabled. Contact the farmer directly to coordinate pickup.</p>}
  </div>;
}

export function BuyerOrdersPage() {
  const { user, orders, changeOrder, toast } = useApp();
  const [selected, setSelected] = useState<Order | null>(null);
  if (!user) return null;
  const list = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cancel = async (order: Order) => {
    if (!window.confirm('Cancel this requested order? Reserved stock will be returned.')) return;
    try { await changeOrder(order.id, 'cancelled', 'Cancelled by buyer'); setSelected(null); }
    catch (e) { toast('Could not cancel order', 'error', e instanceof Error ? e.message : 'Please try again.'); }
  };
  return <main className="page-wrap buyer-orders-page"><div className="page-heading-row"><div><span className="eyebrow">YOUR HARVEST HISTORY</span><h1>Orders, with clarity.</h1><p>Every request has a status, a timeline and a clear next step.</p></div><span className="basket-count">{list.length} orders</span></div>
    {selected && <div className="order-detail-overlay"><button type="button" className="detail-overlay-close" onClick={() => setSelected(null)}><X size={16}/> Close detail</button><OrderContent order={selected} onCancel={selected.status === 'requested' ? () => void cancel(selected) : undefined}/></div>}
    {list.length === 0 ? <EmptyState icon="clock" title="No orders just yet" detail="When you find something from the harvest, your order will show up here." action={<Link className="button button-primary" to="/marketplace">Find your first harvest</Link>}/> :
      <div className="orders-list">{list.map(order => <button type="button" className={'order-list-row ' + (selected?.id === order.id ? 'selected' : '')} key={order.id} onClick={() => setSelected(order)}><div className="order-list-image-stack">{order.items.slice(0, 3).map(item => <img src={item.imageUrl} alt="" key={item.productId}/>)}</div><div className="order-list-main"><span className="order-ref">ORDER {order.id.slice(-8).toUpperCase()}</span><strong>{order.items.map(item => item.productName).join(', ')}</strong><small>From {order.farmerName} · {dateLabel(order.createdAt)}</small></div><div className="order-list-value"><Money value={order.totalAmount}/><StatusBadge status={order.status}/></div><ArrowRight size={16}/></button>)}</div>}
  </main>;
}
export function BuyerOrderDetailPage() {
  const { orderId } = useParams();
  const { user, orders, changeOrder, toast } = useApp();
  const navigate = useNavigate();
  const order = orders.find(o => o.id === orderId && o.buyerId === user?.uid);
  const [busy, setBusy] = useState(false);
  if (!order) return <main className="page-wrap"><EmptyState icon="clock" title="Order not found" detail="This order may not belong to this account or has not loaded yet." action={<Link className="button button-outline" to="/buyer/orders">Back to orders</Link>}/></main>;
  const cancel = async () => {
    if (!window.confirm('Cancel this requested order? Its reserved stock will be restored.')) return;
    setBusy(true);
    try { await changeOrder(order.id, 'cancelled', 'Cancelled by buyer'); }
    catch (e) { toast('Could not cancel order', 'error', e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  return <main className="page-wrap detail-order-page"><Link to="/buyer/orders" className="back-link"><ArrowLeft size={15}/> All orders</Link><div className="page-heading-row"><div><span className="eyebrow">ORDER DETAIL</span><h1>Your order, in full.</h1><p>Order information and status history from the farmer.</p></div><span className="basket-count">{order.id.slice(-8).toUpperCase()}</span></div><div className="buyer-detail-panel"><OrderContent order={order} onCancel={order.status === 'requested' ? () => void cancel() : undefined} busy={busy}/></div></main>;
}
