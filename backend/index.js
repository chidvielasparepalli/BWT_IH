import 'dotenv/config';
import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { MongoClient } from 'mongodb';
import { hashPassword, verifyPassword, signToken, verifyToken } from './security.js';

const PORT = Number(process.env.PORT || 4000);
const URI = process.env.MONGODB_URI?.trim();
const DB_NAME = process.env.MONGODB_DB?.trim() || 'harvestlink';
const TOKEN_SECRET = process.env.TOKEN_SECRET?.trim();
if (!URI) { console.error('Missing MONGODB_URI. Run scripts/connect-mongodb.ps1.'); process.exit(1); }
if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) { console.error('Missing/weak TOKEN_SECRET. Re-run scripts/connect-mongodb.ps1 to generate a secure secret.'); process.exit(1); }

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(DB_NAME);
const users = db.collection('users');
const farmerProfiles = db.collection('farmerProfiles');
const products = db.collection('products');
const orders = db.collection('orders');
const moderationLogs = db.collection('moderationLogs');
await Promise.all([
  users.createIndex({ email: 1 }, { unique: true, sparse: true }),
  products.createIndex({ farmerId: 1, isActive: 1, isDeleted: 1 }),
  products.createIndex({ normalizedName: 1 }),
  orders.createIndex({ buyerId: 1, createdAt: -1 }),
  orders.createIndex({ farmerId: 1, createdAt: -1 }),
  moderationLogs.createIndex({ timestamp: -1 }),
]);

const app = express();
app.disable('x-powered-by');
app.use(helmet());
const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb) { if (!origin || origins.includes(origin)) return cb(null, true); cb(new Error('Origin is not allowed by CORS policy.')); }, allowedHeaders: ['Authorization','Content-Type'], methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '8mb' }));

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const route = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const now = () => new Date().toISOString();
const money = n => Math.round(n * 100) / 100;
const units = new Set(['kg','quintal','dozen','bunch','piece']);
const categories = new Set(['Vegetables','Fruits','Grains','Spices','Oilseeds']);
const fulfillmentMethods = new Set(['pickup','delivery','both']);
const payments = new Set(['cash-on-pickup','simulated']);
const publicDoc = doc => { if (!doc) return null; const { _id, passwordHash, ...data } = doc; return { ...data, id: String(_id) }; };
function text(value, label, max=140) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, label+' is required and must be under '+max+' characters.'); return value.trim(); }
function dateOnly(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T12:00:00Z'))) throw new HttpError(400,'Use a valid availability date.'); return value; }
function checkQty(quantity, stock, min) { if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0) throw new HttpError(400,'Quantity must be greater than zero.'); if(quantity<min) throw new HttpError(400,'Minimum order quantity is '+min+'.'); if(quantity>stock) throw new HttpError(409,'Only '+stock+' currently available.'); }
function canTransition(current,next,role) {
  if(role==='buyer') return current==='requested' && next==='cancelled';
  if(role==='farmer'||role==='admin') return (current==='requested'&&['accepted','cancelled'].includes(next))||(current==='accepted'&&['ready','cancelled'].includes(next))||(current==='ready'&&next==='completed');
  return false;
}
async function requireUser(req, roles=[]) {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1];
  if(!token) throw new HttpError(401,'Sign in to continue.');
  const decoded = verifyToken(token, TOKEN_SECRET);
  if(!decoded) throw new HttpError(401,'Your session expired or is invalid. Sign in again.');
  const profile=await users.findOne({_id:decoded.sub});
  if(!profile) throw new HttpError(401,'Account not found. Please sign in again.');
  if(roles.length&&!roles.includes(profile.role)) throw new HttpError(403,'Your account role cannot perform this action.');
  return {uid:String(profile.uid||profile._id),email:profile.email||'',profile};
}
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'harvestlink-api',database:'mongodb'}));
app.get('/api/products/public',route(async(_req,res)=>{
  const rows=await products.find({isActive:true,isDeleted:{$ne:true}}).sort({updatedAt:-1}).limit(500).toArray();
  res.json({products:rows.map(publicDoc)});
}));

