'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Thermometer,
  Wind,
  Activity,
  Droplet,
  Brain,
  EyeOff,
  Bone,
  MoreHorizontal,
  AlertTriangle,
  Stethoscope,
  CheckCircle,
  Clock,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Edit,
  RefreshCw,
  Sparkles,
  Phone,
  User,
  Heart,
  UserCheck,
  Plus,
  ArrowLeft,
  X,
  FileText
} from 'lucide-react';

// Interfaces matching backend
interface Patient {
  id: string;
  queueNumber: string;
  name: string;
  phone: string;
  age: number;
  sex: string;
  symptoms: string[];
  freeText: string;
  selfUrgency: 'minor' | 'moderate' | 'urgent';
  aiSuggestedPriority: 'minor' | 'moderate' | 'urgent';
  aiSummary: string;
  isRedFlag: boolean;
  confirmedPriority: 'minor' | 'moderate' | 'urgent' | null;
  overrideReason?: string;
  notes?: string;
  status: 'waiting' | 'in_progress' | 'completed' | 'escalated';
  createdAt: string;
  escalatedAt?: string;
  attendedAt?: string;
  completedAt?: string;
}

interface Stats {
  inQueue: number;
  avgWait: number;
  redFlags: number;
  seenToday: number;
}

export default function Home() {
  // Gate controller: Allow toggling between Patient and Staff views easily inside the AI Studio frame
  const [activePortal, setActivePortal] = useState<'patient' | 'staff'>('patient');

  // Stable currentTime to comply with React rendering purity rules
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // --- PATIENT STATE ENGINES ---
  const [patientStep, setPatientStep] = useState<'P0' | 'P1' | 'P2' | 'P3' | 'P4'>('P0');
  const [patientForm, setPatientForm] = useState({
    name: '',
    phone: '',
    age: '',
    sex: '',
    symptoms: [] as string[],
    freeText: '',
    selfUrgency: 'minor' as 'minor' | 'moderate' | 'urgent',
  });
  
  // Status check state (P0 direct lookup input)
  const [statusCheckQueueNum, setStatusCheckQueueNum] = useState('');
  const [statusCheckError, setStatusCheckError] = useState('');

  // Local validation states for P1
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [isSubmittingCheckin, setIsSubmittingCheckin] = useState(false);
  const [checkinResult, setCheckinResult] = useState<{
    patientId: string;
    queueNumber: string;
    estimatedWait: number;
    status: string;
    position?: number;
    name?: string;
  } | null>(null);

  // Polling patient status
  useEffect(() => {
    if (!checkinResult?.patientId || patientStep !== 'P4') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/app/api/patient?id=${checkinResult.patientId}`);
        if (res.ok) {
          const data = await res.json();
          setCheckinResult(prev => prev ? { ...prev, ...data } : null);
        }
      } catch (err) {
        console.error('Failed to poll patient status:', err);
      }
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [checkinResult?.patientId, patientStep]);

  // --- STAFF STATE ENGINES ---
  const [isStaffLoggedIn, setIsStaffLoggedIn] = useState(false);
  const [staffEmail, setStaffEmail] = useState('nurse@healthcentre.gh');
  const [staffPassword, setStaffPassword] = useState('password123');
  const [staffLoginError, setStaffLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [stats, setStats] = useState<Stats>({ inQueue: 0, avgWait: 0, redFlags: 0, seenToday: 0 });
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [queueError, setQueueError] = useState('');
  
  const [activeFilter, setActiveFilter] = useState<'all' | 'red_flag' | 'waiting' | 'in_progress' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'arrival' | 'wait_time'>('priority');
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);

  // Override priority modal states (S3)
  const [overridePatient, setOverridePatient] = useState<Patient | null>(null);
  const [overridePriority, setOverridePriority] = useState<'minor' | 'moderate' | 'urgent'>('minor');
  const [overrideReason, setOverrideReason] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  // In-progress patient clinical notes state
  const [staffNotesInput, setStaffNotesInput] = useState('');

  // Fetch queue data for staff dashboard
  const fetchQueue = async () => {
    setIsLoadingQueue(true);
    setQueueError('');
    try {
      const res = await fetch('/app/api/queue');
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients);
        setStats(data.stats);
      } else {
        setQueueError('Could not load current queue data.');
      }
    } catch (err) {
      setQueueError('Connection failed. Please check your backend connection.');
    } finally {
      setIsLoadingQueue(false);
    }
  };

  // Poll queue data for staff dashboard
  useEffect(() => {
    if (!isStaffLoggedIn) return;
    
    const timer = setTimeout(() => {
      fetchQueue();
    }, 0);

    const interval = setInterval(fetchQueue, 20000); // Refresh every 20 seconds
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isStaffLoggedIn]);

  // --- FORM HANDLERS & STEPPERS ---

  // Validate personal info form (P1)
  const validateP1 = () => {
    const tempErrors: Record<string, string> = {};
    if (!patientForm.name.trim()) {
      tempErrors.name = 'Please enter your full name';
    } else if (patientForm.name.length < 2) {
      tempErrors.name = 'Name must be at least 2 characters';
    }

    const phoneClean = patientForm.phone.replace(/\D/g, '');
    if (!patientForm.phone.trim()) {
      tempErrors.phone = 'Please enter your phone number';
    } else if (phoneClean.length < 9 || phoneClean.length > 15) {
      tempErrors.phone = 'Please enter a valid phone number (9-15 digits)';
    }

    const ageNum = parseInt(patientForm.age, 10);
    if (!patientForm.age) {
      tempErrors.age = 'Please enter your age';
    } else if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      tempErrors.age = 'Please enter an age between 1 and 120';
    }

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleP1Continue = () => {
    if (validateP1()) {
      setPatientStep('P2');
    }
  };

  const toggleSymptom = (id: string) => {
    setPatientForm(prev => {
      const isSelected = prev.symptoms.includes(id);
      const updated = isSelected 
        ? prev.symptoms.filter(s => s !== id)
        : [...prev.symptoms, id];
      return { ...prev, symptoms: updated };
    });
  };

  const handlePatientSubmit = async () => {
    setIsSubmittingCheckin(true);
    try {
      const res = await fetch('/app/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patientForm.name,
          phone: patientForm.phone,
          age: patientForm.age,
          sex: patientForm.sex || 'Prefer not to say',
          symptoms: patientForm.symptoms,
          freeText: patientForm.freeText,
          selfUrgency: patientForm.selfUrgency,
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCheckinResult(data);
        setPatientStep('P4');
      } else {
        alert('Check-in failed. Please try again.');
      }
    } catch (err) {
      alert('Network failure during check-in. Please try again.');
    } finally {
      setIsSubmittingCheckin(false);
    }
  };

  // Status check lookup
  const handleStatusCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusCheckError('');
    if (!statusCheckQueueNum.trim()) return;

    try {
      const res = await fetch(`/app/api/patient?queueNumber=${encodeURIComponent(statusCheckQueueNum.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setCheckinResult(data);
        setPatientStep('P4');
      } else {
        setStatusCheckError('No active patient found with this queue number.');
      }
    } catch (err) {
      setStatusCheckError('Failed to query status. Please verify connection.');
    }
  };

  // --- STAFF ACTIONS & TRANSITIONS ---
  const handleStaffLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setStaffLoginError('');
    setIsLoggingIn(true);
    
    // Simulate simple authenticated load based on guidelines S0
    setTimeout(() => {
      if (staffEmail.trim() === 'nurse@healthcentre.gh' && staffPassword === 'password123') {
        setIsStaffLoggedIn(true);
        fetchQueue();
      } else {
        setStaffLoginError('Email or password is incorrect. Please try again.');
      }
      setIsLoggingIn(false);
    }, 800);
  };

  // Staff action trigger
  const updatePatientState = async (patientId: string, updates: Partial<Patient>) => {
    try {
      const res = await fetch(`/app/api/patient?id=${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        // Optimistically update or fetch full list
        fetchQueue();
      } else {
        alert('Could not update patient state.');
      }
    } catch (err) {
      alert('Failed to connect to triage server.');
    }
  };

  // Override handler modal S3
  const openOverrideModal = (p: Patient) => {
    setOverridePatient(p);
    setOverridePriority(p.confirmedPriority || p.aiSuggestedPriority);
    setOverrideReason(p.overrideReason || '');
  };

  const handleSaveOverride = async () => {
    if (!overridePatient) return;
    setIsSavingOverride(true);
    await updatePatientState(overridePatient.id, {
      confirmedPriority: overridePriority,
      overrideReason: overrideReason || 'Manual adjustment by clinical staff.',
    });
    setIsSavingOverride(false);
    setOverridePatient(null);
  };

  // Filter & sorting engine
  const filteredPatients = patients.filter(p => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'red_flag') return p.isRedFlag && p.status !== 'completed';
    if (activeFilter === 'waiting') return p.status === 'waiting' || p.status === 'escalated';
    if (activeFilter === 'in_progress') return p.status === 'in_progress';
    if (activeFilter === 'completed') return p.status === 'completed';
    return true;
  });

  // Sort queue
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    if (sortBy === 'wait_time') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // Longest wait first (oldest timestamp)
    }
    if (sortBy === 'arrival') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Newest arrival first
    }
    
    // Sort by Triage priority (S1 Ordering Rules: escalated -> urgent -> moderate -> minor)
    const getScore = (p: Patient) => {
      if (p.status === 'escalated') return 1000;
      const priority = p.confirmedPriority || p.aiSuggestedPriority;
      if (priority === 'urgent') return 3;
      if (priority === 'moderate') return 2;
      return 1;
    };
    
    const scoreA = getScore(a);
    const scoreB = getScore(b);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Reset form to re-checkin
  const resetPatientFlow = () => {
    setPatientForm({
      name: '',
      phone: '',
      age: '',
      sex: '',
      symptoms: [],
      freeText: '',
      selfUrgency: 'minor',
    });
    setCheckinResult(null);
    setPatientStep('P0');
  };

  // Symptoms mapping helper
  const symptomList = [
    { id: 'fever', label: 'Fever', icon: Thermometer },
    { id: 'cough', label: 'Cough', icon: Wind },
    { id: 'chest_pain', label: 'Chest pain', icon: Activity },
    { id: 'vomiting', label: 'Vomiting', icon: Droplet },
    { id: 'headache', label: 'Headache', icon: Brain },
    { id: 'dizziness', label: 'Dizziness', icon: EyeOff },
    { id: 'body_aches', label: 'Body aches', icon: Bone },
    { id: 'other', label: 'Other', icon: MoreHorizontal },
  ];

  return (
    <div className="min-h-screen bg-surface-grey flex flex-col antialiased font-sans">
      
      {/* GLOBAL PREVIEW CONTROLLER */}
      <div className="bg-slate-900 text-white px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 border-b border-slate-800 shrink-0 z-50">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">Interactive Preview Sandbox</span>
        </div>
        <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
          <button
            onClick={() => { setActivePortal('patient'); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activePortal === 'patient' ? 'bg-brand text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Patient Check-In Flow
          </button>
          <button
            onClick={() => { setActivePortal('staff'); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activePortal === 'staff' ? 'bg-brand text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Staff Dashboard Portal
          </button>
        </div>
      </div>

      {/* --- PATH A: PATIENT WEB APP --- */}
      {activePortal === 'patient' && (
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-white rounded-xl shadow-lg border border-surface-border overflow-hidden flex flex-col min-h-[580px]">
            
            {/* Header */}
            <header className="px-5 py-4 border-b border-surface-border flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-brand" />
                <span className="font-semibold tracking-tight text-text-primary text-lg">MediQueue AI</span>
              </div>
              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">Patient Intake</span>
            </header>

            {/* Step Indicators */}
            {patientStep !== 'P0' && (
              <div className="px-5 py-3.5 bg-slate-50 border-b border-surface-border flex items-center justify-between">
                <div className="flex items-center w-full justify-between max-w-[280px] mx-auto text-xs font-medium">
                  {/* Step 1 */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      patientStep === 'P1' ? 'bg-brand text-white' : 'bg-brand-light text-brand'
                    }`}>
                      {['P2', 'P3', 'P4'].includes(patientStep) ? <CheckCircle className="w-4 h-4" /> : '1'}
                    </span>
                    <span className="text-[10px] text-text-secondary">Info</span>
                  </div>
                  <div className={`flex-1 h-[2px] mx-2 -mt-4 ${['P2', 'P3', 'P4'].includes(patientStep) ? 'bg-brand' : 'bg-slate-200'}`} />
                  
                  {/* Step 2 */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      patientStep === 'P2' ? 'bg-brand text-white' : 
                      ['P3', 'P4'].includes(patientStep) ? 'bg-brand-light text-brand' : 'bg-slate-200 text-slate-400'
                    }`}>
                      {['P3', 'P4'].includes(patientStep) ? <CheckCircle className="w-4 h-4" /> : '2'}
                    </span>
                    <span className="text-[10px] text-text-secondary">Symptoms</span>
                  </div>
                  <div className={`flex-1 h-[2px] mx-2 -mt-4 ${['P3', 'P4'].includes(patientStep) ? 'bg-brand' : 'bg-slate-200'}`} />
                  
                  {/* Step 3 */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      patientStep === 'P3' ? 'bg-brand text-white' : 
                      ['P4'].includes(patientStep) ? 'bg-brand-light text-brand' : 'bg-slate-200 text-slate-400'
                    }`}>
                      {patientStep === 'P4' ? <CheckCircle className="w-4 h-4" /> : '3'}
                    </span>
                    <span className="text-[10px] text-text-secondary">Review</span>
                  </div>
                </div>
              </div>
            )}

            {/* Content Switcher */}
            <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between">
              
              <AnimatePresence mode="wait">
                
                {/* P0: LANDING */}
                {patientStep === 'P0' && (
                  <motion.div
                    key="p0"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 flex flex-col justify-between"
                  >
                    <div className="space-y-6">
                      <div className="text-center space-y-2 py-4">
                        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                          Welcome to Ridge Regional clinic
                        </h1>
                        <p className="text-sm text-text-secondary">
                          Check in virtually to secure your queue priority. We use AI clinical insights to categorize urgent cases first.
                        </p>
                      </div>

                      <div className="bg-brand-light rounded-xl p-5 border border-brand/20 flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-brand tracking-wider uppercase">Live Queue Stat</p>
                          <p className="text-sm text-brand-dark font-medium">Patients waiting currently</p>
                        </div>
                        <span className="text-3xl font-extrabold text-brand-dark">14</span>
                      </div>

                      <div className="space-y-3 pt-4">
                        <button
                          onClick={() => setPatientStep('P1')}
                          className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                        >
                          <span>Begin check-in</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Status look up divider */}
                    <div className="border-t border-surface-border pt-6 mt-8 space-y-4">
                      <p className="text-xs text-center font-medium text-text-secondary uppercase tracking-wider">Already checked in?</p>
                      <form onSubmit={handleStatusCheck} className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. A-012"
                            value={statusCheckQueueNum}
                            onChange={(e) => setStatusCheckQueueNum(e.target.value)}
                            className="flex-1 border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand uppercase"
                          />
                          <button
                            type="submit"
                            className="bg-slate-100 hover:bg-slate-200 text-text-primary px-4 py-2 rounded-lg text-xs font-semibold transition"
                          >
                            Check Status
                          </button>
                        </div>
                        {statusCheckError && (
                          <p className="text-[11px] text-red-600 font-medium">{statusCheckError}</p>
                        )}
                      </form>
                    </div>

                  </motion.div>
                )}

                {/* P1: PERSONAL INFO */}
                {patientStep === 'P1' && (
                  <motion.div
                    key="p1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 flex flex-col justify-between"
                  >
                    <div className="space-y-5">
                      <div className="space-y-1">
                        <h2 className="text-lg font-bold text-text-primary">Personal Details</h2>
                        <p className="text-xs text-text-secondary">Please provide accurate details to match with queue records.</p>
                      </div>

                      <div className="space-y-4">
                        {/* Name */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">Full Name *</label>
                          <div className="relative">
                            <span className="absolute left-3 top-3 text-slate-400">
                              <User className="w-4 h-4" />
                            </span>
                            <input
                              type="text"
                              placeholder="e.g. Ama Owusu"
                              value={patientForm.name}
                              onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                              className={`w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand ${
                                errors.name ? 'border-red-500 focus:ring-red-500' : 'border-surface-border'
                              }`}
                            />
                          </div>
                          {errors.name && <p className="text-[11px] text-red-600 font-medium">{errors.name}</p>}
                        </div>

                        {/* Phone */}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">Phone Number *</label>
                          <div className="relative">
                            <span className="absolute left-3 top-3 text-slate-400">
                              <Phone className="w-4 h-4" />
                            </span>
                            <input
                              type="tel"
                              placeholder="e.g. +233 20 123 4567"
                              value={patientForm.phone}
                              onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                              className={`w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand ${
                                errors.phone ? 'border-red-500 focus:ring-red-500' : 'border-surface-border'
                              }`}
                            />
                          </div>
                          {errors.phone && <p className="text-[11px] text-red-600 font-medium">{errors.phone}</p>}
                        </div>

                        {/* Age & Sex */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">Age *</label>
                            <input
                              type="number"
                              min="1"
                              max="120"
                              placeholder="Age"
                              value={patientForm.age}
                              onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
                              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand ${
                                errors.age ? 'border-red-500 focus:ring-red-500' : 'border-surface-border'
                              }`}
                            />
                            {errors.age && <p className="text-[11px] text-red-600 font-medium">{errors.age}</p>}
                          </div>

                          <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">Sex</label>
                            <select
                              value={patientForm.sex}
                              onChange={(e) => setPatientForm({ ...patientForm, sex: e.target.value })}
                              className="w-full border border-surface-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                            >
                              <option value="">Select sex</option>
                              <option value="Female">Female</option>
                              <option value="Male">Male</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                        </div>

                      </div>
                    </div>

                    <div className="pt-6">
                      <button
                        onClick={handleP1Continue}
                        className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow shadow-brand/20 hover:shadow-md"
                      >
                        <span>Continue to symptoms</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                  </motion.div>
                )}

                {/* P2: SYMPTOM SELECTION */}
                {patientStep === 'P2' && (
                  <motion.div
                    key="p2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 flex flex-col justify-between"
                  >
                    <div className="space-y-5">
                      <div className="space-y-1">
                        <h2 className="text-lg font-bold text-text-primary">What brings you in today?</h2>
                        <p className="text-xs text-text-secondary">Select all symptoms that apply to you.</p>
                      </div>

                      {/* Symptoms Grid */}
                      <div className="grid grid-cols-2 gap-2">
                        {symptomList.map((sym) => {
                          const isSelected = patientForm.symptoms.includes(sym.id);
                          const IconComp = sym.icon;
                          return (
                            <button
                              key={sym.id}
                              onClick={() => toggleSymptom(sym.id)}
                              className={`flex items-center gap-2.5 p-3 rounded-lg border text-left text-xs font-medium transition duration-200 select-none ${
                                isSelected
                                  ? 'bg-urgency-minor-bg border-brand text-urgency-minor-text font-semibold'
                                  : 'bg-white border-surface-border text-text-secondary hover:bg-slate-50'
                              }`}
                            >
                              <IconComp className={`w-4 h-4 ${isSelected ? 'text-brand' : 'text-slate-400'}`} />
                              <span>{sym.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Text area */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">Describe in your own words</label>
                        <textarea
                          placeholder="e.g. Feel extremely dizzy when standing up, chest feels a bit tight, started about an hour ago..."
                          maxLength={500}
                          value={patientForm.freeText}
                          onChange={(e) => setPatientForm({ ...patientForm, freeText: e.target.value })}
                          className="w-full border border-surface-border rounded-lg p-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand h-24 resize-none"
                        />
                        <div className="text-right text-[10px] text-text-tertiary">
                          {patientForm.freeText.length} / 500 characters
                        </div>
                      </div>

                      {/* Urgency selector */}
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">How urgent does this feel?</label>
                        <div className="grid grid-cols-3 gap-2">
                          {/* Minor */}
                          <button
                            onClick={() => setPatientForm({ ...patientForm, selfUrgency: 'minor' })}
                            className={`py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                              patientForm.selfUrgency === 'minor'
                                ? 'bg-urgency-minor-bg border-urgency-minor-border text-urgency-minor-text'
                                : 'bg-white border-surface-border text-text-secondary hover:bg-slate-50'
                            }`}
                          >
                            Minor
                          </button>
                          {/* Moderate */}
                          <button
                            onClick={() => setPatientForm({ ...patientForm, selfUrgency: 'moderate' })}
                            className={`py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                              patientForm.selfUrgency === 'moderate'
                                ? 'bg-urgency-moderate-bg border-urgency-moderate-border text-urgency-moderate-text'
                                : 'bg-white border-surface-border text-text-secondary hover:bg-slate-50'
                            }`}
                          >
                            Moderate
                          </button>
                          {/* Urgent */}
                          <button
                            onClick={() => setPatientForm({ ...patientForm, selfUrgency: 'urgent' })}
                            className={`py-2 px-3 rounded-lg border text-xs font-semibold transition ${
                              patientForm.selfUrgency === 'urgent'
                                ? 'bg-urgency-urgent-bg border-urgency-urgent-border text-urgency-urgent-text'
                                : 'bg-white border-surface-border text-text-secondary hover:bg-slate-50'
                            }`}
                          >
                            Urgent
                          </button>
                        </div>
                        <p className="text-[10px] text-text-tertiary">
                          ⓘ Note: Your selection assists triage priority mapping, but nursing staff confirms final queue prioritization.
                        </p>
                      </div>

                    </div>

                    <div className="flex gap-3 pt-6">
                      <button
                        onClick={() => setPatientStep('P1')}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-text-primary font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>
                      <button
                        onClick={() => setPatientStep('P3')}
                        className="flex-1 bg-brand hover:bg-brand-dark text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow shadow-brand/20 hover:shadow-md"
                      >
                        <span>Review</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                  </motion.div>
                )}

                {/* P3: REVIEW & CONFIRM */}
                {patientStep === 'P3' && (
                  <motion.div
                    key="p3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 flex flex-col justify-between"
                  >
                    <div className="space-y-5">
                      <div className="space-y-1">
                        <h2 className="text-lg font-bold text-text-primary">Review details</h2>
                        <p className="text-xs text-text-secondary">Please verify all info before submitting check-in.</p>
                      </div>

                      {/* Personal card */}
                      <div className="border border-surface-border rounded-xl p-4 space-y-3.5 bg-white shadow-sm relative">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-brand uppercase tracking-wider">Personal Details</span>
                          <button onClick={() => setPatientStep('P1')} className="text-slate-400 hover:text-brand transition">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                          <div>
                            <p className="text-text-tertiary">Name</p>
                            <p className="font-semibold text-text-primary">{patientForm.name}</p>
                          </div>
                          <div>
                            <p className="text-text-tertiary">Phone</p>
                            <p className="font-semibold text-text-primary">{patientForm.phone}</p>
                          </div>
                          <div>
                            <p className="text-text-tertiary">Age</p>
                            <p className="font-semibold text-text-primary">{patientForm.age} years</p>
                          </div>
                          <div>
                            <p className="text-text-tertiary">Sex</p>
                            <p className="font-semibold text-text-primary">{patientForm.sex || 'Not specified'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Symptoms card */}
                      <div className="border border-surface-border rounded-xl p-4 space-y-3.5 bg-white shadow-sm relative">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-brand uppercase tracking-wider">Symptoms &amp; Severity</span>
                          <button onClick={() => setPatientStep('P2')} className="text-slate-400 hover:text-brand transition">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div>
                            <p className="text-text-tertiary">Selected Symptoms</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {patientForm.symptoms.length > 0 ? (
                                patientForm.symptoms.map(sId => {
                                  const match = symptomList.find(s => s.id === sId);
                                  return (
                                    <span key={sId} className="bg-slate-100 text-text-secondary px-2 py-0.5 rounded text-[11px] font-medium">
                                      {match ? match.label : sId}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-text-tertiary italic">None selected</span>
                              )}
                            </div>
                          </div>
                          
                          {patientForm.freeText && (
                            <div>
                              <p className="text-text-tertiary">Description</p>
                              <p className="text-text-secondary mt-0.5 leading-relaxed bg-slate-50 p-2 rounded italic text-[11px]">
                                &ldquo;{patientForm.freeText}&rdquo;
                              </p>
                            </div>
                          )}

                          <div>
                            <p className="text-text-tertiary">Self-rated urgency</p>
                            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              patientForm.selfUrgency === 'urgent' 
                                ? 'bg-urgency-urgent-bg text-urgency-urgent-text'
                                : patientForm.selfUrgency === 'moderate'
                                ? 'bg-urgency-moderate-bg text-urgency-moderate-text'
                                : 'bg-urgency-minor-bg text-urgency-minor-text'
                            }`}>
                              {patientForm.selfUrgency}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/60 rounded-lg p-3 flex gap-2.5 text-[11px] text-text-secondary">
                        <Clock className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                        <span>A nurse will confirm triage urgency after check-in. If your condition deteriorates, tell clinical staff directly.</span>
                      </div>

                    </div>

                    <div className="flex gap-3 pt-6">
                      <button
                        onClick={() => setPatientStep('P2')}
                        disabled={isSubmittingCheckin}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-text-primary font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>
                      <button
                        onClick={handlePatientSubmit}
                        disabled={isSubmittingCheckin}
                        className="flex-1 bg-brand hover:bg-brand-dark disabled:bg-slate-300 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow shadow-brand/20 hover:shadow-md"
                      >
                        {isSubmittingCheckin ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Checking you in...</span>
                          </>
                        ) : (
                          <>
                            <span>Submit check-in</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>

                  </motion.div>
                )}

                {/* P4: QUEUE CONFIRMATION & LIVE STATUS */}
                {patientStep === 'P4' && checkinResult && (
                  <motion.div
                    key="p4"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1 pt-2">
                      <h2 className="text-xl font-bold text-brand">You are checked in</h2>
                      <p className="text-xs text-text-secondary">Please wait in the seating area. We will call you shortly.</p>
                    </div>

                    {/* Ticket Card */}
                    <div className="bg-brand-light/50 border border-brand/20 rounded-2xl p-6 space-y-4 max-w-[320px] mx-auto shadow-sm">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-brand uppercase tracking-wider">Your Queue Number</p>
                        <p className="text-5xl font-mono font-extrabold text-brand tracking-tight">
                          {checkinResult.queueNumber}
                        </p>
                      </div>

                      <div className="border-t border-brand/10 pt-3 flex justify-between items-center">
                        <span className="text-xs text-text-secondary font-medium">Estimated wait</span>
                        <span className="text-base font-bold text-text-primary">
                          {checkinResult.estimatedWait > 0 ? `~ ${checkinResult.estimatedWait} minutes` : 'Immediate'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-xs text-text-secondary font-medium">Triage Status</span>
                        <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                          checkinResult.status === 'completed'
                            ? 'bg-urgency-done-bg text-urgency-done-text'
                            : checkinResult.status === 'in_progress'
                            ? 'bg-urgency-progress-bg text-urgency-progress-text'
                            : 'bg-urgency-moderate-bg text-urgency-moderate-text'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            checkinResult.status === 'completed' ? 'bg-slate-400' :
                            checkinResult.status === 'in_progress' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'
                          }`} />
                          {checkinResult.status === 'completed' ? 'Completed' :
                           checkinResult.status === 'in_progress' ? 'Attending' : 'Waiting'}
                        </span>
                      </div>

                      {checkinResult.position !== undefined && checkinResult.status === 'waiting' && (
                        <div className="border-t border-brand/10 pt-3 flex justify-between items-center text-xs">
                          <span className="text-text-secondary">Queue Position</span>
                          <span className="font-bold text-brand-dark">#{checkinResult.position} ahead</span>
                        </div>
                      )}
                    </div>

                    {/* Info items */}
                    <div className="bg-slate-50 border border-surface-border rounded-xl p-4 text-left text-xs text-text-secondary space-y-3 max-w-[360px] mx-auto">
                      <div className="flex gap-3">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <p>We will send an SMS to <span className="font-semibold text-text-primary">{patientForm.phone || 'your phone'}</span> when a consultant is ready.</p>
                      </div>
                      <div className="flex gap-3 border-t border-slate-200/60 pt-3">
                        <RefreshCw className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 animate-spin-slow" />
                        <p>This panel refreshes automatically to reflect your clinical triage status changes.</p>
                      </div>
                      <div className="flex gap-3 border-t border-slate-200/60 pt-3 text-red-700 bg-red-50/50 p-2 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <p className="font-semibold">If your condition worsens (difficulty breathing, dizziness, nausea) notify the receptionist immediately.</p>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        onClick={resetPatientFlow}
                        className="text-brand hover:text-brand-dark font-semibold text-xs border border-brand/20 bg-brand-light px-5 py-2 rounded-lg transition hover:bg-brand-light/80"
                      >
                        Register New Patient
                      </button>
                    </div>

                  </motion.div>
                )}

              </AnimatePresence>

            </div>

            {/* Footer */}
            <footer className="px-5 py-3.5 bg-slate-50 border-t border-surface-border text-center text-[10px] text-text-tertiary">
              MediQueue AI Triage • Powered by Google Gemini AI and AWS Core
            </footer>

          </div>
        </main>
      )}

      {/* --- PATH B: HOSPITAL STAFF DASHBOARD --- */}
      {activePortal === 'staff' && (
        <main className="flex-1 flex flex-col p-4 max-w-7xl w-full mx-auto space-y-4">
          
          {!isStaffLoggedIn ? (
            /* S0: STAFF LOGIN */
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="w-full max-w-[400px] bg-white rounded-xl shadow-md border border-surface-border p-6 space-y-6">
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-brand" />
                    <span className="font-bold tracking-tight text-xl">MediQueue AI</span>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Staff Clinical Portal</p>
                  <p className="text-xs text-text-tertiary">Please authenticate with credentials to access the queue manager.</p>
                </div>

                <form onSubmit={handleStaffLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-text-secondary uppercase">Email Address</label>
                    <input
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-text-secondary uppercase">Password</label>
                    <input
                      type="password"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                      required
                    />
                  </div>

                  {staffLoginError && (
                    <p className="text-xs text-red-600 font-semibold">{staffLoginError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg text-sm transition shadow shadow-brand/10 flex items-center justify-center gap-2"
                  >
                    {isLoggingIn ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <span>Sign in to shift</span>
                    )}
                  </button>
                </form>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px] text-text-secondary">
                  <p className="font-semibold text-brand mb-1">Shift Demo Account:</p>
                  <p>Email: <code className="font-mono bg-slate-200 px-1 rounded">nurse@healthcentre.gh</code></p>
                  <p>Password: <code className="font-mono bg-slate-200 px-1 rounded">password123</code></p>
                </div>
              </div>
            </div>
          ) : (
            /* STAFF MAIN APP */
            <div className="space-y-4 flex flex-col flex-1">
              
              {/* TOPBAR */}
              <div className="bg-white rounded-xl border border-surface-border p-4 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="w-3.5 h-3.5 rounded-full bg-brand" />
                  <div>
                    <h1 className="font-bold text-lg text-text-primary flex items-center gap-2">
                      <span>MediQueue AI</span>
                      <span className="text-xs font-semibold bg-brand-light text-brand px-2 py-0.5 rounded-full">Ridge Regional Clinic</span>
                    </h1>
                    <p className="text-xs text-text-secondary">Emergency Triage &amp; Clinical Prioritization Dashboard</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Pulse Live status */}
                  <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold text-emerald-800">● Live Connection</span>
                  </div>

                  {/* Refresh CTA */}
                  <button
                    onClick={fetchQueue}
                    disabled={isLoadingQueue}
                    className="p-2 border border-surface-border rounded-lg bg-white hover:bg-slate-50 transition text-text-secondary relative active:scale-95"
                    title="Manual Refresh"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingQueue ? 'animate-spin text-brand' : ''}`} />
                  </button>

                  {/* Staff avatar */}
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm">
                      NR
                    </span>
                    <div className="hidden md:block">
                      <p className="text-xs font-bold text-text-primary">Nurse Rhoda</p>
                      <button 
                        onClick={() => setIsStaffLoggedIn(false)}
                        className="text-[10px] text-red-600 font-semibold hover:underline block"
                      >
                        Sign out of shift
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* METRIC STAT CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Active queue count */}
                <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">In Active Queue</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-bold text-text-primary">{stats.inQueue}</span>
                    <span className="text-[10px] text-text-secondary">patients waiting</span>
                  </div>
                </div>
                {/* Avg wait time */}
                <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Avg Waiting Time</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-bold text-text-primary">~{stats.avgWait}m</span>
                    <span className="text-[10px] text-text-secondary">minutes estimate</span>
                  </div>
                </div>
                {/* Red flags */}
                <div className={`border rounded-xl p-4 flex flex-col justify-between shadow-sm transition-all duration-300 ${
                  stats.redFlags > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-surface-border'
                }`}>
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
                    <span>Critical Red Flags</span>
                    {stats.redFlags > 0 && <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />}
                  </span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className={`text-3xl font-bold ${stats.redFlags > 0 ? 'text-red-700 animate-pulse' : 'text-text-primary'}`}>
                      {stats.redFlags}
                    </span>
                    <span className={`text-[10px] font-semibold ${stats.redFlags > 0 ? 'text-red-700' : 'text-text-secondary'}`}>
                      {stats.redFlags > 0 ? 'NEEDS CLINICAL CALL' : 'no unconfirmed cases'}
                    </span>
                  </div>
                </div>
                {/* Seen today */}
                <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Seen This Shift</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-bold text-text-primary">{stats.seenToday}</span>
                    <span className="text-[10px] text-text-secondary">completed patients</span>
                  </div>
                </div>
              </div>

              {/* FILTERS & SORTS */}
              <div className="bg-white border border-surface-border rounded-xl p-3 flex flex-wrap gap-3 items-center justify-between shadow-sm">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeFilter === 'all'
                        ? 'bg-brand-light text-brand border border-brand/20'
                        : 'bg-white hover:bg-slate-50 text-text-secondary border border-surface-border'
                    }`}
                  >
                    All patients
                  </button>
                  <button
                    onClick={() => setActiveFilter('red_flag')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activeFilter === 'red_flag'
                        ? 'bg-red-100 text-red-700 border border-red-300'
                        : 'bg-white hover:bg-slate-50 text-red-600 border border-surface-border'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Red Flags</span>
                  </button>
                  <button
                    onClick={() => setActiveFilter('waiting')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeFilter === 'waiting'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-white hover:bg-slate-50 text-text-secondary border border-surface-border'
                    }`}
                  >
                    Waiting
                  </button>
                  <button
                    onClick={() => setActiveFilter('in_progress')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeFilter === 'in_progress'
                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                        : 'bg-white hover:bg-slate-50 text-text-secondary border border-surface-border'
                    }`}
                  >
                    In Progress
                  </button>
                  <button
                    onClick={() => setActiveFilter('completed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeFilter === 'completed'
                        ? 'bg-slate-100 text-text-secondary border border-slate-300'
                        : 'bg-white hover:bg-slate-50 text-text-secondary border border-surface-border'
                    }`}
                  >
                    Completed
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="border border-surface-border rounded-lg px-2.5 py-1 text-xs font-semibold bg-white text-text-secondary"
                  >
                    <option value="priority">Clinical priority</option>
                    <option value="arrival">Newest arrivals</option>
                    <option value="wait_time">Longest wait time</option>
                  </select>
                </div>
              </div>

              {/* QUEUE LIST */}
              <div className="space-y-3 flex-1 overflow-y-auto">
                {sortedPatients.length === 0 ? (
                  /* S5: EMPTY QUEUE STATE */
                  <div className="bg-white border border-surface-border rounded-xl py-12 px-6 text-center space-y-4 shadow-sm">
                    <div className="w-12 h-12 rounded-full bg-brand-light text-brand flex items-center justify-center mx-auto">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-text-primary text-base">Triage Queue is Clear</h3>
                      <p className="text-xs text-text-secondary max-w-[340px] mx-auto">
                        No active patients matched the active filter. New check-ins submitted on the patient panel will populate here immediately.
                      </p>
                    </div>
                    <button
                      onClick={fetchQueue}
                      className="px-4 py-2 border border-surface-border hover:bg-slate-50 transition text-xs font-bold rounded-lg text-text-secondary"
                    >
                      Refresh Queue
                    </button>
                  </div>
                ) : (
                  sortedPatients.map((patient) => {
                    const isExpanded = expandedPatientId === patient.id;
                    const priority = patient.confirmedPriority || patient.aiSuggestedPriority;
                    
                    // Priority Badge styling helper
                    const getPriorityColors = (pClass: string, isEsc: boolean) => {
                      if (isEsc) return { bg: 'bg-urgency-urgent-bg', border: 'border-red-400', text: 'text-urgency-urgent-text' };
                      if (pClass === 'urgent') return { bg: 'bg-urgency-urgent-bg', border: 'border-urgency-urgent-border', text: 'text-urgency-urgent-text' };
                      if (pClass === 'moderate') return { bg: 'bg-urgency-moderate-bg', border: 'border-urgency-moderate-border', text: 'text-urgency-moderate-text' };
                      return { bg: 'bg-urgency-minor-bg', border: 'border-urgency-minor-border', text: 'text-urgency-minor-text' };
                    };
                    const priorityStyles = getPriorityColors(priority, patient.status === 'escalated');
                    
                    const arrivalTime = new Date(patient.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const minutesElapsed = currentTime > 0 
                      ? Math.round((currentTime - new Date(patient.createdAt).getTime()) / (60 * 1000))
                      : 0;

                    return (
                      <div
                        key={patient.id}
                        className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all duration-300 relative ${
                          patient.status === 'escalated'
                            ? 'border-red-500 bg-red-50/10'
                            : isExpanded
                            ? 'border-brand'
                            : 'border-surface-border'
                        }`}
                      >
                        {/* Pinned escalated bar S4 */}
                        {patient.status === 'escalated' && (
                          <div className="bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase py-1 px-4 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Escalated — Immediate attention required</span>
                            </span>
                            <span className="bg-red-800 text-white px-2 py-0.5 rounded text-[9px]">CRITICAL</span>
                          </div>
                        )}

                        {/* Collapsed view summary header card */}
                        <div
                          onClick={() => setExpandedPatientId(isExpanded ? null : patient.id)}
                          className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 transition"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Priority visual badge */}
                            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${priorityStyles.bg} ${priorityStyles.border} ${priorityStyles.text}`}>
                              {patient.status === 'escalated' ? <AlertTriangle className="w-5 h-5 text-red-600" /> :
                               patient.status === 'in_progress' ? <Stethoscope className="w-5 h-5 text-blue-600" /> :
                               priority === 'urgent' ? <AlertTriangle className="w-5 h-5" /> :
                               priority === 'moderate' ? <MoreHorizontal className="w-5 h-5" /> :
                               <CheckCircle className="w-5 h-5" />}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-sm text-text-primary truncate">{patient.name}</h3>
                                {patient.isRedFlag && (
                                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 text-[9px] font-bold rounded flex items-center gap-0.5 animate-pulse shrink-0">
                                    <Sparkles className="w-2.5 h-2.5" />
                                    <span>RED FLAG</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-text-secondary mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                <span className="font-mono font-bold text-brand-dark text-[12px]">{patient.queueNumber}</span>
                                <span>•</span>
                                <span>{patient.sex}, {patient.age}y</span>
                                <span>•</span>
                                <span>Arrived {arrivalTime} ({minutesElapsed}m ago)</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {/* Patient Status pill */}
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              patient.status === 'completed'
                                ? 'bg-urgency-done-bg text-urgency-done-text border border-slate-200'
                                : patient.status === 'in_progress'
                                ? 'bg-urgency-progress-bg text-urgency-progress-text border border-blue-200'
                                : patient.status === 'escalated'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : 'bg-urgency-moderate-bg text-urgency-moderate-text border border-amber-200'
                            }`}>
                              {patient.status === 'completed' ? 'Completed' :
                               patient.status === 'in_progress' ? 'Attending' :
                               patient.status === 'escalated' ? 'Escalated' : 'Waiting'}
                            </span>

                            {/* Chevron */}
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>

                        {/* Expanded details block */}
                        {isExpanded && (
                          <div className="border-t border-surface-border p-4 bg-slate-50/60 space-y-4">
                            
                            {/* SECTION B — AI INSIGHT CARD */}
                            <div className="bg-white rounded-xl border border-surface-border p-4 shadow-inner relative">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                                <div className="flex items-center gap-1.5">
                                  <Sparkles className="w-4 h-4 text-brand" />
                                  <span className="text-xs font-bold text-brand uppercase tracking-wider">AI Clinical Triage Summary</span>
                                </div>
                                <span className="text-[10px] font-mono bg-brand-light text-brand px-1.5 py-0.5 rounded font-bold">GEMINI AI</span>
                              </div>
                              
                              <p className="text-xs text-text-primary leading-relaxed">
                                {patient.aiSummary}
                              </p>
                              
                              <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-100 text-[11px]">
                                <div>
                                  <span className="text-text-tertiary">AI-Suggested Priority:</span>
                                  <span className={`ml-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    patient.aiSuggestedPriority === 'urgent' ? 'bg-red-50 text-red-700' :
                                    patient.aiSuggestedPriority === 'moderate' ? 'bg-amber-50 text-amber-700' :
                                    'bg-teal-50 text-teal-700'
                                  }`}>
                                    {patient.aiSuggestedPriority}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-text-tertiary">Confirmed Priority:</span>
                                  <span className="ml-2 font-bold text-text-primary">
                                    {patient.confirmedPriority ? (
                                      <span className="text-brand uppercase text-[10px] bg-brand-light px-2 py-0.5 rounded">
                                        {patient.confirmedPriority} (Manual)
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic">Not confirmed yet</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* SECTION C — PATIENT DETAILS */}
                            <div className="bg-white rounded-xl border border-surface-border p-4 text-xs space-y-3 shadow-inner">
                              <h4 className="font-bold text-[11px] text-text-secondary uppercase tracking-widest border-b border-slate-100 pb-1.5">Full Intake Specifications</h4>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-text-tertiary">Patient Contact</p>
                                  <p className="font-semibold text-text-primary">{patient.phone}</p>
                                </div>
                                <div>
                                  <p className="text-text-tertiary">Demographics</p>
                                  <p className="font-semibold text-text-primary">{patient.sex || 'Unknown'}, {patient.age} years old</p>
                                </div>
                                <div>
                                  <p className="text-text-tertiary">Self-assessed Urgency</p>
                                  <p className="font-semibold text-text-primary uppercase">{patient.selfUrgency}</p>
                                </div>
                                <div>
                                  <p className="text-text-tertiary">Arrival Timestamp</p>
                                  <p className="font-semibold text-text-primary">{new Date(patient.createdAt).toLocaleString()}</p>
                                </div>
                              </div>

                              <div className="space-y-1 pt-2">
                                <p className="text-text-tertiary">Symptom Checklist Selected</p>
                                <div className="flex flex-wrap gap-1.5 mt-0.5">
                                  {patient.symptoms.map(s => {
                                    const match = symptomList.find(sym => sym.id === s);
                                    return (
                                      <span key={s} className="bg-slate-100 text-text-secondary font-medium px-2 py-0.5 rounded text-[11px]">
                                        {match ? match.label : s}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              {patient.freeText && (
                                <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                                  <p className="text-text-tertiary font-medium">Patient Description Notes</p>
                                  <p className="bg-slate-50 p-2.5 rounded text-text-secondary leading-relaxed italic text-[11px]">
                                    &ldquo;{patient.freeText}&rdquo;
                                  </p>
                                </div>
                              )}

                              {patient.overrideReason && (
                                <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 mt-2 text-[11px]">
                                  <p className="font-bold text-amber-800">Priority Override Log:</p>
                                  <p className="text-amber-900 mt-0.5">{patient.overrideReason}</p>
                                </div>
                              )}

                              {/* Clinical shift annotations block */}
                              {patient.status === 'in_progress' && (
                                <div className="space-y-2 border-t border-slate-100 pt-3">
                                  <label className="block text-xs font-bold text-text-secondary uppercase">Clinical Notes &amp; Observations</label>
                                  <textarea
                                    value={staffNotesInput}
                                    onChange={(e) => setStaffNotesInput(e.target.value)}
                                    placeholder="Enter physical observations, initial blood pressures, treatment notes..."
                                    className="w-full border border-surface-border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand h-16"
                                  />
                                  <button
                                    onClick={() => {
                                      updatePatientState(patient.id, { notes: staffNotesInput });
                                      alert('Clinical note preserved successfully.');
                                    }}
                                    className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-lg text-[10px] font-bold"
                                  >
                                    Save Clinical Note
                                  </button>
                                </div>
                              )}

                              {patient.notes && (
                                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 mt-2 text-[11px]">
                                  <p className="font-bold text-blue-800">Preserved Consultation Notes:</p>
                                  <p className="text-blue-900 mt-0.5">{patient.notes}</p>
                                </div>
                              )}
                            </div>

                            {/* SECTION D — ACTION BUTTONS */}
                            <div className="flex flex-wrap gap-2.5 pt-2 border-t border-slate-200/60 justify-end">
                              {patient.status === 'waiting' && (
                                <>
                                  <button
                                    onClick={() => updatePatientState(patient.id, { confirmedPriority: patient.aiSuggestedPriority })}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition"
                                  >
                                    Confirm Priority
                                  </button>
                                  
                                  <button
                                    onClick={() => openOverrideModal(patient)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-text-secondary border border-surface-border hover:bg-slate-50 transition"
                                  >
                                    Override Priority
                                  </button>

                                  <button
                                    onClick={() => updatePatientState(patient.id, { status: 'in_progress' })}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 transition"
                                  >
                                    Mark Attending
                                  </button>

                                  <button
                                    onClick={() => updatePatientState(patient.id, { status: 'escalated' })}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200 border border-red-300 transition flex items-center gap-1.5"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>Escalate Critical</span>
                                  </button>
                                </>
                              )}

                              {patient.status === 'escalated' && (
                                <>
                                  <button
                                    onClick={() => updatePatientState(patient.id, { status: 'in_progress' })}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 transition"
                                  >
                                    Mark Attending
                                  </button>
                                  <button
                                    onClick={() => updatePatientState(patient.id, { status: 'completed' })}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                                  >
                                    Mark Completed
                                  </button>
                                </>
                              )}

                              {patient.status === 'in_progress' && (
                                <button
                                  onClick={() => updatePatientState(patient.id, { status: 'completed' })}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                                >
                                  Mark Completed
                                </button>
                              )}

                              {patient.status === 'completed' && (
                                <span className="text-xs text-text-tertiary italic flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-brand" />
                                  <span>Consultation closed at {patient.completedAt ? new Date(patient.completedAt).toLocaleTimeString() : 'N/A'}</span>
                                </span>
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          )}

        </main>
      )}

      {/* S3: OVERRIDE PRIORITY MODAL OVERLAY */}
      {overridePatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-surface-border p-5 w-full max-w-[440px] shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-text-primary text-base">Override Queue Priority</h3>
              <button onClick={() => setOverridePatient(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-text-tertiary">Patient name</p>
              <p className="text-sm font-semibold text-text-primary">{overridePatient.name} ({overridePatient.queueNumber})</p>
            </div>

            {/* Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-text-secondary uppercase">Set Priority To</label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-surface-border hover:bg-slate-50 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="overridePriorityRadio"
                    checked={overridePriority === 'minor'}
                    onChange={() => setOverridePriority('minor')}
                    className="text-brand focus:ring-brand"
                  />
                  <div>
                    <p className="font-semibold text-text-primary">Minor Priority</p>
                    <p className="text-[10px] text-text-tertiary">Stable condition. Routine clinical assessment queue.</p>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-surface-border hover:bg-slate-50 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="overridePriorityRadio"
                    checked={overridePriority === 'moderate'}
                    onChange={() => setOverridePriority('moderate')}
                    className="text-brand focus:ring-brand"
                  />
                  <div>
                    <p className="font-semibold text-text-primary">Moderate Priority</p>
                    <p className="text-[10px] text-text-tertiary">Requires secondary nurse screening. Checked periodically.</p>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-surface-border hover:bg-slate-50 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="overridePriorityRadio"
                    checked={overridePriority === 'urgent'}
                    onChange={() => setOverridePriority('urgent')}
                    className="text-brand focus:ring-brand"
                  />
                  <div>
                    <p className="font-semibold text-text-primary">Urgent Priority</p>
                    <p className="text-[10px] text-text-tertiary">Immediate examination. Pushes to head of waiting list.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Reason text */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-text-secondary uppercase">Override Reason / Justification</label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Patient appears more distressed than described, high age and fall risk."
                className="w-full border border-surface-border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand h-16 resize-none"
              />
            </div>

            <div className="flex gap-2.5 pt-2 justify-end">
              <button
                onClick={() => setOverridePatient(null)}
                className="px-4 py-2 border border-surface-border rounded-lg text-xs font-bold hover:bg-slate-50 text-text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOverride}
                disabled={isSavingOverride}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-xs font-bold transition shadow-sm"
              >
                {isSavingOverride ? 'Saving...' : 'Confirm Override'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
