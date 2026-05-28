import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `    const payload: any = {
      ...formData,
      employeeId: employee.id,
      employeeName: employee.name,
      division: employee.division || "Depan",
      period: selectedPeriod,
      status: "approved", // Auto approved
      originalDates: [...selectedDates], // Store original request for reset feature
      createdAt: serverTimestamp(),
    };`;

const rep1 = `    const payload: any = {
      ...formData,
      employeeId: employee.id,
      employeeName: employee.name,
      division: employee.division || "Depan",
      period: selectedPeriod,
      status: "approved", // Auto approved
      originalDates: [...selectedDates], // Store original request for reset feature
      createdAt: serverTimestamp(),
    };
    
    if (currentRequests && currentRequests[0] && currentRequests[0].lockedDates) {
      payload.lockedDates = currentRequests[0].lockedDates;
    }`;

content = content.replace(target1, rep1);

fs.writeFileSync('src/App.tsx', content);