app.post('/api/auth/register',route(async(req,res)=>{
  const body=req.body||{};
  const email=text(body.email,'Email',180).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400,'Enter a valid email address.');
  if(!['buyer','farmer'].includes(body.role)) throw new HttpError(400,'Choose a buyer or farmer account.');
  const name=text(body.name,'Name',100), location=text(body.location,'Location',160);
  if(typeof body.password!=='string'||body.password.length<8||body.password.length>200) throw new HttpError(400,'Password must be between 8 and 200 characters.');
  const passwordHash=hashPassword(body.password);
  const old=await users.findOne({email});
  if(old) throw new HttpError(409,'An account with this email already exists. Sign in instead.');
  const uid=crypto.randomUUID(),timestamp=now();
  const profile={_id:uid,uid,email,name,role:body.role,location,passwordHash,
    ...(body.role==='buyer'&&['household','retailer','restaurant','wholesaler'].includes(body.buyerType)?{buyerType:body.buyerType}:{}),
    createdAt:timestamp,updatedAt:timestamp};
  try { await users.insertOne(profile); }
  catch(error) { if(error?.code===11000) throw new HttpError(409,'An account with this email already exists. Sign in instead.'); throw error; }
  if(profile.role==='farmer') await farmerProfiles.insertOne({_id:uid,farmName:name+"'s Farm",location,description:'A local farm growing seasonal produce.',createdAt:timestamp,updatedAt:timestamp});
  res.status(201).json({user:publicDoc(profile),token:signToken(uid,TOKEN_SECRET)});
}));

app.post('/api/auth/login',route(async(req,res)=>{
  const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
  const password=typeof req.body?.password==='string'?req.body.password:'';
  const profile=await users.findOne({email});
  if(!profile?.passwordHash||!verifyPassword(password,profile.passwordHash)) throw new HttpError(401,'Email or password is incorrect.');
  res.json({user:publicDoc(profile),token:signToken(String(profile.uid||profile._id),TOKEN_SECRET)});
}));

app.get('/api/auth/me',route(async(req,res)=>{const a=await requireUser(req);res.json({user:publicDoc({...a.profile,_id:a.uid})});}));

app.get('/api/data',route(async(req,res)=>{
  const a=await requireUser(req);
  const productFilter=a.profile.role==='admin'?{isDeleted:{$ne:true}}:a.profile.role==='farmer'?{farmerId:a.uid,isDeleted:{$ne:true}}:{isActive:true,isDeleted:{$ne:true}};
  const orderFilter=a.profile.role==='buyer'?{buyerId:a.uid}:{farmerId:a.uid};
  const [p,o,l]=await Promise.all([products.find(productFilter).sort({updatedAt:-1}).toArray(),orders.find(orderFilter).sort({createdAt:-1}).toArray(),a.profile.role==='admin'?moderationLogs.find({}).sort({timestamp:-1}).toArray():Promise.resolve([])]);
  res.json({products:p.map(publicDoc),orders:o.map(publicDoc),moderationLogs:l.map(publicDoc)});
}));

