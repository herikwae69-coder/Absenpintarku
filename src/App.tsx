import 'leaflet/dist/leaflet.css';
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

L.Marker.prototype.options.icon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
import { db, auth } from './lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  deleteDoc,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { format, startOfDay, endOfDay, isAfter, isBefore, parse } from 'date-fns';
import { 
  Music,
  User, 
  Clock, 
  Coffee, 
  LogOut, 
  Users, 
  Settings, 
  Calendar as CalendarIcon,
  Download,
  Plus,
  Trash2,
  Edit,
  Eye,
  Lock,
  Upload,
  ChevronRight,
  ClipboardList,
  BadgeCheck,
  AlertCircle,
  Menu,
  History,
  Crown,
  MessageSquare,
  Layers,
  Search,
  ClipboardCheck,
  Zap,
  MapPin,
  Camera,
  Map,
  Locate
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { Employee, Shift, Attendance, LeaveRequest, Section, Division, ManualAttendance } from './types';
import { addMonths, subMonths, lastDayOfMonth } from 'date-fns';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in meters
};

// Helper for Period Calculation (24th to 23rd)
const getPeriodDates = (date: Date) => {
  const day = date.getDate();
  let start: Date, end: Date;

  if (day >= 24) {
    // Current period started 24th of this month
    start = new Date(date.getFullYear(), date.getMonth(), 24);
    const nextMonth = addMonths(date, 1);
    end = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 23);
  } else {
    // Current period started 24th of last month
    const lastMonth = subMonths(date, 1);
    start = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 24);
    end = new Date(date.getFullYear(), date.getMonth(), 23);
  }
  return { start, end };
};

const formatPeriod = (start: Date, end: Date) => {
  return `${format(start, 'dd MMM yyyy')} - ${format(end, 'dd MMM yyyy')}`;
};

// --- CALCULATION HELPERS ---
const toDateSafe = (val: any): Date => {
  if (!val) return new Date();
  if (typeof val.toDate === 'function') {
    const d = val.toDate();
    return isNaN(d.getTime()) ? new Date() : d;
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? new Date() : val;
  }
  if (typeof val === 'object' && 'seconds' in val) {
    return new Date(val.seconds * 1000);
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const calculateMinutesDiff = (scheduledStr: string, actual: any) => {
  if (!actual) return 0;
  const actualDate = toDateSafe(actual);
  const [h, m] = scheduledStr.split(':').map(Number);
  const scheduledDate = actualDate instanceof Date ? new Date(actualDate.getTime()) : new Date();
  scheduledDate.setHours(h, m, 0, 0);
  return Math.floor((actualDate.getTime() - scheduledDate.getTime()) / 60000);
};

const minsToHHMM = (mins: number) => {
  const absoluteMins = Math.round(Math.abs(mins));
  const h = Math.floor(absoluteMins / 60);
  const m = absoluteMins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const minsToDecimal = (mins: number) => {
  return (Math.abs(mins) / 60).toFixed(2);
};

const calculateAttendanceStats = (attendance: any, shift: any) => {
  if (!attendance.checkIn || !shift) return { late: 0, earlyLeave: 0, overtime: 0 };
  
  const checkIn = toDateSafe(attendance.checkIn);
  const checkOut = attendance.checkOut ? toDateSafe(attendance.checkOut) : null;
  
  const [startH, startM] = shift.startTime.split(':').map(Number);
  const [endH, endM] = shift.endTime.split(':').map(Number);
  
  const shiftStart = new Date(checkIn);
  shiftStart.setHours(startH, startM, 0, 0);
  
  const shiftEnd = new Date(checkIn);
  shiftEnd.setHours(endH, endM, 0, 0);

  let late = 0;
  if (checkIn > shiftStart) {
    late = Math.floor((checkIn.getTime() - shiftStart.getTime()) / 60000);
  }

  let early = 0;
  let ot = 0;
  if (checkOut) {
    if (checkOut < shiftEnd) {
      early = Math.floor((shiftEnd.getTime() - checkOut.getTime()) / 60000);
    } else if (checkOut > shiftEnd) {
      ot = Math.floor((checkOut.getTime() - shiftEnd.getTime()) / 60000);
    }
  }

  return { late, earlyLeave: early, overtime: ot };
};

const formatDuration = (minutes: number) => {
  if (minutes <= 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
};

// Generate a list of periods for selectors
const getPeriodOptions = (monthsBefore: number = 3, monthsAfter: number = 12) => {
  const options = [];
  const now = new Date();
  for (let i = -monthsBefore; i <= monthsAfter; i++) {
    const d = addMonths(now, i);
    const { start, end } = getPeriodDates(d);
    options.push({
      label: formatPeriod(start, end),
      value: `${format(start, 'yyyy-MM-dd')}_${format(end, 'yyyy-MM-dd')}`,
      start,
      end
    });
  }
  return options;
};

const getCombinedPeriods = (firestoreControls: Record<string, any>) => {
  const auto = getPeriodOptions();
  const custom = Object.entries(firestoreControls)
    .filter(([id, data]) => !data.hidden && data.name && data.startDate && data.endDate && id.startsWith('custom_'))
    .map(([id, data]) => ({
      label: data.name,
      value: id,
      start: new Date(data.startDate),
      end: new Date(data.endDate)
    }));
  
  const merged = auto
    .filter(p => !firestoreControls[p.value]?.hidden)
    .map(p => {
      const fire = firestoreControls[p.value];
      if (fire && fire.name) return { ...p, label: fire.name };
      return p;
    });

  custom.forEach(cp => {
    if (!merged.find(m => m.value === cp.value)) merged.push(cp);
  });

  return merged.sort((a,b) => b.start.getTime() - a.start.getTime()); // Newest first
};

// Admin Authentication is now handle via Employee roles

import { 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<'login' | 'employee' | 'admin'>('login');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

// Initialize Listeners
  useEffect(() => {
    // Check for persisted login
    const persistedUser = localStorage.getItem('jg1_user');
    const persistedIsAdmin = localStorage.getItem('jg1_isAdmin');
    
    if (persistedUser) {
      try {
        const user = JSON.parse(persistedUser);
        setCurrentUser(user);
        if (persistedIsAdmin === 'true') {
          setIsAdmin(true);
          setView('admin');
        } else {
          setView('employee');
        }
      } catch (e) {
        console.error("Error parsing persisted user:", e);
        localStorage.removeItem('jg1_user');
        localStorage.removeItem('jg1_isAdmin');
      }
    }

    // Start listeners immediately
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      setEmployees(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
      setLoading(false);
    }, (err) => {
      console.error("Employee snapshot error:", err);
      setAuthError("Gagal memuat data. Mohon cek koneksi atau database.");
    });

    const unsubShifts = onSnapshot(collection(db, 'shifts'), (snapshot) => {
      setShifts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
    }, (err) => {
      console.error("Shift snapshot error:", err);
    });

    const unsubSections = onSnapshot(collection(db, 'sections'), (snapshot) => {
      setSections(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Section)));
    }, (err) => {
      console.error("Section snapshot error:", err);
    });

    const unsubDivisions = onSnapshot(collection(db, 'divisions'), (snapshot) => {
      setDivisions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Division)));
    }, (err) => {
      console.error("Division snapshot error:", err);
    });

    return () => {
      unsubEmployees();
      unsubShifts();
      unsubSections();
      unsubDivisions();
    };
  }, []);

  const handleLogin = (employee: Employee, credential: string) => {
    try {
        // Default password is 123456 if not set
        const userPassword = employee.password || "123456";
        const isValid = userPassword === credential;
        
        if (isValid) {
            setCurrentUser(employee);
            setView('employee');
            localStorage.setItem('jg1_user', JSON.stringify(employee));
            localStorage.setItem('jg1_isAdmin', 'false');
        } else {
            alert("Password Salah! (Default: 123456)");
        }
    } catch (e) {
        console.error("Login error:", e);
        alert("Terjadi kesalahan saat login.");
    }
  };

  const handleAdminAuth = (employee: Employee, credential: string) => {
    if (employee.role !== 'admin' && employee.role !== 'superadmin') {
      alert("Maaf kamu bukan admin!");
      return;
    }
    const userPassword = employee.password || "123456";
    if (userPassword === credential) {
      setCurrentUser(employee); // Optionally record who logged in as admin
      setIsAdmin(true);
      setView('admin');
      localStorage.setItem('jg1_user', JSON.stringify(employee));
      localStorage.setItem('jg1_isAdmin', 'true');
    } else {
      alert("Password Admin Salah!");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAdmin(false);
    setView('login');
    localStorage.removeItem('jg1_user');
    localStorage.removeItem('jg1_isAdmin');
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center font-sans text-white/50">
      <div className="mesh-bg" />
      <motion.div 
        animate={{ scale: [1, 1.1, 1] }} 
        transition={{ repeat: Infinity, duration: 2 }}
        className="mb-4"
      >
        <ClipboardList className="w-12 h-12 text-primary/40" />
      </motion.div>
      <p className="animate-pulse">Memuat data absensi...</p>
      {authError && (
        <p className="mt-4 text-rose-400 text-sm max-w-xs text-center px-4">{authError}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen relative font-sans selection:bg-primary/20">
      <div className="mesh-bg" />
      <div className="relative z-10 min-h-screen">
        {view === 'login' && (
          <LoginView 
            employees={employees} 
            onLogin={handleLogin} 
            onAdminAuth={handleAdminAuth} 
          />
        )}
        {view === 'employee' && currentUser && (
          <EmployeeView 
            employee={currentUser} 
            shifts={shifts}
            sections={sections}
            divisions={divisions}
            onLogout={handleLogout} 
          />
        )}
        {view === 'admin' && isAdmin && (
          <AdminDashboard 
            employees={employees} 
            shifts={shifts} 
            sections={sections}
            divisions={divisions}
            onLogout={handleLogout} 
            currentUser={currentUser}
          />
        )}
      </div>
      
      {/* Watermark */}
      <div className="fixed bottom-4 right-8 z-50 text-[10px] font-bold text-white/20 uppercase tracking-[0.3em] pointer-events-none flex items-center gap-2">
        <div className="w-8 h-[1px] bg-white/10" />
        App by Heri.k | versi 1.2.1 | 2026
      </div>
    </div>
  );
}

// --- LOGIN VIEW ---
function LoginView({ employees, onLogin, onAdminAuth }: { 
  employees: Employee[], 
  onLogin: (e: Employee, pin: string) => void,
  onAdminAuth: (e: Employee, pwd: string) => void
}) {
  const [absenId, setAbsenId] = useState("");
  const [pin, setPin] = useState("");
  const [adminAbsenId, setAdminAbsenId] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const selectedEmployee = employees.find(e => String(e.pin || '').trim() === absenId.trim());
  const selectedAdmin = employees.find(e => String(e.pin || '').trim() === adminAbsenId.trim());

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-10 px-4 overflow-y-auto relative">
      {/* Decorative atmospheric elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[100px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="w-28 h-28 mx-auto mb-6 relative group"
          >
            {/* Outer glow */}
            <div className="absolute inset-0 bg-primary/40 blur-[30px] rounded-full scale-110 animate-pulse" />
            
            {/* Cool glassy badge for JG1 */}
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-black to-slate-800 rounded-[2rem] border border-white/10 shadow-2xl shadow-black/80 flex items-center justify-center relative overflow-hidden transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-2">
              {/* Glass reflection */}
              <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-[2rem]" />
              {/* Bottom colored accent light */}
              <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-primary blur-2xl rounded-full opacity-60" />
              
              <div className="relative z-10 flex items-baseline drop-shadow-2xl">
                <span className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                  JG
                </span>
                <span className="relative text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-amber-400 to-orange-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] ml-0.5">
                  <Crown className="absolute -top-5 left-1/2 -translate-x-1/2 w-6 h-6 text-amber-500 fill-amber-500/80 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" strokeWidth={2.5} />
                  1
                </span>
              </div>
            </div>
          </motion.div>
          
          <motion.h1 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-4xl md:text-5xl font-black tracking-tighter text-white mb-2 uppercase"
          >
            JENGGO 1 APP
          </motion.h1>
          
          <motion.p 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-white/60 font-medium tracking-[0.2em] uppercase text-[10px] mb-1"
          >
            Demangan dalam genggaman
          </motion.p>
          
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10"
          >
            <p className="text-white/60 italic text-[11px] tracking-wide">Only one click</p>
          </motion.div>
        </div>

        <Card className="glass-panel border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden backdrop-blur-3xl bg-black/40">
          <div className="h-1 w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
          <CardHeader className="pb-4 pt-8 text-center">
            <CardTitle className="text-white text-xl font-bold tracking-tight">
              {showAdminLogin ? "Akses Administrator" : "Login Karyawan"}
            </CardTitle>
            <CardDescription className="text-white/30 text-xs">
              {showAdminLogin ? "Silakan masukkan password admin" : "Masukkan No. Absen Anda"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-8 pb-8">
            {!showAdminLogin ? (
              <>
                <div className="space-y-3">
                  <Label className="text-white/50 text-[10px] font-bold uppercase tracking-wider ml-1">No. Absen</Label>
                  <Input 
                    type="text" 
                    placeholder="Masukkan No. Absen..." 
                    value={absenId}
                    onChange={(e) => setAbsenId(e.target.value)}
                    className="h-14 field-input rounded-2xl bg-white/5 focus:bg-white/10 transition-all border-white/5 focus:border-primary/50 text-white font-bold"
                  />
                </div>

                {selectedEmployee && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col items-center gap-1"
                  >
                    <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Karyawan Terdeteksi</span>
                    <span className="text-lg font-black text-white">{selectedEmployee.name}</span>
                    <span className="text-[10px] text-white/40 uppercase tracking-tighter">{selectedEmployee.division}</span>
                  </motion.div>
                )}
                
                {selectedEmployee && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }} 
                    className="space-y-3 overflow-hidden"
                  >
                    <Label className="text-white/50 text-[10px] font-bold uppercase tracking-wider ml-1">Password</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && selectedEmployee && pin) {
                          onLogin(selectedEmployee, pin);
                        }
                      }}
                      className="h-14 field-input text-center tracking-[0.5em] text-xl font-black rounded-2xl bg-white/5 focus:bg-white/10 transition-all border-white/5 focus:border-primary/50"
                    />
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[9px] text-white/20 italic">Default password: 123456</p>
                      <button 
                         type="button" 
                         onClick={() => alert('Lupa password? Silakan hubungi Admin Anda untuk melakukan reset password melalui panel Admin.')} 
                         className="text-[9px] text-white/40 hover:text-white underline italic cursor-pointer">
                        Lupa Password?
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <Label className="text-white/50 text-[10px] font-bold uppercase tracking-wider ml-1">No. Absen Admin</Label>
                  <Input 
                    type="text" 
                    placeholder="Masukkan No. Absen..." 
                    value={adminAbsenId}
                    onChange={(e) => setAdminAbsenId(e.target.value)}
                    className="h-14 field-input rounded-2xl bg-white/5 focus:bg-white/10 transition-all border-white/5 focus:border-primary/50 text-white font-bold"
                  />
                </div>

                {selectedAdmin && (selectedAdmin.role === 'admin' || selectedAdmin.role === 'superadmin') ? (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center gap-1"
                  >
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{selectedAdmin.role === 'superadmin' ? 'Super Admin' : 'Admin'} Terdeteksi</span>
                    <span className="text-lg font-black text-white">{selectedAdmin.name}</span>
                  </motion.div>
                ) : (adminAbsenId && selectedAdmin && selectedAdmin.role !== 'admin' && selectedAdmin.role !== 'superadmin') ? (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col items-center gap-1 text-center"
                  >
                    <AlertCircle className="w-6 h-6 text-rose-400 mb-1" />
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Akses Ditolak</span>
                    <span className="text-sm font-semibold text-white/80">Maaf, Anda bukan Admin.</span>
                  </motion.div>
                ) : null}

                {selectedAdmin && (selectedAdmin.role === 'admin' || selectedAdmin.role === 'superadmin') && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }} 
                    className="space-y-3 overflow-hidden"
                  >
                    <Label className="text-white/50 text-[10px] font-bold uppercase tracking-wider ml-1">Password Admin</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      value={adminPass}
                      onChange={(e) => setAdminPass(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && selectedAdmin && adminPass) {
                          onAdminAuth(selectedAdmin, adminPass);
                        }
                      }}
                      className="h-14 field-input text-center tracking-[0.5em] text-xl font-black rounded-2xl bg-white/5 focus:bg-white/10 transition-all border-white/5 focus:border-primary/50"
                    />
                    <div className="flex justify-end px-1">
                      <button 
                         type="button" 
                         onClick={() => alert(`Lupa password Admin?\n\nSilakan minta bantuan pemilik sistem atau developer untuk mengatur ulang password di Master Database.`)} 
                         className="text-[9px] text-white/40 hover:text-white underline italic cursor-pointer">
                        Lupa Password Admin?
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </CardContent>
          <CardFooter className="flex-col gap-4 px-8 pb-10">
            {!showAdminLogin ? (
              <Button 
                disabled={!selectedEmployee || !pin}
                onClick={() => selectedEmployee && onLogin(selectedEmployee, pin)}
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold text-lg rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-30 border-none"
              >
                MASUK SEKARANG
              </Button>
            ) : (
              <Button 
                disabled={!selectedAdmin || selectedAdmin.role !== 'admin' || !adminPass}
                onClick={() => selectedAdmin && onAdminAuth(selectedAdmin, adminPass)}
                className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white border-none font-bold text-lg rounded-2xl shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-30"
              >
                KONFIRMASI ADMIN
              </Button>
            )}
            
            <Button 
              variant="ghost" 
              onClick={() => setShowAdminLogin(!showAdminLogin)}
              className="text-white/30 hover:bg-white/5 hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-full px-6 transition-all"
            >
              {showAdminLogin ? "Bukan Admin? Kembali" : "Masuk Mode Administrator"}
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

