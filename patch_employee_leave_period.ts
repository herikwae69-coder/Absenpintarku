import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add Dialog to App.tsx for LiburPeriodManager
const targetInsert = `
  const [showMusicPopup, setShowMusicPopup] = useState(false);
  const [musicPopupText, setMusicPopupText] = useState(
    "Silakan ajukan request libur Anda.",
  );
  const [requestKata, setRequestKata] = useState("");
`;

const newInsert = `
  const [showMusicPopup, setShowMusicPopup] = useState(false);
  const [musicPopupText, setMusicPopupText] = useState(
    "Silakan ajukan request libur Anda.",
  );
  const [requestKata, setRequestKata] = useState("");
  const [showPeriodManager, setShowPeriodManager] = useState(false);
`;

content = content.replace(targetInsert, newInsert);

// Add Dialog and Button inside EmployeeLeave
const targetUI = `
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Request Libur</h2>
`;

const newUI = `
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Request Libur</h2>
        <Button variant="outline" size="sm" onClick={() => setShowPeriodManager(true)}>Kelola Periode Libur</Button>
      </div>
      
      <Dialog open={showPeriodManager} onOpenChange={setShowPeriodManager}>
        <DialogContent className="glass-panel border-white/10 text-white max-h-[80vh] overflow-y-auto">
            <LiburPeriodManager />
        </DialogContent>
      </Dialog>
`;

// This replacement needs to be more specific as the structure varies.
// Let me look more closely at EmployeeLeave render.

fs.writeFileSync('src/App.tsx', content);
