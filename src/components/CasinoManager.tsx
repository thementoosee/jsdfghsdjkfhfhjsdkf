import React, { useState, useEffect } from 'react';
import { X, Trash2, Edit2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Casino {
  id: string;
  name: string;
  thumbnail_url: string;
  is_active: boolean;
  order_index: number;
}

export default function CasinoManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [casinos, setCasinos] = useState<Casino[]>([]);
  const [editingCasino, setEditingCasino] = useState<Casino | null>(null);
  const [newCasino, setNewCasino] = useState({
    name: '',
    thumbnail_url: 'https://i.imgur.com/wVqLzwT.png'
  });

  useEffect(() => {
    if (isOpen) {
      loadCasinos();
    }
  }, [isOpen]);

  useEffect(() => {
    const channel = supabase
      .channel('casinos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casinos' }, () => {
        loadCasinos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadCasinos = async () => {
    const { data, error } = await supabase
      .from('casinos')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error loading casinos:', error);
      return;
    }

    setCasinos(data || []);
  };

  const handleCreate = async () => {
    if (!newCasino.name.trim()) {
      alert('Please enter a casino name');
      return;
    }

    const { data, error } = await supabase
      .from('casinos')
      .insert([{
        name: newCasino.name,
        thumbnail_url: newCasino.thumbnail_url,
        is_active: false,
        order_index: casinos.length
      }])
      .select();

    if (error) {
      console.error('Error creating casino:', error);
      alert('Failed to create casino');
      return;
    }

    if (data && Array.isArray(data)) {
      setCasinos(prev => [...prev, ...data]);
    } else {
      loadCasinos();
    }

    setNewCasino({
      name: '',
      thumbnail_url: 'https://i.imgur.com/wVqLzwT.png'
    });
  };

  const handleEdit = (casino: Casino) => {
    setEditingCasino(casino);
    setNewCasino({
      name: casino.name,
      thumbnail_url: casino.thumbnail_url || 'https://i.imgur.com/wVqLzwT.png'
    });
  };

  const handleUpdate = async () => {
    if (!editingCasino) return;
    if (!newCasino.name.trim()) {
      alert('Please enter a casino name');
      return;
    }

    const { data, error } = await supabase
      .from('casinos')
      .update({
        name: newCasino.name,
        thumbnail_url: newCasino.thumbnail_url
      })
      .eq('id', editingCasino.id)
      .select();

    if (error) {
      console.error('Error updating casino:', error);
      alert('Failed to update casino');
      return;
    }

    if (data && Array.isArray(data) && data.length > 0) {
      setCasinos(prev => prev.map(c => c.id === editingCasino.id ? { ...c, ...data[0] } : c));
    } else {
      loadCasinos();
    }

    setEditingCasino(null);
    setNewCasino({
      name: '',
      thumbnail_url: 'https://i.imgur.com/wVqLzwT.png'
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this casino?')) {
      return;
    }

    const { error } = await supabase
      .from('casinos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting casino:', error);
      alert('Failed to delete casino');
      return;
    }

    setCasinos(prev => prev.filter(casino => casino.id !== id));
  };

  const handleClear = () => {
    setEditingCasino(null);
    setNewCasino({
      name: '',
      thumbnail_url: 'https://i.imgur.com/wVqLzwT.png'
    });
  };

  const handleSetActive = async (casinoId: string) => {
    await supabase
      .from('casinos')
      .update({ is_active: false })
      .neq('id', casinoId);

    const { data, error } = await supabase
      .from('casinos')
      .update({ is_active: true })
      .eq('id', casinoId)
      .select();

    if (error) {
      console.error('Error setting active casino:', error);
      alert('Failed to set active casino');
      return;
    }

    setCasinos(prev => prev.map(casino => ({
      ...casino,
      is_active: casino.id === casinoId
    })));

    if (editingCasino?.id === casinoId && data && Array.isArray(data) && data[0]) {
      setEditingCasino(prev => prev ? { ...prev, ...data[0] } : prev);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
      >
        Manage Casinos
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white">Casino Management</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Casinos ({casinos.length})
                </h3>
                <button
                  onClick={() => {
                    setEditingCasino(null);
                    setNewCasino({
                      name: '',
                      thumbnail_url: 'https://i.imgur.com/wVqLzwT.png'
                    });
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  + Add New
                </button>
              </div>

              <div className="space-y-3">
                {casinos.map((casino) => (
                  <div
                    key={casino.id}
                    className={`rounded-lg p-4 flex items-center justify-between transition-colors cursor-pointer ${
                      casino.is_active
                        ? 'bg-blue-600/20 border-2 border-blue-500'
                        : 'bg-[#252525] hover:bg-[#2a2a2a]'
                    }`}
                    onClick={() => handleSetActive(casino.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                        <img
                          src={casino.thumbnail_url}
                          alt={casino.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://i.imgur.com/wVqLzwT.png';
                          }}
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-white font-medium">{casino.name}</span>
                        {casino.is_active && (
                          <span className="text-xs text-blue-400 font-semibold">ACTIVE</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(casino);
                        }}
                        className="text-gray-400 hover:text-blue-300 transition-colors"
                        title="Edit casino"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(casino.id);
                        }}
                        className="text-gray-400 hover:text-red-400 transition-colors"
                        title="Delete casino"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}

                {casinos.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No casinos added yet
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-4">
                {editingCasino ? 'Edit Casino' : 'Add New Casino'}
              </h3>

              <div className="bg-[#252525] rounded-lg p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Casino Name
                  </label>
                  <input
                    type="text"
                    value={newCasino.name}
                    onChange={(e) => setNewCasino({ ...newCasino, name: e.target.value })}
                    placeholder="Enter casino name"
                    className="w-full px-4 py-3 bg-[#1a1a1a] text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Thumbnail URL
                  </label>
                  <input
                    type="text"
                    value={newCasino.thumbnail_url}
                    onChange={(e) => setNewCasino({ ...newCasino, thumbnail_url: e.target.value })}
                    placeholder="https://i.imgur.com/wVqLzwT.png"
                    className="w-full px-4 py-3 bg-[#1a1a1a] text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Must be .png format and 1:1 aspect ratio
                  </p>
                </div>

                <div className="flex justify-center">
                  <div className="w-40 h-40 rounded-lg overflow-hidden bg-gradient-to-br from-purple-900/20 to-blue-900/20 p-4 flex items-center justify-center">
                    <img
                      src={newCasino.thumbnail_url}
                      alt="Preview"
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://i.imgur.com/wVqLzwT.png';
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleClear}
                    className="flex-1 px-6 py-3 bg-[#1a1a1a] hover:bg-[#222] text-white rounded-lg font-medium transition-colors"
                  >
                    Clear
                  </button>
                  {editingCasino ? (
                    <>
                      <button
                        onClick={() => {
                          setEditingCasino(null);
                          handleClear();
                        }}
                        className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                      >
                        Cancel Edit
                      </button>
                      <button
                        onClick={handleUpdate}
                        disabled={!newCasino.name.trim()}
                        className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                      >
                        Save Changes
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCreate}
                      disabled={!newCasino.name.trim()}
                      className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      Create
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
