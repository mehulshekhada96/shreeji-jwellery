// pages/user-permissions.js

import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Formik, Form, Field, FieldArray } from 'formik';
import Modal from 'react-modal';
import { FaEdit, FaTrash, FaPlus, FaSpinner, FaBuilding, FaSearch, FaDatabase, FaMoneyBillWave } from 'react-icons/fa';
import { PERMISSIONS, USER_ROLES } from '../lib/constants';
import { HTTP } from '../actions/actions_creators';
import { useFeatureFlags } from '../utils/useFeatureFlags';

// Component for checkbox with indeterminate state support
const SectionCheckbox = ({ checked, indeterminate, onChange }) => {
  const checkboxRef = useRef(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
    />
  );
};

// Group permissions by sections
const PERMISSION_SECTIONS = [
  {
    title: 'Master Files Management',
    permissions: [
      PERMISSIONS.MASTER_SKU_READ,
      PERMISSIONS.MASTER_SKU_WRITE,
      PERMISSIONS.MASTER_RATE_READ,
      PERMISSIONS.MASTER_RATE_WRITE,
    ]
  },
  {
    title: 'Billing & Payments',
    permissions: [PERMISSIONS.PARTY_BILLS, PERMISSIONS.WORKER_BILLS]
  },
  {
    title: 'Master Data Management',
    permissions: [PERMISSIONS.SECTIONS, PERMISSIONS.ITEMS, PERMISSIONS.VENDORS, PERMISSIONS.WORKERS]
  },
  {
    title: 'Production Management',
    permissions: [PERMISSIONS.FINAL_PRODUCT, PERMISSIONS.IN_PROCESS_PRODUCT, PERMISSIONS.PLATTING, PERMISSIONS.PRODUCTION_FLOW]
  },
  {
    title: 'SKU Management',
    permissions: [PERMISSIONS.EXTRACT_SKU, PERMISSIONS.MEESHO_DIRECT_SORT]
  }
];

