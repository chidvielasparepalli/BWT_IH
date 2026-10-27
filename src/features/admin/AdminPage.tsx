import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ClipboardList, Edit3, Eye, EyeOff, Package, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '../../app/providers';
import { EmptyState, Modal, Money, Notice, StatusBadge } from '../../components/shared';
import { ProductForm } from '../farmer/FarmerPages';
import type { Order, OrderStatus, Product } from '../../types';

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ');
}
function nameSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}
function duplicateKeys(products: Product[]) {
  const flaggedIds = new Set<string>();
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const first = products[i], second = products[j];
      if (first.farmerId !== second.farmerId) continue;
      const a = normalizeName(first.name), b = normalizeName(second.name);
      const aWords = new Set(a.split(' ')), bWords = new Set(b.split(' '));
      const intersection = [...aWords].filter(word => bWords.has(word)).length;
      const union = new Set([...aWords, ...bWords]).size || 1;
      if (a === b || nameSimilarity(a, b) >= 0.82 || (Math.min(a.length, b.length) >= 5 && intersection / union >= 0.8)) {
        flaggedIds.add(first.id); flaggedIds.add(second.id);
      }
    }
  }
  return flaggedIds;
}
function isDuplicate(product: Product, keys: Set<string>) { return keys.has(product.id); }

