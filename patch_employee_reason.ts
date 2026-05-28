import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Update handleSubmit to append reason
const target = `    const payload: any = {
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

const replacement = `    const payload: any = {
      ...formData,
      employeeId: employee.id,
      employeeName: employee.name,
      division: employee.division || "Depan",
      period: selectedPeriod,
      status: "approved", // Auto approved
      originalDates: [...selectedDates], // Store original request for reset feature
      createdAt: serverTimestamp(),
      reason: (currentRequests && currentRequests[0] && currentRequests[0].reason && currentRequests[0].reason.includes("Dilock Admin")) ? currentRequests[0].reason + " // " + formData.reason : formData.reason
    };
    
    if (currentRequests && currentRequests[0] && currentRequests[0].lockedDates) {
      payload.lockedDates = currentRequests[0].lockedDates;
    }`;

content = content.replace(target, replacement);

fs.writeFileSync('src/App.tsx', content);
