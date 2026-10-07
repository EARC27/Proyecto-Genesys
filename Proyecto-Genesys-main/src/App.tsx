import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  PhoneIncoming,
  PhoneCall,
  PhoneOff,
  Clock,
  ShieldCheck,
  Activity,
  RefreshCw,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Code,
  Users,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Info,
  Server,
  X,
  Play,
  Pause,
  Layers,
  BarChart3,
  TrendingUp,
  UserCheck,
  UserX,
  Headphones,
  SlidersHorizontal,
  ExternalLink
} from 'lucide-react';

type SeriesPoint = {
  label: string;
  offered: number;
  answered: number;
  abandoned: number;
  sla: number;
  asa: number;
  talk: number;
  hold: number;
  acw: number;
  aht: number;
};

// Helper to generate realistic random series based on time filter
const generateSeriesData = (range: string, dnis: string): SeriesPoint[] => {
  let points = 12;
  const labelPrefix = '';
  
  if (range === 'today') {
    points = 14; // Hourly from 08:00 to 21:00
  } else if (range === 'yesterday') {
    points = 14;
  } else if (range === '7d') {
    points = 7;
  } else if (range === '30d') {
    points = 10;
  } else if (range === 'ytd') {
    points = 12;
  } else {
    points = 8;
  }

  const data: SeriesPoint[] = [];
  const now = new Date();

  for (let i = 0; i < points; i++) {
    let label = '';
    if (range === 'today' || range === 'yesterday') {
      const hour = 8 + i;
      label = `${hour < 10 ? '0' + hour : hour}:00`;
    } else if (range === '7d') {
      const d = new Date();
      d.setDate(now.getDate() - (6 - i));
      label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    } else if (range === '30d') {
      label = `Day ${i * 3 + 1}`;
    } else if (range === 'ytd') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      label = months[i] || `M${i+1}`;
    } else {
      label = `Period ${i + 1}`;
    }

    const offered = Math.floor(Math.random() * 120) + 80;
    const answered = Math.floor(offered * (0.82 + Math.random() * 0.14));
    const abandoned = offered - answered;
    const sla = Math.round((answered / offered) * 100 * (0.92 + Math.random() * 0.08));
    const asa = Math.floor(Math.random() * 18) + 8; // seconds
    const talk = Math.floor(Math.random() * 80) + 180;
    const hold = Math.floor(Math.random() * 30) + 15;
    const acw = Math.floor(Math.random() * 25) + 20;
    const aht = talk + hold + acw;

    data.push({
      label,
      offered,
      answered,
      abandoned,
      sla: Math.min(100, sla),
      asa,
      talk,
      hold,
      acw,
      aht
    });
  }
  return data;
};

// Mock Agent Live State Data
const INITIAL_AGENTS = [
  { id: 'AG-101', name: 'Carlos Mendoza', state: 'On-Call', duration: '04:12', queue: 'Voice_DNIS_582129175656', handleCount: 28 },
  { id: 'AG-102', name: 'Sofia Rodriguez', state: 'On-Call', duration: '01:45', queue: 'Voice_DNIS_582129175656', handleCount: 34 },
  { id: 'AG-103', name: 'Alejandro Gomez', state: 'Idle', duration: '00:32', queue: 'Voice_DNIS_582129175656', handleCount: 31 },
  { id: 'AG-104', name: 'Mariana Silva', state: 'Wrap-Up', duration: '00:18', queue: 'Voice_DNIS_582129175656', handleCount: 25 },
  { id: 'AG-105', name: 'Gabriel Torres', state: 'On-Call', duration: '08:50', queue: 'Voice_DNIS_582129175656', handleCount: 19 },
  { id: 'AG-106', name: 'Valentina Fernandez', state: 'Break', duration: '12:05', queue: 'Voice_DNIS_582129175656', handleCount: 22 },
  { id: 'AG-107', name: 'Diego Martinez', state: 'Idle', duration: '01:10', queue: 'Voice_DNIS_582129175656', handleCount: 30 },
  { id: 'AG-108', name: 'Camila Lopez', state: 'On-Call', duration: '02:30', queue: 'Voice_DNIS_582129175656', handleCount: 27 },
];

