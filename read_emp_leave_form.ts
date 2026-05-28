import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const i1 = content.indexOf('function EmployeeLeave({');
const substr = content.substring(i1);
const i2 = substr.indexOf('formData.dates.map((d, index) => (');
console.log(substr.substring(i2 - 200, i2 + 1500));
