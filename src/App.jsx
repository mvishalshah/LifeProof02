import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, BarChart3, BookOpen, CalendarDays, Check, ChevronRight,
  CircleUserRound, Clock3, FileText, Flame, Heart, Home, Lightbulb,
  ListChecks, LogOut, Menu, Plus, Search, Settings, Sparkles, Target,
  Trash2, TrendingUp, X, Zap
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { supabase, supabaseConfigured } from "./lib/supabase";

const CATEGORIES = ["Personal", "Education", "Career", "Health", "Achievement", "Travel"];
const MOODS = ["😊 Great", "🙂 Good", "😐 Neutral", "😔 Low", "🔥 Motivated"];

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric"
  });
}

function startOfDay() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoDate(d) {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
}

function daysAgo(n) {
  const d = startOfDay();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

async function loadUserData(userId) {
  const [profile, memories, habits, logs, links] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("memories").select("*").eq("user_id", userId).order("memory_date", { ascending: false }),
    supabase.from("habits").select("*").eq("user_id", userId).eq("active", true).order("created_at", { ascending: true }),
    supabase.from("habit_logs").select("*").eq("user_id", userId).order("log_date", { ascending: false }),
    supabase.from("habit_memory_links").select("*").eq("user_id", userId)
  ]);
  const err = [profile, memories, habits, logs, links].find((r) => r.error);
  if (err) throw err.error;
  return {
    profile: profile.data,
    memories: memories.data || [],
    habits: habits.data || [],
    logs: logs.data || [],
    links: links.data || []
  };
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) return <SetupScreen />;
  if (loading) return <Splash />;
  if (!session) return <Auth />;

  return <AuthenticatedApp session={session} />;
}

function Splash() {
  return <div className="splash"><div className="logo-mark">L</div><h1>LifeProof</h1><p>Loading your journey…</p></div>;
}

function SetupScreen() {
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="logo-mark">L</div>
        <h1>LifeProof</h1>
        <h2>Connect Supabase to start</h2>
        <p>Copy <code>.env.example</code> to <code>.env</code> and add your Supabase project URL and anon key.</p>
        <pre>{`VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY`}</pre>
        <p className="muted">Do not add a service_role key to the frontend.</p>
      </div>
    </div>
  );
}

