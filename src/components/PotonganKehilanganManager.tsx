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
import { Badge } from '@/components/ui/badge';
import { Employee, PeriodControl } from '../types';
import { auth } from '../lib/firebase';

const toDateSafe = (val: any) => {
    if (!val) return new Date();
    if (val.toDate) return val.toDate();
    return new Date(val);
};

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

export function PotonganKehilanganManager({ employees, activePeriodId, isEmployee = false, currentEmployeeId }: { employees: Employee[], activePeriodId?: string, isEmployee?: boolean, currentEmployeeId?: string }) {
  const employeesRef = useRef(employees);
  useEffect(() => { employeesRef.current = employees; }, [employees]);
  const [password, setPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(activePeriodId);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [newDebtDesc, setNewDebtDesc] = useState('');
  const [newDebtAmount, setNewDebtAmount] = useState('');
  const [selectedEmpId, setSelectedEmpId] = React.useState('');
  const [isLocked, setIsLocked] = React.useState(false);
  const [showAllDebts, setShowAllDebts] = React.useState(isEmployee); // Default to true if employee (we want to see all)
  const [historyDebt, setHistoryDebt] = React.useState<Debt | null>(null);
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

  useEffect(() => {
    if (!selectedPeriodId) return;
    const unsub = onSnapshot(doc(db, 'potonganKehilanganConfig', selectedPeriodId), (snap) => {
        if (snap.exists()) {
            setIsLocked(snap.data().isLocked || false);
        } else {
            setIsLocked(false);
        }
    }, (err) => handleFirestoreError(err, OperationType.GET, `potonganKehilanganConfig/${selectedPeriodId}`));
    return unsub;
  }, [selectedPeriodId]);

  const toggleLock = async () => {
    if (isLocked) {
        const pass = prompt("Masukkan password untuk buka kunci:");
        if (pass === 'admin123') {
            try {
                await setDoc(doc(db, 'potonganKehilanganConfig', selectedPeriodId), { isLocked: false }, { merge: true });
                toast.success("Kunci dibuka");
            } catch (e) {
                handleFirestoreError(e, OperationType.WRITE, `potonganKehilanganConfig/${selectedPeriodId}`);
            }
        } else {
            toast.error("Password salah");
        }
    } else {
        try {
            await setDoc(doc(db, 'potonganKehilanganConfig', selectedPeriodId), { isLocked: true }, { merge: true });
            toast.success("Periode dikunci");
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `potonganKehilanganConfig/${selectedPeriodId}`);
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
    let q;
    if (isEmployee && currentEmployeeId) {
       q = query(collection(db, 'potonganKehilangan', currentEmployeeId, 'debts'), orderBy('createdAt', 'desc'));
    } else {
       q = query(collectionGroup(db, 'debts'), orderBy('createdAt', 'desc'));
    }
    const unsub = onSnapshot(q, (snapshot) => {
      const debtData: Debt[] = snapshot.docs.map(doc => ({
        id: doc.id,
        empId: isEmployee ? (currentEmployeeId || '') : (doc.ref.parent.parent?.id || ''),
        ...doc.data()
      } as Debt));
      const debtsWithInfo = debtData.map(d => {
        const emp = employeesRef.current.find(e => e.id === d.empId);
        return { ...d, empName: emp?.name || 'Unknown', empPin: emp?.pin || '' };
      });
      setDebts(debtsWithInfo);
    });
    return unsub;
  }, [isEmployee, currentEmployeeId]);

  const filteredDebts = useMemo(() => {
      const selectedIndex = periodOptions.findIndex(p => p.value === selectedPeriodId);
      return debts.filter(d => {
          const matchesSearch = d.empName.toLowerCase().includes(searchTerm.toLowerCase()) || d.empPin.includes(searchTerm);
          if (!matchesSearch) return false;
          
          if (!showAllDebts && d.remainingAmount === 0) {
              if (d.paidOffPeriodId) {
                  const paidIndex = periodOptions.findIndex(p => p.value === d.paidOffPeriodId);
                  if (paidIndex !== -1 && selectedIndex !== -1) {
                      // Hide if the selected period is AFTER the paid off period
                      // Newest periods are at the beginning of the array (index 0)
                      // So index 2 is OLDER than index 1.
                      // If paidIndex is 5, and selectedIndex is 4, it means selected is NEWER.
                      return selectedIndex >= paidIndex; 
                  }
              }
              return false;
          }
          return true;
      });
  }, [debts, searchTerm, periodOptions, selectedPeriodId, showAllDebts]);

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
      setSearchTerm('');
      setSelectedEmpId('');
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
      if (isLocked) { toast.error("Periode dikunci"); return; }
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

  const handleEditPayment = async (payment: any) => {
      const pass = prompt("Masukkan password untuk edit cicilan:");
      if (pass !== 'admin123') { toast.error("Password salah"); return; }
      
      const newAmountStr = prompt("Masukkan besaran cicilan baru:", payment.amount.toString());
      if (newAmountStr === null) return;
      const newAmount = parseInt(newAmountStr.replace(/\D/g, '')) || 0;
      
      if (newAmount < 0) {
          toast.error("Nominal tidak valid");
          return;
      }
  
      if (!historyDebt) return;
  
      const difference = newAmount - payment.amount;
      const newRemaining = historyDebt.remainingAmount - difference;
  
      if (newRemaining < 0) {
          toast.error("Total cicilan melebihi pokok hutang");
          return;
      }
  
      try {
          await setDoc(doc(db, 'potonganKehilangan', historyDebt.empId, 'debts', historyDebt.id, 'payments', payment.id), { amount: newAmount }, { merge: true });
          
          const updateData: any = { remainingAmount: newRemaining };
          if (newRemaining === 0) {
              updateData.paidOffPeriodId = payment.periodId;
          } else if (historyDebt.remainingAmount === 0 && newRemaining > 0) {
               updateData.paidOffPeriodId = null; 
          }
          await setDoc(doc(db, 'potonganKehilangan', historyDebt.empId, 'debts', historyDebt.id), updateData, { merge: true });
          
          setHistoryDebt({...historyDebt, remainingAmount: newRemaining});
          setPayments(payments.map(p => p.id === payment.id ? {...p, amount: newAmount} : p));
          toast.success("Cicilan berhasil diubah");
      } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, 'potonganKehilangan/' + historyDebt.empId + '/debts/' + historyDebt.id + '/payments');
      }
  };

  const handleExportCurrentPeriod = async () => {
      try {
          const q = query(collectionGroup(db, 'payments'));
          const snapshot = await getDocs(q);
          const paymentsInPeriod = snapshot.docs
              .map(d => ({ ...d.data() as any, parentDebtId: d.ref.parent.parent?.id }))
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
          handleFirestoreError(error, OperationType.LIST, 'collectionGroup/payments');
      }
  };

  const handleExportAllPeriods = async () => {
    try {
        const q = query(collectionGroup(db, 'payments'), orderBy('createdAt', 'asc'));
        const snapshot = await getDocs(q);
        const allPayments = snapshot.docs.map(d => ({ 
            ...d.data() as any, 
            parentDebtId: d.ref.parent.parent?.id 
        }));

        // Get unique periods that have payments
        const activePeriods = [...new Set(allPayments.map(p => p.periodId))];
        const sortedActivePeriods = periodOptions
            .filter(p => activePeriods.includes(p.value))
            .sort((a, b) => a.start.getTime() - b.start.getTime()); // Oldest to newest for columns

        const data = debts.map(d => {
            const row: any = {
                'Nama': d.empName,
                'No Absen': d.empPin,
                'Keterangan': d.description,
                'Pokok Hutang': d.totalAmount,
            };

            let totalPaid = 0;
            sortedActivePeriods.forEach(p => {
                const pPayments = allPayments.filter(pay => pay.parentDebtId === d.id && pay.periodId === p.value);
                const pAmount = pPayments.reduce((sum, pay) => sum + pay.amount, 0);
                row[p.label] = pAmount || 0;
                totalPaid += pAmount;
            });

            row['Total Cicilan'] = totalPaid;
            row['Sisa'] = d.remainingAmount;
            row['Status'] = d.remainingAmount === 0 ? "LUNAS" : "BELUM LUNAS";
            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = { Sheets: { 'Data': worksheet }, SheetNames: ['Data'] };
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(dataBlob, 'Laporan_Hutang_Lengkap.xlsx');
    } catch (e) {
        console.error(e);
        toast.error("Gagal export riwayat lengkap");
    }
  };
  
  return (
    <div className="space-y-6">
      {isEmployee ? (
          <div className="space-y-4">
              <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                  <div>
                      <h3 className="text-white font-bold">Total Ristan Anda</h3>
                      <p className="text-white/40 text-xs">Akumulasi sisa hutang yang harus dibayar</p>
                  </div>
                  <div className="text-right">
                      <p className="text-2xl font-black text-rose-400">
                          {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(debts.reduce((sum, d) => sum + d.remainingAmount, 0))}
                      </p>
                  </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                  {debts.map(debt => (
                      <Card key={debt.id} className="glass-panel border-none bg-black/40 overflow-hidden">
                          <CardContent className="p-0">
                              <div className="p-4 flex justify-between items-start border-b border-white/5">
                                  <div>
                                      <p className="text-white font-bold">{debt.description}</p>
                                      <p className="text-white/40 text-[10px]">Tgl: {debt.createdAt ? format(toDateSafe(debt.createdAt), 'dd MMM yyyy') : '-'}</p>
                                  </div>
                                  <Badge className={debt.remainingAmount === 0 ? "bg-emerald-500/20 text-emerald-400 border-none" : "bg-amber-500/20 text-amber-400 border-none"}>
                                      {debt.remainingAmount === 0 ? "LUNAS" : "AKTIF"}
                                  </Badge>
                              </div>
                              <div className="p-4 grid grid-cols-2 gap-4 bg-white/5">
                                  <div>
                                      <p className="text-[10px] text-white/40 uppercase font-black">Pokok</p>
                                      <p className="text-white font-mono">{new Intl.NumberFormat('id-ID').format(debt.totalAmount)}</p>
                                  </div>
                                  <div className="text-right">
                                      <p className="text-[10px] text-white/40 uppercase font-black">Sisa</p>
                                      <p className="text-rose-400 font-bold font-mono">{new Intl.NumberFormat('id-ID').format(debt.remainingAmount)}</p>
                                  </div>
                              </div>
                              <div className="p-2 bg-black/20">
                                  <Button 
                                      variant="ghost" 
                                      className="w-full text-xs text-white/60 hover:text-white"
                                      onClick={() => handleViewHistory(debt)}
                                  >
                                      Lihat Riwayat Pembayaran
                                  </Button>
                              </div>
                          </CardContent>
                      </Card>
                  ))}
                  {debts.length === 0 && (
                      <div className="py-20 text-center text-white/20 italic">
                          Belum ada data ristan tercatat.
                      </div>
                  )}
              </div>
          </div>
      ) : (
      <>
      <Card className="glass-panel border-none bg-black/40 p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-4 mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                Filter Periode & Export
                <Button onClick={toggleLock} variant={isLocked ? 'default' : 'ghost'} size="sm" className="h-10 px-4 gap-2 border-white/10">
                    {isLocked ? <Lock className="w-4 h-4 text-rose-500"/> : <Lock className="w-4 h-4 text-emerald-500"/>}
                    <span className="text-[10px] font-bold">{isLocked ? 'TERKUNCI' : 'BUKA'}</span>
                </Button>
            </h3>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Button 
                    onClick={() => setShowAllDebts(!showAllDebts)} 
                    variant={showAllDebts ? "default" : "outline"} 
                    size="sm" 
                    className="gap-2"
                >
                    {showAllDebts ? "Sembunyikan Lunas" : "Lihat Semua (Lunas)"}
                </Button>
                <Button onClick={handleExportCurrentPeriod} variant="outline" size="sm" className="gap-2 w-full sm:w-auto"><Download className="w-4 h-4"/> Export Periode</Button>
                <Button onClick={handleExportAllPeriods} variant="outline" size="sm" className="gap-2 w-full sm:w-auto"><Download className="w-4 h-4"/> Export Semua</Button>
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
                      disabled={isLocked} 
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
              {isLocked && <p className="text-rose-400 text-sm">Hutang dikunci! Password diperlukan.</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input placeholder="Keterangan" value={newDebtDesc} onChange={e => setNewDebtDesc(e.target.value)} className="glass-panel border-white/10 text-white" disabled={isLocked} />
                  <Input type="number" placeholder="Total Nominal" value={newDebtAmount} onChange={e => setNewDebtAmount(e.target.value)} className="glass-panel border-white/10 text-white" disabled={isLocked} />
              </div>
               <Button onClick={handleAddDebt} disabled={isLocked} className="w-full bg-primary text-white font-bold"><Plus className="w-4 h-4 mr-2" /> Tambah Hutang</Button>
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
                                  <Button size="sm" variant="ghost" className="text-emerald-400 shrink-0" onClick={() => handleInstallmentClick(debt)} disabled={isLocked || debt.remainingAmount === 0}>Cicil</Button>
                                  <Button size="sm" variant="ghost" className="text-amber-400 shrink-0" onClick={() => handleViewHistory(debt)}>Riwayat</Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleEditDebt(debt)} disabled={isLocked} className="shrink-0"><Edit3 className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDeleteDebt(debt)} className="text-rose-400 shrink-0" disabled={isLocked}><Trash2 className="w-4 h-4" /></Button>
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
                <Card className={`fixed inset-0 m-auto w-[95%] md:w-2/3 ${isEmployee ? 'h-[90%]' : 'h-4/5'} glass-panel border bg-black/95 z-[100] p-4 md:p-6 shadow-2xl overflow-hidden flex flex-col`}>
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <div>
                            <h3 className="text-lg font-bold text-white">Riwayat: {historyDebt.description}</h3>
                            {!isEmployee && <p className="text-white/60 text-sm">{historyDebt.empName} ({historyDebt.empPin})</p>}
                        </div>
                        <Button onClick={() => setHistoryDebt(null)} variant="outline" className="text-white border-white/20">Tutup</Button>
                    </div>

                    <div className={`grid grid-cols-1 ${isEmployee ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-4 mb-6 shrink-0`}>
                        <div className="p-4 glass-panel border border-white/5 bg-white/5 rounded-xl">
                            <span className="text-white/40 text-xs block mb-1">Pokok Hutang</span>
                            <span className="text-white font-bold">{new Intl.NumberFormat('id-ID').format(historyDebt.totalAmount)}</span>
                        </div>
                        {!isEmployee && (
                          <div className="p-4 glass-panel border border-emerald-500/20 bg-emerald-500/5 rounded-xl">
                              <span className="text-emerald-400/40 text-xs block mb-1">Total Cicilan</span>
                              <span className="text-emerald-400 font-bold">{new Intl.NumberFormat('id-ID').format(payments.reduce((sum, p) => sum + p.amount, 0))}</span>
                          </div>
                        )}
                        <div className="p-4 glass-panel border border-rose-500/20 bg-rose-500/5 rounded-xl">
                            <span className="text-rose-400/40 text-xs block mb-1">Sisa Hutang</span>
                            <span className="text-rose-400 font-bold">{new Intl.NumberFormat('id-ID').format(historyDebt.remainingAmount)}</span>
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-grow no-scrollbar">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/10 hover:bg-transparent">
                                    <TableHead className="text-white/40">Periode</TableHead>
                                    <TableHead className="text-white/40">Jumlah</TableHead>
                                    {!isEmployee && <TableHead className="text-white/40">Aksi</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.length > 0 ? (
                                    payments.map((p: any) => (
                                        <TableRow key={p.id} className="border-white/5">
                                            <TableCell className="text-white font-medium">
                                                {periodOptions.find(opt => opt.value === p.periodId)?.label || "Periode Manual"}
                                            </TableCell>
                                            <TableCell className="text-emerald-400 font-bold">
                                                {new Intl.NumberFormat('id-ID').format(p.amount)}
                                            </TableCell>
                                            {!isEmployee && (
                                              <TableCell>
                                                  <Button size="sm" variant="ghost" onClick={() => handleEditPayment(p)} className="text-amber-400 shrink-0"><Edit3 className="w-4 h-4" /> Ubah</Button>
                                              </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={isEmployee ? 2 : 3} className="text-center py-8 text-white/40 italic">
                                            Belum ada cicilan tercatat.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            )}
          </>
      )}
    </div>
  );
}
