import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db } from '../lib/firebase';
import { collection, onSnapshot, getDoc, doc, getDocs, query, collectionGroup } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Employee } from '../types';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { CheckCircle2, XCircle, AlertTriangle, FileDown, Search, Lock as LockIcon } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface AuditResult {
    notaTertinggi: { emptyDates: string[], isLocked: boolean };
    bonusNota: { employeeCount: number, totalAmount: number, isLocked: boolean };
    bonusBerat: { employeeCount: number, totalAmount: number, isLocked: boolean };
    bonusOperator: { details: { name: string, amount: number }[], totalAmount: number, isLocked: boolean };
    bonusEstafet: { employeeCount: number, totalAmount: number, emptyDates: string[], isLocked: boolean };
    koreksiGajiPlus: { employeeCount: number, totalAmount: number, isLocked: boolean };
    koreksiGajiMinus: { employeeCount: number, totalAmount: number, isLocked: boolean };
    bonusLainLain: { employeeCount: number, totalAmount: number, isLocked: boolean };
    potonganRestan100: { employeeCount: number, totalAmount: number, isLocked: boolean };
    potonganRestanBersama: { employeeCount: number, totalAmount: number, isLocked: boolean };
    potonganSeragam: { employeeCount: number, totalAmount: number, isLocked: boolean };
}

