import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `  const [showNoChances, setShowNoChances] = useState(false);`;
const rep1 = `  const [showNoChances, setShowNoChances] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingUser, setBookingUser] = useState("");
  const [bookingDates, setBookingDates] = useState<string[]>([""]);
`;

content = content.replace(target1, rep1);

const target2 = `            <Button
              onClick={loadNoChancesUsers}`;
const rep2 = `            <Button
              onClick={() => setShowBooking(true)}
              variant="outline"
              className="flex gap-2 glass-panel border-white/10 text-white hover:bg-white/10 shadow-lg h-11 px-6 rounded-xl font-bold"
            >
              <CalendarIcon className="w-4 h-4 text-emerald-400" /> Lock Tanggal (Pesanan)
            </Button>
            <Button
              onClick={loadNoChancesUsers}`;

content = content.replace(target2, rep2);


const target3 = `        <DialogContent className="glass-panel border-white/10 text-white max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Karyawan Habis Kesempatan`;

const rep3 = `        <DialogContent className="glass-panel border-white/10 text-white max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" /> Lock Tanggal Karyawan
            </DialogTitle>
            <DialogDescription className="text-white/50">
              Pesan tanggal libur karyawan sebelum periode dibuka. Tanggal ini tidak bisa diubah oleh karyawan dan akan langsung mengurangi kuota harian divisi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-white/50">Pilih Karyawan</Label>
              <Select value={bookingUser} onValueChange={setBookingUser}>
                <SelectTrigger className="field-input h-10 w-full">
                  <SelectValue placeholder="Pilih Karyawan..." />
                </SelectTrigger>
                <SelectContent className="glass-panel border-white/20 text-white max-h-64">
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id} className="hover:bg-white/10">{e.name} - Div: {e.division || 'Depan'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-white/50">Tanggal Yang Dilock</Label>
              <div className="grid grid-cols-2 gap-2">
                {bookingDates.map((d, i) => (
                  <div key={i} className="flex gap-1">
                    <Input 
                      type="date"
                      value={d}
                      className="field-input text-xs h-9 flex-1"
                      onChange={(e) => {
                        const newD = [...bookingDates];
                        newD[i] = e.target.value;
                        setBookingDates(newD);
                      }}
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="h-9 w-9 text-rose-400 hover:bg-rose-500/20"
                      onClick={() => {
                        const newD = [...bookingDates];
                        newD.splice(i, 1);
                        if (newD.length === 0) newD.push("");
                        setBookingDates(newD);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setBookingDates([...bookingDates, ""])}
                className="w-full mt-2 border-dashed border-white/20 text-white/50 hover:bg-white/5 hover:text-white"
              >
                + Tambah Tanggal
              </Button>
            </div>
          </div>
          <DialogFooter className="mt-4">
               <Button onClick={async () => {
                   if (!bookingUser) return alert("Pilih Karyawan!");
                   const dates = bookingDates.filter(Boolean);
                   if (dates.length === 0) return alert("Pilih minimal 1 tanggal!");
                   
                   const emp = employees.find(e => e.id === bookingUser);
                   if (!emp) return;
                   
                   try {
                     const docId = \`\${emp.id}_\${selectedPeriod}\`;
                     let payload: any = {};
                     
                     // Read existing first to merge carefully (quota uses leaveRequests)
                     const existingReq = requests.find(r => r.id === docId); // if in same division
                     
                     // We just update specific fields via setDoc merge
                     // but dates array must be exact if new.
                     if (existingReq) {
                        const exDates = existingReq.dates || [];
                        const mergedLocked = Array.from(new Set([...(existingReq.lockedDates || []), ...dates]));
                        const mergedDates = Array.from(new Set([...exDates, ...dates]));
                        
                        payload = {
                           dates: mergedDates,
                           lockedDates: mergedLocked,
                        };
                        mergedDates.forEach((d, i) => { payload[\`date\${i+1}\`] = d; });
                     } else {
                        payload = {
                           employeeId: emp.id,
                           employeeName: emp.name,
                           division: emp.division || "Depan",
                           period: selectedPeriod,
                           status: "approved", 
                           dates: dates,
                           lockedDates: dates,
                           originalDates: [...dates],
                           reason: "Khusus/Penting (Dilock Admin)",
                           sectionId: "",
                           createdAt: serverTimestamp(),
                        };
                        dates.forEach((d, i) => { payload[\`date\${i+1}\`] = d; });
                     }
                     
                     await setDoc(doc(db, "leaveRequests", docId), payload, { merge: true });
                     alert("Tanggal berhasil dilock untuk karyawan ini!", "success");
                     setShowBooking(false);
                     setBookingUser("");
                     setBookingDates([""]);
                   } catch(err: any) {
                     alert("Error: " + err.message);
                   }
               }} className="bg-emerald-600 hover:bg-emerald-500 font-bold w-full">
                  SIMPAN PESANAN LIBUR
               </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showNoChances} onOpenChange={setShowNoChances}>
        <DialogContent className="glass-panel border-white/10 text-white max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Karyawan Habis Kesempatan`;

content = content.replace(target3, rep3);


fs.writeFileSync('src/App.tsx', content);

