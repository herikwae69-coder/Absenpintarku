const fs = require('fs');
const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
lines.forEach((line, i) => {
  if (line.includes('onSnapshot')) {
    console.log(`${i+1}: ${line}`);
  }
});
