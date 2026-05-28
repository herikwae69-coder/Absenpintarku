import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add bookingReason state and showAutocomplete
const targetState = `  const [bookingUser, setBookingUser] = useState("");
  const [bookingUserName, setBookingUserName] = useState("");
  const [bookingDates, setBookingDates] = useState<string[]>([""]);
  const [selectedBookingPeriod, setSelectedBookingPeriod] = useState(selectedPeriod);`;

const newState = `  const [bookingUser, setBookingUser] = useState("");
  const [bookingUserName, setBookingUserName] = useState("");
  const [bookingDates, setBookingDates] = useState<string[]>([""]);
  const [selectedBookingPeriod, setSelectedBookingPeriod] = useState(selectedPeriod);
  const [bookingReason, setBookingReason] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  
  const filteredEmployees = React.useMemo(() => {
    if (bookingUserName.length < 3 || !showAutocomplete) return [];
    return employees.filter(e => e.name.toLowerCase().includes(bookingUserName.toLowerCase()) || e.pin.includes(bookingUserName));
  }, [bookingUserName, employees, showAutocomplete]);
`;

content = content.replace(targetState, newState);

// 2. Fix Period Select and Add Alasan Input
const targetForm = `            <div className="space-y-2">
               <Label className="text-xs uppercase font-bold text-white/50">Pilih Periode</Label>
               <Select value={selectedBookingPeriod} onValueChange={(val) => {
                  setSelectedBookingPeriod(val);
                  const p = periodOptions.find(o => o.value === val);
                  const maxDays = p?.maxDaysPerRequest || 6;
                  setBookingDates(Array(Math.max(1, maxDays)).fill(""));
               }}>
                 <SelectTrigger className="field-input h-10 w-full">
                   <SelectValue placeholder="Pilih Periode..." />
                 </SelectTrigger>
                 <SelectContent className="glass-panel border-white/20 text-white max-h-64">
                   {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                 </SelectContent>
               </Select>
            </div>
            
            <div className="space-y-2 relative">
              <Label className="text-xs uppercase font-bold text-white/50">Pilih Karyawan</Label>
              <Input 
                value={bookingUserName} 
                onChange={(e) => {
                    setBookingUserName(e.target.value);
                    if(e.target.value === "") setBookingUser("");
                }}
                placeholder="Ketik 3 huruf nama/pin karyawan..."
                className="field-input h-10 w-full"
              />
              {bookingUserName.length >= 3 && filteredEmployees.length > 0 && (
                <div className="absolute z-50 w-full mt-1 glass-panel border border-white/20 rounded-xl overflow-y-auto max-h-60 shadow-xl">
                  {filteredEmployees.map(e => (
                    <button
                      key={e.id}
                      className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10"
                      onClick={() => {
                        setBookingUser(e.id);
                        setBookingUserName(e.name);
                      }}
                    >
                      {e.name} - {e.division || 'Depan'}
                    </button>
                  ))}
                </div>
              )}
            </div>`;

const newForm = `            <div className="space-y-2">
               <Label className="text-xs uppercase font-bold text-white/50">Pilih Periode</Label>
               <Select value={selectedBookingPeriod} onValueChange={(val) => {
                  setSelectedBookingPeriod(val);
                  const p = periodOptions.find(o => o.value === val);
                  const maxDays = p?.maxDaysPerRequest || 6;
                  setBookingDates(Array(Math.max(1, maxDays)).fill(""));
               }}>
                 <SelectTrigger className="field-input h-10 w-full">
                   <SelectValue placeholder="Pilih Periode">
                    {periodOptions.find((p) => p.value === selectedBookingPeriod)?.label || "Pilih Periode"}
                   </SelectValue>
                 </SelectTrigger>
                 <SelectContent className="glass-panel border-white/20 text-white max-h-64">
                   {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                 </SelectContent>
               </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-white/50">Alasan</Label>
              <Input value={bookingReason} onChange={(e) => setBookingReason(e.target.value)} className="field-input h-10 w-full" placeholder="Masukkan alasan..." />
            </div>

            <div className="space-y-2 relative">
              <Label className="text-xs uppercase font-bold text-white/50">Pilih Karyawan</Label>
              <Input 
                value={bookingUserName} 
                onChange={(e) => {
                    setBookingUserName(e.target.value);
                    setShowAutocomplete(true);
                    if(e.target.value === "") setBookingUser("");
                }}
                placeholder="Ketik 3 huruf nama/pin karyawan..."
                className="field-input h-10 w-full"
              />
              {filteredEmployees.length > 0 && (
                <div className="absolute z-50 w-full mt-1 glass-panel border border-white/20 rounded-xl overflow-y-auto max-h-60 shadow-xl">
                  {filteredEmployees.map(e => (
                    <button
                      key={e.id}
                      className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10"
                      onClick={() => {
                        setBookingUser(e.id);
                        setBookingUserName(e.name);
                        setShowAutocomplete(false);
                      }}
                    >
                      {e.name} - {e.division || 'Depan'}
                    </button>
                  ))}
                </div>
              )}
            </div>`;

content = content.replace(targetForm, newForm);

// 3. Update Save handler to save bookingReason
const targetSave = `const docId = \`\${emp.id}_\${selectedBookingPeriod}\`;
                     let payload: any = {};
                     
                     // Read existing
                     const existingReq = requests.find(r => r.id === docId); 
                     
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
                           period: selectedBookingPeriod,
                           status: "approved", 
                           dates: dates,
                           lockedDates: dates,
                           originalDates: [...dates],
                           reason: "Khusus/Penting (Dilock Admin)",
                           sectionId: "",
                           createdAt: serverTimestamp(),
                        };
                        dates.forEach((d, i) => { payload[\`date\${i+1}\`] = d; });
                     }`;

const newSave = `const docId = \`\${emp.id}_\${selectedBookingPeriod}\`;
                     let payload: any = {};
                     
                     // Read existing
                     const existingReq = requests.find(r => r.id === docId); 
                     
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
                           period: selectedBookingPeriod,
                           status: "approved", 
                           dates: dates,
                           lockedDates: dates,
                           originalDates: [...dates],
                           reason: bookingReason || "Khusus/Penting (Dilock Admin)",
                           sectionId: "",
                           createdAt: serverTimestamp(),
                        };
                        dates.forEach((d, i) => { payload[\`date\${i+1}\`] = d; });
                     }`;

content = content.replace(targetSave, newSave);

fs.writeFileSync('src/App.tsx', content);
