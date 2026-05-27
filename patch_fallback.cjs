const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const comps = [
  'AdminBonusEstafet',
  'AdminBonusMaster',
  'AdminBonusJagaDepan',
  'AdminBonusLainLain',
  'AdminBonusLainLainCombined',
  'AdminBonusOperator',
  'AdminBonusNota',
  'AdminBonusBerat',
  'AdminKoreksiGaji',
  'AdminKoreksiGajiMinus',
  'AdminJadwalLibur',
];

const fallbackUI = `

  if (periodOptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass-panel border-white/5 rounded-3xl mt-8">
        <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-4">
          <CalendarIcon className="w-8 h-8 text-rose-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-widest text-center">TIDAK ADA PERIODE AKTIF</h3>
        <p className="text-white/50 text-center max-w-md">
          Belum ada periode yang berstatus "BUKA". Silakan buat atau aktifkan periode melalui menu <b className="text-white">Master &rarr; Manajemen Periode</b>.
        </p>
      </div>
    );
  }
`;

comps.forEach(comp => {
  const compStart = content.indexOf('function ' + comp + '(');
  if (compStart === -1) return;
  
  const currentPeriodDecl = 'const currentPeriod = periodOptions.find((p) => p.value === selectedPeriod);';
  const declIndex = content.indexOf(currentPeriodDecl, compStart);
  
  if (declIndex !== -1 && declIndex < compStart + 2500) {
    // Only insert if we haven't already
    if (!content.substring(declIndex, declIndex + 1000).includes('TIDAK ADA PERIODE AKTIF')) {
      content = content.substring(0, declIndex + currentPeriodDecl.length) + fallbackUI + content.substring(declIndex + currentPeriodDecl.length);
      console.log('PATCHED', comp);
    }
  }
});

// Also remove `if (!currentPeriod) return null;` just in case to give a better fallback if length > 0
// Wait, no, if it's there it's because there are periods but selectedPeriod is bad (which shouldn't happen, but returning null avoids crash). So keep it.

fs.writeFileSync('src/App.tsx', content);
