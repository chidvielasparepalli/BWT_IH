import type { CartLine, Fulfillment, OrderStatus, PaymentMethod, Product } from '../types';

export type CartProblem = { productId: string; message: string };
export function validateQuantity(quantity: unknown, product: Pick<Product, 'quantityAvailable' | 'minOrderQty'>): string | null {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return 'Enter a valid number.';
  if (quantity <= 0) return 'Quantity must be greater than zero.';
  if (quantity < product.minOrderQty) return `Minimum order is ${product.minOrderQty}.`;
  if (quantity > product.quantityAvailable) return `Only ${product.quantityAvailable} available right now.`;
  return null;
}
export function calculateTotal(lines: Array<{ quantity: number; unitPrice: number }>): number {
  if (lines.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
    throw new Error('Invalid order line.');
  }
  return Math.round(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * 100) / 100;
}
export function validateCheckout(lines: CartLine[], products: Product[], buyerId: string): CartProblem[] {
  const problems: CartProblem[] = [];
  for (const line of lines) {
    const product = products.find(p => p.id === line.productId);
    if (!product || !product.isActive || product.isDeleted) { problems.push({ productId: line.productId, message: 'This listing is no longer available.' }); continue; }
    if (product.farmerId === buyerId) { problems.push({ productId: line.productId, message: 'Farmers cannot order their own listings.' }); continue; }
    const problem = validateQuantity(line.quantity, product);
    if (problem) problems.push({ productId: line.productId, message: problem });
  }
  return problems;
}
export function canTransition(current: OrderStatus, next: OrderStatus, actorRole: 'buyer' | 'farmer' | 'admin'): boolean {
  if (actorRole === 'buyer') return current === 'requested' && next === 'cancelled';
  if (actorRole === 'farmer' || actorRole === 'admin') {
    // Admins use this lifecycle only for orders fulfilled by their own official-market listings.
    // The caller must enforce order ownership before invoking this transition check.
    return (current === 'requested' && (next === 'accepted' || next === 'cancelled')) ||
      (current === 'accepted' && (next === 'ready' || next === 'cancelled')) ||
      (current === 'ready' && next === 'completed');
  }
  return false;
}
export function compatibleFulfillment(method: Fulfillment, requested: 'pickup' | 'delivery'): boolean {
  return method === 'both' || method === requested;
}
/** Resolve a fulfillment method for every product in one farmer group. Prefers the user's choice when still valid, otherwise chooses a supported option. */
export function resolveFulfillment(products: Array<Pick<Product, 'fulfillmentMethod'>>, preferred?: 'pickup' | 'delivery'): 'pickup' | 'delivery' | null {
  const canPickup = products.length > 0 && products.every(product => compatibleFulfillment(product.fulfillmentMethod, 'pickup'));
  const canDelivery = products.length > 0 && products.every(product => compatibleFulfillment(product.fulfillmentMethod, 'delivery'));
  if (preferred === 'pickup' && canPickup) return 'pickup';
  if (preferred === 'delivery' && canDelivery) return 'delivery';
  if (canPickup) return 'pickup';
  if (canDelivery) return 'delivery';
  return null;
}
export function reserveStock(product: Product, quantity: number): Product {
  const problem = validateQuantity(quantity, product);
  if (problem) throw new Error(problem);
  return { ...product, quantityAvailable: product.quantityAvailable - quantity, updatedAt: new Date().toISOString() };
}
export function restoreStock(product: Product, quantity: number): Product {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Invalid stock restoration quantity.');
  return { ...product, quantityAvailable: product.quantityAvailable + quantity, updatedAt: new Date().toISOString() };
}
export type { PaymentMethod };
