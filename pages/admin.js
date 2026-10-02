import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import AdminInvoicesManager from '../components/AdminInvoicesManager';
import { FaFileInvoiceDollar, FaSlidersH } from 'react-icons/fa';

const AdminPortal = () => {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('invoicing');

  useEffect(() => {
    if (router.query.tab === 'flags') {
      setActiveTab('flags');
    } else if (router.query.tab === 'invoicing') {
      setActiveTab('invoicing');
    }
  }, [router.query.tab]);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const { data } = await axios.get('/api/admin/company', { headers: { Authorization: `Bearer ${token}` } });
        setCompanies(data?.companies || []);
      } catch (e) {
      } finally {
        setLoading(false);
      }
    };
    fetchCompanies();
  }, []);

  const toggleFlag = async (companyId, nextFlags) => {
    try {
      setSavingId(companyId);
      const token = localStorage.getItem('token');
      
      const { data } = await axios.put(`/api/admin/company/${companyId}`, { featureFlags: nextFlags }, { headers: { Authorization: `Bearer ${token}` } });
      
      // Optimistically update, then hard refresh from server to ensure persisted state contains all flags
      setCompanies(prev => prev.map(c => c._id === companyId ? { ...c, featureFlags: data?.featureFlags || nextFlags } : c));
      
      try {
        const refreshed = await axios.get('/api/admin/company', { headers: { Authorization: `Bearer ${token}` } });
        setCompanies(refreshed?.data?.companies || []);
      } catch {}
    } catch (e) {
    } finally {
      setSavingId(null);
    }
  };

  if (!user || user.role !== 'ADMINISTRATOR') {
    return <div className="p-4">Unauthorized</div>;
  }

  const featureFlagGroups = [
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
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 gap-4">
        <button
          onClick={() => setActiveTab('invoicing')}
          className={`flex items-center gap-2 pb-3 px-2 text-sm font-bold border-b-2 transition ${
            activeTab === 'invoicing'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FaFileInvoiceDollar size={16} />
          <span>Invoicing & Billing</span>
        </button>

        <button
          onClick={() => setActiveTab('flags')}
          className={`flex items-center gap-2 pb-3 px-2 text-sm font-bold border-b-2 transition ${
            activeTab === 'flags'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FaSlidersH size={16} />
          <span>Company Feature Flags</span>
        </button>
      </div>

      {/* Tab 1: Invoicing */}
      {activeTab === 'invoicing' && (
        <AdminInvoicesManager />
      )}

      {/* Tab 2: Feature Flags */}
      {activeTab === 'flags' && (
        <div>
          <h1 className="text-xl font-bold mb-4 text-gray-800">Company Feature Flags Management</h1>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading companies…</div>
          ) : (
            <div className="space-y-6">
              {companies.map(company => (
                <div key={company._id} className="border border-gray-300 rounded-lg p-6 bg-white shadow-sm">
                  <div className="font-semibold text-xl mb-4 pb-2 border-b border-gray-200">{company.companyName}</div>
                  <div className="space-y-4">
                    {featureFlagGroups.map((group, groupIdx) => (
                      <div key={groupIdx} className="border-l-4 border-blue-500 pl-4">
                        <h3 className="font-semibold text-gray-700 mb-2">{group.title}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {group.flags.map(flag => (
                            <label key={flag.key} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                              <input
                                type="checkbox"
                                checked={!!company.featureFlags?.[flag.key]}
                                onChange={(e) => toggleFlag(company._id, { ...(company.featureFlags || {}), [flag.key]: e.target.checked })}
                                disabled={savingId === company._id}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <span className="text-sm">{flag.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPortal;


