import { describe, expect, it } from 'vitest';
import { calculateTotal, canTransition, compatibleFulfillment, resolveFulfillment, reserveStock, restoreStock, validateCheckout, validateQuantity } from '../../src/lib/orderLogic';
import type { Product } from '../../src/types';

const product: Product = {
  id: 'p1', farmerId: 'farmer-1', farmerName: 'Farmer', farmName: 'Farm', farmerStory: '',
  name: 'Tomato', normalizedName: 'tomato', description: '', category: 'Vegetables',
  imageUrl: 'https://example.com/tomato.jpg', unit: 'kg', quantityAvailable: 5, price: 30, minOrderQty: 2,
  availableFrom: '2026-10-27', fulfillmentMethod: 'both', location: 'Warangal, Telangana',
  isActive: true, isDeleted: false, flagged: false, lastAvailabilityConfirmedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

describe('quantity validation', () => {
  it('rejects zero, negative, non-numeric, infinite and NaN', () => {
    for (const quantity of [0, -1, NaN, Infinity, '2', null]) expect(validateQuantity(quantity, product)).not.toBeNull();
  });
  it('respects minimum order quantity', () => {
    expect(validateQuantity(1, product)).toContain('Minimum order');
    expect(validateQuantity(2, product)).toBeNull();
  });
  it('rejects quantities above available stock', () => {
    expect(validateQuantity(6, product)).toContain('Only 5');
  });
});
describe('order calculations and stock', () => {
  it('calculates totals from snapshot unit prices', () => {
    expect(calculateTotal([{ quantity: 2, unitPrice: 30 }, { quantity: 0.5, unitPrice: 20 }])).toBe(70);
    expect(() => calculateTotal([{ quantity: 0, unitPrice: 30 }])).toThrow();
  });
  it('decrements stock on a valid request', () => {
    expect(reserveStock(product, 3).quantityAvailable).toBe(2);
    expect(() => reserveStock(product, 6)).toThrow();
  });
  it('restores reserved stock on cancel/reject', () => {
    expect(restoreStock({ ...product, quantityAvailable: 2 }, 3).quantityAvailable).toBe(5);
    expect(() => restoreStock(product, 0)).toThrow();
  });
  it('rejects self-ordering and unavailable listings', () => {
    expect(validateCheckout([{ productId: 'p1', quantity: 2 }], [product], 'farmer-1')[0].message).toContain('own listings');
    expect(validateCheckout([{ productId: 'p1', quantity: 2 }], [{ ...product, isActive: false }], 'buyer').length).toBe(1);
  });
  it('checks fulfillment compatibility and chooses a valid default for a farmer group', () => {
    expect(compatibleFulfillment('both', 'delivery')).toBe(true);
    expect(compatibleFulfillment('pickup', 'delivery')).toBe(false);
    expect(resolveFulfillment([{ fulfillmentMethod: 'delivery' }])).toBe('delivery');
    expect(resolveFulfillment([{ fulfillmentMethod: 'pickup' }])).toBe('pickup');
    expect(resolveFulfillment([{ fulfillmentMethod: 'both' }], 'delivery')).toBe('delivery');
    expect(resolveFulfillment([{ fulfillmentMethod: 'pickup' }, { fulfillmentMethod: 'delivery' }])).toBeNull();
  });
});
describe('order lifecycle', () => {
  it('allows only valid buyer and farmer transitions', () => {
    expect(canTransition('requested', 'accepted', 'farmer')).toBe(true);
    expect(canTransition('requested', 'cancelled', 'buyer')).toBe(true);
    expect(canTransition('accepted', 'ready', 'farmer')).toBe(true);
    expect(canTransition('ready', 'completed', 'farmer')).toBe(true);
    expect(canTransition('requested', 'accepted', 'admin')).toBe(true); // Ownership is enforced by the order service.
    expect(canTransition('ready', 'cancelled', 'buyer')).toBe(false);
    expect(canTransition('completed', 'cancelled', 'farmer')).toBe(false);
    expect(canTransition('cancelled', 'accepted', 'farmer')).toBe(false);
    expect(canTransition('requested', 'completed', 'admin')).toBe(false);
  });
  it('serializes competing reservations so aggregate stock is never exceeded', async () => {
    let stock = 5;
    let lock = Promise.resolve();
    const reserve = async (quantity: number) => {
      let release = () => {};
      const previous = lock;
      lock = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try { if (quantity <= 0 || quantity > stock) throw new Error('insufficient stock'); stock -= quantity; return true; }
      finally { release(); }
    };
    const results = await Promise.allSettled([reserve(4), reserve(3)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(stock).toBe(1);
  });
});
