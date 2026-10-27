import type { AppUser, CartLine, Order, OrderStatus, PaymentMethod, Product, ProductDraft, StatusEvent, ModerationLog } from '../types';
import { createDemoProducts, DEMO_USERS } from './demo';
import { canTransition, calculateTotal, compatibleFulfillment, reserveStock, restoreStock, validateCheckout } from './orderLogic';

type LocalDB = { users: AppUser[]; products: Product[]; orders: Order[]; moderationLogs: ModerationLog[]; credentials: Record<string, string>; seedVersion: number };
const KEY = 'harvestlink.db.v1';
const SESSION_KEY = 'harvestlink.session.v1';
const iso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export function initialDB(): LocalDB {
  const users = DEMO_USERS.map(u => ({ ...u }));
  return {
    users, products: createDemoProducts(), orders: [], moderationLogs: [],
    credentials: Object.fromEntries(users.map(u => [u.email.toLowerCase(), 'HarvestLink#2026'])), seedVersion: 1,
  };
}
export function readDB(): LocalDB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as LocalDB;
      if (db.seedVersion && Array.isArray(db.products) && Array.isArray(db.users) && Array.isArray(db.orders)) {
        let migrated = false;
        if (!Array.isArray(db.moderationLogs)) { db.moderationLogs = []; migrated = true; }
        // Repair two seeded produce images in existing browser databases without overwriting user-uploaded images.
        for (const product of db.products) {
          if (product.id === 'demo-product-3' && product.imageUrl.includes('photo-1659261200830-4b7db7ebf4ac')) {
            product.imageUrl = 'https://images.unsplash.com/photo-1683543122945-513029986574?auto=format&fit=crop&w=1000&q=82';
            migrated = true;
          }
          if (product.id === 'demo-product-4' && product.imageUrl.includes('photo-1518977676601-b53f82aba655')) {
            product.imageUrl = 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?auto=format&fit=crop&w=1000&q=82';
            migrated = true;
          }
        }
        if (migrated) writeDB(db);
        return db;
      }
    }
  } catch { /* corrupted local demo data will be rebuilt below */ }
  const db = initialDB();
  writeDB(db);
  return db;
}
export function writeDB(db: LocalDB): void { localStorage.setItem(KEY, JSON.stringify(db)); }
export function getSessionUid(): string | null { return localStorage.getItem(SESSION_KEY); }
export function setSessionUid(uid: string | null): void {
  if (uid) localStorage.setItem(SESSION_KEY, uid); else localStorage.removeItem(SESSION_KEY);
}
export function loadDemoData(): { products: number; farmers: number } {
  const db = readDB();
  const seeded = initialDB();
  for (const user of seeded.users) if (!db.users.some(existing => existing.uid === user.uid)) db.users.push(user);
  for (const product of seeded.products) if (!db.products.some(existing => existing.id === product.id)) db.products.push(product);
  for (const user of seeded.users) if (!db.credentials[user.email.toLowerCase()]) db.credentials[user.email.toLowerCase()] = 'HarvestLink#2026';
  writeDB(db);
  return { products: seeded.products.length, farmers: seeded.users.filter(u => u.role === 'farmer').length };
}
export function authenticateLocal(email: string, password: string): AppUser {
  const db = readDB();
  const normalized = email.trim().toLowerCase();
  if (db.credentials[normalized] !== password) throw new Error('Email or password is incorrect.');
  const user = db.users.find(u => u.email.toLowerCase() === normalized);
  if (!user) throw new Error('This account is missing. Load demo data and try again.');
  return user;
}
export function registerLocal(input: { email: string; password: string; name: string; role: 'buyer' | 'farmer'; location: string; buyerType?: AppUser['buyerType'] }): AppUser {
  const db = readDB();
  const email = input.email.trim().toLowerCase();
  if (db.users.some(u => u.email.toLowerCase() === email)) throw new Error('An account with this email already exists.');
  const user: AppUser = { uid: id('user'), email, name: input.name.trim(), role: input.role, location: input.location.trim(), buyerType: input.role === 'buyer' ? input.buyerType : undefined };
  db.users.push(user);
  db.credentials[email] = input.password;
  writeDB(db);
  if (user.role === 'farmer') {
    const profile = { uid: user.uid, farmName: `${user.name}'s Farm`, location: user.location, description: 'A local farm growing seasonal produce.' };
    localStorage.setItem(`harvestlink.farm.${user.uid}`, JSON.stringify(profile));
  }
  return user;
}
export function getLocalUser(uid: string): AppUser | undefined { return readDB().users.find(u => u.uid === uid); }
export function getProducts(): Product[] { return readDB().products; }
export function getOrders(): Order[] { return readDB().orders; }
export function saveProductLocal(farmer: AppUser, draft: ProductDraft, productId?: string): Product {
  if (farmer.role !== 'farmer' && farmer.role !== 'admin') throw new Error('Only farmers and administrators can manage product listings.');
  const db = readDB();
  const old = productId ? db.products.find(p => p.id === productId) : undefined;
  if (productId && !old) throw new Error('Listing not found.');
  if (old && old.farmerId !== farmer.uid) throw new Error('You cannot edit another farmer\'s listing.');
  const stamp = iso();
  const product: Product = {
    id: old?.id ?? id('product'), farmerId: farmer.uid,
    farmerName: farmer.role === 'admin' ? 'HarvestLink Admin' : farmer.name,
    farmName: farmer.role === 'admin' ? 'HarvestLink Official Market' : (localStorage.getItem(`harvestlink.farm.${farmer.uid}`) ? (JSON.parse(localStorage.getItem(`harvestlink.farm.${farmer.uid}`)!).farmName as string) : `${farmer.name}'s Farm`),
    farmerStory: farmer.role === 'admin' ? 'An official marketplace listing managed by the HarvestLink team.' : 'A local farm growing seasonal produce with care.',
    ...draft, normalizedName: draft.name.trim().toLowerCase(), isActive: old?.isActive ?? true,
    isDeleted: false, flagged: old?.flagged ?? false, flagReason: old?.flagReason,
    lastAvailabilityConfirmedAt: old?.lastAvailabilityConfirmedAt ?? stamp,
    createdAt: old?.createdAt ?? stamp, updatedAt: stamp,
  };
  db.products = old ? db.products.map(p => p.id === old.id ? product : p) : [product, ...db.products];
  writeDB(db);
  return product;
}
export function setProductActiveLocal(user: AppUser, productId: string, active: boolean): void {
  const db = readDB();
  const product = db.products.find(p => p.id === productId);
  if (!product) throw new Error('Listing not found.');
  if ((user.role !== 'farmer' && user.role !== 'admin') || product.farmerId !== user.uid) throw new Error('You can only update listings owned by your portal.');
  product.isActive = active; product.updatedAt = iso(); writeDB(db);
}
export function deleteProductLocal(user: AppUser, productId: string): void {
  const db = readDB(); const product = db.products.find(p => p.id === productId);
  if (!product) throw new Error('Listing not found.');
  if ((user.role !== 'farmer' && user.role !== 'admin') || product.farmerId !== user.uid) throw new Error('You can only remove listings owned by your portal.');
  product.isDeleted = true; product.isActive = false; product.updatedAt = iso(); writeDB(db);
}
export function moderateProductLocal(user: AppUser, productId: string, action: 'flag' | 'deactivate' | 'remove', reason: string): void {
  if (user.role !== 'admin') throw new Error('Administrator permission required.');
  const db = readDB(); const product = db.products.find(p => p.id === productId);
  if (!product) throw new Error('Listing not found.');
  if (action === 'flag') { product.flagged = true; product.flagReason = reason || 'Flagged for review'; }
  if (action === 'deactivate') { product.isActive = false; product.flagged = true; product.flagReason = reason || 'Deactivated by administrator'; }
  if (action === 'remove') { product.isDeleted = true; product.isActive = false; product.flagged = true; product.flagReason = reason || 'Removed by administrator'; }
  const timestamp = iso();
  product.updatedAt = timestamp;
  db.moderationLogs.unshift({ id: id('moderation'), productId: product.id, productName: product.name, action, reason: reason || product.flagReason || 'Reviewed by administrator', actorUid: user.uid, timestamp });
  writeDB(db);
}
export function getModerationLogs(): ModerationLog[] { return readDB().moderationLogs.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)); }
export function confirmAvailabilityLocal(user: AppUser, productId: string): void {
  const db = readDB(); const p = db.products.find(x => x.id === productId);
  if (!p || p.farmerId !== user.uid || (user.role !== 'farmer' && user.role !== 'admin')) throw new Error('Only the listing owner can confirm availability.');
  p.lastAvailabilityConfirmedAt = iso(); p.updatedAt = iso(); writeDB(db);
}
export function createOrdersLocal(buyer: AppUser, lines: CartLine[], fulfillmentByFarmer: Record<string, 'pickup' | 'delivery'>, paymentMethod: PaymentMethod): Order[] {
  if (buyer.role !== 'buyer') throw new Error('Only buyers can place orders.');
  const db = readDB();
  const merged = new Map<string, number>();
  for (const line of lines) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  const normalizedLines = Array.from(merged, ([productId, quantity]) => ({ productId, quantity }));
  const problems = validateCheckout(normalizedLines, db.products, buyer.uid);
  if (problems.length) throw new Error(problems.map(p => p.message).join(' '));
  const chosen = normalizedLines.map(line => {
    const product = db.products.find(p => p.id === line.productId)!;
    const fulfillment = fulfillmentByFarmer[product.farmerId] ?? 'pickup';
    if (!compatibleFulfillment(product.fulfillmentMethod, fulfillment)) throw new Error(`${product.name} does not support ${fulfillment}.`);
    return { product, quantity: line.quantity, fulfillment };
  });
  const groups = new Map<string, typeof chosen>();
  for (const line of chosen) groups.set(line.product.farmerId, [...(groups.get(line.product.farmerId) ?? []), line]);
  // Validate all items before mutating the database: local demo equivalent of an atomic transaction.
  for (const line of chosen) {
    const product = db.products.find(p => p.id === line.product.id)!;
    if (product.quantityAvailable < line.quantity) throw new Error(`Stock changed for ${product.name}; review your cart.`);
  }
  const result: Order[] = [];
  for (const [farmerId, group] of groups) {
    const farmer = db.users.find(u => u.uid === farmerId);
    const stamp = iso();
    const items = group.map(({ product, quantity }) => ({
      productId: product.id, productName: product.name, unit: product.unit, quantity, unitPrice: product.price,
      lineTotal: Math.round(product.price * quantity * 100) / 100, imageUrl: product.imageUrl,
    }));
    const fulfillmentMethod = group[0].fulfillment;
    const order: Order = {
      id: id('order'), buyerId: buyer.uid, buyerName: buyer.name, farmerId, farmerName: farmer?.name ?? group[0].product.farmerName,
      status: 'requested', totalAmount: calculateTotal(items.map(item => ({ quantity: item.quantity, unitPrice: item.unitPrice }))),
      fulfillmentMethod, paymentMethod, items, createdAt: stamp, updatedAt: stamp,
      statusHistory: [{ status: 'requested', timestamp: stamp, actorUid: buyer.uid, actorRole: 'buyer' }],
    };
    result.push(order);
  }
  for (const line of chosen) {
    const product = db.products.find(p => p.id === line.product.id)!;
    product.quantityAvailable -= line.quantity; product.updatedAt = iso();
  }
  db.orders.unshift(...result); writeDB(db);
  return result;
}
export function changeOrderLocal(user: AppUser, orderId: string, next: OrderStatus, reason = ''): Order {
  const db = readDB(); const order = db.orders.find(o => o.id === orderId);
  if (!order) throw new Error('Order not found.');
  if (user.role === 'buyer' && order.buyerId !== user.uid) throw new Error('You cannot manage this order.');
  if ((user.role === 'farmer' || user.role === 'admin') && order.farmerId !== user.uid) throw new Error('You can only manage orders assigned to your portal.');
  if (!canTransition(order.status, next, user.role)) throw new Error(`Cannot move an order from ${order.status} to ${next}.`);
  const stamp = iso();
  if (next === 'cancelled') {
    if (order.stockRestoredAt) throw new Error('Stock has already been restored.');
    for (const item of order.items) {
      const product = db.products.find(p => p.id === item.productId);
      if (product) { const restored = restoreStock(product, item.quantity); product.quantityAvailable = restored.quantityAvailable; product.updatedAt = stamp; }
    }
    order.stockRestoredAt = stamp; order.cancelledBy = user.uid;
    order.cancellationReason = reason || (user.role === 'buyer' ? 'Cancelled by buyer' : 'Rejected or cancelled by farmer');
  }
  order.status = next; order.updatedAt = stamp;
  order.statusHistory.push({ status: next, timestamp: stamp, actorUid: user.uid, actorRole: user.role, reason: reason || undefined } as StatusEvent);
  writeDB(db); return order;
}
export function listFarmerProducts(uid: string): Product[] { return getProducts().filter(p => p.farmerId === uid && !p.isDeleted); }
export function getOrdersFor(user: AppUser): Order[] {
  const db = readDB();
  if (user.role === 'admin') return db.orders;
  return db.orders.filter(o => user.role === 'buyer' ? o.buyerId === user.uid : o.farmerId === user.uid);
}
export function getAllUsersLocal(): AppUser[] { return readDB().users; }
