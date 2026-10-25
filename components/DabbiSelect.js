import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  FaBoxOpen,
  FaChevronDown,
  FaPlus,
  FaSearch,
  FaTimes,
  FaSync,
  FaCheck,
  FaImage
} from 'react-icons/fa';

/**
 * DabbiSelect Component
 * 
 * Props:
 * - value: selected dabbi id or name
 * - selectedName: selected dabbi name (optional fallback/display)
 * - boxRate: current boxRate value
 * - boxReturnRate: current boxReturnRate value
 * - company: optional companyId
 * - size: optional size hint to pre-match
 * - onChange: (selectedDabbi, isCustom) => void
 * - onSelectDabbi: (selectedDabbi) => void
 * - onRatesChange: ({ dabbi, dabbiName, boxRate, boxReturnRate }) => void
 */
export default function DabbiSelect({
  value,
  selectedName,
  boxRate,
  boxReturnRate,
  company,
  size = '',
  onChange,
  onSelectDabbi,
  onRatesChange
}) {
  const [dabbis, setDabbis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddPopup, setShowAddPopup] = useState(false);

  // Quick Add Popup Form State
  const [newDabbi, setNewDabbi] = useState({
    name: '',
    imageUrl: '',
    boxRate: '2.40',
    boxReturnRate: '2.40',
    size: size || ''
  });
  const [savingNewDabbi, setSavingNewDabbi] = useState(false);

  const dropdownRef = useRef(null);

  // Fetch active Dabbis
  const fetchDabbis = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await axios.get('/api/dabbi', {
        headers: { Authorization: `Bearer ${token}` },
        params: company ? { company } : {}
      });

      if (res.data?.success && Array.isArray(res.data.dabbis)) {
        setDabbis(res.data.dabbis);
      }
    } catch (err) {
      console.error('Error fetching dabbis in DabbiSelect:', err);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    fetchDabbis();
  }, [fetchDabbis]);

  // Update popup size default if parent size changes
  useEffect(() => {
    if (size) {
      setNewDabbi(prev => ({ ...prev, size }));
    }
  }, [size]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find currently selected dabbi object
  const selectedDabbi = useMemo(() => {
    if (!dabbis || dabbis.length === 0) return null;

    // 1. By ID match
    if (value) {
      const matchById = dabbis.find(d => String(d._id) === String(value));
      if (matchById) return matchById;
    }

    // 2. By selectedName match
    if (selectedName && selectedName !== 'Custom') {
      const matchByName = dabbis.find(
        d => d.name && d.name.trim().toLowerCase() === String(selectedName).trim().toLowerCase()
      );
      if (matchByName) return matchByName;
    }

    // 3. By value being the name
    if (value && typeof value === 'string' && value !== 'Custom') {
      const matchByValName = dabbis.find(
        d => d.name && d.name.trim().toLowerCase() === value.trim().toLowerCase()
      );
      if (matchByValName) return matchByValName;
    }

    // 4. By exact rate match (if rates are provided and > 0)
    if (boxRate !== undefined && boxRate !== '' && Number(boxRate) > 0 &&
        boxReturnRate !== undefined && boxReturnRate !== '' && Number(boxReturnRate) > 0) {
      const matchByRate = dabbis.find(d =>
        Number(d.boxRate) === Number(boxRate) &&
        Number(d.boxReturnRate) === Number(boxReturnRate)
      );
      if (matchByRate) return matchByRate;
    }

    return null;
  }, [value, selectedName, dabbis, boxRate, boxReturnRate]);

  // Filtered dabbis for dropdown search
  const filteredDabbis = useMemo(() => {
    if (!search.trim()) return dabbis;
    const q = search.trim().toLowerCase();
    return dabbis.filter(d =>
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.size && d.size.toLowerCase().includes(q))
    );
  }, [dabbis, search]);

  const handleSelect = (dabbi, isCustom = false) => {
    if (dabbi) {
      if (onChange) onChange(dabbi, false);
      if (onSelectDabbi) onSelectDabbi(dabbi);
      if (onRatesChange) {
        onRatesChange({
          dabbi: dabbi._id,
          dabbiName: dabbi.name,
          boxRate: dabbi.boxRate,
          boxReturnRate: dabbi.boxReturnRate
        });
      }
    } else if (isCustom) {
      if (onChange) onChange(null, true);
      if (onSelectDabbi) onSelectDabbi(null);
      if (onRatesChange) {
        onRatesChange({
          dabbi: null,
          dabbiName: 'Custom',
          boxRate: boxRate ?? 0,
          boxReturnRate: boxReturnRate ?? 0
        });
      }
    } else {
      if (onChange) onChange(null, false);
      if (onSelectDabbi) onSelectDabbi(null);
      if (onRatesChange) {
        onRatesChange({
          dabbi: null,
          dabbiName: '',
          boxRate: boxRate ?? 0,
          boxReturnRate: boxReturnRate ?? 0
        });
      }
    }
    setIsOpen(false);
    setSearch('');
  };

  const openAddPopupWithName = (nameToPreFill = '') => {
    setNewDabbi({
      name: nameToPreFill || (search.trim() ? search.trim() : ''),
      imageUrl: '',
      boxRate: (boxRate != null && boxRate !== '') ? String(boxRate) : '2.40',
      boxReturnRate: (boxReturnRate != null && boxReturnRate !== '') ? String(boxReturnRate) : '2.40',
      size: size || ''
    });
    setShowAddPopup(true);
    setIsOpen(false);
  };

  // Submit Quick Add Dabbi Popup
  const handleSaveNewDabbi = async () => {
    if (!newDabbi.name.trim()) {
      toast.error('Please enter Dabbi Name');
      return;
    }

    try {
      setSavingNewDabbi(true);
      const token = localStorage.getItem('token');
      const payload = {
        name: newDabbi.name.trim(),
        imageUrl: (newDabbi.imageUrl || '').trim(),
        boxRate: Number(newDabbi.boxRate) || 0,
        boxReturnRate: Number(newDabbi.boxReturnRate) || 0,
        size: (newDabbi.size || '').trim()
      };
      if (company) {
        payload.company = company;
      }

      const res = await axios.post('/api/dabbi', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success && res.data.dabbi) {
        const created = res.data.dabbi;
        toast.success(`✅ Dabbi "${created.name}" created!`);

        // Refresh local list and auto-select
        setDabbis(prev => [...prev.filter(d => d._id !== created._id), created]);
        handleSelect(created, false);

        // Reset form & close popup
        setNewDabbi({
          name: '',
          imageUrl: '',
          boxRate: '2.40',
          boxReturnRate: '2.40',
          size: size || ''
        });
        setShowAddPopup(false);
      }
    } catch (err) {
      console.error('Error saving new dabbi:', err);
      toast.error(err.response?.data?.message || 'Failed to create Dabbi');
    } finally {
      setSavingNewDabbi(false);
    }
  };

  // Label display logic
  const isCustomRate = selectedName === 'Custom' || (!selectedDabbi && (boxRate != null && boxRate !== '' && Number(boxRate) > 0));

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm flex items-center justify-between cursor-pointer hover:border-purple-500 focus:ring-2 focus:ring-purple-400 focus:outline-none transition shadow-2xs group text-left"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedDabbi ? (
            <>
              {selectedDabbi.imageUrl ? (
                <img
                  src={selectedDabbi.imageUrl}
                  alt={selectedDabbi.name}
                  className="w-6 h-6 rounded-md object-cover border border-gray-200 shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-md bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
                  <FaBoxOpen className="w-3.5 h-3.5" />
                </div>
              )}
              <span className="font-bold text-gray-900 truncate">
                {selectedDabbi.name}
              </span>
              {selectedDabbi.size && (
                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-medium shrink-0">
                  {selectedDabbi.size}
                </span>
              )}
              <span className="text-[11px] font-mono text-purple-700 font-semibold shrink-0 ml-auto mr-1">
                (₹{selectedDabbi.boxRate} / Ret: ₹{selectedDabbi.boxReturnRate})
              </span>
            </>
          ) : selectedName && selectedName !== 'Custom' ? (
            <>
              <div className="w-6 h-6 rounded-md bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
                <FaBoxOpen className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-gray-900 truncate">
                {selectedName}
              </span>
              {(boxRate != null && boxRate !== '') && (
                <span className="text-[11px] font-mono text-purple-700 font-semibold shrink-0 ml-auto mr-1">
                  (₹{boxRate} / Ret: ₹{boxReturnRate})
                </span>
              )}
            </>
          ) : isCustomRate ? (
            <>
              <div className="w-6 h-6 rounded-md bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 text-xs">
                ⚙️
              </div>
              <span className="font-semibold text-gray-800 truncate">
                Custom / Manual Box Rate
              </span>
              <span className="text-[11px] font-mono text-gray-600 shrink-0 ml-auto mr-1">
                (₹{boxRate} / Ret: ₹{boxReturnRate})
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <FaBoxOpen className="w-4 h-4 text-gray-400" />
              <span>Select Dabbi (Box Rate)...</span>
            </div>
          )}
        </div>
        <FaChevronDown className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180 text-purple-600' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-80 flex flex-col">
          {/* Search Bar */}
          <div className="p-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2 shrink-0">
            <FaSearch className="w-3 h-3 text-gray-400 ml-1" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dabbi name or size..."
              className="w-full bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <FaTimes className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* List of Dabbis */}
          <div className="overflow-y-auto divide-y divide-gray-50 flex-1">
            {/* Custom / Manual option */}
            <button
              type="button"
              onClick={() => handleSelect(null, true)}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between text-xs text-gray-700 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-gray-500 text-xs">
                  ⚙️
                </div>
                <div>
                  <div className="font-semibold text-gray-800">Custom / Manual Rate</div>
                  <div className="text-[10px] text-gray-400">Enter box rate and return rate manually</div>
                </div>
              </div>
              {isCustomRate && <FaCheck className="w-3 h-3 text-purple-600" />}
            </button>

            {filteredDabbis.length === 0 ? (
              <div className="py-5 px-3 text-center text-xs text-gray-500">
                <p>No dabbi matching &quot;{search}&quot;.</p>
                {search.trim() && (
                  <button
                    type="button"
                    onClick={() => openAddPopupWithName(search.trim())}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <FaPlus className="w-2.5 h-2.5" />
                    <span>Create &quot;{search.trim()}&quot; Dabbi</span>
                  </button>
                )}
              </div>
            ) : (
              filteredDabbis.map(d => {
                const isSelected = selectedDabbi?._id === d._id;
                return (
                  <button
                    key={d._id}
                    type="button"
                    onClick={() => handleSelect(d, false)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between transition cursor-pointer ${
                      isSelected ? 'bg-purple-50 text-purple-950 font-bold' : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {d.imageUrl ? (
                        <img
                          src={d.imageUrl}
                          alt={d.name}
                          className="w-7 h-7 rounded-md object-cover border border-gray-200 shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-md bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                          <FaBoxOpen className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate flex items-center gap-1.5">
                          <span>{d.name}</span>
                          {d.size && (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1 py-0.2 rounded font-normal">
                              {d.size}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">
                          Dabbi: <span className="font-semibold text-purple-700">₹{d.boxRate}</span> | Ret: <span className="font-semibold text-indigo-700">₹{d.boxReturnRate}</span>
                        </div>
                      </div>
                    </div>
                    {isSelected && <FaCheck className="w-3.5 h-3.5 text-purple-600 shrink-0 ml-2" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Bottom Action: + Add New Dabbi */}
          <div className="p-2 border-t border-gray-100 bg-gray-50/90 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openAddPopupWithName('');
              }}
              className="w-full py-1.5 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <FaPlus className="w-2.5 h-2.5" />
              <span>+ Add New Dabbi Configuration</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK ADD DABBI POPUP MODAL (z-[9999] isolated, non-form to avoid nesting)  */}
      {/* ========================================================================= */}
      {showAddPopup && (
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4 animate-in zoom-in-95 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-base">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
                  <FaBoxOpen className="w-3.5 h-3.5" />
                </div>
                <span>Add New Dabbi (Box)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPopup(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <FaTimes className="w-3.5 h-3.5" />
              </button>
            </div>

            <div
              className="space-y-3"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveNewDabbi();
                }
              }}
            >
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Dabbi Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDabbi.name}
                  onChange={(e) => setNewDabbi(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Small Dabbi, Necklace Box"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Dabbi Rate (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newDabbi.boxRate}
                    onChange={(e) => setNewDabbi(prev => ({ ...prev, boxRate: e.target.value }))}
                    placeholder="2.40"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Return Rate (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newDabbi.boxReturnRate}
                    onChange={(e) => setNewDabbi(prev => ({ ...prev, boxReturnRate: e.target.value }))}
                    placeholder="2.40"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Size / Category
                </label>
                <select
                  value={newDabbi.size}
                  onChange={(e) => setNewDabbi(prev => ({ ...prev, size: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium"
                >
                  <option value="">Select Size (Optional)</option>
                  <option value="Small">Small</option>
                  <option value="Large">Large</option>
                  <option value="Medium">Medium</option>
                  <option value="Combo">Combo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Image URL / Link (Optional)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newDabbi.imageUrl}
                    onChange={(e) => setNewDabbi(prev => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://... image link"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  {newDabbi.imageUrl ? (
                    <img
                      src={newDabbi.imageUrl}
                      alt="preview"
                      className="w-8 h-8 rounded-md object-cover border border-gray-200 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                      <FaImage className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddPopup(false)}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingNewDabbi}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveNewDabbi();
                  }}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {savingNewDabbi ? <FaSync className="animate-spin w-3 h-3" /> : <FaPlus className="w-2.5 h-2.5" />}
                  <span>Save & Select</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
