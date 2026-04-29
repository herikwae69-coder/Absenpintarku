import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { addMonths, subMonths, format } from 'date-fns';
import { db } from '../lib/firebase';
import { collection, collectionGroup, onSnapshot, doc, setDoc, serverTimestamp, addDoc, query, orderBy, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Lock, Plus, Search, Trash2, Edit3, Download, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Employee, PeriodControl } from '../types';
import { auth } from '../lib/firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  toast.error('Operasi gagal, periksa konsol untuk detail.');
  throw new Error(JSON.stringify(errInfo));
}

interface Debt {
  id: string;
  empId: string;
  empName: string;
  empPin: string;
  description: string;
  totalAmount: number;
  remainingAmount: number;
  createdAt: any;
  paidOffPeriodId?: string;
}

const getPeriodDates = (date: Date) => {
  const day = date.getDate();
  let start: Date, end: Date;

  if (day >= 24) {
    start = new Date(date.getFullYear(), date.getMonth(), 24);
    const nextMonth = addMonths(date, 1);
    end = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 23);
  } else {
    const lastMonth = subMonths(date, 1);
    start = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 24);
    end = new Date(date.getFullYear(), date.getMonth(), 23);
  }
  return { start, end };
};

const formatPeriod = (start: Date, end: Date) => {
  return `${format(start, 'dd MMM yyyy')} - ${format(end, 'dd MMM yyyy')}`;
};

const getPeriodOptions = (monthsBefore: number = 24, monthsAfter: number = 12) => {
  const options = [];
  const now = new Date();
  for (let i = -monthsBefore; i <= monthsAfter; i++) {
    const d = addMonths(now, i);
    const { start, end } = getPeriodDates(d);
    options.push({
      label: formatPeriod(start, end),
      value: `${format(start, 'yyyy-MM-dd')}_${format(end, 'yyyy-MM-dd')}`,
      start,
      end
    });
  }
  return options;
};

const getCombinedPeriods = (firestoreControls: Record<string, any>) => {
  return Object.entries(firestoreControls)
    .filter(([id, data]) => !data.hidden && data.name && data.startDate && data.endDate)
    .map(([id, data]) => ({
      label: data.name,
      value: id,
      start: new Date(data.startDate),
      end: new Date(data.endDate)
    }))
    .sort((a,b) => b.start.getTime() - a.start.getTime());
};

