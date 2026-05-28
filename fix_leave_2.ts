import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

let target = `            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">`;

let replacement = `            </CardHeader>
            <CardContent>
              {!showTable ? null : (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">`;

content = content.replace(target, replacement);

content = content.replace(/<\/div>\n\s*<\/CardContent>\n\s*<\/Card>\n\n\s*\{\/\* Quota Calendar - Task 2 \*\/\}/g, `</div>\n              )}\n            </CardContent>\n          </Card>\n\n          {/* Quota Calendar - Task 2 */}`);

fs.writeFileSync('src/App.tsx', content);
