import * as fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. AdminBonusLainLainCombined UI fix
let compIdx = code.indexOf('function AdminBonusLainLainCombined(');
let buttonGroup = code.indexOf('<Download className="w-4 h-4 mr-2" /> Excel\n          </Button>', compIdx);
if (buttonGroup !== -1) {
  let endBtn = buttonGroup + '<Download className="w-4 h-4 mr-2" /> Excel\n          </Button>'.length;
  let newHtml = `
          {!isEditingData ? (
            <Button
              onClick={() => setIsEditingData(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 px-6 rounded-xl"
            >
              Lihat Tabel
            </Button>
          ) : (
            <Button
              onClick={() => setIsEditingData(false)}
              variant="outline"
              className="bg-transparent border-white/20 hover:bg-white/5 text-white font-bold h-12 px-6 rounded-xl"
            >
              Sembunyikan Tabel
            </Button>
          )}`
  code = code.substring(0, endBtn) + newHtml + code.substring(endBtn);
}

// Hide the table in combined
let combinedTableIdx = code.indexOf('<Card className="glass-panel border-none bg-black/40">', compIdx);
let combinedEnd = code.indexOf('</div>\n  );\n}', compIdx);
if (combinedTableIdx !== -1 && combinedEnd !== -1) {
    let oldTable = code.substring(combinedTableIdx, combinedEnd);
    if (!oldTable.includes('{isEditingData && (')) {
        let newTable = `{isEditingData && (\n      ` + oldTable.trim() + `\n      )}`;
        code = code.substring(0, combinedTableIdx) + newTable + '\n    ' + code.substring(combinedEnd);
    }
}

// 2. AdminBonusOperator data fetch delay
let opIdx = code.indexOf('function AdminBonusOperator(');
let opFetch = code.substring(opIdx, code.indexOf('const handleAddOrUpdate = ()', opIdx));

if (!opFetch.includes('if (!isEditingData) return;')) {
  let newOpFetch = opFetch.replace(
      /useEffect\(\(\) => \{\n\s*if \(!selectedPeriod\) return;\n\s*setLoading\(true\);/,
      `useEffect(() => {\n    if (!selectedPeriod) return;\n    if (!isEditingData) return;\n    setLoading(true);`
  );
  newOpFetch = newOpFetch.replace(
      /\}, \[selectedPeriod\]\);/g, 
      `}, [selectedPeriod, isEditingData]);`
  );
  code = code.substring(0, opIdx) + newOpFetch + code.substring(opIdx + opFetch.length);
}


fs.writeFileSync('src/App.tsx', code);
console.log('Fixed LainLainCombined and Operator');
