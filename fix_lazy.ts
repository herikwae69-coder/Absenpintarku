import * as fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

const components = [
  "AdminBonusMaster",
  "AdminBonusEstafet",
  "AdminBonusJagaDepan",
  "AdminBonusLainLain",
  "AdminBonusLainLainCombined",
  "AdminBonusOperator",
  "AdminBonusNota",
  "AdminBonusBerat",
  "AdminKoreksiGaji",
  "AdminKoreksiGajiMinus"
];

for (const comp of components) {
  let startIdx = code.indexOf(`function ${comp}(`);
  if (startIdx === -1) continue;
  
  let endIdx = code.indexOf(`function Admin`, startIdx + 50);
  if (endIdx === -1) endIdx = code.indexOf(`function Potongan`, startIdx + 50);
  if (endIdx === -1) endIdx = code.length;

  let compCode = code.substring(startIdx, endIdx);

  // 1. Rename Button "Isi/Edit Data" or "Isi/Edit Nota Tertinggi" to "Lihat Tabel"
  compCode = compCode.replace(/>\s*Isi\/Edit Data\s*<\/Button>/g, '>Lihat Tabel</Button>');
  compCode = compCode.replace(/>\s*Isi\/Edit Nota Tertinggi\s*<\/Button>/g, '>Lihat Tabel</Button>');

  // 2. Add isEditingData gate to useEffect that fetches data
  let match = compCode.match(/useEffect\(\(\) => \{\n\s*let componentMounted = true;\n\s*if \(!selectedPeriod\) return;\n\s*setLoading\(true\);/);
  
  if (match) {
    compCode = compCode.replace(
      /useEffect\(\(\) => \{\n\s*let componentMounted = true;\n\s*if \(!selectedPeriod\) return;\n\s*setLoading\(true\);/g,
      `useEffect(() => {\n    let componentMounted = true;\n    if (!selectedPeriod) return;\n    if (!isEditingData) return;\n    setLoading(true);`
    );
    // Be careful to only replace the dependency array for the fetch block! 
    // In our case, the fetch block ends with `}, [selectedPeriod]);`.
    // Wait, let's use a more precise replace to avoid messing up other useEffects.
    compCode = compCode.replace(/\n\s*\}\n\s*\}, \[selectedPeriod\]\);/g, `\n    }\n  }, [selectedPeriod, isEditingData]);`);
  } else {
    console.log(`Could not find standard useEffect in ${comp}`);
    
    // For AdminBonusLainLainCombined:
    if (comp === "AdminBonusLainLainCombined") {
      compCode = compCode.replace(
        /useEffect\(\(\) => \{\n\s*if \(!selectedPeriod\) return;\n\s*setLoading\(true\);/,
        `useEffect(() => {\n    if (!selectedPeriod) return;\n    if (!isEditingData) return;\n    setLoading(true);`
      );
      compCode = compCode.replace(/\n\s*\}\n\s*\}, \[selectedPeriod\]\);/g, `\n    }\n  }, [selectedPeriod, isEditingData]);`);
    }
  }

  code = code.substring(0, startIdx) + compCode + code.substring(endIdx);
}

fs.writeFileSync('src/App.tsx', code);
console.log('Lazy load script finished');
