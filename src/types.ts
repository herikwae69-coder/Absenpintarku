export interface Division {
  id: string;
  name: string;
}

export interface Section {
  id: string;
  name: string;
  division?: string; // Name of the division
}

export interface Employee {
  id: string;
  name: string;
  pin: string;
  password?: string;
  role: 'admin' | 'employee' | 'superadmin';
  isActive?: boolean;
  shiftId: string;
  division: string;
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
  name?: string; // some have name instead of employeeName if older? No, it's employeeName usually
  employeeId: string;
  employeeName: string;
  division: string;
  sectionId: string;
  period: string; 
  dates?: string[];
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
  name?: string;
  startDate?: string;
  endDate?: string;
  status: 'open' | 'closed' | 'scheduled';
  openDate?: string;
  openTime?: string;
  deadlineDate?: string;
  deadlineTime?: string;
  maxRequestsPerDay?: number;
  maxAccumulatedLeave?: number;
  maxDaysPerRequest?: number;
  updatedAt: any;
}

export interface ManualAttendance {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: 'H' | 'L' | 'I' | 'S' | 'CT12' | 'CL' | 'A';
  updatedAt: any;
}
