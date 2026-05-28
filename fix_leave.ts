import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

let target = `            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 text-white/40 hover:bg-transparent">`;
let replacement = `            </CardHeader>
            <CardContent>
              {!showTable ? (
                <div className="flex flex-col items-center justify-center p-6 text-white/50 bg-white/5 rounded-xl border border-white/5">
                  <p className="mb-4 text-sm text-center">Tabel riwayat pengajuan libur Anda disembunyikan.</p>
                  <Button onClick={() => setShowTable(true)} variant="outline" className="text-white hover:bg-white/10 border-white/20">
                    Lihat Request Libur Saya
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-start">
                    <Button onClick={() => setShowTable(false)} variant="ghost" size="sm" className="text-white/50 hover:text-white">
                      Sembunyikan Tabel
                    </Button>
                  </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 text-white/40 hover:bg-transparent">`;

content = content.replace(target, replacement);

content = content.replace(/<\/div>\n\s*<\/CardContent>\n\s*<\/Card>\n\n\s*\{\/\* List of others \*\/\}/g, `</div>\n                </div>\n              )}\n            </CardContent>\n          </Card>\n\n          {/* List of others */}`);

content = content.replace(/if \(isFull \|\| count > 0\) \{/g, `if (isFull) {`);

fs.writeFileSync('src/App.tsx', content);
