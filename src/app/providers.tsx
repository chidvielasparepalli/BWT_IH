import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { mongoApiEnabled, modeLabel } from '../lib/config';
import { getAuthToken, setAuthToken } from '../lib/authToken';
import { mongoRequest, type MongoDataSnapshot } from '../lib/mongoApi';
import {
  authenticateLocal, changeOrderLocal, confirmAvailabilityLocal, createOrdersLocal, deleteProductLocal,
  getLocalUser, getModerationLogs, getOrdersFor, getProducts, getSessionUid, loadDemoData, moderateProductLocal,
  readDB, registerLocal, saveProductLocal, setProductActiveLocal, setSessionUid,
} from '../lib/localStore';
import type { AppUser, CartLine, ModerationLog, Order, OrderStatus, PaymentMethod, Product, ProductDraft, ToastMessage } from '../types';

type LoginInput = { email: string; password: string };
type RegisterInput = { email: string; password: string; name: string; role: 'buyer' | 'farmer'; location: string; buyerType?: AppUser['buyerType'] };
type AppContextValue = {
  user: AppUser | null; ready: boolean; productsReady: boolean; products: Product[]; orders: Order[]; moderationLogs: ModerationLog[]; toasts: ToastMessage[];
  modeLabel: string; signIn: (input: LoginInput) => Promise<void>; signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>; loadDemo: () => Promise<void>; saveProduct: (draft: ProductDraft, productId?: string, file?: File | null) => Promise<void>;
  setProductActive: (productId: string, active: boolean) => Promise<void>; deleteProduct: (productId: string) => Promise<void>;
  moderateProduct: (productId: string, action: 'flag' | 'deactivate' | 'remove', reason: string) => Promise<void>;
  confirmAvailability: (productId: string) => Promise<void>;
  checkout: (lines: CartLine[], fulfillmentByFarmer: Record<string, 'pickup' | 'delivery'>, payment: PaymentMethod) => Promise<Order[]>;
  changeOrder: (orderId: string, next: OrderStatus, reason?: string) => Promise<void>;
  toast: (title: string, kind?: ToastMessage['kind'], detail?: string) => void;
};
const Ctx = createContext<AppContextValue | null>(null);

