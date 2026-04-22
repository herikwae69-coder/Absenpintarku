export type Division = 'Depan' | 'Belakang';

export interface Section {
  id: string;
  name: string;
  division?: Division;
}

export interface Employee {
  id: string;
  name: string;
  pin: string;
  password?: string;
  role: 'admin' | 'employee';
  shiftId: string;
  division: Division;
  leaveQuota: number;
  createdAt: any;
  updatedAt: any;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  breakStart?: string;
  breakEnd?: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftId: string; // The shift selected by employee
  date: string; // YYYY-MM-DD
  checkIn?: any;
  breakStart?: any;
  breakEnd?: any;
  checkOut?: any;
  status: 'present' | 'late' | 'half-day' | 'absent';
  updatedAt: any;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  division: Division;
  sectionId: string;
  period: string; 
  date1?: string;
  date2?: string;
  date3?: string;
  date4?: string;
  date5?: string;
  date6?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

export interface PeriodControl {
  id: string; // The period value
  status: 'open' | 'closed' | 'scheduled';
  deadlineDate?: string;
  deadlineTime?: string;
  updatedAt: any;
}
