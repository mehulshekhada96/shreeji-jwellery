import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  FaBuilding,
  FaSearch,
  FaTrashAlt,
  FaCheck,
  FaSyncAlt,
  FaTimes,
  FaPlus,
  FaTag,
  FaFileExport,
  FaFileImport,
  FaUndo,
  FaChevronDown,
  FaChevronUp,
  FaLayerGroup,
} from 'react-icons/fa';

const PLATFORMS = [
  { id: 'all', label: 'All Platforms', badgeColor: 'bg-gray-100 text-gray-700', activeClass: 'border-indigo-600 text-indigo-700 bg-indigo-50/70' },
  { id: 'meesho', label: 'Meesho', badgeColor: 'bg-pink-100 text-pink-700', activeClass: 'border-pink-600 text-pink-700 bg-pink-50/70' },
  { id: 'flipkart', label: 'Flipkart', badgeColor: 'bg-blue-100 text-blue-700', activeClass: 'border-blue-600 text-blue-700 bg-blue-50/70' },
  { id: 'amazon', label: 'Amazon', badgeColor: 'bg-amber-100 text-amber-800', activeClass: 'border-amber-600 text-amber-800 bg-amber-50/70' },
  { id: 'myntra', label: 'Myntra', badgeColor: 'bg-fuchsia-100 text-fuchsia-700', activeClass: 'border-fuchsia-600 text-fuchsia-700 bg-fuchsia-50/70' },
  { id: 'snapdeal', label: 'Snapdeal', badgeColor: 'bg-red-100 text-red-700', activeClass: 'border-red-600 text-red-700 bg-red-50/70' },
];

