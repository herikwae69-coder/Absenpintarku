
import React, { useState } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";
import { SuperAdmin } from "../types";
import { toast } from "sonner";
import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";
import { MasterPeriodManager } from "./MasterPeriodManager";

export function AdminSuperAdminManager({ 
  activePeriodId, 
  setActivePeriodId 
}: { 
  activePeriodId: string; 
  setActivePeriodId: (id: string) => void;
}) {
  const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
  const [name, setName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "superAdmins"), (snap) => {
        setSuperAdmins(snap.docs.map(d => ({id: d.id, ...d.data()}) as SuperAdmin));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "superAdmins"));
    return unsub;
  }, []);

  const handleAdd = async () => {
    if (!name || !whatsappNumber) return;
    try {
        await addDoc(collection(db, "superAdmins"), { name, whatsappNumber });
        setName("");
        setWhatsappNumber("");
        toast.success("SuperAdmin added");
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, "superAdmins");
    }
  };

  const handleRemove = async (id: string) => {
    try {
        await deleteDoc(doc(db, "superAdmins", id));
        toast.success("SuperAdmin removed");
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, "superAdmins");
    }
  }

  return (
    <div className="space-y-6">
    <Card className="glass-panel border-none shadow-lg">
      <CardHeader>
        <CardTitle className="text-white">Kelola SuperAdmin</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
            <Input placeholder="Nama SuperAdmin" value={name} onChange={e => setName(e.target.value)} />
            <Input placeholder="No WA (contoh: 628123456789)" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} />
            <Button onClick={handleAdd}><Plus /></Button>
        </div>
        <div className="space-y-2">
            {superAdmins.map(admin => (
                <div key={admin.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/10">
                    <div>
                        <p className="text-white font-bold">{admin.name}</p>
                        <p className="text-white/50 text-xs">{admin.whatsappNumber}</p>
                    </div>
                    <Button variant="ghost" onClick={() => handleRemove(admin.id)}><Trash2 className="text-rose-400"/></Button>
                </div>
            ))}
        </div>
      </CardContent>
    </Card>
    <MasterPeriodManager 
      activePeriodId={activePeriodId} 
      setActivePeriodId={setActivePeriodId} 
    />
    </div>
  );
}
