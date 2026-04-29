import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { db } from '../lib/firebase';
import { collection, collectionGroup, onSnapshot, doc, setDoc, serverTimestamp, addDoc, query, orderBy, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
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
}

export function PotonganKehilanganManager({ employees, activePeriodId }: { employees: Employee[], activePeriodId?: string }) {
  const employeesRef = useRef(employees);
  useEffect(() => { employeesRef.current = employees; }, [employees]);
  const [password, setPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(activePeriodId);
  const [periods, setPeriods] = useState<PeriodControl[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [newDebtDesc, setNewDebtDesc] = useState('');
  const [newDebtAmount, setNewDebtAmount] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [historyDebt, setHistoryDebt] = useState<Debt | null>(null);
  const [payments, setPayments] = useState<any[]>([]);

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
      console.log("DEBUG: Employees prop received in manager:", employees);
      const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
          const loadedPeriods = snap.docs.map(d => ({id: d.id, ...d.data()}) as PeriodControl)
                                       .sort((a, b) => b.id.localeCompare(a.id));
          console.log("DEBUG: Periods loaded from Firestore:", loadedPeriods);
          setPeriods(loadedPeriods);
          if (loadedPeriods.length > 0 && !selectedPeriodId) {
             setSelectedPeriodId(loadedPeriods[0].id);
          }
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
      return debts.filter(d => 
          d.empName.toLowerCase().includes(searchTerm.toLowerCase()) || 
          d.empPin.includes(searchTerm)
      );
  }, [debts, searchTerm]);

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

  const handleInstallment = async (debt: Debt) => {
      if (!isUnlocked || isPeriodLocked) { toast.error("Periode dikunci atau password diperlukan"); return; }
      if (!selectedPeriodId) { toast.error("Pilih periode terlebih dahulu"); return; }
      if (debt.remainingAmount <= 0) { toast.error("Hutang sudah lunas"); return; }

      const input = prompt(`Masukkan jumlah potongan untuk periode ${selectedPeriodId}. Sisa hutang: ${new Intl.NumberFormat('id-ID').format(debt.remainingAmount)}`,"0");
      if (input === null) return;
      const amount = parseInt(input.replace(/\D/g, '')) || 0;
      if (amount <= 0 || amount > debt.remainingAmount) {
          toast.error("Nominal tidak valid");
          return;
      }
      
      try {
          const paymentId = `${selectedPeriodId}_${Date.now()}`;
          await setDoc(doc(db, 'potonganKehilangan', debt.empId, 'debts', debt.id, 'payments', paymentId), {
              periodId: selectedPeriodId,
              amount: amount,
              createdAt: serverTimestamp()
          });
          await setDoc(doc(db, 'potonganKehilangan', debt.empId, 'debts', debt.id), {
              remainingAmount: debt.remainingAmount - amount
          }, { merge: true });
          
          toast.success("Potongan berhasil ditambahkan");
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
      const data = filteredDebts.map(d => ({
          'No Absen': d.empPin,
          'Nama': d.empName,
          'Keterangan': d.description,
          'Potongan Periode': d.totalAmount - d.remainingAmount // Simpel: sisa cicilan
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = { Sheets: { 'data': worksheet }, SheetNames: ['data'] };
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(dataBlob, `Potongan_${selectedPeriodId}.xlsx`);
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

  const isPeriodLocked = periods.find(p => p.id === selectedPeriodId)?.status === 'closed';
  
  return (
    <div className="space-y-6">
      <Card className="glass-panel border-none bg-black/40 p-6">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                Cari Karyawan
                <Button onClick={toggleLock} variant={isUnlocked ? 'ghost' : 'default'} size="sm">
                    {isUnlocked ? <Lock className="w-4 h-4 text-emerald-500"/> : <Lock className="w-4 h-4 text-rose-500"/>}
                </Button>
            </h3>
            <div className="flex gap-2">
                <Button onClick={handleExportCurrentPeriod} variant="outline" size="sm" className="gap-2"><Download className="w-4 h-4"/> Export Periode</Button>
                <Button onClick={handleExportAllPeriods} variant="outline" size="sm" className="gap-2"><Download className="w-4 h-4"/> Export Semua</Button>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-white/30" />
                <Input placeholder="Cari Absen/Nama..." value={searchTerm} onChange={e => {
                    const val = e.target.value;
                    setSearchTerm(val);
                    const found = employees.find(emp => emp.name.toLowerCase().includes(val.toLowerCase()) || emp.pin.includes(val));
                    if (found) setSelectedEmpId(found.id);
                    else setSelectedEmpId('');
                }} className="pl-10 glass-panel border-white/10 text-white" />
            </div>
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger className="glass-panel border-white/10 text-white">
                    <SelectValue placeholder="Pilih Periode..." />
                </SelectTrigger>
                <SelectContent>
                    {periods.map(p => 
                        <SelectItem key={p.id} value={p.id}>
                            {p.id} {p.name ? `- ${p.name}` : ''}
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
                    {selectedEmpId && <p className="text-emerald-400 text-sm font-bold">Karyawan: {employees.find(e => e.id === selectedEmpId)?.name}</p>}
                    {(!isUnlocked || isPeriodLocked) && <p className="text-rose-400 text-sm">Hutang dikunci! {isPeriodLocked ? 'Periode ditutup.' : 'Password diperlukan.'}</p>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input placeholder="Keterangan" value={newDebtDesc} onChange={e => setNewDebtDesc(e.target.value)} className="glass-panel border-white/10 text-white" disabled={isPeriodLocked || !isUnlocked} />
                        <Input type="number" placeholder="Total Nominal" value={newDebtAmount} onChange={e => setNewDebtAmount(e.target.value)} className="glass-panel border-white/10 text-white" disabled={isPeriodLocked || !isUnlocked} />
                    </div>
                     <Button onClick={handleAddDebt} disabled={isPeriodLocked || !isUnlocked} className="w-full bg-primary text-white font-bold"><Plus className="w-4 h-4 mr-2" /> Tambah Hutang</Button>
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
                                   <div className="flex gap-2">
                                        <Button size="sm" variant="ghost" className="text-emerald-400" onClick={() => handleInstallment(debt)} disabled={isPeriodLocked || !isUnlocked || debt.remainingAmount === 0}>Cicil</Button>
                                        <Button size="sm" variant="ghost" className="text-amber-400" onClick={() => handleViewHistory(debt)}>Riwayat</Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleEditDebt(debt)} disabled={isPeriodLocked || !isUnlocked}><Edit3 className="w-4 h-4" /></Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleDeleteDebt(debt)} className="text-rose-400" disabled={isPeriodLocked || !isUnlocked}><Trash2 className="w-4 h-4" /></Button>
                                   </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                </CardContent>
            </Card>

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
