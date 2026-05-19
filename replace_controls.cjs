const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace standard periodControls onSnapshot
const target1 = `    const unsub = onSnapshot(collection(db, "periodControls"), (snap) => {
      const data: Record<string, any> = {};
      snap.docs.forEach((d) => {
        data[d.id] = d.data();
      });
      setControls(data);
    });
    return unsub;`;
const replacement1 = `    const fetchControls = async () => {
      const snap = await getDocs(collection(db, "periodControls"));
      const data: Record<string, any> = {};
      snap.docs.forEach((d) => {
        data[d.id] = d.data();
      });
      if(setControls) setControls(data);
    };
    fetchControls();`;

content = content.replaceAll(target1, replacement1);

// What about snap.forEach?
const target1b = `    const unsub = onSnapshot(collection(db, "periodControls"), (snap) => {
      const data: Record<string, any> = {};
      snap.forEach((d) => {
        data[d.id] = d.data();
      });
      setControls(data);
    }, (err) => console.error(err));
    return unsub;`;
const replacement1b = `    const fetchControls = async () => {
      const snap = await getDocs(collection(db, "periodControls"));
      const data: Record<string, any> = {};
      snap.forEach((d) => {
        data[d.id] = d.data();
      });
      setControls(data);
    };
    fetchControls();`;
content = content.replaceAll(target1b, replacement1b);

const target1c = `    const unsub = onSnapshot(collection(db, "periodControls"), (snap) => {
      const data: Record<string, any> = {};
      snap.forEach((d) => {
        data[d.id] = d.data();
      });
      setControls(data);
    });
    return unsub;`;
const replacement1c = replacement1b;
content = content.replaceAll(target1c, replacement1c);


fs.writeFileSync('src/App.tsx', content);