function CameraDialog({ 
  onCapture, 
  isOpen, 
  onClose 
}: { 
  onCapture: (blob: string) => void, 
  isOpen: boolean, 
  onClose: () => void 
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isOpen) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(err => {
          console.error("Camera error:", err);
          alert("Gagal mengakses kamera!");
          onClose();
        });
    }
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [isOpen]);

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        const width = 320;
        const height = (videoRef.current.videoHeight / videoRef.current.videoWidth) * width;
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        context.drawImage(videoRef.current, 0, 0, width, height);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.6);
        onCapture(dataUrl);
        onClose();
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-panel text-white border-white/20 p-4 md:p-6 max-w-sm rounded-[2rem] outline-none">
        <DialogHeader>
          <DialogTitle className="text-white">Selfie Absensi</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-[3/4] bg-black rounded-3xl overflow-hidden border border-white/10 shadow-inner">
          <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex justify-center pt-4">
          <Button onClick={capture} size="lg" className="w-16 h-16 rounded-full bg-white text-black hover:bg-white/90 active:scale-90 transition-all border-none shadow-2xl">
            <Camera className="w-8 h-8" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BreakSlider({ 
  onComplete, 
  isBreak, 
  disabled 
}: { 
  onComplete: () => void, 
  isBreak: boolean, 
  disabled: boolean 
}) {
  return (
    <div className={`relative h-14 rounded-full border border-white/10 transition-all overflow-hidden ${disabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}
         style={{ background: isBreak ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)' }}>
      <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.2em] pointer-events-none transition-all ${isBreak ? 'text-blue-400/40' : 'text-amber-400/40'}`}>
        {isBreak ? 'Geser ke kiri untuk Selesai' : 'Geser ke kanan untuk Istirahat'}
      </div>
      <div className="absolute inset-2 flex items-center">
        <div className="relative w-full h-full">
           <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 260 }} // Assume max drag 260px
            dragElastic={0.1}
            dragSnapToOrigin={true}
            onDragEnd={(_, info) => {
              if (!isBreak && info.offset.x > 150) {
                onComplete();
              } else if (isBreak && info.offset.x < -150) {
                onComplete();
              }
            }}
            animate={{ 
              x: isBreak ? 260 : 0 // Shift initial position
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`absolute w-10 h-10 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-xl z-20 ${isBreak ? 'bg-blue-500' : 'bg-amber-500'}`}
          >
            <Coffee className="w-5 h-5 text-white" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// --- EMPLOYEE VIEW ---
function EmployeeView({ employee, shifts, sections, divisions, onLogout }: { 
  employee: Employee, 
  shifts: Shift[],
  sections: Section[],
  divisions: Division[],
  onLogout: () => void 
}) {
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | 'checkIn' | 'breakStart' | 'breakEnd' | 'checkOut'>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | { action: any, location: string }>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const periodOptions = getPeriodOptions();
  const [selectedPeriod, setSelectedPeriod] = useState(periodOptions[3].value);
  const [history, setHistory] = useState<Attendance[]>([]);

  useEffect(() => {
     const q = query(
        collection(db, 'attendance'),
        where('employeeId', '==', employee.id),
        orderBy('date', 'desc')
     );
     // Filter by period logic will be applied in render based on start/end dates
     const unsub = onSnapshot(q, (snap) => setHistory(snap.docs.map(d => ({id: d.id, ...d.data()} as Attendance))));
     return unsub;
  }, [employee.id]);

  const [activeTab, setActiveTab] = useState('absen');
  const [showChangePass, setShowChangePass] = useState(false);
  const [newPass, setNewPass] = useState("");
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'attendance'), where('employeeId', '==', employee.id), where('date', '==', today));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data() as Attendance;
        setAttendance({ id: doc.id, ...data } as Attendance);
        setSelectedShiftId(data?.shiftId || "");
      } else {
        setAttendance(null);
        // Auto-select Day Off shift on Sundays
        if (currentTime.getDay() === 0) {
          const dayOffShift = shifts.find(s => s.name.toLowerCase().replace(/\s/g, '') === 'dayoff');
          if (dayOffShift) {
            setSelectedShiftId(dayOffShift.id);
          }
        }
      }
    }, (err) => console.error("Employee attendance error:", err));
    return unsub;
  }, [employee.id, today, currentTime.getDay(), shifts]);

  const handleAction = async (action: 'checkIn' | 'breakStart' | 'breakEnd' | 'checkOut', photoData?: string) => {
    setIsProcessing(true);
    setStatusMessage("Menyiapkan koordinat...");
    
    let location = "";
    
    // Geolocation check for specific actions
    if (action === 'checkIn' || action === 'checkOut' || action === 'breakEnd') {
      try {
        const position: any = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { 
                timeout: 15000, 
                enableHighAccuracy: true,
                maximumAge: 0 
            });
        });
        
        // Anti-spoofing check: Check distance if office config exists
        const officeSnap = await getDoc(doc(db, 'config', 'office'));
        if (officeSnap.exists()) {
          const config = officeSnap.data();
          const dist = calculateDistance(position.coords.latitude, position.coords.longitude, config.lat, config.lng);
          if (dist > config.radius) {
            setIsProcessing(false);
            alert(`Anda berada di luar radius kantor! (Jarak: ${Math.round(dist)}m, Max: ${config.radius}m)`);
            return;
          }
        }
        location = JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch (e: any) {
        setIsProcessing(false);
        console.error("Geolocation error:", e);
        alert(`Gagal mendapatkan lokasi: ${e.message || 'Izin ditolak atau timeout'}. Pastikan GPS aktif!`);
        return;
      }
    }

    // Selfie requirement check
    if ((action === 'checkIn' || action === 'checkOut' || action === 'breakEnd') && !photoData) {
      setPendingAction({ action, location });
      setShowCamera(true);
      setIsProcessing(false);
      return;
    }

    setStatusMessage("Menyimpan data...");
    const time = new Date();
    setConfirmAction(null);
    try {
        if (!attendance && action === 'checkIn') {
          if (!selectedShiftId) {
             setIsProcessing(false);
             return alert("Pilih shift terlebih dahulu!");
          }
          await addDoc(collection(db, 'attendance'), {
            employeeId: employee.id,
            employeeName: employee.name,
            shiftId: selectedShiftId,
            date: today,
            checkIn: time,
            status: 'present',
            location: location || (pendingAction?.location || ""),
            photoUrl: photoData || "",
            updatedAt: serverTimestamp()
          });
        } else if (attendance) {
          await updateDoc(doc(db, 'attendance', attendance.id), {
            [action]: time,
            location: location || (pendingAction?.location || attendance.location || ""),
            photoUrl: photoData || (attendance.photoUrl || ""),
            updatedAt: serverTimestamp()
          });
        }
        setStatusMessage("Berhasil!");
    } catch (e) {
        setStatusMessage("Gagal menyimpan data!");
        console.error(e);
    } finally {
        setPendingAction(null);
        setTimeout(() => {
            setIsProcessing(false);
            setStatusMessage(null);
        }, 2000);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPass || newPass.length < 4) return alert("Password minimal 4 karakter!");
    await updateDoc(doc(db, 'employees', employee.id), {
      password: newPass,
      updatedAt: serverTimestamp()
    });
    alert("Password berhasil diperbarui!");
    setShowChangePass(false);
    setNewPass("");
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'present': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
      case 'late': return 'bg-amber-50 text-amber-600 border-amber-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const currentShift = shifts.find(s => s.id === (attendance?.shiftId || selectedShiftId));

  const attendanceStats = attendance && currentShift ? calculateAttendanceStats(attendance, currentShift) : { late: 0, earlyLeave: 0, overtime: 0 };

  const getActionLabel = (type: string | null) => {
    switch(type) {
      case 'checkIn': return 'Masuk Kerja';
      case 'breakStart': return 'Mulai Istirahat';
      case 'breakEnd': return 'Selesai Istirahat';
      case 'checkOut': return 'Pulang';
      default: return '';
    }
  };

  return (
    <div className="h-screen overflow-y-auto p-4 md:p-10">
      <div className="max-w-4xl mx-auto pb-20">
      {/* Change Password Dialog */}
      <Dialog open={showChangePass} onOpenChange={setShowChangePass}>
        <DialogContent className="glass-panel text-white border-white/20 sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-white">Ganti Password Dashboard</DialogTitle>
            <DialogDescription className="text-white/60">
              Masukkan password baru Anda untuk akses dashboard di masa mendatang.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <Label className="text-white/70 text-xs mb-2 block uppercase tracking-wider font-bold">Password Baru</Label>
            <Input 
              type="password" 
              value={newPass} 
              onChange={(e) => setNewPass(e.target.value)} 
              placeholder="Minimal 4 karakter" 
              className="field-input text-lg tracking-widest h-14"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleUpdatePassword} className="w-full bg-primary hover:bg-primary/80 h-12 font-bold shadow-lg">SIMPAN PASSWORD BARU</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(val) => !val && setConfirmAction(null)}>
        <DialogContent className="glass-panel text-white border-white/20 max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              Konfirmasi Absensi
            </DialogTitle>
            <DialogDescription className="text-white/70 text-center py-4 text-base">
              Apakah Anda yakin ingin melakukan aksi <span className="font-bold text-white uppercase">{getActionLabel(confirmAction)}</span> sekarang?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-2 sm:gap-2 justify-center">
            <Button variant="ghost" onClick={() => setConfirmAction(null)} className="flex-1 glass-panel border-white/10 hover:bg-white/5 text-white">
              Batal
            </Button>
            <Button onClick={() => confirmAction && handleAction(confirmAction)} className="flex-1 bg-primary hover:bg-primary/80 text-white font-bold">
              Ya, Benar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Halo, {employee.name}</h2>
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">
            {(() => {
              const hour = currentTime.getHours();
              let greeting = "Selamat malam";
              if (hour >= 5 && hour < 11) greeting = "Selamat pagi";
              else if (hour >= 11 && hour < 15) greeting = "Selamat siang";
              else if (hour >= 15 && hour < 18) greeting = "Selamat sore";
              return `${greeting}, apa kabarmu hari ini?`;
            })()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowChangePass(true)} 
            className="glass-panel text-white/60 hover:text-white hover:bg-white/10 rounded-xl flex gap-2 border-white/10 h-10 px-4"
          >
            <Lock className="w-4 h-4" /> Password
          </Button>
          <Button variant="outline" size="sm" onClick={onLogout} className="glass-panel text-white hover:bg-white/10 rounded-xl flex gap-2 border-white/10 h-10 px-4">
            <LogOut className="w-4 h-4" /> Keluar
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 glass-panel p-1.5 h-auto md:h-16 bg-white/5 border-white/10 mb-8 rounded-2xl gap-2">
          <TabsTrigger value="absen" className="rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-primary data-[state=active]:text-white font-bold transition-all py-3 md:py-0 text-white/40">
            <Clock className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Absen</span>
          </TabsTrigger>
          <TabsTrigger value="libur" className="rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white font-bold transition-all py-3 md:py-0 text-white/40">
            <CalendarIcon className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Libur</span>
          </TabsTrigger>
          <TabsTrigger value="bonus" className="rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-bold transition-all py-3 md:py-0 text-white/40">
            <Zap className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Bonus</span>
          </TabsTrigger>
          <TabsTrigger value="ristan" className="rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white font-bold transition-all py-3 md:py-0 text-white/40">
            <ClipboardList className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Ristan</span>
          </TabsTrigger>
          <TabsTrigger value="riwayat" className="rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white font-bold transition-all py-3 md:py-0 text-white/40">
            <History className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Riwayat</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="absen" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <div className="flex items-center justify-between mb-4 glass-panel p-3 rounded-xl border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xs text-white/60 font-bold uppercase tracking-wider">Divisi: <span className="text-white">{employee.division || 'Umum'}</span></p>
            </div>
            {!attendance ? (
              <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                <SelectTrigger className="w-[180px] glass-panel border-white/10 text-white text-[10px] h-10 px-4 rounded-xl">
                  <SelectValue placeholder="Pilih Shift">
                    {selectedShiftId ? shifts.find(s => s.id === selectedShiftId)?.name : "Pilih Shift"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="glass-panel border-white/20 text-white rounded-xl">
                  {shifts.map(s => (
                    <SelectItem key={s.id} value={s.id} className="hover:bg-white/10">{`${s.name} (${s.startTime}-${s.endTime})`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="glass-panel border-white/10 text-white text-[10px] px-3 py-1.5 border-none bg-white/5 rounded-full">
                Shift: {currentShift?.name || 'Reguler'}
              </Badge>
            )}
          </div>

          <Card className="glass-panel border-none shadow-2xl mb-8 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Clock className="w-40 h-40" />
            </div>
            <CardHeader className="text-center py-10">
              <CardDescription className="text-white/40 uppercase tracking-widest font-semibold mb-1">Pukul</CardDescription>
              <CardTitle className="text-7xl font-mono tracking-tighter text-white">
                {format(currentTime, 'HH:mm')}<span className="text-3xl opacity-30 ml-1">{format(currentTime, ':ss')}</span>
              </CardTitle>
              <p className="text-white/50 mt-2 text-lg">{format(currentTime, 'EEEE, d MMMM yyyy')}</p>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CHECK IN */}
            <Card className="glass-panel border-none flex flex-col justify-between">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-3 border border-emerald-500/30">
                    <Clock className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-white/50 uppercase font-bold tracking-wider mb-1">Masuk</p>
                  <p className="text-2xl font-bold text-white mb-4">
                    {attendance?.checkIn ? format(toDateSafe(attendance.checkIn), 'HH:mm') : '--:--'}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button 
                  disabled={!!attendance?.checkIn}
                  onClick={() => {
                    if (!selectedShiftId) return alert("Pilih shift terlebih dahulu!");
                    setConfirmAction('checkIn');
                  }}
                  className="w-full btn-masuk text-white rounded-xl shadow-lg h-12 font-bold border-none"
                >
                  MASUK
                </Button>
              </CardFooter>
            </Card>

            {/* BREAK SECTION (SLIDER) */}
            <Card className="glass-panel border-none flex flex-col justify-between md:col-span-2">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="flex gap-12 mb-4">
                    <div className="flex flex-col items-center">
                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mb-1">Mulai Istirahat</p>
                      <p className="text-xl font-bold text-white">
                        {attendance?.breakStart ? format(toDateSafe(attendance.breakStart), 'HH:mm') : '--:--'}
                      </p>
                    </div>
                    <div className="flex flex-col items-center">
                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mb-1">Selesai Istirahat</p>
                      <p className="text-xl font-bold text-white">
                        {attendance?.breakEnd ? format(toDateSafe(attendance.breakEnd), 'HH:mm') : '--:--'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="w-full max-w-sm mx-auto">
                    <BreakSlider 
                      isBreak={!!attendance?.breakStart && !attendance?.breakEnd}
                      disabled={!attendance || !!attendance.checkOut}
                      onComplete={() => {
                        const isCurrentlyOnBreak = !!attendance?.breakStart && !attendance?.breakEnd;
                        handleAction(isCurrentlyOnBreak ? 'breakEnd' : 'breakStart');
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CHECK OUT */}
            <Card className="glass-panel border-none flex flex-col justify-between">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mb-3 border border-rose-500/30">
                    <LogOut className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-white/50 uppercase font-bold tracking-wider mb-1">Pulang</p>
                  <p className="text-2xl font-bold text-white mb-4">
                    {attendance?.checkOut ? format(toDateSafe(attendance.checkOut), 'HH:mm') : '--:--'}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button 
                  disabled={!attendance?.checkIn || !!attendance?.checkOut}
                  onClick={() => setConfirmAction('checkOut')}
                  className="w-full btn-pulang text-white rounded-xl shadow-lg h-12 font-bold border-none"
                >
                  PULANG
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Stats Summary */}
          {attendance && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div className="glass-panel p-4 rounded-2xl flex items-center gap-4 border-white/5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-white/40 tracking-widest leading-none mb-1">Keterlambatan</p>
                  <p className={`text-lg font-black ${attendanceStats.late > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {attendanceStats.late > 0 ? formatDuration(attendanceStats.late) : 'Tepat Waktu'}
                  </p>
                </div>
              </div>

              <div className="glass-panel p-4 rounded-2xl flex items-center gap-4 border-white/5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                  <LogOut className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-white/40 tracking-widest leading-none mb-1">Pulang Awal</p>
                  <p className={`text-lg font-black ${attendanceStats.earlyLeave > 0 ? 'text-rose-400' : 'text-white/20'}`}>
                    {attendanceStats.earlyLeave > 0 ? formatDuration(attendanceStats.earlyLeave) : '-'}
                  </p>
                </div>
              </div>

              <div className="glass-panel p-4 rounded-2xl flex items-center gap-4 border-white/5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Zap className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-white/40 tracking-widest leading-none mb-1">Lembur</p>
                  <p className={`text-lg font-black ${attendanceStats.overtime > 0 ? 'text-emerald-400' : 'text-white/20'}`}>
                    {attendanceStats.overtime > 0 ? formatDuration(attendanceStats.overtime) : '-'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {attendance && (
            <Card className="mt-8 glass-panel border-none shadow-xl overflow-hidden">
              <CardHeader className="bg-white/5 py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center justify-between text-white">
                  Status Kehadiran Hari Ini
                  <Badge variant="outline" className={`border-none ${getStatusColor(attendance.status)}`}>
                    {attendance.status === 'present' ? 'HADIR' : attendance.status === 'late' ? 'TERLAMBAT' : attendance.status.toUpperCase()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="text-xs text-white/40 space-y-1">
                  <p>Terakhir diperbarui: {attendance.updatedAt ? format(toDateSafe(attendance.updatedAt), 'HH:mm:ss') : '-'}</p>
                  <p className="italic">Data absen tersimpan otomatis di server.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="text-center mt-12 mb-8 text-[10px] font-bold text-white/10 uppercase tracking-[0.5em]">
            Presensi Digital v1.2
          </div>

          <CameraDialog 
            isOpen={showCamera} 
            onClose={() => {
              setShowCamera(false);
              setPendingAction(null);
            }} 
            onCapture={(photo) => {
              if (pendingAction) {
                handleAction(pendingAction.action, photo);
              }
            }}
          />

          {/* Processing Dialog */}
          <Dialog open={isProcessing}>
            <DialogContent className="glass-panel text-white border-white/20 p-8 max-w-sm rounded-[2rem] outline-none">
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-white rounded-full animate-spin" />
                    <p className="text-center font-bold text-lg">{statusMessage || "Memproses..."}</p>
                </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="libur" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <EmployeeLeave employee={employee} sections={sections} />
        </TabsContent>

        <TabsContent value="riwayat" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <Card className="glass-panel border-none shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Riwayat Absensi</CardTitle>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[200px] glass-panel border-white/10 text-white">
                  <SelectValue placeholder="Pilih Periode" />
                </SelectTrigger>
                <SelectContent className="glass-panel border-white/20 text-white">
                  {periodOptions.map(p => <SelectItem key={p.value} value={p.value} className="hover:bg-white/10">{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 text-white/40 hover:bg-transparent">
                      <TableHead className="text-white/40">Tanggal</TableHead>
                      <TableHead className="text-white/40">Masuk</TableHead>
                      <TableHead className="text-white/40">Pulang</TableHead>
                      <TableHead className="text-white/40">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history
                      .filter(h => {
                         const p = periodOptions.find(op => op.value === selectedPeriod);
                         if (!p) return true;
                         return h.date >= format(p.start, 'yyyy-MM-dd') && h.date <= format(p.end, 'yyyy-MM-dd');
                      })
                      .map(a => (
                      <TableRow key={a.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="text-white/70">{a.date ? format(new Date(a.date), 'dd MMM yyyy') : '-'}</TableCell>
                        <TableCell className="text-white/70 font-mono">{a.checkIn ? format(toDateSafe(a.checkIn), 'HH:mm') : '-'}</TableCell>
                        <TableCell className="text-white/70 font-mono">{a.checkOut ? format(toDateSafe(a.checkOut), 'HH:mm') : '-'}</TableCell>
                        <TableCell><Badge variant="outline" className="border-white/20 text-white/50">{a.status.toUpperCase()}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {history.filter(h => {
                         const p = periodOptions.find(op => op.value === selectedPeriod);
                         if (!p) return true;
                         return h.date >= format(p.start, 'yyyy-MM-dd') && h.date <= format(p.end, 'yyyy-MM-dd');
                      }).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-white/30 italic">Tidak ada data untuk periode ini.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bonus" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <Card className="glass-panel border-none py-20 bg-emerald-500/5 border-dashed border-emerald-500/20">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6 border border-emerald-500/30 animate-pulse">
                <Zap className="w-10 h-10 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Menu Bonus</h3>
              <p className="text-white/40 max-w-sm">
                Dalam proses tunggu update selanjutnya. Fitur ini akan tersedia pada versi aplikasi mendatang.
              </p>
              <Badge className="mt-6 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-none px-4 py-1">SOON</Badge>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ristan" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <Card className="glass-panel border-none py-20 bg-orange-500/5 border-dashed border-orange-500/20">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center mb-6 border border-orange-500/30 animate-pulse">
                <ClipboardList className="w-10 h-10 text-orange-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Menu Ristan</h3>
              <p className="text-white/40 max-w-sm">
                Dalam proses tunggu update selanjutnya. Fitur ini akan tersedia pada versi aplikasi mendatang.
              </p>
              <Badge className="mt-6 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border-none px-4 py-1">SOON</Badge>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  </div>
  );
}

// --- ADMIN DASHBOARD ---
function AdminOfficeConfig() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  function LocationMarker() {
      const map = useMapEvents({
        click(e) {
          setConfig((prev: any) => ({ ...prev, lat: e.latlng.lat, lng: e.latlng.lng }));
        },
      });
      return config && config.lat !== 0 ? <Marker position={[config.lat, config.lng]} /> : null;
  }

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'office'), (snap) => {
      if (snap.exists()) setConfig(snap.data());
      else setConfig({ lat: -6.2088, lng: 106.8456, radius: 100 });
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleUpdate = async () => {
    await setDoc(doc(db, 'config', 'office'), config);
    alert("Konfigurasi lokasi kantor diperbarui!");
  };

  if (loading) return <div>Memuat...</div>;

  return (
    <div className="glass-panel p-6 space-y-6">
      <h3 className="text-xl font-bold text-white">Atur Lokasi Kantor</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-white/50">Latitude</Label>
          <Input type="number" step="any" value={config.lat} onChange={e => setConfig({...config, lat: parseFloat(e.target.value)})} className="text-white" />
        </div>
        <div>
          <Label className="text-white/50">Longitude</Label>
          <Input type="number" step="any" value={config.lng} onChange={e => setConfig({...config, lng: parseFloat(e.target.value)})} className="text-white" />
        </div>
        <div>
          <Label className="text-white/50">Radius (meter)</Label>
          <Input type="number" value={config.radius} onChange={e => setConfig({...config, radius: parseInt(e.target.value)})} className="text-white" />
        </div>
      </div>
      <div className="h-[400px] w-full border border-white/20 rounded-lg overflow-hidden">
        <MapContainer center={[config.lat || -6.2, config.lng || 106.8]} zoom={15} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <LocationMarker />
        </MapContainer>
      </div>
      <Button onClick={handleUpdate} className="bg-primary">Simpan Konfigurasi</Button>
    </div>
  );
}

function AdminDashboard({ 
  employees, 
  shifts, 
  sections, 
  divisions,
  onLogout,
  currentUser
}: { 
  employees: Employee[], 
  shifts: Shift[],
  sections: Section[],
  divisions: Division[],
  onLogout: () => void,
  currentUser: Employee | null
}) {
  const isSuper = currentUser?.role === 'superadmin';

  useEffect(() => {
    // Clear photoUrl for records older than 2 months (60 days)
    if (isSuper) {
      const cleanupOldData = async () => {
        const twoMonthsAgo = subMonths(new Date(), 2);
        const twoMonthsAgoStr = format(twoMonthsAgo, 'yyyy-MM-dd');
        
        const q = query(collection(db, 'attendance'), where('date', '<', twoMonthsAgoStr), where('photoUrl', '>', ''));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          console.log(`Cleaning up ${snap.size} old photo records...`);
          const batchSize = 25;
          for (let i = 0; i < snap.docs.length; i += batchSize) {
            const chunk = snap.docs.slice(i, i + batchSize);
            await Promise.all(chunk.map(d => updateDoc(doc(db, 'attendance', d.id), { photoUrl: "" })));
          }
        }
      };
      cleanupOldData().catch(console.error);
    }
  }, [isSuper]);

  const [activeTab, setActiveTab] = useState('employees');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const menuItems = [
    { value: 'employees', label: 'Karyawan', icon: <Users className="w-4 h-4" /> },
    { value: 'shifts', label: 'Shift', icon: <Clock className="w-4 h-4" /> },
    { value: 'divisions', label: 'Divisi', icon: <Layers className="w-4 h-4" /> },
    { value: 'sections', label: 'Bagian', icon: <Settings className="w-4 h-4" /> },
    { value: 'office', label: 'Lokasi Kantor', icon: <MapPin className="w-4 h-4" />, superAdminOnly: true },
    { value: 'live', label: 'Live Absen', icon: <ClipboardList className="w-4 h-4" /> },
    { value: 'manual', label: 'Absensi Manual', icon: <ClipboardCheck className="w-4 h-4" /> },
    { value: 'leaves', label: 'Request Libur', icon: <CalendarIcon className="w-4 h-4" /> },
    { value: 'quotas', label: 'Atur Kuota', icon: <BadgeCheck className="w-4 h-4" /> },
    { value: 'periods', label: 'Batas Waktu', icon: <CalendarIcon className="w-4 h-4" /> },
    { value: 'reports', label: 'Laporan', icon: <Eye className="w-4 h-4" /> },
    { value: 'music', label: 'Musik Request', icon: <Music className="w-4 h-4" />, superAdminOnly: true },
    { value: 'kata', label: 'Kata-kata', icon: <MessageSquare className="w-4 h-4" />, superAdminOnly: true },
  ];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-screen flex-col overflow-hidden bg-[#0A0F1E] w-full">
      {/* Header with Integrated Menu */}
      <header className="h-16 w-full glass-panel border-x-0 border-t-0 rounded-none px-4 md:px-8 flex items-center sticky top-0 z-30 bg-black/40 backdrop-blur-xl shrink-0 gap-4">
        <Dialog open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <DialogTrigger 
            render={
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <Menu className="w-6 h-6" />
              </Button>
            }
          />
          <DialogContent className="glass-panel border-white/10 text-white left-0 top-0 translate-x-0 translate-y-0 h-full w-[280px] rounded-none p-6 m-0 border-r border-y-0 border-l-0 duration-300 shadow-2xl">
            <div className="flex items-center gap-3 mb-10 px-2">
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center shrink-0 border border-primary/30">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <span className="font-bold text-lg text-white">Menu Admin</span>
            </div>
            <nav className="flex-1 overflow-y-auto pr-2 no-scrollbar">
              <TabsList className="flex flex-col h-auto bg-transparent w-full gap-2 items-stretch p-0">
                {menuItems.filter(i => !i.superAdminOnly || currentUser?.role === 'superadmin').map((item) => (
                  <TabsTrigger 
                    key={item.value}
                    value={item.value} 
                    onClick={() => setIsMobileOpen(false)}
                    className="justify-start gap-4 h-12 px-4 rounded-xl border-none transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-white font-semibold text-white/50"
                  >
                    <div className={`p-2 rounded-lg ${activeTab === item.value ? 'bg-white/20' : 'bg-white/5'}`}>
                      {item.icon}
                    </div>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </nav>
            <div className="mt-auto pt-6 border-t border-white/10">
              <Button variant="ghost" onClick={onLogout} className="w-full justify-start text-rose-400 hover:bg-rose-500/10 px-4 h-11 rounded-xl">
                <LogOut className="w-4 h-4 mr-3" /> Keluar Akun
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <span className="font-bold text-white tracking-tight text-lg">Panel Administrasi</span>
          
        <div className="ml-auto">
          <Button variant="ghost" size="icon" onClick={onLogout} className="text-white/30 hover:text-white hover:bg-rose-500/10 rounded-full h-9 w-9"><LogOut className="w-4 h-4" /></Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col min-w-0 bg-[#0A0F1E] overflow-y-auto no-scrollbar">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A0F1E] to-[#12182B] pointer-events-none" />
        
        {/* Content Area */}
        <div className="flex-1 p-4 md:p-8 relative z-0">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col gap-1 mb-8">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white capitalize">
                {menuItems.find(i => i.value === activeTab)?.label}
              </h1>
              <p className="text-white/40 text-xs md:text-sm">Kelola data dan monitoring operasional harian.</p>
            </div>

            <div className="focus-visible:outline-none min-h-[500px]">
              <TabsContent value="employees" className="mt-0 outline-none">
                <AdminEmployees employees={employees} shifts={shifts} sections={sections} divisions={divisions} currentUser={currentUser} />
              </TabsContent>
              <TabsContent value="shifts" className="mt-0 outline-none">
                <AdminShifts shifts={shifts} />
              </TabsContent>
              <TabsContent value="divisions" className="mt-0 outline-none">
                <AdminDivisions divisions={divisions} />
              </TabsContent>
              <TabsContent value="sections" className="mt-0 outline-none">
                <AdminSections sections={sections} divisions={divisions} />
              </TabsContent>
              <TabsContent value="live" className="mt-0 outline-none">
                <AdminLive employees={employees} shifts={shifts} />
              </TabsContent>
              <TabsContent value="manual" className="mt-0 outline-none">
                <AdminManualAttendance employees={employees} divisions={divisions} />
              </TabsContent>
              <TabsContent value="office" className="mt-0 outline-none">
                <AdminOfficeConfig />
              </TabsContent>
              <TabsContent value="leaves" className="mt-0 outline-none">
                <AdminLeave employees={employees} sections={sections} divisions={divisions} />
              </TabsContent>
              <TabsContent value="quotas" className="mt-0 outline-none">
                <AdminQuota employees={employees} />
              </TabsContent>
              <TabsContent value="periods" className="mt-0 outline-none">
                <AdminPeriods />
              </TabsContent>
              <TabsContent value="kata" className="mt-0 outline-none">
                 <AdminKata />
              </TabsContent>
              <TabsContent value="reports" className="mt-0 outline-none">
                <AdminReports employees={employees} shifts={shifts} />
              </TabsContent>
              <TabsContent value="music" className="mt-0 outline-none">
                <AdminMusic />
              </TabsContent>
            </div>
          </div>
        </div>
      </main>
    </Tabs>
  );
}

function AdminMusic() {
  const [musicUrl, setMusicUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemConfig', 'musicSettings'), (doc) => {
      if (doc.exists()) {
        setMusicUrl(doc.data().url || '');
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSave = async () => {
    await setDoc(doc(db, 'systemConfig', 'musicSettings'), { url: musicUrl });
    alert('Musik URL berhasil disimpan!');
  };

  return (
    <Card className="glass-panel border-none p-6 text-white">
      <CardHeader>
        <CardTitle>Pengaturan Musik Request Libur</CardTitle>
        <CardDescription className="text-white/60">Masukkan URL audio (MP3) untuk background music request libur:</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input 
          value={musicUrl} 
          onChange={(e) => setMusicUrl(e.target.value)} 
          placeholder="https://example.com/musik.mp3"
          className="field-input text-white"
        />
        <Button onClick={handleSave} className="bg-primary w-full h-12 font-bold">SIMPAN URL MUSIK</Button>
      </CardContent>
    </Card>
  );
}

// --- ADMIN: EMPLOYEES ---
function AdminEmployees({ employees, shifts, sections, divisions, currentUser }: { employees: Employee[], shifts: Shift[], sections: Section[], divisions: Division[], currentUser: Employee | null }) {
  const [isEditing, setIsEditing] = useState<Employee | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({ 
    name: '', 
    pin: '', 
    shiftId: '', 
    role: 'employee' as const, 
    leaveQuota: 0,
    division: divisions?.[0]?.name || 'Depan',
    password: ''
  });

  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (e.pin && e.pin.includes(searchTerm))
  );

  const resetForm = () => setFormData({ 
    name: '', 
    pin: '', 
    shiftId: '', 
    role: 'employee', 
    leaveQuota: 4,
    division: divisions?.[0]?.name || 'Depan',
    password: ''
  });

  const handleExportTemplate = () => {
    const data = [
      {
        "Nama": "Budi Santoso",
        "No Absen": "1001",
        "Divisi": "Depan",
        "Nama Shift": shifts[0]?.name || "Shift 1",
        "Hak Akses": "employee",
        "Kuota Libur": 4
      }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Karyawan");
    XLSX.writeFile(wb, "Template_Karyawan.xlsx");
  };

  const [importing, setImporting] = useState(false);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        for (const row of data) {
          const shift = shifts.find(s => s.name === row["Nama Shift"]) || shifts[0];
          if (!row["Nama"] || !row["No Absen"]) continue;

          await addDoc(collection(db, 'employees'), {
            name: row["Nama"].toString(),
            pin: row["No Absen"].toString(),
            shiftId: shift?.id || "",
            division: row["Divisi"] || 'Depan',
            role: (currentUser?.role === 'superadmin' && row["Hak Akses"] === 'admin' ? 'admin' : 'employee'),
            leaveQuota: parseInt(row["Kuota Libur"]) || 4,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
        alert("Berhasil mengimpor karyawan!");
      } catch (err) {
        console.error(err);
        alert("Gagal mengimpor data. Pastikan format benar.");
      } finally {
        setImporting(false);
        e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.pin) return alert("Lengkapi data!");
    await addDoc(collection(db, 'employees'), {
      ...formData,
      shiftId: formData.shiftId || (shifts[0]?.id || ""),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setShowAdd(false);
    resetForm();
  };

  const addSuperAdmin = async () => {
    const adminName = prompt("Masukkan Nama Super Admin:", "Super Admin") || "Super Admin";
    await addDoc(collection(db, 'employees'), {
      name: adminName,
      pin: "1",
      role: "superadmin",
      password: "adnan2301",
      division: "Depan",
      shiftId: shifts[0]?.id || "",
      leaveQuota: 12,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    alert(`Super Admin ${adminName} Berhasil Dibuat`);
  };

  const handleEdit = async () => {
    if (!isEditing) return;
    await updateDoc(doc(db, 'employees', isEditing.id), {
      ...formData,
      updatedAt: serverTimestamp()
    });
    setIsEditing(null);
    resetForm();
  };

  const handleResetPassword = async () => {
    if (!isEditing || !confirm("Yakin ingin mereset password karyawan ini ke default (123456)?")) return;
    await updateDoc(doc(db, 'employees', isEditing.id), {
      password: "123456",
      updatedAt: serverTimestamp()
    });
    alert("Password telah direset ke 123456.");
  };

  const handleDelete = async (id: string) => {
    const pwd = prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!");
      return;
    }
    if (confirm("Hapus karyawan ini?")) {
      await deleteDoc(doc(db, 'employees', id));
    }
  };

  const triggerEdit = (e: Employee) => {
    setIsEditing(e);
    setFormData({ 
      name: e.name, 
      pin: e.pin, 
      shiftId: e.shiftId, 
      role: e.role, 
      leaveQuota: e.leaveQuota || 0,
      division: e.division || 'Depan',
      password: e.password || ''
    });
    setShowAdd(true);
  };

  return (
    <Card className="glass-panel border-none shadow-lg w-full">
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-white">List Karyawan</CardTitle>
          <CardDescription className="text-white/50">Kelola karyawan secara manual atau massal via Excel.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input 
            placeholder="Cari karyawan..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="field-input w-full md:w-[200px]"
          />
          <Button variant="outline" onClick={handleExportTemplate} className="glass-panel text-white hover:bg-white/10 flex gap-2 border-white/10 h-10 px-4">
            <Download className="w-4 h-4" /> Template
          </Button>
          {(currentUser?.role === 'superadmin' || !employees.some(e => e.role === 'superadmin')) && (
            <Button variant="outline" onClick={addSuperAdmin} className="glass-panel text-rose-500 hover:bg-rose-500/10 flex gap-2 border-rose-500/50 h-10 px-4">
              Buat SuperAdmin
            </Button>
          )}
          
          <div className="relative">
            <input type="file" id="import-employee" className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} disabled={importing} />
            <Label htmlFor="import-employee" className="cursor-pointer rounded-xl flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-colors h-10 px-4 font-medium text-white shadow-sm hover:opacity-90">
              <Upload className="w-4 h-4" /> {importing ? "Mengimpor..." : "Import Karyawan"}
            </Label>
          </div>

          <Dialog open={showAdd} onOpenChange={(val) => { setShowAdd(val); if (!val) { setIsEditing(null); resetForm(); } }}>
            <DialogTrigger 
              render={
                <Button className="rounded-xl flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 transition-colors h-10 px-4 font-medium text-white shadow-sm">
                  <Plus className="w-4 h-4" /> Karyawan Baru
                </Button>
              }
            />
            <DialogContent className="glass-panel text-white border-white/20 sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-white">{isEditing ? "Edit Karyawan" : "Tambah Karyawan Baru"}</DialogTitle>
              <DialogDescription className="text-white/60">Masukkan informasi detail karyawan di bawah ini.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="grid gap-2 col-span-2 text-white">
                <Label className="text-white/70 text-xs">Nama Lengkap</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Contoh: Budi Santoso" className="field-input" />
              </div>
              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">No. Absen</Label>
                <Input value={formData.pin} onChange={(e) => setFormData({...formData, pin: e.target.value})} placeholder="Contoh: 1234" className="field-input" />
              </div>
              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">Kuota Libur</Label>
                <Input type="number" value={formData.leaveQuota} onChange={(e) => setFormData({...formData, leaveQuota: parseInt(e.target.value) || 0})} className="field-input" />
              </div>
              
              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">Divisi</Label>
                <Select value={formData.division} onValueChange={(val: any) => setFormData({...formData, division: val})}>
                  <SelectTrigger className="field-input text-white border-white/10"><SelectValue placeholder="Pilih Divisi" /></SelectTrigger>
                  <SelectContent className="glass-panel border-white/10 text-white">
                    {divisions.map(d => (
                      <SelectItem key={d.id} value={d.name} className="hover:bg-white/10">{d.name}</SelectItem>
                    ))}
                    {divisions.length === 0 && (
                       <>
                        <SelectItem value="Depan" className="hover:bg-white/10">Depan</SelectItem>
                        <SelectItem value="Belakang" className="hover:bg-white/10">Belakang</SelectItem>
                       </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">Hak Akses</Label>
                <Select value={formData.role} onValueChange={(val: any) => {
                  if (val === 'superadmin') {
                    const pwd = prompt("Masukkan password untuk akses Super Admin:");
                    if (pwd === "adnan2301") {
                        setFormData(prev => ({...prev, role: val}));
                    } else {
                        alert("Password Salah!");
                    }
                  } else {
                    setFormData(prev => ({...prev, role: val}));
                  }
                }}>
                  <SelectTrigger className="field-input text-white border-white/10"><SelectValue placeholder="Pilih Hak Akses" /></SelectTrigger>
                  <SelectContent className="glass-panel border-white/10 text-white">
                    <SelectItem value="employee" className="hover:bg-white/10">Karyawan</SelectItem>
                    {currentUser?.role === 'superadmin' && (
                      <>
                        <SelectItem value="admin" className="hover:bg-white/10">Administrator</SelectItem>
                        <SelectItem value="superadmin" className="hover:bg-white/10">Super Admin</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {(!isEditing) && (
                <div className="grid gap-2 col-span-2">
                  <Label className="text-white/70 text-xs">Password (Opsional)</Label>
                  <Input type="text" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder="Biarkan kosong jika tidak ingin diubah" className="field-input" />
                  <p className="text-[10px] text-white/30 italic">Jika kosong, karyawan bisa buat sendiri atau pakai PIN lama.</p>
                </div>
              )}
            </div>
            <DialogFooter className="flex flex-col gap-2">
              {isEditing && (
                <Button variant="outline" onClick={handleResetPassword} className="w-full text-amber-500 border-amber-500 hover:bg-amber-500/10">Reset Password</Button>
              )}
              <Button onClick={isEditing ? handleEdit : handleAdd} className="w-full bg-primary hover:bg-primary/80">{isEditing ? "Simpan Perubahan" : "Simpan Karyawan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto no-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/40 whitespace-nowrap">Nama</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">Divisi</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">No. Absen</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">Shift</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">Kuota</TableHead>
                <TableHead className="text-right text-white/40 whitespace-nowrap">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map(e => (
                <TableRow key={e.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-semibold text-white whitespace-nowrap">{e.name}</TableCell>
                  <TableCell className="text-white/60 whitespace-nowrap">{e.division || '-'}</TableCell>
                  <TableCell className="text-white/50 font-mono whitespace-nowrap">{e.pin}</TableCell>
                  <TableCell className="text-white/70 whitespace-nowrap">{shifts.find(s => s.id === e.shiftId)?.name || "N/A"}</TableCell>
                  <TableCell className="text-white/70 font-mono whitespace-nowrap">{e.leaveQuota || 0} Hari</TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    {e.role !== 'superadmin' || currentUser?.role === 'superadmin' ? (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => triggerEdit(e)} className="hover:bg-white/10"><Edit className="w-4 h-4 text-primary" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)} className="hover:bg-white/10"><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                      </>
                    ) : (
                      <span className="text-xs text-white/20 italic">Locked</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// --- ADMIN: DIVISIONS ---
function AdminDivisions({ divisions }: { divisions: Division[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [isEditing, setIsEditing] = useState<Division | null>(null);

  const handleSave = async () => {
    if (!name) return;
    if (isEditing) {
      await updateDoc(doc(db, 'divisions', isEditing.id), { name });
    } else {
      await addDoc(collection(db, 'divisions'), { name });
    }
    setShowAdd(false);
    setName('');
    setIsEditing(null);
  };

  const triggerEdit = (d: Division) => {
    setIsEditing(d);
    setName(d.name);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    const pwd = prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!");
      return;
    }
    if (confirm("Hapus divisi ini? Semua bagian di divisi ini mungkin akan terdampak.")) {
      await deleteDoc(doc(db, 'divisions', id));
    }
  };

  return (
    <Card className="glass-panel border-none shadow-lg text-white">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white">Daftar Divisi</CardTitle>
        <Dialog open={showAdd} onOpenChange={(val) => { setShowAdd(val); if (!val) { setIsEditing(null); setName(''); } }}>
          <DialogTrigger 
            render={
              <Button className="rounded-xl flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 transition-colors h-10 px-4 py-2 font-medium text-white shadow-sm">
                <Plus className="w-4 h-4" /> Divisi Baru
              </Button>
            }
          />
          <DialogContent className="glass-panel text-white border-white/20">
            <DialogHeader>
              <DialogTitle className="text-white">{isEditing ? 'Edit Divisi' : 'Tambah Divisi'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">Nama Divisi</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Depan" className="field-input text-white" />
              </div>
            </div>
            <DialogFooter><Button onClick={handleSave} className="w-full bg-primary hover:bg-primary/80">Simpan Divisi</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto no-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent text-white/40">
                <TableHead className="text-white/40 whitespace-nowrap">Nama Divisi</TableHead>
                <TableHead className="text-right whitespace-nowrap">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {divisions.map(d => (
                <TableRow key={d.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="text-white font-medium whitespace-nowrap">{d.name}</TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => triggerEdit(d)} className="hover:bg-white/10"><Edit className="w-4 h-4 text-primary" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)} className="hover:bg-white/10"><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {divisions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-6 text-white/30 italic">Belum ada divisi. Silakan tambah divisi baru.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// --- ADMIN: SECTIONS ---
function AdminSections({ sections, divisions }: { sections: Section[], divisions: Division[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [division, setDivision] = useState<string>(divisions?.[0]?.name || 'Depan');

  useEffect(() => {
    if (divisions.length > 0 && !divisions.find(d => d.name === division)) {
      setDivision(divisions[0].name);
    }
  }, [divisions]);

  const handleAdd = async () => {
    if (!name) return;
    await addDoc(collection(db, 'sections'), { name, division });
    setShowAdd(false);
    setName('');
  };

  const handleDelete = async (id: string) => {
    const pwd = prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!");
      return;
    }
    if (confirm("Hapus bagian ini?")) {
      await deleteDoc(doc(db, 'sections', id));
    }
  };

  const groupedSections: Record<string, Section[]> = {};
  divisions.forEach(div => {
    groupedSections[div.name] = sections.filter(s => s.division === div.name);
  });
  // Handle fallback for legacy or mismatched ones
  const otherSections = sections.filter(s => !divisions.map(d => d.name).includes(s.division || ''));
  if (otherSections.length > 0) {
    groupedSections['Lainnya'] = otherSections;
  }

  return (
    <Card className="glass-panel border-none shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white">Daftar Bagian</CardTitle>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger 
            render={
              <Button className="rounded-xl flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 transition-colors h-10 px-4 py-2 font-medium text-white shadow-sm">
                <Plus className="w-4 h-4" /> Bagian Baru
              </Button>
            }
          />
          <DialogContent className="glass-panel text-white border-white/20">
            <DialogHeader>
              <DialogTitle className="text-white">Tambah Bagian</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">Pilih Divisi</Label>
                <Select value={division} onValueChange={(v: string) => setDivision(v)}>
                  <SelectTrigger className="field-input text-white">
                    <SelectValue placeholder="Pilih Divisi" />
                  </SelectTrigger>
                  <SelectContent className="glass-panel border-white/20 text-white">
                    {divisions.map(d => (
                      <SelectItem key={d.id} value={d.name} className="hover:bg-white/10">{d.name}</SelectItem>
                    ))}
                    {divisions.length === 0 && (
                      <SelectItem value="Depan" className="hover:bg-white/10">Depan (Default)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">Nama Bagian</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Kasir" className="field-input text-white" />
              </div>
            </div>
            <DialogFooter><Button onClick={handleAdd} className="w-full bg-primary hover:bg-primary/80">Simpan Bagian</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.keys(groupedSections).map((divName) => (
             <div key={divName} className="glass-panel border-white/10 p-4 rounded-xl">
               <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-primary" />
                 Divisi {divName}
               </h3>
               <div className="overflow-x-auto no-scrollbar">
                 <Table>
                   <TableHeader>
                     <TableRow className="border-white/10 hover:bg-transparent text-white/40">
                       <TableHead className="text-white/40 whitespace-nowrap">Nama Bagian</TableHead>
                       <TableHead className="text-right whitespace-nowrap">Aksi</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {groupedSections[divName].map(s => (
                       <TableRow key={s.id} className="border-white/5 hover:bg-white/5">
                         <TableCell className="text-white font-medium whitespace-nowrap">{s.name}</TableCell>
                         <TableCell className="text-right whitespace-nowrap">
                           <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="hover:bg-white/10"><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                         </TableCell>
                       </TableRow>
                     ))}
                     {groupedSections[divName].length === 0 && (
                       <TableRow>
                         <TableCell colSpan={2} className="text-center py-6 text-white/30 italic">Belum ada bagian di divisi ini.</TableCell>
                       </TableRow>
                     )}
                   </TableBody>
                 </Table>
               </div>
             </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- ADMIN: QUOTA MANAGEMENT ---
function AdminQuota({ employees }: { employees: Employee[] }) {
  const periodOptions = getPeriodOptions();
  const [selectedPeriod, setSelectedPeriod] = useState(periodOptions[3].value);
  const [quotas, setQuotas] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'periodQuotas'), where('period', '==', selectedPeriod));
    const unsub = onSnapshot(q, (snap) => {
      setQuotas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [selectedPeriod]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        // Expected Excel Format: Columns "No. Absen" and "Kuota"
        let count = 0;
        for (const row of data) {
          const pin = String(row["No. Absen"] || row.NoAbsen || row.PIN || row.pin || '');
          const rawQuota = row.Kuota || row.kuota || row.Quota;
          const quotaVal = rawQuota !== undefined ? parseInt(String(rawQuota)) : 4;
          const employee = employees.find(emp => emp.pin === pin);

          if (employee && pin) {
            await setDoc(doc(db, 'periodQuotas', `${employee.id}_${selectedPeriod}`), {
              employeeId: employee.id,
              employeeName: employee.name,
              period: selectedPeriod,
              quota: quotaVal,
              updatedAt: serverTimestamp()
            });
            count++;
          }
        }
        alert(`Berhasil mengimpor ${count} data kuota.`);
      } catch (err) {
        console.error("Import error:", err);
        alert("Gagal mengimpor file. Pastikan format file Excel benar (Kolom No. Absen dan Kuota).");
      } finally {
        setImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplate = () => {
    const data = employees.filter(e => e.role === 'employee').map(e => ({
      'Nama Karyawan': e.name,
      'No. Absen': e.pin,
      'Kuota': ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Kuota");
    XLSX.writeFile(wb, "Template_Kuota_Libur.xlsx");
  };

  return (
    <Card className="glass-panel border-none shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white">Pengaturan Kuota Libur</CardTitle>
          <CardDescription className="text-white/50">
            Jatah default: <span className="text-white/80 font-bold">4 Hari</span>. 
            Maksimal total (Jatah + Sisa Lalu): <span className="text-white/80 font-bold">6 Hari</span>.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleDownloadTemplate}
            className="rounded-xl flex items-center justify-center gap-2 glass-panel border-white/10 text-white hover:bg-white/10 h-10 px-4 py-2 font-medium shadow-sm"
          >
            <Download className="w-4 h-4" /> Template
          </Button>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            onChange={handleFileUpload} 
            className="hidden" 
            id="quota-upload" 
          />
          <Label 
            htmlFor="quota-upload" 
            className="cursor-pointer rounded-xl flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-colors h-10 px-4 py-2 font-medium text-white shadow-sm"
          >
            <Upload className="w-4 h-4" /> {importing ? "Mengimpor..." : "Import Excel"}
          </Label>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 border-dashed">
          <Label className="text-white/60 text-xs uppercase font-bold tracking-wider mb-2 block">Pilih Periode Aktif</Label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-full md:w-[300px] glass-panel border-white/10 text-white font-bold h-12">
              <SelectValue placeholder="Pilih Periode" />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white">
              {periodOptions.map(p => (
                <SelectItem key={p.value} value={p.value} className="hover:bg-white/10">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-[10px] text-white/30 italic">* Kuota yang diatur di bawah ini khusus untuk periode yang dipilih.</p>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 text-white/40 hover:bg-transparent">
                <TableHead className="text-white/40 whitespace-nowrap">Nama Karyawan</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">No. Absen</TableHead>
                <TableHead className="text-right text-white/40 whitespace-nowrap">Kuota Jatah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.filter(e => e.role === 'employee').map(e => {
                const quotaEntry = quotas.find(q => q.employeeId === e.id);
                const currentQuota = quotaEntry?.quota ?? 4;
                
                return (
                  <TableRow key={e.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-semibold text-white whitespace-nowrap">{e.name}</TableCell>
                    <TableCell className="text-white/40 font-mono text-xs whitespace-nowrap">{e.pin}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end items-center gap-3">
                        <Badge className="bg-primary/20 text-primary border-primary/30 font-mono px-3 py-1 text-sm">
                          {currentQuota} Hari
                        </Badge>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-white/30 hover:text-white hover:bg-white/10"
                          onClick={async () => {
                            const newVal = prompt(`Update Kuota untuk ${e.name}:`, String(currentQuota));
                            if (newVal !== null) {
                              const quotaVal = parseInt(newVal);
                              if (!isNaN(quotaVal)) {
                                await setDoc(doc(db, 'periodQuotas', `${e.id}_${selectedPeriod}`), {
                                  employeeId: e.id,
                                  employeeName: e.name,
                                  period: selectedPeriod,
                                  quota: quotaVal,
                                  updatedAt: serverTimestamp()
                                });
                              }
                            }
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// --- ADMIN: PERIODS ---
function AdminPeriods() {
  const [controls, setControls] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ name: '', startDate: '', endDate: '', maxAccumulatedLeave: 6 });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
      const data: Record<string, any> = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setControls(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const combinedPeriods = getCombinedPeriods(controls);

  const updateStatus = async (periodId: string, status: string) => {
    await setDoc(doc(db, 'periodControls', periodId), {
      status,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const updateDeadline = async (periodId: string, date: string, time: string) => {
    await setDoc(doc(db, 'periodControls', periodId), {
      status: 'scheduled',
      deadlineDate: date,
      deadlineTime: time,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const updateMaxLimit = async (periodId: string, limit: number) => {
    await setDoc(doc(db, 'periodControls', periodId), {
      maxRequestsPerDay: limit,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const updateMaxAccumulated = async (periodId: string, limit: number) => {
    await setDoc(doc(db, 'periodControls', periodId), {
      maxAccumulatedLeave: limit,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const handleAddCustom = async () => {
    if (!newPeriod.name || !newPeriod.startDate || !newPeriod.endDate) {
      alert("Lengkapi nama dan rentang tanggal!");
      return;
    }
    const id = `custom_${newPeriod.startDate}_${newPeriod.endDate}_${Date.now()}`;
    await setDoc(doc(db, 'periodControls', id), {
      name: newPeriod.name,
      startDate: newPeriod.startDate,
      endDate: newPeriod.endDate,
      status: 'closed',
      deadlineDate: format(new Date(), 'yyyy-MM-dd'),
      deadlineTime: '17:00',
      maxRequestsPerDay: 7,
      maxAccumulatedLeave: newPeriod.maxAccumulatedLeave,
      updatedAt: serverTimestamp()
    });
    setShowAdd(false);
    setNewPeriod({ name: '', startDate: '', endDate: '', maxAccumulatedLeave: 6 });
  };

  const handleDelete = async (id: string) => {
    const pwd = prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!");
      return;
    }
    if (confirm("Hapus pengaturan periode ini?")) {
      if (id.startsWith('custom_')) {
        await deleteDoc(doc(db, 'periodControls', id));
      } else {
        await setDoc(doc(db, 'periodControls', id), {
          hidden: true,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }
  }

  if (loading) return <div className="text-white p-10 text-center">Memuat pengaturan periode...</div>;

  return (
    <Card className="glass-panel border-none shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white">Pengaturan Batas Waktu Request</CardTitle>
          <CardDescription className="text-white/50">Atur kapan karyawan boleh melakukan request libur untuk setiap periode.</CardDescription>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger render={
            <Button className="bg-primary hover:bg-primary/80 flex gap-2">
              <Plus className="w-4 h-4" /> Tambah Periode Manual
            </Button>
          } />
          <DialogContent className="glass-panel text-white border-white/20">
            <DialogHeader>
              <DialogTitle>Buat Periode Baru</DialogTitle>
              <DialogDescription>Tentukan nama dan rentang tanggal untuk periode request ini.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nama Periode</Label>
                <Input placeholder="Contoh: Periode Lebaran / Mei 2024" value={newPeriod.name} onChange={(e) => setNewPeriod({...newPeriod, name: e.target.value})} className="field-input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tgl Mulai</Label>
                  <Input type="date" value={newPeriod.startDate} onChange={(e) => setNewPeriod({...newPeriod, startDate: e.target.value})} className="field-input" />
                </div>
                <div className="space-y-2">
                  <Label>Tgl Selesai</Label>
                  <Input type="date" value={newPeriod.endDate} onChange={(e) => setNewPeriod({...newPeriod, endDate: e.target.value})} className="field-input" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Batas Tabungan Libur (Max Accumulation)</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    type="number" 
                    value={newPeriod.maxAccumulatedLeave || 6} 
                    onChange={(e) => setNewPeriod({...newPeriod, maxAccumulatedLeave: parseInt(e.target.value) || 6} as any)} 
                    className="field-input w-24" 
                  />
                  <span className="text-xs text-white/40 italic">Hari</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddCustom} className="w-full bg-emerald-600 hover:bg-emerald-500">Buat Periode Sekarang</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {combinedPeriods.map(p => {
            const ctrl = controls[p.value] || { status: 'open' };
            const isCustom = p.value.startsWith('custom_');
            return (
              <div key={p.value} className="glass-panel p-4 border-white/5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    ctrl.status === 'open' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                    ctrl.status === 'closed' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                    'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {ctrl.status === 'open' ? <BadgeCheck className="w-5 h-5" /> : 
                     ctrl.status === 'closed' ? <Lock className="w-5 h-5" /> : 
                     <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-bold">{p.label}</h4>
                      {isCustom && <Badge className="bg-white/10 text-white/40 border-none text-[8px]">Custom</Badge>}
                    </div>
                    <p className="text-xs text-white/40">Status: <span className="uppercase font-bold tracking-wider">{ctrl.status === 'scheduled' ? 'Terjadwal' : ctrl.status === 'open' ? 'Terbuka' : 'Ditutup'}</span></p>
                    {isCustom && <p className="text-[10px] text-white/20">{ctrl.startDate} s/d {ctrl.endDate}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button 
                    size="sm" 
                    variant={ctrl.status === 'open' ? 'default' : 'ghost'}
                    onClick={() => updateStatus(p.value, 'open')}
                    className={ctrl.status === 'open' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'text-white/50 hover:bg-white/10'}
                  >
                    Buka
                  </Button>
                  <Button 
                    size="sm" 
                    variant={ctrl.status === 'closed' ? 'destructive' : 'ghost'}
                    onClick={() => updateStatus(p.value, 'closed')}
                    className={ctrl.status === 'closed' ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'text-white/50 hover:bg-white/10'}
                  >
                    Tutup
                  </Button>
                  
                  <Popover>
                    <PopoverTrigger 
                      render={
                        <Button 
                          size="sm" 
                          variant={ctrl.status === 'scheduled' ? 'default' : 'ghost'}
                          className={ctrl.status === 'scheduled' ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'text-white/50 hover:bg-white/10'}
                        >
                          {ctrl.status === 'scheduled' ? 'Terjadwal' : 'Jadwalkan'}
                        </Button>
                      }
                    />
                    <PopoverContent className="bg-black/95 text-white border-white/20 p-4 w-72">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-amber-400" />
                          <h4 className="text-white font-bold text-sm">Batas Waktu Request</h4>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Tanggal Penutupan</Label>
                          <Input 
                            type="date" 
                            defaultValue={ctrl.deadlineDate || ''}
                            onBlur={(e) => updateDeadline(p.value, e.target.value, ctrl.deadlineTime || '17:00')}
                            className="field-input h-9 text-white" 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Jam Penutupan</Label>
                          <Input 
                            type="time" 
                            defaultValue={ctrl.deadlineTime || '17:00'}
                            onBlur={(e) => updateDeadline(p.value, ctrl.deadlineDate || '', e.target.value)}
                            className="field-input h-9 text-white" 
                          />
                        </div>
                        {ctrl.status === 'scheduled' && ctrl.deadlineDate && (
                          <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                            <p className="text-[10px] text-amber-400 italic">
                              Periode ditutup otomatis pada: <br/>
                              <span className="font-bold">{ctrl.deadlineDate} pkl {ctrl.deadlineTime}</span>
                            </p>
                          </div>
                        )}
                        <div className="pt-2 border-t border-white/5 space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Maks Request Per Hari</Label>
                          <div className="flex items-center gap-2">
                            <Input 
                              type="number" 
                              defaultValue={ctrl.maxRequestsPerDay || 7}
                              onBlur={(e) => updateMaxLimit(p.value, parseInt(e.target.value) || 7)}
                              className="field-input h-9 text-white w-20" 
                            />
                            <span className="text-[10px] text-white/30 italic">Orang / Hari</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-white/5 space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Maks Tabungan Libur</Label>
                          <div className="flex items-center gap-2">
                            <Input 
                              type="number" 
                              defaultValue={ctrl.maxAccumulatedLeave || 6}
                              onBlur={(e) => updateMaxAccumulated(p.value, parseInt(e.target.value) || 6)}
                              className="field-input h-9 text-white w-20" 
                            />
                            <span className="text-[10px] text-white/30 italic">Hari / Periode</span>
                          </div>
                        </div>
                        
                        <div className="pt-2 border-t border-white/5 space-y-1">
                           <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Custom Nama Periode</Label>
                           <Input 
                             defaultValue={ctrl.name || ''}
                             placeholder={p.label}
                             onBlur={async (e) => {
                               await setDoc(doc(db, 'periodControls', p.value), { name: e.target.value }, { merge: true });
                             }}
                             className="field-input h-9 text-white"
                           />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Button size="sm" variant="ghost" className="text-white/20 hover:text-rose-400 hover:bg-rose-500/10" onClick={() => handleDelete(p.value)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminKata() {
  const [kata, setKata] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemConfig', 'requestKata'), (doc) => {
      if (doc.exists()) {
        setKata(doc.data().text || '');
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSave = async () => {
    await setDoc(doc(db, 'systemConfig', 'requestKata'), { text: kata });
    alert('Kata-kata berhasil disimpan!');
  };

  return (
    <Card className="glass-panel border-none p-6 text-white">
      <CardHeader>
        <CardTitle>Pengaturan Kata-kata Request</CardTitle>
        <CardDescription className="text-white/60">Teks yang muncul 4 detik sebelum form request:</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea 
          value={kata} 
          onChange={(e) => setKata(e.target.value)}
          className="w-full h-32 field-input p-3 rounded-xl bg-white/5 border border-white/10"
          placeholder="Contoh: Halo! Silakan ajukan request Anda..."
        />
        <Button onClick={handleSave} className="w-full bg-primary">Simpan Kata-kata</Button>
      </CardContent>
    </Card>
  );
}

// --- ADMIN: SHIFTS ---
function AdminShifts({ shifts }: { shifts: Shift[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ name: '', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00' });

  const handleAdd = async () => {
    if (!formData.name) return;
    await addDoc(collection(db, 'shifts'), formData);
    setShowAdd(false);
    setFormData({ name: '', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00' });
  };

  const handleDelete = async (id: string) => {
    const pwd = prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!");
      return;
    }
    if (confirm("Hapus shift ini?")) {
      await deleteDoc(doc(db, 'shifts', id));
    }
  };

  return (
    <Card className="glass-panel border-none shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white">List Shift Kerja</CardTitle>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger className="rounded-xl flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 transition-colors h-10 px-4 py-2 font-medium text-white shadow-sm">
            <Plus className="w-4 h-4" /> Shift Baru
          </DialogTrigger>
          <DialogContent className="glass-panel text-white border-white/20">
            <DialogHeader>
              <DialogTitle className="text-white">Tambah Shift Baru</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">Nama Shift</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Contoh: Shift Pagi" className="field-input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-white/70 text-xs">Mulai</Label>
                  <Input type="time" value={formData.startTime} onChange={(e) => setFormData({...formData, startTime: e.target.value})} className="field-input" />
                </div>
                <div className="grid gap-2">
                  <Label className="text-white/70 text-xs">Selesai</Label>
                  <Input type="time" value={formData.endTime} onChange={(e) => setFormData({...formData, endTime: e.target.value})} className="field-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-white/70 text-xs">Istirahat (S)</Label>
                  <Input type="time" value={formData.breakStart} onChange={(e) => setFormData({...formData, breakStart: e.target.value})} className="field-input" />
                </div>
                <div className="grid gap-2">
                  <Label className="text-white/70 text-xs">Selesai Istirahat</Label>
                  <Input type="time" value={formData.breakEnd} onChange={(e) => setFormData({...formData, breakEnd: e.target.value})} className="field-input" />
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={handleAdd} className="w-full bg-primary hover:bg-primary/80">Simpan Shift</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto no-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent text-white/40">
                <TableHead className="text-white/40 whitespace-nowrap">Nama Shift</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">Jam Kerja</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">Jam Istirahat</TableHead>
                <TableHead className="text-right text-white/40 whitespace-nowrap">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map(s => (
                <TableRow key={s.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-semibold text-white whitespace-nowrap">{s.name}</TableCell>
                  <TableCell className="text-white/70 whitespace-nowrap">{s.startTime} - {s.endTime}</TableCell>
                  <TableCell className="text-white/70 whitespace-nowrap">{s.breakStart} - {s.breakEnd}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="hover:bg-white/10"><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminActivityLog({ employees }: { employees: Employee[] }) {
  const [logs, setLogs] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const getActionName = (log: Attendance) => {
    // Determine the most recent action based on timestamps
    const actions: { label: string, time: any, order: number }[] = [];
    if (log.checkIn) actions.push({ label: 'Masuk', time: log.checkIn, order: 1 });
    if (log.breakStart) actions.push({ label: 'Istirahat', time: log.breakStart, order: 2 });
    if (log.breakEnd) actions.push({ label: 'Selesai Ist.', time: log.breakEnd, order: 3 });
    if (log.checkOut) actions.push({ label: 'Pulang', time: log.checkOut, order: 4 });
    
    // Sort by time descending to find latest
    actions.sort((a, b) => b.time.seconds - a.time.seconds);
    return actions[0]?.label || 'Lainnya';
  };

  useEffect(() => {
    const q = query(collection(db, 'attendance'), orderBy('updatedAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <DialogContent className="glass-panel text-white border-white/20 p-6 max-w-4xl max-h-[80vh] overflow-hidden flex flex-col rounded-[2rem]">
      <DialogHeader>
        <DialogTitle className="text-white text-xl font-bold flex items-center gap-2">
           <History className="w-5 h-5 text-primary" /> Log Aktivitas Karyawan (Terbaru)
        </DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto no-scrollbar py-4">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/40">Karyawan</TableHead>
              <TableHead className="text-white/40">Aksi</TableHead>
              <TableHead className="text-white/40">Waktu</TableHead>
              <TableHead className="text-white/40">Lokasi</TableHead>
              <TableHead className="text-white/40">Foto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map(log => {
              const location = log.location ? JSON.parse(log.location) : null;
              return (
                <TableRow key={log.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-medium text-white">{log.employeeName}</TableCell>
                  <TableCell className="text-white/80 font-bold">{getActionName(log)}</TableCell>
                  <TableCell className="text-white/60 text-xs">
                    {log.date}<br/>
                    <span className="text-[10px] text-white/30 uppercase font-black">
                      {log.updatedAt ? format(toDateSafe(log.updatedAt), 'HH:mm:ss') : '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {location ? (
                      <a href={`https://www.google.com/maps?q=${location.lat},${location.lng}`} target="_blank" rel="noreferrer" 
                         className="flex items-center gap-1 text-[10px] text-blue-400 hover:underline">
                        <MapPin className="w-3 h-3" /> {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                      </a>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {log.photoUrl ? (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedPhoto(log.photoUrl as string)} className="text-[10px] h-7 px-2 bg-white/5 hover:bg-white/10">Lihat Foto</Button>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="glass-panel p-2 border-white/20 max-w-xs rounded-3xl overflow-hidden aspect-[3/4]">
          <img src={selectedPhoto || undefined} alt="Selfie" className="w-full h-full object-cover rounded-2xl" />
        </DialogContent>
      </Dialog>
    </DialogContent>
  );
}

// --- ADMIN: LIVE VIEW ---
function AdminLive({ employees, shifts }: { employees: Employee[], shifts: Shift[] }) {
  const [liveAttendance, setLiveAttendance] = useState<Attendance[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [editingAttendance, setEditingAttendance] = useState<Attendance | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showLibur, setShowLibur] = useState(false);
  const [liburData, setLiburData] = useState({ employeeId: '', date: format(new Date(), 'yyyy-MM-dd') });
  const [editData, setEditData] = useState({
    checkIn: '',
    breakStart: '',
    breakEnd: '',
    checkOut: '',
    status: 'present' as Attendance['status'],
    shiftId: ''
  });
  
  useEffect(() => {
    const formattedDate = format(date, 'yyyy-MM-dd');
    const q = query(collection(db, 'attendance'), where('date', '==', formattedDate));
    const unsub = onSnapshot(q, (snapshot) => {
      setLiveAttendance(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
    }, (err) => console.error("Live attendance error:", err));
    return unsub;
  }, [date]);

  const handleDelete = async (id: string) => {
    const pwd = prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!");
      return;
    }
    if (confirm("Hapus data absen ini?")) {
      await deleteDoc(doc(db, 'attendance', id));
    }
  };

  const triggerEdit = (a: Attendance) => {
    setEditingAttendance(a);
    setEditData({
      checkIn: a.checkIn ? format(toDateSafe(a.checkIn), 'HH:mm') : '',
      breakStart: a.breakStart ? format(toDateSafe(a.breakStart), 'HH:mm') : '',
      breakEnd: a.breakEnd ? format(toDateSafe(a.breakEnd), 'HH:mm') : '',
      checkOut: a.checkOut ? format(toDateSafe(a.checkOut), 'HH:mm') : '',
      status: a.status,
      shiftId: a.shiftId || ''
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editingAttendance) return;
    
    const updatePayload: any = {
      status: editData.status,
      shiftId: editData.shiftId,
      updatedAt: serverTimestamp()
    };

    const baseDateString = editingAttendance.date; // already YYYY-MM-DD
    
    const setTime = (timeStr: string) => {
      if (!timeStr) return null;
      // timeStr is HH:mm
      const [h, m] = timeStr.split(':').map(Number);
      const d = parse(baseDateString, 'yyyy-MM-dd', new Date());
      d.setHours(h, m, 0, 0);
      return Timestamp.fromDate(d);
    };

    updatePayload.checkIn = setTime(editData.checkIn);
    updatePayload.breakStart = setTime(editData.breakStart);
    updatePayload.breakEnd = setTime(editData.breakEnd);
    updatePayload.checkOut = setTime(editData.checkOut);

    await updateDoc(doc(db, 'attendance', editingAttendance.id), updatePayload);
    setShowEdit(false);
    setEditingAttendance(null);
  };

  const handleSetLibur = async () => {
    if (!liburData.employeeId || !liburData.date) return alert("Pilih karyawan dan tanggal!");
    
    // Check if record already exists for this employee and date
    const q = query(
      collection(db, 'attendance'), 
      where('employeeId', '==', liburData.employeeId),
      where('date', '==', liburData.date)
    );
    const snap = await getDocs(q);
    const emp = employees.find(e => e.id === liburData.employeeId);
    
    if (!snap.empty) {
      await updateDoc(doc(db, 'attendance', snap.docs[0].id), {
        status: 'day-off',
        checkIn: null,
        checkOut: null,
        breakStart: null,
        breakEnd: null,
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, 'attendance'), {
        employeeId: liburData.employeeId,
        employeeName: emp?.name || 'Unknown',
        date: liburData.date,
        status: 'day-off',
        updatedAt: serverTimestamp()
      });
    }
    
    setShowLibur(false);
    setLiburData({ employeeId: '', date: format(new Date(), 'yyyy-MM-dd') });
  };

  const stats = {
    total: employees.length,
    present: liveAttendance.length,
    absent: employees.length - liveAttendance.length
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Total Karyawan" value={stats.total} icon={<Users className="text-blue-400" />} />
        <StatCard label="Hadir Hari Ini" value={stats.present} icon={<BadgeCheck className="text-emerald-400" />} />
        <StatCard label="Belum Absen" value={stats.absent} icon={<Clock className="text-white/20" />} />
      </div>

      <Card className="glass-panel border-none shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white">Log Kehadiran: <span className="text-white/60 font-medium">{format(date, 'd MMMM yyyy')}</span></CardTitle>
          <div className="flex gap-2">
            <Dialog open={showEdit} onOpenChange={setShowEdit}>
              <DialogContent className="glass-panel text-white border-white/20">
                <DialogHeader>
                  <DialogTitle className="text-white font-bold">Edit Absensi: {editingAttendance?.employeeName}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="grid gap-2 col-span-2">
                    <Label className="text-white/70 text-xs text-left">Pilih Shift</Label>
                    <Select value={editData.shiftId} onValueChange={(v) => setEditData({...editData, shiftId: v})}>
                      <SelectTrigger className="field-input text-white border-white/10 h-14 rounded-2xl px-4">
                        <SelectValue placeholder="Pilih Shift">
                          {editData.shiftId ? shifts.find(s => s.id === editData.shiftId)?.name : "Pilih Shift"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="glass-panel border-white/10 text-white rounded-2xl">
                        {shifts.map(s => <SelectItem key={s.id} value={s.id} className="hover:bg-white/10 py-3">{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-white/70 text-xs">Jam Masuk</Label>
                    <Input type="time" value={editData.checkIn} onChange={(e) => setEditData({...editData, checkIn: e.target.value})} className="field-input" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-white/70 text-xs">Mulai Istirahat</Label>
                    <Input type="time" value={editData.breakStart} onChange={(e) => setEditData({...editData, breakStart: e.target.value})} className="field-input" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-white/70 text-xs">Selesai Istirahat</Label>
                    <Input type="time" value={editData.breakEnd} onChange={(e) => setEditData({...editData, breakEnd: e.target.value})} className="field-input" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-white/70 text-xs">Jam Pulang</Label>
                    <Input type="time" value={editData.checkOut} onChange={(e) => setEditData({...editData, checkOut: e.target.value})} className="field-input" />
                  </div>
                  <div className="grid gap-2 col-span-2">
                    <Label className="text-white/70 text-xs">Status</Label>
                    <Select value={editData.status} onValueChange={(v: any) => setEditData({...editData, status: v})}>
                      <SelectTrigger className="field-input text-white border-white/10"><SelectValue /></SelectTrigger>
                      <SelectContent className="glass-panel border-white/10 text-white">
                        <SelectItem value="present">HADIR</SelectItem>
                        <SelectItem value="late">TERLAMBAT</SelectItem>
                        <SelectItem value="half-day">STENGAH HARI</SelectItem>
                        <SelectItem value="absent">ALPHA</SelectItem>
                        <SelectItem value="day-off">LIBUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleUpdate} className="w-full bg-primary hover:bg-primary/80">SIMPAN PERUBAHAN</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={showLibur} onOpenChange={setShowLibur}>
              <DialogTrigger className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-md text-sm font-medium text-white transition-colors hover:bg-white/10 glass-panel shadow-sm h-10">
                <CalendarIcon className="w-4 h-4 text-blue-400" /> Atur Libur
              </DialogTrigger>
            <DialogContent className="bg-black/95 text-white border-white/20 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-white text-xl">Atur Karyawan Libur</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label className="text-white/70 text-xs">Cari Karyawan (Nama / PIN)</Label>
                    <div className="relative">
                      <Input 
                        placeholder="Ketik nama atau PIN..." 
                        className="field-input h-12 rounded-xl pl-4 pr-10"
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase();
                          const found = employees.find(e => e.name.toLowerCase().includes(val) || (e as any).pin?.includes(val));
                          if (found) setLiburData({...liburData, employeeId: found.id});
                        }}
                      />
                      <div className="absolute right-3 top-3 text-white/50 text-xs font-mono">
                        {employees.find(e => e.id === liburData.employeeId)?.name || '...'}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-white/70 text-xs">Tanggal Libur</Label>
                    <Input type="date" value={liburData.date} onChange={(e) => setLiburData({...liburData, date: e.target.value})} className="field-input h-12 rounded-xl" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSetLibur} className="w-full bg-blue-600 hover:bg-blue-700 h-12 font-bold">TETAPKAN LIBUR</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Popover>
              <PopoverTrigger className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-white/10 rounded-md text-sm font-medium text-white transition-colors hover:bg-white/10 glass-panel shadow-sm">
                <CalendarIcon className="w-4 h-4" /> Ganti Tanggal
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 glass-panel border-white/20"><Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="text-white" /></PopoverContent>
            </Popover>

            <Dialog open={showActivity} onOpenChange={setShowActivity}>
              <DialogTrigger className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary/20 border border-primary/20 rounded-md text-xs font-bold text-primary hover:bg-primary/30 transition-all whitespace-nowrap">
                <History className="w-3 h-3" /> Cek Activity
              </DialogTrigger>
              <AdminActivityLog employees={employees} />
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto no-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 text-white/40 hover:bg-transparent">
                  <TableHead className="text-white/40 whitespace-nowrap">Nama Karyawan</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Shift</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Masuk</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Istirahat</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Pulang</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Statistik</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveAttendance.map(a => {
                  const shift = shifts.find(s => s.id === a.shiftId);
                  const statsData = shift ? calculateAttendanceStats(a, shift) : { late: 0, earlyLeave: 0, overtime: 0 };
                  
                  return (
                    <TableRow key={a.id} className="border-white/5 hover:bg-white/5">
                      <TableCell className="font-semibold text-white whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{a.employeeName}</span>
                          <span className="text-[9px] text-white/30 uppercase tracking-tighter">
                            {a.status === 'day-off' ? 'LIBUR' : a.status === 'present' ? 'HADIR' : a.status === 'late' ? 'TERLAMBAT' : a.status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-white/60 text-xs whitespace-nowrap">{shift?.name || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-white/70 font-mono">{a.checkIn ? format(toDateSafe(a.checkIn), 'HH:mm') : '-'}</span>
                          {statsData.late > 0 && <span className="text-[9px] text-rose-400 font-bold">Telat: {formatDuration(statsData.late)}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col text-[10px]">
                          <span className="text-white/40">S: {a.breakStart ? format(toDateSafe(a.breakStart), 'HH:mm') : '-'}</span>
                          <span className="text-white/40">E: {a.breakEnd ? format(toDateSafe(a.breakEnd), 'HH:mm') : '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-white/70 font-mono">{a.checkOut ? format(toDateSafe(a.checkOut), 'HH:mm') : '-'}</span>
                          {statsData.earlyLeave > 0 && <span className="text-[9px] text-rose-400 font-bold">P.Awal: {formatDuration(statsData.earlyLeave)}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {statsData.overtime > 0 && (
                            <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-[9px] px-1 h-4">
                              Lembur: {formatDuration(statsData.overtime)}
                            </Badge>
                          )}
                          {statsData.late === 0 && a.checkIn && (
                            <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-[9px] px-1 h-4">
                              Tepat Waktu
                            </Badge>
                          )}
                          {a.status === 'day-off' && (
                            <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-400 text-[9px] px-1 h-4">
                              LIBUR
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => triggerEdit(a)} className="hover:bg-white/10 transition-colors">
                          <Edit className="w-4 h-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} className="hover:bg-white/10 transition-colors">
                          <Trash2 className="w-4 h-4 text-rose-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {liveAttendance.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-white/30 italic">Belum ada data absensi untuk tanggal ini.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- ADMIN: LEAVE REQUESTS ---
function AdminLeave({ employees, sections, divisions }: { employees: Employee[], sections: Section[], divisions: Division[] }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [controls, setControls] = useState<Record<string, any>>({});
  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const [selectedPeriod, setSelectedPeriod] = useState(""); 
  const [selectedDivision, setSelectedDivision] = useState<string>(divisions[0]?.name || 'Depan');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
      const data: Record<string, any> = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setControls(data);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedPeriod && periodOptions.length > 0) {
      // Find current month if possible
      const now = format(new Date(), 'yyyy-MM-dd');
      const current = periodOptions.find(p => now >= format(p.start, 'yyyy-MM-dd') && now <= format(p.end, 'yyyy-MM-dd'));
      setSelectedPeriod(current ? current.value : periodOptions[0].value);
    }
  }, [periodOptions]);

  useEffect(() => {
    if (divisions.length > 0 && !divisions.find(d => d.name === selectedDivision)) {
      setSelectedDivision(divisions[0].name);
    }
  }, [divisions]);

  useEffect(() => {
    const q = query(
      collection(db, 'leaveRequests'), 
      where('period', '==', selectedPeriod),
      where('division', '==', selectedDivision),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => setRequests(snap.docs.map(d => ({id: d.id, ...d.data()} as LeaveRequest))), (err) => console.error("Admin leave error:", err));
    return unsub;
  }, [selectedPeriod, selectedDivision]);

  const handleExport = () => {
    setExportLoading(true);
    try {
      const data = requests.map(r => ({
        'Nama Karyawan': r.employeeName,
        'Bagian': sections.find(s => s.id === r.sectionId)?.name || '-',
        'Divisi': r.division,
        'Alasan': r.reason,
        'Periode': r.period,
        'Libur 1': r.date1 || '-',
        'Libur 2': r.date2 || '-',
        'Libur 3': r.date3 || '-',
        'Libur 4': r.date4 || '-',
        'Libur 5': r.date5 || '-',
        'Libur 6': r.date6 || '-',
        'Dibuat Pada': r.createdAt ? format(toDateSafe(r.createdAt), 'dd/MM/yyyy HH:mm') : '-'
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Request Libur ${selectedDivision}`);
      XLSX.writeFile(wb, `Rekap_Liburan_${selectedDivision}_${selectedPeriod}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const pwd = prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!");
      return;
    }
    if (confirm("Hapus request libur ini?")) {
      await deleteDoc(doc(db, 'leaveRequests', id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center mb-2 overflow-x-auto no-scrollbar">
        <Tabs value={selectedDivision} onValueChange={(v: any) => setSelectedDivision(v)} className="w-full">
          <TabsList className={`grid w-full glass-panel border-white/10 p-1 h-12 bg-black/20`} style={{ gridTemplateColumns: `repeat(${Math.max(divisions.length, 1)}, 1fr)` }}>
            {divisions.map(div => (
              <TabsTrigger key={div.id} value={div.name} className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white text-white/70 font-bold uppercase tracking-widest text-[10px] sm:text-xs">
                {div.name}
              </TabsTrigger>
            ))}
            {divisions.length === 0 && (
              <TabsTrigger value="Depan" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white text-white/70 font-bold uppercase tracking-widest text-xs">Depan</TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </div>

      <Card className="glass-panel border-none shadow-lg overflow-hidden">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-white font-bold">Request Libur - Bagian {selectedDivision}</CardTitle>
            <CardDescription className="text-white/50">Daftar karyawan {selectedDivision} yang sudah mengajukan libur.</CardDescription>
          </div>
          <div className="flex gap-4">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[200px] glass-panel border-white/10 text-white">
                <SelectValue placeholder="Pilih Periode" />
              </SelectTrigger>
              <SelectContent className="glass-panel border-white/20 text-white">
                {periodOptions.map(p => (
                  <SelectItem key={p.value} value={p.value} className="hover:bg-white/10">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleExport} disabled={exportLoading || requests.length === 0} variant="outline" className="flex gap-2 glass-panel border-white/10 text-white hover:bg-white/10 shadow-lg">
              <Download className="w-4 h-4" /> Export Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 text-white/40 hover:bg-transparent">
                  <TableHead className="text-white/40 min-w-[150px]">Nama Karyawan</TableHead>
                  <TableHead className="text-white/40">Bagian</TableHead>
                  <TableHead className="text-white/40">Alasan</TableHead>
                  <TableHead className="text-white/40">Libur 1</TableHead>
                  <TableHead className="text-white/40">Libur 2</TableHead>
                  <TableHead className="text-white/40">Libur 3</TableHead>
                  <TableHead className="text-white/40">Libur 4</TableHead>
                  <TableHead className="text-white/40">Libur 5</TableHead>
                  <TableHead className="text-white/40">Libur 6</TableHead>
                  <TableHead className="text-right text-white/40">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(r => (
                  <TableRow key={r.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-bold text-white">{r.employeeName}</TableCell>
                    <TableCell className="text-white/50 text-xs">{sections.find(s => s.id === r.sectionId)?.name || '-'}</TableCell>
                    <TableCell className="text-white/60 text-xs italic">"{r.reason}"</TableCell>
                    <TableCell className="text-white/60 text-xs">{r.date1 ? format(new Date(r.date1), 'dd/MM') : '-'}</TableCell>
                    <TableCell className="text-white/60 text-xs">{r.date2 ? format(new Date(r.date2), 'dd/MM') : '-'}</TableCell>
                    <TableCell className="text-white/60 text-xs">{r.date3 ? format(new Date(r.date3), 'dd/MM') : '-'}</TableCell>
                    <TableCell className="text-white/60 text-xs">{r.date4 ? format(new Date(r.date4), 'dd/MM') : '-'}</TableCell>
                    <TableCell className="text-white/60 text-xs">{r.date5 ? format(new Date(r.date5), 'dd/MM') : '-'}</TableCell>
                    <TableCell className="text-white/60 text-xs">{r.date6 ? format(new Date(r.date6), 'dd/MM') : '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} className="hover:bg-white/10"><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {requests.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-white/30 italic">Belum ada request libur di bagian {selectedDivision}.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- EMPLOYEE: LEAVE REQUEST ---
function EmployeeLeave({ employee, sections }: { employee: Employee, sections: Section[] }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [periodQuota, setPeriodQuota] = useState(0);
  const [periodControl, setPeriodControl] = useState<any>(null);
  const [controls, setControls] = useState<Record<string, any>>({});
  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
      const data: Record<string, any> = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setControls(data);
    });
    return unsub;
  }, []);
  const [showMusicPopup, setShowMusicPopup] = useState(false);
  const [musicPopupText, setMusicPopupText] = useState('Silakan ajukan request libur Anda.');
  const [requestKata, setRequestKata] = useState('');

  const [formData, setFormData] = useState({ 
    date1: '', date2: '', date3: '', date4: '', date5: '', date6: '',
    reason: '',
    sectionId: ''
  });
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemConfig', 'requestKata'), (doc) => {
        if (doc.exists()) {
            setRequestKata(doc.data().text || '');
        }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemConfig', 'musicSettings'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.url) {
          audioRef.current = new Audio(data.url);
          audioRef.current.loop = true;
        }
        if (data.popupText) {
          setMusicPopupText(data.popupText);
        }
      }
    });
    return unsub;
  }, []);

  const playMusic = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.error("Error playing music:", e));
    }
  };

  const stopMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleRequestClick = () => {
    // Pre-populate form with existing request if it exists
    if (requests && requests.length > 0) {
      const r = requests[0];
      setFormData({
        date1: r.date1 || '',
        date2: r.date2 || '',
        date3: r.date3 || '',
        date4: r.date4 || '',
        date5: r.date5 || '',
        date6: r.date6 || '',
        reason: r.reason || '',
        sectionId: r.sectionId || ''
      });
    } else {
      setFormData({ date1: '', date2: '', date3: '', date4: '', date5: '', date6: '', reason: '', sectionId: '' });
    }

    setShowMusicPopup(true);
    setMusicPopupText(requestKata || 'Silakan ajukan request libur Anda.');
    playMusic();
    
    setTimeout(() => {
      setShowMusicPopup(false);
      setShowAdd(true);
    }, 6000);
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
      const activePeriods: string[] = [];
      snap.forEach(d => { 
        const status = d.data().status;
        if (status === 'open' || status === 'scheduled') activePeriods.push(d.id);
      });
      if (activePeriods.length > 0) setSelectedPeriod(activePeriods[0]);
      else setSelectedPeriod("");
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    const unsub = onSnapshot(doc(db, 'periodControls', selectedPeriod), (snap) => {
      setPeriodControl(snap.exists() ? snap.data() : { status: 'open' });
    });
    return unsub;
  }, [selectedPeriod]);

  useEffect(() => {
    // 1. Calculate Period Quota with Carryover
    const currentIndex = periodOptions.findIndex(p => p.value === selectedPeriod);
    const prevPeriod = currentIndex > 0 ? periodOptions[currentIndex - 1] : null;

    const fetchQuota = async () => {
      // To calculate carryover with accumulation, we need to process periods sequentially from oldest to current
      // Since periodOptions is newest first, we slice from currentIndex to the end (oldest) and reverse it
      const allPeriodsToProcess = periodOptions.slice(currentIndex).reverse();
      
      let runningCarryover = 0;
      let finalEffectiveQuota = employee.leaveQuota || 4;

      for (const p of allPeriodsToProcess) {
        // 1. Get base quota for this period
        const quotaSnap = await getDoc(doc(db, 'periodQuotas', `${employee.id}_${p.value}`));
        const baseQuota = quotaSnap.exists() ? (quotaSnap.data()?.quota ?? (employee.leaveQuota || 4)) : (employee.leaveQuota || 4);
        
        // 2. Effective quota (Base + Carryover), capped at custom max or 6
        const pCtrl = controls[p.value];
        const maxStored = pCtrl?.maxAccumulatedLeave ?? 6;
        const effectiveQuota = Math.min(baseQuota + runningCarryover, maxStored);
        
        // If this is the selected period, we stop here and set this as the available quota
        if (p.value === selectedPeriod) {
          finalEffectiveQuota = effectiveQuota;
          break;
        }

        // 3. Calculate used days in THIS period to find carryover for NEXT period
        const requestsSnap = await getDocs(query(
          collection(db, 'leaveRequests'),
          where('employeeId', '==', employee.id),
          where('period', '==', p.value)
        ));

        const used = requestsSnap.docs.reduce((acc, d) => {
          const r = d.data();
          let count = 0;
          if (r.date1) count++; if (r.date2) count++; if (r.date3) count++;
          if (r.date4) count++; if (r.date5) count++; if (r.date6) count++;
          return acc + count;
        }, 0);

        // 4. Carryover to next month is whatever is left from 'effectiveQuota'
        runningCarryover = Math.max(0, effectiveQuota - used);
      }

      setPeriodQuota(finalEffectiveQuota);
    };

    fetchQuota();

    const q = query(
      collection(db, 'leaveRequests'), 
      where('period', '==', selectedPeriod),
      where('division', '==', employee.division || 'Depan'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({id: d.id, ...d.data()} as LeaveRequest));
      setAllRequests(data);
      setRequests(data.filter(r => r.employeeId === employee.id));
    }, (err) => console.error("Employee leave error:", err));
    
    return () => {
      unsub();
    };
  }, [employee.id, selectedPeriod, employee.division, controls, periodOptions]);

  const handleSubmit = async () => {
    // Validate period status
    if (periodControl) {
      if (periodControl.status === 'closed') {
        const currentPeriodValue = format(new Date(), 'yyyy-MM');
        const msg = selectedPeriod > currentPeriodValue ? "Maaf, periode request libur ini BELUM DIBUKA oleh Admin." : "Maaf, periode request libur ini SUDAH DITUTUP oleh Admin.";
        return alert(msg);
      }
      if (periodControl.status === 'scheduled' && periodControl.deadlineDate) {
        const now = new Date();
        const deadlineStr = `${periodControl.deadlineDate} ${periodControl.deadlineTime || '17:00'}`;
        const deadline = parse(deadlineStr, 'yyyy-MM-dd HH:mm', new Date());
        if (isAfter(now, deadline)) {
          return alert(`Maaf, batas waktu request libur untuk periode ini sudah berakhir (${deadlineStr}).`);
        }
      }
    }

    if (!formData.reason) return alert("Isi alasan libur!");
    if (!formData.sectionId) return alert("Pilih bagian!");
    const selectedDates = [formData.date1, formData.date2, formData.date3, formData.date4, formData.date5, formData.date6].filter(d => d !== '');
    if (selectedDates.length === 0) return alert("Pilih setidaknya satu tanggal libur!");

    // Check if enough quota
    if (selectedDates.length > periodQuota) {
      return alert(`Jatah libur Anda tidak mencukupi (Sisa: ${periodQuota} hari).`);
    }

    // Validate dates belong to the selected period
    const period = periodOptions.find(p => p.value === selectedPeriod);
    if (period) {
      for (const d of selectedDates) {
        const dateObj = d ? new Date(d) : new Date();
        if (isBefore(dateObj, startOfDay(period.start)) || isAfter(dateObj, endOfDay(period.end))) {
          return alert(`Tanggal ${d} berada di luar periode ${period.label}`);
        }
      }
    }

    // Check limit per day per division
    const maxLimit = periodControl?.maxRequestsPerDay || 7;
    for (const d of selectedDates) {
      const count = allRequests.filter(r => 
        r.employeeId !== employee.id && 
        (r.date1 === d || r.date2 === d || r.date3 === d || r.date4 === d || r.date5 === d || r.date6 === d)
      ).length;

      if (count >= maxLimit) {
        return alert(`Tanggal ${d ? format(new Date(d), 'dd MMM yyyy') : '-'} sudah penuh (maks ${maxLimit} orang di divisi ${employee.division}).`);
      }
    }

    // Single row per employee per period
    await setDoc(doc(db, 'leaveRequests', `${employee.id}_${selectedPeriod}`), {
      ...formData,
      employeeId: employee.id,
      employeeName: employee.name,
      division: employee.division || 'Depan',
      period: selectedPeriod,
      status: 'approved', // Auto approved
      createdAt: serverTimestamp()
    });
    setShowAdd(false);
    stopMusic();
    setFormData({ date1: '', date2: '', date3: '', date4: '', date5: '', date6: '', reason: '', sectionId: '' });
  };

  const usedDays = requests.reduce((acc, r) => {
    let count = 0;
    if (r.date1) count++; if (r.date2) count++; if (r.date3) count++;
    if (r.date4) count++; if (r.date5) count++; if (r.date6) count++;
    return acc + count;
  }, 0);

  const usageMap: Record<string, number> = {};
  allRequests.forEach(r => {
    [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6].forEach(d => {
      if (d) usageMap[d] = (usageMap[d] || 0) + 1;
    });
  });

  const popularDates = Object.entries(usageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const isPeriodClosedFlag = () => {
    if (!periodControl) return false;
    if (periodControl.status === 'closed') return true;
    if (periodControl.status === 'scheduled' && periodControl.deadlineDate) {
      const now = new Date();
      const deadlineStr = `${periodControl.deadlineDate} ${periodControl.deadlineTime || '17:00'}`;
      try {
        const deadline = parse(deadlineStr, 'yyyy-MM-dd HH:mm', new Date());
        return isAfter(now, deadline);
      } catch (e) { return false; }
    }
    return false;
  };

  const isClosed = isPeriodClosedFlag();
  const currentPeriodValue = format(new Date(), 'yyyy-MM');

  return (
    <div className="space-y-6 mt-8 pb-12 text-white">
      {/* Improved Music & Words Popup using motion for reliability */}
      <AnimatePresence>
        {showMusicPopup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-panel p-10 rounded-3xl border border-white/20 max-w-md w-full text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-8 mx-auto ring-4 ring-primary/10">
                  <Music className="w-10 h-10 text-primary animate-bounce" />
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white mb-4 leading-tight italic decoration-primary underline decoration-4 underline-offset-8">
                {musicPopupText}
              </h2>
              <div className="flex flex-col items-center gap-3 mt-8">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      className="w-2 h-2 bg-primary rounded-full"
                    />
                  ))}
                </div>
                <p className="text-white/40 uppercase tracking-[0.3em] text-[10px] font-bold">Harap tunggu sebentar</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel p-4 rounded-2xl border-white/5">
        <div>
          <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-1">Divisi: <span className="text-primary">{employee.division || 'Depan'}</span> | Periode Aktif</p>
          <div className="w-[300px] h-12 glass-panel border border-white/10 text-white font-bold flex items-center px-4 rounded-xl">
             {selectedPeriod ? periodOptions.find(p => p.value === selectedPeriod)?.label || selectedPeriod : "Tidak ada periode aktif"}
          </div>
          {periodControl && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className={`border-none px-2 py-0 text-[10px] font-bold ${
                periodControl.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' :
                periodControl.status === 'closed' ? 'bg-rose-500/20 text-rose-400' :
                'bg-amber-500/20 text-amber-400'
              }`}>
                {periodControl.status === 'open' ? 'REQUEST DIBUKA' : 
                 periodControl.status === 'closed' ? (selectedPeriod > currentPeriodValue ? 'REQUEST BELUM DIBUKA' : 'REQUEST SUDAH DITUTUP') : 
                 'BATAS WAKTU AKTIF'}
              </Badge>
              {periodControl.status === 'scheduled' && (
                <span className="text-[10px] text-white/30 italic">
                  Sampai: {periodControl.deadlineDate} {periodControl.deadlineTime}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-4">
            <StatCard label="Total Kuota" value={periodQuota} icon={<CalendarIcon className="text-blue-400 w-4 h-4" />} size="sm" />
            <StatCard label="Digunakan" value={usedDays} icon={<BadgeCheck className="text-emerald-400 w-4 h-4" />} size="sm" />
            <StatCard label="Sisa Kuota" value={Math.max(0, periodQuota - usedDays)} icon={<Clock className="text-amber-400 w-4 h-4" />} size="sm" />
          </div>
          <p className="text-[9px] text-white/30 italic mr-2 text-right">
            * Maksimal Kuota: 6 hari (termasuk sisa periode lalu yang terakumulasi otomatis).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-panel border-none shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white text-lg">Input Tanggal Libur Saya</CardTitle>
                <CardDescription className="text-white/40">Isi tanggal libur yang diinginkan (Maks. 6 hari)</CardDescription>
              </div>
              <Dialog open={showAdd} onOpenChange={(val) => {
                setShowAdd(val);
                if (!val) stopMusic();
              }}>
                 {/* No DialogTrigger here, we open it via handleRequestClick after 4s */}
                 {(() => {
                    if (!selectedPeriod) {
                      return <Button className="bg-rose-500/20 text-rose-300 rounded-xl px-4 py-2 text-sm font-bold">Belum ada request yang dibuka</Button>
                    }
                    return (
                      <Button 
                        disabled={isClosed}
                        onClick={handleRequestClick}
                        className={`inline-flex items-center justify-center h-10 px-4 py-2 text-white rounded-xl shadow-lg transition-colors font-bold text-sm gap-2 border-none ${isClosed ? 'bg-white/5 text-white/20' : 'bg-primary hover:bg-primary/80'}`}
                      >
                        {isClosed ? <AlertCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {isClosed ? 'REQUEST DITUTUP' : 'Buat/Edit Request'}
                      </Button>
                    )
                  })()}
                
                <DialogContent className="glass-panel text-white border-white/20 sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle className="text-white">Form Request Libur</DialogTitle>
                    <DialogDescription className="text-white/60">Tentukan tanggal libur Anda. Maksimal {periodControl?.maxRequestsPerDay || 7} orang per hari di divisi {employee.division}.</DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="grid gap-1.5"><Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Libur Ke-1</Label><Input type="date" value={formData.date1} onChange={(e) => setFormData({...formData, date1: e.target.value})} className="field-input text-xs" /></div>
                    <div className="grid gap-1.5"><Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Libur Ke-2</Label><Input type="date" value={formData.date2} onChange={(e) => setFormData({...formData, date2: e.target.value})} className="field-input text-xs" /></div>
                    <div className="grid gap-1.5"><Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Libur Ke-3</Label><Input type="date" value={formData.date3} onChange={(e) => setFormData({...formData, date3: e.target.value})} className="field-input text-xs" /></div>
                    <div className="grid gap-1.5"><Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Libur Ke-4</Label><Input type="date" value={formData.date4} onChange={(e) => setFormData({...formData, date4: e.target.value})} className="field-input text-xs" /></div>
                    <div className="grid gap-1.5"><Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Libur Ke-5</Label><Input type="date" value={formData.date5} onChange={(e) => setFormData({...formData, date5: e.target.value})} className="field-input text-xs" /></div>
                    <div className="grid gap-1.5"><Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Libur Ke-6</Label><Input type="date" value={formData.date6} onChange={(e) => setFormData({...formData, date6: e.target.value})} className="field-input text-xs" /></div>
                    <div className="grid gap-1.5 col-span-2">
                      <Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Bagian (Wajib)</Label>
                      <Select value={formData.sectionId} onValueChange={(val) => setFormData({...formData, sectionId: val})}>
                        <SelectTrigger className="field-input text-xs text-white border-white/10">
                          <SelectValue placeholder="Pilih Bagian">
                            {sections.find(s => s.id === formData.sectionId)?.name}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="glass-panel border-white/10 text-white">
                          {sections.filter(s => (s.division || 'Depan') === (employee.division || 'Depan')).map(s => <SelectItem key={s.id} value={s.id} className="hover:bg-white/10">{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5 col-span-2">
                      <Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Alasan (Wajib)</Label>
                      <Input value={formData.reason} onChange={(e) => setFormData({...formData, reason: e.target.value})} placeholder="Contoh: Keperluan keluarga" className="field-input text-xs" />
                    </div>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-[10px] text-white/50 space-y-1">
                    <p className="font-bold text-amber-400 uppercase tracking-tight">Perhatian:</p>
                    <p>Kuota limit libur maksimal {periodControl?.maxRequestsPerDay || 7} orang per hari per divisi.</p>
                    <p className="mt-2 italic">Jika tanggal yang mau kamu pilih sudah penuh, dan kamu sangat membutuhkan tgl itu (urgent), cobalah diskusikan ke teman2 yg sudah memilih tgl tersebut siapa tau ada yg mau mengalah. #Mengalah bukan berarti kalah ☺️</p>
                  </div>
                  <DialogFooter className="mt-4">
                    <Button onClick={handleSubmit} className="w-full bg-primary hover:bg-primary/80 font-bold shadow-lg">Submit Request Libur</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 text-white/40 hover:bg-transparent">
                      <TableHead className="text-white/40">Status</TableHead>
                      <TableHead className="text-white/40">Bagian</TableHead>
                      <TableHead className="text-white/40">Alasan</TableHead>
                      <TableHead className="text-white/40 text-[10px]">Tgl 1</TableHead>
                      <TableHead className="text-white/40 text-[10px]">Tgl 2</TableHead>
                      <TableHead className="text-white/40 text-[10px]">Tgl 3</TableHead>
                      <TableHead className="text-white/40 text-[10px]">Tgl 4</TableHead>
                      <TableHead className="text-white/40 text-[10px]">Tgl 5</TableHead>
                      <TableHead className="text-white/40 text-[10px]">Tgl 6</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map(r => (
                      <TableRow key={r.id} className="border-white/5 hover:bg-white/5">
                        <TableCell>
                          <Badge variant="outline" className="border-none bg-emerald-500/20 text-emerald-400 capitalize">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-white/50 text-xs">{sections.find(s => s.id === r.sectionId)?.name || '-'}</TableCell>
                        <TableCell className="text-white/60 text-xs truncate max-w-[100px]" title={r.reason}>{r.reason}</TableCell>
                        <TableCell className="text-white/60 text-[10px]">{r.date1 || '-'}</TableCell>
                        <TableCell className="text-white/60 text-[10px]">{r.date2 || '-'}</TableCell>
                        <TableCell className="text-white/60 text-[10px]">{r.date3 || '-'}</TableCell>
                        <TableCell className="text-white/60 text-[10px]">{r.date4 || '-'}</TableCell>
                        <TableCell className="text-white/60 text-[10px]">{r.date5 || '-'}</TableCell>
                        <TableCell className="text-white/60 text-[10px]">{r.date6 || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {requests.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-white/30 italic">Anda belum mengajukan request libur.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* List of others */}
          <Card className="glass-panel border-none shadow-xl">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /> Daftar Request Divisi {employee.division}</CardTitle>
              <CardDescription className="text-white/40">Gunakan daftar ini untuk melihat tanggal mana saja yang sudah ramai di divisi Anda.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 text-white/40 hover:bg-transparent">
                      <TableHead className="text-white/40 sticky top-0 bg-[#0F172A]/80 backdrop-blur-md">Nama</TableHead>
                      <TableHead className="text-white/40 text-[10px] sticky top-0 bg-[#0F172A]/80 backdrop-blur-md">Tgl 1</TableHead>
                      <TableHead className="text-white/40 text-[10px] sticky top-0 bg-[#0F172A]/80 backdrop-blur-md">Tgl 2</TableHead>
                      <TableHead className="text-white/40 text-[10px] sticky top-0 bg-[#0F172A]/80 backdrop-blur-md">Tgl 3</TableHead>
                      <TableHead className="text-white/40 text-[10px] sticky top-0 bg-[#0F172A]/80 backdrop-blur-md">Tgl 4</TableHead>
                      <TableHead className="text-white/40 text-[10px] sticky top-0 bg-[#0F172A]/80 backdrop-blur-md">Tgl 5</TableHead>
                      <TableHead className="text-white/40 text-[10px] sticky top-0 bg-[#0F172A]/80 backdrop-blur-md">Tgl 6</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRequests.filter(r => r.employeeId !== employee.id).map(r => (
                      <TableRow key={r.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="font-semibold text-white/80">{r.employeeName}</TableCell>
                        <TableCell className="text-white/40 text-[10px]">{r.date1 ? format(new Date(r.date1), 'dd/MM') : '-'}</TableCell>
                        <TableCell className="text-white/40 text-[10px]">{r.date2 ? format(new Date(r.date2), 'dd/MM') : '-'}</TableCell>
                        <TableCell className="text-white/40 text-[10px]">{r.date3 ? format(new Date(r.date3), 'dd/MM') : '-'}</TableCell>
                        <TableCell className="text-white/40 text-[10px]">{r.date4 ? format(new Date(r.date4), 'dd/MM') : '-'}</TableCell>
                        <TableCell className="text-white/40 text-[10px]">{r.date5 ? format(new Date(r.date5), 'dd/MM') : '-'}</TableCell>
                        <TableCell className="text-white/40 text-[10px]">{r.date6 ? format(new Date(r.date6), 'dd/MM') : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar info */}
        <div className="space-y-6">
          <Card className="glass-panel border-none shadow-xl bg-primary/5">
            <CardHeader>
              <CardTitle className="text-white text-md">Tanggal Paling Padat ({employee.division})</CardTitle>
              <CardDescription className="text-white/40">Batas: {periodControl?.maxRequestsPerDay || 7} orang / hari</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {popularDates.map(([d, count]) => (
                <div key={d} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-white/70">{d ? format(new Date(d), 'dd MMMM yyyy') : '-'}</span>
                    <span className={`text-[10px] font-bold ${count >= (periodControl?.maxRequestsPerDay || 7) ? 'text-rose-400' : 'text-primary'}`}>{count}/{periodControl?.maxRequestsPerDay || 7}</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / (periodControl?.maxRequestsPerDay || 7)) * 100}%` }}
                      className={`h-full ${count >= (periodControl?.maxRequestsPerDay || 7) ? 'bg-rose-500' : count >= (periodControl?.maxRequestsPerDay || 7) * 0.7 ? 'bg-amber-500' : 'bg-primary'}`} 
                    />
                  </div>
                </div>
              ))}
              {popularDates.length === 0 && <p className="text-xs text-white/30 italic">Belum ada request untuk divisi {employee.division}.</p>}
            </CardContent>
          </Card>

          <Card className="glass-panel border-none shadow-xl bg-white/5">
            <CardHeader>
              <CardTitle className="text-white text-md">Info Request Libur</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-white/60">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1" />
                <p>Request libur otomatis <span className="text-emerald-500 font-bold uppercase">Berlaku</span> selama kuota tersedia (Maks. {periodControl?.maxRequestsPerDay || 7} orang/hari/divisi).</p>
              </div>
              <p className="border-t border-white/10 pt-4 text-[10px] italic text-white/30">Daftar di atas hanya menampilkan request dari divisi <span className="text-white/60 font-bold">{employee.division}</span>. Anda tidak dapat melihat atau bersaing kuota dengan divisi lain.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- ADMIN: REPORTS ---
function AdminManualAttendance({ employees, divisions }: { employees: Employee[], divisions: Division[] }) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [manualData, setManualData] = useState<Record<string, string>>({});
  const [exportStart, setExportStart] = useState<Date>(new Date());
  const [exportEnd, setExportEnd] = useState<Date>(new Date());
  const [isExporting, setIsExporting] = useState(false);
  
  // States for each input column
  const [inputs, setInputs] = useState<Record<string, string>>({
    L: '', I: '', S: '', CT12: '', CL: '', A: '', H: ''
  });

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  useEffect(() => {
    const q = query(collection(db, 'manualAttendance'), where('date', '==', dateStr));
    const unsub = onSnapshot(q, (snap) => {
      const data: Record<string, string> = {};
      snap.docs.forEach(doc => {
        const item = doc.data();
        data[item.employeeId] = item.status;
      });
      setManualData(data);
    });
    return unsub;
  }, [dateStr]);

  const updateStatus = async (emp: Employee, status: string) => {
    const docId = `${dateStr}_${emp.id}`;
    try {
      if (status === 'H') {
        await deleteDoc(doc(db, 'manualAttendance', docId));
      } else {
        await setDoc(doc(db, 'manualAttendance', docId), {
          id: docId,
          date: dateStr,
          employeeId: emp.id,
          employeeName: emp.name,
          status: status,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error updating manual attendance:", error);
    }
  };

  const handleQuickEntry = async (status: string) => {
    const value = inputs[status].trim().toLowerCase();
    if (!value) return;

    // Find employee by PIN (exact) or Name (exact then partial)
    let emp = employees.find(e => e.pin === value);
    if (!emp) {
      emp = employees.find(e => e.name.toLowerCase() === value);
    }
    if (!emp) {
      emp = employees.find(e => e.name.toLowerCase().includes(value));
    }

    if (!emp) {
      alert(`Karyawan dengan identitas "${value}" tidak ditemukan.`);
      return;
    }

    await updateStatus(emp, status);

    // Clear input after success
    setInputs(prev => ({ ...prev, [status]: '' }));
  };

  const getMatchedEmployee = (val: string) => {
    const value = val.trim().toLowerCase();
    if (value.length < 2) return null; // Minimum 2 characters to show preview
    let emp = employees.find(e => e.pin === value);
    if (!emp) {
      emp = employees.find(e => e.name.toLowerCase() === value);
    }
    if (!emp) {
      emp = employees.find(e => e.name.toLowerCase().includes(value));
    }
    return emp;
  };

  const totals = {
    A: Object.values(manualData).filter(s => s === 'A').length,
    I: Object.values(manualData).filter(s => s === 'I').length,
    S: Object.values(manualData).filter(s => s === 'S').length,
    L: Object.values(manualData).filter(s => s === 'L').length,
    CT12: Object.values(manualData).filter(s => s === 'CT12').length,
    CL: Object.values(manualData).filter(s => s === 'CL').length,
    H: employees.length - Object.keys(manualData).length,
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const start = format(exportStart, 'yyyy-MM-dd');
      const end = format(exportEnd, 'yyyy-MM-dd');
      
      const q = query(
        collection(db, 'manualAttendance'), 
        where('date', '>=', start),
        where('date', '<=', end)
      );
      const snap = await getDocs(q);
      const allRecords = snap.docs.map(d => d.data());

      const dates: string[] = [];
      let tempDate = new Date(exportStart);
      while (tempDate <= exportEnd) {
        dates.push(format(tempDate, 'yyyy-MM-dd'));
        tempDate.setDate(tempDate.getDate() + 1);
      }

      const exportRows = employees.map(emp => {
        const row: any = { 'Nama': emp.name, 'No Absen': emp.pin, 'Divisi': emp.division };
        let count = { A: 0, I: 0, S: 0, L: 0, CT: 0, CL: 0, H: 0 };
        
        dates.forEach(d => {
          const record = allRecords.find(r => r.employeeId === emp.id && r.date === d);
          const status = record ? record.status : 'H';
          row[d] = status;
          if (status === 'A') count.A++;
          else if (status === 'I') count.I++;
          else if (status === 'S') count.S++;
          else if (status === 'L') count.L++;
          else if (status === 'CT12') count.CT++;
          else if (status === 'CL') count.CL++;
          else count.H++;
        });

        row['Total A'] = count.A; row['Total I'] = count.I; row['Total S'] = count.S;
        row['Total L'] = count.L; row['Total CT'] = count.CT; row['Total CL'] = count.CL;
        row['Total H'] = count.H;
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi Manual");
      XLSX.writeFile(wb, `Rekap_Manual_${start}_${end}.xlsx`);
    } catch (err) {
       console.error(err);
       alert("Gagal ekspor.");
    } finally {
       setIsExporting(false);
    }
  };

  const statusColors: Record<string, string> = {
    L: 'text-white/40 bg-white/5',
    I: 'text-sky-400 bg-sky-500/10',
    S: 'text-amber-400 bg-amber-500/10',
    CT12: 'text-purple-400 bg-purple-500/10',
    CL: 'text-pink-400 bg-pink-500/10',
    A: 'text-rose-400 bg-rose-500/10',
    H: 'text-emerald-400 bg-emerald-500/10'
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <Popover>
          <PopoverTrigger render={
            <Button variant="outline" className="glass-panel border-white/10 text-white flex gap-2 h-12 px-6 rounded-xl min-w-[240px] justify-start shadow-lg">
              <CalendarIcon className="w-5 h-5 text-primary" /> 
              <div className="flex flex-col items-start leading-none">
                <span className="text-[10px] text-white/40 uppercase font-bold">Tanggal Input</span>
                <span className="text-sm font-bold">{format(selectedDate, 'EEEE, dd MMMM yyyy')}</span>
              </div>
            </Button>
          } />
          <PopoverContent className="glass-panel border-white/20 p-0 shadow-2xl">
            <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} className="bg-[#0A0F1E]" />
          </PopoverContent>
        </Popover>

        <Dialog>
          <DialogTrigger render={
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex gap-2 h-12 px-6 shadow-xl shadow-emerald-600/20 border-none">
              <Download className="w-4 h-4" /> Ekspor Hasil Rekap
            </Button>
          } />
          <DialogContent className="glass-panel text-white border-white/20 sm:max-w-[425px]">
            <DialogHeader><DialogTitle>Download Laporan Excel</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/40">DARI TANGGAL</Label>
                <Input type="date" value={format(exportStart, 'yyyy-MM-dd')} onChange={(e) => setExportStart(new Date(e.target.value))} className="field-input h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/40">SAMPAI TANGGAL</Label>
                <Input type="date" value={format(exportEnd, 'yyyy-MM-dd')} onChange={(e) => setExportEnd(new Date(e.target.value))} className="field-input h-11" />
              </div>
            </div>
            <Button onClick={handleExport} disabled={isExporting} className="bg-primary hover:bg-primary/80 w-full h-12 rounded-xl font-bold">
              {isExporting ? "Memproses..." : "Download Sekarang"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Quick View */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
        {Object.entries(totals).map(([status, count]) => (
          <div key={status} className={`glass-panel p-4 rounded-2xl flex flex-col items-center border-white/5 transition-all duration-300 ${statusColors[status]}`}>
            <span className="text-[10px] uppercase font-black tracking-widest mb-1">{status === 'H' ? 'Hadir' : status === 'A' ? 'Alpha' : status}</span>
            <span className="text-2xl font-black">{count}</span>
          </div>
        ))}
      </div>

      {/* Input Columns Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {['A', 'I', 'S', 'L', 'CT12', 'CL', 'H'].map((status) => (
          <Card key={status} className="glass-panel border-none shadow-xl bg-black/20 overflow-hidden group/card">
            <CardHeader className={`p-4 border-b border-white/5 ${statusColors[status]}`}>
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-current" />
                  Input {status === 'H' ? 'Hadir / Reset' : status}
                </CardTitle>
                <Badge variant="outline" className="border-current/20 bg-current/5 text-[10px]">
                  {status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/card:text-primary transition-colors" />
                  <Input 
                    placeholder="Nama / PIN" 
                    value={inputs[status]}
                    onChange={(e) => setInputs(prev => ({ ...prev, [status]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickEntry(status)}
                    className="field-input pl-10 h-11 rounded-xl border-white/5 focus:border-primary/50 transition-all bg-white/5"
                  />
                </div>
                <Button 
                  size="icon" 
                  onClick={() => handleQuickEntry(status)}
                  className={`shrink-0 rounded-xl transition-all ${statusColors[status]} border-none hover:scale-105 active:scale-95`}
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
              
              {/* Employee Preview */}
              {inputs[status] && (
                <div className="mt-2 min-h-[24px]">
                  {getMatchedEmployee(inputs[status]) ? (
                    <div className="flex items-center gap-2 px-2 py-1 bg-primary/20 rounded-lg border border-primary/40 animate-in fade-in slide-in-from-top-1 duration-200">
                      <User className="w-3 h-3 text-white" />
                      <span className="text-[10px] font-bold text-white truncate max-w-full">
                        {getMatchedEmployee(inputs[status])?.name} ({getMatchedEmployee(inputs[status])?.pin})
                      </span>
                    </div>
                  ) : inputs[status].length >= 2 ? (
                    <p className="text-[10px] text-white/40 italic px-2">Karyawan tidak ditemukan...</p>
                  ) : null}
                </div>
              )}

              <p className="mt-1 text-[10px] text-white/20 italic font-medium px-1">
                {status === 'H' ? 'Menghapus status khusus.' : `Tekan Enter atau + untuk set ${status}.`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entries List */}
      <Card className="glass-panel border-none shadow-2xl bg-black/40 overflow-hidden">
        <CardHeader className="border-b border-white/5">
          <CardTitle className="text-white text-md flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Daftar Perubahan Status Hari Ini
          </CardTitle>
          <CardDescription className="text-white/40">Karyawan yang tidak berstatus hadir pada tanggal ini.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent bg-white/5">
                <TableHead className="text-white/40 font-bold uppercase text-[10px] pl-6">Karyawan</TableHead>
                <TableHead className="text-white/40 font-bold uppercase text-[10px]">PIN</TableHead>
                <TableHead className="text-white/40 font-bold uppercase text-[10px]">Status</TableHead>
                <TableHead className="text-white/40 font-bold uppercase text-[10px] pr-6 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(Object.entries(manualData) as [string, string][]).map(([empId, status]) => {
                const emp = employees.find(e => e.id === empId);
                if (!emp) return null;
                return (
                  <TableRow key={empId} className="border-white/5 hover:bg-white/5 transition-colors">
                    <TableCell className="font-bold text-white pl-6">{emp.name}</TableCell>
                    <TableCell className="text-white/30 font-mono text-xs">{emp.pin}</TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[status] || ''} border-none font-black text-[10px]`}>{status}</Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-rose-400 hover:bg-rose-500/10 h-8 rounded-lg"
                        onClick={() => updateStatus(emp, 'H')}
                      >
                        Hapus
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {Object.keys(manualData).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-20 text-white/20 italic">Semua karyawan terdata hadir (Default).</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// --- ADMIN: REPORTS ---
function AdminReports({ employees, shifts }: { employees: Employee[], shifts: Shift[] }) {
  const [dateRange, setDateRange] = useState({ 
    start: startOfDay(new Date()), 
    end: endOfDay(new Date()) 
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [isEditingAttendance, setIsEditingAttendance] = useState<Attendance | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'attendance'), 
      where('date', '>=', format(dateRange.start, 'yyyy-MM-dd')),
      where('date', '<=', format(dateRange.end, 'yyyy-MM-dd')),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => setAttendances(snap.docs.map(d => ({id: d.id, ...d.data()} as Attendance))), (err) => console.error("Reports attendance error:", err));
    return unsub;
  }, [dateRange]);

  const handleExport = () => {
    setExportLoading(true);
    try {
      const data = attendances.map(a => {
        const shift = shifts.find(s => s.id === a.shiftId);
        let lemburMins = 0;
        let potonganMins = 0;

        if (shift) {
          const isDayOff = shift.name.toLowerCase().replace(/\s/g, '') === 'dayoff';
          
          if (!isDayOff) {
            // 1. Keterlambatan (Check In > Start Time)
            if (a.checkIn) {
              const diffIn = calculateMinutesDiff(shift.startTime, a.checkIn);
              if (diffIn > 0) potonganMins += diffIn;
            }

            // 2. Pulang Lebih Awal (Check Out < End Time) & Lembur (Check Out > End Time)
            if (a.checkOut) {
              const diffOut = calculateMinutesDiff(shift.endTime, a.checkOut);
              if (diffOut < 0) {
                // Pulang lebih awal
                potonganMins += Math.abs(diffOut);
              } else if (diffOut >= 15) {
                // Lembur dengan rounding: 0-14 = 0, 15-29 = 15, dst (floor to nearest 15)
                lemburMins = Math.floor(diffOut / 15) * 15;
              }
            }
          }
        }

        return {
          'Tanggal': a.date,
          'Nama Karyawan': a.employeeName,
          'Shift': shift?.name || '-',
          'Jam Kerja': shift ? `${shift.startTime} - ${shift.endTime}` : '-',
          'Masuk': a.checkIn ? format(toDateSafe(a.checkIn), 'HH:mm') : '-',
          'Istirahat Mulai': a.breakStart ? format(toDateSafe(a.breakStart), 'HH:mm') : '-',
          'Istirahat Selesai': a.breakEnd ? format(toDateSafe(a.breakEnd), 'HH:mm') : '-',
          'Pulang': a.checkOut ? format(toDateSafe(a.checkOut), 'HH:mm') : '-',
          'Lembur (HH:mm)': minsToHHMM(lemburMins),
          'Lembur (Decimal)': minsToDecimal(lemburMins),
          'Potongan (HH:mm)': minsToHHMM(potonganMins),
          'Potongan (Decimal)': minsToDecimal(potonganMins),
          'Status': a.status
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");
      XLSX.writeFile(wb, `Rekap_Absensi_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleEditTime = async (id: string, field: string, newTimeStr: string) => {
    if (!newTimeStr) return;
    try {
      const attendance = attendances.find(a => a.id === id);
      if (!attendance) return;
      
      const newTime = parse(newTimeStr, 'HH:mm', attendance.date ? new Date(attendance.date) : new Date());
      await updateDoc(doc(db, 'attendance', id), {
        [field]: newTime,
        updatedAt: serverTimestamp()
      });
      setIsEditingAttendance(null);
    } catch(e) {
      alert("Format jam salah (HH:mm)");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-panel border-none shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white">Rekap Absensi</CardTitle>
            <CardDescription className="text-white/50">Pilih rentang tanggal untuk mengunduh laporan.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExport} disabled={exportLoading} variant="outline" className="flex gap-2 glass-panel border-white/10 text-white hover:bg-white/10 shadow-lg"><Download className="w-4 h-4" /> Download Excel</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4 p-4 bg-white/5 rounded-xl border border-white/10 border-dashed text-sm items-center">
            <div className="flex items-center gap-2">
              <Label className="text-white/60 text-xs uppercase font-bold tracking-wider">Dari:</Label>
              <Input type="date" value={format(dateRange.start, 'yyyy-MM-dd')} onChange={(e) => setDateRange({...dateRange, start: new Date(e.target.value)})} className="field-input w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-white/60 text-xs uppercase font-bold tracking-wider">Sampai:</Label>
              <Input type="date" value={format(dateRange.end, 'yyyy-MM-dd')} onChange={(e) => setDateRange({...dateRange, end: new Date(e.target.value)})} className="field-input w-40" />
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 text-white/40 hover:bg-transparent">
                  <TableHead className="text-white/40 whitespace-nowrap">Tanggal</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Nama</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Shift</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Masuk</TableHead>
                  <TableHead className="text-white/40 whitespace-nowrap">Pulang</TableHead>
                  <TableHead className="text-right text-white/40 whitespace-nowrap">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendances.map(a => {
                  const shift = shifts.find(s => s.id === a.shiftId);
                  return (
                    <TableRow key={a.id} className="border-white/5 hover:bg-white/5">
                      <TableCell className="text-xs font-medium text-white/60 whitespace-nowrap">{a.date ? format(new Date(a.date), 'dd MMM yyyy') : '-'}</TableCell>
                      <TableCell className="font-semibold text-white whitespace-nowrap">{a.employeeName}</TableCell>
                      <TableCell className="text-white/60 text-xs whitespace-nowrap">{shift?.name || '-'}</TableCell>
                      <TableCell className="font-mono text-white/70 whitespace-nowrap">{a.checkIn ? format(toDateSafe(a.checkIn), 'HH:mm') : '-'}</TableCell>
                      <TableCell className="font-mono text-white/70 whitespace-nowrap">{a.checkOut ? format(toDateSafe(a.checkOut), 'HH:mm') : '-'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Dialog open={isEditingAttendance?.id === a.id} onOpenChange={(v) => !v && setIsEditingAttendance(null)}>
                          <DialogTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-white/10 h-8 px-3 text-primary" onClick={() => setIsEditingAttendance(a)}>
                            <Edit className="w-3 h-3 mr-1" /> Edit
                          </DialogTrigger>
                        <DialogContent className="glass-panel border-white/20 text-white">
                          <DialogHeader><DialogTitle className="text-white">Edit Jam Absen - {a.employeeName}</DialogTitle></DialogHeader>
                          <div className="grid gap-4 py-4">
                            <EditTimeField label="Jam Masuk" current={a.checkIn} onSave={(val) => handleEditTime(a.id, 'checkIn', val)} />
                            <EditTimeField label="Jam Istirahat" current={a.breakStart} onSave={(val) => handleEditTime(a.id, 'breakStart', val)} />
                            <EditTimeField label="Selesai Istirahat" current={a.breakEnd} onSave={(val) => handleEditTime(a.id, 'breakEnd', val)} />
                            <EditTimeField label="Jam Pulang" current={a.checkOut} onSave={(val) => handleEditTime(a.id, 'checkOut', val)} />
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })}
              {attendances.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-white/30 italic">Tidak ada data untuk rentang tanggal ini.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}

function EditTimeField({ label, current, onSave }: { label: string, current: any, onSave: (v: string) => void }) {
  const [val, setVal] = useState(current ? format(toDateSafe(current), 'HH:mm') : '');
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-white/70 w-1/2">{label}</Label>
      <div className="flex gap-2">
        <Input type="time" value={val} onChange={(e) => setVal(e.target.value)} className="field-input w-32" />
        <Button size="sm" onClick={() => onSave(val)} className="bg-primary hover:bg-primary/80">OK</Button>
      </div>
    </div>
  );
}

// Helpers
function StatCard({ label, value, icon, size = 'default' }: { label: string, value: number, icon: React.ReactNode, size?: 'default' | 'sm' }) {
  if (size === 'sm') {
    return (
      <Card className="glass-panel border-none shadow-sm flex items-center px-4 py-2 gap-3 bg-white/5">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm border border-white/10">
          {icon}
        </div>
        <div>
          <p className="text-[8px] font-bold uppercase tracking-widest text-white/40 uppercase">{label}</p>
          <p className="text-xl font-bold text-white tracking-tighter">{value}</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="glass-panel border-none shadow-sm flex items-center p-6 gap-6 bg-white/5">
      <div className="w-12 h-12 rounded-2xl bg-white/10 shadow-sm flex items-center justify-center text-xl border border-white/10">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">{label}</p>
        <p className="text-4xl font-bold text-white tracking-tighter">{value}</p>
      </div>
    </Card>
  );
}
