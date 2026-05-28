import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const match = content.match(/type\s+Employee[\s\S]*?\}|interface\s+Employee[\s\S]*?\}/);
console.log(match ? match[0] : "Not found in App.tsx");
