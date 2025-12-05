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
  // eslint-disable-next-line no-unused-vars
  const [shifts, setShifts] = useState({});
  // eslint-disable-next-line no-unused-vars
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

  // Firebase Login
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user);
      } else {
        signInAnonymously(auth).catch(e => console.error('Anonymous login failed:', e));
      }
    });
    return () => unsubAuth();
  }, []);

  // Load Users from Firestore
  useEffect(() => {
    if (!authUser) return;
    
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const loadedUsers = [];
        snap.forEach(docSnap => loadedUsers.push({ id: docSnap.id, ...docSnap.data() }));
        
        if (loadedUsers.length === 0) {
          INITIAL_USERS.forEach(u => 
            setDoc(doc(db, 'users', u.id), u)
          );
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

  // Load Shifts from Firestore
  useEffect(() => {
    if (!authUser) return;
    
    const unsubShifts = onSnapshot(
      collection(db, 'shifts'),
      (snap) => {
        const shiftsObj = {};
        snap.forEach(docSnap => {
          const shift = { id: docSnap.id, ...docSnap.data() };
          const dateStr = shift.date;
          if (!shiftsObj[dateStr]) shiftsObj[dateStr] = [];
          shiftsObj[dateStr].push(shift);
        });
        setShifts(shiftsObj);
      }
    );
    
    return () => unsubShifts();
  }, [authUser]);

  // Load Availability from Firestore
  useEffect(() => {
    if (!authUser) return;
    
    const unsubAvail = onSnapshot(
      collection(db, 'availability'),
      (snap) => {
        const availObj = {};
        snap.forEach(docSnap => {
          const avail = { id: docSnap.id, ...docSnap.data() };
          const key = avail.id; // key format: "YYYY-MM-DD_userId"
          availObj[key] = avail;
        });
        setAvailability(availObj);
      }
    );
    
    return () => unsubAvail();
  }, [authUser]);


  // --- Admin Actions: User Management ---
  const addUser = async () => {
    if (!newUserName.trim()) return;
    try {
      const colorIdx = Math.floor(Math.random() * COLORS.length);
      await addDoc(collection(db, 'users'), {
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
      await deleteDoc(doc(db, 'users', userId));
      console.log('User deleted', userId);
    } catch (e) {
      console.error("Delete user error:", e);
      alert('刪除失敗，請稍後再試');
    }
  };

  // Batch Fill Shifts
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
            const ref = doc(db, 'shifts', refId);
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
            const ref = doc(db, 'shifts', refId);
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
          const ref = doc(db, 'shifts', shift.id);
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

  // --- Shift Management ---
  const assignShift = async (date, userId, type) => {
    try {
      const refId = `${date}_${userId}_${type}`;
      const ref = doc(db, 'shifts', refId);
      await setDoc(ref, {
        date,
        userId,
        type,
        startTime: SHIFT_TYPES[type === 'M' ? 'MORNING' : type === 'E' ? 'EVENING' : 'OFF'].start,
        endTime: SHIFT_TYPES[type === 'M' ? 'MORNING' : type === 'E' ? 'EVENING' : 'OFF'].end,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Assign shift error:", e);
    }
  };

  const removeShift = async (shiftId) => {
    try {
      await deleteDoc(doc(db, 'shifts', shiftId));
    } catch (e) {
      console.error("Remove shift error:", e);
    }
  };

  // --- Availability Management (for Users) ---
  const saveAvailability = async (date, userId, slots, mode) => {
    try {
      const key = `${date}_${userId}`;
      const ref = doc(db, 'availability', key);
      await setDoc(ref, {
        date,
        userId,
        slots,
        mode,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Save availability error:", e);
    }
  };

  const onLoginClick = async (user) => {
    setLoginTargetUser(user);
    setShowLoginModal(true);
    setLoginPin('');
    setLoginError('');
  };

  const handleLoginSubmit = () => {
    // Simple PIN validation (for now, admin = 0000)
    const correctPin = currentUser?.role === 'admin' ? '0000' : '';
    if (loginPin === correctPin || loginTargetUser.id === currentUser?.id) {
      setCurrentUser(loginTargetUser);
      setShowLoginModal(false);
      setLoginPin('');
    } else {
      setLoginError('PIN 錯誤');
    }
  };

  // Navigation
  const goToPreviousMonth = () => {
    const prev = new Date(currentDate);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentDate(prev);
  };

  const goToNextMonth = () => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + 1);
    setCurrentDate(next);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Rendering
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const calendarDays = [];

  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="min-h-screen bg-[#FEFCF7]">
      {/* Top Bar */}
      <RoleSwitcher 
        currentUser={currentUser} 
        users={users} 
        onLoginClick={onLoginClick}
      />

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'calendar' 
                ? 'bg-stone-800 text-white' 
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            <Calendar size={16} className="inline mr-2" />
            日曆
          </button>
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('manage')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'manage' 
                  ? 'bg-stone-800 text-white' 
                  : 'bg-white text-stone-600 border border-stone-200'
              }`}
            >
              <Users size={16} className="inline mr-2" />
              員工管理
            </button>
          )}
        </div>

        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <div className="bg-white rounded-lg shadow-sm p-6 border border-stone-200">
            {/* Month Header */}
            <div className="flex items-center justify-between mb-6">
              <button onClick={goToPreviousMonth} className="p-2 hover:bg-gray-100 rounded">
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-2xl font-bold">
                {year} 年 {month + 1} 月
              </h2>
              <button onClick={goToNextMonth} className="p-2 hover:bg-gray-100 rounded">
                <ChevronRight size={20} />
              </button>
              <button 
                onClick={goToToday}
                className="ml-4 px-4 py-2 bg-stone-800 text-white rounded hover:bg-stone-900"
              >
                今天
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                <div key={day} className="text-center font-bold text-stone-500 py-2">
                  {day}
                </div>
              ))}
              {calendarDays.map((day, idx) => {
                const dateStr = day ? formatDate(year, month, day) : null;
                const dayShifts = dateStr ? (shifts[dateStr] || []) : [];
                const isToday = day && new Date().toDateString() === new Date(year, month, day).toDateString();
                
                return (
                  <div
                    key={idx}
                    className={`min-h-24 p-2 rounded border ${
                      day
                        ? isToday
                          ? 'bg-yellow-50 border-yellow-300'
                          : 'bg-white border-stone-200 hover:bg-stone-50 cursor-pointer'
                        : 'bg-gray-50'
                    }`}
                    onClick={() => day && setSelectedDay(dateStr)}
                  >
                    {day && (
                      <>
                        <div className="font-bold text-stone-700 mb-1">{day}</div>
                        <div className="text-xs space-y-1">
                          {dayShifts.map(shift => {
                            const user = users.find(u => u.id === shift.userId);
                            const color = user ? COLORS[user.colorIdx || 0] : COLORS[0];
                            return (
                              <div
                                key={shift.id}
                                className={`px-1 py-0.5 rounded text-white text-[10px] ${
                                  shift.type === 'M'
                                    ? 'bg-[#E6B422]'
                                    : shift.type === 'E'
                                    ? 'bg-[#2B3252]'
                                    : 'bg-[#A5A5A5]'
                                }`}
                              >
                                {user?.name || '?'} {shift.type}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Admin Controls */}
            {isAdmin && (
              <div className="mt-6 flex gap-4">
                <button
                  onClick={batchFill}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  自動填充
                </button>
                <button
                  onClick={clearMonth}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  清空本月
                </button>
              </div>
            )}
          </div>
        )}

        {/* Manage Tab */}
        {activeTab === 'manage' && isAdmin && (
          <div className="bg-white rounded-lg shadow-sm p-6 border border-stone-200">
            <h3 className="text-xl font-bold mb-4">員工管理</h3>
            
            {/* Add User */}
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="新員工名稱"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="flex-1 px-3 py-2 border border-stone-300 rounded"
              />
              <button
                onClick={addUser}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                <Plus size={16} className="inline" /> 新增
              </button>
            </div>

            {/* User List */}
            <div className="space-y-2">
              {users.map(user => (
                <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium">{user.name}</span>
                  {user.role !== 'admin' && (
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold mb-4">登入</h2>
            <p className="text-sm text-stone-600 mb-4">
              切換至 {loginTargetUser?.name}
            </p>
            <input
              type="password"
              placeholder="PIN"
              value={loginPin}
              onChange={(e) => setLoginPin(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded mb-2"
            />
            {loginError && <p className="text-red-500 text-sm mb-4">{loginError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowLoginModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                取消
              </button>
              <button
                onClick={handleLoginSubmit}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}