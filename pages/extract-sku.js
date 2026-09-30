import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import CancelOrder from '../components/CancelOrder';
import SnapdealSort from '../components/SnapdealSort';
import AmazonSort from '../components/AmazonSort';
import FlipkartSort from '../components/FlipkartSort';
import MyntraSort from '../components/MyntraSort';
import MeeshoDirectSort from '../components/MeeshoDirectSort';
import { useFeatureFlags } from '../utils/useFeatureFlags';
import { parseSnapdealPDF } from '../utils/snapdealInventoryParser';
import { SiAmazon, SiFlipkart } from 'react-icons/si';
import { FaShoppingBag, FaTag, FaBoxOpen } from 'react-icons/fa';


export default function ExtractSKU() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState('');
  const [mainTab, setMainTab] = useState('sku_management');
  const [selectedTab, setSelectedTab] = useState('sort');
  const { featureFlags, checkFeature, loading: flagsLoading } = useFeatureFlags();
  const [allowed, setAllowed] = useState(null);
  const [allowedDirectSort, setAllowedDirectSort] = useState(null);
  const [selectedPdfFile, setSelectedPdfFile] = useState(null); // For Meesho Sort
  const [selectedCsvFile, setSelectedCsvFile] = useState(null); // For Meesho Sort
  
  // SKU Inventory Management states
  const [inventoryData, setInventoryData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterSKU, setFilterSKU] = useState('');
  const [availableDates, setAvailableDates] = useState([]);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [customOrder, setCustomOrder] = useState([]);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [tempCustomOrder, setTempCustomOrder] = useState([]);
  const [activeCompanyTab, setActiveCompanyTab] = useState('all');
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDate, setDeleteDate] = useState('');
  const [draggedTabIndex, setDraggedTabIndex] = useState(null);
  const [dateRange, setDateRange] = useState({ min: '', max: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({ percent: 0, message: '' });
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);
  const [existingDataInfo, setExistingDataInfo] = useState(null);
  const [actualDataDateRange, setActualDataDateRange] = useState({ min: '', max: '' });
  const [inventoryDataByDate, setInventoryDataByDate] = useState({}); // { date: { company: totalSKUs } }
  const [holidays, setHolidays] = useState(new Set()); // Set of date strings (YYYY-MM-DD)
  const [markAsHoliday, setMarkAsHoliday] = useState(false); // For upload modal
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [uploadedDates, setUploadedDates] = useState(new Set()); // Set of uploaded date strings
  const [filterPanelOpen, setFilterPanelOpen] = useState(true); // Filter panel open/close state
  const [showDateRangePicker, setShowDateRangePicker] = useState(false); // Date range picker visibility
  const [tempStartDate, setTempStartDate] = useState(''); // Temporary start date
  const [tempEndDate, setTempEndDate] = useState(''); // Temporary end date
  
  // Derive current platform from selected tab
  const currentPlatform = selectedTab === 'flipkart-inventory' ? 'flipkart' : selectedTab === 'snapdeal-inventory' ? 'snapdeal' : selectedTab === 'myntra-inventory' ? 'myntra' : 'meesho';
  const isInventoryTab = selectedTab === 'inventory' || selectedTab === 'flipkart-inventory' || selectedTab === 'snapdeal-inventory' || selectedTab === 'myntra-inventory';

  // Handle tab query parameter from URL
  useEffect(() => {
    if (router.isReady && router.query.tab) {
      const tab = router.query.tab;
      setSelectedTab(tab);
      if (['sort', 'meesho-direct', 'amazon', 'flipkart', 'snapdeal', 'myntra', 'excel'].includes(tab)) {
        setMainTab('sku_management');
      } else if (['inventory', 'cancelled-orders', 'returns', 'customer-returns'].includes(tab)) {
        setMainTab('meesho_reconciliation');
      } else if (tab === 'flipkart-inventory') {
        setMainTab('flipkart_reconciliation');
      } else if (tab === 'snapdeal-inventory') {
        setMainTab('snapdeal_reconciliation');
      } else if (tab === 'myntra-inventory') {
        setMainTab('myntra_reconciliation');
      }
    }
  }, [router.isReady, router.query.tab]);

  // Date formatting utility
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Get first and last day of current month (using local time, avoiding timezone issues)
  const getCurrentMonthRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    // First day of current month - always day 1
    const firstDayStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    
    // Last day of current month
    const lastDay = new Date(year, month + 1, 0); // Day 0 of next month = last day of current month
    const lastDayNum = lastDay.getDate();
    const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
    
    return { firstDay: firstDayStr, lastDay: lastDayStr };
  };

  // Convert Date object to YYYY-MM-DD string WITHOUT timezone conversion
  const toLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to split date range into monthly chunks
  const splitDateRangeIntoMonths = (startDate, endDate) => {
    if (!startDate || !endDate) return [];
    
    const chunks = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let current = new Date(start);
    
    while (current <= end) {
      const chunkStart = new Date(current);
      // Get last day of current month
      const chunkEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      
      // Don't go beyond the end date
      const actualChunkEnd = chunkEnd > end ? end : chunkEnd;
      
      chunks.push({
        startDate: chunkStart.toISOString().split('T')[0],
        endDate: actualChunkEnd.toISOString().split('T')[0],
        label: `${chunkStart.toLocaleString('default', { month: 'short' })} ${chunkStart.getFullYear()}`
      });
      
      // Move to first day of next month
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    
    return chunks;
  };

  // SKU Inventory Management Functions - moved before useEffect hooks
  const fetchInventoryData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      // Determine if we need to split the query
      const needsSplitting = filterStartDate && filterEndDate;
      let allData = { data: {}, rawData: [] };
      
      if (needsSplitting) {
        // Calculate days between dates
        const start = new Date(filterStartDate);
        const end = new Date(filterEndDate);
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        
        // If > 60 days, split into monthly chunks
        if (daysDiff > 60) {
          const chunks = splitDateRangeIntoMonths(filterStartDate, filterEndDate);
          
          setStatus(`Loading ${chunks.length} months of data...`);
          
          // Fetch each chunk
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            setStatus(`Loading ${chunk.label} (${i + 1}/${chunks.length})...`);
            
            const params = new URLSearchParams();
            params.append('startDate', chunk.startDate);
            params.append('endDate', chunk.endDate);
            if (filterCompany) params.append('companyName', filterCompany);
            if (filterSKU) params.append('sku', filterSKU);
            params.append('platform', currentPlatform);
            
            try {
              const { data } = await axios.get(`/api/sku-inventory?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              
              // Merge data
              if (data.data) {
                Object.keys(data.data).forEach(company => {
                  if (!allData.data[company]) {
                    allData.data[company] = {};
                  }
                  // Merge SKU quantities
                  Object.keys(data.data[company]).forEach(sku => {
                    if (!allData.data[company][sku]) {
                      allData.data[company][sku] = 0;
                    }
                    allData.data[company][sku] += data.data[company][sku];
                  });
                });
              }
              
              // Append rawData
              if (data.rawData) {
                allData.rawData.push(...data.rawData);
              }
            } catch (chunkErr) {
              console.error(`❌ Failed to load ${chunk.label}:`, chunkErr);
              // Continue with other chunks even if one fails
            }
          }
          
          setStatus('');
        } else {
          // Date range is small enough, fetch normally
          const params = new URLSearchParams();
          if (filterStartDate) params.append('startDate', filterStartDate);
          if (filterEndDate) params.append('endDate', filterEndDate);
          if (filterCompany) params.append('companyName', filterCompany);
          if (filterSKU) params.append('sku', filterSKU);
          params.append('platform', currentPlatform);

          const { data } = await axios.get(`/api/sku-inventory?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          allData = data;
        }
      } else {
        // No date range specified, fetch all
        const params = new URLSearchParams();
        if (filterCompany) params.append('companyName', filterCompany);
        if (filterSKU) params.append('sku', filterSKU);
        params.append('platform', currentPlatform);

        const { data } = await axios.get(`/api/sku-inventory?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        allData = data;
      }
      
      // Trim all company names in the data
      const trimmedData = {};
      if (allData.data) {
        Object.keys(allData.data).forEach(companyName => {
          const trimmedName = companyName.trim();
          if (trimmedName) {
            trimmedData[trimmedName] = allData.data[companyName];
          }
        });
      }
      
      // Organize data by date: { date: { company: totalQuantity } }
      const dataByDate = {};
      if (allData.rawData && allData.rawData.length > 0) {
        // Group by date and company to sum quantities
        allData.rawData.forEach(item => {
          const dateStr = new Date(item.selectedDate).toISOString().split('T')[0];
          const trimmedCompanyName = (item.companyName || '').trim();
          if (!trimmedCompanyName) return;
          
          if (!dataByDate[dateStr]) {
            dataByDate[dateStr] = {};
          }
          if (!dataByDate[dateStr][trimmedCompanyName]) {
            dataByDate[dateStr][trimmedCompanyName] = 0;
          }
          // Sum quantities instead of counting SKUs
          dataByDate[dateStr][trimmedCompanyName] += (item.quantity || 0);
        });
      }
      
      // Calculate actual date range from rawData
      if (allData.rawData && allData.rawData.length > 0) {
        const dates = allData.rawData.map(item => new Date(item.selectedDate));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        setActualDataDateRange({
          min: minDate.toISOString().split('T')[0],
          max: maxDate.toISOString().split('T')[0]
        });
      } else {
        // No data, reset actual date range
        setActualDataDateRange({ min: '', max: '' });
      }
      
      setInventoryData(trimmedData);
      setInventoryDataByDate(dataByDate);
      
      // DO NOT modify customOrder here!
      // customOrder should only be set by:
      // 1. fetchCustomOrder() on initialization
      // 2. handleTabDrop() when user explicitly reorders via drag-drop
      
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch inventory data');
      setInventoryData(null);
      setInventoryDataByDate({});
    } finally {
      setLoading(false);
    }
  }, [filterStartDate, filterEndDate, filterCompany, filterSKU, currentPlatform]);

  const fetchFilterOptions = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`/api/sku-inventory-filters?platform=${currentPlatform}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const dates = data.dates || [];
      const companyNames = (data.companyNames || []).map(name => name.trim()).filter(name => name);
      
      // Normalize dates to YYYY-MM-DD format for consistent comparison
      const normalizedDates = dates.map(date => {
        if (!date) return null;
        // If date is already in YYYY-MM-DD format, use it as-is
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return date;
        }
        // Otherwise, try to parse and format it
        try {
          const dateObj = new Date(date);
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        } catch (e) {
          return date; // Fallback to original if parsing fails
        }
      }).filter(date => date !== null);
      
      setAvailableDates(normalizedDates);
      setAvailableCompanies(companyNames);
      
      // Track uploaded dates for calendar display (normalized to YYYY-MM-DD)
      setUploadedDates(new Set(normalizedDates));
      
      // Set date range info
      if (normalizedDates.length > 0) {
        const sortedDates = [...normalizedDates].sort();
        setDateRange({ min: sortedDates[0], max: sortedDates[sortedDates.length - 1] });
        
        // Set default filter dates if not set - prefer current month
        if (!filterStartDate || !filterEndDate) {
          const { firstDay, lastDay } = getCurrentMonthRange();
          // Check if current month dates are within available range
          const currentMonthStart = firstDay >= sortedDates[0] ? firstDay : sortedDates[0];
          const currentMonthEnd = lastDay <= sortedDates[sortedDates.length - 1] ? lastDay : sortedDates[sortedDates.length - 1];
          
          // Use current month range (clamped to available dates) if valid
          if (currentMonthStart <= currentMonthEnd) {
            setFilterStartDate(currentMonthStart);
            setFilterEndDate(currentMonthEnd);
          } else {
            // Fallback to last available date if current month is completely out of range
          setFilterStartDate(sortedDates[sortedDates.length - 1]);
          setFilterEndDate(sortedDates[sortedDates.length - 1]);
          }
        }
      } else {
        // No dates available, still set current month as default
        if (!filterStartDate || !filterEndDate) {
          const { firstDay, lastDay } = getCurrentMonthRange();
          setFilterStartDate(firstDay);
          setFilterEndDate(lastDay);
        }
      }
      
      // DO NOT set customOrder here - let fetchCustomOrder() handle it!
      // fetchCustomOrder() will be called after this in initInventory()
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  };

  const fetchCustomOrder = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('/api/company-order-preference', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Trim all company names in the order
      const trimmedOrder = data.customOrder 
        ? data.customOrder.map(name => name.trim()).filter(name => name)
        : [];
      
      // Always use default order as the base, then merge with saved order or API returned order
      const defaultOrder = getDefaultCompanyOrder();
      
      // If we have a saved order (and it's not the default from API), use it
      // Otherwise, use the default order
      if (trimmedOrder.length > 0 && !data.isDefault) {
        setCustomOrder(trimmedOrder);
        setTempCustomOrder(trimmedOrder);
      } else {
        setCustomOrder(defaultOrder);
        setTempCustomOrder(defaultOrder);
      }
    } catch (err) {
      console.error('Failed to fetch custom order:', err);
      // Use default order if API fails
      const defaultOrder = getDefaultCompanyOrder();
      setCustomOrder(defaultOrder);
      setTempCustomOrder(defaultOrder);
    }
  };

  const getDefaultCompanyOrder = () => {
    return [
      'SHREEJI#', 'SHREEJI NEW', 'Cosmetic King', 'AKIRA_FASHION', 'Gajanand_Enterprise',
      'ZXRIZ', 'JEWELL SWERA CREATION', 'BHAKTI CREATION', "LA'KAILASHA", 'ghanshyam_enterprise',
      'FOREIGN FALCON', 'HAYAAT ENTERPRISE', 'SERENA JEWELLERY', 'SAHJANAND ENTERPRISSE',
      'NORDIC CREATION', 'KARMA_ENTERPRISE', 'SUVRAT ENTERPRISE', 'SAHAJ JEWELLERY', 
      'JAY KHODAL CREATION', 'SUNSHINECREATION', 'Ornexa Enterprise'
    ];
  };

  useEffect(() => {
    const init = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) { setAllowed(false); return; }
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (!user || !user.role) { setAllowed(false); return; }
        if (!['admin', 'manager'].includes(user.role)) { setAllowed(false); return; }
        setAllowed(checkFeature('isExtractSKU'));
        // Separate permission + flag for Meesho Direct Sort
        const hasDirectSortPermission = user.role === 'admin' ||
          (user.permissions && user.permissions.includes('MEESHO_DIRECT_SORT'));
        setAllowedDirectSort(hasDirectSortPermission && checkFeature('isMeeshoDirectSort'));
      } catch (e) {
        setAllowed(false);
      }
    };
    if (!flagsLoading) {
      init();
    }
  }, [flagsLoading, checkFeature]);

  // Fetch holidays when date range changes
  useEffect(() => {
    const fetchHolidays = async () => {
      if (!filterStartDate || !filterEndDate || !isInventoryTab) return;
      
      try {
        const token = localStorage.getItem('token');
        // Ensure dates are in YYYY-MM-DD format (extract date part if ISO string)
        const cleanStartDate = filterStartDate.split('T')[0];
        const cleanEndDate = filterEndDate.split('T')[0];
        
        const { data } = await axios.get(
          `/api/sku-inventory/holidays?startDate=${cleanStartDate}&endDate=${cleanEndDate}&platform=${currentPlatform}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (data.success && data.holidays) {
          setHolidays(new Set(data.holidays));
        }
      } catch (err) {
        console.error('Error fetching holidays:', err);
        console.error('Error details:', err.response?.data);
        // Fallback to empty set on error
        setHolidays(new Set());
      }
    };

    fetchHolidays();
  }, [filterStartDate, filterEndDate, selectedTab]);

  // Initialize inventory tab data when switching to inventory tab
  useEffect(() => {
    if (isInventoryTab && checkFeature('isSKUInventory')) {
      // Clear data to prevent showing previous tab's data while loading
      setInventoryData(null);
      setInventoryDataByDate({});
      setActualDataDateRange({ min: '', max: '' });
      setFilterCompany('');

      const initInventory = async () => {
        // Set default to current month if filters are not set
        let startDate = filterStartDate;
        let endDate = filterEndDate;
        
        const isFirstLoad = !startDate || !endDate;
        
        if (isFirstLoad) {
          const { firstDay, lastDay } = getCurrentMonthRange();
          startDate = firstDay;
          endDate = lastDay;
          setFilterStartDate(firstDay);
          setFilterEndDate(lastDay);
        }
        
        await fetchFilterOptions();
        await fetchCustomOrder();
        
        // Auto-fetch data whenever switching to an inventory tab
        setTimeout(() => {
          // fetchInventoryData relies on state, so we might need a small delay
          // actually, it's better to fetch data immediately
          fetchInventoryData();
        }, 100);
      };
      initInventory();
    }
  }, [selectedTab, featureFlags]);

  // Removed auto-fetch - now using manual Apply button for better UX
  // This prevents annoying automatic calls when user is selecting dates

  useEffect(() => {
    const refreshFlagsIfNeeded = async () => {
      try {
        if (selectedTab !== 'excel') return;
        const token = localStorage.getItem('token');
        if (!token) return;
        const { data } = await axios.get('/api/company/flags', { headers: { Authorization: `Bearer ${token}` } });
        setFeatureFlags(data?.featureFlags || {});
      } catch {}
    };
    refreshFlagsIfNeeded();
  }, [selectedTab]);

  const companies = ['Valmo', 'Xpress Bees', 'ShadowFax', 'Delhivery', 'Ecom Express'].sort();

  function extractSKU(lines) {
    const SKUIndex = lines.findIndex(line => line.includes('SKU'));
    if (SKUIndex === -1) return null;
    const name = lines[SKUIndex + 1]?.trim()?.split('  ')?.[0]?.trim();
    return name;
  }

  function extractQuantity(lines) {
    const QtyIndex = lines.findIndex(line => line.includes('Qty'));
    if (QtyIndex === -1) return null;
    let qty = 0;
    const qty1 = lines[QtyIndex + 1]?.trim()?.split('  ')?.[2]?.trim()?.split(' ')?.[0];
    const qty2 = lines[QtyIndex + 2]?.trim()?.split('  ')?.[2]?.trim()?.split(' ')?.[0];
    if (qty2) {
      qty = Number(qty1) + Number(qty2);
    } else {
      qty = Number(qty1);
    }
    return qty;
  }

  function extractCompany(lines) {
    const company = companies.find(company => {
      return lines.map(line => line.trim()?.split('  ')?.[0]?.trim()?.toUpperCase()).includes(company.toUpperCase());
    });
    return company;
  }

  function parseCSV(text) {
    const rows = [];
    let i = 0, field = '', row = [], inQuotes = false;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { rows.push(row); row = []; };
    while (i < text.length) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += char; i++; continue;
      } else {
        if (char === '"') { inQuotes = true; i++; continue; }
        if (char === ',') { pushField(); i++; continue; }
        if (char === '\n' || char === '\r') {
          if (char === '\r' && text[i + 1] === '\n') i++;
          pushField(); pushRow(); i++; continue;
        }
        field += char; i++;
      }
    }
    pushField(); if (row.length) pushRow();
    if (!rows.length) return [];
    const headers = rows[0].map(h => (h || '').trim());
    const dataRows = rows.slice(1).filter(r => r.some(c => String(c || '').trim() !== ''));
    return dataRows.map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = r[idx]; });
      return obj;
    });
  }

  function findHeaderKeyInsensitive(row, target) {
    const keys = Object.keys(row || {});
    const match = keys.find(k => (k || '').trim().toUpperCase() === target.toUpperCase());
    return match;
  }

  function reconstructLinesFromTextItems(items) {
    let lastY = null;
    const pageText = items
      .map(item => {
        const text = item.str;
        const currentY = item.transform?.[5];
        const needsNewline = lastY !== null && currentY !== undefined && Math.abs(currentY - lastY) > 5;
        lastY = currentY;
        return (needsNewline ? '\n' : ' ') + text;
      })
      .join('')
      .trim();
    return pageText.split('\n');
  }

  async function loadPdfJs() {
    if (typeof window === 'undefined') return null;
    if (window.pdfjsLib) return window.pdfjsLib;
    setStatus('Loading PDF engine...');
    const pdfJsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = pdfJsUrl; s.async = true; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    if (!window.pdfjsLib) throw new Error('Failed to load PDF.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    return window.pdfjsLib;
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function parseExcel(arrayBuffer) {
    try {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(firstSheet);
      return data;
    } catch (err) {
      console.error('Excel parsing error:', err);
      return [];
    }
  }

  function readFileAsArrayBufferPromise(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setStatus('Preparing files...');
    try {
      const pdfFile = event.target.pdf.files[0];
      const dataFile = event.target.csv.files[0];
      if (!pdfFile || !dataFile) throw new Error('Please select both PDF and CSV/Excel files');

      const isExcel = /\.(xlsx|xls)$/i.test(dataFile.name);
      const [pdfjsLib, pdfArrayBuffer, csvData] = await (async () => {
        const [lib, pdfBuf] = await Promise.all([
          loadPdfJs(),
          readFileAsArrayBuffer(pdfFile)
        ]);
        if (isExcel) {
          const dataBuf = await readFileAsArrayBuffer(dataFile);
          setStatus('Parsing Excel...');
          const data = parseExcel(dataBuf);
          return [lib, pdfBuf, data];
        }
        setStatus('Parsing CSV...');
        const csvText = await readFileAsText(dataFile);
        return [lib, pdfBuf, parseCSV(csvText)];
      })();
      const skuKey = csvData.length ? findHeaderKeyInsensitive(csvData[0], 'SKU') : null;
      const originKey = csvData.length ? findHeaderKeyInsensitive(csvData[0], 'Origin') || findHeaderKeyInsensitive(csvData[0], 'origin') : null;

      setStatus('Reading PDF...');
      const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
      const pdf = await loadingTask.promise;

      const pageData = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        setStatus(`Analyzing page ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const lines = reconstructLinesFromTextItems(textContent.items || []);
        
        // Check if page contains "Customer Address"
        const hasCustomerAddress = lines.some(line => 
          line.toLowerCase().includes('customer address')
        );
        
        // Skip pages without Customer Address
        if (!hasCustomerAddress) {
          continue;
        }
        
        const sku = extractSKU(lines);
        const qty = extractQuantity(lines);
        let originName = 'Unknown Origin';
        if (skuKey) {
          const originRow = csvData.find(row => String(row[skuKey]).trim() === String(sku).trim());
          if (originRow && originKey) originName = originRow[originKey] || 'Unknown Origin';
        }
        const company = extractCompany(lines) || 'Zzzzz';
        pageData.push({ pageNumber: i, sku, qty, originName, company });
      }

      // Check if any pages with Customer Address were found
      if (pageData.length === 0) {
        throw new Error('No pages with Customer Address found in the PDF. Please check your PDF file.');
      }

      pageData.sort((a, b) => {
        const qtyA = a.qty || 0; const qtyB = b.qty || 0;
        if (qtyA !== qtyB) return qtyA - qtyB;
        const originA = a.originName || ''; const originB = b.originName || '';
        if (originA !== originB) return originA.localeCompare(originB);
        const companyA = a.company || ''; const companyB = b.company || '';
        return companyA.localeCompare(companyB);
      });

      // Count occurrences of each origin (excluding "Unknown Origin")
      const originCounts = {};
      const firstOriginIndex = {}; // Track first occurrence index of each origin
      pageData.forEach((page, index) => {
        if (page.originName && page.originName !== 'Unknown Origin') {
          if (!originCounts[page.originName]) {
            originCounts[page.originName] = 0;
            firstOriginIndex[page.originName] = index;
          }
          originCounts[page.originName]++;
        }
      });

      setStatus('Building output PDF...');
      const sourcePdfDoc = await PDFDocument.load(pdfArrayBuffer);
      const outPdf = await PDFDocument.create();
      const helveticaBoldFont = await outPdf.embedFont(StandardFonts.HelveticaBold);
      
      for (let i = 0; i < pageData.length; i++) {
        const page = pageData[i];
        const [copied] = await outPdf.copyPages(sourcePdfDoc, [page.pageNumber - 1]);
        
        // Check if this is the first page of this origin and origin is not "Unknown Origin"
        const isFirstOfOrigin = firstOriginIndex[page.originName] === i;
        const hasMultiplePages = originCounts[page.originName] > 1;
        const showCount = isFirstOfOrigin && hasMultiplePages && page.originName !== 'Unknown Origin';
        
        // Get page dimensions
        const { width, height } = copied.getSize();
        
        // Draw origin name on the left bottom
        // PDF coordinates: (0,0) is bottom-left, y increases upward
        // Use same approach as working processFiles.js
        copied.drawText(`Origin : ${page.originName}`, { 
          x: 50, 
          y: 50, 
          size: 14, 
          font: helveticaBoldFont,
          color: rgb(0, 0, 0)
        });
        
        // Draw count on the right bottom corner if applicable
        if (showCount) {
          const count = originCounts[page.originName];
          const countText = `(${count})`;
          const countFontSize = 24; // Bigger font for count
          
          // Calculate width of count text to position it from right
          const countWidth = helveticaBoldFont.widthOfTextAtSize(countText, countFontSize);
          
          // Position at right bottom corner (same y level as origin name)
          copied.drawText(countText, {
            x: width - countWidth - 50, // 50px margin from right
            y: 50, // Same y level as origin name (50 points from bottom)
            size: countFontSize,
            font: helveticaBoldFont,
            color: rgb(0, 0, 0)
          });
        }
        
        outPdf.addPage(copied);
      }
      const outBytes = await outPdf.save();
      const url = window.URL.createObjectURL(new Blob([outBytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', 'sorted_output.pdf');
      document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);

      setSuccess(true);
      setStatus('Done. File downloaded.');
      // Reset file selections after successful processing
      setSelectedPdfFile(null);
      setSelectedCsvFile(null);
      // Reset form inputs
      if (event.target.pdf) event.target.pdf.value = '';
      if (event.target.csv) event.target.csv.value = '';
    } catch (err) {
      console.error(err);
      setError(err.message || 'Processing failed');
      setStatus('Attempting server fallback...');
      try {
        const formData = new FormData();
        const pdf = event.target.pdf.files[0];
        const csv = event.target.csv.files[0];
        formData.append('pdf', pdf);
        formData.append('csv', csv);
        const response = await fetch('/api/processFiles', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Server fallback failed');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url; link.setAttribute('download', 'sorted_output.pdf');
        document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);
        setError(null);
        setSuccess(true);
        setStatus('Done via server fallback.');
        // Reset file selections after successful processing
        setSelectedPdfFile(null);
        setSelectedCsvFile(null);
        // Reset form inputs
        if (event.target.pdf) event.target.pdf.value = '';
        if (event.target.csv) event.target.csv.value = '';
      } catch (fallbackErr) {
        console.error(fallbackErr);
        setStatus('');
      }
    } finally {
      setLoading(false);
    }
  };


  // Helper function to generate all dates in a range (using local time)
  const generateDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) return [];
    const dates = [];
    // Parse dates in local timezone
    const startParts = startDate.split('-').map(Number);
    const endParts = endDate.split('-').map(Number);
    const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
    const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);
    const current = new Date(start);
    
    while (current <= end) {
      // Format date using local time
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  // Toggle holiday status for a date
  const toggleHoliday = async (dateString) => {
    try {
      const token = localStorage.getItem('token');
      const isHoliday = holidays.has(dateString);
      
      if (isHoliday) {
        // Remove holiday
        const response = await axios.delete(`/api/sku-inventory/holidays?date=${dateString}&platform=${currentPlatform}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          const newHolidays = new Set(holidays);
          newHolidays.delete(dateString);
          setHolidays(newHolidays);
          // Refresh holidays to ensure sync
          if (filterStartDate && filterEndDate) {
            const { data } = await axios.get(
              `/api/sku-inventory/holidays?startDate=${filterStartDate}&endDate=${filterEndDate}&platform=${currentPlatform}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (data.success && data.holidays) {
              setHolidays(new Set(data.holidays));
            }
          }
        }
      } else {
        // Add holiday
        const response = await axios.post(
          '/api/sku-inventory/holidays',
          { date: dateString, platform: currentPlatform },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.data.success) {
          const newHolidays = new Set(holidays);
          newHolidays.add(dateString);
          setHolidays(newHolidays);
          // Refresh holidays to ensure sync
          if (filterStartDate && filterEndDate) {
            const { data } = await axios.get(
              `/api/sku-inventory/holidays?startDate=${filterStartDate}&endDate=${filterEndDate}&platform=${currentPlatform}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (data.success && data.holidays) {
              setHolidays(new Set(data.holidays));
            }
          }
        }
      }
    } catch (err) {
      console.error('Error toggling holiday:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to update holiday';
      setError(`Holiday error: ${errorMessage}`);
      setTimeout(() => setError(null), 5000);
    }
  };

  const mergeNewCompanies = (existingOrder, foundCompanies) => {
    // Trim all company names
    const trimmedExisting = existingOrder.map(name => name.trim()).filter(name => name);
    const trimmedFound = foundCompanies.map(name => name.trim()).filter(name => name);
    
    // Add any new companies found in data that aren't in the custom order
    const newCompanies = trimmedFound.filter(company => !trimmedExisting.includes(company));
    
    // Combine and deduplicate
    const merged = [...trimmedExisting, ...newCompanies.sort()];
    return [...new Set(merged)];
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/html'));
    
    if (dragIndex === dropIndex) return;
    
    const newOrder = [...tempCustomOrder];
    const [removed] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    
    setTempCustomOrder(newOrder);
  };

  const handleTabDragStart = (e, company) => {
    setDraggedTabIndex(company); // Store company name instead of index
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', company);
  };

  const handleTabDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTabDrop = async (e, dropCompany) => {
    e.preventDefault();
    const dragCompany = draggedTabIndex; // This is now the company name
    
    if (!dragCompany || dragCompany === dropCompany) return;
    
    // Build the current visible list (same logic as rendering)
    const companiesFromData = inventoryData ? Object.keys(inventoryData) : [];
    const baseOrder = customOrder.length > 0 ? customOrder : getDefaultCompanyOrder();
    
    // Get the ordered list
    const orderedCompanies = [];
    for (const company of baseOrder) {
      if (availableCompanies.includes(company) || companiesFromData.includes(company)) {
        orderedCompanies.push(company);
      }
    }
    const newCompanies = companiesFromData
      .filter(company => !baseOrder.includes(company))
      .sort();
    const currentVisibleOrder = [...orderedCompanies, ...newCompanies];
    
    // Reorder based on drag and drop
    const dragIndex = currentVisibleOrder.indexOf(dragCompany);
    const dropIndex = currentVisibleOrder.indexOf(dropCompany);
    
    if (dragIndex === -1 || dropIndex === -1) return;
    
    const newOrder = [...currentVisibleOrder];
    const [removed] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    
    // Trim and deduplicate the order before saving
    const cleanedOrder = [...new Set(newOrder.map(name => name?.trim()).filter(name => name))];
    
    setCustomOrder(cleanedOrder);
    setTempCustomOrder(cleanedOrder);
    setDraggedTabIndex(null);
    
    // Auto-save the new order
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/company-order-preference', 
        { customOrder: cleanedOrder },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Show success message
      setSuccess(true);
      setStatus('Company order saved successfully');
      setTimeout(() => { 
        setSuccess(false); 
        setStatus(''); 
      }, 2000);
    } catch (err) {
      console.error('Failed to save reordered tabs:', err);
      setError('Failed to save company order');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleCompanySelect = (company) => {
    if (company === 'all') {
      setActiveCompanyTab('all');
      setSelectedCompanies([]);
    } else {
      setActiveCompanyTab('');
      setSelectedCompanies(prev => {
        if (prev.includes(company)) {
          return prev.filter(c => c !== company);
        } else {
          return [...prev, company];
        }
      });
    }
  };

  const handleCompanyClick = (company) => {
    setActiveCompanyTab(company);
    setSelectedCompanies([]);
  };

  const toggleSelectAll = () => {
    if (!inventoryData) return;
    const allCompanies = Object.keys(inventoryData);
    if (selectedCompanies.length === allCompanies.length) {
      setSelectedCompanies([]);
    } else {
      setSelectedCompanies(allCompanies);
      setActiveCompanyTab('');
    }
  };

  const saveCustomOrder = async () => {
    try {
      setLoading(true);
      
      // Trim and deduplicate before saving
      const cleanedOrder = [...new Set(tempCustomOrder.map(name => name.trim()))].filter(name => name);
      
      const token = localStorage.getItem('token');
      await axios.post('/api/company-order-preference', 
        { customOrder: cleanedOrder },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCustomOrder(cleanedOrder);
      setTempCustomOrder(cleanedOrder);
      setIsEditingOrder(false);
      setSuccess(true);
      setStatus('Custom order saved successfully');
      setTimeout(() => { setSuccess(false); setStatus(''); }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save custom order');
    } finally {
      setLoading(false);
    }
  };

  const uploadInventoryData = async (skuData, dateStr = null) => {
    try {
      setLoading(true);
      setStatus('Uploading data...');
      const token = localStorage.getItem('token');
      // Use the provided date string from modal, or fallback to selectedDate state
      const targetDate = dateStr || selectedDate;
      const { data } = await axios.post('/api/sku-inventory', 
        { selectedDate: targetDate, skuData, platform: currentPlatform },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(true);
      setStatus(data.message);
      
      // Mark as holiday if checkbox was checked
      if (markAsHoliday) {
        try {
          await axios.post(
            '/api/sku-inventory/holidays',
            { date: targetDate, platform: currentPlatform },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          // Refresh holidays
          if (filterStartDate && filterEndDate) {
            const { data: holidayData } = await axios.get(
              `/api/sku-inventory/holidays?startDate=${filterStartDate}&endDate=${filterEndDate}&platform=${currentPlatform}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (holidayData.success && holidayData.holidays) {
              setHolidays(new Set(holidayData.holidays));
            }
          }
        } catch (holidayErr) {
          console.error('Error marking as holiday:', holidayErr);
          // Don't fail the upload if holiday marking fails
        }
      }
      
      // DO NOT modify customOrder here!
      // customOrder should only be set by:
      // 1. fetchCustomOrder() on initialization
      // 2. handleTabDrop() when user explicitly reorders via drag-drop
      
      // Refresh filter options to update uploadedDates immediately
      await fetchFilterOptions();
      await fetchInventoryData();
      
      // Update uploadedDates to include the just-uploaded date
      setUploadedDates(prev => {
        const updated = new Set(prev);
        updated.add(targetDate);
        return updated;
      });
      
      setShowUploadModal(false); // Close modal after successful upload
      setSelectedFile(null); // Reset selected file
      setMarkAsHoliday(false); // Reset holiday checkbox
      setTimeout(() => { setSuccess(false); setStatus(''); }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload data');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const deleteInventoryDataByDate = async (date) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const { data } = await axios.delete(`/api/sku-inventory?date=${date}&platform=${currentPlatform}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(true);
      setStatus(data.message);
      
      // Close modal and reset
      setShowDeleteModal(false);
      setDeleteDate('');
      
      // Refresh data (this will update uploadedDates via fetchFilterOptions)
      await fetchFilterOptions();
      await fetchInventoryData();
      
      // Explicitly remove deleted date from uploadedDates
      setUploadedDates(prev => {
        const updated = new Set(prev);
        updated.delete(date);
        return updated;
      });
      
      setTimeout(() => { setSuccess(false); setStatus(''); }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete data');
    } finally {
      setLoading(false);
    }
  };

  const downloadInventoryExcel = async () => {
    if (!filterStartDate || !filterEndDate) {
      setError('Please select both start and end dates');
      return;
    }
    try {
      setLoading(true);
      setStatus('Generating Excel...');
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/sku-inventory-download', 
        { startDate: filterStartDate, endDate: filterEndDate, platform: currentPlatform },
        { 
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      // Create formatted filename with date range
      const startDateFormatted = formatDate(filterStartDate);
      const endDateFormatted = formatDate(filterEndDate);
      const platformLabel = currentPlatform === 'flipkart' ? 'Flipkart' : currentPlatform === 'snapdeal' ? 'Snapdeal' : currentPlatform === 'myntra' ? 'Myntra' : 'Meesho';
      const filename = filterStartDate === filterEndDate 
        ? `${platformLabel}_SKU_Inventory_${startDateFormatted.replace(/\//g, '-')}.xlsx`
        : `${platformLabel}_SKU_Inventory_${startDateFormatted.replace(/\//g, '-')}_to_${endDateFormatted.replace(/\//g, '-')}.xlsx`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      
      setSuccess(true);
      setStatus('Excel downloaded successfully');
      setTimeout(() => { setSuccess(false); setStatus(''); }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to download Excel');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleInventoryUpload = async (event, file = null, dateStr = null) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    
    // Determine which date to use
    const targetDate = dateStr || selectedDate;
    
    // Validate: Prevent future dates
    const today = new Date();
    const selected = new Date(targetDate);
    today.setHours(0, 0, 0, 0);
    selected.setHours(0, 0, 0, 0);
    
    if (selected > today) {
      setError('Cannot upload data for future dates. Please select today or a past date.');
      setLoading(false);
      return;
    }
    
    // Check if data exists for selected date
    const existingData = await checkExistingData(targetDate);
    if (existingData) {
      setExistingDataInfo(existingData);
      setShowOverwriteWarning(true);
      setLoading(false);
      return;
    }
    
    // Proceed with upload - use the correct parser based on platform
    if (currentPlatform === 'flipkart') {
      await processAndUploadFlipkartPDF(event, file, targetDate);
    } else if (currentPlatform === 'snapdeal') {
      await processAndUploadSnapdealPDF(event, file, targetDate);
    } else if (currentPlatform === 'myntra') {
      await processAndUploadMyntraPDF(event, file, targetDate);
    } else {
      await processAndUploadPDF(event, file, targetDate);
    }
  };

  const checkExistingData = async (date) => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`/api/sku-inventory?startDate=${date}&endDate=${date}&platform=${currentPlatform}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (data.data && Object.keys(data.data).length > 0) {
        // Calculate summary
        const companies = Object.keys(data.data);
        const totalSKUs = companies.reduce((sum, company) => {
          return sum + Object.keys(data.data[company]).length;
        }, 0);
        const totalQuantity = companies.reduce((sum, company) => {
          return sum + Object.values(data.data[company]).reduce((qtySum, qty) => qtySum + qty, 0);
        }, 0);
        
        return {
          companiesCount: companies.length,
          skuCount: totalSKUs,
          totalQuantity: totalQuantity,
          companies: companies
        };
      }
      return null;
    } catch (err) {
      console.error('Error checking existing data:', err);
      return null;
    }
  };

  const processAndUploadPDF = async (event, file = null, dateStr = null) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress({ percent: 5, message: 'Reading PDF file...' });
    
    try {
      // Get file from state or event target
      const pdfFile = file || selectedFile || (event?.target?.pdf_inventory?.files?.[0]);
      if (!pdfFile) throw new Error('Please select a PDF file');

      setUploadProgress({ percent: 10, message: 'Loading PDF library...' });
      const [pdfjsLib, pdfArrayBuffer] = await Promise.all([
        loadPdfJs(),
        readFileAsArrayBuffer(pdfFile)
      ]);

      setUploadProgress({ percent: 15, message: 'Parsing PDF document...' });
      const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      // Extract text from all pages (15% to 75% of progress)
      const allLines = [];
      for (let i = 1; i <= totalPages; i++) {
        const progress = 15 + Math.floor(((i / totalPages) * 60)); // 15% to 75%
        setUploadProgress({ 
          percent: progress, 
          message: `Extracting SKU from page ${i} of ${totalPages}...` 
        });
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageLines = reconstructLinesFromTextItems(textContent.items || []);
        for (const ln of pageLines) allLines.push(ln);
      }

      setUploadProgress({ percent: 80, message: 'Processing extracted data...' });
      const lines = allLines.filter(line => line.trim() !== '');
      let currentPageLines = [];
      const pages = [];

      for (const line of lines) {
        if (line.match(/Page \d+/) || line.match(/Customer Address/)) {
          if (currentPageLines.length > 0) {
            pages.push(currentPageLines.join('\n'));
            currentPageLines = [];
          }
        }
        currentPageLines.push(line);
      }
      if (currentPageLines.length > 0) {
        pages.push(currentPageLines.join('\n'));
      }

      setUploadProgress({ percent: 85, message: 'Analyzing SKU data...' });
      const results = {};    
      const totalDataPages = pages.length;
      
      for (let pageIndex = 0; pageIndex < totalDataPages; pageIndex++) {
        const progress = 85 + Math.floor(((pageIndex + 1) / totalDataPages) * 10); // 85% to 95%
        setUploadProgress({ 
          percent: progress, 
          message: `Processing SKU data... (${pageIndex + 1}/${totalDataPages})` 
        });
        const pageLines = pages[pageIndex].split('\n');
        let beforCompanyIndex = pageLines.findIndex(line => line.trim().match(/If undelivered, return to:/));
        let companyName = pageLines[beforCompanyIndex + 1]?.trim(); // Trim company name
        if (!companyName) continue; // Skip if no company name found
        
        if(!results[companyName]){
          results[companyName] = {};
        }
        const findSKU = pageLines.findIndex(line => line.match(/SKU/));
        const taxInvoiceIndex = pageLines.indexOf("TAX INVOICE") > 0 ? pageLines.indexOf("TAX INVOICE") : pageLines.length;
        
        for (let i = findSKU + 1; i < taxInvoiceIndex; i++) {
          let dataLine = pageLines[i];
          const freeSizeIndex = dataLine.split("  ").findIndex(item => item.trim() === "Free Size");
          if(freeSizeIndex === -1 ){
            continue;
          }
          let beforeFreeSize = dataLine?.split("  ")[freeSizeIndex - 1]?.trim();
          const qty = dataLine?.split("  ")?.[freeSizeIndex +1]?.trim()?.split(" ")?.[0];
          if(beforeFreeSize === ''){
            beforeFreeSize = pageLines[i-1]
          }
          if(beforeFreeSize == undefined || beforeFreeSize == 'undefined'){
            continue;
          }
          results[companyName][beforeFreeSize] = (results[companyName][beforeFreeSize] || 0) + Number(qty);
        }
      }

      setUploadProgress({ percent: 97, message: 'Uploading to database...' });
      await uploadInventoryData(results, dateStr);
      setUploadProgress({ percent: 100, message: 'Upload complete!' });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to process PDF');
      setUploadProgress({ percent: 0, message: '' });
    } finally {
      setLoading(false);
    }
  };

  // Flipkart PDF parsing for inventory
  const processAndUploadFlipkartPDF = async (event, file = null, dateStr = null) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress({ percent: 5, message: 'Reading Flipkart PDF file...' });
    
    try {
      const pdfFile = file || selectedFile || (event?.target?.pdf_inventory?.files?.[0]);
      if (!pdfFile) throw new Error('Please select a PDF file');

      setUploadProgress({ percent: 10, message: 'Loading PDF library...' });
      const [pdfjsLib, pdfArrayBuffer] = await Promise.all([
        loadPdfJs(),
        readFileAsArrayBuffer(pdfFile)
      ]);

      setUploadProgress({ percent: 15, message: 'Parsing Flipkart PDF document...' });
      const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      const results = {};

      for (let i = 1; i <= totalPages; i++) {
        const progress = 15 + Math.floor(((i / totalPages) * 75));
        setUploadProgress({ 
          percent: progress, 
          message: `Extracting data from page ${i} of ${totalPages}...` 
        });

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const lines = reconstructLinesFromTextItems(textContent.items || []);

        // Check if this is a valid label page
        const hasMarker = lines.some(line => {
          const l = line.toLowerCase();
          return l.includes('customer address') || 
                 l.includes('shipping label') ||
                 l.includes('product id') ||
                 l.includes('tax invoice') ||
                 l.includes('sold by');
        });
        if (!hasMarker) continue;

        // Extract company name from "Sold By:" line
        let companyName = null;
        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];
          if (line.toLowerCase().includes('sold by')) {
            // Try to extract from "Sold By:COMPANY_NAME" on same line
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
              const afterColon = line.substring(colonIndex + 1).trim();
              if (afterColon) {
                // Remove trailing address portions (after comma)
                companyName = afterColon.split(',')[0].trim();
                break;
              }
            }
            // Fallback: next line might have it
            if (j + 1 < lines.length) {
              companyName = lines[j + 1].trim().split(',')[0].trim();
              break;
            }
          }
        }
        if (!companyName) companyName = 'Unknown Company';

        // Extract SKU using same logic as FlipkartSort
        let sku = null;
        const skuHeaderIndex = lines.findIndex(line => line.toUpperCase().includes('SKU ID |'));
        if (skuHeaderIndex !== -1) {
          const nextLine = lines[skuHeaderIndex + 1];
          if (nextLine) {
            const parts = nextLine.split('|');
            if (parts.length > 1) {
              const leftPart = parts[0].trim();
              const skuMatch = leftPart.match(/^\d+\s+(.+)$/);
              if (skuMatch) sku = skuMatch[1].trim();
              else sku = leftPart;
            }
          }
        }
        if (!sku) {
          const SKUIndex = lines.findIndex(line => line.toUpperCase().includes('SKU') || line.toUpperCase().includes('PRODUCT ID'));
          if (SKUIndex !== -1) {
            const line = lines[SKUIndex];
            const nextLine = lines[SKUIndex + 1] || '';
            if (line.includes(':')) {
              const parts = line.split(':');
              if (parts[1] && parts[1].trim().length > 0) sku = parts[1].trim();
            }
            if (!sku) {
              const nextParts = nextLine.trim().split(/\s{2,}/);
              if (nextParts.length > 1) sku = nextParts[1].trim();
              else if (nextParts[0]) sku = nextParts[0].trim();
            }
          }
        }
        if (!sku) continue; // Skip pages where we can't find SKU

        // Extract quantity using same logic as FlipkartSort
        let qty = 1;
        const totalQtyIndex = lines.findIndex(line => 
          line.toUpperCase().includes('TOTAL QTY') || 
          line.toUpperCase().includes('TOTAL QUANTITY')
        );
        if (totalQtyIndex !== -1) {
          const line = lines[totalQtyIndex];
          const match = line.match(/(?:TOTAL QTY|TOTAL QUANTITY)\s*:?\s*(\d+)/i);
          if (match) qty = parseInt(match[1], 10);
          else {
            const nextLine = lines[totalQtyIndex+1] || '';
            const nextMatch = nextLine.match(/(\d+)/);
            if (nextMatch) qty = parseInt(nextMatch[1], 10);
          }
        } else {
          const QtyIndex = lines.findIndex(line => 
            line.toUpperCase().includes('QTY') || 
            line.toUpperCase().includes('QUANTITY')
          );
          if (QtyIndex !== -1) {
            const line = lines[QtyIndex];
            const nextLine = lines[QtyIndex + 1] || '';
            const sameLineMatch = line.match(/(?:Qty|Quantity)\s*:?\s*(\d+)/i);
            if (sameLineMatch) qty = parseInt(sameLineMatch[1], 10);
            else {
              const nextLineMatch = nextLine.match(/(\d+)/);
              if (nextLineMatch) qty = parseInt(nextLineMatch[1], 10);
            }
          }
        }

        // Aggregate results
        if (!results[companyName]) {
          results[companyName] = {};
        }
        results[companyName][sku] = (results[companyName][sku] || 0) + qty;
      }

      if (Object.keys(results).length === 0) {
        throw new Error('No valid Flipkart labels found in this PDF. Make sure you are uploading a Flipkart shipping label PDF.');
      }

      setUploadProgress({ percent: 97, message: 'Uploading to database...' });
      await uploadInventoryData(results, dateStr);
      setUploadProgress({ percent: 100, message: 'Upload complete!' });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to process Flipkart PDF');
      setUploadProgress({ percent: 0, message: '' });
    } finally {
      setLoading(false);
    }
  };


  // Snapdeal PDF parsing for inventory
  const processAndUploadSnapdealPDF = async (event, file = null, dateStr = null) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress({ percent: 5, message: 'Reading Snapdeal PDF file...' });

    try {
      const pdfFile = file || selectedFile || (event?.target?.pdf_inventory?.files?.[0]);
      if (!pdfFile) throw new Error('Please select a PDF file');

      const results = await parseSnapdealPDF({
        pdfFile,
        loadPdfJs,
        readFileAsArrayBuffer,
        reconstructLinesFromTextItems,
        onProgress: (percent, message) => setUploadProgress({ percent, message }),
      });

      setUploadProgress({ percent: 97, message: 'Uploading to database...' });
      await uploadInventoryData(results, dateStr);
      setUploadProgress({ percent: 100, message: 'Upload complete!' });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to process Snapdeal PDF');
      setUploadProgress({ percent: 0, message: '' });
    } finally {
      setLoading(false);
    }
  };

  // Myntra PDF parsing for inventory
  const processAndUploadMyntraPDF = async (event, file = null, dateStr = null) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress({ percent: 5, message: 'Reading Myntra PDF file...' });

    try {
      const pdfFile = file || selectedFile || (event?.target?.pdf_inventory?.files?.[0]);
      if (!pdfFile) throw new Error('Please select a PDF file');

      setUploadProgress({ percent: 10, message: 'Loading PDF library...' });
      const [pdfjsLib, pdfArrayBuffer] = await Promise.all([
        loadPdfJs(),
        readFileAsArrayBuffer(pdfFile)
      ]);

      setUploadProgress({ percent: 15, message: 'Parsing Myntra PDF document...' });
      const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      const results = {};

      for (let i = 1; i <= totalPages; i++) {
        const progress = 15 + Math.floor(((i / totalPages) * 75));
        setUploadProgress({ 
          percent: progress, 
          message: `Extracting data from page ${i} of ${totalPages}...` 
        });

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const lines = reconstructLinesFromTextItems(textContent.items || []);

        // Check if valid Myntra label
        const isMyntraLabel = lines.some(line => {
          const l = line.toLowerCase();
          return l.includes('declare that the goods') || 
                 l.includes('buyer declaration') ||
                 l.includes('buyer\'s name and address') ||
                 l.includes('purchase made') ||
                 l.includes('myntra') ||
                 l.includes('if undelivered');
        });
        if (!isMyntraLabel) continue;

        // Extract company name
        let companyName = null;
        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];
          if (line.toLowerCase().includes('return to:')) {
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
              const afterColon = line.substring(colonIndex + 1).trim();
              if (afterColon) {
                companyName = afterColon.split(',')[0].trim();
                break;
              }
            }
            if (j + 1 < lines.length) {
              companyName = lines[j + 1].trim().split(',')[0].trim();
              break;
            }
          }
        }
        if (!companyName) companyName = 'Myntra Seller';

        // Helper to extract clean SKU lookup string
        const getCleanMyntraSku = (rawStr) => {
          if (!rawStr) return '';
          let str = String(rawStr).trim();
          if (str.startsWith('[') && str.endsWith(']')) {
            str = str.substring(1, str.length - 1).trim();
          }
          const match = str.match(/^(.*?)\s*-\s*([A-Za-z0-9]+)?$/);
          if (match) {
            return match[1].trim();
          }
          return str;
        };

        // Extract items
        const items = [];
        const seen = new Set();

        const addItem = (rawText) => {
          // Split combo SKUs separated by '+', ',', or '&'
          const parts = rawText.includes('+') ? rawText.split('+') 
                      : rawText.includes(',') ? rawText.split(',') 
                      : rawText.includes('&') ? rawText.split('&') 
                      : [rawText];

          for (const part of parts) {
            const cleanSku = getCleanMyntraSku(part);
            let qty = 1;
            const match = part.match(/-\s*(\d+)$/);
            if (match) qty = parseInt(match[1], 10);

            if (cleanSku && cleanSku.length >= 2) {
              const key = `${cleanSku}_${qty}`;
              if (!seen.has(key)) {
                items.push({ sku: cleanSku, qty });
                seen.add(key);
              }
            }
          }
        };

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Pattern 1: Bracketed SKU format (matches single and multi-bracket combos on line)
          const bracketMatches = [...trimmed.matchAll(/\[\s*([A-Za-z0-9_\-\/\.\s\+&,]+?)\s*\]/g)];
          if (bracketMatches.length > 0) {
            for (const match of bracketMatches) {
              const inside = match[1].trim();
              if (!inside.includes(')-(') && !inside.toLowerCase().includes('page')) {
                addItem(inside);
              }
            }
            continue;
          }

          // Pattern 2: Unbracketed SKU format: e.g. "qc_53 -" or "el_1711 - 2"
          const unbracketedMatch = trimmed.match(/^([A-Za-z0-9_\.]{2,35}(?:\s+[A-Za-z0-9_\.]{2,35})?)\s*-\s*(\d+)?$/);
          if (unbracketedMatch) {
            const skuUpper = trimmed.toUpperCase();
            const isExcluded = 
              skuUpper.includes('NORMAL') ||
              skuUpper.includes('FWD') ||
              skuUpper.includes('COD') ||
              skuUpper.includes('PREPAID') ||
              skuUpper.includes('MYNTRA') ||
              skuUpper.includes('NULL') ||
              skuUpper.includes('EK_E2E') ||
              skuUpper.includes('DE_E2E');

            if (!isExcluded) {
              addItem(trimmed);
            }
          }
        }

        if (items.length === 0) continue;

        if (!results[companyName]) {
          results[companyName] = {};
        }

        for (const item of items) {
          if (item.sku) {
            results[companyName][item.sku] = (results[companyName][item.sku] || 0) + item.qty;
          }
        }
      }

      if (Object.keys(results).length === 0) {
        throw new Error('No valid Myntra labels found in this PDF. Make sure you are uploading a Myntra shipping label PDF.');
      }

      setUploadProgress({ percent: 97, message: 'Uploading to database...' });
      await uploadInventoryData(results, dateStr);
      setUploadProgress({ percent: 100, message: 'Upload complete!' });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to process Myntra PDF');
      setUploadProgress({ percent: 0, message: '' });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="p-4 md:p-6 w-full">
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg shadow-sm">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">SKU Management Tools</h1>
                <p className="mt-1 text-sm text-gray-500">Process, manage, and export SKU data efficiently</p>
              </div>
              {status && (
                <div className="flex items-center space-x-2 text-sm">
                  {loading && (
                    <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span className="text-gray-600">{status}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Tabs Navigation */}
        <div className="bg-gray-900 border-b border-gray-700 sticky top-0 z-20 shadow-sm">
          <div className="px-4 overflow-x-auto">
            <nav className="flex space-x-8 min-w-max" aria-label="Main Tabs">
              <button
                onClick={() => {
                  setMainTab('sku_management');
                  if (!['sort', 'meesho-direct', 'amazon', 'flipkart', 'snapdeal', 'myntra', 'excel'].includes(selectedTab)) setSelectedTab('sort');
                }}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                  mainTab === 'sku_management'
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                SKU MANAGEMENT
              </button>
              <button
                onClick={() => {
                  setMainTab('meesho_reconciliation');
                  if (!['inventory', 'cancelled-orders', 'returns', 'customer-returns'].includes(selectedTab)) setSelectedTab('inventory');
                }}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                  mainTab === 'meesho_reconciliation'
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                MEESHO RECONCILIATION
              </button>
              <button
                onClick={() => {
                  setMainTab('flipkart_reconciliation');
                  if (selectedTab !== 'flipkart-inventory') setSelectedTab('flipkart-inventory');
                }}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                  mainTab === 'flipkart_reconciliation'
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                FLIPKART RECONCILIATION
              </button>
              <button
                onClick={() => {
                  setMainTab('snapdeal_reconciliation');
                  if (selectedTab !== 'snapdeal-inventory') setSelectedTab('snapdeal-inventory');
                }}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                  mainTab === 'snapdeal_reconciliation'
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                SNAPDEAL RECONCILIATION
              </button>
              <button
                onClick={() => {
                  setMainTab('myntra_reconciliation');
                  if (selectedTab !== 'myntra-inventory') setSelectedTab('myntra-inventory');
                }}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                  mainTab === 'myntra_reconciliation'
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                MYNTRA RECONCILIATION
              </button>
            </nav>
          </div>
        </div>

        {/* Sub Tabs Navigation */}
        <div className="bg-gray-800 border-b border-gray-700 sticky top-[45px] z-10 shadow-sm">
          <div className="px-4 overflow-x-auto">
            <nav className="flex space-x-8 min-w-max" aria-label="Tabs">
            
            {mainTab === 'sku_management' && (
              <>
            <button
              onClick={() => setSelectedTab('sort')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'sort'
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FaShoppingBag className={`w-5 h-5 ${selectedTab === 'sort' ? 'text-pink-400' : 'text-gray-400'}`} title="Meesho" />
                <span>Meesho Sort</span>
              </div>
            </button>
            {(isMounted && checkFeature('isMeeshoDirectSort')) && (
              <button
                onClick={() => setSelectedTab('meesho-direct')}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                  selectedTab === 'meesho-direct'
                    ? 'border-pink-500 text-pink-400'
                    : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <FaShoppingBag className={`w-5 h-5 ${selectedTab === 'meesho-direct' ? 'text-pink-500' : 'text-gray-400'}`} title="Meesho Direct" />
                  <span>Meesho Direct Sort</span>
                </div>
              </button>
            )}
            <button
              onClick={() => setSelectedTab('amazon')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'amazon'
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center space-x-2">
                <SiAmazon className={`w-5 h-5 ${selectedTab === 'amazon' ? 'text-orange-400' : 'text-gray-400'}`} title="Amazon" />
                <span>Amazon Sort</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedTab('flipkart')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'flipkart'
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center space-x-2">
                <SiFlipkart className={`w-5 h-5 ${selectedTab === 'flipkart' ? 'text-blue-400' : 'text-gray-400'}`} title="Flipkart" />
                <span>Flipkart Sort</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedTab('snapdeal')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'snapdeal'
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FaTag className={`w-5 h-5 ${selectedTab === 'snapdeal' ? 'text-red-400' : 'text-gray-400'}`} title="Snapdeal" />
                <span>Snapdeal Sort</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedTab('myntra')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'myntra'
                  ? 'border-pink-400 text-pink-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FaBoxOpen className={`w-5 h-5 ${selectedTab === 'myntra' ? 'text-pink-400' : 'text-gray-400'}`} title="Myntra" />
                <span>Myntra Sort</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedTab('excel')}
              disabled={!flagsLoading && (!featureFlags || featureFlags.isExcelFromPDF !== true)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'excel'
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              } ${!flagsLoading && (!featureFlags || featureFlags.isExcelFromPDF !== true) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Generate Excel</span>
              </div>
            </button>
              </>
            )}

            {mainTab === 'meesho_reconciliation' && (
              <>
            <button
              onClick={() => setSelectedTab('inventory')}
              disabled={!flagsLoading && !checkFeature('isSKUInventory')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'inventory'
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              } ${!flagsLoading && !checkFeature('isSKUInventory') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span>Meesho Inventory</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedTab('cancelled-orders')}
              disabled={!flagsLoading && !checkFeature('isCancelledOrders')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'cancelled-orders'
                  ? 'border-red-400 text-red-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              } ${!flagsLoading && !checkFeature('isCancelledOrders') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Cancelled Orders</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedTab('returns')}
              disabled={!flagsLoading && !checkFeature('isReturns')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'returns'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              } ${!flagsLoading && !checkFeature('isReturns') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Returns</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedTab('customer-returns')}
              disabled={!flagsLoading && !checkFeature('isCustomerReturns')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'customer-returns'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              } ${!flagsLoading && !checkFeature('isCustomerReturns') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Customer Returns</span>
              </div>
            </button>
              </>
            )}

            {mainTab === 'flipkart_reconciliation' && (
              <>
            <button
              onClick={() => setSelectedTab('flipkart-inventory')}
              disabled={!flagsLoading && !checkFeature('isSKUInventory')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'flipkart-inventory'
                  ? 'border-yellow-400 text-yellow-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              } ${!flagsLoading && !checkFeature('isSKUInventory') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-2">
                <SiFlipkart className={`w-4 h-4 ${selectedTab === 'flipkart-inventory' ? 'text-yellow-400' : 'text-gray-400'}`} />
                <span>Flipkart Inventory</span>
              </div>
            </button>
              </>
            )}

            {mainTab === 'snapdeal_reconciliation' && (
              <>
            <button
              onClick={() => setSelectedTab('snapdeal-inventory')}
              disabled={!flagsLoading && !checkFeature('isSKUInventory')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'snapdeal-inventory'
                  ? 'border-red-400 text-red-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              } ${!flagsLoading && !checkFeature('isSKUInventory') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-2">
                <FaTag className={`w-4 h-4 ${selectedTab === 'snapdeal-inventory' ? 'text-red-400' : 'text-gray-400'}`} />
                <span>Snapdeal Inventory</span>
              </div>
            </button>
              </>
            )}

            {mainTab === 'myntra_reconciliation' && (
              <>
            <button
              onClick={() => setSelectedTab('myntra-inventory')}
              disabled={!flagsLoading && !checkFeature('isSKUInventory')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                selectedTab === 'myntra-inventory'
                  ? 'border-pink-400 text-pink-400'
                  : 'border-transparent text-white hover:text-gray-100 hover:border-gray-500'
              } ${!flagsLoading && !checkFeature('isSKUInventory') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-2">
                <FaBoxOpen className={`w-4 h-4 ${selectedTab === 'myntra-inventory' ? 'text-pink-400' : 'text-gray-400'}`} />
                <span>Myntra Inventory</span>
              </div>
            </button>
              </>
            )}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className={isInventoryTab ? '' : 'px-4 py-6'}>
        {/* Alert Messages */}
        {error && (
          <div className={`mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-md shadow-sm ${isInventoryTab ? 'mx-4 mt-4' : ''}`}>
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {success && (
          <div className={`mb-6 bg-green-50 border-l-4 border-green-400 p-4 rounded-md shadow-sm ${isInventoryTab ? 'mx-4 mt-4' : ''}`}>
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-700">File processed successfully. Check your downloads.</p>
              </div>
            </div>
          </div>
        )}

        <div className={`bg-white ${isInventoryTab ? '' : 'rounded-lg shadow-lg'} overflow-hidden`}>

        {selectedTab === 'sort' && (
          <div className="p-8">
            {allowed === false && (
              <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <p className="text-sm text-yellow-700">This feature is disabled for your company. Please contact your admin.</p>
              </div>
            )}
            <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-6">
              <div>
                <label htmlFor="pdf" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload PDF File
                </label>
                <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
                  selectedPdfFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
                }`}>
                  <div className="space-y-1 text-center w-full">
                    {selectedPdfFile ? (
                      <>
                        <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="mt-3 px-4 py-2 bg-green-100 rounded-lg border border-green-300">
                          <div className="flex items-center justify-start gap-2">
                            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-green-800 truncate" title={selectedPdfFile.name}>
                                {selectedPdfFile.name}
                              </div>
                              <div className="text-xs text-green-700 font-medium mt-0.5">
                                File size: {(selectedPdfFile.size / 1024 / 1024).toFixed(2)} MB
                              </div>
                            </div>
                          </div>
                        </div>
                        <label htmlFor="pdf" className="mt-2 block text-xs text-gray-500 cursor-pointer hover:text-blue-600">
                          Click to change file
                        </label>
                      </>
                    ) : (
                      <>
                        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="flex text-sm text-gray-600">
                          <label htmlFor="pdf" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                            <span>Upload a file</span>
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500">PDF up to 25MB</p>
                      </>
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  id="pdf"
                  name="pdf"
                  accept=".pdf"
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setSelectedPdfFile(file || null);
                  }}
                  className="sr-only"
                />
              </div>
              <div>
                <label htmlFor="csv" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload CSV or Excel File
                </label>
                <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
                  selectedCsvFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
                }`}>
                  <div className="space-y-1 text-center w-full">
                    {selectedCsvFile ? (
                      <>
                        <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="mt-3 px-4 py-2 bg-green-100 rounded-lg border border-green-300">
                          <div className="flex items-center justify-start gap-2">
                            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-green-800 truncate" title={selectedCsvFile.name}>
                                {selectedCsvFile.name}
                              </div>
                              <div className="text-xs text-green-700 font-medium mt-0.5">
                                File size: {(selectedCsvFile.size / 1024).toFixed(2)} KB
                              </div>
                            </div>
                          </div>
                        </div>
                        <label htmlFor="csv" className="mt-2 block text-xs text-gray-500 cursor-pointer hover:text-blue-600">
                          Click to change file
                        </label>
                      </>
                    ) : (
                      <>
                        <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="flex text-sm text-gray-600">
                          <label htmlFor="csv" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                            <span>Upload a file</span>
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500">CSV or Excel (.xlsx, .xls)</p>
                      </>
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  id="csv"
                  name="csv"
                  accept=".csv,.xlsx,.xls"
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setSelectedCsvFile(file || null);
                  }}
                  className="sr-only"
                />
              </div>
              {/* Selected Files Summary */}
              {(selectedPdfFile || selectedCsvFile) && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-medium text-blue-700 mb-2">Ready to process:</p>
                  <div className="space-y-1 text-xs">
                    {selectedPdfFile && (
                      <div className="flex items-center gap-2 text-blue-900">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="font-medium">PDF:</span>
                        <span className="truncate">{selectedPdfFile.name}</span>
                      </div>
                    )}
                    {selectedCsvFile && (
                      <div className="flex items-center gap-2 text-blue-900">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="font-medium">CSV:</span>
                        <span className="truncate">{selectedCsvFile.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || allowed === false || allowed === null || !selectedPdfFile || !selectedCsvFile}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Process Files'
                )}
              </button>
            </form>
          </div>
        )}

        {selectedTab === 'meesho-direct' && (
          <MeeshoDirectSort
            allowed={allowedDirectSort}
            loading={loading}
            setLoading={setLoading}
            setError={setError}
            setSuccess={setSuccess}
            setStatus={setStatus}
            loadPdfJs={loadPdfJs}
            readFileAsArrayBuffer={readFileAsArrayBuffer}
            reconstructLinesFromTextItems={reconstructLinesFromTextItems}
            parseCSV={parseCSV}
            parseExcel={parseExcel}
            findHeaderKeyInsensitive={findHeaderKeyInsensitive}
            readFileAsText={readFileAsText}
          />
        )}

        {selectedTab === 'snapdeal' && (
          <SnapdealSort
            allowed={allowed}
            loading={loading}
            setLoading={setLoading}
            setError={setError}
            setSuccess={setSuccess}
            setStatus={setStatus}
            loadPdfJs={loadPdfJs}
            readFileAsArrayBuffer={readFileAsArrayBuffer}
            readFileAsText={readFileAsText}
            parseCSV={parseCSV}
            parseExcel={parseExcel}
            findHeaderKeyInsensitive={findHeaderKeyInsensitive}
            reconstructLinesFromTextItems={reconstructLinesFromTextItems}
          />
        )}

        {selectedTab === 'amazon' && (
          <AmazonSort
            allowed={allowed}
            loading={loading}
            setLoading={setLoading}
            setError={setError}
            setSuccess={setSuccess}
            setStatus={setStatus}
            loadPdfJs={loadPdfJs}
            readFileAsArrayBuffer={readFileAsArrayBuffer}
            readFileAsText={readFileAsText}
            parseCSV={parseCSV}
            findHeaderKeyInsensitive={findHeaderKeyInsensitive}
            reconstructLinesFromTextItems={reconstructLinesFromTextItems}
          />
        )}

        {selectedTab === 'flipkart' && (
          <FlipkartSort
            allowed={allowed}
            loading={loading}
            setLoading={setLoading}
            setError={setError}
            setSuccess={setSuccess}
            setStatus={setStatus}
            loadPdfJs={loadPdfJs}
            readFileAsArrayBuffer={readFileAsArrayBuffer}
            readFileAsText={readFileAsText}
            parseCSV={parseCSV}
            findHeaderKeyInsensitive={findHeaderKeyInsensitive}
            reconstructLinesFromTextItems={reconstructLinesFromTextItems}
          />
        )}

        {selectedTab === 'myntra' && (
          <MyntraSort
            allowed={allowed}
            loading={loading}
            setLoading={setLoading}
            setError={setError}
            setSuccess={setSuccess}
            setStatus={setStatus}
            loadPdfJs={loadPdfJs}
            readFileAsArrayBuffer={readFileAsArrayBuffer}
            readFileAsText={readFileAsText}
            parseCSV={parseCSV}
            parseExcel={parseExcel}
            findHeaderKeyInsensitive={findHeaderKeyInsensitive}
            reconstructLinesFromTextItems={reconstructLinesFromTextItems}
          />
        )}

        {selectedTab === 'excel' && (
          <>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError(null);
              setSuccess(false);
              setStatus('Reading PDF...');
              try {
                const pdfFile = e.target.pdf_excel.files[0];
                if (!pdfFile) throw new Error('Please select a PDF file');

                const [pdfjsLib, pdfArrayBuffer] = await Promise.all([
                  loadPdfJs(),
                  readFileAsArrayBuffer(pdfFile)
                ]);

                setStatus('Extracting text from PDF...');
                const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
                const pdf = await loadingTask.promise;

                // Extract all text from PDF using your exact script logic
                const allLines = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                  setStatus(`Extracting text from page ${i} of ${pdf.numPages}...`);
                  const page = await pdf.getPage(i);
                  const textContent = await page.getTextContent();
                  const pageLines = reconstructLinesFromTextItems(textContent.items || []);
                  for (const ln of pageLines) allLines.push(ln);
                }

                // Split the text content into pages based on line breaks (exactly as in your script)
                const lines = allLines.filter(line => line.trim() !== '');
                
                let currentPageLines = [];
                const pages = [];

                // Identify pages based on a specific pattern (exactly as in your script)
                for (const line of lines) {
                  // Check for a specific pattern that indicates a new page
                  if (line.match(/Page \d+/) || line.match(/Customer Address/)) {
                    if (currentPageLines.length > 0) {
                      pages.push(currentPageLines.join('\n'));
                      currentPageLines = [];
                    }
                  }
                  currentPageLines.push(line);
                }
                // Push the last page if it exists
                if (currentPageLines.length > 0) {
                  pages.push(currentPageLines.join('\n'));
                }

                setStatus('Processing extracted data...');
                const results = {};    
                
                // Process each page (exactly as in your script)
                for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
                  const pageLines = pages[pageIndex].split('\n'); // Split each page into lines
                  
                  let beforCompanyIndex = pageLines.findIndex(line => line.trim().match(/If undelivered, return to:/));
                  let companyName = pageLines[beforCompanyIndex + 1];
                  if(!results[companyName]){
                    results[companyName] = {};
                  }
                  const findSKU = pageLines.findIndex(line => line.match(/SKU/));

                  const taxInvoiceIndex = pageLines.indexOf("TAX INVOICE") > 0 ? pageLines.indexOf("TAX INVOICE") : pageLines.length;
                  
                  for (let i = findSKU + 1; i < taxInvoiceIndex; i++) {
                    let dataLine = pageLines[i];
                    
                    const freeSizeIndex = dataLine.split("  ").findIndex(item => item.trim() === "Free Size");
                    const kj_403Index = dataLine.indexOf("kj_403");
                    if(freeSizeIndex === -1 ){
                      continue;
                    }

                    let beforeFreeSize = dataLine?.split("  ")[freeSizeIndex - 1]?.trim();
                    
                    const qty = dataLine?.split("  ")?.[freeSizeIndex +1]?.trim()?.split(" ")?.[0];

                    if(beforeFreeSize === ''){
                      beforeFreeSize = pageLines[i-1]
                    }
                    if(beforeFreeSize == undefined || beforeFreeSize == 'undefined'){
                      continue;
                    }
                    results[companyName][beforeFreeSize] = (results[companyName][beforeFreeSize] || 0) + Number(qty);
                  }
                }

              
                setStatus('Generating Excel...');
                const baseName = (pdfFile.name || 'extracted').split('.')?.[0] || 'extracted';
                
                // Define the custom order for the sheets (exactly as in your script)
                const customOrder = [
                 "SHREEJI#", "SHREEJI NEW", "Cosmetic King", "AKIRA_FASHION", "Gajanand_Enterprise",
            "ZXRIZ", "JEWELL SWERA CREATION", "BHAKTI CREATION", "LA'KAILASHA", "ghanshyam_enterprise",
            "FOREIGN FALCON", "HAYAAT ENTERPRISE", "SERENA JEWELLERY", "SAHJANAND ENTERPRISSE",
            "NORDIC CREATION", "KARMA_ENTERPRISE", "SUVRAT ENTERPRISE", "SAHAJ JEWELLERY", "JAY KHODAL CREATION", "SUNSHINECREATION", "Ornexa Enterprise"
                ];

                // Normalize company names by trimming whitespace
                const normalizedCustomOrder = customOrder.map(name => name.trim());

                // Sort the companies based on the custom order
                const sortedCompanies = Object.keys(results).sort((a, b) => {
                  const aTrimmed = a.trim();
                  const bTrimmed = b.trim();
                  const indexA = normalizedCustomOrder.indexOf(aTrimmed);
                  const indexB = normalizedCustomOrder.indexOf(bTrimmed);
                  
                  // Both found in custom order - sort by custom order
                  if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB;
                  }
                  
                  // Only A found in custom order - A comes first
                  if (indexA !== -1) return -1;
                  
                  // Only B found in custom order - B comes first
                  if (indexB !== -1) return 1;
                  
                  // Neither found in custom order - sort alphabetically
                  return aTrimmed.localeCompare(bTrimmed);
                });

                // Create a new workbook
                const workbook = XLSX.utils.book_new();

                for (const company of sortedCompanies) {
                  const skus = results[company];
                  const csvArray = [];
                  
                  // Prepare the header row
                  csvArray.push(["SKU", "Quantity"]);
                  
                  // Sort SKUs alphabetically
                  const sortedSKUs = Object.keys(skus).sort();
                  for (const sku of sortedSKUs) {
                    const quantity = skus[sku];
                    csvArray.push([sku, quantity]);
                  }

                  // Convert the array to a worksheet
                  const worksheet = XLSX.utils.aoa_to_sheet(csvArray);

                  // Center all cells
                  const range = XLSX.utils.decode_range(worksheet['!ref']);
                  for (let R = range.s.r; R <= range.e.r; ++R) {
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                      const address = XLSX.utils.encode_cell({ c: C, r: R });
                      if (!worksheet[address]) continue;
                      worksheet[address].s = { alignment: { horizontal: "center" } };
                    }
                  }

                  // Add the worksheet to the workbook with the company name as the sheet name
                  XLSX.utils.book_append_sheet(workbook, worksheet, company);
                }

                // Generate Excel file
                const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `${baseName}_extracted.xlsx`);
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);

                setSuccess(true);
                setStatus('Done. Excel downloaded.');
              } catch (err) {
                console.error(err);
                setError(err.message || 'Failed to generate Excel');
                setStatus('');
              } finally {
                setLoading(false);
              }
            }} encType="multipart/form-data" className="p-8 space-y-6">
              {!checkFeature('isExcelFromPDF') && (
                <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
                  <p className="text-sm text-yellow-700">Excel generation is disabled for your company. Please contact your admin.</p>
                </div>
              )}
              <div>
                <label htmlFor="pdf_excel" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload PDF File
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-purple-400 transition-colors">
                  <div className="space-y-1 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-gray-600">
                      <label htmlFor="pdf_excel" className="relative cursor-pointer bg-white rounded-md font-medium text-purple-600 hover:text-purple-500">
                        <span>Upload a file</span>
                        <input
                          type="file"
                          id="pdf_excel"
                          name="pdf_excel"
                          accept=".pdf"
                          required
                          className="sr-only"
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">PDF up to 25MB</p>
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !checkFeature('isExcelFromPDF')}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </>
                ) : (
                  'Generate Excel'
                )}
              </button>
            </form>
          </>
        )}

        {selectedTab === 'cancelled-orders' && (
          !checkFeature('isCancelledOrders') ? (
            <div className="p-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <h2 className="text-xl font-semibold text-yellow-800 mb-2">Feature Not Available</h2>
                <p className="text-yellow-700">Cancelled Orders feature is not enabled for your company. Please contact your administrator.</p>
              </div>
            </div>
          ) : (
            <CancelOrder />
          )
        )}

        {selectedTab === 'returns' && (
          !checkFeature('isReturns') ? (
            <div className="p-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <h2 className="text-xl font-semibold text-yellow-800 mb-2">Feature Not Available</h2>
                <p className="text-yellow-700">Returns feature is not enabled for your company. Please contact your administrator.</p>
              </div>
            </div>
          ) : (
            <CancelOrder apiPath="returns" title="Returns" />
          )
        )}

        {selectedTab === 'customer-returns' && (
          !checkFeature('isCustomerReturns') ? (
            <div className="p-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <h2 className="text-xl font-semibold text-yellow-800 mb-2">Feature Not Available</h2>
                <p className="text-yellow-700">Customer Returns feature is not enabled for your company. Please contact your administrator.</p>
              </div>
            </div>
          ) : (
            <CancelOrder apiPath="customer-returns" title="Customer Returns" />
          )
        )}

        {isInventoryTab && (
          !checkFeature('isSKUInventory') ? (
            <div className="p-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <h2 className="text-xl font-semibold text-yellow-800 mb-2">Feature Not Available</h2>
                <p className="text-yellow-700">SKU Inventory feature is not enabled for your company. Please contact your administrator.</p>
              </div>
            </div>
          ) : (
          <div className="p-0 relative">
            
            {/* Full Screen Loading Overlay */}
            {loading && (
              <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center">
                <div className="bg-white rounded-lg p-8 shadow-2xl flex flex-col items-center gap-4 max-w-md mx-4">
                  <div className="relative">
                    <svg className="animate-spin h-16 w-16 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900 mb-1">
                      {status || 'Loading inventory data...'}
                    </p>
                    <p className="text-sm text-gray-500">
                      Please wait, do not refresh the page
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Filters Bar */}
            <div className="bg-white border-b border-gray-200 px-4 py-3">
              {/* Date Range Info */}
              {dateRange.min && dateRange.max && (
                <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-blue-700">
                      Data available from <strong>{formatDate(dateRange.min)}</strong> to <strong>{formatDate(dateRange.max)}</strong>
                    </span>
                  </div>
                  {inventoryData && (
                    <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                      {Object.keys(inventoryData).length} companies loaded
                    </span>
                  )}
                </div>
              )}

              {/* Currently Showing Data */}
              {inventoryData && actualDataDateRange.min && actualDataDateRange.max && (
                <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-green-700">
                      Currently showing data: <strong>{formatDate(actualDataDateRange.min)}</strong> 
                      {actualDataDateRange.min !== actualDataDateRange.max && (
                        <> to <strong>{formatDate(actualDataDateRange.max)}</strong></>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCompanies.length > 0 && (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                        {selectedCompanies.length} {selectedCompanies.length === 1 ? 'company' : 'companies'} selected
                      </span>
                    )}
                    {activeCompanyTab !== 'all' && selectedCompanies.length === 0 && (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                        {activeCompanyTab}
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-4 flex-wrap">
                {/* Date Range Picker with Apply Button */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setTempStartDate(filterStartDate);
                      setTempEndDate(filterEndDate);
                      setShowDateRangePicker(!showDateRangePicker);
                    }}
                    disabled={loading}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:border-gray-400 transition-colors flex items-center gap-2 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-700">
                      {filterStartDate && filterEndDate 
                        ? `${formatDate(filterStartDate)} - ${formatDate(filterEndDate)}`
                        : filterStartDate 
                          ? `From ${formatDate(filterStartDate)}`
                          : filterEndDate
                            ? `Until ${formatDate(filterEndDate)}`
                            : 'Select Date Range'
                      }
                    </span>
                    <svg className={`w-4 h-4 text-gray-600 transition-transform ${showDateRangePicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {/* Date Range Dropdown */}
                  {showDateRangePicker && (
                    <>
                      {/* Backdrop to close dropdown */}
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowDateRangePicker(false)}
                      />
                      
                      {/* Dropdown Content */}
                      <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-20 w-80">
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
                            <input
                              type="date"
                              value={tempStartDate}
                              onChange={(e) => setTempStartDate(e.target.value)}
                              min={dateRange.min}
                              max={dateRange.max}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
                            <input
                              type="date"
                              value={tempEndDate}
                              onChange={(e) => setTempEndDate(e.target.value)}
                              min={dateRange.min}
                              max={dateRange.max}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          
                          {/* Quick Date Range Buttons */}
                          <div className="pt-2 border-t border-gray-200">
                            <p className="text-xs font-medium text-gray-700 mb-2">Quick Select:</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => {
                                  const today = new Date();
                                  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                                  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                                  setTempStartDate(toLocalDateString(firstDay));
                                  setTempEndDate(toLocalDateString(lastDay));
                                }}
                                className="px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                              >
                                This Month
                              </button>
                              <button
                                onClick={() => {
                                  const today = new Date();
                                  const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                                  const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
                                  setTempStartDate(toLocalDateString(firstDay));
                                  setTempEndDate(toLocalDateString(lastDay));
                                }}
                                className="px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                              >
                                Last Month
                              </button>
                              <button
                                onClick={() => {
                                  const today = new Date();
                                  const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
                                  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                                  setTempStartDate(toLocalDateString(threeMonthsAgo));
                                  setTempEndDate(toLocalDateString(lastDay));
                                }}
                                className="px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                              >
                                Last 3 Months
                              </button>
                              <button
                                onClick={() => {
                                  setTempStartDate('');
                                  setTempEndDate('');
                                }}
                                className="px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                              >
                                Clear Dates
                              </button>
                            </div>
                          </div>
                          
                          {/* Apply and Cancel Buttons */}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={async () => {
                                // Update the actual filter states
                                setFilterStartDate(tempStartDate);
                                setFilterEndDate(tempEndDate);
                                setShowDateRangePicker(false);
                                
                                // Fetch data immediately with the new dates
                                // We'll call the fetch logic directly instead of relying on state update
                                if (tempStartDate || tempEndDate || filterCompany || filterSKU) {
                                  try {
                                    setLoading(true);
                                    setError(null);
                                    const token = localStorage.getItem('token');
                                    
                                    // Use temp dates for the query
                                    const needsSplitting = tempStartDate && tempEndDate;
                                    let allData = { data: {}, rawData: [] };
                                    
                                    if (needsSplitting) {
                                      const start = new Date(tempStartDate);
                                      const end = new Date(tempEndDate);
                                      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                                      
                                      if (daysDiff > 60) {
                                        const chunks = splitDateRangeIntoMonths(tempStartDate, tempEndDate);
                                        setStatus(`Loading ${chunks.length} months of data...`);
                                        
                                        for (let i = 0; i < chunks.length; i++) {
                                          const chunk = chunks[i];
                                          setStatus(`Loading ${chunk.label} (${i + 1}/${chunks.length})...`);
                                          
                                          const params = new URLSearchParams();
                                          params.append('startDate', chunk.startDate);
                                          params.append('endDate', chunk.endDate);
                                          if (filterCompany) params.append('companyName', filterCompany);
                                          if (filterSKU) params.append('sku', filterSKU);
                                          params.append('platform', currentPlatform);
                                          
                                          try {
                                            const { data } = await axios.get(`/api/sku-inventory?${params.toString()}`, {
                                              headers: { Authorization: `Bearer ${token}` }
                                            });
                                            
                                            if (data.data) {
                                              Object.keys(data.data).forEach(company => {
                                                if (!allData.data[company]) {
                                                  allData.data[company] = {};
                                                }
                                                Object.keys(data.data[company]).forEach(sku => {
                                                  if (!allData.data[company][sku]) {
                                                    allData.data[company][sku] = 0;
                                                  }
                                                  allData.data[company][sku] += data.data[company][sku];
                                                });
                                              });
                                            }
                                            
                                            if (data.rawData) {
                                              allData.rawData.push(...data.rawData);
                                            }
                                          } catch (chunkErr) {
                                            console.error(`❌ Failed to load ${chunk.label}:`, chunkErr);
                                          }
                                        }
                                        
                                        setStatus('');
                                      } else {
                                        const params = new URLSearchParams();
                                        if (tempStartDate) params.append('startDate', tempStartDate);
                                        if (tempEndDate) params.append('endDate', tempEndDate);
                                        if (filterCompany) params.append('companyName', filterCompany);
                                        if (filterSKU) params.append('sku', filterSKU);
                                        params.append('platform', currentPlatform);

                                        const { data } = await axios.get(`/api/sku-inventory?${params.toString()}`, {
                                          headers: { Authorization: `Bearer ${token}` }
                                        });
                                        
                                        allData = data;
                                      }
                                    } else {
                                      const params = new URLSearchParams();
                                      if (filterCompany) params.append('companyName', filterCompany);
                                      if (filterSKU) params.append('sku', filterSKU);
                                      params.append('platform', currentPlatform);

                                      const { data } = await axios.get(`/api/sku-inventory?${params.toString()}`, {
                                        headers: { Authorization: `Bearer ${token}` }
                                      });
                                      
                                      allData = data;
                                    }
                                    
                                    // Process and set the data
                                    const trimmedData = {};
                                    if (allData.data) {
                                      Object.keys(allData.data).forEach(companyName => {
                                        const trimmedName = companyName.trim();
                                        if (trimmedName) {
                                          trimmedData[trimmedName] = allData.data[companyName];
                                        }
                                      });
                                    }
                                    
                                    const dataByDate = {};
                                    if (allData.rawData && allData.rawData.length > 0) {
                                      allData.rawData.forEach(item => {
                                        const dateStr = new Date(item.selectedDate).toISOString().split('T')[0];
                                        const trimmedCompanyName = (item.companyName || '').trim();
                                        if (!trimmedCompanyName) return;
                                        
                                        if (!dataByDate[dateStr]) {
                                          dataByDate[dateStr] = {};
                                        }
                                        if (!dataByDate[dateStr][trimmedCompanyName]) {
                                          dataByDate[dateStr][trimmedCompanyName] = 0;
                                        }
                                        dataByDate[dateStr][trimmedCompanyName] += (item.quantity || 0);
                                      });
                                    }
                                    
                                    if (allData.rawData && allData.rawData.length > 0) {
                                      const dates = allData.rawData.map(item => new Date(item.selectedDate));
                                      const minDate = new Date(Math.min(...dates));
                                      const maxDate = new Date(Math.max(...dates));
                                      setActualDataDateRange({
                                        min: minDate.toISOString().split('T')[0],
                                        max: maxDate.toISOString().split('T')[0]
                                      });
                                    } else {
                                      setActualDataDateRange({ min: '', max: '' });
                                    }
                                    
                                    setInventoryData(trimmedData);
                                    setInventoryDataByDate(dataByDate);
                                    setError(null);
                                  } catch (err) {
                                    setError(err.response?.data?.message || 'Failed to fetch inventory data');
                                    setInventoryData(null);
                                  } finally {
                                    setLoading(false);
                                  }
                                }
                              }}
                              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => {
                                setTempStartDate(filterStartDate);
                                setTempEndDate(filterEndDate);
                                setShowDateRangePicker(false);
                              }}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Company Filter Dropdown */}
                {availableCompanies.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Company:</label>
                    <select
                      value={filterCompany}
                      onChange={(e) => setFilterCompany(e.target.value)}
                      disabled={loading}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">All Companies</option>
                      {availableCompanies.map(company => (
                        <option key={company} value={company}>{company}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Date Filters - Hidden, replaced by date range picker above */}
                <div className="hidden">
                  <input type="date" value={filterStartDate} readOnly />
                  <input type="date" value={filterEndDate} readOnly />
                </div>
                
                {/* SKU Search */}
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={filterSKU}
                    onChange={(e) => setFilterSKU(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        fetchInventoryData();
                      }
                    }}
                    disabled={loading}
                    placeholder="Search SKU... (Press Enter)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                
                {/* Search Button for SKU */}
                {filterSKU && (
                  <button
                    onClick={() => fetchInventoryData()}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search
                  </button>
                )}
                
                {/* Clear All Filters Button */}
                {(filterStartDate || filterEndDate || filterCompany || filterSKU) && (
                  <button
                    onClick={() => {
                      setFilterStartDate('');
                      setFilterEndDate('');
                      setFilterCompany('');
                      setFilterSKU('');
                      setInventoryData(null);
                      setInventoryDataByDate({});
                    }}
                    disabled={loading}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm flex items-center gap-1 disabled:bg-gray-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear All
                  </button>
                )}

                {/* Loading Indicator */}
                {loading && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                    <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm text-gray-600">{status || 'Loading...'}</span>
                  </div>
                )}

                {/* Spacer */}
                <div className="flex-1"></div>

                {/* Upload Button */}
                <button
                  onClick={async () => {
                    setShowUploadModal(true);
                    // Refresh holidays and uploaded dates when opening modal
                    try {
                      const token = localStorage.getItem('token');
                      // Refresh uploaded dates from filter options
                      const { data: filterData } = await axios.get(`/api/sku-inventory-filters?platform=${currentPlatform}`, {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      const dates = filterData.dates || [];
                      // Normalize dates to YYYY-MM-DD format
                      const normalizedDates = dates.map(date => {
                        if (!date) return null;
                        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                          return date;
                        }
                        try {
                          const dateObj = new Date(date);
                          const year = dateObj.getFullYear();
                          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                          const day = String(dateObj.getDate()).padStart(2, '0');
                          return `${year}-${month}-${day}`;
                        } catch (e) {
                          return date;
                        }
                      }).filter(date => date !== null);
                      setUploadedDates(new Set(normalizedDates));
                      
                      // Refresh holidays
                      if (filterStartDate && filterEndDate) {
                        const cleanStartDate = filterStartDate.split('T')[0];
                        const cleanEndDate = filterEndDate.split('T')[0];
                        const { data } = await axios.get(
                          `/api/sku-inventory/holidays?startDate=${cleanStartDate}&endDate=${cleanEndDate}&platform=${currentPlatform}`,
                          { headers: { Authorization: `Bearer ${token}` } }
                        );
                        if (data.success && data.holidays) {
                          setHolidays(new Set(data.holidays));
                        }
                      }
                    } catch (err) {
                      console.error('Error refreshing data:', err);
                    }
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => setShowDeleteModal(true)}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>

                {/* Download Excel Button */}
                <button
                  onClick={downloadInventoryExcel}
                  disabled={loading || !filterStartDate || !filterEndDate || !inventoryData}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Excel
                </button>
              </div>
            </div>

            {/* Main Content Area with Filter Panel */}
            <div className="flex relative h-[calc(100vh-16rem)]">
              {/* Left Filter Panel - Company List (Draggable) */}
              <div 
                className={`bg-gray-50 border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col ${
                  filterPanelOpen ? 'w-64' : 'w-0 overflow-hidden'
                }`}
              >
                {filterPanelOpen && (
                  <div className="p-3 flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Companies</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleSelectAll}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          disabled={!inventoryData || Object.keys(inventoryData).length === 0}
                        >
                          {selectedCompanies.length === Object.keys(inventoryData || {}).length && selectedCompanies.length > 0 ? 'Deselect All' : 'Select All'}
                        </button>
                        <button
                          onClick={() => setFilterPanelOpen(false)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          title="Close filters"
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  
                  {/* Multi-select Info */}
                  {selectedCompanies.length > 0 && (
                    <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-700 font-medium">
                        {selectedCompanies.length} {selectedCompanies.length === 1 ? 'company' : 'companies'} selected
                      </p>
                    </div>
                  )}
                  
                  {/* All Companies Option */}
                  <button
                    onClick={() => handleCompanySelect('all')}
                    className={`w-full text-left px-3 py-2 rounded-lg mb-2 transition-all ${
                      activeCompanyTab === 'all' && selectedCompanies.length === 0
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">All Companies</span>
                      {inventoryData && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          activeCompanyTab === 'all' && selectedCompanies.length === 0
                            ? 'bg-blue-500 text-white'
                            : 'bg-blue-100 text-blue-600'
                        }`}>
                          {Object.keys(inventoryData).length}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Draggable Company List */}
                  <div className="space-y-2">
                    {(() => {
                      // Get unique list of companies from both customOrder and inventoryData
                      const companiesFromData = inventoryData ? Object.keys(inventoryData) : [];
                      
                      // If customOrder is empty, use default order
                      const baseOrder = customOrder.length > 0 ? customOrder : getDefaultCompanyOrder();
                      
                      // Start with customOrder/default as the base
                      const orderedCompanies = [];
                      
                      // Add companies from baseOrder that exist in availableCompanies or inventoryData
                      for (const company of baseOrder) {
                        if (availableCompanies.includes(company) || companiesFromData.includes(company)) {
                          orderedCompanies.push(company);
                        }
                      }
                      
                      // Add any new companies from data that aren't in baseOrder (alphabetically)
                      const newCompanies = companiesFromData
                        .filter(company => !baseOrder.includes(company))
                        .sort();
                      
                      const sortedCompanies = [...orderedCompanies, ...newCompanies];
                      
                      return sortedCompanies;
                    })().map((company, index) => {
                      const companyData = inventoryData?.[company];
                      const totalQty = companyData ? Object.values(companyData).reduce((sum, qty) => sum + qty, 0) : 0;
                      const skuCount = companyData ? Object.keys(companyData).length : 0;
                      const isSelected = selectedCompanies.includes(company);
                      const isActive = activeCompanyTab === company && selectedCompanies.length === 0;
                      const hasData = !!companyData;
                      
                       return (
                         <div
                           key={company}
                           draggable
                           onDragStart={(e) => handleTabDragStart(e, company)}
                           onDragOver={handleTabDragOver}
                           onDrop={(e) => handleTabDrop(e, company)}
                           className={`w-full rounded-lg transition-all cursor-move group ${
                             isActive || isSelected
                               ? 'bg-blue-600 text-white shadow-md'
                               : hasData
                               ? 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                               : 'bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-200 opacity-60'
                           } ${draggedTabIndex === company ? 'opacity-50 scale-95' : ''}`}
                         >
                          <div className="flex items-start gap-2 px-2 py-2">
                            {/* Checkbox */}
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (hasData) handleCompanySelect(company);
                              }}
                              className={`flex-shrink-0 mt-0.5 ${hasData ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                            >
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                isSelected
                                  ? 'bg-white border-white'
                                  : isActive
                                  ? 'border-blue-300 bg-blue-500'
                                  : hasData
                                  ? 'border-gray-300 bg-white'
                                  : 'border-gray-200 bg-gray-100'
                              }`}>
                                {isSelected && (
                                  <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            
                            {/* Drag Handle */}
                            <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                              isActive || isSelected ? 'text-blue-200' : hasData ? 'text-gray-400' : 'text-gray-300'
                            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                            
                            {/* Company Info */}
                            <div 
                              className="flex-1 min-w-0"
                              onClick={() => hasData && handleCompanyClick(company)}
                            >
                              <div className="text-sm font-medium truncate">{company}</div>
                              <div className={`text-xs mt-1 flex items-center justify-between ${
                                isActive || isSelected ? 'text-blue-100' : hasData ? 'text-gray-500' : 'text-gray-400'
                              }`}>
                                {hasData ? (
                                  <>
                                    <span>{skuCount} SKUs</span>
                                    <span className="font-semibold">{totalQty.toLocaleString()}</span>
                                  </>
                                ) : (
                                  <span className="italic">No data in selected range</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Show "no companies" message only if both availableCompanies and inventoryData are empty */}
                  {(!availableCompanies || availableCompanies.length === 0) && 
                   (!inventoryData || Object.keys(inventoryData).length === 0) && (
                    <div className="text-center py-8">
                      <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <p className="mt-2 text-xs text-gray-500">No companies yet</p>
                      <p className="text-xs text-gray-400">Upload data to see companies</p>
                    </div>
                  )}
                  </div>
                )}
              </div>

              {/* Toggle Button - Show when filter panel is closed */}
              {!filterPanelOpen && (
                <button
                  onClick={() => setFilterPanelOpen(true)}
                  className="absolute left-0 top-4 z-20 bg-white hover:bg-gray-50 border border-gray-200 rounded-r-lg px-2 py-2 shadow-sm transition-all duration-200 group flex items-center gap-1"
                  title="Open filters"
                >
                  <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>
              )}

              {/* Right Content - Date-by-Company Table */}
              <div className="flex-1 p-4 overflow-hidden flex flex-col">
                {!filterStartDate || !filterEndDate ? (
                  <div className="text-center py-16">
                    <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">Select Date Range</h3>
                    <p className="mt-2 text-sm text-gray-500">Please select start and end dates to view data</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-auto flex-1 relative">
                    <table className="min-w-full divide-y divide-gray-200" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                        <thead className="bg-gray-50" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 bg-gray-50" style={{ position: 'sticky', left: 0, top: 0, zIndex: 30, boxShadow: '2px 0 4px rgba(0,0,0,0.1)', width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                              Date
                            </th>
                            {(() => {
                              // Get ordered company list
                              const companiesFromData = inventoryData ? Object.keys(inventoryData) : [];
                              const baseOrder = customOrder.length > 0 ? customOrder : getDefaultCompanyOrder();
                              const orderedCompanies = [];
                              
                              for (const company of baseOrder) {
                                if (availableCompanies.includes(company) || companiesFromData.includes(company)) {
                                  orderedCompanies.push(company);
                                }
                              }
                              
                              const newCompanies = companiesFromData
                                .filter(company => !baseOrder.includes(company))
                                .sort();
                              
                              return [...orderedCompanies, ...newCompanies];
                            })().map(company => (
                              <th key={company} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                <div className="truncate" title={company}>{company}</div>
                            </th>
                            ))}
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-blue-50 border-l-2 border-blue-300 min-w-[80px]" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                              Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                          {generateDateRange(filterStartDate, filterEndDate).map(dateStr => {
                            const isHoliday = holidays.has(dateStr);
                            const dateData = inventoryDataByDate[dateStr] || {};
                            const totalForDate = Object.values(dateData).reduce((sum, count) => sum + count, 0);
                            
                            // Get ordered company list
                            const companiesFromData = inventoryData ? Object.keys(inventoryData) : [];
                            const baseOrder = customOrder.length > 0 ? customOrder : getDefaultCompanyOrder();
                            const orderedCompanies = [];
                            
                            for (const company of baseOrder) {
                              if (availableCompanies.includes(company) || companiesFromData.includes(company)) {
                                orderedCompanies.push(company);
                              }
                            }
                            
                            const newCompanies = companiesFromData
                              .filter(company => !baseOrder.includes(company))
                              .sort();
                            
                            const allCompanies = [...orderedCompanies, ...newCompanies];
                            
                            return (
                              <tr 
                                key={dateStr} 
                                className={`group ${isHoliday ? 'bg-yellow-100 hover:bg-yellow-200' : 'hover:bg-gray-50'}`}
                                onDoubleClick={() => toggleHoliday(dateStr)}
                                title={isHoliday ? 'Double-click to remove holiday' : 'Double-click to mark as holiday'}
                              >
                                <td className={`px-3 py-3 text-sm font-medium border-r border-gray-300 ${
                                  isHoliday 
                                    ? 'text-yellow-900 bg-yellow-100' 
                                    : 'text-gray-900 bg-white'
                                }`} style={{ position: 'sticky', left: 0, zIndex: 1, boxShadow: '2px 0 4px rgba(0,0,0,0.1)', width: '120px', minWidth: '120px', maxWidth: '120px', overflow: 'hidden' }}>
                                  <div className="flex items-center gap-1" style={{ overflow: 'hidden' }}>
                                    <span className="truncate whitespace-nowrap" style={{ flex: '1 1 auto', minWidth: 0 }}>{formatDate(dateStr)}</span>
                                    {isHoliday && (
                                      <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </div>
                                </td>
                                {allCompanies.map(company => {
                                  const quantity = dateData[company] || 0;
                                  return (
                                    <td 
                                      key={`${dateStr}-${company}`} 
                                      className={`px-3 py-3 text-center text-sm ${
                                        isHoliday
                                          ? 'bg-yellow-100 text-yellow-900 font-semibold'
                                          : quantity > 0 
                                            ? 'text-gray-900 font-semibold bg-green-50' 
                                            : 'text-gray-400 bg-red-50'
                                      }`}
                                    >
                                      {quantity > 0 ? quantity.toLocaleString() : '-'}
                                    </td>
                                  );
                                })}
                                <td className={`px-4 py-3 text-center text-sm font-bold border-l-2 border-blue-300 ${
                                  isHoliday
                                    ? 'bg-yellow-100 text-yellow-900'
                                    : totalForDate > 0 
                                      ? 'text-blue-600' 
                                      : 'text-gray-400'
                                }`}>
                                  {totalForDate > 0 ? totalForDate.toLocaleString() : '-'}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                        <tfoot className="bg-gray-50" style={{ position: 'sticky', bottom: 0, zIndex: 10 }}>
                        <tr>
                            <td className="px-3 py-3 text-sm font-bold text-gray-900 border-r border-gray-300 bg-gray-50" style={{ position: 'sticky', left: 0, bottom: 0, zIndex: 40, boxShadow: '2px 0 4px rgba(0,0,0,0.1)', width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                            Total
                          </td>
                            {(() => {
                              // Get ordered company list
                              const companiesFromData = inventoryData ? Object.keys(inventoryData) : [];
                              const baseOrder = customOrder.length > 0 ? customOrder : getDefaultCompanyOrder();
                              const orderedCompanies = [];
                              
                              for (const company of baseOrder) {
                                if (availableCompanies.includes(company) || companiesFromData.includes(company)) {
                                  orderedCompanies.push(company);
                                }
                              }
                              
                              const newCompanies = companiesFromData
                                .filter(company => !baseOrder.includes(company))
                                .sort();
                              
                              return [...orderedCompanies, ...newCompanies];
                            })().map(company => {
                              const totalForCompany = generateDateRange(filterStartDate, filterEndDate).reduce((sum, dateStr) => {
                                const dateData = inventoryDataByDate[dateStr] || {};
                                return sum + (dateData[company] || 0);
                              }, 0);
                              
                              return (
                                <td 
                                  key={company} 
                                  className={`px-3 py-3 text-center text-sm font-bold ${
                                    totalForCompany > 0 
                                      ? 'text-blue-600 bg-green-50' 
                                      : 'text-gray-400 bg-red-50'
                                  }`}
                                >
                                  {totalForCompany > 0 ? totalForCompany.toLocaleString() : '-'}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-center text-sm font-bold text-blue-700 bg-blue-50 border-l-2 border-blue-300">
                              {generateDateRange(filterStartDate, filterEndDate).reduce((sum, dateStr) => {
                                const dateData = inventoryDataByDate[dateStr] || {};
                                return sum + Object.values(dateData).reduce((s, quantity) => s + quantity, 0);
                              }, 0).toLocaleString()}
                            </td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                      💡 Double-click on a date row to mark/unmark it as a holiday
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
                  <style dangerouslySetInnerHTML={{__html: `
                    .react-calendar {
                      width: 100%;
                      border: none;
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                      background: transparent;
                    }
                    .react-calendar__navigation {
                      display: flex;
                      height: 50px;
                      margin-bottom: 1.5em;
                      align-items: center;
                      justify-content: space-between;
                      background: #ffffff;
                      border: 1px solid #e5e7eb;
                      border-radius: 8px;
                      padding: 0 16px;
                    }
                    .react-calendar__navigation button {
                      min-width: 36px;
                      height: 36px;
                      background: #f9fafb;
                      color: #374151;
                      border: 1px solid #e5e7eb;
                      border-radius: 6px;
                      font-size: 14px;
                      font-weight: 500;
                      transition: all 0.15s ease;
                      padding: 0;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                    }
                    .react-calendar__navigation button:hover:not(:disabled) {
                      background: #f3f4f6;
                      border-color: #d1d5db;
                      color: #111827;
                    }
                    .react-calendar__navigation button:disabled {
                      opacity: 0.3;
                      cursor: not-allowed;
                    }
                    .react-calendar__navigation__label {
                      font-size: 15px;
                      font-weight: 600;
                      color: #111827;
                      text-transform: capitalize;
                      pointer-events: none;
                    }
                    .react-calendar__month-view__weekdays {
                      display: flex;
                      margin-bottom: 8px;
                    }
                    .react-calendar__month-view__weekdays__weekday {
                      flex: 1;
                      text-align: center;
                      font-size: 11px;
                      font-weight: 600;
                      color: #6b7280;
                      text-transform: uppercase;
                      letter-spacing: 0.5px;
                      padding: 8px 4px;
                      background: transparent;
                    }
                    .react-calendar__month-view__days {
                      display: grid !important;
                      grid-template-columns: repeat(7, 1fr);
                      gap: 4px;
                    }
                    .react-calendar__tile {
                      padding: 10px 4px;
                      border-radius: 6px;
                      transition: all 0.15s ease;
                      font-size: 14px;
                      font-weight: 500;
                      border: 1px solid transparent;
                      position: relative;
                      min-height: 40px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      background: #ffffff;
                      color: #374151;
                    }
                    .react-calendar__tile--disabled {
                      opacity: 0.25;
                      cursor: not-allowed;
                      background: #f9fafb !important;
                      color: #d1d5db !important;
                    }
                    .react-calendar__tile--active:not(.bg-green-200):not(.bg-yellow-200):not(.bg-red-100) {
                      background: #3b82f6 !important;
                      color: white !important;
                      font-weight: 600;
                      border-color: #2563eb;
                    }
                    .react-calendar__tile--now:not(.bg-green-200):not(.bg-yellow-200):not(.bg-red-100) {
                      background: #eff6ff;
                      font-weight: 600;
                      color: #1e40af;
                      border: 1px solid #93c5fd;
                    }
                    .react-calendar__tile:hover:not(.react-calendar__tile--disabled):not(.selected-date) {
                      background: #f3f4f6;
                      border-color: #d1d5db;
                    }
                    /* Uploaded dates - Green */
                    .react-calendar__tile.bg-green-200 {
                      background: #dcfce7 !important;
                      color: #166534 !important;
                      border: 1px solid #86efac !important;
                      font-weight: 600;
                    }
                    .react-calendar__tile.bg-green-200:hover {
                      background: #bbf7d0 !important;
                      border-color: #4ade80 !important;
                    }
                    /* Holiday dates - Yellow */
                    .react-calendar__tile.bg-yellow-200 {
                      background: #fef9c3 !important;
                      color: #854d0e !important;
                      border: 1px solid #fde047 !important;
                      font-weight: 600;
                    }
                    .react-calendar__tile.bg-yellow-200:hover {
                      background: #fef08a !important;
                      border-color: #facc15 !important;
                    }
                    /* Pending dates - Red */
                    .react-calendar__tile.bg-red-100 {
                      background: #fee2e2 !important;
                      color: #991b1b !important;
                      border: 1px solid #fca5a5 !important;
                      font-weight: 500;
                    }
                    .react-calendar__tile.bg-red-100:hover {
                      background: #fecaca !important;
                      border-color: #f87171 !important;
                    }
                    /* Disabled/Future dates */
                    .react-calendar__tile.bg-gray-100 {
                      background: #f9fafb !important;
                      color: #9ca3af !important;
                      border: 1px solid #e5e7eb !important;
                    }
                    /* Selected date styling - clean dark border */
                    .react-calendar__tile.selected-date {
                      box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.1) !important;
                      outline: 2px solid #111827 !important;
                      outline-offset: 2px !important;
                      z-index: 10 !important;
                      position: relative !important;
                      font-weight: 700 !important;
                    }
                    /* Ensure selected date border is visible on all background colors */
                    .react-calendar__tile.selected-date.bg-green-200,
                    .react-calendar__tile.selected-date.bg-yellow-200,
                    .react-calendar__tile.selected-date.bg-red-100 {
                      box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.1) !important;
                      outline: 2px solid #111827 !important;
                      outline-offset: 2px !important;
                    }
                    /* Neighboring month dates */
                    .react-calendar__month-view__days__day--neighboringMonth {
                      opacity: 0.3;
                    }
                  `}} />
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Upload SKU Data</h3>
                    <button
                      onClick={() => {
                        if (!loading) {
                          setShowUploadModal(false);
                          setSelectedFile(null);
                          setMarkAsHoliday(false);
                        }
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <form onSubmit={handleInventoryUpload} data-upload-form="true" className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Date <span className="text-red-500">*</span>
                      </label>
                      <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                        <Calendar
                          onChange={(date) => {
                            // Convert to local date string (YYYY-MM-DD)
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const dateStr = `${year}-${month}-${day}`;
                            setSelectedDate(dateStr);
                          }}
                          value={selectedDate ? (() => {
                            const parts = selectedDate.split('-').map(Number);
                            return new Date(parts[0], parts[1] - 1, parts[2]);
                          })() : new Date()}
                          maxDate={new Date()}
                          tileDisabled={({ date, view }) => {
                            if (view === 'month') {
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              const dateStr = `${year}-${month}-${day}`;
                              const today = new Date();
                              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                              return dateStr > todayStr;
                            }
                            return false;
                          }}
                          tileClassName={({ date, view }) => {
                            if (view === 'month') {
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              const dateStr = `${year}-${month}-${day}`;
                              const today = new Date();
                              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                              
                              // Check if this is the selected date
                              const isSelected = selectedDate === dateStr;
                              
                              // Disable future dates
                              if (dateStr > todayStr) {
                                return 'opacity-50 cursor-not-allowed bg-gray-100';
                              }
                              
                              const isUploaded = uploadedDates.has(dateStr);
                              const isHoliday = holidays.has(dateStr);
                              
                              // Build base classes
                              let classes = '';
                              
                              // Priority 1: Green for uploaded dates (even if it's also a holiday)
                              if (isUploaded) {
                                classes = 'bg-green-200 hover:bg-green-300 text-green-900 font-bold border-2 border-green-400';
                              }
                              // Priority 2: Yellow for holidays (only if not uploaded)
                              else if (isHoliday) {
                                classes = 'bg-yellow-200 hover:bg-yellow-300 text-yellow-900 font-bold border-2 border-yellow-400';
                              }
                              // Priority 3: Red for pending (not uploaded, not holiday, not future)
                              else if (dateStr <= todayStr) {
                                classes = 'bg-red-100 hover:bg-red-200 text-red-800 font-medium border border-red-300';
                              }
                              
                              // Add dark border for selected date (highest priority visual indicator)
                              if (isSelected) {
                                classes += ' selected-date';
                              }
                              
                              return classes;
                            }
                            return '';
                          }}
                          className="w-full border-0"
                        />
                      </div>
                      {/* Legend */}
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Legend:</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 bg-green-100 border border-green-400 rounded"></span>
                            <span className="text-gray-600">Uploaded</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 bg-yellow-100 border border-yellow-400 rounded"></span>
                            <span className="text-gray-600">Holiday</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 bg-red-100 border border-red-400 rounded"></span>
                            <span className="text-gray-600">Pending</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 bg-gray-100 border border-gray-300 rounded opacity-50"></span>
                            <span className="text-gray-600">Future</span>
                          </div>
                        </div>
                      </div>
                      {/* Selected date status */}
                      {selectedDate && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {uploadedDates.has(selectedDate) && (
                            <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded text-xs font-medium border border-green-300">
                              ✓ Data Uploaded
                            </span>
                          )}
                          {holidays.has(selectedDate) && (
                            <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium border border-yellow-300">
                              Holiday
                            </span>
                          )}
                          {!uploadedDates.has(selectedDate) && !holidays.has(selectedDate) && (
                            <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-medium border border-red-300">
                              Pending Upload
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Holiday checkbox */}
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="markAsHoliday"
                        checked={markAsHoliday}
                        onChange={(e) => setMarkAsHoliday(e.target.checked)}
                        disabled={loading}
                        className="h-4 w-4 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded"
                      />
                      <label htmlFor="markAsHoliday" className="ml-2 block text-sm text-gray-700">
                        Mark this date as holiday
                      </label>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload PDF <span className="text-red-500">*</span>
                      </label>
                      <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        selectedFile 
                          ? 'border-green-400 bg-green-50' 
                          : 'border-gray-300 hover:border-blue-400'
                      }`}>
                        <input
                          type="file"
                          id="pdf_inventory_modal"
                          name="pdf_inventory"
                          accept=".pdf"
                          required
                          disabled={loading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSelectedFile(file);
                            } else {
                              setSelectedFile(null);
                            }
                          }}
                          className="hidden"
                        />
                        <label htmlFor="pdf_inventory_modal" className="cursor-pointer block">
                          {selectedFile && selectedFile.name ? (
                            <>
                              <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <div className="mt-3 px-4 py-2 bg-green-100 rounded-lg border border-green-300">
                                <div className="flex items-center justify-start gap-2">
                                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-green-800 truncate" title={selectedFile.name}>
                                      {selectedFile.name}
                                    </div>
                                    <div className="text-xs text-green-700 font-medium mt-0.5">
                                      File size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <span className="mt-2 block text-xs text-gray-500">
                                Click to change file
                              </span>
                            </>
                          ) : (
                            <>
                              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <span className="mt-2 block text-sm text-gray-600">
                                Click to upload PDF
                              </span>
                              <span className="mt-1 block text-xs text-gray-500">
                                PDF files up to 25MB
                              </span>
                            </>
                          )}
                        </label>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {loading && uploadProgress.message && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 font-medium">{uploadProgress.message}</span>
                          <span className="text-blue-600 font-bold">{uploadProgress.percent}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2"
                            style={{ width: `${uploadProgress.percent}%` }}
                          >
                            {uploadProgress.percent > 10 && (
                              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {status && !loading && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700">{status}</p>
                      </div>
                    )}

                    {/* Selected File Display */}
                    {selectedFile && selectedFile.name && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-green-700 mb-0.5">Selected File:</p>
                            <p className="text-sm font-semibold text-green-900 truncate" title={selectedFile.name}>
                              {selectedFile.name}
                            </p>
                            <p className="text-xs text-green-700 mt-0.5">
                              Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={loading || !selectedFile}
                        className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        {loading ? 'Processing...' : selectedFile && selectedFile.name ? `Upload ${selectedFile.name.length > 20 ? selectedFile.name.substring(0, 20) + '...' : selectedFile.name}` : 'Upload'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowUploadModal(false);
                          setSelectedFile(null);
                          setMarkAsHoliday(false);
                        }}
                        disabled={loading}
                        className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg max-w-md w-full p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <h3 className="text-lg font-bold text-gray-900">Delete SKU Data</h3>
                    </div>
                    <button
                      onClick={() => {
                        if (!loading) {
                          setShowDeleteModal(false);
                          setDeleteDate('');
                        }
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Warning Box */}
                    <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                      <div className="flex items-start">
                        <svg className="w-6 h-6 text-red-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <h4 className="text-sm font-bold text-red-900 mb-1">⚠️ Permanent Action</h4>
                          <p className="text-sm text-red-800">
                            This will <strong>permanently delete ALL SKU data</strong> for the selected date, including:
                          </p>
                          <ul className="text-sm text-red-800 mt-2 ml-4 space-y-1 list-disc">
                            <li>All company data</li>
                            <li>All SKU records</li>
                            <li>All quantity information</li>
                          </ul>
                          <p className="text-sm text-red-900 font-semibold mt-2">
                            This action CANNOT be undone!
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Date Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Date to Delete <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={deleteDate}
                        onChange={(e) => setDeleteDate(e.target.value)}
                        disabled={loading || availableDates.length === 0}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-base"
                      >
                        <option value="">-- Choose a date to delete --</option>
                        {availableDates.map(date => (
                          <option key={date} value={date}>
                            {formatDate(date)}
                          </option>
                        ))}
                      </select>
                      {availableDates.length === 0 && (
                        <p className="text-sm text-gray-500 mt-2 italic">No data available to delete</p>
                      )}
                      {deleteDate && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm text-yellow-800">
                            <strong>You are about to delete:</strong> All data for {formatDate(deleteDate)}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => {
                          if (deleteDate) {
                            deleteInventoryDataByDate(deleteDate);
                          }
                        }}
                        disabled={loading || !deleteDate}
                        className="flex-1 py-3 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-bold text-sm flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <>
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Deleting...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Yes, Delete Permanently
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteModal(false);
                          setDeleteDate('');
                        }}
                        disabled={loading}
                        className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Overwrite Warning Modal */}
            {showOverwriteWarning && existingDataInfo && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg max-w-lg w-full p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Data Already Exists</h3>
                    </div>
                    <button
                      onClick={() => {
                        setShowOverwriteWarning(false);
                        setExistingDataInfo(null);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Warning Message */}
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                      <div className="flex">
                        <div className="ml-3">
                          <p className="text-sm text-yellow-800">
                            <strong className="font-semibold">Warning:</strong> Data already exists for the selected date <strong>{formatDate(selectedDate)}</strong>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Existing Data Summary */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3">Current Data Summary:</h4>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-blue-600">{existingDataInfo.companiesCount}</div>
                          <div className="text-xs text-gray-600 mt-1">Companies</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-blue-600">{existingDataInfo.skuCount}</div>
                          <div className="text-xs text-gray-600 mt-1">SKUs</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-blue-600">{existingDataInfo.totalQuantity.toLocaleString()}</div>
                          <div className="text-xs text-gray-600 mt-1">Total Qty</div>
                        </div>
                      </div>
                      
                      {/* Company List */}
                      <div className="mt-3 max-h-40 overflow-y-auto">
                        <p className="text-xs font-medium text-gray-700 mb-2">Existing Companies:</p>
                        <div className="flex flex-wrap gap-2">
                          {existingDataInfo.companies.map(company => (
                            <span key={company} className="px-2 py-1 bg-white text-xs text-gray-700 rounded border border-gray-200">
                              {company}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Warning about overwrite */}
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-800">
                        <strong className="font-semibold">⚠️ Important:</strong> Uploading new data will <strong className="underline">ADD TO</strong> the existing data for this date. If you want to replace it completely, please delete the existing data first.
                      </p>
                    </div>

                    {/* Holiday checkbox in overwrite modal */}
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="markAsHolidayOverwrite"
                        checked={markAsHoliday}
                        onChange={(e) => setMarkAsHoliday(e.target.checked)}
                        disabled={loading}
                        className="h-4 w-4 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded"
                      />
                      <label htmlFor="markAsHolidayOverwrite" className="ml-2 block text-sm text-gray-700">
                        Mark this date as holiday
                      </label>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={async () => {
                          setShowOverwriteWarning(false);
                          setExistingDataInfo(null);
                          // Process upload using selectedFile state
                          await processAndUploadPDF();
                        }}
                        className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Yes, Add to Existing Data
                      </button>
                      <button
                        onClick={() => {
                          setShowOverwriteWarning(false);
                          setExistingDataInfo(null);
                        }}
                        className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
