import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowDownRight, ArrowRight, CalendarClock, Check, ChevronRight, CircleAlert, ClipboardList, Clock3, Edit3, Eye, Leaf, Package, Plus, RefreshCw, Sprout, Trash2, TrendingUp, Truck, X } from 'lucide-react';
import { useApp } from '../../app/providers';
import { EmptyState, Modal, Money, Notice, StatusBadge, dateLabel } from '../../components/shared';
import type { Category, Fulfillment, Order, OrderStatus, Product, ProductDraft, Unit } from '../../types';

const units: Unit[] = ['kg', 'quintal', 'dozen', 'bunch', 'piece'];
const categories: Category[] = ['Vegetables', 'Fruits', 'Grains', 'Spices', 'Oilseeds'];
const fulfillmentMethods: Fulfillment[] = ['pickup', 'delivery', 'both'];

export function FarmerDashboardPage() {
  const { user, products, orders } = useApp();
  if (!user) return null;
  const ownProducts = products.filter(p => p.farmerId === user.uid && !p.isDeleted);
  const ownOrders = orders.filter(o => o.farmerId === user.uid);
  const sales = ownOrders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.totalAmount, 0);
  const pending = ownOrders.filter(o => o.status === 'requested').length;
  const accepted = ownOrders.filter(o => o.status === 'accepted').length;
  const lowStock = ownProducts.filter(p => p.quantityAvailable <= 5);
  const recent = [...ownOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  return <main className="workspace-content">
    <div className="workspace-welcome"><div><span className="eyebrow">FARMER WORKSPACE</span><h1>Good morning, {user.name.split(' ')[0]}.</h1><p>Here's what's happening on your farm today.</p></div><Link className="button button-primary" to="/farmer/inventory?new=1"><Plus size={17}/> Add produce</Link></div>
    <div className="farm-location-ribbon"><span className="farm-location-icon"><Sprout size={17}/></span><div><strong>Your farm, your marketplace.</strong><small>{user.location} · Listings are visible to buyers when active.</small></div><span className="ribbon-dot"/> <small>Workspace live</small></div>
    <section className="metrics-grid">
      <article className="metric-card metric-featured"><div className="metric-top"><span>Completed-order sales</span><span className="metric-icon"><TrendingUp size={17}/></span></div><strong><Money value={sales}/></strong><small>All-time total · completed orders only</small><div className="metric-bottom"><span>Sales earned</span><ArrowDownRight size={15}/></div></article>
      <article className="metric-card"><div className="metric-top"><span>Order requests</span><span className="metric-icon metric-terra"><ClipboardList size={17}/></span></div><strong>{pending.toString().padStart(2, '0')}</strong><small>Waiting for your response</small><Link to="/farmer/orders" className="metric-action">Review requests <ArrowRight size={14}/></Link></article>
      <article className="metric-card"><div className="metric-top"><span>Preparing orders</span><span className="metric-icon"><Truck size={17}/></span></div><strong>{accepted.toString().padStart(2, '0')}</strong><small>Accepted, not yet ready</small><Link to="/farmer/orders" className="metric-action">Manage orders <ArrowRight size={14}/></Link></article>
      <article className="metric-card"><div className="metric-top"><span>Low stock</span><span className="metric-icon metric-warning"><CircleAlert size={17}/></span></div><strong>{lowStock.length.toString().padStart(2, '0')}</strong><small>At or below 5 {lowStock.length === 1 ? 'listing' : 'listings'}</small><Link to="/farmer/inventory" className="metric-action">Check inventory <ArrowRight size={14}/></Link></article>
    </section>
    <section className="dashboard-panels">
      <div className="workspace-panel"><div className="panel-heading"><div><span className="eyebrow">ORDER INBOX</span><h2>Needs your attention</h2></div><Link to="/farmer/orders" className="text-link">All orders <ArrowRight size={14}/></Link></div>
        {recent.length === 0 ? <EmptyState title="No orders yet" detail="When buyers request produce, their orders will appear here." action={<Link to="/farmer/inventory" className="button button-outline">Review your listings</Link>}/> :
          <div className="mini-order-list">{recent.map(order => <Link key={order.id} to="/farmer/orders" className="mini-order-row"><span className="mini-order-number">{order.id.slice(-5).toUpperCase()}</span><div><strong>{order.buyerName}</strong><small>{order.items.map(i => i.productName).join(', ')}</small></div><div className="mini-order-end"><Money value={order.totalAmount}/><StatusBadge status={order.status}/></div><ChevronRight size={16}/></Link>)}</div>}
      </div>
      <div className="workspace-panel inventory-summary-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR INVENTORY</span><h2>Growing right now</h2></div><span className="count-pill">{ownProducts.filter(p => p.isActive).length} active</span></div>
        {ownProducts.length === 0 ? <EmptyState title="Nothing listed yet" detail="Add your first product to get your harvest in front of buyers." action={<Link to="/farmer/inventory?new=1" className="button button-primary"><Plus size={15}/> Add produce</Link>}/> :
          <div className="inventory-preview-list">{ownProducts.slice(0, 5).map(p => <div className="inventory-preview-row" key={p.id}><img src={p.imageUrl} alt={p.name}/><div><strong>{p.name}</strong><small>{p.quantityAvailable} {p.unit} available</small></div><Money value={p.price} unit={p.unit}/><span className={p.quantityAvailable <= 5 ? 'stock-warning-text' : 'stock-good-text'}>{p.quantityAvailable <= 5 ? 'Low' : 'In stock'}</span></div>)}</div>}
        <Link to="/farmer/inventory" className="panel-bottom-link">Manage inventory <ArrowRight size={14}/></Link>
      </div>
    </section>
    <div className="farmer-footnote"><Activity size={15}/><span>Sales and activity are calculated from persisted orders. Demo orders do not represent actual payments.</span></div>
  </main>;
}