export function PotonganKehilanganManager({ employees, activePeriodId }: { employees: Employee[], activePeriodId?: string }) {
  const employeesRef = useRef(employees);
  useEffect(() => { employeesRef.current = employees; }, [employees]);
  const [password, setPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(activePeriodId);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [newDebtDesc, setNewDebtDesc] = useState('');
  const [newDebtAmount, setNewDebtAmount] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [historyDebt, setHistoryDebt] = useState<Debt | null>(null);
  const [installmentDebt, setInstallmentDebt] = useState<Debt | null>(null);
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [payments, setPayments] = useState<any[]>([]);
  const [controls, setControls] = useState<Record<string, any>>({});
  const periodOptions = useMemo(() => getCombinedPeriods(controls), [controls]);

  useEffect(() => {
     if (periodOptions.length > 0) {
        if (!selectedPeriodId || !periodOptions.find(p => p.value === selectedPeriodId)) {
            setSelectedPeriodId(periodOptions[0].value);
        }
     }
  }, [periodOptions, selectedPeriodId]);

  const toggleLock = () => {
    if (isUnlocked) {
        setIsUnlocked(false);
    } else {
        const pass = prompt("Masukkan password untuk buka kunci:");
        if (pass === 'admin123') {
            setIsUnlocked(true);
        } else {
            toast.error("Password salah");
        }
    }
  };

  const handleViewHistory = async (debt: Debt) => {
      setHistoryDebt(debt);
      const q = query(collection(db, 'potonganKehilangan', debt.empId, 'debts', debt.id, 'payments'));
      const snapshot = await getDocs(q);
      setPayments(snapshot.docs.map(d => ({id: d.id, ...d.data()})));
  }

  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'periodControls');
     });
     return unsub;
  }, []);

  useEffect(() => {
    const q = query(collectionGroup(db, 'debts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const debtData: Debt[] = snapshot.docs.map(doc => ({
        id: doc.id,
        empId: doc.ref.parent.parent?.id || '',
        ...doc.data()
      } as Debt));
      const debtsWithInfo = debtData.map(d => {
        const emp = employeesRef.current.find(e => e.id === d.empId);
        return { ...d, empName: emp?.name || 'Unknown', empPin: emp?.pin || '' };
      });
      setDebts(debtsWithInfo);
    });
    return unsub;
  }, []);

  const filteredDebts = useMemo(() => {
      const selectedIndex = periodOptions.findIndex(p => p.value === selectedPeriodId);
      return debts.filter(d => {
          const matchesSearch = d.empName.toLowerCase().includes(searchTerm.toLowerCase()) || d.empPin.includes(searchTerm);
          if (!matchesSearch) return false;
          
          if (d.remainingAmount === 0) {
              if (d.paidOffPeriodId) {
                  const paidIndex = periodOptions.findIndex(p => p.value === d.paidOffPeriodId);
                  if (paidIndex !== -1 && selectedIndex !== -1) {
                      return selectedIndex >= paidIndex;
                  }
              }
              return false; // Hide legacy LUNAS or if not matching period logic
          }
          return true;
      });
  }, [debts, searchTerm, periodOptions, selectedPeriodId]);

  const handleAddDebt = async () => {
    if (!selectedEmpId || !newDebtDesc || !newDebtAmount) {
      toast.error("Data lengkap diperlukan");
      return;
    }
    const amount = parseInt(newDebtAmount.replace(/\D/g, '')) || 0;
    try {
      await addDoc(collection(db, 'potonganKehilangan', selectedEmpId, 'debts'), {
        description: newDebtDesc,
        totalAmount: amount,
        remainingAmount: amount,
        createdAt: serverTimestamp()
      });
      toast.success("Hutang ditambah");
      setNewDebtDesc('');
      setNewDebtAmount('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'potonganKehilangan/' + selectedEmpId + '/debts');
    }
  };

  const handleDeleteDebt = async (debt: Debt) => {
      const pass = prompt("Masukkan password untuk hapus:");
      if (pass !== 'admin123') { toast.error("Password salah"); return; }
      try {
          await deleteDoc(doc(db, 'potonganKehilangan', debt.empId, 'debts', debt.id));
          toast.success("Hutang dihapus");
      } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, 'potonganKehilangan/' + debt.empId + '/debts/' + debt.id);
      }
  };

  const handleInstallmentClick = (debt: Debt) => {
      if (!isUnlocked) { toast.error("Password diperlukan"); return; }
      if (!selectedPeriodId) { toast.error("Pilih periode terlebih dahulu"); return; }
      if (debt.remainingAmount <= 0) { toast.error("Hutang sudah lunas"); return; }
      
      setInstallmentDebt(debt);
      setInstallmentAmount('');
  };

  const submitInstallment = async () => {
      if (!installmentDebt) return;
      const amount = parseInt(installmentAmount.replace(/\D/g, '')) || 0;
      if (amount <= 0 || amount > installmentDebt.remainingAmount) {
          toast.error("Nominal tidak valid");
          return;
      }
      
      try {
          const paymentId = `${selectedPeriodId}_${Date.now()}`;
          await setDoc(doc(db, 'potonganKehilangan', installmentDebt.empId, 'debts', installmentDebt.id, 'payments', paymentId), {
              periodId: selectedPeriodId,
              amount: amount,
              createdAt: serverTimestamp()
          });
          
          const newRemaining = installmentDebt.remainingAmount - amount;
          const updateData: any = { remainingAmount: newRemaining };
          if (newRemaining === 0) {
              updateData.paidOffPeriodId = selectedPeriodId;
          }
          
          await setDoc(doc(db, 'potonganKehilangan', installmentDebt.empId, 'debts', installmentDebt.id), updateData, { merge: true });
          
          toast.success("Potongan berhasil ditambahkan");
          setInstallmentDebt(null);
      } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, 'potonganKehilangan');
      }
  };

  const handleEditDebt = async (debt: Debt) => {
      const pass = prompt("Masukkan password untuk edit:");
      if (pass !== 'admin123') { toast.error("Password salah"); return; }
      const newDesc = prompt("Keterangan baru:", debt.description);
      if (newDesc === null) return;
      try {
          await setDoc(doc(db, 'potonganKehilangan', debt.empId, 'debts', debt.id), { description: newDesc }, { merge: true });
          toast.success("Hutang diupdate");
      } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, 'potonganKehilangan/' + debt.empId + '/debts/' + debt.id);
      }
  };

  const handleExportCurrentPeriod = async () => {
      try {
          const q = query(collectionGroup(db, 'payments'));
          const snapshot = await getDocs(q);
          const paymentsInPeriod = snapshot.docs
              .map(d => ({ ...d.data(), parentDebtId: d.ref.parent.parent?.id }))
              .filter(p => p.periodId === selectedPeriodId && p.amount > 0);
          
          const exportData: any[] = [];
          for (const payment of paymentsInPeriod) {
              const debt = debts.find(d => d.id === payment.parentDebtId);
              if (debt) {
                  exportData.push({
                      'No Absen': debt.empPin,
                      'Nama': debt.empName,
                      'Potongan Periode': payment.amount
                  });
              }
          }
          if (exportData.length === 0) {
              toast.error("Tidak ada cicilan pada periode ini");
              return;
          }

          const worksheet = XLSX.utils.json_to_sheet(exportData);
          const workbook = { Sheets: { 'data': worksheet }, SheetNames: ['data'] };
          const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          saveAs(dataBlob, `Potongan_${periodOptions.find(p => p.value === selectedPeriodId)?.label || selectedPeriodId}.xlsx`);
      } catch (error) {
          console.error(error);
          toast.error("Gagal export data");
      }
  };

  const handleExportAllPeriods = async () => {
      const data = debts.map(d => ({
          'Nama': d.empName,
          'No Absen': d.empPin,
          'Keterangan': d.description,
          'Saldo Awal': d.totalAmount,
          'Sisa': d.remainingAmount,
          'Status': d.remainingAmount === 0 ? "LUNAS" : "BELUM LUNAS"
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = { Sheets: { 'data': worksheet }, SheetNames: ['data'] };
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(dataBlob, 'Riwayat_Potongan_Semua_Periode.xlsx');
  };
  
  return (
    <div className="space-y-6">
      <Card className="glass-panel border-none bg-black/40 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-4 mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                Filter Periode & Export
                <Button onClick={toggleLock} variant={isUnlocked ? 'ghost' : 'default'} size="sm" className="h-8 w-8 p-0">
                    {isUnlocked ? <Lock className="w-4 h-4 text-emerald-500"/> : <Lock className="w-4 h-4 text-rose-500"/>}
                </Button>
            </h3>
            <div className="flex flex-col gap-2 w-full md:w-auto">
                <Button onClick={handleExportCurrentPeriod} variant="outline" size="sm" className="gap-2 w-full"><Download className="w-4 h-4"/> Export Periode</Button>
                <Button onClick={handleExportAllPeriods} variant="outline" size="sm" className="gap-2 w-full"><Download className="w-4 h-4"/> Export Semua</Button>
            </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger className="glass-panel border-white/10 text-white">
                    <SelectValue placeholder="Pilih Periode...">
                        {periodOptions.find(p => p.value === selectedPeriodId)?.label || 'Pilih Periode...'}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {periodOptions.map(p => 
                        <SelectItem key={p.value} value={p.value}>
                            {p.label}
                        </SelectItem>
                    )}
                </SelectContent>
            </Select>
        </div>
      </Card>
      
      {true && (
          <>
            <Card className="glass-panel border-none bg-black/40">
                <CardContent className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-tight">Tambah Hutang Baru</h3>
                    
                    <div className="relative z-10 mb-2">
                        <Search className="absolute left-3 top-3 w-5 h-5 text-white/30" />
                        <Input 
                            placeholder="Cari Absen atau Nama Karyawan..." 
                            value={searchTerm} 
                            onChange={e => {
                                const val = e.target.value;
                                setSearchTerm(val);
                                const found = employees.find(emp => emp.name.toLowerCase().includes(val.toLowerCase()) || emp.pin.includes(val));
                                if (found && val) setSelectedEmpId(found.id);
                                else setSelectedEmpId('');
                            }} 
                            onKeyDown={e => {
                                if (e.key === 'Enter' && selectedEmpId) {
                                    const found = employees.find(emp => emp.id === selectedEmpId);
                                    if (found) {
                                        setSearchTerm(found.name);
                                    }
                                }
                            }}
                            className="pl-10 glass-panel border-white/10 text-white" 
                            disabled={!isUnlocked} 
                        />
                        {searchTerm && selectedEmpId && (searchTerm.toLowerCase() !== employees.find(e => e.id === selectedEmpId)?.name.toLowerCase()) && (
                            <div 
                                className="absolute w-full mt-1 glass-panel border border-white/10 bg-black/90 p-3 cursor-pointer hover:bg-white/10 rounded-md shadow-xl backdrop-blur-md"
                                onClick={() => {
                                    const found = employees.find(emp => emp.id === selectedEmpId);
                                    if (found) setSearchTerm(found.name);
                                }}
                            >
                                <span className="text-emerald-400 font-bold">{employees.find(e => e.id === selectedEmpId)?.name}</span>
                                <span className="text-white/40 text-sm ml-2">- PIN: {employees.find(e => e.id === selectedEmpId)?.pin}</span>
                            </div>
                        )}
                    </div>
                    {!isUnlocked && <p className="text-rose-400 text-sm">Hutang dikunci! Password diperlukan.</p>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input placeholder="Keterangan" value={newDebtDesc} onChange={e => setNewDebtDesc(e.target.value)} className="glass-panel border-white/10 text-white" disabled={!isUnlocked} />
                        <Input type="number" placeholder="Total Nominal" value={newDebtAmount} onChange={e => setNewDebtAmount(e.target.value)} className="glass-panel border-white/10 text-white" disabled={!isUnlocked} />
                    </div>
                     <Button onClick={handleAddDebt} disabled={!isUnlocked} className="w-full bg-primary text-white font-bold"><Plus className="w-4 h-4 mr-2" /> Tambah Hutang</Button>
                </CardContent>
            </Card>

            <Card className="glass-panel border-none bg-black/40">
                <CardContent className="p-6">
                <Table>
                    <TableHeader>
                        <TableRow className="border-white/5">
                            <TableHead className="text-white/40">No Absen</TableHead>
                            <TableHead className="text-white/40">Nama</TableHead>
                            <TableHead className="text-white/40">Keterangan</TableHead>
                            <TableHead className="text-white/40">Hutang Awal</TableHead>
                            <TableHead className="text-white/40">Sisa</TableHead>
                            <TableHead className="text-white/40">Status</TableHead>
                            <TableHead className="text-white/40">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredDebts.map(debt => (
                            <TableRow key={debt.id} className="border-white/5">
                                <TableCell className="text-white">{debt.empPin}</TableCell>
                                <TableCell className="text-white">{debt.empName}</TableCell>
                                <TableCell className="text-white">{debt.description}</TableCell>
                                <TableCell className="text-white">{new Intl.NumberFormat('id-ID').format(debt.totalAmount)}</TableCell>
                                <TableCell className="text-rose-400 font-bold">{new Intl.NumberFormat('id-ID').format(debt.remainingAmount)}</TableCell>
                                <TableCell className={debt.remainingAmount === 0 ? "text-emerald-400" : "text-amber-400"}>
                                    {debt.remainingAmount === 0 ? "LUNAS" : "BELUM LUNAS"}
                                </TableCell>
                               <TableCell>
                                   <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                                        <Button size="sm" variant="ghost" className="text-emerald-400 shrink-0" onClick={() => handleInstallmentClick(debt)} disabled={!isUnlocked || debt.remainingAmount === 0}>Cicil</Button>
                                        <Button size="sm" variant="ghost" className="text-amber-400 shrink-0" onClick={() => handleViewHistory(debt)}>Riwayat</Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleEditDebt(debt)} disabled={!isUnlocked} className="shrink-0"><Edit3 className="w-4 h-4" /></Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleDeleteDebt(debt)} className="text-rose-400 shrink-0" disabled={!isUnlocked}><Trash2 className="w-4 h-4" /></Button>
                                   </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                </CardContent>
            </Card>

            <Dialog open={!!installmentDebt} onOpenChange={(val) => !val && setInstallmentDebt(null)}>
              <DialogContent className="glass-panel text-white border-white/20 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-white">Masukkan Nominal Cicilan</DialogTitle>
                  <DialogDescription className="text-white/60">
                    Sisa hutang: {installmentDebt ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(installmentDebt.remainingAmount) : 0}
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input 
                    type="number" 
                    placeholder="Contoh: 100000" 
                    value={installmentAmount} 
                    onChange={e => setInstallmentAmount(e.target.value)} 
                    className="glass-panel border-white/10 text-white"
                    autoFocus
                  />
                  <p className="text-xs text-white/40 mt-2">Nominal akan dipotong pada periode terpilih: {periodOptions.find(p => p.value === selectedPeriodId)?.label || selectedPeriodId}</p>
                </div>
                <DialogFooter className="flex sm:justify-end gap-2">
                  <Button variant="ghost" onClick={() => setInstallmentDebt(null)}>Batal</Button>
                  <Button onClick={submitInstallment} className="bg-primary hover:bg-primary/90 text-white font-bold">Simpan Cicilan</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {historyDebt && (
                <Card className="fixed inset-0 m-auto w-1/2 h-2/3 glass-panel border bg-black/90 z-50 p-6 overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-white">Riwayat Cicilan: {historyDebt.description}</h3>
                        <Button onClick={() => setHistoryDebt(null)} className="bg-rose-600">Tutup</Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow><TableHead className="text-white/40">Periode</TableHead><TableHead className="text-white/40">Jumlah</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.map((p: any) => (
                                <TableRow key={p.id}>
                                    <TableCell className="text-white">{p.periodId}</TableCell>
                                    <TableCell className="text-emerald-400">{new Intl.NumberFormat('id-ID').format(p.amount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}
          </>
      )}
    </div>
  );
}
