import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import SectionManager from '../components/sections';
import ItemsManager from '../components/items';
import WorkerDetails from '../components/WorkerDetails';
import PartyDashboard from './party_dashboard';
import PartyDetails from '../components/partyDetails';
import CompanyInvoicesList from '../components/CompanyInvoicesList';
import { checkPermission, PERMISSIONS, USER_ROLES } from '../lib/constants';
import axios from 'axios';

const SettingsTabs = () => {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState();
  const [user, setUser] = useState(null);
  const [flags, setFlags] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'));
    if (userData) {
      setUser(userData);
    }
  }, []);

  // Handle URL tab query
  useEffect(() => {
    if (router.query.tab) {
      setSelectedTab(router.query.tab);
    }
  }, [router.query.tab]);

  // Set default tab based on permissions and feature flags
  useEffect(() => {
    if (router.query.tab) return;
    if (user && flags) {
      // Only set tab if user has permission AND feature flag is enabled
      switch (true) {
        case checkPermission(user, PERMISSIONS.WORKERS) && flags?.isWorkers: 
          setSelectedTab('workers'); 
          break;
        case checkPermission(user, PERMISSIONS.PARTY_BILLS) && flags?.isVendors: 
          setSelectedTab('party'); 
          break;
        case checkPermission(user, PERMISSIONS.SECTIONS) && flags?.isSections: 
          setSelectedTab('sections'); 
          break;
        case checkPermission(user, PERMISSIONS.ITEMS) && flags?.isItems: 
          setSelectedTab('items'); 
          break;
        case user?.role === USER_ROLES.ADMINISTRATOR:
          setSelectedTab('featureFlags');
          break;
        case user?.role === USER_ROLES.ADMIN:
          setSelectedTab('invoices');
          break;
      }
    }
  }, [user, flags, router.query.tab]);

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const { data } = await axios.get('/api/company/flags', { headers: { Authorization: `Bearer ${token}` } });
        setFlags(data?.featureFlags || {});
      } catch (e) {}
    };
    fetchFlags();
  }, []);

  const saveFlags = async (nextFlags) => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      
      const { data } = await axios.put('/api/company/flags', { featureFlags: nextFlags }, { headers: { Authorization: `Bearer ${token}` } });
      
      // Optimistically set, then hard refresh from server to ensure persisted state
      setFlags(data?.featureFlags || nextFlags);
      
      try {
        const refreshed = await axios.get('/api/company/flags', { headers: { Authorization: `Bearer ${token}` } });
        setFlags(refreshed?.data?.featureFlags || data?.featureFlags || nextFlags);
      } catch {}
    } catch (e) {
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {user ? (
        <div className="p-4">
          <div className="flex space-x-4">
            {checkPermission(user, PERMISSIONS.WORKERS) && flags?.isWorkers && (
              <button
                onClick={() => setSelectedTab('workers')}
                className={`px-4 py-2 rounded ${
                  selectedTab === 'workers' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
                }`}>
                Workers
              </button>
            )}
            {checkPermission(user, PERMISSIONS.PARTY_BILLS) && flags?.isVendors && (
              <button
                onClick={() => setSelectedTab('party')}
                className={`px-4 py-2 rounded ${
                  selectedTab === 'party' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
                }`}>
                Vendor
              </button>
            )}
            {checkPermission(user, PERMISSIONS.SECTIONS) && flags?.isSections && (
                <button
                  onClick={() => setSelectedTab('sections')}
                  className={`px-4 py-2 rounded ${
                    selectedTab === 'sections' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
                  }`}>
                  Sections
                </button>
            )}
            {checkPermission(user, PERMISSIONS.ITEMS) && flags?.isItems && (
              <button
                onClick={() => setSelectedTab('items')}
                className={`px-4 py-2 rounded ${
                  selectedTab === 'items' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
                }`}>
                Items
              </button>
            )}
            {user?.role === USER_ROLES.ADMINISTRATOR && (
              <button
                onClick={() => setSelectedTab('featureFlags')}
                className={`px-4 py-2 rounded ${
                  selectedTab === 'featureFlags' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
                }`}>
                Feature Flags
              </button>
            )}
            {(user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.ADMINISTRATOR) && (
              <button
                onClick={() => setSelectedTab('invoices')}
                className={`px-4 py-2 rounded font-medium transition ${
                  selectedTab === 'invoices' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-200 text-black hover:bg-gray-300'
                }`}>
                Invoices & Billing
              </button>
            )}
          </div>
          <div className="mt-4">
            {selectedTab === 'sections' && (
              flags?.isSections ? (
                <SectionManager user={user} />
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                  <h2 className="text-xl font-semibold text-yellow-800 mb-2">Feature Not Available</h2>
                  <p className="text-yellow-700">Sections feature is not enabled for your company. Please contact your administrator.</p>
                </div>
              )
            )}
            {selectedTab === 'items' && (
              flags?.isItems ? (
              <div>
                <ItemsManager user={user} />
              </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                  <h2 className="text-xl font-semibold text-yellow-800 mb-2">Feature Not Available</h2>
                  <p className="text-yellow-700">Items feature is not enabled for your company. Please contact your administrator.</p>
                </div>
              )
            )}
            {selectedTab === 'workers' && (
              flags?.isWorkers ? (
              <div>
                <WorkerDetails user={user} />
              </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                  <h2 className="text-xl font-semibold text-yellow-800 mb-2">Feature Not Available</h2>
                  <p className="text-yellow-700">Workers feature is not enabled for your company. Please contact your administrator.</p>
                </div>
              )
            )}
            {selectedTab === 'party' && (
              flags?.isVendors ? (
              <div>
                <PartyDetails user={user} />
              </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                  <h2 className="text-xl font-semibold text-yellow-800 mb-2">Feature Not Available</h2>
                  <p className="text-yellow-700">Vendors feature is not enabled for your company. Please contact your administrator.</p>
                </div>
              )
            )}
            {selectedTab === 'featureFlags' && user?.role === USER_ROLES.ADMINISTRATOR && (
              <div className="mt-6 p-6 border border-gray-300 rounded-lg bg-white shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Company Feature Flags</h2>
                {flags ? (
                  <div className="space-y-6">
                    {[
                      {
                        title: 'SKU Management Features',
                        flags: [
                          { key: 'isExtractSKU', label: 'Extract SKU' },
                          { key: 'isExcelFromPDF', label: 'Excel from PDF' },
                          { key: 'isMeeshoDirectSort', label: 'Meesho Direct Sort' },
                          { key: 'isSKUInventory', label: 'SKU Inventory' },
                          { key: 'isCancelledOrders', label: 'Cancelled Orders' },
                          { key: 'isReturns', label: 'Returns' },
                          { key: 'isCustomerReturns', label: 'Customer Returns' },
                        ]
                      },
                      {
                        title: 'Billing & Payment Features',
                        flags: [
                          { key: 'isPartyBills', label: 'Party Bills' },
                          { key: 'isVendorBills', label: 'Vendor Bills' },
                          { key: 'isWorkerBills', label: 'Worker Bills' },
                          { key: 'isVendorPayments', label: 'Vendor Payments' },
                          { key: 'isWorkerPayments', label: 'Worker Payments' },
                        ]
                      },
                      {
                        title: 'Production Management Features',
                        flags: [
                          { key: 'isProductionFlow', label: 'Production Flow' },
                          { key: 'isFinalProduct', label: 'Final Product' },
                          { key: 'isInProcessProduct', label: 'In-Process Product' },
                          { key: 'isPlatting', label: 'Platting' },
                        ]
                      },
                      {
                        title: 'Master Data Management Features',
                        flags: [
                          { key: 'isSections', label: 'Sections' },
                          { key: 'isItems', label: 'Items' },
                          { key: 'isWorkers', label: 'Workers' },
                          { key: 'isVendors', label: 'Vendors' },
                        ]
                      },
                      {
                        title: 'Additional Features',
                        flags: [
                          { key: 'isCalendar', label: 'Calendar' },
                          { key: 'isDashboard', label: 'Dashboard' },
                          { key: 'isCompanyOrderPreference', label: 'Company Order Preference' },
                          { key: 'isCompanyEmailMapping', label: 'Company Email Mapping' },
                          { key: 'isFileUpload', label: 'File Upload' },
                          { key: 'isMasterFileUpload', label: 'Master File Upload' },
                          { key: 'isOrderFileUpload', label: 'Order File Upload' },
                        ]
                      }
                    ].map((group, groupIdx) => (
                      <div key={groupIdx} className="border-l-4 border-blue-500 pl-4">
                        <h3 className="font-semibold text-gray-700 mb-2">{group.title}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {group.flags.map(flag => (
                            <label key={flag.key} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                                checked={!!flags[flag.key]}
                                onChange={(e) => saveFlags({ ...flags, [flag.key]: e.target.checked })}
                        disabled={saving}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                              <span className="text-sm">{flag.label}</span>
                    </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Loading flags…</p>
                )}
              </div>
            )}
            {selectedTab === 'invoices' && (user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.ADMINISTRATOR) && (
              <div className="mt-4">
                <CompanyInvoicesList />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4">Please login to view this page</div>
      )}
    </>
  );
};

export default SettingsTabs;
