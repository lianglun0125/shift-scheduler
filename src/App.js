import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, ChevronLeft, ChevronRight, User, Users, 
  Settings, Save, Clock, CheckCircle, XCircle, 
  Briefcase, Coffee, Sun, Moon, Trash2, 
  Plus, Shield, UserCheck, AlertCircle, X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, onSnapshot, 
  deleteDoc, writeBatch, serverTimestamp, addDoc 
} from 'firebase/firestore';


// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'shift-scheduler-12yun';


// --- Time Helpers for Shifts (分鐘制) ---
const parseTimeToMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const formatMinutes = (mins) => {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
};


// --- Constants & Utilities ---
const SHIFT_TYPES = {
  MORNING: { 
    id: 'M', 
    label: '早班', 
    icon: Sun, 
    color: 'bg-[#E6B422] text-white', 
    start: parseTimeToMinutes('10:00'),  // 10:00
    end:   parseTimeToMinutes('14:00'),  // 14:00
  }, 
  EVENING: { 
    id: 'E', 
    label: '晚班', 
    icon: Moon, 
    color: 'bg-[#2B3252] text-white', 
    start: parseTimeToMinutes('17:30'),  // 17:30
    end:   parseTimeToMinutes('21:30'),  // 21:30
  }, 
  OFF: { id: 'O', label: '休假', icon: Coffee, color: 'bg-[#A5A5A5] text-white', start: null, end: null }, 
};


const COLORS = [
  { id: 'c1', bg: 'bg-[#D7C4BB]', text: 'text-[#4A3B32]', name: '赤朽葉' },
  { id: 'c2', bg: 'bg-[#899A8B]', text: 'text-[#1F2621]', name: '柳鼠' },
  { id: 'c3', bg: 'bg-[#90B4CE]', text: 'text-[#233B4D]', name: '勿忘草' },
  { id: 'c4', bg: 'bg-[#D9A3A3]', text: 'text-[#4D2A2A]', name: '灰櫻' },
  { id: 'c5', bg: 'bg-[#B5CAA0]', text: 'text-[#35422A]', name: '裏柳' },
  { id: 'c6', bg: 'bg-[#E0BBE4]', text: 'text-[#4A2A4A]', name: '藤色' },
  { id: 'c7', bg: 'bg-[#FFDFD3]', text: 'text-[#5C4033]', name: '香色' },
];

// 員工填報用的時間段選擇
const AVAILABILITY_SLOTS = [
  { id: 'morning', label: '10:00-14:00 (早班)', start: 10, end: 14 },
  { id: 'evening', label: '17:30-21:30 (晚班)', start: 17.5, end: 21.5 },
];

// 班別 -> 填報 slot 對應
const SHIFT_TO_SLOT = {
  M: 'morning',
  E: 'evening',
};

// 隨機選擇函式
const randomSelect = (arr, count) => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

const formatDate = (year, month, day) => {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
};


// --- Mock Initial Data for First Run ---
const INITIAL_USERS = [
  { id: 'u1', name: '田中', colorIdx: 0, role: 'user' },
  { id: 'u2', name: '佐藤', colorIdx: 1, role: 'user' },
  { id: 'u3', name: '鈴木', colorIdx: 2, role: 'user' },
  { id: 'admin', name: '店長', colorIdx: 4, role: 'admin' },
];