export default function AdminPage() {
  const {
    user, products, orders, moderationLogs, moderateProduct, saveProduct,
    setProductActive, deleteProduct, confirmAvailability, changeOrder, toast,
  } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [catalogFormOpen, setCatalogFormOpen] = useState(false);
  const [editingOfficialProduct, setEditingOfficialProduct] = useState<Product | undefined>();
  const [catalogBusyId, setCatalogBusyId] = useState('');
  const [orderBusyId, setOrderBusyId] = useState('');

  const ownerUid = user?.uid ?? '';
  // Keep the admin-owned official catalog separate from independent farmer-owned listings.
  const officialProducts = products.filter(product => product.farmerId === ownerUid && !product.isDeleted);
  const farmerListings = products.filter(product => product.farmerId !== ownerUid && !product.isDeleted);
  const officialOrders = [...orders].filter(order => order.farmerId === ownerUid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const duplicateSet = useMemo(() => duplicateKeys(farmerListings), [products, ownerUid]);
  const rows = farmerListings.filter(product => {
    if (search && !(product.name + ' ' + product.farmName + ' ' + product.farmerName + ' ' + product.location).toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'flagged') return product.flagged || isDuplicate(product, duplicateSet);
    if (filter === 'inactive') return !product.isActive;
    if (filter === 'active') return product.isActive;
    return true;
  });
  const flaggedCount = farmerListings.filter(product => product.flagged || isDuplicate(product, duplicateSet)).length;
  if (!user || user.role !== 'admin') return null;

  const executeModeration = async (product: Product, action: 'flag' | 'deactivate' | 'remove') => {
    let reason = '';
    if (action === 'flag') reason = window.prompt('Why should this listing be reviewed?', product.flagReason || 'Possible duplicate listing') || '';
    if (action === 'deactivate') reason = window.prompt('Reason for deactivating this listing:', 'Listing requires review') || '';
    if (action === 'remove') {
      if (!window.confirm('Remove ' + product.name + '? This is a soft delete; existing orders stay intact.')) return;
      reason = window.prompt('Reason for removal:', 'Inappropriate or repeated listing') || 'Removed by administrator';
    }
    if (action !== 'remove' && !reason.trim()) return;
    setBusyId(product.id);
    try { await moderateProduct(product.id, action, reason); }
    catch (error) { toast('Moderation failed', 'error', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusyId(''); }
  };

  const performCatalogAction = async (product: Product, action: 'confirm' | 'toggle' | 'remove') => {
    if (action === 'remove' && !window.confirm('Remove ' + product.name + ' from the HarvestLink Official Market? Existing orders will be preserved.')) return;
    setCatalogBusyId(product.id);
    try {
      if (action === 'confirm') await confirmAvailability(product.id);
      else if (action === 'toggle') await setProductActive(product.id, !product.isActive);
      else await deleteProduct(product.id);
    } catch (error) {
      toast('Catalog update failed', 'error', error instanceof Error ? error.message : 'Please try again.');
    } finally { setCatalogBusyId(''); }
  };

  const transitionOfficialOrder = async (order: Order, next: OrderStatus, reason?: string) => {
    const message = next === 'cancelled'
      ? 'Reject or cancel this official-market order? Reserved stock will be restored.'
      : 'Update this order to ' + next + '?';
    if (!window.confirm(message)) return;
    setOrderBusyId(order.id);
    try { await changeOrder(order.id, next, reason); }
    catch (error) { toast('Order update failed', 'error', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setOrderBusyId(''); }
  };

  const farmerSellerCount = new Set(farmerListings.map(product => product.farmerId)).size;

  return <main className="admin-workspace">
    <div className="admin-intro"><div><span className="eyebrow">ADMINISTRATION · HACK-P309</span><h1>Run the marketplace <em>with confidence.</em></h1><p>Manage official HarvestLink products, fulfil orders placed for those items, and moderate independent farmer listings.</p></div><span className="admin-shield"><ShieldCheck size={27}/></span></div>

    <div className="admin-metrics">
      <div><span>Farmer listings to review</span><strong>{flaggedCount.toString().padStart(2, '0')}</strong><small>Flags and possible duplicates</small></div>
      <div><span>Active marketplace listings</span><strong>{products.filter(product => product.isActive && !product.isDeleted).length.toString().padStart(2, '0')}</strong><small>Visible to buyers</small></div>
      <div><span>Paused listings</span><strong>{products.filter(product => !product.isActive && !product.isDeleted).length.toString().padStart(2, '0')}</strong><small>Not visible to buyers</small></div>
      <div><span>Independent farm sellers</span><strong>{farmerSellerCount.toString().padStart(2, '0')}</strong><small>Farm accounts with listings</small></div>
    </div>

    <section className="admin-listing-panel admin-catalog-panel">
      <div className="admin-listing-heading"><div><span className="eyebrow">OFFICIAL HARVESTLINK CATALOG</span><h2>Products managed by admin</h2><p className="admin-section-copy">Add or maintain official marketplace produce. These products are owned by the admin portal, separately from farmer inventory.</p></div><button type="button" className="button button-primary" onClick={() => { setEditingOfficialProduct(undefined); setCatalogFormOpen(true); }}><Plus size={16}/> Add product</button></div>
      <div className="admin-catalog-summary"><span><Package size={15}/><strong>{officialProducts.length}</strong> official listings</span><span><Eye size={15}/><strong>{officialProducts.filter(product => product.isActive).length}</strong> active</span><span><ClipboardList size={15}/><strong>{officialOrders.filter(order => !['completed', 'cancelled'].includes(order.status)).length}</strong> open orders</span></div>
      {officialProducts.length === 0 ? <EmptyState title="No official products yet" detail="Add vegetables, fruit or other produce to publish an admin-managed listing on the buyer marketplace." action={<button type="button" className="button button-primary" onClick={() => { setEditingOfficialProduct(undefined); setCatalogFormOpen(true); }}><Plus size={15}/> Add your first product</button>}/> :
        <div className="inventory-table-wrap"><table className="inventory-table admin-table admin-catalog-table"><thead><tr><th>Product</th><th>Price</th><th>Available stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>{officialProducts.map(product => <tr key={product.id}>
          <td><div className="table-product"><img src={product.imageUrl} alt=""/><div><strong>{product.name}</strong><small>{product.category} · {product.location}</small></div></div></td>
          <td><Money value={product.price} unit={product.unit}/></td><td>{product.quantityAvailable} {product.unit}<small className="admin-location">Min {product.minOrderQty} {product.unit}</small></td>
          <td><span className={'listing-pill ' + (product.isActive ? 'listing-active' : 'listing-paused')}>{product.isActive ? 'Active' : 'Paused'}</span></td>
          <td><div className="admin-action-group">
            <button type="button" title="Confirm stock" aria-label={'Confirm ' + product.name + ' stock'} disabled={catalogBusyId === product.id} onClick={() => void performCatalogAction(product, 'confirm')}><RefreshCw size={14}/></button>
            <button type="button" title="Edit official product" aria-label={'Edit ' + product.name} disabled={catalogBusyId === product.id} onClick={() => { setEditingOfficialProduct(product); setCatalogFormOpen(true); }}><Edit3 size={14}/></button>
            <button type="button" title={product.isActive ? 'Pause listing' : 'Publish listing'} aria-label={(product.isActive ? 'Pause ' : 'Publish ') + product.name} disabled={catalogBusyId === product.id} onClick={() => void performCatalogAction(product, 'toggle')}>{product.isActive ? <EyeOff size={14}/> : <Check size={14}/>}</button>
            <button type="button" className="action-danger" title="Remove official product" aria-label={'Remove ' + product.name} disabled={catalogBusyId === product.id} onClick={() => void performCatalogAction(product, 'remove')}><Trash2 size={14}/></button>
          </div></td>
        </tr>)}</tbody></table></div>}
      <Notice kind="info">Official listings appear in the same buyer marketplace, but their inventory belongs only to the admin account. Admins cannot edit farmer-owned stock here; those listings are handled in the moderation section below.</Notice>
    </section>

    <section className="admin-listing-panel admin-official-orders">
      <div className="admin-listing-heading"><div><span className="eyebrow">OFFICIAL MARKET FULFILMENT</span><h2>Orders for admin products</h2><p className="admin-section-copy">Only orders placed for products owned by the HarvestLink Official Market appear here.</p></div><span className="table-count">{officialOrders.length} orders</span></div>
      {officialOrders.length === 0 ? <EmptyState icon="clock" title="No official-market orders yet" detail="When a buyer orders an admin-managed product, the request will appear here. Farmer orders stay in each farmer's own workspace."/> :
        <div className="admin-order-list">{officialOrders.map(order => <article className="admin-order-card" key={order.id}>
          <div className="admin-order-card-head"><div><span className="eyebrow">ORDER {order.id.slice(-8).toUpperCase()}</span><h3>{order.buyerName}</h3><small>{new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></div><StatusBadge status={order.status}/></div>
          <div className="admin-order-items">{order.items.map(item => <div key={item.productId}><span>{item.productName} · {item.quantity} {item.unit}</span><strong><Money value={item.lineTotal}/></strong></div>)}</div>
          <div className="admin-order-card-foot"><span>{order.fulfillmentMethod === 'pickup' ? 'Farm pickup' : 'Delivery (demo)'} · {order.paymentMethod === 'simulated' ? 'Simulated payment' : 'Cash on pickup'}</span><strong><Money value={order.totalAmount}/></strong></div>
          <div className="admin-order-actions">
            {order.status === 'requested' && <><button type="button" className="button button-outline" disabled={orderBusyId === order.id} onClick={() => void transitionOfficialOrder(order, 'cancelled', 'Rejected by HarvestLink Official Market')}>Reject request</button><button type="button" className="button button-primary" disabled={orderBusyId === order.id} onClick={() => void transitionOfficialOrder(order, 'accepted')}>Accept order <Check size={14}/></button></>}
            {order.status === 'accepted' && <><button type="button" className="button button-outline" disabled={orderBusyId === order.id} onClick={() => void transitionOfficialOrder(order, 'cancelled', 'Cancelled by HarvestLink Official Market')}>Cancel order</button><button type="button" className="button button-primary" disabled={orderBusyId === order.id} onClick={() => void transitionOfficialOrder(order, 'ready')}>Mark ready <Check size={14}/></button></>}
            {order.status === 'ready' && <button type="button" className="button button-primary" disabled={orderBusyId === order.id} onClick={() => void transitionOfficialOrder(order, 'completed')}>Mark completed <Check size={14}/></button>}
            {order.status === 'completed' && <span className="admin-order-state"><CheckCircle2 size={14}/> Completed</span>}
            {order.status === 'cancelled' && <span className="admin-order-state">Closed · {order.cancellationReason || 'Cancelled'}</span>}
          </div>
        </article>)}</div>}
      <Notice kind="warning">Delivery and payment are demo representations only. This portal does not connect to a logistics provider or collect real payments.</Notice>
    </section>

    <Notice kind="info">Duplicate matches are a review signal, not proof of wrongdoing. A flag never removes a product automatically. Moderation is reserved for listings owned by independent farmers.</Notice>
    <section className="admin-listing-panel">
      <div className="admin-listing-heading"><div><span className="eyebrow">MARKETPLACE SAFETY</span><h2>Farmer listing moderation</h2><p className="admin-section-copy">Review and moderate independent farmer listings without taking over their inventory workspace.</p></div><span className="table-count">{rows.length} listings</span></div>
      <div className="admin-filters"><div className="admin-search"><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search produce, farmer or location"/></div><div className="inventory-filter-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'flagged' ? 'active' : ''} onClick={() => setFilter('flagged')}>Needs review <span>{flaggedCount}</span></button><button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Active</button><button className={filter === 'inactive' ? 'active' : ''} onClick={() => setFilter('inactive')}>Paused</button></div></div>
      {rows.length === 0 ? <EmptyState title="Nothing to review here" detail="Try another filter or search term. New independent farmer listings will appear here."/> :
        <div className="inventory-table-wrap"><table className="inventory-table admin-table"><thead><tr><th>Listing</th><th>Seller / location</th><th>Price</th><th>Stock</th><th>Review signal</th><th>Status</th><th>Moderation actions</th></tr></thead><tbody>{rows.map(product => {
          const duplicate = isDuplicate(product, duplicateSet);
          const flagged = product.flagged || duplicate;
          return <tr key={product.id}><td><div className="table-product"><img src={product.imageUrl} alt=""/><div><strong>{product.name}</strong><small>{product.category} · Updated {new Date(product.updatedAt).toLocaleDateString('en-IN')}</small></div></div></td>
            <td><strong className="admin-seller">{product.farmName}</strong><small className="admin-location">{product.farmerName} · {product.location}</small></td><td><Money value={product.price} unit={product.unit}/></td><td>{product.quantityAvailable} {product.unit}</td>
            <td>{flagged ? <span className="review-flag"><AlertTriangle size={13}/>{duplicate ? 'Possible duplicate' : 'Flagged'}</span> : <span className="review-clear"><CheckCircle2 size={13}/>No flag</span>}{product.flagReason && <small className="flag-reason">{product.flagReason}</small>}</td>
            <td><span className={'listing-pill ' + (product.isActive ? 'listing-active' : 'listing-paused')}>{product.isActive ? 'Active' : 'Paused'}</span></td>
            <td><div className="admin-action-group"><button type="button" disabled={busyId === product.id} title="Flag for review" aria-label={'Flag ' + product.name} onClick={() => void executeModeration(product, 'flag')}><AlertTriangle size={14}/></button>{product.isActive && <button type="button" disabled={busyId === product.id} title="Deactivate" aria-label={'Deactivate ' + product.name} onClick={() => void executeModeration(product, 'deactivate')}><EyeOff size={14}/></button>}<button type="button" disabled={busyId === product.id} title="Remove listing" aria-label={'Remove ' + product.name} className="action-danger" onClick={() => void executeModeration(product, 'remove')}><Trash2 size={14}/></button></div></td>
          </tr>;
        })}</tbody></table></div>}
    </section>

    <section className="moderation-history-panel"><div className="admin-listing-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent moderation history</h2></div><span className="table-count">{moderationLogs.length} recorded actions</span></div>{moderationLogs.length === 0 ? <p className="moderation-history-empty">Moderation actions will appear here after an admin flags, pauses or removes a farmer listing.</p> : <div className="moderation-history-list">{moderationLogs.slice(0, 8).map(log => <div className="moderation-history-row" key={log.id}><span className={'moderation-action-mark moderation-' + log.action}>{log.action === 'flag' ? <AlertTriangle size={15}/> : log.action === 'deactivate' ? <EyeOff size={15}/> : <Trash2 size={15}/>}</span><div><strong>{log.productName || log.productId}</strong><small>{log.action.charAt(0).toUpperCase() + log.action.slice(1)} · {log.reason}</small></div><time dateTime={log.timestamp}>{new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>)}</div>}</section>
    <div className="admin-bottom-note"><ShieldCheck size={16}/><span>Portal boundaries are enforced by role checks. Farmers manage only their own inventory; buyers can only browse and order; admin actions on farmer listings are recorded.</span><ArrowRight size={15}/></div>
    {catalogFormOpen && <Modal wide title={editingOfficialProduct ? 'Edit official marketplace product' : 'Add product to the official marketplace'} detail="This item will be owned and maintained by the HarvestLink admin portal, independently of farmer inventory." onClose={() => { setCatalogFormOpen(false); setEditingOfficialProduct(undefined); }}><ProductForm initial={editingOfficialProduct} onSave={saveProduct} onClose={() => { setCatalogFormOpen(false); setEditingOfficialProduct(undefined); }}/></Modal>}
  </main>;
}
