import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });
const db = getFirestore();
const adminAuth = getAuth();
type Role = 'buyer' | 'farmer' | 'admin';
type Status = 'requested' | 'accepted' | 'ready' | 'completed' | 'cancelled';
const allowedUnits = new Set(['kg', 'quintal', 'dozen', 'bunch', 'piece']);
const allowedCategories = new Set(['Vegetables', 'Fruits', 'Grains', 'Spices', 'Oilseeds']);
const allowedFulfillment = new Set(['pickup', 'delivery', 'both']);
const money = (n: number) => Math.round(n * 100) / 100;
function fail(code: 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'not-found' | 'failed-precondition' | 'already-exists' | 'internal', message: string): never {
  throw new HttpsError(code, message);
}
async function requireProfile(uid: string, roles: Role[]) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) fail('permission-denied', 'User profile is missing.');
  const data = snap.data()!;
  if (!roles.includes(data.role as Role)) fail('permission-denied', 'Your account role cannot perform this action.');
  return data;
}
function actor(request: any) {
  if (!request.auth?.uid) fail('unauthenticated', 'Sign in to continue.');
  return { uid: String(request.auth.uid), role: String(request.auth.token?.role ?? '') };
}
function validateQty(quantity: unknown, stock: number, min: number) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) fail('invalid-argument', 'Quantity must be a finite number greater than zero.');
  if (quantity < min) fail('invalid-argument', 'Quantity does not meet the minimum order amount of ' + min + '.');
  if (quantity > stock) fail('failed-precondition', 'Only ' + stock + ' currently available.');
}
function validTransition(current: Status, next: Status, role: Role) {
  if (role === 'buyer') return current === 'requested' && next === 'cancelled';
  if (role === 'farmer' || role === 'admin') return (current === 'requested' && (next === 'accepted' || next === 'cancelled')) ||
    (current === 'accepted' && (next === 'ready' || next === 'cancelled')) || (current === 'ready' && next === 'completed');
  return false;
}
function dateOnly(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('invalid-argument', 'Use a valid availability date.');
  const parsed = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(parsed.getTime())) fail('invalid-argument', 'Use a valid availability date.');
  return value;
}
function boundedText(value: unknown, label: string, max = 140) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max) fail('invalid-argument', label + ' is required and must be under ' + max + ' characters.');
  return value.trim();
}

