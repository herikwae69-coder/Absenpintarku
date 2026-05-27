const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// The label could be `>Lihat Tabel</Button>` or have spaces.
content = content.replace(
  /disabled=\{loading \|\| isLocked\}\n(\s*className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 px-6 rounded-xl"\n)\s*>Lihat Tabel<\/Button>/g,
  'disabled={loading}\n$1>Lihat Tabel</Button>'
);

content = content.replace(
  /disabled=\{loading \|\| isLocked\}\n(\s*className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 h-12 rounded-xl"\n)\s*>Lihat Tabel<\/Button>/g,
  'disabled={loading}\n$1>Lihat Tabel</Button>'
);

content = content.replace(
  /disabled=\{loading \|\| isLocked\}\n(\s*className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 h-11 rounded-xl"\n)\s*>Lihat Tabel<\/Button>/g,
  'disabled={loading}\n$1>Lihat Tabel</Button>'
);

fs.writeFileSync('src/App.tsx', content);
