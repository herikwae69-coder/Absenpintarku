import 'leaflet/dist/leaflet.css';
import React, { useState, useEffect, useCallback } from 'react';
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
import { format, startOfDay, endOfDay, isAfter, isBefore, parse, eachDayOfInterval, startOfWeek, endOfWeek, getDay, addDays, isSameDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { generateBackupZip } from './lib/backupService';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import Holidays from 'date-holidays';
import { 
  DndContext, 
  DragEndEvent, 
  useDraggable, 
  useDroppable,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { 
  Music,
  User, 
  Clock, 
  Check,
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
  Lock as LockIcon,
  Unlock as UnlockIcon,
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
  Locate,
  X,
  Calculator,
  Moon,
  Sun,
  ShieldAlert,
  DollarSign,
  Shirt,
  FileDown
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast, Toaster } from 'sonner';
import { PotonganKehilanganManager } from './components/PotonganKehilanganManager';
import { PotonganKehilanganBersamaManager } from './components/PotonganKehilanganBersamaManager';
import { PotonganSeragamManager } from './components/PotonganSeragamManager';
import AdminAuditDanExport from './components/AdminAuditDanExport';
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
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import JSZip from 'jszip';
import { Employee, Shift, Attendance, LeaveRequest, Section, Division, ManualAttendance, ActivityLog } from './types';
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
const calculateEffectiveQuota = (
  employeeId: string,
  selectedPeriodId: string,
  periodOptions: any[],
  controls: Record<string, any>,
  allQuotas: any[],
  allLeaveRequests: any[]
) => {
  const currentIndex = periodOptions.findIndex(p => p.value === selectedPeriodId);
  if (currentIndex === -1) return 4;

  const chain = periodOptions.slice(currentIndex).reverse();
  let carryover = 0;
  let finalQuota = 4;

  for (const p of chain) {
    const pCtrl = controls[p.value];
    const maxStored = pCtrl?.maxAccumulatedLeave ?? 6;
    const qDoc = allQuotas.find(q => q.employeeId === employeeId && q.period === p.value);
    const base = qDoc?.quota ?? 4;
    const effective = Math.min(base + carryover, maxStored);
    
    if (p.value === selectedPeriodId) {
      finalQuota = effective;
      break;
    }

    const usedRequests = allLeaveRequests.filter(r => r.employeeId === employeeId && r.period === p.value && (r.status === 'approved' || r.status === 'pending'));
    const uniqueDates = new Set<string>();
    usedRequests.forEach(r => {
      const dArr = r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6];
      dArr.forEach((d, i) => {
        if (d) {
          if (d === 'TRASH' || d === 'WAITING') {
            uniqueDates.add(`${r.id}-${d}-${i}`);
          } else {
            uniqueDates.add(d);
          }
        }
      });
    });
    const used = uniqueDates.size;
    
    carryover = Math.max(0, effective - used);
  }
  return finalQuota;
};

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
const getPeriodOptions = (monthsBefore: number = 24, monthsAfter: number = 12) => {
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
  return Object.entries(firestoreControls)
    .filter(([id, data]) => !data.hidden && data.name && data.startDate && data.endDate)
    .map(([id, data]) => ({
      label: data.name,
      value: id,
      start: new Date(data.startDate),
      end: new Date(data.endDate)
    }))
    .sort((a,b) => b.start.getTime() - a.start.getTime()); // Newest first
};

// Admin Authentication is now handle via Employee roles
import { useAutoLogout } from './hooks/useAutoLogout';

import { 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';

// --- CONTEXT ---
const DialogContext = React.createContext<{
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void;
  confirm: (msg: string, title?: string) => Promise<boolean>;
  prompt: (msg: string, defaultVal?: string, title?: string) => Promise<string | null>;
} | null>(null);

export function useDialog() {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used within DialogProvider");
  return context;
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<'login' | 'employee' | 'admin'>('login');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activePeriodId, setActivePeriodId] = useState<string>('');

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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'employees'));

    const unsubShifts = onSnapshot(collection(db, 'shifts'), (snapshot) => {
      setShifts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'shifts'));

    const unsubSections = onSnapshot(collection(db, 'sections'), (snapshot) => {
      setSections(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Section)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sections'));

    const unsubDivisions = onSnapshot(collection(db, 'divisions'), (snapshot) => {
      setDivisions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Division)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'divisions'));

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
            customAlert("Password Salah! (Default: 123456)", "error");
        }
    } catch (e) {
        console.error("Login error:", e);
        customAlert("Terjadi kesalahan saat login.", "error");
    }
  };

  const handleAdminAuth = (employee: Employee, credential: string) => {
    if (employee.role !== 'admin' && employee.role !== 'superadmin' && employee.role !== 'spv') {
      customAlert("Maaf kamu bukan admin!", "error");
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
      customAlert("Password Admin Salah!", "error");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAdmin(false);
    setView('login');
    localStorage.removeItem('jg1_user');
    localStorage.removeItem('jg1_isAdmin');
  };

  useAutoLogout(currentUser, handleLogout);

  const today = format(new Date(), 'yyyy-MM-dd');

  // Custom Dialog State
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    type: 'confirm' | 'prompt';
    title: string;
    message: string;
    defaultValue?: string;
    resolve: (value: any) => void;
  } | null>(null);

  const customAlert = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const isSuccess = type === 'success';
    toast[type](message, {
      style: { 
        fontSize: '28px', 
        fontWeight: '900', 
        padding: '40px',
        maxWidth: '800px',
        width: 'auto',
        backgroundColor: 'rgba(15, 15, 20, 0.98)',
        color: '#fff',
        borderRadius: '30px',
        boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.8)',
        border: `4px solid ${isSuccess ? '#10b981' : type === 'error' ? '#f43f5e' : '#3b82f6'}`,
        letterSpacing: '-0.05em',
        lineHeight: '1.1'
      },
      duration: 7000
    });
  }, []);

  const customConfirm = useCallback((message: string, title: string = "Konfirmasi"): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogConfig({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        resolve
      });
    });
  }, []);

  const customPrompt = useCallback((message: string, defaultValue: string = "", title: string = "Input"): Promise<string | null> => {
    return new Promise((resolve) => {
      setDialogConfig({
        isOpen: true,
        type: 'prompt',
        title,
        message,
        defaultValue,
        resolve
      });
    });
  }, []);

  useEffect(() => {
    window.alert = (msg) => {
      if (typeof msg === 'string' || typeof msg === 'number') {
        customAlert(String(msg));
      }
    };
  }, [customAlert]);

  const [promptInput, setPromptInput] = useState("");

  const handleDialogConfirm = () => {
    if (dialogConfig) {
      if (dialogConfig.type === 'prompt') {
        dialogConfig.resolve(promptInput);
      } else {
        dialogConfig.resolve(true);
      }
      setDialogConfig(null);
      setPromptInput("");
    }
  };

  const handleDialogCancel = () => {
    if (dialogConfig) {
      dialogConfig.resolve(dialogConfig.type === 'prompt' ? null : false);
      setDialogConfig(null);
      setPromptInput("");
    }
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
    <DialogContext.Provider value={{ alert: customAlert, confirm: customConfirm, prompt: customPrompt }}>
    <div className="min-h-screen relative font-sans selection:bg-primary/20">
      <div className="mesh-bg" />
      <div className="relative z-10 min-h-screen">
        {view === 'login' && (
          <LoginView 
            employees={employees} 
            onLogin={handleLogin} 
            onAdminAuth={handleAdminAuth}
            theme={theme}
            toggleTheme={toggleTheme}
            alert={customAlert}
          />
        )}
        {view === 'employee' && currentUser && (
          <EmployeeView 
            employee={currentUser} 
            employees={employees}
            shifts={shifts}
            sections={sections}
            divisions={divisions}
            onLogout={handleLogout} 
            theme={theme}
            toggleTheme={toggleTheme}
            confirm={customConfirm}
            prompt={customPrompt}
            alert={customAlert}
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
            theme={theme}
            toggleTheme={toggleTheme}
            confirm={customConfirm}
            prompt={customPrompt}
            alert={customAlert}
            activePeriodId={activePeriodId}
            setActivePeriodId={setActivePeriodId}
          />
        )}
      </div>
      
      {/* Custom Global Dialog */}
      <Dialog open={dialogConfig?.isOpen || false} onOpenChange={(open) => !open && handleDialogCancel()}>
        <DialogContent className="glass-panel border-white/10 text-white min-w-[320px] max-w-[450px] p-6 md:p-8 overflow-hidden rounded-3xl">
          {/* Backlight effect */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 blur-[80px] rounded-full point-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full point-events-none" />
          
          <DialogHeader className="relative z-10 space-y-4 text-left">
            <DialogTitle className="text-xl md:text-2xl font-black flex items-center gap-3 text-primary tracking-tight">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                <AlertCircle className="w-5 h-5" />
              </div>
              {dialogConfig?.title}
            </DialogTitle>
            <DialogDescription className="text-sm md:text-base text-white/90 leading-relaxed font-medium">
              {dialogConfig?.message}
            </DialogDescription>
          </DialogHeader>
          
          {dialogConfig?.type === 'prompt' && (
            <div className="py-6 relative z-10 w-full">
              <Input
                autoFocus
                className="h-12 text-lg font-bold text-center bg-white/5 border-white/20 focus:border-primary/50 rounded-xl w-full"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDialogConfirm()}
                placeholder={dialogConfig.defaultValue || 'Ketik di sini...'}
                type={dialogConfig?.message.toLowerCase().includes('password') ? 'password' : 'text'}
              />
            </div>
          )}

          <DialogFooter className="flex flex-row gap-3 mt-6 relative z-10">
            <Button 
              variant="outline" 
              onClick={handleDialogCancel}
              className="h-11 text-sm font-bold flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl"
            >
              BATAL
            </Button>
            <Button 
              onClick={handleDialogConfirm}
              className="h-11 text-sm font-bold flex-1 shadow-lg shadow-primary/25 rounded-xl bg-primary hover:bg-primary/90"
            >
              OKE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="top-center" expand={true} richColors />

      {/* Watermark */}
      <div className="fixed bottom-4 right-8 z-50 text-[10px] font-bold text-white/20 uppercase tracking-[0.3em] pointer-events-none flex items-center gap-2">
        <div className="w-8 h-[1px] bg-white/10" />
        App by Heri.k | versi 1.2.1 | 2026
      </div>
    </div>
    </DialogContext.Provider>
  );
}

