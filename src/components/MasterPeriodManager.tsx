import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Trash2, Plus, Pencil, Check, X } from 'lucide-react';

export function MasterPeriodManager() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string>('');
  const [newPeriodName, setNewPeriodName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const snap = await getDocs(collection(db, "periodControls"));
    const p = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setPeriods(p);
    
    const activeSnap = await getDoc(doc(db, "systemConfig", "activePeriod"));
    if (activeSnap.exists()) {
      setActivePeriodId(activeSnap.data().periodId);
    }
  };

  const addPeriod = async () => {
    if (!newPeriodName) return;
    const ref = doc(collection(db, "periodControls"));
    await setDoc(ref, { name: newPeriodName, createdAt: serverTimestamp(), active: true });
    setNewPeriodName('');
    fetchData();
    toast.success("Periode ditambah");
  };

  const deletePeriod = async (id: string) => {
    await deleteDoc(doc(db, "periodControls", id));
    fetchData();
    toast.success("Periode dihapus");
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    await setDoc(doc(db, "periodControls", id), { active: !currentActive }, { merge: true });
    fetchData();
    toast.success("Status periode diubah");
  }

  const setActive = async (id: string) => {
    await setDoc(doc(db, "systemConfig", "activePeriod"), { periodId: id });
    setActivePeriodId(id);
    toast.success("Periode aktif diset");
  }

  return (
    <Card className="glass-panel border-none bg-black/40 w-full mt-6">
      <CardContent className="p-6">
        <h2 className="text-xl font-bold text-white mb-4">Master Period Manager (v2.3.0)</h2>
        <div className="flex gap-2 mb-4">
            <Input placeholder="Nama Periode Baru" value={newPeriodName} onChange={e => setNewPeriodName(e.target.value)} />
            <Button onClick={addPeriod}><Plus /></Button>
        </div>
        <Table>
            <TableHeader>
                <TableRow className="border-white/5">
                    <TableHead className="text-white/40">Nama Periode</TableHead>
                    <TableHead className="text-white/40">Status</TableHead>
                    <TableHead></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {periods.map(p => (
                    <TableRow key={p.id} className="border-white/5">
                        <TableCell className="text-white">{p.name}</TableCell>
                        <TableCell className={p.active ? 'text-emerald-400' : 'text-rose-400'}>
                            {p.active ? 'Aktif' : 'Non-aktif'}
                        </TableCell>
                        <TableCell className="text-right flex gap-2 justify-end">
                             <Button variant="ghost" onClick={() => toggleActive(p.id, p.active)} size="sm">{p.active ? <X /> : <Check />}</Button>
                             {activePeriodId !== p.id && <Button variant="ghost" onClick={() => setActive(p.id)} size="sm">Set Aktif</Button>}
                             <Button variant="ghost" onClick={() => deletePeriod(p.id)} size="sm"><Trash2 className="text-rose-400"/></Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
