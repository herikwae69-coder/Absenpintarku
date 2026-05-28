import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `  const [showNotRequested, setShowNotRequested] = useState(false);`;
const replacement1 = `  const [showNotRequested, setShowNotRequested] = useState(false);
  const [showNoChances, setShowNoChances] = useState(false);
  const [noChancesUsers, setNoChancesUsers] = useState<Employee[]>([]);

  const loadNoChancesUsers = () => {
    const users = employees.filter(e => {
      const v = localStorage.getItem(\`leave_view_limit_\${e.id}_\${selectedPeriod}\`);
      return v === "0";
    });
    setNoChancesUsers(users);
    setShowNoChances(true);
  };

  const addChance = (employeeId: string) => {
    const limitKey = \`leave_view_limit_\${employeeId}_\${selectedPeriod}\`;
    const v = localStorage.getItem(limitKey);
    const current = v ? parseInt(v) : 0;
    localStorage.setItem(limitKey, (current + 1).toString());
    
    const users = employees.filter(e => {
      if (e.id === employeeId) return false; // since we just added 1, it's not 0 anymore
      const v = localStorage.getItem(\`leave_view_limit_\${e.id}_\${selectedPeriod}\`);
      return v === "0";
    });
    setNoChancesUsers(users);
  };`;

content = content.replace(target1, replacement1);

const target2 = `            <Button
              onClick={handleExport}`;
const replacement2 = `            <Button
              onClick={loadNoChancesUsers}
              variant="outline"
              className="flex gap-2 glass-panel border-white/10 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all h-11 px-6 rounded-xl font-bold font-xs"
            >
              <AlertCircle className="w-4 h-4" /> Habis Kesempatan
            </Button>
            <Button
              onClick={handleExport}`;

content = content.replace(target2, replacement2);

const target3 = `            <CardDescription className="text-white/50">
              Daftar karyawan {selectedDivision} yang sudah mengajukan libur.
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 mt-4 sm:mt-0 w-full sm:w-auto">`;

const replacement3 = `            <CardDescription className="text-white/50">
              Daftar karyawan {selectedDivision} yang sudah mengajukan libur.
            </CardDescription>
          </div>
          <div className="flex flex-row flex-wrap gap-2 sm:gap-4 mt-4 sm:mt-0 w-full sm:w-auto justify-end">`;

content = content.replace(target3, replacement3);

const target4 = `      <div className="flex justify-center mb-2 overflow-x-auto no-scrollbar">`;
const replacement4 = `      <Dialog open={showNoChances} onOpenChange={setShowNoChances}>
        <DialogContent className="glass-panel border-white/10 text-white max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Karyawan Habis Kesempatan
            </DialogTitle>
            <DialogDescription className="text-white/50">
              Karyawan yang sudah menggunakan 3x kesempatan melihat menu pada periode {periodOptions.find((p) => p.value === selectedPeriod)?.label || selectedPeriod}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {noChancesUsers.length === 0 ? (
              <p className="text-white/40 italic text-center py-4">Tidak ada karyawan yang kehabisan kesempatan.</p>
            ) : (
              noChancesUsers.map(e => (
                <div key={e.id} className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5">
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">{e.name}</span>
                    <span className="text-xs text-white/40">Divisi {e.division || 'Depan'}</span>
                  </div>
                  <Button onClick={() => addChance(e.id)} size="sm" className="bg-blue-500 hover:bg-blue-600 text-white font-bold h-8 text-xs">
                    +1 Kesempatan
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex justify-center mb-2 overflow-x-auto no-scrollbar">`;

content = content.replace(target4, replacement4);

fs.writeFileSync('src/App.tsx', content);