const PERMISSION_LABELS = {
  [PERMISSIONS.MASTER_SKU_READ]: 'Master SKU (Read Only)',
  [PERMISSIONS.MASTER_SKU_WRITE]: 'Master SKU (Write / Upload / Edit)',
  [PERMISSIONS.MASTER_RATE_READ]: 'Master Rate (Read Only)',
  [PERMISSIONS.MASTER_RATE_WRITE]: 'Master Rate (Write / Upload / Edit)',
  [PERMISSIONS.PARTY_BILLS]: 'Party Bills',
  [PERMISSIONS.WORKER_BILLS]: 'Worker Bills',
  [PERMISSIONS.SECTIONS]: 'Sections',
  [PERMISSIONS.ITEMS]: 'Items',
  [PERMISSIONS.VENDORS]: 'Vendors',
  [PERMISSIONS.WORKERS]: 'Workers',
  [PERMISSIONS.FINAL_PRODUCT]: 'Final Product',
  [PERMISSIONS.IN_PROCESS_PRODUCT]: 'In-Process Product',
  [PERMISSIONS.PLATTING]: 'Platting',
  [PERMISSIONS.PRODUCTION_FLOW]: 'Production Flow',
  [PERMISSIONS.EXTRACT_SKU]: 'Extract SKU',
  [PERMISSIONS.MEESHO_DIRECT_SORT]: 'Meesho Direct Sort',
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { checkFeature } = useFeatureFlags();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const activePermissionSections = React.useMemo(() => {
    return PERMISSION_SECTIONS.map(section => {
      const filteredPermissions = section.permissions.filter(perm => {
        if (perm === PERMISSIONS.MEESHO_DIRECT_SORT && isMounted && !checkFeature('isMeeshoDirectSort')) {
          return false;
        }
        return true;
      });
      return { ...section, permissions: filteredPermissions };
    }).filter(section => section.permissions.length > 0);
  }, [checkFeature, isMounted]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await HTTP('GET', '/user');
      setUsers(response.data || []);
      if (response.companyAccounts) {
        setAvailableAccounts(response.companyAccounts);
      }
    } catch (error) {
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (values, { resetForm }) => {
    setLoading(true);
    try {
      if (editingUser) {
        await HTTP('PUT', '/user', { ...values, _id: editingUser._id });
        toast.success('User updated successfully');
      } else {
        await HTTP('POST', '/user', values);
        toast.success('User created successfully');
      }
      resetForm();
      setEditingUser(null);
      setModalIsOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Error saving user');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setAccountSearch('');
    setModalIsOpen(true);
  };

  const handleDelete = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await HTTP('DELETE', '/user', { _id: userId });
        toast.success('User deleted successfully');
        fetchUsers();
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to delete user');
      }
    }
  };

  const openModal = () => {
    setEditingUser(null);
    setAccountSearch('');
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setModalIsOpen(false);
    setEditingUser(null);
    setAccountSearch('');
  };

  const handlePermissionChange = (perm, checked, currentPerms, setFieldValue) => {
    let updated = [...currentPerms];
    if (checked) {
      if (!updated.includes(perm)) updated.push(perm);
      // Auto-grant read when write is checked
      if (perm === PERMISSIONS.MASTER_SKU_WRITE && !updated.includes(PERMISSIONS.MASTER_SKU_READ)) {
        updated.push(PERMISSIONS.MASTER_SKU_READ);
      }
      if (perm === PERMISSIONS.MASTER_RATE_WRITE && !updated.includes(PERMISSIONS.MASTER_RATE_READ)) {
        updated.push(PERMISSIONS.MASTER_RATE_READ);
      }
    } else {
      updated = updated.filter(p => p !== perm);
      // Auto-revoke write when read is unchecked
      if (perm === PERMISSIONS.MASTER_SKU_READ) {
        updated = updated.filter(p => p !== PERMISSIONS.MASTER_SKU_WRITE);
      }
      if (perm === PERMISSIONS.MASTER_RATE_READ) {
        updated = updated.filter(p => p !== PERMISSIONS.MASTER_RATE_WRITE);
      }
    }
    setFieldValue('permissions', updated);
  };

  return (
    <div className="max-w-4xl mx-auto mt-8 p-6 bg-white shadow-sm rounded-2xl border border-gray-200">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900">User Management & Permissions</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage manager roles, assign company accounts (Many-to-Many), and set Master SKU/Rate read & write permissions.
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-xs"
        >
          <FaPlus />
          <span>Add User</span>
        </button>
      </div>

      {loading && <FaSpinner className="animate-spin mx-auto mb-4 text-indigo-600 text-xl" />}

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-4 text-left font-bold text-gray-700 uppercase tracking-wider">Name</th>
              <th className="py-3 px-4 text-left font-bold text-gray-700 uppercase tracking-wider">Username</th>
              <th className="py-3 px-4 text-left font-bold text-gray-700 uppercase tracking-wider">Role</th>
              <th className="py-3 px-4 text-left font-bold text-gray-700 uppercase tracking-wider">Assigned Accounts</th>
              <th className="py-3 px-4 text-left font-bold text-gray-700 uppercase tracking-wider">Master Permissions</th>
              <th className="py-3 px-4 text-center font-bold text-gray-700 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {users.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500 font-semibold">
                  No users found. Click &quot;Add User&quot; to create one.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const perms = user.permissions || [];
                const hasSkuRead = perms.includes(PERMISSIONS.MASTER_SKU_READ) || perms.includes(PERMISSIONS.MASTER_SKU_WRITE);
                const hasSkuWrite = perms.includes(PERMISSIONS.MASTER_SKU_WRITE);
                const hasRateRead = perms.includes(PERMISSIONS.MASTER_RATE_READ) || perms.includes(PERMISSIONS.MASTER_RATE_WRITE);
                const hasRateWrite = perms.includes(PERMISSIONS.MASTER_RATE_WRITE);

                return (
                  <tr key={user._id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-bold text-gray-900">{user.name || '—'}</td>
                    <td className="py-3 px-4 font-mono text-gray-700">{user.username}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 text-gray-700 border border-gray-200">
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {user.hasAllCompanyAccess ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                          All Accounts (Unrestricted)
                        </span>
                      ) : user.assignedCompanies && user.assignedCompanies.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {user.assignedCompanies.slice(0, 2).map((acct) => (
                            <span
                              key={acct}
                              className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md"
                            >
                              {acct}
                            </span>
                          ))}
                          {user.assignedCompanies.length > 2 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-md">
                              +{user.assignedCompanies.length - 2} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                          0 Accounts (No Access)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        {hasSkuWrite ? (
                          <span className="px-1.5 py-0.5 font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded">
                            SKU: Read/Write
                          </span>
                        ) : hasSkuRead ? (
                          <span className="px-1.5 py-0.5 font-bold bg-purple-50/50 text-purple-600 border border-purple-100 rounded">
                            SKU: Read Only
                          </span>
                        ) : (
                          <span className="text-gray-400">SKU: None</span>
                        )}
                        {hasRateWrite ? (
                          <span className="px-1.5 py-0.5 font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                            Rate: Read/Write
                          </span>
                        ) : hasRateRead ? (
                          <span className="px-1.5 py-0.5 font-bold bg-emerald-50/50 text-emerald-600 border border-emerald-100 rounded">
                            Rate: Read Only
                          </span>
                        ) : (
                          <span className="text-gray-400">Rate: None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Edit User"
                        >
                          <FaEdit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(user._id)}
                          className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete User"
                        >
                          <FaTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Add / Edit User */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        ariaHideApp={false}
        style={{
          overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          },
          content: {
            position: 'relative',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '92vh',
            margin: 'auto',
            padding: '0',
            borderRadius: '16px',
            border: 'none',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <div className="flex flex-col h-full max-h-[92vh]">
          <div className="flex-shrink-0 p-5 bg-indigo-900 text-white flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black">{editingUser ? 'Edit User & Permissions' : 'Add New User'}</h2>
              <p className="text-xs text-indigo-200 mt-0.5">Configure role, assigned accounts, and permissions</p>
            </div>
            <button
              onClick={closeModal}
              className="text-white/80 hover:text-white p-1 rounded-lg text-lg transition cursor-pointer"
            >
              &times;
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 text-xs">
            <Formik
              initialValues={{
                name: editingUser ? editingUser.name : '',
                mobileNumber: editingUser ? editingUser.mobileNumber : '',
                username: editingUser ? editingUser.username : '',
                password: '',
                role: editingUser ? editingUser.role : USER_ROLES.MANAGER,
                permissions: editingUser ? (editingUser.permissions || []) : [],
                assignedCompanies: editingUser ? (editingUser.assignedCompanies || []) : [],
                hasAllCompanyAccess: editingUser ? Boolean(editingUser.hasAllCompanyAccess) : false,
              }}
              validate={(values) => {
                const errors = {};
                if (!values.name) errors.name = 'Required';
                if (!values.mobileNumber) errors.mobileNumber = 'Required';
                if (!values.username) errors.username = 'Required';
                if (!editingUser && !values.password) errors.password = 'Required';
                return errors;
              }}
              onSubmit={handleSubmit}
            >
              {({ values, setFieldValue, errors, touched }) => (
                <Form className="space-y-4">
                  {/* Basic Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                      <Field
                        name="name"
                        placeholder="e.g. John Doe"
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      {errors.name && touched.name && <p className="text-rose-500 text-[11px] mt-0.5">{errors.name}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Mobile Number</label>
                      <Field
                        name="mobileNumber"
                        placeholder="e.g. 9876543210"
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      {errors.mobileNumber && touched.mobileNumber && (
                        <p className="text-rose-500 text-[11px] mt-0.5">{errors.mobileNumber}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Username</label>
                      <Field
                        name="username"
                        placeholder="e.g. john_manager"
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                      />
                      {errors.username && touched.username && (
                        <p className="text-rose-500 text-[11px] mt-0.5">{errors.username}</p>
                      )}
                    </div>

                    {!editingUser && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Password</label>
                        <Field
                          type="password"
                          name="password"
                          placeholder="Password"
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                        />
                        {errors.password && touched.password && (
                          <p className="text-rose-500 text-[11px] mt-0.5">{errors.password}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 🏢 Assigned Company Accounts (Many-to-Many) */}
                  <div className="border border-indigo-200 bg-indigo-50/20 rounded-2xl p-4 space-y-3">
                    {/* Unrestricted toggle */}
                    <div className="p-3 bg-white border border-indigo-100 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                      <div>
                        <div className="font-bold text-gray-900 text-xs">
                          Unrestricted Company Access (બધા કંપની એકાઉન્ટ્સની પરવાનગી)
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {values.hasAllCompanyAccess
                            ? '✅ Manager has explicit unrestricted access to all company accounts.'
                            : (values.assignedCompanies || []).length > 0
                              ? `🔒 Restricted to ${(values.assignedCompanies || []).length} assigned account(s).`
                              : '⚠️ Zero accounts assigned — manager will have NO access to any company accounts.'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={Boolean(values.hasAllCompanyAccess)}
                          onChange={(e) => setFieldValue('hasAllCompanyAccess', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-100">
                      <div>
                        <div className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
                          <FaBuilding className="text-indigo-600" />
                          <span>Assigned Company Accounts (કંપની એકાઉન્ટ્સ)</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          આ મેનેજર ફક્ત પસંદ કરેલા એકાઉન્ટ્સ જ જોઈ શકશે. (0 એકાઉન્ટ્સ પસંદ હશે તો કોઈ એકાઉન્ટ નહીં દેખાય)
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setFieldValue('assignedCompanies', [...availableAccounts])}
                          className="px-2.5 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition cursor-pointer shadow-2xs"
                        >
                          Select All ({availableAccounts.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFieldValue('assignedCompanies', [])}
                          className="px-2.5 py-1 text-[11px] bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold rounded-lg transition cursor-pointer shadow-2xs"
                        >
                          Deselect All (0 Accounts)
                        </button>
                      </div>
                    </div>

                    {/* Account Search */}
                    {availableAccounts.length > 6 && (
                      <div className="relative">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                        <input
                          type="text"
                          placeholder="એકાઉન્ટ શોધો..."
                          value={accountSearch}
                          onChange={(e) => setAccountSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                    )}

                    {/* Checkbox Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                      {availableAccounts
                        .filter((a) => a.toLowerCase().includes(accountSearch.toLowerCase().trim()))
                        .map((acct) => {
                          const isAssigned = (values.assignedCompanies || []).includes(acct);
                          return (
                            <label
                              key={acct}
                              className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-mono font-bold cursor-pointer transition select-none ${
                                isAssigned
                                  ? 'bg-indigo-100 border-indigo-400 text-indigo-900 shadow-2xs'
                                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={(e) => {
                                  const current = [...(values.assignedCompanies || [])];
                                  if (e.target.checked) {
                                    if (!current.includes(acct)) current.push(acct);
                                  } else {
                                    const idx = current.indexOf(acct);
                                    if (idx > -1) current.splice(idx, 1);
                                  }
                                  setFieldValue('assignedCompanies', current);
                                }}
                                className="w-3.5 h-3.5 text-indigo-600 rounded accent-indigo-600 cursor-pointer"
                              />
                              <span className="truncate" title={acct}>
                                {acct}
                              </span>
                            </label>
                          );
                        })}
                    </div>

                    <div className="text-[11px] text-indigo-900 font-semibold pt-1">
                      {values.assignedCompanies && values.assignedCompanies.length > 0 ? (
                        <span>
                          પસંદ કરેલા એકાઉન્ટ્સ: <strong>{values.assignedCompanies.length}</strong> / {availableAccounts.length}
                        </span>
                      ) : (
                        <span className="text-emerald-700">
                          બધા એકાઉન્ટ્સ સક્રિય (Full Access to All Accounts)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Permissions Section */}
                  <div className="space-y-3">
                    <label className="block text-xs font-extrabold text-gray-900">Permissions (પરવાનગીઓ)</label>
                    <FieldArray name="permissions">
                      {() => (
                        <div className="space-y-3">
                          {activePermissionSections.map((section, sectionIdx) => {
                            const sectionPermissions = section.permissions;
                            const selectedPermissions = values.permissions || [];
                            const allSectionSelected = sectionPermissions.every((perm) =>
                              selectedPermissions.includes(perm)
                            );
                            const someSectionSelected = sectionPermissions.some((perm) =>
                              selectedPermissions.includes(perm)
                            );

                            const handleSectionToggle = (checked) => {
                              const currentPermissions = [...selectedPermissions];
                              if (checked) {
                                sectionPermissions.forEach((perm) => {
                                  if (!currentPermissions.includes(perm)) {
                                    currentPermissions.push(perm);
                                  }
                                });
                              } else {
                                sectionPermissions.forEach((perm) => {
                                  const index = currentPermissions.indexOf(perm);
                                  if (index > -1) {
                                    currentPermissions.splice(index, 1);
                                  }
                                });
                              }
                              setFieldValue('permissions', currentPermissions);
                            };

                            const isMasterSection = section.title === 'Master Files Management';

                            return (
                              <div
                                key={sectionIdx}
                                className={`border rounded-2xl p-3.5 ${
                                  isMasterSection ? 'border-purple-200 bg-purple-50/20' : 'border-gray-200 bg-white'
                                }`}
                              >
                                <div className="flex items-center mb-2.5 pb-2 border-b border-gray-100">
                                  <SectionCheckbox
                                    checked={allSectionSelected}
                                    indeterminate={someSectionSelected && !allSectionSelected}
                                    onChange={(e) => handleSectionToggle(e.target.checked)}
                                  />
                                  <label
                                    className="text-xs font-extrabold text-gray-900 cursor-pointer ml-2 flex items-center gap-1.5"
                                    onClick={() => handleSectionToggle(!allSectionSelected)}
                                  >
                                    {isMasterSection && <FaDatabase className="text-purple-600" />}
                                    <span>{section.title}</span>
                                  </label>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-5">
                                  {sectionPermissions.map((permission) => {
                                    const isChecked = selectedPermissions.includes(permission);
                                    const label = PERMISSION_LABELS[permission] || permission.replace(/_/g, ' ');

                                    return (
                                      <label
                                        key={permission}
                                        className="flex items-center text-xs text-gray-700 cursor-pointer hover:text-gray-900 select-none py-0.5"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) =>
                                            handlePermissionChange(
                                              permission,
                                              e.target.checked,
                                              selectedPermissions,
                                              setFieldValue
                                            )
                                          }
                                          className="mr-2 w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded accent-indigo-600 cursor-pointer"
                                        />
                                        <span className={isChecked ? 'font-bold text-gray-900' : ''}>
                                          {label}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </FieldArray>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
                    >
                      {loading ? <FaSpinner className="animate-spin" /> : editingUser ? 'Update User' : 'Create User'}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserManagement;
