import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/router';
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
  FaEye,
  FaCalendarAlt,
  FaUser,
  FaInfoCircle,
  FaExchangeAlt,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaDownload,
  FaUndo,
  FaImage,
  FaBoxOpen,
  FaMoneyBillWave,
  FaFilter,
  FaCheckSquare,
  FaSquare,
  FaWrench
} from 'react-icons/fa';
import DabbiSelect from './DabbiSelect';
import DabbiManager from './DabbiManager';

export default function MasterRateManager({ onMasterRatesUpdated, initialSearch = '' }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalWithImage, setTotalWithImage] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState(() => initialSearch || (router.query?.search ? String(router.query.search) : ''));
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [history, setHistory] = useState([]);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [historyTab, setHistoryTab] = useState('uploads'); // 'uploads' | 'all'
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Sync search query if passed via URL or props (e.g. from Master SKU origin click)
  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    } else if (router.query?.search) {
      setSearch(String(router.query.search));
    }
  }, [initialSearch, router.query?.search]);

  // Auto-open Add Modal if addOrigin query param is passed
  useEffect(() => {
    if (router.query?.addOrigin) {
      setFormData({
        origin: String(router.query.addOrigin),
        imageLink: '',
        itemRate: '',
        boxRate: '',
        boxReturnRate: '',
        size: router.query?.size ? String(router.query.size) : '',
        dabbi: null,
        dabbiName: ''
      });
      setShowAddModal(true);
    }
  }, [router.query?.addOrigin, router.query?.size]);

  // Column Sorting state
  const [sortBy, setSortBy] = useState('origin');
  const [sortOrder, setSortOrder] = useState('asc');

  // Image Preview Modal
  const [previewImage, setPreviewImage] = useState(null);

  // Snapshot download/restore state
  const [downloadingSnapshot, setDownloadingSnapshot] = useState(false);
  const [restoringSnapshot, setRestoringSnapshot] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoringItem, setRestoringItem] = useState(null);

  // Rate Revision / Date-effective state
  const [rateEffectiveFromDate, setRateEffectiveFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isRateCorrection, setIsRateCorrection] = useState(false);
  const [showRateHistoryAccordion, setShowRateHistoryAccordion] = useState(false);

  // Delete File / Snapshot state
  const [showDeleteFileModal, setShowDeleteFileModal] = useState(false);
  const [deletingFileItem, setDeletingFileItem] = useState(null);
  const [deletingFile, setDeletingFile] = useState(false);
  const [deleteActiveRatesOption, setDeleteActiveRatesOption] = useState(false);

  // Delete Whole Current Active Master Rate File state
  const [showDeleteCurrentFileModal, setShowDeleteCurrentFileModal] = useState(false);
  const [deletingCurrentFile, setDeletingCurrentFile] = useState(false);

  // Infinite Scroll Sentinel ref
  const observerTarget = useRef(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const fileInputRef = useRef(null);

  // Diff & Selective Approval states
  const [analyzingDiff, setAnalyzingDiff] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffResult, setDiffResult] = useState(null);
  const [selectedDiffKeys, setSelectedDiffKeys] = useState(new Set());
  const [diffFilterTab, setDiffFilterTab] = useState('all'); // 'all' | 'add' | 'edit' | 'unchanged'
  const [diffSearchQuery, setDiffSearchQuery] = useState('');
  const [applyingDiff, setApplyingDiff] = useState(false);

  // Validation & Error Resolution state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationRows, setValidationRows] = useState([]);
  const [validationFilter, setValidationFilter] = useState('errors'); // 'all' | 'errors' | 'valid'
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [validationSummary, setValidationSummary] = useState({ total: 0, errors: 0, valid: 0 });

  // Add / Edit Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDabbiManager, setShowDabbiManager] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    origin: '',
    imageLink: '',
    itemRate: '',
    boxRate: '',
    boxReturnRate: '',
    size: '',
    dabbi: null,
    dabbiName: ''
  });
  const [saving, setSaving] = useState(false);

  // Delete Modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);

  // Fetch Master Rates
  const fetchRates = useCallback(async (pageNum = 1, searchQuery = '', sort = sortBy, order = sortOrder, reset = false) => {
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/master-rate', {
        params: {
          page: pageNum,
          limit: 50,
          search: searchQuery.trim(),
          sortBy: sort,
          sortOrder: order
        },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        if (reset || pageNum === 1) {
          setItems(res.data.items || []);
        } else {
          setItems(prev => [...prev, ...(res.data.items || [])]);
        }
        setTotalCount(res.data.totalCount || 0);
        setTotalWithImage(res.data.totalWithImage || 0);
        setPage(pageNum);
        setHasMore(pageNum < (res.data.totalPages || 1));
        if (res.data.history) setHistory(res.data.history);
        if (res.data.uploadHistory) setUploadHistory(res.data.uploadHistory);
      }
    } catch (err) {
      console.error('Error fetching master rates:', err);
      toast.error(err.response?.data?.message || 'Failed to fetch master rates');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sortBy, sortOrder]);

  // Debounced search on typing & sorting changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRates(1, search, sortBy, sortOrder, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, sortBy, sortOrder, fetchRates]);

  // Infinite Scroll Intersection Observer
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          fetchRates(page + 1, search, sortBy, sortOrder, false);
        }
      },
      { threshold: 0.2, rootMargin: '100px' }
    );

    observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [hasMore, loading, loadingMore, page, search, sortBy, sortOrder, fetchRates]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Helper to validate rows
  const validateParsedRows = (rawRows, originKey, imageKey, itemRateKey, boxRateKey, boxReturnRateKey, sizeKey) => {
    const validated = [];
    const originSet = new Map();

    rawRows.forEach((row, idx) => {
      const rawOrigin = originKey && row[originKey] != null ? String(row[originKey]).trim() : '';
      const rawImage = imageKey && row[imageKey] != null ? String(row[imageKey]).trim() : '';
      const rawItemRate = itemRateKey && row[itemRateKey] != null ? String(row[itemRateKey]).trim() : '';
      const rawBoxRate = boxRateKey && row[boxRateKey] != null ? String(row[boxRateKey]).trim() : '';
      const rawBoxReturnRate = boxReturnRateKey && row[boxReturnRateKey] != null ? String(row[boxReturnRateKey]).trim() : '';
      const rawSize = sizeKey && row[sizeKey] != null ? String(row[sizeKey]).trim() : '';

      const errors = [];
      const warnings = [];

      // Origin validation
      if (!rawOrigin) {
        errors.push('Missing Original Product Name (Original Product Name is required)');
      } else {
        const lower = rawOrigin.toLowerCase();
        if (originSet.has(lower)) {
          warnings.push(`Duplicate Original Product in file (Row ${originSet.get(lower)} has same name)`);
        } else {
          originSet.set(lower, idx + 1);
        }
      }

      // Rates numeric validation
      let numItemRate = 0;
      if (rawItemRate !== '') {
        const cleaned = rawItemRate.replace(/[₹$,]/g, '').trim();
        numItemRate = Number(cleaned);
        if (isNaN(numItemRate)) {
          errors.push(`Invalid Rate "${rawItemRate}" (must be a valid number)`);
        } else if (numItemRate < 0) {
          errors.push('Rate cannot be negative');
        }
      }

      let numBoxRate = 0;
      if (rawBoxRate !== '') {
        const cleaned = rawBoxRate.replace(/[₹$,]/g, '').trim();
        numBoxRate = Number(cleaned);
        if (isNaN(numBoxRate)) {
          errors.push(`Invalid Dabbi Rate "${rawBoxRate}" (must be a valid number)`);
        } else if (numBoxRate < 0) {
          errors.push('Dabbi Rate cannot be negative');
        }
      }

      let numBoxReturnRate = 0;
      if (rawBoxReturnRate !== '') {
        const cleaned = rawBoxReturnRate.replace(/[₹$,]/g, '').trim();
        numBoxReturnRate = Number(cleaned);
        if (isNaN(numBoxReturnRate)) {
          errors.push(`Invalid Dabbi Return Rate "${rawBoxReturnRate}" (must be a valid number)`);
        } else if (numBoxReturnRate < 0) {
          errors.push('Dabbi Return Rate cannot be negative');
        }
      }

      validated.push({
        id: `row_${idx}_${Date.now()}`,
        rowNumber: idx + 2, // Excel row # (including header)
        origin: rawOrigin,
        imageLink: rawImage,
        itemRate: rawItemRate,
        boxRate: rawBoxRate,
        boxReturnRate: rawBoxReturnRate,
        size: rawSize,
        parsedItemRate: isNaN(numItemRate) ? 0 : numItemRate,
        parsedBoxRate: isNaN(numBoxRate) ? 0 : numBoxRate,
        parsedBoxReturnRate: isNaN(numBoxReturnRate) ? 0 : numBoxReturnRate,
        errors,
        warnings,
        isValid: errors.length === 0,
        isSkipped: false
      });
    });

    return validated;
  };

  // Handle File Selection
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        toast.error('The selected Excel/CSV file is empty');
        setUploadFile(null);
        return;
      }

      const sampleRow = rawRows[0];
      const keys = Object.keys(sampleRow);

      const findKey = (candidates) => {
        return keys.find(k => candidates.some(c => k.trim().toLowerCase() === c.toLowerCase())) || null;
      };

      const originKey = findKey([
        'original product name',
        'orignal product name',
        'product name',
        'origin',
        'origin name',
        'item origin',
        'product origin',
        'source',
        'title',
        'item'
      ]);
      const imageKey = findKey([
        'image link',
        'image_link',
        'image url',
        'image_url',
        'image',
        'photo',
        'picture',
        'img',
        'photo url'
      ]);
      const itemRateKey = findKey([
        'rate',
        'item rate',
        'item_rate',
        'item price',
        'price',
        'product rate',
        'rate per item',
        'itemrate'
      ]);
      const boxRateKey = findKey([
        'dabbi rate',
        'dabbi_rate',
        'dabi rate',
        'dabbirate',
        'box rate',
        'box_rate',
        'box price',
        'boxrate'
      ]);
      const boxReturnRateKey = findKey([
        'dabbi return rate',
        'dabbi_return_rate',
        'dabbi return',
        'dabbireturnrate',
        'box return rate',
        'box_return_rate',
        'return rate',
        'box return price',
        'boxreturnrate'
      ]);
      const sizeKey = findKey(['size', 'product size', 'item size']);

      if (!originKey) {
        toast.error('Could not find an "Original Product Name" column in the file. Headers found: ' + keys.join(', '));
        setUploadFile(null);
        return;
      }

      const validated = validateParsedRows(rawRows, originKey, imageKey, itemRateKey, boxRateKey, boxReturnRateKey, sizeKey);
      const errorCount = validated.filter(r => !r.isValid).length;
      const validCount = validated.length - errorCount;

      setValidationRows(validated);
      setValidationSummary({ total: validated.length, errors: errorCount, valid: validCount });
      setSelectedRowIds(new Set());

      if (errorCount > 0) {
        // Open validation resolution modal
        setValidationFilter('errors');
        setShowValidationModal(true);
      } else {
        // All good, prepare parsed data and run diff comparison
        const cleanItems = deduplicateCleanRows(validated);
        const meta = {
          fileName: file.name,
          totalRows: cleanItems.length,
          originKey,
          imageKey: imageKey || 'Not detected',
          itemRateKey: itemRateKey || 'Not detected',
          boxRateKey: boxRateKey || 'Not detected',
          boxReturnRateKey: boxReturnRateKey || 'Not detected',
          sizeKey: sizeKey || 'Not detected',
          items: cleanItems
        };
        setParsedData(meta);
        await runRateDiff(cleanItems, meta);
      }
    } catch (err) {
      console.error('Error reading master rate file:', err);
      toast.error('Failed to parse file: ' + err.message);
      setUploadFile(null);
    }
  };

  const deduplicateCleanRows = (rows) => {
    const validRows = rows.filter(r => r.isValid && !r.isSkipped);
    const seen = new Map();
    for (const r of validRows) {
      const cleanOrigin = String(r.origin || '').trim();
      if (!cleanOrigin) continue;
      const key = cleanOrigin.toLowerCase();
      seen.set(key, {
        origin: cleanOrigin,
        imageLink: String(r.imageLink || '').trim(),
        itemRate: Number(r.parsedItemRate) || 0,
        boxRate: Number(r.parsedBoxRate) || 0,
        boxReturnRate: Number(r.parsedBoxReturnRate) || 0,
        size: String(r.size || '').trim()
      });
    }
    return Array.from(seen.values());
  };

  // Re-run validation on validationRows
  const revalidateRows = () => {
    const originSet = new Map();
    const updated = validationRows.map((r, idx) => {
      if (r.isSkipped) return r;
      const rawOrigin = String(r.origin || '').trim();
      const rawImage = String(r.imageLink || '').trim();
      const rawItemRate = String(r.itemRate ?? '').trim();
      const rawBoxRate = String(r.boxRate ?? '').trim();
      const rawBoxReturnRate = String(r.boxReturnRate ?? '').trim();

      const errors = [];
      const warnings = [];

      if (!rawOrigin) {
        errors.push('Missing Original Product Name (Original Product Name is required)');
      } else {
        const lower = rawOrigin.toLowerCase();
        if (originSet.has(lower)) {
          warnings.push(`Duplicate Origin in file (Row ${originSet.get(lower)} has same name)`);
        } else {
          originSet.set(lower, idx + 1);
        }
      }

      let numItemRate = 0;
      if (rawItemRate !== '') {
        const cleaned = rawItemRate.replace(/[₹$,]/g, '').trim();
        numItemRate = Number(cleaned);
        if (isNaN(numItemRate)) {
          errors.push(`Invalid Item Rate "${rawItemRate}"`);
        } else if (numItemRate < 0) {
          errors.push('Item Rate cannot be negative');
        }
      }

      let numBoxRate = 0;
      if (rawBoxRate !== '') {
        const cleaned = rawBoxRate.replace(/[₹$,]/g, '').trim();
        numBoxRate = Number(cleaned);
        if (isNaN(numBoxRate)) {
          errors.push(`Invalid Box Rate "${rawBoxRate}"`);
        } else if (numBoxRate < 0) {
          errors.push('Box Rate cannot be negative');
        }
      }

      let numBoxReturnRate = 0;
      if (rawBoxReturnRate !== '') {
        const cleaned = rawBoxReturnRate.replace(/[₹$,]/g, '').trim();
        numBoxReturnRate = Number(cleaned);
        if (isNaN(numBoxReturnRate)) {
          errors.push(`Invalid Box Return Rate "${rawBoxReturnRate}"`);
        } else if (numBoxReturnRate < 0) {
          errors.push('Box Return Rate cannot be negative');
        }
      }

      return {
        ...r,
        origin: rawOrigin,
        imageLink: rawImage,
        parsedItemRate: isNaN(numItemRate) ? 0 : numItemRate,
        parsedBoxRate: isNaN(numBoxRate) ? 0 : numBoxRate,
        parsedBoxReturnRate: isNaN(numBoxReturnRate) ? 0 : numBoxReturnRate,
        errors,
        warnings,
        isValid: errors.length === 0
      };
    });

    const activeRows = updated.filter(r => !r.isSkipped);
    const errorCount = activeRows.filter(r => !r.isValid).length;
    const validCount = activeRows.length - errorCount;

    setValidationRows(updated);
    setValidationSummary({ total: activeRows.length, errors: errorCount, valid: validCount });
    toast.info(`Re-validated: ${validCount} valid, ${errorCount} with errors`);
  };

  // Multi-select actions in Validation Modal
  const toggleSelectRow = (id) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleRows = getFilteredValidationRows();
    const allSelected = visibleRows.every(r => selectedRowIds.has(r.id));
    if (allSelected) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(visibleRows.map(r => r.id)));
    }
  };

  const skipSelectedRows = () => {
    if (selectedRowIds.size === 0) {
      toast.warn('Please select rows to skip');
      return;
    }
    const updated = validationRows.map(r => {
      if (selectedRowIds.has(r.id)) {
        return { ...r, isSkipped: true };
      }
      return r;
    });
    setValidationRows(updated);
    setSelectedRowIds(new Set());

    const activeRows = updated.filter(r => !r.isSkipped);
    const errorCount = activeRows.filter(r => !r.isValid).length;
    const validCount = activeRows.length - errorCount;
    setValidationSummary({ total: activeRows.length, errors: errorCount, valid: validCount });
    toast.success(`Skipped ${selectedRowIds.size} rows`);
  };

  const skipAllInvalidRows = () => {
    const updated = validationRows.map(r => {
      if (!r.isValid) return { ...r, isSkipped: true };
      return r;
    });
    setValidationRows(updated);
    setSelectedRowIds(new Set());

    const activeRows = updated.filter(r => !r.isSkipped);
    const errorCount = activeRows.filter(r => !r.isValid).length;
    const validCount = activeRows.length - errorCount;
    setValidationSummary({ total: activeRows.length, errors: errorCount, valid: validCount });
    toast.success('Skipped all invalid rows');
  };

  const fixSelectedRatesToZero = () => {
    if (selectedRowIds.size === 0) {
      toast.warn('Please select rows to fix');
      return;
    }
    const updated = validationRows.map(r => {
      if (selectedRowIds.has(r.id)) {
        return {
          ...r,
          itemRate: r.parsedItemRate || '0',
          boxRate: r.parsedBoxRate || '0',
          boxReturnRate: r.parsedBoxReturnRate || '0'
        };
      }
      return r;
    });
    setValidationRows(updated);
    revalidateRows();
    toast.success(`Reset invalid rates to 0 for ${selectedRowIds.size} rows`);
  };

  const handleInlineEditRow = (id, field, value) => {
    setValidationRows(prev =>
      prev.map(r => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const getFilteredValidationRows = () => {
    const active = validationRows.filter(r => !r.isSkipped);
    if (validationFilter === 'errors') return active.filter(r => !r.isValid);
    if (validationFilter === 'valid') return active.filter(r => r.isValid);
    return active;
  };

  // Proceed with valid rows after resolving errors
  const proceedWithValidRows = async () => {
    const cleanItems = deduplicateCleanRows(validationRows);
    if (cleanItems.length === 0) {
      toast.error('No valid rows available to upload. Please fix or keep at least one valid row.');
      return;
    }

    const meta = {
      fileName: uploadFile?.name || 'master_rate_file.xlsx',
      totalRows: cleanItems.length,
      originKey: 'Origin',
      imageKey: 'Image Link',
      itemRateKey: 'Item Rate',
      boxRateKey: 'Box Rate',
      boxReturnRateKey: 'Box Return Rate',
      sizeKey: 'Size',
      items: cleanItems
    };
    setParsedData(meta);
    setShowValidationModal(false);
    await runRateDiff(cleanItems, meta);
  };

  // Run diff analysis against current database Rates
  const runRateDiff = async (cleanItems, meta) => {
    setAnalyzingDiff(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        '/api/master-rate/diff',
        { items: cleanItems },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        const { summary, toAdd, toEdit, unchanged } = res.data;
        setDiffResult({ summary, toAdd, toEdit, unchanged });

        // By default, select all additions and edits
        const initialSelected = new Set();
        toAdd.forEach((_, idx) => initialSelected.add(`add_${idx}`));
        toEdit.forEach((_, idx) => initialSelected.add(`edit_${idx}`));
        setSelectedDiffKeys(initialSelected);

        setDiffFilterTab(toAdd.length > 0 || toEdit.length > 0 ? 'all' : 'unchanged');
        setDiffSearchQuery('');
        setShowDiffModal(true);
      }
    } catch (err) {
      console.error('Rate diff analysis failed:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to compare file with database');
      setUploadFile(null);
      setParsedData(null);
    } finally {
      setAnalyzingDiff(false);
    }
  };

  // Apply approved additions and edits without deleting any existing records
  const applyRateApproval = async () => {
    if (!diffResult || !parsedData) return;

    const { toAdd, toEdit } = diffResult;
    const approvedItems = [];

    toAdd.forEach((item, idx) => {
      if (selectedDiffKeys.has(`add_${idx}`)) {
        approvedItems.push({
          type: 'add',
          origin: item.origin,
          itemRate: item.itemRate,
          boxRate: item.boxRate,
          boxReturnRate: item.boxReturnRate,
          size: item.size,
          imageLink: item.imageLink
        });
      }
    });

    toEdit.forEach((item, idx) => {
      if (selectedDiffKeys.has(`edit_${idx}`)) {
        approvedItems.push({
          type: 'edit',
          origin: item.origin,
          itemRate: item.itemRate,
          boxRate: item.boxRate,
          boxReturnRate: item.boxReturnRate,
          size: item.size,
          imageLink: item.imageLink,
          oldValues: item.oldValues,
          newValues: item.newValues
        });
      }
    });

    if (approvedItems.length === 0) {
      toast.warning('No items selected. Please select at least one addition or update to save.');
      return;
    }

    setApplyingDiff(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        '/api/master-rate/upsert',
        {
          approvedItems,
          fileName: parsedData.fileName
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        toast.success(res.data.message || `Successfully updated ${approvedItems.length} rates!`);
        if (res.data.history) setHistory(res.data.history);
        setShowDiffModal(false);
        setDiffResult(null);
        setParsedData(null);
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchRates(1, '', 'origin', 'asc', true);
        onMasterRatesUpdated?.();
      }
    } catch (err) {
      console.error('Error applying approved rates:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to save approved rates');
    } finally {
      setApplyingDiff(false);
    }
  };

  // Add Single Rate
  const handleAddRate = async (e) => {
    e.preventDefault();
    if (!formData.origin.trim()) {
      toast.warn('Original Product Name is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        '/api/master-rate',
        {
          origin: formData.origin.trim(),
          imageLink: formData.imageLink.trim(),
          itemRate: Number(formData.itemRate) || 0,
          boxRate: Number(formData.boxRate) || 0,
          boxReturnRate: Number(formData.boxReturnRate) || 0,
          size: (formData.size || '').trim(),
          dabbi: formData.dabbi || null,
          dabbiName: formData.dabbiName || ''
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        toast.success(res.data.message || 'Original Product Rate added');
        setShowAddModal(false);
        setFormData({ origin: '', imageLink: '', itemRate: '', boxRate: '', boxReturnRate: '', size: '', dabbi: null, dabbiName: '' });
        fetchRates(1, search, sortBy, sortOrder, true);
        onMasterRatesUpdated?.();
      }
    } catch (err) {
      console.error('Error adding master rate:', err);
      toast.error(err.response?.data?.message || 'Failed to add original product rate');
    } finally {
      setSaving(false);
    }
  };

  // Edit Single Rate
  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      origin: item.origin || '',
      imageLink: item.imageLink || '',
      itemRate: item.itemRate != null ? item.itemRate : '',
      boxRate: item.boxRate != null ? item.boxRate : '',
      boxReturnRate: item.boxReturnRate != null ? item.boxReturnRate : '',
      size: item.size || '',
      dabbi: item.dabbi || null,
      dabbiName: item.dabbiName || ''
    });
    setRateEffectiveFromDate(new Date().toISOString().split('T')[0]);
    setIsRateCorrection(false);
    setShowRateHistoryAccordion(false);
    setShowEditModal(true);
  };

  const handleEditRate = async (e) => {
    e.preventDefault();
    if (!formData.origin.trim()) {
      toast.warn('Original Product Name is required');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(
        '/api/master-rate',
        {
          id: editingItem._id,
          origin: formData.origin.trim(),
          imageLink: formData.imageLink.trim(),
          itemRate: Number(formData.itemRate) || 0,
          boxRate: Number(formData.boxRate) || 0,
          boxReturnRate: Number(formData.boxReturnRate) || 0,
          size: (formData.size || '').trim(),
          dabbi: formData.dabbi || null,
          dabbiName: formData.dabbiName || '',
          effectiveFromDate: rateEffectiveFromDate,
          isCorrection: isRateCorrection
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        toast.success('Original Product Rate updated');
        setShowEditModal(false);
        setEditingItem(null);
        fetchRates(page, search, sortBy, sortOrder, true);
        onMasterRatesUpdated?.();
      }
    } catch (err) {
      console.error('Error updating master rate:', err);
      toast.error(err.response?.data?.message || 'Failed to update origin rate');
    } finally {
      setSaving(false);
    }
  };

  // Delete Single Rate
  const openDeleteModal = (item) => {
    setDeletingItem(item);
    setShowDeleteModal(true);
  };

  const confirmDeleteRate = async () => {
    if (!deletingItem) return;

    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`/api/master-rate?id=${deletingItem._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        toast.success(res.data.message || 'Origin deleted');
        setShowDeleteModal(false);
        setDeletingItem(null);
        fetchRates(1, search, sortBy, sortOrder, true);
        onMasterRatesUpdated?.();
      }
    } catch (err) {
      console.error('Error deleting master rate:', err);
      toast.error(err.response?.data?.message || 'Failed to delete origin rate');
    }
  };

  // Delete Whole Current Active Master Rate File
  const confirmDeleteCurrentFile = async () => {
    setDeletingCurrentFile(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete('/api/master-rate?clearAll=true', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        toast.success(res.data.message || 'All Master Rates cleared successfully');
        setShowDeleteCurrentFileModal(false);
        fetchRates(1, '', 'origin', 'asc', true);
        onMasterRatesUpdated?.();
      }
    } catch (err) {
      console.error('Error clearing master rate file:', err);
      toast.error(err.response?.data?.message || 'Failed to clear master rates');
    } finally {
      setDeletingCurrentFile(false);
    }
  };

  // Export to Excel
  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      toast.info('Preparing export...');
      const res = await axios.get('/api/master-rate?all=true', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success && res.data.rates) {
        const exportData = res.data.rates.map(r => ({
          'original product name': r.origin || '',
          'Rate': r.itemRate ?? 0,
          'dabbi rate': r.boxRate ?? 0,
          'dabbi return rate': r.boxReturnRate ?? 0,
          'Image Link': r.imageLink || '',
          'Size': r.size || ''
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Master Rates');
        XLSX.writeFile(wb, `Master_Rates_${moment().format('YYYY-MM-DD')}.xlsx`);
        toast.success('Master Rate file exported successfully!');
      }
    } catch (err) {
      console.error('Error exporting master rates:', err);
      toast.error('Failed to export master rates');
    }
  };

  // Download Snapshot
  const handleDownloadSnapshot = async (historyItem) => {
    setDownloadingSnapshot(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(
        `/api/master-rate/snapshot?historyId=${historyItem._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success && res.data.items) {
        const exportData = res.data.items.map(r => ({
          'original product name': r.origin || '',
          'Rate': r.itemRate ?? 0,
          'dabbi rate': r.boxRate ?? 0,
          'dabbi return rate': r.boxReturnRate ?? 0,
          'Image Link': r.imageLink || '',
          'Size': r.size || ''
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Master Rates Backup');
        const cleanName = (res.data.fileName || 'master_rate_backup').replace(/\.(xlsx|xls|csv)$/i, '');
        XLSX.writeFile(wb, `${cleanName}_backup.xlsx`);
        toast.success(`Downloaded backup with ${exportData.length} original products`);
      }
    } catch (err) {
      console.error('Error downloading master rate snapshot:', err);
      toast.error(err.response?.data?.message || 'Failed to download backup');
    } finally {
      setDownloadingSnapshot(false);
    }
  };

  // Restore Snapshot
  const handleRestoreSnapshot = async () => {
    if (!restoringItem) return;
    setRestoringSnapshot(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        '/api/master-rate/snapshot',
        {
          historyId: restoringItem._id,
          snapshotId: restoringItem.details?.snapshotId || restoringItem.snapshotId
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        toast.success(res.data.message || 'Master rate file restored!');
        setShowRestoreModal(false);
        setRestoringItem(null);
        if (res.data.history) setHistory(res.data.history);
        if (res.data.uploadHistory) setUploadHistory(res.data.uploadHistory);
        fetchRates(1, '', 'origin', 'asc', true);
        onMasterRatesUpdated?.();
      }
    } catch (err) {
      console.error('Error restoring snapshot:', err);
      toast.error(err.response?.data?.message || 'Failed to restore backup');
    } finally {
      setRestoringSnapshot(false);
    }
  };

  // Open Delete File Record Confirmation Modal
  const handleOpenDeleteFileModal = (historyItem) => {
    setDeletingFileItem(historyItem);
    const isLatest = uploadHistory[0]?._id === historyItem._id;
    setDeleteActiveRatesOption(isLatest);
    setShowDeleteFileModal(true);
  };

  // Confirm and Execute Delete of File Record and its Snapshot
  const confirmDeleteFile = async () => {
    if (!deletingFileItem) return;

    setDeletingFile(true);
    try {
      const token = localStorage.getItem('token');
      const url = `/api/master-rate/snapshot?historyId=${deletingFileItem._id}${deleteActiveRatesOption ? '&deleteActiveRates=true' : ''}`;
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
        if (deleteActiveRatesOption) {
          setItems([]);
          setTotalCount(0);
          setTotalWithImage(0);
          setPage(1);
          setHasMore(false);
          onMasterRatesUpdated?.();
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

  const getActionBadge = (action) => {
    switch (action) {
      case 'UPLOAD':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800">Upload</span>;
      case 'ADD':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">Add</span>;
      case 'EDIT':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">Edit</span>;
      case 'DELETE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800">Delete</span>;
      case 'CLEAR_ALL':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800">Clear All</span>;
      case 'RESTORE_SNAPSHOT':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">Restore</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-800">{action}</span>;
    }
  };

  const filteredValidationRows = getFilteredValidationRows();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Hidden File Input */}
      <input
        id="master-rate-file-input"
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />

      {/* Top Banner / Master Rate Card */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-medium text-emerald-100 border border-white/20">
              <FaMoneyBillWave className="w-3.5 h-3.5" />
              <span>Origin Pricing &amp; Image Catalog</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Master Rate File</h1>
            <p className="text-emerald-100/90 text-sm max-w-2xl leading-relaxed">
              Upload and manage Origin Rates, Dabbi (Box) Rates, Box Return Rates, and Image links. Images will automatically display on the SKU table for every SKU sharing the origin name.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-white text-emerald-800 hover:bg-emerald-50 text-sm font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 cursor-pointer"
            >
              <FaUpload className="w-4 h-4 text-emerald-600" />
              <span>Upload Rate File</span>
            </button>

            {totalCount > 0 && (
              <button
                type="button"
                onClick={() => setShowDeleteCurrentFileModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-600 text-red-100 hover:text-white border border-red-300/30 text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                title="Delete current master rate file"
              >
                <FaTrash className="w-3.5 h-3.5" />
                <span>Delete Rates</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-emerald-200 text-xs font-medium">Total Origins</div>
            <div className="text-2xl font-bold font-mono mt-0.5">{totalCount.toLocaleString()}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-emerald-200 text-xs font-medium">With Product Images</div>
            <div className="text-2xl font-bold font-mono mt-0.5 text-emerald-200">{totalWithImage.toLocaleString()}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-emerald-200 text-xs font-medium">Matching System</div>
            <div className="text-sm font-bold mt-1 text-white flex items-center gap-1.5">
              <FaCheckCircle className="text-emerald-300 w-3.5 h-3.5" />
              <span>1 Origin &rarr; Multi SKUs</span>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="text-emerald-200 text-xs font-medium">Catalog Status</div>
            <div className="text-sm font-bold mt-1 text-emerald-200">
              {totalCount > 0 ? 'Active & Linked' : 'No Rates Uploaded'}
            </div>
          </div>
        </div>
      </div>

      {/* Upload History / Backups Section */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <FaHistory className="text-emerald-600 w-4 h-4" />
            <h3 className="text-sm font-bold text-gray-900">Recent Upload History (Last 3)</h3>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {uploadHistory.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              No master rate file uploads recorded yet. Click <strong>&quot;Upload Rate File&quot;</strong> above to upload your first rate file.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {uploadHistory.slice(0, 3).map((item, index) => {
                const fileName = item.details?.fileName || 'master_rate_file';
                const totalRows = item.details?.totalCount;
                const prevRows = item.details?.previousCount;
                return (
                  <div
                    key={item._id || index}
                    className="bg-white border-2 border-emerald-100 hover:border-emerald-500 rounded-xl p-4 shadow-xs hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                        #{index + 1} {index === 0 && '• Latest'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 font-medium" title={moment(item.createdAt).format('LLLL')}>
                          {moment(item.createdAt).fromNow()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteFileModal(item)}
                          title="Delete this history / snapshot record"
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
                        >
                          <FaTrash className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <FaFileExcel className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="font-bold text-gray-900 text-sm truncate" title={fileName}>
                        {fileName}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                      {totalRows != null && (
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-500">Total Origins:</span>
                          <strong className="text-emerald-950 font-mono text-sm">{totalRows.toLocaleString()}</strong>
                        </div>
                      )}
                      {prevRows != null && (
                        <div className="flex justify-between items-center text-gray-500">
                          <span>Replaced previous:</span>
                          <span>{prevRows.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => handleDownloadSnapshot(item)}
                        disabled={downloadingSnapshot}
                        className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer"
                      >
                        <FaDownload className="w-3 h-3" />
                        <span>Download Backup</span>
                      </button>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setRestoringItem(item);
                            setShowRestoreModal(true);
                          }}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                        >
                          <FaUndo className="w-3 h-3" />
                          <span>Restore</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenDeleteFileModal(item)}
                          className="inline-flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold cursor-pointer"
                          title="Delete snapshot & history"
                        >
                          <FaTrash className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchRates(1, search, sortBy, sortOrder, true);
            }}
            className="flex-1 max-w-md"
          >
            <div className="relative">
              <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Original Product Name or Size..."
                className="w-full pl-10 pr-24 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-20 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                  title="Clear search"
                >
                  <FaTimes className="w-3 h-3" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1 top-1 bottom-1 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md transition cursor-pointer"
              >
                Search
              </button>
            </div>
          </form>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowDabbiManager(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm font-semibold rounded-lg border border-purple-200 transition cursor-pointer shadow-xs"
              title="Manage Dabbi (Packaging Boxes) & Rates"
            >
              <FaBoxOpen className="w-4 h-4 text-purple-600" />
              <span>Dabbi Config</span>
            </button>
            <button
              onClick={() => {
                setFormData({ origin: '', imageLink: '', itemRate: '', boxRate: '', boxReturnRate: '', size: '', dabbi: null, dabbiName: '' });
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-xs transition cursor-pointer"
            >
              <FaPlus className="w-3.5 h-3.5" />
              <span>Add Origin Rate</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg border border-gray-300 transition cursor-pointer"
              title="Export all rates to Excel"
            >
              <FaFileExcel className="w-3.5 h-3.5 text-green-600" />
              <span>Export</span>
            </button>
            <button
              onClick={() => fetchRates(1, search, sortBy, sortOrder, true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-300 transition cursor-pointer"
              title="Refresh"
            >
              <FaSync className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold uppercase text-xs select-none">
              <tr>
                <th scope="col" className="px-3 py-3.5 w-16 text-center">Image</th>
                <th scope="col" className="px-4 py-3.5 w-12 text-center">#</th>
                <th
                  scope="col"
                  onClick={() => handleSort('origin')}
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Original Product Name"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Original Product Name</span>
                    {sortBy === 'origin' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-emerald-600 w-3.5 h-3.5" /> : <FaSortDown className="text-emerald-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('itemRate')}
                  className="px-5 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Rate"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Rate</span>
                    {sortBy === 'itemRate' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-emerald-600 w-3.5 h-3.5" /> : <FaSortDown className="text-emerald-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('boxRate')}
                  className="px-5 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Dabbi Rate"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Dabbi Rate</span>
                    {sortBy === 'boxRate' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-emerald-600 w-3.5 h-3.5" /> : <FaSortDown className="text-emerald-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('boxReturnRate')}
                  className="px-5 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Dabbi Return Rate"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Dabbi Return Rate</span>
                    {sortBy === 'boxReturnRate' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-emerald-600 w-3.5 h-3.5" /> : <FaSortDown className="text-emerald-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('size')}
                  className="px-4 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Size"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Size</span>
                    {sortBy === 'size' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-emerald-600 w-3.5 h-3.5" /> : <FaSortDown className="text-emerald-600 w-3.5 h-3.5" />
                    ) : (
                      <FaSort className="text-gray-400 group-hover:text-gray-600 w-3 h-3 opacity-50" />
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort('updatedAt')}
                  className="px-6 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors group"
                  title="Click to sort by Last Modified"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Last Modified</span>
                    {sortBy === 'updatedAt' ? (
                      sortOrder === 'asc' ? <FaSortUp className="text-emerald-600 w-3.5 h-3.5" /> : <FaSortDown className="text-emerald-600 w-3.5 h-3.5" />
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
                  <td colSpan="9" className="text-center py-12 text-gray-500">
                    <div className="flex items-center justify-center space-x-2">
                      <FaSync className="animate-spin text-emerald-600 w-5 h-5" />
                      <span>Loading Master Rates...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-12 text-gray-500">
                    <p className="text-base font-semibold text-gray-700">No Original Product Rates Found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {search ? 'Try clearing your search query.' : 'Upload an Excel file or add a new rate using the buttons above.'}
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const rowNumber = idx + 1;
                  return (
                    <tr key={item._id || idx} className="hover:bg-emerald-50/40 transition-colors">
                      <td className="px-3 py-2 text-center">
                        {item.imageLink ? (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setPreviewImage({ url: item.imageLink, title: item.origin })}
                            className="inline-block relative group cursor-pointer focus:outline-hidden"
                            title="Click to view full image"
                          >
                            <img
                              src={item.imageLink}
                              alt={item.origin}
                              className="w-10 h-10 object-cover rounded-lg border border-gray-200 shadow-2xs group-hover:scale-110 group-hover:shadow-md transition-all duration-200"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                            <div className="hidden w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 items-center justify-center text-gray-400">
                              <FaImage className="w-4 h-4" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-300 mx-auto" title="No image uploaded">
                            <FaImage className="w-4 h-4 opacity-50" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center text-gray-400 font-mono text-xs">{rowNumber}</td>
                      <td className="px-6 py-3.5 font-bold text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {item.origin}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono font-semibold text-gray-900">
                        {item.itemRate != null ? `₹${Number(item.itemRate).toFixed(2)}` : '₹0.00'}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-gray-800">
                        <div>{item.boxRate != null ? `₹${Number(item.boxRate).toFixed(2)}` : '₹0.00'}</div>
                        {item.dabbiName && (
                          <div className="text-[10px] text-purple-700 font-sans font-semibold truncate max-w-[120px]" title={`Dabbi: ${item.dabbiName}`}>
                            📦 {item.dabbiName}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-gray-800">
                        {item.boxReturnRate != null ? `₹${Number(item.boxReturnRate).toFixed(2)}` : '₹0.00'}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-700">
                        {item.size ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                            {item.size}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
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
                          className="text-emerald-600 hover:text-emerald-800 p-1.5 hover:bg-emerald-100 rounded mr-1 transition cursor-pointer"
                          title="Edit Rate"
                        >
                          <FaEdit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDeleteModal(item)}
                          className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-100 rounded transition cursor-pointer"
                          title="Delete Origin Rate"
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

        {/* Infinite Scroll Footer */}
        <div ref={observerTarget} className="px-6 py-4 border-t border-gray-100 bg-gray-50/60">
          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-2">
              <FaSync className="animate-spin text-emerald-600 w-4 h-4" />
              <span className="text-xs font-semibold text-gray-700">Loading more rates...</span>
            </div>
          )}
          {!loadingMore && totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-2">
              <span>
                Showing <strong>{items.length.toLocaleString()}</strong> of <strong>{totalCount.toLocaleString()}</strong> Origins
              </span>
              {!hasMore && (
                <span className="text-gray-400">All Master Rates loaded</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Validation & Error Resolution Modal */}
      {showValidationModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-5 sm:p-6 space-y-4 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                    <FaExclamationTriangle className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Upload Data Validation &amp; Resolution</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  We scanned <strong>{validationSummary.total}</strong> rows in <strong>{uploadFile?.name}</strong>. Found{' '}
                  <strong className="text-red-600">{validationSummary.errors}</strong> rows with issues and{' '}
                  <strong className="text-emerald-600">{validationSummary.valid}</strong> valid rows.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowValidationModal(false);
                  setUploadFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Tabs & Bulk Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200/80">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setValidationFilter('errors')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    validationFilter === 'errors'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <FaExclamationTriangle className="w-3 h-3" />
                  <span>Issues Only ({validationSummary.errors})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setValidationFilter('valid')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    validationFilter === 'valid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <FaCheckCircle className="w-3 h-3" />
                  <span>Valid Rows ({validationSummary.valid})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setValidationFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    validationFilter === 'all'
                      ? 'bg-gray-900 text-white shadow-xs'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  All Rows ({validationSummary.total})
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={skipSelectedRows}
                  disabled={selectedRowIds.size === 0}
                  className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-gray-800 text-xs font-semibold rounded-lg transition cursor-pointer"
                  title="Skip selected rows from upload"
                >
                  Skip Selected ({selectedRowIds.size})
                </button>
                <button
                  type="button"
                  onClick={fixSelectedRatesToZero}
                  disabled={selectedRowIds.size === 0}
                  className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 disabled:opacity-40 text-blue-800 text-xs font-semibold rounded-lg transition cursor-pointer"
                  title="Fix invalid rate numbers by setting to 0"
                >
                  <FaWrench className="w-3 h-3 inline mr-1" />
                  Set Rate = 0
                </button>
                <button
                  type="button"
                  onClick={skipAllInvalidRows}
                  disabled={validationSummary.errors === 0}
                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 text-amber-900 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Skip All Errors
                </button>
                <button
                  type="button"
                  onClick={revalidateRows}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  Re-validate
                </button>
              </div>
            </div>

            {/* Validation Table */}
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl">
              <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                <thead className="bg-gray-100 text-gray-700 font-semibold uppercase sticky top-0 z-10 select-none">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAllVisible}
                        className="cursor-pointer text-gray-500 hover:text-gray-700"
                        title="Select/Deselect all visible"
                      >
                        {filteredValidationRows.length > 0 &&
                        filteredValidationRows.every(r => selectedRowIds.has(r.id)) ? (
                          <FaCheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <FaSquare className="w-4 h-4 text-gray-300" />
                        )}
                      </button>
                    </th>
                    <th scope="col" className="px-3 py-2.5 w-16">Row</th>
                    <th scope="col" className="px-4 py-2.5">Original Product Name (Editable)</th>
                    <th scope="col" className="px-3 py-2.5 w-24">Rate</th>
                    <th scope="col" className="px-3 py-2.5 w-24">Dabbi Rate</th>
                    <th scope="col" className="px-3 py-2.5 w-28">Dabbi Return</th>
                    <th scope="col" className="px-4 py-2.5">Image Link</th>
                    <th scope="col" className="px-3 py-2.5 w-24">Size</th>
                    <th scope="col" className="px-4 py-2.5">Status &amp; Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredValidationRows.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="text-center py-10 text-gray-400">
                        No rows found in this view filter.
                      </td>
                    </tr>
                  ) : (
                    filteredValidationRows.map(r => {
                      const isSelected = selectedRowIds.has(r.id);
                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-gray-50/80 transition-colors ${
                            !r.isValid ? 'bg-red-50/30' : isSelected ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(r.id)}
                              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-500">#{r.rowNumber}</td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={r.origin}
                              onChange={(e) => handleInlineEditRow(r.id, 'origin', e.target.value)}
                              placeholder="Enter product name"
                              className={`w-full px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 ${
                                !r.origin.trim()
                                  ? 'border-red-400 bg-red-50/50 focus:ring-red-500'
                                  : 'border-gray-300 focus:ring-emerald-500'
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.itemRate}
                              onChange={(e) => handleInlineEditRow(r.id, 'itemRate', e.target.value)}
                              placeholder="0"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.boxRate}
                              onChange={(e) => handleInlineEditRow(r.id, 'boxRate', e.target.value)}
                              placeholder="0"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.boxReturnRate}
                              onChange={(e) => handleInlineEditRow(r.id, 'boxReturnRate', e.target.value)}
                              placeholder="0"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={r.imageLink}
                              onChange={(e) => handleInlineEditRow(r.id, 'imageLink', e.target.value)}
                              placeholder="Optional image URL"
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={r.size || ''}
                              onChange={(e) => handleInlineEditRow(r.id, 'size', e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                            >
                              <option value="">—</option>
                              <option value="Large">Large</option>
                              <option value="Small">Small</option>
                              {r.size && !['Large', 'Small'].includes(r.size) && (
                                <option value={r.size}>{r.size}</option>
                              )}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            {r.errors.length > 0 ? (
                              <div className="space-y-1">
                                {r.errors.map((err, i) => (
                                  <span
                                    key={i}
                                    className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded bg-red-100 text-red-700 border border-red-200 mr-1"
                                  >
                                    {err}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                <FaCheckCircle className="w-3 h-3 text-emerald-600" />
                                <span>Valid</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-500">
                Ready to upload: <strong className="text-emerald-700">{validationSummary.valid}</strong> valid rows
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowValidationModal(false);
                    setUploadFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={proceedWithValidRows}
                  disabled={validationSummary.valid === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-2 transition cursor-pointer"
                >
                  <FaCheckCircle className="w-3.5 h-3.5" />
                  <span>Proceed with {validationSummary.valid} Valid Rows</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analyzing Diff Spinner Modal */}
      {analyzingDiff && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-3 animate-in fade-in">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <FaSync className="animate-spin w-6 h-6" />
            </div>
            <h3 className="font-bold text-gray-900 text-base">Comparing Rates with Database...</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Detecting newly added origins and price/box rate changes against your existing catalog. No records will be deleted.
            </p>
          </div>
        </div>
      )}

      {/* Selective Diff & Multi-Select Approval Modal */}
      {showDiffModal && diffResult && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-5 sm:p-6 space-y-4 animate-in fade-in max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-700">
                  <FaFileExcel className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span>Review & Approve Rate Changes</span>
                  </h3>
                  <p className="text-xs text-gray-500">
                    File: <span className="font-semibold text-gray-700">{parsedData?.fileName}</span> • {parsedData?.totalRows?.toLocaleString()} valid origins in file
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDiffModal(false);
                  setDiffResult(null);
                  setParsedData(null);
                  setUploadFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={applyingDiff}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div
                onClick={() => setDiffFilterTab('add')}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  diffFilterTab === 'add'
                    ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
                    : 'bg-emerald-50/50 border-emerald-200/70 hover:bg-emerald-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800">New to Add</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 font-bold text-emerald-700">
                    +{diffResult.summary.addCount}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-600 mt-1">New origins not in DB</p>
              </div>

              <div
                onClick={() => setDiffFilterTab('edit')}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  diffFilterTab === 'edit'
                    ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20'
                    : 'bg-amber-50/50 border-amber-200/70 hover:bg-amber-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-800">Edits to Update</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 font-bold text-amber-700">
                    {diffResult.summary.editCount}
                  </span>
                </div>
                <p className="text-[11px] text-amber-600 mt-1">Rates or sizes changed</p>
              </div>

              <div
                onClick={() => setDiffFilterTab('unchanged')}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  diffFilterTab === 'unchanged'
                    ? 'bg-gray-100 border-gray-400 ring-2 ring-gray-400/20'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">Unchanged</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 font-bold text-gray-700">
                    {diffResult.summary.unchangedCount}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Already identical in DB</p>
              </div>
            </div>

            {/* Quick Actions & Search Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setDiffFilterTab('all')}
                  className={`px-3 py-1 rounded-md transition ${
                    diffFilterTab === 'all'
                      ? 'bg-white text-gray-900 shadow-xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All Changes ({diffResult.summary.addCount + diffResult.summary.editCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDiffFilterTab('add')}
                  className={`px-3 py-1 rounded-md transition ${
                    diffFilterTab === 'add'
                      ? 'bg-white text-emerald-800 shadow-xs font-bold'
                      : 'text-gray-600 hover:text-emerald-700'
                  }`}
                >
                  New Only ({diffResult.summary.addCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDiffFilterTab('edit')}
                  className={`px-3 py-1 rounded-md transition ${
                    diffFilterTab === 'edit'
                      ? 'bg-white text-amber-800 shadow-xs font-bold'
                      : 'text-gray-600 hover:text-amber-700'
                  }`}
                >
                  Edits Only ({diffResult.summary.editCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDiffFilterTab('unchanged')}
                  className={`px-3 py-1 rounded-md transition ${
                    diffFilterTab === 'unchanged'
                      ? 'bg-white text-gray-800 shadow-xs font-bold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Unchanged ({diffResult.summary.unchangedCount})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <FaSearch className="absolute left-2.5 top-2.5 text-gray-400 w-3 h-3" />
                <input
                  type="text"
                  placeholder="Filter by origin..."
                  value={diffSearchQuery}
                  onChange={(e) => setDiffSearchQuery(e.target.value)}
                  className="pl-7 pr-3 py-1 text-xs border border-gray-300 rounded-lg w-full sm:w-44 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Selection Quick Buttons */}
            {diffFilterTab !== 'unchanged' && (
              <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700">Selection:</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    {selectedDiffKeys.size} approved
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allKeys = new Set();
                      diffResult.toAdd.forEach((_, idx) => allKeys.add(`add_${idx}`));
                      diffResult.toEdit.forEach((_, idx) => allKeys.add(`edit_${idx}`));
                      setSelectedDiffKeys(allKeys);
                    }}
                    className="text-emerald-700 hover:text-emerald-900 hover:underline font-medium cursor-pointer"
                  >
                    Select All Changes
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newKeys = new Set(selectedDiffKeys);
                      diffResult.toAdd.forEach((_, idx) => newKeys.add(`add_${idx}`));
                      setSelectedDiffKeys(newKeys);
                    }}
                    className="text-emerald-700 hover:text-emerald-900 hover:underline font-medium cursor-pointer"
                  >
                    Select All New
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newKeys = new Set(selectedDiffKeys);
                      diffResult.toEdit.forEach((_, idx) => newKeys.add(`edit_${idx}`));
                      setSelectedDiffKeys(newKeys);
                    }}
                    className="text-amber-700 hover:text-amber-900 hover:underline font-medium cursor-pointer"
                  >
                    Select All Edits
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDiffKeys(new Set())}
                    className="text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            {/* Diff Items Table */}
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl min-h-[220px] max-h-[360px]">
              {(() => {
                const itemsToRender = [];
                if (diffFilterTab === 'all' || diffFilterTab === 'add') {
                  diffResult.toAdd.forEach((item, idx) => {
                    itemsToRender.push({
                      key: `add_${idx}`,
                      itemIdx: idx,
                      type: 'add',
                      origin: item.origin,
                      itemRate: item.itemRate,
                      boxRate: item.boxRate,
                      boxReturnRate: item.boxReturnRate,
                      size: item.size,
                      imageLink: item.imageLink
                    });
                  });
                }
                if (diffFilterTab === 'all' || diffFilterTab === 'edit') {
                  diffResult.toEdit.forEach((item, idx) => {
                    itemsToRender.push({
                      key: `edit_${idx}`,
                      itemIdx: idx,
                      type: 'edit',
                      origin: item.origin,
                      itemRate: item.itemRate,
                      boxRate: item.boxRate,
                      boxReturnRate: item.boxReturnRate,
                      size: item.size,
                      imageLink: item.imageLink,
                      oldValues: item.oldValues,
                      newValues: item.newValues,
                      changes: item.changes
                    });
                  });
                }
                if (diffFilterTab === 'unchanged') {
                  diffResult.unchanged.forEach((item, idx) => {
                    itemsToRender.push({
                      key: `unchanged_${idx}`,
                      itemIdx: idx,
                      type: 'unchanged',
                      origin: item.origin,
                      itemRate: item.itemRate,
                      boxRate: item.boxRate,
                      boxReturnRate: item.boxReturnRate,
                      size: item.size,
                      imageLink: item.imageLink
                    });
                  });
                }

                const filtered = diffSearchQuery.trim()
                  ? itemsToRender.filter(i =>
                      i.origin && i.origin.toLowerCase().includes(diffSearchQuery.toLowerCase())
                    )
                  : itemsToRender;

                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center text-gray-500 text-xs">
                      No items matching this view or search filter.
                    </div>
                  );
                }

                const allFilteredChangableKeys = filtered.filter(i => i.type !== 'unchanged').map(i => i.key);
                const allSelected = allFilteredChangableKeys.length > 0 && allFilteredChangableKeys.every(k => selectedDiffKeys.has(k));

                return (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 text-gray-600 font-semibold sticky top-0 z-10 border-b">
                      <tr>
                        {diffFilterTab !== 'unchanged' && (
                          <th className="p-2.5 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => {
                                const next = new Set(selectedDiffKeys);
                                if (allSelected) {
                                  allFilteredChangableKeys.forEach(k => next.delete(k));
                                } else {
                                  allFilteredChangableKeys.forEach(k => next.add(k));
                                }
                                setSelectedDiffKeys(next);
                              }}
                              className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </th>
                        )}
                        <th className="p-2.5 w-24">Change</th>
                        <th className="p-2.5">Origin Item Name</th>
                        <th className="p-2.5">Item Rate</th>
                        <th className="p-2.5">Box Rate</th>
                        <th className="p-2.5">Return Rate</th>
                        <th className="p-2.5 w-24">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map(item => {
                        const isSelected = selectedDiffKeys.has(item.key);
                        const isChangable = item.type !== 'unchanged';

                        return (
                          <tr
                            key={item.key}
                            onClick={() => {
                              if (!isChangable) return;
                              const next = new Set(selectedDiffKeys);
                              if (isSelected) next.delete(item.key);
                              else next.add(item.key);
                              setSelectedDiffKeys(next);
                            }}
                            className={`transition cursor-pointer ${
                              !isChangable
                                ? 'bg-gray-50/50 text-gray-500 cursor-default'
                                : isSelected
                                ? 'bg-emerald-50/60 hover:bg-emerald-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            {diffFilterTab !== 'unchanged' && (
                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                {isChangable ? (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const next = new Set(selectedDiffKeys);
                                      if (e.target.checked) next.add(item.key);
                                      else next.delete(item.key);
                                      setSelectedDiffKeys(next);
                                    }}
                                    className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                  />
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            )}
                            <td className="p-2.5">
                              {item.type === 'add' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  <FaPlus className="w-2.5 h-2.5" />
                                  <span>NEW</span>
                                </span>
                              )}
                              {item.type === 'edit' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  <FaEdit className="w-2.5 h-2.5" />
                                  <span>EDIT</span>
                                </span>
                              )}
                              {item.type === 'unchanged' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                                  MATCH
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-semibold text-gray-900">{item.origin}</td>
                            <td className="p-2.5">
                              {item.type === 'edit' && item.changes?.itemRateChanged ? (
                                <div className="flex items-center gap-1 flex-wrap font-mono">
                                  <span className="line-through text-red-500 text-[11px]">
                                    ₹{item.oldValues?.itemRate}
                                  </span>
                                  <span className="text-gray-400">➔</span>
                                  <span className="font-bold text-emerald-700">
                                    ₹{item.newValues?.itemRate}
                                  </span>
                                </div>
                              ) : (
                                <span className="font-mono text-gray-800">₹{item.itemRate}</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {item.type === 'edit' && item.changes?.boxRateChanged ? (
                                <div className="flex items-center gap-1 flex-wrap font-mono">
                                  <span className="line-through text-red-500 text-[11px]">
                                    ₹{item.oldValues?.boxRate}
                                  </span>
                                  <span className="text-gray-400">➔</span>
                                  <span className="font-bold text-emerald-700">
                                    ₹{item.newValues?.boxRate}
                                  </span>
                                </div>
                              ) : (
                                <span className="font-mono text-gray-800">₹{item.boxRate}</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {item.type === 'edit' && item.changes?.boxReturnRateChanged ? (
                                <div className="flex items-center gap-1 flex-wrap font-mono">
                                  <span className="line-through text-red-500 text-[11px]">
                                    ₹{item.oldValues?.boxReturnRate}
                                  </span>
                                  <span className="text-gray-400">➔</span>
                                  <span className="font-bold text-emerald-700">
                                    ₹{item.newValues?.boxReturnRate}
                                  </span>
                                </div>
                              ) : (
                                <span className="font-mono text-gray-800">₹{item.boxReturnRate}</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {item.type === 'edit' && item.changes?.sizeChanged ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="line-through text-red-500 text-[11px]">
                                    {item.oldValues?.size || '(none)'}
                                  </span>
                                  <span className="text-gray-400">➔</span>
                                  <span className="font-semibold text-emerald-700">
                                    {item.newValues?.size || '(none)'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-800">{item.size || '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Safety Notice Banner */}
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FaCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Safe Selective Import:</strong> Only selected additions and edits will be applied. Existing catalog rates not in this file will <strong>NEVER</strong> be deleted.
                </span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowDiffModal(false);
                  setDiffResult(null);
                  setParsedData(null);
                  setUploadFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={applyingDiff}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={applyRateApproval}
                disabled={applyingDiff || selectedDiffKeys.size === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-semibold shadow-md flex items-center gap-2 transition cursor-pointer"
              >
                {applyingDiff ? (
                  <>
                    <FaSync className="animate-spin w-4 h-4" />
                    <span>Applying Changes...</span>
                  </>
                ) : (
                  <>
                    <FaCheckCircle className="w-4 h-4" />
                    <span>Approve & Save ({selectedDiffKeys.size} Selected)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Origin Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-lg">
                <FaPlus className="w-4 h-4" />
                <span>Add Original Product Rate</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Original Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.origin}
                  onChange={(e) => setFormData(prev => ({ ...prev, origin: e.target.value }))}
                  placeholder="e.g. ardh nag chain, isr_2661, ring_01..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Size</label>
                  <select
                    value={formData.size || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, size: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                  >
                    <option value="">Select Size</option>
                    <option value="Large">Large</option>
                    <option value="Small">Small</option>
                    {formData.size && !['Large', 'Small'].includes(formData.size) && (
                      <option value={formData.size}>{formData.size}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.itemRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, itemRate: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Dabbi Selection & Rates */}
              <div className="space-y-3 bg-purple-50/40 p-3 rounded-xl border border-purple-100">
                <DabbiSelect
                  value={formData.dabbi || ''}
                  selectedName={formData.dabbiName}
                  boxRate={formData.boxRate}
                  boxReturnRate={formData.boxReturnRate}
                  size={formData.size}
                  onChange={(selectedDabbi, isCustom) => {
                    if (selectedDabbi) {
                      setFormData(prev => ({
                        ...prev,
                        dabbi: selectedDabbi._id,
                        dabbiName: selectedDabbi.name,
                        boxRate: selectedDabbi.boxRate != null ? selectedDabbi.boxRate : prev.boxRate,
                        boxReturnRate: selectedDabbi.boxReturnRate != null ? selectedDabbi.boxReturnRate : prev.boxReturnRate,
                        size: selectedDabbi.size && !prev.size ? selectedDabbi.size : prev.size
                      }));
                    } else if (isCustom) {
                      setFormData(prev => ({
                        ...prev,
                        dabbi: null,
                        dabbiName: 'Custom'
                      }));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        dabbi: null,
                        dabbiName: ''
                      }));
                    }
                  }}
                />

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Dabbi Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.boxRate}
                      onChange={(e) => setFormData(prev => ({ ...prev, boxRate: e.target.value }))}
                      placeholder="0.00"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Dabbi Return Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.boxReturnRate}
                      onChange={(e) => setFormData(prev => ({ ...prev, boxReturnRate: e.target.value }))}
                      placeholder="0.00"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Image Link</label>
                <input
                  type="text"
                  value={formData.imageLink}
                  onChange={(e) => setFormData(prev => ({ ...prev, imageLink: e.target.value }))}
                  placeholder="https://... or image URL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition"
                >
                  {saving ? <FaSync className="animate-spin w-4 h-4" /> : <FaPlus className="w-4 h-4" />}
                  <span>Save Original Product</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Origin Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-lg">
                <FaEdit className="w-4 h-4" />
                <span>Edit Original Product Rate</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditRate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Original Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.origin}
                  onChange={(e) => setFormData(prev => ({ ...prev, origin: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Size</label>
                  <select
                    value={formData.size || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, size: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                  >
                    <option value="">Select Size</option>
                    <option value="Large">Large</option>
                    <option value="Small">Small</option>
                    {formData.size && !['Large', 'Small'].includes(formData.size) && (
                      <option value={formData.size}>{formData.size}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.itemRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, itemRate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Dabbi Selection & Rates */}
              <div className="space-y-3 bg-purple-50/40 p-3 rounded-xl border border-purple-100">
                <DabbiSelect
                  value={formData.dabbi || ''}
                  selectedName={formData.dabbiName}
                  boxRate={formData.boxRate}
                  boxReturnRate={formData.boxReturnRate}
                  size={formData.size}
                  onChange={(selectedDabbi, isCustom) => {
                    if (selectedDabbi) {
                      setFormData(prev => ({
                        ...prev,
                        dabbi: selectedDabbi._id,
                        dabbiName: selectedDabbi.name,
                        boxRate: selectedDabbi.boxRate != null ? selectedDabbi.boxRate : prev.boxRate,
                        boxReturnRate: selectedDabbi.boxReturnRate != null ? selectedDabbi.boxReturnRate : prev.boxReturnRate,
                        size: selectedDabbi.size && !prev.size ? selectedDabbi.size : prev.size
                      }));
                    } else if (isCustom) {
                      setFormData(prev => ({
                        ...prev,
                        dabbi: null,
                        dabbiName: 'Custom'
                      }));
                    } else {
                      setFormData(prev => ({
                        ...prev,
                        dabbi: null,
                        dabbiName: ''
                      }));
                    }
                  }}
                />

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Dabbi Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.boxRate}
                      onChange={(e) => setFormData(prev => ({ ...prev, boxRate: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Dabbi Return Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.boxReturnRate}
                      onChange={(e) => setFormData(prev => ({ ...prev, boxReturnRate: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Image Link</label>
                <input
                  type="text"
                  value={formData.imageLink}
                  onChange={(e) => setFormData(prev => ({ ...prev, imageLink: e.target.value }))}
                  placeholder="https://... or image URL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Rate Revision Section - shows when rates differ */}
              {(Number(formData.itemRate || 0) !== Number(editingItem.itemRate || 0) ||
                Number(formData.boxRate || 0) !== Number(editingItem.boxRate || 0) ||
                Number(formData.boxReturnRate || 0) !== Number(editingItem.boxReturnRate || 0)) && (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                      <FaCalendarAlt className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Rate Revision Schedule</span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Date-Effective
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                      !isRateCorrection ? 'bg-white border-emerald-500 shadow-xs' : 'bg-transparent border-emerald-200 opacity-75'
                    }`}>
                      <input
                        type="radio"
                        name="rateUpdateType"
                        checked={!isRateCorrection}
                        onChange={() => setIsRateCorrection(false)}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="font-bold text-gray-900 block">From specific date</span>
                        <span className="text-[10px] text-gray-500 block">Past orders keep old rate (₹{editingItem.itemRate || 0})</span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                      isRateCorrection ? 'bg-white border-emerald-500 shadow-xs' : 'bg-transparent border-emerald-200 opacity-75'
                    }`}>
                      <input
                        type="radio"
                        name="rateUpdateType"
                        checked={isRateCorrection}
                        onChange={() => setIsRateCorrection(true)}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="font-bold text-gray-900 block">All dates (Correction)</span>
                        <span className="text-[10px] text-gray-500 block">Fixes typo across all historical orders</span>
                      </div>
                    </label>
                  </div>

                  {!isRateCorrection && (
                    <div className="pt-1">
                      <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                        Effective Starting From Date:
                      </label>
                      <input
                        type="date"
                        value={rateEffectiveFromDate}
                        onChange={(e) => setRateEffectiveFromDate(e.target.value)}
                        className="w-full px-3 py-1.5 border border-emerald-300 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-emerald-800 mt-1">
                        ℹ️ Orders before {rateEffectiveFromDate} will retain previous rate of ₹{editingItem.itemRate || 0} + ₹{editingItem.boxRate || 0}.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Historical Rates accordion if previous rates exist */}
              {Array.isArray(editingItem.rateHistory) && editingItem.rateHistory.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setShowRateHistoryAccordion(prev => !prev)}
                    className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between font-semibold text-gray-700 transition"
                  >
                    <span>Rate History ({editingItem.rateHistory.length} revisions)</span>
                    <span className="text-gray-400">{showRateHistoryAccordion ? '▲' : '▼'}</span>
                  </button>
                  {showRateHistoryAccordion && (
                    <div className="p-3 bg-white space-y-2 max-h-40 overflow-y-auto">
                      {editingItem.rateHistory.map((h, idx) => {
                        const fromStr = h.effectiveFrom ? new Date(h.effectiveFrom).toLocaleDateString('en-GB') : 'Inception';
                        const toStr = h.effectiveTo ? new Date(h.effectiveTo).toLocaleDateString('en-GB') : 'Current';
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100 text-[11px]">
                            <div>
                              <span className="font-bold text-gray-900">₹{h.itemRate || 0}</span>
                              <span className="text-gray-500 ml-1">(Dabbi: ₹{h.boxRate || 0}, Ret: ₹{h.boxReturnRate || 0})</span>
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-gray-600 block">{fromStr} → {toStr}</span>
                              {h.note && <span className="text-[10px] text-gray-400 block">{h.note}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition"
                >
                  {saving ? <FaSync className="animate-spin w-4 h-4" /> : <FaCheckCircle className="w-4 h-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Single Modal */}
      {showDeleteModal && deletingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full text-red-600">
                <FaTrash className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Origin Rate</h3>
            </div>

            <p className="text-sm text-gray-600">
              Are you sure you want to remove Origin <strong className="text-gray-900">&quot;{deletingItem.origin}&quot;</strong> from Master Rates?
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
                onClick={confirmDeleteRate}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Whole Master Rate File Confirmation Modal */}
      {showDeleteCurrentFileModal && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full text-red-600">
                <FaTrash className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Master Rate File</h3>
                <p className="text-xs text-gray-500">Permanently delete current active Origin Rates</p>
              </div>
            </div>

            <div className="p-4 bg-red-50/70 border border-red-200/80 rounded-xl space-y-2 text-xs text-red-950">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Active Origins to delete:</span>
                <strong className="font-mono text-sm text-red-700">{totalCount.toLocaleString()} Origins</strong>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              ⚠️ <strong>Warning:</strong> This will delete all <strong>{totalCount.toLocaleString()}</strong> active Origin &amp; Rate records.
            </p>

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

      {/* Delete File Record Confirmation Modal */}
      {showDeleteFileModal && deletingFileItem && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full text-red-600">
                <FaTrash className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Rate File Record</h3>
                <p className="text-xs text-gray-500">Remove this upload entry and its backup snapshot</p>
              </div>
            </div>

            <div className="p-4 bg-red-50/70 border border-red-200/80 rounded-xl space-y-2 text-xs text-red-950">
              <div className="flex items-center gap-2">
                <FaFileExcel className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="font-bold text-sm text-gray-900 truncate">
                  {deletingFileItem.details?.fileName || 'master_rate_file.xlsx'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-red-200/60">
                <div>
                  <span className="text-gray-500 block">Total Origins:</span>
                  <strong className="font-mono text-gray-900">
                    {(deletingFileItem.details?.totalCount || totalCount).toLocaleString()} Origins
                  </strong>
                </div>
                <div>
                  <span className="text-gray-500 block">Uploaded By:</span>
                  <strong className="text-gray-900">{deletingFileItem.performedByName || 'User'}</strong>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to delete this upload history entry? This will permanently remove the record and its backup snapshot.
            </p>

            {uploadHistory[0]?._id === deletingFileItem._id && (
              <label className="flex items-start gap-2.5 p-3 bg-red-50 hover:bg-red-100/70 rounded-xl border border-red-200 cursor-pointer text-xs text-red-950 select-none transition">
                <input
                  type="checkbox"
                  checked={deleteActiveRatesOption}
                  onChange={(e) => setDeleteActiveRatesOption(e.target.checked)}
                  className="mt-0.5 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <div>
                  <strong className="block font-bold">Also delete all {totalCount.toLocaleString()} active Master Rates</strong>
                  <span className="text-[11px] text-red-700">Wipes current active rates from the database and reverts to clean slate.</span>
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
                    <span>Yes, Delete Record</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Snapshot Modal */}
      {showRestoreModal && restoringItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-full text-amber-700">
                <FaUndo className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Restore Master Rate Backup</h3>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Restore Master Rate File from backup &quot;{restoringItem.details?.fileName || 'Backup'}&quot;? This will replace current active rates with the backup dataset.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                disabled={restoringSnapshot}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestoreSnapshot}
                disabled={restoringSnapshot}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-2 transition cursor-pointer"
              >
                {restoringSnapshot ? <FaSync className="animate-spin w-3.5 h-3.5" /> : <FaUndo className="w-3.5 h-3.5" />}
                <span>Restore Backup</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
              <span className="font-semibold text-sm truncate">{previewImage.title || 'Product Image Preview'}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition cursor-pointer"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-gray-50 max-h-[75vh]">
              <img
                src={previewImage.url}
                alt={previewImage.title || 'Preview'}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>
            <div className="p-3 bg-white border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
              <span className="truncate max-w-[280px]">{previewImage.url}</span>
              <a
                href={previewImage.url}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:underline flex-shrink-0 font-medium ml-2"
              >
                Open in new tab &rarr;
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Dabbi Manager Modal */}
      <DabbiManager
        isOpen={showDabbiManager}
        onClose={() => setShowDabbiManager(false)}
        onDabbiUpdated={() => fetchRates(page, search, sortBy, sortOrder, true)}
      />
    </div>
  );
}
