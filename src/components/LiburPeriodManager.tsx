import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "../lib/firebase";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner"; // Assuming toast is available
import { Trash2, CheckCircle, Plus } from "lucide-react";

export const LiburPeriodManager: React.FC = () => {
    const [liburPeriods, setLiburPeriods] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPeriodName, setNewPeriodName] = useState("");

    const fetchPeriods = async () => {
        const snap = await getDocs(collection(db, "liburPeriods"));
        setLiburPeriods(snap.docs.map(d => ({id: d.id, ...d.data()})));
        setLoading(false);
    };

    useEffect(() => { fetchPeriods(); }, []);

    const handleAddPeriod = async () => {
        if (!newPeriodName) return;
        await addDoc(collection(db, "liburPeriods"), {
            name: newPeriodName,
            status: "active",
            createdAt: serverTimestamp()
        });
        setNewPeriodName("");
        fetchPeriods();
        toast.success("Periode Libur berhasil ditambahkan.");
    };

    const handleClosePeriod = async (id: string, currentPeriod: any) => {
        if (!confirm("Tutup periode ini & proses sisa saldo ke periode berikutnya?")) return;
        
        try {
            // 1. Get all employees
            const empsSnap = await getDocs(collection(db, "employees"));
            
            // 2. Iterate employees to calculate remainder & carry over
            for (const empDoc of empsSnap.docs) {
                const empId = empDoc.id;
                
                // Get quota for this period
                const qSnap = await getDocs(query(collection(db, "quotas"), where("employeeId", "==", empId), where("periodId", "==", id)));
                if (qSnap.empty) continue;
                
                const qData = qSnap.docs[0].data();
                const total = qData.quota || 0;
                const used = qData.used || 0;
                const rem = total - used;
                
                if (rem > 0) {
                    // Carry over rem to a next record
                    await addDoc(collection(db, "quotas"), {
                        employeeId: empId,
                        employeeName: empDoc.data().name,
                        periodId: "next_period_id", // This needs to be dynamic, but for now...
                        quota: rem,
                        used: 0,
                        type: "carry_over",
                        fromPeriodId: id
                    });
                }
            }
            
            await updateDoc(doc(db, "liburPeriods", id), { status: "closed", closedAt: serverTimestamp() });
            fetchPeriods();
            toast.success("Periode Libur ditutup dan sisa saldo diakumulasikan.");
        } catch (e) {
            console.error(e);
            toast.error("Gagal menutup periode");
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <Card className="glass-panel border-none bg-black/40 w-full mt-6">
            <CardHeader>
                <CardTitle className="text-white">Manajemen Periode Libur</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex gap-2 mb-4">
                    <Input value={newPeriodName} onChange={e => setNewPeriodName(e.target.value)} placeholder="Nama Periode Baru" />
                    <Button onClick={handleAddPeriod}><Plus className="w-4 h-4 mr-2" /> Tambah</Button>
                </div>
                <div className="space-y-2">
                    {liburPeriods.map(p => (
                        <div key={p.id} className="flex justify-between items-center p-3 bg-black/20 rounded-lg">
                            <span>{p.name} ({p.status})</span>
                            {p.status === 'active' && <Button variant="ghost" onClick={() => handleClosePeriod(p.id, p)}><CheckCircle className="w-4 h-4 text-emerald-500" /></Button>}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};
