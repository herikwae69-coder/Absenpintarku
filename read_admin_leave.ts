import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const i1 = content.indexOf('function AdminLeave({');
const substr = content.substring(i1);
const i2 = substr.indexOf('handleDeleteAll');
console.log(substr.substring(i2 - 1500, i2 + 1000));