export type GenesysRealTimeDashboardProps = {
  initialDnis?: string;
  initialMediaType?: string;
  defaultRange?: string;
};

const defaultDnis = import.meta.env.VITE_DEFAULT_DNIS ?? '582129175656';
const defaultMediaType = import.meta.env.VITE_DEFAULT_MEDIA ?? 'voice';

export function GenesysRealTimeDashboard({
  initialDnis = defaultDnis,
  initialMediaType = defaultMediaType,
  defaultRange = 'today'
}: GenesysRealTimeDashboardProps) {
  // Filters State
  const [selectedRange, setSelectedRange] = useState(defaultRange);
  const [dnis, setDnis] = useState(initialDnis);
  const [mediaType, setMediaType] = useState(initialMediaType);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('executive'); // 'executive', 'hourly', 'agents', 'api'
  const [showApiModal, setShowApiModal] = useState(false);
  const [showHoverAht, setShowHoverAht] = useState(false);

  // Dynamic Chart Data State
  const [seriesData, setSeriesData] = useState(() => generateSeriesData(defaultRange, initialDnis));
  const [agents, setAgents] = useState(INITIAL_AGENTS);

  // Live Queue Metrics State
  const [queueMetrics, setQueueMetrics] = useState({
    activeWaiting: 4,
    longestWaitSec: 42,
    availableAgents: 2,
    busyAgents: 4,
    wrapUpAgents: 1,
    offupAgents: 1
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            triggerDataRefresh();
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [autoRefresh, selectedRange, dnis]);

  // Regenerate series when time range changes
  useEffect(() => {
    setIsSyncing(true);
    setTimeout(() => {
      setSeriesData(generateSeriesData(selectedRange, dnis));
      setLastUpdated(new Date());
      setIsSyncing(false);
    }, 400);
  }, [selectedRange, dnis]);

  // Refresh handler
  const triggerDataRefresh = () => {
    setIsSyncing(true);
    setTimeout(() => {
      // Small jitter update for realism
      setSeriesData((prev) => {
        const copy = [...prev];
        if (copy.length > 0) {
          const last = { ...copy[copy.length - 1] };
          last.offered += Math.floor(Math.random() * 5);
          last.answered += Math.floor(Math.random() * 4);
          last.abandoned = Math.max(0, last.offered - last.answered);
          copy[copy.length - 1] = last;
        }
        return copy;
      });

      setQueueMetrics({
        activeWaiting: Math.floor(Math.random() * 7),
        longestWaitSec: Math.floor(Math.random() * 65) + 12,
        availableAgents: Math.floor(Math.random() * 4) + 1,
        busyAgents: 4 + Math.floor(Math.random() * 2),
        wrapUpAgents: Math.floor(Math.random() * 2),
        offupAgents: 1
      });

      setLastUpdated(new Date());
      setIsSyncing(false);
    }, 600);
  };

  const totals = useMemo(() => {
    const totalOffered = seriesData.reduce((acc, curr) => acc + curr.offered, 0);
    const totalAnswered = seriesData.reduce((acc, curr) => acc + curr.answered, 0);
    const totalAbandoned = seriesData.reduce((acc, curr) => acc + curr.abandoned, 0);
    
    const answerRate = totalOffered > 0 ? ((totalAnswered / totalOffered) * 100).toFixed(1) : 0;
    const abandonRate = totalOffered > 0 ? ((totalAbandoned / totalOffered) * 100).toFixed(1) : 0;
    
    const avgSla = seriesData.length > 0 ? Math.round(seriesData.reduce((acc, curr) => acc + curr.sla, 0) / seriesData.length) : 0;
    const avgAsa = seriesData.length > 0 ? Math.round(seriesData.reduce((acc, curr) => acc + curr.asa, 0) / seriesData.length) : 0;
    
    const avgTalk = seriesData.length > 0 ? Math.round(seriesData.reduce((acc, curr) => acc + curr.talk, 0) / seriesData.length) : 0;
    const avgHold = seriesData.length > 0 ? Math.round(seriesData.reduce((acc, curr) => acc + curr.hold, 0) / seriesData.length) : 0;
    const avgAcw = seriesData.length > 0 ? Math.round(seriesData.reduce((acc, curr) => acc + curr.acw, 0) / seriesData.length) : 0;
    const avgAht = avgTalk + avgHold + avgAcw;

    return {
      offered: totalOffered,
      answered: totalAnswered,
      abandoned: totalAbandoned,
      answerRate,
      abandonRate,
      sla: avgSla,
      asa: avgAsa,
      talk: avgTalk,
      hold: avgHold,
      acw: avgAcw,
      aht: avgAht
    };
  }, [seriesData]);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Dynamic max value for standard SVG chart scaling
  const maxVolume = useMemo(() => {
    return Math.max(...seriesData.map((d) => d.offered), 10);
  }, [seriesData]);

  const genesysApiPayload = {
    url: "https://apps.mxc1.pure.cloud/api/v2/analytics/conversations/aggregates/query",
    method: "POST",
    headers: {
      "Authorization": "Bearer <YOUR_ACCESS_TOKEN>",
      "Content-Type": "application/json",
      "PureCloud-Region": "mxc1.pure.cloud"
    },
    body: {
      interval: `${new Date(Date.now() - 86400000).toISOString()}/${new Date().toISOString()}`,
      groupBy: ["dnis", "mediaType", "queueId"],
      filter: {
        type: "and",
        clauses: [
          {
            type: "or",
            predicates: [
              { type: "dimension", dimension: "dnis", value: dnis },
              { type: "dimension", dimension: "mediaType", value: mediaType }
            ]
          }
        ]
      },
      metrics: [
        "nOffered",
        "nAnswered",
        "nAbandoned",
        "tAnswered",
        "tTalk",
        "tHeldComplete",
        "tAcw",
        "tHandle"
      ]
    }
  };

  return (
    <div className="dashboard-shell min-h-screen text-slate-100 font-sans flex flex-col antialiased selection:bg-cyan-500 selection:text-slate-950">
      
      {}
      <header className="glass-panel border-b border-slate-800/80 backdrop-blur sticky top-0 z-30 px-4 lg:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_12px_40px_rgba(2,6,23,0.45)]">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-cyan-500 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-cyan-500/20">
            <Activity className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Genesys PureCloud Real-Time Hub</h1>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/50 uppercase tracking-wide">
                mxc1.pure.cloud
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>DNIS: <strong className="text-slate-200 font-mono">{dnis}</strong></span>
              <span className="text-slate-600">•</span>
              <span>Media: <strong className="text-slate-200 uppercase">{mediaType}</strong></span>
            </div>
          </div>
        </div>

        {/* Right Header Status Controls */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Connection Status Pill */}
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
            <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
            <span className="text-slate-300 font-medium">
              {isSyncing ? 'Syncing Genesys...' : 'Connected'}
            </span>
            <span className="text-slate-500 text-[11px] border-l border-slate-700 pl-2">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          </div>

          {/* Auto Refresh Toggle & Countdown */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition font-medium ${
                autoRefresh 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' 
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>30s Auto-Sync</span>
            </button>
            {autoRefresh && (
              <div className="w-7 text-center font-mono font-semibold text-cyan-400 text-xs">
                {countdown}s
              </div>
            )}
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={triggerDataRefresh}
            disabled={isSyncing}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition active:scale-95 disabled:opacity-50"
            title="Manual Trigger Sync"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* API Modal Payload Inspector Trigger */}
          <button
            onClick={() => setShowApiModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-indigo-950/60 text-indigo-300 border border-indigo-700/40 px-3 py-1.5 rounded-lg font-medium transition"
          >
            <Code className="w-3.5 h-3.5" />
            <span>API Payload</span>
          </button>
        </div>
      </header>

      {}
      <div className="glass-panel border-b border-slate-800/80 px-4 lg:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Date Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Range:
          </span>
          {[
            { id: 'today', label: 'Real-Time (Today)' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: '7d', label: 'Last 7 Days' },
            { id: '30d', label: 'Last 30 Days' },
            { id: 'ytd', label: 'Year to Date (YTD)' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedRange(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selectedRange === item.id
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-semibold'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/40'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('executive')}
            className={`tab-button flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
              activeTab === 'executive'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Executive Dashboard
          </button>
          <button
            onClick={() => setActiveTab('hourly')}
            className={`tab-button flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
              activeTab === 'hourly'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Trend Analytics
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`tab-button flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
              activeTab === 'agents'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Agents & Queue Live
          </button>
        </div>
      </div>

      {}
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1600px] w-full mx-auto px-2 sm:px-4">

        {/* Live Queue Strip Banner */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Queue Calls Waiting</p>
              <p className="text-xl font-extrabold text-amber-400 mt-0.5">{queueMetrics.activeWaiting}</p>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <PhoneIncoming className="w-5 h-5 animate-bounce" />
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Max Queue Wait</p>
              <p className="text-xl font-extrabold text-rose-400 mt-0.5">{formatTime(queueMetrics.longestWaitSec)}</p>
            </div>
            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Idle Agents</p>
              <p className="text-xl font-extrabold text-emerald-400 mt-0.5">{queueMetrics.availableAgents}</p>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Agents On-Call</p>
              <p className="text-xl font-extrabold text-cyan-400 mt-0.5">{queueMetrics.busyAgents}</p>
            </div>
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
              <Headphones className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Wrap-Up State</p>
              <p className="text-xl font-extrabold text-indigo-400 mt-0.5">{queueMetrics.wrapUpAgents}</p>
            </div>
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Active DNIS Route</p>
              <p className="text-xs font-mono font-bold text-slate-200 mt-1 truncate max-w-[100px]">{dnis}</p>
            </div>
            <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
              <Server className="w-5 h-5" />
            </div>
          </div>
        </div>

        {}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          
          {/* Card 1: Offered */}
          <div className="metric-card metric-card--cyan rounded-2xl p-4 transition">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Offered</span>
              <PhoneIncoming className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-white tracking-tight">{totals.offered.toLocaleString()}</span>
              <span className="flex items-center text-xs font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> +4.2%
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Incoming Voice Routing</p>
          </div>

          {/* Card 2: Answered */}
          <div className="metric-card metric-card--emerald rounded-2xl p-4 transition">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Calls Answered</span>
              <PhoneCall className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-white tracking-tight">{totals.answered.toLocaleString()}</span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                {totals.answerRate}% Rate
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
              <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${totals.answerRate}%` }}></div>
            </div>
          </div>

          {/* Card 3: Abandoned */}
          <div className="metric-card metric-card--rose rounded-2xl p-4 transition">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Abandoned Calls</span>
              <PhoneOff className="w-4 h-4 text-rose-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-white tracking-tight">{totals.abandoned.toLocaleString()}</span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                Number(totals.abandonRate) > 5.0 
                  ? 'text-rose-400 bg-rose-950/60 border-rose-800/40' 
                  : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40'
              }`}>
                {totals.abandonRate}% Rate
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
              <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, Number(totals.abandonRate) * 3)}%` }}></div>
            </div>
          </div>

          {/* Card 4: SLA % */}
          <div className="metric-card metric-card--violet rounded-2xl p-4 transition">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Service Level (SLA)</span>
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-white tracking-tight">{totals.sla}%</span>
              <span className="text-[11px] text-slate-400">Target &ge; 80%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
              <div 
                className={`h-1.5 rounded-full ${totals.sla >= 80 ? 'bg-indigo-400' : 'bg-amber-400'}`} 
                style={{ width: `${totals.sla}%` }}
              ></div>
            </div>
          </div>

          {/* Card 5: ASA */}
          <div className="metric-card metric-card--amber rounded-2xl p-4 transition">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Avg Speed Answer</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-white tracking-tight">{totals.asa}s</span>
              <span className="text-xs font-medium text-slate-400">Target &le; 20s</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Queue Hold Delay</p>
          </div>

          {/* Card 6: AHT with Breakdown Popover */}
          <div 
            className="metric-card metric-card--sky rounded-2xl p-4 relative group cursor-pointer transition"
            onMouseEnter={() => setShowHoverAht(true)}
            onMouseLeave={() => setShowHoverAht(false)}
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Avg Handle Time</span>
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-white tracking-tight">{formatTime(totals.aht)}</span>
              <Info className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition" />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Talk + Hold + ACW</p>

            {/* Hover Breakdown Popover */}
            {showHoverAht && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl z-20 space-y-2 text-xs">
                <p className="font-bold text-slate-200 border-b border-slate-800 pb-1">AHT Breakdown</p>
                <div className="flex justify-between text-slate-300">
                  <span>Talk Time:</span>
                  <span className="font-mono font-semibold text-cyan-400">{formatTime(totals.talk)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Hold Time:</span>
                  <span className="font-mono font-semibold text-amber-400">{formatTime(totals.hold)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>After Call Work (ACW):</span>
                  <span className="font-mono font-semibold text-indigo-400">{formatTime(totals.acw)}</span>
                </div>
              </div>
            )}
          </div>

        </div>

        {}
        {activeTab === 'executive' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart 1: Volume Flow SVG Graphic */}
            <div className="lg:col-span-2 chart-panel rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" /> Incoming Call Volume Flow
                  </h3>
                  <p className="text-xs text-slate-400">Offered vs Answered vs Abandoned distribution across intervals</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500"></span>
                    <span className="text-slate-300">Offered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400"></span>
                    <span className="text-slate-300">Answered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
                    <span className="text-slate-300">Abandoned</span>
                  </div>
                </div>
              </div>

              {/* Custom High-Performance Responsive SVG Chart */}
              <div className="h-64 w-full flex items-end gap-2 pt-6 pb-2 px-2 border-b border-slate-800">
                {seriesData.map((item, idx) => {
                  const offeredHeight = (item.offered / maxVolume) * 100;
                  const answeredHeight = (item.answered / maxVolume) * 100;
                  const abndHeight = (item.abandoned / maxVolume) * 100;

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-slate-950 border border-slate-700 rounded-lg p-2.5 shadow-xl z-20 text-[11px] whitespace-nowrap min-w-[120px]">
                        <span className="font-bold text-cyan-400 border-b border-slate-800 pb-1 mb-1">{item.label}</span>
                        <div className="flex justify-between text-slate-300"><span>Offered:</span> <strong>{item.offered}</strong></div>
                        <div className="flex justify-between text-emerald-400"><span>Answered:</span> <strong>{item.answered}</strong></div>
                        <div className="flex justify-between text-rose-400"><span>Abandoned:</span> <strong>{item.abandoned}</strong></div>
                        <div className="flex justify-between text-indigo-300 mt-1 pt-1 border-t border-slate-800"><span>SLA:</span> <strong>{item.sla}%</strong></div>
                      </div>

                      {/* Bar Bars Group */}
                      <div className="w-full flex items-end justify-center gap-0.5 h-full">
                        <div 
                          className="w-1/3 bg-cyan-500/80 group-hover:bg-cyan-400 rounded-t transition-all" 
                          style={{ height: `${offeredHeight}%` }}
                        ></div>
                        <div 
                          className="w-1/3 bg-emerald-500/80 group-hover:bg-emerald-400 rounded-t transition-all" 
                          style={{ height: `${answeredHeight}%` }}
                        ></div>
                        <div 
                          className="w-1/3 bg-rose-500/80 group-hover:bg-rose-400 rounded-t transition-all" 
                          style={{ height: `${abndHeight}%` }}
                        ></div>
                      </div>

                      {/* Label */}
                      <span className="text-[10px] text-slate-500 font-mono mt-2 truncate w-full text-center">
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart 2: SLA & ASA Performance Gauge */}
            <div className="chart-panel rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Service Level SLA & Speed
                </h3>
                <p className="text-xs text-slate-400 mb-6">Target compliance tracking for DNIS {dnis}</p>

                {/* SLA Meter */}
                <div className="space-y-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-slate-300">Target SLA (&ge; 80%)</span>
                      <span className={`text-sm font-bold ${totals.sla >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {totals.sla}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${totals.sla >= 80 ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' : 'bg-amber-400'}`}
                        style={{ width: `${totals.sla}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* ASA Meter */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-slate-300">Avg Speed Answer (&le; 20s)</span>
                      <span className="text-sm font-bold text-amber-400">{totals.asa} seconds</span>
                    </div>
                    <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                      <div 
                        className="h-3 rounded-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${Math.min(100, (totals.asa / 30) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Genesys Media: Voice</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> SLA Compliant
                </span>
              </div>
            </div>

          </div>
        )}

        {}
        {activeTab === 'hourly' && (
          <div className="chart-panel rounded-2xl p-5">
            <h3 className="text-base font-bold text-white mb-1">AHT & Component Progression</h3>
            <p className="text-xs text-slate-400 mb-6">Historical trends for Talk Time, Hold Time, and ACW</p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Interval / Period</th>
                    <th className="p-3">Offered</th>
                    <th className="p-3">Answered</th>
                    <th className="p-3">Abandoned</th>
                    <th className="p-3">SLA %</th>
                    <th className="p-3">ASA (sec)</th>
                    <th className="p-3">Talk Time</th>
                    <th className="p-3">Hold Time</th>
                    <th className="p-3">ACW Time</th>
                    <th className="p-3 text-right">Total AHT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {seriesData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-semibold text-cyan-400">{row.label}</td>
                      <td className="p-3 text-slate-200">{row.offered}</td>
                      <td className="p-3 text-emerald-400">{row.answered}</td>
                      <td className="p-3 text-rose-400">{row.abandoned}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-bold ${row.sla >= 80 ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'}`}>
                          {row.sla}%
                        </span>
                      </td>
                      <td className="p-3 text-amber-300">{row.asa}s</td>
                      <td className="p-3 text-slate-300">{formatTime(row.talk)}</td>
                      <td className="p-3 text-slate-300">{formatTime(row.hold)}</td>
                      <td className="p-3 text-slate-300">{formatTime(row.acw)}</td>
                      <td className="p-3 font-bold text-white text-right">{formatTime(row.aht)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {}
        {activeTab === 'agents' && (
          <div className="chart-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" /> Active Agents Assigned to Queue
                </h3>
                <p className="text-xs text-slate-400">Real-time status monitoring for DNIS {dnis}</p>
              </div>
              <span className="text-xs font-mono bg-slate-800 px-3 py-1 rounded-lg text-slate-300">
                Total Agents: {agents.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {agents.map((agent) => {
                let statusBg = 'bg-slate-800 text-slate-300 border-slate-700';
                if (agent.state === 'On-Call') statusBg = 'bg-cyan-950 text-cyan-300 border-cyan-800/60';
                if (agent.state === 'Idle') statusBg = 'bg-emerald-950 text-emerald-300 border-emerald-800/60';
                if (agent.state === 'Wrap-Up') statusBg = 'bg-indigo-950 text-indigo-300 border-indigo-800/60';
                if (agent.state === 'Break') statusBg = 'bg-amber-950 text-amber-300 border-amber-800/60';

                return (
                  <div key={agent.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-sm text-slate-200">{agent.name}</h4>
                        <span className="text-[10px] font-mono text-slate-500">{agent.id}</span>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${statusBg}`}>
                        {agent.state}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-slate-900">
                      <span>State Time: <strong className="text-slate-200 font-mono">{agent.duration}</strong></span>
                      <span>Handled: <strong className="text-cyan-400 font-mono">{agent.handleCount}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {}
      {showApiModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Genesys Analytics API Query Payload</h3>
              </div>
              <button 
                onClick={() => setShowApiModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-400">
                To replicate this real-time dashboard without DOM scraping, issue the following payload to the official PureCloud Analytics Query endpoint:
              </p>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto text-cyan-300 max-h-96">
                <pre>{JSON.stringify(genesysApiPayload, null, 2)}</pre>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowApiModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                >
                  Close Inspector
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-3 px-6 text-center text-xs text-slate-500">
        Genesys Cloud Real-Time Incoming Calls Dashboard • DNIS: 582129175656 • Region: mxc1.pure.cloud
      </footer>

    </div>
  );
}

export default function App() {
  return <GenesysRealTimeDashboard />;
}