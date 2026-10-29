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
  FaDownload,
  FaSave,
  FaHistory,
  FaTrashAlt
} from 'react-icons/fa';
import DabbiSelect from './DabbiSelect';
import { canWriteMasterSku, canWriteMasterRate } from '../lib/constants';

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
    companyPersonalEntry: 0,
    mainCompanyPersonalEntry: 0,
    companyBankBalances: {},
    companyPendingAmounts: {}
  });

  // Final Hisab Snapshot State (Single & Multi Company Saved History)
  const [lastHisabSnapshot, setLastHisabSnapshot] = useState(null);
  const [suggestedHisabSnapshot, setSuggestedHisabSnapshot] = useState(null);
  const [inheritedCompanies, setInheritedCompanies] = useState([]);
  const [extraCompaniesWithoutHistory, setExtraCompaniesWithoutHistory] = useState([]);
  const [loadingLastSnapshot, setLoadingLastSnapshot] = useState(false);
  const [savingHisabSnapshot, setSavingHisabSnapshot] = useState(false);
  const [showHisabHistoryModal, setShowHisabHistoryModal] = useState(false);
  const [hisabHistoryTab, setHisabHistoryTab] = useState('current'); // 'current' or 'all'
  const [hisabHistorySearch, setHisabHistorySearch] = useState('');
  const [hisabSnapshotsList, setHisabSnapshotsList] = useState([]);
  const [relatedHisabSnapshots, setRelatedHisabSnapshots] = useState([]);
  const [loadingHisabList, setLoadingHisabList] = useState(false);

  // Confirmation Modal State for inheriting hisab from previous companies
  const [confirmInheritModal, setConfirmInheritModal] = useState({
    isOpen: false,
    snapshot: null,
    extraCompanies: []
  });

  // Preview & Print Saved Historical Snapshot Modal
  const [previewSnapshotModal, setPreviewSnapshotModal] = useState({
    isOpen: false,
    snapshot: null
  });

  // Project Alert Dialog for deleting snapshot (No browser alert)
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({
    isOpen: false,
    snapshotId: null,
    companyTitle: '',
    dateRange: ''
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
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setCurrentUser(u);
    } catch (e) {
      setCurrentUser(null);
    }
  }, []);

  const canQuickMap = useMemo(() => {
    return Boolean(canWriteMasterSku(currentUser) && canWriteMasterRate(currentUser));
  }, [currentUser]);

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
  const [skuSort, setSkuSort] = useState({ field: 'grossInventoryAmount', order: 'desc' });
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

  const currentScopeKey = useMemo(() => {
    if (!Array.isArray(selectedCompanies) || selectedCompanies.length === 0) return '__ALL__';
    return selectedCompanies.map(c => String(c).trim().toLowerCase()).filter(Boolean).sort().join('||');
  }, [selectedCompanies]);

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
        bankBalance: Math.round(total * 100) / 100
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
        meeshoPending: Math.round(total * 100) / 100
      };
    });
  };

  // Fetch last saved hisab snapshot for current company scope (Single or Multi Company)
  // ONLY runs when:
  // 1. Hisab tab is open (`isFinalHisabOpen`)
  // 2. Companies are selected (`selectedCompanies.length > 0`)
  const fetchLastHisabSnapshot = useCallback(async () => {
    if (!isFinalHisabOpen || !selectedCompanies || selectedCompanies.length === 0) {
      setLastHisabSnapshot(null);
      setSuggestedHisabSnapshot(null);
      setInheritedCompanies([]);
      setExtraCompaniesWithoutHistory([]);
      setLoadingLastSnapshot(false);
      return;
    }

    try {
      setLoadingLastSnapshot(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await axios.get('/api/reconciliation-billing/snapshot', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          selectedCompanies: JSON.stringify(selectedCompanies),
          lastOnly: 'true'
        }
      });

      if (res.data?.success) {
        if (res.data.lastSnapshot) {
          setLastHisabSnapshot(res.data.lastSnapshot);
          setSuggestedHisabSnapshot(null);
          setInheritedCompanies([]);
          setExtraCompaniesWithoutHistory([]);
          const rawVal = Number(res.data.lastSnapshot.finalPayable) || 0;
          setFinalHisabState(prev => ({
            ...prev,
            prevBalance: Math.round(rawVal * 100) / 100
          }));
        } else if (res.data.suggestedSnapshot) {
          // Subset of companies had previous hisab, and ALL extra companies have NO hisab anywhere
          setLastHisabSnapshot(null);
          setSuggestedHisabSnapshot(res.data.suggestedSnapshot);
          setInheritedCompanies(res.data.inheritedCompanies || []);
          setExtraCompaniesWithoutHistory(res.data.extraCompaniesWithoutHistory || []);
          setFinalHisabState(prev => ({
            ...prev,
            prevBalance: 0
          }));
        } else {
          setLastHisabSnapshot(null);
          setSuggestedHisabSnapshot(null);
          setInheritedCompanies([]);
          setExtraCompaniesWithoutHistory([]);
          setFinalHisabState(prev => ({
            ...prev,
            prevBalance: 0
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching last hisab snapshot:', err);
    } finally {
      setLoadingLastSnapshot(false);
    }
  }, [isFinalHisabOpen, selectedCompanies]);

  // Fetch full list of saved snapshots for history drawer/modal (tab: 'current' or 'all')
  const fetchHisabSnapshotsList = useCallback(async (tab = 'current') => {
    try {
      setLoadingHisabList(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const params = tab === 'all'
        ? { allArchive: 'true' }
        : { selectedCompanies: JSON.stringify(selectedCompanies) };

      const res = await axios.get('/api/reconciliation-billing/snapshot', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      if (res.data?.success) {
        setHisabSnapshotsList(res.data.snapshots || []);
        if (tab === 'all') {
          setRelatedHisabSnapshots([]);
        } else {
          setRelatedHisabSnapshots(res.data.relatedSnapshots || []);
          if (res.data.suggestedSnapshot) {
            setSuggestedHisabSnapshot(res.data.suggestedSnapshot);
            setInheritedCompanies(res.data.inheritedCompanies || []);
            setExtraCompaniesWithoutHistory(res.data.extraCompaniesWithoutHistory || []);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching hisab snapshots list:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to load hisab snapshots history');
    } finally {
      setLoadingHisabList(false);
    }
  }, [selectedCompanies]);

  // Confirm and set previous balance from an inherited snapshot
  const handleConfirmInheritSnapshot = (snapshot) => {
    if (!snapshot) return;
    const raw = Number(snapshot.finalPayable) || 0;
    const roundedVal = Math.round(raw * 100) / 100;
    setFinalHisabState(prev => ({
      ...prev,
      prevBalance: roundedVal
    }));
    setConfirmInheritModal({ isOpen: false, snapshot: null, extraCompanies: [] });
    if (showHisabHistoryModal) {
      setShowHisabHistoryModal(false);
    }
    const compTitle = snapshot.companyTitle || (snapshot.selectedCompanies || []).join(' & ');
    toast.success(`✅ ${compTitle} ના અગાઉના હિસાબની રકમ (${formatINR(roundedVal)}) જૂની બાકીમાં સેટ થઈ ગઈ!`);
  };

  // Export any historical snapshot directly to formatted Excel workbook
  const handleExportSnapshotExcel = (snap) => {
    try {
      if (!snap) return;
      const wb = XLSX.utils.book_new();
      const compTitle = snap.companyTitle || (snap.selectedCompanies || []).join(' & ') || 'Company';

      const finalHisabRows = [
        ['તા. ' + moment(snap.endDate).format('DD.MM.YYYY'), '', '', '', '', '', 'તા. ' + moment(snap.endDate).format('DD.MM.YYYY')],
        [`${compTitle} નો હિસાબ`, '', '', '', '', '', `${compTitle} ના હિસાબનું સરવૈયું ફક્ત નફો જોવા માટે`],
        [`${compTitle} એ લીધેલ માલની એન્ટ્રી`, '', '', '', '', '', `${compTitle} ના બધા બેન્ક ખાતામાં પડેલી રકમ`],
        ['આગળના હિસાબના લેવાના થતાં રૂ.', '', '', '', snap.prevBalance || 0, '', `${compTitle} બેંક માં પડેલા રૂ.`, '', '', '', snap.bankBalance || 0],
        ['તા.' + moment(snap.startDate).format('DD.MM.YYYY') + ' થી ' + moment(snap.endDate).format('DD.MM.YYYY') + ' સુધી લેવાના થતાં રૂ.', '', '', '', snap.grossInventoryAmount || 0, '', 'માં પડેલા રૂ.'],
        ['ટોટલ માલના લેવાના થતાં રૂ.', '', '', '', (snap.prevBalance || 0) + (snap.grossInventoryAmount || 0), '', 'બધા અકાઉન્ટમાં પડેલી ટોટલ રકમ', '', '', '', snap.bankBalance || 0],
        [`${compTitle} એ ઉપાડેલા રૂ.`, '', '', '', '', '', 'બધા અકાઉન્ટમાંથી નીકળતી આઉટસ્ટેન્ડીંગ રકમ'],
        ['ટોટલ ઉપાડેલા રૂ.', '', '', '', snap.withdrawals || 0, '', `${compTitle} મીશો / માર્કેટપ્લેસ માંથી લેવાના નીકળતા રૂ.`, '', '', '', snap.meeshoPending || 0],
        ['*ઉપરની એન્ટ્રી ચોપડામાં તેમજ સ્ટેટમેન્ટની ફાઈલમાં વિગત સાથે મુકેલ છે', '', '', '', '', '', ''],
        ['રિટર્ન ની એન્ટ્રી', '', '', '', '', '', 'બધા અકાઉન્ટમાંથી નીકળતી આઉટસ્ટેન્ડીંગ ટોટલ રકમ', '', '', '', snap.meeshoPending || 0],
        ['કુરિયર રીટર્ન (RTO) ના રૂ.', '', '', '', snap.returnsAmount || 0, '', 'અંદાજીત ગોડાઉનમાં પડેલું રીટર્ન', '', '', '', 0],
        ['કસ્ટમર રીટર્ન ના રૂ.', '', '', '', snap.customerReturnsAmount || 0, '', 'લેવાનું નીકળતું ટોટલ પેમેન્ટ રૂ.', '', '', '', (snap.bankBalance || 0) + (snap.meeshoPending || 0)],
        ['કેન્સલ ઓર્ડર ના રૂ.', '', '', '', snap.cancelledAmount || 0],
        ['ટોટલ રીટર્ન રૂ.', '', '', '', snap.totalReturnsAmount || 0, '', 'માલના ફાઈનલ લેવાના થતાં રૂ.', '', '', '', snap.finalPayable || 0],
        ['માલના લેવાના થતાં રૂ.', '', '', '', (snap.prevBalance || 0) + (snap.grossInventoryAmount || 0), '', `ફક્ત નફો ગણવા માટે સબ કંપની (${compTitle}) એ ઉપાડેલી પર્સનલ એન્ટ્રી`, '', '', '', snap.companyPersonalEntry || 0],
        ['કંપની માટે લાગતો ખર્ચ', '', '', '', snap.expenses || 0, '', 'ફક્ત નફો ગણવા માટે મેઈન કંપની એ ઉપાડેલી પર્સનલ એન્ટ્રી', '', '', '', snap.mainCompanyPersonalEntry || 0],
        [`${compTitle} એ ઉપાડેલા ટોટલ રૂ.`, '', '', '', snap.withdrawals || 0, '', 'ટોટલ કંપનીનો વધતો નફો.', '', '', '', snap.netProfit || 0, snap.netProfit || 0],
        ['ટોટલ રીટર્ન રૂ.', '', '', '', snap.totalReturnsAmount || 0],
        ['ફાઈનલ લેવાના થતાં રૂ.', '', '', '', snap.finalPayable || 0],
        ['', '', '', '', '', '', ''],
        [`${compTitle} ને માલના લેવાના થતાં ફાઈનલ રૂ. (જે આગળના હિસાબમાં લેવા)`, '', '', '', snap.finalPayable || 0]
      ];

      if (snap.isMultiCompany && snap.selectedCompanies?.length > 1) {
        finalHisabRows.push(['', '', '', '', '', '', '']);
        finalHisabRows.push(['--- કંપની-વાઈઝ બેંક અને પેન્ડિંગ વિગત ---', '', '', '', '', '', '']);
        const bankObj = snap.companyBankBalances instanceof Map ? Object.fromEntries(snap.companyBankBalances) : (snap.companyBankBalances || {});
        const pendObj = snap.companyPendingAmounts instanceof Map ? Object.fromEntries(snap.companyPendingAmounts) : (snap.companyPendingAmounts || {});
        snap.selectedCompanies.forEach(comp => {
          finalHisabRows.push([
            `${comp} બેંક ખાતામાં પડેલા રૂ.`, '', '', '', bankObj[comp] || 0, '',
            `${comp} મીશો / માર્કેટપ્લેસ આઉટસ્ટેન્ડીંગ રૂ.`, '', '', '', pendObj[comp] || 0
          ]);
        });
        finalHisabRows.push([
          'ટોટલ બધા બેંક ખાતામાં રકમ', '', '', '', snap.bankBalance || 0, '',
          'ટોટલ માર્કેટપ્લેસ આઉટસ્ટેન્ડીંગ', '', '', '', snap.meeshoPending || 0
        ]);
      }

      const wsFinalHisab = XLSX.utils.aoa_to_sheet(finalHisabRows);
      XLSX.utils.book_append_sheet(wb, wsFinalHisab, 'ફાઈનલ હિસાબ');

      const fileCompPrefix = (snap.companyTitle || 'Settlement').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Final_Hisab_${fileCompPrefix}_${snap.startDate}_to_${snap.endDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Exported ${fileName}!`);
    } catch (err) {
      console.error('Error exporting snapshot to Excel:', err);
      toast.error('Failed to export Excel file');
    }
  };

  // Save current hisab as a snapshot
  const handleSaveHisabSnapshot = async (calculatedFinalPayable, calculatedNetProfit) => {
    try {
      setSavingHisabSnapshot(true);
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Session expired, please log in again');
        return;
      }

      const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

      const payload = {
        selectedCompanies,
        companyTitle: getCompanyTitle(),
        startDate,
        endDate,
        grossInventoryAmount: round2(summary.grossInventoryAmount || summary.inventoryAmount || 0),
        inventoryAmount: round2(summary.inventoryAmount || 0),
        printCharge: round2(summary.printCharge || 0),
        printRate: Number(printRate) || 2.4,
        totalReturnsAmount: round2(summary.totalReturnsAmount || 0),
        returnsAmount: round2(summary.returnsAmount || 0),
        customerReturnsAmount: round2(summary.customerReturnsAmount || 0),
        cancelledAmount: round2(summary.cancelledAmount || 0),
        prevBalance: round2(finalHisabState.prevBalance || 0),
        expenses: round2(finalHisabState.expenses || 0),
        withdrawals: round2(finalHisabState.withdrawals || 0),
        finalPayable: round2(calculatedFinalPayable),
        bankBalance: round2(totalBankBalance),
        meeshoPending: round2(totalMeeshoPending),
        companyBankBalances: Object.fromEntries(
          Object.entries(finalHisabState.companyBankBalances || {}).map(([k, v]) => [k, round2(v)])
        ),
        companyPendingAmounts: Object.fromEntries(
          Object.entries(finalHisabState.companyPendingAmounts || {}).map(([k, v]) => [k, round2(v)])
        ),
        companyPersonalEntry: round2(finalHisabState.companyPersonalEntry || 0),
        mainCompanyPersonalEntry: round2(finalHisabState.mainCompanyPersonalEntry || 0),
        netProfit: round2(calculatedNetProfit)
      };

      const res = await axios.post('/api/reconciliation-billing/snapshot', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success && res.data.snapshot) {
        toast.success(`✅ ફાઈનલ હિસાબ સ્નેપશોટ સેવ થઈ ગયો! (₹${calculatedFinalPayable.toLocaleString('en-IN')})`);
        setLastHisabSnapshot(res.data.snapshot);
        fetchHisabSnapshotsList('all');
      }
    } catch (err) {
      console.error('Error saving hisab snapshot:', err);
      toast.error(err.response?.data?.message || 'Failed to save hisab snapshot');
    } finally {
      setSavingHisabSnapshot(false);
    }
  };

  // Open project confirmation dialog to delete snapshot (NO browser alert)
  const handleDeleteSnapshot = (snapshot) => {
    if (!snapshot) return;
    const sId = snapshot._id || snapshot;
    const title = snapshot.companyTitle || (snapshot.selectedCompanies || []).join(' & ') || 'હિસાબ સ્નેપશોટ';
    const dates = snapshot.startDate && snapshot.endDate
      ? `${moment(snapshot.startDate).format('DD/MM/YYYY')} થી ${moment(snapshot.endDate).format('DD/MM/YYYY')}`
      : '';
    setDeleteConfirmModal({
      isOpen: true,
      snapshotId: sId,
      companyTitle: title,
      dateRange: dates
    });
  };

  // Confirmed delete execution using project modal
  const handleDeleteSnapshotConfirmed = async () => {
    const snapshotId = deleteConfirmModal.snapshotId;
    if (!snapshotId) return;

    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`/api/reconciliation-billing/snapshot?id=${snapshotId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        toast.success('સ્નેપશોટ સફળતાપૂર્વક ડિલીટ થઈ ગયો');
        setDeleteConfirmModal({ isOpen: false, snapshotId: null, companyTitle: '', dateRange: '' });
        fetchHisabSnapshotsList('all');
        fetchLastHisabSnapshot();
      }
    } catch (err) {
      console.error('Error deleting snapshot:', err);
      toast.error(err.response?.data?.message || 'Failed to delete snapshot');
    }
  };

  // Auto-fetch last snapshot ONLY when the Final Hisab modal is open AND companies are selected
  useEffect(() => {
    if (isFinalHisabOpen && selectedCompanies && selectedCompanies.length > 0) {
      fetchLastHisabSnapshot();
    } else {
      setLastHisabSnapshot(null);
      setSuggestedHisabSnapshot(null);
      setInheritedCompanies([]);
      setExtraCompaniesWithoutHistory([]);
    }
  }, [isFinalHisabOpen, selectedCompanies, fetchLastHisabSnapshot]);

  // Reset final hisab form state when selected companies change so stale data doesn't persist
  useEffect(() => {
    setFinalHisabState({
      prevBalance: 0,
      expenses: 0,
      withdrawals: 0,
      bankBalance: 0,
      meeshoPending: 0,
      companyPersonalEntry: 0,
      mainCompanyPersonalEntry: 0,
      companyBankBalances: {},
      companyPendingAmounts: {}
    });
  }, [currentScopeKey]);

  // Load all historical snapshots on initial mount and when switching to history tab
  useEffect(() => {
    fetchHisabSnapshotsList('all');
  }, [fetchHisabSnapshotsList]);

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
    if (!canQuickMap) {
      toast.error('Write permissions for both Master SKU and Master Rate are required to use Quick Map.');
      return;
    }
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
    if (!canQuickMap) {
      toast.error('Write permissions for both Master SKU and Master Rate are required to save changes.');
      return;
    }
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

  // Format currency in Indian Rupees with proper 2 decimal places when paise exist
  const formatINR = (val) => {
    const num = Math.round((Number(val) || 0) * 100) / 100;
    const hasDecimals = num % 1 !== 0;
    const absFormatted = Math.abs(num).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: hasDecimals ? 2 : 0
    });
    return (num < 0 ? '-₹' : '₹') + absFormatted;
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

  // SKU Pagination state for ultra-fast DOM rendering on large datasets (e.g. 6 months / 8,000+ SKUs)
  const [skuPage, setSkuPage] = useState(1);
  const [skuPageSize, setSkuPageSize] = useState(50);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setSkuPage(1);
  }, [searchSku, onlyMissingRates, skuSort, appliedReturnMin, appliedReturnMax, selectedCompanies]);

  const totalSkuPages = useMemo(() => {
    if (skuPageSize === 'all') return 1;
    const size = Number(skuPageSize) || 50;
    return Math.max(1, Math.ceil(displayedSkus.length / size));
  }, [displayedSkus.length, skuPageSize]);

  const paginatedSkus = useMemo(() => {
    if (skuPageSize === 'all') return displayedSkus;
    const size = Number(skuPageSize) || 50;
    const start = (skuPage - 1) * size;
    return displayedSkus.slice(start, start + size);
  }, [displayedSkus, skuPage, skuPageSize]);

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

  // Filtered saved snapshots in the history archive / modal
  const displayedSnapshots = useMemo(() => {
    let list = hisabSnapshotsList || [];
    if (!hisabHistorySearch.trim()) return list;
    const q = hisabHistorySearch.trim().toLowerCase();
    return list.filter(snap => {
      const title = (snap.companyTitle || '').toLowerCase();
      const sDate = (snap.startDate || '').toLowerCase();
      const eDate = (snap.endDate || '').toLowerCase();
      const by = (snap.savedByName || '').toLowerCase();
      const comps = (snap.selectedCompanies || []).join(' ').toLowerCase();
      return title.includes(q) || sDate.includes(q) || eDate.includes(q) || by.includes(q) || comps.includes(q);
    });
  }, [hisabSnapshotsList, hisabHistorySearch]);

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

      const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

      const prevBal = round2(finalHisabState.prevBalance);
      const grossGoods = round2(summary.grossInventoryAmount || summary.inventoryAmount);
      const totalGoodsPayable = round2(prevBal + grossGoods);
      const totalExp = round2(finalHisabState.expenses);
      const totalUpad = round2(finalHisabState.withdrawals);
      const totalRet = round2(summary.totalReturnsAmount || (summary.cancelledAmount + summary.returnsAmount + summary.customerReturnsAmount));
      const finalGoodsPayable = round2(totalGoodsPayable + totalExp - totalUpad - totalRet);
      
      const bankBal = round2(totalBankBalance);
      const meeshoPend = round2(totalMeeshoPending);
      const totalLiquid = round2(bankBal + meeshoPend);
      const companyEntry = round2(finalHisabState.companyPersonalEntry);
      const mainCompanyEntry = round2(finalHisabState.mainCompanyPersonalEntry);
      const netProfit = round2((totalLiquid - finalGoodsPayable) + companyEntry + mainCompanyEntry);

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
        ['માલના લેવાના થતાં રૂ.', '', '', '', totalGoodsPayable, '', `ફક્ત નફો ગણવા માટે સબ કંપની (${compTitle}) એ ઉપાડેલી પર્સનલ એન્ટ્રી`, '', '', '', companyEntry],
        ['કંપની માટે લાગતો ખર્ચ', '', '', '', totalExp, '', 'ફક્ત નફો ગણવા માટે મેઈન કંપની એ ઉપાડેલી પર્સનલ એન્ટ્રી', '', '', '', mainCompanyEntry],
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

  const handlePrintFinalHisab = () => {
    window.print();
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
            <a
              href="/settings?tab=companyMapping"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg border border-gray-300 shadow-2xs transition"
              title="કંપની નેમ મેપિંગ ખોલો (Company Aliases & Normalization)"
            >
              <FaBuilding className="w-3 h-3 text-blue-600" />
              <span>🏢 મેપિંગ</span>
            </a>
            <button
              type="button"
              onClick={() => {
                setActiveView('history');
                fetchHisabSnapshotsList('all');
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-amber-50 text-amber-800 text-xs font-bold rounded-lg border border-amber-300 shadow-2xs transition cursor-pointer"
              title="તમામ સેવ થયેલ હિસાબોનું આર્કાઇવ જુઓ, પ્રિન્ટ કરો કે એક્સેલ ડાઉનલોડ કરો"
            >
              <FaHistory className="w-3 h-3 text-amber-600" />
              <span>📜 સેવ હિસાબ આર્કાઇવ ({hisabSnapshotsList.length})</span>
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
            <button
              type="button"
              onClick={() => {
                setActiveView('history');
                fetchHisabSnapshotsList('all');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeView === 'history'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FaHistory className="w-3.5 h-3.5 text-amber-600" />
              <span>Snapshots History ({hisabSnapshotsList.length})</span>
            </button>
          </div>

          <div className="text-xs text-gray-500 font-medium">
            {activeView === 'history' ? (
              <span>કુલ સેવ સ્નેપશોટ: <strong className="text-gray-800">{displayedSnapshots.length}</strong></span>
            ) : (
              <span>Showing records from <strong className="text-gray-800">{moment(startDate).format('DD MMM YYYY')}</strong> to <strong className="text-gray-800">{moment(endDate).format('DD MMM YYYY')}</strong></span>
            )}
          </div>
        </div>

        {/* Loading Spinner */}
        {loading && activeView !== 'history' ? (
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
                      <th className="px-4 py-3.5 text-right text-emerald-800" title={`Dispatched = Rate + Dabbi + ₹${printRate} Print`}>Dispatched (₹)</th>
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
                            <div className="font-bold">{formatINR(c.grossInventoryAmount || (c.inventoryAmount + c.printCharge))}</div>
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
                        <td className="px-4 py-4 text-right text-emerald-800">
                          <div className="font-bold">{formatINR(summary.grossInventoryAmount || summary.inventoryAmount)}</div>
                          {summary.printCharge > 0 && (
                            <div className="text-[10px] text-emerald-600 font-normal">
                              માલ: {formatINR(summary.inventoryAmount)} + પ્રિન્ટ: {formatINR(summary.printCharge)}
                            </div>
                          )}
                        </td>
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
                              <span className="font-bold text-emerald-700">{formatINR(m.grossInventoryAmount || (m.inventoryAmount + m.printCharge))}</span>
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
                                      {formatINR(d.grossInventoryAmount || (d.inventoryAmount + d.printCharge))}
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
                      onClick={() => setSkuSort({ field: 'grossInventoryAmount', order: 'desc' })}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        skuSort.field === 'grossInventoryAmount' && skuSort.order === 'desc'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'
                      }`}
                      title="Sort by highest dispatched amount (includes printing)"
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
                  <div className="flex items-center gap-3">
                    <div className="text-[11px] text-gray-500 font-medium hidden md:block">
                      Click any column header to sort (↑ / ↓)
                    </div>
                    {/* Rows per page selector */}
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1 shadow-2xs">
                      <span className="text-[11px] text-gray-500 font-medium">Show:</span>
                      <select
                        value={skuPageSize}
                        onChange={(e) => {
                          const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                          setSkuPageSize(val);
                          setSkuPage(1);
                        }}
                        className="text-xs font-bold text-gray-800 bg-transparent border-0 outline-none cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                        <option value="all">All ({displayedSkus.length})</option>
                      </select>
                      <span className="text-[11px] text-gray-400">/ page</span>
                    </div>
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
                        onClick={() => handleSkuSort('grossInventoryAmount')}
                        title={`Sort by Dispatched Amount (Includes Rate + Dabbi + ₹${printRate} Print)`}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Dispatched (₹)</span>
                          {renderSkuSortIcon('grossInventoryAmount')}
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
                      paginatedSkus.map(s => (
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
                                        onClick={canQuickMap ? () => handleOpenQuickMap(s) : () => toast.error('Write permissions for both Master SKU and Master Rate are required.')}
                                        className={`p-0.5 transition-colors ${canQuickMap ? 'text-gray-400 hover:text-indigo-600 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}`}
                                        title={canQuickMap ? "Edit SKU Mapping & Rates in real-time" : "Requires Master SKU and Rate write permissions"}
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
                                      onClick={canQuickMap ? () => handleOpenQuickMap(s) : () => toast.error('Write permissions for both Master SKU and Master Rate are required.')}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-2xs transition-colors ${canQuickMap ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                                      title={canQuickMap ? "Map SKU to Origin & Set Rate in real-time" : "Requires Master SKU and Rate write permissions"}
                                    >
                                      <FaBolt className={`w-2.5 h-2.5 ${canQuickMap ? 'text-yellow-200' : 'text-gray-400'}`} />
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
                          <td
                            className={`px-3 py-3.5 text-center group ${canQuickMap ? 'cursor-pointer hover:bg-amber-50/40' : 'cursor-default'}`}
                            onClick={canQuickMap ? () => handleOpenQuickMap(s) : undefined}
                            title={canQuickMap ? "Click to edit rates in real-time" : "Quick Map requires Master SKU and Rate write permissions"}
                          >
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
                                      if (canQuickMap) {
                                        handleOpenQuickMap(s);
                                      } else {
                                        toast.error('Write permissions for both Master SKU and Master Rate are required.');
                                      }
                                    }}
                                    className={`text-[9px] font-bold block mx-auto mt-0.5 ${canQuickMap ? 'text-amber-600 hover:text-amber-800 hover:underline cursor-pointer' : 'text-gray-400 cursor-not-allowed'}`}
                                    title={canQuickMap ? "Click to configure packaging box for this SKU" : "Requires Master SKU and Rate write permissions"}
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
                              <span
                                className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold block"
                                title={`Rate (₹${s.itemRate || 0}) + Dabbi (₹${s.boxRate || 0}) + Print (₹${printRate || 0}) = ₹${((s.invUnitRate || 0) + (printRate || 0)).toFixed(2)}`}
                              >
                                Inv: {formatINR((s.invUnitRate || 0) + (printRate || 0))}
                              </span>
                              <span
                                className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold block"
                                title={`Rate (₹${s.itemRate || 0}) + Return Dabbi (₹${s.boxReturnRate || 0}) = ₹${(s.retUnitRate || 0).toFixed(2)}`}
                              >
                                Ret: {formatINR(s.retUnitRate)}
                              </span>
                            </div>
                          </td>

                          {/* Dispatched */}
                          <td className="px-4 py-3.5 text-right font-medium text-emerald-700">
                            <div className="font-bold">{formatINR(s.grossInventoryAmount || (s.inventoryAmount + (s.printCharge || 0)))}</div>
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
                  {displayedSkus.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-100/80 font-black text-xs text-gray-900 border-t-2 border-gray-300">
                        <td colSpan="3" className="px-4 py-4 uppercase">
                          Total ({displayedSkus.length} SKUs)
                        </td>
                        <td className="px-4 py-4 text-right text-emerald-800">
                          <div className="font-bold">{formatINR(summary.grossInventoryAmount || summary.inventoryAmount)}</div>
                          <div className="text-[10px] text-gray-500 font-normal">{formatQty(summary.inventoryQty)} pcs</div>
                        </td>
                        <td className="px-3 py-4 text-right text-rose-800">
                          <div className="font-bold">{formatINR(summary.cancelledAmount)}</div>
                          <div className="text-[10px] text-gray-500 font-normal">{formatQty(summary.cancelledQty)} pcs</div>
                        </td>
                        <td className="px-3 py-4 text-right text-amber-800">
                          <div className="font-bold">{formatINR(summary.returnsAmount)}</div>
                          <div className="text-[10px] text-gray-500 font-normal">{formatQty(summary.returnsQty)} pcs</div>
                        </td>
                        <td className="px-3 py-4 text-right text-purple-800">
                          <div className="font-bold">{formatINR(summary.customerReturnsAmount)}</div>
                          <div className="text-[10px] text-gray-500 font-normal">{formatQty(summary.customerReturnsQty)} pcs</div>
                        </td>
                        <td className="px-5 py-4 text-right text-base text-blue-800 bg-blue-100/40">
                          <div className="font-black">{formatINR(summary.netAmount)}</div>
                          <div className="text-[10px] text-gray-500 font-normal">{formatQty(summary.netQty)} pcs net</div>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>

                {/* SKU Pagination Footer */}
                {displayedSkus.length > 0 && skuPageSize !== 'all' && totalSkuPages > 1 && (
                  <div className="p-4 border-t border-gray-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs select-none">
                    <div className="text-gray-600 font-medium">
                      Showing <span className="font-bold text-gray-900">{(skuPage - 1) * Number(skuPageSize) + 1}</span> to{' '}
                      <span className="font-bold text-gray-900">{Math.min(skuPage * Number(skuPageSize), displayedSkus.length)}</span> of{' '}
                      <span className="font-bold text-gray-900">{displayedSkus.length.toLocaleString('en-IN')}</span> SKUs
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSkuPage(1)}
                        disabled={skuPage === 1}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed font-semibold transition cursor-pointer text-xs"
                        title="First Page"
                      >
                        « First
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkuPage(prev => Math.max(1, prev - 1))}
                        disabled={skuPage === 1}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed font-semibold transition cursor-pointer text-xs"
                        title="Previous Page"
                      >
                        ‹ Prev
                      </button>

                      <div className="flex items-center gap-1.5 px-2 font-bold text-gray-800 text-xs">
                        <span>Page</span>
                        <input
                          type="number"
                          min="1"
                          max={totalSkuPages}
                          value={skuPage}
                          onChange={(e) => {
                            const p = Number(e.target.value);
                            if (p >= 1 && p <= totalSkuPages) setSkuPage(p);
                          }}
                          className="w-12 text-center py-1 border border-gray-300 rounded font-bold text-indigo-700 bg-gray-50 focus:bg-white outline-none"
                        />
                        <span>of {totalSkuPages}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSkuPage(prev => Math.min(totalSkuPages, prev + 1))}
                        disabled={skuPage === totalSkuPages}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed font-semibold transition cursor-pointer text-xs"
                        title="Next Page"
                      >
                        Next ›
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkuPage(totalSkuPages)}
                        disabled={skuPage === totalSkuPages}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed font-semibold transition cursor-pointer text-xs"
                        title="Last Page"
                      >
                        Last »
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 4: SNAPSHOTS HISTORY (ALL SAVED HISAB ARCHIVE - PRINT, DOWNLOAD, DELETE ONLY) */}
            {activeView === 'history' && (
              <div className="p-4 sm:p-6 space-y-5 bg-white">
                {/* Header Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                  <div>
                    <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                      <FaHistory className="text-amber-600 w-4 h-4" />
                      <span>સેવ કરેલ ફાઈનલ હિસાબ સ્નેપશોટ હિસ્ટ્રી (Saved Snapshots History)</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      અગાઉ સેવ કરેલા તમામ ફાઈનલ હિસાબ પ્રિન્ટ (Print), એક્સેલ ડાઉનલોડ (Download) અથવા ડિલીટ (Delete) કરવા માટે.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {/* Search Bar */}
                    <div className="relative w-64">
                      <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
                      <input
                        type="text"
                        value={hisabHistorySearch}
                        onChange={(e) => setHisabHistorySearch(e.target.value)}
                        placeholder="કંપની નામ, તારીખ કે યુઝર શોધો..."
                        className="w-full pl-8 pr-7 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white"
                      />
                      {hisabHistorySearch && (
                        <button
                          type="button"
                          onClick={() => setHisabHistorySearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          <FaTimes className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Refresh */}
                    <button
                      type="button"
                      disabled={loadingHisabList}
                      onClick={() => fetchHisabSnapshotsList('all')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                      title="રિફ્રેશ કરો"
                    >
                      <FaSync className={`w-3 h-3 ${loadingHisabList ? 'animate-spin text-blue-600' : ''}`} />
                      <span>રિફ્રેશ</span>
                    </button>
                  </div>
                </div>

                {/* Content */}
                {loadingHisabList ? (
                  <div className="py-20 text-center text-gray-500">
                    <FaSync className="animate-spin text-amber-600 w-8 h-8 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-700">સ્નેપશોટ હિસ્ટ્રી લોડ થઈ રહી છે...</p>
                  </div>
                ) : displayedSnapshots.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <FaHistory className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-base font-bold text-gray-700">હજુ સુધી કોઈ હિસાબ સ્નેપશોટ સેવ થયેલ નથી</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                      {hisabHistorySearch
                        ? 'તમારી શોધ મુજબ કોઈ હિસાબ મળ્યો નથી. સર્ચ શબ્દ બદલીને જુઓ.'
                        : 'જ્યારે તમે "ફાઈનલ હિસાબ" માં જઈને "સ્નેપશોટ સેવ કરો" બટન દબાવશો, ત્યારે તમામ હિસાબ કાયમી ધોરણે અહીં સેવ રહેશે.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                          <th className="px-4 py-3.5">કંપની / ગ્રૂપ</th>
                          <th className="px-4 py-3.5">સમયગાળો (Period)</th>
                          <th className="px-4 py-3.5 text-right">માલનો હિસાબ</th>
                          <th className="px-4 py-3.5 text-right">કુલ રીટર્ન</th>
                          <th className="px-4 py-3.5 text-right font-black text-gray-900">ફાઈનલ લેવાના થતાં રૂ.</th>
                          <th className="px-4 py-3.5 text-right">કંપની નફો</th>
                          <th className="px-4 py-3.5 text-center">સેવ કરનાર</th>
                          <th className="px-4 py-3.5 text-center">ક્રિયાઓ (Actions)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {displayedSnapshots.map((snap) => {
                          const compTitle = snap.companyTitle || (snap.selectedCompanies || []).join(' & ') || 'Company';
                          const isMulti = snap.isMultiCompany || (snap.selectedCompanies || []).length > 1;

                          return (
                            <tr key={snap._id} className="hover:bg-amber-50/20 transition group">
                              <td className="px-4 py-3.5 font-bold text-gray-900">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{compTitle}</span>
                                  {isMulti && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                      Multi-Company
                                    </span>
                                  )}
                                </div>
                                {snap.note && (
                                  <div className="text-[11px] text-gray-400 font-normal italic mt-0.5">
                                    {snap.note}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3.5 font-medium text-gray-700 whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <FaCalendarAlt className="text-gray-400 w-3 h-3" />
                                  <span>
                                    {moment(snap.startDate).format('DD/MM/YYYY')} થી {moment(snap.endDate).format('DD/MM/YYYY')}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono text-gray-800">
                                {formatINR(snap.grossInventoryAmount || snap.inventoryAmount)}
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono text-rose-700">
                                -{formatINR(snap.totalReturnsAmount)}
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono font-black text-sm">
                                <span className={snap.finalPayable >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                                  {formatINR(snap.finalPayable)}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono font-bold text-indigo-700">
                                {formatINR(snap.netProfit)}
                              </td>
                              <td className="px-4 py-3.5 text-center text-gray-500 whitespace-nowrap">
                                <div className="font-semibold text-gray-700">{snap.savedByName || 'User'}</div>
                                <div className="text-[10px] text-gray-400">
                                  {moment(snap.createdAt).format('DD/MM/YY, hh:mm A')}
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  {/* 1. PRINT BUTTON */}
                                  <button
                                    type="button"
                                    onClick={() => setPreviewSnapshotModal({ isOpen: true, snapshot: snap })}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition cursor-pointer border border-blue-200 shadow-2xs"
                                    title="આ હિસાબ પ્રિન્ટ કરો (Print Settlement Sheet)"
                                  >
                                    <FaPrint className="w-3 h-3" />
                                    <span>Print</span>
                                  </button>

                                  {/* 2. DOWNLOAD EXCEL BUTTON */}
                                  <button
                                    type="button"
                                    onClick={() => handleExportSnapshotExcel(snap)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition cursor-pointer border border-emerald-200 shadow-2xs"
                                    title="આ હિસાબની એક્સેલ ફાઇલ ડાઉનલોડ કરો (Download Excel)"
                                  >
                                    <FaFileExcel className="w-3 h-3" />
                                    <span>Download</span>
                                  </button>

                                  {/* 3. DELETE BUTTON */}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSnapshot(snap)}
                                    className="flex items-center gap-1 px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition cursor-pointer border border-rose-200"
                                    title="આ સ્નેપશોટ કાયમી ડિલીટ કરો"
                                  >
                                    <FaTrashAlt className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ફાઈનલ હિસાબ (FINAL SETTLEMENT LEDGER MODAL)                                */}
      {/* ========================================================================= */}
      {isFinalHisabOpen && (
        <div className="final-hisab-print-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="final-hisab-print-card bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] overflow-y-auto flex flex-col">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-t-3xl print:rounded-none print:py-3 print:px-4">
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
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => {
                    setHisabHistoryTab('current');
                    setShowHisabHistoryModal(true);
                    fetchHisabSnapshotsList('current');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer border border-white/20 shadow-xs"
                  title="સેવ થયેલ હિસાબ સ્નેપશોટ હિસ્ટ્રી જુઓ"
                >
                  <FaHistory className="w-3.5 h-3.5 text-amber-300" />
                  <span>હિસ્ટ્રી સ્નેપશોટ</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintFinalHisab}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer border border-white/20 shadow-xs"
                  title="Print ફાઈનલ હિસાબ"
                >
                  <FaPrint className="w-3.5 h-3.5 text-blue-300" />
                  <span className="hidden sm:inline">Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFinalHisabOpen(false)}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                >
                  <FaTimes className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Two Column Settlement Sheet */}
            <div className="final-hisab-print-sheet p-5 sm:p-6 space-y-6 flex-1 bg-gray-50/50 print:bg-white print:p-2 print:space-y-4">
              {/* Print Only Header Meta */}
              <div className="hidden print:flex items-center justify-between text-[11px] text-gray-600 pb-2 border-b border-gray-300 font-medium">
                <span>કંપની: <strong className="text-black">{getCompanyTitle()}</strong></span>
                <span>સમયગાળો: <strong>{moment(startDate).format('DD/MM/YYYY')} થી {moment(endDate).format('DD/MM/YYYY')}</strong></span>
                <span>પ્રિન્ટ તારીખ: <strong>{moment().format('DD/MM/YYYY, hh:mm A')}</strong></span>
              </div>

              <div className="final-hisab-print-grid grid grid-cols-1 lg:grid-cols-2 gap-6">
                
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
                  <div className="space-y-1.5 bg-gray-50/70 p-2.5 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex-1">
                        <label className="text-gray-800 font-bold flex items-center gap-1.5">
                          <span>આગળના હિસાબના લેવાના થતાં રૂ. (જૂની બાકી):</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 font-semibold">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={finalHisabState.prevBalance ?? ''}
                          onChange={(e) => setFinalHisabState(prev => ({ ...prev, prevBalance: e.target.value }))}
                          onBlur={() => {
                            if (finalHisabState.prevBalance !== '' && finalHisabState.prevBalance !== undefined && finalHisabState.prevBalance !== null && !isNaN(finalHisabState.prevBalance)) {
                              setFinalHisabState(prev => ({
                                ...prev,
                                prevBalance: Math.round(Number(prev.prevBalance) * 100) / 100
                              }));
                            }
                          }}
                          className="w-36 px-2.5 py-1.5 border border-gray-300 rounded-lg text-right font-bold text-gray-900 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white shadow-2xs"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Last Saved Snapshot Badge & Auto-fill Info */}
                    {loadingLastSnapshot ? (
                      <div className="text-[11px] text-gray-400 flex items-center gap-1">
                        <FaSync className="w-2.5 h-2.5 animate-spin text-blue-500" />
                        <span>છેલ્લો સેવ થયેલ હિસાબ ચેક થઈ રહ્યો છે...</span>
                      </div>
                    ) : lastHisabSnapshot ? (
                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-gray-200/70">
                        <span className="text-gray-600 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                          <span>છેલ્લો હિસાબ: <strong className="text-gray-800 font-mono">{formatINR(lastHisabSnapshot.finalPayable)}</strong></span>
                          <span className="text-gray-400">({moment(lastHisabSnapshot.startDate).format('DD/MM/YY')} થી {moment(lastHisabSnapshot.endDate).format('DD/MM/YY')})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const raw = Number(lastHisabSnapshot.finalPayable) || 0;
                            setFinalHisabState(prev => ({ ...prev, prevBalance: Math.round(raw * 100) / 100 }));
                          }}
                          className="px-2 py-0.5 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold transition text-[10px] cursor-pointer"
                          title="છેલ્લા હિસાબની રકમ અહી સેટ કરો"
                        >
                          આ રકમ લો
                        </button>
                      </div>
                    ) : suggestedHisabSnapshot ? (
                      <div className="pt-2 border-t border-amber-200/70 space-y-1.5 bg-amber-50/70 p-2 rounded-lg">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-amber-900 font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse"></span>
                            <span>અગાઉનો સેવ હિસાબ ({suggestedHisabSnapshot.companyTitle || inheritedCompanies.join(' & ')}): <strong className="font-mono text-amber-950">{formatINR(suggestedHisabSnapshot.finalPayable)}</strong></span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setConfirmInheritModal({
                              isOpen: true,
                              snapshot: suggestedHisabSnapshot,
                              extraCompanies: extraCompaniesWithoutHistory
                            })}
                            className="px-2 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold transition text-[10px] cursor-pointer shadow-2xs"
                            title="આ અગાઉના હિસાબની રકમ લેવા પુષ્ટિ કરો"
                          >
                            આ રકમ લો
                          </button>
                        </div>
                        <div className="text-[10.5px] text-amber-800 flex items-center justify-between gap-1 flex-wrap">
                          <span>
                            {extraCompaniesWithoutHistory.length > 0 ? (
                              <span>નવી કંપની <strong className="text-amber-950 font-bold">{extraCompaniesWithoutHistory.join(', ')}</strong> નો કોઈ જૂનો હિસાબ નથી.</span>
                            ) : (
                              <span>આ ગ્રૂપનો અગાઉનો હિસાબ ઉપલબ્ધ છે.</span>
                            )}
                          </span>
                          <span className="text-amber-700/80">({moment(suggestedHisabSnapshot.startDate).format('DD/MM/YY')} થી {moment(suggestedHisabSnapshot.endDate).format('DD/MM/YY')})</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 italic">
                        {isMultiCompany ? 'આ મલ્ટી-કંપની સિલેક્શન માટે કોઈ અગાઉનો સેવ થયેલ હિસાબ નથી.' : 'આ કંપની માટે કોઈ અગાઉનો સેવ થયેલ હિસાબ નથી.'}
                      </div>
                    )}
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
                      {formatINR(Math.round(((Number(finalHisabState.prevBalance) || 0) + (summary.grossInventoryAmount || summary.inventoryAmount || 0)) * 100) / 100)}
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
                          step="0.01"
                          value={finalHisabState.expenses ?? ''}
                          onChange={(e) => setFinalHisabState(prev => ({ ...prev, expenses: e.target.value }))}
                          onBlur={() => {
                            if (finalHisabState.expenses !== '' && !isNaN(finalHisabState.expenses)) {
                              setFinalHisabState(prev => ({ ...prev, expenses: Math.round(Number(prev.expenses) * 100) / 100 }));
                            }
                          }}
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
                          step="0.01"
                          value={finalHisabState.withdrawals ?? ''}
                          onChange={(e) => setFinalHisabState(prev => ({ ...prev, withdrawals: e.target.value }))}
                          onBlur={() => {
                            if (finalHisabState.withdrawals !== '' && !isNaN(finalHisabState.withdrawals)) {
                              setFinalHisabState(prev => ({ ...prev, withdrawals: Math.round(Number(prev.withdrawals) * 100) / 100 }));
                            }
                          }}
                          className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-right font-bold text-gray-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Final Goods Payable */}
                  {(() => {
                    const totalGoods = Math.round(((Number(finalHisabState.prevBalance) || 0) + (summary.grossInventoryAmount || summary.inventoryAmount || 0)) * 100) / 100;
                    const finalPayable = Math.round((totalGoods + (Number(finalHisabState.expenses) || 0) - (Number(finalHisabState.withdrawals) || 0) - (summary.totalReturnsAmount || 0)) * 100) / 100;
                    const totalLiquid = Math.round((totalBankBalance + totalMeeshoPending) * 100) / 100;
                    const companyEntry = Number(finalHisabState.companyPersonalEntry) || 0;
                    const mainCompanyEntry = Number(finalHisabState.mainCompanyPersonalEntry) || 0;
                    const netProfit = Math.round(((totalLiquid - finalPayable) + companyEntry + mainCompanyEntry) * 100) / 100;

                    return (
                      <div className={`p-4 rounded-2xl border ${finalPayable >= 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-rose-50 border-rose-300 text-rose-950'} shadow-sm space-y-2.5`}>
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                            {getCompanyTitle()} ને માલના લેવાના થતાં ફાઈનલ રૂ. (જે આગળના હિસાબમાં લેવા)
                          </div>
                          <button
                            type="button"
                            disabled={savingHisabSnapshot}
                            onClick={() => handleSaveHisabSnapshot(finalPayable, netProfit)}
                            className="no-print flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                            title="આ ફાઈનલ હિસાબનો સ્નેપશોટ સેવ કરો"
                          >
                            {savingHisabSnapshot ? <FaSync className="w-3 h-3 animate-spin" /> : <FaSave className="w-3 h-3" />}
                            <span>સ્નેપશોટ સેવ કરો</span>
                          </button>
                        </div>
                        <div className="text-2xl font-black flex items-center justify-between">
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
                                step="0.01"
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
                          step="0.01"
                          value={finalHisabState.bankBalance ?? ''}
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
                                step="0.01"
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
                          step="0.01"
                          value={finalHisabState.meeshoPending ?? ''}
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

                  {/* Final Goods Liability deduction & Personal Entries */}
                  {(() => {
                    const totalGoods = Math.round(((Number(finalHisabState.prevBalance) || 0) + (summary.grossInventoryAmount || summary.inventoryAmount || 0)) * 100) / 100;
                    const finalPayable = Math.round((totalGoods + (Number(finalHisabState.expenses) || 0) - (Number(finalHisabState.withdrawals) || 0) - (summary.totalReturnsAmount || 0)) * 100) / 100;
                    const totalLiquid = Math.round((totalBankBalance + totalMeeshoPending) * 100) / 100;
                    const companyEntry = Number(finalHisabState.companyPersonalEntry) || 0;
                    const mainCompanyEntry = Number(finalHisabState.mainCompanyPersonalEntry) || 0;
                    const netProfit = Math.round(((totalLiquid - finalPayable) + companyEntry + mainCompanyEntry) * 100) / 100;

                    return (
                      <div className="space-y-3.5 pt-3 border-t border-gray-100">
                        {/* 1. Final Goods Liability */}
                        <div className="flex items-center justify-between text-xs bg-gray-50/80 p-2.5 rounded-xl border border-gray-200">
                          <span className="text-gray-700 font-semibold">માલના ફાઈનલ લેવાના થતાં રૂ. (Liability):</span>
                          <span className="font-bold text-gray-900">{formatINR(finalPayable)}</span>
                        </div>

                        {/* 2. Sub Company Personal Entry */}
                        <div className="flex items-center justify-between gap-3 text-xs bg-amber-50/40 p-2.5 rounded-xl border border-amber-200/60">
                          <label className="text-gray-800 font-medium flex-1">
                            ફક્ત નફો ગણવા માટે સબ કંપની ({getCompanyTitle()}) એ ઉપાડેલી પર્સનલ એન્ટ્રી:
                          </label>
                          <div className="flex items-center gap-1">
                            <span className="text-amber-600 font-semibold">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              value={finalHisabState.companyPersonalEntry ?? ''}
                              onChange={(e) => setFinalHisabState(prev => ({ ...prev, companyPersonalEntry: e.target.value }))}
                              className="w-28 px-2 py-1 border border-amber-300 rounded-lg text-right font-bold text-gray-900 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none bg-white shadow-2xs"
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {/* 3. Main Company Personal Entry */}
                        <div className="flex items-center justify-between gap-3 text-xs bg-amber-50/40 p-2.5 rounded-xl border border-amber-200/60">
                          <label className="text-gray-800 font-medium flex-1">
                            ફક્ત નફો ગણવા માટે મેઈન કંપની એ ઉપાડેલી પર્સનલ એન્ટ્રી:
                          </label>
                          <div className="flex items-center gap-1">
                            <span className="text-amber-600 font-semibold">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              value={finalHisabState.mainCompanyPersonalEntry ?? ''}
                              onChange={(e) => setFinalHisabState(prev => ({ ...prev, mainCompanyPersonalEntry: e.target.value }))}
                              className="w-28 px-2 py-1 border border-amber-300 rounded-lg text-right font-bold text-gray-900 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none bg-white shadow-2xs"
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {/* Net Company Profit Card */}
                        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-teal-700 text-white shadow-lg space-y-2">
                          <div className="flex items-center justify-between text-xs text-blue-100 font-bold uppercase tracking-wider">
                            <span>ટોટલ કંપનીનો વધતો ચોખ્ખો નફો (Net Company Profit)</span>
                            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                              Liquid - Liability + Personal
                            </span>
                          </div>
                          <div className="text-3xl font-black tracking-tight">
                            {formatINR(netProfit)}
                          </div>
                          <div className="text-xs text-blue-100/90 pt-1">
                            કંપની પાસે હાથ પર રોકડ/બેંક રકમ ચૂકવવાની થતી માલની જવાબદારી બાદ કર્યા પછી + પર્સનલ ઉપાડ ઉમેરીને.
                          </div>
                        </div>

                        {/* Helper comparison info */}
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-600 space-y-1">
                          <div className="font-bold text-gray-800">ફાઈનલ હિસાબ ફોર્મ્યુલા (Formula):</div>
                          <div>• Net Profit = (Liquid Funds - Final Goods Liability) + સબ કંપની પર્સનલ એન્ટ્રી + મેઈન કંપની પર્સનલ એન્ટ્રી</div>
                          <div>• Final Goods = Gross Goods + Expense - Withdrawals - Returns</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 sm:p-5 border-t border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 rounded-b-3xl no-print">
              <div className="text-xs text-gray-500 font-medium">
                આ સેટલમેન્ટ એક્સેલ ફાઈલની <span className="font-bold text-gray-800">`ફાઈનલ હિસાબ`</span> શીટ સાથે ૧૦૦% મેળ ખાય છે.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingHisabSnapshot}
                  onClick={() => {
                    const totalGoods = Math.round(((Number(finalHisabState.prevBalance) || 0) + (summary.grossInventoryAmount || summary.inventoryAmount || 0)) * 100) / 100;
                    const calculatedFinalPayable = Math.round((totalGoods + (Number(finalHisabState.expenses) || 0) - (Number(finalHisabState.withdrawals) || 0) - (summary.totalReturnsAmount || 0)) * 100) / 100;
                    const totalLiquid = Math.round((totalBankBalance + totalMeeshoPending) * 100) / 100;
                    const companyEntry = Number(finalHisabState.companyPersonalEntry) || 0;
                    const mainCompanyEntry = Number(finalHisabState.mainCompanyPersonalEntry) || 0;
                    const calculatedNetProfit = Math.round(((totalLiquid - calculatedFinalPayable) + companyEntry + mainCompanyEntry) * 100) / 100;
                    handleSaveHisabSnapshot(calculatedFinalPayable, calculatedNetProfit);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                  title="સેવ સ્નેપશોટ"
                >
                  {savingHisabSnapshot ? <FaSync className="w-3.5 h-3.5 animate-spin" /> : <FaSave className="w-3.5 h-3.5" />}
                  <span>Save Snapshot</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintFinalHisab}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  <FaPrint className="w-3.5 h-3.5" />
                  <span>Print ફાઈનલ હિસાબ</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
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
      {/* FINAL HISAB SNAPSHOTS HISTORY & ARCHIVE MODAL (SINGLE & MULTI COMPANY)      */}
      {/* ========================================================================= */}
      {showHisabHistoryModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col gap-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-t-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center">
                    <FaHistory className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <span>સેવ થયેલ ફાઈનલ હિસાબ સ્નેપશોટ હિસ્ટ્રી & આર્કાઇવ</span>
                    </h3>
                    <p className="text-xs text-gray-300">
                      {hisabHistoryTab === 'current' ? (
                        <span>સ્કોપ: <strong className="text-amber-300">{getCompanyTitle()}</strong> ({isMultiCompany ? 'મલ્ટી-કંપની ગ્રૂપ' : 'સિંગલ કંપની'})</span>
                      ) : (
                        <span className="text-emerald-300">તમામ અધિકૃત કંપનીઓનો સેવ હિસાબ રેકોર્ડ (All Company Archive)</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHisabHistoryModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                >
                  <FaTimes className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs Switcher and Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                {/* Tabs */}
                <div className="flex items-center bg-black/30 p-1 rounded-xl border border-white/10 self-start">
                  <button
                    type="button"
                    onClick={() => {
                      setHisabHistoryTab('current');
                      fetchHisabSnapshotsList('current');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      hisabHistoryTab === 'current'
                        ? 'bg-white text-indigo-950 shadow-xs'
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>વર્તમાન સિલેક્શન હિસ્ટ્રી</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHisabHistoryTab('all');
                      fetchHisabSnapshotsList('all');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      hisabHistoryTab === 'all'
                        ? 'bg-white text-indigo-950 shadow-xs'
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>📜 તમામ હિસાબ આર્કાઇવ</span>
                  </button>
                </div>

                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
                  <input
                    type="text"
                    value={hisabHistorySearch}
                    onChange={(e) => setHisabHistorySearch(e.target.value)}
                    placeholder="કંપની નામ, તારીખ કે યુઝર..."
                    className="w-full pl-8 pr-7 py-1.5 bg-white/10 border border-white/20 rounded-xl text-xs text-white placeholder-gray-400 focus:outline-none focus:bg-white/20 focus:border-white/40"
                  />
                  {hisabHistorySearch && (
                    <button
                      type="button"
                      onClick={() => setHisabHistorySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <FaTimes className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* List */}
            <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3.5 bg-gray-50/50">
              {loadingHisabList ? (
                <div className="py-16 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
                  <FaSync className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="font-semibold text-gray-600">સ્નેપશોટ લોડ થઈ રહ્યા છે...</span>
                </div>
              ) : (
                <>
                  {/* Related Subsets Notice on 'current' tab */}
                  {hisabHistoryTab === 'current' && relatedHisabSnapshots.length > 0 && (
                    <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-300 shadow-2xs space-y-2">
                      <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                        <FaExclamationTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>સંબંધિત કંપનીઓ / જૂથનો અગાઉનો સેવ હિસાબ (Inheritable Group History)</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        વર્તમાન સિલેક્શનમાં નવી કંપની ઉમેરાઈ હોય અને તેનો અગાઉ કોઈ હિસાબ ન હોય, તો તમે જૂની કંપનીઓનો છેલ્લો સેવ હિસાબ કન્ફર્મેશન સાથે &apos;જૂની બાકી&apos; તરીકે લઈ શકો છો:
                      </p>
                      <div className="space-y-2 pt-1">
                        {relatedHisabSnapshots.map(relSnap => (
                          <div
                            key={relSnap._id}
                            className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                          >
                            <div>
                              <div className="text-xs font-black text-gray-900">
                                {relSnap.companyTitle || (relSnap.selectedCompanies || []).join(' & ')}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                સમયગાળો: {moment(relSnap.startDate).format('DD.MM.YY')} થી {moment(relSnap.endDate).format('DD.MM.YY')} | સેવ: {moment(relSnap.createdAt).format('DD.MM.YY')}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-xs font-black font-mono text-emerald-700">
                                {formatINR(relSnap.finalPayable)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setPreviewSnapshotModal({ isOpen: true, snapshot: relSnap })}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                                title="Print view"
                              >
                                <FaPrint className="w-3 h-3 text-blue-600" />
                                <span>Print</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExportSnapshotExcel(relSnap)}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                                title="Excel export"
                              >
                                <FaFileExcel className="w-3 h-3 text-emerald-600" />
                                <span>Excel</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmInheritModal({
                                  isOpen: true,
                                  snapshot: relSnap,
                                  extraCompanies: extraCompaniesWithoutHistory
                                })}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer shadow-2xs"
                              >
                                આ રકમ જૂની બાકી તરીકે લો
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Main Snapshots list */}
                  {displayedSnapshots.length === 0 ? (
                    <div className="py-14 text-center text-gray-400 text-xs">
                      <p className="font-semibold text-gray-600 text-sm">કોઈ સ્નેપશોટ મળ્યો નથી</p>
                      <p className="text-gray-400 mt-1">
                        {hisabHistorySearch
                          ? 'તમારી શોધ મુજબ કોઈ હિસાબ મળ્યો નથી. સર્ચ શબ્દ બદલીને જુઓ.'
                          : hisabHistoryTab === 'current' && (!selectedCompanies || selectedCompanies.length === 0)
                            ? 'કૃપા કરીને હિસાબ હિસ્ટ્રી જોવા માટે કોઈ ચોક્કસ કંપની સિલેક્ટ કરો, અથવા "📜 તમામ હિસાબ આર્કાઇવ" ટેબ પસંદ કરો.'
                            : 'ફાઈનલ હિસાબ મોડલમાં "Save Snapshot" બટન પર ક્લિક કરવાથી અહીં રેકોર્ડ સેવ રહેશે.'}
                      </p>
                    </div>
                  ) : (
                    displayedSnapshots.map((snap, idx) => (
                      <div
                        key={snap._id}
                        className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs hover:border-blue-300 transition space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-gray-900">
                                #{displayedSnapshots.length - idx} {snap.companyTitle || 'કંપની'}
                              </span>
                              <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                                {moment(snap.startDate).format('DD.MM.YYYY')} થી {moment(snap.endDate).format('DD.MM.YYYY')}
                              </span>
                              {idx === 0 && hisabHistoryTab === 'current' && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full">
                                  છેલ્લો સેટ હિસાબ
                                </span>
                              )}
                              {snap.isMultiCompany && (
                                <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                                  મલ્ટી-કંપની ({snap.selectedCompanies?.length || 0})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">
                              સેવ તારીખ: {moment(snap.createdAt).format('DD/MM/YYYY, hh:mm A')} {snap.savedByName ? `(By: ${snap.savedByName})` : ''}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] text-gray-500 font-semibold uppercase">માલના લેવાના ફાઈનલ રૂ.</div>
                            <div className="text-lg font-black font-mono text-emerald-700">
                              {formatINR(snap.finalPayable)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-100 text-[11px]">
                          <div>
                            <span className="text-gray-400">જૂની બાકી:</span>
                            <div className="font-bold text-gray-700">{formatINR(snap.prevBalance)}</div>
                          </div>
                          <div>
                            <span className="text-gray-400">નવો માલ:</span>
                            <div className="font-bold text-gray-700">{formatINR(snap.grossInventoryAmount)}</div>
                          </div>
                          <div>
                            <span className="text-gray-400">કુલ રીટર્ન:</span>
                            <div className="font-bold text-rose-600">-{formatINR(snap.totalReturnsAmount)}</div>
                          </div>
                          <div>
                            <span className="text-gray-400">ચોખ્ખો નફો:</span>
                            <div className="font-bold text-indigo-700">{formatINR(snap.netProfit)}</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => setPreviewSnapshotModal({ isOpen: true, snapshot: snap })}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition cursor-pointer"
                            title="આ હિસાબને જુઓ અને Print કરો"
                          >
                            <FaPrint className="w-3 h-3 text-blue-600" />
                            <span>Print હિસાબ</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportSnapshotExcel(snap)}
                            className="flex items-center gap-1 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition cursor-pointer"
                            title="આ હિસાબને Excel માં ડાઉનલોડ કરો"
                          >
                            <FaFileExcel className="w-3 h-3 text-emerald-600" />
                            <span>Export Excel</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const r = Number(snap.finalPayable) || 0;
                              const roundedVal = Math.round(r * 100) / 100;
                              if (snap.scopeKey && snap.scopeKey !== currentScopeKey) {
                                // Subset or different scope -> ask confirmation
                                setConfirmInheritModal({
                                  isOpen: true,
                                  snapshot: snap,
                                  extraCompanies: extraCompaniesWithoutHistory
                                });
                              } else {
                                setFinalHisabState(prev => ({
                                  ...prev,
                                  prevBalance: roundedVal
                                }));
                                setShowHisabHistoryModal(false);
                                toast.success(`આ સ્નેપશોટની રકમ (${formatINR(roundedVal)}) આગળના હિસાબની જૂની બાકીમાં સેટ થઈ ગઈ!`);
                              }
                            }}
                            className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            આ રકમ નવી જૂની બાકી તરીકે લો
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSnapshot(snap)}
                            className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition cursor-pointer"
                            title="Delete snapshot"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-gray-200 bg-white flex items-center justify-between">
              <div className="text-xs text-gray-500">
                કુલ દર્શાવેલ રેકોર્ડ: <strong className="text-gray-900">{displayedSnapshots.length}</strong>
              </div>
              <button
                type="button"
                onClick={() => setShowHisabHistoryModal(false)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONFIRM INHERITING PREVIOUS HISAB BALANCE MODAL                            */}
      {/* ========================================================================= */}
      {confirmInheritModal.isOpen && confirmInheritModal.snapshot && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-amber-300 w-full max-w-lg overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-amber-200 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
                <FaExclamationTriangle className="w-5 h-5 text-amber-200" />
              </div>
              <div>
                <h3 className="text-base font-black">અગાઉના હિસાબની રકમ લેવા અંગે કન્ફર્મેશન</h3>
                <p className="text-xs text-amber-100">જૂની કંપનીઓનો છેલ્લો હિસાબ વર્તમાન જૂથમાં લેવો</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs text-gray-700 bg-amber-50/30">
              <p className="leading-relaxed text-gray-800">
                વર્તમાન બિલિંગ ગ્રૂપમાં નવી કંપનીઓ શામેલ છે જેનો અગાઉ કોઈ અલગ હિસાબ સેવ થયેલ નથી. તમે અગાઉની કંપનીઓનો છેલ્લો હિસાબ પસંદ કરી રહ્યા છો:
              </p>

              <div className="bg-white p-3.5 rounded-2xl border border-amber-200 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">અગાઉનો સેવ હિસાબ:</span>
                  <span className="font-bold text-gray-900">{confirmInheritModal.snapshot.companyTitle}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">સમયગાળો:</span>
                  <span className="font-bold text-gray-800">
                    {moment(confirmInheritModal.snapshot.startDate).format('DD/MM/YYYY')} થી {moment(confirmInheritModal.snapshot.endDate).format('DD/MM/YYYY')}
                  </span>
                </div>
                {confirmInheritModal.extraCompanies && confirmInheritModal.extraCompanies.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">નવી જોડાયેલ કંપનીઓ:</span>
                    <span className="font-bold text-amber-700">{confirmInheritModal.extraCompanies.join(', ')}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">અગાઉનો ફાઈનલ હિસાબ (Final Payable):</span>
                  <span className="text-lg font-black font-mono text-emerald-700">
                    {formatINR(confirmInheritModal.snapshot.finalPayable)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed">
                👉 શું તમે આ રકમ (<strong>{formatINR(confirmInheritModal.snapshot.finalPayable)}</strong>) ને વર્તમાન બિલિંગ માટે <strong>&apos;આગળના હિસાબના લેવાના થતાં રૂ. (જૂની બાકી)&apos;</strong> તરીકે સેટ કરવા માંગો છો?
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmInheritModal({ isOpen: false, snapshot: null, extraCompanies: [] })}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                રદ કરો (Cancel)
              </button>
              <button
                type="button"
                onClick={() => handleConfirmInheritSnapshot(confirmInheritModal.snapshot)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <FaCheckCircle className="w-3.5 h-3.5" />
                <span>હા, આ રકમ જૂની બાકી તરીકે સેટ કરો</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PROJECT ALERT DIALOG FOR SNAPSHOT DELETION (NO BROWSER ALERT)             */}
      {/* ========================================================================= */}
      {deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-rose-200 w-full max-w-md overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-rose-100 bg-gradient-to-r from-rose-600 via-rose-700 to-red-800 text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
                <FaTrashAlt className="w-5 h-5 text-rose-100" />
              </div>
              <div>
                <h3 className="text-base font-black">સ્નેપશોટ ડિલીટ કરવાની પુષ્ટિ</h3>
                <p className="text-xs text-rose-100">આ સેવ રેકોર્ડ હંમેશા માટે ડિલીટ થઈ જશે</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3.5 text-xs text-gray-700 bg-rose-50/20">
              <p className="text-gray-800 leading-relaxed">
                શું તમે ખરેખર નીચે દર્શાવેલ સેવ થયેલ ફાઈનલ હિસાબ સ્નેપશોટ ડિલીટ કરવા માંગો છો?
              </p>

              <div className="p-3.5 bg-white rounded-2xl border border-rose-200 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">કંપની:</span>
                  <span className="font-bold text-gray-900">{deleteConfirmModal.companyTitle}</span>
                </div>
                {deleteConfirmModal.dateRange && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium">સમયગાળો:</span>
                    <span className="font-bold text-gray-800">{deleteConfirmModal.dateRange}</span>
                  </div>
                )}
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-center gap-2">
                <FaExclamationTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>ધ્યાન આપો: આ ક્રિયા પૂર્વવત્ (Undo) થઈ શકશે નહીં.</span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirmModal({ isOpen: false, snapshotId: null, companyTitle: '', dateRange: '' })}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                રદ કરો (Cancel)
              </button>
              <button
                type="button"
                onClick={handleDeleteSnapshotConfirmed}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <FaTrashAlt className="w-3.5 h-3.5" />
                <span>હા, ડિલીટ કરો</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HISTORICAL SNAPSHOT PREVIEW & PRINT MODAL                                  */}
      {/* ========================================================================= */}
      {previewSnapshotModal.isOpen && previewSnapshotModal.snapshot && (() => {
        const snap = previewSnapshotModal.snapshot;
        const compTitle = snap.companyTitle || (snap.selectedCompanies || []).join(' & ') || 'કંપની';
        const snapMulti = snap.isMultiCompany && (snap.selectedCompanies || []).length > 1;
        const totalGoods = Math.round(((snap.prevBalance || 0) + (snap.grossInventoryAmount || snap.inventoryAmount || 0)) * 100) / 100;
        const totalLiquid = Math.round(((snap.bankBalance || 0) + (snap.meeshoPending || 0)) * 100) / 100;

        return (
          <div className="final-hisab-print-overlay fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in">
            <div className="final-hisab-print-card bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] overflow-y-auto flex flex-col">
              {/* Header */}
              <div className="p-5 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-t-3xl print:rounded-none print:py-3 print:px-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 text-xs font-bold border border-blue-400/30">
                      સેવ થયેલ ફાઈનલ હિસાબ
                    </span>
                    <span className="text-xs text-gray-300">
                      તા. {moment(snap.startDate).format('DD.MM.YYYY')} થી {moment(snap.endDate).format('DD.MM.YYYY')}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-1">
                    {compTitle} નો ફાઈનલ હિસાબ
                  </h2>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                    title="Print આ હિસાબ"
                  >
                    <FaPrint className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSnapshotExcel(snap)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                    title="Export to Excel"
                  >
                    <FaFileExcel className="w-3.5 h-3.5" />
                    <span>Export Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewSnapshotModal({ isOpen: false, snapshot: null })}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                  >
                    <FaTimes className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Sheet Body */}
              <div className="final-hisab-print-sheet p-5 sm:p-6 space-y-6 flex-1 bg-gray-50/50 print:bg-white print:p-2 print:space-y-4">
                {/* Print Only Header Meta */}
                <div className="hidden print:flex items-center justify-between text-[11px] text-gray-600 pb-2 border-b border-gray-300 font-medium">
                  <span>કંપની: <strong className="text-black">{compTitle}</strong></span>
                  <span>સમયગાળો: <strong>{moment(snap.startDate).format('DD/MM/YYYY')} થી {moment(snap.endDate).format('DD/MM/YYYY')}</strong></span>
                  <span>સેવ તારીખ: <strong>{moment(snap.createdAt).format('DD/MM/YYYY, hh:mm A')}</strong> {snap.savedByName ? `(${snap.savedByName})` : ''}</span>
                </div>

                <div className="final-hisab-print-grid grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT COLUMN: GOODS SETTLEMENT */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4">
                    <div className="border-b border-gray-100 pb-2.5 flex items-center justify-between">
                      <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                        <span>{compTitle} એ લીધેલ માલની એન્ટ્રી (માલનો હિસાબ)</span>
                      </h3>
                      <span className="text-[11px] text-gray-400 font-semibold">{compTitle}</span>
                    </div>

                    {/* 1. Previous Balance */}
                    <div className="flex items-center justify-between text-xs bg-gray-50/70 p-2.5 rounded-xl border border-gray-200">
                      <span className="text-gray-800 font-bold">આગળના હિસાબના લેવાના થતાં રૂ. (જૂની બાકી):</span>
                      <span className="font-black font-mono text-gray-900 text-sm">{formatINR(snap.prevBalance)}</span>
                    </div>

                    {/* 2. Dispatched Goods */}
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="text-gray-700 font-medium">આ વખતના માલના લેવાના થતાં રૂ.:</div>
                        <div className="text-[11px] text-gray-400">
                          માલ: {formatINR(snap.inventoryAmount)} + પ્રિન્ટ: {formatINR(snap.printCharge)}
                        </div>
                      </div>
                      <div className="font-bold text-gray-900 text-sm">
                        {formatINR(snap.grossInventoryAmount || snap.inventoryAmount)}
                      </div>
                    </div>

                    {/* Subtotal Goods */}
                    <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/60 flex items-center justify-between text-xs font-bold text-blue-900">
                      <span>ટોટલ માલના લેવાના થતાં રૂ.:</span>
                      <span className="text-sm font-black">{formatINR(totalGoods)}</span>
                    </div>

                    {/* Return Breakdowns */}
                    <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
                      <div className="font-bold text-gray-700 uppercase tracking-wider text-[11px]">
                        રિટર્ન ની એન્ટ્રી (Deductions):
                      </div>
                      <div className="flex items-center justify-between text-amber-800 pl-2">
                        <span>• કુરિયર રીટર્ન (RTO) ના રૂ.:</span>
                        <span className="font-bold">{formatINR(snap.returnsAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between text-purple-800 pl-2">
                        <span>• કસ્ટમર રીટર્ન ના રૂ.:</span>
                        <span className="font-bold">{formatINR(snap.customerReturnsAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between text-rose-800 pl-2">
                        <span>• કેન્સલ ઓર્ડર ના રૂ.:</span>
                        <span className="font-bold">{formatINR(snap.cancelledAmount)}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between text-xs font-bold text-rose-900">
                        <span>ટોટલ રીટર્ન રૂ.:</span>
                        <span className="font-black">-{formatINR(snap.totalReturnsAmount)}</span>
                      </div>
                    </div>

                    {/* Expenses & Withdrawals */}
                    <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700 font-medium">+ કંપની માટે લાગતો ખર્ચ (Expenses):</span>
                        <span className="font-bold text-gray-900">{formatINR(snap.expenses)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700 font-medium">- {compTitle} એ ઉપાડેલા રૂ. (Upad):</span>
                        <span className="font-bold text-gray-900">{formatINR(snap.withdrawals)}</span>
                      </div>
                    </div>

                    {/* Final Goods Payable */}
                    <div className={`p-4 rounded-2xl border ${snap.finalPayable >= 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-rose-50 border-rose-300 text-rose-950'} shadow-sm space-y-2`}>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                        {compTitle} ને માલના લેવાના થતાં ફાઈનલ રૂ. (જે આગળના હિસાબમાં લેવા)
                      </div>
                      <div className="text-2xl font-black flex items-center justify-between">
                        <span>{formatINR(snap.finalPayable)}</span>
                        <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-white/80 shadow-xs">
                          {snap.finalPayable >= 0 ? 'લેવાના નીકળે છે' : 'કંપની તરફથી જમા'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: PROFITABILITY ANALYSIS */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4">
                    <div className="border-b border-gray-100 pb-2.5 flex items-center justify-between">
                      <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                        <span>{compTitle} ના હિસાબનું સરવૈયું (ફક્ત નફો જોવા માટે)</span>
                      </h3>
                      <span className="text-[11px] text-gray-400 font-semibold">{compTitle}</span>
                    </div>

                    {/* 1. Bank Balance */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700 font-medium">{compTitle} ના બધા બેન્ક ખાતામાં પડેલી રકમ:</span>
                        <span className="font-black text-gray-900">{formatINR(snap.bankBalance)}</span>
                      </div>
                      {snapMulti && snap.companyBankBalances && Object.keys(snap.companyBankBalances).length > 0 && (
                        <div className="pl-3 space-y-1 text-[11px] text-gray-500 border-l-2 border-blue-200">
                          {Object.entries(snap.companyBankBalances).map(([c, amt]) => (
                            <div key={c} className="flex items-center justify-between">
                              <span>• {c}:</span>
                              <span className="font-mono font-semibold">{formatINR(amt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 2. Meesho / Marketplace Pending */}
                    <div className="space-y-1.5 text-xs pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700 font-medium">{compTitle} મીશો / માર્કેટપ્લેસ માંથી લેવાના નીકળતા રૂ.:</span>
                        <span className="font-black text-gray-900">{formatINR(snap.meeshoPending)}</span>
                      </div>
                      {snapMulti && snap.companyPendingAmounts && Object.keys(snap.companyPendingAmounts).length > 0 && (
                        <div className="pl-3 space-y-1 text-[11px] text-gray-500 border-l-2 border-amber-200">
                          {Object.entries(snap.companyPendingAmounts).map(([c, amt]) => (
                            <div key={c} className="flex items-center justify-between">
                              <span>• {c}:</span>
                              <span className="font-mono font-semibold">{formatINR(amt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Total Liquid */}
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/60 flex items-center justify-between text-xs font-bold text-emerald-900">
                      <span>લેવાનું નીકળતું ટોટલ પેમેન્ટ રૂ. (Liquid Funds):</span>
                      <span className="text-sm font-black">{formatINR(totalLiquid)}</span>
                    </div>

                    {/* Liabilities & Personal Entries */}
                    <div className="space-y-3 pt-2 border-t border-gray-100 text-xs">
                      <div className="flex items-center justify-between bg-gray-50/80 p-2.5 rounded-xl border border-gray-200">
                        <span className="text-gray-700 font-semibold">માલના ફાઈનલ લેવાના થતાં રૂ. (Liability):</span>
                        <span className="font-bold text-gray-900">{formatINR(snap.finalPayable)}</span>
                      </div>
                      <div className="flex items-center justify-between bg-amber-50/40 p-2.5 rounded-xl border border-amber-200/60">
                        <span className="text-gray-800 font-medium">સબ કંપની ({compTitle}) એ ઉપાડેલી પર્સનલ એન્ટ્રી:</span>
                        <span className="font-bold text-gray-900">{formatINR(snap.companyPersonalEntry)}</span>
                      </div>
                      <div className="flex items-center justify-between bg-amber-50/40 p-2.5 rounded-xl border border-amber-200/60">
                        <span className="text-gray-800 font-medium">મેઈન કંપની એ ઉપાડેલી પર્સનલ એન્ટ્રી:</span>
                        <span className="font-bold text-gray-900">{formatINR(snap.mainCompanyPersonalEntry)}</span>
                      </div>
                    </div>

                    {/* Net Company Profit */}
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-teal-700 text-white shadow-lg space-y-2">
                      <div className="flex items-center justify-between text-xs text-blue-100 font-bold uppercase tracking-wider">
                        <span>ટોટલ કંપનીનો વધતો ચોખ્ખો નફો (Net Company Profit)</span>
                        <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                          Liquid - Liability + Personal
                        </span>
                      </div>
                      <div className="text-3xl font-black tracking-tight font-mono">
                        {formatINR(snap.netProfit)}
                      </div>
                      <div className="text-xs text-blue-100/90 pt-1">
                        સેવ કરનાર: {snap.savedByName || 'User'} | સેવ તારીખ: {moment(snap.createdAt).format('DD/MM/YYYY, hh:mm A')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-gray-200 bg-white flex items-center justify-between rounded-b-3xl no-print">
                <div className="text-xs text-gray-500 font-medium">
                  સેવ રેકોર્ડ ID: <span className="font-mono text-gray-700">{snap._id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <FaPrint className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSnapshotExcel(snap)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                  >
                    <FaFileExcel className="w-3.5 h-3.5" />
                    <span>Export Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewSnapshotModal({ isOpen: false, snapshot: null })}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                {!canQuickMap && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                    <FaExclamationTriangle className="text-rose-600 flex-shrink-0" />
                    <span>Write permissions for both Master SKU and Master Rate are required to save changes.</span>
                  </div>
                )}
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
                  disabled={quickMapModal.saving || !canQuickMap}
                  title={!canQuickMap ? 'Write permissions for both Master SKU and Master Rate are required' : ''}
                  className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