export default function CompanyMappingManager() {
  const [activePlatform, setActivePlatform] = useState('all');
  const [platformCounts, setPlatformCounts] = useState({
    all: 0,
    meesho: 0,
    amazon: 0,
    flipkart: 0,
    myntra: 0,
    snapdeal: 0,
  });

  const [canonicalGroups, setCanonicalGroups] = useState([]);
  const [allRawNames, setAllRawNames] = useState([]);
  const [ignoredNames, setIgnoredNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // Multi-delete selections
  const [selectedNames, setSelectedNames] = useState([]);
  const [selectedIgnored, setSelectedIgnored] = useState([]);

  // Collapsible for ignored names
  const [showIgnored, setShowIgnored] = useState(false);

  // New Master Company modal state
  const [isAddMasterOpen, setIsAddMasterOpen] = useState(false);
  const [newMasterName, setNewMasterName] = useState('');

  // Hidden file input ref for Excel import
  const fileInputRef = useRef(null);

  const showNotify = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchMappings = async (plat = activePlatform) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const { data } = await axios.get('/api/company-mapping', {
        params: { platform: plat },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (data?.success) {
        setCanonicalGroups(data.canonicalGroups || []);
        setAllRawNames(data.allRawNames || []);
        setIgnoredNames(data.ignoredNames || []);
        if (data.platformCounts) {
          setPlatformCounts(data.platformCounts);
        }
      }
    } catch (err) {
      console.error('Error fetching mappings:', err);
      showNotify('error', err.response?.data?.message || 'મેપિંગ લોડ કરવામાં ભૂલ આવી.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (platId) => {
    setActivePlatform(platId);
    setSelectedNames([]);
    fetchMappings(platId);
  };

  // Filter canonical groups by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return canonicalGroups;
    const q = searchQuery.toLowerCase().trim();
    return canonicalGroups.filter(
      (g) =>
        g.canonicalName.toLowerCase().includes(q) ||
        g.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [canonicalGroups, searchQuery]);

  // Set of all currently assigned aliases across all groups
  const assignedAliasesSet = useMemo(() => {
    const set = new Set();
    canonicalGroups.forEach((g) => {
      g.aliases.forEach((a) => set.add(a));
    });
    return set;
  }, [canonicalGroups]);

  // Add an alias to a canonical company
  const handleAddAlias = async (canonicalName, rawName) => {
    if (!rawName || rawName === '__NONE__') return;

    try {
      setSavingKey(`${canonicalName}-${rawName}`);
      const token = localStorage.getItem('token');
      const { data } = await axios.post(
        '/api/company-mapping',
        { action: 'add-alias', canonicalName, rawName, platform: activePlatform },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success) {
        showNotify('success', `'${rawName}' ને '${canonicalName}' સાથે જોડી દેવાયું!`);
        fetchMappings(activePlatform);
      }
    } catch (err) {
      console.error('Error adding alias:', err);
      showNotify('error', err.response?.data?.message || 'નામ ઉમેરવામાં ભૂલ આવી.');
    } finally {
      setSavingKey(null);
    }
  };

  // Remove an alias tag from a canonical company
  const handleRemoveAlias = async (canonicalName, rawName) => {
    try {
      setSavingKey(`${canonicalName}-${rawName}`);
      const token = localStorage.getItem('token');
      const { data } = await axios.delete(
        `/api/company-mapping?action=remove-alias&rawName=${encodeURIComponent(rawName)}&platform=${activePlatform}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success) {
        showNotify('success', `'${rawName}' ને '${canonicalName}' માંથી હટાવી દીધું!`);
        fetchMappings(activePlatform);
      }
    } catch (err) {
      console.error('Error removing alias:', err);
      showNotify('error', err.response?.data?.message || 'નામ હટાવવામાં ભૂલ આવી.');
    } finally {
      setSavingKey(null);
    }
  };

  // Check if all filtered groups are selected
  const isAllFilteredSelected = useMemo(() => {
    if (filteredGroups.length === 0) return false;
    return filteredGroups.every((g) => selectedNames.includes(g.canonicalName));
  }, [filteredGroups, selectedNames]);

  // Toggle single name selection
  const toggleSelectName = (name) => {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  // Toggle select all visible filtered groups
  const toggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const filteredSet = new Set(filteredGroups.map((g) => g.canonicalName));
      setSelectedNames((prev) => prev.filter((n) => !filteredSet.has(n)));
    } else {
      const newSelected = new Set(selectedNames);
      filteredGroups.forEach((g) => newSelected.add(g.canonicalName));
      setSelectedNames([...newSelected]);
    }
  };

  // Multi-delete selected names
  const handleDeleteMultiple = async () => {
    if (selectedNames.length === 0) return;

    if (
      !window.confirm(
        `શું તમે પસંદ કરેલા ${selectedNames.length} નામોને કંપની લિસ્ટમાંથી હટાવવા માંગો છો?\n(આ બધા નોન-કંપની/જંક નામો લિસ્ટમાંથી નીકળી જશે)`
      )
    ) {
      return;
    }

    try {
      setSavingKey('delete-multiple');
      const token = localStorage.getItem('token');
      const { data } = await axios.post(
        '/api/company-mapping',
        { action: 'delete-multiple', names: selectedNames, platform: activePlatform },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success) {
        showNotify('success', data.message || `${selectedNames.length} નામો સફળતાપૂર્વક હટાવી દીધા!`);
        const deletedSet = new Set(selectedNames);
        setCanonicalGroups((prev) => prev.filter((g) => !deletedSet.has(g.canonicalName)));
        setAllRawNames((prev) => prev.filter((r) => !deletedSet.has(r)));
        setIgnoredNames((prev) => [...new Set([...prev, ...selectedNames])].sort());
        setSelectedNames([]);
        fetchMappings(activePlatform);
      }
    } catch (err) {
      console.error('Error deleting multiple names:', err);
      showNotify('error', err.response?.data?.message || 'નામો હટાવવામાં ભૂલ આવી.');
    } finally {
      setSavingKey(null);
    }
  };

  // Delete / Ignore a name from Left Side (for non-company strings)
  const handleDeleteLeftSideName = async (name) => {
    if (
      !window.confirm(
        `શું તમે '${name}' ને કંપની લિસ્ટમાંથી હટાવવા માંગો છો?\n(જો આ કોઈ કંપની ન હોય પરંતુ કચરો/ટેક્સ્ટ હોય તો આ લિસ્ટમાંથી નીકળી જશે)`
      )
    ) {
      return;
    }

    try {
      setSavingKey(`delete-${name}`);
      const token = localStorage.getItem('token');
      const { data } = await axios.post(
        '/api/company-mapping',
        { action: 'delete-name', name, platform: activePlatform },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success) {
        showNotify('success', `'${name}' ને સફળતાપૂર્વક હટાવી દીધું!`);
        setSelectedNames((prev) => prev.filter((n) => n !== name));
        setCanonicalGroups((prev) => prev.filter((g) => g.canonicalName !== name));
        setAllRawNames((prev) => prev.filter((r) => r !== name));
        setIgnoredNames((prev) => [...new Set([...prev, name])].sort());
        fetchMappings(activePlatform);
      }
    } catch (err) {
      console.error('Error deleting name:', err);
      showNotify('error', err.response?.data?.message || 'નામ હટાવવામાં ભૂલ આવી.');
    } finally {
      setSavingKey(null);
    }
  };

  // Toggle selection for ignored names
  const toggleSelectIgnored = (name) => {
    setSelectedIgnored((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const toggleSelectAllIgnored = () => {
    if (selectedIgnored.length === ignoredNames.length) {
      setSelectedIgnored([]);
    } else {
      setSelectedIgnored([...ignoredNames]);
    }
  };

  // Restore multiple ignored names
  const handleRestoreMultiple = async () => {
    if (selectedIgnored.length === 0) return;

    try {
      setSavingKey('restore-multiple');
      const token = localStorage.getItem('token');
      const { data } = await axios.post(
        '/api/company-mapping',
        { action: 'restore-multiple', names: selectedIgnored, platform: activePlatform },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success) {
        showNotify('success', `${selectedIgnored.length} નામો ફરીથી સક્રિય કરી દેવાયા!`);
        const restoredSet = new Set(selectedIgnored);
        setIgnoredNames((prev) => prev.filter((n) => !restoredSet.has(n)));
        setSelectedIgnored([]);
        fetchMappings(activePlatform);
      }
    } catch (err) {
      console.error('Error restoring multiple names:', err);
      showNotify('error', err.response?.data?.message || 'રીસ્ટોર કરવામાં ભૂલ આવી.');
    } finally {
      setSavingKey(null);
    }
  };

  // Restore an ignored / deleted name
  const handleRestoreName = async (name) => {
    try {
      setSavingKey(`restore-${name}`);
      const token = localStorage.getItem('token');
      const { data } = await axios.post(
        '/api/company-mapping',
        { action: 'restore-name', name, platform: activePlatform },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success) {
        showNotify('success', `'${name}' ફરીથી લિસ્ટમાં ઉમેરાઈ ગયું!`);
        setSelectedIgnored((prev) => prev.filter((n) => n !== name));
        setIgnoredNames((prev) => prev.filter((n) => n !== name));
        fetchMappings(activePlatform);
      }
    } catch (err) {
      console.error('Error restoring name:', err);
      showNotify('error', err.response?.data?.message || 'રીસ્ટોર કરવામાં ભૂલ આવી.');
    } finally {
      setSavingKey(null);
    }
  };

  // Create a new master company
  const handleCreateNewMaster = async (e) => {
    e.preventDefault();
    if (!newMasterName.trim()) return;

    const cleanName = newMasterName.trim().toUpperCase();
    try {
      setSavingKey('new-master');
      const token = localStorage.getItem('token');
      const { data } = await axios.post(
        '/api/company-mapping',
        { action: 'create-canonical', canonicalName: cleanName, platform: activePlatform },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data?.success) {
        showNotify('success', `નવી મુખ્ય કંપની '${cleanName}' સફળતાપૂર્વક ઉમેરાઈ!`);
        setNewMasterName('');
        setIsAddMasterOpen(false);
        fetchMappings(activePlatform);
      }
    } catch (err) {
      console.error('Error creating master company:', err);
      showNotify('error', err.response?.data?.message || 'મુખ્ય કંપની ઉમેરવામાં ભૂલ આવી.');
    } finally {
      setSavingKey(null);
    }
  };

  // ================= EXPORT AS EXCEL =================
  const handleExportExcel = () => {
    try {
      const rows = [];

      // Export active canonical groups and their aliases
      canonicalGroups.forEach((group) => {
        const plat = activePlatform === 'all' ? (group.platform || 'all') : activePlatform;
        if (group.aliases.length === 0) {
          rows.push({
            'Platform': plat.toUpperCase(),
            'Main Company': group.canonicalName,
            'Alias Name': group.canonicalName,
            'Type': 'Primary',
          });
        } else {
          group.aliases.forEach((alias) => {
            rows.push({
              'Platform': plat.toUpperCase(),
              'Main Company': group.canonicalName,
              'Alias Name': alias,
              'Type': alias === group.canonicalName ? 'Primary' : 'Alias',
            });
          });
        }
      });

      // Export ignored/deleted non-company names
      ignoredNames.forEach((ign) => {
        rows.push({
          'Platform': activePlatform.toUpperCase(),
          'Main Company': 'IGNORED_NON_COMPANY',
          'Alias Name': ign,
          'Type': 'Ignored',
        });
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      // Set column widths
      ws['!cols'] = [
        { wch: 15 }, // Platform
        { wch: 35 }, // Main Company
        { wch: 35 }, // Alias Name
        { wch: 15 }, // Type
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Company Mapping');

      const dateStr = new Date().toISOString().slice(0, 10);
      const platSuffix = activePlatform !== 'all' ? `_${activePlatform.toUpperCase()}` : '';
      XLSX.writeFile(wb, `Company_Mapping${platSuffix}_${dateStr}.xlsx`);
      showNotify('success', 'મેપિંગ એક્સેલ ફાઈલ ડાઉનલોડ થઈ ગઈ!');
    } catch (err) {
      console.error('Error exporting mapping to Excel:', err);
      showNotify('error', 'એક્સેલ એક્સપોર્ટ કરવામાં ભૂલ આવી.');
    }
  };

  // ================= IMPORT FROM EXCEL =================
  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);

          if (!jsonData || jsonData.length === 0) {
            showNotify('error', 'એક્સેલ ફાઈલ ખાલી છે.');
            setLoading(false);
            return;
          }

          const token = localStorage.getItem('token');
          const { data } = await axios.post(
            '/api/company-mapping',
            { action: 'import-excel', mappings: jsonData, platform: activePlatform },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (data?.success) {
            showNotify('success', data.message || 'એક્સેલમાંથી મેપિંગ સફળતાપૂર્વક ઇમ્પોર્ટ થઈ ગયું!');
            fetchMappings(activePlatform);
          }
        } catch (innerErr) {
          console.error('Error parsing Excel:', innerErr);
          showNotify('error', 'એક્સેલ ફાઈલ વાંચવામાં ભૂલ આવી.');
        } finally {
          setLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      console.error('Error reading file:', err);
      showNotify('error', 'ફાઈલ સિલેક્ટ કરવામાં ભૂલ આવી.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Hidden file input for Excel import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportExcel}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />

      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-bold transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {notification.type === 'success' ? (
            <FaCheck className="w-3.5 h-3.5" />
          ) : (
            <FaTimes className="w-3.5 h-3.5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <FaBuilding className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">કંપની નેમ મેપિંગ (Company Mapping)</h2>
            <p className="text-xs text-gray-500">
              ડાબી બાજુ મુખ્ય કંપની ➔ જમણી બાજુ મલ્ટિપલ નામો (Aliases) સિલેક્ટ કરો
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 sm:w-56">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="કંપની કે ટેગ શોધો..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
            />
          </div>

          {/* Export Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="લોકલમાંથી એક્સેલ એક્સપોર્ટ કરો"
          >
            <FaFileExport className="w-3 h-3" />
            <span>Export Excel</span>
          </button>

          {/* Import Excel */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="પ્રોડક્શન માટે એક્સેલ ઇમ્પોર્ટ કરો"
          >
            <FaFileImport className="w-3 h-3" />
            <span>Import Excel</span>
          </button>

          {/* Add Master */}
          <button
            type="button"
            onClick={() => setIsAddMasterOpen(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="નવી મુખ્ય કંપની બનાવો"
          >
            <FaPlus className="w-3 h-3" />
            <span>નવી કંપની</span>
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => fetchMappings(activePlatform)}
            className="p-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-xl hover:bg-gray-50 transition cursor-pointer"
            title="રીફ્રેશ"
          >
            <FaSyncAlt className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Platform Tabs Navigation */}
      <div className="bg-white p-1.5 rounded-2xl border border-gray-200/80 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {PLATFORMS.map((plat) => {
            const isActive = activePlatform === plat.id;
            const count = platformCounts[plat.id] ?? 0;

            return (
              <button
                key={plat.id}
                type="button"
                onClick={() => handleTabChange(plat.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap cursor-pointer border ${
                  isActive
                    ? plat.activeClass + ' shadow-xs border-b-2'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span>{plat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                    isActive ? 'bg-white shadow-2xs text-gray-900' : plat.badgeColor
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add New Master Modal */}
      {isAddMasterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden animate-scale-up">
            <div className="bg-indigo-900 p-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <FaBuilding />
                <span>નવી મુખ્ય કંપની ઉમેરો (Add Main Company)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddMasterOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleCreateNewMaster} className="p-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  મુખ્ય કંપનીનું નામ (Canonical Company Name)
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newMasterName}
                  onChange={(e) => setNewMasterName(e.target.value)}
                  placeholder="દા.ત. VARNI_JEWELS"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase font-bold"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  આ નામ ઇનવોઇસ અને રિકોન્સિલિએશન બિલિંગમાં મુખ્ય ગ્રૂપ તરીકે વપરાશે.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddMasterOpen(false)}
                  className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-xl font-bold transition cursor-pointer"
                >
                  રદ કરો
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
                >
                  ઉમેરો
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Delete Action Bar */}
      {selectedNames.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs">
              <FaTrashAlt className="w-4 h-4" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-rose-950 flex items-center gap-2">
                <span>{selectedNames.length} કંપની/નામો સિલેક્ટ કર્યા છે</span>
                <span className="text-[10px] bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full font-mono">
                  {selectedNames.length} SELECTED
                </span>
              </div>
              <p className="text-[11px] text-rose-700">
                આ બધા નોન-કંપની/જંક નામોને લિસ્ટમાંથી એકસાથે હટાવવા માટે &quot;Delete Selected&quot; બટન દબાવો.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedNames([])}
              className="px-3.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
            >
              સિલેક્શન રદ કરો (Cancel)
            </button>

            <button
              type="button"
              onClick={handleDeleteMultiple}
              disabled={savingKey === 'delete-multiple'}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <FaTrashAlt className="w-3 h-3" />
              <span>
                {savingKey === 'delete-multiple'
                  ? 'હટાવી રહ્યા છીએ...'
                  : `ડિલીટ કરો (${selectedNames.length})`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 2-Column Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-4 w-14 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                      title="બધા સિલેક્ટ કરો / અન-સિલેક્ટ કરો"
                    />
                    <span className="text-[10px] text-gray-400 font-normal">All</span>
                  </div>
                </th>
                <th className="py-3 px-4 w-4/12">મુખ્ય કંપની (Main / Canonical Company)</th>
                <th className="py-3 px-4 w-8/12">આ કંપની સાથે જોડેલા નામો (Mapped Aliases - Multiple Tags)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-gray-500 font-semibold">
                    <FaSyncAlt className="animate-spin inline-block w-5 h-5 text-indigo-600 mb-2" />
                    <div>કંપની મેપિંગ ડેટા લોડ થઈ રહ્યો છે...</div>
                  </td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-gray-500 space-y-1">
                    <div className="font-bold text-gray-700">કોઈ કંપની મળ્યું નથી</div>
                    <p className="text-xs text-gray-400">
                      {searchQuery
                        ? 'શોધ મુજબ કોઈ પરિણામ નથી.'
                        : `${PLATFORMS.find((p) => p.id === activePlatform)?.label} માં કોઈ કંપની ડેટા ઉપલબ્ધ નથી.`}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group, idx) => {
                  const availableToAdd = allRawNames.filter((r) => !group.aliases.includes(r));
                  const isDeleting = savingKey === `delete-${group.canonicalName}`;
                  const isSelected = selectedNames.includes(group.canonicalName);

                  return (
                    <tr
                      key={group.canonicalName}
                      className={`transition ${isSelected ? 'bg-rose-50/50' : 'hover:bg-blue-50/30'}`}
                    >
                      {/* Checkbox + # */}
                      <td className="py-4 px-4 text-center align-top pt-4">
                        <div className="flex flex-col items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectName(group.canonicalName)}
                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                            title={`'${group.canonicalName}' સિલેક્ટ કરો`}
                          />
                          <span className="text-[10px] text-gray-400 font-mono font-semibold">
                            {idx + 1}
                          </span>
                        </div>
                      </td>

                      {/* Left: Canonical Company */}
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start justify-between gap-2 group">
                          <div>
                            <div className="font-black text-gray-900 text-sm flex items-center gap-2">
                              <span>{group.canonicalName}</span>
                              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-mono font-bold">
                                {group.aliases.length}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400 font-medium">
                              મુખ્ય બિલિંગ નામ (Canonical Master)
                            </span>
                          </div>

                          {/* Delete from left side (for non-company strings) */}
                          <button
                            type="button"
                            onClick={() => handleDeleteLeftSideName(group.canonicalName)}
                            disabled={isDeleting}
                            className="opacity-70 group-hover:opacity-100 text-gray-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
                            title={`'${group.canonicalName}' ને લિસ્ટમાંથી હટાવો (જો આ નોન-કંપની નામ હોય તો)`}
                          >
                            <FaTrashAlt className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Right: Aliases (Multi-Select Tags) */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2.5">
                          {/* Tags Container */}
                          <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                            {group.aliases.map((alias) => {
                              const isSelf = alias === group.canonicalName;
                              const isRemoving = savingKey === `${group.canonicalName}-${alias}`;

                              return (
                                <span
                                  key={alias}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold font-mono transition-all border ${
                                    isSelf
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  }`}
                                >
                                  <FaTag className="w-2.5 h-2.5 opacity-60" />
                                  <span>{alias}</span>

                                  {isSelf && (
                                    <span className="text-[9px] bg-indigo-200 text-indigo-800 px-1 py-0.2 rounded font-sans font-semibold">
                                      Primary
                                    </span>
                                  )}

                                  {/* Delete / Remove Alias Tag */}
                                  {!isSelf && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAlias(group.canonicalName, alias)}
                                      disabled={isRemoving}
                                      className="ml-1 text-emerald-700 hover:text-rose-600 hover:bg-rose-100 p-0.5 rounded-full transition cursor-pointer disabled:opacity-50"
                                      title={`'${alias}' ને હટાવો`}
                                    >
                                      <FaTimes className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </span>
                              );
                            })}
                          </div>

                          {/* Add Alias Dropdown */}
                          <div className="flex items-center gap-2 pt-1">
                            <select
                              value="__NONE__"
                              onChange={(e) => handleAddAlias(group.canonicalName, e.target.value)}
                              className="px-3 py-1.5 border border-dashed border-indigo-300 bg-white hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition shadow-2xs"
                            >
                              <option value="__NONE__">
                                ➕ આ કંપનીમાં બીજું નામ જોડો (Add Alias)...
                              </option>
                              {availableToAdd.map((availName) => {
                                const isAssignedElsewhere = assignedAliasesSet.has(availName);
                                return (
                                  <option key={availName} value={availName}>
                                    {availName} {isAssignedElsewhere ? '(અન્ય કંપનીમાંથી શિફ્ટ થશે)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ignored / Deleted Non-Company Names Drawer */}
      {ignoredNames.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-600">
            <button
              type="button"
              onClick={() => setShowIgnored(!showIgnored)}
              className="flex items-center gap-2 hover:text-gray-900 transition cursor-pointer"
            >
              <FaTrashAlt className="text-gray-400" />
              <span>હટાવેલા / નોન-કંપની નામો ({ignoredNames.length})</span>
              {showIgnored ? <FaChevronUp className="w-3 h-3 text-gray-400" /> : <FaChevronDown className="w-3 h-3 text-gray-400" />}
            </button>

            {showIgnored && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAllIgnored}
                  className="px-2.5 py-1 text-[11px] bg-white border border-gray-300 hover:bg-gray-100 rounded-lg text-gray-700 font-semibold cursor-pointer"
                >
                  {selectedIgnored.length === ignoredNames.length ? 'બધા અન-સિલેક્ટ કરો' : 'બધા સિલેક્ટ કરો'}
                </button>
                {selectedIgnored.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRestoreMultiple}
                    disabled={savingKey === 'restore-multiple'}
                    className="px-3 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <FaUndo className="w-2.5 h-2.5" />
                    <span>રીસ્ટોર ({selectedIgnored.length})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {showIgnored && (
            <div className="pt-2 border-t border-gray-200/80 flex flex-wrap gap-2 animate-fade-in">
              {ignoredNames.map((ignName) => {
                const isSelectedIgn = selectedIgnored.includes(ignName);

                return (
                  <span
                    key={ignName}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl text-xs font-mono border shadow-2xs transition ${
                      isSelectedIgn ? 'bg-blue-50 border-blue-400 text-blue-900' : 'bg-white border-gray-300 text-gray-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelectedIgn}
                      onChange={() => toggleSelectIgnored(ignName)}
                      className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer"
                    />
                    <span className="line-through">{ignName}</span>
                    <button
                      type="button"
                      onClick={() => handleRestoreName(ignName)}
                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded-md transition cursor-pointer font-sans text-[11px] font-bold flex items-center gap-1"
                      title="આ નામ ફરીથી લિસ્ટમાં લાવો"
                    >
                      <FaUndo className="w-2.5 h-2.5" />
                      <span>રીસ્ટોર</span>
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