export const createOrder = onCall(async request => {
  const caller = actor(request);
  const buyer = await requireProfile(caller.uid, ['buyer']);
  const data = request.data ?? {};
  if (!Array.isArray(data.lines) || data.lines.length < 1 || data.lines.length > 80) fail('invalid-argument', 'Select at least one product and no more than 80 lines.');
  const paymentMethod = data.paymentMethod;
  if (!['cash-on-pickup', 'simulated'].includes(paymentMethod)) fail('invalid-argument', 'Unsupported payment method.');
  const fulfillmentByFarmer = data.fulfillmentByFarmer && typeof data.fulfillmentByFarmer === 'object' ? data.fulfillmentByFarmer : {};
  const merged = new Map<string, number>();
  for (const line of data.lines) {
    if (!line || typeof line.productId !== 'string' || !line.productId || line.productId.length > 160) fail('invalid-argument', 'Invalid product reference.');
    if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) fail('invalid-argument', 'Quantity must be greater than zero.');
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  }
  const productRefs = Array.from(merged.keys()).map(productId => db.collection('products').doc(productId));
  const orderIds = new Map<string, FirebaseFirestore.DocumentReference>();
  const stamp = new Date().toISOString();
  const created = await db.runTransaction(async tx => {
    const products = new Map<string, any>();
    for (const ref of productRefs) {
      const snap = await tx.get(ref);
      if (!snap.exists) fail('not-found', 'One of the products in your cart was removed.');
      products.set(ref.id, { ref, data: snap.data() });
    }
    const grouped = new Map<string, any[]>();
    const reserved: Array<{ ref: FirebaseFirestore.DocumentReference; nextStock: number }> = [];
    const createdOrders: any[] = [];
    for (const [productId, quantity] of merged.entries()) {
      const record = products.get(productId)!;
      const p = record.data;
      if (!p.isActive || p.isDeleted) fail('failed-precondition', (p.name || 'A product') + ' is no longer available.');
      if (p.farmerId === caller.uid) fail('permission-denied', 'Farmers cannot order their own listings.');
      const stock = Number(p.quantityAvailable);
      const min = Number(p.minOrderQty);
      validateQty(quantity, stock, min);
      const requested = fulfillmentByFarmer[p.farmerId] ?? 'pickup';
      if (!['pickup', 'delivery'].includes(requested)) fail('invalid-argument', 'Unsupported fulfillment option.');
      if (p.fulfillmentMethod !== 'both' && p.fulfillmentMethod !== requested) fail('failed-precondition', (p.name || 'This item') + ' does not support ' + requested + '.');
      if (!allowedUnits.has(p.unit)) fail('failed-precondition', 'Product unit is not supported.');
      const line = {
        productId, productName: String(p.name), unit: p.unit, quantity, unitPrice: Number(p.price),
        lineTotal: money(Number(p.price) * quantity), imageUrl: String(p.imageUrl || ''),
      };
      if (!Number.isFinite(line.unitPrice) || line.unitPrice <= 0) fail('failed-precondition', 'Product pricing is invalid.');
      grouped.set(String(p.farmerId), [...(grouped.get(String(p.farmerId)) ?? []), { line, product: p, ref: record.ref, requested }]);
      reserved.push({ ref: record.ref, nextStock: stock - quantity });
    }
    for (const [farmerId, group] of grouped.entries()) {
      const first = group[0];
      const orderRef = db.collection('orders').doc();
      const items = group.map(item => item.line);
      const totalAmount = money(items.reduce((sum: number, item: any) => sum + item.lineTotal, 0));
      const history = [{ status: 'requested', timestamp: stamp, actorUid: caller.uid, actorRole: 'buyer' }];
      const order = {
        buyerId: caller.uid, buyerName: String(buyer.name || request.auth?.token?.name || buyer.email || 'Buyer'),
        farmerId, farmerName: String(first.product.farmerName || 'Local farmer'), status: 'requested', totalAmount,
        fulfillmentMethod: first.requested, paymentMethod, items, createdAt: stamp, updatedAt: stamp,
        statusHistory: history, stockRestoredAt: null,
      };
      tx.create(orderRef, order);
      items.forEach((item: any) => tx.create(orderRef.collection('items').doc(), item));
      createdOrders.push({ id: orderRef.id, ...order });
    }
    for (const item of reserved) tx.update(item.ref, { quantityAvailable: item.nextStock, updatedAt: stamp });
    return createdOrders;
  });
  return { orders: created };
});