function Auth() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMessage("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error, data } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: name } }
        });
        if (error) throw error;
        if (!data.session) setMessage("Account created. Check your email if confirmation is enabled.");
      }
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-art">
        <div className="orb orb-a"/><div className="orb orb-b"/>
        <div className="auth-copy">
          <span className="eyebrow"><Sparkles size={15}/> PERSONAL GROWTH, ORGANIZED</span>
          <h1>Your life.<br/><span>Your progress.</span><br/>Your story.</h1>
          <p>Capture meaningful moments, build better habits, and understand your journey over time.</p>
          <div className="mini-proof"><Heart size={17}/> One unified story</div>
        </div>
      </div>
      <div className="auth-panel">
        <div className="brand-row"><div className="logo-mark small">L</div><strong>LifeProof</strong></div>
        <div className="auth-box">
          <p className="eyebrow">WELCOME BACK</p>
          <h2>{mode === "login" ? "Continue your journey" : "Start your journey"}</h2>
          <p className="muted">{mode === "login" ? "Sign in to your personal dashboard." : "Create a private space for your memories and habits."}</p>
          <form onSubmit={submit}>
            {mode === "signup" && <label>Full name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" required/></label>}
            <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>
            <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" minLength="6" required/></label>
            {message && <div className="notice">{message}</div>}
            <button className="primary full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <ChevronRight size={17}/></button>
          </form>
          <button className="link-button" onClick={()=>{setMode(mode==="login"?"signup":"login");setMessage("")}}>
            {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedApp({ session }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState({ profile: null, memories: [], habits: [], logs: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setData(await loadUserData(session.user.id)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, [session.user.id]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  const page = location.pathname.replace("/", "") || "dashboard";

  if (loading) return <Splash/>;

  return (
    <div className="app-shell">
      <Sidebar page={page} mobile={mobileNav} close={()=>setMobileNav(false)} signOut={signOut}/>
      <div className="main-shell">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={()=>setMobileNav(true)}><Menu/></button>
          <div className="top-search"><Search size={17}/><input placeholder="Search your journey…" /></div>
          <div className="top-actions">
            <span className="date-chip"><CalendarDays size={15}/> {new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span>
            <div className="avatar">{(data.profile?.full_name || session.user.email || "U")[0].toUpperCase()}</div>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard data={data}/>}/>
            <Route path="/timeline" element={<Timeline data={data} refresh={refresh}/>}/>
            <Route path="/habits" element={<Habits data={data} refresh={refresh}/>}/>
            <Route path="/analytics" element={<Analytics data={data}/>}/>
            <Route path="/insights" element={<Insights data={data}/>}/>
            <Route path="/profile" element={<Profile data={data} refresh={refresh} session={session}/>}/>
            <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ page, mobile, close, signOut }) {
  const nav = [
    ["dashboard","Dashboard",Home], ["timeline","Timeline",CalendarDays],
    ["habits","Habits",ListChecks], ["analytics","Analytics",BarChart3],
    ["insights","Insights",Lightbulb]
  ];
  return (
    <>
      {mobile && <div className="nav-backdrop" onClick={close}/>}
      <aside className={`sidebar ${mobile ? "mobile-open":""}`}>
        <div className="brand"><div className="logo-mark small">L</div><span>LifeProof</span><button className="icon-btn mobile-only" onClick={close}><X/></button></div>
        <div className="side-caption">YOUR JOURNEY</div>
        <nav>{nav.map(([id,label,Icon])=><NavItem key={id} id={id} label={label} Icon={Icon} active={page===id} close={close}/>)}</nav>
        <div className="side-bottom">
          <NavItem id="profile" label="Profile" Icon={CircleUserRound} active={page==="profile"} close={close}/>
          <button className="side-item" onClick={signOut}><LogOut size={18}/> Sign out</button>
        </div>
      </aside>
    </>
  );
}

function NavItem({id,label,Icon,active,close}) {
  const navigate = useNavigate();
  return <button className={`side-item ${active?"active":""}`} onClick={()=>{navigate(`/${id}`);close?.()}}><Icon size={18}/><span>{label}</span>{active && <span className="active-dot"/>}</button>;
}

function PageHeader({eyebrow,title,description,action}) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({data}) {
  const { memories, habits, logs } = data;
  const today = isoDate(new Date());
  const completedToday = logs.filter(l=>l.log_date===today && l.completed).length;
  const completion = habits.length ? Math.round((completedToday/habits.length)*100) : 0;
  const streak = calculateOverallStreak(habits, logs);
  const recent = memories.slice(0,4);
  return <>
    <PageHeader eyebrow="YOUR JOURNEY" title={`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}${data.profile?.full_name?`, ${data.profile.full_name.split(" ")[0]}`:""}.`} description="Here’s a clear view of where your life is moving." action={<QuickAdd/>}/>
    <div className="stat-grid">
      <Stat icon={BookOpen} label="Memories" value={memories.length} hint="moments captured"/>
      <Stat icon={Flame} label="Current streak" value={`${streak}d`} hint="overall habit streak"/>
      <Stat icon={Target} label="Today's habits" value={`${completion}%`} hint={`${completedToday}/${habits.length||0} completed`}/>
      <Stat icon={TrendingUp} label="Active habits" value={habits.length} hint="currently tracking"/>
    </div>
    <div className="dashboard-grid">
      <section className="panel wide">
        <div className="panel-head"><div><h3>Journey timeline</h3><p>Your latest moments</p></div><LinkButton to="/timeline"/></div>
        {recent.length ? <div className="mini-timeline">{recent.map((m,i)=><MemoryRow key={m.id} memory={m} last={i===recent.length-1}/>)}</div> : <EmptyState icon={CalendarDays} title="Your story starts here" text="Capture your first meaningful moment." to="/timeline"/>}
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Today's habits</h3><p>Small actions, visible progress</p></div><LinkButton to="/habits"/></div>
        {habits.length ? <div className="habit-preview">{habits.slice(0,5).map(h=><HabitCheck key={h.id} habit={h} completed={logs.some(l=>l.habit_id===h.id&&l.log_date===today&&l.completed)} refresh={()=>{}} readonly/>)}</div> : <EmptyState icon={ListChecks} title="No habits yet" text="Create a habit to start tracking." to="/habits"/>}
      </section>
    </div>
  </>;
}

function Stat({icon:Icon,label,value,hint}) {
  return <div className="stat-card"><div className="stat-icon"><Icon size={19}/></div><div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-hint">{hint}</div></div></div>;
}

function QuickAdd() {
  const navigate=useNavigate();
  return <div className="header-actions"><button className="secondary" onClick={()=>navigate("/timeline")}><Plus size={17}/> Add memory</button><button className="primary" onClick={()=>navigate("/habits")}><Zap size={17}/> Track habit</button></div>;
}

function LinkButton({to}) {
  const navigate=useNavigate();
  return <button className="link-button" onClick={()=>navigate(to)}>View all <ChevronRight size={15}/></button>;
}

function Timeline({data,refresh}) {
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("All");
  const filtered=data.memories.filter(m=>{
    const text=`${m.title} ${m.description||""} ${(m.tags||[]).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (category==="All"||m.category===category);
  });
  return <>
    <PageHeader eyebrow="PERSONAL LIFE TIMELINE" title="Your story, one moment at a time." description="Capture memories with enough context to make them meaningful later." action={<button className="primary" onClick={()=>{setEditing(null);setOpen(true)}}><Plus size={17}/> Add memory</button>}/>
    <div className="toolbar"><div className="search-field"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search memories…"/></div><select value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
    <section className="panel timeline-panel">
      {filtered.length ? filtered.map((m,i)=><MemoryCard key={m.id} memory={m} last={i===filtered.length-1} edit={()=>{setEditing(m);setOpen(true)}} refresh={refresh}/>) : <EmptyState icon={CalendarDays} title="Nothing here yet" text={query?"Try another search.":"Add a meaningful moment to begin your timeline."}/>}
    </section>
    {open && <MemoryModal initial={editing} data={data} close={()=>setOpen(false)} refresh={refresh}/>}
  </>;
}

function MemoryCard({memory,last,edit,refresh}) {
  const [deleting,setDeleting]=useState(false);
  async function remove() {
    if(!confirm("Delete this memory?")) return;
    setDeleting(true);
    const {error}=await supabase.from("memories").delete().eq("id",memory.id);
    if(error) alert(error.message); else refresh();
    setDeleting(false);
  }
  return <div className="timeline-item"><div className="timeline-line"><div className="timeline-dot">{memory.mood?.split(" ")[0]||"•"}</div>{!last&&<div className="timeline-connector"/>}</div><div className="memory-card"><div className="memory-top"><span className="date">{formatDate(memory.memory_date)}</span><span className="pill">{memory.category}</span><div className="row-actions"><button className="icon-btn" onClick={edit}><Settings size={15}/></button><button className="icon-btn danger" disabled={deleting} onClick={remove}><Trash2 size={15}/></button></div></div><h3>{memory.title}</h3><p>{memory.description||"No description added."}</p>{memory.tags?.length>0&&<div className="tags">{memory.tags.map(t=><span key={t}>#{t}</span>)}</div>}</div></div>;
}

function MemoryRow({memory}) {
  return <div className="memory-row"><div className="memory-symbol">{memory.mood?.split(" ")[0]||"•"}</div><div><strong>{memory.title}</strong><span>{formatDate(memory.memory_date)} · {memory.category}</span></div></div>;
}

function MemoryModal({initial,data,close,refresh}) {
  const [form,setForm]=useState({title:initial?.title||"",description:initial?.description||"",memory_date:initial?.memory_date||isoDate(new Date()),category:initial?.category||"Personal",mood:initial?.mood||"😊 Great",tags:(initial?.tags||[]).join(", ")});
  const [busy,setBusy]=useState(false);
  async function save(e) {
    e.preventDefault(); setBusy(true);
    const payload={title:form.title,description:form.description,memory_date:form.memory_date,category:form.category,mood:form.mood,tags:form.tags.split(",").map(x=>x.trim().replace(/^#/,"")).filter(Boolean),user_id:data.profile?.id};
    const req=initial ? supabase.from("memories").update(payload).eq("id",initial.id) : supabase.from("memories").insert(payload);
    const {error}=await req;
    if(error) alert(error.message); else {close();refresh();}
    setBusy(false);
  }
  return <Modal title={initial?"Edit memory":"Capture a moment"} close={close}><form onSubmit={save} className="modal-form"><label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What happened?"/></label><div className="two-col"><label>Date<input type="date" required value={form.memory_date} onChange={e=>setForm({...form,memory_date:e.target.value})}/></label><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label></div><label>How did it feel?<select value={form.mood} onChange={e=>setForm({...form,mood:e.target.value})}>{MOODS.map(m=><option key={m}>{m}</option>)}</select></label><label>Description<textarea rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Add the context you'll want to remember…"/></label><label>Tags<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="hackathon, learning, milestone"/></label><button className="primary full" disabled={busy}>{busy?"Saving…":initial?"Save changes":"Save memory"}</button></form></Modal>;
}

function Habits({data,refresh}) {
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const today=isoDate(new Date());
  const completedToday=data.logs.filter(l=>l.log_date===today&&l.completed).map(l=>l.habit_id);
  async function toggle(habit) {
    const done=completedToday.includes(habit.id);
    if(done) await supabase.from("habit_logs").delete().eq("habit_id",habit.id).eq("log_date",today);
    else await supabase.from("habit_logs").upsert({habit_id:habit.id,user_id:data.profile.id,log_date:today,completed:true},{onConflict:"habit_id,log_date"});
    refresh();
  }
  return <>
    <PageHeader eyebrow="HABIT TRACKER" title="Small actions become visible progress." description="Keep the promises you make to yourself, one day at a time." action={<button className="primary" onClick={()=>{setEditing(null);setOpen(true)}}><Plus size={17}/> New habit</button>}/>
    <div className="habit-summary"><Stat icon={Flame} label="Overall streak" value={`${calculateOverallStreak(data.habits,data.logs)} days`} hint="based on tracked activity"/><Stat icon={Check} label="Today" value={`${completedToday.length}/${data.habits.length}`} hint="habits completed"/><Stat icon={Target} label="This month" value={`${monthlyCompletion(data.habits,data.logs)}%`} hint="completion rate"/></div>
    <section className="panel"><div className="panel-head"><div><h3>Today's habits</h3><p>Tap a habit when you've completed it.</p></div></div>{data.habits.length?<div className="habit-list">{data.habits.map(h=><HabitCheck key={h.id} habit={h} completed={completedToday.includes(h.id)} onToggle={()=>toggle(h)} edit={()=>{setEditing(h);setOpen(true)}} refresh={refresh}/>)}</div>:<EmptyState icon={ListChecks} title="Build your first habit" text="Start with something small and repeatable."/>}</section>
    {open&&<HabitModal initial={editing} data={data} close={()=>setOpen(false)} refresh={refresh}/>}
  </>;
}

function HabitCheck({habit,completed,onToggle,edit,refresh,readonly}) {
  const streak=calculateHabitStreak(habit.id, []);
  return <div className={`habit-row ${completed?"done":""}`}><button className="check-btn" onClick={onToggle} disabled={readonly}>{completed&&<Check size={17}/>}</button><div className="habit-info"><strong>{habit.name}</strong><span>{habit.description||`${habit.frequency} habit`}</span></div><div className="habit-meta"><span className="streak"><Flame size={14}/> {streak||0}</span>{!readonly&&<button className="icon-btn" onClick={edit}><Settings size={15}/></button>}</div></div>;
}

function HabitModal({initial,data,close,refresh}) {
  const [form,setForm]=useState({name:initial?.name||"",description:initial?.description||"",frequency:initial?.frequency||"daily"});
  const [busy,setBusy]=useState(false);
  async function save(e) {
    e.preventDefault();setBusy(true);
    const payload={name:form.name,description:form.description,frequency:form.frequency,user_id:data.profile.id};
    const req=initial?supabase.from("habits").update(payload).eq("id",initial.id):supabase.from("habits").insert(payload);
    const {error}=await req;
    if(error) alert(error.message);else{close();refresh();}
    setBusy(false);
  }
  async function remove(){if(!initial||!confirm("Delete this habit and its logs?"))return;await supabase.from("habits").delete().eq("id",initial.id);close();refresh();}
  return <Modal title={initial?"Edit habit":"Create a habit"} close={close}><form onSubmit={save} className="modal-form"><label>Habit name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Study for 45 minutes"/></label><label>Description<textarea rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Why does this habit matter?"/></label><label>Frequency<select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><button className="primary full" disabled={busy}>{busy?"Saving…":initial?"Save changes":"Create habit"}</button>{initial&&<button type="button" className="danger-button full" onClick={remove}>Delete habit</button>}</form></Modal>;
}

function Analytics({data}) {
  const daily=Array.from({length:7},(_,i)=>{const date=daysAgo(6-i);return {day:new Date(`${date}T00:00:00`).toLocaleDateString(undefined,{weekday:"short"}),completed:data.logs.filter(l=>l.log_date===date&&l.completed).length};});
  const category= CATEGORIES.map(c=>({name:c,value:data.memories.filter(m=>m.category===c).length})).filter(x=>x.value);
  const rate=monthlyCompletion(data.habits,data.logs);
  return <>
    <PageHeader eyebrow="PROGRESS ANALYTICS" title="See your progress, not just your activity." description="Simple visual signals that help you understand your journey."/>
    <div className="stat-grid"><Stat icon={TrendingUp} label="Monthly completion" value={`${rate}%`} hint="habit completion"/><Stat icon={BookOpen} label="Moments captured" value={data.memories.length} hint="all-time"/><Stat icon={Flame} label="Longest current streak" value={`${calculateOverallStreak(data.habits,data.logs)}d`} hint="tracked habits"/></div>
    <div className="chart-grid">
      <section className="panel chart-panel"><div className="panel-head"><div><h3>Last 7 days</h3><p>Completed habit check-ins</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={daily}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)"/><XAxis dataKey="day" axisLine={false} tickLine={false}/><YAxis allowDecimals={false} axisLine={false} tickLine={false}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="completed" radius={[6,6,0,0]} fill="currentColor"/></BarChart></ResponsiveContainer></div></section>
      <section className="panel chart-panel"><div className="panel-head"><div><h3>Memories by category</h3><p>What your story contains</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={category.length?category:[{name:"No data",value:0}]}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)"/><XAxis dataKey="name" axisLine={false} tickLine={false}/><YAxis allowDecimals={false} axisLine={false} tickLine={false}/><Tooltip contentStyle={tooltipStyle}/><Line type="monotone" dataKey="value" stroke="currentColor" strokeWidth={3} dot={{r:4}}/></LineChart></ResponsiveContainer></div></section>
    </div>
  </>;
}
const tooltipStyle={background:"#111827",border:"1px solid rgba(255,255,255,.12)",borderRadius:12,color:"#fff"};


function Insights({data}) {
  const insights=buildInsights(data);
  return <>
    <PageHeader eyebrow="PERSONAL INSIGHTS" title="Patterns worth noticing." description="LifeProof turns your stored journey into understandable signals."/>
    <div className="insight-grid">{insights.map((x,i)=><article className="insight-card" key={i}><div className="insight-icon"><x.icon size={20}/></div><div><span className="eyebrow">{x.label}</span><h3>{x.title}</h3><p>{x.text}</p></div></article>)}</div>
    <section className="panel unified-story"><div className="story-icon"><Sparkles/></div><div><div className="eyebrow">ONE UNIFIED STORY</div><h2>Your moments and habits can be read together.</h2><p>Connect a memory to a habit to preserve the context behind your progress. This is the foundation for LifeProof's journey perspective.</p></div></section>
  </>;
}

function buildInsights({memories,habits,logs}) {
  const out=[];
  const monthRate=monthlyCompletion(habits,logs);
  const bestCategory=Object.entries(memories.reduce((a,m)=>(a[m.category]=(a[m.category]||0)+1,a),{})).sort((a,b)=>b[1]-a[1])[0];
  const bestDay=dayWithMostLogs(logs);
  out.push({icon:TrendingUp,label:"GROWTH OVER TIME",title:monthRate>=70?"You're building consistency.":"Your progress has room to grow.",text:`Your current habit completion rate is ${monthRate}%. Use this as a baseline and look for small improvements rather than perfection.`});
  out.push({icon:CalendarDays,label:"JOURNEY PERSPECTIVE",title:bestCategory?`${bestCategory[0]} is a major part of your story.`:"Start documenting your story.",text:bestCategory?`You have captured ${bestCategory[1]} ${bestCategory[1]===1?"moment":"moments"} in this category.`:"Add meaningful moments so LifeProof can surface patterns over time."});
  out.push({icon:Zap,label:"LIFE–HABIT CONNECTION",title:bestDay?`${bestDay} is your most active day.`:"Keep checking in.",text:bestDay?`Your habit logs show the most completed check-ins on ${bestDay}.`:"Daily check-ins create the data needed for useful personal insights."});
  out.push({icon:Lightbulb,label:"PERSONALIZED INSIGHT",title:habits.length?`${habits.length} habit${habits.length>1?"s are":" is"} shaping your routine.`:"Create your first habit.",text:habits.length?"Keep the routine visible. Consistency becomes easier to understand when it is connected to your life moments.":"A simple daily habit is enough to start your progress history."});
  return out;
}

function dayWithMostLogs(logs){
  if(!logs.length)return null;
  const map={};
  logs.filter(l=>l.completed).forEach(l=>{const d=new Date(`${l.log_date}T00:00:00`).toLocaleDateString(undefined,{weekday:"long"});map[d]=(map[d]||0)+1});
  return Object.entries(map).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
}

function calculateHabitStreak(habitId, logs) {
  if (!logs.length) return 0;
  const dates=new Set(logs.filter(l=>l.habit_id===habitId&&l.completed).map(l=>l.log_date));
  let count=0,d=startOfDay();
  while(dates.has(isoDate(d))){count++;d.setDate(d.getDate()-1);}
  return count;
}

function calculateOverallStreak(habits,logs){
  if(!habits.length||!logs.length)return 0;
  let count=0;
  for(let i=0;i<365;i++){
    const day=daysAgo(i);
    const completed=new Set(logs.filter(l=>l.log_date===day&&l.completed).map(l=>l.habit_id));
    if(completed.size===0)break;
    count++;
  }
  return count;
}

function monthlyCompletion(habits,logs){
  if(!habits.length)return 0;
  const d=new Date(); const start=new Date(d.getFullYear(),d.getMonth(),1); const totalDays=d.getDate();
  const expected=habits.length*totalDays;
  const completed=logs.filter(l=>l.completed&&new Date(`${l.log_date}T00:00:00`)>=start).length;
  return Math.min(100,Math.round(completed/expected*100));
}

function Profile({data,refresh,session}){
  const [name,setName]=useState(data.profile?.full_name||"");
  const [saved,setSaved]=useState(false);
  async function save(){const {error}=await supabase.from("profiles").upsert({id:session.user.id,full_name:name});if(error)alert(error.message);else{setSaved(true);refresh();setTimeout(()=>setSaved(false),2000)}}
  return <><PageHeader eyebrow="PROFILE" title="Your LifeProof profile." description="Keep your identity and journey space personal."/><section className="panel profile-panel"><div className="profile-avatar">{(name||session.user.email||"U")[0].toUpperCase()}</div><div className="profile-form"><label>Full name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Email<input value={session.user.email||""} disabled/></label><button className="primary" onClick={save}>{saved?"Saved ✓":"Save profile"}</button></div></section></>;
}

function EmptyState({icon:Icon,title,text,to}){
  const navigate=useNavigate();
  return <div className="empty"><div className="empty-icon"><Icon size={22}/></div><h3>{title}</h3><p>{text}</p>{to&&<button className="secondary" onClick={()=>navigate(to)}>Get started</button>}</div>;
}

function Modal({title,close,children}){
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><div className="modal-head"><div><div className="eyebrow">LIFEPROOF</div><h2>{title}</h2></div><button className="icon-btn" onClick={close}><X/></button></div>{children}</div></div>;
}

export default App;