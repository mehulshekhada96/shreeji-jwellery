import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { isUnifiedReturnsFile, parseUnifiedReturnsRows, DEFAULT_RETURN_KEYWORDS } from '../lib/unifiedReturnsParser';

export default function CancelOrder({ apiPath = 'cancelled-orders', title = 'Cancelled Orders', platform = 'meesho' }) {
  const apiBase = `/api/${apiPath}`;
  const isReturnsTab = apiPath === 'returns' || apiPath === 'customer-returns';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState('');
  
  // Data States
  const [viewData, setViewData] = useState({}); // Aggregated data: { Company: { SKU: Qty } }
  const [rawData, setRawData] = useState([]); // Raw list of orders
  const [viewDataByDate, setViewDataByDate] = useState({}); // { Date: { Company: Qty } }
  const [uploadedDates, setUploadedDates] = useState(new Set());
  const [holidays, setHolidays] = useState(new Set());
  
  // Filter States
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterSKU, setFilterSKU] = useState('');
  const [dateRange, setDateRange] = useState({ min: '', max: '' });
  
  // UI States
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [activeCompanyTab, setActiveCompanyTab] = useState('all');
  const [customOrder, setCustomOrder] = useState([]);
  const [tempCustomOrder, setTempCustomOrder] = useState([]);
  const [draggedTabIndex, setDraggedTabIndex] = useState(null);
  
  // Modal States
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);

  // Return Keywords States
  const [returnKeywords, setReturnKeywords] = useState({}); // { 'RET': 'customer', ... }
  const [returnKeywordsList, setReturnKeywordsList] = useState([]);
  const [showKeywordsManagerModal, setShowKeywordsManagerModal] = useState(false);
  const [showKeywordPromptModal, setShowKeywordPromptModal] = useState(false);
  const [unrecognizedKeywords, setUnrecognizedKeywords] = useState([]);
  const [pendingKeywordMappings, setPendingKeywordMappings] = useState({});
  const [saveKeywordsToDb, setSaveKeywordsToDb] = useState(true);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [newKeywordCategory, setNewKeywordCategory] = useState('customer');

  // Pre-Upload Portals Confirmation Modal States
  const [showUploadConfirmModal, setShowUploadConfirmModal] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null); // { targetDate, rawData, markAsHoliday, parsed }

  // Cascade Deletion States
  const [deleteScope, setDeleteScope] = useState('all'); // 'all' (all portals) or 'current' (current platform only)
  
  // Upload/Mapping States
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadDate, setUploadDate] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [markAsHoliday, setMarkAsHoliday] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ percent: 0, message: '' });
  const [extractedData, setExtractedData] = useState([]);
  const [emailMappings, setEmailMappings] = useState([]);
  const [unmappedEmails, setUnmappedEmails] = useState(new Set());
  const [editingMapping, setEditingMapping] = useState(null);
  const [unifiedSummary, setUnifiedSummary] = useState(null);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [deleteDate, setDeleteDate] = useState('');

  // Initialize
  useEffect(() => {
    initializeView();
    fetchEmailMappings();
    if (isReturnsTab) {
      fetchReturnKeywords();
    }
    fetchCustomOrder();
    fetchUploadedDates();
  }, [platform]);

  // Fetch data when filters change
  useEffect(() => {
    if (filterStartDate || filterEndDate) {
      const timer = setTimeout(() => {
        fetchCancelledOrders();
        fetchHolidays();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [filterStartDate, filterEndDate, filterCompany, filterSKU, platform]);

  const initializeView = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    setFilterStartDate(formatDateToISO(firstDay));
    setFilterEndDate(formatDateToISO(lastDay));
  };

  const formatDateToISO = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const fetchCustomOrder = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('/api/company-order-preference', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setCustomOrder(data.customOrder || []);
        setTempCustomOrder(data.customOrder || []);
      }
    } catch (err) {
      console.error('Error fetching custom order:', err);
    }
  };

  const fetchEmailMappings = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('/api/company-email-mapping', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setEmailMappings(data.mappings || []);
      }
    } catch (err) {
      console.error('Error fetching email mappings:', err);
    }
  };

  const fetchReturnKeywords = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('/api/return-keyword-mapping', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success && Array.isArray(data.mappings)) {
        setReturnKeywordsList(data.mappings);
        const map = {};
        data.mappings.forEach(m => {
          if (m.keyword && m.category) {
            map[m.keyword.toUpperCase()] = m.category;
          }
        });
        setReturnKeywords(map);
      }
    } catch (err) {
      console.error('Error fetching return keywords:', err);
    }
  };

  const handleSaveKeywordMapping = async (keyword, category) => {
    try {
      const token = localStorage.getItem('token');
      const kw = String(keyword || newKeywordInput).trim().toUpperCase();
      const cat = String(category || newKeywordCategory).toLowerCase();
      if (!kw) return;
      await axios.post('/api/return-keyword-mapping', { keyword: kw, category: cat }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchReturnKeywords();
      setNewKeywordInput('');
    } catch (err) {
      console.error('Error saving return keyword:', err);
      setError('Failed to save return keyword');
    }
  };

  const handleDeleteKeywordMapping = async (id, keyword) => {
    if (!confirm(`Delete keyword mapping "${keyword}"?`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete('/api/return-keyword-mapping', {
        data: { id, keyword },
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchReturnKeywords();
    } catch (err) {
      console.error('Error deleting return keyword:', err);
      setError('Failed to delete return keyword');
    }
  };

  const fetchUploadedDates = async () => {
    try {
      const token = localStorage.getItem('token');
      // Fetch all dates by using a wide range
      const { data } = await axios.get(`${apiBase}?startDate=2020-01-01&endDate=2099-12-31&platform=${platform}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (data.success && data.rawData) {
        const dates = new Set();
        const dateStrings = [];
        
        data.rawData.forEach(order => {
          if (order.startDate) {
            const dateStr = order.startDate.split('T')[0];
            dates.add(dateStr);
            dateStrings.push(dateStr);
          }
        });
        
        setUploadedDates(dates);
        
        if (dateStrings.length > 0) {
          const sortedDates = [...dateStrings].sort();
          setDateRange({ min: sortedDates[0], max: sortedDates[sortedDates.length - 1] });
        }
      }
    } catch (err) {
      console.error('Error fetching uploaded dates:', err);
    }
  };

  const fetchHolidays = async () => {
    if (!filterStartDate || !filterEndDate) return;
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(
        `/api/sku-inventory/holidays?startDate=${filterStartDate}&endDate=${filterEndDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (data.success && data.holidays) {
        setHolidays(new Set(data.holidays));
      }
    } catch (err) {
      console.error('Error fetching holidays:', err);
    }
  };

  const fetchCancelledOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);
      if (filterCompany) params.append('companyName', filterCompany);
      if (filterSKU) params.append('sku', filterSKU);
      params.append('platform', platform);

      const { data } = await axios.get(`${apiBase}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (data.success) {
        setViewData(data.data); // Aggregated by Company -> SKU
        setRawData(data.rawData);
        
        // Process data for Date x Company matrix
        const byDate = {};
        data.rawData.forEach(item => {
          const dateStr = item.startDate.split('T')[0];
          const company = item.companyName;
          
          if (!byDate[dateStr]) byDate[dateStr] = {};
          if (!byDate[dateStr][company]) byDate[dateStr][company] = 0;
          
          byDate[dateStr][company] += item.quantity;
        });
        setViewDataByDate(byDate);
        setError(null);
      }
    } catch (err) {
      console.error(`Error fetching ${title.toLowerCase()}:`, err);
      setError(err.response?.data?.message || `Failed to fetch ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  // --- Helper Functions ---

  const generateDateRange = (start, end) => {
    if (!start || !end) return [];
    const dates = [];
    const current = new Date(start);
    const endDateObj = new Date(end);
    
    while (current <= endDateObj) {
      dates.push(formatDateToISO(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  const getDefaultCompanyOrder = () => {
    return [
      "SHREEJI#", "SHREEJI NEW", "Cosmetic King", "AKIRA_FASHION", "Gajanand_Enterprise",
      "ZXRIZ", "JEWELL SWERA CREATION", "BHAKTI CREATION", "LA'KAILASHA", "ghanshyam_enterprise",
      "FOREIGN FALCON", "HAYAAT ENTERPRISE", "SERENA JEWELLERY", "SAHJANAND ENTERPRISSE",
      "NORDIC CREATION", "KARMA_ENTERPRISE", "SUVRAT ENTERPRISE", "SAHAJ JEWELLERY", 
      "JAY KHODAL CREATION", "SUNSHINECREATION", "Ornexa Enterprise"
    ];
  };

  // --- Drag and Drop Logic ---

  const handleTabDragStart = (e, company) => {
    setDraggedTabIndex(company);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', company);
  };

  const handleTabDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTabDrop = async (e, dropCompany) => {
    e.preventDefault();
    const dragCompany = draggedTabIndex;
    
    if (!dragCompany || dragCompany === dropCompany) return;
    
    const companiesFromData = viewData ? Object.keys(viewData) : [];
    const baseOrder = customOrder.length > 0 ? customOrder : getDefaultCompanyOrder();
    
    const orderedCompanies = [];
    for (const company of baseOrder) {
      if (companiesFromData.includes(company)) {
        orderedCompanies.push(company);
      }
    }
    const newCompanies = companiesFromData
      .filter(company => !baseOrder.includes(company))
      .sort();
    const currentVisibleOrder = [...orderedCompanies, ...newCompanies];
    
    const dragIndex = currentVisibleOrder.indexOf(dragCompany);
    const dropIndex = currentVisibleOrder.indexOf(dropCompany);
    
    if (dragIndex === -1 || dropIndex === -1) return;
    
    const newOrder = [...currentVisibleOrder];
    const [removed] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    
    const cleanedOrder = [...new Set(newOrder.map(name => name?.trim()).filter(name => name))];
    
    setCustomOrder(cleanedOrder);
    setTempCustomOrder(cleanedOrder);
    setDraggedTabIndex(null);
    
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/company-order-preference', 
        { customOrder: cleanedOrder },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(true);
      setStatus('Company order saved successfully');
      setTimeout(() => { setSuccess(false); setStatus(''); }, 2000);
    } catch (err) {
      console.error('Failed to save reordered tabs:', err);
      setError('Failed to save company order');
    }
  };

  // --- Selection Logic ---

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
    if (!viewData) return;
    const allCompanies = Object.keys(viewData);
    if (selectedCompanies.length === allCompanies.length) {
      setSelectedCompanies([]);
    } else {
      setSelectedCompanies(allCompanies);
      setActiveCompanyTab('');
    }
  };

  const toggleHoliday = async (dateStr) => {
    try {
      const token = localStorage.getItem('token');
      const isHoliday = holidays.has(dateStr);
      
      if (isHoliday) {
        await axios.delete(`/api/sku-inventory/holidays?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const newHolidays = new Set(holidays);
        newHolidays.delete(dateStr);
        setHolidays(newHolidays);
      } else {
        await axios.post('/api/sku-inventory/holidays', 
          { date: dateStr },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const newHolidays = new Set(holidays);
        newHolidays.add(dateStr);
        setHolidays(newHolidays);
      }
    } catch (err) {
      console.error('Error toggling holiday:', err);
      setError('Failed to update holiday');
    }
  };

  // --- Upload & Mapping Logic ---

  const findHeaderKeyInsensitive = (row, target) => {
    const keys = Object.keys(row || {});
    return keys.find(k => (k || '').trim().toUpperCase() === target.toUpperCase());
  };

  /** Try multiple possible header names (case-insensitive); returns first match. */
  const findHeaderKeyFromAlternatives = (row, alternatives) => {
    if (!row || !Array.isArray(alternatives)) return null;
    for (const name of alternatives) {
      const key = findHeaderKeyInsensitive(row, name);
      if (key) return key;
    }
    return null;
  };

  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileUpload = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress({ percent: 10, message: 'Reading Excel file...' });

    try {
      const file = selectedFile || event.target.excel_file?.files?.[0];
      if (!file) throw new Error('Please select an Excel file');
      
      // Validate date
      if (!uploadDate) throw new Error('Please select a date');
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      if (uploadDate > todayStr) throw new Error('Cannot upload for future dates');

      setUploadProgress({ percent: 30, message: 'Parsing Excel...' });
      const arrayBuffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      // Try with first row as headers; if required columns missing, try raw rows and find header row
      let data = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      if (data.length === 0) throw new Error('Excel file is empty');

      const firstRow = data[0];

      // Check for Unified Order Report (Only for Returns and Customer Returns tabs)
      if (isReturnsTab && isUnifiedReturnsFile(firstRow)) {
        setUploadProgress({ percent: 45, message: 'Detected Unified Order Report. Classifying returns across all portals...' });

        const parsed = parseUnifiedReturnsRows(data, {
          emailMappings,
          defaultDate: uploadDate,
          useSelectedDateOnly: true,
          customKeywords: returnKeywords
        });

        // Step 1: Check for unrecognized return types
        if (parsed.unrecognizedReturnTypes && parsed.unrecognizedReturnTypes.length > 0) {
          setUnrecognizedKeywords(parsed.unrecognizedReturnTypes);
          const initialMap = {};
          parsed.unrecognizedReturnTypes.forEach(word => {
            const w = word.toUpperCase();
            initialMap[w] = (w.includes('RTO') || w.includes('COURIER')) ? 'rto' : 'customer';
          });
          setPendingKeywordMappings(initialMap);
          setPendingUploadData({
            targetDate: uploadDate,
            rawData: data,
            markAsHoliday,
            parsed
          });
          setUploadProgress({ percent: 50, message: 'Unrecognized return words detected...' });
          setShowKeywordPromptModal(true);
          setLoading(false);
          return;
        }

        // Step 2: Check for unmapped email/stores
        if (parsed.unmapped && parsed.unmapped.length > 0) {
          const unmappedSet = new Set(parsed.unmapped.map(u => u.email));
          setUnmappedEmails(unmappedSet);
          setPendingUploadData({
            targetDate: uploadDate,
            rawData: data,
            markAsHoliday,
            parsed
          });
          setUploadProgress({ percent: 60, message: 'Mapping required...' });
          setError(`Found ${unmappedSet.size} unmapped email(s)/store(s). Please map them to companies.`);
          setShowMappingModal(true);
          setLoading(false);
          return;
        }

        // Step 3: All clear -> Show Pre-Upload Confirmation Modal (Portals Confirmation Modal)
        // Do NOT save to database yet!
        const targetDate = uploadDate;
        setPendingUploadData({
          targetDate,
          rawData: data,
          markAsHoliday,
          parsed
        });
        setUploadProgress({ percent: 100, message: 'Ready for confirmation!' });
        setShowUploadModal(false);
        setShowUploadConfirmModal(true);
        setLoading(false);
        return;
      }
      let styleIdKey = findHeaderKeyFromAlternatives(firstRow, ['Style Id', 'Style ID', 'SKU', 'Item', 'Product Code', 'Product', 'StyleId']);
      let quantityKey = findHeaderKeyFromAlternatives(firstRow, ['Quantity', 'Qty', 'Qty.', 'Count', 'Units', 'Return Qty']);
      let companyKey = findHeaderKeyFromAlternatives(firstRow, ['Company', 'Company Name', 'Seller', 'Vendor', 'Seller Name', 'CompanyName']);

      if (!styleIdKey || !quantityKey || !companyKey) {
        // Fallback: sheet may have title row then headers (e.g. row 0 = title, row 1 = headers)
        const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        const altSku = ['Style Id', 'Style ID', 'SKU', 'Item', 'Product Code', 'Product', 'StyleId'];
        const altQty = ['Quantity', 'Qty', 'Qty.', 'Count', 'Units', 'Return Qty'];
        const altCompany = ['Company', 'Company Name', 'Seller', 'Vendor', 'Seller Name', 'CompanyName'];
        const findColIndexByHeaderValue = (row, alternatives) => {
          const rowArr = Array.isArray(row) ? row : (row && typeof row === 'object' ? Object.values(row) : []);
          for (let i = 0; i < rowArr.length; i++) {
            const cell = String(rowArr[i] ?? '').trim().toUpperCase();
            if (!cell) continue;
            if (alternatives.some(alt => alt.toUpperCase() === cell)) return i;
          }
          return null;
        };
        if (rawRows.length >= 2) {
          for (let headerRowIndex = 0; headerRowIndex < Math.min(3, rawRows.length); headerRowIndex++) {
            const headerRow = rawRows[headerRowIndex];
            const sid = findColIndexByHeaderValue(headerRow, altSku);
            const qty = findColIndexByHeaderValue(headerRow, altQty);
            const comp = findColIndexByHeaderValue(headerRow, altCompany);
            if (sid != null && qty != null && comp != null) {
              styleIdKey = sid;
              quantityKey = qty;
              companyKey = comp;
              data = rawRows.slice(headerRowIndex + 1).map((row) => {
                const obj = {};
                (row || []).forEach((val, i) => { obj[i] = val != null ? String(val).trim() : ''; });
                return obj;
              });
              break;
            }
          }
        }
      }

      if (!styleIdKey || !quantityKey || !companyKey) {
        throw new Error('Required columns not found. Need: SKU/Style Id, Quantity/Qty, Company/Company Name. Found headers: ' + (Object.keys(firstRow || {}).join(', ') || 'none'));
      }

      setUploadProgress({ percent: 50, message: 'Extracting data...' });
      const extracted = [];
      const emails = new Set();

      data.forEach((row, index) => {
        const styleId = String(row[styleIdKey] || '').trim();
        const quantity = Number(row[quantityKey]) || 0;
        const email = String(row[companyKey] || '').trim().toLowerCase();

        if (styleId && quantity > 0 && email) {
          extracted.push({
            sku: styleId,
            quantity,
            email,
            rowIndex: index + 2
          });
          emails.add(email);
        }
      });

      if (extracted.length === 0) throw new Error('No valid data found');

      setExtractedData(extracted);
      
      // Check mappings
      const mappedEmails = new Set(emailMappings.map(m => m.email.toLowerCase()));
      const unmapped = new Set([...emails].filter(email => !mappedEmails.has(email.toLowerCase())));
      setUnmappedEmails(unmapped);

      if (unmapped.size > 0) {
        setUploadProgress({ percent: 60, message: 'Mapping required...' });
        setError(`Found ${unmapped.size} unmapped email(s). Please map them.`);
        setShowMappingModal(true); // Open mapping modal context
        setLoading(false);
        return;
      }

      // If all mapped, proceed to upload
      await uploadToDatabase(extracted);

    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to process file');
      setUploadProgress({ percent: 0, message: '' });
      setLoading(false);
    }
  };

  const uploadToDatabase = async (dataToUpload) => {
    try {
      setUploadProgress({ percent: 80, message: 'Uploading to database...' });
      const token = localStorage.getItem('token');
      
      const orders = dataToUpload.map(item => ({
        companyName: emailMappings.find(m => m.email.toLowerCase() === item.email.toLowerCase())?.companyName,
        sku: item.sku,
        quantity: item.quantity,
        email: item.email
      }));

      const { data } = await axios.post(apiBase, 
        { orders, startDate: uploadDate, platform },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Mark holiday if checked
      if (markAsHoliday) {
        try {
          await axios.post('/api/sku-inventory/holidays', 
            { date: uploadDate },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (e) { console.error('Holiday error', e); }
      }

      setUploadProgress({ percent: 100, message: 'Complete!' });
      setSuccess(true);
      setStatus(data.message);
      
      // Reset
      setExtractedData([]);
      setSelectedFile(null);
      setShowUploadModal(false);
      setMarkAsHoliday(false);
      
      // Refresh
      await fetchUploadedDates();
      await fetchCancelledOrders();
      await fetchHolidays();
      
      setTimeout(() => { setSuccess(false); setStatus(''); setUploadProgress({ percent: 0, message: '' }); }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  // --- Dynamic Keywords & Pre-Upload Confirmation Handlers ---

  const handleApplyKeywordPrompt = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const updatedKeywords = { ...returnKeywords };

      const batchToSave = [];
      for (const [kw, cat] of Object.entries(pendingKeywordMappings)) {
        updatedKeywords[kw.toUpperCase()] = cat;
        if (saveKeywordsToDb) {
          batchToSave.push({ keyword: kw.toUpperCase(), category: cat });
        }
      }

      if (saveKeywordsToDb && batchToSave.length > 0) {
        try {
          await axios.post('/api/return-keyword-mapping', { mappings: batchToSave }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          await fetchReturnKeywords();
        } catch (dbErr) {
          console.error('Failed to persist keywords to DB:', dbErr);
        }
      }

      setReturnKeywords(updatedKeywords);
      setShowKeywordPromptModal(false);

      if (pendingUploadData && pendingUploadData.rawData) {
        const reParsed = parseUnifiedReturnsRows(pendingUploadData.rawData, {
          emailMappings,
          defaultDate: pendingUploadData.targetDate,
          useSelectedDateOnly: true,
          customKeywords: updatedKeywords
        });

        // Check if there are still unrecognized types
        if (reParsed.unrecognizedReturnTypes && reParsed.unrecognizedReturnTypes.length > 0) {
          setUnrecognizedKeywords(reParsed.unrecognizedReturnTypes);
          const nextMap = {};
          reParsed.unrecognizedReturnTypes.forEach(word => {
            const w = word.toUpperCase();
            nextMap[w] = (w.includes('RTO') || w.includes('COURIER')) ? 'rto' : 'customer';
          });
          setPendingKeywordMappings(nextMap);
          setPendingUploadData(prev => ({ ...prev, parsed: reParsed }));
          setShowKeywordPromptModal(true);
          setLoading(false);
          return;
        }

        // Check if there are unmapped emails
        if (reParsed.unmapped && reParsed.unmapped.length > 0) {
          const unmappedSet = new Set(reParsed.unmapped.map(u => u.email));
          setUnmappedEmails(unmappedSet);
          setPendingUploadData(prev => ({ ...prev, parsed: reParsed }));
          setShowMappingModal(true);
          setLoading(false);
          return;
        }

        // Ready for Portals Confirmation Modal!
        setPendingUploadData(prev => ({ ...prev, parsed: reParsed }));
        setShowUploadModal(false);
        setShowUploadConfirmModal(true);
        setLoading(false);
      }
    } catch (err) {
      console.error('Error applying keywords:', err);
      setError('Failed to apply return keyword mappings');
      setLoading(false);
    }
  };

  const handleConfirmUnifiedUpload = async () => {
    if (!pendingUploadData || !pendingUploadData.parsed) return;
    try {
      setLoading(true);
      const { targetDate, parsed, markAsHoliday: shouldMarkHoliday } = pendingUploadData;
      const token = localStorage.getItem('token');

      const { data: uploadRes } = await axios.post('/api/unified-returns-upload', {
        date: targetDate,
        meeshoReturns: parsed.meeshoReturns,
        meeshoCustomerReturns: parsed.meeshoCustomerReturns,
        snapdealReturns: parsed.snapdealReturns,
        snapdealCustomerReturns: parsed.snapdealCustomerReturns,
        flipkartReturns: parsed.flipkartReturns,
        flipkartCustomerReturns: parsed.flipkartCustomerReturns,
        myntraReturns: parsed.myntraReturns,
        myntraCustomerReturns: parsed.myntraCustomerReturns
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (shouldMarkHoliday) {
        try {
          await axios.post('/api/sku-inventory/holidays', {
            date: targetDate,
            isHoliday: true
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setHolidays(prev => new Set([...prev, targetDate]));
        } catch (holidayErr) {
          console.error('Error marking holiday:', holidayErr);
        }
      }

      setLoading(false);
      setError(null);
      setSuccess(true);
      setStatus(`Successfully uploaded ${uploadRes.counts?.total || parsed.counts.total} returns across portals for ${targetDate}`);
      setSelectedFile(null);
      setShowUploadConfirmModal(false);
      setPendingUploadData(null);
      setUnifiedSummary({
        message: uploadRes.message,
        counts: uploadRes.counts,
        duplicatesSkipped: parsed.duplicatesSkipped,
        date: targetDate
      });

      await fetchUploadedDates();
      if (filterStartDate && targetDate < filterStartDate) setFilterStartDate(targetDate);
      if (filterEndDate && targetDate > filterEndDate) setFilterEndDate(targetDate);
      await fetchCancelledOrders();
      await fetchHolidays();
      setTimeout(() => { setSuccess(false); setStatus(''); }, 5000);
    } catch (err) {
      console.error('Unified upload confirm error:', err);
      setError(err.response?.data?.message || 'Failed to save unified returns');
      setLoading(false);
    }
  };

  // --- Mapping Modal Logic ---

  const handleSaveMapping = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (editingMapping) {
        await axios.put('/api/company-email-mapping', 
          { id: editingMapping._id, companyName: newCompanyName, email: newEmail },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post('/api/company-email-mapping', 
          { companyName: newCompanyName, email: newEmail },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      await fetchEmailMappings();
      
      // Update unmapped list
      if (extractedData.length > 0) {
        const { data } = await axios.get('/api/company-email-mapping', { headers: { Authorization: `Bearer ${token}` } });
        const updatedMappings = data.mappings || [];
        const mappedEmails = new Set(updatedMappings.map(m => m.email.toLowerCase()));
        const emails = new Set(extractedData.map(d => d.email.toLowerCase()));
        const unmapped = new Set([...emails].filter(email => !mappedEmails.has(email.toLowerCase())));
        setUnmappedEmails(unmapped);
        
        if (unmapped.size === 0) {
           setSuccess(true);
           setStatus('All emails mapped. You can now upload.');
        }
      } else if (pendingUploadData && pendingUploadData.rawData) {
        const { data } = await axios.get('/api/company-email-mapping', { headers: { Authorization: `Bearer ${token}` } });
        const updatedMappings = data.mappings || [];
        const reParsed = parseUnifiedReturnsRows(pendingUploadData.rawData, {
          emailMappings: updatedMappings,
          defaultDate: pendingUploadData.targetDate,
          useSelectedDateOnly: true,
          customKeywords: returnKeywords
        });
        if (reParsed.unmapped && reParsed.unmapped.length > 0) {
          const unmappedSet = new Set(reParsed.unmapped.map(u => u.email));
          setUnmappedEmails(unmappedSet);
          setPendingUploadData(prev => ({ ...prev, parsed: reParsed }));
        } else {
          setUnmappedEmails(new Set());
          setPendingUploadData(prev => ({ ...prev, parsed: reParsed }));
          setSuccess(true);
          setStatus('All emails mapped. You can now confirm upload.');
        }
      }

      setEditingMapping(null);
      setNewCompanyName('');
      setNewEmail('');
      
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMapping = async (id) => {
    if (!confirm('Delete this mapping?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete('/api/company-email-mapping', {
        data: { id },
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchEmailMappings();
    } catch (err) {
      setError('Failed to delete mapping');
    }
  };

  // --- Delete Logic ---

  const handleDeleteData = async () => {
    if (!deleteDate) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      if (isReturnsTab && deleteScope === 'all') {
        const { data } = await axios.delete('/api/unified-returns-delete', {
          data: {
            date: deleteDate,
            allPlatforms: true,
            deleteBoth: true
          },
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess(true);
        setStatus(data.message || `Deleted all portal return records for ${deleteDate}`);
      } else {
        const { data } = await axios.delete(`${apiBase}?date=${deleteDate}&platform=${platform}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess(true);
        setStatus(data.message);
      }

      setShowDeleteModal(false);
      setDeleteDate('');
      
      await fetchUploadedDates();
      await fetchCancelledOrders();
      
      setTimeout(() => { setSuccess(false); setStatus(''); }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  // --- Excel Download ---
  // Same format for both Cancelled Orders and Returns: one sheet per company, columns SKU and Quantity only.
  
  const downloadExcel = () => {
    if (!viewData || Object.keys(viewData).length === 0) return;
    
    const wb = XLSX.utils.book_new();
    const usedSheetNames = new Set();
    
    const makeSafeSheetName = (rawName, index) => {
      let name = String(rawName || 'Sheet');
      name = name.replace(/[\\\/?*\[\]:]/g, '-');
      name = name.replace(/^'+|'+$/g, '');
      if (!name) name = `Sheet${index + 1}`;
      name = name.slice(0, 31);
      let base = name;
      let suffixIndex = 1;
      while (usedSheetNames.has(name)) {
        const suffix = `_${suffixIndex++}`;
        name = `${base.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`;
      }
      usedSheetNames.add(name);
      return name;
    };

    const orderedCompanies = getOrderedCompanies();
    const companiesWithData = orderedCompanies.filter(company => viewData[company]);

    companiesWithData.forEach((companyName, idx) => {
      const skus = viewData[companyName];
      if (!skus || typeof skus !== 'object') return;
      const wsData = [['SKU', 'Quantity']];
      const sortedSKUs = Object.keys(skus).sort();
      sortedSKUs.forEach(sku => {
        wsData.push([sku, skus[sku]]);
      });
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const sheetName = makeSafeSheetName(companyName, idx);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${filterStartDate}_${filterEndDate}.xlsx`);
  };

  // --- Render Helpers ---

  const getOrderedCompanies = () => {
    const companiesFromData = viewData ? Object.keys(viewData) : [];
    const baseOrder = customOrder.length > 0 ? customOrder : getDefaultCompanyOrder();
    
    const ordered = [];
    for (const company of baseOrder) {
      if (companiesFromData.includes(company)) {
        ordered.push(company);
      }
    }
    const newCompanies = companiesFromData
      .filter(company => !baseOrder.includes(company))
      .sort();
      
    return [...ordered, ...newCompanies];
  };

  return (
    <div className="p-0">
      {/* Status Messages */}
      {error && (
        <div className="m-4 mb-2 bg-red-50 border-l-4 border-red-400 p-4 rounded-md shadow-sm">
          <div className="flex">
            <div className="flex-shrink-0"><svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg></div>
            <div className="ml-3"><p className="text-sm text-red-700">{error}</p></div>
          </div>
        </div>
      )}
      {success && (
        <div className="m-4 mb-2 bg-green-50 border-l-4 border-green-400 p-4 rounded-md shadow-sm">
          <div className="flex">
            <div className="flex-shrink-0"><svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
            <div className="ml-3"><p className="text-sm text-green-700">{status}</p></div>
          </div>
        </div>
      )}

      {/* Unified Returns Summary Card */}
      {unifiedSummary && (
        <div className="m-4 mb-3 p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-2 border-emerald-300 rounded-xl shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h4 className="font-bold text-emerald-900 text-base">
                Unified Returns Upload Complete ({unifiedSummary.date})
              </h4>
            </div>
            <button
              onClick={() => setUnifiedSummary(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold px-2 py-1 rounded bg-white border border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
              ✕ Dismiss
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg border border-amber-200 shadow-xs">
              <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider">Meesho RTO Returns</p>
              <p className="text-2xl font-black text-amber-800 mt-1">{unifiedSummary.counts?.meeshoReturns ?? 0}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-purple-200 shadow-xs">
              <p className="text-xs text-purple-700 font-semibold uppercase tracking-wider">Meesho Customer Returns</p>
              <p className="text-2xl font-black text-purple-800 mt-1">{unifiedSummary.counts?.meeshoCustomerReturns ?? 0}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-orange-200 shadow-xs">
              <p className="text-xs text-orange-700 font-semibold uppercase tracking-wider">Snapdeal RTO Returns</p>
              <p className="text-2xl font-black text-orange-800 mt-1">{unifiedSummary.counts?.snapdealReturns ?? 0}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-indigo-200 shadow-xs">
              <p className="text-xs text-indigo-700 font-semibold uppercase tracking-wider">Snapdeal Customer Returns</p>
              <p className="text-2xl font-black text-indigo-800 mt-1">{unifiedSummary.counts?.snapdealCustomerReturns ?? 0}</p>
            </div>
            {((unifiedSummary.counts?.flipkartReturns ?? 0) > 0 || (unifiedSummary.counts?.flipkartCustomerReturns ?? 0) > 0) && (
              <>
                <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-xs">
                  <p className="text-xs text-blue-700 font-semibold uppercase tracking-wider">Flipkart RTO Returns</p>
                  <p className="text-2xl font-black text-blue-800 mt-1">{unifiedSummary.counts?.flipkartReturns ?? 0}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-cyan-200 shadow-xs">
                  <p className="text-xs text-cyan-700 font-semibold uppercase tracking-wider">Flipkart Customer Returns</p>
                  <p className="text-2xl font-black text-cyan-800 mt-1">{unifiedSummary.counts?.flipkartCustomerReturns ?? 0}</p>
                </div>
              </>
            )}
            {((unifiedSummary.counts?.myntraReturns ?? 0) > 0 || (unifiedSummary.counts?.myntraCustomerReturns ?? 0) > 0) && (
              <>
                <div className="bg-white p-3 rounded-lg border border-pink-200 shadow-xs">
                  <p className="text-xs text-pink-700 font-semibold uppercase tracking-wider">Myntra RTO Returns</p>
                  <p className="text-2xl font-black text-pink-800 mt-1">{unifiedSummary.counts?.myntraReturns ?? 0}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-rose-200 shadow-xs">
                  <p className="text-xs text-rose-700 font-semibold uppercase tracking-wider">Myntra Customer Returns</p>
                  <p className="text-2xl font-black text-rose-800 mt-1">{unifiedSummary.counts?.myntraCustomerReturns ?? 0}</p>
                </div>
              </>
            )}
          </div>
          <div className="mt-2.5 pt-2 border-t border-emerald-100 flex flex-wrap items-center justify-between text-xs text-emerald-800">
            <span>Total Returns Saved: <strong className="text-emerald-950 font-bold">{unifiedSummary.counts?.total ?? 0} orders</strong></span>
            {unifiedSummary.duplicatesSkipped > 0 && (
              <span className="text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                ✓ {unifiedSummary.duplicatesSkipped} duplicate barcode scans automatically filtered out
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        {dateRange.min && dateRange.max && (
          <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-sm text-blue-700">Data available from <strong>{formatDate(dateRange.min)}</strong> to <strong>{formatDate(dateRange.max)}</strong></span>
            </div>
            {viewData && <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">{Object.keys(viewData).length} companies loaded</span>}
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">From:</label>
            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">To:</label>
            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} placeholder="Search Company..." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={filterSKU} onChange={(e) => setFilterSKU(e.target.value)} placeholder="Search SKU..." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>

          {loading && <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg"><span className="text-sm text-gray-600">Loading...</span></div>}

          <div className="flex-1"></div>

          <button onClick={() => setShowUploadModal(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg> Upload
          </button>

          {isReturnsTab && (
            <button onClick={() => setShowKeywordsManagerModal(true)} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium flex items-center gap-2" title="Manage dynamic return keywords (RET, RTO, etc.)">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg> Return Keywords
            </button>
          )}

          <button onClick={() => setShowDeleteModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete
          </button>

          <button onClick={downloadExcel} disabled={loading || !viewData} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Excel
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex relative h-[calc(100vh-12rem)]">
        {/* Filter Panel */}
        <div className={`bg-gray-50 border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col ${filterPanelOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
          {filterPanelOpen && (
            <div className="p-3 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Companies</h3>
                <div className="flex items-center gap-2">
                  <button onClick={toggleSelectAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium" disabled={!viewData || Object.keys(viewData).length === 0}>
                    {selectedCompanies.length === Object.keys(viewData || {}).length && selectedCompanies.length > 0 ? 'Deselect All' : 'Select All'}
                  </button>
                  <button onClick={() => setFilterPanelOpen(false)} className="p-1 hover:bg-gray-200 rounded transition-colors" title="Close filters"><svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              </div>

              {selectedCompanies.length > 0 && (
                <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-700 font-medium">{selectedCompanies.length} companies selected</p>
                </div>
              )}

              <button onClick={() => handleCompanySelect('all')} className={`w-full text-left px-3 py-2 rounded-lg mb-2 transition-all ${activeCompanyTab === 'all' && selectedCompanies.length === 0 ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">All Companies</span>
                  {viewData && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${activeCompanyTab === 'all' && selectedCompanies.length === 0 ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600'}`}>{Object.keys(viewData).length}</span>}
                </div>
              </button>

              <div className="space-y-2">
                {getOrderedCompanies().map(company => {
                  const companyData = viewData?.[company];
                  const totalQty = companyData ? Object.values(companyData).reduce((sum, qty) => sum + qty, 0) : 0;
                  const skuCount = companyData ? Object.keys(companyData).length : 0;
                  const isSelected = selectedCompanies.includes(company);
                  const isActive = activeCompanyTab === company && selectedCompanies.length === 0;
                  const hasData = !!companyData;

                  return (
                    <div key={company} draggable onDragStart={(e) => handleTabDragStart(e, company)} onDragOver={handleTabDragOver} onDrop={(e) => handleTabDrop(e, company)} className={`w-full rounded-lg transition-all cursor-move group ${isActive || isSelected ? 'bg-blue-600 text-white shadow-md' : hasData ? 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-200 opacity-60'} ${draggedTabIndex === company ? 'opacity-50 scale-95' : ''}`}>
                      <div className="flex items-start gap-2 px-2 py-2">
                        <div onClick={(e) => { e.stopPropagation(); if (hasData) handleCompanySelect(company); }} className={`flex-shrink-0 mt-0.5 ${hasData ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-white border-white' : isActive ? 'border-blue-300 bg-blue-500' : hasData ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-100'}`}>
                            {isSelected && <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </div>
                        <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isActive || isSelected ? 'text-blue-200' : hasData ? 'text-gray-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                        <div className="flex-1 min-w-0" onClick={() => hasData && handleCompanyClick(company)}>
                          <div className="text-sm font-medium truncate">{company}</div>
                          <div className={`text-xs mt-1 flex items-center justify-between ${isActive || isSelected ? 'text-blue-100' : hasData ? 'text-gray-500' : 'text-gray-400'}`}>
                            {hasData ? <><span className="truncate">{skuCount} SKUs</span><span className="font-semibold">{totalQty.toLocaleString()}</span></> : <span className="italic">No data</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {!filterPanelOpen && (
          <button onClick={() => setFilterPanelOpen(true)} className="absolute left-0 top-4 z-20 bg-white hover:bg-gray-50 border border-gray-200 rounded-r-lg px-2 py-2 shadow-sm transition-all duration-200 group flex items-center gap-1" title="Open filters">
            <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
          </button>
        )}

        {/* Table Content */}
        <div className="flex-1 p-4 overflow-hidden flex flex-col">
          {!filterStartDate || !filterEndDate ? (
            <div className="text-center py-16">
              <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">Select Date Range</h3>
              <p className="mt-2 text-sm text-gray-500">Please select start and end dates to view data</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden flex-1 flex flex-col">
              <div className="overflow-auto flex-1 relative">
                <table className="min-w-full divide-y divide-gray-200" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                  <thead className="bg-gray-50" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300 bg-gray-50" style={{ position: 'sticky', left: 0, top: 0, zIndex: 30, boxShadow: '2px 0 4px rgba(0,0,0,0.1)', width: '120px', minWidth: '120px', maxWidth: '120px' }}>Date</th>
                      {getOrderedCompanies().map(company => (
                        <th key={company} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px] bg-gray-50" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                          <div className="truncate" title={company}>{company}</div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-blue-50 border-l-2 border-blue-300 min-w-[80px]" style={{ position: 'sticky', top: 0, zIndex: 10 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {generateDateRange(filterStartDate, filterEndDate).map(dateStr => {
                      const isHoliday = holidays.has(dateStr);
                      const dateData = viewDataByDate[dateStr] || {};
                      const totalForDate = Object.values(dateData).reduce((sum, count) => sum + count, 0);
                      
                      return (
                        <tr key={dateStr} className={`group ${isHoliday ? 'bg-yellow-100 hover:bg-yellow-200' : 'hover:bg-gray-50'}`} onDoubleClick={() => toggleHoliday(dateStr)} title={isHoliday ? 'Double-click to remove holiday' : 'Double-click to mark as holiday'}>
                          <td className={`px-3 py-3 text-sm font-medium border-r border-gray-300 ${isHoliday ? 'text-yellow-900 bg-yellow-100' : 'text-gray-900 bg-white'}`} style={{ position: 'sticky', left: 0, zIndex: 1, boxShadow: '2px 0 4px rgba(0,0,0,0.1)', width: '120px', minWidth: '120px', maxWidth: '120px', overflow: 'hidden' }}>
                            <div className="flex items-center gap-1" style={{ overflow: 'hidden' }}>
                              <span className="truncate whitespace-nowrap" style={{ flex: '1 1 auto', minWidth: 0 }}>{formatDate(dateStr)}</span>
                              {isHoliday && <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>}
                            </div>
                          </td>
                          {getOrderedCompanies().map(company => {
                            const quantity = dateData[company] || 0;
                            return (
                              <td key={`${dateStr}-${company}`} className={`px-3 py-3 text-center text-sm ${isHoliday ? 'bg-yellow-100 text-yellow-900 font-semibold' : quantity > 0 ? 'text-gray-900 font-semibold bg-green-50' : 'text-gray-400 bg-red-50'}`}>
                                {quantity > 0 ? quantity.toLocaleString() : '-'}
                              </td>
                            );
                          })}
                          <td className={`px-4 py-3 text-center text-sm font-bold border-l-2 border-blue-300 ${isHoliday ? 'bg-yellow-100 text-yellow-900' : totalForDate > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            {totalForDate > 0 ? totalForDate.toLocaleString() : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50" style={{ position: 'sticky', bottom: 0, zIndex: 10 }}>
                    <tr>
                      <td className="px-3 py-3 text-sm font-bold text-gray-900 border-r border-gray-300 bg-gray-50" style={{ position: 'sticky', left: 0, bottom: 0, zIndex: 40, boxShadow: '2px 0 4px rgba(0,0,0,0.1)', width: '120px', minWidth: '120px', maxWidth: '120px' }}>Total</td>
                      {getOrderedCompanies().map(company => {
                        const totalForCompany = generateDateRange(filterStartDate, filterEndDate).reduce((sum, dateStr) => {
                          const dateData = viewDataByDate[dateStr] || {};
                          return sum + (dateData[company] || 0);
                        }, 0);
                        return (
                          <td key={company} className={`px-3 py-3 text-center text-sm font-bold ${totalForCompany > 0 ? 'text-blue-600 bg-green-50' : 'text-gray-400 bg-red-50'}`}>
                            {totalForCompany > 0 ? totalForCompany.toLocaleString() : '-'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center text-sm font-bold text-blue-700 bg-blue-50 border-l-2 border-blue-300">
                        {generateDateRange(filterStartDate, filterEndDate).reduce((sum, dateStr) => {
                          const dateData = viewDataByDate[dateStr] || {};
                          return sum + Object.values(dateData).reduce((s, q) => s + q, 0);
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Upload {title}</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Date <span className="text-red-500">*</span></label>
                <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                  <Calendar
                    onChange={(date) => setUploadDate(formatDateToISO(date))}
                    value={uploadDate ? (() => {
                      const [y, m, d] = uploadDate.split('-').map(Number);
                      return new Date(y, m - 1, d);
                    })() : new Date()}
                    maxDate={new Date()}
                    tileDisabled={({ date, view }) => {
                      if (view === 'month') {
                        const dateStr = formatDateToISO(date);
                        const todayStr = formatDateToISO(new Date());
                        return dateStr > todayStr;
                      }
                      return false;
                    }}
                    tileClassName={({ date, view }) => {
                      if (view === 'month') {
                        const dateStr = formatDateToISO(date);
                        const todayStr = formatDateToISO(new Date());
                        
                        // Check if this is the selected date
                        const isSelected = uploadDate === dateStr;
                        
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
                {uploadDate && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {uploadedDates.has(uploadDate) && (
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded text-xs font-medium border border-green-300">
                        ✓ Data Uploaded
                      </span>
                    )}
                    {holidays.has(uploadDate) && (
                      <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium border border-yellow-300">
                        Holiday
                      </span>
                    )}
                    {!uploadedDates.has(uploadDate) && !holidays.has(uploadDate) && (
                      <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-medium border border-red-300">
                        Pending Upload
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center">
                <input type="checkbox" id="markAsHoliday" checked={markAsHoliday} onChange={(e) => setMarkAsHoliday(e.target.checked)} className="h-4 w-4 text-yellow-600 focus:ring-yellow-500 border-gray-300 rounded" />
                <label htmlFor="markAsHoliday" className="ml-2 block text-sm text-gray-700">Mark this date as holiday</label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload Excel / CSV <span className="text-red-500">*</span></label>
                <input type="file" name="excel_file" accept=".xlsx,.xls,.csv" required className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                {isReturnsTab && (
                  <p className="text-xs text-blue-600 mt-1.5 font-medium">
                    ⚡ <strong>Unified Report Supported</strong>: You can upload individual Excel files OR the unified <strong>Order Report (CSV/Excel)</strong>. 
                    Unified files are automatically split and saved into Meesho, Snapdeal, Flipkart &amp; Myntra Returns and Customer Returns!
                  </p>
                )}
              </div>

              {loading && uploadProgress.message && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm"><span className="text-gray-700 font-medium">{uploadProgress.message}</span><span className="text-blue-600 font-bold">{uploadProgress.percent}%</span></div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden"><div className="bg-blue-600 h-3 rounded-full transition-all duration-300" style={{ width: `${uploadProgress.percent}%` }}></div></div>
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" disabled={loading || !uploadDate} className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors font-medium">{loading ? 'Processing...' : 'Upload'}</button>
                <button type="button" onClick={() => setShowUploadModal(false)} disabled={loading} className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mapping Modal */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Map Emails to Companies</h3>
              <button onClick={() => setShowMappingModal(false)} className="text-gray-400 hover:text-gray-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            {unmappedEmails.size > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 font-medium mb-2">⚠️ {unmappedEmails.size} unmapped email(s) found:</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(unmappedEmails).map(email => (
                    <button key={email} onClick={() => { setNewEmail(email); setEditingMapping(null); }} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium hover:bg-yellow-200 border border-yellow-300">{email}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4 border p-4 rounded-lg bg-gray-50">
              <h4 className="font-medium text-gray-900">{editingMapping ? 'Edit Mapping' : 'Add New Mapping'}</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Enter email" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input type="text" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Enter company name" />
              </div>
              <button onClick={handleSaveMapping} disabled={!newEmail || !newCompanyName} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300">Save Mapping</button>
            </div>

            <div className="mt-6">
              <h4 className="font-medium text-gray-900 mb-2">Existing Mappings</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {emailMappings.map(m => (
                  <div key={m._id} className="flex justify-between items-center p-2 bg-gray-50 rounded border">
                    <div><div className="font-medium">{m.companyName}</div><div className="text-xs text-gray-500">{m.email}</div></div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingMapping(m); setNewCompanyName(m.companyName); setNewEmail(m.email); }} className="text-blue-600 text-xs">Edit</button>
                      <button onClick={() => handleDeleteMapping(m._id)} className="text-red-600 text-xs">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {unmappedEmails.size === 0 && (
               <div className="mt-4 pt-4 border-t flex justify-end">
                 <button onClick={() => {
                   setShowMappingModal(false);
                   if (pendingUploadData && pendingUploadData.parsed) {
                     setShowUploadConfirmModal(true);
                   } else if (extractedData.length > 0) {
                     uploadToDatabase(extractedData);
                   }
                 }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Continue Upload</button>
               </div>
            )}
          </div>
        </div>
      )}

      {/* Return Keyword Prompt Modal (Triggered when new unmapped words like RET, etc. are found) */}
      {showKeywordPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏷️</span>
                <h3 className="text-lg font-bold text-gray-900">Map Unrecognized Return Keywords</h3>
              </div>
              <button onClick={() => setShowKeywordPromptModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              <p className="font-semibold mb-1">New return word(s) detected in file:</p>
              <p className="text-xs text-amber-800">
                Please specify whether each new keyword represents a <strong>Customer Return</strong> or an <strong>RTO (Courier Return)</strong>.
              </p>
            </div>

            <div className="space-y-4 mb-5">
              {unrecognizedKeywords.map(word => {
                const upperWord = word.toUpperCase();
                const selectedCat = pendingKeywordMappings[upperWord] || 'customer';
                return (
                  <div key={word} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-gray-900 bg-white px-2.5 py-1 rounded border border-gray-300 text-sm font-mono">
                        {word}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">Map to:</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs font-semibold transition-all ${
                        selectedCat === 'customer'
                          ? 'bg-purple-100 border-purple-500 text-purple-900 shadow-xs'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}>
                        <input
                          type="radio"
                          name={`cat_${upperWord}`}
                          value="customer"
                          checked={selectedCat === 'customer'}
                          onChange={() => setPendingKeywordMappings(prev => ({ ...prev, [upperWord]: 'customer' }))}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                        <span>Customer Return</span>
                      </label>
                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs font-semibold transition-all ${
                        selectedCat === 'rto'
                          ? 'bg-amber-100 border-amber-500 text-amber-900 shadow-xs'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}>
                        <input
                          type="radio"
                          name={`cat_${upperWord}`}
                          value="rto"
                          checked={selectedCat === 'rto'}
                          onChange={() => setPendingKeywordMappings(prev => ({ ...prev, [upperWord]: 'rto' }))}
                          className="text-amber-600 focus:ring-amber-500"
                        />
                        <span>RTO Return</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mb-5 flex items-center">
              <input
                type="checkbox"
                id="saveKeywordsToDb"
                checked={saveKeywordsToDb}
                onChange={(e) => setSaveKeywordsToDb(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="saveKeywordsToDb" className="ml-2 block text-xs font-medium text-gray-700">
                Save these mappings permanently for future file uploads
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleApplyKeywordPrompt}
                disabled={loading}
                className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-bold text-sm transition-colors shadow-sm"
              >
                {loading ? 'Applying...' : 'Apply Mappings & Continue'}
              </button>
              <button
                onClick={() => setShowKeywordPromptModal(false)}
                disabled={loading}
                className="py-2.5 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portals Pre-Upload Confirmation Modal */}
      {showUploadConfirmModal && pendingUploadData && pendingUploadData.parsed && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📦</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Confirm Returns Upload</h3>
                  <p className="text-xs text-gray-500">Review distribution before saving to database</p>
                </div>
              </div>
              <button onClick={() => setShowUploadConfirmModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900 uppercase tracking-wider">Target Upload Date:</span>
              <span className="text-sm font-bold text-blue-700 bg-white px-3 py-1 rounded border border-blue-200">
                {pendingUploadData.targetDate}
              </span>
            </div>

            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Platform Breakdown:</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Meesho */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-amber-900 uppercase">Meesho</span>
                  <span className="text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                    {(pendingUploadData.parsed.counts?.meeshoReturns || 0) + (pendingUploadData.parsed.counts?.meeshoCustomerReturns || 0)}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>RTO:</span>
                    <strong className="text-amber-900">{pendingUploadData.parsed.counts?.meeshoReturns || 0}</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Customer Return:</span>
                    <strong className="text-purple-900">{pendingUploadData.parsed.counts?.meeshoCustomerReturns || 0}</strong>
                  </div>
                </div>
              </div>

              {/* Snapdeal */}
              <div className="p-3 bg-orange-50/60 border border-orange-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-orange-900 uppercase">Snapdeal</span>
                  <span className="text-xs font-black text-orange-800 bg-orange-100 px-2 py-0.5 rounded">
                    {(pendingUploadData.parsed.counts?.snapdealReturns || 0) + (pendingUploadData.parsed.counts?.snapdealCustomerReturns || 0)}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>RTO:</span>
                    <strong className="text-orange-900">{pendingUploadData.parsed.counts?.snapdealReturns || 0}</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Customer Return:</span>
                    <strong className="text-indigo-900">{pendingUploadData.parsed.counts?.snapdealCustomerReturns || 0}</strong>
                  </div>
                </div>
              </div>

              {/* Flipkart */}
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-blue-900 uppercase">Flipkart</span>
                  <span className="text-xs font-black text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                    {(pendingUploadData.parsed.counts?.flipkartReturns || 0) + (pendingUploadData.parsed.counts?.flipkartCustomerReturns || 0)}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>RTO:</span>
                    <strong className="text-blue-900">{pendingUploadData.parsed.counts?.flipkartReturns || 0}</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Customer Return:</span>
                    <strong className="text-cyan-900">{pendingUploadData.parsed.counts?.flipkartCustomerReturns || 0}</strong>
                  </div>
                </div>
              </div>

              {/* Myntra */}
              <div className="p-3 bg-pink-50/60 border border-pink-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-pink-900 uppercase">Myntra</span>
                  <span className="text-xs font-black text-pink-800 bg-pink-100 px-2 py-0.5 rounded">
                    {(pendingUploadData.parsed.counts?.myntraReturns || 0) + (pendingUploadData.parsed.counts?.myntraCustomerReturns || 0)}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>RTO:</span>
                    <strong className="text-pink-900">{pendingUploadData.parsed.counts?.myntraReturns || 0}</strong>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Customer Return:</span>
                    <strong className="text-rose-900">{pendingUploadData.parsed.counts?.myntraCustomerReturns || 0}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg mb-5 space-y-1 text-xs text-emerald-950">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold">Total Orders to Save:</span>
                <span className="text-base font-black text-emerald-800">{pendingUploadData.parsed.counts?.total || 0}</span>
              </div>
              {pendingUploadData.parsed.duplicatesSkipped > 0 && (
                <div className="text-xs text-amber-800 font-medium pt-1">
                  ✓ {pendingUploadData.parsed.duplicatesSkipped} duplicate barcode scans automatically filtered out
                </div>
              )}
              {pendingUploadData.markAsHoliday && (
                <div className="text-xs text-yellow-800 font-medium pt-0.5">
                  ★ Will also mark {pendingUploadData.targetDate} as Holiday in Inventory
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmUnifiedUpload}
                disabled={loading}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:bg-gray-300"
              >
                {loading ? 'Saving to Database...' : 'Confirm & Save Records'}
              </button>
              <button
                onClick={() => setShowUploadConfirmModal(false)}
                disabled={loading}
                className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Keywords Manager Modal */}
      {showKeywordsManagerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏷️</span>
                <h3 className="text-lg font-bold text-gray-900">Manage Return Keywords</h3>
              </div>
              <button onClick={() => setShowKeywordsManagerModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <p className="text-xs text-gray-600 mb-4">
              Map custom keywords (like <code>RET</code>, <code>RTO</code>, <code>EXCHANGE</code>) found in marketplace reports to either <strong>Customer Return</strong> or <strong>RTO Return</strong>.
            </p>

            {/* Add New Keyword Box */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg mb-5 space-y-3">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Add Dynamic Keyword</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value.toUpperCase())}
                  placeholder="e.g. RET or COURIER_LOST"
                  className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono"
                />
                <select
                  value={newKeywordCategory}
                  onChange={(e) => setNewKeywordCategory(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm font-medium bg-white"
                >
                  <option value="customer">Customer Return</option>
                  <option value="rto">RTO Return</option>
                </select>
                <button
                  onClick={() => handleSaveKeywordMapping()}
                  disabled={!newKeywordInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-bold text-sm"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Custom Saved Keywords List */}
            <div className="mb-5">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Custom Saved Keywords ({returnKeywordsList.length})
              </h4>
              {returnKeywordsList.length === 0 ? (
                <p className="text-xs text-gray-400 italic p-3 bg-gray-50 rounded border">No custom keywords saved yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {returnKeywordsList.map(item => (
                    <div key={item._id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-gray-900">{item.keyword}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          item.category === 'customer' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {item.category === 'customer' ? 'Customer Return' : 'RTO'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteKeywordMapping(item._id, item.keyword)}
                        className="text-red-600 hover:text-red-800 text-xs font-semibold px-2 py-1 hover:bg-red-50 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Built-in Default Keywords List */}
            <div>
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Built-in Default Keywords</h4>
              <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-36 overflow-y-auto">
                {Object.entries(DEFAULT_RETURN_KEYWORDS).map(([kw, cat]) => (
                  <span
                    key={kw}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                      cat === 'customer' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {kw} ({cat === 'customer' ? 'Cust' : 'RTO'})
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t flex justify-end">
              <button
                onClick={() => setShowKeywordsManagerModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portals Deletion Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl text-red-600">🗑️</span>
                <h3 className="text-lg font-bold text-gray-900">Delete Records by Date</h3>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-0.5">⚠️ Permanent Action</p>
                <p className="text-xs text-red-700">
                  This will permanently delete records for the selected date from the chosen portal(s).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Select Date to Delete
                </label>
                <input
                  type="date"
                  value={deleteDate}
                  onChange={(e) => setDeleteDate(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm font-medium"
                />
              </div>

              {/* Portals Selection Choice (Only for Returns/Customer Returns) */}
              {isReturnsTab && (
                <div className="space-y-2 pt-1 border-t border-gray-200">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Portals Deletion Scope:
                  </label>
                  <label className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                    deleteScope === 'all'
                      ? 'bg-red-50/70 border-red-400 shadow-xs'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="deleteScope"
                      value="all"
                      checked={deleteScope === 'all'}
                      onChange={() => setDeleteScope('all')}
                      className="mt-0.5 text-red-600 focus:ring-red-500"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-gray-900">
                        Delete across ALL Portals (Unified Cleanup)
                      </p>
                      <p className="text-[11px] text-gray-600 mt-0.5">
                        Removes both RTO and Customer Returns across Meesho, Snapdeal, Flipkart, and Myntra for this date.
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Meesho</span>
                        <span className="text-[10px] font-bold bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">Snapdeal</span>
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Flipkart</span>
                        <span className="text-[10px] font-bold bg-pink-100 text-pink-800 px-1.5 py-0.5 rounded">Myntra</span>
                      </div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                    deleteScope === 'current'
                      ? 'bg-gray-100 border-gray-400 shadow-xs'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="deleteScope"
                      value="current"
                      checked={deleteScope === 'current'}
                      onChange={() => setDeleteScope('current')}
                      className="mt-0.5 text-gray-600 focus:ring-gray-500"
                    />
                    <div>
                      <p className="text-xs font-bold text-gray-900">
                        Delete ONLY from {title} ({platform.toUpperCase()})
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Only deletes records from the current active tab.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleDeleteData}
                  disabled={loading || !deleteDate}
                  className="flex-1 py-3 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 font-bold text-sm transition-colors shadow-sm"
                >
                  {loading ? 'Deleting...' : (isReturnsTab && deleteScope === 'all' ? 'Delete Across All Portals' : 'Delete Permanently')}
                </button>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={loading}
                  className="py-3 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .react-calendar {
          width: 100%;
          border: none;
          font-family: inherit;
        }
        .react-calendar__navigation {
          display: flex;
          height: 44px;
          margin-bottom: 12px;
          align-items: center;
        }
        .react-calendar__navigation button {
          min-width: 36px;
          height: 36px;
          background: #f3f4f6;
          border-radius: 8px;
          font-size: 18px;
          margin: 0 4px;
          color: #374151;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .react-calendar__navigation button:hover {
          background: #e5e7eb;
          color: #111827;
        }
        .react-calendar__navigation button:disabled {
          background: #f9fafb;
          color: #d1d5db;
        }
        .react-calendar__navigation__label {
          flex-grow: 1;
          background: transparent !important;
          font-size: 15px;
          font-weight: 600;
          color: #111827;
          text-transform: capitalize;
          pointer-events: none;
        }
        .react-calendar__month-view__weekdays {
          display: flex;
          margin-bottom: 8px;
          text-decoration: none !important;
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
          text-decoration: none !important;
        }
        .react-calendar__month-view__weekdays__weekday abbr {
          text-decoration: none !important;
          cursor: default;
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
      `}</style>
    </div>
  );
}
