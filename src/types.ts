
export interface Employee {
  id: string;
  name: string;
  nickname?: string;
  pin: string;
  password?: string;
  role: string;
  division?: string;
  [key: string]: any;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  [key: string]: any;
}

export interface Section {
  id: string;
  name: string;
  division: string;
  [key: string]: any;
}

export interface Division {
  id: string;
  name: string;
  [key: string]: any;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn: any;
  checkOut: any;
  breakStart: any;
  breakEnd: any;
  status: string;
  shiftId: string;
  updatedAt: any;
  [key: string]: any;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  date: any;
  type: string;
  reason: string;
  status: string;
  [key: string]: any;
}

export interface ManualAttendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  [key: string]: any;
}

export interface ActivityLog {
  id: string;
  employeeId: string;
  action: string;
  timestamp: any;
  photoUrl?: string;
  [key: string]: any;
}

export interface JobPosition {
  id: string;
  name: string;
  [key: string]: any;
}

export interface JobLevel {
  id: string;
  rank: number;
  name: string;
  [key: string]: any;
}

export interface SuperAdmin {
  id: string;
  name: string;
  whatsappNumber: string;
  [key: string]: any;
}

export interface PeriodControl {
  id: string;
  name: string;
  startDate: any;
  endDate: any;
  [key: string]: any;
}
