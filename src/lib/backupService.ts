import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

export const generateBackupZip = async (startDate: Date, endDate: Date) => {
  // 1. Fetch Data
  const [snapAttendance, snapManual, snapLeaves, snapQuotas, snapPeriods] = await Promise.all([
    getDocs(collection(db, 'attendance')),
    getDocs(collection(db, 'manualAttendance')),
    getDocs(collection(db, 'leaveRequests')),
    getDocs(collection(db, 'periodQuotas')),
    getDocs(collection(db, 'periodControls'))
  ]);

  const attendanceData = snapAttendance.docs.map(doc => doc.data());
  const manualData = snapManual.docs.map(doc => doc.data());
  const leaveData = snapLeaves.docs.map(doc => doc.data());
  const quotaData = snapQuotas.docs.map(doc => doc.data());
  const periodData = snapPeriods.docs.map(doc => ({ ...doc.data(), id: doc.id }));

  // Helper to filter data by period in range
  const getPeriodForDate = (date: string) => {
    return periodData.find(p => p.startDate && p.endDate && 
      isWithinInterval(parseISO(date), { start: parseISO(p.startDate), end: parseISO(p.endDate) })
    );
  };

  const getPeriodsInRange = () => {
    return periodData.filter(p => p.startDate && p.endDate && (
        isWithinInterval(parseISO(p.startDate), { start: startDate, end: endDate }) ||
        isWithinInterval(parseISO(p.endDate), { start: startDate, end: endDate }) ||
        (parseISO(p.startDate) <= startDate && parseISO(p.endDate) >= endDate)
    ));
  };
  
  const relevantPeriods = getPeriodsInRange();
  
  // Create Zip
  const zip = new JSZip();

  // Excel 1: Live Absensi
  const wbLive = XLSX.utils.book_new();
  relevantPeriods.sort((a,b) => a.id.localeCompare(b.id)).forEach(p => {
    const data = attendanceData.filter(a => isWithinInterval(parseISO(a.date), { start: parseISO(p.startDate), end: parseISO(p.endDate) }));
    if(data.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wbLive, ws, p.id.substring(0, 31));
    }
  });
  if(wbLive.SheetNames.length === 0) XLSX.utils.book_append_sheet(wbLive, XLSX.utils.aoa_to_sheet([["Data Kosong"]]), "Info");
  zip.file('live_absensi.xlsx', XLSX.write(wbLive, { type: 'array', bookType: 'xlsx' }));

  // Excel 2: Manual Absensi (incl H)
  const wbManual = XLSX.utils.book_new();
  relevantPeriods.sort((a,b) => a.id.localeCompare(b.id)).forEach(p => {
    const data = manualData.filter(a => isWithinInterval(parseISO(a.date), { start: parseISO(p.startDate), end: parseISO(p.endDate) }));
    if(data.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wbManual, ws, p.id.substring(0, 31));
    }
  });
  if(wbManual.SheetNames.length === 0) XLSX.utils.book_append_sheet(wbManual, XLSX.utils.aoa_to_sheet([["Data Kosong"]]), "Info");
  zip.file('absensi_manual.xlsx', XLSX.write(wbManual, { type: 'array', bookType: 'xlsx' }));

  // Excel 3: Request Libur & Kuota
  const wbLeave = XLSX.utils.book_new();
  relevantPeriods.sort((a,b) => a.id.localeCompare(b.id)).forEach(p => {
    const periodLeaves = leaveData.filter(l => l.period === p.id);
    const rows = periodLeaves.map(l => {
      const qDoc = quotaData.find(q => q.employeeId === l.employeeId && q.period === p.id);
      const usedRequests = leaveData.filter(lr => lr.period === p.id && lr.employeeId === l.employeeId && (lr.status === 'approved' || lr.status === 'pending'));
      const uniqueDates = new Set<string>();
      usedRequests.forEach(ur => {
         const dArr = ur.dates || [ur.date1, ur.date2, ur.date3, ur.date4, ur.date5, ur.date6];
         dArr.forEach(d => { if(d) uniqueDates.add(d); });
      });
      const used = uniqueDates.size;
      const total = qDoc?.quota ?? 4; 
      
      return {
        nama: l.employeeName,
        no_absen: l.employeeId,
        tgl_request: l.dates?.join(', ') || '',
        total_kouta: total,
        dipakai: used,
        sisa: total - used
      };
    });
    
    if(rows.length > 0) {
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wbLeave, ws, p.id.substring(0, 31));
    }
  });
  if(wbLeave.SheetNames.length === 0) XLSX.utils.book_append_sheet(wbLeave, XLSX.utils.aoa_to_sheet([["Data Kosong"]]), "Info");
  zip.file('requests_libur.xlsx', XLSX.write(wbLeave, { type: 'array', bookType: 'xlsx' }));

  // Download
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_${format(startDate, 'yyyy-MM-dd')}_${format(endDate, 'yyyy-MM-dd')}.zip`;
  a.click();
  URL.revokeObjectURL(url);
};
