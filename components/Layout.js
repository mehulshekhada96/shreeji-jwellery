import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import { checkPermission, PERMISSIONS, USER_ROLES } from '../lib/constants';
import { useFeatureFlags, clearFlagsCache } from '../utils/useFeatureFlags';
import { CgProfile } from 'react-icons/cg';
import { 
  FaUsersCog, 
  FaHome, 
  FaSignInAlt, 
  FaUserPlus, 
  FaMoneyBillWave, 
  FaHardHat, 
  FaCog, 
  FaBoxOpen, 
  FaIndustry, 
  FaLayerGroup, 
  FaProjectDiagram, 
  FaFileExcel,
  FaBars,
  FaTimes,
  FaChevronDown,
  FaChevronRight,
  FaTimesCircle,
  FaUpload,
  FaFileAlt,
  FaBoxes,
  FaWarehouse,
  FaTruck,
  FaShoppingBag,
  FaTag,
  FaUndo,
  FaFileInvoiceDollar
} from "react-icons/fa";
import { SiAmazon, SiFlipkart } from "react-icons/si";

const Layout = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState({});
  const { checkFeature, refreshFlags } = useFeatureFlags();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios
        .get('/api/validateToken', { headers: { Authorization: `Bearer ${token}` } })
        .then(response => {
          delete response.data?.user?.password;
          const newUser = response.data.user;
          const previousUserStr = localStorage.getItem('user');
          const previousUser = previousUserStr ? JSON.parse(previousUserStr) : null;
          
          setUser(newUser);
          localStorage.setItem('user', JSON.stringify(newUser));
          
          // Only refresh flags if user actually changed (e.g., after login or user switch)
          // Compare user IDs to detect actual user change
          const userChanged = !previousUser || previousUser._id !== newUser._id;
          
          if (userChanged) {
            // User changed, refresh flags
            refreshFlags();
            // Dispatch custom event to trigger flag refresh in other components
            window.dispatchEvent(new Event('userLoggedIn'));
          }
          // If user didn't change, flags hook will use existing cache automatically
        })
        .catch(error => {
          console.error('Token validation failed:', error);
          localStorage.removeItem('token');
        });
    } else {
      if (router.pathname !== '/login' && router.pathname !== '/signup') {
        router.push('/login');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Removed the useEffect that was calling refreshFlags on every route change
  // The flags are cached and will be used automatically by useFeatureFlags hook

  // Load sidebar state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) {
      setSidebarCollapsed(JSON.parse(savedState));
    }
  }, []);

  const handleLogout = () => {
    clearFlagsCache(); // Clear feature flags cache on logout
    localStorage.clear();
    setUser(null);
    router.push('/login');
  };

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
  };

  const toggleSubmenu = (menuKey) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey]
    }));
  };

  // Check if user has permissions beyond just SKU management
  // ADMIN users need explicit permissions, only ADMINISTRATOR bypasses this check
  const hasPermissionsBeyondSKU = (user) => {
    if (!user) return false;
    if (user.role === USER_ROLES.ADMINISTRATOR) return true;
    
    const permissions = user.permissions || [];
    const nonSKUPermissions = [
      PERMISSIONS.PARTY_BILLS,
      PERMISSIONS.WORKER_BILLS,
      PERMISSIONS.SECTIONS,
      PERMISSIONS.ITEMS,
      PERMISSIONS.VENDORS,
      PERMISSIONS.WORKERS,
      PERMISSIONS.FINAL_PRODUCT,
      PERMISSIONS.IN_PROCESS_PRODUCT,
      PERMISSIONS.PLATTING,
      PERMISSIONS.PRODUCTION_FLOW
    ];
    
    return nonSKUPermissions.some(perm => permissions.includes(perm));
  };

  // Check if user has access to Settings (needs Workers, Vendors, Sections, or Items permissions)
  // ADMIN users need explicit permissions, only ADMINISTRATOR bypasses this check
  const hasSettingsAccess = (user) => {
    if (!user) return false;
    if (user.role === USER_ROLES.ADMINISTRATOR || user.role === USER_ROLES.ADMIN) return true;
    
    const permissions = user.permissions || [];
    const settingsPermissions = [
      PERMISSIONS.WORKERS,
      PERMISSIONS.VENDORS,
      PERMISSIONS.SECTIONS,
      PERMISSIONS.ITEMS
    ];
    
    return settingsPermissions.some(perm => permissions.includes(perm));
  };

  const NavItem = ({ href, icon: Icon, label, submenu, menuKey }) => {
    const isActive = router.pathname === href || (submenu && submenu.some(item => router.pathname === item.href));
    const hasSubmenu = submenu && submenu.length > 0;

    if (hasSubmenu) {
      return (
        <li className="sidebar-menu-item group">
          <div
            className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors duration-200 ${
              isActive ? 'bg-blue-600 text-white shadow-md' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon className="text-lg flex-shrink-0" />
              <span className={`font-medium ${sidebarCollapsed ? 'hidden group-hover:inline' : 'inline'}`}>{label}</span>
            </div>
            {/* Chevron is decorative; no click needed */}
            <span className={`sidebar-chevron text-sm ${sidebarCollapsed ? 'hidden group-hover:inline' : 'inline'}`}>
              <FaChevronRight />
            </span>
          </div>
          {/* Submenu appears on hover when sidebar is collapsed */}
          <div className="sidebar-submenu">
            <ul className="ml-4 space-y-1 border-l-2 border-gray-700 pl-2">
              {submenu.filter(item => !item.flag || checkFeature(item.flag)).map((item, idx) => (
                <li key={idx}>
                  <Link href={item.href}>
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors duration-200 ${
                        router.pathname === item.href ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      {item.icon && <item.icon className="text-sm" />}
                      <span>{item.label}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </li>
      );
    }

    // No submenu
    return (
      <li className="sidebar-menu-item">
        <Link href={href}>
          <div
            className={`flex items-center px-4 py-3 rounded-lg transition-colors duration-200 ${
              isActive ? 'bg-blue-600 text-white shadow-md' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Icon className="text-lg flex-shrink-0" />
            <span className={`ml-3 font-medium ${sidebarCollapsed ? 'hidden group-hover:inline' : 'inline'}`}>{label}</span>
          </div>
        </Link>
      </li>
    );
  };

  const isAuthPage = router.pathname === '/login' || router.pathname === '/signup';

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-gray-100 font-sans">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`group fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-700 bg-opacity-80 backdrop-blur-lg transform transition-all duration-300 ease-in-out md:relative md:translate-x-0 ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      } ${sidebarCollapsed ? 'w-20 hover:w-64 md:w-20 md:hover:w-64' : 'w-64 md:w-64'}`}>
        {/* Decorative floating icons */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <FaBoxes className="absolute top-8 left-4 text-purple-300 opacity-20 text-5xl animate-float" />
          <FaWarehouse className="absolute bottom-12 right-6 text-indigo-300 opacity-20 text-6xl animate-float-delayed" />
          <FaTruck className="absolute top-1/2 left-1/2 text-pink-300 opacity-20 text-7xl animate-float" />
        </div>
        <div className="flex flex-col h-full relative z-10">
            {/* Logo / Brand */}
            <div className="h-16 flex items-center justify-center px-4 bg-gradient-to-r from-indigo-600 to-purple-600 border-b border-gray-800 cursor-pointer" onClick={toggleSidebar}>
              {/* Expanded view */}
              {!sidebarCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center animate-bounce-slow">
                    <FaWarehouse className="text-white text-2xl" />
                  </div>
                  <span className="text-xl font-bold text-white">OMS Portal</span>
                </div>
              )}
              {/* Collapsed view */}
              {sidebarCollapsed && (
                <FaWarehouse className="text-white text-2xl mx-auto" />
              )}

            </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto py-4 px-3">
            <ul className="space-y-1">
              {user && checkFeature('isDashboard') && (
                <NavItem href="/" icon={FaHome} label="Home" />
              )}
              
              {!user && (
                <>
                  <NavItem href="/signup" icon={FaUserPlus} label="Signup" />
                  <NavItem href="/login" icon={FaSignInAlt} label="Login" />
                </>
              )}

              {user && checkPermission(user, PERMISSIONS.EXTRACT_SKU) && checkFeature('isExtractSKU') && (
                <>
                  <NavItem 
                    href="/extract-sku?tab=sort" 
                    icon={FaFileExcel} 
                    label="SKU Management"
                    menuKey="sku_management"
                    submenu={[
                      { href: '/extract-sku?tab=sort', label: 'Meesho Sort', icon: FaShoppingBag },
                      { href: '/extract-sku?tab=meesho-direct', label: 'Meesho Direct Sort', icon: FaShoppingBag, flag: 'isMeeshoDirectSort' },
                      { href: '/extract-sku?tab=flipkart', label: 'Flipkart Sort', icon: SiFlipkart },
                      { href: '/extract-sku?tab=snapdeal', label: 'Snapdeal Sort', icon: FaTag },
                      { href: '/extract-sku?tab=amazon', label: 'Amazon Sort', icon: SiAmazon },
                      { href: '/extract-sku?tab=myntra', label: 'Myntra Sort', icon: FaBoxOpen },
                      { href: '/extract-sku?tab=excel', label: 'Generate Excel', icon: FaFileAlt, flag: 'isExcelFromPDF' },
                    ].filter(item => !item.flag || checkFeature(item.flag))}
                  />
                  <NavItem 
                    href="/extract-sku?tab=inventory" 
                    icon={FaBoxes} 
                    label="Meesho Recon"
                    menuKey="meesho_recon"
                    submenu={[
                      { href: '/extract-sku?tab=inventory', label: 'Meesho Inventory', icon: FaBoxes, flag: 'isSKUInventory' },
                      { href: '/extract-sku?tab=cancelled-orders', label: 'Cancelled Orders', icon: FaTimesCircle, flag: 'isCancelledOrders' },
                      { href: '/extract-sku?tab=returns', label: 'Returns', icon: FaUndo, flag: 'isReturns' },
                      { href: '/extract-sku?tab=customer-returns', label: 'Customer Returns', icon: FaUndo, flag: 'isCustomerReturns' },
                    ].filter(item => {
                      if (item.label === 'Cancelled Orders' || item.label === 'Returns' || item.label === 'Customer Returns') return true;
                      return !item.flag || checkFeature(item.flag);
                    })}
                  />
                  <NavItem 
                    href="/extract-sku?tab=flipkart-inventory" 
                    icon={SiFlipkart} 
                    label="Flipkart Recon"
                    menuKey="flipkart_recon"
                    submenu={[
                      { href: '/extract-sku?tab=flipkart-inventory', label: 'Flipkart Inventory', icon: SiFlipkart, flag: 'isSKUInventory' },
                    ].filter(item => !item.flag || checkFeature(item.flag))}
                  />
                  <NavItem 
                    href="/extract-sku?tab=snapdeal-inventory" 
                    icon={FaTag} 
                    label="Snapdeal Recon"
                    menuKey="snapdeal_recon"
                    submenu={[
                      { href: '/extract-sku?tab=snapdeal-inventory', label: 'Snapdeal Inventory', icon: FaTag, flag: 'isSKUInventory' },
                    ].filter(item => !item.flag || checkFeature(item.flag))}
                  />
                  <NavItem 
                    href="/extract-sku?tab=myntra-inventory" 
                    icon={FaBoxOpen} 
                    label="Myntra Recon"
                    menuKey="myntra_recon"
                    submenu={[
                      { href: '/extract-sku?tab=myntra-inventory', label: 'Myntra Inventory', icon: FaBoxOpen, flag: 'isSKUInventory' },
                    ].filter(item => !item.flag || checkFeature(item.flag))}
                  />
                </>
              )}

              {user && checkPermission(user, PERMISSIONS.PARTY_BILLS) && (checkFeature('isPartyBills') || checkFeature('isVendorBills')) && (
                <NavItem href="/party_dashboard" icon={FaMoneyBillWave} label="Vendor Pay" />
              )}
              
              {user && checkPermission(user, PERMISSIONS.WORKER_BILLS) && (checkFeature('isWorkerBills') || checkFeature('isWorkerPayments')) && (
                <NavItem href="/billing" icon={FaHardHat} label="Worker Pay" />
              )}
              
              {user && checkPermission(user, PERMISSIONS.FINAL_PRODUCT) && (checkFeature('isFinalProduct') || checkFeature('isInProcessProduct')) && (
                <NavItem 
                  href="/final-product" 
                  icon={FaBoxOpen} 
                  label="Products"
                  menuKey="products"
                  submenu={[
                    { href: '/final-product', label: 'Final Product', icon: FaBoxOpen, flag: 'isFinalProduct' },
                    { href: '/in-process-product', label: 'In-Process', icon: FaIndustry, flag: 'isInProcessProduct' },
                  ].filter(item => !item.flag || checkFeature(item.flag))}
                />
              )}
              
              {user && checkPermission(user, PERMISSIONS.PLATTING) && checkFeature('isPlatting') && (
                <NavItem href="/platting" icon={FaLayerGroup} label="Platting" />
              )}
              
              {user && checkPermission(user, PERMISSIONS.PRODUCTION_FLOW) && checkFeature('isProductionFlow') && (
                <NavItem href="/production-flow" icon={FaProjectDiagram} label="Production Flow" />
              )}
              
              {user && (user.role === USER_ROLES.ADMINISTRATOR || hasSettingsAccess(user)) && (
                <NavItem href="/settings" icon={FaCog} label="Settings" />
              )}
              
              {user && user.role === USER_ROLES.ADMINISTRATOR && (
                <NavItem href="/admin" icon={FaFileInvoiceDollar} label="Invoicing & Admin" />
              )}
            </ul>
          </div>

          {/* User Info Footer */}
          {user && (
            <div className={`p-4 border-t border-gray-800 ${sidebarCollapsed ? 'hidden group-hover:block' : 'block'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user.role}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 md:px-6 z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none"
            >
              {mobileMenuOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
            </button>
            <h2 className="text-xl font-semibold text-gray-800">
              {/* Dynamic Title could go here */}
            </h2>
          </div>

          {user && (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <CgProfile size={20} />
                </div>
                <span className="text-sm font-medium text-gray-700">{user.name}</span>
              </div>
              
              <div className="h-6 w-px bg-gray-300 mx-1 hidden sm:block"></div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => router.push('/profile')}
                  className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
                  title="Profile"
                >
                  <CgProfile size={20} />
                </button>
                
                {user.role === USER_ROLES.ADMIN && (
                  <button 
                    onClick={() => router.push('/user-permissions')}
                    className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
                    title="User Permissions"
                  >
                    <FaUsersCog size={20} />
                  </button>
                )}
                
                {user.role === USER_ROLES.ADMINISTRATOR && (
                  <button 
                    onClick={() => router.push('/admin')}
                    className="p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
                    title="Admin"
                  >
                    <FaUsersCog size={20} />
                  </button>
                )}
                
                <button
                  onClick={handleLogout}
                  className="ml-2 px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
