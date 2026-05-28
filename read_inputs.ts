import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const i1 = content.indexOf('formData.dates.map((d: string, index: number) => (');
if (i1 !== -1) {
  console.log(content.substring(i1 - 200, i1 + 1000));
} else {
  console.log("not found");
}
