import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Lock, Plus, Search, Trash2, Edit3, Download, Check, Shirt } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Employee } from '../types';
import * as XLSX from 'xlsx';

interface Props {
  employees: Employee[];
  activePeriodId?: string;
  setActivePeriodId?: (id: string) => void;
  isEmployee?: boolean;
  currentEmployeeId?: string;
}

export function PotonganSeragamManager({ employees, activePeriodId, setActivePeriodId, isEmployee = false, currentEmployeeId }: Props) {
  const [controls, setControls] = useState<Record<string, any>>({});
  const [allPeriodData, setAllPeriodData] = useState<any[]>([]);
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const getCombinedPeriods = (ctrls: Record<string, any>) => {
      const periods = Object.entries(ctrls)
        .filter(([id, data]) => !data.hidden && data.name && data.startDate && data.endDate)
        .map(([id, c]) => ({
          value: id,
          label: c.name || id,
          start: c.startDate ? new Date(c.startDate) : new Date(0)
        }))
        .sort((a, b) => b.start.getTime() - a.start.getTime()); // Newest first
      return periods;
  };

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});
  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);

  const [entries, setEntries] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [inputDesc, setInputDesc] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Grouped entries for the table
  const groupedEntries = React.useMemo(() => {
    const groups: Record<string, { empId: string, total: number, items: any[] }> = {};
    entries.forEach(entry => {
      if (!groups[entry.empId]) {
        groups[entry.empId] = { empId: entry.empId, total: 0, items: [] };
      }
      groups[entry.empId].total += entry.amount;
      groups[entry.empId].items.push(entry);
    });
    return Object.values(groups).sort((a, b) => {
        const empA = employees.find(e => e.id === a.empId);
        const empB = employees.find(e => e.id === b.empId);
        return (empA?.name || '').localeCompare(empB?.name || '');
    });
  }, [entries, employees]);

  // Unlock Dialog
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isEmployee && currentEmployeeId) {
      const unsub = onSnapshot(collection(db, 'potonganSeragam'), (snap) => {
        const history: any[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.entries && Array.isArray(data.entries)) {
            data.entries.forEach((entry: any) => {
              if (entry.empId === currentEmployeeId) {
                history.push({
                  periodId: d.id,
                  ...entry
                });
              }
            });
          } else if (data.entries && data.entries[currentEmployeeId]) {
            // Backward compatibility for old single-entry structure
            history.push({
              periodId: d.id,
              ...data.entries[currentEmployeeId]
            });
          }
        });
        setAllPeriodData(history.sort((a, b) => b.periodId.localeCompare(a.periodId)));
        setLoading(false);
      });
      return unsub;
    }
  }, [isEmployee, currentEmployeeId]);

  useEffect(() => {
    let componentMounted = true;
    if (isEmployee) {
      setLoading(false);
      return;
    }
    if (!selectedPeriod) {
        setLoading(false);
        return;
    }
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'potonganSeragam', selectedPeriod), (snap) => {
      if (componentMounted) {
        if (snap.exists()) {
          const data = snap.data();
          let rawEntries = data.entries || [];
          // Handle migration from old object structure to new array structure
          if (!Array.isArray(rawEntries)) {
            rawEntries = Object.entries(rawEntries).map(([empId, val]: [string, any]) => ({
              id: `migrated-${empId}`,
              empId,
              amount: val.amount,
              description: val.description,
              createdAt: data.updatedAt || serverTimestamp()
            }));
          }
          setEntries(rawEntries);
          setIsLocked(data.isLocked || false);
        } else {
          setEntries([]);
          setIsLocked(false);
        }
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `potonganSeragam/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsub();
    };
  }, [selectedPeriod]);

  const saveEntries = async (updated: any[]) => {
    try {
      const docRef = doc(db, 'potonganSeragam', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          entries: updated,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          entries: updated,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `potonganSeragam/${selectedPeriod}`);
    }
  };

  const handleAdd = () => {
    if (!selectedEmpId || !inputAmount || !inputDesc) {
      toast.error("Pilih karyawan, isi nama seragam, dan harga");
      return;
    }
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const amount = parseInt(inputAmount.replace(/\D/g, '')) || 0;
    const newEntry = {
        id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random().toString(36).substring(2)),
        empId: selectedEmpId,
        amount,
        description: inputDesc,
        createdAt: new Date().toISOString()
    };
    const updated = [...entries, newEntry];
    setEntries(updated);
    saveEntries(updated);
    
    setSelectedEmpId('');
    setInputAmount('');
    setInputDesc('');
    setSearchTerm('');
    toast.success("Data ditambahkan");
  };

  const handleRemove = (entryId: string) => {
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const pass = prompt("Masukkan password untuk hapus potongan seragam:");
    if (pass !== 'admin123') {
        toast.error("Password salah");
        return;
    }
    const updated = entries.filter(e => e.id !== entryId);
    setEntries(updated);
    saveEntries(updated);
    toast.success("Data dihapus");
  };
  
  const handleEdit = (entry: any) => {
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const pass = prompt("Masukkan password untuk edit potongan seragam:");
    if (pass !== 'admin123') {
        toast.error("Password salah");
        return;
    }
    
    const newDesc = prompt("Keterangan seragam baru:", entry.description);
    if (newDesc === null) return;
    
    const newAmountStr = prompt("Harga baru:", entry.amount.toString());
    if (newAmountStr === null) return;
    
    const newAmount = parseInt(newAmountStr.replace(/\D/g, '')) || 0;
    if (newAmount < 0) {
        toast.error("Nominal tidak valid");
        return;
    }

    const updated = entries.map(e => e.id === entry.id ? { ...e, amount: newAmount, description: newDesc || e.description } : e);
    setEntries(updated);
    saveEntries(updated);
    toast.success("Data diubah");
  };

  const handleDownload = () => {
    const data = entries.map((entry: any) => {
      const emp = employees.find(e => e.id === entry.empId);
      return {
        'No. Absen': emp?.pin || '',
        'Nama': emp?.name || '',
        'Keterangan': entry.description,
        'Nominal': entry.amount,
        'Tgl Input': entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('id-ID') : '-'
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Potongan Seragam");
    XLSX.writeFile(wb, `Potongan_Seragam_${currentPeriod?.label || selectedPeriod}.xlsx`);
  };

  const toggleLock = async () => {
      if (isLocked) {
          setShowUnlockDialog(true);
      } else {
           await setDoc(doc(db, 'potonganSeragam', selectedPeriod), { isLocked: true }, { merge: true });
           toast.success("Periode dikunci");
      }
  }

  const handleUnlock = async () => {
    if (password === 'admin123') { 
       await setDoc(doc(db, 'potonganSeragam', selectedPeriod), { isLocked: false }, { merge: true });
       setShowUnlockDialog(false);
       setPassword('');
       toast.success("Periode dibuka");
    } else {
       toast.error("Password salah");
    }
  }

  const getFilteredEmployees = () => {
      if (!searchTerm) {
          return employees.slice(0, 5); // Show first 5 by default when searching
      }
      return employees.filter(e => 
          (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           e.pin.includes(searchTerm)) &&
          e.isActive !== false
      ).slice(0, 5);
  };

  if (loading) {
     return <div className="p-8 text-center text-white/40">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {isEmployee ? (
        <div className="space-y-4">
           <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                <div>
                    <h3 className="text-white font-bold">Total Potongan Seragam</h3>
                    <p className="text-white/40 text-xs">Total biaya seragam yang pernah diambil</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-black text-fuchsia-400">
                        {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(allPeriodData.reduce((sum, d) => sum + d.amount, 0))}
                    </p>
                </div>
            </div>

            <Card className="glass-panel border-none bg-black/40 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="border-white/5 bg-white/5">
                            <TableHead className="text-white/40">Periode</TableHead>
                            <TableHead className="text-white/40">Item</TableHead>
                            <TableHead className="text-white/40 text-right">Potongan</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {allPeriodData.map((item, idx) => (
                            <TableRow key={idx} className="border-white/5">
                                <TableCell className="text-white/60">
                                    {periodOptions.find(p => p.value === item.periodId)?.label || item.periodId}
                                </TableCell>
                                <TableCell className="text-white font-medium">{item.description}</TableCell>
                                <TableCell className="text-right text-fuchsia-400 font-bold">
                                    {new Intl.NumberFormat('id-ID').format(item.amount)}
                                </TableCell>
                            </TableRow>
                        ))}
                        {allPeriodData.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-20 text-white/20 italic">
                                    Belum ada data potongan seragam.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
      ) : (
      <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Shirt className="w-5 h-5 text-fuchsia-400" /> Potongan Seragam
          </h2>
          <p className="text-white/40 text-xs font-medium lowercase">periode: {currentPeriod?.label || selectedPeriod}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px] glass-panel border-white/10 text-white h-11 px-6 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                 {currentPeriod?.label || selectedPeriod}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 text-white">
              {periodOptions.map((p) => (
                <SelectItem key={p.value} value={p.value} className="focus:bg-white/10">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
             variant="outline" 
             onClick={toggleLock}
             className={`h-11 px-6 rounded-xl border-white/10 transition-colors ${
                 isLocked ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-bold' : 'glass-panel text-white/70 hover:text-white'
             }`}
          >
             {isLocked ? <><Lock className="w-4 h-4 mr-2" /> Kunci Aktif</> : 'Kunci Periode'}
          </Button>
          <Button onClick={handleDownload} variant="outline" className="glass-panel border-white/10 text-white hover:bg-white/10 h-11 px-6 rounded-xl">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-none bg-black/90 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Buka Kunci Periode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input 
              type="password" 
              placeholder="Masukkan password..." 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-white w-full"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowUnlockDialog(false)} className="text-white/50 hover:text-white hover:bg-white/5">Batal</Button>
            <Button onClick={handleUnlock} className="bg-rose-600 hover:bg-rose-700 text-white">Buka Kunci</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="glass-panel border-none bg-black/40">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-fuchsia-400 transition-colors" />
                <Input 
                    placeholder="Ketik nama / absen karyawan..." 
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setSelectedEmpId('');
                    }}
                    className="pl-9 bg-white/5 border-white/10 text-white focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 rounded-xl"
                />
                
                {searchTerm && !selectedEmpId && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto overflow-x-hidden p-2">
                        {getFilteredEmployees().length > 0 ? (
                            getFilteredEmployees().map(emp => (
                                <button
                                    key={emp.id}
                                    onClick={() => {
                                        setSelectedEmpId(emp.id);
                                        setSearchTerm(emp.name);
                                    }}
                                    className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors flex items-center justify-between ${
                                        selectedEmpId === emp.id 
                                            ? 'bg-fuchsia-500/20 text-fuchsia-400' 
                                            : 'text-white/70 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <div>
                                        <span className="font-bold mr-2">{emp.pin}</span>
                                        <span>{emp.name}</span>
                                    </div>
                                    {selectedEmpId === emp.id && <Check className="w-4 h-4" />}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-sm text-white/40 text-center italic">
                                Karyawan tidak ditemukan
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            <div className="flex-1 w-full">
              <Input 
                placeholder="Keterangan Seragam (e.g. Baju PDH)" 
                value={inputDesc}
                onChange={(e) => setInputDesc(e.target.value)}
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>

            <div className="w-[180px]">
              <Input 
                placeholder="Harga (Rp)" 
                value={inputAmount}
                onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setInputAmount(val ? new Intl.NumberFormat('id-ID').format(parseInt(val)) : '');
                }}
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            
            <Button 
                onClick={handleAdd} 
                disabled={isLocked || !selectedEmpId || !inputAmount || !inputDesc} 
                className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold h-10 px-8 rounded-xl w-full md:w-auto"
            >
                <Plus className="w-4 h-4 mr-2" />
                Tambah
            </Button>
          </div>

          <div className="rounded-xl border border-white/5 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 bg-white/5 hover:bg-white/5">
                  <TableHead className="text-white/40 font-medium">No. Absen</TableHead>
                  <TableHead className="text-white/40 font-medium">Nama</TableHead>
                  <TableHead className="text-white/40 font-medium">Detail Seragam</TableHead>
                  <TableHead className="text-white/40 font-medium text-right">Potongan</TableHead>
                  <TableHead className="w-[100px] text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedEntries.map((group) => {
                  const emp = employees.find(e => e.id === group.empId);
                  return (
                    <React.Fragment key={group.empId}>
                        {/* Summary Row */}
                        <TableRow className="border-white/5 bg-white/[0.01]">
                            <TableCell className="font-mono text-white/60">{emp?.pin}</TableCell>
                            <TableCell className="font-bold text-white uppercase">{emp?.name}</TableCell>
                            <TableCell className="text-white/40 italic text-xs">
                                Akumulasi ({group.items.length} item)
                            </TableCell>
                            <TableCell className="text-right font-black text-fuchsia-400 text-lg">
                                {new Intl.NumberFormat('id-ID').format(group.total)}
                            </TableCell>
                            <TableCell className="text-right"></TableCell>
                        </TableRow>
                        
                        {/* Detail Rows */}
                        {group.items.map((item) => (
                          <TableRow key={item.id} className="border-white/5 hover:bg-white/[0.05] bg-black/20">
                            <TableCell className="py-2"></TableCell>
                            <TableCell className="py-2"></TableCell>
                            <TableCell className="text-white/70 py-2 text-sm flex items-center gap-2">
                                <Shirt className="w-3 h-3 text-fuchsia-400/50" />
                                {item.description}
                                {item.createdAt && <span className="text-[10px] text-white/20 italic ml-2">{new Date(item.createdAt).toLocaleDateString('id-ID')}</span>}
                            </TableCell>
                            <TableCell className="text-right font-medium text-white/60 py-2">
                                {new Intl.NumberFormat('id-ID').format(item.amount)}
                            </TableCell>
                            <TableCell className="text-right py-2">
                              <div className="flex items-center justify-end">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleEdit(item)} 
                                    disabled={isLocked}
                                    className="text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 h-7 w-7 p-0"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleRemove(item.id)} 
                                    disabled={isLocked}
                                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-400/10 h-7 w-7 p-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </React.Fragment>
                  );
                })}
                {entries.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={5} className="text-center py-12 text-white/40 italic">
                        Belum ada data potongan seragam di periode ini.
                     </TableCell>
                   </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