export const transitionOrder = onCall(async request => {
  const caller = actor(request);
  const data = request.data ?? {};
  const orderId = boundedText(data.orderId, 'Order ID', 180);
  const next = data.nextStatus as Status;
  if (!['accepted', 'ready', 'completed', 'cancelled'].includes(next)) fail('invalid-argument', 'Unsupported order status.');
  const reason = typeof data.reason === 'string' ? data.reason.trim().slice(0, 240) : '';
  const user = await requireProfile(caller.uid, ['buyer', 'farmer', 'admin']);
  const orderRef = db.collection('orders').doc(orderId);
  await db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) fail('not-found', 'Order not found.');
    const order = orderSnap.data()!;
    if (user.role === 'buyer' && order.buyerId !== caller.uid) fail('permission-denied', 'You cannot manage this order.');
    if ((user.role === 'farmer' || user.role === 'admin') && order.farmerId !== caller.uid) fail('permission-denied', 'You can only manage orders assigned to your portal.');
    if (!validTransition(order.status as Status, next, user.role as Role)) fail('failed-precondition', 'This order cannot move from ' + order.status + ' to ' + next + '.');
    const itemsQuery = orderRef.collection('items');
    const itemSnaps = await tx.get(itemsQuery);
    const productSnapshots: Array<{ ref: FirebaseFirestore.DocumentReference; data: any; quantity: number }> = [];
    if (next === 'cancelled') {
      if (order.stockRestoredAt) fail('failed-precondition', 'Stock has already been restored.');
      for (const itemDoc of itemSnaps.docs) {
        const item = itemDoc.data();
        const pRef = db.collection('products').doc(String(item.productId));
        const pSnap = await tx.get(pRef);
        if (pSnap.exists) productSnapshots.push({ ref: pRef, data: pSnap.data(), quantity: Number(item.quantity) });
      }
    }
    const stamp = new Date().toISOString();
    const labelReason = reason || (next === 'cancelled' ? (user.role === 'buyer' ? 'Cancelled by buyer' : 'Rejected or cancelled by farmer') : '');
    const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    tx.update(orderRef, {
      status: next, updatedAt: stamp,
      statusHistory: [...history, { status: next, timestamp: stamp, actorUid: caller.uid, actorRole: user.role, reason: labelReason || null }],
      ...(next === 'cancelled' ? { cancelledBy: caller.uid, cancellationReason: labelReason, stockRestoredAt: stamp } : {}),
    });
    for (const p of productSnapshots) tx.update(p.ref, { quantityAvailable: Number(p.data.quantityAvailable || 0) + p.quantity, updatedAt: stamp });
  });
  return { ok: true, orderId, status: next };
});

export const saveProduct = onCall(async request => {
  const caller = actor(request);
  const user = await requireProfile(caller.uid, ['farmer', 'admin']);
  const data = request.data ?? {};
  const name = boundedText(data.name, 'Product name', 100);
  const description = typeof data.description === 'string' ? data.description.slice(0, 1200) : '';
  const category = String(data.category);
  const unit = String(data.unit);
  const method = String(data.fulfillmentMethod);
  const price = Number(data.price), quantityAvailable = Number(data.quantityAvailable), minOrderQty = Number(data.minOrderQty);
  if (!allowedCategories.has(category)) fail('invalid-argument', 'Choose a valid product category.');
  if (!allowedUnits.has(unit)) fail('invalid-argument', 'Choose a valid product unit.');
  if (!allowedFulfillment.has(method)) fail('invalid-argument', 'Choose a valid fulfillment method.');
  if (!Number.isFinite(price) || price <= 0) fail('invalid-argument', 'Price must be greater than zero.');
  if (!Number.isFinite(quantityAvailable) || quantityAvailable < 0) fail('invalid-argument', 'Quantity cannot be negative.');
  if (!Number.isFinite(minOrderQty) || minOrderQty <= 0 || minOrderQty > Math.max(1, quantityAvailable)) fail('invalid-argument', 'Minimum order quantity is invalid.');
  const availableFrom = dateOnly(data.availableFrom);
  const location = boundedText(data.location, 'Location', 160);
  const imageUrl = boundedText(data.imageUrl, 'Image URL', 1800);
  if (!/^https:\/\//.test(imageUrl)) fail('invalid-argument', 'Use an HTTPS image URL or upload a photo.');
  const farmerProfileSnap = await db.collection('farmerProfiles').doc(caller.uid).get();
  const farmProfile = farmerProfileSnap.data() ?? {};
  const productId = typeof data.productId === 'string' && data.productId ? data.productId : db.collection('products').doc().id;
  const ref = db.collection('products').doc(productId);
  const stamp = new Date().toISOString();
  await db.runTransaction(async tx => {
    const oldSnap = await tx.get(ref);
    if (oldSnap.exists && oldSnap.data()!.farmerId !== caller.uid) fail('permission-denied', 'You cannot edit another farmer\'s listing.');
    const old = oldSnap.data() ?? {};
    const item = {
      farmerId: caller.uid,
      farmerName: user.role === 'admin' ? 'HarvestLink Admin' : String(user.name || 'Farmer'),
      farmName: user.role === 'admin' ? 'HarvestLink Official Market' : String(farmProfile.farmName || (String(user.name || 'Farmer') + "'s Farm")),
      farmerStory: user.role === 'admin' ? 'An official marketplace listing managed by the HarvestLink team.' : String(farmProfile.description || 'A local farmer growing seasonal produce.'),
      name, normalizedName: name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), description, category, imageUrl,
      unit, quantityAvailable, price, minOrderQty, availableFrom, fulfillmentMethod: method, location,
      isActive: oldSnap.exists ? Boolean(old.isActive) : true, isDeleted: false, flagged: Boolean(old.flagged),
      flagReason: old.flagReason ?? null, lastAvailabilityConfirmedAt: old.lastAvailabilityConfirmedAt || stamp,
      createdAt: old.createdAt || stamp, updatedAt: stamp,
    };
    if (oldSnap.exists) tx.set(ref, item, { merge: true }); else tx.create(ref, item);
  });
  return { productId };
});

