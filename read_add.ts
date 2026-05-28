import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const i1 = content.indexOf('const handleAdd = async');
const substring = content.substring(i1 - 500, i1 + 1500);
console.log(substring);
