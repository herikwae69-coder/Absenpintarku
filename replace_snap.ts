import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');
let lines = content.split('\n');

const needsRealtime = ['leaveRequests', 'attendance', 'activityLogs', 'manualAttendance'];

for (let i = 0; i < lines.length; i++) {
   if (lines[i].includes('onSnapshot')) {
       const isImport = lines[i].includes('import') || lines[i].includes('} from');
       if (isImport) continue;

       // Look at current line and up to 10 lines above to see if it involves a realtime collection
       let isRealtimeContext = false;
       for (let j = i; j >= Math.max(0, i - 15); j--) {
           if (lines[j].includes('collection(db, ') || lines[j].includes('doc(db, ')) {
               if (needsRealtime.some(r => lines[j].includes(r))) {
                   isRealtimeContext = true;
               }
               break; // found the nearest collection/doc definition
           }
       }
       
       if (!isRealtimeContext) {
           lines[i] = lines[i].replace(/onSnapshot/g, 'getSnapshotOnce');
       }
   }
}

fs.writeFileSync('src/App.tsx', lines.join('\n'));