export const setProductActive = onCall(async request => {
  const caller = actor(request);
  const profile = await requireProfile(caller.uid, ['farmer', 'admin']);
  const productId = boundedText(request.data?.productId, 'Product ID', 180);
  if (typeof request.data?.active !== 'boolean') fail('invalid-argument', 'An active state is required.');
  const ref = db.collection('products').doc(productId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'Listing not found.');
    if (snap.data()!.farmerId !== caller.uid) fail('permission-denied', 'You cannot update this listing.');
    tx.update(ref, { isActive: request.data.active, updatedAt: new Date().toISOString() });
  });
  return { ok: true };
});

export const deleteProduct = onCall(async request => {
  const caller = actor(request);
  const profile = await requireProfile(caller.uid, ['farmer', 'admin']);
  const productId = boundedText(request.data?.productId, 'Product ID', 180);
  const ref = db.collection('products').doc(productId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'Listing not found.');
    if (snap.data()!.farmerId !== caller.uid) fail('permission-denied', 'You can only remove listings owned by your portal.');
    tx.update(ref, { isActive: false, isDeleted: true, updatedAt: new Date().toISOString() });
  });
  return { ok: true };
});

export const moderateProduct = onCall(async request => {
  const caller = actor(request);
  await requireProfile(caller.uid, ['admin']);
  const { productId, action } = request.data ?? {};
  const id = boundedText(productId, 'Product ID', 180);
  if (!['flag', 'deactivate', 'remove'].includes(action)) fail('invalid-argument', 'Unsupported moderation action.');
  const reason = boundedText(request.data?.reason, 'Moderation reason', 240);
  const ref = db.collection('products').doc(id);
  const stamp = new Date().toISOString();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'Listing not found.');
    const update: Record<string, unknown> = { updatedAt: stamp, flagged: true, flagReason: reason };
    if (action === 'deactivate' || action === 'remove') update.isActive = false;
    if (action === 'remove') update.isDeleted = true;
    tx.update(ref, update);
    const logRef = db.collection('moderationLogs').doc();
    tx.create(logRef, { productId: id, productName: String(snap.data()!.name || id), action, reason, actorUid: caller.uid, timestamp: stamp });
  });
  return { ok: true };
});

export const confirmAvailability = onCall(async request => {
  const caller = actor(request);
  await requireProfile(caller.uid, ['farmer', 'admin']);
  const productId = boundedText(request.data?.productId, 'Product ID', 180);
  const ref = db.collection('products').doc(productId);
  const stamp = new Date().toISOString();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'Listing not found.');
    if (snap.data()!.farmerId !== caller.uid) fail('permission-denied', 'Only the owner can confirm availability.');
    tx.update(ref, { lastAvailabilityConfirmedAt: stamp, updatedAt: stamp });
  });
  return { ok: true, confirmedAt: stamp };
});

