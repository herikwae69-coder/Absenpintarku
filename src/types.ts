
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
}

export interface Section {
  id: string;
  name: string;
  division: string;
}

export interface Division {
  id: string;
  name: string;
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
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  date: any;
  type: string;
  reason: string;
  status: string;
}

export interface ManualAttendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string;
}

export interface ActivityLog {
  id: string;
  employeeId: string;
  action: string;
  timestamp: any;
  photoUrl?: string;
}

export interface JobPosition {
  id: string;
  name: string;
}

export interface JobLevel {
  id: string;
  rank: number;
  name: string;
}

export interface SuperAdmin {
  id: string;
  name: string;
  whatsappNumber: string;
}