type FormProps = { initial?: Product; onSave: (draft: ProductDraft, productId?: string, file?: File | null) => Promise<void>; onClose: () => void };
export function ProductForm({ initial, onSave, onClose }: FormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? 'Vegetables');
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'kg');
  const [price, setPrice] = useState(String(initial?.price ?? ''));
  const [quantity, setQuantity] = useState(String(initial?.quantityAvailable ?? ''));
  const [minQty, setMinQty] = useState(String(initial?.minOrderQty ?? '1'));
  const [availableFrom, setAvailableFrom] = useState(initial?.availableFrom ?? new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState(initial?.location ?? '');
  const [fulfillment, setFulfillment] = useState<Fulfillment>(initial?.fulfillmentMethod ?? 'both');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const chooseImage = (f?: File) => {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { setError('Use a JPG, PNG or WebP image.'); return; }
    if (f.size > 6 * 1024 * 1024) { setError('Image must be smaller than 6 MB.'); return; }
    setFile(f); setImageUrl(URL.createObjectURL(f)); setError('');
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    const numericPrice = Number(price), numericStock = Number(quantity), numericMin = Number(minQty);
    if (!name.trim() || !location.trim()) { setError('Product name and location are required.'); return; }
    if (!imageUrl) { setError('Add a product photo before saving.'); return; }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) { setError('Price must be greater than zero.'); return; }
    if (!Number.isFinite(numericStock) || numericStock < 0) { setError('Available quantity cannot be negative.'); return; }
    if (!Number.isFinite(numericMin) || numericMin <= 0 || numericMin > Math.max(numericStock, 1)) { setError('Minimum order quantity must be positive and fit the available quantity.'); return; }
    setBusy(true);
    try { await onSave({ name: name.trim(), description: description.trim(), category, unit, price: numericPrice, quantityAvailable: numericStock, minOrderQty: numericMin, availableFrom, location: location.trim(), fulfillmentMethod: fulfillment, imageUrl }, initial?.id, file); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save listing.'); }
    finally { setBusy(false); }
  };
  return <form className="product-form" onSubmit={submit}>
    <div className="form-photo-picker">{imageUrl ? <img src={imageUrl} alt="Product preview"/> : <div className="photo-placeholder"><Package size={25}/><span>Product photograph</span></div>}<label className="button button-outline photo-pick-button"><Plus size={15}/>{file || initial?.imageUrl ? 'Change photo' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => chooseImage(e.target.files?.[0])} hidden/></label><small>JPG, PNG or WebP · up to 6 MB</small></div>
    <div className="form-fields-grid"><label>Product name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fresh tomatoes" required/></label>
      <label>Category<select value={category} onChange={e => setCategory(e.target.value as Category)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Price (₹ per unit)<input type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="30" required/></label>
      <label>Unit<select value={unit} onChange={e => setUnit(e.target.value as Unit)}>{units.map(u => <option key={u}>{u}</option>)}</select></label>
      <label>Available quantity<input type="number" min="0" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="50" required/></label>
      <label>Minimum order quantity<input type="number" min="0.1" step="0.1" value={minQty} onChange={e => setMinQty(e.target.value)} required/></label>
      <label>Harvest / availability date<input type="date" value={availableFrom} onChange={e => setAvailableFrom(e.target.value)} required/></label>
      <label>Pickup / delivery<select value={fulfillment} onChange={e => setFulfillment(e.target.value as Fulfillment)}><option value="pickup">Farm pickup only</option><option value="delivery">Delivery (demo only)</option><option value="both">Pickup or delivery (demo)</option></select></label>
      <label className="form-span-two">Farm / pickup location<input value={location} onChange={e => setLocation(e.target.value)} placeholder="District, State" required/></label>
      <label className="form-span-two">Produce story / description<textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="How was this produce grown? When was it harvested?"/></label>
    </div>
    {fulfillment !== 'pickup' && <Notice kind="warning">Delivery is represented in this demo only; no logistics network is connected.</Notice>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <span className="spinner"/> : <>{initial ? 'Save changes' : 'Publish produce'} <ArrowRight size={15}/></>}</button></div>
  </form>;
}

export function FarmerInventoryPage() {
  const { user, products, saveProduct, setProductActive, deleteProduct, confirmAvailability, toast } = useApp();
  const [editing, setEditing] = useState<Product | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const own = products.filter(p => p.farmerId === user?.uid && !p.isDeleted);
  const shown = own.filter(p => filter === 'all' || filter === 'active' && p.isActive || filter === 'paused' && !p.isActive || filter === 'low' && p.quantityAvailable <= 5);
  const newFromQuery = new URLSearchParams(window.location.search).get('new') === '1';
  useEffect(() => { if (newFromQuery) setFormOpen(true); }, [newFromQuery]);
  const startEdit = (product: Product) => { setEditing(product); setFormOpen(true); };
  const remove = async (product: Product) => {
    if (!window.confirm('Remove ' + product.name + ' from your listings? Old orders will be kept.')) return;
    try { await deleteProduct(product.id); } catch (e) { toast('Could not remove listing', 'error', e instanceof Error ? e.message : 'Try again.'); }
  };
  return <main className="workspace-content">
    <div className="workspace-welcome"><div><span className="eyebrow">PRODUCT CATALOG</span><h1>Your harvest, in one place.</h1><p>Keep your availability current and make every price easy to understand.</p></div><button type="button" className="button button-primary" onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus size={17}/> Add produce</button></div>
    <div className="inventory-stats-line"><span><Package size={16}/><strong>{own.length}</strong> total listings</span><span><Check size={16}/><strong>{own.filter(p => p.isActive).length}</strong> active</span><span><CircleAlert size={16}/><strong>{own.filter(p => p.quantityAvailable <= 5).length}</strong> low stock</span></div>
    <div className="inventory-toolbar"><div className="inventory-filter-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All listings</button><button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Active</button><button className={filter === 'paused' ? 'active' : ''} onClick={() => setFilter('paused')}>Paused</button><button className={filter === 'low' ? 'active' : ''} onClick={() => setFilter('low')}>Low stock</button></div><span className="table-count">Showing {shown.length} items</span></div>
    {shown.length === 0 ? <EmptyState title="No listings in this view" detail="Add produce or switch the filter to see other inventory." action={<button type="button" className="button button-primary" onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus size={15}/> Add produce</button>}/> :
      <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Produce</th><th>Price / unit</th><th>Available</th><th>Harvest date</th><th>Listing status</th><th>Availability</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{shown.map(p => <tr key={p.id}><td><div className="table-product"><img src={p.imageUrl} alt=""/><div><strong>{p.name}</strong><small>{p.category} · Min {p.minOrderQty} {p.unit}</small></div></div></td><td><Money value={p.price} unit={p.unit}/></td><td><span className={p.quantityAvailable <= 5 ? 'quantity-low' : 'quantity-normal'}>{p.quantityAvailable} {p.unit}</span></td><td>{dateLabel(p.availableFrom)}</td><td><span className={'listing-pill ' + (p.isActive ? 'listing-active' : 'listing-paused')}>{p.isActive ? 'Active' : 'Paused'}</span></td><td><span className="table-freshness">{p.lastAvailabilityConfirmedAt ? dateLabel(p.lastAvailabilityConfirmedAt) : 'Not confirmed'}</span></td><td><div className="table-actions"><button type="button" title="Confirm availability" aria-label={'Confirm ' + p.name + ' availability'} onClick={() => void confirmAvailability(p.id)}><RefreshCw size={15}/></button><button type="button" title="Edit listing" aria-label={'Edit ' + p.name} onClick={() => startEdit(p)}><Edit3 size={15}/></button><button type="button" title={p.isActive ? 'Pause listing' : 'Activate listing'} aria-label={p.isActive ? 'Pause ' + p.name : 'Activate ' + p.name} onClick={() => void setProductActive(p.id, !p.isActive)}>{p.isActive ? <Eye size={15}/> : <Check size={15}/>}</button><button type="button" title="Remove listing" aria-label={'Remove ' + p.name} className="action-danger" onClick={() => void remove(p)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
    <Notice kind="info">Stock is reserved at checkout. Confirm availability after harvesting or restocking so buyers know when your listing was last checked.</Notice>
    {formOpen && <Modal wide title={editing ? 'Edit produce listing' : 'Add produce to the marketplace'} detail="Clear units, reliable availability and a good photo help buyers order with confidence." onClose={() => { setFormOpen(false); setEditing(undefined); }}><ProductForm initial={editing} onSave={saveProduct} onClose={() => { setFormOpen(false); setEditing(undefined); }}/></Modal>}
  </main>;
}

export function FarmerOrdersPage() {
  const { user, orders, changeOrder, toast } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const own = [...orders].filter(o => o.farmerId === user.uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = own.filter(o => statusFilter === 'all' || o.status === statusFilter);
  const selected = own.find(o => o.id === selectedId) ?? shown[0];
  const transition = async (order: Order, next: OrderStatus, reason?: string) => {
    let label = next === 'cancelled' ? 'Reject or cancel this order and restore reserved stock?' : 'Update order status to ' + next + '?';
    if (!window.confirm(label)) return;
    setBusy(true);
    try { await changeOrder(order.id, next, reason); setSelectedId(order.id); }
    catch (e) { toast('Order update failed', 'error', e instanceof Error ? e.message : 'Try again.'); }
    finally { setBusy(false); }
  };
  return <main className="workspace-content">
    <div className="workspace-welcome"><div><span className="eyebrow">INCOMING ORDERS</span><h1>Every order, accounted for.</h1><p>Accept what you can fulfill. Keep buyers updated along the way.</p></div><span className="count-pill">{own.filter(o => o.status === 'requested').length} requests waiting</span></div>
    <div className="orders-filter-bar">{['all', 'requested', 'accepted', 'ready', 'completed', 'cancelled'].map(status => <button type="button" key={status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{status === 'all' ? 'All orders' : status.charAt(0).toUpperCase() + status.slice(1)}<span>{status === 'all' ? own.length : own.filter(o => o.status === status).length}</span></button>)}</div>
    {shown.length === 0 ? <EmptyState icon="clock" title="No orders in this view" detail="New buyer requests will appear here with items, quantities and the selected fulfillment method."/> :
      <div className="farmer-order-layout"><div className="farmer-order-list">{shown.map(order => <button type="button" className={'farmer-order-list-item ' + ((selected?.id === order.id) ? 'selected' : '')} key={order.id} onClick={() => setSelectedId(order.id)}><span className="mini-order-number">{order.id.slice(-5).toUpperCase()}</span><div><strong>{order.buyerName}</strong><small>{order.items.map(i => i.productName).join(', ')}</small><small>{dateLabel(order.createdAt)}</small></div><div className="mini-order-end"><Money value={order.totalAmount}/><StatusBadge status={order.status}/></div></button>)}</div>
        {selected && <div className="farmer-order-detail"><OrderDetailForFarmer order={selected} busy={busy} onTransition={(next, reason) => void transition(selected, next, reason)}/></div>}
      </div>}
    <Notice kind="info">Stock is reserved when the buyer submits the request. Rejecting a request or cancelling before Ready restores stock once. Ready and completed orders cannot be cancelled.</Notice>
  </main>;
}
function OrderDetailForFarmer({ order, onTransition, busy }: { order: Order; onTransition: (next: OrderStatus, reason?: string) => void; busy: boolean }) {
  return <div className="order-detail-content"><div className="order-detail-top"><div><span className="eyebrow">ORDER DETAIL</span><h2>{order.id.slice(-10).toUpperCase()}</h2><small>Requested {dateLabel(order.createdAt)}</small></div><StatusBadge status={order.status}/></div>
    <div className="order-detail-facts"><div><span>Buyer</span><strong>{order.buyerName}</strong></div><div><span>Fulfillment</span><strong>{order.fulfillmentMethod === 'pickup' ? 'Farm pickup' : 'Delivery (demo)'}</strong></div><div><span>Payment</span><strong>{order.paymentMethod === 'simulated' ? 'Simulated · unpaid' : 'Cash on pickup'}</strong></div><div><span>Order total</span><strong><Money value={order.totalAmount}/></strong></div></div>
    {order.fulfillmentMethod === 'delivery' && <Notice kind="warning">Delivery is represented in this demo only; no logistics network is connected.</Notice>}
    <h3 className="order-items-title">Requested produce</h3>{order.items.map(item => <div className="order-line-item" key={item.productId}><img src={item.imageUrl} alt={item.productName}/><div><strong>{item.productName}</strong><small>{item.quantity} {item.unit} × <Money value={item.unitPrice} unit={item.unit}/></small></div><strong><Money value={item.lineTotal}/></strong></div>)}
    <h3 className="order-items-title">Order history</h3><div className="timeline">{order.statusHistory.map((event, i) => <div className="timeline-event" key={event.timestamp + event.status + i}><span className={'timeline-dot ' + (i === order.statusHistory.length - 1 ? 'current' : '')}>{i === order.statusHistory.length - 1 ? <Check size={11}/> : null}</span><div><strong>{event.status.charAt(0).toUpperCase() + event.status.slice(1)}</strong><small>{new Date(event.timestamp).toLocaleString('en-IN')} · {event.actorRole}</small>{event.reason && <p>{event.reason}</p>}</div></div>)}</div>
    <div className="order-detail-actions">{order.status === 'requested' && <><button className="button button-outline" type="button" disabled={busy} onClick={() => onTransition('cancelled', 'Rejected by farmer')}>Reject request</button><button className="button button-primary" type="button" disabled={busy} onClick={() => onTransition('accepted')}>Accept order <Check size={15}/></button></>}
      {order.status === 'accepted' && <><button className="button button-danger-outline" type="button" disabled={busy} onClick={() => onTransition('cancelled', 'Cancelled by farmer before ready')}>Cancel order</button><button className="button button-primary" type="button" disabled={busy} onClick={() => onTransition('ready')}>Mark ready <Check size={15}/></button></>}
      {order.status === 'ready' && <button className="button button-primary" type="button" disabled={busy} onClick={() => onTransition('completed')}>Mark completed <Check size={15}/></button>}
      {order.status === 'completed' && <p className="completed-note"><Check size={15}/> Handoff completed. Sales include this order.</p>}
      {order.status === 'cancelled' && <p className="cancellation-note"><strong>Order closed</strong><span>{order.cancellationReason}</span></p>}</div>
    {order.status === 'ready' && <p className="order-policy-note">Ready orders cannot be cancelled; mark Completed after the handoff is finished.</p>}
  </div>;
}
