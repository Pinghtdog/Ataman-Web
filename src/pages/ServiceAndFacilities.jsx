import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const ServiceAndFacilities = () => {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const facilityId = 1; 

  const fetchResources = async () => {
    const { data, error } = await supabase
      .from('facility_resources')
      .select('*')
      .eq('facility_id', facilityId);
    
    if (error) {
      console.error("Policy Error:", error.message);
    } else {
      // Deduplicate by resource_type just in case the DB has clones
      const uniqueData = data?.filter((v, i, a) => a.findIndex(t => (t.resource_type === v.resource_type)) === i);
      setResources(uniqueData || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchResources();

    const channel = supabase.channel('facility-updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'facility_resources' 
      }, fetchResources)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    
    // Optimistic UI update: change it locally first so it feels instant
    setResources(prev => prev.map(item => 
      item.id === id ? { ...item, status: newStatus } : item
    ));

    const { error } = await supabase
      .from('facility_resources')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) fetchResources(); // Revert if the DB update fails
  };

  const diagnostics = resources.filter(r => r.resource_category === 'diagnostic');
  const wards = resources.filter(r => r.resource_category === 'ward');
  const inventory = resources.filter(r => r.resource_category === 'inventory');

  if (loading) return <div className="p-10 text-gray-400 font-bold animate-pulse text-center">Syncing Facility Systems...</div>;

  return (
    <div className="p-10 bg-[#F8FAFC] min-h-screen">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Facility & Service Status</h1>
        <p className="text-gray-500 text-sm font-medium">Control what patients see on the Ataman Map.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* DIAGNOSTIC EQUIPMENT */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 min-h-[250px]">
          <h2 className="text-lg font-bold text-gray-800 mb-8">Diagnostic Equipment</h2>
          <div className="space-y-8">
            {diagnostics.map(item => (
              <div key={item.id} className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-800 text-sm">{item.resource_type}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{item.sub_text}</p>
                </div>
                <div className="flex items-center gap-6">
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${item.status === 'ONLINE' ? 'text-emerald-500' : 'text-gray-300'}`}>
                    {item.status}
                  </span>
                  <button 
                    onClick={() => toggleStatus(item.id, item.status)}
                    className={`w-12 h-6 rounded-full relative transition-all duration-300 ${item.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${item.status === 'ONLINE' ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WARD CAPACITY */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 min-h-[250px]">
          <h2 className="text-lg font-bold text-gray-800 mb-8">Ward Capacity</h2>
          <div className="space-y-10">
            {wards.map(ward => {
              const percentage = Math.min(100, Math.round((ward.current_occupied / ward.total_capacity) * 100));
              const isFull = percentage >= 100;
              return (
                <div key={ward.id}>
                  <div className="flex justify-between mb-3 items-end">
                    <p className="font-bold text-gray-800 text-sm">{ward.resource_type}</p>
                    <p className={`text-sm font-black ${isFull ? 'text-red-600 animate-pulse' : 'text-orange-500'}`}>
                      {percentage}%
                    </p>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ease-out ${isFull ? 'bg-red-600' : 'bg-orange-400'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CRITICAL INVENTORY */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-8">Critical Inventory</h2>
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
              <th className="pb-4">Resource Item</th>
              <th className="pb-4">Current Status</th>
              <th className="pb-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {inventory.map(item => (
              <tr key={item.id} className="hover:bg-gray-50/30 transition-colors">
                <td className="py-6 font-bold text-sm text-gray-800">{item.resource_type}</td>
                <td className="py-6">
                  <span className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                    item.status === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="py-6 text-right">
                  <button 
                    onClick={() => alert(`Logistics department notified for ${item.resource_type}`)}
                    className="text-[10px] font-black text-primary border-2 border-primary/20 px-6 py-2 rounded-xl uppercase tracking-widest hover:bg-primary hover:text-white transition-all active:scale-95 shadow-sm"
                  >
                    Request Stock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ServiceAndFacilities;