import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS before seeding.');
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();
const password = 'HarvestLink#2026';
const farms = [
  { email: 'guntur@harvestlink.demo', name: 'Srinivas Reddy', location: 'Guntur, Andhra Pradesh', farmName: 'Reddy Family Fields', story: 'Three generations growing Guntur vegetables with careful morning harvesting.' },
  { email: 'warangal@harvestlink.demo', name: 'Lakshmi Devi', location: 'Warangal, Telangana', farmName: 'Swarna Bhoomi Farm', story: 'A small mixed-crop farm growing seasonal greens and vegetables near Warangal.' },
  { email: 'nizamabad@harvestlink.demo', name: 'Mohammed Kareem', location: 'Nizamabad, Telangana', farmName: 'Nizamabad Harvest Co.', story: 'Local produce and staple grains grown across the black-soil belt.' },
  { email: 'khammam@harvestlink.demo', name: 'Padma Rao', location: 'Khammam, Telangana', farmName: 'Godavari Green Acres', story: 'Family-run fields supplying fresh vegetables around Khammam.' },
  { email: 'vijayawada@harvestlink.demo', name: 'Anil Kumar', location: 'Vijayawada, Andhra Pradesh', farmName: 'Krishna River Farms', story: 'Seasonal fruit and vegetable harvests from the fertile Krishna region.' },
];
const buyers = [
  { email: 'buyer@harvestlink.demo', name: 'Madhavi Sharma', location: 'Hyderabad, Telangana', buyerType: 'household' },
  { email: 'restaurant@harvestlink.demo', name: 'Arjun Kitchens', location: 'Secunderabad, Telangana', buyerType: 'restaurant' },
  { email: 'retailer@harvestlink.demo', name: 'Fresh Corner Store', location: 'Warangal, Telangana', buyerType: 'retailer' },
];
const records: Array<any> = [
  ...farms.map(f => ({ ...f, role: 'farmer' })),
  ...buyers.map(b => ({ ...b, role: 'buyer' })),
  { email: 'admin@harvestlink.demo', name: 'HarvestLink Admin', location: 'Hyderabad, Telangana', role: 'admin' },
];
const uidByEmail = new Map<string, string>();
for (const user of records) {
  let account;
  try { account = await auth.getUserByEmail(user.email); }
  catch { account = await auth.createUser({ email: user.email, password, displayName: user.name }); }
  uidByEmail.set(user.email, account.uid);
  const profile = db.collection('users').doc(account.uid);
  if (!(await profile.get()).exists) await profile.set({ uid: account.uid, email: user.email, name: user.name, role: user.role, location: user.location, buyerType: user.buyerType ?? null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (user.role === 'farmer') {
    const farm = db.collection('farmerProfiles').doc(account.uid);
    if (!(await farm.get()).exists) await farm.set({ farmName: user.farmName, location: user.location, description: user.story, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
}
const products: Array<[string, string, string, number, number, number, number, string]> = [
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
let created = 0;
for (let i = 0; i < products.length; i++) {
  const row = products[i], farm = farms[i % farms.length];
  const ref = db.collection('products').doc('demo-product-' + (i + 1));
  if ((await ref.get()).exists) continue;
  batch.create(ref, {
    id: ref.id, farmerId: uidByEmail.get(farm.email), farmerName: farm.name, farmName: farm.farmName, farmerStory: farm.story,
    name: row[0], normalizedName: row[0].toLowerCase(), description: 'Fresh ' + row[0].toLowerCase() + ' harvested by ' + farm.farmName + '. Availability is confirmed by the farmer.',
    category: row[1], unit: row[2], price: row[3], quantityAvailable: row[4], minOrderQty: row[5],
    availableFrom: new Date(Date.now() + row[6] * 86400000).toISOString().slice(0, 10),
    fulfillmentMethod: i % 4 === 0 ? 'pickup' : i % 4 === 1 ? 'both' : 'delivery', location: farm.location,
    imageUrl: 'https://images.unsplash.com/' + row[7] + '?auto=format&fit=crop&w=1000&q=82',
    isActive: true, isDeleted: false, flagged: i === 2, flagReason: i === 2 ? 'Possible duplicate — review listing details' : null,
    lastAvailabilityConfirmedAt: new Date(Date.now() - (i % 5) * 3600000).toISOString(), createdAt: stamp, updatedAt: stamp,
  });
  created++;
}
await batch.commit();
console.log('HarvestLink demo seed complete. Accounts:', records.length, 'farmers:', farms.length, 'new products:', created);
console.log('Demo password:', password, '. Existing documents were preserved.');