// --- Components ---
const RoleSwitcher = ({ currentUser, users, onLoginClick }) => (
  <div className="flex overflow-x-auto gap-2 p-4 bg-[#F4F4F0] border-b border-[#E0E0D8] no-scrollbar">
    <div className="flex-shrink-0 text-xs font-bold text-stone-400 uppercase tracking-widest self-center mr-2">
      你是誰？
    </div>
    {users.map(u => {
      const isActive = currentUser?.id === u.id;
      return (
        <button
          key={u.id}
          onClick={() => onLoginClick(u)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs sm:text-sm transition-all whitespace-nowrap
            ${isActive 
              ? 'bg-stone-800 text-white shadow-md' 
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'}`}
        >
          {u.role === 'admin' ? <Shield size={12} /> : <User size={12} />}
          <div className="flex flex-col leading-tight text-left">
            <span>{u.name}</span>
            <span className="text-[9px] text-stone-400">{isActive ? '已登入' : '點此登入'}</span>
          </div>
        </button>
      );
    })}
  </div>
);


export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Data State
  const [users, setUsers] = useState([]);
  const [shifts, setShifts] = useState({});
  const [availability, setAvailability] = useState({}); 
  const [settings, setSettings] = useState({
    openStart: '2023-01-01T00:00',
    openEnd: '2030-12-31T23:59',
  });

  // UI State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [selectedShiftType, setSelectedShiftType] = useState('M');
  const [selectedUserForAssign, setSelectedUserForAssign] = useState(null);
  const [showUserManageModal, setShowUserManageModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  
  // New State for Availability Modal
  const [selectedAvailSlots, setSelectedAvailSlots] = useState([]);
  const [availabilityMode, setAvailabilityMode] = useState('normal'); // 'normal', 'full_available', 'full_unavailable'

  // Login / PIN state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginTargetUser, setLoginTargetUser] = useState(null);
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isChangingDefaultPin, setIsChangingDefaultPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');


  // --- Initialization ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth failed:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return unsubscribe;
  }, []);


  // --- Data Sync ---
  useEffect(() => {
  if (!authUser) return;
  
  const unsubUsers = onSnapshot(
    collection(db, 'users'), 
    (snap) => {
      const loadedUsers = [];
      snap.forEach(docSnap => loadedUsers.push({ id: docSnap.id, ...docSnap.data() }));
      if (loadedUsers.length === 0) {
        INITIAL_USERS.forEach(u => setDoc(doc(db, 'users', u.id), u));
      } else {
        setUsers(loadedUsers);
      }
    }
  );
  
  const unsubSettings = onSnapshot(
    doc(db, 'settings', 'config'),
    (docSnap) => {
      if (docSnap.exists()) setSettings(docSnap.data());
    }
  );
  
  return () => {
    unsubUsers();
    unsubSettings();
  };
}, [authUser]);


  // --- Logic Helpers ---
  const isAvailabilityOpen = () => {
    const now = new Date().toISOString();
    return now >= settings.openStart && now <= settings.openEnd;
  };

  const handleMonthChange = (delta) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
    setSelectedDay(null);
  };

  const getUserColor = (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return COLORS[0];
    return COLORS[user.colorIdx % COLORS.length];
  };

  // --- Admin Actions: Shifts ---
  const assignShift = async (dateStr, userId, typeId) => {
    if (!authUser) return;

    const dayShifts = shifts[dateStr] || [];
    const userShifts = dayShifts.filter(s => s.userId === userId);

    // 讀取員工當天的填報狀態
    const availKey = `${dateStr}_${userId}`;
    const availData = availability[availKey];
    const isFullUnavailable = availData?.mode === 'full_unavailable';
    const isNormalAvail = availData?.mode === 'normal';
    const allowedSlots = availData?.slots || [];
    const shiftSlotId = SHIFT_TO_SLOT[typeId];
    
    // ===== 邏輯 1: 排休假時，先刪除所有非OFF的班次 =====
    if (typeId === 'O') {
      try {
        const batch = writeBatch(db);
        const hasOffDay = userShifts.some(s => s.type === 'O');
        
        // 如果已經有休假了，點擊時應該刪除休假（toggle）
        if (hasOffDay) {
          const offShift = userShifts.find(s => s.type === 'O');
          batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', offShift.id));
        } else {
          // 沒有休假時，先刪除所有其他班別（早班、晚班），再新增休假
          userShifts.forEach(shift => {
            if (shift.type !== 'O') {
              batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', shift.id));
            }
          });
          
          // 新增休假
          const shiftId = `${dateStr}_${userId}_O`;
          const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', shiftId);
          batch.set(shiftRef, {
            date: dateStr,
            userId,
            type: 'O',
            startTime: null,
            endTime: null,
            updatedAt: serverTimestamp()
          });
        }
        
        await batch.commit();
      } catch (e) {
        console.error("Assign OFF shift error:", e);
      }
      return;
    }

    // ===== 邏輯 2: 排班（早班/晚班）時，檢查休假、可排時段、以及人數上限 =====
    const hasOffDay = userShifts.some(s => s.type === 'O');
    if (hasOffDay) {
      alert('該員工已排休假，無法再排班');
      return;
    }

    if (isFullUnavailable) {
      alert('該員工在此日為「全天不可排」，無法排班');
      return;
    }

    if (isNormalAvail && shiftSlotId && !allowedSlots.includes(shiftSlotId)) {
      alert('該員工在此日未勾選這個時段可排，無法排班');
      return;
    }

    // 判斷是否已經有同一班別（用來做 toggle）
    const existingShift = userShifts.find(s => s.type === typeId);

    const shiftId = `${dateStr}_${userId}_${typeId}`;
    const shiftRef = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', shiftId);
    
    const sType = Object.values(SHIFT_TYPES).find(t => t.id === typeId);
    const start = sType ? sType.start : null;
    const end = sType ? sType.end : null;

    try {
      if (typeId === 'DELETE') {
        // 刪除所有同日期、同員工的班次
        const batch = writeBatch(db);
        userShifts.forEach(shift => {
          batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', shift.id));
        });
        await batch.commit();
      } else {
        // 檢查是否已有相同班別，有的話就刪除（toggle），沒有就新增
        if (existingShift) {
          // 刪除這個班別
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', existingShift.id));
        } else {
          // 新增這個班別
          await setDoc(shiftRef, {
            date: dateStr,
            userId,
            type: typeId,
            startTime: start,
            endTime: end,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (e) {
      console.error("Assign shift error:", e);
    }
  };


  const batchFill = async () => {
    try {
      const batch = writeBatch(db);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const days = getDaysInMonth(year, month);
      
      const mType = SHIFT_TYPES.MORNING;
      const eType = SHIFT_TYPES.EVENING;

      for (let d = 1; d <= days; d++) {
        const dateStr = formatDate(year, month, d);
        const dayShifts = shifts[dateStr] || [];

        // 統計當天可排的員工清單（無班、無休假、無全天不可排、勾選該班別時段）
        const eligibleForMorning = [];
        const eligibleForEvening = [];

        users
          .filter(u => u.role !== 'admin')
          .forEach(user => {
            const userShifts = dayShifts.filter(s => s.userId === user.id);
            const hasAnyShift = userShifts.length > 0;
            const hasOffShift = userShifts.some(s => s.type === 'O');

            const availKey = `${dateStr}_${user.id}`;
            const availData = availability[availKey];
            const isFullUnavailable = availData?.mode === 'full_unavailable';
            const isNormalAvail = availData?.mode === 'normal';
            const allowedSlots = availData?.slots || [];

            // 都有班或都有休假 → 跳過
            if (hasAnyShift || hasOffShift || isFullUnavailable) {
              return;
            }

            // 檢查是否能排早班
            if (!isNormalAvail || allowedSlots.includes('morning')) {
              eligibleForMorning.push(user);
            }

            // 檢查是否能排晚班
            if (!isNormalAvail || allowedSlots.includes('evening')) {
              eligibleForEvening.push(user);
            }
          });

        // 當天早班已排人數
        const morningCount = dayShifts.filter(s => s.type === 'M').length;
        // 當天晚班已排人數
        const eveningCount = dayShifts.filter(s => s.type === 'E').length;

        // 隨機選擇早班（最多補到 2 人，條件是人數 > 需求時隨機選）
        if (morningCount < 2 && eligibleForMorning.length > 0) {
          const needMorning = 2 - morningCount;
          // 若可排人數超過需求，隨機選擇；否則全選
          const selectedMorning = eligibleForMorning.length > needMorning 
            ? randomSelect(eligibleForMorning, needMorning)
            : eligibleForMorning;
          
          selectedMorning.forEach(user => {
            const refId = `${dateStr}_${user.id}_M`;
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', refId);
            batch.set(ref, {
              date: dateStr,
              userId: user.id,
              type: 'M',
              startTime: mType.start,
              endTime: mType.end,
              updatedAt: serverTimestamp()
            });
          });
        }

        // 隨機選擇晚班（最多補到 2 人，條件是人數 > 需求時隨機選）
        if (eveningCount < 2 && eligibleForEvening.length > 0) {
          const needEvening = 2 - eveningCount;
          // 若可排人數超過需求，隨機選擇；否則全選
          const selectedEvening = eligibleForEvening.length > needEvening 
            ? randomSelect(eligibleForEvening, needEvening)
            : eligibleForEvening;
          
          selectedEvening.forEach(user => {
            const refId = `${dateStr}_${user.id}_E`;
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', refId);
            batch.set(ref, {
              date: dateStr,
              userId: user.id,
              type: 'E',
              startTime: eType.start,
              endTime: eType.end,
              updatedAt: serverTimestamp()
            });
          });
        }
      }
      await batch.commit();
    } catch (e) {
      console.error("Batch fill error:", e);
    }
  };
  
  const clearMonth = async () => {
    console.log('clearMonth clicked');
    if (!window.confirm('確定要清空本月所有班表嗎？此動作無法復原。')) return;
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const batch = writeBatch(db);
      let deleteCount = 0;

      const allShifts = Object.values(shifts).flat();
      console.log('shifts when clearing', allShifts);

      allShifts.forEach(shift => {
        const sDate = new Date(shift.date);
        if (sDate.getFullYear() === year && sDate.getMonth() === month) {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'shifts', shift.id);
          batch.delete(ref);
          deleteCount++;
        }
      });

      if (deleteCount > 0) {
        await batch.commit()
          .then(() => {
            console.log(`Deleted ${deleteCount} shifts`);
          })
          .catch(e => {
            console.error('Batch commit failed', e);
            alert('清空失敗（批次寫入錯誤），請稍後再試');
          });
      } else {
        alert("本月沒有班表可清空");
      }
    } catch (e) {
      console.error("Clear month error:", e);
      alert("清空失敗，請稍後再試");
    }
  };


  // --- Admin Actions: User Management ---
  const addUser = async () => {
    if (!newUserName.trim()) return;
    try {
      const colorIdx = Math.floor(Math.random() * COLORS.length);
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), {
        name: newUserName.trim(),
        role: 'user',
        colorIdx,
        createdAt: serverTimestamp()
      });
      setNewUserName('');
    } catch (e) {
      console.error("Add user error:", e);
    }
  };

  const deleteUser = async (userId) => {
    console.log('deleteUser clicked', userId);
    if (!window.confirm('確定要刪除此員工嗎？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userId));
      console.log('User deleted', userId);
    } catch (e) {
      console.error("Delete user error:", e);
      alert('刪除失敗，請稍後再試');
    }
  };


  // --- User Actions: Availability ---
  const openAvailabilityModal = (dateStr) => {
    setSelectedDay(dateStr);
    const id = `${dateStr}_${currentUser.id}`;
    const availData = availability[id];
    
    if (!availData) {
      setAvailabilityMode('normal');
      setSelectedAvailSlots([]);
    } else {
      // 判斷是全天可排、全天不可排、或正常選擇
      if (availData.mode === 'full_available') {
        setAvailabilityMode('full_available');
        setSelectedAvailSlots([]);
      } else if (availData.mode === 'full_unavailable') {
        setAvailabilityMode('full_unavailable');
        setSelectedAvailSlots([]);
      } else {
        setAvailabilityMode('normal');
        setSelectedAvailSlots(availData.slots || []);
      }
    }
  };

  const saveAvailability = async () => {
    if (!authUser || !currentUser || !selectedDay) return;
    const id = `${selectedDay}_${currentUser.id}`;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'availability', id);
    
    try {
      const dataToSave = {
        date: selectedDay,
        userId: currentUser.id,
        mode: availabilityMode,
        slots: selectedAvailSlots,
        updatedAt: serverTimestamp()
      };
      
      await setDoc(ref, dataToSave);
      setSelectedDay(null);
    } catch (e) {
      console.error("Save availability error:", e);
    }
  };

  const toggleAvailSlot = (slotId) => {
    if (selectedAvailSlots.includes(slotId)) {
      setSelectedAvailSlots(selectedAvailSlots.filter(s => s !== slotId));
    } else {
      setSelectedAvailSlots([...selectedAvailSlots, slotId]);
    }
  };

  const updateSettings = async (newSettings) => {
    try {
      await setDoc(
        doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), 
        newSettings
      );
    } catch (e) {
      console.error("Update settings error:", e);
    }
  };

  const openLoginModal = (user) => {
    setLoginTargetUser(user);
    setShowLoginModal(true);
    setLoginPin('');
    setLoginError('');
    setIsChangingDefaultPin(false);
    setNewPin('');
    setNewPinConfirm('');
  };

  const handleLoginSubmit = () => {
    if (!loginTargetUser) return;
    if (loginPin.length !== 6) {
      setLoginError('請輸入 6 位數字 PIN');
      return;
    }
    const storedPin = loginTargetUser.pin || '000000';
    if (loginPin !== storedPin) {
      setLoginError('PIN 錯誤');
      return;
    }
    if (storedPin === '000000') {
      // 使用預設 PIN，強制進入修改 PIN 步驟
      setIsChangingDefaultPin(true);
      setLoginError('');
    } else {
      // 一般登入完成
      setCurrentUser(loginTargetUser);
      setShowLoginModal(false);
    }
  };

  const handleChangePinSubmit = async () => {
    if (!loginTargetUser) return;
    if (newPin.length !== 6) {
      setLoginError('新 PIN 需為 6 位數字');
      return;
    }
    if (newPin !== newPinConfirm) {
      setLoginError('兩次輸入的 PIN 不一致');
      return;
    }
    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', loginTargetUser.id);
      await setDoc(userRef, { pin: newPin }, { merge: true });
      setCurrentUser({ ...loginTargetUser, pin: newPin });
      setShowLoginModal(false);
    } catch (e) {
      console.error('Update PIN error:', e);
      setLoginError('更新 PIN 失敗，請稍後再試');
    }
  };

  const handleLogout = (user) => {
    if (window.confirm(`確定要登出 ${user.name} 嗎？`)) {
      setCurrentUser(null);
    }
  };

  // 計算本月每位員工工時統計
  const monthStats = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const map = {};

    Object.values(shifts).forEach(dayList => {
      dayList.forEach(shift => {
        const sDate = new Date(shift.date);
        if (sDate.getFullYear() !== year || sDate.getMonth() !== month) return;

        const user = users.find(u => u.id === shift.userId);
        if (!user || user.role === 'admin') return;

        if (!map[user.id]) {
          map[user.id] = { userId: user.id, name: user.name, minutes: 0 };
        }

        // 休假或沒有時間的班不計入時數
        if (shift.type === 'O' || shift.startTime == null || shift.endTime == null) return;

        const diff = shift.endTime - shift.startTime;
        if (!Number.isFinite(diff) || diff <= 0) return;

        map[user.id].minutes += diff;
      });
    });

    return Object.values(map)
      .map(stat => ({
        ...stat,
        hours: Math.round((stat.minutes / 60) * 10) / 10,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }, [shifts, users, currentDate]);


  // --- Render Helpers ---
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`pad-${i}`} className="h-24 bg-transparent" />);
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDate(year, month, d);
      const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
      let dayShifts = shifts[dateStr] || [];

      // 按員工、班別排序
      dayShifts.sort((a, b) => {
        if (a.userId !== b.userId) return a.userId.localeCompare(b.userId);
        return (a.startTime ?? 0) - (b.startTime ?? 0);
      });

      const myAvailKey = currentUser ? `${dateStr}_${currentUser.id}` : '';
      const myAvailData = availability[myAvailKey];
      
      let bgClass = "bg-white";
      let statusIcon = null;

      // 顯示員工可排狀態
      if (currentUser?.role === 'user' && activeTab === 'availability') {
        if (myAvailData?.mode === 'full_available') {
          bgClass = "bg-emerald-50";
          statusIcon = <CheckCircle size={14} className="text-emerald-400" />;
        } else if (myAvailData?.mode === 'full_unavailable') {
          bgClass = "bg-rose-50";
          statusIcon = <XCircle size={14} className="text-rose-400" />;
        } else if (myAvailData?.slots?.length > 0) {
          bgClass = "bg-amber-50";
          statusIcon = <AlertCircle size={14} className="text-amber-400" />;
        }
      }

      const handleDayClick = () => {
        if (currentUser?.role === 'admin' && activeTab === 'admin') {
          if (selectedUserForAssign && selectedShiftType) {
            // 如果選的是「休假」，直接排休假
            if (selectedShiftType === 'O') {
              assignShift(dateStr, selectedUserForAssign, 'O');
            } else {
              // 如果要排班（早班/晚班），檢查是否已有該班次
              assignShift(dateStr, selectedUserForAssign, selectedShiftType);
            }
          }
        } else if (currentUser?.role === 'user' && activeTab === 'availability') {
          openAvailabilityModal(dateStr);
        }
      };

      days.push(
        <div 
          key={d} 
          onClick={handleDayClick}
          className={`min-h-[5rem] sm:min-h-[6rem] border border-stone-100 p-1 relative transition-all duration-200
            ${bgClass}
            ${isToday ? 'ring-2 ring-indigo-200 z-10' : ''}
            ${currentUser?.role === 'admin' && activeTab === 'admin' && selectedUserForAssign ? 'cursor-pointer hover:bg-stone-50 active:scale-95' : ''}
          `}
        >
          <div className="flex justify-between items-start mb-1">
            <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full 
              ${isToday ? 'bg-indigo-600 text-white' : 'text-stone-400'}`}>
              {d}
            </span>
            {statusIcon && <div className="flex gap-1">{statusIcon}</div>}
          </div>
          
          <div className="flex flex-col gap-1 overflow-hidden">
            {dayShifts.map((shift, idx) => {
              const u = users.find(u => u.id === shift.userId);
              if (!u) return null;
              const uColor = getUserColor(u.id);
              const timeLabel = (shift.startTime != null && shift.endTime != null) 
                ? `${formatMinutes(shift.startTime)}-${formatMinutes(shift.endTime)}`
                : '';
              
              // 如果是休假，特別顯示
              if (shift.type === 'O') {
                return (
                  <div 
                    key={`${shift.userId}_${idx}`}
                    className={`
                      text-[10px] px-1.5 py-0.5 rounded-sm truncate flex items-center gap-1 shadow-sm
                      ${uColor.bg} ${uColor.text} opacity-60 italic
                    `}
                  >
                    <span>{u.name}</span>
                    <span className="text-[9px]">休假</span>
                  </div>
                );
              }
              
              return (
                <div 
                  key={`${shift.userId}_${idx}`}
                  className={`
                    text-[10px] px-1.5 py-0.5 rounded-sm truncate flex items-center gap-1 shadow-sm
                    ${uColor.bg} ${uColor.text}
                  `}
                >
                  <span className="font-semibold">{u.name}</span>
                  <span className="font-bold">{timeLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    
    return days;
  };


  if (!authUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#FDFCF8] text-stone-400">
        Loading App...
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-[#FDFCF8] font-sans text-stone-800 pb-20">
      
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#FDFCF8]/90 backdrop-blur-sm border-b border-stone-100 shadow-sm">
        <RoleSwitcher 
          currentUser={currentUser} 
          users={users} 
          onLoginClick={(user) => {
            if (currentUser?.id === user.id) {
              handleLogout(user);
            } else {
              openLoginModal(user);
            }
          }} 
        />
        
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleMonthChange(-1)} 
              className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-xl font-bold tracking-tight text-stone-800">
              {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
            </h1>
            <button 
              onClick={() => handleMonthChange(1)} 
              className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          
          <div className="text-xs font-medium text-stone-400 bg-stone-100 px-3 py-1 rounded-full">
            {currentUser?.role === 'admin' ? '嗨，莊老闆' : `嗨，${currentUser?.name}`}
          </div>
        </div>
      </header>


      {/* Admin Toolbar */}
      {currentUser?.role === 'admin' && activeTab === 'admin' && (
        <div className="bg-white border-b border-stone-200 p-4 shadow-sm animate-in slide-in-from-top-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-stone-500">快速排班</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowUserManageModal(true)} 
                  className="text-xs bg-stone-100 text-stone-600 px-3 py-1.5 rounded hover:bg-stone-200 flex items-center gap-1"
                >
                  <Users size={14}/> 人員管理
                </button>
                <button 
                  onClick={batchFill} 
                  className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-100 flex items-center gap-1"
                >
                  <UserCheck size={14}/> 智能填滿
                </button>
                <button 
                  onClick={clearMonth} 
                  className="text-xs bg-rose-50 text-rose-600 px-3 py-1.5 rounded hover:bg-rose-100 flex items-center gap-1"
                >
                  <Trash2 size={14}/> 清空本月
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {Object.values(SHIFT_TYPES).map(t => (
                <button 
                  key={t.id}
                  onClick={() => setSelectedShiftType(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${selectedShiftType === t.id 
                      ? `${t.color} ring-2 ring-offset-2 ring-stone-300` 
                      : 'bg-stone-50 text-stone-500'}`}
                >
                  <t.icon size={16} />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
              {users.filter(u => u.role !== 'admin').map(u => {
                const uColor = getUserColor(u.id);
                const isSel = selectedUserForAssign === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserForAssign(isSel ? null : u.id)}
                    className={`
                      flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all
                      ${uColor.bg} ${uColor.text}
                      ${isSel ? 'ring-2 ring-stone-800 ring-offset-2 scale-110' : 'opacity-70 grayscale hover:grayscale-0'}
                    `}
                  >
                    {u.name[0]}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-stone-400 text-center">
              {selectedUserForAssign 
                ? `點擊下方月曆格子為 ${users.find(u=>u.id===selectedUserForAssign)?.name ?? ''} 排班` 
                : '請先選擇上方人員'}
            </p>
          </div>
        </div>
      )}


      {/* User Availability Toolbar */}
      {currentUser?.role === 'user' && activeTab === 'availability' && (
        <div className="bg-white border-b border-stone-200 p-4 shadow-sm animate-in slide-in-from-top-2">
          {!isAvailabilityOpen() ? (
            <div className="bg-orange-50 text-orange-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <Clock size={16} />
              目前非填報開放時間
            </div>
          ) : (
            <>
              <div className="text-sm font-bold text-stone-600 mb-2">排班意願填報</div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <CheckCircle className="text-emerald-400" size={14} /> 全天可排
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <AlertCircle className="text-amber-400" size={14} /> 部分時間
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <XCircle className="text-rose-400" size={14} /> 全天不可排
                </div>
              </div>
            </>
          )}
        </div>
      )}
      
      {/* Monthly Stats Bar */}
      {activeTab === 'calendar' && monthStats.length > 0 && (
        <section className="px-4 sm:px-4 max-w-4xl mx-auto mt-3 mb-1">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {monthStats.map(stat => {
              const uColor = getUserColor(stat.userId);
              return (
                <div
                  key={stat.userId}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-stone-200 shadow-sm text-[11px] text-stone-600 whitespace-nowrap"
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${uColor.bg.replace(' text', '')}`}></span>
                  <span className="font-medium">{stat.name}</span>
                  <span className="text-[10px] text-stone-400">{stat.hours} 小時</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Calendar Grid */}
      <main className="p-2 sm:p-4 max-w-4xl mx-auto">
        <div className="relative">
          <div className={`grid grid-cols-7 gap-px bg-stone-200 border border-stone-200 rounded-xl overflow-hidden shadow-sm
            ${!currentUser ? 'filter blur-sm pointer-events-none select-none' : ''}`}>
            {['日', '一', '二', '三', '四', '五', '六'].map(d => (
              <div key={d} className="bg-[#F8F8F6] py-2 text-center text-xs font-bold text-stone-500">
                {d}
              </div>
            ))}
            {renderCalendar()}
          </div>

          {!currentUser && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white/85 backdrop-blur-md px-4 py-3 rounded-xl border border-stone-200 shadow-sm text-center">
                <p className="text-xs text-stone-500 mb-1">登入後才能查看班表與填報</p>
                <p className="text-[10px] text-stone-400">請從上方選擇您的姓名並輸入 6 位數 PIN</p>
              </div>
            </div>
          )}
        </div>
      </main>


      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`flex flex-col items-center gap-1 w-full h-full justify-center ${activeTab === 'calendar' ? 'text-indigo-600' : 'text-stone-400'}`}
          >
            <Calendar size={20} strokeWidth={activeTab === 'calendar' ? 2.5 : 2}/>
            <span className="text-[10px] font-medium">總表</span>
          </button>

          {currentUser?.role === 'user' && (
            <button 
              onClick={() => setActiveTab('availability')}
              className={`flex flex-col items-center gap-1 w-full h-full justify-center ${activeTab === 'availability' ? 'text-emerald-600' : 'text-stone-400'}`}
            >
              <Clock size={20} strokeWidth={activeTab === 'availability' ? 2.5 : 2}/>
              <span className="text-[10px] font-medium">填報</span>
            </button>
          )}

          {currentUser?.role === 'admin' && (
            <button 
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center gap-1 w-full h-full justify-center ${activeTab === 'admin' ? 'text-stone-800' : 'text-stone-400'}`}
            >
              <Briefcase size={20} strokeWidth={activeTab === 'admin' ? 2.5 : 2}/>
              <span className="text-[10px] font-medium">排班</span>
            </button>
          )}
          
          {currentUser?.role === 'admin' && (
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex flex-col items-center gap-1 w-full h-full justify-center ${activeTab === 'settings' ? 'text-stone-800' : 'text-stone-400'}`}
            >
              <Settings size={20} strokeWidth={activeTab === 'settings' ? 2.5 : 2}/>
              <span className="text-[10px] font-medium">設定</span>
            </button>
          )}
        </div>
      </nav>
      
      {/* Settings Modal */}
      {activeTab === 'settings' && currentUser?.role === 'admin' && (
        <div className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
              <Settings size={20} /> 填報時間設定
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase mb-1">開始時間</label>
                <input 
                  type="datetime-local" 
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2 text-sm"
                  value={settings.openStart}
                  onChange={(e) => setSettings({...settings, openStart: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase mb-1">結束時間</label>
                <input 
                  type="datetime-local" 
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2 text-sm"
                  value={settings.openEnd}
                  onChange={(e) => setSettings({...settings, openEnd: e.target.value})}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setActiveTab('calendar')} 
                className="flex-1 py-2 rounded-lg border border-stone-200 text-stone-500"
              >
                取消
              </button>
              <button 
                onClick={() => { updateSettings(settings); setActiveTab('calendar'); }} 
                className="flex-1 py-2 rounded-lg bg-stone-800 text-white"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* User Management Modal */}
      {showUserManageModal && (
        <div className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <Users size={20} /> 人員管理
              </h2>
              <button 
                onClick={() => setShowUserManageModal(false)} 
                className="text-stone-400 hover:text-stone-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                placeholder="輸入新員工姓名"
                className="flex-1 bg-stone-50 border border-stone-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
              <button 
                onClick={addUser}
                disabled={!newUserName.trim()}
                className="bg-stone-800 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-stone-900 disabled:opacity-50"
              >
                <Plus size={16} /> 新增
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {users.filter(u => u.role !== 'admin').map(u => (
                <div 
                  key={u.id} 
                  className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border border-stone-100"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${getUserColor(u.id).bg} ${getUserColor(u.id).text}`}>
                      {u.name[0]}
                    </div>
                    <span className="text-sm font-medium text-stone-700">{u.name}</span>
                  </div>
                  <button 
                    onClick={() => deleteUser(u.id)}
                    className="text-stone-400 hover:text-rose-500 p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Availability Modal (New: 10AM-2PM / 5:30PM-9:30PM) */}
      {selectedDay && activeTab === 'availability' && currentUser?.role === 'user' && isAvailabilityOpen() && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-stone-900/10 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl border border-stone-100 p-5 animate-in slide-in-from-bottom-10">
            <div className="text-center mb-4">
              <h3 className="text-lg font-bold text-stone-800">{selectedDay}</h3>
              <p className="text-xs text-stone-400">請選擇您能排班的時段</p>
            </div>
            
            {/* Mode Selection */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={() => setAvailabilityMode('full_available')}
                className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                  availabilityMode === 'full_available'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                <CheckCircle size={12} className="mx-auto mb-1" />
                全天可排
              </button>
              <button
                onClick={() => setAvailabilityMode('normal')}
                className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                  availabilityMode === 'normal'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                <AlertCircle size={12} className="mx-auto mb-1" />
                部分時間
              </button>
              <button
                onClick={() => setAvailabilityMode('full_unavailable')}
                className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                  availabilityMode === 'full_unavailable'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                <XCircle size={12} className="mx-auto mb-1" />
                全天不可排
              </button>
            </div>

            {/* Time Slot Selection */}
            {availabilityMode === 'normal' && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold text-stone-600">選擇可排的時段</p>
                {AVAILABILITY_SLOTS.map(slot => (
                  <button
                    key={slot.id}
                    onClick={() => toggleAvailSlot(slot.id)}
                    className={`
                      w-full py-2 px-3 rounded-lg text-sm font-medium transition-all text-left
                      ${selectedAvailSlots.includes(slot.id)
                        ? 'bg-indigo-500 text-white shadow-md'
                        : 'bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100'}
                    `}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => setSelectedDay(null)}
                className="flex-1 py-3 text-sm font-medium text-stone-500 bg-stone-50 rounded-lg hover:bg-stone-100"
              >
                清空
              </button>
              <button 
                onClick={saveAvailability}
                className="flex-1 py-3 text-sm font-medium text-white bg-stone-800 rounded-lg shadow-lg hover:bg-stone-900 flex items-center justify-center gap-2"
              >
                <Save size={16} />
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login / PIN Modal */}
      {showLoginModal && loginTargetUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-stone-900/15 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-stone-100 p-5 animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-[11px] text-stone-400 tracking-[0.2em] mb-1">登入</p>
                <h3 className="text-lg font-bold text-stone-800">{loginTargetUser.name}</h3>
              </div>
              <button 
                onClick={() => setShowLoginModal(false)}
                className="text-stone-300 hover:text-stone-500"
              >
                <X size={18} />
              </button>
            </div>

            {!isChangingDefaultPin ? (
              <>
                <p className="text-xs text-stone-500 mb-3">
                  請輸入 6 位數 PIN 碼以驗證身份
                </p>
                <div className="flex justify-center mb-3">
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={loginPin}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setLoginPin(v);
                      setLoginError('');
                    }}
                    className="tracking-[0.6em] text-center text-lg font-mono px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800"
                    placeholder="••••••"
                  />
                </div>
                <p className="text-[10px] text-stone-400 mb-4 text-center">
                  首次登入或尚未設定 PIN 時，預設為 000000
                </p>
                {loginError && (
                  <p className="text-[11px] text-rose-500 mb-3 text-center">{loginError}</p>
                )}
                <button
                  onClick={handleLoginSubmit}
                  className="w-full py-2.5 text-sm font-medium text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors"
                >
                  確認登入
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-stone-500 mb-3">
                  目前使用預設 PIN 000000，請先設定新的 6 位數 PIN。
                </p>
                <div className="space-y-2 mb-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setNewPin(v);
                      setLoginError('');
                    }}
                    className="w-full text-center tracking-[0.6em] text-lg font-mono px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800"
                    placeholder="新 PIN"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={newPinConfirm}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setNewPinConfirm(v);
                      setLoginError('');
                    }}
                    className="w-full text-center tracking-[0.6em] text-lg font-mono px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800"
                    placeholder="再輸入一次"
                  />
                </div>
                {loginError && (
                  <p className="text-[11px] text-rose-500 mb-3 text-center">{loginError}</p>
                )}
                <button
                  onClick={handleChangePinSubmit}
                  className="w-full py-2.5 text-sm font-medium text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors"
                >
                  儲存新 PIN 並登入
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}