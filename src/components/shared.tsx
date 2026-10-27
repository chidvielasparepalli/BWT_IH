import { ArrowUpRight, Check, Clock3, MapPin, Package, Plus, ShieldAlert, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OrderStatus, Product } from '../types';
import { Link } from 'react-router-dom';

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className="brand-lockup" aria-label="HarvestLink home">
    <span className="brand-mark"><span>h</span><i /></span>
    {!compact && <span className="brand-name">harvest<span>link</span><small>LOCAL FOOD, FAIRLY GROWN</small></span>}
  </Link>;
}
export function Money({ value, unit }: { value: number; unit?: string }) {
  return <span className="money">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)}{unit ? <small>/{unit}</small> : null}</span>;
}
export function dateLabel(date: string) {
  if (!date) return 'Date not set';
  return new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function freshnessLabel(timestamp: string) {
  const age = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(age) || age < 0) return 'Not confirmed';
  if (age < 6 * 3600000) return 'Confirmed today';
  if (age < 24 * 3600000) return 'Updated today';
  if (age < 72 * 3600000) return 'Check availability';
  return 'Not recently confirmed';
}
const statusNames: Record<OrderStatus, string> = { requested: 'Requested', accepted: 'Accepted', ready: 'Ready for pickup', completed: 'Completed', cancelled: 'Cancelled' };
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge status-${status}`}><span />{statusNames[status]}</span>;
}
export function ProductCard({ product, onAdd }: { product: Product; onAdd?: (product: Product) => void }) {
  const out = product.quantityAvailable <= 0;
  return <article className="product-card">
    <Link to={`/product/${product.id}`} className="product-image-link" aria-label={`View ${product.name}`}>
      <img className="product-image" src={product.imageUrl} alt={product.name} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80'; }} />
      <span className="image-tag">{product.category}</span>
      {out && <span className="sold-out-tag">Currently out</span>}
    </Link>
    <div className="product-card-content">
      <div className="product-card-heading">
        <Link to={`/product/${product.id}`} className="product-title">{product.name}</Link>
        <Money value={product.price} unit={product.unit} />
      </div>
      <p className="product-farm">{product.farmName}</p>
      <div className="product-meta"><span><MapPin size={13} />{product.location.split(',')[0]}</span><span><Package size={13} />{product.quantityAvailable} {product.unit} left</span></div>
      <div className="product-card-bottom">
        <span className={`freshness ${freshnessLabel(product.lastAvailabilityConfirmedAt).includes('Check') || freshnessLabel(product.lastAvailabilityConfirmedAt).includes('Not') ? 'freshness-muted' : ''}`}><Clock3 size={12}/>{freshnessLabel(product.lastAvailabilityConfirmedAt)}</span>
        {onAdd && <button className="icon-add" type="button" disabled={out} onClick={() => onAdd(product)} aria-label={`Add ${product.name} to cart`}><Plus size={17}/></button>}
        {!onAdd && <Link className="text-link" to={`/product/${product.id}`}>View <ArrowUpRight size={14}/></Link>}
      </div>
    </div>
  </article>;
}
export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warning' | 'success' }) {
  const Icon = kind === 'warning' ? ShieldAlert : kind === 'success' ? Check : Sparkles;
  return <div className={`notice notice-${kind}`}><Icon size={17} aria-hidden="true"/><div>{children}</div></div>;
}
export function EmptyState({ icon = 'package', title, detail, action }: { icon?: 'package' | 'clock'; title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon === 'clock' ? <Clock3 size={23}/> : <Package size={23}/>}</span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}
export function Modal({ title, detail, children, onClose, wide = false }: { title: string; detail?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={`modal-panel ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
      <h2 id="modal-title">{title}</h2>{detail && <p className="modal-detail">{detail}</p>}{children}
    </section>
  </div>;
}
export function ToastViewport({ toasts }: { toasts: Array<{ id: string; title: string; detail?: string; kind: string }> }) {
  return <div className="toast-stack" aria-live="polite" aria-atomic="false">{toasts.map(t => <div key={t.id} className={`toast toast-${t.kind}`}><span className="toast-dot"/><div><strong>{t.title}</strong>{t.detail && <p>{t.detail}</p>}</div></div>)}</div>;
}
