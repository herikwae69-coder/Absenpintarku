
import React, { useState } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, RefreshCw, AlertTriangle } from "lucide-react";
import { SuperAdmin } from "../types";
import { toast } from "sonner";
import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";

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
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "superAdmins"), (snap) => {
        setSuperAdmins(snap.docs.map(d => ({id: d.id, ...d.data()}) as SuperAdmin));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "superAdmins"));
    return unsub;
  }, []);

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, "systemConfig", "maintenance"), (docSnap) => {
      if (docSnap.exists()) {
        setIsUpdating(!!docSnap.data()?.isUpdating);
      }
    });
    return unsub;
  }, []);

  const toggleUpdateMode = async () => {
    setUpdatingMode(true);
    try {
      await setDoc(doc(db, "systemConfig", "maintenance"), {
        isUpdating: !isUpdating,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast.success(`Mode update ${!isUpdating ? 'diaktifkan' : 'dimatikan'}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, "systemConfig");
    } finally {
      setUpdatingMode(false);
    }
  };

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
    <Card className={`glass-panel border-none shadow-lg overflow-hidden transition-all duration-500 ${isUpdating ? 'ring-2 ring-amber-500/50' : ''}`}>
      <div className={`h-1.5 w-full transition-colors duration-500 ${isUpdating ? 'bg-amber-500 animate-pulse' : 'bg-transparent'}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-white flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${isUpdating ? 'animate-spin-slow text-amber-500' : 'text-white/40'}`} />
            System Maintenance Mode
          </CardTitle>
          <p className="text-white/40 text-xs font-medium">
            Kontrol akses aplikasi untuk seluruh pengguna
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isUpdating ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-white/5 text-white/20 border border-white/10'}`}>
          {isUpdating ? 'Active' : 'Inactive'}
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-black/20 rounded-2xl p-6 border border-white/5 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <h4 className="text-white font-bold text-lg leading-none">
                Tombol Proses Update
              </h4>
              <p className="text-white/40 text-sm max-w-md leading-relaxed italic">
                "Jika tombol ini ditekan, tampilan user hanya akan menampilkan info sedang proses update dan arahan absen manual."
              </p>
            </div>
            
            <Button
              onClick={toggleUpdateMode}
              disabled={updatingMode}
              className={`h-14 px-8 rounded-2xl font-black uppercase tracking-widest transition-all duration-300 shadow-xl ${
                isUpdating 
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/25 ring-4 ring-rose-500/20' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25'
              }`}
            >
              {updatingMode ? (
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              ) : isUpdating ? (
                <Trash2 className="w-5 h-5 mr-2" />
              ) : (
                <RefreshCw className="w-5 h-5 mr-2" />
              )}
              {isUpdating ? 'Matikan Mode Update' : 'Mulai Proses Update'}
            </Button>
          </div>

          {isUpdating && (
            <div className="mt-6 flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-500">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-amber-500 font-bold text-xs uppercase tracking-wider">Peringatan Keamanan</p>
                <p className="text-amber-200/60 text-xs leading-relaxed">
                  Aplikasi saat ini hanya dapat diakses oleh Admin. Seluruh pengguna lain (Employee & SPV) akan dialihkan ke halaman pemeliharaan.
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

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
    </div>
  );
}
