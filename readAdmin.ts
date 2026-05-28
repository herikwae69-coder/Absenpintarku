import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const startIndex = content.indexOf('function AdminLeave({');
const returnIndex = content.indexOf('return (', startIndex + 4000);
const substring = content.substring(returnIndex + 2000, returnIndex + 4000);
console.log(substring);
