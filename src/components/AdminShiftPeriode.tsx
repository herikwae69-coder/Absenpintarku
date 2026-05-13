import React, { useState, useEffect, useMemo } from "react";
import { format, addDays, getWeek, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, Download, Save, Users, PlusCircle, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import Holidays from "date-holidays";
import { collection, query, onSnapshot, getDoc, getDocs, doc, where } from "firebase/firestore";

export function AdminShiftPeriode({
  employees,
  divisions,
  shifts,
  db,
  confirm,
  alert,
}: any) {
  const hd = useMemo(() => new Holidays("ID"), []);
  const [periodOptions, setPeriodOptions] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");

  useEffect(() => {
    const q = query(collection(db, "periodControls"));
    const unsub = onSnapshot(q, (snap) => {
        const opts = snap.docs.map(doc => {
            const data = doc.data();
            return {
                label: data.name,
                value: doc.id,
                start: data.startDate ? new Date(data.startDate) : new Date(),
                end: data.endDate ? new Date(data.endDate) : new Date(),
                ...data
            };
        }).filter((p: any) => !!p.label).sort((a,b) => b.start.getTime() - a.start.getTime()); // fallback
        setPeriodOptions(opts);
        if (opts.length > 0 && !selectedPeriod) {
            setSelectedPeriod(opts[0].value);
        }
    });
    return unsub;
  }, [db]);

  const [selectedDivision, setSelectedDivision] = useState(divisions?.[0]?.name || "");
  const [numGroups, setNumGroups] = useState<"2" | "3">("3");
  
  const [employeeGroup, setEmployeeGroup] = useState<Record<string, string>>({});
  const [rotations, setRotations] = useState<Record<string, string>[]>([
    { A: "", B: "", C: "" },
    { A: "", B: "", C: "" },
    { A: "", B: "", C: "" },
    { A: "", B: "", C: "" },
    { A: "", B: "", C: "" },
    { A: "", B: "", C: "" },
  ]);

  const activePeriod = periodOptions.find((p: any) => p.value === selectedPeriod);
  
  // Calculate Weeks
  const calendarWeeks = useMemo(() => {
    if (!activePeriod || !activePeriod.start || !activePeriod.end) return [];
    let current = activePeriod.start;
    const end = activePeriod.end;
    let weeks = [];
    while (current <= end) {
      const wStart = startOfWeek(current, { weekStartsOn: 1 }); // Monday
      const wEnd = endOfWeek(current, { weekStartsOn: 1 });
      const actStart = wStart < activePeriod.start ? activePeriod.start : wStart;
      const actEnd = wEnd > activePeriod.end ? activePeriod.end : wEnd;
      weeks.push({ start: actStart, end: actEnd });
      current = addDays(wEnd, 1);
    }
    return weeks;
  }, [activePeriod]);

  // Sync rotations length with calendarWeeks
  useEffect(() => {
    if (calendarWeeks.length > 0 && rotations.length !== calendarWeeks.length) {
      const newRot = [...rotations];
      while (newRot.length < calendarWeeks.length) newRot.push({ A: "", B: "", C: "" });
      setRotations(newRot.slice(0, calendarWeeks.length));
    }
  }, [calendarWeeks, rotations]);

  const filteredEmployees = employees.filter((e: any) => e.division === selectedDivision);

  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [inputC, setInputC] = useState("");

  const handleAddMember = (group: string, inputVal: string) => {
    if (!inputVal.trim()) return;
    const emp = filteredEmployees.find((e: any) => 
        e.name.toLowerCase() === inputVal.toLowerCase().trim() || 
        e.pin === inputVal.trim()
    );
    if (emp) {
        setEmployeeGroup((prev) => ({ ...prev, [emp.id]: group }));
        if (group === "A") setInputA("");
        if (group === "B") setInputB("");
        if (group === "C") setInputC("");
    } else {
        alert("Karyawan tidak ditemukan di divisi ini!");
    }
  };

  const handleRemoveMember = (empId: string) => {
    setEmployeeGroup((prev) => {
        const newGroup = { ...prev };
        delete newGroup[empId];
        return newGroup;
    });
  };

  const unassignedEmployees = filteredEmployees.filter((e: any) => !employeeGroup[e.id] || (numGroups === "2" ? employeeGroup[e.id] === "C" : false));

  const handleGroupSelect = (empId: string, group: string) => {
    setEmployeeGroup((prev) => ({ ...prev, [empId]: group }));
  };

  const handleRotChange = (wIndex: number, group: string, shiftId: string) => {
    const newRot = [...rotations];
    newRot[wIndex] = { ...newRot[wIndex], [group]: shiftId };
    setRotations(newRot);
  };

  const generateExcel = async () => {
    if (!activePeriod) return;
    
    // Validate everything
    const groupsToValidate = numGroups === "3" ? ["A", "B", "C"] : ["A", "B"];
    for (let i = 0; i < calendarWeeks.length; i++) {
        for (const g of groupsToValidate) {
            if (!rotations[i][g]) {
                alert(`Minggu Ke-${i+1} Grup ${g} belum di-set shift-nya!`);
                return;
            }
        }
    }

    const unassigned = filteredEmployees.filter((e:any) => !employeeGroup[e.id] || !groupsToValidate.includes(employeeGroup[e.id]));
    if (unassigned.length > 0) {
        if (!window.confirm(`Ada ${unassigned.length} karyawan yang belum masuk grup. Tetap lanjutkan download?`)) return;
    }

    // 1. Cek apakah Jadwal Libur sudah dikunci
    const statusId = `status_${selectedPeriod}_${selectedDivision}`;
    const statusDoc = await getDoc(doc(db, "periodControls", statusId));
    const statusData = statusDoc.exists() ? statusDoc.data() : {};
    
    // Asumsikan data jadwal libur dikunci jika isLocked === true ATAU isFinished === true
    if (!statusData.isLocked && !statusData.isFinished) {
        alert("Peringatan: Jadwal libur belum dikunci! Harap masuk ke tab Jadwal Libur dan kunci jadwal terlebih dahulu sebelum menarik plot shift.");
        return;
    }

    // 2. Tarik data request libur untuk periode ini
    const leaveQ = query(collection(db, "leaveRequests"), where("period", "==", selectedPeriod));
    const leaveSnap = await getDocs(leaveQ);
    const leaveRequests = leaveSnap.docs.map(d => d.data());

    // Prepare dates
    const dates: Date[] = [];
    let cur = activePeriod.start;
    const endD = activePeriod.end;
    while (cur <= endD) {
      dates.push(cur);
      cur = addDays(cur, 1);
    }

    const dayoffShift = shifts.find((s:any) => s.isDayoff === true || s.name.toLowerCase() === "dayoff" || s.name.toLowerCase() === "libur");
    const dayoffShiftName = dayoffShift ? dayoffShift.name : "dayoff";

    const data = filteredEmployees.map((emp: any) => {
      const group = employeeGroup[emp.id] || "-";
      const row: any = {
        "No Absen": emp.pin,
        "Nama": emp.name,
        "Grup": group,
      };

      const empLeaves = leaveRequests.filter(lr => lr.employeeId === emp.id && lr.status === "approved");

      dates.forEach(d => {
        const dateStr = format(d, "dd-MMM");
        const dateFmtFull = format(d, "yyyy-MM-dd");
        if (!groupsToValidate.includes(group)) {
            row[dateStr] = "-";
            return;
        }

        // Cek Minggu atau Hari Libur Nasional
        const isSunday = d.getDay() === 0;
        const isHolidayObj = hd.isHoliday(d);
        const isNationalHoliday = isHolidayObj && isHolidayObj.some(h => h.type === "public");
        
        // Cek apakah ada jadwal libur (dari menu jadwal libur)
        // Di sini kita cek apakah ada request libur (approved) yang tanggalnya cocok, atau jika system attendance-nya "day-off"
        const hasApprovedLeave = empLeaves.some(lr => lr.dates && lr.dates.includes(dateFmtFull));
        
        if (isSunday || isNationalHoliday || hasApprovedLeave) {
            row[dateStr] = dayoffShiftName;
            return;
        }

        // Find which week this date belongs to
        const wIndex = calendarWeeks.findIndex((w:any) => d >= w.start && d <= w.end);
        const shiftName = wIndex >= 0 ? rotations[wIndex][group] : "";
        row[dateStr] = shiftName || "-";
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Plotting_Shift_${selectedDivision}`);
    XLSX.writeFile(workbook, `Plotting_Shift_${selectedDivision}_${activePeriod.label}.xlsx`);
  };

  return (
    <Card className="glass-panel border-none shadow-lg text-white mt-6">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-emerald-400" />
          Plotting Shift Mingguan (Excel Generator)
        </CardTitle>
        <CardDescription className="text-white/60">
          Kelompokkan karyawan menjadi 2 atau 3 grup, lalu tentukan rotasi shift setiap minggunya untuk diexport ke Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* CONFIGURATION BAR */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <Label className="text-white/70">Periode</Label>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="field-input">
                <SelectValue placeholder="Pilih Periode" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((p: any) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 space-y-2">
            <Label className="text-white/70">Divisi / Bagian</Label>
            <Select value={selectedDivision} onValueChange={setSelectedDivision}>
              <SelectTrigger className="field-input">
                <SelectValue placeholder="Pilih Divisi" />
              </SelectTrigger>
              <SelectContent>
                {divisions?.map((d: any) => (
                  <SelectItem key={d.name} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-2">
            <Label className="text-white/70">Jumlah Grup</Label>
            <Select value={numGroups} onValueChange={(v:any) => setNumGroups(v)}>
              <SelectTrigger className="field-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={"2"}>2 Grup (A & B)</SelectItem>
                <SelectItem value={"3"}>3 Grup (A, B, & C)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ROTATION MATRIX */}
        <div className="space-y-4">
          <h3 className="font-bold text-white/80 border-b border-white/10 pb-2">Rotasi Shift Setiap Minggu</h3>
          <div className="grid gap-2 overflow-x-auto custom-scrollbar">
             <Table>
                <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-white/40">Minggu (Tanggal)</TableHead>
                        <TableHead className="text-center text-rose-400 font-bold min-w-[120px]">Grup A</TableHead>
                        <TableHead className="text-center text-blue-400 font-bold min-w-[120px]">Grup B</TableHead>
                        {numGroups === "3" && <TableHead className="text-center text-emerald-400 font-bold min-w-[120px]">Grup C</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {calendarWeeks.map((week, idx) => (
                        <TableRow key={idx} className="border-white/10 bg-white/5">
                            <TableCell className="font-mono text-xs text-white/80 whitespace-nowrap">
                                Minggu {idx + 1} <br/>
                                <span className="text-[10px] text-white/40">({format(week.start, "dd MMM")} - {format(week.end, "dd MMM")})</span>
                            </TableCell>
                            <TableCell>
                                <Select value={rotations[idx]?.A || ""} onValueChange={(v) => handleRotChange(idx, "A", v)}>
                                    <SelectTrigger className="h-8 text-xs bg-black/40 border-none field-input"><SelectValue placeholder="Pilih Shift"/></SelectTrigger>
                                    <SelectContent>
                                        {shifts.map((s:any) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell>
                                <Select value={rotations[idx]?.B || ""} onValueChange={(v) => handleRotChange(idx, "B", v)}>
                                    <SelectTrigger className="h-8 text-xs bg-black/40 border-none field-input"><SelectValue placeholder="Pilih Shift"/></SelectTrigger>
                                    <SelectContent>
                                        {shifts.map((s:any) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            {numGroups === "3" && (
                            <TableCell>
                                <Select value={rotations[idx]?.C || ""} onValueChange={(v) => handleRotChange(idx, "C", v)}>
                                    <SelectTrigger className="h-8 text-xs bg-black/40 border-none field-input"><SelectValue placeholder="Pilih Shift"/></SelectTrigger>
                                    <SelectContent>
                                        {shifts.map((s:any) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
             </Table>
          </div>
        </div>

        {/* EMPLOYEE ASSIGNMENTS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h3 className="font-bold text-white/80">Pembagian Grup Karyawan ({filteredEmployees.length} orang)</h3>
            <Button onClick={generateExcel} className="h-8 gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Download className="w-4 h-4"/> Download Excel
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* GROUP A */}
            <div className="flex flex-col p-4 rounded-xl bg-black/20 border border-white/5 space-y-3">
               <h4 className="font-bold text-rose-400">Grup A</h4>
               <Input 
                   placeholder="Ketik Nama / No Absen lalu Enter" 
                   className="field-input h-9 text-xs"
                   value={inputA}
                   onChange={e => setInputA(e.target.value)}
                   onKeyDown={e => {
                       if(e.key === "Enter") handleAddMember("A", inputA);
                   }}
               />
               <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                 {filteredEmployees.filter((e: any) => employeeGroup[e.id] === "A").map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between bg-black/40 rounded px-2 py-1 border border-white/5">
                        <span className="text-xs text-white/80">{e.name} <span className="text-white/40">({e.pin})</span></span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => handleRemoveMember(e.id)}>
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                 ))}
                 {filteredEmployees.filter((e: any) => employeeGroup[e.id] === "A").length === 0 && (
                     <div className="text-xs text-white/40 italic py-2 text-center">Belum ada karyawan</div>
                 )}
               </div>
            </div>

            {/* GROUP B */}
            <div className="flex flex-col p-4 rounded-xl bg-black/20 border border-white/5 space-y-3">
               <h4 className="font-bold text-blue-400">Grup B</h4>
               <Input 
                   placeholder="Ketik Nama / No Absen lalu Enter" 
                   className="field-input h-9 text-xs"
                   value={inputB}
                   onChange={e => setInputB(e.target.value)}
                   onKeyDown={e => {
                       if(e.key === "Enter") handleAddMember("B", inputB);
                   }}
               />
               <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                 {filteredEmployees.filter((e: any) => employeeGroup[e.id] === "B").map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between bg-black/40 rounded px-2 py-1 border border-white/5">
                        <span className="text-xs text-white/80">{e.name} <span className="text-white/40">({e.pin})</span></span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => handleRemoveMember(e.id)}>
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                 ))}
                 {filteredEmployees.filter((e: any) => employeeGroup[e.id] === "B").length === 0 && (
                     <div className="text-xs text-white/40 italic py-2 text-center">Belum ada karyawan</div>
                 )}
               </div>
            </div>

            {/* GROUP C */}
            {numGroups === "3" && (
                <div className="flex flex-col p-4 rounded-xl bg-black/20 border border-white/5 space-y-3">
                   <h4 className="font-bold text-emerald-400">Grup C</h4>
                   <Input 
                       placeholder="Ketik Nama / No Absen lalu Enter" 
                       className="field-input h-9 text-xs"
                       value={inputC}
                       onChange={e => setInputC(e.target.value)}
                       onKeyDown={e => {
                           if(e.key === "Enter") handleAddMember("C", inputC);
                       }}
                   />
                   <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                     {filteredEmployees.filter((e: any) => employeeGroup[e.id] === "C").map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between bg-black/40 rounded px-2 py-1 border border-white/5">
                            <span className="text-xs text-white/80">{e.name} <span className="text-white/40">({e.pin})</span></span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => handleRemoveMember(e.id)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                     ))}
                     {filteredEmployees.filter((e: any) => employeeGroup[e.id] === "C").length === 0 && (
                         <div className="text-xs text-white/40 italic py-2 text-center">Belum ada karyawan</div>
                     )}
                   </div>
                </div>
            )}
            
            {/* UNASSIGNED EMPLOYEES */}
            <div className={`flex flex-col p-4 rounded-xl border border-dashed border-white/10 space-y-3 ${numGroups === "2" ? "md:col-span-3" : "md:col-span-3"} mt-4`}>
                <h4 className="font-bold text-white/60">Belum Terbagi ({unassignedEmployees.length} orang)</h4>
                <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {unassignedEmployees.length === 0 ? (
                        <div className="text-xs text-white/30 italic">Semua karyawan sudah terbagi.</div>
                    ) : unassignedEmployees.map((e: any) => (
                         <div key={e.id} className="text-xs bg-white/5 text-white/70 px-2 py-1 rounded">
                             {e.name} <span className="text-white/40">({e.pin})</span>
                         </div>
                    ))}
                </div>
            </div>

          </div>
        </div>
      </CardContent>
    </Card>
  );
}
