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

comps.forEach(comp => {
  const compStart = content.indexOf('function ' + comp + '(');
  if (compStart === -1) return;
  
  const fallbackStart = content.indexOf('if (periodOptions.length === 0) {', compStart);
  if (fallbackStart === -1 || fallbackStart > compStart + 3000) return;
  
  const fallbackEnd = content.indexOf(');\n  }', fallbackStart);
  if (fallbackEnd === -1) return;
  
  const actualFallbackEnd = fallbackEnd + 6;
  
  const fallbackCode = content.substring(fallbackStart, actualFallbackEnd);
  content = content.substring(0, fallbackStart) + content.substring(actualFallbackEnd);
  
  // Find where to inject it properly
  // For most, we can inject it right before `return (` of the main rendering.
  let returnPoint = content.indexOf('\n  return (', compStart);
  if (returnPoint === -1) return;
  
  // Wait, if there's an early return like `if (!currentPeriod) return null;`, we MUST inject it BEFORE that.
  let earlyReturnPoint = content.indexOf('if (!currentPeriod) return null;', compStart);
  let injectionPoint = returnPoint;
  
  if (earlyReturnPoint !== -1 && earlyReturnPoint < returnPoint) {
      injectionPoint = earlyReturnPoint;
  }
  
  content = content.substring(0, injectionPoint) + fallbackCode + '\n  ' + content.substring(injectionPoint);
  console.log('FIXED', comp);
});

fs.writeFileSync('src/App.tsx', content);