async function compressImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
  if (file.size > 6 * 1024 * 1024) throw new Error('Image must be under 6 MB.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image(); img.onerror = () => reject(new Error('This image could not be opened.'));
    img.onload = () => {
      const scale = Math.min(1, 1100 / img.width, 1100 / img.height);
      const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) return reject(new Error('Image processing is unavailable.'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/webp', 0.78));
    }; img.src = dataUrl;
  });
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [moderationLogs, setModerationLogs] = useState<ModerationLog[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const lastUserRef = useRef<AppUser | null>(null);

  const toast = (title: string, kind: ToastMessage['kind'] = 'success', detail?: string) => {
    const item = { id: crypto.randomUUID(), title, kind, detail };
    setToasts(previous => [...previous, item]);
    window.setTimeout(() => setToasts(previous => previous.filter(t => t.id !== item.id)), 3800);
  };
  const refreshMongoData = async () => {
    if (!mongoApiEnabled || !getAuthToken()) return;
    const snapshot = await mongoRequest<MongoDataSnapshot>('/api/data');
    setProducts(snapshot.products);
    setOrders(snapshot.orders);
    setModerationLogs(snapshot.moderationLogs);
    setProductsReady(true);
  };

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      if (mongoApiEnabled) {
        const token = getAuthToken();
        if (token) {
          try {
            const result = await mongoRequest<{ user: AppUser }>('/api/auth/me');
            if (!disposed) setUser(result.user);
          } catch {
            setAuthToken(null);
          }
        }
        if (!disposed) setReady(true);
        return;
      }
      const uid = getSessionUid();
      if (uid && !disposed) setUser(getLocalUser(uid) ?? null);
      if (!disposed) setReady(true);
    };
    void initialize();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setModerationLogs([]);
      if (mongoApiEnabled) {
        let stopped = false;
        setProductsReady(false);
        void mongoRequest<{ products: Product[] }>('/api/products/public')
          .then(result => { if (!stopped) setProducts(result.products); })
          .catch(() => { if (!stopped) setProducts([]); })
          .finally(() => { if (!stopped) setProductsReady(true); });
        return () => { stopped = true; };
      }
      setProducts(getProducts().filter(p => p.isActive && !p.isDeleted));
      setProductsReady(true);
      return;
    }
    if (mongoApiEnabled) {
      let stopped = false;
      let lastError = false;
      const refresh = async () => {
        try {
          const snapshot = await mongoRequest<MongoDataSnapshot>('/api/data');
          if (stopped) return;
          setProducts(snapshot.products);
          setOrders(snapshot.orders);
          setModerationLogs(snapshot.moderationLogs);
          setProductsReady(true);
          lastError = false;
        } catch (error) {
          if (stopped) return;
          setProductsReady(true);
          if (!lastError) toast('MongoDB data could not be loaded', 'error', error instanceof Error ? error.message : 'Check the API connection.');
          lastError = true;
        }
      };
      setProductsReady(false);
      void refresh();
      const timer = window.setInterval(() => { void refresh(); }, 15000);
      return () => { stopped = true; window.clearInterval(timer); };
    }
    const dbData = readDB();
    setProducts(dbData.products.filter(p => !p.isDeleted && (p.isActive || (user.role !== 'buyer' && p.farmerId === user.uid) || user.role === 'admin')));
    setProductsReady(true);
    setOrders(getOrdersFor(user));
    setModerationLogs(user.role === 'admin' ? getModerationLogs() : []);
  }, [user?.uid, user?.role]);

  const signIn = async ({ email, password }: LoginInput) => {
    if (mongoApiEnabled) {
      const result = await mongoRequest<{ user: AppUser; token: string }>('/api/auth/login', {
        method: 'POST', body: { email: email.trim(), password },
      });
      setAuthToken(result.token);
      setUser(result.user);
    } else {
      const found = authenticateLocal(email, password);
      setSessionUid(found.uid);
      setUser(found);
    }
  };
  const signUp = async (input: RegisterInput) => {
    if (mongoApiEnabled) {
      const result = await mongoRequest<{ user: AppUser; token: string }>('/api/auth/register', {
        method: 'POST',
        body: { email: input.email.trim(), password: input.password, name: input.name.trim(), role: input.role, location: input.location.trim(), buyerType: input.role === 'buyer' ? input.buyerType : undefined },
      });
      setAuthToken(result.token);
      setUser(result.user);
    } else {
      const created = registerLocal(input);
      setSessionUid(created.uid);
      setUser(created);
    }
  };
  const signOut = async () => {
    if (mongoApiEnabled) setAuthToken(null);
    else setSessionUid(null);
    setUser(null);
    setProductsReady(false);
  };
  const loadDemo = async () => {
    if (mongoApiEnabled) {
      toast('MongoDB mode is ready for real accounts', 'info', 'Create a buyer or farmer account. To provision the admin portal, run the one-time admin setup command in the README.');
    } else {
      const result = loadDemoData();
      setProducts(getProducts().filter(p => p.isActive && !p.isDeleted));
      toast('Demo marketplace loaded', 'success', `${result.products} listings and ${result.farmers} farmer accounts are ready.`);
    }
  };
  const saveProduct = async (draft: ProductDraft, productId?: string, file?: File | null) => {
    if (!user || (user.role !== 'farmer' && user.role !== 'admin')) throw new Error('Only farmers and administrators can manage product listings.');
    let imageUrl = draft.imageUrl;
    if (mongoApiEnabled) {
      if (file) imageUrl = await compressImage(file);
      await mongoRequest('/api/products', { method: 'POST', body: { ...draft, imageUrl, productId: productId ?? null } });
      await refreshMongoData();
    } else {
      if (file) imageUrl = await compressImage(file);
      saveProductLocal(user, { ...draft, imageUrl }, productId);
      setProducts(readDB().products.filter(p => !p.isDeleted && (p.isActive || p.farmerId === user.uid || user.role === 'admin')));
    }
    toast(productId ? 'Listing updated' : 'Produce added', 'success', 'Your changes are saved.');
  };
  const setProductActive = async (productId: string, active: boolean) => {
    if (!user || (user.role !== 'farmer' && user.role !== 'admin')) throw new Error('Only farmers and administrators can manage product listings.');
    if (mongoApiEnabled) {
      await mongoRequest(`/api/products/${encodeURIComponent(productId)}/active`, { method: 'PATCH', body: { active } });
      await refreshMongoData();
    } else {
      setProductActiveLocal(user, productId, active);
      setProducts(readDB().products.filter(p => !p.isDeleted && (p.isActive || p.farmerId === user.uid || user.role === 'admin')));
    }
    toast(active ? 'Listing activated' : 'Listing paused');
  };
  const deleteProduct = async (productId: string) => {
    if (!user || (user.role !== 'farmer' && user.role !== 'admin')) throw new Error('Only farmers and administrators can manage product listings.');
    if (mongoApiEnabled) {
      await mongoRequest(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
      await refreshMongoData();
    } else {
      deleteProductLocal(user, productId);
      setProducts(readDB().products.filter(p => !p.isDeleted && (p.isActive || p.farmerId === user.uid || user.role === 'admin')));
    }
    toast('Listing removed', 'success', 'Historical orders are preserved.');
  };
  const moderateProduct = async (productId: string, action: 'flag' | 'deactivate' | 'remove', reason: string) => {
    if (!user || user.role !== 'admin') throw new Error('Administrator permission required.');
    if (mongoApiEnabled) {
      await mongoRequest(`/api/products/${encodeURIComponent(productId)}/moderate`, { method: 'POST', body: { action, reason } });
      await refreshMongoData();
    } else {
      moderateProductLocal(user, productId, action, reason);
      setProducts(readDB().products.filter(p => !p.isDeleted));
      setModerationLogs(getModerationLogs());
    }
    toast('Moderation saved', 'success', 'The action and reason have been recorded.');
  };
  const confirmAvailability = async (productId: string) => {
    if (!user || (user.role !== 'farmer' && user.role !== 'admin')) throw new Error('Only farmers and administrators can confirm listing availability.');
    if (mongoApiEnabled) {
      await mongoRequest(`/api/products/${encodeURIComponent(productId)}/confirm-availability`, { method: 'POST' });
      await refreshMongoData();
    } else {
      confirmAvailabilityLocal(user, productId);
      setProducts(getProducts().filter(p => !p.isDeleted && (p.isActive || p.farmerId === user.uid || user.role === 'admin')));
    }
    toast('Availability confirmed', 'success', 'The confirmation time has been updated.');
  };
  const checkout = async (lines: CartLine[], fulfillmentByFarmer: Record<string, 'pickup' | 'delivery'>, payment: PaymentMethod) => {
    if (!user || user.role !== 'buyer') throw new Error('Only buyer accounts can place orders.');
    let created: Order[];
    if (mongoApiEnabled) {
      const result = await mongoRequest<{ orders: Order[] }>('/api/orders', { method: 'POST', body: { lines, fulfillmentByFarmer, paymentMethod: payment } });
      created = result.orders;
      await refreshMongoData();
    } else {
      created = createOrdersLocal(user, lines, fulfillmentByFarmer, payment);
      const data = readDB();
      setProducts(data.products.filter(p => !p.isDeleted && (p.isActive || p.farmerId === user.uid)));
      setOrders(getOrdersFor(user));
    }
    toast('Order request sent', 'success', `${created.length} farmer order${created.length === 1 ? '' : 's'} created.`);
    return created;
  };
  const changeOrder = async (orderId: string, next: OrderStatus, reason = '') => {
    if (!user || !['buyer', 'farmer', 'admin'].includes(user.role)) throw new Error('Sign in with an eligible HarvestLink account first.');
    if (mongoApiEnabled) {
      await mongoRequest(`/api/orders/${encodeURIComponent(orderId)}/transition`, { method: 'POST', body: { nextStatus: next, reason } });
      await refreshMongoData();
    } else {
      changeOrderLocal(user, orderId, next, reason);
      const data = readDB();
      setProducts(data.products.filter(p => !p.isDeleted && (p.isActive || p.farmerId === user.uid || user.role === 'admin')));
      setOrders(getOrdersFor(user));
    }
    toast(next === 'cancelled' ? 'Order cancelled' : `Order marked ${next}`);
  };

  const value = useMemo<AppContextValue>(() => ({
    user, ready, productsReady, products, orders, moderationLogs, toasts, modeLabel, signIn, signUp, signOut, loadDemo, saveProduct,
    setProductActive, deleteProduct, moderateProduct, confirmAvailability, checkout, changeOrder, toast,
  }), [user, ready, productsReady, products, orders, moderationLogs, toasts]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useApp(): AppContextValue {
  const value = useContext(Ctx); if (!value) throw new Error('useApp must be used inside AppProvider.'); return value;
}
