import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db } from '../lib/firebase';
import { collection, onSnapshot, getDoc, doc, getDocs, query, collectionGroup } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Employee } from '../types';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { CheckCircle2, XCircle, AlertTriangle, FileDown, Search } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface AuditResult {
    notaTertinggi: { emptyDates: string[] };
    bonusNota: { employeeCount: number, totalAmount: number };
    bonusBerat: { employeeCount: number, totalAmount: number };
    bonusOperator: { details: { name: string, amount: number }[], totalAmount: number };
    bonusEstafet: { employeeCount: number, totalAmount: number, emptyDates: string[] };
    koreksiGajiPlus: { employeeCount: number, totalAmount: number };
    koreksiGajiMinus: { employeeCount: number, totalAmount: number };
    bonusLainLain: { employeeCount: number, totalAmount: number };
    potonganRestan100: { employeeCount: number, totalAmount: number };
    potonganRestanBersama: { employeeCount: number, totalAmount: number };
    potonganSeragam: { employeeCount: number, totalAmount: number };
}

export default function AdminAuditDanExport({ employees }: { employees: Employee[] }) {
    const [controls, setControls] = useState<Record<string, any>>({});
    const periodOptions = useMemo(() => {
        return Object.entries(controls)
            .filter(([_, ctrl]: [string, any]) => !ctrl.hidden) // Filter out hidden periods
            .map(([value, ctrl]: [string, any]) => ({
                value,
                label: ctrl.name || value,
                start: ctrl.startDate ? new Date(ctrl.startDate) : new Date(0),
                end: ctrl.endDate ? new Date(ctrl.endDate) : new Date(0)
            }))
            .sort((a,b) => b.start.getTime() - a.start.getTime()); // Newest first
    }, [controls]);
    
    const [selectedPeriod, setSelectedPeriod] = useState('');
    const [loading, setLoading] = useState(false);
    const [auditData, setAuditData] = useState<AuditResult | null>(null);

    useEffect(() => {
      const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
        const data: Record<string, any> = {};
        snap.docs.forEach(d => { data[d.id] = d.data(); });
        setControls(data);
        if (!selectedPeriod && snap.docs.length > 0) {
            setSelectedPeriod(snap.docs[0].id);
        }
      });
      return unsub;
    }, []);

    const fetchAuditData = async () => {
        if (!selectedPeriod) return;
        setLoading(true);
        try {
            const periodCtrl = controls[selectedPeriod];
            let start = new Date();
            let end = new Date();
            if (periodCtrl?.startDate && periodCtrl?.endDate) {
                start = new Date(periodCtrl.startDate);
                end = new Date(periodCtrl.endDate);
            }
            
            const getDatesInRange = (startDate: Date, endDate: Date) => {
                const dates = [];
                let currentDate = new Date(startDate);
                while (currentDate <= endDate) {
                    dates.push(format(currentDate, 'yyyy-MM-dd'));
                    currentDate.setDate(currentDate.getDate() + 1);
                }
                return dates;
            };
            const periodDates = getDatesInRange(start, end);

            // Fetch generic entries collections
            const getEntriesStats = async (collName: string) => {
                const docSnap = await getDoc(doc(db, collName, selectedPeriod));
                let count = 0;
                let total = 0;
                if (docSnap.exists() && docSnap.data().entries) {
                    const entries = docSnap.data().entries;
                    const activeList = Object.values(entries).filter((val: any) => (Number(val.amount) || Number(val) || 0) > 0);
                    count = activeList.length;
                    total = activeList.reduce<number>((sum, val: any) => sum + (Number(val.amount) || Number(val) || 0), 0);
                }
                return { employeeCount: count, totalAmount: total };
            };

            // Potongan Seragam (has amount field)
            const getSeragamStats = async () => {
                const docSnap = await getDoc(doc(db, 'potonganSeragam', selectedPeriod));
                let count = 0;
                let total = 0;
                if (docSnap.exists() && docSnap.data().entries) {
                    const entries = docSnap.data().entries;
                    const activeList = Object.values(entries).filter((val: any) => (Number(val.amount) || 0) > 0);
                    count = activeList.length;
                    total = activeList.reduce<number>((sum, val: any) => sum + (Number(val.amount) || 0), 0);
                }
                return { employeeCount: count, totalAmount: total };
            };

            // Bonus Operator
            const getOperatorStats = async () => {
                const docSnap = await getDoc(doc(db, 'bonusOperator', selectedPeriod));
                let details: {name: string, amount: number}[] = [];
                let total = 0;
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const entries = data.entries || {};
                    const nRate = data.notaRate ?? 50;
                    const bRate = data.balenRate ?? 70;
                    
                    details = Object.entries(entries).map(([id, val]: [string, any]) => {
                        const emp = employees.find(e => e.id === id);
                        const n = Number(val?.notaCount) || 0;
                        const b = Number(val?.balenCount) || 0;
                        const amt = (n * nRate) + (b * bRate);
                        return { name: emp?.nickname || emp?.name || id, amount: amt };
                    }).filter(d => d.amount > 0);
                    
                    total = details.reduce((sum, d) => sum + d.amount, 0);
                }
                return { details, totalAmount: total };
            };

            // Potongan Kehilangan
            const getPotonganStats = async (collectionGrpName: string) => {
                const q = query(collectionGroup(db, collectionGrpName));
                const snapshot = await getDocs(q);
                let total = 0;
                const empIds = new Set();
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const amt = Number(data.amount) || 0;
                    if (data.periodId === selectedPeriod && amt > 0) {
                        empIds.add(doc.ref.parent.parent?.parent?.parent?.id); // empId
                        total += amt;
                    }
                });
                return { employeeCount: empIds.size, totalAmount: total };
            };

            // Bonus Master / Tertinggi
            const getMasterStats = async () => {
                const docSnap = await getDoc(doc(db, 'bonusMasterConfig', selectedPeriod));
                const emptyDates: string[] = [];
                if (docSnap.exists() && docSnap.data().dailyAssignments) {
                    const assignments = docSnap.data().dailyAssignments;
                    periodDates.forEach(date => {
                        if (!assignments[date] || !assignments[date].employeeIds || assignments[date].employeeIds.length === 0) {
                            emptyDates.push(date);
                        }
                    });
                } else {
                    periodDates.forEach(date => emptyDates.push(date));
                }
                return { emptyDates };
            };

            // Bonus Estafet
            const getEstafetStats = async () => {
                const docSnap = await getDoc(doc(db, 'bonusEstafet', selectedPeriod));
                const emptyDates: string[] = [];
                let employeeCount = 0;
                let totalAmount = 0;
                if (docSnap.exists() && docSnap.data().dailyAssignments) {
                    const assignments = docSnap.data().dailyAssignments;
                    const allEmpIds = new Set();
                    periodDates.forEach(date => {
                        if (!assignments[date] || !assignments[date].employeeIds || assignments[date].employeeIds.length === 0) {
                            emptyDates.push(date);
                        } else {
                            assignments[date].employeeIds.forEach((id: string) => allEmpIds.add(id));
                            totalAmount += (Number(assignments[date].bonusAmount) || 0) * assignments[date].employeeIds.length;
                        }
                    });
                    employeeCount = allEmpIds.size;
                } else {
                    periodDates.forEach(date => emptyDates.push(date));
                }
                return { employeeCount, totalAmount, emptyDates };
            };

            const [
                notaTertinggi,
                bonusNota,
                bonusBerat,
                bonusOperator,
                bonusEstafet,
                koreksiGajiPlus,
                koreksiGajiMinus,
                bonusLainLain,
                potonganSeragam,
                potonganRestan100,
                potonganRestanBersama
            ] = await Promise.all([
                getMasterStats(),
                getEntriesStats('bonusNota'),
                getEntriesStats('bonusBerat'),
                getOperatorStats(),
                getEstafetStats(),
                getEntriesStats('koreksiGaji'),
                getEntriesStats('koreksiGajiMinus'),
                getEntriesStats('bonusLainLain'),
                getSeragamStats(),
                getPotonganStats('payments'),
                getPotonganStats('paymentsBersama')
            ]);

            setAuditData({
                notaTertinggi,
                bonusNota,
                bonusBerat,
                bonusOperator,
                bonusEstafet,
                koreksiGajiPlus,
                koreksiGajiMinus,
                bonusLainLain,
                potonganSeragam,
                potonganRestan100,
                potonganRestanBersama
            });

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (!selectedPeriod) return;
        setLoading(true);
        try {
            // Re-fetch all data to ensure it's fresh for export
            const [
                snapBonusNota,
                snapBonusBerat,
                snapBonusOperator,
                snapBonusEstafet,
                snapKoreksiGaji,
                snapKoreksiGajiMinus,
                snapBonusLainLain,
                snapPotonganSeragam
            ] = await Promise.all([
                getDoc(doc(db, 'bonusNota', selectedPeriod)),
                getDoc(doc(db, 'bonusBerat', selectedPeriod)),
                getDoc(doc(db, 'bonusOperator', selectedPeriod)),
                getDoc(doc(db, 'bonusEstafet', selectedPeriod)),
                getDoc(doc(db, 'koreksiGaji', selectedPeriod)),
                getDoc(doc(db, 'koreksiGajiMinus', selectedPeriod)),
                getDoc(doc(db, 'bonusLainLain', selectedPeriod)),
                getDoc(doc(db, 'potonganSeragam', selectedPeriod))
            ]);

            const q100 = query(collectionGroup(db, 'payments'));
            const qBersama = query(collectionGroup(db, 'paymentsBersama'));
            const [snapPayments100, snapPaymentsBersama] = await Promise.all([getDocs(q100), getDocs(qBersama)]);

            const excelRows: any[] = [];
            
            const addRow = (empId: string, compName: string, amount: number) => {
                if (amount === 0) return; // Do not export zero amount
                
                const emp = employees.find(e => e.id === empId);
                // Only non-executive (includes default undefined/null mapping to Non-Executive)
                const org = emp?.organization || 'Non-Executive';
                if (org !== 'Non-Executive') return;
                
                if (!emp) return;
                excelRows.push({
                    'Employee ID': emp.pin,
                    'Full Name': emp.name,
                    'Component Name': compName,
                    'Amount': amount
                });
            };

            // process generic entries
            const processEntries = (docSnap: any, compName: string, amountKey?: string) => {
                if (docSnap.exists() && docSnap.data().entries) {
                    Object.entries(docSnap.data().entries).forEach(([id, val]: [string, any]) => {
                        const amount = amountKey ? Number(val[amountKey]) : Number(val);
                        addRow(id, compName, amount || 0);
                    });
                }
            };

            processEntries(snapBonusBerat, 'Bonus Berat');
            processEntries(snapBonusNota, 'Bonus Nota');
            
            // process Bonus Operator specialized
            if (snapBonusOperator.exists()) {
                const data = snapBonusOperator.data();
                const entries = data.entries || {};
                const nRate = data.notaRate ?? 50;
                const bRate = data.balenRate ?? 70;
                Object.entries(entries).forEach(([id, val]: [string, any]) => {
                    const n = Number(val?.notaCount) || 0;
                    const b = Number(val?.balenCount) || 0;
                    const amt = (n * nRate) + (b * bRate);
                    addRow(id, 'Bonus Operator', amt);
                });
            }

            processEntries(snapKoreksiGaji, 'Koreksi Gaji (Penambahan)');
            processEntries(snapBonusLainLain, 'Bonus Lain-lain');
            processEntries(snapPotonganSeragam, 'Potongan Seragam', 'amount');
            processEntries(snapKoreksiGajiMinus, 'Koreksi Gaji (Pengurangan)');

            // process estafet (dailyAssignments)
            if (snapBonusEstafet.exists() && snapBonusEstafet.data().dailyAssignments) {
                const assignments = snapBonusEstafet.data().dailyAssignments;
                const empTotals: Record<string, number> = {};
                Object.values(assignments).forEach((dayData: any) => {
                    const amount = Number(dayData.bonusAmount) || 0;
                    if (dayData.employeeIds && Array.isArray(dayData.employeeIds)) {
                        dayData.employeeIds.forEach((id: string) => {
                            empTotals[id] = (empTotals[id] || 0) + amount;
                        });
                    }
                });
                Object.entries(empTotals).forEach(([id, amt]) => {
                    addRow(id, 'Bonus Estafet', amt);
                });
            }

            // process potongan kehilangan 100
            const empPotongan100: Record<string, number> = {};
            snapPayments100.docs.forEach(d => {
                const data = d.data();
                if (data.periodId === selectedPeriod) {
                    const empId = d.ref.parent.parent?.parent?.parent?.id;
                    if (empId) {
                        empPotongan100[empId] = (empPotongan100[empId] || 0) + (Number(data.amount) || 0);
                    }
                }
            });
            Object.entries(empPotongan100).forEach(([id, amt]) => {
                addRow(id, 'Potongan Kehilangan (Restan 100%)', amt);
            });

            // process potongan kehilangan bersama
            const empPotonganBersama: Record<string, number> = {};
            snapPaymentsBersama.docs.forEach(d => {
                const data = d.data();
                if (data.periodId === selectedPeriod) {
                    const empId = d.ref.parent.parent?.parent?.parent?.id;
                    if (empId) {
                        empPotonganBersama[empId] = (empPotonganBersama[empId] || 0) + (Number(data.amount) || 0);
                    }
                }
            });
            Object.entries(empPotonganBersama).forEach(([id, amt]) => {
                addRow(id, 'Potongan Kehilangan (Restan Bersama)', amt);
            });

            if (excelRows.length === 0) {
                alert("Tidak ada data untuk diexport pada periode ini untuk karyawan Non-Executive.");
                setLoading(false);
                return;
            }

            // sort by Employee ID
            excelRows.sort((a,b) => String(a['Employee ID']).localeCompare(String(b['Employee ID'])));

            const ws = XLSX.utils.json_to_sheet(excelRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Rekap Data");
            const periodLabel = periodOptions.find(p => p.value === selectedPeriod)?.label || selectedPeriod;
            XLSX.writeFile(wb, `Export_Bonus_Potongan_${periodLabel}_NonExecutive.xlsx`);

        } catch (e) {
            console.error(e);
            alert("Terjadi kesalahan saat export.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
               <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <FileDown className="w-5 h-5 text-emerald-400" /> Audit & Export Data
                  </h2>
                  <p className="text-white/40 text-xs font-medium lowercase">Pilih periode untuk mengecek data sebelum ditarik</p>
               </div>
               <div className="flex flex-wrap items-center gap-2">
                   <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                       <SelectTrigger className="w-[220px] glass-panel border-white/10 text-white h-11 px-6 rounded-xl">
                           <SelectValue placeholder="Pilih Periode">
                               {periodOptions.find(p => p.value === selectedPeriod)?.label || "Pilih Periode"}
                           </SelectValue>
                       </SelectTrigger>
                       <SelectContent className="glass-panel border-white/20 text-white">
                           {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                       </SelectContent>
                   </Select>
                   <Button onClick={fetchAuditData} disabled={loading} className="h-11 rounded-xl bg-primary text-white hover:bg-primary/90 px-6 font-bold flex items-center gap-2">
                       <Search className="w-4 h-4" /> Cek Data
                   </Button>
               </div>
            </div>

            {auditData && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AuditCard 
                        title="Nota Tertinggi" 
                        status={auditData.notaTertinggi.emptyDates.length === 0 ? 'ok' : 'warning'}
                        description={auditData.notaTertinggi.emptyDates.length > 0 ? `Ada ${auditData.notaTertinggi.emptyDates.length} hari kosong` : "Semua hari terisi"}
                        details={auditData.notaTertinggi.emptyDates.length > 0 ? `Tgl kosong: ${auditData.notaTertinggi.emptyDates.map(d => format(new Date(d), 'dd', {locale: id})).join(', ')}` : ""}
                    />
                    <AuditCard 
                        title="Bonus Nota" 
                        status={auditData.bonusNota.employeeCount > 0 ? 'ok' : 'warning'}
                        description={auditData.bonusNota.employeeCount > 0 ? `Terinput ${auditData.bonusNota.employeeCount} Karyawan` : "Belum diinput"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.bonusNota.totalAmount)}`}
                    />
                    <AuditCard 
                        title="Bonus Berat" 
                        status={auditData.bonusBerat.employeeCount > 0 ? 'ok' : 'warning'}
                        description={auditData.bonusBerat.employeeCount > 0 ? `Terinput ${auditData.bonusBerat.employeeCount} Karyawan` : "Belum diinput"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.bonusBerat.totalAmount)}`}
                    />
                    <AuditCard 
                        title="Bonus Operator" 
                        status={auditData.bonusOperator.details.length > 0 ? 'ok' : 'warning'}
                        description={auditData.bonusOperator.details.length > 0 ? `Terinput ${auditData.bonusOperator.details.length} Operator` : "Belum diinput"}
                        details={auditData.bonusOperator.details.length > 0 ? auditData.bonusOperator.details.map(d => `${d.name}: Rp ${new Intl.NumberFormat('id-ID').format(d.amount)}`).join(' | ') : "Sistem belum mendeteksi bonus operator"}
                    />
                    <AuditCard 
                        title="Bonus Estafet" 
                        status={auditData.bonusEstafet.emptyDates.length === 0 ? 'ok' : 'warning'}
                        description={`Terinput ${auditData.bonusEstafet.employeeCount} org (Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.bonusEstafet.totalAmount)})`}
                        details={auditData.bonusEstafet.emptyDates.length > 0 ? `Ada tgl kosong employee: ${auditData.bonusEstafet.emptyDates.map(d => format(new Date(d), 'dd')).join(', ')}` : "Semua hari terisi"}
                    />
                    <AuditCard 
                        title="Koreksi Gaji (Penambahan)" 
                        status={auditData.koreksiGajiPlus.employeeCount > 0 ? 'ok' : 'warning'}
                        description={auditData.koreksiGajiPlus.employeeCount > 0 ? `Terinput ${auditData.koreksiGajiPlus.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.koreksiGajiPlus.totalAmount)}`}
                    />
                    <AuditCard 
                        title="Koreksi Gaji (Pengurangan)" 
                        status={auditData.koreksiGajiMinus.employeeCount > 0 ? 'ok' : 'warning'}
                        description={auditData.koreksiGajiMinus.employeeCount > 0 ? `Terinput ${auditData.koreksiGajiMinus.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.koreksiGajiMinus.totalAmount)}`}
                    />
                    <AuditCard 
                        title="Bonus Lain-Lain" 
                        status={auditData.bonusLainLain.employeeCount > 0 ? 'ok' : 'warning'}
                        description={auditData.bonusLainLain.employeeCount > 0 ? `Terinput ${auditData.bonusLainLain.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.bonusLainLain.totalAmount)}`}
                    />
                    <AuditCard 
                        title="Potongan Seragam" 
                        status={auditData.potonganSeragam.employeeCount > 0 ? 'ok' : 'warning'}
                        description={auditData.potonganSeragam.employeeCount > 0 ? `Terinput ${auditData.potonganSeragam.employeeCount} Orang` : "Kosong"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.potonganSeragam.totalAmount)}`}
                    />
                    <AuditCard 
                        title="Potongan Restan 100%" 
                        status={auditData.potonganRestan100.employeeCount > 0 ? 'ok' : 'warning'}
                        description={auditData.potonganRestan100.employeeCount > 0 ? `Terinput ${auditData.potonganRestan100.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.potonganRestan100.totalAmount)}`}
                    />
                    <AuditCard 
                        title="Potongan Restan Bersama" 
                        status={auditData.potonganRestanBersama.employeeCount > 0 ? 'ok' : 'warning'}
                        description={auditData.potonganRestanBersama.employeeCount > 0 ? `Terinput ${auditData.potonganRestanBersama.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.potonganRestanBersama.totalAmount)}`}
                    />
                </div>
            )}

            {auditData && (
                <div className="flex justify-start mt-8 pt-6 border-t border-white/10">
                    <Button onClick={handleExportExcel} disabled={loading} className="h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white px-8 font-black text-lg gap-3">
                       <FileDown className="w-6 h-6" /> Export Data (Excel)
                    </Button>
                </div>
            )}
        </div>
    );
}

function AuditCard({ title, status, description, details }: { title: string, status: 'ok' | 'warning', description: string, details: string }) {
    return (
        <Card className={`glass-panel border ${status === 'ok' ? 'border-white/10' : 'border-amber-500/40 bg-amber-500/5'}`}>
            <CardContent className="p-5 flex items-start gap-4">
                <div className="shrink-0 mt-1">
                    {status === 'ok' ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <AlertTriangle className="w-6 h-6 text-amber-400" />}
                </div>
                <div className="space-y-1">
                    <h4 className="text-white font-bold text-sm tracking-tight">{title}</h4>
                    <p className={`text-xs ${status === 'warning' ? 'text-amber-400 font-semibold' : 'text-white/60'}`}>{description}</p>
                    <p className="text-[10px] text-white/40 italic mt-2" title={details}>{details}</p>
                </div>
            </CardContent>
        </Card>
    );
}