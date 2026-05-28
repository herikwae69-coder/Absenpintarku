import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const i1 = content.indexOf('function EmployeeLeave({');
if(i1 !== -1) {
    const substr = content.substring(i1);
    const i2 = substr.indexOf('const handleSubmit');
    console.log(substr.substring(i2 + 1500, i2 + 4000));
}
