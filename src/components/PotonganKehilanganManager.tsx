import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, serverTimestamp, addDoc, query, orderBy } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Lock, Plus, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Employee, PeriodControl } from '../types';

interface Debt {
  id: string;
  description: string;
  totalAmount: number;
  remainingAmount: number;
  createdAt: any;
}

export function PotonganKehilanganManager({ employees, activePeriodId }: { employees: Employee[], activePeriodId: string }) {
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState(activePeriodId);
  const [periods, setPeriods] = useState<PeriodControl[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [newDebtDesc, setNewDebtDesc] = useState('');
  const [newDebtAmount, setNewDebtAmount] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState<Record<string, string>>({});

  const filteredEmployees = useMemo(() => {
      return employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [employees, searchTerm]);

  useEffect(() => {
      const unsub = onSnapshot(query(collection(db, 'periodControls'), orderBy('id', 'desc')), (snap) => {
          setPeriods(snap.docs.map(d => ({id: d.id, ...d.data()}) as PeriodControl));
      });
      return unsub;
  }, []);

  useEffect(() => {
    if (!selectedEmpId) {
      setDebts([]);
      return;
    }

    const q = collection(db, 'potonganKehilangan', selectedEmpId, 'debts');
    const unsub = onSnapshot(q, (snapshot) => {
      const debtData: Debt[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Debt));
      setDebts(debtData);
    });
    return unsub;
  }, [selectedEmpId]);

  const handleAddDebt = async () => {
    if (!selectedEmpId || !newDebtDesc || !newDebtAmount) {
      toast.error("Data tidak lengkap");
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
      toast.success("Hutang ditambahkan");
      setNewDebtDesc('');
      setNewDebtAmount('');
    } catch (e) {
      toast.error("Gagal menambahkan hutang");
    }
  };

  const handleHandleInstallment = async (debt: Debt) => {
    const amountStr = installmentAmount[debt.id];
    if (!amountStr) return;
    const amount = parseInt(amountStr.replace(/\D/g, '')) || 0;
    if (amount > debt.remainingAmount) {
        toast.error("Nominal melebihi sisa hutang");
        return;
    }

    try {
        const paymentRef = doc(collection(db, 'potonganKehilangan', selectedEmpId, 'debts', debt.id, 'payments'));
        await setDoc(paymentRef, {
            periodId: selectedPeriodId,
            amount: amount,
            createdAt: serverTimestamp()
        });

        const debtRef = doc(db, 'potonganKehilangan', selectedEmpId, 'debts', debt.id);
        const newRemaining = debt.remainingAmount - amount;
        await setDoc(debtRef, {
            remainingAmount: newRemaining,
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        toast.success(`Cicilan berhasil dicatat untuk periode ${selectedPeriodId}`);
        setInstallmentAmount({ ...installmentAmount, [debt.id]: '' });
    } catch (e) {
        toast.error("Gagal mencatat cicilan");
    }
  }

  if (!isUnlocked) {
      return (
          <Card className="glass-panel border-none bg-black/40 p-10 flex flex-col items-center gap-4">
              <Lock className="w-12 h-12 text-white/20" />
              <h3 className="text-xl font-bold text-white">Masukkan Password</h3>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-48 text-center" />
              <Button onClick={() => password === 'admin123' ? setIsUnlocked(true) : toast.error("Password Salah")}>Buka Kunci</Button>
          </Card>
      );
  }

  return (
    <div className="space-y-6">
      <Card className="glass-panel border-none bg-black/40 p-6">
        <h3 className="text-sm font-bold text-white uppercase tracking-tight mb-4">Cari Karyawan</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-white/30" />
                <Input placeholder="Cari..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 glass-panel border-white/10 text-white" />
            </div>
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger className="glass-panel border-white/10 text-white">
                    <SelectValue placeholder="Pilih Periode..." />
                </SelectTrigger>
                <SelectContent className="glass-panel border-white/20 text-white">
                    {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.id} {p.name ? `- ${p.name}` : ''}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 h-40 overflow-y-auto">
            {filteredEmployees.map(e => (
                <Button key={e.id} variant={selectedEmpId === e.id ? 'default' : 'outline'} onClick={() => setSelectedEmpId(e.id)} className="w-full text-xs justify-start">
                    {e.name}
                    {selectedEmpId === e.id && <Check className="ml-auto w-3 h-3" />}
                </Button>
            ))}
        </div>
      </Card>
      
      {selectedEmpId && (
          <>
            <Card className="glass-panel border-none bg-black/40">
                <CardContent className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-tight">Tambah Hutang Baru</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input placeholder="Keterangan" value={newDebtDesc} onChange={e => setNewDebtDesc(e.target.value)} className="glass-panel border-white/10 text-white" />
                        <Input type="number" placeholder="Total Nominal" value={newDebtAmount} onChange={e => setNewDebtAmount(e.target.value)} className="glass-panel border-white/10 text-white" />
                    </div>
                     <Button onClick={handleAddDebt} className="w-full bg-primary text-white font-bold"><Plus className="w-4 h-4 mr-2" /> Tambah Hutang</Button>
                </CardContent>
            </Card>

            <Card className="glass-panel border-none bg-black/40">
                <CardContent className="p-6">
                <Table>
                    <TableHeader>
                        <TableRow className="border-white/5">
                            <TableHead className="text-white/40">Keterangan</TableHead>
                            <TableHead className="text-white/40">Total</TableHead>
                            <TableHead className="text-white/40">Sisa</TableHead>
                            <TableHead className="text-white/40">Cicilan (Periode {selectedPeriodId})</TableHead>
                            <TableHead className="text-white/40"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {debts.map(debt => (
                            <TableRow key={debt.id} className="border-white/5">
                                <TableCell className="text-white">{debt.description}</TableCell>
                                <TableCell className="text-white">{new Intl.NumberFormat('id-ID').format(debt.totalAmount)}</TableCell>
                                <TableCell className="text-rose-400 font-bold">{new Intl.NumberFormat('id-ID').format(debt.remainingAmount)}</TableCell>
                                <TableCell>
                                     <Input type="number" placeholder="Nominal" value={installmentAmount[debt.id] || ''} onChange={e => setInstallmentAmount({...installmentAmount, [debt.id]: e.target.value})} className="glass-panel border-white/10 text-white w-32" />
                                </TableCell>
                                <TableCell>
                                    <Button size="sm" onClick={() => handleHandleInstallment(debt)} className="bg-emerald-600 text-white">Simpan</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                </CardContent>
            </Card>
          </>
      )}
    </div>
  );
}