const demoSeedEnabled = process.env.DEMO_SEED_ENABLED === 'true';
export const seedDemoData = onCall(async request => {
  if (!demoSeedEnabled) fail('permission-denied', 'Demo seeding is disabled for this Firebase project.');
  if (request.auth?.uid) {
    const profile = await db.collection('users').doc(request.auth.uid).get();
    if (profile.data()?.role !== 'admin') fail('permission-denied', 'Only an administrator can load demo data after signing in.');
  }
  const password = 'HarvestLink#2026';
  const farmRecords = [
    { email: 'guntur@harvestlink.demo', name: 'Srinivas Reddy', location: 'Guntur, Andhra Pradesh', farmName: 'Reddy Family Fields', story: 'Three generations growing Guntur vegetables with careful morning harvesting.' },
    { email: 'warangal@harvestlink.demo', name: 'Lakshmi Devi', location: 'Warangal, Telangana', farmName: 'Swarna Bhoomi Farm', story: 'A small mixed-crop farm growing seasonal greens and vegetables near Warangal.' },
    { email: 'nizamabad@harvestlink.demo', name: 'Mohammed Kareem', location: 'Nizamabad, Telangana', farmName: 'Nizamabad Harvest Co.', story: 'Local produce and staple grains grown across the black-soil belt.' },
    { email: 'khammam@harvestlink.demo', name: 'Padma Rao', location: 'Khammam, Telangana', farmName: 'Godavari Green Acres', story: 'Family-run fields supplying fresh vegetables around Khammam.' },
    { email: 'vijayawada@harvestlink.demo', name: 'Anil Kumar', location: 'Vijayawada, Andhra Pradesh', farmName: 'Krishna River Farms', story: 'Seasonal fruit and vegetable harvests from the fertile Krishna region.' },
  ];
  const buyerRecords = [
    { email: 'buyer@harvestlink.demo', name: 'Madhavi Sharma', location: 'Hyderabad, Telangana', buyerType: 'household' },
    { email: 'restaurant@harvestlink.demo', name: 'Arjun Kitchens', location: 'Secunderabad, Telangana', buyerType: 'restaurant' },
    { email: 'retailer@harvestlink.demo', name: 'Fresh Corner Store', location: 'Warangal, Telangana', buyerType: 'retailer' },
  ];
  const records: Array<any> = [];
  for (const [i, f] of farmRecords.entries()) records.push({ ...f, role: 'farmer' as Role, index: i });
  for (const buyer of buyerRecords) records.push({ ...buyer, role: 'buyer' as Role });
  records.push({ email: 'admin@harvestlink.demo', name: 'HarvestLink Admin', location: 'Hyderabad, Telangana', role: 'admin' as Role });
  const uidByEmail = new Map<string, string>();
  for (const r of records) {
    let authUser;
    try { authUser = await adminAuth.getUserByEmail(r.email); }
    catch { authUser = await adminAuth.createUser({ email: r.email, password, displayName: r.name, emailVerified: false }); }
    uidByEmail.set(r.email, authUser.uid);
    const profileRef = db.collection('users').doc(authUser.uid);
    const old = await profileRef.get();
    if (!old.exists) await profileRef.set({ uid: authUser.uid, email: r.email, name: r.name, role: r.role, location: r.location, buyerType: r.buyerType ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    if (r.role === 'farmer') {
      const farmerRef = db.collection('farmerProfiles').doc(authUser.uid);
      if (!(await farmerRef.get()).exists) await farmerRef.set({ farmName: r.farmName, location: r.location, description: r.story, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
  }
  const rows = [
    ['Tomato','Vegetables','kg',28,85,1,0,'photo-1546094096-0df4bcaaa337'],
    ['Red Onion','Vegetables','kg',32,120,2,0,'photo-1508747703725-719777637510'],
    ['Brinjal','Vegetables','kg',36,48,1,1,'photo-1659261200830-4b7db7ebf4ac'],
    ['Okra / Bendakaya','Vegetables','kg',42,35,1,0,'photo-1518977676601-b53f82aba655'],
    ['Green Chilli','Vegetables','kg',58,26,1,0,'photo-1588252303782-cb80119abd6d'],
    ['Spinach','Vegetables','bunch',18,40,2,0,'photo-1576045057995-568f588f82fb'],
    ['Mango','Fruits','kg',95,65,2,2,'photo-1553279768-865429fa0078'],
    ['Banana','Fruits','dozen',48,55,1,1,'photo-1571771894821-ce9b6c11b08e'],
    ['Sweet Lime','Fruits','kg',62,70,2,1,'photo-1547514701-42782101795e'],
    ['Papaya','Fruits','kg',38,31,1,2,'photo-1517282009859-f000ec3b26fe'],
    ['Paddy Rice','Grains','quintal',2450,12,1,0,'photo-1536304993881-ff6e9eefa2a6'],
    ['Maize','Grains','quintal',2180,18,1,0,'photo-1551754655-cd27e38d2076'],
    ['Cucumber','Vegetables','kg',24,52,1,0,'photo-1604977042946-1eecc30f269e'],
    ['Bottle Gourd','Vegetables','piece',22,28,1,1,'photo-1597362925123-77861d3fbac7'],
    ['Coriander Leaves','Vegetables','bunch',15,3,1,0,'photo-1556801712-76c8eb07bbc9'],
    ['Guava','Fruits','kg',54,42,2,2,'photo-1536511132770-e5058c7e8c46'],
    ['Turmeric','Spices','kg',145,24,1,3,'photo-1615485290382-441e4d049cb5'],
    ['Groundnut','Oilseeds','kg',112,36,2,0,'photo-1567892737950-30c4db37cd89'],
    ['Ridge Gourd','Vegetables','kg',34,4,1,0,'photo-1566385101042-1a0aa0c1268c'],
    ['Pomegranate','Fruits','kg',120,0,2,3,'photo-1541344999736-83eca272f6fc'],
  ];
  const stamp = new Date().toISOString();
  const batch = db.batch();
  let productCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const f = farmRecords[i % farmRecords.length];
    const farmerId = uidByEmail.get(f.email)!;
    const ref = db.collection('products').doc('demo-product-' + (i + 1));
    const old = await ref.get();
    if (old.exists) continue;
    const imageUrl = 'https://images.unsplash.com/' + row[7] + '?auto=format&fit=crop&w=1000&q=82';
    batch.create(ref, {
      id: ref.id, farmerId, farmerName: f.name, farmName: f.farmName, farmerStory: f.story,
      name: row[0], normalizedName: String(row[0]).toLowerCase(), description: 'Fresh ' + String(row[0]).toLowerCase() + ' harvested by ' + f.farmName + '. Availability is confirmed by the farmer.',
      category: row[1], unit: row[2], price: row[3], quantityAvailable: row[4], minOrderQty: row[5],
      availableFrom: new Date(Date.now() + Number(row[6]) * 86400000).toISOString().slice(0, 10),
      fulfillmentMethod: i % 4 === 0 ? 'pickup' : i % 4 === 1 ? 'both' : 'delivery', location: f.location,
      imageUrl, isActive: true, isDeleted: false, flagged: i === 2, flagReason: i === 2 ? 'Possible duplicate — review listing details' : null,
      lastAvailabilityConfirmedAt: new Date(Date.now() - (i % 5) * 3600000).toISOString(), createdAt: stamp, updatedAt: stamp,
    });
    productCount++;
  }
  await batch.commit();
  return { ok: true, createdAccounts: records.length, productsAdded: productCount, message: 'Demo data is ready. Demo password: ' + password };
});
