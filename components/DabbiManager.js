import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import moment from 'moment';
import {
  FaBoxOpen,
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrash,
  FaTimes,
  FaSync,
  FaCalendarAlt,
  FaImage,
  FaExternalLinkAlt,
  FaCheck
} from 'react-icons/fa';

export default function DabbiManager({ isOpen, onClose, onDabbiUpdated }) {
  const [dabbis, setDabbis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDabbi, setEditingDabbi] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    imageUrl: '',
    boxRate: '2.40',
    boxReturnRate: '2.40',
    size: '',
    isCorrection: true,
    effectiveFromDate: moment().format('YYYY-MM-DD'),
    note: '',
    updateLinkedOrigins: false
  });

  const fetchDabbis = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await axios.get('/api/dabbi', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success && Array.isArray(res.data.dabbis)) {
        setDabbis(res.data.dabbis);
      }
    } catch (err) {
      console.error('Error fetching dabbis in DabbiManager:', err);
      toast.error('Failed to load Dabbi catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDabbis();
  }, [fetchDabbis]);

  // Filtered Dabbis
  const filteredDabbis = useMemo(() => {
    if (!search.trim()) return dabbis;
    const q = search.trim().toLowerCase();
    return dabbis.filter(d =>
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.size && d.size.toLowerCase().includes(q))
    );
  }, [dabbis, search]);

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      imageUrl: '',
      boxRate: '2.40',
      boxReturnRate: '2.40',
      size: '',
      isCorrection: true,
      effectiveFromDate: moment().format('YYYY-MM-DD'),
      note: '',
      updateLinkedOrigins: false
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (dabbi) => {
    setEditingDabbi(dabbi);
    setFormData({
      name: dabbi.name || '',
      imageUrl: dabbi.imageUrl || '',
      boxRate: dabbi.boxRate != null ? String(dabbi.boxRate) : '0',
      boxReturnRate: dabbi.boxReturnRate != null ? String(dabbi.boxReturnRate) : '0',
      size: dabbi.size || '',
      isCorrection: true,
      effectiveFromDate: moment().format('YYYY-MM-DD'),
      note: '',
      updateLinkedOrigins: false
    });
    setShowEditModal(true);
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Please enter Dabbi Name');
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/dabbi', {
        name: formData.name.trim(),
        imageUrl: formData.imageUrl.trim(),
        boxRate: Number(formData.boxRate) || 0,
        boxReturnRate: Number(formData.boxReturnRate) || 0,
        size: formData.size.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        toast.success(`✅ Dabbi "${formData.name.trim()}" created successfully!`);
        setShowAddModal(false);
        fetchDabbis();
        if (onDabbiUpdated) onDabbiUpdated();
      }
    } catch (err) {
      console.error('Error adding dabbi:', err);
      toast.error(err.response?.data?.message || 'Failed to create Dabbi');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingDabbi || !formData.name.trim()) {
      toast.error('Please enter Dabbi Name');
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const res = await axios.put('/api/dabbi', {
        id: editingDabbi._id,
        name: formData.name.trim(),
        imageUrl: formData.imageUrl.trim(),
        boxRate: Number(formData.boxRate) || 0,
        boxReturnRate: Number(formData.boxReturnRate) || 0,
        size: formData.size.trim(),
        isCorrection: formData.isCorrection,
        effectiveFromDate: formData.effectiveFromDate,
        note: formData.note,
        updateLinkedOrigins: formData.updateLinkedOrigins
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        toast.success(`✅ Dabbi "${formData.name.trim()}" updated successfully!`);
        setShowEditModal(false);
        setEditingDabbi(null);
        fetchDabbis();
        if (onDabbiUpdated) onDabbiUpdated();
      }
    } catch (err) {
      console.error('Error editing dabbi:', err);
      toast.error(err.response?.data?.message || 'Failed to update Dabbi');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dabbi) => {
    const confirmMsg = dabbi.linkedOriginsCount > 0
      ? `"${dabbi.name}" is linked to ${dabbi.linkedOriginsCount} product(s). Deactivating it will hide it from future selection while preserving historical billings. Continue?`
      : `Are you sure you want to delete "${dabbi.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`/api/dabbi?id=${dabbi._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        toast.success(`✅ ${res.data.message}`);
        fetchDabbis();
        if (onDabbiUpdated) onDabbiUpdated();
      }
    } catch (err) {
      console.error('Error deleting dabbi:', err);
      toast.error(err.response?.data?.message || 'Failed to delete Dabbi');
    }
  };

  const content = (
    <div className="space-y-4">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <FaBoxOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
              <span>Dabbi (Packaging Box) Catalog</span>
              <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                {dabbis.length} Dabbis
              </span>
            </h2>
            <p className="text-xs text-gray-500">
              Configure standard packaging boxes, dispatch rates, and return deduction rates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <FaSearch className="absolute left-3 top-2.5 text-gray-400 w-3 h-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dabbi name or size..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={fetchDabbis}
            disabled={loading}
            className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            title="Refresh Dabbis"
          >
            <FaSync className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
          >
            <FaPlus className="w-3 h-3" />
            <span>+ Add New Dabbi</span>
          </button>
        </div>
      </div>

      {/* Catalog Grid / Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
        {loading && dabbis.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-xs">
            <FaSync className="animate-spin w-6 h-6 mx-auto mb-2 text-purple-600" />
            <span>Loading Dabbi catalog...</span>
          </div>
        ) : filteredDabbis.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-xs">
            <FaBoxOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="font-semibold text-gray-600">No Dabbis found</p>
            <p className="text-gray-400 mt-1">Click &quot;+ Add New Dabbi&quot; to configure your first packaging box.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  <th className="px-4 py-3">Dabbi Details</th>
                  <th className="px-3 py-3 text-center">Size</th>
                  <th className="px-4 py-3 text-right text-emerald-800">Dispatch Dabbi Rate</th>
                  <th className="px-4 py-3 text-right text-purple-800">Return Dabbi Rate</th>
                  <th className="px-3 py-3 text-center">Linked Products</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredDabbis.map(d => (
                  <tr key={d._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {d.imageUrl ? (
                          <img
                            src={d.imageUrl}
                            alt={d.name}
                            className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0 shadow-2xs"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shrink-0">
                            <FaBoxOpen className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-gray-900 text-sm">
                            {d.name}
                          </div>
                          {d.imageUrl && (
                            <a
                              href={d.imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 mt-0.5"
                            >
                              <span>View Image</span>
                              <FaExternalLinkAlt className="w-2 h-2" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center">
                      {d.size ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                          {d.size}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      ₹{Number(d.boxRate || 0).toFixed(2)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-purple-700">
                      ₹{Number(d.boxReturnRate || 0).toFixed(2)}
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        d.linkedOriginsCount > 0
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {d.linkedOriginsCount || 0} origins
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(d)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Edit Dabbi"
                        >
                          <FaEdit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete / Deactivate Dabbi"
                        >
                          <FaTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ADD DABBI MODAL                                                           */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-lg">
                <FaBoxOpen className="w-5 h-5" />
                <span>Add New Dabbi Configuration</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Dabbi Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Small Dabbi, Necklace Box, Earring Box"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Dispatch Dabbi Rate (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.boxRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, boxRate: e.target.value }))}
                    placeholder="2.40"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Return Dabbi Rate (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.boxReturnRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, boxReturnRate: e.target.value }))}
                    placeholder="2.40"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Size / Category
                </label>
                <select
                  value={formData.size}
                  onChange={(e) => setFormData(prev => ({ ...prev, size: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium"
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
                  Image URL / Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://... image link"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  {formData.imageUrl ? (
                    <img
                      src={formData.imageUrl}
                      alt="preview"
                      className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0 shadow-2xs"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                      <FaImage className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  {saving ? <FaSync className="animate-spin w-4 h-4" /> : <FaPlus className="w-3.5 h-3.5" />}
                  <span>Save Dabbi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT DABBI MODAL (WITH DATE-EFFECTIVE VERSIONING)                           */}
      {/* ========================================================================= */}
      {showEditModal && editingDabbi && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-lg">
                <FaEdit className="w-4 h-4" />
                <span>Edit Dabbi: {editingDabbi.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Dabbi Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Dispatch Dabbi Rate (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.boxRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, boxRate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Return Dabbi Rate (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.boxReturnRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, boxReturnRate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Size / Category
                </label>
                <select
                  value={formData.size}
                  onChange={(e) => setFormData(prev => ({ ...prev, size: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium"
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
                  Image URL / Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  {formData.imageUrl ? (
                    <img
                      src={formData.imageUrl}
                      alt="preview"
                      className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0 shadow-2xs"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                      <FaImage className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              {/* Rate Change Schedule / Revision Options */}
              {(Number(formData.boxRate) !== Number(editingDabbi.boxRate) ||
                Number(formData.boxReturnRate) !== Number(editingDabbi.boxReturnRate)) && (
                <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      <FaCalendarAlt className="w-3.5 h-3.5 text-purple-600" />
                      <span>Rate Revision Schedule</span>
                    </span>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      Old vs New Billings
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="revisionType"
                        checked={!formData.isCorrection}
                        onChange={() => setFormData(prev => ({ ...prev, isCorrection: false }))}
                        className="mt-0.5 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <span className="font-bold text-gray-900 block">Date-Effective Revision (Recommended)</span>
                        <span className="text-gray-500 text-[11px]">
                          Old billings stick with previous rates; new rate applies to orders on/after effective date.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="revisionType"
                        checked={formData.isCorrection}
                        onChange={() => setFormData(prev => ({ ...prev, isCorrection: true }))}
                        className="mt-0.5 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <span className="font-bold text-gray-900 block">Correction / Typo Fix</span>
                        <span className="text-gray-500 text-[11px]">
                          Corrects the rate immediately without creating a date split.
                        </span>
                      </div>
                    </label>
                  </div>

                  {!formData.isCorrection && (
                    <div className="pt-2 border-t border-purple-200/60">
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">
                        Effective From Date:
                      </label>
                      <input
                        type="date"
                        value={formData.effectiveFromDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, effectiveFromDate: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-purple-300 rounded-lg text-xs bg-white font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {editingDabbi.linkedOriginsCount > 0 && (
                    <label className="flex items-start gap-2 pt-2 border-t border-purple-200/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.updateLinkedOrigins}
                        onChange={(e) => setFormData(prev => ({ ...prev, updateLinkedOrigins: e.target.checked }))}
                        className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-xs font-semibold text-purple-950">
                        Also update rates for all {editingDabbi.linkedOriginsCount} product(s) linked to this Dabbi
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  {saving ? <FaSync className="animate-spin w-4 h-4" /> : <FaCheck className="w-3.5 h-3.5" />}
                  <span>Update Dabbi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // If rendered as a standalone modal
  if (isOpen !== undefined) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
        <div className="bg-gray-50 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 border border-gray-200 flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <div className="flex items-center gap-2 text-purple-700 font-bold text-lg">
              <FaBoxOpen className="w-5 h-5" />
              <span>Dabbi Packaging Configuration</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-200/60 transition cursor-pointer"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1">{content}</div>
        </div>
      </div>
    );
  }

  // If rendered inline (e.g. inside Settings)
  return content;
}
