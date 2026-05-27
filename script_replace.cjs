const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex1 = /const fetchControls = async \(\) => {\s*const snap = await getDocs\(collection\(db, "periodControls"\)\);\s*const data: Record<string, any> = \{\};\s*snap\.docs\.forEach\(\(d\) => {\s*data\[d\.id\] = d\.data\(\);\s*}\);\s*if\s*\(setControls\)\s*setControls\(data\);\s*};\s*fetchControls\(\);/g;

const replacement1 = `const fetchControls = async () => {
      const data = await getSharedPeriodControls();
      if(setControls) setControls(data);
    };
    fetchControls();`;

content = content.replace(regex1, replacement1);

const regex2 = /const fetchControls = async \(\) => {\s*const snap = await getDocs\(collection\(db, "periodControls"\)\);\s*const data: Record<string, any> = \{\};\s*snap\.forEach\(\(d\) => {\s*data\[d\.id\] = d\.data\(\);\s*}\);\s*setControls\(data\);\s*};\s*fetchControls\(\);/g;

const replacement2 = `const fetchControls = async () => {
      const data = await getSharedPeriodControls();
      setControls(data);
    };
    fetchControls();`;

content = content.replace(regex2, replacement2);

const regex3 = /const fetchControls = async \(\) => {\s*const snap = await getDocs\(collection\(db, "periodControls"\)\);\s*const data: Record<string, any> = \{\};\s*snap\.docs\.forEach\(\(d\) => {\s*data\[d\.id\] = d\.data\(\);\s*}\);\s*setControls\(data\);\s*setLoading\(false\);\s*};\s*fetchControls\(\);/g;

const replacement3 = `const fetchControls = async () => {
      const data = await getSharedPeriodControls();
      setControls(data);
      setLoading(false);
    };
    fetchControls();`;

content = content.replace(regex3, replacement3);

const sharedBlock = `
let sharedPeriodControlsCache: Record<string, any> = {};
let isControlsListening = false;
let controlsReadyPromise: Promise<Record<string, any>> | null = null;

export const getSharedPeriodControls = async () => {
  if (!controlsReadyPromise) {
    controlsReadyPromise = new Promise((resolve) => {
      onSnapshot(collection(db, "periodControls"), (snap) => {
        const data: Record<string, any> = {};
        snap.docs.forEach((d) => {
          data[d.id] = d.data();
        });
        sharedPeriodControlsCache = data;
        resolve(data);
      });
    });
  }
  return controlsReadyPromise;
};
`;

if (!content.includes('export const getSharedPeriodControls')) {
  content = content.replace(
    /const getSnapshotOnce = onSnapshot;/g,
    `const getSnapshotOnce = onSnapshot;\n` + sharedBlock
  );
}

fs.writeFileSync('src/App.tsx', content);
