import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/router';
import {
  FaMoneyBillWave,
  FaCalendarAlt,
  FaBuilding,
  FaSearch,
  FaFileExcel,
  FaSync,
  FaArrowRight,
  FaExclamationTriangle,
  FaCheckCircle,
  FaBoxOpen,
  FaTimes,
  FaUndo,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaFilter,
  FaEye,
  FaChevronDown,
  FaChevronUp,
  FaChevronRight,
  FaChartPie,
  FaCalculator,
  FaPrint,
  FaBolt,
  FaEdit,
  FaPlus,
  FaDownload
} from 'react-icons/fa';
import DabbiSelect from './DabbiSelect';

export default function ReconciliationBilling({ onNavigateToOrigin, onNavigateToMasterSku }) {
  const router = useRouter();

  // Date filters (defaults to current month)
  const [startDate, setStartDate] = useState(() => moment().startOf('month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(() => moment().endOf('month').format('YYYY-MM-DD'));
  const [selectedPreset, setSelectedPreset] = useState('this_month');

  // Dimension filters
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const companyDropdownRef = useRef(null);

  // Missing format download dropdown refs & state
  const missingTopDropdownRef = useRef(null);
  const missingBannerDropdownRef = useRef(null);
  const [isMissingTopDropdownOpen, setIsMissingTopDropdownOpen] = useState(false);
  const [isMissingBannerDropdownOpen, setIsMissingBannerDropdownOpen] = useState(false);

  const [searchSku, setSearchSku] = useState('');
  const [platform, setPlatform] = useState('meesho');
  const [onlyMissingRates, setOnlyMissingRates] = useState(false);
  const [custReturnMinInput, setCustReturnMinInput] = useState('');
  const [custReturnMaxInput, setCustReturnMaxInput] = useState('');
  const [appliedReturnMin, setAppliedReturnMin] = useState('');
  const [appliedReturnMax, setAppliedReturnMax] = useState('');

  // Standard Reconciliation Parameters
  const [printRate, setPrintRate] = useState(2.40);
  const [custReturnPercent, setCustReturnPercent] = useState(85);

  // Final Settlement Ledger Modal State ('ફાઈનલ હિસાબ')
  const [isFinalHisabOpen, setIsFinalHisabOpen] = useState(false);
  const [finalHisabState, setFinalHisabState] = useState({
    prevBalance: 0,
    expenses: 0,
    withdrawals: 0,
    bankBalance: 0,
    meeshoPending: 0,
    companyBankBalances: {},
    companyPendingAmounts: {}
  });

  // Quick SKU & Rate Mapping Modal State (રીઅલ-ટાઇમ રેટ અને મેપિંગ)
  const [quickMapModal, setQuickMapModal] = useState({
    isOpen: false,
    sku: '',
    origin: '',
    size: '',
    itemRate: '',
    boxRate: '2.40',
    boxReturnRate: '2.40',
    dabbi: null,
    dabbiName: '',
    imageLink: '',
    effectiveFromDate: '',
    isCorrection: true,
    note: '',
    saving: false
  });
  const [allOriginsList, setAllOriginsList] = useState([]);
  const [loadingOrigins, setLoadingOrigins] = useState(false);
  const [dabbis, setDabbis] = useState([]);

  // Fetch active Dabbis for resolving packaging box names
  const fetchDabbis = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await axios.get('/api/dabbi', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success && Array.isArray(res.data.dabbis)) {
        setDabbis(res.data.dabbis);
      }
    } catch (err) {
      console.error('Error fetching dabbis in ReconciliationBilling:', err);
    }
  }, []);

  useEffect(() => {
    fetchDabbis();
  }, [fetchDabbis]);

  // Helper to resolve packaging dabbi name for a SKU
  const resolveDabbiForSku = useCallback((s) => {
    if (!s) return null;
    const originVal = s.origin && s.origin !== 'Unmapped SKU' ? s.origin : '';
    const matchedRate = allOriginsList.find(
      r => (r.origin || '').trim().toLowerCase() === originVal.trim().toLowerCase()
    );
    if (matchedRate?.dabbiName && matchedRate.dabbiName !== 'Custom') {
      return matchedRate.dabbiName;
    }
    if (dabbis && dabbis.length > 0) {
      if (matchedRate?.dabbi) {
        const found = dabbis.find(d => String(d._id) === String(matchedRate.dabbi));
        if (found) return found.name;
      }
      const bRate = s.boxRate != null ? Number(s.boxRate) : (matchedRate?.boxRate != null ? Number(matchedRate.boxRate) : null);
      const bRetRate = s.boxReturnRate != null ? Number(s.boxReturnRate) : (matchedRate?.boxReturnRate != null ? Number(matchedRate.boxReturnRate) : null);
      if (bRate != null && bRate > 0) {
        if (bRetRate != null && bRetRate > 0) {
          const matchBoth = dabbis.find(d => Number(d.boxRate) === bRate && Number(d.boxReturnRate) === bRetRate);
          if (matchBoth) return matchBoth.name;
        }
        const matchSingle = dabbis.find(d => Number(d.boxRate) === bRate);
        if (matchSingle) return matchSingle.name;
      }
    }
    return null;
  }, [allOriginsList, dabbis]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target)) {
        setIsCompanyDropdownOpen(false);
      }
      if (missingTopDropdownRef.current && !missingTopDropdownRef.current.contains(event.target)) {
        setIsMissingTopDropdownOpen(false);
      }
      if (missingBannerDropdownRef.current && !missingBannerDropdownRef.current.contains(event.target)) {
        setIsMissingBannerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Active View Tab: 'company' | 'date' | 'sku'
  const [activeView, setActiveView] = useState('company');

  // Data state
  const [loading, setLoading] = useState(false);
  const [billingData, setBillingData] = useState({
    summary: {
      inventoryQty: 0,
      inventoryAmount: 0,
      printRate: 2.40,
      printCharge: 0,
      grossInventoryAmount: 0,
      cancelledQty: 0,
      cancelledAmount: 0,
      returnsQty: 0,
      returnsAmount: 0,
      customerReturnsQty: 0,
      rawCustomerReturnsAmount: 0,
      custReturnPercent: 85,
      customerReturnsAmount: 0,
      totalReturnsAmount: 0,
      netQty: 0,
      netAmount: 0,
      missingRatesCount: 0
    },
    companyWise: [],
    dateWise: [],
    monthWise: [],
    skuWise: [],
    companiesList: []
  });

  // Table sorting states
  const [companySort, setCompanySort] = useState({ field: 'netAmount', order: 'desc' });
  const [skuSort, setSkuSort] = useState({ field: 'inventoryAmount', order: 'desc' });
  const [expandedMonths, setExpandedMonths] = useState(new Set([moment().format('YYYY-MM')]));

  // SKU Sorting handler & icon renderer
  const handleSkuSort = (field) => {
    setSkuSort(prev => {
      if (prev.field === field) {
        return { field, order: prev.order === 'desc' ? 'asc' : 'desc' };
      }
      return { field, order: (field === 'sku' || field === 'origin') ? 'asc' : 'desc' };
    });
  };

  const renderSkuSortIcon = (field) => {
    if (skuSort.field === field) {
      return skuSort.order === 'desc' ? (
        <FaSortDown className="w-3 h-3 text-indigo-600 inline ml-1" />
      ) : (
        <FaSortUp className="w-3 h-3 text-indigo-600 inline ml-1" />
      );
    }
    return <FaSort className="w-2.5 h-2.5 text-gray-300 group-hover:text-gray-500 inline ml-1 transition-colors" />;
  };

  // Multi-Company Bank Account & Pending calculation helpers
  const isMultiCompany = selectedCompanies.length > 1;

  const totalBankBalance = useMemo(() => {
    if (isMultiCompany) {
      return selectedCompanies.reduce((sum, c) => {
        const val = finalHisabState.companyBankBalances?.[c];
        return sum + (Number(val) || 0);
      }, 0);
    }
    return Number(finalHisabState.bankBalance) || 0;
  }, [isMultiCompany, selectedCompanies, finalHisabState.companyBankBalances, finalHisabState.bankBalance]);

  const totalMeeshoPending = useMemo(() => {
    if (isMultiCompany) {
      return selectedCompanies.reduce((sum, c) => {
        const val = finalHisabState.companyPendingAmounts?.[c];
        return sum + (Number(val) || 0);
      }, 0);
    }
    return Number(finalHisabState.meeshoPending) || 0;
  }, [isMultiCompany, selectedCompanies, finalHisabState.companyPendingAmounts, finalHisabState.meeshoPending]);

  const handleCompanyBankBalanceChange = (comp, val) => {
    setFinalHisabState(prev => {
      const updated = {
        ...(prev.companyBankBalances || {}),
        [comp]: val
      };
      const total = selectedCompanies.reduce((sum, c) => {
        const v = c === comp ? val : updated[c];
        return sum + (Number(v) || 0);
      }, 0);
      return {
        ...prev,
        companyBankBalances: updated,
        bankBalance: total
      };
    });
  };

  const handleCompanyPendingAmountChange = (comp, val) => {
    setFinalHisabState(prev => {
      const updated = {
        ...(prev.companyPendingAmounts || {}),
        [comp]: val
      };
      const total = selectedCompanies.reduce((sum, c) => {
        const v = c === comp ? val : updated[c];
        return sum + (Number(v) || 0);
      }, 0);
      return {
        ...prev,
        companyPendingAmounts: updated,
        meeshoPending: total
      };
    });
  };

  // Selected Origin for quick preview modal
  const [previewOrigin, setPreviewOrigin] = useState(null);

  // Fetch all master rates / origins for instant autocomplete & rate lookup
  const fetchAllOrigins = useCallback(async () => {
    try {
      setLoadingOrigins(true);
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/master-rate?all=true', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success && Array.isArray(res.data.rates)) {
        setAllOriginsList(res.data.rates);
      }
    } catch (err) {
      console.error('Error fetching origins list:', err);
    } finally {
      setLoadingOrigins(false);
    }
  }, []);

  useEffect(() => {
    fetchAllOrigins();
  }, [fetchAllOrigins]);

  // Open Quick Map & Rate Modal for any SKU
  const handleOpenQuickMap = (s) => {
    const originVal = s.origin && s.origin !== 'Unmapped SKU' ? s.origin : '';
    const matchedRate = allOriginsList.find(
      r => (r.origin || '').trim().toLowerCase() === originVal.trim().toLowerCase()
    );

    const targetBoxRate = s.boxRate != null && s.boxRate > 0 
      ? s.boxRate 
      : (matchedRate?.boxRate != null ? matchedRate.boxRate : (printRate || 2.40));
    const targetBoxReturnRate = s.boxReturnRate != null && s.boxReturnRate > 0 
      ? s.boxReturnRate 
      : (matchedRate?.boxReturnRate != null ? matchedRate.boxReturnRate : (printRate || 2.40));

    let dabbiId = matchedRate?.dabbi || null;
    let dabbiName = (matchedRate?.dabbiName && matchedRate.dabbiName !== 'Custom') ? matchedRate.dabbiName : '';
    if (!dabbiName && dabbis.length > 0 && targetBoxRate != null && Number(targetBoxRate) > 0) {
      const br = Number(targetBoxRate);
      const brr = targetBoxReturnRate != null ? Number(targetBoxReturnRate) : null;
      const match = (brr != null ? dabbis.find(d => Number(d.boxRate) === br && Number(d.boxReturnRate) === brr) : null) || dabbis.find(d => Number(d.boxRate) === br);
      if (match) {
        dabbiId = match._id;
        dabbiName = match.name;
      }
    }

    setQuickMapModal({
      isOpen: true,
      sku: s.sku || '',
      origin: originVal,
      size: s.size || (matchedRate?.size) || '',
      itemRate: s.itemRate != null && s.itemRate > 0 
        ? s.itemRate 
        : (matchedRate?.itemRate != null ? matchedRate.itemRate : ''),
      boxRate: targetBoxRate,
      boxReturnRate: targetBoxReturnRate,
      dabbi: dabbiId,
      dabbiName: dabbiName,
      imageLink: s.imageLink || (matchedRate?.imageLink) || '',
      effectiveFromDate: startDate || moment().format('YYYY-MM-DD'),
      isCorrection: true,
      note: 'Mapped from Billing tab',
      saving: false
    });
  };

  // Autocomplete matching when typing origin name
  const handleOriginChange = (val) => {
    const trimmed = (val || '').trim().toLowerCase();
    const matched = allOriginsList.find(r => (r.origin || '').trim().toLowerCase() === trimmed);
    let matchedDabbiId = matched?.dabbi || null;
    let matchedDabbiName = (matched?.dabbiName && matched.dabbiName !== 'Custom') ? matched.dabbiName : '';
    if (!matchedDabbiName && matched?.boxRate != null && dabbis.length > 0) {
      const br = Number(matched.boxRate);
      const brr = matched.boxReturnRate != null ? Number(matched.boxReturnRate) : null;
      const dMatch = (brr != null ? dabbis.find(d => Number(d.boxRate) === br && Number(d.boxReturnRate) === brr) : null) || dabbis.find(d => Number(d.boxRate) === br);
      if (dMatch) {
        matchedDabbiId = dMatch._id;
        matchedDabbiName = dMatch.name;
      }
    }
    setQuickMapModal(prev => ({
      ...prev,
      origin: val,
      size: matched?.size !== undefined ? matched.size : prev.size,
      itemRate: matched?.itemRate !== undefined ? matched.itemRate : prev.itemRate,
      boxRate: matched?.boxRate !== undefined ? matched.boxRate : prev.boxRate,
      boxReturnRate: matched?.boxReturnRate !== undefined ? matched.boxReturnRate : prev.boxReturnRate,
      dabbi: matchedDabbiId !== null ? matchedDabbiId : prev.dabbi,
      dabbiName: matchedDabbiName || prev.dabbiName,
      imageLink: matched?.imageLink !== undefined ? matched.imageLink : prev.imageLink,
    }));
  };

  // Submit quick-map request and recalculate billing in real-time
  const handleSaveQuickMap = async (e) => {
    if (e) e.preventDefault();
    if (!quickMapModal.sku || !quickMapModal.sku.trim()) {
      toast.error('SKU is required');
      return;
    }
    if (!quickMapModal.origin || !quickMapModal.origin.trim()) {
      toast.error('Original Product Name is required (ઓરિજિન આઇટમનું નામ દાખલ કરો)');
      return;
    }

    setQuickMapModal(prev => ({ ...prev, saving: true }));
    try {
      const token = localStorage.getItem('token');
      const payload = {
        sku: quickMapModal.sku.trim(),
        origin: quickMapModal.origin.trim(),
        size: quickMapModal.size?.trim() || '',
        itemRate: quickMapModal.itemRate !== '' ? Number(quickMapModal.itemRate) : 0,
        boxRate: quickMapModal.boxRate !== '' ? Number(quickMapModal.boxRate) : 2.40,
        boxReturnRate: quickMapModal.boxReturnRate !== '' ? Number(quickMapModal.boxReturnRate) : 2.40,
        dabbi: quickMapModal.dabbi || null,
        dabbiName: quickMapModal.dabbiName || '',
        imageLink: quickMapModal.imageLink?.trim() || '',
        effectiveFromDate: quickMapModal.effectiveFromDate || undefined,
        isCorrection: quickMapModal.isCorrection,
        note: quickMapModal.note || 'Billing quick-map'
      };

      const res = await axios.post('/api/reconciliation-billing/quick-map', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        toast.success(`✅ ${quickMapModal.sku} successfully mapped to "${quickMapModal.origin}"! Billing updated.`);
        setQuickMapModal(prev => ({ ...prev, isOpen: false, saving: false }));
        // Refresh billing calculations immediately in real time!
        fetchBilling();
        // Refresh master rates cache
        fetchAllOrigins();
      }
    } catch (err) {
      console.error('Error in quick-map:', err);
      toast.error(err.response?.data?.message || 'Failed to map SKU and save rate');
      setQuickMapModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Fetch billing calculation data from API
  const fetchBilling = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = {
        startDate,
        endDate,
        platform,
        printRate,
        custReturnPercent
      };
      if (selectedCompanies.length > 0) {
        params.companies = selectedCompanies.join(',');
      }

      const res = await axios.get('/api/reconciliation-billing', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      if (res.data?.success) {
        setBillingData(res.data);
        if (Array.isArray(res.data.companiesList) && res.data.companiesList.length > 0) {
          setAllCompanies(res.data.companiesList);
        }
      }
    } catch (err) {
      console.error('Error fetching billing data:', err);
      toast.error(err.response?.data?.message || 'Failed to calculate reconciliation billing');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedCompanies, platform, printRate, custReturnPercent]);

  // Reset cached companies when date range changes so dropdown reflects active companies for that period
  useEffect(() => {
    setAllCompanies([]);
  }, [startDate, endDate]);

  // Initial load and debounced refetch
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBilling();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchBilling]);

  // Handle Preset Clicks
  const handlePreset = (preset) => {
    setSelectedPreset(preset);
    let s = moment().format('YYYY-MM-DD');
    let e = moment().format('YYYY-MM-DD');

    if (preset === 'today') {
      s = moment().format('YYYY-MM-DD');
      e = moment().format('YYYY-MM-DD');
    } else if (preset === 'yesterday') {
      s = moment().subtract(1, 'day').format('YYYY-MM-DD');
      e = moment().subtract(1, 'day').format('YYYY-MM-DD');
    } else if (preset === 'last_7_days') {
      s = moment().subtract(6, 'days').format('YYYY-MM-DD');
      e = moment().format('YYYY-MM-DD');
    } else if (preset === 'this_month') {
      s = moment().startOf('month').format('YYYY-MM-DD');
      e = moment().endOf('month').format('YYYY-MM-DD');
    } else if (preset === 'last_month') {
      s = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
      e = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
    }

    setStartDate(s);
    setEndDate(e);
  };

  // Format currency in Indian Rupees
  const formatINR = (val) => {
    const num = Number(val) || 0;
    return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  };

  // Format quantities
  const formatQty = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString('en-IN');
  };

  // Download missing / unmapped SKUs Excel file formatted for SKU or Master Rate upload
  // Exact same columns as uploaded in SKU or Master Rate so user is never confused
  // All missing or unfound data is kept completely blank ("")
  const downloadMissingSkusExcel = (format = 'sku') => {
    const selectedFormat = typeof format === 'string' ? format : 'sku';
    const missingSkus = (billingData.skuWise || []).filter(item => !item.hasRate || item.origin === 'Unmapped SKU');
    if (missingSkus.length === 0) {
      toast.info('No missing or unmapped SKUs found for this period.');
      return;
    }

    // 1. Format for Master SKU upload (Exact columns: SKU, Origin, Size)
    // Missing data kept blank ("")
    const skuRows = missingSkus.map(s => ({
      'SKU': s.sku || '',
      'Origin': s.origin && s.origin !== 'Unmapped SKU' ? s.origin : '',
      'Size': s.size || ''
    }));

    // 2. Format for Master Rate upload (Exact columns: original product name, Rate, dabbi rate, dabbi return rate, Image Link, Size)
    // Deduplicated by unique origin and size combination; missing data kept blank ("")
    const rateMap = new Map();
    missingSkus.forEach(s => {
      const originName = s.origin && s.origin !== 'Unmapped SKU' ? s.origin.trim() : '';
      const sizeVal = s.size || '';
      const key = `${originName}:::${sizeVal}`;
      if (!rateMap.has(key)) {
        rateMap.set(key, {
          'original product name': originName,
          'Rate': s.itemRate && s.itemRate > 0 ? s.itemRate : '',
          'dabbi rate': s.boxRate && s.boxRate > 0 ? s.boxRate : '',
          'dabbi return rate': s.boxReturnRate && s.boxReturnRate > 0 ? s.boxReturnRate : '',
          'Image Link': s.imageLink || '',
          'Size': sizeVal
        });
      }
    });
    const rateRows = Array.from(rateMap.values());

    const wb = XLSX.utils.book_new();

    if (selectedFormat === 'sku') {
      const ws = XLSX.utils.json_to_sheet(skuRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Master_SKUs');
      const fileName = `Missing_Master_SKU_${startDate}_to_${endDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Downloaded ${skuRows.length} missing SKUs in Master SKU upload format!`);
    } else if (selectedFormat === 'rate') {
      const ws = XLSX.utils.json_to_sheet(rateRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Master Rates');
      const fileName = `Missing_Master_Rates_${startDate}_to_${endDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Downloaded ${rateRows.length} items in Master Rate upload format!`);
    } else {
      // Both sheets in single workbook
      const wsSku = XLSX.utils.json_to_sheet(skuRows);
      XLSX.utils.book_append_sheet(wb, wsSku, 'Master_SKUs');
      const wsRate = XLSX.utils.json_to_sheet(rateRows);
      XLSX.utils.book_append_sheet(wb, wsRate, 'Master Rates');
      const fileName = `Missing_SKU_and_Rates_${startDate}_to_${endDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Downloaded missing file with Master SKU (${skuRows.length}) and Master Rate (${rateRows.length}) sheets!`);
    }
  };

  // Navigate to Master SKU File screen directly (downloads SKU format and navigates)
  const handleConfigureMissingSkusInMaster = () => {
    downloadMissingSkusExcel('sku');
    if (onNavigateToMasterSku) {
      onNavigateToMasterSku();
    } else {
      router.push('/extract-sku?tab=master-sku');
    }
  };

  // Customer Return % distribution counts across all SKUs
  const custReturnCounts = useMemo(() => {
    const list = billingData.skuWise || [];
    const counts = { all: list.length, '0-5': 0, '5-10': 0, '10-20': 0, '20-30': 0, '30+': 0 };
    list.forEach(item => {
      const invQty = Number(item.inventoryQty) || 0;
      const custRetQty = Number(item.customerReturnsQty) || 0;
      const p = invQty > 0 ? (custRetQty / invQty) * 100 : (custRetQty > 0 ? 100 : 0);
      if (p <= 5) counts['0-5']++;
      else if (p <= 10) counts['5-10']++;
      else if (p <= 20) counts['10-20']++;
      else if (p <= 30) counts['20-30']++;
      else counts['30+']++;
    });
    return counts;
  }, [billingData.skuWise]);

  // Filtered and sorted SKUs with instant real-time client-side search & percentages
  const displayedSkus = useMemo(() => {
    let list = billingData.skuWise || [];
    if (onlyMissingRates) {
      list = list.filter(item => !item.hasRate || item.origin === 'Unmapped SKU');
    }
    if (searchSku && searchSku.trim()) {
      const q = searchSku.trim().toLowerCase();
      list = list.filter(item =>
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.origin && item.origin.toLowerCase().includes(q)) ||
        (item.size && item.size.toLowerCase().includes(q))
      );
    }
    const withPercentages = list.map(item => {
      const invQty = Number(item.inventoryQty) || 0;
      const cancelQty = Number(item.cancelledQty) || 0;
      const retQty = Number(item.returnsQty) || 0;
      const custRetQty = Number(item.customerReturnsQty) || 0;
      const itemTotalRetQty = retQty + custRetQty;

      const cancelPercent = invQty > 0 ? (cancelQty / invQty) * 100 : 0;
      const returnPercent = invQty > 0 ? (retQty / invQty) * 100 : 0;
      const custReturnPercent = invQty > 0 ? (custRetQty / invQty) * 100 : (custRetQty > 0 ? 100 : 0);
      const totalReturnPercent = invQty > 0 ? (itemTotalRetQty / invQty) * 100 : (itemTotalRetQty > 0 ? 100 : 0);

      return {
        ...item,
        cancelPercent,
        returnPercent,
        custReturnPercent,
        totalReturnQty: itemTotalRetQty,
        totalReturnPercent,
        totalReturnAmount: (Number(item.returnsAmount) || 0) + (Number(item.customerReturnsAmount) || 0)
      };
    });

    // Apply Customer Return % range filter (Start % to End %)
    let filtered = withPercentages;
    const hasMin = appliedReturnMin !== '' && !isNaN(Number(appliedReturnMin));
    const hasMax = appliedReturnMax !== '' && !isNaN(Number(appliedReturnMax));

    if (hasMin || hasMax) {
      const minVal = hasMin ? Number(appliedReturnMin) : -Infinity;
      const maxVal = hasMax ? Number(appliedReturnMax) : Infinity;
      filtered = filtered.filter(item => {
        const p = item.custReturnPercent || 0;
        return p >= minVal && p <= maxVal;
      });
    }

    const { field, order } = skuSort;
    return filtered.sort((a, b) => {
      const valA = a[field] ?? 0;
      const valB = b[field] ?? 0;
      if (typeof valA === 'string') {
        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return order === 'asc' ? valA - valB : valB - valA;
    });
  }, [billingData.skuWise, onlyMissingRates, skuSort, searchSku, appliedReturnMin, appliedReturnMax]);

  // Sorted Companies with search support
  const displayedCompanies = useMemo(() => {
    let list = billingData.companyWise || [];
    if (searchSku && searchSku.trim()) {
      const q = searchSku.trim().toLowerCase();
      list = list.filter(c => c.companyName && c.companyName.toLowerCase().includes(q));
    }
    const { field, order } = companySort;
    return [...list].sort((a, b) => {
      const valA = a[field] ?? 0;
      const valB = b[field] ?? 0;
      if (typeof valA === 'string') {
        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return order === 'asc' ? valA - valB : valB - valA;
    });
  }, [billingData.companyWise, companySort, searchSku]);

  // Toggle month expansion in Date View
  const toggleMonth = (month) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  };

  // Unified company source list for dropdown
  const companiesSource = useMemo(() => {
    return allCompanies.length > 0 ? allCompanies : (billingData.companiesList || []);
  }, [allCompanies, billingData.companiesList]);

  // Filtered companies in the multi-select dropdown search
  const filteredDropdownCompanies = useMemo(() => {
    const list = companiesSource;
    if (!companySearch.trim()) return list;
    const q = companySearch.trim().toLowerCase();
    return list.filter(c => c.toLowerCase().includes(q));
  }, [companiesSource, companySearch]);

  const toggleCompany = (companyName) => {
    setSelectedCompanies(prev => {
      if (prev.includes(companyName)) {
        return prev.filter(c => c !== companyName);
      } else {
        return [...prev, companyName];
      }
    });
  };

  const handleSelectAllCompanies = () => {
    setSelectedCompanies(companiesSource);
  };

  const handleClearAllCompanies = () => {
    setSelectedCompanies([]);
  };

  const removeCompany = (companyName) => {
    setSelectedCompanies(prev => prev.filter(c => c !== companyName));
  };

  const getCompanyTitle = () => {
    if (selectedCompanies.length === 0) return 'કંપની';
    if (selectedCompanies.length === 1) return selectedCompanies[0];
    if (selectedCompanies.length === 2) return `${selectedCompanies[0]} & ${selectedCompanies[1]}`;
    return selectedCompanies.join(', ');
  };

  // Excel Export
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const prevBal = Number(finalHisabState.prevBalance) || 0;
      const grossGoods = (summary.grossInventoryAmount || summary.inventoryAmount);
      const totalGoodsPayable = prevBal + grossGoods;
      const totalExp = Number(finalHisabState.expenses) || 0;
      const totalUpad = Number(finalHisabState.withdrawals) || 0;
      const totalRet = summary.totalReturnsAmount || (summary.cancelledAmount + summary.returnsAmount + summary.customerReturnsAmount);
      const finalGoodsPayable = totalGoodsPayable + totalExp - totalUpad - totalRet;
      
      const bankBal = totalBankBalance;
      const meeshoPend = totalMeeshoPending;
      const totalLiquid = bankBal + meeshoPend;
      const netProfit = totalLiquid - finalGoodsPayable;

      // Sheet 1: ફાઈનલ હિસાબ
      const compTitle = getCompanyTitle();

      const finalHisabRows = [
        ['તા. ' + moment(endDate).format('DD.MM.YYYY'), '', '', '', '', '', 'તા. ' + moment(endDate).format('DD.MM.YYYY')],
        [`${compTitle} નો હિસાબ`, '', '', '', '', '', `${compTitle} ના હિસાબનું સરવૈયું ફક્ત નફો જોવા માટે`],
        [`${compTitle} એ લીધેલ માલની એન્ટ્રી`, '', '', '', '', '', `${compTitle} ના બધા બેન્ક ખાતામાં પડેલી રકમ`],
        ['આગળના હિસાબના લેવાના થતાં રૂ.', '', '', '', prevBal, '', `${compTitle} બેંક માં પડેલા રૂ.`, '', '', '', bankBal],
        ['તા.' + moment(startDate).format('DD.MM.YYYY') + ' થી ' + moment(endDate).format('DD.MM.YYYY') + ' સુધી લેવાના થતાં રૂ.', '', '', '', grossGoods, '', 'માં પડેલા રૂ.'],
        ['ટોટલ માલના લેવાના થતાં રૂ.', '', '', '', totalGoodsPayable, '', 'બધા અકાઉન્ટમાં પડેલી ટોટલ રકમ', '', '', '', bankBal],
        [`${compTitle} એ ઉપાડેલા રૂ.`, '', '', '', '', '', 'બધા અકાઉન્ટમાંથી નીકળતી આઉટસ્ટેન્ડીંગ રકમ'],
        ['ટોટલ ઉપાડેલા રૂ.', '', '', '', totalUpad, '', `${compTitle} મીશો / માર્કેટપ્લેસ માંથી લેવાના નીકળતા રૂ.`, '', '', '', meeshoPend],
        ['*ઉપરની એન્ટ્રી ચોપડામાં તેમજ સ્ટેટમેન્ટની ફાઈલમાં વિગત સાથે મુકેલ છે', '', '', '', '', '', ''],
        ['રિટર્ન ની એન્ટ્રી', '', '', '', '', '', 'બધા અકાઉન્ટમાંથી નીકળતી આઉટસ્ટેન્ડીંગ ટોટલ રકમ', '', '', '', meeshoPend],
        ['કુરિયર રીટર્ન (RTO) ના રૂ.', '', '', '', summary.returnsAmount, '', 'અંદાજીત ગોડાઉનમાં પડેલું રીટર્ન', '', '', '', 0],
        ['કસ્ટમર રીટર્ન (' + custReturnPercent + '%) ના રૂ.', '', '', '', summary.customerReturnsAmount, '', 'લેવાનું નીકળતું ટોટલ પેમેન્ટ રૂ.', '', '', '', totalLiquid],
        ['કેન્સલ ઓર્ડર ના રૂ.', '', '', '', summary.cancelledAmount],
        ['ટોટલ રીટર્ન રૂ.', '', '', '', totalRet, '', 'માલના ફાઈનલ લેવાના થતાં રૂ.', '', '', '', finalGoodsPayable],
        ['માલના લેવાના થતાં રૂ.', '', '', '', totalGoodsPayable],
        ['કંપની માટે લાગતો ખર્ચ', '', '', '', totalExp],
        [`${compTitle} એ ઉપાડેલા ટોટલ રૂ.`, '', '', '', totalUpad, '', 'ટોટલ કંપનીનો વધતો નફો.', '', '', '', netProfit, netProfit],
        ['ટોટલ રીટર્ન રૂ.', '', '', '', totalRet],
        ['ફાઈનલ લેવાના થતાં રૂ.', '', '', '', finalGoodsPayable],
        ['', '', '', '', '', '', ''],
        [`${compTitle} ને માલના લેવાના થતાં ફાઈનલ રૂ. (જે આગળના હિસાબમાં લેવા)`, '', '', '', finalGoodsPayable]
      ];

      // Add Company-wise breakdown in Sheet 1 if multiple companies are selected
      if (isMultiCompany) {
        finalHisabRows.push(['', '', '', '', '', '', '']);
        finalHisabRows.push(['--- કંપની-વાઈઝ બેંક અને પેન્ડિંગ વિગત ---', '', '', '', '', '', '']);
        selectedCompanies.forEach(comp => {
          finalHisabRows.push([
            `${comp} બેંક ખાતામાં પડેલા રૂ.`, '', '', '',
            Number(finalHisabState.companyBankBalances?.[comp]) || 0, '',
            `${comp} મીશો / માર્કેટપ્લેસ આઉટસ્ટેન્ડીંગ રૂ.`, '', '', '',
            Number(finalHisabState.companyPendingAmounts?.[comp]) || 0
          ]);
        });
        finalHisabRows.push([
          'ટોટલ બધા બેંક ખાતામાં રકમ', '', '', '', totalBankBalance, '',
          'ટોટલ માર્કેટપ્લેસ આઉટસ્ટેન્ડીંગ', '', '', '', totalMeeshoPending
        ]);
      }

      const wsFinalHisab = XLSX.utils.aoa_to_sheet(finalHisabRows);
      XLSX.utils.book_append_sheet(wb, wsFinalHisab, 'ફાઈનલ હિસાબ');

      // Sheet 2: Summary & Company-wise
      const companyRows = displayedCompanies.map(c => ({
        'Company Name': c.companyName,
        'Dispatched Qty': c.inventoryQty,
        'Goods Amount (₹)': c.inventoryAmount,
        'Print Charge (₹)': c.printCharge,
        'Gross Dispatched (₹)': c.grossInventoryAmount || (c.inventoryAmount + c.printCharge),
        'Cancelled Qty': c.cancelledQty,
        'Cancelled Amount (₹)': c.cancelledAmount,
        'Courier Returns Qty': c.returnsQty,
        'Courier Returns Amount (₹)': c.returnsAmount,
        'Customer Returns Qty': c.customerReturnsQty,
        'Raw Cust Returns (100%) (₹)': c.rawCustomerReturnsAmount,
        [`Customer Returns (${custReturnPercent}%) (₹)`]: c.customerReturnsAmount,
        'Total Deductions (₹)': c.totalReturnsAmount,
        'Net Qty': c.netQty,
        'Net Billing Amount (₹)': c.netAmount,
        'Return Rate %': `${c.returnRatePercent}%`
      }));
      const wsCompanies = XLSX.utils.json_to_sheet(companyRows);
      XLSX.utils.book_append_sheet(wb, wsCompanies, 'Company Summary');

      // Sheet 3: SKU-wise Line Items
      const skuRows = displayedSkus.map(s => ({
        'SKU Code': s.sku,
        'Original Product Name': s.origin,
        'Catalog Size': s.size,
        'Item Rate (₹)': s.itemRate,
        'Dabbi Rate (₹)': s.boxRate,
        'Dispatch Unit Rate (₹)': s.invUnitRate,
        'Cancelled Unit Rate (₹)': s.cancelUnitRate || s.itemRate,
        'Return Unit Rate (₹)': s.retUnitRate,
        'Dispatched Qty': s.inventoryQty,
        'Goods Amount (₹)': s.inventoryAmount,
        'Print Charge (₹)': s.printCharge,
        'Gross Dispatched (₹)': s.grossInventoryAmount,
        'Cancelled Qty': s.cancelledQty,
        'Cancelled Amount (₹)': s.cancelledAmount,
        'Cancel %': `${(s.cancelPercent || 0).toFixed(1)}%`,
        'Courier Returns Qty': s.returnsQty,
        'Courier Returns Amount (₹)': s.returnsAmount,
        'Courier Return %': `${(s.returnPercent || 0).toFixed(1)}%`,
        'Customer Returns Qty': s.customerReturnsQty,
        'Raw Cust Returns (100%) (₹)': s.rawCustomerReturnsAmount,
        [`Customer Returns (${custReturnPercent}%) (₹)`]: s.customerReturnsAmount,
        'Customer Return %': `${(s.custReturnPercent || 0).toFixed(1)}%`,
        'Total Returns Qty': s.totalReturnQty,
        'Total Returns (₹)': s.totalReturnsAmount,
        'Total Return %': `${(s.totalReturnPercent || 0).toFixed(1)}%`,
        'Net Qty': s.netQty,
        'Net Billing (₹)': s.netAmount,
        'Rate Status': s.hasRate ? 'Configured' : 'Missing Rate',
        'Companies': (s.companies || []).join(', ')
      }));
      const wsSkus = XLSX.utils.json_to_sheet(skuRows);
      XLSX.utils.book_append_sheet(wb, wsSkus, 'SKU Details');

      // Sheet 4: Date-wise Breakdown
      const dateRows = (billingData.dateWise || []).map(d => ({
        'Date': d.date,
        'Month': d.month,
        'Dispatched Qty': d.inventoryQty,
        'Goods Amount (₹)': d.inventoryAmount,
        'Print Charge (₹)': d.printCharge,
        'Gross Dispatched (₹)': d.grossInventoryAmount,
        'Cancelled Qty': d.cancelledQty,
        'Cancelled Amount (₹)': d.cancelledAmount,
        'Courier Returns Qty': d.returnsQty,
        'Courier Returns Amount (₹)': d.returnsAmount,
        'Customer Returns Qty': d.customerReturnsQty,
        'Customer Returns Amount (₹)': d.customerReturnsAmount,
        'Total Returns (₹)': d.totalReturnsAmount,
        'Net Qty': d.netQty,
        'Net Amount (₹)': d.netAmount
      }));
      const wsDates = XLSX.utils.json_to_sheet(dateRows);
      XLSX.utils.book_append_sheet(wb, wsDates, 'Date Breakdown');

      const fileCompPrefix = selectedCompanies.length === 0
        ? 'All_Companies'
        : selectedCompanies.join('_').replace(/[^a-zA-Z0-9_-]/g, '');
      const fileName = `Final_Hisab_${fileCompPrefix}_${startDate}_to_${endDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Final hisab exported to Excel!');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export Excel file');
    }
  };

  const { summary } = billingData;
  const totalReturnQty = summary.returnsQty + summary.customerReturnsQty;
  const overallReturnRate = summary.inventoryQty > 0
    ? ((totalReturnQty / summary.inventoryQty) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-5">

      {/* ── TOP CONTROL PANEL ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">

        {/* Row 1: Title + Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow shadow-emerald-500/30 shrink-0">
              <FaMoneyBillWave className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-gray-900 tracking-tight">Reconciliation Billing & Revenue</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold tracking-wide uppercase">Live</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Dispatched = <span className="font-semibold text-gray-600">Rate + Dabbi + ₹{printRate} Print</span>
                <span className="mx-1.5 text-gray-300">·</span>
                Cancelled = <span className="font-semibold text-gray-600">Rate + Dabbi Return</span>
                <span className="mx-1.5 text-gray-300">·</span>
                Returns = <span className="font-semibold text-gray-600">RTO 100% + Cust {custReturnPercent}%</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={fetchBilling}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg transition cursor-pointer"
              title="Refresh calculation"
            >
              <FaSync className={`w-3 h-3 ${loading ? 'animate-spin text-blue-500' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer"
              title="Export complete billing workbook to Excel"
            >
              <FaFileExcel className="w-3 h-3" />
              <span>Export Excel</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFinalHisabOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold rounded-lg shadow-sm shadow-indigo-500/20 transition cursor-pointer"
              title="Open Final Settlement Ledger"
            >
              <FaCalculator className="w-3 h-3" />
              <span>📑 ફાઈનલ હિસાબ</span>
            </button>
          </div>
        </div>

        {/* Row 2: Date Presets + Date Range + Company Filter */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-gray-50/40">
          {/* Date Presets */}
          <div className="flex items-center gap-1 bg-gray-200/60 p-0.5 rounded-lg shrink-0">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'last_7_days', label: 'Last 7 Days' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePreset(p.id)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                  selectedPreset === p.id
                    ? 'bg-white text-blue-700 shadow-sm font-bold'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setSelectedPreset('custom'); }}
              className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <span className="text-gray-300 text-xs font-bold">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setSelectedPreset('custom'); }}
              className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px h-5 bg-gray-200" />

          {/* Company Dropdown */}
          <div className="relative flex-1 max-w-xs" ref={companyDropdownRef}>
            <button
              type="button"
              onClick={() => setIsCompanyDropdownOpen(prev => !prev)}
              className={`w-full px-3 py-1.5 border rounded-lg text-xs font-medium flex items-center justify-between gap-2 bg-white transition cursor-pointer ${
                isCompanyDropdownOpen ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'
              } ${selectedCompanies.length > 0 ? 'text-blue-800 border-blue-300 bg-blue-50/50' : 'text-gray-600'}`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <FaBuilding className={`w-3 h-3 shrink-0 ${selectedCompanies.length > 0 ? 'text-blue-500' : 'text-gray-400'}`} />
                <span className="truncate">
                  {selectedCompanies.length === 0 && `All Companies (${companiesSource.length})`}
                  {selectedCompanies.length === 1 && selectedCompanies[0]}
                  {selectedCompanies.length > 1 && `${selectedCompanies.length} Companies Selected`}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selectedCompanies.length > 0 && (
                  <span onClick={(e) => { e.stopPropagation(); handleClearAllCompanies(); }}
                    className="p-0.5 rounded-full hover:bg-blue-100 text-blue-400 cursor-pointer">
                    <FaTimes className="w-2.5 h-2.5" />
                  </span>
                )}
                {isCompanyDropdownOpen ? <FaChevronUp className="w-2.5 h-2.5 text-gray-400" /> : <FaChevronDown className="w-2.5 h-2.5 text-gray-400" />}
              </div>
            </button>
            {isCompanyDropdownOpen && (
              <div className="absolute left-0 right-0 sm:right-auto sm:w-80 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 p-2.5 space-y-2">
                <div className="relative">
                  <input type="text" value={companySearch} onChange={(e) => setCompanySearch(e.target.value)}
                    placeholder="Search company..." autoFocus
                    className="w-full pl-7 pr-6 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none" />
                  <FaSearch className="w-3 h-3 text-gray-400 absolute left-2.5 top-2.5" />
                  {companySearch && (
                    <button type="button" onClick={() => setCompanySearch('')} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
                      <FaTimes className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 pb-1 border-b border-gray-100">
                  <button type="button" onClick={handleSelectAllCompanies} className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer">Select All ({companiesSource.length})</button>
                  <button type="button" onClick={handleClearAllCompanies} disabled={selectedCompanies.length === 0} className="text-gray-500 hover:text-rose-600 font-medium disabled:opacity-40 cursor-pointer">Clear</button>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-gray-50 pr-1">
                  {filteredDropdownCompanies.length === 0 ? (
                    <div className="py-6 text-center text-gray-400 text-xs">No matching company found</div>
                  ) : (
                    filteredDropdownCompanies.map(comp => {
                      const isSelected = selectedCompanies.includes(comp);
                      return (
                        <label key={comp} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition ${isSelected ? 'bg-blue-50/80 text-blue-900 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleCompany(comp)} className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500" />
                          <span className="truncate flex-1" title={comp}>{comp}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">{selectedCompanies.length === 0 ? 'All companies included' : `${selectedCompanies.length} of ${companiesSource.length} selected`}</span>
                  <button type="button" onClick={() => setIsCompanyDropdownOpen(false)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold cursor-pointer">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Search + Params + Missing Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <FaSearch className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchSku}
              onChange={(e) => setSearchSku(e.target.value)}
              placeholder="Search SKU or Product name…"
              className="w-full pl-8 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50 focus:bg-white transition"
            />
            {searchSku && (
              <button type="button" onClick={() => setSearchSku('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <FaTimes className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Separator */}
          <div className="hidden sm:block w-px h-5 bg-gray-200" />

          {/* Print Rate */}
          <div className="flex items-center gap-1.5 text-xs">
            <FaPrint className="w-3 h-3 text-gray-400" />
            <span className="text-gray-500 font-semibold">Print:</span>
            <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
              <span className="px-1.5 text-gray-400 text-[11px]">₹</span>
              <input
                type="number" step="0.1" min="0" value={printRate}
                onChange={(e) => setPrintRate(Math.max(0, Number(e.target.value) || 0))}
                className="w-12 py-1.5 pr-1 text-xs font-bold text-gray-800 text-center focus:outline-none"
                title="Print charge per dispatched piece"
              />
              <span className="px-1.5 text-gray-400 text-[11px] border-l border-gray-200">/pc</span>
            </div>
          </div>

          {/* Cust Return % */}
          <div className="flex items-center gap-1.5 text-xs">
            <FaUndo className="w-3 h-3 text-gray-400" />
            <span className="text-gray-500 font-semibold">Cust Ret:</span>
            <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
              <input
                type="number" step="1" min="0" max="100" value={custReturnPercent}
                onChange={(e) => setCustReturnPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-10 py-1.5 pl-2 text-xs font-bold text-gray-800 text-center focus:outline-none"
                title="Customer Return deduction %"
              />
              <span className="px-1.5 text-gray-400 text-[11px] border-l border-gray-200">%</span>
            </div>
          </div>

          {/* Separator */}
          <div className="hidden sm:block w-px h-5 bg-gray-200" />

          {/* Missing rates toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-gray-600">
            <input type="checkbox" checked={onlyMissingRates} onChange={(e) => setOnlyMissingRates(e.target.checked)} className="w-3.5 h-3.5 text-amber-500 rounded border-gray-300 focus:ring-amber-500" />
            <span className={onlyMissingRates ? 'text-amber-700 font-bold' : ''}>Missing only</span>
          </label>

          {/* Missing rate badges */}
          {summary.missingRatesCount > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => { setActiveView('sku'); setOnlyMissingRates(true); }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold cursor-pointer hover:bg-amber-100 transition"
              >
                <FaExclamationTriangle className="w-3 h-3 text-amber-500 animate-bounce" />
                {summary.missingRatesCount} Missing
              </button>

              <div className="relative" ref={missingTopDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsMissingTopDropdownOpen(prev => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-50 transition cursor-pointer"
                >
                  <FaDownload className="w-3 h-3" />
                  Download Missing
                  <FaChevronDown className={`w-2.5 h-2.5 transition-transform ${isMissingTopDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isMissingTopDropdownOpen && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">Download Format</div>
                    <button type="button" onClick={() => { downloadMissingSkusExcel('sku'); setIsMissingTopDropdownOpen(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-emerald-50 flex items-start gap-2.5 cursor-pointer">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-[10px]">SKU</div>
                      <div><div className="font-bold text-gray-900">Master SKU Format</div><div className="text-[10px] text-gray-400">SKU, Origin, Size</div></div>
                    </button>
                    <button type="button" onClick={() => { downloadMissingSkusExcel('rate'); setIsMissingTopDropdownOpen(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-purple-50 flex items-start gap-2.5 cursor-pointer">
                      <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 font-bold text-[10px]">₹</div>
                      <div><div className="font-bold text-gray-900">Master Rate Format</div><div className="text-[10px] text-gray-400">Product name, Rate, Dabbi rate</div></div>
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button type="button" onClick={() => { downloadMissingSkusExcel('both'); setIsMissingTopDropdownOpen(false); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 flex items-center gap-2 text-blue-700 font-semibold cursor-pointer">
                      <FaFileExcel className="w-3.5 h-3.5" />
                      Combined (Both Sheets)
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleConfigureMissingSkusInMaster}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition cursor-pointer"
              >
                <FaFileExcel className="w-3 h-3" />
                Configure in Master SKU →
              </button>
            </div>
          )}
        </div>

        {/* Active Company Filter Tags */}
        {selectedCompanies.length > 0 && (
          <div className="px-5 py-2.5 border-t border-gray-100 bg-blue-50/40 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-blue-600 flex items-center gap-1 mr-1">
              <FaFilter className="w-2.5 h-2.5" />
              Filtered:
            </span>
            {selectedCompanies.map(comp => (
              <span key={comp} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white text-blue-800 border border-blue-200 shadow-sm">
                {comp}
                <button type="button" onClick={() => removeCompany(comp)} className="ml-0.5 hover:text-rose-600 cursor-pointer">
                  <FaTimes className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <button type="button" onClick={handleClearAllCompanies} className="text-[11px] text-rose-500 hover:text-rose-700 font-semibold ml-1 hover:underline cursor-pointer">Reset</button>
          </div>
        )}
      </div>

      {/* ── KPI SUMMARY CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

        {/* Dispatched Goods */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 group hover:shadow-md hover:border-emerald-200 transition-all duration-200">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FaBoxOpen className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Dispatched</span>
          </div>
          <div className="text-xl font-black text-gray-900 tracking-tight leading-none">
            {formatINR(summary.grossInventoryAmount || summary.inventoryAmount)}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">{formatQty(summary.inventoryQty)} units</span>
            <span className="text-[11px] text-emerald-600 font-semibold">+₹{printRate}/pc print</span>
          </div>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{width: '100%'}} />
          </div>
        </div>

        {/* Cancelled Orders */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 group hover:shadow-md hover:border-rose-200 transition-all duration-200">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center">
              <FaTimes className="w-4 h-4 text-rose-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">Cancelled</span>
          </div>
          <div className="text-xl font-black text-gray-900 tracking-tight leading-none">
            {formatINR(summary.cancelledAmount)}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">{formatQty(summary.cancelledQty)} units</span>
            <span className="text-[11px] text-rose-600 font-semibold">Rate+Dabbi Return</span>
          </div>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-rose-400 to-rose-600 rounded-full"
              style={{width: summary.inventoryQty > 0 ? `${Math.min(100,(summary.cancelledQty/summary.inventoryQty)*100)}%` : '0%'}} />
          </div>
        </div>

        {/* Courier Returns (RTO) */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 group hover:shadow-md hover:border-amber-200 transition-all duration-200">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <FaUndo className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">RTO</span>
          </div>
          <div className="text-xl font-black text-gray-900 tracking-tight leading-none">
            {formatINR(summary.returnsAmount)}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">{formatQty(summary.returnsQty)} units</span>
            <span className="text-[11px] text-amber-600 font-semibold">100% Ret Rate</span>
          </div>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full"
              style={{width: summary.inventoryQty > 0 ? `${Math.min(100,(summary.returnsQty/summary.inventoryQty)*100)}%` : '0%'}} />
          </div>
        </div>

        {/* Customer Returns */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 group hover:shadow-md hover:border-purple-200 transition-all duration-200">
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
              <FaArrowRight className="w-3.5 h-3.5 text-purple-600 rotate-180" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">Cust. Ret</span>
          </div>
          <div className="text-xl font-black text-gray-900 tracking-tight leading-none">
            {formatINR(summary.customerReturnsAmount)}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">{formatQty(summary.customerReturnsQty)} units</span>
            <span className="text-[11px] text-purple-600 font-bold" title={`Full 100% = ${formatINR(summary.rawCustomerReturnsAmount)}`}>{custReturnPercent}% Policy</span>
          </div>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full"
              style={{width: summary.inventoryQty > 0 ? `${Math.min(100,(summary.customerReturnsQty/summary.inventoryQty)*100)}%` : '0%'}} />
          </div>
        </div>

        {/* Net Revenue — Highlighted */}
        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-2xl p-4 shadow-md shadow-blue-500/20 text-white relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
          <div className="relative">
            <div className="flex items-start justify-between mb-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <FaMoneyBillWave className="w-4 h-4 text-white" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30">
                {overallReturnRate}% Ret
              </span>
            </div>
            <div className="text-[10px] font-semibold text-blue-200 uppercase tracking-wider mb-1">Net Billable Revenue</div>
            <div className="text-2xl font-black text-white tracking-tight leading-none">
              {formatINR(summary.netAmount)}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-blue-200 font-medium">{formatQty(summary.netQty)} net units</span>
              <span className="text-[11px] text-emerald-300 font-bold">Post Deductions</span>
            </div>
          </div>
        </div>

      </div>

      {/* View Switcher Tabs */}
      <div className="bg-white rounded-2xl shadow-xs border border-gray-200/80 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
          <div className="flex items-center gap-1.5 bg-gray-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveView('company')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeView === 'company'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FaBuilding className="w-3.5 h-3.5 text-blue-600" />
              <span>Company-wise ({displayedCompanies.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('date')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeView === 'date'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FaCalendarAlt className="w-3.5 h-3.5 text-emerald-600" />
              <span>Date & Month-wise</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('sku')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeView === 'sku'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FaBoxOpen className="w-3.5 h-3.5 text-purple-600" />
              <span>SKU Line Items ({displayedSkus.length})</span>
            </button>
          </div>

          <div className="text-xs text-gray-500 font-medium">
            Showing records from <span className="font-bold text-gray-800">{moment(startDate).format('DD MMM YYYY')}</span> to <span className="font-bold text-gray-800">{moment(endDate).format('DD MMM YYYY')}</span>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-20 text-center text-gray-500">
            <div className="flex flex-col items-center justify-center space-y-3">
              <FaSync className="animate-spin text-emerald-600 w-8 h-8" />
              <p className="text-sm font-semibold text-gray-700">Calculating Live Billing & Revenue...</p>
              <p className="text-xs text-gray-400">Reconciling inventory, cancels, and returns against Master Rates</p>
            </div>
          </div>
        ) : (
          <>
            {/* VIEW 1: COMPANY-WISE BILLING */}
            {activeView === 'company' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                      <th className="px-5 py-3.5">Company Name</th>
                      <th className="px-4 py-3.5 text-right text-emerald-800">Dispatched (Inv)</th>
                      <th className="px-4 py-3.5 text-right text-rose-800">Cancelled</th>
                      <th className="px-4 py-3.5 text-right text-amber-800">Courier Returns</th>
                      <th className="px-4 py-3.5 text-right text-purple-800">Customer Returns</th>
                      <th className="px-5 py-3.5 text-right text-blue-900 font-black">Net Billing (₹)</th>
                      <th className="px-4 py-3.5 text-center">Return %</th>
                      <th className="px-4 py-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {displayedCompanies.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-12 text-center text-gray-400 font-medium">
                          No company billing records found for the chosen filters.
                        </td>
                      </tr>
                    ) : (
                      displayedCompanies.map((c) => (
                        <tr key={c.companyName} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-gray-900">
                            <div className="flex items-center gap-2">
                              <FaBuilding className="text-gray-400 w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate max-w-[200px]" title={c.companyName}>
                                {c.companyName}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-emerald-700">
                            <div className="font-bold">{formatINR(c.inventoryAmount)}</div>
                            <div className="text-[10px] text-gray-400">{formatQty(c.inventoryQty)} pcs</div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-rose-700">
                            <div className="font-bold">{formatINR(c.cancelledAmount)}</div>
                            <div className="text-[10px] text-gray-400">{formatQty(c.cancelledQty)} pcs</div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-amber-700">
                            <div className="font-bold">{formatINR(c.returnsAmount)}</div>
                            <div className="text-[10px] text-gray-400">{formatQty(c.returnsQty)} pcs</div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-purple-700">
                            <div className="font-bold">{formatINR(c.customerReturnsAmount)}</div>
                            <div className="text-[10px] text-gray-400">{formatQty(c.customerReturnsQty)} pcs</div>
                          </td>
                          <td className="px-5 py-3.5 text-right font-black text-sm text-blue-700 bg-blue-50/20">
                            <div>{formatINR(c.netAmount)}</div>
                            <div className="text-[10px] text-gray-400 font-normal">{formatQty(c.netQty)} pcs net</div>
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                              Number(c.returnRatePercent) > 25
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : Number(c.returnRatePercent) > 15
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {c.returnRatePercent}%
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCompanies([c.companyName]);
                                setActiveView('sku');
                              }}
                              className="px-2.5 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded font-semibold cursor-pointer transition inline-flex items-center gap-1"
                              title="Filter SKUs for this company"
                            >
                              <span>View SKUs</span>
                              <FaArrowRight className="w-2.5 h-2.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {displayedCompanies.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-100/80 font-black text-xs text-gray-900 border-t-2 border-gray-300">
                        <td className="px-5 py-4 uppercase">Total ({displayedCompanies.length} Companies)</td>
                        <td className="px-4 py-4 text-right text-emerald-800">{formatINR(summary.inventoryAmount)}</td>
                        <td className="px-4 py-4 text-right text-rose-800">{formatINR(summary.cancelledAmount)}</td>
                        <td className="px-4 py-4 text-right text-amber-800">{formatINR(summary.returnsAmount)}</td>
                        <td className="px-4 py-4 text-right text-purple-800">{formatINR(summary.customerReturnsAmount)}</td>
                        <td className="px-5 py-4 text-right text-base text-blue-800 bg-blue-100/40">{formatINR(summary.netAmount)}</td>
                        <td className="px-4 py-4 text-center">{overallReturnRate}%</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* VIEW 2: DATE-WISE & MONTH-WISE BILLING */}
            {activeView === 'date' && (
              <div className="p-5 space-y-5">
                {(billingData.monthWise || []).length === 0 ? (
                  <div className="py-12 text-center text-gray-400 font-medium">
                    No daily billing records found in this date range.
                  </div>
                ) : (
                  (billingData.monthWise || []).map(m => {
                    const isExpanded = expandedMonths.has(m.month);
                    const monthDates = (billingData.dateWise || []).filter(d => d.month === m.month);

                    return (
                      <div key={m.month} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
                        {/* Month Header Banner */}
                        <div
                          onClick={() => toggleMonth(m.month)}
                          className="px-5 py-4 bg-gray-50 hover:bg-gray-100/80 cursor-pointer flex items-center justify-between transition select-none"
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <FaChevronDown className="w-3.5 h-3.5 text-gray-500" />
                            ) : (
                              <FaChevronRight className="w-3.5 h-3.5 text-gray-500" />
                            )}
                            <div>
                              <h3 className="font-bold text-sm text-gray-900">
                                {moment(m.month, 'YYYY-MM').format('MMMM YYYY')}
                              </h3>
                              <span className="text-[11px] text-gray-400">
                                {m.daysCount} active days
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 text-xs text-right">
                            <div className="hidden sm:block">
                              <span className="text-gray-400 block text-[10px] font-bold uppercase">Dispatched</span>
                              <span className="font-bold text-emerald-700">{formatINR(m.inventoryAmount)}</span>
                            </div>
                            <div className="hidden md:block">
                              <span className="text-gray-400 block text-[10px] font-bold uppercase">Cancelled</span>
                              <span className="font-bold text-rose-700">{formatINR(m.cancelledAmount)}</span>
                            </div>
                            <div className="hidden sm:block">
                              <span className="text-gray-400 block text-[10px] font-bold uppercase">Returns</span>
                              <span className="font-bold text-amber-700">{formatINR(m.returnsAmount + m.customerReturnsAmount)}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px] font-bold uppercase">Net Month Total</span>
                              <span className="font-black text-sm text-blue-700">{formatINR(m.netAmount)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Month Daily Details Table */}
                        {isExpanded && (
                          <div className="overflow-x-auto border-t border-gray-100">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                  <th className="px-5 py-2.5">Date</th>
                                  <th className="px-4 py-2.5 text-right text-emerald-800">Dispatched (₹)</th>
                                  <th className="px-4 py-2.5 text-right text-rose-800">Cancelled (₹)</th>
                                  <th className="px-4 py-2.5 text-right text-amber-800">Courier Ret (₹)</th>
                                  <th className="px-4 py-2.5 text-right text-purple-800">Customer Ret (₹)</th>
                                  <th className="px-5 py-2.5 text-right text-blue-800 font-bold">Net Total (₹)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {monthDates.map(d => (
                                  <tr key={d.date} className="hover:bg-gray-50/60">
                                    <td className="px-5 py-2.5 font-semibold text-gray-800">
                                      {moment(d.date).format('DD MMM YYYY, ddd')}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">
                                      {formatINR(d.inventoryAmount)}
                                      <span className="text-[10px] text-gray-400 ml-1">({d.inventoryQty})</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-rose-700 font-medium">
                                      {formatINR(d.cancelledAmount)}
                                      <span className="text-[10px] text-gray-400 ml-1">({d.cancelledQty})</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-amber-700 font-medium">
                                      {formatINR(d.returnsAmount)}
                                      <span className="text-[10px] text-gray-400 ml-1">({d.returnsQty})</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-purple-700 font-medium">
                                      {formatINR(d.customerReturnsAmount)}
                                      <span className="text-[10px] text-gray-400 ml-1">({d.customerReturnsQty})</span>
                                    </td>
                                    <td className="px-5 py-2.5 text-right font-black text-blue-700">
                                      {formatINR(d.netAmount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* VIEW 3: SKU-WISE DETAILED LINE ITEMS */}
            {activeView === 'sku' && (
              <div className="overflow-x-auto">
                {summary.missingRatesCount > 0 && (
                  <div className="m-4 p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <FaExclamationTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span className="font-bold text-amber-900">
                          {summary.missingRatesCount} SKUs need product names or rates.
                        </span>
                        <span className="text-amber-700 ml-1">
                          Map them individually below, or download the Excel file to bulk-fill and upload in Master SKU catalog.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Download Missing Dropdown */}
                      <div className="relative" ref={missingBannerDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsMissingBannerDropdownOpen(prev => !prev)}
                          className="px-2.5 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-lg font-semibold hover:bg-amber-100/70 transition flex items-center gap-1.5 shadow-2xs cursor-pointer text-xs"
                          title="Download missing items in Master SKU or Master Rate format"
                        >
                          <FaDownload className="w-3 h-3 text-amber-600" />
                          <span>Download Missing (.xlsx)</span>
                          <FaChevronDown className={`w-2.5 h-2.5 text-amber-600 transition-transform ${isMissingBannerDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isMissingBannerDropdownOpen && (
                          <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 text-left animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3 py-1.5 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                              Select Download Format
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                downloadMissingSkusExcel('sku');
                                setIsMissingBannerDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-emerald-50 flex items-start gap-2.5 transition text-gray-800 cursor-pointer"
                            >
                              <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                                SKU
                              </div>
                              <div>
                                <div className="font-bold text-gray-900">Master SKU Format</div>
                                <div className="text-[10px] text-gray-500">Columns: SKU, Origin, Size (Blanks for empty)</div>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                downloadMissingSkusExcel('rate');
                                setIsMissingBannerDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-xs hover:bg-purple-50 flex items-start gap-2.5 transition text-gray-800 cursor-pointer"
                            >
                              <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                                ₹
                              </div>
                              <div>
                                <div className="font-bold text-gray-900">Master Rate Format</div>
                                <div className="text-[10px] text-gray-500">Columns: original product name, Rate, dabbi rate, Size...</div>
                              </div>
                            </button>

                            <div className="border-t border-gray-100 my-1"></div>

                            <button
                              type="button"
                              onClick={() => {
                                downloadMissingSkusExcel('both');
                                setIsMissingBannerDropdownOpen(false);
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 flex items-center gap-2 transition text-blue-700 font-semibold cursor-pointer"
                            >
                              <FaFileExcel className="w-3.5 h-3.5 text-blue-600" />
                              <span>Combined (Both Sheets in 1 File)</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleConfigureMissingSkusInMaster}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                        title="Download Excel file and go to Master SKU screen"
                      >
                        <FaFileExcel className="w-3 h-3" />
                        <span>Go to Master SKU ➔</span>
                      </button>
                    </div>
                  </div>
                )}
                {/* Customer Return % Range Filter Bar (Custom Inputs + Presets) */}
                <div className="px-4 py-2.5 bg-purple-50/50 border-y border-purple-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-purple-900 font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                      <FaFilter className="w-3 h-3 text-purple-600" />
                      <span>Cust Ret % Filter:</span>
                    </span>

                    {/* Custom Percentage Range Inputs: From [ ]% to [ ]% + Apply Button */}
                    <div className="flex items-center gap-2 bg-white border border-purple-200 rounded-lg px-2.5 py-1 shadow-2xs">
                      <span className="text-[11px] font-semibold text-gray-500">From:</span>
                      <div className="flex items-center border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50 focus-within:bg-white focus-within:border-purple-500 transition">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={custReturnMinInput}
                          onChange={(e) => setCustReturnMinInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setAppliedReturnMin(custReturnMinInput.trim());
                              setAppliedReturnMax(custReturnMaxInput.trim());
                            }
                          }}
                          className="w-12 text-xs font-bold text-gray-800 text-center focus:outline-none bg-transparent"
                          title="Start percentage (Min %)"
                        />
                        <span className="text-[10px] text-gray-400 font-bold ml-0.5">%</span>
                      </div>

                      <span className="text-[11px] font-semibold text-gray-500">To:</span>
                      <div className="flex items-center border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50 focus-within:bg-white focus-within:border-purple-500 transition">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          placeholder="100"
                          value={custReturnMaxInput}
                          onChange={(e) => setCustReturnMaxInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setAppliedReturnMin(custReturnMinInput.trim());
                              setAppliedReturnMax(custReturnMaxInput.trim());
                            }
                          }}
                          className="w-12 text-xs font-bold text-gray-800 text-center focus:outline-none bg-transparent"
                          title="End percentage (Max %)"
                        />
                        <span className="text-[10px] text-gray-400 font-bold ml-0.5">%</span>
                      </div>

                      {/* Apply Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedReturnMin(custReturnMinInput.trim());
                          setAppliedReturnMax(custReturnMaxInput.trim());
                        }}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-[11px] shadow-2xs transition cursor-pointer flex items-center gap-1"
                        title="Click to apply percentage filter (or press Enter)"
                      >
                        <FaFilter className="w-2.5 h-2.5" />
                        <span>Apply</span>
                      </button>

                      {/* Clear Button */}
                      {(appliedReturnMin !== '' || appliedReturnMax !== '' || custReturnMinInput !== '' || custReturnMaxInput !== '') && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustReturnMinInput('');
                            setCustReturnMaxInput('');
                            setAppliedReturnMin('');
                            setAppliedReturnMax('');
                          }}
                          className="px-1.5 py-1 text-gray-400 hover:text-rose-600 rounded cursor-pointer transition text-[11px] font-bold"
                          title="Reset filter"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="inline-flex rounded-lg border border-purple-200 bg-white p-0.5 shadow-2xs">
                      {[
                        { label: 'All', min: null, max: null, badge: custReturnCounts.all },
                        { label: '0–5%', min: 0, max: 5, badge: custReturnCounts['0-5'] },
                        { label: '5–10%', min: 5, max: 10, badge: custReturnCounts['5-10'] },
                        { label: '10–20%', min: 10, max: 20, badge: custReturnCounts['10-20'] },
                        { label: '20–30%', min: 20, max: 30, badge: custReturnCounts['20-30'] },
                        { label: '>30%', min: 30, max: null, badge: custReturnCounts['30+'] }
                      ].map(r => {
                        const active = (r.min === null && r.max === null && appliedReturnMin === '' && appliedReturnMax === '') ||
                          (appliedReturnMin !== '' && Number(appliedReturnMin) === r.min && (
                            (r.max === null && appliedReturnMax === '') || (appliedReturnMax !== '' && Number(appliedReturnMax) === r.max)
                          ));
                        return (
                          <button
                            key={r.label}
                            type="button"
                            onClick={() => {
                              const minStr = r.min !== null ? String(r.min) : '';
                              const maxStr = r.max !== null ? String(r.max) : '';
                              setCustReturnMinInput(minStr);
                              setCustReturnMaxInput(maxStr);
                              setAppliedReturnMin(minStr);
                              setAppliedReturnMax(maxStr);
                            }}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                              active
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'text-gray-600 hover:text-purple-800 hover:bg-purple-50'
                            }`}
                          >
                            <span>{r.label}</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                              active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {r.badge}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="text-[11px] text-purple-900 font-semibold">
                    Showing <span className="font-black text-purple-700">{displayedSkus.length}</span> of {billingData.skuWise?.length || 0} SKUs
                  </div>
                </div>

                {/* Quick Sort Toolbar */}
                <div className="px-4 py-2 bg-gray-50/80 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-500 font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider">
                      <FaSort className="w-3 h-3 text-indigo-500" />
                      <span>Quick Sort:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSkuSort({ field: 'custReturnPercent', order: 'desc' })}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        skuSort.field === 'custReturnPercent' && skuSort.order === 'desc'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50'
                      }`}
                      title="Sort by Highest Customer Return %"
                    >
                      <span>🔥 Highest Cust Ret %</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkuSort({ field: 'custReturnPercent', order: 'asc' })}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        skuSort.field === 'custReturnPercent' && skuSort.order === 'asc'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                      }`}
                      title="Sort by Lowest Customer Return %"
                    >
                      <span>🌿 Lowest Cust Ret %</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkuSort({ field: 'cancelPercent', order: 'desc' })}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        skuSort.field === 'cancelPercent' && skuSort.order === 'desc'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                      }`}
                      title="Sort by highest cancel percentage"
                    >
                      <span>❌ Most Cancelled %</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkuSort({ field: 'inventoryAmount', order: 'desc' })}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        skuSort.field === 'inventoryAmount' && skuSort.order === 'desc'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'
                      }`}
                      title="Sort by highest dispatched amount"
                    >
                      <span>📦 Most Dispatched</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkuSort({ field: 'netAmount', order: 'desc' })}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        skuSort.field === 'netAmount' && skuSort.order === 'desc'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
                      }`}
                      title="Sort by highest net billing total"
                    >
                      <span>💰 Highest Net Total</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-gray-500 font-medium">
                    Click any column header to sort (↑ / ↓)
                  </div>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                      {/* SKU & Product Name */}
                      <th
                        className="px-4 py-3.5 group cursor-pointer select-none hover:bg-gray-100/70 transition-colors"
                        onClick={() => handleSkuSort('sku')}
                        title="Sort by SKU / Product Name"
                      >
                        <div className="flex items-center gap-1">
                          <span>SKU & Product Name</span>
                          {renderSkuSortIcon('sku')}
                        </div>
                      </th>

                      {/* Unit Rates */}
                      <th
                        className="px-3 py-3.5 text-center group cursor-pointer select-none hover:bg-gray-100/70 transition-colors"
                        onClick={() => handleSkuSort('itemRate')}
                        title="Sort by Unit Rate"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Unit Rates</span>
                          {renderSkuSortIcon('itemRate')}
                        </div>
                      </th>

                      {/* Effective Unit */}
                      <th
                        className="px-3 py-3.5 text-center group cursor-pointer select-none hover:bg-gray-100/70 transition-colors"
                        onClick={() => handleSkuSort('invUnitRate')}
                        title="Sort by Effective Invoice Rate"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Effective Unit</span>
                          {renderSkuSortIcon('invUnitRate')}
                        </div>
                      </th>

                      {/* Dispatched */}
                      <th
                        className="px-4 py-3.5 text-right text-emerald-800 group cursor-pointer select-none hover:bg-emerald-50/60 transition-colors"
                        onClick={() => handleSkuSort('inventoryAmount')}
                        title="Sort by Dispatched Amount"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Dispatched (Inv)</span>
                          {renderSkuSortIcon('inventoryAmount')}
                        </div>
                      </th>

                      {/* Cancelled */}
                      <th className="px-3 py-3.5 text-right text-rose-800">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSkuSort('cancelledAmount')}
                            className="inline-flex items-center gap-0.5 hover:text-rose-950 font-bold cursor-pointer"
                            title="Sort by Cancelled Amount (₹)"
                          >
                            <span>Cancelled</span>
                            {renderSkuSortIcon('cancelledAmount')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSkuSort('cancelPercent')}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition cursor-pointer ${
                              skuSort.field === 'cancelPercent'
                                ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            }`}
                            title="Sort by Cancel %"
                          >
                            % {skuSort.field === 'cancelPercent' && (skuSort.order === 'desc' ? '↓' : '↑')}
                          </button>
                        </div>
                      </th>

                      {/* Courier Ret */}
                      <th className="px-3 py-3.5 text-right text-amber-800">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSkuSort('returnsAmount')}
                            className="inline-flex items-center gap-0.5 hover:text-amber-950 font-bold cursor-pointer"
                            title="Sort by Courier Return Amount (₹)"
                          >
                            <span>Courier Ret</span>
                            {renderSkuSortIcon('returnsAmount')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSkuSort('returnPercent')}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition cursor-pointer ${
                              skuSort.field === 'returnPercent'
                                ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            }`}
                            title="Sort by Courier Return %"
                          >
                            % {skuSort.field === 'returnPercent' && (skuSort.order === 'desc' ? '↓' : '↑')}
                          </button>
                        </div>
                      </th>

                      {/* Customer Ret */}
                      <th className="px-3 py-3.5 text-right text-purple-800">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSkuSort('customerReturnsAmount')}
                            className="inline-flex items-center gap-0.5 hover:text-purple-950 font-bold cursor-pointer"
                            title="Sort by Customer Return Amount (₹)"
                          >
                            <span>Customer Ret</span>
                            {renderSkuSortIcon('customerReturnsAmount')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSkuSort('custReturnPercent')}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition cursor-pointer ${
                              skuSort.field === 'custReturnPercent'
                                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            }`}
                            title="Sort by Customer Return %"
                          >
                            % {skuSort.field === 'custReturnPercent' && (skuSort.order === 'desc' ? '↓' : '↑')}
                          </button>
                        </div>
                      </th>

                      {/* Net Total */}
                      <th
                        className="px-5 py-3.5 text-right text-blue-900 font-black group cursor-pointer select-none hover:bg-blue-50/60 transition-colors"
                        onClick={() => handleSkuSort('netAmount')}
                        title="Sort by Net Total Amount (₹)"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Net Total (₹)</span>
                          {renderSkuSortIcon('netAmount')}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs">
                    {displayedSkus.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-12 text-center text-gray-400 font-medium">
                          No matching SKUs found.
                        </td>
                      </tr>
                    ) : (
                      displayedSkus.map(s => (
                        <tr key={s.sku} className="hover:bg-gray-50/80 transition-colors">
                          {/* SKU & Product info */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              {s.imageLink ? (
                                <img
                                  src={s.imageLink}
                                  alt={s.origin}
                                  className="w-10 h-10 object-cover rounded-lg border border-gray-200 shadow-2xs flex-shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">
                                  <FaBoxOpen className="w-4 h-4 opacity-40" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-mono font-bold text-gray-900 truncate max-w-[180px]">
                                  {s.sku}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-[11px] truncate max-w-[130px] ${s.origin === 'Unmapped SKU' ? 'text-rose-500 font-semibold' : 'text-gray-600'}`} title={s.origin}>
                                    {s.origin}
                                  </span>
                                  {s.hasRate ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenQuickMap(s)}
                                        className="text-gray-400 hover:text-indigo-600 p-0.5 cursor-pointer transition-colors"
                                        title="Edit SKU Mapping & Rates in real-time"
                                      >
                                        <FaEdit className="w-2.5 h-2.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onNavigateToOrigin && onNavigateToOrigin(s.origin)}
                                        className="text-blue-500 hover:text-blue-700 p-0.5 cursor-pointer transition-colors"
                                        title="Open Origin in Master Rate File"
                                      >
                                        <FaArrowRight className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenQuickMap(s)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-colors cursor-pointer"
                                      title="Map SKU to Origin & Set Rate in real-time"
                                    >
                                      <FaBolt className="w-2.5 h-2.5 text-yellow-200" />
                                      <span>{s.origin === 'Unmapped SKU' ? 'Map & Rate' : '+ Add Rate'}</span>
                                    </button>
                                  )}
                                </div>
                                {s.size && (
                                  <span className="text-[10px] text-gray-400 block font-medium">
                                    Size: {s.size}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Unit Rates (Rate / Dabbi / Ret Dabbi) */}
                          <td className="px-3 py-3.5 text-center group cursor-pointer" onClick={() => handleOpenQuickMap(s)} title="Click to edit rates in real-time">
                            <div className="space-y-0.5 text-[11px]">
                              <div className="text-gray-700 font-semibold flex items-center justify-center gap-1">
                                <span className="text-[10px] text-gray-400">R:</span>
                                <span>{s.itemRate != null && s.itemRate > 0 ? `₹${s.itemRate}` : <span className="text-rose-500 font-bold">₹0</span>}</span>
                              </div>
                              <div className="text-sky-700 font-medium flex items-center justify-center gap-1">
                                <span className="text-[10px] text-gray-400">D:</span>
                                <span>{s.boxRate != null ? `₹${s.boxRate}` : '—'}</span>
                              </div>
                              <div className="text-purple-700 font-medium flex items-center justify-center gap-1">
                                <span className="text-[10px] text-gray-400">DR:</span>
                                <span>{s.boxReturnRate != null ? `₹${s.boxReturnRate}` : '—'}</span>
                              </div>
                              {(() => {
                                const matchedDabbi = resolveDabbiForSku(s);
                                if (matchedDabbi) {
                                  return (
                                    <div className="text-[10px] text-purple-700 font-semibold truncate max-w-[110px] mx-auto mt-0.5" title={`Dabbi: ${matchedDabbi}`}>
                                      📦 {matchedDabbi}
                                    </div>
                                  );
                                }
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenQuickMap(s);
                                    }}
                                    className="text-[9px] text-amber-600 hover:text-amber-800 font-bold block mx-auto mt-0.5 hover:underline cursor-pointer"
                                    title="Click to configure packaging box for this SKU"
                                  >
                                    Configure your box
                                  </button>
                                );
                              })()}
                            </div>
                            <span className="text-[9px] text-indigo-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity block mt-0.5">
                              ⚡ Edit Rates
                            </span>
                          </td>

                          {/* Effective Unit Rates */}
                          <td className="px-3 py-3.5 text-center text-[11px]">
                            <div className="space-y-1">
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold block" title="Rate + Dabbi">
                                Inv: {formatINR(s.invUnitRate)}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold block" title="Rate + Dabbi Return">
                                Ret: {formatINR(s.retUnitRate)}
                              </span>
                            </div>
                          </td>

                          {/* Dispatched */}
                          <td className="px-4 py-3.5 text-right font-medium text-emerald-700">
                            <div className="font-bold">{formatINR(s.inventoryAmount)}</div>
                            <div className="text-[10px] text-gray-400">{s.inventoryQty} pcs</div>
                          </td>

                          {/* Cancelled */}
                          <td className="px-3 py-3.5 text-right font-medium text-rose-700">
                            <div className="font-bold">{formatINR(s.cancelledAmount)}</div>
                            <div className="flex items-center justify-end gap-1.5 mt-0.5">
                              <span className="text-[10px] text-gray-400">{s.cancelledQty} pcs</span>
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer hover:bg-rose-100 transition"
                                onClick={() => handleSkuSort('cancelPercent')}
                                title="Click to sort by Cancel %"
                              >
                                {(s.cancelPercent || 0).toFixed(1)}%
                              </span>
                            </div>
                          </td>

                          {/* Courier Returns */}
                          <td className="px-3 py-3.5 text-right font-medium text-amber-700">
                            <div className="font-bold">{formatINR(s.returnsAmount)}</div>
                            <div className="flex items-center justify-end gap-1.5 mt-0.5">
                              <span className="text-[10px] text-gray-400">{s.returnsQty} pcs</span>
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer hover:bg-amber-100 transition"
                                onClick={() => handleSkuSort('returnPercent')}
                                title="Click to sort by Courier Return %"
                              >
                                {(s.returnPercent || 0).toFixed(1)}%
                              </span>
                            </div>
                          </td>

                          {/* Customer Returns */}
                          <td className="px-3 py-3.5 text-right font-medium text-purple-700">
                            <div className="font-bold">{formatINR(s.customerReturnsAmount)}</div>
                            <div className="flex items-center justify-end gap-1.5 mt-0.5">
                              <span className="text-[10px] text-gray-400">{s.customerReturnsQty} pcs</span>
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 cursor-pointer hover:bg-purple-100 transition"
                                onClick={() => handleSkuSort('custReturnPercent')}
                                title="Click to sort by Customer Return %"
                              >
                                {(s.custReturnPercent || 0).toFixed(1)}%
                              </span>
                            </div>
                          </td>


                          {/* Net Amount */}
                          <td className="px-5 py-3.5 text-right font-black text-blue-700 bg-blue-50/20">
                            <div>{formatINR(s.netAmount)}</div>
                            <div className="text-[10px] text-gray-400 font-normal">{s.netQty} pcs</div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ફાઈનલ હિસાબ (FINAL SETTLEMENT LEDGER MODAL)                                */}
      {/* ========================================================================= */}
      {isFinalHisabOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] overflow-y-auto flex flex-col">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-t-3xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 text-xs font-bold border border-blue-400/30">
                    ફાઈનલ હિસાબ લેજર
                  </span>
                  <span className="text-xs text-gray-300">
                    તા. {moment(startDate).format('DD.MM.YYYY')} થી {moment(endDate).format('DD.MM.YYYY')}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-1">
                  {getCompanyTitle()} નો ફાઈનલ હિસાબ (Final Settlement)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFinalHisabOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Two Column Settlement Sheet */}
            <div className="p-5 sm:p-6 space-y-6 flex-1 bg-gray-50/50">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* ================= LEFT COLUMN: GOODS SETTLEMENT ================= */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4">
                  <div className="border-b border-gray-100 pb-2.5 flex items-center justify-between">
                    <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                      <span>{getCompanyTitle()} એ લીધેલ માલની એન્ટ્રી (માલનો હિસાબ)</span>
                    </h3>
                    <span className="text-[11px] text-gray-400 font-semibold">{getCompanyTitle()}</span>
                  </div>

                  {/* 1. Previous Balance */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <label className="text-gray-700 font-medium flex-1">
                      આગળના હિસાબના લેવાના થતાં રૂ. (જૂની બાકી):
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 font-semibold">₹</span>
                      <input
                        type="number"
                        value={finalHisabState.prevBalance}
                        onChange={(e) => setFinalHisabState(prev => ({ ...prev, prevBalance: e.target.value }))}
                        className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-gray-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* 2. Dispatched Goods for period */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex-1">
                      <div className="text-gray-700 font-medium">આ વખતના માલના લેવાના થતાં રૂ.:</div>
                      <div className="text-[11px] text-gray-400">
                        માલ: {formatINR(summary.inventoryAmount)} + પ્રિન્ટ ({printRate}/pc): {formatINR(summary.printCharge)}
                      </div>
                    </div>
                    <div className="font-bold text-gray-900 text-sm">
                      {formatINR(summary.grossInventoryAmount || summary.inventoryAmount)}
                    </div>
                  </div>

                  {/* Subtotal Goods */}
                  <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/60 flex items-center justify-between text-xs font-bold text-blue-900">
                    <span>ટોટલ માલના લેવાના થતાં રૂ. (E6):</span>
                    <span className="text-sm font-black">
                      {formatINR((Number(finalHisabState.prevBalance) || 0) + (summary.grossInventoryAmount || summary.inventoryAmount))}
                    </span>
                  </div>

                  {/* Return Breakdowns */}
                  <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
                    <div className="font-bold text-gray-700 text-xs uppercase tracking-wider text-[11px]">
                      રિટર્ન ની એન્ટ્રી (Deductions):
                    </div>
                    
                    <div className="flex items-center justify-between text-amber-800 pl-2">
                      <span>• કુરિયર રીટર્ન (RTO) ના રૂ. (100%):</span>
                      <span className="font-bold">{formatINR(summary.returnsAmount)}</span>
                    </div>

                    <div className="flex items-center justify-between text-purple-800 pl-2">
                      <div>
                        <span>• કસ્ટમર રીટર્ન ({custReturnPercent}%) ના રૂ.:</span>
                        <span className="text-[10px] text-gray-400 ml-1.5">(100%: {formatINR(summary.rawCustomerReturnsAmount)})</span>
                      </div>
                      <span className="font-bold">{formatINR(summary.customerReturnsAmount)}</span>
                    </div>

                    <div className="flex items-center justify-between text-rose-800 pl-2">
                      <span>• કેન્સલ ઓર્ડર ના રૂ. (ડબ્બી વગર):</span>
                      <span className="font-bold">{formatINR(summary.cancelledAmount)}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between text-xs font-bold text-rose-900">
                      <span>ટોટલ રીટર્ન રૂ. (E14):</span>
                      <span className="font-black">-{formatINR(summary.totalReturnsAmount)}</span>
                    </div>
                  </div>

                  {/* Expenses & Withdrawals */}
                  <div className="space-y-2.5 pt-2 border-t border-gray-100 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-gray-700 font-medium flex-1">
                        + કંપની માટે લાગતો ખર્ચ (Expenses):
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 font-semibold">₹</span>
                        <input
                          type="number"
                          value={finalHisabState.expenses}
                          onChange={(e) => setFinalHisabState(prev => ({ ...prev, expenses: e.target.value }))}
                          className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-gray-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label className="text-gray-700 font-medium flex-1">
                        - {getCompanyTitle()} એ ઉપાડેલા રૂ. (Upad / Withdrawn):
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 font-semibold">₹</span>
                        <input
                          type="number"
                          value={finalHisabState.withdrawals}
                          onChange={(e) => setFinalHisabState(prev => ({ ...prev, withdrawals: e.target.value }))}
                          className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-gray-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Final Goods Payable */}
                  {(() => {
                    const totalGoods = (Number(finalHisabState.prevBalance) || 0) + (summary.grossInventoryAmount || summary.inventoryAmount);
                    const finalPayable = totalGoods + (Number(finalHisabState.expenses) || 0) - (Number(finalHisabState.withdrawals) || 0) - summary.totalReturnsAmount;
                    return (
                      <div className={`p-4 rounded-2xl border ${finalPayable >= 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-rose-50 border-rose-300 text-rose-950'} shadow-sm`}>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          {getCompanyTitle()} ને માલના લેવાના થતાં ફાઈનલ રૂ. (જે આગળના હિસાબમાં લેવા)
                        </div>
                        <div className="text-2xl font-black mt-1 flex items-center justify-between">
                          <span>{formatINR(finalPayable)}</span>
                          <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-white/80 shadow-xs">
                            {finalPayable >= 0 ? 'લેવાના નીકળે છે' : 'કંપની તરફથી જમા / ઉપાડ વધુ'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ================= RIGHT COLUMN: PROFITABILITY ANALYSIS ================= */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4">
                  <div className="border-b border-gray-100 pb-2.5 flex items-center justify-between">
                    <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      <span>{getCompanyTitle()} ના હિસાબનું સરવૈયું (ફક્ત નફો જોવા માટે)</span>
                    </h3>
                    <span className="text-[11px] text-gray-400 font-semibold">કંપની નફો</span>
                  </div>

                  {/* 1. Bank Balance */}
                  {isMultiCompany ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                        <div className="flex items-center gap-1.5">
                          <FaBuilding className="text-blue-600 w-3 h-3" />
                          <span>કંપની-વાઈઝ બેંક ખાતામાં પડેલા રૂ. (Bank Accounts):</span>
                        </div>
                        <span className="text-[11px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          કુલ બેંક: {formatINR(totalBankBalance)}
                        </span>
                      </div>
                      <div className="space-y-2 pl-2.5 border-l-2 border-blue-400 bg-blue-50/20 p-2.5 rounded-r-xl">
                        {selectedCompanies.map(comp => (
                          <div key={comp} className="flex items-center justify-between gap-3 text-xs">
                            <label className="text-gray-700 font-medium flex-1 truncate" title={comp}>
                              • <span className="font-bold text-gray-900">{comp}</span> બેંક ખાતામાં રૂ.:
                            </label>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 font-semibold">₹</span>
                              <input
                                type="number"
                                value={finalHisabState.companyBankBalances?.[comp] ?? ''}
                                onChange={(e) => handleCompanyBankBalanceChange(comp, e.target.value)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-gray-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white shadow-2xs"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <label className="text-gray-700 font-medium flex-1">
                        {getCompanyTitle()} બેંક ખાતામાં પડેલા રૂ.:
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 font-semibold">₹</span>
                        <input
                          type="number"
                          value={finalHisabState.bankBalance}
                          onChange={(e) => setFinalHisabState(prev => ({ ...prev, bankBalance: e.target.value }))}
                          className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-gray-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  {/* 2. Meesho Pending Receivable */}
                  {isMultiCompany ? (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                        <div className="flex items-center gap-1.5">
                          <FaMoneyBillWave className="text-purple-600 w-3 h-3" />
                          <span>કંપની-વાઈઝ મીશો / માર્કેટપ્લેસ આઉટસ્ટેન્ડીંગ રૂ. (Pending):</span>
                        </div>
                        <span className="text-[11px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                          કુલ પેન્ડિંગ: {formatINR(totalMeeshoPending)}
                        </span>
                      </div>
                      <div className="space-y-2 pl-2.5 border-l-2 border-purple-400 bg-purple-50/20 p-2.5 rounded-r-xl">
                        {selectedCompanies.map(comp => (
                          <div key={comp} className="flex items-center justify-between gap-3 text-xs">
                            <label className="text-gray-700 font-medium flex-1 truncate" title={comp}>
                              • <span className="font-bold text-gray-900">{comp}</span> મીશો આઉટસ્ટેન્ડીંગ રૂ.:
                            </label>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 font-semibold">₹</span>
                              <input
                                type="number"
                                value={finalHisabState.companyPendingAmounts?.[comp] ?? ''}
                                onChange={(e) => handleCompanyPendingAmountChange(comp, e.target.value)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-gray-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white shadow-2xs"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <label className="text-gray-700 font-medium flex-1">
                        {getCompanyTitle()} મીશો / માર્કેટપ્લેસ માંથી લેવાના નીકળતા આઉટસ્ટેન્ડીંગ રૂ.:
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 font-semibold">₹</span>
                        <input
                          type="number"
                          value={finalHisabState.meeshoPending}
                          onChange={(e) => setFinalHisabState(prev => ({ ...prev, meeshoPending: e.target.value }))}
                          className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-gray-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  {/* Total Liquid Receivables */}
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/60 flex items-center justify-between text-xs font-bold text-emerald-900">
                    <span>લેવાનું નીકળતું ટોટલ પેમેન્ટ રૂ. (Liquid Funds):</span>
                    <span className="text-sm font-black">
                      {formatINR(totalBankBalance + totalMeeshoPending)}
                    </span>
                  </div>

                  {/* Final Goods Liability deduction */}
                  {(() => {
                    const totalGoods = (Number(finalHisabState.prevBalance) || 0) + (summary.grossInventoryAmount || summary.inventoryAmount);
                    const finalPayable = totalGoods + (Number(finalHisabState.expenses) || 0) - (Number(finalHisabState.withdrawals) || 0) - summary.totalReturnsAmount;
                    const totalLiquid = totalBankBalance + totalMeeshoPending;
                    const netProfit = totalLiquid - finalPayable;

                    return (
                      <div className="space-y-4 pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 font-medium">માલના ફાઈનલ લેવાના થતાં રૂ. (Liability):</span>
                          <span className="font-bold text-gray-900">{formatINR(finalPayable)}</span>
                        </div>

                        {/* Net Company Profit */}
                        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-teal-700 text-white shadow-lg space-y-2">
                          <div className="flex items-center justify-between text-xs text-blue-100 font-bold uppercase tracking-wider">
                            <span>ટોટલ કંપનીનો વધતો ચોખ્ખો નફો (Net Company Profit)</span>
                            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-bold">
                              Liquid - Liability
                            </span>
                          </div>
                          <div className="text-3xl font-black tracking-tight">
                            {formatINR(netProfit)}
                          </div>
                          <div className="text-xs text-blue-100/90 pt-1">
                            કંપની પાસે હાથ પર રોકડ/બેંક રકમ ચૂકવવાની થતી માલની જવાબદારી બાદ કર્યા પછી.
                          </div>
                        </div>

                        {/* Helper comparison info */}
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-600 space-y-1">
                          <div className="font-bold text-gray-800">ફાઈનલ હિસાબ ફોર્મ્યુલા (Formula):</div>
                          <div>• Net Profit = (Bank + Meesho Pending) - (Final Goods Payable)</div>
                          <div>• Final Goods = Gross Goods + Expense - Withdrawals - Returns</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 sm:p-5 border-t border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 rounded-b-3xl">
              <div className="text-xs text-gray-500 font-medium">
                આ સેટલમેન્ટ એક્સેલ ફાઈલની <span className="font-bold text-gray-800">`ફાઈનલ હિસાબ`</span> શીટ સાથે ૧૦૦% મેળ ખાય છે.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  <FaFileExcel className="w-3.5 h-3.5" />
                  <span>Export ફાઈનલ હિસાબ Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFinalHisabOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK SKU & RATE CONFIGURATION MODAL (રીઅલ-ટાઇમ રેટ અને મેપિંગ)              */}
      {/* ========================================================================= */}
      {quickMapModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[94vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-600 via-orange-600 to-indigo-900 text-white rounded-t-3xl flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold border border-white/30 flex items-center gap-1">
                    <FaBolt className="w-2.5 h-2.5 text-yellow-300" />
                    <span>Quick SKU & Rate Setup</span>
                  </span>
                  <span className="text-[11px] text-amber-100 font-medium">Real-time update</span>
                </div>
                <h2 className="text-base sm:text-lg font-black tracking-tight mt-1">
                  SKU મેપિંગ & રેટ કન્ફિગરેશન
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setQuickMapModal(prev => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <FaTimes className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Form & Scrollable Body */}
            <form onSubmit={handleSaveQuickMap} className="flex-1 flex flex-col overflow-hidden bg-gray-50/50">
              
              <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
                {/* SKU Info Card */}
                <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-2xs flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Target SKU Code
                    </div>
                    <div className="font-mono text-sm sm:text-base font-black text-gray-900 mt-0.5">
                      {quickMapModal.sku}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      ⚡ Live Sync to Billing
                    </span>
                  </div>
                </div>

                {/* Origin Product Name with Datalist Autocomplete */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-700">
                      Original Product Name (ઓરિજિન આઇટમનું નામ) <span className="text-rose-500">*</span>
                    </label>
                    {quickMapModal.origin && allOriginsList.some(r => (r.origin || '').toLowerCase() === quickMapModal.origin.trim().toLowerCase()) && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        ✓ Existing Origin Matched
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      list="billing-all-origins-datalist"
                      value={quickMapModal.origin}
                      onChange={(e) => handleOriginChange(e.target.value)}
                      placeholder="Type or select Origin Name (e.g. op_868, chokar 7, etc.)"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-none transition shadow-2xs"
                      required
                    />
                    <datalist id="billing-all-origins-datalist">
                      {allOriginsList.map(r => (
                        <option key={r._id || r.origin} value={r.origin}>
                          {r.origin} {r.itemRate != null ? `(₹${r.itemRate} + ₹${r.boxRate || 2.40})` : ''}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Select an existing origin to auto-fill rates or type a new one to create it.
                  </p>
                </div>

                {/* Size & Image Link row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-700">Size (સાઇઝ)</label>
                    <select
                      value={quickMapModal.size || ''}
                      onChange={(e) => setQuickMapModal(prev => ({ ...prev, size: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 focus:ring-1 focus:ring-amber-500 focus:outline-none shadow-2xs"
                    >
                      <option value="">Select Size</option>
                      <option value="Large">Large</option>
                      <option value="Small">Small</option>
                      {quickMapModal.size && !['Large', 'Small'].includes(quickMapModal.size) && (
                        <option value={quickMapModal.size}>{quickMapModal.size}</option>
                      )}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-700">Photo Link (લિંક)</label>
                    <input
                      type="url"
                      value={quickMapModal.imageLink}
                      onChange={(e) => setQuickMapModal(prev => ({ ...prev, imageLink: e.target.value }))}
                      placeholder="https://..."
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:ring-1 focus:ring-amber-500 focus:outline-none shadow-2xs"
                    />
                  </div>
                </div>

                {/* Rate Inputs Grid */}
                <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs space-y-2.5">
                  <div className="text-[11px] font-bold text-gray-800 uppercase tracking-wider flex items-center justify-between border-b border-gray-100 pb-1.5">
                    <span>ભાવની વિગત (Rate Breakdown)</span>
                    <span className="text-[9px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">
                      Billing Formula (હિસાબ નિયમ)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    {/* 1. Item Rate */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-700 block truncate" title="Item Rate (માલનો ભાવ)">
                        માલનો ભાવ (₹) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-xs text-gray-400 font-bold">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={quickMapModal.itemRate}
                          onChange={(e) => setQuickMapModal(prev => ({ ...prev, itemRate: e.target.value }))}
                          placeholder="0.00"
                          className="w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          required
                        />
                      </div>
                      <span className="text-[9px] text-gray-400 block">Item base rate</span>
                    </div>

                    {/* 2. Dabbi Rate */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-sky-800 block truncate" title="Dabbi Rate (બોક્સ રેટ)">
                        ડબ્બી રેટ (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-xs text-gray-400 font-bold">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={quickMapModal.boxRate}
                          onChange={(e) => setQuickMapModal(prev => ({ ...prev, boxRate: e.target.value }))}
                          placeholder="2.40"
                          className="w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs font-bold text-sky-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                        />
                      </div>
                      <span className="text-[9px] text-gray-400 block">Box charge</span>
                    </div>

                    {/* 3. Box Return Rate */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-purple-800 block truncate" title="Return Dabbi Rate (રીટર્ન ડબ્બી)">
                        રીટર્ન ડબ્બી (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-xs text-gray-400 font-bold">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={quickMapModal.boxReturnRate}
                          onChange={(e) => setQuickMapModal(prev => ({ ...prev, boxReturnRate: e.target.value }))}
                          placeholder="2.40"
                          className="w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                      </div>
                      <span className="text-[9px] text-gray-400 block">Return box charge</span>
                    </div>
                  </div>

                  {/* Dabbi Selection / Dropdown */}
                  <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-100">
                    <DabbiSelect
                      company={selectedCompanies?.length === 1 ? selectedCompanies[0] : undefined}
                      value={quickMapModal.dabbi || ''}
                      selectedName={quickMapModal.dabbiName}
                      boxRate={quickMapModal.boxRate}
                      boxReturnRate={quickMapModal.boxReturnRate}
                      size={quickMapModal.size}
                      onChange={(selectedDabbi, isCustom) => {
                        if (selectedDabbi) {
                          setQuickMapModal(prev => ({
                            ...prev,
                            dabbi: selectedDabbi._id,
                            dabbiName: selectedDabbi.name,
                            boxRate: selectedDabbi.boxRate != null ? selectedDabbi.boxRate : prev.boxRate,
                            boxReturnRate: selectedDabbi.boxReturnRate != null ? selectedDabbi.boxReturnRate : prev.boxReturnRate,
                            size: selectedDabbi.size && !prev.size ? selectedDabbi.size : prev.size
                          }));
                        } else if (isCustom) {
                          setQuickMapModal(prev => ({
                            ...prev,
                            dabbi: null,
                            dabbiName: 'Custom'
                          }));
                        } else {
                          setQuickMapModal(prev => ({
                            ...prev,
                            dabbi: null,
                            dabbiName: ''
                          }));
                        }
                      }}
                    />
                  </div>

                  {/* Live Formula Preview */}
                  {(() => {
                    const itm = Number(quickMapModal.itemRate) || 0;
                    const bx = Number(quickMapModal.boxRate) || 0;
                    const rbx = Number(quickMapModal.boxReturnRate) || 0;
                    const inv = itm + bx;
                    const ret = itm + rbx;
                    return (
                      <div className="pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-center text-[10px]">
                        <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                          <div className="text-emerald-700 font-bold uppercase tracking-wider text-[9px]">Dispatched</div>
                          <div className="text-emerald-900 font-black text-xs mt-0.5">₹{inv.toFixed(2)}</div>
                          <div className="text-emerald-600 text-[8px]">(માલ + ડબ્બી)</div>
                        </div>
                        <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200">
                          <div className="text-rose-700 font-bold uppercase tracking-wider text-[9px]">Cancel Unit</div>
                          <div className="text-rose-900 font-black text-xs mt-0.5">₹{(itm + rbx).toFixed(2)}</div>
                          <div className="text-rose-600 text-[8px]">(માલ + રીટર્ન ડબ્બી)</div>
                        </div>
                        <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200">
                          <div className="text-amber-700 font-bold uppercase tracking-wider text-[9px]">Return Unit</div>
                          <div className="text-amber-900 font-black text-xs mt-0.5">₹{ret.toFixed(2)}</div>
                          <div className="text-amber-600 text-[8px]">(માલ + રીટર્ન)</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Effective Mode Toggle */}
                <div className="p-2.5 bg-white rounded-xl border border-gray-200 text-xs flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={quickMapModal.isCorrection}
                      onChange={(e) => setQuickMapModal(prev => ({ ...prev, isCorrection: e.target.checked }))}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                    />
                    <span className="font-semibold text-gray-800 text-[11px]">
                      ચાલુ હિસાબમાં તુરંત લાગુ કરો (Apply directly to billing)
                    </span>
                  </label>
                  {!quickMapModal.isCorrection && (
                    <input
                      type="date"
                      value={quickMapModal.effectiveFromDate}
                      onChange={(e) => setQuickMapModal(prev => ({ ...prev, effectiveFromDate: e.target.value }))}
                      className="px-2 py-0.5 text-xs border border-gray-300 rounded-lg focus:outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Sticky Modal Footer Actions */}
              <div className="p-3.5 bg-white border-t border-gray-200 flex items-center justify-end gap-2 rounded-b-3xl flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setQuickMapModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                  disabled={quickMapModal.saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickMapModal.saving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer disabled:opacity-60"
                >
                  {quickMapModal.saving ? (
                    <>
                      <FaSync className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving & Recalculating...</span>
                    </>
                  ) : (
                    <>
                      <FaBolt className="w-3.5 h-3.5 text-yellow-300" />
                      <span>⚡ Save & Update Billing</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
