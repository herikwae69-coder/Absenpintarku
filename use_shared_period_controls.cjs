const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

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

const betterSharedBlock = `
let sharedPeriodControlsCache: Record<string, any> = {};
let controlsReadyPromise: Promise<Record<string, any>> | null = null;
type PeriodListener = (data: Record<string, any>) => void;
const periodListeners: PeriodListener[] = [];

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
        periodListeners.forEach(fn => fn(data));
      });
    });
  }
  await controlsReadyPromise;
  return sharedPeriodControlsCache;
};

export const subscribePeriodControls = (fn: PeriodListener) => {
  periodListeners.push(fn);
  if (controlsReadyPromise) {
    controlsReadyPromise.then(() => fn(sharedPeriodControlsCache));
  } else {
    getSharedPeriodControls();
  }
  return () => {
    const idx = periodListeners.indexOf(fn);
    if (idx > -1) periodListeners.splice(idx, 1);
  };
};
`;

content = content.replace(sharedBlock, betterSharedBlock);

const regex1 = /const fetchControls = async \(\) => {\s*const data = await getSharedPeriodControls\(\);\s*if\(setControls\) setControls\(data\);\s*};\s*fetchControls\(\);/g;
const replacement1 = `const unsub = subscribePeriodControls((data) => {
      if(setControls) setControls(data);
    });
    return unsub;`;
content = content.replace(regex1, replacement1);

const regex2 = /const fetchControls = async \(\) => {\s*const data = await getSharedPeriodControls\(\);\s*setControls\(data\);\s*};\s*fetchControls\(\);/g;
const replacement2 = `const unsub = subscribePeriodControls((data) => {
      setControls(data);
    });
    return unsub;`;
content = content.replace(regex2, replacement2);

const regex3 = /const fetchControls = async \(\) => {\s*const data = await getSharedPeriodControls\(\);\s*setControls\(data\);\s*setLoading\(false\);\s*};\s*fetchControls\(\);/g;
const replacement3 = `const unsub = subscribePeriodControls((data) => {
      setControls(data);
      setLoading(false);
    });
    return unsub;`;
content = content.replace(regex3, replacement3);

fs.writeFileSync('src/App.tsx', content);