app.post('/api/products',route(async(req,res)=>{
  const a=await requireUser(req,['farmer','admin']), d=req.body||{};
  const name=text(d.name,'Product name',100),description=typeof d.description==='string'?d.description.slice(0,1200):'';
  const category=String(d.category),unit=String(d.unit),method=String(d.fulfillmentMethod);
  const price=Number(d.price),quantityAvailable=Number(d.quantityAvailable),minOrderQty=Number(d.minOrderQty);
  if(!categories.has(category)) throw new HttpError(400,'Choose a valid product category.');
  if(!units.has(unit)) throw new HttpError(400,'Choose a valid product unit.');
  if(!fulfillmentMethods.has(method)) throw new HttpError(400,'Choose a valid fulfillment method.');
  if(!Number.isFinite(price)||price<=0) throw new HttpError(400,'Price must be greater than zero.');
  if(!Number.isFinite(quantityAvailable)||quantityAvailable<0) throw new HttpError(400,'Quantity cannot be negative.');
  if(!Number.isFinite(minOrderQty)||minOrderQty<=0||minOrderQty>Math.max(1,quantityAvailable)) throw new HttpError(400,'Minimum order quantity is invalid.');
  const availableFrom=dateOnly(d.availableFrom),location=text(d.location,'Location',160);
  if(typeof d.imageUrl!=='string'||!d.imageUrl.trim()||d.imageUrl.length>7*1024*1024) throw new HttpError(400,'Image is missing or too large.');
  const imageUrl=d.imageUrl.trim();
  if(!/^https:\/\//i.test(imageUrl)&&!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(imageUrl)) throw new HttpError(400,'Use an HTTPS image URL or upload a JPG, PNG or WebP photo.');
  const farm=await farmerProfiles.findOne({_id:a.uid});
  const id=typeof d.productId==='string'&&d.productId.trim()?d.productId.trim():crypto.randomUUID();
  const old=await products.findOne({_id:id});
  if(old&&old.farmerId!==a.uid) throw new HttpError(403,'You cannot edit another farmer\'s listing.');
  const ts=now();
  const p={_id:id,farmerId:a.uid,farmerName:a.profile.role==='admin'?'HarvestLink Admin':String(a.profile.name||'Farmer'),
    farmName:a.profile.role==='admin'?'HarvestLink Official Market':String(farm?.farmName||(a.profile.name+"'s Farm")),
    farmerStory:a.profile.role==='admin'?'An official marketplace listing managed by the HarvestLink team.':String(farm?.description||'A local farmer growing seasonal produce.'),
    name,normalizedName:name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),description,category,imageUrl,unit,quantityAvailable,price,minOrderQty,availableFrom,fulfillmentMethod:method,location,
    isActive:old?Boolean(old.isActive):true,isDeleted:false,flagged:Boolean(old?.flagged),flagReason:old?.flagReason??null,
    lastAvailabilityConfirmedAt:old?.lastAvailabilityConfirmedAt||ts,createdAt:old?.createdAt||ts,updatedAt:ts};
  if(old) await products.replaceOne({_id:id,farmerId:a.uid},p); else await products.insertOne(p);
  res.status(old?200:201).json({product:publicDoc(p)});
}));
app.patch('/api/products/:id/active',route(async(req,res)=>{
  const a=await requireUser(req,['farmer','admin']); if(typeof req.body?.active!=='boolean') throw new HttpError(400,'An active state is required.');
  const r=await products.updateOne({_id:req.params.id,farmerId:a.uid,isDeleted:{$ne:true}},{$set:{isActive:req.body.active,updatedAt:now()}});
  if(!r.matchedCount) throw new HttpError(404,'Listing not found, or it belongs to another portal.'); res.json({ok:true});
}));
app.delete('/api/products/:id',route(async(req,res)=>{
  const a=await requireUser(req,['farmer','admin']);
  const r=await products.updateOne({_id:req.params.id,farmerId:a.uid},{$set:{isActive:false,isDeleted:true,updatedAt:now()}});
  if(!r.matchedCount) throw new HttpError(404,'Listing not found, or it belongs to another portal.'); res.json({ok:true});
}));
app.post('/api/products/:id/confirm-availability',route(async(req,res)=>{
  const a=await requireUser(req,['farmer','admin']),ts=now();
  const r=await products.updateOne({_id:req.params.id,farmerId:a.uid},{$set:{lastAvailabilityConfirmedAt:ts,updatedAt:ts}});
  if(!r.matchedCount) throw new HttpError(404,'Listing not found, or it belongs to another portal.'); res.json({ok:true,confirmedAt:ts});
}));
app.post('/api/products/:id/moderate',route(async(req,res)=>{
  const a=await requireUser(req,['admin']),action=String(req.body?.action||'');
  if(!['flag','deactivate','remove'].includes(action)) throw new HttpError(400,'Unsupported moderation action.');
  const reason=text(req.body?.reason,'Moderation reason',240),p=await products.findOne({_id:req.params.id});
  if(!p) throw new HttpError(404,'Listing not found.');
  if(p.farmerId===a.uid) throw new HttpError(400,'Use official-market catalog controls for your own products.');
  const ts=now(),update={flagged:true,flagReason:reason,updatedAt:ts};
  if(action==='deactivate'||action==='remove') update.isActive=false;
  if(action==='remove') update.isDeleted=true;
  await products.updateOne({_id:req.params.id},{$set:update});
  await moderationLogs.insertOne({_id:crypto.randomUUID(),productId:req.params.id,productName:String(p.name||req.params.id),action,reason,actorUid:a.uid,timestamp:ts});
  res.json({ok:true});
}));