function ThemeToggle({ theme, toggleTheme, className }: { theme: 'light' | 'dark', toggleTheme: () => void, className?: string }) {
  return (
      <Button
        variant="outline"
        size="icon"
        onClick={toggleTheme}
        className={`rounded-full w-10 h-10 border-border glass-panel hover:bg-accent text-foreground shadow-md transition-all duration-300 ${className || ""}`}
        title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      >
      <AnimatePresence mode="wait">
        <motion.div
          key={theme}
          initial={{ y: 10, opacity: 0, rotate: -90 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -10, opacity: 0, rotate: 90 }}
          transition={{ duration: 0.2 }}
        >
          {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </motion.div>
      </AnimatePresence>
    </Button>
  );
}

// --- LOGIN VIEW ---
function LoginView({ employees, onLogin, onAdminAuth, theme, toggleTheme, alert }: { 
  employees: Employee[], 
  onLogin: (e: Employee, pin: string) => void,
  onAdminAuth: (e: Employee, pwd: string) => void,
  theme: 'light' | 'dark',
  toggleTheme: () => void,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [absenId, setAbsenId] = useState("");
  const [pin, setPin] = useState("");
  const [adminAbsenId, setAdminAbsenId] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const selectedEmployee = employees.find(e => String(e.pin || '').trim() === absenId.trim());
  const selectedAdmin = employees.find(e => String(e.pin || '').trim() === adminAbsenId.trim());

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-10 px-4 overflow-x-hidden overflow-y-auto relative">
      <ThemeToggle theme={theme} toggleTheme={toggleTheme} className="fixed top-4 right-4 z-50" />
      {/* Decorative atmospheric elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/10 dark:bg-primary/20 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 dark:bg-blue-500/10 blur-[100px] rounded-full" />

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
            <div className="w-full h-full bg-linear-to-br from-card via-card to-secondary rounded-[2rem] border border-border shadow-2xl flex items-center justify-center relative overflow-hidden transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-2">
              {/* Glass reflection */}
              <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-[2rem]" />
              {/* Bottom colored accent light */}
              <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-primary blur-2xl rounded-full opacity-60" />
              
              <div className="relative z-10 flex items-baseline drop-shadow-2xl">
                <span className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/60">
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
            className="text-4xl md:text-5xl font-black tracking-tighter text-foreground mb-2 uppercase"
          >
            JENGGO 1 APP
          </motion.h1>
          
          <motion.p 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground font-medium tracking-[0.2em] uppercase text-[10px] mb-1"
          >
            Demangan dalam genggaman
          </motion.p>
          
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="inline-block px-3 py-1 rounded-full bg-secondary/50 border border-border"
          >
            <p className="text-muted-foreground italic text-[11px] tracking-wide">Only one click</p>
          </motion.div>
        </div>

        <Card className="glass-panel border border-border shadow-2xl overflow-hidden backdrop-blur-3xl bg-card/60">
          <div className="h-1 w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
          <CardHeader className="pb-4 pt-8 text-center">
            <CardTitle className="text-foreground text-xl font-bold tracking-tight">
              {showAdminLogin ? "Akses Administrator" : "Login Karyawan"}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
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
                         onClick={() => alert('Lupa password? Silakan hubungi Admin Anda untuk melakukan reset password melalui panel Admin.', 'info')} 
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

                {selectedAdmin && (selectedAdmin.role === 'admin' || selectedAdmin.role === 'superadmin' || selectedAdmin.role === 'spv') ? (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center gap-1"
                  >
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{selectedAdmin.role === 'superadmin' ? 'Super Admin' : selectedAdmin.role === 'spv' ? 'Supervisor' : 'Admin'} Terdeteksi</span>
                    <span className="text-lg font-black text-white">{selectedAdmin.name}</span>
                  </motion.div>
                ) : (adminAbsenId && selectedAdmin && selectedAdmin.role !== 'admin' && selectedAdmin.role !== 'superadmin' && selectedAdmin.role !== 'spv') ? (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col items-center gap-1 text-center"
                  >
                    <AlertCircle className="w-6 h-6 text-rose-400 mb-1" />
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Akses Ditolak</span>
                    <span className="text-sm font-semibold text-white/80">Maaf, Anda bukan Admin/Supervisor.</span>
                  </motion.div>
                ) : null}

                {selectedAdmin && (selectedAdmin.role === 'admin' || selectedAdmin.role === 'superadmin' || selectedAdmin.role === 'spv') && (
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
                         onClick={() => alert(`Lupa password Admin?\n\nSilakan minta bantuan pemilik sistem atau developer untuk mengatur ulang password di Master Database.`, 'info')} 
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
  onComplete: () => Promise<void> | void, 
  isBreak: boolean, 
  disabled: boolean 
}) {
  const controls = useAnimation();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dragRight, setDragRight] = useState(260);

  useEffect(() => {
    if (containerRef.current) {
      const width = containerRef.current.offsetWidth;
      setDragRight(width - 40); // 40 is button width
    }
    
    const handleResize = () => {
      if (containerRef.current) {
        setDragRight(containerRef.current.offsetWidth - 40);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    controls.start({ x: isBreak ? dragRight : 0 });
  }, [isBreak, controls, dragRight]);

  return (
    <div className={`relative h-14 rounded-full border border-white/10 transition-all overflow-hidden ${disabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}
         style={{ background: isBreak ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)' }}>
      <div className={`absolute inset-0 flex items-center justify-center text-[11px] font-extrabold uppercase tracking-[0.25em] pointer-events-none transition-all ${isBreak ? 'text-blue-300' : 'text-amber-300'}`}>
        {isBreak ? 'Geser ke kiri untuk Selesai' : 'Geser ke kanan untuk Istirahat'}
      </div>
      <div className="absolute inset-2 flex items-center">
        <div ref={containerRef} className="relative w-full h-full">
           <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: dragRight }}
            dragElastic={0.1}
            onDragEnd={async (_, info) => {
              const threshold = dragRight * 0.4;
              const shouldComplete = !isBreak ? info.offset.x > threshold : info.offset.x < -threshold;
              
              if (shouldComplete) {
                // Animate to end position immediately for better UX
                controls.start({ x: isBreak ? 0 : dragRight });
                try {
                  await onComplete();
                } catch (e) {
                  console.error(e);
                  // Snap back on error
                  controls.start({ x: isBreak ? dragRight : 0 });
                }
              } else {
                // Snap back if didn't reach threshold
                controls.start({ x: isBreak ? dragRight : 0 });
              }
            }}
            animate={controls}
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

function EmployeeSelector({ 
  employees, 
  onAdd, 
  onRemove, 
  selectedIds,
  onSelect,
  selectedId,
  placeholder,
  disabled = false
}: { 
  employees: Employee[], 
  onAdd?: (id: string) => void, 
  onRemove?: (id: string) => void, 
  selectedIds?: string[],
  onSelect?: (id: string) => void,
  selectedId?: string,
  placeholder?: string,
  disabled?: boolean
}) {
  const [search, setSearch] = useState('');
  const isMulti = !!onAdd && !!onRemove && !!selectedIds;
  
  const filteredMatches = employees.filter(e => {
    if (isMulti) {
        return !selectedIds.includes(e.id) && 
               (e.name.toLowerCase().includes(search.toLowerCase()) || (e.pin && e.pin.toLowerCase().includes(search.toLowerCase())));
    } else {
        return (e.name.toLowerCase().includes(search.toLowerCase()) || (e.pin && e.pin.toLowerCase().includes(search.toLowerCase())));
    }
  });
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' && filteredMatches.length === 1) {
      if (isMulti && onAdd) onAdd(filteredMatches[0].id);
      else if (onSelect) onSelect(filteredMatches[0].id);
      setSearch('');
    }
  };
  
  const selectedEmp = !isMulti && selectedId ? employees.find(e => e.id === selectedId) : null;
  
  return (
    <div className="flex flex-col gap-2 w-full">
      {isMulti && selectedIds && (
          <div className="flex flex-wrap gap-1">
            {selectedIds.map(id => {
              const emp = employees.find(e => e.id === id);
              return emp ? (
                <span key={id} className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
                  {emp.name}
                  {!disabled && onRemove && <button onClick={() => onRemove(id)}><X className="w-3 h-3 cursor-pointer" /></button>}
                </span>
              ) : null;
            })}
          </div>
      )}
      <div className="relative">
        <input 
          placeholder={disabled ? "Terkunci" : (placeholder || "Cari karyawan...")} 
          className={`w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs ${disabled ? 'opacity-50 cursor-not-allowed' : ''} h-10`}
          value={search !== '' ? search : (selectedEmp ? selectedEmp.name : '')}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => { if (!isMulti && selectedEmp) setSearch(''); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        {search && filteredMatches.length > 0 && (
          <div className="absolute z-50 bg-black/90 border border-white/20 rounded shadow-lg max-h-40 overflow-auto w-full mt-1">
            {filteredMatches.map(emp => (
              <button key={emp.id} className="w-full text-left px-2 py-2 text-xs text-white hover:bg-white/10 border-b border-white/5 last:border-0" onClick={() => { 
                if (isMulti && onAdd) onAdd(emp.id);
                else if (onSelect) onSelect(emp.id);
                setSearch(''); 
              }}>
                {emp.name} ({emp.pin})
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- ADMIN BONUS ESTAFET ---
function AdminBonusEstafet({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});

  const [bonusMaster, setBonusMaster] = useState<Record<string, number>>({});
  const [dailyAssignments, setDailyAssignments] = useState<Record<string, { bonusAmount: number, employeeIds: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');

  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);
  
  const dates = React.useMemo(() => {
    if (!currentPeriod) return [];
    const days: Date[] = [];
    let curr = new Date(currentPeriod.start);
    while (curr <= currentPeriod.end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [currentPeriod]);

  const employeeTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    console.log('DEBUG: Calculating totals. dailyAssignments keys:', Object.keys(dailyAssignments).length);
    Object.entries(dailyAssignments).forEach(([dateStr, day]) => {
      // Use bonus from master if available as it is the source of truth, fallback to stored bonusAmount
      const bonusValue = bonusMaster[dateStr] ?? (typeof day === 'object' && day && 'bonusAmount' in day ? (day as any).bonusAmount : 0);
      const employeeIds = typeof day === 'object' && day && 'employeeIds' in day ? (day as any).employeeIds : [];

      if (Array.isArray(employeeIds)) {
        employeeIds.forEach((empId: string) => {
          totals[empId] = (totals[empId] || 0) + (Number(bonusValue) || 0);
        });
      }
    });
    console.log('DEBUG: Final Totals:', totals);
    return totals;
  }, [dailyAssignments, bonusMaster]);

  const grandTotal = React.useMemo(() => {
    return Object.values(employeeTotals).reduce((sum: number, val: number) => sum + val, 0);
  }, [employeeTotals]);

  const downloadAccumulation = () => {
    if (!currentPeriod || employees.length === 0) return;
    
    const data = employees
      .map(emp => ({
        "No. Absen": emp.pin || "-",
        "Nama": emp.name,
        "Total Bonus Estafet": employeeTotals[emp.id] || 0
      }))
      .filter(item => item["Total Bonus Estafet"] > 0);

    if (data.length === 0) {
      toast.error("Tidak ada data bonus untuk diunduh (Semua Rp 0)");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Akumulasi Bonus");
    XLSX.writeFile(wb, `Bonus_Estafet_${currentPeriod.label}.xlsx`);
  };

  useEffect(() => {
    let componentMounted = true;
    if (!selectedPeriod) return;
    setLoading(true);
    
    // Fetch Bonus Master and Bonus Estafet
    const unsubMaster = onSnapshot(doc(db, 'bonusMasterConfig', selectedPeriod), (snap) => {
      if (componentMounted) {
        setBonusMaster(snap.exists() ? (snap.data().dailyHighestReceipt || {}) : {});
      }
    });

    const unsubEstafet = onSnapshot(doc(db, 'bonusEstafet', selectedPeriod), (snap) => {
      if (componentMounted) {
        const data = snap.exists() ? snap.data() : {};
        setDailyAssignments(data.dailyAssignments || {});
        setIsLocked(data.isLocked || false);
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `bonusEstafet/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsubMaster();
      unsubEstafet();
    };
  }, [selectedPeriod]);

  const toggleLock = async () => {
    if (isLocked) {
      setShowUnlockDialog(true);
    } else {
      try {
        await setDoc(doc(db, 'bonusEstafet', selectedPeriod), { isLocked: true }, { merge: true });
        toast.success("Periode dikunci");
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusEstafet/${selectedPeriod}`);
      }
    }
  };

  const confirmUnlock = async () => {
    if (unlockPassword === 'admin123') {
      try {
        await setDoc(doc(db, 'bonusEstafet', selectedPeriod), { isLocked: false }, { merge: true });
        setShowUnlockDialog(false);
        setUnlockPassword('');
        toast.success("Periode berhasil dibuka");
      } catch(e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusEstafet/${selectedPeriod}`);
      }
    } else {
      toast.error("Password salah!");
    }
  };

  const autoSaveAssignments = async (assignments: Record<string, any>) => {
    try {
      const docRef = doc(db, 'bonusEstafet', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          dailyAssignments: assignments,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          dailyAssignments: assignments,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bonusEstafet/${selectedPeriod}`);
    }
  };

  const toggleEmployee = (dateStr: string, empId: string) => {
    setDailyAssignments(prev => {
      const current = prev[dateStr] || { bonusAmount: bonusMaster[dateStr] || 0, employeeIds: [] };
      const ids = current.employeeIds.includes(empId) 
        ? current.employeeIds.filter(id => id !== empId)
        : [...current.employeeIds, empId];
      return { ...prev, [dateStr]: { ...current, employeeIds: ids, bonusAmount: bonusMaster[dateStr] || 0 } };
    });
  };

  if (!currentPeriod) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" /> Bonus Estafet
          </h2>
          <p className="text-white/40 text-xs">Pilih karyawan yang mendapatkan bonus estafet harian.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={downloadAccumulation} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2 h-12 px-6">
            <Download className="w-4 h-4" /> Download
          </Button>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[200px] glass-panel border-white/10 text-white h-12 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                {currentPeriod?.label || selectedPeriod}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white max-h-[300px]">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {currentPeriod && (
        <div className="flex justify-end pt-2">
          <Button onClick={toggleLock} disabled={loading} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl gap-2 h-12 px-6`}>
            {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
          </Button>
        </div>
      )}

      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogTitle>Buka Kunci Periode (Estafet)</DialogTitle>
          <div className="space-y-4 pt-4">
            <Input 
              type="password" 
              placeholder="Masukkan Password Admin"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
            <Button onClick={confirmUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500">Konfirmasi Buka Kunci</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="glass-panel border-none bg-black/40">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">Akumulasi Bonus Per Karyawan</h3>
            <div className="bg-emerald-500/20 px-4 py-1 rounded-lg border border-emerald-500/30">
              <span className="text-[10px] text-emerald-400 font-bold uppercase mr-2">Total Periode:</span>
              <span className="text-emerald-400 font-black text-sm">Rp {new Intl.NumberFormat('id-ID').format(grandTotal)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
             {employees.filter(emp => (employeeTotals[emp.id] || 0) > 0).map(emp => {
               const total = employeeTotals[emp.id] || 0;
               return (
                 <div key={emp.id} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors flex flex-col gap-1">
                   <div className="flex justify-between items-start gap-2">
                     <span className="text-white/40 text-[9px] font-bold uppercase truncate">{emp.pin || '-'}</span>
                   </div>
                   <span className="text-white font-bold text-[11px] truncate">{emp.name}</span>
                   <span className="text-emerald-400 font-black text-xs">Rp {new Intl.NumberFormat('id-ID').format(total)}</span>
                 </div>
               );
             })}
             {Object.keys(employeeTotals).length === 0 && (
               <div className="col-span-full py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                 <p className="text-white/20 text-xs italic">Belum ada data akumulasi untuk periode ini.</p>
               </div>
             )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-none bg-black/40">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 bg-white/5">
                  <TableHead className="text-white/40 font-bold uppercase text-[10px] pl-6">Tanggal</TableHead>
                  <TableHead className="text-white/40 font-bold uppercase text-[10px]">Bonus (Rp)</TableHead>
                  <TableHead className="text-white/40 font-bold uppercase text-[10px]">Karyawan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dates.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const bonus = bonusMaster[dateStr] || 0;
                  const selectedEmpIds = dailyAssignments[dateStr]?.employeeIds || [];
                  return (
                    <TableRow key={dateStr} className="border-white/5">
                      <TableCell className="pl-6 font-bold text-white text-sm">{format(date, 'dd MMM', { locale: id })}</TableCell>
                      <TableCell className="text-emerald-400 font-bold">{new Intl.NumberFormat('id-ID').format(bonus)}</TableCell>
                      <TableCell>
                        <EmployeeSelector 
                          employees={employees}
                          selectedIds={selectedEmpIds}
                          disabled={isLocked}
                          onAdd={(id) => {
                            if (isLocked) {
                                toast.error("Periode ini sudah dikunci!");
                                return;
                            }
                            const updated = { ...dailyAssignments };
                            const current = updated[dateStr] || { bonusAmount: bonusMaster[dateStr] || 0, employeeIds: [] };
                            updated[dateStr] = { ...current, employeeIds: [...current.employeeIds, id], bonusAmount: bonusMaster[dateStr] || 0 };
                            setDailyAssignments(updated);
                            autoSaveAssignments(updated);
                          }}
                          onRemove={(id) => {
                            if (isLocked) {
                                toast.error("Periode ini sudah dikunci!");
                                return;
                            }
                            const updated = { ...dailyAssignments };
                            const current = updated[dateStr] || { bonusAmount: bonusMaster[dateStr] || 0, employeeIds: [] };
                            updated[dateStr] = { ...current, employeeIds: current.employeeIds.filter(empId => empId !== id), bonusAmount: bonusMaster[dateStr] || 0 };
                            setDailyAssignments(updated);
                            autoSaveAssignments(updated);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- ADMIN BONUS MASTER ---
function AdminBonusMaster({ activePeriodId, setActivePeriodId }: { activePeriodId: string, setActivePeriodId: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
      const data: Record<string, any> = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setControls(data);
    });
    return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId;
  const [dailyData, setDailyData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newPeriodEnd, setNewPeriodEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [password, setPassword] = useState('');

  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);
  
  // Generate list of dates for the period
  const dates = React.useMemo(() => {
    if (!currentPeriod) return [];
    const days: Date[] = [];
    let curr = new Date(currentPeriod.start);
    while (curr <= currentPeriod.end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [currentPeriod]);

  useEffect(() => {
    let componentMounted = true;
    if (!selectedPeriod) return;
    setLoading(true);
    
    // Fetch existing settings for this period
    const unsub = onSnapshot(doc(db, 'bonusMasterConfig', selectedPeriod), (snap) => {
      if (componentMounted) {
        if (snap.exists()) {
          const data = snap.data();
          setDailyData(data.dailyHighestReceipt || {});
          setIsLocked(data.isLocked || false);
        } else {
          setDailyData({});
          setIsLocked(false);
        }
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `bonusMasterConfig/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsub();
    };
  }, [selectedPeriod]);

  const handleSave = async () => {
    if(isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    setSaving(true);
    try {
      const docRef = doc(db, 'bonusMasterConfig', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          dailyHighestReceipt: dailyData,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          dailyHighestReceipt: dailyData,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
      toast.success("Data nota tertinggi berhasil disimpan");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bonusMasterConfig/${selectedPeriod}`);
      toast.error("Gagal menyimpan data");
    } finally {
      setSaving(false);
    }
  };

  const toggleLock = async () => {
      if (isLocked) {
          setShowUnlockDialog(true);
      } else {
          try {
              await setDoc(doc(db, 'bonusMasterConfig', selectedPeriod), { isLocked: true }, { merge: true });
              toast.success("Periode dikunci");
          } catch (e) {
              handleFirestoreError(e, OperationType.WRITE, `bonusMasterConfig/${selectedPeriod}`);
          }
      }
  };

  const confirmUnlock = async () => {
      if (password === 'admin123') {
      try {
          await setDoc(doc(db, 'bonusMasterConfig', selectedPeriod), { isLocked: false }, { merge: true });
          setShowUnlockDialog(false);
          setPassword('');
          toast.success("Kunci dibuka");
      } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `bonusMasterConfig/${selectedPeriod}`);
      }
      } else {
      toast.error("Password salah");
      }
  };

  const handleCreatePeriod = async () => {
    if (!newPeriodName || !newPeriodStart || !newPeriodEnd) {
      toast.error("Lengkapi data periode!");
      return;
    }
    try {
      const periodId = newPeriodName.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();
      await setDoc(doc(db, 'periodControls', periodId), {
        name: newPeriodName,
        startDate: newPeriodStart,
        endDate: newPeriodEnd,
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setSelectedPeriod(periodId);
      setIsDialogOpen(false);
      setNewPeriodName('');
      toast.success("Periode berhasil dibuat!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'periodControls');
    }
  };

  const handleInputChange = (dateStr: string, val: string) => {
    const num = parseInt(val.replace(/\D/g, '')) || 0;
    setDailyData(prev => ({ ...prev, [dateStr]: num }));
  };

  if (!currentPeriod) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-400" /> Master Nota Tertinggi
          </h2>
          <p className="text-white/40 text-xs">Tentukan nilai nota tertinggi harian sebagai acuan bonus.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <div 
                className="glass-panel border-white/10 text-white h-12 rounded-xl flex items-center gap-2 cursor-pointer px-4"
                onClick={() => setIsDialogOpen(true)}
              >
                <CalendarIcon className="w-4 h-4 text-primary" />
                {currentPeriod?.label || "Pilih/Buat Periode"}
              </div>
            <DialogContent className="glass-panel border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>Manajemen Periode</DialogTitle>
                <DialogDescription>Pilih periode aktif atau buat periode baru.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Pilih Periode Eksis</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {periodOptions.map(p => (
                      <Button 
                        key={p.value} 
                        variant={selectedPeriod === p.value ? "default" : "outline"}
                        className={`text-xs h-10 justify-start px-3 truncate ${selectedPeriod === p.value ? 'bg-primary text-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        onClick={() => { setSelectedPeriod(p.value); setIsDialogOpen(false); }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-white/10 pt-4 space-y-3">
                  <Label className="text-primary font-bold">Buat Periode Baru</Label>
                  <Input 
                    placeholder="Nama Periode (Contoh: April 2026)" 
                    value={newPeriodName}
                    onChange={e => setNewPeriodName(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-50">Tgl Mulai</Label>
                      <Input type="date" value={newPeriodStart} onChange={e => setNewPeriodStart(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-50">Tgl Selesai</Label>
                      <Input type="date" value={newPeriodEnd} onChange={e => setNewPeriodEnd(e.target.value)} className="bg-white/5 border-white/10 text-xs" />
                    </div>
                  </div>
                  <Button onClick={handleCreatePeriod} className="w-full bg-primary hover:bg-primary/90 font-bold">
                    Buat & Aktifkan
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button 
            onClick={handleSave} 
            disabled={saving || loading || isLocked}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 h-12 rounded-xl"
          >
            {saving ? 'Saving...' : 'Simpan Data'}
          </Button>
          <Button onClick={toggleLock} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl h-12 px-6 flex items-center gap-2`}>
            {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
          </Button>
        </div>
      </div>

      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogHeader>
            <DialogTitle className="uppercase font-black tracking-widest">Buka Kunci Periode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
             <p className="text-sm text-white/60">Masukkan password admin untuk membuka kunci periode ini.</p>
             <Input 
               type="password" 
               placeholder="Password Admin" 
               value={password} 
               onChange={e => setPassword(e.target.value)} 
               className="bg-white/5 border-white/10 text-white"
             />
             <Button onClick={confirmUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500">KONFIRMASI BUKA KUNCI</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="glass-panel border-none shadow-2xl bg-black/40 overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-20 text-center text-white/20 animate-pulse font-black uppercase tracking-widest">Memuat Data Periode...</div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent bg-white/5">
                    <TableHead className="text-white/40 font-bold uppercase text-[10px] pl-6 w-[200px]">Hari / Tanggal</TableHead>
                    <TableHead className="text-white/40 font-bold uppercase text-[10px]">Nominal Nota Tertinggi (Rp)</TableHead>
                    <TableHead className="text-white/40 font-bold uppercase text-[10px] text-right pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dates.map(date => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const value = dailyData[dateStr] || 0;
                    return (
                      <TableRow key={dateStr} className="border-white/5 hover:bg-white/5 transition-colors group">
                        <TableCell className="pl-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-white/40 text-[10px] font-black uppercase tracking-tighter">
                              {format(date, 'EEEE', { locale: id })}
                            </span>
                            <span className="text-white font-bold text-sm">
                              {format(date, 'dd MMMM yyyy', { locale: id })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="relative max-w-[300px]">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 text-xs font-bold">Rp</span>
                            <Input 
                              type="text"
                              value={new Intl.NumberFormat('id-ID').format(value)}
                              onChange={(e) => handleInputChange(dateStr, e.target.value)}
                              className="bg-white/5 border-white/10 text-white pl-11 h-11 rounded-xl font-bold focus:ring-emerald-500/50"
                              placeholder="0"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {value > 0 ? (
                            <div className="flex items-center justify-end gap-1.5 text-emerald-400">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-[10px] font-black uppercase">Set</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black uppercase text-white/10">Empty</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



// --- ADMIN BONUS JAGA DEPAN ---
function AdminBonusJagaDepan({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});

  const [bonusMaster, setBonusMaster] = useState<Record<string, number>>({});
  const [dailyAssignments, setDailyAssignments] = useState<Record<string, { bonusAmount: number, employeeIds: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');

  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);
  
  const dates = React.useMemo(() => {
    if (!currentPeriod) return [];
    const days: Date[] = [];
    let curr = new Date(currentPeriod.start);
    while (curr <= currentPeriod.end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [currentPeriod]);

  const employeeTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(dailyAssignments).forEach(([dateStr, day]) => {
      // Use bonus from master if available as it is the source of truth, fallback to stored bonusAmount
      const bonusValue = bonusMaster[dateStr] ?? (typeof day === 'object' && day && 'bonusAmount' in day ? (day as any).bonusAmount : 0);
      const employeeIds = typeof day === 'object' && day && 'employeeIds' in day ? (day as any).employeeIds : [];

      if (Array.isArray(employeeIds)) {
        employeeIds.forEach((empId: string) => {
          totals[empId] = (totals[empId] || 0) + (Number(bonusValue) || 0);
        });
      }
    });
    return totals;
  }, [dailyAssignments, bonusMaster]);

  const grandTotal = React.useMemo(() => {
    return Object.values(employeeTotals).reduce((sum: number, val: number) => sum + val, 0);
  }, [employeeTotals]);

  const downloadAccumulation = () => {
    if (!currentPeriod || employees.length === 0) return;
    
    const data = employees
      .map(emp => ({
        "No. Absen": emp.pin || "-",
        "Nama": emp.name,
        "Total Bonus Jaga Depan": employeeTotals[emp.id] || 0
      }))
      .filter(item => item["Total Bonus Jaga Depan"] > 0);

    if (data.length === 0) {
      toast.error("Tidak ada data bonus untuk diunduh (Semua Rp 0)");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Akumulasi Bonus");
    XLSX.writeFile(wb, `Bonus_Jaga_Depan_${currentPeriod.label}.xlsx`);
  };

  useEffect(() => {
    let componentMounted = true;
    if (!selectedPeriod) return;
    setLoading(true);
    
    // Fetch Bonus Master and Bonus Jaga Depan
    const unsubMaster = onSnapshot(doc(db, 'bonusMasterConfig', selectedPeriod), (snap) => {
      if (componentMounted) {
        setBonusMaster(snap.exists() ? (snap.data().dailyHighestReceipt || {}) : {});
      }
    });

    const unsubJagaDepan = onSnapshot(doc(db, 'bonusJagaDepan', selectedPeriod), (snap) => {
      if (componentMounted) {
        const data = snap.exists() ? snap.data() : {};
        setDailyAssignments(data.dailyAssignments || {});
        setIsLocked(data.isLocked || false);
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `bonusJagaDepan/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsubMaster();
      unsubJagaDepan();
    };
  }, [selectedPeriod]);

  const toggleLock = async () => {
    if (isLocked) {
      setShowUnlockDialog(true);
    } else {
      try {
        await setDoc(doc(db, 'bonusJagaDepan', selectedPeriod), { isLocked: true }, { merge: true });
        toast.success("Periode dikunci");
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusJagaDepan/${selectedPeriod}`);
      }
    }
  };

  const confirmUnlock = async () => {
    if (unlockPassword === 'admin123') {
      try {
        await setDoc(doc(db, 'bonusJagaDepan', selectedPeriod), { isLocked: false }, { merge: true });
        setShowUnlockDialog(false);
        setUnlockPassword('');
        toast.success("Periode berhasil dibuka");
      } catch(e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusJagaDepan/${selectedPeriod}`);
      }
    } else {
      toast.error("Password salah!");
    }
  };

  const autoSaveAssignments = async (assignments: Record<string, any>) => {
    try {
      await setDoc(doc(db, 'bonusJagaDepan', selectedPeriod), {
        periodId: selectedPeriod,
        dailyAssignments: assignments,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bonusJagaDepan/${selectedPeriod}`);
    }
  };

  if (!currentPeriod) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-400" /> Bonus Jaga Depan
          </h2>
          <p className="text-white/40 text-xs">Pilih karyawan yang mendapatkan bonus jaga depan harian.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={downloadAccumulation} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2 h-12 px-6">
            <Download className="w-4 h-4" /> Download
          </Button>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[200px] glass-panel border-white/10 text-white h-12 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                {currentPeriod?.label || selectedPeriod}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white max-h-[300px]">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {currentPeriod && (
        <div className="flex justify-end pt-2">
          <Button onClick={toggleLock} disabled={loading} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl gap-2 h-12 px-6`}>
            {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
          </Button>
        </div>
      )}

      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogTitle>Buka Kunci Periode (Jaga Depan)</DialogTitle>
          <div className="space-y-4 pt-4">
            <Input 
              type="password" 
              placeholder="Masukkan Password Admin"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
            <Button onClick={confirmUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500">Konfirmasi Buka Kunci</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="glass-panel border-none bg-black/40">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">Akumulasi Bonus Per Karyawan</h3>
            <div className="bg-emerald-500/20 px-4 py-1 rounded-lg border border-emerald-500/30">
              <span className="text-[10px] text-emerald-400 font-bold uppercase mr-2">Total Periode:</span>
              <span className="text-emerald-400 font-black text-sm">Rp {new Intl.NumberFormat('id-ID').format(grandTotal)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
             {employees.filter(emp => (employeeTotals[emp.id] || 0) > 0).map(emp => {
               const total = employeeTotals[emp.id] || 0;
               return (
                 <div key={emp.id} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors flex flex-col gap-1">
                   <div className="flex justify-between items-start gap-2">
                     <span className="text-white/40 text-[9px] font-bold uppercase truncate">{emp.pin || '-'}</span>
                   </div>
                   <span className="text-white font-bold text-[11px] truncate">{emp.name}</span>
                   <span className="text-emerald-400 font-black text-xs">Rp {new Intl.NumberFormat('id-ID').format(total)}</span>
                 </div>
               );
             })}
             {Object.keys(employeeTotals).length === 0 && (
               <div className="col-span-full py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                 <p className="text-white/20 text-xs italic">Belum ada data akumulasi untuk periode ini.</p>
               </div>
             )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-none bg-black/40">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 bg-white/5">
                  <TableHead className="text-white/40 font-bold uppercase text-[10px] pl-6">Tanggal</TableHead>
                  <TableHead className="text-white/40 font-bold uppercase text-[10px]">Bonus (Rp)</TableHead>
                  <TableHead className="text-white/40 font-bold uppercase text-[10px]">Karyawan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dates.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const bonus = bonusMaster[dateStr] || 0;
                  const selectedEmpIds = dailyAssignments[dateStr]?.employeeIds || [];
                  return (
                    <TableRow key={dateStr} className="border-white/5">
                      <TableCell className="pl-6 font-bold text-white text-sm">{format(date, 'dd MMM', { locale: id })}</TableCell>
                      <TableCell className="text-emerald-400 font-bold">{new Intl.NumberFormat('id-ID').format(bonus)}</TableCell>
                      <TableCell>
                        <EmployeeSelector 
                          employees={employees}
                          selectedIds={selectedEmpIds}
                          disabled={isLocked}
                          onAdd={(id) => {
                            if (isLocked) {
                                toast.error("Periode ini sudah dikunci!");
                                return;
                            }
                            const updated = { ...dailyAssignments };
                            const current = updated[dateStr] || { bonusAmount: bonusMaster[dateStr] || 0, employeeIds: [] };
                            updated[dateStr] = { ...current, employeeIds: [...current.employeeIds, id], bonusAmount: bonusMaster[dateStr] || 0 };
                            setDailyAssignments(updated);
                            autoSaveAssignments(updated);
                          }}
                          onRemove={(id) => {
                            if (isLocked) {
                                toast.error("Periode ini sudah dikunci!");
                                return;
                            }
                            const updated = { ...dailyAssignments };
                            const current = updated[dateStr] || { bonusAmount: bonusMaster[dateStr] || 0, employeeIds: [] };
                            updated[dateStr] = { ...current, employeeIds: current.employeeIds.filter(empId => empId !== id), bonusAmount: bonusMaster[dateStr] || 0 };
                            setDailyAssignments(updated);
                            autoSaveAssignments(updated);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- ADMIN BONUS LAIN-LAIN ---
function AdminBonusLainLain({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});

  const [bonusTypes, setBonusTypes] = useState<Record<string, string>>({}); // { id: name }
  
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemConfig', 'bonusLainLainTypes'), (snap) => {
      setBonusTypes(snap.exists() ? snap.data().types || {} : {});
    });
    return unsub;
  }, []);

  const [entries, setEntries] = useState<Array<{ id: string, pin: string, bonusTypeId: string, amount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [entryPin, setEntryPin] = useState('');
  const [entryTypeId, setEntryTypeId] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [showEmployeeCandidates, setShowEmployeeCandidates] = useState(false);

  const filteredEmployees = React.useMemo(() => {
    if (!entryPin) return [];
    return employees.filter(e => e.pin?.includes(entryPin) || e.name.toLowerCase().includes(entryPin.toLowerCase())).slice(0, 5);
  }, [entryPin, employees]);

  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);
  
  const employeeTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    entries.forEach(entry => {
      const emp = employees.find(e => e.pin === entry.pin);
      if (emp) {
        totals[emp.id] = (totals[emp.id] || 0) + Number(entry.amount);
      }
    });
    return totals;
  }, [entries, employees]);

  const grandTotal = React.useMemo(() => {
    return Object.values(employeeTotals).reduce((sum: number, val: number) => sum + val, 0);
  }, [employeeTotals]);

  useEffect(() => {
    let componentMounted = true;
    if (!selectedPeriod) return;
    setLoading(true);
    
    const unsub = onSnapshot(doc(db, 'bonusLainLain', selectedPeriod), (snap) => {
      if (componentMounted) {
        const data = snap.exists() ? snap.data() : {};
        setEntries(data.entries || []);
        setIsLocked(data.isLocked || false);
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `bonusLainLain/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsub();
    };
  }, [selectedPeriod]);

  const downloadExcel = () => {
    if (!employees || employees.length === 0) return;
    const data = employees
      .filter(emp => (employeeTotals[emp.id] || 0) > 0)
      .map(emp => ({
        "No. Absen": emp.pin || "-",
        "Nama": emp.name,
        "Total Bonus Lain Lain": employeeTotals[emp.id]
      }));

    if (data.length === 0) {
      toast.error("Tidak ada data untuk diunduh");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bonus Campuran");
    XLSX.writeFile(wb, `Bonus_Campuran_${currentPeriod?.label || 'All'}.xlsx`);
  };

  const toggleLock = async () => {
    if (isLocked) {
      setShowUnlockDialog(true);
    } else {
      try {
        await setDoc(doc(db, 'bonusLainLain', selectedPeriod), { isLocked: true }, { merge: true });
        toast.success("Periode dikunci");
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusLainLain/${selectedPeriod}`);
      }
    }
  };

  const confirmUnlock = async () => {
    if (unlockPassword === 'admin123') {
      try {
        await setDoc(doc(db, 'bonusLainLain', selectedPeriod), { isLocked: false }, { merge: true });
        setShowUnlockDialog(false);
        setUnlockPassword('');
        toast.success("Periode berhasil dibuka");
      } catch(e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusLainLain/${selectedPeriod}`);
      }
    } else {
      toast.error("Password salah!");
    }
  };

  const updateBonusTypes = async (newTypes: Record<string, string>) => {
    await setDoc(doc(db, 'systemConfig', 'bonusLainLainTypes'), { types: newTypes });
  };

  const addBonusType = async () => {
    if (!newTypeName) return;
    const id = 'type_' + Date.now();
    const updatedTypes = { ...bonusTypes, [id]: newTypeName };
    await updateBonusTypes(updatedTypes);
    setNewTypeName('');
    toast.success("Jenis bonus berhasil disimpan");
  };

  const addEntry = async () => {
    if (isLocked) {
      toast.error("Periode ini sudah dikunci!");
      return;
    }
    const emp = employees.find(e => e.pin === entryPin || e.name === entryPin);
    if (!emp || !entryTypeId || !entryAmount) {
        toast.error("Data tidak lengkap atau karyawan tidak ditemukan!");
        return;
    }
    const amount = Number(entryAmount.replace(/\D/g, ''));
    const newEntries = [...entries, { id: 'entry_' + Date.now(), pin: emp.pin, bonusTypeId: entryTypeId, amount }];
    
    setEntryPin('');
    setEntryAmount('');
    
    try {
      const docRef = doc(db, 'bonusLainLain', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          entries: newEntries,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          entries: newEntries,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
      toast.success("Entri otomatis disimpan");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bonusLainLain/${selectedPeriod}`);
      toast.error("Gagal menambah entri");
    }
  };

  const removeEntry = async (id: string) => {
    if (isLocked) {
      toast.error("Periode ini sudah dikunci!");
      return;
    }
    const newEntries = entries.filter(e => e.id !== id);
    try {
      const docRef = doc(db, 'bonusLainLain', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          entries: newEntries,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          entries: newEntries,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
      toast.success("Entri otomatis dihapus");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bonusLainLain/${selectedPeriod}`);
      toast.error("Gagal menghapus entri");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Bonus Campuran
          </h2>
          <p className="text-white/40 text-xs font-medium lowercase">periode: {currentPeriod?.label || selectedPeriod}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={downloadExcel} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl gap-2 h-12 px-6">
            <Download className="w-4 h-4" /> Download
          </Button>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[200px] glass-panel border-white/10 text-white h-12 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                 {currentPeriod?.label || selectedPeriod || "Pilih Periode"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white max-h-[300px]">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {currentPeriod && (
        <div className="flex justify-end pt-2">
          <Button onClick={toggleLock} disabled={loading} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl gap-2 h-12 px-6`}>
            {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
          </Button>
        </div>
      )}
      
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90">
          <DialogTitle className="text-white">Buka Kunci Periode</DialogTitle>
          <div className="space-y-4 pt-4">
            <Input 
              type="password" 
              placeholder="Masukkan Password Admin"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
            <Button onClick={confirmUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500">Konfirmasi Buka Kunci</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-6">
        <Card className="glass-panel border-none bg-black/40">
            <CardContent className="p-6">
                <h3 className="text-sm font-bold text-white mb-4">Jenis Bonus</h3>
                <div className="flex gap-2 mb-4">
                    <Input placeholder="Nama Bonus" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                    <Button onClick={addBonusType} variant="outline" className="border-white/10">+</Button>
                </div>
                <div className="space-y-2">
                    {Object.entries(bonusTypes).map(([id, name]) => (
                        <div key={id} className="flex justify-between items-center bg-white/5 p-2 rounded text-xs text-white">
                            {name}
                            <Button variant="ghost" size="sm" onClick={async () => { const next = {...bonusTypes}; delete next[id]; await updateBonusTypes(next); }}><Trash2 className="w-3 h-3 text-rose-500" /></Button>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
      </div>

      {!selectedPeriod && (
        <Card className="glass-panel border-white/10 bg-black/40 p-12 text-center">
            <h3 className="text-xl font-bold text-white mb-2">Pilih Periode</h3>
            <p className="text-white/60">Pilih periode di atas untuk mulai menambah entri bonus karyawan.</p>
        </Card>
      )}

      {currentPeriod && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="glass-panel border-none bg-black/40">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-2 mb-2 relative">
                  <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Karyawan</Label>
                    <EmployeeSelector 
                      employees={employees} 
                      selectedId={employees.find(e => e.pin === entryPin || e.name === entryPin)?.id || ''} 
                      onSelect={(id) => {
                        const emp = employees.find(e => e.id === id);
                        if (emp) setEntryPin(emp.pin);
                      }}
                      placeholder="Cari..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Jenis Bonus</Label>
                    <Select value={entryTypeId} onValueChange={setEntryTypeId} disabled={isLocked}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white h-10">
                          <SelectValue placeholder="Pilih Jenis">
                            {entryTypeId ? bonusTypes[entryTypeId] : "Pilih Jenis"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-black/80 text-white">
                            {Object.entries(bonusTypes).map(([id, name]) => (
                                 <SelectItem key={id} value={id}>{name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  </div>
                </div>
                <Input placeholder="Nominal" value={entryAmount} onChange={e => setEntryAmount(e.target.value)} className="bg-white/5 border-white/10 text-white mb-2" disabled={isLocked} />
                <Button onClick={addEntry} className="w-full bg-primary" disabled={isLocked}>Tambah</Button>
              </CardContent>
            </Card>

            <Card className="glass-panel border-none bg-black/40">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight">Daftar Bonus</h3>
                  <div className="bg-emerald-500/20 px-4 py-1 rounded-lg border border-emerald-500/30">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase mr-2">Grand Total:</span>
                    <span className="text-emerald-400 font-black text-sm">Rp {new Intl.NumberFormat('id-ID').format(grandTotal)}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 bg-white/5">
                        <TableHead className="text-white/40">No. Absen</TableHead>
                        <TableHead className="text-white/40">Nama</TableHead>
                        <TableHead className="text-white/40">Jenis</TableHead>
                        <TableHead className="text-white/40">Nominal</TableHead>
                        <TableHead className="text-white/40"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map(entry => (
                        <TableRow key={entry.id} className="border-white/5">
                          <TableCell className="text-white/60 font-mono text-xs">{entry.pin}</TableCell>
                          <TableCell className="text-white font-bold">{employees.find(e => e.pin === entry.pin)?.name || "-"}</TableCell>
                          <TableCell className="text-white/80">{bonusTypes[entry.bonusTypeId] || entry.bonusTypeId}</TableCell>
                          <TableCell className="text-emerald-400 font-bold">{new Intl.NumberFormat('id-ID').format(entry.amount)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => removeEntry(entry.id)} disabled={isLocked}>
                              <Trash2 className="w-4 h-4 text-rose-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card className="glass-panel border-none bg-black/40">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-tight mb-4">Akumulasi Total Per Karyawan</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                 {employees.filter(emp => (employeeTotals[emp.id] || 0) > 0).map(emp => {
                   const total = employeeTotals[emp.id] || 0;
                   return (
                     <div key={emp.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-between">
                       <span className="text-xs text-white/60 mb-1 line-clamp-1" title={emp.name}>{emp.name}</span>
                       <span className="text-sm font-black text-emerald-400">Rp {new Intl.NumberFormat('id-ID').format(total)}</span>
                     </div>
                   );
                 })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
// --- ADMIN BONUS LAIN-LAIN (COMBINED JAGA DEPAN + CAMPURAN) ---
function AdminBonusLainLainCombined({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});
  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);

  const [jagaDepanData, setJagaDepanData] = useState<any>(null);
  const [bonusMaster, setBonusMaster] = useState<any[]>([]);
  const [campuranData, setCampuranData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoading(true);

    const unsubJaga = onSnapshot(doc(db, 'bonusJagaDepan', selectedPeriod), (snap) => {
      setJagaDepanData(snap.exists() ? snap.data() : null);
    });

    const unsubMaster = onSnapshot(doc(db, 'bonusMasterConfig', selectedPeriod), (snap) => {
      setBonusMaster(snap.exists() ? snap.data().dailyHighestReceipt || [] : []);
    });

    const unsubCampuran = onSnapshot(doc(db, 'bonusLainLain', selectedPeriod), (snap) => {
      setCampuranData(snap.exists() ? snap.data() : null);
    });

    return () => {
      unsubJaga();
      unsubMaster();
      unsubCampuran();
    };
  }, [selectedPeriod]);

  useEffect(() => {
    if (loading && (jagaDepanData !== undefined || campuranData !== undefined)) {
       // Simple sync check - once we have listeners active, assume we're good after a brief window or just rely on state
       setLoading(false);
    }
  }, [jagaDepanData, campuranData]);

  const combinedTotals = React.useMemo(() => {
    const totals: Record<string, { name: string, pin: string, jagaDepan: number, campuran: number, total: number }> = {};
    
    // 1. Calculate Jaga Depan
    if (jagaDepanData?.dailyAssignments) {
      Object.entries(jagaDepanData.dailyAssignments).forEach(([date, shifts]: [string, any]) => {
        Object.entries(shifts).forEach(([shiftId, empId]: [string, any]) => {
          if (!empId) return;
          const emp = employees.find(e => e.id === empId);
          if (!emp) return;

          if (!totals[empId]) {
            totals[empId] = { name: emp.name || '', pin: emp.pin || '', jagaDepan: 0, campuran: 0, total: 0 };
          }
          
          const config = bonusMaster.find(b => b.date === date);
          if (config && config.nominal) {
            totals[empId].jagaDepan += config.nominal;
          }
        });
      });
    }

    // 2. Calculate Campuran (Lain-Lain)
    if (campuranData?.entries) {
      campuranData.entries.forEach((entry: any) => {
        const emp = employees.find(e => e.pin === entry.pin);
        if (!emp) return;

        if (!totals[emp.id]) {
          totals[emp.id] = { name: emp.name || '', pin: emp.pin || '', jagaDepan: 0, campuran: 0, total: 0 };
        }
        totals[emp.id].campuran += (entry.amount || 0);
      });
    }

    // 3. Final Total
    Object.values(totals).forEach(t => {
      t.total = t.jagaDepan + t.campuran;
    });

    return Object.fromEntries(
      Object.entries(totals).filter(([_, val]) => val.total > 0)
    );
  }, [jagaDepanData, bonusMaster, campuranData, employees]);

  const grandTotal = Object.values(combinedTotals).reduce((sum, item: any) => sum + item.total, 0);

  const downloadExcel = () => {
    if (Object.keys(combinedTotals).length === 0) return;

    const data = Object.values(combinedTotals).map((item: any) => ({
      'No. Absen': item.pin,
      'Nama': item.name,
      'Total Bonus Lain Lain': item.total
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bonus Lain-Lain");
    XLSX.writeFile(wb, `Bonus_Lain_Lain_Combined_${currentPeriod?.label || selectedPeriod || 'All'}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" /> Bonus Lain-Lain
          </h2>
          <p className="text-white/40 text-xs font-medium lowercase">periode: {currentPeriod?.label || selectedPeriod}</p>
        </div>
        <div className="flex gap-3">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[200px] glass-panel border-white/20 text-white h-12 rounded-xl">
              <CalendarIcon className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Pilih Periode">
                {currentPeriod?.label || selectedPeriod || "Pilih Periode"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white max-h-[300px]">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={downloadExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white h-12 rounded-xl">
            <Download className="w-4 h-4 mr-2" /> Excel
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-none bg-black/40">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">Akumulasi Gabungan</h3>
            <div className="bg-emerald-500/20 px-4 py-1 rounded-lg border border-emerald-500/30">
              <span className="text-[10px] text-emerald-400 font-bold uppercase mr-2">Grand Total:</span>
              <span className="text-emerald-400 font-black text-xl">
                Rp {new Intl.NumberFormat('id-ID').format(grandTotal as number)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 bg-white/5 h-12">
                  <TableHead className="text-white/40 text-xs uppercase font-black">No. Absen</TableHead>
                  <TableHead className="text-white/40 text-xs uppercase font-black">Nama</TableHead>
                  <TableHead className="text-white/40 text-xs uppercase font-black text-right">Jaga Depan</TableHead>
                  <TableHead className="text-white/40 text-xs uppercase font-black text-right">Campuran</TableHead>
                  <TableHead className="text-white/40 text-xs uppercase font-black text-right">Total Bonus Lain Lain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.values(combinedTotals).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-white/20 italic">
                      Tidak ada data bonus untuk periode ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  Object.values(combinedTotals).map((item: any, idx) => (
                    <TableRow key={idx} className="border-white/5 hover:bg-white/5 transition-colors">
                      <TableCell className="text-white/60 font-mono text-xs">{item.pin}</TableCell>
                      <TableCell className="text-white font-bold">{item.name}</TableCell>
                      <TableCell className="text-white/40 text-right">
                        {item.jagaDepan > 0 ? `Rp ${new Intl.NumberFormat('id-ID').format(item.jagaDepan)}` : '-'}
                      </TableCell>
                      <TableCell className="text-white/40 text-right">
                        {item.campuran > 0 ? `Rp ${new Intl.NumberFormat('id-ID').format(item.campuran)}` : '-'}
                      </TableCell>
                      <TableCell className="text-emerald-400 font-black text-right">
                        Rp {new Intl.NumberFormat('id-ID').format(item.total)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- ADMIN BONUS OPERATOR ---
function AdminBonusOperator({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});
  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);

  const [notaRate, setNotaRate] = useState<number>(50);
  const [balenRate, setBalenRate] = useState<number>(70);
  const [entries, setEntries] = useState<Record<string, { notaCount: number, balenCount: number }>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [isEditingRates, setIsEditingRates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showRateUnlockDialog, setShowRateUnlockDialog] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [rateUnlockPassword, setRateUnlockPassword] = useState('');

  // Selected employee for new entry
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [inputNota, setInputNota] = useState<string>('');
  const [inputBalen, setInputBalen] = useState<string>('');

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'bonusOperator', selectedPeriod), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setNotaRate(data.notaRate ?? 50);
        setBalenRate(data.balenRate ?? 70);
        setEntries(data.entries as Record<string, { notaCount: number, balenCount: number }> || {});
        setIsLocked(data.isLocked || false);
      } else {
        setNotaRate(50);
        setBalenRate(70);
        setEntries({});
        setIsLocked(false);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `bonusOperator/${selectedPeriod}`);
      setLoading(false);
    });

    return () => unsub();
  }, [selectedPeriod]);

  const autoSaveConfig = async (nRate: number, bRate: number) => {
    try {
      await setDoc(doc(db, 'bonusOperator', selectedPeriod), {
        periodId: selectedPeriod,
        notaRate: nRate,
        balenRate: bRate,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bonusOperator/${selectedPeriod}`);
    }
  };

  const autoSaveEntries = async (updatedEntries: Record<string, any>) => {
    try {
      const docRef = doc(db, 'bonusOperator', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          entries: updatedEntries,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          entries: updatedEntries,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bonusOperator/${selectedPeriod}`);
    }
  };

  const handleAddEntry = () => {
    if (!selectedEmpId) {
      toast.error("Pilih karyawan terlebih dahulu");
      return;
    }
    if (isLocked) {
      toast.error("Periode ini sudah dikunci!");
      return;
    }

    const n = parseInt(inputNota) || 0;
    const b = parseInt(inputBalen) || 0;

    const updated = { ...entries, [selectedEmpId]: { notaCount: n, balenCount: b } };
    setEntries(updated);
    autoSaveEntries(updated);

    // Reset input
    setSelectedEmpId('');
    setInputNota('');
    setInputBalen('');
    toast.success("Data berhasil ditambahkan");
  };

  const handleRemoveEntry = (empId: string) => {
    if (isLocked) {
      toast.error("Periode ini sudah dikunci!");
      return;
    }
    const updated = { ...entries };
    delete updated[empId];
    setEntries(updated);
    autoSaveEntries(updated);
  };

  const toggleLock = async () => {
    if (isLocked) {
      setShowUnlockDialog(true);
    } else {
      try {
        await setDoc(doc(db, 'bonusOperator', selectedPeriod), { isLocked: true }, { merge: true });
        toast.success("Periode dikunci");
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusOperator/${selectedPeriod}`);
      }
    }
  };

  const confirmUnlock = async () => {
    if (unlockPassword === 'admin123') {
      try {
        await setDoc(doc(db, 'bonusOperator', selectedPeriod), { isLocked: false }, { merge: true });
        setShowUnlockDialog(false);
        setUnlockPassword('');
        toast.success("Periode berhasil dibuka");
      } catch(e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusOperator/${selectedPeriod}`);
      }
    } else {
      toast.error("Password salah!");
    }
  };

  const confirmRateUnlock = () => {
    if (rateUnlockPassword === 'admin123') {
        setIsEditingRates(true);
        setShowRateUnlockDialog(false);
        setRateUnlockPassword('');
        toast.success("Akses edit tarif diberikan");
    } else {
        toast.error("Password salah!");
    }
  };

  const downloadExcel = () => {
    if (!currentPeriod || Object.keys(entries).length === 0) return;

    const data = Object.entries(entries as Record<string, { notaCount: number, balenCount: number }>).map(([empId, val]) => {
      const emp = employees.find(e => e.id === empId);
      const totalBonus = (val.notaCount * notaRate) + (val.balenCount * balenRate);
      return {
        'No. Absen': emp?.pin || '',
        'Nama': emp?.name || '',
        'Nota': val.notaCount,
        'Balen': val.balenCount,
        'Total Bonus Operator': totalBonus
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bonus Operator");
    XLSX.writeFile(workbook, `Bonus_Operator_${currentPeriod?.label || selectedPeriod}.xlsx`);
    toast.success("Excel berhasil diunduh");
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmpId);
  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.pin.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-400" /> Bonus Operator
          </h2>
          <p className="text-white/40 text-xs">Hitung bonus operator berdasarkan jumlah nota dan balen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-full md:w-[200px] glass-panel border-white/10 text-white h-11 px-6 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                {currentPeriod?.label || selectedPeriod}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white max-h-[300px]">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {currentPeriod && (
            <Button onClick={toggleLock} disabled={loading} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl gap-2 h-11 px-6`}>
              {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
            </Button>
          )}
          <Button 
            onClick={downloadExcel} 
            disabled={loading || Object.keys(entries).length === 0} 
            className="bg-primary hover:bg-primary/80 text-white rounded-xl h-11 px-6 flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download Excel
          </Button>
        </div>
      </div>

      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogTitle>Buka Kunci Periode (Operator)</DialogTitle>
          <div className="space-y-4 pt-4">
            <Input 
              type="password" 
              placeholder="Masukkan Password Admin"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
            <Button onClick={confirmUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500">Konfirmasi Buka Kunci</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRateUnlockDialog} onOpenChange={setShowRateUnlockDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogTitle>Otorisasi Edit Tarif</DialogTitle>
          <div className="space-y-4 pt-4">
            <p className="text-white/60 text-sm">Masukkan password admin untuk mengubah tarif nota dan balen.</p>
            <Input 
              type="password" 
              placeholder="Masukkan Password Admin"
              value={rateUnlockPassword}
              onChange={(e) => setRateUnlockPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
            <Button onClick={confirmRateUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500">Konfirmasi</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="glass-panel border-none bg-black/40">
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Konfigurasi Rumus (Per Nota/Balen)</h3>
            {!isLocked && (
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => isEditingRates ? setIsEditingRates(false) : setShowRateUnlockDialog(true)}
                    className="text-white/60 hover:text-white flex items-center gap-2"
                >
                    {isEditingRates ? 'Selesai Edit' : <><LockIcon className="w-3 h-3" /> Ubah Tarif</>}
                </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-white/40 text-xs">Nominal per Nota (Rp)</Label>
              <Input 
                type="number" 
                value={notaRate} 
                disabled={isLocked || !isEditingRates}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  setNotaRate(val);
                  autoSaveConfig(val, balenRate);
                }}
                className="bg-white/5 border-white/10 text-white font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/40 text-xs">Nominal per Balen (Rp)</Label>
              <Input 
                type="number" 
                value={balenRate} 
                disabled={isLocked || !isEditingRates}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  setBalenRate(val);
                  autoSaveConfig(notaRate, val);
                }}
                className="bg-white/5 border-white/10 text-white font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLocked && (
        <Card className="glass-panel border-none bg-black/40">
          <CardContent className="p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4">Tambah Data Hasil Kerja</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2 relative">
                <Label className="text-white/40 text-xs">Pilih Karyawan (Cari Nama/PIN)</Label>
                <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      role="combobox" 
                      className="w-full justify-between bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white h-10 px-3"
                    >
                      {selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.pin})` : "Cari Karyawan..."}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0 glass-panel border-white/20 bg-black/95 z-50">
                    <div className="p-2 border-b border-white/10">
                      <Input 
                        placeholder="Ketik nama atau pin..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-transparent border-none focus-visible:ring-0 text-white"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                      {filteredEmployees.length === 0 ? (
                        <div className="p-4 text-center text-white/40 text-sm">Tidak ditemukan</div>
                      ) : (
                        filteredEmployees.map(e => (
                          <div 
                            key={e.id}
                            onClick={() => {
                              setSelectedEmpId(e.id);
                              setIsSearchOpen(false);
                              setSearchTerm('');
                            }}
                            className="p-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-none flex justify-between items-center group"
                          >
                            <span className="text-white group-hover:text-emerald-400 transition-colors font-medium">{e.name}</span>
                            <span className="text-white/40 text-xs font-mono">{e.pin}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-white/40 text-xs">Jumlah Nota</Label>
                <Input 
                   type="number" 
                   value={inputNota} 
                   onChange={(e) => setInputNota(e.target.value)} 
                   placeholder="0"
                   className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/40 text-xs">Jumlah Balen</Label>
                <Input 
                   type="number" 
                   value={inputBalen} 
                   onChange={(e) => setInputBalen(e.target.value)} 
                   placeholder="0"
                   className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <Button onClick={handleAddEntry} className="bg-emerald-600 hover:bg-emerald-500 rounded-xl h-10">
                Tambah Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel border-none bg-black/40">
        <CardContent className="p-6">
          <div className="overflow-x-auto no-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent text-xs text-white/40">
                  <TableHead>Pin</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-center">Nota</TableHead>
                  <TableHead className="text-center">Balen</TableHead>
                  <TableHead className="text-right">Total Bonus</TableHead>
                  {!isLocked && <TableHead className="text-center">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-white/20">Memuat data...</TableCell></TableRow>
                ) : Object.keys(entries).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-white/20 italic">Belum ada data input.</TableCell></TableRow>
                ) : (
                  Object.entries(entries as Record<string, { notaCount: number, balenCount: number }>).map(([empId, val]) => {
                    const emp = employees.find(e => e.id === empId);
                    const totalBonus = (val.notaCount * notaRate) + (val.balenCount * balenRate);
                    return (
                      <TableRow key={empId} className="border-white/5 hover:bg-white/5 transition-colors">
                        <TableCell className="text-white/60 font-mono text-xs">{emp?.pin}</TableCell>
                        <TableCell className="text-white font-bold">{emp?.name}</TableCell>
                        <TableCell className="text-center text-white/80">{val.notaCount}</TableCell>
                        <TableCell className="text-center text-white/80">{val.balenCount}</TableCell>
                        <TableCell className="text-right text-emerald-400 font-mono font-black">
                          Rp {new Intl.NumberFormat('id-ID').format(totalBonus)}
                        </TableCell>
                        {!isLocked && (
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveEntry(empId)} className="text-rose-400 hover:bg-rose-400/10">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeView({ 
  employee, 
  employees, 
  shifts, 
  sections, 
  divisions, 
  onLogout, 
  theme, 
  toggleTheme,
  confirm,
  prompt,
  alert
}: { 
  employee: Employee, 
  employees: Employee[],
  shifts: Shift[],
  sections: Section[],
  divisions: Division[],
  onLogout: () => void,
  theme: 'light' | 'dark',
  toggleTheme: () => void,
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
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
  const [activeTab, setActiveTab] = useState("absen");

  useEffect(() => {
     const q = query(
        collection(db, 'attendance'),
        where('employeeId', '==', employee.id),
        orderBy('date', 'desc')
     );
     // Filter by period logic will be applied in render based on start/end dates
     const unsub = onSnapshot(q, (snap) => setHistory(snap.docs.map(d => ({id: d.id, ...d.data()} as Attendance))), (err) => handleFirestoreError(err, OperationType.LIST, 'attendance_history'));
     return unsub;
  }, [employee.id]);

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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'employee_attendance_today'));
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
                timeout: 20000, 
                enableHighAccuracy: true,
                maximumAge: 60000 
            });
        });
        
        // Anti-spoofing check: Check distance if office config exists
        const officeSnap = await getDoc(doc(db, 'config', 'office'));
        if (officeSnap.exists()) {
          const config = officeSnap.data();
          const dist = calculateDistance(position.coords.latitude, position.coords.longitude, config.lat, config.lng);
          if (dist > config.radius) {
            setIsProcessing(false);
            alert(`Anda berada di luar radius kantor! (Jarak: ${Math.round(dist)}m, Max: ${config.radius}m)`, "error");
            return;
          }
        }
        location = JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch (e: any) {
        setIsProcessing(false);
        console.error("Geolocation error:", e);
        alert(`Gagal mendapatkan lokasi: ${e.message || 'Izin ditolak atau timeout'}. Pastikan GPS aktif!`, "error");
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
        // Log to activityLogs for historical record
        try {
          await addDoc(collection(db, 'activityLogs'), {
            employeeId: employee.id,
            employeeName: employee.name,
            action,
            timestamp: serverTimestamp(),
            location: location || (pendingAction?.location || ""),
            photoUrl: photoData || "",
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'activityLogs');
        }

        if (action === 'checkIn') {
          if (attendance) return alert("Anda sudah melakukan check-in hari ini.", "info");
          if (!selectedShiftId) return alert("Pilih shift terlebih dahulu!", "info");
          if (new Date().getDay() === 0) {
            const dayOffShift = shifts.find(s => s.name.toLowerCase().replace(/\s/g, '') === 'dayoff');
            if (selectedShiftId !== dayOffShift?.id) return alert("Hari Minggu hanya boleh shift Dayoff!", "info");
          }
          
          try {
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
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'attendance');
          }
        } else if (action === 'breakStart') {
          if (!attendance) return alert("Silakan check-in terlebih dahulu!", "info");
          if (attendance.breakStart) return alert("Anda sudah mulai istirahat.", "info");
          
          const payload = { breakStart: time };
          try {
            await updateDoc(doc(db, 'attendance', attendance.id), { ...payload, updatedAt: serverTimestamp() });
            setAttendance({ ...attendance, ...payload } as Attendance);
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `attendance/${attendance.id}`);
          }
        } else if (action === 'breakEnd') {
          if (!attendance) return alert("Silakan check-in terlebih dahulu!", "info");
          if (!attendance.breakStart) return alert("Anda belum mulai istirahat.", "info");
          if (attendance.breakEnd) return alert("Anda sudah selesai istirahat.", "info");
          
          const payload = { breakEnd: time };
          try {
            await updateDoc(doc(db, 'attendance', attendance.id), { ...payload, updatedAt: serverTimestamp() });
            setAttendance({ ...attendance, ...payload } as Attendance);
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `attendance/${attendance.id}`);
          }
        } else if (action === 'checkOut') {
          if (!attendance) return alert("Silakan check-in terlebih dahulu!", "info");
          if (!!attendance.breakStart && !attendance.breakEnd) return alert("Selesaikan istirahat terlebih dahulu!", "info");
          if (!attendance.breakStart || !attendance.breakEnd) return alert("Istirahat wajib dilakukan (mulai dan selesai).", "info");
          if (attendance.checkOut) return alert("Anda sudah check-out hari ini.", "info");
          
          const payload = { checkOut: time };
          try {
            await updateDoc(doc(db, 'attendance', attendance.id), { ...payload, updatedAt: serverTimestamp() });
            setAttendance({ ...attendance, ...payload } as Attendance);
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `attendance/${attendance.id}`);
          }
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
    if (!newPass || newPass.length < 4) return alert("Password minimal 4 karakter!", "error");
    await updateDoc(doc(db, 'employees', employee.id), {
      password: newPass,
      updatedAt: serverTimestamp()
    });
    alert("Password berhasil diperbarui!", "success");
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
    <div className="h-screen overflow-x-hidden overflow-y-auto p-4 md:p-10">
      <div className="max-w-4xl mx-auto pb-20">
      {/* Change Password Dialog */}
      <Dialog open={showChangePass} onOpenChange={setShowChangePass}>
        <DialogContent className="glass-panel text-foreground border-border sm:max-w-[400px]">
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

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Halo, {employee.nickname || employee.name.split(' ')[0]}</h2>
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
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowChangePass(true)} 
            className="glass-panel text-white/60 hover:text-white hover:bg-white/10 rounded-xl flex gap-2 border-white/10 h-10 px-4 flex-1 md:flex-none justify-center"
          >
            <LockIcon className="w-4 h-4 shrink-0" /> Password
          </Button>
          <Button variant="outline" size="sm" onClick={onLogout} className="glass-panel text-white hover:bg-white/10 rounded-xl flex gap-2 border-white/10 h-10 px-4 flex-1 md:flex-none justify-center">
            <LogOut className="w-4 h-4 shrink-0" /> Keluar
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap w-full glass-panel p-1.5 h-auto bg-white/5 border-white/10 mb-8 rounded-2xl gap-2 justify-center">
          <TabsTrigger value="absen" className="flex-1 min-w-[60px] rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-primary data-[state=active]:text-white font-bold transition-all py-3 md:py-3 text-white/40">
            <Clock className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Absen</span>
          </TabsTrigger>
          <TabsTrigger value="libur" className="flex-1 min-w-[60px] rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white font-bold transition-all py-3 md:py-3 text-white/40">
            <CalendarIcon className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Libur</span>
          </TabsTrigger>
          <TabsTrigger value="bonus" className="flex-1 min-w-[60px] rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-bold transition-all py-3 md:py-3 text-white/40">
            <Zap className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Bonus</span>
          </TabsTrigger>
          <TabsTrigger value="ristan" className="flex-1 min-w-[60px] rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white font-bold transition-all py-3 md:py-3 text-white/40">
            <ClipboardList className="w-4 h-4" /> <span className="text-[10px] md:text-sm">Ristan</span>
          </TabsTrigger>
          <TabsTrigger value="riwayat" className="flex-1 min-w-[60px] rounded-xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white font-bold transition-all py-3 md:py-3 text-white/40">
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
                      onComplete={async () => {
                        const isCurrentlyOnBreak = !!attendance?.breakStart && !attendance?.breakEnd;
                        await handleAction(isCurrentlyOnBreak ? 'breakEnd' : 'breakStart');
                      }}
                    />
                  </div>

                  {/* Timer Istirahat Realtime */}
                  {attendance?.breakStart && !attendance?.breakEnd && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-6 p-4 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col items-center gap-1 shadow-inner"
                    >
                      <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mb-1">Durasi Istirahat Anda</p>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
                        <p className="text-4xl font-mono font-black text-white tracking-widest">
                          {(() => {
                            const start = toDateSafe(attendance.breakStart);
                            const diff = Math.floor((currentTime.getTime() - start.getTime()) / 1000);
                            const mins = Math.floor(diff / 60);
                            const secs = diff % 60;
                            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                          })()}
                        </p>
                      </div>
                    </motion.div>
                  )}
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
          <EmployeeLeave employee={employee} employees={employees} sections={sections} />
        </TabsContent>

        <TabsContent value="riwayat" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <Card className="glass-panel border-none shadow-lg">
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
              <CardTitle className="text-white">Riwayat Absensi</CardTitle>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full md:w-[200px] glass-panel border-white/10 text-white">
                  <SelectValue placeholder="Pilih Periode">
                    {periodOptions.find(p => p.value === selectedPeriod)?.label || "Pilih Periode"}
                  </SelectValue>
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
          <Tabs defaultValue="ristan-100" className="w-full">
            <TabsList className="grid grid-cols-3 w-full glass-panel p-1 bg-white/5 border-white/5 mb-6 rounded-xl">
              <TabsTrigger value="ristan-100" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white text-xs font-bold py-2">Ristan 100%</TabsTrigger>
              <TabsTrigger value="ristan-bersama" className="rounded-lg data-[state=active]:bg-rose-500 data-[state=active]:text-white text-xs font-bold py-2">Bersama</TabsTrigger>
              <TabsTrigger value="seragam" className="rounded-lg data-[state=active]:bg-fuchsia-600 data-[state=active]:text-white text-xs font-bold py-2">Seragam</TabsTrigger>
            </TabsList>
            <TabsContent value="ristan-100">
              <PotonganKehilanganManager employees={employees} isEmployee={true} currentEmployeeId={employee.id} />
            </TabsContent>
            <TabsContent value="ristan-bersama">
              <PotonganKehilanganBersamaManager employees={employees} isEmployee={true} currentEmployeeId={employee.id} />
            </TabsContent>
            <TabsContent value="seragam">
              <PotonganSeragamManager employees={employees} isEmployee={true} currentEmployeeId={employee.id} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  </div>
  );
}

// --- ADMIN BONUS NOTA ---
function AdminBonusNota({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);



  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});
  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);

  const [entries, setEntries] = useState<Record<string, number>>({}); // { empId: amount }
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    let componentMounted = true;
    if (!selectedPeriod) return;
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'bonusNota', selectedPeriod), (snap) => {
      if (componentMounted) {
        if (snap.exists()) {
          const data = snap.data();
          setEntries(data.entries || {});
          setIsLocked(data.isLocked || false);
        } else {
          setEntries({});
          setIsLocked(false);
        }
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `bonusNota/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsub();
    };
  }, [selectedPeriod]);

  const saveEntries = async (updated: Record<string, number>) => {
    try {
      const docRef = doc(db, 'bonusNota', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          entries: updated,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          entries: updated,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bonusNota/${selectedPeriod}`);
    }
  };

  const handleAddOrUpdate = () => {
    if (!selectedEmpId || !inputAmount) {
      toast.error("Data tidak lengkap");
      return;
    }
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const amount = parseInt(inputAmount.replace(/\D/g, '')) || 0;
    const updated = { ...entries, [selectedEmpId]: amount };
    setEntries(updated);
    saveEntries(updated);
    
    setSelectedEmpId('');
    setInputAmount('');
    setEditId(null);
    toast.success(editId ? "Data diperbarui" : "Data ditambahkan");
  };

  const handleEdit = (empId: string) => {
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    setSelectedEmpId(empId);
    setInputAmount(entries[empId]?.toString() || '');
    setEditId(empId);
  };

  const handleRemove = (empId: string) => {
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const updated = { ...entries };
    delete updated[empId];
    setEntries(updated);
    saveEntries(updated);
    toast.success("Data dihapus");
  };

  const handleClearAll = async () => {
    if (password === 'admin123') {
      await saveEntries({});
      setShowClearDialog(false);
      setPassword('');
      toast.success("Semua data dihapus");
    } else {
      toast.error("Password salah");
    }
  };

  const toggleLock = async () => {
    if (isLocked) {
        setShowUnlockDialog(true);
    } else {
        try {
            await setDoc(doc(db, 'bonusNota', selectedPeriod), { isLocked: true }, { merge: true });
            toast.success("Periode dikunci");
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `bonusNota/${selectedPeriod}`);
        }
    }
  };

  const confirmUnlock = async () => {
    if (password === 'admin123') {
      try {
        await setDoc(doc(db, 'bonusNota', selectedPeriod), { isLocked: false }, { merge: true });
        setShowUnlockDialog(false);
        setPassword('');
        toast.success("Kunci dibuka");
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusNota/${selectedPeriod}`);
      }
    } else {
      toast.error("Password salah");
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isLocked) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary', cellNF: true, cellText: true, cellDates: true });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          
          const updated = { ...entries };
          let detectedPin = '';
          let detectedAmount = '';
          
          data.forEach((row: any) => {
              const rowKeys = Object.keys(row);
              
              const pinKey = rowKeys.find(k => {
                  const lk = k.toLowerCase().replace(/[^a-z]/g, '');
                  return ['noabsen', 'absen', 'pin', 'idabsen', 'nik', 'noinduk'].includes(lk);
              });
              if (pinKey) detectedPin = pinKey;
              const pin = pinKey ? String(row[pinKey] || '').trim() : '';

              const amountKey = rowKeys.find(k => {
                  const lk = k.toLowerCase().trim();
                  return ['bonus nota', 'nominal bonus', 'bonus', 'nominal', 'jumlah', 'nota', 'amount', 'total', 'grand total'].some(s => lk === s || lk.startsWith(s));
              }) || rowKeys.find(k => {
                  const lk = k.toLowerCase().trim();
                  return lk.includes('nota') || (lk.includes('bonus') && !lk.includes('pin') && !lk.includes('absen'));
              });
              if (amountKey) detectedAmount = amountKey;
              
              const rawAmount = amountKey ? row[amountKey] : 0;
              let amount = 0;
              if (typeof rawAmount === 'number') {
                  amount = Math.round(rawAmount);
              } else if (rawAmount) {
                  const str = String(rawAmount).trim();
                  if (str && str !== '-') {
                      const cleaned = str.replace(/[^\d.,-]/g, '');
                      if (cleaned.includes(',') && cleaned.includes('.')) {
                          const lastC = cleaned.lastIndexOf(',');
                          const lastD = cleaned.lastIndexOf('.');
                          if (lastC > lastD) amount = parseFloat(cleaned.replace(/\./g, '').replace(/,/g, '.'));
                          else amount = parseFloat(cleaned.replace(/,/g, ''));
                      } else if (cleaned.includes(',')) {
                          const parts = cleaned.split(',');
                          if (parts[parts.length-1].length === 2 && parts.length === 2) amount = parseFloat(cleaned.replace(/,/g, '.'));
                          else amount = parseInt(cleaned.replace(/,/g, ''));
                      } else if (cleaned.includes('.')) {
                          const parts = cleaned.split('.');
                          if (parts[parts.length-1].length === 2 && parts.length === 2) amount = parseFloat(cleaned);
                          else amount = parseInt(cleaned.replace(/\./g, ''));
                      } else {
                          amount = parseInt(cleaned) || 0;
                      }
                  }
              }

              const emp = employees.find(e => String(e.pin).trim() === pin);
              if (emp && !isNaN(amount)) {
                  updated[emp.id] = Math.max(0, Math.floor(amount));
              }
          });
          setEntries(updated);
          saveEntries(updated);
          toast.success(`Impor Berhasil! Kolom terdeteksi: PIN (${detectedPin || '?'}), Nominal (${detectedAmount || '?'})`);
      } catch (err) {
          toast.error("Gagal impor file");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset input
  };

  const handleDownload = () => {
    const data = Object.entries(entries).map(([id, amount]) => {
      const emp = employees.find(e => e.id === id);
      return {
        'No. Absen': emp?.pin || '',
        'Nama': emp?.name || '',
        'Bonus Nota': amount
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bonus Nota");
    XLSX.writeFile(wb, `Bonus_Nota_${currentPeriod?.label || selectedPeriod}.xlsx`);
  };

  const grandTotal = (Object.values(entries) as number[]).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Bonus Nota
          </h2>
          <p className="text-white/40 text-xs font-medium lowercase">periode: {currentPeriod?.label || selectedPeriod}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px] glass-panel border-white/10 text-white h-11 px-6 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                 {currentPeriod?.label || selectedPeriod}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleDownload} variant="outline" className="h-11 rounded-xl text-white bg-blue-600 hover:bg-blue-500 border-none px-6">
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
          <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 h-11 flex items-center gap-2 text-sm font-medium transition-colors">
            <Upload className="w-4 h-4" /> Import Excel
            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImport} disabled={isLocked} />
          </label>
          <Button onClick={toggleLock} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl h-11 px-6 flex items-center gap-2`}>
            {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
          </Button>
          <Button onClick={() => setShowClearDialog(true)} variant="ghost" className="h-11 px-6 text-rose-400 hover:bg-rose-500/10 rounded-xl">
            <Trash2 className="w-4 h-4 mr-2" /> Kosongkan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-none bg-black/40">
           <CardContent className="p-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-tight mb-4">{editId ? 'Edit Entri' : 'Tambah Entri'}</h3>
              <div className="space-y-4">
                 <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Karyawan</Label>
                    <EmployeeSelector 
                      employees={employees} 
                      selectedId={selectedEmpId} 
                      onSelect={(id) => setSelectedEmpId(id)}
                      placeholder="Pilih Karyawan..."
                      disabled={isLocked || !!editId}
                    />
                 </div>
                 <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Nominal Bonus</Label>
                    <Input 
                      placeholder="Masukkan Nominal" 
                      value={inputAmount} 
                      onChange={e => setInputAmount(e.target.value)} 
                      className="bg-white/5 border-white/10 text-white h-10" 
                      disabled={isLocked}
                    />
                 </div>
                 <div className="flex gap-2">
                    <Button onClick={handleAddOrUpdate} className="flex-1 bg-primary h-11" disabled={isLocked}>{editId ? 'Perbarui' : 'Simpan'}</Button>
                    {editId && <Button onClick={() => { setEditId(null); setSelectedEmpId(''); setInputAmount(''); }} variant="ghost" className="text-white h-11 border border-white/10">Batal</Button>}
                 </div>
              </div>
           </CardContent>
        </Card>

        <Card className="glass-panel border-none bg-black/40 md:col-span-2">
           <CardContent className="p-6">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-bold text-white uppercase tracking-tight">Akumulasi Bonus Nota ({currentPeriod?.label || selectedPeriod})</h3>
                 <div className="bg-emerald-500/20 px-4 py-1 rounded-lg border border-emerald-500/30">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase mr-2">Grand Total:</span>
                    <span className="text-emerald-400 font-black text-sm">Rp {new Intl.NumberFormat('id-ID').format(grandTotal)}</span>
                 </div>
              </div>
              <div className="overflow-x-auto max-h-[500px] no-scrollbar">
                <Table>
                   <TableHeader>
                      <TableRow className="border-white/5 bg-white/5">
                         <TableHead className="text-white/40 text-xs font-black uppercase">PIN</TableHead>
                         <TableHead className="text-white/40 text-xs font-black uppercase">Nama</TableHead>
                         <TableHead className="text-white/40 text-xs font-black uppercase text-right">Bonus Nota</TableHead>
                         <TableHead className="text-white/40 text-xs font-black uppercase text-right"></TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {Object.entries(entries).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12 text-white/20 italic text-xs uppercase tracking-widest">Tidak ada data bonus</TableCell>
                        </TableRow>
                      ) : (
                        Object.entries(entries).map(([empId, amount]) => {
                          const emp = employees.find(e => e.id === empId);
                          return (
                            <TableRow key={empId} className="border-white/5 hover:bg-white/5 transition-colors">
                               <TableCell className="text-white/60 font-mono text-xs">{emp?.pin || '-'}</TableCell>
                               <TableCell className="text-white font-bold">{emp?.name || 'Unknown'}</TableCell>
                               <TableCell className="text-emerald-400 font-black text-right">Rp {new Intl.NumberFormat('id-ID').format(amount as number)}</TableCell>
                               <TableCell className="text-right flex justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(empId)} disabled={isLocked} className="h-8 w-8 hover:bg-white/10 text-white/40">
                                     <Edit className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleRemove(empId)} disabled={isLocked} className="h-8 w-8 hover:bg-rose-500/10 text-rose-400">
                                     <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                               </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                   </TableBody>
                </Table>
              </div>
           </CardContent>
        </Card>
      </div>

      {/* Dialog Clear All */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogHeader>
            <DialogTitle className="text-rose-400 uppercase font-black tracking-widest">Hapus Semua Data?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
             <p className="text-sm text-white/60">Tindakan ini tidak dapat dibatalkan. Masukkan password admin untuk mengonfirmasi.</p>
             <Input 
               type="password" 
               placeholder="Password Admin" 
               value={password} 
               onChange={e => setPassword(e.target.value)} 
               className="bg-white/5 border-white/10 text-white"
             />
             <Button onClick={handleClearAll} variant="destructive" className="w-full">YA, HAPUS SEMUA</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Buka Kunci */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogHeader>
            <DialogTitle className="uppercase font-black tracking-widest">Buka Kunci Periode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
             <p className="text-sm text-white/60">Masukkan password admin untuk membuka kunci periode ini.</p>
             <Input 
               type="password" 
               placeholder="Password Admin" 
               value={password} 
               onChange={e => setPassword(e.target.value)} 
               className="bg-white/5 border-white/10 text-white"
             />
             <Button onClick={confirmUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500">KONFIRMASI BUKA KUNCI</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- ADMIN BONUS BERAT ---
function AdminKoreksiGaji({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});
  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);

  const [entries, setEntries] = useState<Record<string, number>>({}); // { empId: amount }
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [inputAmount, setInputAmount] = useState('');

  useEffect(() => {
    let componentMounted = true;
    if (!selectedPeriod) return;
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'koreksiGaji', selectedPeriod), (snap) => {
      if (componentMounted) {
        if (snap.exists()) {
          const data = snap.data();
          setEntries(data.entries || {});
          setIsLocked(data.isLocked || false);
        } else {
          setEntries({});
          setIsLocked(false);
        }
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `koreksiGaji/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsub();
    };
  }, [selectedPeriod]);

  const saveEntries = async (updated: Record<string, number>) => {
    try {
      const docRef = doc(db, 'koreksiGaji', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          entries: updated,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          entries: updated,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `koreksiGaji/${selectedPeriod}`);
    }
  };

  const handleAdd = () => {
    if (!selectedEmpId || !inputAmount) {
      toast.error("Data tidak lengkap");
      return;
    }
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const amount = parseInt(inputAmount.replace(/\D/g, '')) || 0;
    const updated = { ...entries, [selectedEmpId]: amount };
    setEntries(updated);
    saveEntries(updated);
    
    setSelectedEmpId('');
    setInputAmount('');
    toast.success("Data ditambahkan");
  };

  const handleRemove = (empId: string) => {
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const updated = { ...entries };
    delete updated[empId];
    setEntries(updated);
    saveEntries(updated);
    toast.success("Data dihapus");
  };
  
  const handleDownload = () => {
    const data = Object.entries(entries).map(([id, amount]) => {
      const emp = employees.find(e => e.id === id);
      return {
        'No. Absen': emp?.pin || '',
        'Nama': emp?.name || '',
        'Nominal': amount
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Koreksi Gaji");
    XLSX.writeFile(wb, `Koreksi_Gaji_${currentPeriod?.label || selectedPeriod}.xlsx`);
  };

  const toggleLock = async () => {
      if (isLocked) {
          setShowUnlockDialog(true);
      } else {
           await setDoc(doc(db, 'koreksiGaji', selectedPeriod), { isLocked: true }, { merge: true });
           toast.success("Periode dikunci");
      }
  }

  const handleUnlock = async () => {
    if (password === 'admin123') { 
       await setDoc(doc(db, 'koreksiGaji', selectedPeriod), { isLocked: false }, { merge: true });
       setShowUnlockDialog(false);
       setPassword('');
       toast.success("Periode dibuka");
    } else {
       toast.error("Password salah");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Koreksi Gaji (Penambahan)
          </h2>
          <p className="text-white/40 text-xs font-medium lowercase">periode: {currentPeriod?.label || selectedPeriod}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px] glass-panel border-white/10 text-white h-11 px-6 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                 {currentPeriod?.label || selectedPeriod}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleDownload} variant="outline" className="h-11 rounded-xl text-white bg-blue-600 hover:bg-blue-500 border-none px-6">
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
          <Button onClick={toggleLock} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl h-11 px-6 flex items-center gap-2`}>
            {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-none bg-black/40">
           <CardContent className="p-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-tight mb-4">Tambah Entri</h3>
              <div className="space-y-4">
                 <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Karyawan</Label>
                    <EmployeeSelector 
                      employees={employees} 
                      selectedId={selectedEmpId} 
                      onSelect={(id) => setSelectedEmpId(id)}
                      placeholder="Pilih Karyawan..."
                      disabled={isLocked}
                    />
                 </div>
                 <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Nominal</Label>
                    <Input 
                      type="number"
                      value={inputAmount}
                      onChange={(e) => setInputAmount(e.target.value)}
                      placeholder="0"
                      disabled={isLocked}
                      className="glass-panel border-white/10 text-white h-11 rounded-xl"
                    />
                 </div>
                 <Button onClick={handleAdd} className="w-full h-11 rounded-xl bg-primary text-white font-bold" disabled={isLocked}>
                    Tambah
                 </Button>
              </div>
           </CardContent>
        </Card>

        <Card className="glass-panel border-none bg-black/40 md:col-span-2">
           <CardContent className="p-6">
              <Table>
                <TableHeader>
                    <TableRow className="border-white/5">
                        <TableHead className="text-white/40">Karyawan</TableHead>
                        <TableHead className="text-white/40">Nominal</TableHead>
                        <TableHead className="text-white/40"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Object.entries(entries).map(([id, amount]) => {
                        const emp = employees.find(e => e.id === id);
                        return (
                            <TableRow key={id} className="border-white/5">
                                <TableCell className="text-white font-bold">{emp?.name || id}</TableCell>
                                <TableCell className="text-emerald-400">{new Intl.NumberFormat('id-ID').format(Number(amount) || 0)}</TableCell>
                                <TableCell>
                                    <Button variant="ghost" onClick={() => handleRemove(id)} className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" disabled={isLocked}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
              </Table>
           </CardContent>
        </Card>
      </div>

      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/10 text-white">
            <DialogHeader>
                <DialogTitle>Buka Kunci Periode</DialogTitle>
                <DialogDescription>Masukkan password untuk membuka kunci.</DialogDescription>
            </DialogHeader>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-panel" />
            <DialogFooter>
                <Button onClick={handleUnlock}>Buka</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- ADMIN KOREKSI GAJI MINUS ---
function AdminKoreksiGajiMinus({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});
  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);

  const [entries, setEntries] = useState<Record<string, number>>({}); // { empId: amount }
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [inputAmount, setInputAmount] = useState('');

  useEffect(() => {
    let componentMounted = true;
    if (!selectedPeriod) return;
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'koreksiGajiMinus', selectedPeriod), (snap) => {
      if (componentMounted) {
        if (snap.exists()) {
          const data = snap.data();
          setEntries(data.entries || {});
          setIsLocked(data.isLocked || false);
        } else {
          setEntries({});
          setIsLocked(false);
        }
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `koreksiGajiMinus/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsub();
    };
  }, [selectedPeriod]);

  const saveEntries = async (updated: Record<string, number>) => {
    try {
      const docRef = doc(db, 'koreksiGajiMinus', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          entries: updated,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          entries: updated,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `koreksiGajiMinus/${selectedPeriod}`);
    }
  };

  const handleAdd = () => {
    if (!selectedEmpId || !inputAmount) {
      toast.error("Data tidak lengkap");
      return;
    }
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const amount = parseInt(inputAmount.replace(/\D/g, '')) || 0;
    const updated = { ...entries, [selectedEmpId]: amount };
    setEntries(updated);
    saveEntries(updated);
    
    setSelectedEmpId('');
    setInputAmount('');
    toast.success("Data ditambahkan");
  };

  const handleRemove = (empId: string) => {
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const updated = { ...entries };
    delete updated[empId];
    setEntries(updated);
    saveEntries(updated);
    toast.success("Data dihapus");
  };
  
  const handleDownload = () => {
    const data = Object.entries(entries).map(([id, amount]) => {
      const emp = employees.find(e => e.id === id);
      return {
        'No. Absen': emp?.pin || '',
        'Nama': emp?.name || '',
        'Nominal': amount
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Koreksi Gaji Pengurangan");
    XLSX.writeFile(wb, `Koreksi_Gaji_Pengurangan_${currentPeriod?.label || selectedPeriod}.xlsx`);
  };

  const toggleLock = async () => {
      if (isLocked) {
          setShowUnlockDialog(true);
      } else {
           await setDoc(doc(db, 'koreksiGajiMinus', selectedPeriod), { isLocked: true }, { merge: true });
           toast.success("Periode dikunci");
      }
  }

  const handleUnlock = async () => {
    if (password === 'admin123') { 
       await setDoc(doc(db, 'koreksiGajiMinus', selectedPeriod), { isLocked: false }, { merge: true });
       setShowUnlockDialog(false);
       setPassword('');
       toast.success("Periode dibuka");
    } else {
       toast.error("Password salah");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-5 h-5 text-rose-400" /> Koreksi Gaji (Pengurangan)
          </h2>
          <p className="text-white/40 text-xs font-medium lowercase">periode: {currentPeriod?.label || selectedPeriod}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px] glass-panel border-white/10 text-white h-11 px-6 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                 {currentPeriod?.label || selectedPeriod}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleDownload} variant="outline" className="h-11 rounded-xl text-white bg-blue-600 hover:bg-blue-500 border-none px-6">
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
          <Button onClick={toggleLock} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl h-11 px-6 flex items-center gap-2`}>
            {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-none bg-black/40">
           <CardContent className="p-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-tight mb-4">Tambah Entri</h3>
              <div className="space-y-4">
                 <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Karyawan</Label>
                    <EmployeeSelector 
                      employees={employees} 
                      selectedId={selectedEmpId} 
                      onSelect={(id) => setSelectedEmpId(id)}
                      placeholder="Pilih Karyawan..."
                      disabled={isLocked}
                    />
                 </div>
                 <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Nominal</Label>
                    <Input 
                      type="number"
                      value={inputAmount}
                      onChange={(e) => setInputAmount(e.target.value)}
                      placeholder="0"
                      disabled={isLocked}
                      className="glass-panel border-white/10 text-white h-11 rounded-xl"
                    />
                 </div>
                 <Button onClick={handleAdd} className="w-full h-11 rounded-xl bg-primary text-white font-bold" disabled={isLocked}>
                    Tambah
                 </Button>
              </div>
           </CardContent>
        </Card>

        <Card className="glass-panel border-none bg-black/40 md:col-span-2">
           <CardContent className="p-6">
              <Table>
                <TableHeader>
                    <TableRow className="border-white/5">
                        <TableHead className="text-white/40">Karyawan</TableHead>
                        <TableHead className="text-white/40">Nominal</TableHead>
                        <TableHead className="text-white/40"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Object.entries(entries).map(([id, amount]) => {
                        const emp = employees.find(e => e.id === id);
                        return (
                            <TableRow key={id} className="border-white/5">
                                <TableCell className="text-white font-bold">{emp?.name || id}</TableCell>
                                <TableCell className="text-rose-400">{new Intl.NumberFormat('id-ID').format(Number(amount) || 0)}</TableCell>
                                <TableCell>
                                    <Button variant="ghost" onClick={() => handleRemove(id)} className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" disabled={isLocked}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
              </Table>
           </CardContent>
        </Card>
      </div>

      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/10 text-white">
            <DialogHeader>
                <DialogTitle>Buka Kunci Periode</DialogTitle>
                <DialogDescription>Masukkan password untuk membuka kunci.</DialogDescription>
            </DialogHeader>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-panel" />
            <DialogFooter>
                <Button onClick={handleUnlock}>Buka</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminBonusBerat({ employees, activePeriodId, setActivePeriodId }: { employees: Employee[], activePeriodId: string, setActivePeriodId?: (id: string) => void }) {
  const [controls, setControls] = useState<Record<string, any>>({});
  
  useEffect(() => {
     const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
       const data: Record<string, any> = {};
       snap.docs.forEach(d => { data[d.id] = d.data(); });
       setControls(data);
     });
     return unsub;
  }, []);

  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const selectedPeriod = activePeriodId || periodOptions[0]?.value || '';
  const setSelectedPeriod = setActivePeriodId || (() => {});
  const currentPeriod = periodOptions.find(p => p.value === selectedPeriod);

  const [entries, setEntries] = useState<Record<string, number>>({}); // { empId: amount }
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    let componentMounted = true;
    if (!selectedPeriod) return;
    setLoading(true);

    const unsub = onSnapshot(doc(db, 'bonusBerat', selectedPeriod), (snap) => {
      if (componentMounted) {
        if (snap.exists()) {
          const data = snap.data();
          setEntries(data.entries || {});
          setIsLocked(data.isLocked || false);
        } else {
          setEntries({});
          setIsLocked(false);
        }
        setLoading(false);
      }
    }, (error) => {
      if (componentMounted) {
        handleFirestoreError(error, OperationType.GET, `bonusBerat/${selectedPeriod}`);
        setLoading(false);
      }
    });

    return () => {
      componentMounted = false;
      unsub();
    };
  }, [selectedPeriod]);

  const saveEntries = async (updated: Record<string, number>) => {
    try {
      const docRef = doc(db, 'bonusBerat', selectedPeriod);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          entries: updated,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          periodId: selectedPeriod,
          entries: updated,
          isLocked: false,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `bonusBerat/${selectedPeriod}`);
    }
  };

  const handleAddOrUpdate = () => {
    if (!selectedEmpId || !inputAmount) {
      toast.error("Data tidak lengkap");
      return;
    }
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const amount = parseInt(inputAmount.replace(/\D/g, '')) || 0;
    const updated = { ...entries, [selectedEmpId]: amount };
    setEntries(updated);
    saveEntries(updated);
    
    setSelectedEmpId('');
    setInputAmount('');
    setEditId(null);
    toast.success(editId ? "Data diperbarui" : "Data ditambahkan");
  };

  const handleEdit = (empId: string) => {
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    setSelectedEmpId(empId);
    setInputAmount(entries[empId]?.toString() || '');
    setEditId(empId);
  };

  const handleRemove = (empId: string) => {
    if (isLocked) {
      toast.error("Periode dikunci");
      return;
    }
    const updated = { ...entries };
    delete updated[empId];
    setEntries(updated);
    saveEntries(updated);
    toast.success("Data dihapus");
  };

  const handleClearAll = async () => {
    if (password === 'admin123') {
      await saveEntries({});
      setShowClearDialog(false);
      setPassword('');
      toast.success("Semua data dihapus");
    } else {
      toast.error("Password salah");
    }
  };

  const toggleLock = async () => {
    if (isLocked) {
        setShowUnlockDialog(true);
    } else {
        try {
            await setDoc(doc(db, 'bonusBerat', selectedPeriod), { isLocked: true }, { merge: true });
            toast.success("Periode dikunci");
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `bonusBerat/${selectedPeriod}`);
        }
    }
  };

  const confirmUnlock = async () => {
    if (password === 'admin123') {
      try {
        await setDoc(doc(db, 'bonusBerat', selectedPeriod), { isLocked: false }, { merge: true });
        setShowUnlockDialog(false);
        setPassword('');
        toast.success("Kunci dibuka");
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `bonusBerat/${selectedPeriod}`);
      }
    } else {
      toast.error("Password salah");
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isLocked) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary', cellNF: true, cellText: true, cellDates: true });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          
          const updated = { ...entries };
          let detectedPin = '';
          let detectedAmount = '';

          data.forEach((row: any) => {
              const rowKeys = Object.keys(row);
              
              const pinKey = rowKeys.find(k => {
                  const lk = k.toLowerCase().replace(/[^a-z]/g, '');
                  return ['noabsen', 'absen', 'pin', 'idabsen', 'nik', 'noinduk'].includes(lk);
              });
              if (pinKey) detectedPin = pinKey;
              const pin = pinKey ? String(row[pinKey] || '').trim() : '';

              const amountKey = rowKeys.find(k => {
                  const lk = k.toLowerCase().trim();
                  return ['bonus berat', 'nominal bonus', 'bonus', 'nominal', 'jumlah', 'berat', 'amount', 'total', 'grand total'].some(s => lk === s || lk.startsWith(s));
              }) || rowKeys.find(k => {
                  const lk = k.toLowerCase().trim();
                  return lk.includes('berat') || (lk.includes('bonus') && !lk.includes('pin') && !lk.includes('absen'));
              });
              if (amountKey) detectedAmount = amountKey;
              
              const rawAmount = amountKey ? row[amountKey] : 0;
              let amount = 0;
              if (typeof rawAmount === 'number') {
                  amount = Math.round(rawAmount);
              } else if (rawAmount) {
                  const str = String(rawAmount).trim();
                  if (str && str !== '-') {
                      const cleaned = str.replace(/[^\d.,-]/g, '');
                      if (cleaned.includes(',') && cleaned.includes('.')) {
                          const lastC = cleaned.lastIndexOf(',');
                          const lastD = cleaned.lastIndexOf('.');
                          if (lastC > lastD) amount = parseFloat(cleaned.replace(/\./g, '').replace(/,/g, '.'));
                          else amount = parseFloat(cleaned.replace(/,/g, ''));
                      } else if (cleaned.includes(',')) {
                          const parts = cleaned.split(',');
                          if (parts[parts.length-1].length === 2 && parts.length === 2) amount = parseFloat(cleaned.replace(/,/g, '.'));
                          else amount = parseInt(cleaned.replace(/,/g, ''));
                      } else if (cleaned.includes('.')) {
                          const parts = cleaned.split('.');
                          if (parts[parts.length-1].length === 2 && parts.length === 2) amount = parseFloat(cleaned);
                          else amount = parseInt(cleaned.replace(/\./g, ''));
                      } else {
                          amount = parseInt(cleaned) || 0;
                      }
                  }
              }

              const emp = employees.find(e => String(e.pin).trim() === pin);
              if (emp && !isNaN(amount)) {
                  updated[emp.id] = Math.max(0, Math.floor(amount));
              }
          });
          setEntries(updated);
          saveEntries(updated);
          toast.success(`Impor Berhasil! Kolom terdeteksi: PIN (${detectedPin || '?'}), Nominal (${detectedAmount || '?'})`);
      } catch (err) {
          toast.error("Gagal impor file");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset input
  };

  const handleDownload = () => {
    const data = Object.entries(entries).map(([id, amount]) => {
      const emp = employees.find(e => e.id === id);
      return {
        'No. Absen': emp?.pin || '',
        'Nama': emp?.name || '',
        'Bonus Berat': amount
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bonus Berat");
    XLSX.writeFile(wb, `Bonus_Berat_${currentPeriod?.label || selectedPeriod}.xlsx`);
  };

  const grandTotal = (Object.values(entries) as number[]).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-400" /> Bonus Berat
          </h2>
          <p className="text-white/40 text-xs font-medium lowercase">periode: {currentPeriod?.label || selectedPeriod}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px] glass-panel border-white/10 text-white h-11 px-6 rounded-xl">
              <SelectValue placeholder="Pilih Periode">
                 {currentPeriod?.label || selectedPeriod}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/20 text-white">
              {periodOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleDownload} variant="outline" className="h-11 rounded-xl text-white bg-blue-600 hover:bg-blue-500 border-none px-6">
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
          <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 h-11 flex items-center gap-2 text-sm font-medium transition-colors">
            <Upload className="w-4 h-4" /> Import Excel
            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImport} disabled={isLocked} />
          </label>
          <Button onClick={toggleLock} className={`${isLocked ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl h-11 px-6 flex items-center gap-2`}>
            {isLocked ? <><LockIcon className="w-4 h-4" /> Buka Kunci</> : <><UnlockIcon className="w-4 h-4" /> Kunci Periode</>}
          </Button>
          <Button onClick={() => setShowClearDialog(true)} variant="ghost" className="h-11 px-6 text-rose-400 hover:bg-rose-500/10 rounded-xl">
            <Trash2 className="w-4 h-4 mr-2" /> Kosongkan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-none bg-black/40">
           <CardContent className="p-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-tight mb-4">{editId ? 'Edit Entri' : 'Tambah Entri'}</h3>
              <div className="space-y-4">
                 <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Karyawan</Label>
                    <EmployeeSelector 
                      employees={employees} 
                      selectedId={selectedEmpId} 
                      onSelect={(id) => setSelectedEmpId(id)}
                      placeholder="Pilih Karyawan..."
                      disabled={isLocked || !!editId}
                    />
                 </div>
                 <div className="space-y-1">
                    <Label className="text-white/40 text-[10px] uppercase font-bold tracking-widest ml-1">Nominal Bonus</Label>
                    <Input 
                      placeholder="Masukkan Nominal" 
                      value={inputAmount} 
                      onChange={e => setInputAmount(e.target.value)} 
                      className="bg-white/5 border-white/10 text-white h-10" 
                      disabled={isLocked}
                    />
                 </div>
                 <div className="flex gap-2">
                    <Button onClick={handleAddOrUpdate} className="flex-1 bg-primary h-11" disabled={isLocked}>{editId ? 'Perbarui' : 'Simpan'}</Button>
                    {editId && <Button onClick={() => { setEditId(null); setSelectedEmpId(''); setInputAmount(''); }} variant="ghost" className="text-white h-11 border border-white/10">Batal</Button>}
                 </div>
              </div>
           </CardContent>
        </Card>

        <Card className="glass-panel border-none bg-black/40 md:col-span-2">
           <CardContent className="p-6">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-bold text-white uppercase tracking-tight">Akumulasi Bonus Berat ({currentPeriod?.label || selectedPeriod})</h3>
                 <div className="bg-emerald-500/20 px-4 py-1 rounded-lg border border-emerald-500/30">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase mr-2">Grand Total:</span>
                    <span className="text-emerald-400 font-black text-sm">Rp {new Intl.NumberFormat('id-ID').format(grandTotal)}</span>
                 </div>
              </div>
              <div className="overflow-x-auto max-h-[500px] no-scrollbar">
                <Table>
                   <TableHeader>
                      <TableRow className="border-white/5 bg-white/5">
                         <TableHead className="text-white/40 text-xs font-black uppercase">PIN</TableHead>
                         <TableHead className="text-white/40 text-xs font-black uppercase">Nama</TableHead>
                         <TableHead className="text-white/40 text-xs font-black uppercase text-right">Bonus Berat</TableHead>
                         <TableHead className="text-white/40 text-xs font-black uppercase text-right"></TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {Object.entries(entries).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12 text-white/20 italic text-xs uppercase tracking-widest">Tidak ada data bonus</TableCell>
                        </TableRow>
                      ) : (
                        Object.entries(entries).map(([empId, amount]) => {
                          const emp = employees.find(e => e.id === empId);
                          return (
                            <TableRow key={empId} className="border-white/5 hover:bg-white/5 transition-colors">
                               <TableCell className="text-white/60 font-mono text-xs">{emp?.pin || '-'}</TableCell>
                               <TableCell className="text-white font-bold">{emp?.name || 'Unknown'}</TableCell>
                               <TableCell className="text-emerald-400 font-black text-right">Rp {new Intl.NumberFormat('id-ID').format(amount as number)}</TableCell>
                               <TableCell className="text-right flex justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(empId)} disabled={isLocked} className="h-8 w-8 hover:bg-white/10 text-white/40">
                                     <Edit className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleRemove(empId)} disabled={isLocked} className="h-8 w-8 hover:bg-rose-500/10 text-rose-400">
                                     <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                               </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                   </TableBody>
                </Table>
              </div>
           </CardContent>
        </Card>
      </div>

      {/* Dialog Clear All */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogHeader>
            <DialogTitle className="text-rose-400 uppercase font-black tracking-widest">Hapus Semua Data?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
             <p className="text-sm text-white/60">Tindakan ini tidak dapat dibatalkan. Masukkan password admin untuk mengonfirmasi.</p>
             <Input 
               type="password" 
               placeholder="Password Admin" 
               value={password} 
               onChange={e => setPassword(e.target.value)} 
               className="bg-white/5 border-white/10 text-white"
             />
             <Button onClick={handleClearAll} variant="destructive" className="w-full">YA, HAPUS SEMUA</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Buka Kunci */}
      <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <DialogContent className="glass-panel border-white/20 bg-black/90 text-white">
          <DialogHeader>
            <DialogTitle className="uppercase font-black tracking-widest">Buka Kunci Periode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
             <p className="text-sm text-white/60">Masukkan password admin untuk membuka kunci periode ini.</p>
             <Input 
               type="password" 
               placeholder="Password Admin" 
               value={password} 
               onChange={e => setPassword(e.target.value)} 
               className="bg-white/5 border-white/10 text-white"
             />
             <Button onClick={confirmUnlock} className="w-full bg-emerald-600 hover:bg-emerald-500">KONFIRMASI BUKA KUNCI</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
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
    }, (err) => handleFirestoreError(err, OperationType.GET, 'config/office'));
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
  currentUser,
  theme,
  toggleTheme,
  confirm,
  prompt,
  alert,
  activePeriodId,
  setActivePeriodId
}: { 
  employees: Employee[], 
  shifts: Shift[],
  sections: Section[],
  divisions: Division[],
  onLogout: () => void,
  currentUser: Employee | null,
  theme: 'light' | 'dark',
  toggleTheme: () => void,
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void,
  activePeriodId: string,
  setActivePeriodId: (id: string) => void
}) {
  const isSuper = currentUser?.role === 'superadmin';

  useEffect(() => {
    // Clear photoUrl for records older than 2 months (60 days)
    if (isSuper) {
      const cleanupOldData = async () => {
        const twoMonthsAgo = subMonths(new Date(), 2);
        const twoMonthsAgoStr = format(twoMonthsAgo, 'yyyy-MM-dd');
        
        // Cleanup attendance photos
        const q = query(collection(db, 'attendance'), where('date', '<', twoMonthsAgoStr), where('photoUrl', '>', ''));
        const snap = await getDocs(q);
        
        const batchSize = 25;

        if (!snap.empty) {
          console.log(`Cleaning up ${snap.size} old attendance photo records...`);
          for (let i = 0; i < snap.docs.length; i += batchSize) {
            const chunk = snap.docs.slice(i, i + batchSize);
            await Promise.all(chunk.map(d => updateDoc(doc(db, 'attendance', d.id), { photoUrl: "" })));
          }
        }

        // Cleanup activityLogs photos
        const qLogs = query(
          collection(db, 'activityLogs'), 
          where('timestamp', '<', Timestamp.fromDate(twoMonthsAgo)), 
          where('photoUrl', '>', '')
        );
        const snapLogs = await getDocs(qLogs);
        if (!snapLogs.empty) {
          console.log(`Cleaning up ${snapLogs.size} old activity log photos...`);
          for (let i = 0; i < snapLogs.docs.length; i += batchSize) {
            const chunk = snapLogs.docs.slice(i, i + batchSize);
            await Promise.all(chunk.map(d => updateDoc(doc(db, 'activityLogs', d.id), { photoUrl: "" })));
          }
        }
      };
      cleanupOldData().catch(console.error);
    }
  }, [isSuper]);

  const [activeTab, setActiveTab] = useState(currentUser?.role === 'spv' ? 'live' : 'employees');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ 'Kelola Karyawan': true });

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const rawMenuGroups = [
    {
      label: 'Kelola Karyawan',
      items: [
        { value: 'employees', label: 'Karyawan', icon: <Users className="w-4 h-4" /> },
        { value: 'shifts', label: 'Shift', icon: <Clock className="w-4 h-4" /> },
        { value: 'divisions', label: 'Divisi', icon: <Layers className="w-4 h-4" /> },
        { value: 'sections', label: 'Bagian', icon: <Settings className="w-4 h-4" /> },
      ]
    },
    {
      label: 'Absensi',
      items: [
        { value: 'manual', label: 'Absensi Manual', icon: <ClipboardCheck className="w-4 h-4" /> },
        { value: 'live', label: 'Live Absensi', icon: <ClipboardList className="w-4 h-4" /> },
        { value: 'reports', label: 'Laporan', icon: <Eye className="w-4 h-4" /> },
        { value: 'backup', label: 'Backup Data', icon: <Download className="w-4 h-4" /> },
      ]
    },
    {
      label: 'Bonus & Reward',
      items: [
        { value: 'bonus-master', label: 'Nota Tertinggi', icon: <Zap className="w-4 h-4" /> },
        { value: 'bonus-jaga-depan', label: 'Bonus Jaga Depan', icon: <Zap className="w-4 h-4" /> },
        { value: 'bonus-estafet', label: 'Bonus Estafet', icon: <Zap className="w-4 h-4" /> },
        { value: 'bonus-lain-lain', label: 'Bonus Campuran', icon: <Zap className="w-4 h-4" /> },
        { value: 'bonus-lain-lain-combined', label: 'Bonus Lain-Lain', icon: <Calculator className="w-4 h-4" /> },
        { value: 'bonus-operator', label: 'Bonus Operator', icon: <Calculator className="w-4 h-4 text-emerald-400" /> },
        { value: 'bonus-nota', label: 'Bonus Nota', icon: <Zap className="w-4 h-4 text-amber-400" /> },
        { value: 'bonus-berat', label: 'Bonus Berat', icon: <Layers className="w-4 h-4 text-teal-400" /> },
        { value: 'bonus-koreksi-gaji', label: 'Koreksi Gaji (Penambahan)', icon: <Zap className="w-4 h-4 text-emerald-400" /> },
      ]
    },
    {
      label: 'Ristan & Potongan',
      items: [
        { value: 'potongan', label: 'Potongan Kehilangan (Restan 100%)', icon: <DollarSign className="w-4 h-4" /> },
        { value: 'potongan-bersama', label: 'Potongan Kehilangan (Restan Bersama)', icon: <DollarSign className="w-4 h-4" /> },
        { value: 'potongan-seragam', label: 'Potongan Seragam', icon: <Shirt className="w-4 h-4" /> },
        { value: 'potongan-koreksi-gaji-minus', label: 'Koreksi Gaji (Pengurangan)', icon: <Zap className="w-4 h-4 text-rose-400" /> },
      ]
    },
    {
      label: 'Audit & Export',
      items: [
        { value: 'audit', label: 'Audit & Export Data', icon: <FileDown className="w-4 h-4 text-emerald-400" /> },
      ]
    },
    {
      label: 'Libur',
      items: [
        { value: 'leaves', label: 'Request Libur', icon: <CalendarIcon className="w-4 h-4" /> },
        { value: 'quotas', label: 'Atur Kuota', icon: <BadgeCheck className="w-4 h-4" /> },
        { value: 'periods', label: 'Batas Waktu', icon: <CalendarIcon className="w-4 h-4" /> },
        { value: 'jadwal', label: 'Jadwal Libur', icon: <CalendarIcon className="w-4 h-4 text-primary" /> },
      ]
    },
    {
      label: 'Superadmin',
      superAdminOnly: true,
      items: [
        { value: 'office', label: 'Lokasi Kantor', icon: <MapPin className="w-4 h-4" /> },
        { value: 'music', label: 'Musik Request', icon: <Music className="w-4 h-4" /> },
        { value: 'kata', label: 'Kata-kata', icon: <MessageSquare className="w-4 h-4" /> },
      ]
    }
  ];

  const menuGroups = rawMenuGroups.map(g => {
    if (currentUser?.role === 'spv') {
      return {
        ...g,
        items: g.items.filter(i => ['live', 'leaves', 'jadwal'].includes(i.value))
      }
    }
    return g;
  }).filter(g => g.items.length > 0);

  const allMenuItems = menuGroups.flatMap(g => g.items);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-screen flex-col overflow-hidden bg-background w-full">
      {/* Header with Integrated Menu */}
      <header className="h-16 w-full glass-panel border-x-0 border-t-0 rounded-none px-4 md:px-8 flex items-center sticky top-0 z-30 bg-background/40 backdrop-blur-xl shrink-0 gap-4">
        <Dialog open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <DialogTrigger 
            render={
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <Menu className="w-6 h-6" />
              </Button>
            }
          />
          <DialogContent className="glass-panel text-white left-0 top-0 translate-x-0 translate-y-0 h-full w-[280px] rounded-none p-6 m-0 border-r border-y-0 border-l-0 duration-300 shadow-2xl bg-background/95 border-border">
            <div className="flex items-center gap-3 mb-10 px-2">
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center shrink-0 border border-primary/30">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <span className="font-bold text-lg text-foreground">Menu Admin</span>
            </div>
            <nav className="flex-1 overflow-y-auto pr-2 no-scrollbar">
              <TabsList className="flex flex-col h-auto bg-transparent w-full gap-2 items-stretch p-0">
                {menuGroups.filter(g => !g.superAdminOnly || currentUser?.role === 'superadmin').map((group) => {
                  const isExpanded = expandedGroups[group.label];
                  return (
                    <div key={group.label} className="space-y-1">
                      <button 
                        onClick={() => toggleGroup(group.label)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/5 transition-colors group"
                      >
                        <h3 className="text-[10px] font-black text-white/40 group-hover:text-white/60 uppercase tracking-[0.3em]">{group.label}</h3>
                        <div className="text-white/20 group-hover:text-white/40 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      </button>
                      
                      {isExpanded && (
                        <div className="space-y-1 ml-2 border-l border-white/5 pl-2 animate-in slide-in-from-top-2 duration-200">
                          {group.items.map((item) => (
                            <TabsTrigger 
                              key={item.value}
                              value={item.value} 
                              onClick={() => setIsMobileOpen(false)}
                              className="w-full justify-start gap-4 h-10 px-4 rounded-xl border-none transition-all duration-200 data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-semibold text-muted-foreground hover:text-foreground hover:bg-accent"
                            >
                              <div className={`p-1.5 rounded-lg ${activeTab === item.value ? 'bg-primary/20 text-primary' : 'bg-white/5'}`}>
                                {item.icon}
                              </div>
                              <span className="text-xs">{item.label}</span>
                            </TabsTrigger>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
          
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} className="h-9 w-9" />
          <Button variant="ghost" size="icon" onClick={onLogout} className="text-white/30 hover:text-white hover:bg-rose-500/10 rounded-full h-9 w-9"><LogOut className="w-4 h-4" /></Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col min-w-0 bg-background/50 overflow-y-auto no-scrollbar">
        <div className="absolute inset-0 bg-gradient-to-br from-background to-secondary/30 pointer-events-none" />
        
        {/* Content Area */}
        <div className="flex-1 p-4 md:p-8 relative z-0">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col gap-1 mb-8">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white capitalize">
                {allMenuItems.find(i => i.value === activeTab)?.label}
              </h1>
              <p className="text-white/40 text-xs md:text-sm">Kelola data dan monitoring operasional harian.</p>
            </div>

            <div className="focus-visible:outline-none min-h-[500px]">
              <TabsContent value="employees" className="mt-0 outline-none">
                <AdminEmployees employees={employees} shifts={shifts} sections={sections} divisions={divisions} currentUser={currentUser} confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="shifts" className="mt-0 outline-none">
                <AdminShifts shifts={shifts} confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="divisions" className="mt-0 outline-none">
                <AdminDivisions divisions={divisions} confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="sections" className="mt-0 outline-none">
                <AdminSections sections={sections} divisions={divisions} confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="live" className="mt-0 outline-none">
                <AdminLive employees={employees} shifts={shifts} confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="manual" className="mt-0 outline-none">
                <AdminManualAttendance employees={employees} divisions={divisions} />
              </TabsContent>
              <TabsContent value="bonus-master" className="mt-0 outline-none">
                <AdminBonusMaster activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="bonus-estafet" className="mt-0 outline-none">
                <AdminBonusEstafet employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="bonus-lain-lain" className="mt-0 outline-none">
                <AdminBonusLainLain employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="bonus-lain-lain-combined" className="mt-0 outline-none">
                <AdminBonusLainLainCombined employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="bonus-jaga-depan" className="mt-0 outline-none">
                <AdminBonusJagaDepan employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="bonus-operator" className="mt-0 outline-none">
                <AdminBonusOperator employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="bonus-nota" className="mt-0 outline-none">
                <AdminBonusNota employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="bonus-koreksi-gaji" className="mt-0 outline-none">
                <AdminKoreksiGaji employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="bonus-berat" className="mt-0 outline-none">
                <AdminBonusBerat employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="potongan" className="mt-0 outline-none">
                <PotonganKehilanganManager employees={employees} activePeriodId={activePeriodId} />
              </TabsContent>
              <TabsContent value="potongan-bersama" className="mt-0 outline-none">
                <PotonganKehilanganBersamaManager employees={employees} activePeriodId={activePeriodId} />
              </TabsContent>
              <TabsContent value="potongan-seragam" className="mt-0 outline-none">
                <PotonganSeragamManager employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="potongan-koreksi-gaji-minus" className="mt-0 outline-none">
                <AdminKoreksiGajiMinus employees={employees} activePeriodId={activePeriodId} setActivePeriodId={setActivePeriodId} />
              </TabsContent>
              <TabsContent value="office" className="mt-0 outline-none">
                <AdminOfficeConfig />
              </TabsContent>
              <TabsContent value="leaves" className="mt-0 outline-none">
                <AdminLeave employees={employees} sections={sections} divisions={divisions} confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="quotas" className="mt-0 outline-none">
                <AdminQuota employees={employees} confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="periods" className="mt-0 outline-none">
                <AdminPeriods confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="jadwal" className="mt-0 outline-none">
                <AdminJadwalLibur employees={employees} sections={sections} divisions={divisions} confirm={confirm} prompt={prompt} alert={alert} />
              </TabsContent>
              <TabsContent value="backup" className="mt-0 outline-none">
                <AdminBackup employees={employees} />
              </TabsContent>
              <TabsContent value="audit" className="mt-0 outline-none">
                <AdminAuditDanExport 
                  employees={employees} 
                  setActiveTab={setActiveTab} 
                  selectedPeriod={activePeriodId}
                  setActivePeriodId={setActivePeriodId}
                />
              </TabsContent>
              <TabsContent value="kata" className="mt-0 outline-none">
                 <AdminKata />
              </TabsContent>
              <TabsContent value="reports" className="mt-0 outline-none">
                <AdminReports employees={employees} shifts={shifts} confirm={confirm} prompt={prompt} alert={alert} />
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
    }, (err) => handleFirestoreError(err, OperationType.GET, 'systemConfig/musicSettings'));
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
function AdminEmployees({ 
  employees, 
  shifts, 
  sections, 
  divisions, 
  currentUser,
  confirm,
  prompt,
  alert
}: { 
  employees: Employee[], 
  shifts: Shift[], 
  sections: Section[], 
  divisions: Division[], 
  currentUser: Employee | null,
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [isEditing, setIsEditing] = useState<Employee | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({ 
    name: '', 
    nickname: '',
    pin: '', 
    role: 'employee' as const, 
    division: divisions?.[0]?.name || 'Depan',
    organization: 'Non-Executive' as 'Baru' | 'Non-Executive' | 'Executive',
    password: ''
  });

  const filteredEmployees = employees.filter(e => 
    (e.isActive !== false) && (
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (e.nickname && e.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (e.pin && e.pin.includes(searchTerm))
    )
  );

  const resetForm = () => setFormData({ 
    name: '', 
    nickname: '',
    pin: '', 
    role: 'employee', 
    division: divisions?.[0]?.name || 'Depan',
    organization: 'Non-Executive' as 'Baru' | 'Non-Executive' | 'Executive',
    password: ''
  });

  const handleExportTemplate = () => {
    const data = [
      {
        "Nama Lengkap": "Budi Santoso",
        "Nama Panggilan": "Budi",
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
          if (!row["Nama Lengkap"] || !row["No Absen"]) continue;

          await addDoc(collection(db, 'employees'), {
            name: row["Nama Lengkap"].toString(),
            nickname: (row["Nama Panggilan"] || "").toString(),
            pin: row["No Absen"].toString(),
            division: row["Divisi"] || 'Depan',
            organization: row["Organisasi"] || 'Non-Executive',
            role: (currentUser?.role === 'superadmin' && row["Hak Akses"] === 'admin' ? 'admin' : (row["Hak Akses"] === 'spv' || row["Hak Akses"] === 'SPV') ? 'spv' : 'employee'),
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
    if (employees.some(e => e.pin === formData.pin)) return alert("No. Absen sudah terdaftar!");
    await addDoc(collection(db, 'employees'), {
      ...formData,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setShowAdd(false);
    resetForm();
  };

  const addSuperAdmin = async () => {
    const adminName = (await prompt("Masukkan Nama Super Admin:", "Super Admin")) || "Super Admin";
    await addDoc(collection(db, 'employees'), {
      name: adminName,
      pin: "1",
      role: "superadmin",
      password: "adnan2301",
      division: "Depan",
      organization: "Executive",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isActive: true
    });
    alert(`Super Admin ${adminName} Berhasil Dibuat`, "success");
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
    if (!isEditing) return;
    const isConfirmed = await confirm("Yakin ingin mereset password karyawan ini ke default (123456)?");
    if (!isConfirmed) return;
    await updateDoc(doc(db, 'employees', isEditing.id), {
      password: "123456",
      updatedAt: serverTimestamp()
    });
    alert("Password telah direset ke 123456.", "success");
  };

  const handleEmployeeDelete = async (emp: any) => {
    if (emp.role === 'superadmin' && currentUser?.role !== 'superadmin') {
      alert("Anda tidak memiliki akses untuk menghapus Super Admin!", "error");
      return;
    }
    const action = await prompt("Pilih aksi: 'hapus' atau 'nonaktif'?");
    if (action !== 'hapus' && action !== 'nonaktif') {
      alert("Aksi tidak valid!", "error");
      return;
    }
    const pwd = await prompt("Masukkan Password Admin:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }
    if (action === 'hapus') {
      const isConfirmed = await confirm("Yakin hapus karyawan ini? Data akan hilang permanen.");
      if (isConfirmed) {
        await deleteDoc(doc(db, 'employees', emp.id));
        alert("Karyawan dihapus permanen.", "success");
      }
    } else {
      const isConfirmed = await confirm("Yakin nonaktifkan karyawan ini? Data akan tersimpan.");
      if (isConfirmed) {
        await updateDoc(doc(db, 'employees', emp.id), { isActive: false, pin: emp.pin + '(nonaktif)' });
        alert("Karyawan dinonaktifkan.", "success");
      }
    }
  };

  const triggerEdit = (e: Employee) => {
    setIsEditing(e);
    setFormData({ 
      name: e.name, 
      nickname: e.nickname || '',
      pin: e.pin, 
      role: e.role, 
      division: e.division || 'Depan',
      organization: e.organization || ('Non-Executive' as 'Baru' | 'Non-Executive' | 'Executive'),
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
              <DialogTitle className="text-foreground">{isEditing ? "Edit Karyawan" : "Tambah Karyawan Baru"}</DialogTitle>
              <DialogDescription className="text-white/60">Masukkan informasi detail karyawan di bawah ini.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="grid gap-2 text-white">
                <Label className="text-white/70 text-xs">Nama Lengkap</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Budi Santoso" className="field-input" />
              </div>
              <div className="grid gap-2 text-white">
                <Label className="text-white/70 text-xs">Nama Panggilan</Label>
                <Input value={formData.nickname} onChange={(e) => setFormData({...formData, nickname: e.target.value})} placeholder="Budi" className="field-input" />
              </div>
              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">No. Absen</Label>
                <Input value={formData.pin} onChange={(e) => setFormData({...formData, pin: e.target.value})} placeholder="Contoh: 1234" className="field-input" />
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
                <Label className="text-white/70 text-xs">Organisasi (Export Data)</Label>
                <Select value={formData.organization || 'Non-Executive'} onValueChange={(val: any) => setFormData({...formData, organization: val})}>
                  <SelectTrigger className="field-input text-white border-white/10"><SelectValue placeholder="Pilih Organisasi" /></SelectTrigger>
                  <SelectContent className="glass-panel border-white/10 text-white">
                    <SelectItem value="Baru" className="hover:bg-white/10">Baru</SelectItem>
                    <SelectItem value="Non-Executive" className="hover:bg-white/10">Non-Executive</SelectItem>
                    <SelectItem value="Executive" className="hover:bg-white/10">Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-white/70 text-xs">Hak Akses</Label>
                <Select 
                  value={formData.role} 
                  disabled={isEditing?.role === 'superadmin' && currentUser?.role !== 'superadmin'}
                  onValueChange={async (val: any) => {
                  if (val === 'superadmin') {
                    const pwd = await prompt("Masukkan password untuk akses Super Admin:");
                    if (pwd === "adnan2301") {
                        setFormData(prev => ({...prev, role: val}));
                    } else {
                        alert("Password Salah!", "error");
                    }
                  } else {
                    setFormData(prev => ({...prev, role: val}));
                  }
                }}>
                  <SelectTrigger className="field-input text-white border-white/10"><SelectValue placeholder="Pilih Hak Akses" /></SelectTrigger>
                  <SelectContent className="glass-panel border-white/10 text-white">
                    <SelectItem value="employee" className="hover:bg-white/10">Karyawan</SelectItem>
                    <SelectItem value="spv" className="hover:bg-white/10">SPV</SelectItem>
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
                <TableHead className="text-white/40 whitespace-nowrap">Organisasi</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">No. Absen</TableHead>
                <TableHead className="text-right text-white/40 whitespace-nowrap">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map(e => (
                <TableRow key={e.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-semibold text-white whitespace-nowrap">
                    {e.name}
                    {e.nickname && <div className="text-[10px] text-white/40 font-normal leading-tight">({e.nickname})</div>}
                  </TableCell>
                  <TableCell className="text-white/60 whitespace-nowrap">{e.division || '-'}</TableCell>
                  <TableCell className="text-white/60 whitespace-nowrap italic text-xs">{e.organization || 'Non-Executive'}</TableCell>
                  <TableCell className="text-muted-foreground font-mono whitespace-nowrap">{e.pin}</TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => triggerEdit(e)} className="hover:bg-white/10">
                      <Edit className="w-4 h-4 text-primary" />
                    </Button>
                    {e.role === 'superadmin' && currentUser?.role !== 'superadmin' ? (
                      <span className="text-[9px] text-white/20 italic px-2">Protected</span>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => handleEmployeeDelete(e)} className="hover:bg-white/10">
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </Button>
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
function AdminDivisions({ 
  divisions,
  confirm,
  prompt,
  alert
}: { 
  divisions: Division[],
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
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
    const pwd = await prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }
    const isConfirmed = await confirm("Hapus divisi ini? Semua bagian di divisi ini mungkin akan terdampak.");
    if (isConfirmed) {
      await deleteDoc(doc(db, 'divisions', id));
      alert("Divisi berhasil dihapus.", "success");
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
function AdminSections({ 
  sections, 
  divisions,
  confirm,
  prompt,
  alert
}: { 
  sections: Section[], 
  divisions: Division[],
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
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
    const pwd = await prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }
    const isConfirmed = await confirm("Hapus bagian ini?");
    if (isConfirmed) {
      await deleteDoc(doc(db, 'sections', id));
      alert("Bagian berhasil dihapus.", "success");
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

// --- ADMIN: JADWAL LIBUR CHART ---
function DraggableLeaveBadge({ 
  request, 
  dateStr, 
  isSunday, 
  getNickname, 
  getSectionInitials,
  disabled,
  dragId,
  displayDate
}: { 
  request: LeaveRequest, 
  dateStr: string, 
  isSunday: boolean,
  getNickname: (id: string, name: string) => string,
  getSectionInitials: (id: string) => string,
  disabled?: boolean,
  dragId?: string,
  displayDate?: string | null,
  key?: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId || `${request.id}|${dateStr}`,
    disabled,
    data: { request, dateStr }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: 999,
    touchAction: 'none'
  } : {
    touchAction: 'none'
  };

  return (
    <motion.div 
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      className={`text-[9px] md:text-[10px] p-2 rounded-lg font-bold truncate transition-transform hover:scale-[1.02] active:scale-95 shadow-sm cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50 scale-105 shadow-xl ring-2 ring-primary bg-primary/20' : 
        isSunday 
          ? 'bg-rose-500/20 text-rose-100 border border-rose-500/20' 
          : 'bg-white/5 text-white/90 border border-white/10 hover:border-primary/30 hover:bg-white/10'
      } ${disabled ? 'cursor-default' : ''}`}
    >
      <span className="text-primary mr-1">●</span>
      {getNickname(request.employeeId, request.employeeName)} 
      <span className="ml-1 opacity-50 font-normal">{getSectionInitials(request.sectionId)}</span>
      {displayDate && !isNaN(new Date(displayDate).getTime()) && (
        <span className="ml-2 px-1.5 py-0.5 rounded bg-black/40 text-[9px] font-mono opacity-80 whitespace-nowrap">{format(new Date(displayDate), 'dd MMM yy')}</span>
      )}
    </motion.div>
  );
}

function DroppableCell({ 
  dateStr, 
  children, 
  isSunday, 
  isToday,
  className
}: { 
  dateStr: string, 
  children: React.ReactNode, 
  isSunday: boolean, 
  isToday: boolean,
  className?: string,
  key?: string 
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dateStr,
  });

  return (
    <div 
      ref={setNodeRef}
      className={className ? `${className} ${isOver ? 'bg-primary/20 scale-[0.98]' : ''}` : `min-h-[160px] border-r border-b border-white/10 last:border-r-0 flex flex-col group transition-all duration-300 ${
        isOver ? 'bg-primary/20 scale-[0.98]' : 
        isSunday ? 'bg-rose-500/[0.03]' : 
        isToday ? 'bg-primary/[0.05]' : ''
      } hover:bg-white/[0.05]`}
    >
      {children}
    </div>
  );
}

function AdminJadwalLibur({ 
  employees, 
  sections, 
  divisions,
  confirm,
  prompt,
  alert
}: { 
  employees: Employee[], 
  sections: Section[], 
  divisions: Division[],
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [controls, setControls] = useState<Record<string, any>>({});
  const periodOptions = React.useMemo(() => getCombinedPeriods(controls), [controls]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [selectedDivision, setSelectedDivision] = useState<string>(divisions?.[0]?.name || "Marketing");
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [showExcelHeaderDialog, setShowExcelHeaderDialog] = useState(false);
  const [excelHeader, setExcelHeader] = useState("");

  const statusKey = `status_${selectedPeriod}_${selectedDivision}`;
  const statusData = controls[statusKey] || { isFinished: false, isLocked: false };
  const isFinished = statusData.isFinished || false;
  const isLocked = statusData.isLocked || false;

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
      const data: Record<string, any> = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setControls(data);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedPeriod && periodOptions.length > 0) {
      const nowStr = format(new Date(), 'yyyy-MM-dd');
      const current = periodOptions.find(p => nowStr >= format(p.start, 'yyyy-MM-dd') && nowStr <= format(p.end, 'yyyy-MM-dd'));
      setSelectedPeriod(current ? current.value : periodOptions[0].value);
    }
  }, [periodOptions, selectedPeriod]);

  useEffect(() => {
    if (!selectedPeriod) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'leaveRequests'), 
      where('status', 'in', ['approved', 'pending']),
      where('period', '==', selectedPeriod)
    );
    const unsub = onSnapshot(q, (snap) => {
      setLeaveRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
      setLoading(false);
    }, (err) => {
      console.error("Error fetching jadwal libur:", err);
      setLoading(false);
    });
    return unsub;
  }, [selectedPeriod]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !active) return;

    const [requestId, originalDate, dateIndex] = active.id.toString().split('|');
    const newDate = over.id.toString();

    if (originalDate === newDate && newDate !== 'TRASH') return;

    const request = leaveRequests.find(r => r.id === requestId);
    if (!request) return;

    if (newDate !== 'TRASH' && newDate !== 'WAITING') {
      const hasDuplicateDate = leaveRequests.some(r => {
        if (r.employeeId !== request.employeeId) return false;
        
        // For the *current* request being edited, ignore if it's the date being moved
        // but wait, we need to check if ANY of their requests use this new date.
        // Even the same request, if it already has `newDate`, we want to block it.
        const rDates = r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6];
        return rDates.includes(newDate);
      });

      if (hasDuplicateDate) {
        alert("Gagal memindah: Karyawan sudah memiliki jadwal libur di tanggal ini.");
        return;
      }
    }

    const currentDates = request.dates || [request.date1, request.date2, request.date3, request.date4, request.date5, request.date6];

    let replaced = false;
    const newDates = currentDates.map((d, index) => {
      // If we have dateIndex, match exactly that index. Otherwise fallback to match by originalDate string
      if (dateIndex ? index.toString() === dateIndex : (d === originalDate && !replaced)) {
        replaced = true;
        return newDate;
      }
      return d;
    }).filter(Boolean) as string[];

    try {
      // Store original dates if not already present
      const updateData: any = {
        dates: newDates,
        isModifiedByAdmin: true,
        updatedAt: serverTimestamp()
      };

      // Clear all date fields first for backward compatibility
      for (let i = 1; i <= 6; i++) updateData[`date${i}`] = null;
      
      // Also update individual date fields for backward compatibility
      newDates.forEach((d, i) => {
        if (d && i < 6) updateData[`date${i + 1}`] = d;
      });

      if (!request.originalDates) {
        updateData.originalDates = currentDates.filter(Boolean);
      }
      
      if (newDate === 'TRASH' && newDates.length === 0) {
        updateData.status = 'rejected';
      }

      await updateDoc(doc(db, 'leaveRequests', requestId), updateData);
    } catch (error) {
      console.error("Error updating leave request position:", error);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      const trashRequests = leaveRequests.filter(r => (r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6]).some(d => d === 'TRASH'));
      if (trashRequests.length === 0) return;

      const isConfirmed = await confirm(`Anda yakin ingin menghapus permanen ${trashRequests.length} request libur dari tempat sampah? Kuota karyawan akan dikembalikan.`);
      if (!isConfirmed) return;

      const batchOps = trashRequests.map(r => {
        const currentDates = r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6];
        const newDArr = currentDates.filter(d => !!d && d !== 'TRASH') as string[];
        const updateData: any = { dates: newDArr, updatedAt: serverTimestamp() };
        for (let i = 1; i <= 6; i++) updateData[`date${i}`] = null;
        newDArr.forEach((d, i) => { if (i < 6) updateData[`date${i + 1}`] = d; });
        if (newDArr.length === 0) updateData.status = 'rejected';
        return { ref: doc(db, 'leaveRequests', r.id), data: updateData };
      });

      for (const op of batchOps) {
        await updateDoc(op.ref, op.data);
      }
      
      alert('Tempat sampah berhasil dikosongkan. Kuota telah dikembalikan.');
    } catch(err) {
      console.error(err);
      alert('Terjadi kesalahan saat menghapus permanen.');
    }
  };

  // Find initials for section. Max 4 letters.
  const getSectionInitials = (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return "";
    const name = section.name;
    const parts = name.split(' ');
    if (parts.length > 1) {
      // If multiple words, take first letter of each, up to 4
      return "(" + parts.map(p => p[0]).join('').substring(0, 4).toUpperCase() + ")";
    }
    // If one word, take first 4 letters
    return "(" + name.substring(0, 4).toUpperCase() + ")";
  };

  const getNickname = (employeeId: string, fullName: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (emp && emp.nickname) return emp.nickname;
    // Fallback to first name if nickname empty
    return fullName.split(' ')[0];
  };

  const handleExportExcel = async () => {
    if (!activePeriod) return;
    
    // Initialize Indonesian holidays
    const hd = new Holidays('ID');
    
    const startDate = startOfDay(activePeriod.start);
    const endDate = endOfDay(activePeriod.end);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];
    
    const firstDayOfWeek = getDay(days[0]); 
    const paddingBefore = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    
    const calendarCells = [];
    for (let i = 0; i < paddingBefore; i++) calendarCells.push(null);
    days.forEach(d => calendarCells.push(d));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Jadwal Libur');
    
    // Custom Header Styling & Insertion
    const finalHeader = excelHeader || `JADWAL LIBUR ${selectedDivision} - ${activePeriod.label}`;
    
    // 1. Add Title Row (Header)
    const titleRow = worksheet.addRow([finalHeader]);
    worksheet.mergeCells(`A1:G1`);
    titleRow.getCell(1).font = { bold: true, size: 18 };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30; // Better for size 18

    worksheet.addRow([]); // Spacer
    
    // 2. Header Row (SENIN to MINGGU)
    const dayHeaderRow = worksheet.addRow(weekDays);
    dayHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF87CEEB' } // Sky Blue
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // 3. Data rows
    for (let i = 0; i < calendarCells.length; i += 7) {
      const weekDates = calendarCells.slice(i, i + 7);
      
      // Row for Dates
      const dateRowValues = weekDates.map(date => date ? format(date, 'dd/MM/yyyy') : "");
      const excelDateRow = worksheet.addRow(dateRowValues);
      
      excelDateRow.eachCell((cell, colNumber) => {
        const currentDate = weekDates[colNumber - 1];
        if (!currentDate) return;

        // All dates are blue background with black text per request
        const bgColor = 'FF87CEEB'; // Sky Blue
        const textColor = 'FF000000'; // Black
        
        cell.font = { bold: true, size: 12, color: { argb: textColor } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      const weekRequests = weekDates.map(date => {
        if (!date) return [];
        const dateStr = date ? format(date, 'yyyy-MM-dd') : "";
        return dateMap[dateStr] || [];
      });

      // Fixed 10 rows per date as requested
      for (let r = 0; r < 10; r++) {
        const empRowValues = weekRequests.map(reqs => {
          const req = reqs[r];
          if (!req) return "";
          return `${getNickname(req.employeeId, req.employeeName || "")} ${getSectionInitials(req.sectionId)}`;
        });
        
        const excelEmpRow = worksheet.addRow(empRowValues);
        excelEmpRow.eachCell((cell, colNumber) => {
          const currentDate = weekDates[colNumber - 1];
          const isSunday = colNumber === 7;
          const isPublicHoliday = currentDate ? !!hd.isHoliday(currentDate) : false;
          const isRedDay = isSunday || isPublicHoliday;

          // Maroon (soft/faded) for red days, Pale Yellow for regular days
          const bgColor = isRedDay ? 'FF800000' : 'FFFFFFE0'; 
          const textColor = isRedDay ? 'FFFFFFFF' : 'FF000000';

          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: bgColor }
          };
          cell.font = { color: { argb: textColor }, bold: isRedDay };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
      }
      
      // Empty row as separator
      worksheet.addRow(new Array(7).fill(""));
    }

    // Set column widths
    worksheet.columns = [
      { width: 25 }, { width: 25 }, { width: 25 }, { width: 25 }, { width: 25 }, { width: 25 }, { width: 25 }
    ];

    // Export & Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Jadwal_Libur_${selectedDivision}_${activePeriod.label}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    setShowExcelHeaderDialog(false);
    setExcelHeader("");
  };

  const handleToggleLock = async (type: 'lock' | 'finish') => {
    try {
      const statusId = `status_${selectedPeriod}_${selectedDivision}`;
      if (type === 'lock') {
        await setDoc(doc(db, 'periodControls', statusId), { 
          ...statusData, 
          isLocked: true,
          updatedAt: serverTimestamp() 
        }, { merge: true });
        setIsEditingSchedule(false);
        alert("Terima kasih! Data telah dikunci sementara. Anda bisa melanjutkannya nanti.");
      } else {
        await setDoc(doc(db, 'periodControls', statusId), { 
          ...statusData, 
          isFinished: true,
          isLocked: false,
          updatedAt: serverTimestamp() 
        }, { merge: true });
        setIsEditingSchedule(false);
        alert("Jadwal Libur telah SELESAI disusun. Tombol Download sekarang aktif.");
      }
    } catch (err) {
      console.error(err);
      alert("Gagal merubah status jadwal.");
    }
  };

  const handleStartEdit = async () => {
    if (isFinished) {
      const pwd = await prompt("Jadwal sudah selesai disusun. Masukkan password admin untuk edit ulang:");
      if (pwd === 'admin123') {
        setIsEditingSchedule(true);
      } else {
        alert("Password salah!", "error");
      }
    } else if (isLocked) {
      const pwd = await prompt("Jadwal sedang dikunci sementara. Masukkan password admin untuk melanjutkan pekerjaan:");
      if (pwd === 'admin123') {
        const statusId = `status_${selectedPeriod}_${selectedDivision}`;
        try {
          await setDoc(doc(db, 'periodControls', statusId), { 
            ...statusData, 
            isLocked: false,
            updatedAt: serverTimestamp() 
          }, { merge: true });
          setIsEditingSchedule(true);
        } catch (err) {
          console.error(err);
          alert("Gagal membuka kunci jadwal.");
        }
      } else {
        alert("Password salah!", "error");
      }
    } else {
      setIsEditingSchedule(true);
    }
  };

  const handleResetToDefault = async () => {
    const pwd = await prompt("PERINGATAN: Semua perubahan jadwal yang Anda lakukan akan dihapus dan dikembalikan ke request awal karyawan. Masukkan password admin:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }

    const isConfirmed = await confirm("Yakin ingin mengembalikan semua data jadwal libur ke request awal karyawan?");
    if (!isConfirmed) return;

    try {
      // Find requests that haven't been reverted yet and have original data
      const batchRequests = leaveRequests.filter(r => r.originalDates && r.originalDates.length > 0);
      
      if (batchRequests.length === 0) {
        alert("Tidak ada data 'original' yang ditemukan untuk dikembalikan pada periode ini.");
        return;
      }

      const promises = batchRequests.map(async (r) => {
        const payload: any = {
           dates: r.originalDates,
           isModifiedByAdmin: false,
           updatedAt: serverTimestamp()
        };
        // Reset legacy date1..6 fields
        r.originalDates?.forEach((d, i) => {
          payload[`date${i+1}`] = d;
        });
        // Clear extra dates
        for (let i = (r.originalDates?.length || 0); i < 6; i++) {
          payload[`date${i+1}`] = "";
        }

        return updateDoc(doc(db, 'leaveRequests', r.id), payload);
      });

      await Promise.all(promises);
      alert("Jadwal libur berhasil dikembalikan ke request awal karyawan.");
    } catch (err) {
      console.error(err);
      alert("Gagal mengembalikan data.");
    }
  };

  // Group requests by date
  const dateMap: Record<string, (LeaveRequest & { _dateIndex?: number })[]> = {};
  leaveRequests.forEach(req => {
    if (req.division !== selectedDivision) return;
    const rDates = req.dates || [req.date1, req.date2, req.date3, req.date4, req.date5, req.date6];
    rDates.forEach((d, dateIndex) => {
      if (d) {
        if (!dateMap[d]) dateMap[d] = [];
        if (d === 'TRASH' || d === 'WAITING' || !dateMap[d].some(r => r.employeeId === req.employeeId)) {
          dateMap[d].push({ ...req, _dateIndex: dateIndex });
        }
      }
    });
  });

  const hasPendingTrashOrWaiting = (dateMap['WAITING'] && dateMap['WAITING'].length > 0) || (dateMap['TRASH'] && dateMap['TRASH'].length > 0);

  const activePeriod = periodOptions.find(p => p.value === selectedPeriod);

  return (
    <div className="space-y-6" id="jadwal-libur-section">
      <Card className="glass-panel border-none shadow-lg text-white">
        <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full md:w-auto">
            <CardTitle className="text-primary uppercase tracking-[0.2em] font-black text-xl flex items-center gap-3 text-wrap">
              <div className="w-2 h-8 bg-primary rounded-full shrink-0" />
              JADWAL LIBUR {selectedDivision}
            </CardTitle>
            <CardDescription className="text-white/50 text-xs mt-1">
              Periode: <span className="text-white/80 font-bold">{activePeriod ? activePeriod.label : "Pilih Periode"}</span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10 mr-2">
              <Button 
                onClick={handleStartEdit}
                disabled={activePeriod && controls[selectedPeriod]?.isPermanentlyClosed}
                className={`h-8 px-3 text-[10px] font-bold rounded-lg transition-all ${
                   isEditingSchedule ? 'bg-primary text-white shadow-lg' : 'bg-transparent text-white/40 hover:text-white'
                }`}
              >
                {isEditingSchedule ? <Edit className="w-3 h-3 mr-2" /> : <LockIcon className="w-3 h-3 mr-2" />}
                {isEditingSchedule ? 'SEDANG EDIT' : isFinished ? 'EDIT ULANG' : isLocked ? 'KERJAKAN LAGI' : 'MULAI EDIT'}
              </Button>

              {isEditingSchedule && (
                <>
                  <Button 
                    variant="outline"
                    onClick={() => handleToggleLock('lock')}
                    className="h-8 px-3 text-[10px] font-bold rounded-lg border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                  >
                    KUNCI SEMENTARA
                  </Button>
                  <Button 
                    onClick={() => handleToggleLock('finish')}
                    className="h-8 px-3 text-[10px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    SELESAI
                  </Button>
                </>
              )}
            </div>
            <Button 
              variant="outline"
              size="sm"
              onClick={handleResetToDefault}
              className="h-8 px-3 text-[10px] font-bold rounded-lg border-rose-500/50 text-rose-500 hover:bg-rose-500/10"
            >
              <History className="w-3 h-3 mr-2" /> SET DEFAULT AWAL
            </Button>
            <Select value={selectedDivision} onValueChange={setSelectedDivision}>
              <SelectTrigger className="w-full md:w-[150px] glass-panel border-white/10 text-white font-bold h-10">
                <SelectValue placeholder="Divisi" />
              </SelectTrigger>
              <SelectContent className="glass-panel border-white/20 text-white">
                {divisions.map(d => (
                  <SelectItem key={d.id} value={d.name} className="hover:bg-white/10">{d.name}</SelectItem>
                ))}
                {divisions.length === 0 && <SelectItem value="Marketing" className="hover:bg-white/10">Marketing</SelectItem>}
              </SelectContent>
            </Select>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-full md:w-[200px] glass-panel border-white/10 text-white font-bold h-10">
                <SelectValue placeholder={periodOptions.length > 0 ? "Pilih Periode" : "Memuat..."}>
                  {periodOptions.find(p => p.value === selectedPeriod)?.label || (periodOptions.length > 0 ? "Pilih Periode" : "Memuat...")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="glass-panel border-white/20 text-white">
                {periodOptions.map(p => (
                  <SelectItem key={p.value} value={p.value} className="hover:bg-white/10">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={() => {
                if (!isFinished) {
                  return alert("Jadwal belum selesai disusun! Klik tombol 'SELESAI' terlebih dahulu untuk mengaktifkan fitur download.");
                }
                setShowExcelHeaderDialog(true);
              }}
              disabled={!activePeriod || !isFinished}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold h-10 px-4 rounded-xl flex items-center gap-2 w-full md:w-auto shadow-lg shadow-emerald-900/20 transition-all"
              id="download-jadwal-btn"
            >
              <Download className="w-4 h-4" />
              Download Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {periodOptions.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-80 glass-panel border-dashed border-white/10 rounded-3xl p-10 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <CalendarIcon className="w-8 h-8 text-white/20" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Memuat Data Periode...</h3>
              <p className="text-white/40 text-xs">Pastikan koneksi internet stabil atau cek menu "Batas Waktu".</p>
            </div>
          ) : !activePeriod ? (
            <div className="flex flex-col items-center justify-center h-80 glass-panel border-white/10 rounded-3xl p-10 text-center">
              <p className="text-white/40 text-sm font-bold tracking-widest animate-pulse uppercase">Silakan Pilih Periode Di Atas</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-white/20 text-[10px] tracking-[0.3em] font-bold">Sinkronisasi Data...</p>
              </div>
            </div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {(() => {
                const startDate = startOfDay(activePeriod.start);
                const endDate = endOfDay(activePeriod.end);
                const days = eachDayOfInterval({ start: startDate, end: endDate });
                const weekDays = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];
                const firstDayOfWeek = getDay(days[0]); 
                const paddingBefore = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
                const calendarCells = [];
                for (let i = 0; i < paddingBefore; i++) calendarCells.push(null);
                days.forEach(d => calendarCells.push(d));

                return (
                  <div className="space-y-4">
                    {isEditingSchedule && (
                      <div className="grid grid-cols-2 gap-4">
                        <DroppableCell dateStr="WAITING" className="border-amber-500/30 bg-amber-500/5 min-h-[120px] rounded-2xl flex flex-col items-center justify-center border-dashed border-2" isSunday={false} isToday={false}>
                           <div className="text-amber-500 flex flex-col items-center gap-2 mt-4 pointer-events-none">
                             <Clock className="w-6 h-6" />
                             <span className="text-[10px] uppercase tracking-widest font-bold">Kotak Tunggu</span>
                           </div>
                           <div className="w-full mt-4 flex flex-wrap gap-2 px-4 pb-4 justify-center">
                              {(dateMap['WAITING'] || []).map((r, i) => (
                                <DraggableLeaveBadge key={`${r.id}-WAITING-${i}`} dragId={`${r.id}|WAITING|${r._dateIndex}`} request={r} dateStr="WAITING" isSunday={false} getNickname={getNickname} getSectionInitials={getSectionInitials} disabled={!isEditingSchedule} displayDate={r.originalDates ? r.originalDates[r._dateIndex as number] : null} />
                              ))}
                           </div>
                        </DroppableCell>
                        <DroppableCell dateStr="TRASH" className="border-rose-500/30 bg-rose-500/5 min-h-[120px] rounded-2xl flex flex-col items-center justify-center border-dashed border-2 relative group" isSunday={false} isToday={false}>
                           <div className="text-rose-500 flex flex-col items-center gap-2 mt-4 pointer-events-none transition-transform duration-300">
                             <Trash2 className="w-8 h-8 group-hover:scale-110 transition-transform" />
                             <span className="text-[10px] uppercase tracking-widest font-bold mt-2">Tempat Sampah</span>
                           </div>
                           <div className="w-full mt-4 flex flex-wrap gap-2 px-4 pb-4 justify-center">
                              {(dateMap['TRASH'] || []).map((r, i) => (
                                <DraggableLeaveBadge key={`${r.id}-TRASH-${i}`} dragId={`${r.id}|TRASH|${r._dateIndex}`} request={r} dateStr="TRASH" isSunday={false} getNickname={getNickname} getSectionInitials={getSectionInitials} disabled={!isEditingSchedule} displayDate={r.originalDates ? r.originalDates[r._dateIndex as number] : null} />
                              ))}
                           </div>
                           {dateMap['TRASH'] && dateMap['TRASH'].length > 0 && (
                             <Button 
                               size="sm" 
                               variant="destructive" 
                               className="absolute bottom-4 right-4 shadow-lg text-[10px] uppercase font-bold tracking-wider" 
                               onClick={handleEmptyTrash}
                             >
                               Hapus Permanen
                             </Button>
                           )}
                        </DroppableCell>
                      </div>
                    )}
                    <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/40 backdrop-blur-md shadow-2xl">
                    <div className="grid grid-cols-7 bg-white/5 border-b border-white/10">
                      {weekDays.map(wd => (
                        <div key={wd} className="p-4 text-center text-[10px] md:text-xs font-black text-white/40 tracking-widest border-r border-white/10 last:border-r-0 uppercase">
                          {wd}
                        </div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-7 border-b border-white/10 last:border-b-0">
                      {calendarCells.map((date, idx) => {
                        if (!date) return <div key={`pad-${idx}`} className="min-h-[140px] bg-white/[0.02] border-r border-white/10 last:border-r-0" />;
                        
                        const dateStr = format(date, 'yyyy-MM-dd');
                        const isSunday = getDay(date) === 0;
                        const isToday = isSameDay(date, new Date());
                        const requests = dateMap[dateStr] || [];
                        
                        return (
                          <DroppableCell key={dateStr} dateStr={dateStr} isSunday={isSunday} isToday={isToday}>
                            <div className={`p-3 flex items-center justify-between border-b border-white/[0.03] ${isToday ? 'bg-primary/20 text-white font-bold' : isSunday ? 'text-rose-400 font-bold' : 'text-white/60 font-medium'}`}>
                              <span className="text-[10px] opacity-40">{format(date, 'dd')}</span>
                              <span className="text-[9px] scale-90 origin-right">{format(date, 'MM/yy')}</span>
                            </div>
                            <div className="flex-1 p-2 space-y-1.5">
                              {requests.map((r, i) => (
                                <DraggableLeaveBadge 
                                  key={`${r.id}-${dateStr}-${i}`} 
                                  dragId={`${r.id}|${dateStr}|${r._dateIndex}`}
                                  request={r} 
                                  dateStr={dateStr} 
                                  isSunday={isSunday}
                                  getNickname={getNickname}
                                  getSectionInitials={getSectionInitials}
                                  disabled={!isEditingSchedule}
                                />
                              ))}
                              {requests.length === 0 && !isToday && <div className="text-[8px] text-white/5 text-center mt-6 tracking-[0.2em] uppercase font-black">- Kosong -</div>}
                              {requests.length === 0 && isToday && <div className="text-[8px] text-primary/20 text-center mt-6 tracking-[0.2em] uppercase font-black">HARI INI</div>}
                            </div>
                          </DroppableCell>
                        );
                      })}
                    </div>
                  </div>
                  </div>
                );
              })()}
            </DndContext>
          )}
          
          <div className="mt-8 flex flex-wrap justify-between items-center gap-6 glass-panel border-white/5 p-4 rounded-xl">
             <div className="flex flex-wrap gap-4 md:gap-6 text-[10px] text-white/40 font-bold tracking-widest uppercase">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-white/10 border border-white/20" /> Hari Biasa
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-rose-500/20 border border-rose-500/40" /> Hari Minggu
              </div>
              <div className="flex items-center gap-3 text-primary">
                <div className="w-2 h-2 rounded-full bg-primary/40 border border-primary" /> Hari Ini
              </div>
              {isEditingSchedule && (
                <div className="flex items-center gap-3 text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md animate-pulse">
                  <Edit className="w-2.5 h-2.5" /> DRAG & DROP AKTIF
                </div>
              )}
            </div>
            <p className="text-[9px] text-white/20 italic font-medium">* Menampilkan data request status APPROVED & PENDING</p>
          </div>
        </CardContent>
      </Card>

      {/* Excel Header Input Dialog */}
      <Dialog open={showExcelHeaderDialog} onOpenChange={setShowExcelHeaderDialog}>
        <DialogContent className="glass-panel text-white border-white/20 sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-foreground">Judul Laporan Excel</DialogTitle>
            <DialogDescription className="text-white/60">
              Masukkan judul yang akan muncul di baris pertama file Excel.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-white/70 text-xs mb-2 block uppercase tracking-wider font-bold">Judul Header</Label>
            <Input 
              value={excelHeader} 
              onChange={(e) => setExcelHeader(e.target.value)} 
              placeholder={`JADWAL LIBUR ${selectedDivision} - ${activePeriod?.label}`}
              className="field-input h-12"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExcelHeaderDialog(false)} className="text-white border-white/20">Batal</Button>
            <Button onClick={handleExportExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
              DOWNLOAD SEKARANG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminQuota({ 
  employees,
  confirm,
  prompt,
  alert
}: { 
  employees: Employee[],
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [controls, setControls] = useState<Record<string, any>>({});
  const periodOptions = getCombinedPeriods(controls);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [quotas, setQuotas] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodControls'), (snap) => {
      const data: Record<string, any> = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setControls(data);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedPeriod && periodOptions.length > 0) {
      const nowStr = format(new Date(), 'yyyy-MM-dd');
      const current = periodOptions.find(p => nowStr >= format(p.start, 'yyyy-MM-dd') && nowStr <= format(p.end, 'yyyy-MM-dd'));
      setSelectedPeriod(current ? current.value : periodOptions[0].value);
    }
  }, [periodOptions, selectedPeriod]);

  useEffect(() => {
    const q = query(collection(db, 'leaveRequests'), where('status', 'in', ['approved', 'pending']));
    const unsub = onSnapshot(q, (snap) => setLeaveRequests(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodQuotas'), (snap) => {
      setQuotas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (controls[selectedPeriod]?.isPermanentlyClosed) {
      alert("Maaf, periode ini telah DITUTUP PERMANEN oleh Admin. Tidak bisa mengimpor kuota.");
      e.target.value = '';
      return;
    }
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

  const handleDownloadQuota = () => {
    const data = employees.map(e => {
        const currentQuota = calculateEffectiveQuota(e.id, selectedPeriod, periodOptions, controls, quotas, leaveRequests);
        
        const usedRequests = leaveRequests.filter(a => a.employeeId === e.id && a.period === selectedPeriod);
        const uniqueDates = new Set<string>();
        usedRequests.forEach(r => {
          const dArr = r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6];
          dArr.forEach((d, i) => {
            if (d) {
              if (d === 'TRASH' || d === 'WAITING') {
                uniqueDates.add(`${r.id}-${d}-${i}`);
              } else {
                uniqueDates.add(d);
              }
            }
          });
        });
        const usedLeave = uniqueDates.size;
        const remaining = Math.max(0, currentQuota - usedLeave);
        
        return {
          'No. Absen': e.pin,
          'Nama Karyawan': e.name,
          'Kuota': currentQuota,
          'Diambil': usedLeave,
          'Sisa': remaining
        };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Kuota Libur");
    const activePeriod = periodOptions.find(p => p.value === selectedPeriod);
    XLSX.writeFile(wb, `Data_Kuota_Libur_${activePeriod?.label || selectedPeriod}.xlsx`);
  };

  return (
    <Card className="glass-panel border-none shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white">Pengaturan Kuota Libur</CardTitle>
        <CardDescription className="text-white/50">
            Jatah default: <span className="text-white/80 font-bold">4 Hari</span>. 
            Maksimal total (Jatah + Sisa Lalu): <span className="text-white/80 font-bold">{controls[selectedPeriod]?.maxAccumulatedLeave || 6} Hari</span>.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleDownloadQuota}
            className="rounded-xl flex items-center justify-center gap-2 glass-panel border-white/10 text-white hover:bg-white/10 h-10 px-4 py-2 font-medium shadow-sm"
          >
            <Download className="w-4 h-4" /> Export Data
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
              <SelectValue placeholder="Pilih Periode">
                {periodOptions.find(p => p.value === selectedPeriod)?.label || "Pilih Periode"}
              </SelectValue>
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
                <TableHead className="text-white/40 whitespace-nowrap">Kuota</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">Diambil</TableHead>
                <TableHead className="text-white/40 whitespace-nowrap">Sisa</TableHead>
                <TableHead className="text-right text-white/40 whitespace-nowrap">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(e => {
                const currentQuota = calculateEffectiveQuota(e.id, selectedPeriod, periodOptions, controls, quotas, leaveRequests);
                
                // Calculate used quota from 'leaveRequests' collection using unique dates logic
                const employeeRequests = leaveRequests.filter(a => a.employeeId === e.id && a.period === selectedPeriod);
                const uniqueDates = new Set<string>();
                employeeRequests.forEach(r => {
                  const dArr = r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6];
                  dArr.forEach((d, i) => {
                    if (d) {
                      if (d === 'TRASH' || d === 'WAITING') {
                        uniqueDates.add(`${r.id}-${d}-${i}`);
                      } else {
                        uniqueDates.add(d);
                      }
                    }
                  });
                });
                const usedLeave = uniqueDates.size;
                const remaining = Math.max(0, currentQuota - usedLeave);
                
                return (
                  <TableRow key={e.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-semibold text-white whitespace-nowrap">{e.name}</TableCell>
                    <TableCell className="text-white/40 font-mono text-xs whitespace-nowrap">{e.pin}</TableCell>
                    <TableCell className="text-white/40">{currentQuota} Hari</TableCell>
                    <TableCell className="text-amber-400 font-bold">{usedLeave} Hari</TableCell>
                    <TableCell className="text-emerald-400 font-bold">{remaining} Hari</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                        <Button 
                          size="sm"
                          variant="ghost" 
                          className="text-white/30 hover:text-white hover:bg-white/10"
                          onClick={async () => {
                            if (controls[selectedPeriod]?.isPermanentlyClosed) {
                              return alert("Maaf, periode ini telah DITUTUP PERMANEN oleh Admin. Tidak bisa mengubah kuota.", "error");
                            }
                            const newVal = await prompt(`Update Kuota untuk ${e.name}:`, String(currentQuota));
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
                                alert(`Kuota ${e.name} berhasil diubah!`, "success");
                              } else {
                                alert("Masukkan angka yang valid!", "error");
                              }
                            }
                          }}
                        >
                          <Edit className="w-4 h-4 mr-2" /> Edit
                        </Button>
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
function AdminPeriods({
  confirm,
  prompt,
  alert
}: {
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
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

  const updateSchedule = async (periodId: string, openDate: string, openTime: string, deadlineDate: string, deadlineTime: string) => {
    await setDoc(doc(db, 'periodControls', periodId), {
      status: 'scheduled',
      openDate,
      openTime,
      deadlineDate,
      deadlineTime,
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

  const updateMaxDaysPerRequest = async (periodId: string, limit: number) => {
    await setDoc(doc(db, 'periodControls', periodId), {
      maxDaysPerRequest: limit,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const updatePeriodName = async (periodId: string, name: string) => {
    if (!name) return;
    await setDoc(doc(db, 'periodControls', periodId), {
      name,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  const updateVisibility = async (periodId: string, isVisible: boolean) => {
    await setDoc(doc(db, 'periodControls', periodId), {
      isVisibleToEmployee: isVisible,
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
    const pwd = await prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }
    const isConfirmed = await confirm("Hapus pengaturan periode ini?");
    if (isConfirmed) {
      if (id.startsWith('custom_')) {
        await deleteDoc(doc(db, 'periodControls', id));
      } else {
        await setDoc(doc(db, 'periodControls', id), {
          hidden: true,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      alert("Periode berhasil dihapus.", "success");
    }
  }

  const togglePermanentClose = async (periodId: string, currentStatus: boolean) => {
    const pwd = await prompt(`Masukkan Password Admin untuk ${currentStatus ? 'membuka permanen (unlock)' : 'menutup permanen'}:`);
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }
    await setDoc(doc(db, 'periodControls', periodId), {
      isPermanentlyClosed: !currentStatus,
      status: !currentStatus ? 'closed' : 'open',
      updatedAt: serverTimestamp()
    }, { merge: true });
    alert(`Periode berhasil ${!currentStatus ? 'Ditutup' : 'Dibuka'}!`, "success");
  };

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
                    value={newPeriod.maxAccumulatedLeave.toString()} 
                    onChange={(e) => setNewPeriod({...newPeriod, maxAccumulatedLeave: parseInt(e.target.value) || 0} as any)} 
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
                     ctrl.status === 'closed' ? <LockIcon className="w-5 h-5" /> : 
                     <Clock className="w-5 h-5" />}
                  </div>
                  <div>
          <div className="flex items-center gap-2">
            <h4 className="text-white font-bold">{p.label}</h4>
            {isCustom && <Badge className="bg-white/10 text-white/40 border-none text-[8px]">Custom</Badge>}
            <Popover>
              <PopoverTrigger render={<Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-white/10"><Edit className="w-3 h-3 text-white/30" /></Button>} />
              <PopoverContent className="bg-black/95 text-white border-white/20 p-2 w-64">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-white/40">Ubah Nama Periode</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Nama baru..."
                      className="field-input h-8 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updatePeriodName(p.value, e.currentTarget.value);
                          (e.target as any).blur();
                        }
                      }}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
                    <p className="text-xs text-white/40">Status: <span className="uppercase font-bold tracking-wider">{ctrl.status === 'scheduled' ? 'Terjadwal' : ctrl.status === 'open' ? 'Terbuka' : 'Ditutup'}</span></p>
                    <div className="flex items-center gap-2 mt-1">
                      <button 
                        onClick={() => updateVisibility(p.value, !ctrl.isVisibleToEmployee)}
                        className={`flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-black transition-all border shadow-sm ${
                          ctrl.isVisibleToEmployee 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-white/5 text-white/20 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          ctrl.isVisibleToEmployee ? 'bg-emerald-500 border-transparent text-black' : 'border-white/20 bg-transparent'
                        }`}>
                          {ctrl.isVisibleToEmployee && <Check className="w-3 h-3 stroke-[4]" />}
                        </div>
                        {ctrl.isVisibleToEmployee ? 'TAMPIL DI KARYAWAN' : 'SEMBUNYIKAN DARI KARYAWAN'}
                      </button>
                    </div>
                    {isCustom && <p className="text-[10px] text-white/20">{ctrl.startDate} s/d {ctrl.endDate}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button 
                    size="sm" 
                    variant={ctrl.status === 'open' ? 'default' : 'ghost'}
                    onClick={() => updateStatus(p.value, 'open')}
                    disabled={ctrl.isPermanentlyClosed}
                    className={ctrl.status === 'open' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'text-white/50 hover:bg-white/10'}
                  >
                    Buka
                  </Button>
                  <Button 
                    size="sm" 
                    variant={ctrl.status === 'closed' ? 'destructive' : 'ghost'}
                    onClick={() => updateStatus(p.value, 'closed')}
                    disabled={ctrl.isPermanentlyClosed}
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
                          disabled={ctrl.isPermanentlyClosed}
                          className={ctrl.status === 'scheduled' ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'text-white/50 hover:bg-white/10'}
                        >
                          {ctrl.status === 'scheduled' ? 'Terjadwal' : 'Jadwalkan'}
                        </Button>
                      }
                    />
                    <PopoverContent className="bg-black/95 text-white border-white/20 p-4 w-72 h-[450px] overflow-y-auto no-scrollbar">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-amber-400" />
                          <h4 className="text-white font-bold text-sm">Batas Waktu Request</h4>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Tanggal Buka</Label>
                          <LocalInput 
                            type="date" 
                            value={ctrl.openDate || ''}
                            onSave={(val) => updateSchedule(p.value, val, ctrl.openTime || '08:00', ctrl.deadlineDate || '', ctrl.deadlineTime || '17:00')}
                            className="field-input h-9 text-white" 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Jam Buka</Label>
                          <LocalInput 
                            type="time" 
                            value={ctrl.openTime || '08:00'}
                            onSave={(val) => updateSchedule(p.value, ctrl.openDate || '', val, ctrl.deadlineDate || '', ctrl.deadlineTime || '17:00')}
                            className="field-input h-9 text-white" 
                          />
                        </div>
                        <div className="space-y-1 mt-2">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Tanggal Penutupan</Label>
                          <LocalInput 
                            type="date" 
                            value={ctrl.deadlineDate || ''}
                            onSave={(val) => updateSchedule(p.value, ctrl.openDate || '', ctrl.openTime || '08:00', val, ctrl.deadlineTime || '17:00')}
                            className="field-input h-9 text-white" 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Jam Penutupan</Label>
                          <LocalInput 
                            type="time" 
                            value={ctrl.deadlineTime || '17:00'}
                            onSave={(val) => updateSchedule(p.value, ctrl.openDate || '', ctrl.openTime || '08:00', ctrl.deadlineDate || '', val)}
                            className="field-input h-9 text-white" 
                          />
                        </div>
                        {ctrl.status === 'scheduled' && ctrl.deadlineDate && ctrl.openDate && (
                          <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                            <p className="text-[10px] text-amber-400 italic">
                              Buka: <span className="font-bold">{ctrl.openDate} pkl {ctrl.openTime}</span>
                              <br/>
                              Tutup: <span className="font-bold">{ctrl.deadlineDate} pkl {ctrl.deadlineTime}</span>
                            </p>
                          </div>
                        )}
                        <div className="pt-2 border-t border-white/5 space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Maks Request Per Hari</Label>
                          <div className="flex items-center gap-2">
                            <LocalInput 
                              type="number" 
                              value={ctrl.maxRequestsPerDay || 7}
                              onSave={(val) => updateMaxLimit(p.value, parseInt(val) || 7)}
                              className="field-input h-9 text-white w-20" 
                            />
                            <span className="text-[10px] text-white/30 italic">Orang / Hari</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-white/5 space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Maks Tabungan Libur</Label>
                          <div className="flex items-center gap-2">
                            <LocalInput 
                              type="number" 
                              value={ctrl.maxAccumulatedLeave || 6}
                              onSave={(val) => updateMaxAccumulated(p.value, parseInt(val) || 6)}
                              className="field-input h-9 text-white w-20" 
                            />
                            <span className="text-[10px] text-white/30 italic">Hari / Periode</span>
                          </div>
                        </div>
                        
                        <div className="pt-2 border-t border-white/5 space-y-1">
                          <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Maks Ambil Libur</Label>
                          <div className="flex items-center gap-2">
                            <LocalInput 
                              type="number" 
                              value={ctrl.maxDaysPerRequest || 6}
                              onSave={(val) => updateMaxDaysPerRequest(p.value, parseInt(val) || 6)}
                              className="field-input h-9 text-white w-20" 
                            />
                            <span className="text-[10px] text-white/30 italic">Hari / User</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-white/5 space-y-1">
                           <Label className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Custom Nama Periode</Label>
                           <LocalInput 
                             value={ctrl.name || ''}
                             placeholder={p.label}
                             onSave={async (val) => {
                               await setDoc(doc(db, 'periodControls', p.value), { name: val }, { merge: true });
                             }}
                             className="field-input h-9 text-white"
                           />
                        </div>
                        <Button 
                          className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold" 
                          size="sm"
                          onClick={() => {
                            if (!ctrl.deadlineDate || !ctrl.openDate) return alert("Pilih tanggal buka dan penutupan terlebih dahulu!");
                            updateSchedule(p.value, ctrl.openDate, ctrl.openTime || '08:00', ctrl.deadlineDate, ctrl.deadlineTime || '17:00');
                            alert("Jadwal dan pengaturan batas waktu telah disimpan!");
                          }}
                        >
                          OK / Simpan Pengaturan
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Button 
                    size="sm" 
                    variant={ctrl.isPermanentlyClosed ? "default" : "secondary"} 
                    className={`font-semibold ${ctrl.isPermanentlyClosed ? 'bg-rose-900 hover:bg-rose-800 text-white shadow-[0_0_10px_rgba(225,29,72,0.5)]' : 'bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-900/50'}`}
                    onClick={() => togglePermanentClose(p.value, !!ctrl.isPermanentlyClosed)}
                  >
                    <LockIcon className="w-3 h-3 mr-1" />
                    {ctrl.isPermanentlyClosed ? 'Buka Permanen' : 'Tutup Permanen'}
                  </Button>

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
  const [postSubmitKata, setPostSubmitKata] = useState('');
  const [postSubmitDuration, setPostSubmitDuration] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemConfig', 'requestKata'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setKata(data.text || '');
        setPostSubmitKata(data.postText || '');
        setPostSubmitDuration(data.duration || 7);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSave = async () => {
    await setDoc(doc(db, 'systemConfig', 'requestKata'), { 
      text: kata,
      postText: postSubmitKata,
      duration: postSubmitDuration
    });
    alert('Kata-kata dan durasi berhasil disimpan!');
  };

  return (
    <div className="space-y-6">
      <Card className="glass-panel border-none p-6 text-white">
        <CardHeader>
          <CardTitle>Pengaturan Kata-kata Request (Sebelum Form)</CardTitle>
          <CardDescription className="text-white/60">Teks yang muncul beberapa detik sebelum form request terbuka:</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea 
            value={kata} 
            onChange={(e) => setKata(e.target.value)}
            className="w-full h-32 field-input p-3 rounded-xl bg-white/5 border border-white/10"
            placeholder="Contoh: Halo! Silakan ajukan request Anda..."
          />
        </CardContent>
      </Card>

      <Card className="glass-panel border-none p-6 text-white">
        <CardHeader>
          <CardTitle>Pengaturan Kata-kata Post-Submit (Setelah Submit)</CardTitle>
          <CardDescription className="text-white/60">Teks yang muncul setelah karyawan berhasil mengirim request:</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea 
            value={postSubmitKata} 
            onChange={(e) => setPostSubmitKata(e.target.value)}
            className="w-full h-32 field-input p-3 rounded-xl bg-white/5 border border-white/10"
            placeholder="Contoh: Terima kasih! Request Anda akan segera diproses..."
          />
          <div className="grid gap-2">
            <Label className="text-white/70 text-xs">Durasi Popup Muncul (Detik)</Label>
            <Input 
              type="number" 
              value={postSubmitDuration} 
              onChange={(e) => setPostSubmitDuration(parseInt(e.target.value) || 0)}
              className="field-input"
              placeholder="Contoh: 7"
            />
          </div>
          <Button onClick={handleSave} className="w-full bg-primary mt-4">Simpan Semua Pengaturan</Button>
        </CardContent>
      </Card>
    </div>
  );
}

// --- ADMIN: SHIFTS ---
function AdminShifts({ 
  shifts,
  confirm,
  prompt,
  alert
}: { 
  shifts: Shift[],
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ name: '', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00' });

  const handleAdd = async () => {
    if (!formData.name) return;
    await addDoc(collection(db, 'shifts'), formData);
    setShowAdd(false);
    setFormData({ name: '', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00' });
  };

  const handleDelete = async (id: string) => {
    const pwd = await prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }
    const isConfirmed = await confirm("Hapus shift ini?");
    if (isConfirmed) {
      await deleteDoc(doc(db, 'shifts', id));
      alert("Shift berhasil dihapus.", "success");
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

function AdminActivityLog({ employees, viewDate }: { employees: Employee[], viewDate: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const getActionName = (action: string) => {
    switch(action) {
      case 'checkIn': return 'Masuk';
      case 'breakStart': return 'Istirahat';
      case 'breakEnd': return 'Selesai Ist.';
      case 'checkOut': return 'Pulang';
      default: return 'Lainnya';
    }
  };

  useEffect(() => {
    // We calculate the start and end of the viewed date to filter activityLogs
    const dateObj = toDateSafe(viewDate);
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'activityLogs'), 
      where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
      where('timestamp', '<=', Timestamp.fromDate(endOfDay)),
      orderBy('timestamp', 'desc'), 
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
      setLoading(false);
    }, (err) => {
      console.error("Query activityLogs failed, might need index:", err);
      // Fallback to global if filter fails due to index missing
      const qGlobal = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100));
      onSnapshot(qGlobal, (s) => {
        setLogs(s.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
        setLoading(false);
      });
    });
    return unsub;
  }, [viewDate]);

  return (
    <DialogContent className="glass-panel text-white border-white/20 p-6 max-w-4xl max-h-[80vh] overflow-hidden flex flex-col rounded-[2rem]">
      <DialogHeader>
        <DialogTitle className="text-white text-xl font-bold flex items-center gap-2">
           <History className="w-5 h-5 text-primary" /> Log Aktivitas: {format(toDateSafe(viewDate), 'dd MMMM yyyy')}
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
                  <TableCell className="text-white/80 font-bold">{getActionName(log.action)}</TableCell>
                  <TableCell className="text-white/60 text-xs">
                    {log.timestamp ? format(toDateSafe(log.timestamp), 'dd MMM yyyy') : '-'}<br/>
                    <span className="text-[10px] text-white/30 uppercase font-black">
                      {log.timestamp ? format(toDateSafe(log.timestamp), 'HH:mm:ss') : '-'}
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
function AdminLive({ 
  employees, 
  shifts,
  confirm,
  prompt,
  alert
}: { 
  employees: Employee[], 
  shifts: Shift[],
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
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
    const pwd = await prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }
    const isConfirmed = await confirm("Hapus data absen ini?");
    if (isConfirmed) {
      await deleteDoc(doc(db, 'attendance', id));
      alert("Data absen berhasil dihapus.", "success");
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

            <div className="flex flex-wrap gap-2 items-center">
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
                      <Label className="text-white/70 text-xs">Pilih Karyawan</Label>
                      <EmployeeSelector 
                        employees={employees} 
                        selectedId={liburData.employeeId} 
                        onSelect={(id) => setLiburData({...liburData, employeeId: id})} 
                        placeholder="Cari Karyawan..."
                      />
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
            </div>

            <Dialog open={showActivity} onOpenChange={setShowActivity}>
              <DialogTrigger className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary/20 border border-primary/20 rounded-md text-xs font-bold text-primary hover:bg-primary/30 transition-all whitespace-nowrap">
                <History className="w-3 h-3" /> Cek Activity
              </DialogTrigger>
              <AdminActivityLog employees={employees} viewDate={format(date, 'yyyy-MM-dd')} />
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
function AdminLeave({ 
  employees, 
  sections, 
  divisions,
  confirm,
  prompt,
  alert
}: { 
  employees: Employee[], 
  sections: Section[], 
  divisions: Division[],
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
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
    const unsub = onSnapshot(q, (snap) => setRequests(snap.docs.map(d => ({id: d.id, ...d.data()} as LeaveRequest))), (err) => handleFirestoreError(err, OperationType.LIST, 'leaveRequests'));
    return unsub;
  }, [selectedPeriod, selectedDivision]);

  const handleExport = () => {
    setExportLoading(true);
    try {
      const activePeriod = periodOptions.find(p => p.value === selectedPeriod);
      const data = requests.map(r => {
        const dArr = (r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6]).filter(Boolean);
        const row: any = {
          'Nama Karyawan': r.employeeName,
          'Bagian': sections.find(s => s.id === r.sectionId)?.name || '-',
          'Divisi': r.division,
          'Alasan': r.reason,
          'Periode': activePeriod?.label || r.period,
        };

        // Add each date into its own cell
        for (let i = 0; i < 6; i++) {
          row[`Tgl Libur ${i + 1}`] = dArr[i] || '-';
        }

        row['Dibuat Pada'] = r.createdAt ? format(toDateSafe(r.createdAt), 'dd/MM/yyyy HH:mm') : '-';
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Request Libur ${selectedDivision}`);
      XLSX.writeFile(wb, `Rekap_Liburan_${selectedDivision}_${activePeriod?.label || selectedPeriod}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    } finally {
      setExportLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const pwd = await prompt("Masukkan Password Admin untuk menghapus:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }
    const isConfirmed = await confirm("Hapus request libur ini?");
    if (isConfirmed) {
      await deleteDoc(doc(db, 'leaveRequests', id));
      alert("Request libur berhasil dihapus.", "success");
    }
  };

  const handleDeleteAll = async () => {
    if (requests.length === 0) return;
    const isConfirmed1 = await confirm(`Apakah yakin anda akan menghapus request libur divisi ${selectedDivision}?`);
    if (!isConfirmed1) return;
    
    const pwd = await prompt("Masukkan Password Admin untuk melanjutkan penghapusan:");
    if (pwd !== 'admin123') {
      alert("Password salah!", "error");
      return;
    }

    const isConfirmed2 = await confirm(`Apakah anda sudah yakin untuk menghapus ini?`);
    if (!isConfirmed2) return;

    try {
      await Promise.all(requests.map(r => deleteDoc(doc(db, 'leaveRequests', r.id))));
      alert(`Semua request libur divisi ${selectedDivision} periode ini berhasil dihapus.`, "success");
    } catch(err) {
      console.error(err);
      alert("Terjadi kesalahan saat menghapus data.", "error");
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
          <div className="flex flex-col sm:flex-row gap-4 mt-4 sm:mt-0 w-full sm:w-auto">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-full sm:w-[200px] glass-panel border-white/10 text-white">
                <SelectValue placeholder="Pilih Periode">
                  {periodOptions.find(p => p.value === selectedPeriod)?.label || "Pilih Periode"}
                </SelectValue>
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
            <Button onClick={handleDeleteAll} disabled={requests.length === 0} variant="destructive" className="flex gap-2 shadow-lg">
              <Trash2 className="w-4 h-4" /> Hapus Semua Request
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
                  <TableHead className="text-white/40">Tanggal Libur</TableHead>
                  <TableHead className="text-right text-white/40">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(r => (
                  <TableRow key={r.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-bold text-white">{r.employeeName}</TableCell>
                    <TableCell className="text-white/50 text-xs">{sections.find(s => s.id === r.sectionId)?.name || '-'}</TableCell>
                    <TableCell className="text-white/60 text-xs italic">"{r.reason}"</TableCell>
                    <TableCell className="text-emerald-400/80 font-bold text-xs">
                       {(r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6]).filter(Boolean).map(d => format(new Date(d), 'dd/MM')).join(', ') || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)} className="hover:bg-white/10"><Trash2 className="w-4 h-4 text-rose-500" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {requests.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-white/30 italic">Belum ada request libur di bagian {selectedDivision}.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-none shadow-lg overflow-hidden mt-6">
        <CardHeader>
          <CardTitle className="text-white font-bold text-sm text-rose-400 flex items-center gap-2">
            Belum Request Libur
          </CardTitle>
          <CardDescription className="text-white/50">
            Karyawan divisi {selectedDivision} yang belum mengajukan libur pada periode ini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {employees
              .filter(e => (e.division || 'Depan') === selectedDivision && e.role !== 'admin' && !requests.some(r => r.employeeId === e.id))
              .length > 0 ? (
                employees
                  .filter(e => (e.division || 'Depan') === selectedDivision && e.role !== 'admin' && !requests.some(r => r.employeeId === e.id))
                  .map(e => (
                    <Badge key={e.id} variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/10 py-1.5 px-3">
                      {e.name}
                    </Badge>
                  ))
              ) : (
                <div className="text-white/40 italic text-sm py-4">
                  Semua karyawan di divisi ini sudah mengajukan libur.
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- EMPLOYEE: LEAVE REQUEST ---
function EmployeeLeave({ employee, employees, sections }: { employee: Employee, employees: Employee[], sections: Section[] }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
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

  const [formData, setFormData] = useState<{dates: string[], reason: string, sectionId: string}>({ 
    dates: [],
    reason: '',
    sectionId: ''
  });
  const [activeHoldDate, setActiveHoldDate] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const isPostPopupRef = React.useRef(false);

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
    if (currentRequests && currentRequests.length > 0) {
      const r = currentRequests[0];
      const initialDates = r.dates ? [...r.dates] : Object.entries(r)
          .filter(([k, v]) => k.startsWith('date') && v)
          .map(([k, v]) => v as string);
      
      const maxDays = periodControl?.maxDaysPerRequest || 6;
      while (initialDates.length < maxDays) initialDates.push('');

      setFormData({
        dates: initialDates.slice(0, maxDays),
        reason: r.reason || '',
        sectionId: r.sectionId || ''
      });
    } else {
      const maxDays = periodControl?.maxDaysPerRequest || 6;
      setFormData({ dates: Array(maxDays).fill(''), reason: '', sectionId: '' });
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
    const active = periodOptions.filter(p => {
       const ctrl = controls[p.value];
       if (!ctrl) return false;
       // Always show if admin checked it, or if it's currently open/scheduled
       return ctrl.isVisibleToEmployee === true || ctrl.status === 'open' || ctrl.status === 'scheduled';
    });
    if (active.length > 0) {
      if (!selectedPeriod || !active.find(a => a.value === selectedPeriod)) {
        setSelectedPeriod(active[0].value);
      }
    } else {
      setSelectedPeriod("");
    }
  }, [periodOptions, controls, selectedPeriod]);

  useEffect(() => {
    if (!selectedPeriod) return;
    const unsub = onSnapshot(doc(db, 'periodControls', selectedPeriod), (snap) => {
      setPeriodControl(snap.exists() ? snap.data() : { status: 'open' });
    });
    return unsub;
  }, [selectedPeriod]);

  useEffect(() => {
    // Listener that synchronizes request additions and Admin deletions in real-time
    // Fetch ALL requests for THIS employee (cross-division) to ensure accurate carryover
    const qEmp = query(
      collection(db, 'leaveRequests'),
      where('employeeId', '==', employee.id)
    );
    const unsubEmp = onSnapshot(qEmp, (snap) => {
      const data = snap.docs.map(d => ({id: d.id, ...d.data()} as LeaveRequest));
      setRequests(data);
    });

    // Listener for ALL requests in the CURRENT division (for popular dates / quota checks)
    const qDiv = query(
      collection(db, 'leaveRequests'), 
      where('division', '==', employee.division || 'Depan'),
      orderBy('createdAt', 'desc')
    );
    const unsubDiv = onSnapshot(qDiv, (snap) => {
      const data = snap.docs.map(d => ({id: d.id, ...d.data()} as LeaveRequest));
      setAllRequests(data);
    }, (err) => console.error("Employee leave error:", err));
    
    return () => {
      unsubEmp();
      unsubDiv();
    };
  }, [employee.id, employee.division]);

  const [allQuotas, setAllQuotas] = useState<any[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'periodQuotas'), (snap) => {
      setAllQuotas(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });
    return unsub;
  }, []);

  const currentRequests = requests.filter(r => r.period === selectedPeriod);
  const currentAllRequests = allRequests.filter(r => r.period === selectedPeriod);

  const periodEffectiveQuota = calculateEffectiveQuota(employee.id, selectedPeriod, periodOptions, controls, allQuotas, requests);
  
  // Use unique dates to count used days across potentially duplicate records
  const uniqueUsedDates = new Set<string>();
  currentRequests.forEach(r => {
    if (r.status === 'approved' || r.status === 'pending') {
      const dArr = r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6];
      dArr.forEach(d => {
        if (d) uniqueUsedDates.add(d);
      });
    }
  });
  const usedDays = uniqueUsedDates.size;

  const usedCurrent = usedDays; // Keep compatibility with existing variable usage if any
  const remainingInPeriod = Math.max(0, periodEffectiveQuota - usedCurrent);

  const handleSubmit = async () => {
    // Validate period status
    const pStatus = getPeriodStatus();
    if (pStatus === 'closed') {
      return alert("Maaf, periode request libur ini SUDAH DITUTUP oleh Admin.");
    }
    if (pStatus === 'not_yet_open') {
      return alert("Maaf, periode request libur ini BELUM DIBUKA oleh Admin.");
    }

    if (!formData.reason) return alert("Isi alasan libur!");
    if (!formData.sectionId) return alert("Pilih bagian!");
    const selectedDates = formData.dates.filter((d: string) => d !== '');
    if (selectedDates.length === 0) return alert("Pilih setidaknya satu tanggal libur!");

    const uniqueSelectedDates = new Set(selectedDates);
    if (uniqueSelectedDates.size !== selectedDates.length) {
      return alert("Anda memilih tanggal yang sama lebih dari sekali. Silakan pilih tanggal yang berbeda.");
    }

    const maxDays = periodControl?.maxDaysPerRequest || 6;
    if (selectedDates.length > maxDays) return alert(`Hanya bisa memilih maksimal ${maxDays} hari libur!`);

    // Check if enough quota
    if (selectedDates.length > periodEffectiveQuota) {
      return alert(`Jatah libur Anda tidak mencukupi (Sisa: ${periodEffectiveQuota} hari).`);
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
      const count = currentAllRequests.filter(r => {
        if (r.employeeId === employee.id) return false;
        if (r.dates && r.dates.includes(d)) return true;
        if (!r.dates && (r.date1 === d || r.date2 === d || r.date3 === d || r.date4 === d || r.date5 === d || r.date6 === d)) return true;
        return false;
      }).length;

      if (count >= maxLimit) {
        return alert(`Tanggal ${d ? format(new Date(d), 'dd MMM yyyy') : '-'} sudah penuh (maks ${maxLimit} orang di divisi ${employee.division}).`);
      }
    }

    const payload: any = {
      ...formData,
      employeeId: employee.id,
      employeeName: employee.name,
      division: employee.division || 'Depan',
      period: selectedPeriod,
      status: 'approved', // Auto approved
      originalDates: [...selectedDates], // Store original request for reset feature
      createdAt: serverTimestamp()
    };
    
    // Fallback for backwards compatibility in existing old view scripts etc.
    formData.dates.forEach((d, i) => {
        payload[`date${i + 1}`] = d;
    });

    // Single row per employee per period
    await setDoc(doc(db, 'leaveRequests', `${employee.id}_${selectedPeriod}`), payload);
    
    // Check for post-submit popup config
    const configSnap = await getDoc(doc(db, 'systemConfig', 'requestKata'));
    if (configSnap.exists()) {
      const configData = configSnap.data();
      if (configData.postText) {
        setMusicPopupText(configData.postText);
        isPostPopupRef.current = true;
        setShowMusicPopup(true);
        // Do NOT stop music here, it should continue
        setShowAdd(false);
        
        // Reset form
        const maxDaysFinal = periodControl?.maxDaysPerRequest || 6;
        setFormData({ dates: Array(maxDaysFinal).fill(''), reason: '', sectionId: '' });

        // Use duration from config or default to 7 seconds
        const durationMs = (configData.duration || 7) * 1000;
        setTimeout(() => {
          setShowMusicPopup(false);
          isPostPopupRef.current = false;
          stopMusic();
        }, durationMs);
      } else {
        setShowAdd(false);
        stopMusic();
        const maxDaysFinal = periodControl?.maxDaysPerRequest || 6;
        setFormData({ dates: Array(maxDaysFinal).fill(''), reason: '', sectionId: '' });
      }
    } else {
      setShowAdd(false);
      stopMusic();
      const maxDaysFinal = periodControl?.maxDaysPerRequest || 6;
      setFormData({ dates: Array(maxDaysFinal).fill(''), reason: '', sectionId: '' });
    }
  };

  const usageMap: Record<string, number> = {};
  const usersPerDate: Record<string, string[]> = {};
  // For popular dates, we should only count each user once per date in a period
  // to avoid skewing numbers if there are duplicate records for the same employee
  const userDateSeen = new Set<string>();
  currentAllRequests.forEach(r => {
    const dArr = r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6];
    const emp = employees.find(e => e.id === r.employeeId);
    const name = emp?.nickname || emp?.name || r.employeeName;
    
    dArr.forEach(d => {
      if (d) {
        const key = `${r.employeeId}_${d}`;
        if (!userDateSeen.has(key)) {
          usageMap[d] = (usageMap[d] || 0) + 1;
          userDateSeen.add(key);
        }
        
        if (!usersPerDate[d]) usersPerDate[d] = [];
        if (!usersPerDate[d].includes(name)) {
          usersPerDate[d].push(name);
        }
      }
    });
  });

  const popularDates = Object.entries(usageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const getPeriodStatus = () => {
    if (!periodControl) return 'open';
    if (periodControl.isPermanentlyClosed) return 'closed';
    if (periodControl.status === 'closed') return 'closed';
    if (periodControl.status === 'scheduled') {
      const now = new Date();
      if (periodControl.openDate) {
        const openStr = `${periodControl.openDate} ${periodControl.openTime || '08:00'}`;
        try {
          const openDate = parse(openStr, 'yyyy-MM-dd HH:mm', new Date());
          if (isAfter(openDate, now)) return 'not_yet_open';
        } catch (e) {}
      }
      if (periodControl.deadlineDate) {
        const deadlineStr = `${periodControl.deadlineDate} ${periodControl.deadlineTime || '17:00'}`;
        try {
          const deadline = parse(deadlineStr, 'yyyy-MM-dd HH:mm', new Date());
          if (isAfter(now, deadline)) return 'closed';
        } catch (e) {}
      }
    }
    return 'open';
  };

  const periodStatusResult = getPeriodStatus();
  const isClosed = periodStatusResult !== 'open';
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

      <div className="flex flex-wrap items-center justify-between gap-4 glass-panel p-4 rounded-2xl border-white/5 bg-transparent">
        <div>
          <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-1">Divisi: <span className="text-primary">{employee.division || 'Depan'}</span> | Periode Aktif</p>
          <div className="w-full sm:w-[300px] h-12 glass-panel border border-white/10 text-white font-bold flex items-center px-4 rounded-xl bg-transparent overflow-hidden text-ellipsis whitespace-nowrap">
             {selectedPeriod ? periodOptions.find(p => p.value === selectedPeriod)?.label || selectedPeriod : "Tidak ada periode aktif"}
          </div>
          {periodControl && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className={`border-none px-2 py-0 text-[10px] font-bold ${
                periodStatusResult === 'open' ? 'bg-emerald-500/20 text-emerald-400' :
                periodStatusResult === 'not_yet_open' ? 'bg-amber-500/20 text-amber-400' :
                'bg-rose-500/20 text-rose-400'
              }`}>
                {periodStatusResult === 'open' ? 'REQUEST DIBUKA' : 
                 periodStatusResult === 'not_yet_open' ? 'REQUEST BELUM DIBUKA' : 
                 'REQUEST SUDAH DITUTUP'}
              </Badge>
              {periodControl.status === 'scheduled' && (
                <span className="text-[10px] text-white/30 italic">
                  {periodStatusResult === 'not_yet_open' ? `Buka: ${periodControl.openDate} ${periodControl.openTime}` : (periodStatusResult === 'open' ? `Tutup: ${periodControl.deadlineDate} ${periodControl.deadlineTime}` : '')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-4">
            <StatCard label="Total Kuota" value={periodEffectiveQuota} icon={<CalendarIcon className="text-blue-400 w-4 h-4" />} size="sm" />
            <StatCard label="Digunakan" value={usedDays} icon={<BadgeCheck className="text-emerald-400 w-4 h-4" />} size="sm" />
            <StatCard label="Sisa Kuota" value={Math.max(0, periodEffectiveQuota - usedDays)} icon={<Clock className="text-amber-400 w-4 h-4" />} size="sm" />
          </div>
          <p className="text-[9px] text-white/30 italic mr-2 text-right">
            * Maksimal Kuota: {periodControl?.maxAccumulatedLeave || 6} hari (termasuk sisa periode lalu yang terakumulasi otomatis).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-panel border-none shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white text-lg">Input Tanggal Libur Saya</CardTitle>
                <CardDescription className="text-white/40">Isi tanggal libur yang diinginkan (Maks. {periodControl?.maxDaysPerRequest || 6} hari)</CardDescription>
              </div>
              <Dialog open={showAdd} onOpenChange={(val) => {
                setShowAdd(val);
                if (!val && !isPostPopupRef.current && !showMusicPopup) stopMusic();
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
                    {formData.dates.map((d, index) => (
                      <div className="grid gap-1.5" key={index}>
                        <Label className="text-white/70 text-[10px] uppercase font-bold tracking-wider">Libur Ke-{index + 1}</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="date" 
                            value={d} 
                            onChange={(e) => {
                              const newDates = [...formData.dates];
                              newDates[index] = e.target.value;
                              setFormData({...formData, dates: newDates});
                            }} 
                            className="field-input text-xs w-full" 
                          />
                          {d && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                const newDates = [...formData.dates];
                                newDates[index] = "";
                                setFormData({...formData, dates: newDates});
                              }}
                              className="shrink-0 glass-panel border-white/10 text-rose-400 hover:text-rose-300 w-10 h-10"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
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
                      <TableHead className="text-white/40 text-[10px]">Tanggal Libur</TableHead>
                      <TableHead className="text-white/40">Alasan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentRequests.map(r => (
                      <TableRow key={r.id} className={`border-white/5 hover:bg-white/5 ${r.isModifiedByAdmin ? 'bg-amber-500/5' : ''}`}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="border-none bg-emerald-500/20 text-emerald-400 capitalize w-fit">
                              {r.status}
                            </Badge>
                            {r.isModifiedByAdmin && (
                              <Badge className="bg-amber-500 text-black text-[8px] px-1 py-0 font-black h-4 w-fit">
                                DIRUBAH ADMIN
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-white/50 text-xs">{sections.find(s => s.id === r.sectionId)?.name || '-'}</TableCell>
                        <TableCell className="text-emerald-400/80 font-bold text-xs relative group/date">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex flex-wrap gap-x-1">
                              {(() => {
                                const currentDates = (r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6]).filter(Boolean);
                                return currentDates.map((d, i) => {
                                  const isNew = r.isModifiedByAdmin && r.originalDates && !r.originalDates.includes(d);
                                  return (
                                    <span key={i} className={isNew ? "text-amber-400" : ""}>
                                      {d}{i < currentDates.length - 1 ? "," : ""}
                                    </span>
                                  );
                                });
                              })()}
                            </div>
                            {r.isModifiedByAdmin && r.originalDates && (
                              <div className="text-[9px] text-white/30 flex flex-wrap gap-x-1 items-center">
                                <span className="opacity-50">Asli:</span>
                                {r.originalDates.filter(Boolean).map((od, idx) => {
                                  const currentDates = (r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6]).filter(Boolean);
                                  const wasMoved = !currentDates.includes(od);
                                  return (
                                    <span key={idx} className={wasMoved ? "line-through text-rose-500/50" : ""}>
                                      {od}{idx < r.originalDates.filter(Boolean).length - 1 ? "," : ""}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-white/60 text-xs truncate max-w-[100px]" title={r.reason}>{r.reason}</TableCell>
                      </TableRow>
                    ))}
                    {currentRequests.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-white/30 italic">Anda belum mengajukan request libur.</TableCell></TableRow>
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
                      <TableHead className="text-white/40 sticky top-0 bg-secondary/80 backdrop-blur-md">Nama</TableHead>
                      <TableHead className="text-white/40 text-[10px] sticky top-0 bg-secondary/80 backdrop-blur-md">Tanggal Libur</TableHead>
                      <TableHead className="text-white/40 text-[10px] sticky top-0 bg-secondary/80 backdrop-blur-md">Alasan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentAllRequests.filter(r => r.employeeId !== employee.id).map(r => {
                      const emp = employees.find(e => e.id === r.employeeId);
                      const displayName = emp?.nickname || r.employeeName;
                      return (
                        <TableRow key={r.id} className="border-white/5 hover:bg-white/5">
                          <TableCell className="font-medium text-white/80 text-[11px] whitespace-nowrap">{displayName}</TableCell>
                          <TableCell className="text-emerald-400 font-bold text-[10px] whitespace-nowrap">
                            {(r.dates || [r.date1, r.date2, r.date3, r.date4, r.date5, r.date6]).filter(Boolean).map(d => format(new Date(d), 'dd/MM')).join(', ') || '-'}
                          </TableCell>
                          <TableCell className="text-white/50 text-[10px] italic min-w-[80px]">{r.reason || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Quota Calendar - Task 2 */}
          <Card className="glass-panel border-none shadow-xl bg-white/5 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-lg flex items-center gap-3 font-black uppercase tracking-widest">
                <CalendarIcon className="w-6 h-6 text-rose-400" /> Status Kuota Harian
              </CardTitle>
              <CardDescription className="text-xs text-white/40 font-bold">
                Tanggal dengan warna <span className="text-rose-500 font-black italic underline decoration-rose-500/50 underline-offset-4">MERAH</span> menunjukkan kuota sudah penuh ({periodControl?.maxRequestsPerDay || 7} orang).
              </CardDescription>
            </CardHeader>
            <CardContent className="py-8">
              <div className="space-y-6">
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((day, i) => (
                    <div key={i} className="text-center text-[10px] font-black text-white/20 uppercase tracking-widest">{day}</div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-2">
                  {(() => {
                    const period = periodOptions.find(p => p.value === selectedPeriod);
                    if (!period) return null;
                    
                    const daysInRange = eachDayOfInterval({
                      start: startOfDay(period.start),
                      end: endOfDay(period.end)
                    });
                    
                    // Add padding for the first day of the period to align with day of week
                    const firstDayPadding = period.start.getDay() === 0 ? 6 : period.start.getDay() - 1;
                    const padding = Array(firstDayPadding).fill(null);
                    
                    return [...padding, ...daysInRange].map((date, i) => {
                      if (!date) return <div key={`pad-${i}`} className="aspect-square" />;
                      
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const count = usageMap[dateStr] || 0;
                      const maxLimit = periodControl?.maxRequestsPerDay || 7;
                      const isFull = count >= maxLimit;
                      const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
                      const colIndex = i % 7;

                      const tooltipPositionClass = 
                        colIndex < 2 ? 'left-0 -translate-x-2' : 
                        colIndex > 4 ? 'right-0 translate-x-2 left-auto' : 
                        'left-1/2 -translate-x-1/2';

                      const arrowPositionClass = 
                        colIndex < 2 ? 'left-6' : 
                        colIndex > 4 ? 'right-6 left-auto' : 
                        'left-1/2 -translate-x-1/2';
                      
                      return (
                        <div 
                          key={dateStr}
                          onClick={() => {
                            if (isFull || count > 0) {
                              setActiveHoldDate(prev => prev === dateStr ? null : dateStr);
                            }
                          }}
                          className={`
                            aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-300 cursor-pointer
                            ${isFull ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)] scale-105 z-10' : 'bg-white/5 border border-white/5 hover:bg-white/10'}
                            ${isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                            ${activeHoldDate === dateStr ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background z-20' : ''}
                          `}
                        >
                          {activeHoldDate === dateStr && usersPerDate[dateStr] && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.9 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              className={`absolute bottom-full mb-3 z-[100] bg-slate-950/95 backdrop-blur-2xl border border-blue-500/30 p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] min-w-[200px] pointer-events-none ${tooltipPositionClass}`}
                            >
                               <div className={`absolute bottom-[-6px] w-3 h-3 bg-slate-950 border-r border-b border-blue-500/30 rotate-45 ${arrowPositionClass}`} />
                               <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-3 border-b border-white/10 pb-2 flex items-center gap-2">
                                 <Users className="w-3 h-3" /> List Request {format(date, 'd MMM')}
                               </p>
                               <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                 {usersPerDate[dateStr].map(name => (
                                   <div key={name} className="flex items-center gap-2.5 group/item">
                                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60 group-hover/item:bg-blue-400 transition-colors" />
                                     <span className="text-blue-400 text-xs font-black tracking-tight leading-none">{name}</span>
                                   </div>
                                 ))}
                               </div>
                               <div className="mt-4 pt-2 border-t border-white/5 flex justify-between items-center">
                                 <span className="text-[8px] font-black text-white/20 uppercase tracking-tighter">Total Terisi</span>
                                 <span className="text-[10px] font-black text-blue-400">{usersPerDate[dateStr].length} Orang</span>
                               </div>
                            </motion.div>
                          )}

                          <span className={`text-sm font-black ${isFull ? 'text-white' : 'text-white/80'}`}>
                            {format(date, 'd')}
                          </span>
                          <span className={`text-[8px] font-bold ${isFull ? 'text-white/80' : 'text-white/20'}`}>
                            {format(date, 'MMM')}
                          </span>
                          
                          {/* Mini usage indicator */}
                          {!isFull && count > 0 && (
                            <div className="absolute top-1 right-1 flex gap-0.5">
                              {Array.from({ length: count }).map((_, idx) => (
                                <div key={idx} className="w-1 h-1 rounded-full bg-primary/40" />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-6 mt-10 pt-6 border-t border-white/5">
                <div className="flex-1 space-y-4">
                    <h4 className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] border-l-2 border-primary pl-3">Legenda Kalender</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                        <div className="flex items-center gap-3 glass-panel p-3 rounded-2xl bg-rose-500/10 border-rose-500/20">
                            <div className="w-4 h-4 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]" />
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider leading-none">Kuota Penuh</span>
                              <span className="text-[9px] text-rose-400/60 font-bold tracking-tight">Tidak bisa diajukan</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 glass-panel p-3 rounded-2xl bg-white/5 border-white/10">
                            <div className="w-4 h-4 rounded-full bg-white/20" />
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-white/40 uppercase tracking-wider leading-none">Tersedia</span>
                              <span className="text-[9px] text-white/20 font-bold tracking-tight">Silakan ajukan request</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 p-5 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] text-white/70 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 rotate-12 group-hover:scale-175 transition-transform duration-700">
                      <AlertCircle className="w-20 h-20" />
                    </div>
                    <p className="text-[10px] leading-relaxed italic relative z-10">
                        <span className="font-black text-amber-400 not-italic uppercase tracking-widest block mb-1">Penting:</span>
                        Tampilan di atas adalah rentang periode <span className="text-white font-bold">24 s/d 23</span>. Data diperbarui secara realtime sesuai jumlah request yang masuk.
                    </p>
                </div>
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
  const [reportStart, setReportStart] = useState<Date>(new Date());
  const [reportEnd, setReportEnd] = useState<Date>(new Date());
  const [isExporting, setIsExporting] = useState(false);
  const [manualData, setManualData] = useState<Record<string, string>>({});
  
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

  const statusColors: Record<string, string> = {
    L: 'text-white/40 bg-white/5',
    I: 'text-sky-400 bg-sky-500/10',
    S: 'text-amber-400 bg-amber-500/10',
    CT12: 'text-purple-400 bg-purple-500/10',
    CL: 'text-pink-400 bg-pink-500/10',
    A: 'text-rose-400 bg-rose-500/10',
    H: 'text-emerald-400 bg-emerald-500/10'
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const startStr = format(reportStart, 'yyyy-MM-dd');
      const endStr = format(reportEnd, 'yyyy-MM-dd');
      
      const q = query(
        collection(db, 'manualAttendance'),
        where('date', '>=', startStr),
        where('date', '<=', endStr)
      );
      const snap = await getDocs(q);
      const records = snap.docs.map(d => d.data());
      
      const wb = XLSX.utils.book_new();
      
      const exportRows = employees.map(emp => {
        const row: any = { 'Nama': emp.name, 'PIN': emp.pin };
        // We need all dates in the range
        for (let d = new Date(reportStart); d <= reportEnd; d.setDate(d.getDate() + 1)) {
          const dateStr = format(d, 'yyyy-MM-dd');
          const record = records.find(r => r.employeeId === emp.id && r.date === dateStr);
          row[dateStr] = record ? record.status : 'H';
        }
        return row;
      });
      
      const ws = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Manual");
      XLSX.writeFile(wb, `Rekap_Manual_${startStr}_to_${endStr}.xlsx`);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
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
            <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} className="bg-background/80" />
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
                <Input type="date" value={format(reportStart, 'yyyy-MM-dd')} onChange={(e) => setReportStart(new Date(e.target.value))} className="field-input h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/40">SAMPAI TANGGAL</Label>
                <Input type="date" value={format(reportEnd, 'yyyy-MM-dd')} onChange={(e) => setReportEnd(new Date(e.target.value))} className="field-input h-11" />
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


// --- ADMIN: BACKUP ---
function AdminBackup({ employees }: { employees: Employee[] }) {
  const [exportStart, setExportStart] = useState<Date>(new Date());
  const [exportEnd, setExportEnd] = useState<Date>(new Date());
  const [isExporting, setIsExporting] = useState(false);

  const handleBackupExport = async () => {
    setIsExporting(true);
    try {
      await generateBackupZip(exportStart, exportEnd);
    } catch (err) {
       console.error(err);
       alert("Gagal backup.");
    } finally {
       setIsExporting(false);
    }
  };

  return (
    <Card className="bg-slate-900 border-white/10 p-6 text-white shadow-2xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Backup Data All</CardTitle>
        <CardDescription className="text-white/60">Pilih rentang waktu untuk mengunduh seluruh data (Absen, Libur, Kuota).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-white">Start Date</Label>
            <Input type="date" className="field-input" value={format(exportStart, 'yyyy-MM-dd')} onChange={(e) => setExportStart(new Date(e.target.value))} />
          </div>
          <div>
            <Label className="text-white">End Date</Label>
            <Input type="date" className="field-input" value={format(exportEnd, 'yyyy-MM-dd')} onChange={(e) => setExportEnd(new Date(e.target.value))} />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleBackupExport} disabled={isExporting} className="w-full bg-primary hover:bg-primary/80 h-12 font-bold text-lg">
          {isExporting ? "Memproses..." : "Download Backup Zip"}
        </Button>
      </CardFooter>
    </Card>
  );
}

// --- ADMIN: REPORTS ---
function AdminReports({ 
  employees, 
  shifts,
  confirm,
  prompt,
  alert
}: { 
  employees: Employee[], 
  shifts: Shift[],
  confirm: (msg: string, title?: string) => Promise<boolean>,
  prompt: (msg: string, def?: string, title?: string) => Promise<string | null>,
  alert: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
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
    const unsub = onSnapshot(q, (snap) => setAttendances(snap.docs.map(d => ({id: d.id, ...d.data()} as Attendance))), (err) => handleFirestoreError(err, OperationType.LIST, 'attendance_reports'));
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
            <Button onClick={handleExport} disabled={exportLoading} className="bg-primary hover:bg-primary/80">
              <Download className="w-4 h-4 mr-2" /> {exportLoading ? "Memproses..." : "Download Excel"}
            </Button>
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

function LocalInput({ value, type = "text", placeholder, className, onSave }: { value: string | number, type?: string, placeholder?: string, className?: string, onSave: (v: string) => void }) {

  const [val, setVal] = useState(value?.toString() || '');
  
  useEffect(() => {
    setVal(value?.toString() || '');
  }, [value]);

  return (
    <Input 
      type={type}
      value={val}
      placeholder={placeholder}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onSave(val)}
      className={className}
    />
  );
}

function StatCard({ label, value, icon, size = 'default' }: { label: string, value: number, icon: React.ReactNode, size?: 'default' | 'sm' }) {
  if (size === 'sm') {
    return (
      <Card className="glass-panel border-none shadow-sm flex flex-col items-center justify-center p-4 gap-2 bg-transparent">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm border border-white/10">
          {icon}
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-tight">{label}</p>
          <p className="text-xl font-bold text-white tracking-tighter leading-none">{value}</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="glass-panel border-none shadow-xl flex items-center p-6 gap-6 bg-transparent">
      <div className="w-14 h-14 rounded-2xl bg-white/10 shadow-inner flex items-center justify-center text-2xl border border-white/10">
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-1">{label}</p>
        <p className="text-5xl font-extrabold text-white tracking-tighter">{value}</p>
      </div>
    </Card>
  );
}
