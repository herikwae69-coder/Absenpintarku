import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const i1 = content.indexOf('const handleSubmit = async () => {');
const substr = content.substring(i1);
const i2 = substr.indexOf('const payload');
console.log(substr.substring(i2, i2 + 1000));