app.post('/api/orders',route(async(req,res)=>{
  const a=await requireUser(req,['buyer']),d=req.body||{};
  if(!Array.isArray(d.lines)||d.lines.length<1||d.lines.length>80) throw new HttpError(400,'Select at least one product and no more than 80 lines.');
  if(!payments.has(d.paymentMethod)) throw new HttpError(400,'Unsupported payment method.');
  const choices=d.fulfillmentByFarmer&&typeof d.fulfillmentByFarmer==='object'?d.fulfillmentByFarmer:{},merged=new Map();
  for(const line of d.lines){if(!line||typeof line.productId!=='string'||!line.productId||line.productId.length>180)throw new HttpError(400,'Invalid product reference.');if(typeof line.quantity!=='number'||!Number.isFinite(line.quantity)||line.quantity<=0)throw new HttpError(400,'Quantity must be greater than zero.');merged.set(line.productId,(merged.get(line.productId)||0)+line.quantity);}
  const session=client.startSession();let created=[];
  try{await session.withTransaction(async()=>{
    const grouped=new Map(),stock=new Map();
    for(const [id,qty] of merged){
      const p=await products.findOne({_id:id},{session});
      if(!p)throw new HttpError(404,'One of the products in your cart was removed.');
      if(!p.isActive||p.isDeleted)throw new HttpError(409,(p.name||'A product')+' is no longer available.');
      if(p.farmerId===a.uid)throw new HttpError(403,'You cannot order your own listings.');
      checkQty(qty,Number(p.quantityAvailable),Number(p.minOrderQty));
      if(!units.has(p.unit))throw new HttpError(409,'Product unit is not supported.');
      const requested=choices[p.farmerId]??'pickup';
      if(!['pickup','delivery'].includes(requested))throw new HttpError(400,'Unsupported fulfillment option.');
      if(!(p.fulfillmentMethod==='both'||p.fulfillmentMethod===requested))throw new HttpError(409,(p.name||'This item')+' does not support '+requested+'.');
      const unitPrice=Number(p.price);if(!Number.isFinite(unitPrice)||unitPrice<=0)throw new HttpError(409,'Product pricing is invalid.');
      const item={productId:id,productName:String(p.name),unit:p.unit,quantity:qty,unitPrice,lineTotal:money(unitPrice*qty),imageUrl:String(p.imageUrl||'')};
      if(!grouped.has(p.farmerId))grouped.set(p.farmerId,[]);
      grouped.get(p.farmerId).push({item,p,requested});stock.set(id,Number(p.quantityAvailable)-qty);
    }
    const ts=now(),newOrders=[];
    for(const [farmerId,group] of grouped){
      const items=group.map(x=>x.item),first=group[0],order={_id:crypto.randomUUID(),buyerId:a.uid,buyerName:String(a.profile.name||a.profile.email||'Buyer'),
        farmerId,farmerName:String(first.p.farmerName||'Local farmer'),status:'requested',
        totalAmount:money(items.reduce((sum,i)=>sum+i.lineTotal,0)),fulfillmentMethod:first.requested,paymentMethod:d.paymentMethod,items,
        createdAt:ts,updatedAt:ts,statusHistory:[{status:'requested',timestamp:ts,actorUid:a.uid,actorRole:'buyer'}],stockRestoredAt:null};
      await orders.insertOne(order,{session});newOrders.push(publicDoc(order));
    }
    for(const [id,qty] of stock){const r=await products.updateOne({_id:id},{$set:{quantityAvailable:qty,updatedAt:ts}},{session});if(!r.matchedCount)throw new HttpError(409,'A product changed during checkout. Please retry.');}
    created=newOrders;
  });}finally{await session.endSession();}
  res.status(201).json({orders:created});
}));

app.post('/api/orders/:id/transition',route(async(req,res)=>{
  const a=await requireUser(req,['buyer','farmer','admin']),next=req.body?.nextStatus;
  if(!['accepted','ready','completed','cancelled'].includes(next))throw new HttpError(400,'Unsupported order status.');
  const reason=typeof req.body?.reason==='string'?req.body.reason.trim().slice(0,240):'',session=client.startSession();
  try{await session.withTransaction(async()=>{
    const o=await orders.findOne({_id:req.params.id},{session});if(!o)throw new HttpError(404,'Order not found.');
    if(a.profile.role==='buyer'&&o.buyerId!==a.uid)throw new HttpError(403,'You cannot manage this order.');
    if(['farmer','admin'].includes(a.profile.role)&&o.farmerId!==a.uid)throw new HttpError(403,'You can only manage orders assigned to your portal.');
    if(!canTransition(o.status,next,a.profile.role))throw new HttpError(409,'This order cannot move from '+o.status+' to '+next+'.');
    if(next==='cancelled'&&o.stockRestoredAt)throw new HttpError(409,'Stock has already been restored.');
    const ts=now(),why=reason||(next==='cancelled'?(a.profile.role==='buyer'?'Cancelled by buyer':'Rejected or cancelled by farmer'):'');
    const update={status:next,updatedAt:ts,statusHistory:[...(Array.isArray(o.statusHistory)?o.statusHistory:[]),{status:next,timestamp:ts,actorUid:a.uid,actorRole:a.profile.role,...(why?{reason:why}:{})}]};
    if(next==='cancelled'){
      Object.assign(update,{cancelledBy:a.uid,cancellationReason:why,stockRestoredAt:ts});
      for(const item of (o.items||[])){const qty=Number(item.quantity);if(!Number.isFinite(qty)||qty<=0)throw new HttpError(409,'Order contains an invalid item quantity.');await products.updateOne({_id:String(item.productId)},{$inc:{quantityAvailable:qty},$set:{updatedAt:ts}},{session});}
    }
    await orders.updateOne({_id:o._id},{$set:update},{session});
  });}finally{await session.endSession();}
  res.json({ok:true,orderId:req.params.id,status:next});
}));

app.use((error,_req,res,_next)=>{const status=Number.isInteger(error?.status)?error.status:500;if(status>=500)console.error('[HarvestLink API]',error);res.status(status).json({error:status>=500?'HarvestLink API failed to complete the request.':error.message});});
const server=app.listen(PORT,'0.0.0.0',()=>console.log(`HarvestLink API listening on port ${PORT} · MongoDB database ${DB_NAME} · native MongoDB accounts`));
const shutdown=async()=>{server.close();await client.close();process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
