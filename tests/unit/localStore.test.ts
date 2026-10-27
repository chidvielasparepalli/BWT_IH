import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '../../src/lib/demo';
import { changeOrderLocal, createOrdersLocal, deleteProductLocal, getOrders, getProducts, readDB, saveProductLocal, setProductActiveLocal, writeDB } from '../../src/lib/localStore';
import type { ProductDraft } from '../../src/types';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  get length() { return this.data.size; }
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  readDB();
});

describe('role-separated portal permissions', () => {
  it('allows farmers and admins to create only their own listings, and lets admins fulfil orders for official products', () => {
    const admin = DEMO_USERS.find(user => user.role === 'admin')!;
    const buyer = DEMO_USERS.find(user => user.role === 'buyer')!;
    const farmer = DEMO_USERS.find(user => user.role === 'farmer')!;
    const draft: ProductDraft = {
      name: 'Official Tomatoes', description: 'Admin-managed tomatoes', category: 'Vegetables',
      imageUrl: 'https://example.com/tomatoes.jpg', unit: 'kg', quantityAvailable: 20, price: 40,
      minOrderQty: 1, availableFrom: '2026-10-27', fulfillmentMethod: 'both', location: 'Hyderabad, Telangana',
    };
    const product = saveProductLocal(admin, draft);
    expect(product.farmerId).toBe(admin.uid);
    expect(product.farmerName).toBe('HarvestLink Admin');
    expect(product.farmName).toBe('HarvestLink Official Market');
    expect(() => saveProductLocal(buyer, draft)).toThrow('Only farmers and administrators');
    expect(() => saveProductLocal(admin, draft, 'demo-product-1')).toThrow();
    expect(() => saveProductLocal(farmer, draft, product.id)).toThrow();
    expect(() => setProductActiveLocal(buyer, 'demo-product-1', false)).toThrow();
    expect(() => setProductActiveLocal(admin, 'demo-product-1', false)).toThrow();
    expect(() => deleteProductLocal(admin, 'demo-product-1')).toThrow();

    const order = createOrdersLocal(buyer, [{ productId: product.id, quantity: 2 }], { [admin.uid]: 'pickup' }, 'cash-on-pickup')[0];
    expect(order.farmerId).toBe(admin.uid);
    expect(() => changeOrderLocal(farmer, order.id, 'accepted')).toThrow('assigned to your portal');
    changeOrderLocal(admin, order.id, 'accepted');
    changeOrderLocal(admin, order.id, 'ready');
    changeOrderLocal(admin, order.id, 'completed');
    expect(getOrders().find(saved => saved.id === order.id)?.status).toBe('completed');
    expect(getProducts().find(saved => saved.id === product.id)?.quantityAvailable).toBe(18);
  });
});

describe('persisted local demo order lifecycle', () => {
  it('repairs broken/mismatched seeded produce images in an existing browser database', () => {
    const db = readDB();
    db.products.find(p => p.id === 'demo-product-3')!.imageUrl = 'https://images.unsplash.com/photo-1659261200830-4b7db7ebf4ac?auto=format&fit=crop&w=1000&q=82';
    db.products.find(p => p.id === 'demo-product-4')!.imageUrl = 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=1000&q=82';
    writeDB(db);
    const repaired = readDB();
    expect(repaired.products.find(p => p.id === 'demo-product-3')?.imageUrl).toContain('photo-1683543122945-513029986574');
    expect(repaired.products.find(p => p.id === 'demo-product-4')?.imageUrl).toContain('photo-1425543103986-22abb7d7e8d2');
  });

  it('reserves stock at request time and restores it on buyer cancellation exactly once', () => {
    const buyer = DEMO_USERS.find(u => u.uid === 'buyer-household')!;
    const product = getProducts().find(p => p.name === 'Tomato')!;
    const stockBefore = product.quantityAvailable;
    const order = createOrdersLocal(buyer, [{ productId: product.id, quantity: 2 }], { [product.farmerId]: 'pickup' }, 'cash-on-pickup')[0];
    expect(getProducts().find(p => p.id === product.id)?.quantityAvailable).toBe(stockBefore - 2);
    changeOrderLocal(buyer, order.id, 'cancelled', 'Cancelled by buyer');
    expect(getProducts().find(p => p.id === product.id)?.quantityAvailable).toBe(stockBefore);
    expect(getOrders().find(o => o.id === order.id)?.status).toBe('cancelled');
    expect(() => changeOrderLocal(buyer, order.id, 'cancelled', 'Repeat cancellation')).toThrow();
    expect(getProducts().find(p => p.id === product.id)?.quantityAvailable).toBe(stockBefore);
  });

  it('restores stock when a farmer rejects a requested order', () => {
    const buyer = DEMO_USERS.find(u => u.uid === 'buyer-household')!;
    const product = getProducts().find(p => p.name === 'Red Onion')!;
    const farmer = DEMO_USERS.find(u => u.uid === product.farmerId)!;
    const stockBefore = product.quantityAvailable;
    const order = createOrdersLocal(buyer, [{ productId: product.id, quantity: 2 }], { [product.farmerId]: 'pickup' }, 'simulated')[0];
    changeOrderLocal(farmer, order.id, 'cancelled', 'Rejected by farmer');
    expect(getProducts().find(p => p.id === product.id)?.quantityAvailable).toBe(stockBefore);
    expect(getOrders().find(o => o.id === order.id)?.cancellationReason).toBe('Rejected by farmer');
  });

  it('keeps historic order totals and unit-price snapshots after the listing price changes', () => {
    const buyer = DEMO_USERS.find(u => u.uid === 'buyer-household')!;
    const product = getProducts().find(p => p.name === 'Tomato')!;
    const farmer = DEMO_USERS.find(u => u.uid === product.farmerId)!;
    const order = createOrdersLocal(buyer, [{ productId: product.id, quantity: 2 }], { [product.farmerId]: 'pickup' }, 'cash-on-pickup')[0];
    const draft: ProductDraft = {
      name: product.name, description: product.description, category: product.category, imageUrl: product.imageUrl,
      unit: product.unit, quantityAvailable: product.quantityAvailable - 2, price: product.price + 12,
      minOrderQty: product.minOrderQty, availableFrom: product.availableFrom, fulfillmentMethod: product.fulfillmentMethod,
      location: product.location,
    };
    saveProductLocal(farmer, draft, product.id);
    const saved = getOrders().find(o => o.id === order.id)!;
    expect(getProducts().find(p => p.id === product.id)?.price).toBe(product.price + 12);
    expect(saved.items[0].unitPrice).toBe(product.price);
    expect(saved.totalAmount).toBe(product.price * 2);
  });

  it('blocks invalid transitions after a request has been cancelled', () => {
    const buyer = DEMO_USERS.find(u => u.uid === 'buyer-household')!;
    const product = getProducts().find(p => p.name === 'Cucumber')!;
    const order = createOrdersLocal(buyer, [{ productId: product.id, quantity: 1 }], { [product.farmerId]: 'pickup' }, 'cash-on-pickup')[0];
    changeOrderLocal(buyer, order.id, 'cancelled');
    const farmer = DEMO_USERS.find(u => u.uid === product.farmerId)!;
    expect(() => changeOrderLocal(farmer, order.id, 'accepted')).toThrow();
  });
});
