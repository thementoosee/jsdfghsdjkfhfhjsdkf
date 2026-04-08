import React, { useState } from 'react';
import { 
  ArrowDownUp, 
  Power, 
  Play, 
  Plus, 
  Trash2,
  CheckCircle2,
  Circle
} from 'lucide-react';
import { Slot, HuntStats } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const App: React.FC = () => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [stats, setStats] = useState<HuntStats>({
    start: 0,
    creator: '',
    streamer: 'None',
    isRankingEnabled: false,
  });

  const openedSlots = slots.filter(s => s.isOpened);
  const totalEarning = slots.reduce((acc, s) => acc + s.earning, 0);
  const totalBet = slots.reduce((acc, s) => acc + s.bet, 0);
  const avgMulti = openedSlots.length > 0 
    ? (openedSlots.reduce((acc, s) => acc + s.multi, 0) / openedSlots.length).toFixed(1) 
    : '0';

  const addSlot = () => {
    const newSlot: Slot = {
      id: crypto.randomUUID(),
      name: '',
      bet: 0,
      type: 'Normal',
      earning: 0,
      multi: 0,
      isOpened: false,
    };
    setSlots([...slots, newSlot]);
  };

  const updateSlot = (id: string, updates: Partial<Slot>) => {
    setSlots(slots.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeSlot = (id: string) => {
    setSlots(slots.filter(s => s.id !== id));
  };

  const toggleOpened = (id: string) => {
    const slot = slots.find(s => s.id === id);
    if (slot) {
      updateSlot(id, { isOpened: !slot.isOpened });
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f11] text-gray-300 flex font-sans p-4 gap-4">
      {/* Sidebar */}
      <aside className="w-72 flex flex-col gap-3">
        {/* Stats Section */}
        <div className="bg-[#1a1b1e] rounded-xl p-4 border border-gray-800/50">
          <h2 className="text-[#3b82f6] text-center font-bold text-lg mb-4">Stats</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">Start:</label>
              <input 
                type="number" 
                className="bg-[#0f0f11] border border-gray-800 rounded px-2 py-1 w-24 text-right text-sm focus:outline-none focus:border-blue-500"
                value={stats.start}
                onChange={e => setStats({...stats, start: Number(e.target.value)})}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">Creator:</label>
              <input 
                type="text" 
                className="bg-[#0f0f11] border border-gray-800 rounded px-2 py-1 w-24 text-sm focus:outline-none focus:border-blue-500"
                value={stats.creator}
                onChange={e => setStats({...stats, creator: e.target.value})}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">Streamer:</label>
              <select 
                className="bg-[#0f0f11] border border-gray-800 rounded px-2 py-1 w-24 text-sm focus:outline-none focus:border-blue-500"
                value={stats.streamer}
                onChange={e => setStats({...stats, streamer: e.target.value})}
              >
                <option value="None">None</option>
                <option value="Streamer1">Streamer1</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">Ranking:</label>
              <button 
                onClick={() => setStats({...stats, isRankingEnabled: !stats.isRankingEnabled})}
                className={cn(
                  "w-10 h-5 rounded-full relative transition-colors duration-200 ease-in-out",
                  stats.isRankingEnabled ? "bg-blue-600" : "bg-gray-700"
                )}
              >
                <div className={cn(
                  "absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform duration-200",
                  stats.isRankingEnabled ? "translate-x-5" : ""
                )} />
              </button>
            </div>
          </div>
        </div>

        {/* Bonuses Card */}
        <div className="bg-[#1a1b1e] rounded-xl p-3 border border-gray-800/50">
          <p className="text-blue-500 text-center text-xs font-bold mb-2 uppercase tracking-wider">Bonuses</p>
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Total" value={slots.length} />
            <StatBox label="Opened" value={openedSlots.length} />
            <StatBox label="Supers" value={slots.filter(s => s.type === 'Super').length} />
          </div>
        </div>

        {/* Break Even Card */}
        <div className="bg-[#1a1b1e] rounded-xl p-3 border border-gray-800/50">
          <p className="text-blue-500 text-center text-xs font-bold mb-2 uppercase tracking-wider">Break Even</p>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Initial" value={`x${totalBet > 0 ? (stats.start / totalBet).toFixed(0) : 0}`} />
            <StatBox label="Actual" value={`x${totalBet > 0 ? ((stats.start - totalEarning) / totalBet).toFixed(0) : 0}`} />
          </div>
        </div>

        {/* Average Card */}
        <div className="bg-[#1a1b1e] rounded-xl p-3 border border-gray-800/50">
          <p className="text-blue-500 text-center text-xs font-bold mb-2 uppercase tracking-wider">Average</p>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Mult(x)" value={`x${avgMulti}`} />
            <StatBox label="Pay($)" value={`$${openedSlots.length > 0 ? (totalEarning / openedSlots.length).toFixed(2) : '0.00'}`} />
          </div>
        </div>

        {/* Total Pay Card */}
        <div className="bg-[#1a1b1e] rounded-xl p-3 border border-gray-800/50">
          <p className="text-blue-500 text-center text-xs font-bold mb-2 uppercase tracking-wider">Total Pay</p>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Pay($)" value={`$${totalEarning.toFixed(2)}`} />
            <StatBox label="Profit($)" value={`$${(totalEarning - stats.start).toFixed(2)}`} />
          </div>
        </div>

        {/* Bottom Buttons */}
        <div className="grid grid-cols-3 gap-2 mt-auto">
          <ActionButton icon={<ArrowDownUp size={18} />} label="Order" />
          <ActionButton icon={<Power size={18} />} label="Active" color="green" />
          <ActionButton icon={<Play size={18} />} label="Start" color="orange" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1">
        <div className="bg-[#1a1b1e] rounded-xl border border-gray-800/50 overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-gray-800/50 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            </div>
            <h1 className="font-bold text-lg">Bonus Hunt #434</h1>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#1a1b1e] z-10">
                <tr className="text-[10px] font-black uppercase text-gray-500 tracking-widest border-b border-gray-800/30">
                  <th className="px-6 py-4 w-12">#</th>
                  <th className="px-6 py-4">Slot</th>
                  <th className="px-6 py-4 text-center">Bet</th>
                  <th className="px-6 py-4 text-center">Type</th>
                  <th className="px-6 py-4 text-center">Earning</th>
                  <th className="px-6 py-4 text-center">Multi</th>
                  <th className="px-6 py-4 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/30">
                {slots.map((slot, index) => (
                  <tr key={slot.id} className={cn(
                    "group transition-colors",
                    slot.isOpened ? "bg-blue-500/5" : "hover:bg-white/5"
                  )}>
                    <td className="px-6 py-3 text-xs font-bold text-gray-600">
                      #{index + 1}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#2a2b2e] flex items-center justify-center text-gray-400">?</div>
                        <input 
                          className="bg-transparent border-none focus:ring-0 w-full font-semibold placeholder-gray-600 text-sm"
                          placeholder="Select a slot"
                          value={slot.name}
                          onChange={e => updateSlot(slot.id, { name: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-center">
                        <input 
                          type="number"
                          className="bg-[#2a2b2e] border border-gray-700/50 rounded-lg px-3 py-1.5 w-32 text-center text-sm font-semibold"
                          value={slot.bet === 0 ? '-' : slot.bet}
                          onChange={e => updateSlot(slot.id, { bet: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-center gap-1.5">
                        <button className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold border",
                          slot.type === 'Super' ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-gray-800 text-gray-500 border-transparent"
                        )} onClick={() => updateSlot(slot.id, { type: 'Super' })}>SUPER</button>
                        <button className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-bold border",
                          slot.type === 'Extreme' ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-gray-800 text-gray-500 border-transparent"
                        )} onClick={() => updateSlot(slot.id, { type: 'Extreme' })}>EXTREME</button>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-center">
                        <input 
                          type="number"
                          className="bg-[#2a2b2e] border border-gray-700/50 rounded-lg px-3 py-1.5 w-32 text-center text-sm font-bold text-gray-300"
                          value={slot.earning === 0 ? '-' : slot.earning}
                          onChange={e => {
                            const val = Number(e.target.value) || 0;
                            updateSlot(slot.id, { 
                              earning: val,
                              multi: slot.bet > 0 ? Number((val / slot.bet).toFixed(0)) : 0
                            });
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-center text-sm font-bold text-gray-400">
                        {slot.multi === 0 ? '-' : `x${slot.multi}`}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => toggleOpened(slot.id)}
                          className={cn(
                            "p-1 rounded transition-colors",
                            slot.isOpened ? "text-green-500 bg-green-500/10" : "text-gray-500 hover:text-white"
                          )}
                        >
                          {slot.isOpened ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        </button>
                        <button 
                          onClick={() => removeSlot(slot.id)}
                          className="p-1 text-gray-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={7} className="p-0">
                    <button 
                      onClick={addSlot}
                      className="w-full py-6 flex items-center justify-center gap-2 text-gray-500 hover:text-white hover:bg-white/5 transition-all border-t border-dashed border-gray-800"
                    >
                      <Plus size={18} />
                      <span className="font-semibold">Adicionar nova Slot</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

const StatBox = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-[#0f0f11] border border-gray-800/50 rounded-lg p-2 flex flex-col items-center">
    <span className="text-[9px] uppercase font-bold text-gray-500 mb-1">{label}</span>
    <span className="text-sm font-black text-white">{value}</span>
  </div>
);

const ActionButton = ({ icon, label, color = 'default' }: { icon: React.ReactNode; label: string; color?: 'default' | 'green' | 'orange' }) => {
  const colors = {
    default: "text-gray-400 hover:text-white border-gray-800",
    green: "text-green-500 hover:bg-green-500/10 border-green-500/20",
    orange: "text-orange-500 hover:bg-orange-500/10 border-orange-500/20"
  };
  
  return (
    <button className={cn(
      "flex flex-col items-center gap-1 p-2 rounded-lg border bg-[#1a1b1e] transition-all",
      colors[color]
    )}>
      {icon}
      <span className="text-[10px] font-bold uppercase">{label}</span>
    </button>
  );
};

export default App;