export default function AdminAuditDanExport({ 
    employees, 
    setActiveTab, 
    selectedPeriod: activePeriodId,
    setActivePeriodId 
}: { 
    employees: Employee[], 
    setActiveTab: (tab: string) => void,
    selectedPeriod: string,
    setActivePeriodId: (id: string) => void
}) {
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
    
    // Internal state synced with prop
    const [internalPeriod, setInternalPeriod] = useState(activePeriodId);
    const selectedPeriod = internalPeriod || activePeriodId;

    const setSelectedPeriod = (val: string) => {
        setInternalPeriod(val);
        setActivePeriodId(val);
    };

    const [loading, setLoading] = useState(false);
    const [auditData, setAuditData] = useState<AuditResult | null>(null);

    useEffect(() => {
        if (activePeriodId) setInternalPeriod(activePeriodId);
    }, [activePeriodId]);

    useEffect(() => {
      const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
        const data: Record<string, any> = {};
        snap.docs.forEach(d => { data[d.id] = d.data(); });
        setControls(data);
        
        // Find first non-hidden period to default to if none selected
        if (!selectedPeriod) {
            const firstActive = Object.entries(data)
                .filter(([_, ctrl]) => !ctrl.hidden)
                .map(([id, ctrl]) => ({ id, start: ctrl.startDate ? new Date(ctrl.startDate) : new Date(0) }))
                .sort((a, b) => b.start.getTime() - a.start.getTime())[0];
            
            if (firstActive) {
                setInternalPeriod(firstActive.id);
                setActivePeriodId(firstActive.id);
            }
        }
      }, (error) => {
          console.error("Audit periods snapshot error:", error);
      });
      return unsub;
    }, [selectedPeriod]);

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
                let isLocked = false;
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    isLocked = data.isLocked || false;
                    if (data.entries) {
                        const entries = data.entries;
                        if (Array.isArray(entries)) {
                            // Handle Array (like bonusLainLain and now potonganSeragam)
                            const activeList = entries.filter((entry: any) => {
                                const rawId = entry.empId || entry.pin || entry.id;
                                if (!rawId) return false;
                                
                                const empExists = employees.length === 0 || employees.some(e => 
                                    String(e.id).toLowerCase() === String(rawId).toLowerCase() || 
                                    String(e.pin).toLowerCase() === String(rawId).toLowerCase() ||
                                    (entry.pin && String(e.pin).toLowerCase() === String(entry.pin).toLowerCase()) ||
                                    (entry.empId && String(e.id).toLowerCase() === String(entry.empId).toLowerCase())
                                );
                                const amt = Number(entry.amount) || Number(entry.nominal) || 0;
                                return empExists && amt > 0;
                            });
                            // Count unique employees
                            const uniqueIds = new Set(activeList.map((e: any) => e.empId || e.pin || e.id));
                            count = uniqueIds.size;
                            total = activeList.reduce<number>((sum, entry: any) => sum + (Number(entry.amount) || Number(entry.nominal) || 0), 0);
                        } else {
                            // Handle Record (Object)
                            const activeList = Object.entries(entries)
                                .filter(([id, val]: [string, any]) => {
                                    const empExists = employees.length === 0 || employees.some(e => 
                                        String(e.id).toLowerCase() === String(id).toLowerCase() || 
                                        String(e.pin).toLowerCase() === String(id).toLowerCase()
                                    );
                                    const amt = (typeof val === 'object' && val !== null) ? (Number(val.amount) || Number(val.nominal) || 0) : Number(val);
                                    return empExists && amt > 0;
                                });
                            count = activeList.length;
                            total = activeList.reduce<number>((sum, [_, val]: [string, any]) => {
                                const amt = (typeof val === 'object' && val !== null) ? (Number(val.amount) || Number(val.nominal) || 0) : Number(val);
                                return sum + (amt || 0);
                            }, 0);
                        }
                    }
                }
                return { employeeCount: count, totalAmount: total, isLocked };
            };

            // Bonus Operator
            const getOperatorStats = async () => {
                const docSnap = await getDoc(doc(db, 'bonusOperator', selectedPeriod));
                let details: {name: string, amount: number}[] = [];
                let total = 0;
                let isLocked = false;
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    isLocked = data.isLocked || false;
                    const entries = data.entries || {};
                    const nRate = data.notaRate ?? 50;
                    const bRate = data.balenRate ?? 70;
                    
                    details = Object.entries(entries)
                        .filter(([id, _]) => employees.some(e => String(e.id) === String(id) || String(e.pin) === String(id))) // Only active employees
                        .map(([id, val]: [string, any]) => {
                            const emp = employees.find(e => String(e.id) === String(id) || String(e.pin) === String(id));
                            const n = Number(val?.notaCount) || 0;
                            const b = Number(val?.balenCount) || 0;
                            const amt = (n * nRate) + (b * bRate);
                            return { name: emp?.nickname || emp?.name || id, amount: amt };
                        }).filter(d => d.amount > 0);
                    
                    total = details.reduce((sum, d) => sum + d.amount, 0);
                }
                return { details, totalAmount: total, isLocked };
            };

            // Potongan Kehilangan
            const getPotonganStats = async (collectionGrpName: string, debtCollectionGrp: string, lockColl: string) => {
                const [debtSnap, lockSnap] = await Promise.all([
                    getDocs(query(collectionGroup(db, debtCollectionGrp))),
                    getDoc(doc(db, lockColl, selectedPeriod))
                ]);
                const validDebtIds = new Set(debtSnap.docs.map(d => d.id));
                const isLocked = lockSnap.exists() ? lockSnap.data().isLocked : false;

                const q = query(collectionGroup(db, collectionGrpName));
                const snapshot = await getDocs(q);
                let total = 0;
                const empIds = new Set();
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const amt = Number(data.amount) || 0;
                    if (data.periodId === selectedPeriod && amt > 0) {
                        const debtId = doc.ref.parent.parent?.id;
                        if (debtId && validDebtIds.has(debtId)) {
                            const empId = doc.ref.parent.parent?.parent?.parent?.id;
                            if (empId && employees.some(e => String(e.id) === String(empId) || String(e.pin) === String(empId))) {
                               empIds.add(empId);
                               total += amt;
                            }
                        }
                    }
                });
                return { employeeCount: empIds.size, totalAmount: total, isLocked };
            };

            // Bonus Master / Tertinggi
            const getMasterStats = async () => {
                const docSnap = await getDoc(doc(db, 'bonusMasterConfig', selectedPeriod));
                const emptyDates: string[] = [];
                let isLocked = false;
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    isLocked = data.isLocked || false;
                    const dailyData = data.dailyHighestReceipt || {};
                    periodDates.forEach(date => {
                        if (!dailyData[date] || dailyData[date] <= 0) {
                            emptyDates.push(date);
                        }
                    });
                } else {
                    periodDates.forEach(date => emptyDates.push(date));
                }
                return { emptyDates, isLocked };
            };

            // Bonus Estafet
            const getEstafetStats = async () => {
                const docSnap = await getDoc(doc(db, 'bonusEstafet', selectedPeriod));
                const emptyDates: string[] = [];
                let totalEmpCount = 0;
                let totalAmount = 0;
                let isLocked = false;
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    isLocked = data.isLocked || false;
                    if (data.dailyAssignments) {
                        const assignments = data.dailyAssignments;
                        const allEmpIds = new Set();
                        periodDates.forEach(date => {
                            if (!assignments[date] || !assignments[date].employeeIds || assignments[date].employeeIds.length === 0) {
                                emptyDates.push(date);
                            } else {
                                let dayHasActive = false;
                                assignments[date].employeeIds.forEach((id: string) => {
                                    if (employees.some(e => String(e.id) === String(id) || String(e.pin) === String(id))) {
                                        allEmpIds.add(id);
                                        totalAmount += (Number(assignments[date].bonusAmount) || 0);
                                        dayHasActive = true;
                                    }
                                });
                                if (!dayHasActive) emptyDates.push(date);
                            }
                        });
                        totalEmpCount = allEmpIds.size;
                    } else {
                        periodDates.forEach(date => emptyDates.push(date));
                    }
                } else {
                    periodDates.forEach(date => emptyDates.push(date));
                }
                return { employeeCount: totalEmpCount, totalAmount, emptyDates, isLocked };
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
                getEntriesStats('potonganSeragam'),
                getPotonganStats('payments', 'debts', 'potonganKehilanganConfig'),
                getPotonganStats('paymentsBersama', 'debtsBersama', 'potonganKehilanganBersamaConfig')
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
        
        // Validation: All must be locked
        if (auditData) {
            const keys = Object.keys(auditData) as (keyof AuditResult)[];
            const unlocked = keys.filter(k => !auditData[k].isLocked);
            if (unlocked.length > 0) {
                const names = unlocked.map(k => {
                    switch(k) {
                        case 'notaTertinggi': return 'Nota Tertinggi';
                        case 'bonusNota': return 'Bonus Nota';
                        case 'bonusBerat': return 'Bonus Berat';
                        case 'bonusOperator': return 'Bonus Operator';
                        case 'bonusEstafet': return 'Bonus Estafet';
                        case 'koreksiGajiPlus': return 'Koreksi Gaji (+)';
                        case 'koreksiGajiMinus': return 'Koreksi Gaji (-)';
                        case 'bonusLainLain': return 'Bonus Lain-Lain';
                        case 'potonganSeragam': return 'Potongan Seragam';
                        case 'potonganRestan100': return 'Potongan Restan 100%';
                        case 'potonganRestanBersama': return 'Potongan Restan Bersama';
                        default: return k;
                    }
                });
                alert(`Export gagal! Ada ${unlocked.length} menu yang belum dikunci:\n- ${names.join('\n- ')}`);
                return;
            }
        }

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
            const qDebts100 = query(collectionGroup(db, 'debts'));
            const qDebtsBersama = query(collectionGroup(db, 'debtsBersama'));
            
            const [snapPayments100, snapPaymentsBersama, snapDebts100, snapDebtsBersama] = await Promise.all([
                getDocs(q100), 
                getDocs(qBersama),
                getDocs(qDebts100),
                getDocs(qDebtsBersama)
            ]);

            const validDebtIds100 = new Set(snapDebts100.docs.map(d => d.id));
            const validDebtIdsBersama = new Set(snapDebtsBersama.docs.map(d => d.id));

            const excelRows: any[] = [];
            
            const addRow = (empId: string, compName: string, amount: number) => {
                if (amount === 0) return; // Do not export zero amount
                
                const emp = employees.find(e => 
                    String(e.id).toLowerCase() === String(empId).toLowerCase() || 
                    String(e.pin).toLowerCase() === String(empId).toLowerCase()
                );
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

            // process entries (supports both array and object structures)
            const processEntries = (docSnap: any, compName: string, amountKey?: string) => {
                if (docSnap.exists() && docSnap.data().entries) {
                    const entries = docSnap.data().entries;
                    if (Array.isArray(entries)) {
                        // Accumulate by employee to handle multiple entries per period
                        const totals: Record<string, number> = {};
                        entries.forEach((entry: any) => {
                            const entryIdKey = entry.empId || entry.pin;
                            if (entryIdKey) {
                                const amount = Number(entry.amount) || (amountKey ? Number(entry[amountKey]) : 0);
                                const emp = employees.find(e => String(e.id) === String(entryIdKey) || String(e.pin) === String(entryIdKey));
                                const finalId = emp ? emp.id : entryIdKey;
                                totals[finalId] = (totals[finalId] || 0) + amount;
                            }
                        });
                        Object.entries(totals).forEach(([empId, amt]) => {
                            addRow(empId, compName, amt);
                        });
                    } else {
                        // Legacy Object structure
                        Object.entries(entries).forEach(([id, val]: [string, any]) => {
                            const emp = employees.find(e => String(e.id) === String(id) || String(e.pin) === String(id));
                            if (!emp) return;

                            const amount = amountKey ? Number(val[amountKey]) : (typeof val === 'object' ? Number(val.amount) : Number(val));
                            addRow(emp.id, compName, amount || 0);
                        });
                    }
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
                    const debtId = d.ref.parent.parent?.id;
                    if (debtId && validDebtIds100.has(debtId)) {
                        const empId = d.ref.parent.parent?.parent?.parent?.id;
                        if (empId) {
                            const emp = employees.find(e => String(e.id) === String(empId) || String(e.pin) === String(empId));
                            if (emp) {
                                empPotongan100[emp.id] = (empPotongan100[emp.id] || 0) + (Number(data.amount) || 0);
                            }
                        }
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
                    const debtId = d.ref.parent.parent?.id;
                    if (debtId && validDebtIdsBersama.has(debtId)) {
                        const empId = d.ref.parent.parent?.parent?.parent?.id;
                        if (empId) {
                            const emp = employees.find(e => String(e.id) === String(empId) || String(e.pin) === String(empId));
                            if (emp) {
                                empPotonganBersama[emp.id] = (empPotonganBersama[emp.id] || 0) + (Number(data.amount) || 0);
                            }
                        }
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
                        isLocked={auditData.notaTertinggi.isLocked}
                        description={auditData.notaTertinggi.emptyDates.length > 0 ? `Ada ${auditData.notaTertinggi.emptyDates.length} hari kosong` : "Semua hari terisi"}
                        details={auditData.notaTertinggi.emptyDates.length > 0 ? `Tgl kosong: ${auditData.notaTertinggi.emptyDates.map(d => format(new Date(d), 'dd', {locale: id})).join(', ')}` : ""}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('bonus-master');
                        }}
                    />
                    <AuditCard 
                        title="Bonus Nota" 
                        status={auditData.bonusNota.employeeCount > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.bonusNota.isLocked}
                        description={auditData.bonusNota.employeeCount > 0 ? `Terinput ${auditData.bonusNota.employeeCount} Karyawan` : "Belum diinput"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.bonusNota.totalAmount)}`}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('bonus-nota');
                        }}
                    />
                    <AuditCard 
                        title="Bonus Berat" 
                        status={auditData.bonusBerat.employeeCount > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.bonusBerat.isLocked}
                        description={auditData.bonusBerat.employeeCount > 0 ? `Terinput ${auditData.bonusBerat.employeeCount} Karyawan` : "Belum diinput"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.bonusBerat.totalAmount)}`}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('bonus-berat');
                        }}
                    />
                    <AuditCard 
                        title="Bonus Operator" 
                        status={auditData.bonusOperator.details.length > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.bonusOperator.isLocked}
                        description={auditData.bonusOperator.details.length > 0 ? `Terinput ${auditData.bonusOperator.details.length} Operator` : "Belum diinput"}
                        details={auditData.bonusOperator.details.length > 0 ? auditData.bonusOperator.details.map(d => `${d.name}: Rp ${new Intl.NumberFormat('id-ID').format(d.amount)}`).join(' | ') : "Sistem belum mendeteksi bonus operator"}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('bonus-operator');
                        }}
                    />
                    <AuditCard 
                        title="Bonus Estafet" 
                        status={auditData.bonusEstafet.emptyDates.length === 0 ? 'ok' : 'warning'}
                        isLocked={auditData.bonusEstafet.isLocked}
                        description={`Terinput ${auditData.bonusEstafet.employeeCount} org (Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.bonusEstafet.totalAmount)})`}
                        details={auditData.bonusEstafet.emptyDates.length > 0 ? `Ada tgl kosong employee: ${auditData.bonusEstafet.emptyDates.map(d => format(new Date(d), 'dd')).join(', ')}` : "Semua hari terisi"}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('bonus-estafet');
                        }}
                    />
                    <AuditCard 
                        title="Koreksi Gaji (Penambahan)" 
                        status={auditData.koreksiGajiPlus.employeeCount > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.koreksiGajiPlus.isLocked}
                        description={auditData.koreksiGajiPlus.employeeCount > 0 ? `Terinput ${auditData.koreksiGajiPlus.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.koreksiGajiPlus.totalAmount)}`}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('bonus-koreksi-gaji');
                        }}
                    />
                    <AuditCard 
                        title="Koreksi Gaji (Pengurangan)" 
                        status={auditData.koreksiGajiMinus.employeeCount > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.koreksiGajiMinus.isLocked}
                        description={auditData.koreksiGajiMinus.employeeCount > 0 ? `Terinput ${auditData.koreksiGajiMinus.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.koreksiGajiMinus.totalAmount)}`}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('potongan-koreksi-gaji-minus');
                        }}
                    />
                    <AuditCard 
                        title="Bonus Lain-Lain" 
                        status={auditData.bonusLainLain.employeeCount > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.bonusLainLain.isLocked}
                        description={auditData.bonusLainLain.employeeCount > 0 ? `Terinput ${auditData.bonusLainLain.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.bonusLainLain.totalAmount)}`}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('bonus-lain-lain-combined');
                        }}
                    />
                    <AuditCard 
                        title="Potongan Seragam" 
                        status={auditData.potonganSeragam.employeeCount > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.potonganSeragam.isLocked}
                        description={auditData.potonganSeragam.employeeCount > 0 ? `Terinput ${auditData.potonganSeragam.employeeCount} Orang` : "Kosong"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.potonganSeragam.totalAmount)}`}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('potongan-seragam');
                        }}
                    />
                    <AuditCard 
                        title="Potongan Restan 100%" 
                        status={auditData.potonganRestan100.employeeCount > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.potonganRestan100.isLocked}
                        description={auditData.potonganRestan100.employeeCount > 0 ? `Terinput ${auditData.potonganRestan100.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.potonganRestan100.totalAmount)}`}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('potongan');
                        }}
                    />
                    <AuditCard 
                        title="Potongan Restan Bersama" 
                        status={auditData.potonganRestanBersama.employeeCount > 0 ? 'ok' : 'warning'}
                        isLocked={auditData.potonganRestanBersama.isLocked}
                        description={auditData.potonganRestanBersama.employeeCount > 0 ? `Terinput ${auditData.potonganRestanBersama.employeeCount} Orang` : "No input"}
                        details={`Total: Rp ${new Intl.NumberFormat('id-ID').format(auditData.potonganRestanBersama.totalAmount)}`}
                        onCheck={() => {
                            setActivePeriodId(selectedPeriod);
                            setActiveTab('potongan-bersama');
                        }}
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

function AuditCard({ title, status, description, details, isLocked, onCheck }: { title: string, status: 'ok' | 'warning', description: string, details: string, isLocked?: boolean, onCheck: () => void }) {
    return (
        <Card className={`glass-panel border transition-all duration-300 hover:scale-[1.02] ${status === 'ok' ? 'border-white/10' : 'border-amber-500/40 bg-amber-500/5'}`}>
            <CardContent className="p-5 flex items-start gap-4 h-full relative group">
                <div className="shrink-0 mt-1 flex flex-col items-center gap-2">
                    {status === 'ok' ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <AlertTriangle className="w-6 h-6 text-amber-400" />}
                    {isLocked ? (
                        <div className="bg-emerald-500/20 text-emerald-400 p-1 rounded-full border border-emerald-500/30" title="Data Terkunci">
                            <LockIcon className="w-3 h-3" />
                        </div>
                    ) : (
                        <div className="bg-rose-500/20 text-rose-400 p-1 rounded-full border border-rose-500/30 animate-pulse" title="Data Belum Dikunci">
                            <LockIcon className="w-3 h-3" />
                        </div>
                    )}
                </div>
                <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-center pr-12">
                        <h4 className="text-white font-bold text-sm tracking-tight">{title}</h4>
                        {isLocked ? (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-widest">Locked</span>
                        ) : (
                            <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20 font-bold uppercase tracking-widest">Unlocked</span>
                        )}
                    </div>
                    <p className={`text-xs ${status === 'warning' ? 'text-amber-400 font-semibold' : 'text-white/60'}`}>{description}</p>
                    {!isLocked && (
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-tighter animate-pulse flex items-center gap-1 mt-1">
                            <LockIcon className="w-2.5 h-2.5" /> Harus di-Kunci sebelum Export
                        </p>
                    )}
                    <p className="text-[10px] text-white/40 italic mt-2 line-clamp-3 overflow-hidden" title={details}>{details}</p>
                </div>
                
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={onCheck}
                        className="h-8 rounded-lg bg-primary/20 hover:bg-primary text-white text-[10px] font-black tracking-widest px-3 border border-primary/30"
                    >
                        CEK
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}