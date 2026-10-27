import type { AppUser, Product } from '../types';

const today = new Date();
const date = (offset: number) => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
export const DEMO_PASSWORD = 'HarvestLink#2026';
export const DEMO_USERS: AppUser[] = [
  { uid: 'farmer-guntur', email: 'guntur@harvestlink.demo', name: 'Srinivas Reddy', role: 'farmer', location: 'Guntur, Andhra Pradesh' },
  { uid: 'farmer-warangal', email: 'warangal@harvestlink.demo', name: 'Lakshmi Devi', role: 'farmer', location: 'Warangal, Telangana' },
  { uid: 'farmer-nizamabad', email: 'nizamabad@harvestlink.demo', name: 'Mohammed Kareem', role: 'farmer', location: 'Nizamabad, Telangana' },
  { uid: 'farmer-khammam', email: 'khammam@harvestlink.demo', name: 'Padma Rao', role: 'farmer', location: 'Khammam, Telangana' },
  { uid: 'farmer-vijayawada', email: 'vijayawada@harvestlink.demo', name: 'Anil Kumar', role: 'farmer', location: 'Vijayawada, Andhra Pradesh' },
  { uid: 'buyer-household', email: 'buyer@harvestlink.demo', name: 'Madhavi Sharma', role: 'buyer', location: 'Hyderabad, Telangana', buyerType: 'household' },
  { uid: 'buyer-restaurant', email: 'restaurant@harvestlink.demo', name: 'Arjun Kitchens', role: 'buyer', location: 'Secunderabad, Telangana', buyerType: 'restaurant' },
  { uid: 'buyer-retailer', email: 'retailer@harvestlink.demo', name: 'Fresh Corner Store', role: 'buyer', location: 'Warangal, Telangana', buyerType: 'retailer' },
  { uid: 'admin-harvestlink', email: 'admin@harvestlink.demo', name: 'HarvestLink Admin', role: 'admin', location: 'Hyderabad, Telangana' },
];
type Farm = { user: AppUser; farm: string; story: string; place: string; };
const farms: Farm[] = [
  { user: DEMO_USERS[0], farm: 'Reddy Family Fields', story: 'Three generations growing Guntur vegetables with careful morning harvesting.', place: 'Guntur, Andhra Pradesh' },
  { user: DEMO_USERS[1], farm: 'Swarna Bhoomi Farm', story: 'A small mixed-crop farm growing seasonal greens and vegetables near Warangal.', place: 'Warangal, Telangana' },
  { user: DEMO_USERS[2], farm: 'Nizamabad Harvest Co.', story: 'Local produce and staple grains grown across the black-soil belt.', place: 'Nizamabad, Telangana' },
  { user: DEMO_USERS[3], farm: 'Godavari Green Acres', story: 'Family-run fields supplying fresh vegetables around Khammam.', place: 'Khammam, Telangana' },
  { user: DEMO_USERS[4], farm: 'Krishna River Farms', story: 'Seasonal fruit and vegetable harvests from the fertile Krishna region.', place: 'Vijayawada, Andhra Pradesh' },
];
const items = [
  ['Tomato', 'Vegetables', 'kg', 28, 85, 1, 0, 'photo-1546094096-0df4bcaaa337'],
  ['Red Onion', 'Vegetables', 'kg', 32, 120, 2, 0, 'photo-1508747703725-719777637510'],
  ['Brinjal', 'Vegetables', 'kg', 36, 48, 1, 1, 'photo-1683543122945-513029986574'],
  ['Okra / Bendakaya', 'Vegetables', 'kg', 42, 35, 1, 0, 'photo-1425543103986-22abb7d7e8d2'],
  ['Green Chilli', 'Vegetables', 'kg', 58, 26, 1, 0, 'photo-1588252303782-cb80119abd6d'],
  ['Spinach', 'Vegetables', 'bunch', 18, 40, 2, 0, 'photo-1576045057995-568f588f82fb'],
  ['Mango', 'Fruits', 'kg', 95, 65, 2, 2, 'photo-1553279768-865429fa0078'],
  ['Banana', 'Fruits', 'dozen', 48, 55, 1, 1, 'photo-1571771894821-ce9b6c11b08e'],
  ['Sweet Lime', 'Fruits', 'kg', 62, 70, 2, 1, 'photo-1547514701-42782101795e'],
  ['Papaya', 'Fruits', 'kg', 38, 31, 1, 2, 'photo-1517282009859-f000ec3b26fe'],
  ['Paddy Rice', 'Grains', 'quintal', 2450, 12, 1, 0, 'photo-1536304993881-ff6e9eefa2a6'],
  ['Maize', 'Grains', 'quintal', 2180, 18, 1, 0, 'photo-1551754655-cd27e38d2076'],
  ['Cucumber', 'Vegetables', 'kg', 24, 52, 1, 0, 'photo-1604977042946-1eecc30f269e'],
  ['Bottle Gourd', 'Vegetables', 'piece', 22, 28, 1, 1, 'photo-1597362925123-77861d3fbac7'],
  ['Coriander Leaves', 'Vegetables', 'bunch', 15, 3, 1, 0, 'photo-1556801712-76c8eb07bbc9'],
  ['Guava', 'Fruits', 'kg', 54, 42, 2, 2, 'photo-1536511132770-e5058c7e8c46'],
  ['Turmeric', 'Spices', 'kg', 145, 24, 1, 3, 'photo-1615485290382-441e4d049cb5'],
  ['Groundnut', 'Oilseeds', 'kg', 112, 36, 2, 0, 'photo-1567892737950-30c4db37cd89'],
  ['Ridge Gourd', 'Vegetables', 'kg', 34, 4, 1, 0, 'photo-1566385101042-1a0aa0c1268c'],
  ['Pomegranate', 'Fruits', 'kg', 120, 0, 2, 3, 'photo-1541344999736-83eca272f6fc'],
] as const;
export function createDemoProducts(): Product[] {
  return items.map((item, i) => {
    const farm = farms[i % farms.length];
    return {
      id: `demo-product-${i + 1}`, farmerId: farm.user.uid, farmerName: farm.user.name, farmName: farm.farm,
      farmerStory: farm.story, name: item[0], normalizedName: item[0].toLowerCase(), category: item[1] as Product['category'],
      imageUrl: `https://images.unsplash.com/${item[7]}?auto=format&fit=crop&w=1000&q=82`,
      unit: item[2] as Product['unit'], price: item[3], quantityAvailable: item[4], minOrderQty: item[5],
      availableFrom: date(item[6]), fulfillmentMethod: i % 4 === 0 ? 'pickup' : i % 4 === 1 ? 'both' : 'delivery',
      location: farm.place, description: `Fresh ${item[0].toLowerCase()} harvested by ${farm.farm}. Harvest quantities are updated by the farmer.`,
      isActive: true, isDeleted: false, flagged: i === 2, flagReason: i === 2 ? 'Possible duplicate — review listing details' : undefined,
      lastAvailabilityConfirmedAt: new Date(Date.now() - (i % 5) * 3600000).toISOString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  });
}
export const DEMO_FARMS = farms.map(f => ({ uid: f.user.uid, farmName: f.farm, location: f.place, description: f.story, farmerName: f.user.name }));
