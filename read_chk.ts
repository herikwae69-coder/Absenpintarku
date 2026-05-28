import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const i1 = content.indexOf('currentRequests');
const substring = content.substring(i1 - 500, i1 + 1000);
console.log(substring);
