import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Trash2, Plus, Pencil, Check, X, Calendar, Search, Lock, Unlock } from 'lucide-react';
import { PasswordInput } from './PasswordInput';

export function MasterPeriodManager({
  activePeriodId,
  setActivePeriodId
}: {
  activePeriodId: string;
  setActivePeriodId: (id: string) => void;
}) {
  const [periods, setPeriods] = useState<any[]>([]);
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isEditing, setIsEditing] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
  });

  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockAction, setUnlockAction] = useState<{ type: 'delete' | 'edit' | 'toggle'; id: string; data?: any } | null>(null);
  const [password, setPassword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const snap = await getDocs(collection(db, "periodControls"));
    const p = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Sort by created at descending
    const sorted = p.sort((a: any, b: any) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });
    setPeriods(sorted);
  };

  // Filter and Paginate logic
  const filteredPeriods = periods.filter(p => 
    (p.name || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  const totalPages = Math.ceil(filteredPeriods.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredPeriods.slice(indexOfFirstItem, indexOfLastItem);

  const handleSavePeriod = async () => {
    if (!formData.name || !formData.startDate || !formData.endDate) {
      toast.error("Semua field harus diisi");
      return;
    }

    try {
      if (isEditing) {
        await updateDoc(doc(db, "periodControls", isEditing.id), {
          name: formData.name,
          startDate: formData.startDate,
          endDate: formData.endDate,
          updatedAt: serverTimestamp(),
        });
        toast.success("Periode diperbarui");
      } else {
        const ref = doc(collection(db, "periodControls"));
        await setDoc(ref, {
          name: formData.name,
          startDate: formData.startDate,
          endDate: formData.endDate,
          createdAt: serverTimestamp(),
          active: true
        });
        toast.success("Periode ditambah");
      }
      
      setShowAddDialog(false);
      setIsEditing(null);
      setFormData({ name: '', startDate: '', endDate: '' });
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error("Gagal menyimpan periode");
    }
  };

  const triggerDelete = (id: string) => {
    setUnlockAction({ type: 'delete', id });
    setShowUnlockDialog(true);
  };

  const triggerEdit = (period: any) => {
    setIsEditing(period);
    setFormData({
      name: period.name,
      startDate: period.startDate || '',
      endDate: period.endDate || '',
    });
    setUnlockAction({ type: 'edit', id: period.id });
    setShowUnlockDialog(true);
  };

  const triggerToggle = (id: string, currentActive: boolean) => {
    setUnlockAction({ type: 'toggle', id, data: currentActive });
    setShowUnlockDialog(true);
  };

  const handleUnlockAndAction = async () => {
    if (password === 'admin123') {
      if (unlockAction?.type === 'delete') {
        await deleteDoc(doc(db, "periodControls", unlockAction.id));
        toast.success("Periode dihapus");
        fetchData();
      } else if (unlockAction?.type === 'edit') {
        setShowAddDialog(true);
      } else if (unlockAction?.type === 'toggle') {
        await setDoc(doc(db, "periodControls", unlockAction.id), { active: !unlockAction.data }, { merge: true });
        fetchData();
        toast.success("Status periode diubah");
      }
      
      setShowUnlockDialog(false);
      setPassword('');
      setUnlockAction(null);
    } else {
      toast.error("Password salah");
    }
  };

  const setActive = async (id: string) => {
    await setDoc(doc(db, "systemConfig", "activePeriod"), { periodId: id });
    setActivePeriodId(id);
    toast.success("Periode aktif diset");
  };

  return (
    <Card className="glass-panel border-none bg-black/40 w-full mt-6">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
           <div>
             <h2 className="text-xl font-bold text-white">Master Period Manager</h2>
             <p className="text-white/40 text-xs mt-1">Kelola periode aktif dan histori periode</p>
           </div>
           <div className="flex gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:w-64">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
               <Input 
                 placeholder="Cari periode..." 
                 value={searchQuery}
                 onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                 className="pl-10 bg-white/5 border-white/10 text-white h-10"
               />
             </div>
             <Button 
               onClick={() => { setIsEditing(null); setFormData({name:'', startDate:'', endDate:''}); setShowAddDialog(true); }}
               className="bg-emerald-600 hover:bg-emerald-500 text-white h-10 px-4 whitespace-nowrap"
             >
               <Plus className="w-4 h-4 mr-2" />
               Tambah
             </Button>
           </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/5">
          <Table>
            <TableHeader className="bg-white/5">
                <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-white/40 text-xs uppercase font-bold px-6">Nama Periode</TableHead>
                    <TableHead className="text-white/40 text-xs uppercase font-bold">Mulai</TableHead>
                    <TableHead className="text-white/40 text-xs uppercase font-bold">Selesai</TableHead>
                    <TableHead className="text-white/40 text-xs uppercase font-bold">Status</TableHead>
                    <TableHead className="text-right text-white/40 text-xs uppercase font-bold px-6">Aksi</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {currentItems.map((p) => (
                    <TableRow key={p.id} className="border-white/5 hover:bg-white/5 transition-colors group">
                        <TableCell className="font-medium text-white px-6 py-4">
                          <div className="flex items-center gap-2">
                            {p.name}
                            {activePeriodId === p.id && (
                              <span className="text-[9px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30 font-bold">
                                AKTIF
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-white/70">{p.startDate || '-'}</TableCell>
                        <TableCell className="text-white/70">{p.endDate || '-'}</TableCell>
                        <TableCell>
                            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${p.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              <div className={`w-1 h-1 rounded-full ${p.active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                              {p.active ? 'TERBUKA' : 'TERKUNCI'}
                            </div>
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <div className="flex gap-1 justify-end items-center opacity-40 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="ghost" 
                                onClick={() => triggerToggle(p.id, p.active)} 
                                size="icon"
                                className="h-8 w-8 text-white hover:bg-white/10"
                                title={p.active ? "Kunci Periode" : "Buka Kunci Periode"}
                              >
                                {p.active ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-rose-400" />}
                              </Button>
                              <Button 
                                variant="ghost" 
                                onClick={() => triggerEdit(p)} 
                                size="icon"
                                className="h-8 w-8 text-white hover:text-emerald-400 hover:bg-emerald-400/10"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {activePeriodId !== p.id && (
                                <Button 
                                  variant="ghost" 
                                  onClick={() => setActive(p.id)} 
                                  size="sm"
                                  className="h-8 text-[10px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 ml-1 font-bold"
                                >
                                  SET AKTIF
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                onClick={() => triggerDelete(p.id)} 
                                size="icon"
                                className="h-8 w-8 text-rose-400/60 hover:text-rose-400 hover:bg-rose-400/10"
                                title="Hapus"
                              >
                                <Trash2 className="w-4 h-4"/>
                              </Button>
                          </div>
                        </TableCell>
                    </TableRow>
                ))}
                {currentItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-white/30 italic">
                      Tidak ada periode ditemukan
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6 px-2">
            <p className="text-xs text-white/40 font-mono">
              Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredPeriods.length)} of {filteredPeriods.length}
            </p>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="text-white/60 hover:text-white"
              >
                Previous
              </Button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <Button
                    key={page}
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 ${currentPage === page ? 'bg-emerald-600 text-white' : 'text-white/40'}`}
                  >
                    {page}
                  </Button>
                ))}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="text-white/60 hover:text-white"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Dialog Add/Edit Period */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="glass-panel border-white/10 bg-black/95 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              {isEditing ? 'Edit Periode' : 'Tambah Periode Baru'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="space-y-2">
              <Label className="text-white/70">Nama Periode</Label>
              <Input 
                placeholder="Contoh: MEI 2024 (1)" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/70">Tanggal Mulai</Label>
                <Input 
                  type="date"
                  value={formData.startDate} 
                  onChange={e => setFormData({...formData, startDate: e.target.value})} 
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Tanggal Selesai</Label>
                <Input 
                  type="date"
                  value={formData.endDate} 
                  onChange={e => setFormData({...formData, endDate: e.target.value})} 
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)} className="text-white/50">Batal</Button>
            <Button onClick={handleSavePeriod} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              Simpan Periode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Verification Dialog */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/10 bg-black/95 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Verifikasi Keamanan</DialogTitle>
            <DialogDescription className="text-white/40">
              Tindakan ini memerlukan verifikasi administrator.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <PasswordInput 
              placeholder="Password Admin" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowUnlockDialog(false)} className="text-white/50">Batal</Button>
            <Button 
              onClick={handleUnlockAndAction}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
