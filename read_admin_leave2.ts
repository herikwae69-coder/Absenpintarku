import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const i1 = content.indexOf('function AdminLeave({');
const substr = content.substring(i1);
const i2 = substr.indexOf('<CardHeader');
console.log(substr.substring(i2, i2 + 2000));
