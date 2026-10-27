import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Menu, Package, ShieldCheck, ShoppingCart, Sprout, Store, UserRound } from 'lucide-react';
import { AppProvider, useApp } from './providers';
import AuthPage from '../features/auth/AuthPage';
import { BuyerOrderDetailPage, BuyerOrdersPage, CartPage, MarketplacePage, ProductPage } from '../features/buyer/BuyerPages';
import { FarmerDashboardPage, FarmerInventoryPage, FarmerOrdersPage } from '../features/farmer/FarmerPages';
import AdminPage from '../features/admin/AdminPage';
import { Logo, ToastViewport } from '../components/shared';

function defaultRoute(role?: string) {
  if (role === 'farmer') return '/farmer';
  if (role === 'admin') return '/admin';
  return '/marketplace';
}
function HomeRoute() {
  const { user, ready } = useApp();
  if (!ready) return <div className="app-loading"><span className="spinner"/><p>Getting your harvest ready…</p></div>;
  return user ? <Navigate to={defaultRoute(user.role)} replace/> : <AuthPage/>;
}
function Protected({ role }: { role: 'buyer' | 'farmer' | 'admin' }) {
  const { user, ready } = useApp();
  if (!ready) return <div className="app-loading"><span className="spinner"/><p>Getting your workspace ready…</p></div>;
  if (!user) return <Navigate to="/" replace/>;
  if (user.role !== role) return <Navigate to={defaultRoute(user.role)} replace/>;
  return <Outlet/>;
}
function AccountControl() {
  const { user, signOut, toast } = useApp();
  const navigate = useNavigate();
  if (!user) return null;
  const exit = async () => { try { await signOut(); navigate('/'); } catch (e) { toast('Could not sign out', 'error', e instanceof Error ? e.message : 'Try again.'); } };
  return <div className="account-control"><span className="account-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="account-info"><strong>{user.name}</strong><small>{user.role === 'buyer' ? (user.buyerType || 'buyer') : user.role}</small></span><button type="button" className="account-logout" onClick={exit} aria-label="Sign out"><LogOut size={16}/></button></div>;
}
function BuyerFrame() {
  const { user } = useApp();
  const navigate = useNavigate();
  const cartItems = user ? (() => { try { return (JSON.parse(localStorage.getItem('harvestlink.cart.' + user.uid) || '[]') as Array<{quantity:number}>).reduce((n, x) => n + x.quantity, 0); } catch { return 0; } })() : 0;
  return <div className="buyer-app-frame">
    <header className="site-header"><Logo/><nav className="main-nav"><NavLink to="/marketplace" end>Marketplace</NavLink><NavLink to="/buyer/orders">Your orders</NavLink></nav><div className="header-actions"><Link className="header-cart" to="/buyer/cart" aria-label={'Cart, ' + cartItems + ' items'}><ShoppingCart size={17}/><span>Basket</span><b>{cartItems}</b></Link><AccountControl/></div></header>
    <div className="mobile-buyer-nav"><NavLink to="/marketplace"><Store size={17}/>Shop</NavLink><NavLink to="/buyer/orders"><ClipboardList size={17}/>Orders</NavLink><NavLink to="/buyer/cart"><ShoppingCart size={17}/>Basket</NavLink></div>
    <Outlet/>
    <footer className="site-footer"><Logo compact/><span>Grown local. Ordered with confidence.</span><small>HACK-P309 · Student prototype · {user?.location}</small></footer>
  </div>;
}
function FarmerFrame() {
  const { user } = useApp();
  return <div className="workspace-frame">
    <aside className="workspace-sidebar"><div className="sidebar-brand"><Logo/></div><div className="sidebar-caption">FARM WORKSPACE</div><nav className="workspace-nav">
      <NavLink to="/farmer" end><LayoutDashboard size={17}/>Overview</NavLink>
      <NavLink to="/farmer/inventory"><Package size={17}/>My inventory</NavLink>
      <NavLink to="/farmer/orders"><ClipboardList size={17}/>Incoming orders</NavLink>
    </nav><div className="sidebar-grow-note"><span><Sprout size={18}/></span><strong>Your harvest,<br/>your terms.</strong><p>Clear listings help the right buyers find you.</p></div><div className="sidebar-account"><div className="sidebar-user-mark">{user?.name.slice(0,1).toUpperCase()}</div><div><strong>{user?.name}</strong><small>{user?.location}</small></div></div><AccountControl/><div className="sidebar-bottom-label">HARVESTLINK <span>·</span> 1.0</div></aside>
    <div className="workspace-main"><header className="workspace-topbar"><div className="workspace-topbar-left"><span className="small-brand-mobile"><Logo compact/></span><span className="breadcrumb-text">Your farm <span>/</span> Workspace</span></div><div className="workspace-topbar-right"><span className="live-indicator"><i/> Your workspace</span><span className="topbar-role">FARMER</span></div></header><Outlet/><footer className="workspace-footer">HarvestLink workspace <span>•</span> All-time metrics use completed orders only.</footer></div>
  </div>;
}
function AdminFrame() {
  const { user } = useApp();
  return <div className="admin-frame"><header className="site-header admin-header"><Logo/><div className="admin-top-label"><ShieldCheck size={16}/> ADMIN CONSOLE</div><AccountControl/></header><main className="admin-main"><Outlet/></main><footer className="site-footer"><Logo compact/><span>Trust begins with transparent listings.</span><small>Signed in as {user?.email}</small></footer></div>;
}
function NotFound() {
  const { user } = useApp();
  return <main className="page-wrap"><div className="not-found"><span className="eyebrow">404 · NOT IN THIS HARVEST</span><h1>We couldn't find that page.</h1><p>The link may have changed or the listing may no longer be available.</p><Link to={defaultRoute(user?.role)} className="button button-primary">Take me back</Link></div></main>;
}
function AppRoutes() {
  return <><Routes>
    <Route path="/" element={<HomeRoute/>}/>
    <Route path="/home" element={<HomeRoute/>}/>
    <Route element={<Protected role="buyer"/>}><Route element={<BuyerFrame/>}>
      <Route path="/marketplace" element={<MarketplacePage/>}/>
      <Route path="/product/:id" element={<ProductPage/>}/>
      <Route path="/buyer/cart" element={<CartPage/>}/>
      <Route path="/buyer/orders" element={<BuyerOrdersPage/>}/>
      <Route path="/buyer/orders/:orderId" element={<BuyerOrderDetailPage/>}/>
    </Route></Route>
    <Route element={<Protected role="farmer"/>}><Route element={<FarmerFrame/>}>
      <Route path="/farmer" element={<FarmerDashboardPage/>}/>
      <Route path="/farmer/inventory" element={<FarmerInventoryPage/>}/>
      <Route path="/farmer/orders" element={<FarmerOrdersPage/>}/>
    </Route></Route>
    <Route element={<Protected role="admin"/>}><Route element={<AdminFrame/>}><Route path="/admin" element={<AdminPage/>}/></Route></Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes></>;
}
function AppRoot() {
  const { toasts } = useApp();
  return <><AppRoutes/><ToastViewport toasts={toasts}/></>;
}
export default function App() {
  return <AppProvider><BrowserRouter><AppRoot/></BrowserRouter></AppProvider>;
}
