export type Role = 'buyer' | 'farmer' | 'admin';
export type BuyerType = 'household' | 'retailer' | 'restaurant' | 'wholesaler';
export type Category = 'Vegetables' | 'Fruits' | 'Grains' | 'Spices' | 'Oilseeds';
export type Unit = 'kg' | 'quintal' | 'dozen' | 'bunch' | 'piece';
export type Fulfillment = 'pickup' | 'delivery' | 'both';
export type OrderStatus = 'requested' | 'accepted' | 'ready' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash-on-pickup' | 'simulated';

export interface AppUser {
  uid: string; email: string; name: string; role: Role;
  phone?: string; location: string; buyerType?: BuyerType;
}
export interface Product {
  id: string; farmerId: string; farmerName: string; farmName: string; farmerStory: string;
  name: string; normalizedName: string; description: string; category: Category; imageUrl: string;
  unit: Unit; quantityAvailable: number; price: number; minOrderQty: number;
  availableFrom: string; fulfillmentMethod: Fulfillment; location: string;
  isActive: boolean; isDeleted: boolean; flagged: boolean; flagReason?: string;
  lastAvailabilityConfirmedAt: string; createdAt: string; updatedAt: string;
}
export interface OrderItem {
  productId: string; productName: string; unit: Unit; quantity: number;
  unitPrice: number; lineTotal: number; imageUrl: string;
}
export interface StatusEvent {
  status: OrderStatus; timestamp: string; actorUid: string; actorRole: Role; reason?: string;
}
export interface Order {
  id: string; buyerId: string; buyerName: string; farmerId: string; farmerName: string;
  status: OrderStatus; totalAmount: number; fulfillmentMethod: 'pickup' | 'delivery';
  paymentMethod: PaymentMethod; items: OrderItem[]; createdAt: string; updatedAt: string;
  statusHistory: StatusEvent[]; cancellationReason?: string; cancelledBy?: string; stockRestoredAt?: string;
}
export interface CartLine { productId: string; quantity: number; }
export interface ProductDraft {
  name: string; description: string; category: Category; imageUrl: string; unit: Unit;
  quantityAvailable: number; price: number; minOrderQty: number; availableFrom: string;
  fulfillmentMethod: Fulfillment; location: string;
}
export interface ModerationLog { id: string; productId: string; productName: string; action: 'flag' | 'deactivate' | 'remove'; reason: string; actorUid: string; timestamp: string; }
export interface ToastMessage { id: string; title: string; detail?: string; kind: 'success' | 'error' | 'info'; }
