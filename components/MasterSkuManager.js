import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import moment from 'moment';
import * as XLSX from 'xlsx';
import {
  FaDatabase,
  FaUpload,
  FaPlus,
  FaEdit,
  FaTrash,
  FaSearch,
  FaFileExcel,
  FaHistory,
  FaSync,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimes,
  FaArrowLeft,
  FaArrowRight,
  FaEye,
  FaCalendarAlt,
  FaUser,
  FaInfoCircle,
  FaExchangeAlt,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaDownload,
  FaUndo
} from 'react-icons/fa';

export default function MasterSkuManager({ onMasterSkusUpdated }) {
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [history, setHistory] = useState([]);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [historyTab, setHistoryTab] = useState('uploads'); // 'uploads' | 'all'
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Column Sorting state
  const [sortBy, setSortBy] = useState('sku');
  const [sortOrder, setSortOrder] = useState('asc');

  // Snapshot download/restore state
  const [downloadingSnapshot, setDownloadingSnapshot] = useState(false);
  const [restoringSnapshot, setRestoringSnapshot] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoringItem, setRestoringItem] = useState(null);

  // Delete File / Snapshot state
  const [showDeleteFileModal, setShowDeleteFileModal] = useState(false);
  const [deletingFileItem, setDeletingFileItem] = useState(null);
  const [deletingFile, setDeletingFile] = useState(false);
  const [deleteActiveSkusOption, setDeleteActiveSkusOption] = useState(false);

  // Delete Whole Current Active Master File state
  const [showDeleteCurrentFileModal, setShowDeleteCurrentFileModal] = useState(false);
  const [deletingCurrentFile, setDeletingCurrentFile] = useState(false);
  const [deleteFromHistoryOption, setDeleteFromHistoryOption] = useState(true);

  // Infinite Scroll Sentinel ref
  const observerTarget = useRef(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const fileInputRef = useRef(null);

  // Add / Edit Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ sku: '', origin: '', size: '' });
  const [saving, setSaving] = useState(false);

  // Delete Modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch SKUs with infinite scroll and dynamic sorting
  const fetchSkus = useCallback(async (targetPage = 1, searchQuery = search, sortField = sortBy, sortDir = sortOrder, reset = false) => {
    if (targetPage === 1 || reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/master-sku', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          page: targetPage,
          limit: 50,
          search: searchQuery,
          sortBy: sortField,
          sortOrder: sortDir
        }
      });

      if (res.data.success) {
        const fetchedItems = res.data.items || [];
        setTotalCount(res.data.totalCount || 0);
        setPage(targetPage);
        const totalPages = res.data.totalPages || 1;
        setHasMore(targetPage < totalPages);

        if (targetPage === 1 || reset) {
          setItems(fetchedItems);
        } else {
          setItems(prev => [...prev, ...fetchedItems]);
        }

        if (res.data.history) {
          setHistory(res.data.history);
        }
        if (res.data.uploadHistory) {
          setUploadHistory(res.data.uploadHistory);
        }
      }
    } catch (err) {
      console.error('Error loading master SKUs:', err);
      toast.error(err.response?.data?.message || 'Failed to load Master SKUs');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, sortBy, sortOrder]);

  // Initial load
  useEffect(() => {
    fetchSkus(1, search, sortBy, sortOrder, true);
  }, []);

  // Infinite Scroll IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          fetchSkus(page + 1, search, sortBy, sortOrder, false);
        }
      },
      { threshold: 0.1 }
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [hasMore, loading, loadingMore, page, search, sortBy, sortOrder, fetchSkus]);

  // Column Sort Click Handler
  const handleSort = (field) => {
    let newOrder = 'asc';
    if (sortBy === field) {
      newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    }
    setSortBy(field);
    setSortOrder(newOrder);
    setPage(1);
    fetchSkus(1, search, field, newOrder, true);
  };

  // Handle Search input with enter or button click
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchSkus(1, search, sortBy, sortOrder, true);
  };

  // Download Snapshot Excel File
  const handleDownloadSnapshot = async (historyItem) => {
    setDownloadingSnapshot(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/master-sku/snapshot?historyId=${historyItem._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.data.items || res.data.items.length === 0) {
        toast.warn('No SKU records found in this snapshot');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(res.data.items);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Master_SKUs');
      const rawName = res.data.fileName || 'master_sku_snapshot';
      const cleanName = rawName.endsWith('.xlsx') ? rawName : `${rawName}.xlsx`;
      XLSX.writeFile(wb, cleanName);
      toast.success(`Downloaded ${res.data.items.length.toLocaleString()} SKUs from ${cleanName}!`);
    } catch (err) {
      console.error('Snapshot download error:', err);
      toast.error(err.response?.data?.message || 'Failed to download snapshot');
    } finally {
      setDownloadingSnapshot(false);
    }
  };

  // Open Restore Confirmation Modal
  const handleOpenRestoreModal = (historyItem) => {
    setRestoringItem(historyItem);
    setShowRestoreModal(true);
  };

  // Confirm and Execute Restore from Snapshot
  const confirmRestoreSnapshot = async () => {
    if (!restoringItem) return;

    setRestoringSnapshot(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        '/api/master-sku/snapshot',
        { historyId: restoringItem._id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        toast.success(res.data.message);
        setShowRestoreModal(false);
        setRestoringItem(null);
        setSelectedHistoryItem(null);
        if (res.data.history) setHistory(res.data.history);
        if (res.data.uploadHistory) setUploadHistory(res.data.uploadHistory);
        fetchSkus(1, '', 'sku', 'asc', true);
        onMasterSkusUpdated?.();
      }
    } catch (err) {
      console.error('Snapshot restore error:', err);
      toast.error(err.response?.data?.message || 'Failed to restore snapshot');
    } finally {
      setRestoringSnapshot(false);
    }
  };

  // Open Delete File Record Confirmation Modal
  const handleOpenDeleteFileModal = (historyItem) => {
    setDeletingFileItem(historyItem);
    const isLatest = uploadHistory[0]?._id === historyItem._id;
    setDeleteActiveSkusOption(isLatest);
    setShowDeleteFileModal(true);
  };

  // Confirm and Execute Delete of File Record and its Snapshot
  const confirmDeleteFile = async () => {
    if (!deletingFileItem) return;

    setDeletingFile(true);
    try {
      const token = localStorage.getItem('token');
      const url = `/api/master-sku/snapshot?historyId=${deletingFileItem._id}${deleteActiveSkusOption ? '&deleteActiveSkus=true' : ''}`;
      const res = await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        toast.success(res.data.message || 'File record deleted successfully');
        setShowDeleteFileModal(false);
        setDeletingFileItem(null);
        if (selectedHistoryItem?._id === deletingFileItem._id) {
          setSelectedHistoryItem(null);
        }
        if (deleteActiveSkusOption) {
          setItems([]);
          setTotalCount(0);
          setPage(1);
          setHasMore(false);
          onMasterSkusUpdated?.();
        }
        if (res.data.history) setHistory(res.data.history);
        if (res.data.uploadHistory) setUploadHistory(res.data.uploadHistory);
      }
    } catch (err) {
      console.error('File delete error:', err);
      toast.error(err.response?.data?.message || 'Failed to delete file record');
    } finally {
      setDeletingFile(false);
    }
  };

  // Confirm and Execute Deletion of Whole Current Active Master SKU File
  const confirmDeleteCurrentFile = async () => {
    setDeletingCurrentFile(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`/api/master-sku?clearAll=true&deleteHistory=${deleteFromHistoryOption}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        toast.success(res.data.message || 'Current master file deleted successfully');
        setShowDeleteCurrentFileModal(false);
        setItems([]);
        setTotalCount(0);
        setPage(1);
        setHasMore(false);
        if (selectedHistoryItem && deleteFromHistoryOption) {
          setSelectedHistoryItem(null);
        }
        if (res.data.history) setHistory(res.data.history);
        if (res.data.uploadHistory) setUploadHistory(res.data.uploadHistory);
        onMasterSkusUpdated?.();
      }
    } catch (err) {
      console.error('Delete current file error:', err);
      toast.error(err.response?.data?.message || 'Failed to delete master file');
    } finally {
      setDeletingCurrentFile(false);
    }
  };

  // Handle File selection for Master File upload
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet);

      if (!rawRows || rawRows.length === 0) {
        toast.error('The selected Excel/CSV file is empty');
        setUploadFile(null);
        return;
      }

      // Auto-detect headers
      const sampleRow = rawRows[0];
      const keys = Object.keys(sampleRow);

      const findKey = (candidates) => {
        return keys.find(k => candidates.some(c => k.trim().toLowerCase() === c.toLowerCase())) || null;
      };

      const skuKey = findKey(['sku', 'sku id', 'style id', 'item code', 'product id', 'skuid']);
      const originKey = findKey(['origin', 'city', 'warehouse', 'source', 'location']);
      const sizeKey = findKey(['size', 'sizes']);

      if (!skuKey) {
        toast.error('Could not find a "SKU" column in the file. Headers found: ' + keys.join(', '));
        setUploadFile(null);
        return;
      }

      const extractedItems = [];
      const seen = new Set();

      for (const row of rawRows) {
        const rawSku = row[skuKey];
        if (rawSku != null && String(rawSku).trim().length > 0) {
          const cleanSku = String(rawSku).trim();
          const cleanKey = cleanSku.toLowerCase();
          if (!seen.has(cleanKey)) {
            seen.add(cleanKey);
            extractedItems.push({
              sku: cleanSku,
              origin: originKey && row[originKey] != null ? String(row[originKey]).trim() : '',
              size: sizeKey && row[sizeKey] != null ? String(row[sizeKey]).trim() : ''
            });
          }
        }
      }

      setParsedData({
        fileName: file.name,
        totalRows: extractedItems.length,
        skuKey,
        originKey: originKey || 'Not detected',
        sizeKey: sizeKey || 'Not detected',
        items: extractedItems
      });
      setShowUploadConfirm(true);
    } catch (err) {
      console.error('Error reading master file:', err);
      toast.error('Failed to parse file: ' + err.message);
      setUploadFile(null);
      setParsedData(null);
    }
  };

  // Perform upload to server
  const confirmUpload = async () => {
    if (!parsedData || !parsedData.items) return;

    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        '/api/master-sku/upload',
        {
          items: parsedData.items,
          fileName: parsedData.fileName
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        toast.success(res.data.message || 'Master file uploaded successfully!');
        if (res.data.history) setHistory(res.data.history);
        if (res.data.uploadHistory) setUploadHistory(res.data.uploadHistory);
        setShowUploadConfirm(false);
        setUploadFile(null);
        setParsedData(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchSkus(1, '', 'sku', 'asc', true);
        onMasterSkusUpdated?.();
      }
    } catch (err) {
      console.error('Error saving master file:', err);
      toast.error(err.response?.data?.message || 'Failed to save master file');
    } finally {
      setUploading(false);
    }
  };

  // Add SKU Submit
  const handleAddSku = async (e) => {
    e.preventDefault();
    if (!formData.sku.trim()) {
      toast.warn('SKU code is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        '/api/master-sku',
        {
          sku: formData.sku.trim(),
          origin: formData.origin.trim(),
          size: formData.size.trim()
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        toast.success(res.data.message);
        if (res.data.history) setHistory(res.data.history);
        setShowAddModal(false);
        setFormData({ sku: '', origin: '', size: '' });
        fetchSkus(1, search, sortBy, sortOrder, true);
        onMasterSkusUpdated?.();
      }
    } catch (err) {
      console.error('Error adding SKU:', err);
      toast.error(err.response?.data?.message || 'Failed to add SKU');
    } finally {
      setSaving(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      sku: item.sku || '',
      origin: item.origin || '',
      size: item.size || ''
    });
    setShowEditModal(true);
  };

  // Edit SKU Submit
  const handleEditSku = async (e) => {
    e.preventDefault();
    if (!formData.sku.trim()) {
      toast.warn('SKU code cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(
        '/api/master-sku',
        {
          id: editingItem._id,
          sku: formData.sku.trim(),
          origin: formData.origin.trim(),
          size: formData.size.trim()
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        toast.success(res.data.message);
        if (res.data.history) setHistory(res.data.history);
        setShowEditModal(false);
        setEditingItem(null);
        setFormData({ sku: '', origin: '', size: '' });
        fetchSkus(1, search, sortBy, sortOrder, true);
        onMasterSkusUpdated?.();
      }
    } catch (err) {
      console.error('Error updating SKU:', err);
      toast.error(err.response?.data?.message || 'Failed to update SKU');
    } finally {
      setSaving(false);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (item) => {
    setDeletingItem(item);
    setShowDeleteModal(true);
  };

  // Delete SKU Submit
  const handleDeleteSku = async () => {
    if (!deletingItem) return;

    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`/api/master-sku?id=${deletingItem._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        toast.success(res.data.message);
        if (res.data.history) setHistory(res.data.history);
        setShowDeleteModal(false);
        setDeletingItem(null);
        fetchSkus(1, search, sortBy, sortOrder, true);
        onMasterSkusUpdated?.();
      }
    } catch (err) {
      console.error('Error deleting SKU:', err);
      toast.error(err.response?.data?.message || 'Failed to delete SKU');
    } finally {
      setDeleting(false);
    }
  };

  // Export current Master SKUs to Excel
  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      toast.info('Exporting all master SKUs...');
      const res = await axios.get('/api/master-sku?all=true', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.data.skus || res.data.skus.length === 0) {
        toast.warn('No SKUs to export');
        return;
      }

      const rows = res.data.skus.map(s => ({
        SKU: s.sku,
        Origin: s.origin || '',
        Size: s.size || ''
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Master_SKUs');
      XLSX.writeFile(wb, `master_sku_list_${moment().format('YYYY-MM-DD')}.xlsx`);
      toast.success(`Exported ${rows.length} SKUs successfully!`);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export: ' + err.message);
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'UPLOAD':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">UPLOAD</span>;
      case 'ADD':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-300">ADD</span>;
      case 'EDIT':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">EDIT</span>;
      case 'DELETE':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-300">DELETE</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-800">{action}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-xl p-6 text-white shadow-lg border border-indigo-700/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-500/20 rounded-lg border border-blue-400/30">
                <FaDatabase className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Company Master SKU File</h2>
                <p className="text-sm text-gray-300 mt-0.5">
                  Upload your master Excel file once. It will be used automatically in all sorting tools (Flipkart, Amazon, Meesho, Myntra, Snapdeal).
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-white/10 text-right">
              <span className="block text-xs uppercase tracking-wider text-gray-300 font-medium">Total Master SKUs</span>
              <span className="text-2xl font-extrabold text-white">{totalCount.toLocaleString()}</span>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-md transition duration-150 cursor-pointer"
            >
              <FaUpload className="w-4 h-4" />
              <span>Upload Master File</span>
            </button>
            {totalCount > 0 && (
              <button
                type="button"
                onClick={() => setShowDeleteCurrentFileModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600/90 hover:bg-red-600 text-white text-sm font-semibold rounded-lg shadow-md transition duration-150 cursor-pointer border border-red-500/40 hover:shadow-red-900/30"
                title="Delete whole current Master SKU file"
              >
                <FaTrash className="w-4 h-4" />
                <span>Delete Current File</span>
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Audit History: Toggle between Last 3 Uploads and All Last 3 Edits */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-3.5 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <FaHistory className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              {historyTab === 'uploads' ? 'Last 3 Master File Uploads' : 'Edit History (Last 3 Edits)'}
            </h3>
          </div>
          <div className="flex items-center gap-1 bg-gray-200/80 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setHistoryTab('uploads')}
              className={`px-3 py-1.5 rounded-md transition ${
                historyTab === 'uploads'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Last 3 Uploads
            </button>
            <button
              onClick={() => setHistoryTab('all')}
              className={`px-3 py-1.5 rounded-md transition ${
                historyTab === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Edits (Last 3)
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {historyTab === 'uploads' ? (
            uploadHistory.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                No master file uploads recorded yet. Click <strong>&quot;Upload Master File&quot;</strong> above to upload your first Excel or CSV file.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {uploadHistory.slice(0, 3).map((item, index) => {
                  const fileName = item.details?.fileName || 'master_file';
                  const totalCount = item.details?.totalCount;
                  const prevCount = item.details?.previousCount;
                  return (
                    <div
                      key={item._id || index}
                      onClick={() => setSelectedHistoryItem({ ...item, isUpload: true })}
                      role="button"
                      tabIndex={0}
                      className="group bg-white hover:bg-indigo-50/50 border-2 border-indigo-200/80 hover:border-indigo-500 rounded-xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-indigo-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                              #{index + 1} {index === 0 && <span className="font-normal opacity-90">• Latest</span>}
                            </span>
                            {getActionBadge('UPLOAD')}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500 font-medium" title={moment(item.createdAt).format('LLLL')}>
                              {moment(item.createdAt).fromNow()}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDeleteFileModal(item);
                              }}
                              title="Delete this file record"
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
                            >
                              <FaTrash className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-2.5">
                          <FaFileExcel className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span className="font-bold text-gray-900 text-sm truncate group-hover:text-indigo-700 transition-colors" title={fileName}>
                            {fileName}
                          </span>
                        </div>
                        <div className="space-y-1.5 text-xs text-gray-600 bg-gray-50 group-hover:bg-indigo-50/60 p-2.5 rounded-lg border border-gray-100 transition-colors">
                          {totalCount != null && (
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-gray-500">Total SKUs:</span>
                              <strong className="text-indigo-950 font-mono text-sm">{totalCount.toLocaleString()}</strong>
                            </div>
                          )}
                          {prevCount != null && (
                            <div className="flex justify-between items-center text-gray-500">
                              <span>Replaced previous:</span>
                              <span>{prevCount.toLocaleString()} SKUs</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                        <span>By: <strong className="text-gray-700">{item.performedByName || 'User'}</strong></span>
                        <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                          <FaEye className="w-3 h-3" />
                          <span>View Details &rarr;</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            history.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                No edit history recorded yet. Edits made to SKUs or file uploads will appear here.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {history.slice(0, 3).map((item, index) => (
                  <div
                    key={item._id || index}
                    onClick={() => setSelectedHistoryItem(item)}
                    role="button"
                    tabIndex={0}
                    className="group bg-white hover:bg-slate-50 border-2 border-gray-200 hover:border-blue-500 rounded-xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                            #{index + 1} {index === 0 && <span className="font-normal opacity-90">• Latest</span>}
                          </span>
                          {getActionBadge(item.action)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500 font-medium" title={moment(item.createdAt).format('LLLL')}>
                            {moment(item.createdAt).fromNow()}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDeleteFileModal(item);
                            }}
                            title="Delete this history entry"
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
                          >
                            <FaTrash className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 leading-snug group-hover:text-blue-900 transition-colors">
                        {item.description}
                      </p>
                      {item.sku && (
                        <div className="mt-2 text-xs font-mono bg-gray-100 px-2 py-1 rounded inline-block text-gray-700">
                          SKU: {item.sku}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <span>By: <strong className="text-gray-700">{item.performedByName || 'User'}</strong></span>
                      <span className="inline-flex items-center gap-1 text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                        <FaEye className="w-3 h-3" />
                        <span>View Details &rarr;</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Main Table & Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-6 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by SKU, Origin, or Size..."
                className="w-full pl-10 pr-24 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <FaSearch className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <button
                type="submit"
                className="absolute right-1 top-1 bottom-1 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition"
              >
                Search
              </button>
            </div>
          </form>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setFormData({ sku: '', origin: '', size: '' });
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm transition"
            >
              <FaPlus className="w-3.5 h-3.5" />
              <span>Add SKU</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg border border-gray-300 transition"
              title="Export all SKUs to Excel"
            >
              <FaFileExcel className="w-3.5 h-3.5 text-green-600" />
              <span>Export</span>
            </button>
            <button
              onClick={() => fetchSkus(1, search, sortBy, sortOrder, true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-300 transition"
              title="Refresh"
            >
              <FaSync className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold uppercase text-xs select-none">
              <tr>
                <th scope="col" className="px-6 py-3.5 w-16">#</th>
                <th
                  scope="col"
                  onClick={() => handleSort('sku')}
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by SKU Code"
                >
                  <div className="flex items-center gap-1.5">
                    <span>SKU Code</span>
                    {sortBy === 'sku' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-blue-600 w-3.5 h-3.5" /> : <FaSortDown className="text-blue-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('origin')}
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Origin"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Origin</span>
                    {sortBy === 'origin' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-blue-600 w-3.5 h-3.5" /> : <FaSortDown className="text-blue-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('size')}
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Size"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Size</span>
                    {sortBy === 'size' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-blue-600 w-3.5 h-3.5" /> : <FaSortDown className="text-blue-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('updatedAt')}
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Last Modified Date"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Last Modified</span>
                    {sortBy === 'updatedAt' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-blue-600 w-3.5 h-3.5" /> : <FaSortDown className="text-blue-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-gray-500">
                    <div className="flex items-center justify-center space-x-2">
                      <FaSync className="animate-spin text-blue-600 w-5 h-5" />
                      <span>Loading Master SKUs...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-gray-500">
                    <p className="text-base font-semibold text-gray-700">No SKUs Found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {search ? 'Try clearing your search query.' : 'Upload a master Excel file or add a new SKU using the buttons above.'}
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const rowNumber = idx + 1;
                  return (
                    <tr key={item._id || idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-6 py-3.5 text-gray-400 font-mono text-xs">{rowNumber}</td>
                      <td className="px-6 py-3.5 font-bold font-mono text-gray-900">{item.sku}</td>
                      <td className="px-6 py-3.5">
                        {item.origin ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {item.origin}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        {item.size ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            {item.size}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">
                        <div>{moment(item.updatedAt || item.createdAt).format('DD MMM YYYY, hh:mm A')}</div>
                        {item.lastModifiedByName && (
                          <div className="text-gray-400 text-[11px]">by {item.lastModifiedByName}</div>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEditModal(item)}
                          className="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-100 rounded mr-1 transition"
                          title="Edit SKU"
                        >
                          <FaEdit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDeleteModal(item)}
                          className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-100 rounded transition"
                          title="Delete SKU"
                        >
                          <FaTrash className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Infinite Scroll Footer & Observer Sentinel */}
        <div ref={observerTarget} className="px-6 py-4 border-t border-gray-100 bg-gray-50/60">
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-2">
              <FaSync className="animate-spin text-blue-600 w-4 h-4" />
              <span className="text-xs font-semibold text-gray-700">Loading more SKUs...</span>
            </div>
          )}
          {!loadingMore && totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>
                  Showing <strong className="text-gray-900 font-mono">{items.length.toLocaleString()}</strong> of <strong className="text-gray-900 font-mono">{totalCount.toLocaleString()}</strong> SKUs
                </span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-500">
                  Sorted by: <strong className="text-indigo-900 capitalize">{sortBy === 'updatedAt' ? 'Last Modified' : sortBy}</strong> ({sortOrder.toUpperCase()})
                </span>
              </div>
              <div>
                {items.length >= totalCount ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <FaCheckCircle className="w-3 h-3 text-emerald-600" />
                    <span>All {totalCount.toLocaleString()} SKUs loaded</span>
                  </span>
                ) : (
                  <span className="text-gray-400 italic">Scroll down to load more automatically</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal: Replace Master File */}
      {showUploadConfirm && parsedData && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-3 bg-amber-100 rounded-full">
                <FaExclamationTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Confirm Master File Upload</h3>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold">⚠️ Attention: Clean Sync Mode</p>
              <p>
                Uploading this file will <strong>replace all existing {totalCount} SKUs</strong> with the new file contents. Old history will record this action.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3.5 space-y-2 text-xs text-gray-700 border border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-500">File Name:</span>
                <span className="font-semibold text-gray-900">{parsedData.fileName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Valid SKUs Found:</span>
                <span className="font-semibold text-emerald-700">{parsedData.totalRows.toLocaleString()} SKUs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">SKU Column:</span>
                <span className="font-mono text-gray-800">{parsedData.skuKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Origin Column:</span>
                <span className="font-mono text-gray-800">{parsedData.originKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Size Column:</span>
                <span className="font-mono text-gray-800">{parsedData.sizeKey}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowUploadConfirm(false);
                  setParsedData(null);
                  setUploadFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={uploading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmUpload}
                disabled={uploading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-md flex items-center gap-2 transition"
              >
                {uploading ? (
                  <>
                    <FaSync className="animate-spin w-4 h-4" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <FaCheckCircle className="w-4 h-4" />
                    <span>Confirm & Replace</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add SKU Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FaPlus className="w-4 h-4 text-emerald-600" />
                <span>Add New Master SKU</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSku} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  SKU Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="e.g. RING-GOLD-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Origin (City / Location / Group)
                </label>
                <input
                  type="text"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  placeholder="e.g. Surat, Mumbai, Jaipur"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Size (for tier-sorting, e.g. Small / Large)
                </label>
                <input
                  type="text"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="e.g. Small, Large, Free Size"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-md flex items-center gap-2 transition"
                >
                  {saving ? <FaSync className="animate-spin w-4 h-4" /> : <FaPlus className="w-3.5 h-3.5" />}
                  <span>Save SKU</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit SKU Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FaEdit className="w-4 h-4 text-blue-600" />
                <span>Edit Master SKU</span>
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSku} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  SKU Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Origin (City / Location / Group)
                </label>
                <input
                  type="text"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  placeholder="e.g. Surat, Mumbai, Jaipur"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Size (Small / Large)
                </label>
                <input
                  type="text"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="e.g. Small, Large"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-md flex items-center gap-2 transition"
                >
                  {saving ? <FaSync className="animate-spin w-4 h-4" /> : <FaCheckCircle className="w-4 h-4" />}
                  <span>Update SKU</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-full">
                <FaTrash className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete SKU</h3>
            </div>

            <p className="text-sm text-gray-600">
              Are you sure you want to remove SKU <strong className="text-gray-900 font-mono">&quot;{deletingItem.sku}&quot;</strong> from the master file?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSku}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold shadow-md flex items-center gap-2 transition"
              >
                {deleting ? <FaSync className="animate-spin w-4 h-4" /> : <FaTrash className="w-3.5 h-3.5" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History / Upload Details Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-gray-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-lg">
                  {selectedHistoryItem.action === 'UPLOAD' || selectedHistoryItem.isUpload ? (
                    <FaFileExcel className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <FaHistory className="w-5 h-5 text-indigo-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedHistoryItem.action === 'UPLOAD' || selectedHistoryItem.isUpload
                      ? 'Master File Upload Details'
                      : `Master SKU ${selectedHistoryItem.action} Log`}
                  </h3>
                  <p className="text-xs text-gray-300">
                    Logged on {moment(selectedHistoryItem.createdAt).format('DD MMM YYYY, hh:mm A')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="text-gray-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Status & Overview Bar */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">Action:</span>
                  {getActionBadge(selectedHistoryItem.action || (selectedHistoryItem.isUpload ? 'UPLOAD' : 'EDIT'))}
                </div>
                <div className="text-xs text-gray-500">
                  <span>Recorded: </span>
                  <strong className="text-gray-800">{moment(selectedHistoryItem.createdAt).fromNow()}</strong>
                </div>
              </div>

              {/* UPLOAD Details */}
              {(selectedHistoryItem.action === 'UPLOAD' || selectedHistoryItem.isUpload) && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <FaFileExcel className="w-6 h-6 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Uploaded File</span>
                        <h4 className="text-base font-bold text-gray-900 truncate mt-0.5">
                          {selectedHistoryItem.details?.fileName || 'master_sku_file.xlsx'}
                        </h4>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3.5">
                      <span className="block text-xs uppercase font-semibold text-indigo-700">Total SKUs in File</span>
                      <strong className="text-2xl font-black text-indigo-950 font-mono mt-1 block">
                        {(selectedHistoryItem.details?.totalCount ?? totalCount).toLocaleString()}
                      </strong>
                      <span className="text-[11px] text-indigo-600">Active in master table</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <span className="block text-xs uppercase font-semibold text-gray-600">Replaced Previous</span>
                      <strong className="text-2xl font-black text-gray-800 font-mono mt-1 block">
                        {(selectedHistoryItem.details?.previousCount ?? 0).toLocaleString()}
                      </strong>
                      <span className="text-[11px] text-gray-500">Previous SKUs archived</span>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
                    <FaCheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>Clean Synchronization:</strong> All previous SKUs were replaced by this upload. This master file is actively loaded across all sorting tools.
                    </div>
                  </div>

                  {/* Actions: Download Snapshot & Restore Version */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleDownloadSnapshot(selectedHistoryItem)}
                      disabled={downloadingSnapshot}
                      className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      {downloadingSnapshot ? (
                        <FaSync className="animate-spin w-3.5 h-3.5" />
                      ) : (
                        <FaDownload className="w-3.5 h-3.5" />
                      )}
                      <span>Download Excel Snapshot (.xlsx)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenRestoreModal(selectedHistoryItem)}
                      disabled={restoringSnapshot}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
                      title="Revert Master File to this uploaded version"
                    >
                      <FaUndo className="w-3.5 h-3.5" />
                      <span>Restore This Version</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDeleteFileModal(selectedHistoryItem)}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition cursor-pointer"
                      title="Delete this master file record and snapshot"
                    >
                      <FaTrash className="w-3.5 h-3.5" />
                      <span>Delete File Record</span>
                    </button>
                  </div>
                </div>
              )}

              {/* EDIT Diff Table */}
              {selectedHistoryItem.action === 'EDIT' && (
                <div className="space-y-3">
                  <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                    <strong className="block text-sm font-bold text-gray-900 mb-1">
                      SKU Code: <span className="font-mono text-blue-700">{selectedHistoryItem.sku}</span>
                    </strong>
                    {selectedHistoryItem.description}
                  </div>

                  {selectedHistoryItem.details?.previous && selectedHistoryItem.details?.updated && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100 text-gray-700 font-semibold border-b">
                          <tr>
                            <th className="py-2 px-3 text-left">Field</th>
                            <th className="py-2 px-3 text-left text-red-700">Before Edit</th>
                            <th className="py-2 px-3 text-left text-green-700">After Edit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          <tr>
                            <td className="py-2 px-3 font-semibold text-gray-600">SKU</td>
                            <td className="py-2 px-3 font-mono text-gray-600">{selectedHistoryItem.details.previous.sku || '—'}</td>
                            <td className="py-2 px-3 font-mono font-bold text-gray-900">{selectedHistoryItem.details.updated.sku || '—'}</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 font-semibold text-gray-600">Origin</td>
                            <td className="py-2 px-3 text-gray-600">{selectedHistoryItem.details.previous.origin || '—'}</td>
                            <td className="py-2 px-3 font-bold text-indigo-700">{selectedHistoryItem.details.updated.origin || '—'}</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 font-semibold text-gray-600">Size</td>
                            <td className="py-2 px-3 text-gray-600">{selectedHistoryItem.details.previous.size || '—'}</td>
                            <td className="py-2 px-3 font-bold text-indigo-700">{selectedHistoryItem.details.updated.size || '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ADD Details */}
              {selectedHistoryItem.action === 'ADD' && (
                <div className="bg-green-50/70 border border-green-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="text-sm font-bold text-green-950">
                    SKU Added: <span className="font-mono text-green-800">{selectedHistoryItem.sku}</span>
                  </div>
                  <p className="text-gray-700">{selectedHistoryItem.description}</p>
                  {selectedHistoryItem.details && (
                    <div className="mt-2 grid grid-cols-2 gap-2 pt-2 border-t border-green-200">
                      <div><span className="text-gray-500">Origin:</span> <strong>{selectedHistoryItem.details.origin || 'Not specified'}</strong></div>
                      <div><span className="text-gray-500">Size:</span> <strong>{selectedHistoryItem.details.size || 'Not specified'}</strong></div>
                    </div>
                  )}
                </div>
              )}

              {/* DELETE Details */}
              {selectedHistoryItem.action === 'DELETE' && (
                <div className="bg-red-50/70 border border-red-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="text-sm font-bold text-red-950">
                    SKU Removed: <span className="font-mono text-red-800">{selectedHistoryItem.sku}</span>
                  </div>
                  <p className="text-gray-700">{selectedHistoryItem.description}</p>
                </div>
              )}

              {/* Metadata: User & Timestamp */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 text-xs">
                <div className="flex items-center gap-2">
                  <FaUser className="w-3.5 h-3.5 text-gray-400" />
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Performed By</span>
                    <strong className="text-gray-800">{selectedHistoryItem.performedByName || 'User'}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FaCalendarAlt className="w-3.5 h-3.5 text-gray-400" />
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase">Exact Date & Time</span>
                    <strong className="text-gray-800">{moment(selectedHistoryItem.createdAt).format('DD MMM YYYY, hh:mm:ss A')}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHistoryItem(null)}
                className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Version Confirmation Modal */}
      {showRestoreModal && restoringItem && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 rounded-full text-indigo-700">
                <FaUndo className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Restore Master File Version</h3>
                <p className="text-xs text-gray-500">Revert active master SKUs to this snapshot</p>
              </div>
            </div>

            <div className="p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-xl space-y-2 text-xs text-indigo-950">
              <div className="flex items-center gap-2">
                <FaFileExcel className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="font-bold text-sm text-gray-900 truncate">
                  {restoringItem.details?.fileName || 'master_file.xlsx'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-200/60">
                <div>
                  <span className="text-gray-500 block">Total SKUs:</span>
                  <strong className="font-mono text-gray-900">{(restoringItem.details?.totalCount || totalCount).toLocaleString()} SKUs</strong>
                </div>
                <div>
                  <span className="text-gray-500 block">Uploaded By:</span>
                  <strong className="text-gray-900">{restoringItem.performedByName || 'User'}</strong>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              ⚠️ <strong>Warning:</strong> Restoring this version will replace all currently active Master SKUs. All sorting tools (Flipkart, Amazon, Meesho, Myntra, Snapdeal) will immediately begin using this restored file.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  setRestoringItem(null);
                }}
                disabled={restoringSnapshot}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRestoreSnapshot}
                disabled={restoringSnapshot}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-2 transition cursor-pointer"
              >
                {restoringSnapshot ? (
                  <>
                    <FaSync className="animate-spin w-3.5 h-3.5" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <FaUndo className="w-3.5 h-3.5" />
                    <span>Yes, Restore This Version</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete File Record Confirmation Modal */}
      {showDeleteFileModal && deletingFileItem && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full text-red-600">
                <FaTrash className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete File Record</h3>
                <p className="text-xs text-gray-500">Remove this uploaded file and its snapshot</p>
              </div>
            </div>

            <div className="p-4 bg-red-50/70 border border-red-200/80 rounded-xl space-y-2 text-xs text-red-950">
              <div className="flex items-center gap-2">
                <FaFileExcel className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="font-bold text-sm text-gray-900 truncate">
                  {deletingFileItem.details?.fileName || deletingFileItem.sku || 'master_file.xlsx'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-red-200/60">
                <div>
                  <span className="text-gray-500 block">Total SKUs:</span>
                  <strong className="font-mono text-gray-900">
                    {(deletingFileItem.details?.totalCount || totalCount).toLocaleString()} SKUs
                  </strong>
                </div>
                <div>
                  <span className="text-gray-500 block">Uploaded By:</span>
                  <strong className="text-gray-900">{deletingFileItem.performedByName || 'User'}</strong>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to delete this file record? This will permanently remove it from your upload history along with any saved snapshot.
            </p>

            {uploadHistory[0]?._id === deletingFileItem._id && (
              <label className="flex items-start gap-2.5 p-3 bg-red-50 hover:bg-red-100/70 rounded-xl border border-red-200 cursor-pointer text-xs text-red-950 select-none transition">
                <input
                  type="checkbox"
                  checked={deleteActiveSkusOption}
                  onChange={(e) => setDeleteActiveSkusOption(e.target.checked)}
                  className="mt-0.5 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <div>
                  <strong className="block font-bold">Also delete all {totalCount.toLocaleString()} active Master SKUs</strong>
                  <span className="text-[11px] text-red-700">Wipes the current active file from the database and reverts sorting tools to manual upload mode.</span>
                </div>
              </label>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteFileModal(false);
                  setDeletingFileItem(null);
                }}
                disabled={deletingFile}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteFile}
                disabled={deletingFile}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-2 transition cursor-pointer"
              >
                {deletingFile ? (
                  <>
                    <FaSync className="animate-spin w-3.5 h-3.5" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <FaTrash className="w-3.5 h-3.5" />
                    <span>{deleteActiveSkusOption ? 'Yes, Delete File & SKUs' : 'Yes, Delete File Record'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Whole Current Active Master File Confirmation Modal */}
      {showDeleteCurrentFileModal && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full text-red-600">
                <FaTrash className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Current Master File</h3>
                <p className="text-xs text-gray-500">Permanently delete current active Master SKUs</p>
              </div>
            </div>

            <div className="p-4 bg-red-50/70 border border-red-200/80 rounded-xl space-y-2 text-xs text-red-950">
              <div className="flex items-center gap-2">
                <FaFileExcel className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="font-bold text-sm text-gray-900 truncate">
                  {uploadHistory[0]?.details?.fileName || 'Current Master File'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-red-200/60">
                <span className="text-gray-500">Active SKUs to delete:</span>
                <strong className="font-mono text-sm text-red-700">{totalCount.toLocaleString()} SKUs</strong>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              ⚠️ <strong>Warning:</strong> This will delete all <strong>{totalCount.toLocaleString()}</strong> active Master SKUs from the database. All sorting tools (Flipkart, Amazon, Meesho, Myntra, Snapdeal) will immediately revert to requiring manual CSV/Excel file uploads.
            </p>

            <label className="flex items-start gap-2.5 p-2.5 bg-gray-50 hover:bg-gray-100/80 rounded-lg border border-gray-200 cursor-pointer text-xs text-gray-700 select-none">
              <input
                type="checkbox"
                checked={deleteFromHistoryOption}
                onChange={(e) => setDeleteFromHistoryOption(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span>Also remove this file entry from upload history and saved snapshots</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowDeleteCurrentFileModal(false)}
                disabled={deletingCurrentFile}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCurrentFile}
                disabled={deletingCurrentFile}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-2 transition cursor-pointer"
              >
                {deletingCurrentFile ? (
                  <>
                    <FaSync className="animate-spin w-3.5 h-3.5" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <FaTrash className="w-3.5 h-3.5" />
                    <span>Yes, Delete Whole File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
