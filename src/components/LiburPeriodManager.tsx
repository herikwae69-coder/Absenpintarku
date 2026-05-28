import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "../lib/firebase";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp, deleteDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Trash2, CheckCircle, Plus, Pencil, X, Save } from "lucide-react";
import { useDialog } from "../App";

export const LiburPeriodManager: React.FC = () => {
    const { confirm } = useDialog();
    const [liburPeriods, setLiburPeriods] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPeriodName, setNewPeriodName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ name: "", startDate: "", endDate: "" });

    const fetchPeriods = async () => {
        const snap = await getDocs(collection(db, "liburPeriods"));
        setLiburPeriods(snap.docs.map(d => ({id: d.id, ...d.data()})));
        setLoading(false);
    };

    useEffect(() => { fetchPeriods(); }, []);

    const handleAddPeriod = async () => {
        if (!newPeriodName || !startDate || !endDate) {
            toast.error("Harap isi nama periode, tanggal awal dan akhir.");
            return;
        }
        await addDoc(collection(db, "liburPeriods"), {
            name: newPeriodName,
            startDate,
            endDate,
            status: "active",
            createdAt: serverTimestamp()
        });
        setNewPeriodName("");
        setStartDate("");
        setEndDate("");
        fetchPeriods();
        toast.success("Periode Libur berhasil ditambahkan.");
    };

    const handleDeletePeriod = async (id: string) => {
        if (!await confirm("Apakah Anda yakin ingin menghapus periode ini? Tindakan ini tidak dapat dibatalkan.")) return;
        try {
            await deleteDoc(doc(db, "liburPeriods", id));
            fetchPeriods();
            toast.success("Periode Libur dihapus.");
        } catch (error) {
            toast.error("Gagal menghapus periode.");
        }
    };

    const startEditing = (p: any) => {
        setEditingId(p.id);
        setEditForm({ name: p.name, startDate: p.startDate, endDate: p.endDate });
    };

    const handleUpdatePeriod = async () => {
        if (!editingId) return;
        try {
            await updateDoc(doc(db, "liburPeriods", editingId), { ...editForm });
            setEditingId(null);
            fetchPeriods();
            toast.success("Periode Libur diperbarui.");
        } catch (error) {
            toast.error("Gagal memperbarui periode.");
        }
    };

    const handleClosePeriod = async (id: string, currentPeriod: any) => {
        if (!await confirm(`Tutup periode "${currentPeriod.name}"? Sistem akan menghitung sisa jatah libur setiap karyawan dan memindahkannya ke periode berikutnya.`)) return;
        
        try {
            // 1. Cari periode berikutnya yang aktif (jika ada)
            const nextPeriodQuery = query(
                collection(db, "liburPeriods"), 
                where("status", "==", "active"),
                where("startDate", ">", currentPeriod.startDate)
            );
            const nextPeriodSnap = await getDocs(nextPeriodQuery);
            const nextPeriod = nextPeriodSnap.docs[0];

            // 2. Ambil semua karyawan
            const empsSnap = await getDocs(collection(db, "employees"));
            
            // 3. Proses carryover untuk setiap karyawan
            const processPromises = empsSnap.docs.map(async (empDoc) => {
                const empId = empDoc.id;
                
                // Ambil quota dari periode yang sedang ditutup
                const qSnap = await getDocs(query(
                    collection(db, "quotas"), 
                    where("employeeId", "==", empId), 
                    where("periodId", "==", id)
                ));
                
                if (qSnap.empty) return;
                
                const qData = qSnap.docs[0].data();
                const remaining = (qData.quota || 0) - (qData.used || 0);
                
                if (remaining > 0 && nextPeriod) {
                    // Cek apakah quota di periode berikutnya sudah ada
                    const nextQSnap = await getDocs(query(
                        collection(db, "quotas"), 
                        where("employeeId", "==", empId), 
                        where("periodId", "==", nextPeriod.id)
                    ));

                    if (!nextQSnap.empty) {
                        // Tambahkan ke quota yang sudah ada
                        const nextQRef = doc(db, "quotas", nextQSnap.docs[0].id);
                        await updateDoc(nextQRef, {
                            quota: (nextQSnap.docs[0].data().quota || 0) + remaining,
                            carryOverFrom: id
                        });
                    } else {
                        // Buat record quota baru di periode berikutnya
                        await addDoc(collection(db, "quotas"), {
                            employeeId: empId,
                            employeeName: empDoc.data().name || "Karyawan",
                            periodId: nextPeriod.id,
                            quota: remaining, // Memulai dengan saldo carryover
                            used: 0,
                            type: "carry_over",
                            fromPeriodId: id,
                            createdAt: serverTimestamp()
                        });
                    }
                }
            });

            await Promise.all(processPromises);
            
            // 4. Update status periode lama menjadi closed
            await updateDoc(doc(db, "liburPeriods", id), { 
                status: "closed", 
                closedAt: serverTimestamp() 
            });
            
            fetchPeriods();
            toast.success(`Periode "${currentPeriod.name}" ditutup. Sisa saldo berhasil dipindahkan.`);
        } catch (e) {
            console.error(e);
            toast.error("Gagal menutup periode. Silakan coba lagi.");
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <Card className="glass-panel border-none bg-black/40 w-full mt-6">
            <CardHeader>
                <CardTitle className="text-white">Manajemen Periode Libur</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
                    <div className="space-y-1">
                        <Label className="text-white/50 text-[10px] uppercase font-bold">Nama Periode</Label>
                        <Input value={newPeriodName} onChange={e => setNewPeriodName(e.target.value)} placeholder="Contoh: April 2024" className="bg-white/5 border-white/10 text-white" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-white/50 text-[10px] uppercase font-bold">Tgl Awal</Label>
                        <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-white/50 text-[10px] uppercase font-bold">Tgl Akhir</Label>
                        <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                    </div>
                    <div className="flex items-end">
                        <Button onClick={handleAddPeriod} className="w-full bg-primary hover:bg-primary/80"><Plus className="w-4 h-4 mr-2" /> Tambah</Button>
                    </div>
                </div>
                <div className="space-y-6">
                    {/* Active Periods Section */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Periode Aktif</h3>
                        </div>
                        {liburPeriods.filter(p => p.status === 'active').sort((a,b) => b.startDate.localeCompare(a.startDate)).map(p => (
                            <div key={p.id} className="flex flex-col p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl group hover:bg-emerald-500/10 transition-all shadow-lg shadow-emerald-500/5">
                                {editingId === p.id ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-white/50 text-[10px] uppercase font-bold">Nama Periode</Label>
                                                <Input 
                                                    value={editForm.name} 
                                                    onChange={e => setEditForm({...editForm, name: e.target.value})} 
                                                    className="bg-white/5 border-white/10 text-white" 
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-white/50 text-[10px] uppercase font-bold">Tgl Awal</Label>
                                                <Input 
                                                    type="date" 
                                                    value={editForm.startDate} 
                                                    onChange={e => setEditForm({...editForm, startDate: e.target.value})} 
                                                    className="bg-white/5 border-white/10 text-white" 
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-white/50 text-[10px] uppercase font-bold">Tgl Akhir</Label>
                                                <Input 
                                                    type="date" 
                                                    value={editForm.endDate} 
                                                    onChange={e => setEditForm({...editForm, endDate: e.target.value})} 
                                                    className="bg-white/5 border-white/10 text-white" 
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-white/40 hover:text-white">
                                                <X className="w-4 h-4 mr-2" /> Batal
                                            </Button>
                                            <Button size="sm" onClick={handleUpdatePeriod} className="bg-emerald-500 hover:bg-emerald-600">
                                                <Save className="w-4 h-4 mr-2" /> Simpan
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center w-full">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-black uppercase tracking-tight text-lg">{p.name}</span>
                                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20">OPEN</span>
                                            </div>
                                            <span className="text-[10.5px] text-white/60 font-mono mt-1">
                                                <span className="text-emerald-400/80">{p.startDate}</span> s/d <span className="text-emerald-400/80">{p.endDate}</span>
                                                <span className="mx-2 text-white/20">|</span> 
                                                Dibuat: {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('id-ID') : '-'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 bg-emerald-500/10"
                                                onClick={() => handleClosePeriod(p.id, p)}
                                            >
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                Tutup
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon"
                                                className="h-8 w-8 text-white/40 hover:text-emerald-400 hover:bg-emerald-400/10"
                                                onClick={() => startEditing(p)}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon"
                                                className="h-8 w-8 text-rose-400/40 hover:text-rose-400 hover:bg-rose-400/10"
                                                onClick={() => handleDeletePeriod(p.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {liburPeriods.filter(p => p.status === 'active').length === 0 && (
                            <div className="py-8 text-center text-white/20 border border-dashed border-white/10 rounded-2xl">
                                Tidak ada periode aktif saat ini.
                            </div>
                        )}
                    </div>

                    {/* Closed Periods Section */}
                    <div className="space-y-2 pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2 mb-3 opacity-50">
                            <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider">Arsip Periode (Selesai)</h3>
                        </div>
                        {liburPeriods.filter(p => p.status === 'closed').sort((a,b) => b.startDate.localeCompare(a.startDate)).map(p => (
                            <div key={p.id} className="flex flex-col p-4 bg-white/5 border border-white/5 rounded-2xl opacity-60 hover:opacity-100 transition-all">
                                <div className="flex justify-between items-center w-full">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-white/60 font-medium uppercase tracking-tight line-through decoration-white/20">{p.name}</span>
                                            <span className="px-2 py-0.5 bg-white/5 text-white/30 text-[10px] font-bold rounded-full border border-white/10 uppercase">Selesai</span>
                                        </div>
                                        <span className="text-[10px] text-white/40 font-mono mt-1">
                                            {p.startDate} s/d {p.endDate}
                                            {p.closedAt && (
                                                <>
                                                    <span className="mx-2 text-white/10">|</span> 
                                                    Selesai pada: {p.closedAt.toDate ? p.closedAt.toDate().toLocaleDateString('id-ID') : '-'}
                                                </>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button 
                                            variant="ghost" 
                                            size="icon"
                                            className="h-8 w-8 text-white/20 hover:text-white"
                                            onClick={() => startEditing(p)}
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon"
                                            className="h-8 w-8 text-rose-400/20 hover:text-rose-400 hover:bg-rose-400/10"
                                            onClick={() => handleDeletePeriod(p.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
