import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, BarChart3, Bell, BookOpen, CalendarDays, Check, ChevronRight,
  CircleUserRound, Clock3, FileBarChart, FileText, Flame, Heart, Home,
  ImagePlus, Lightbulb, ListChecks, LogOut, Menu, Plus, Search, Settings,
  Share2, Sparkles, Target, Trash2, TrendingUp, X, Zap
} from "lucide-react";
import Analytics from "./Analytics";
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

async function shareContent(title, text) {
  if (navigator.share) {
    await navigator.share({ title, text });
    return;
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error("Sharing is unavailable in this browser. Open the site over HTTPS or use a supported browser.");
  }
  await navigator.clipboard.writeText(text);
}

function getReportPeriod(period) {
  const end = startOfDay();
  const start = new Date(end);
  if (period === "week") {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
  } else {
    start.setDate(1);
  }
  const dayCount = Math.floor((end - start) / 86400000) + 1;
  return { start: isoDate(start), end: isoDate(end), dayCount };
}

function countCalendarWeeks(startValue, endValue) {
  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T00:00:00`);
  const weeks = new Set();
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const monday = new Date(date);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    weeks.add(isoDate(monday));
  }
  return weeks.size;
}

function decodeVapidKey(key) {
  const paddedKey=`${key}${"=".repeat((4-key.length%4)%4)}`;
  const base64=paddedKey.replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);
  return Uint8Array.from(raw,char=>char.charCodeAt(0));
}

function searchScore(query, values) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  const words = values.join(" ").toLocaleLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const matches = terms.filter(term => words.some(word => word.includes(term)));
  return matches.length === terms.length
    ? matches.reduce((score, term) => score + (words.some(word => word.startsWith(term)) ? 2 : 1), 0)
    : 0;
}

function parseSearchDate(query) {
  const match = query.match(
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[/. -](\d{1,2})(?:[/. -](\d{2,4}))?\b|\b(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{2,4}))?\b/i
  );
  if (!match) return null;

  let day;
  let month;
  let year;
  if (match[1]) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else if (match[4]) {
    day = Number(match[4]);
    month = Number(match[5]);
    year = match[6] ? Number(match[6]) : null;
  } else {
    day = Number(match[7]);
    const monthText = match[8].toLowerCase();
    month = ["january","february","march","april","may","june","july","august","september","october","november","december"]
      .findIndex(name => name.startsWith(monthText.slice(0, 3))) + 1;
    year = match[9] ? Number(match[9]) : null;
  }
  if (!month || month > 12 || day < 1 || day > 31) return null;
  if (year !== null && year < 100) year += year < 50 ? 2000 : 1900;
  const validationYear=year??2000;
  const validationDate=new Date(validationYear,month-1,day);
  if(validationDate.getFullYear()!==validationYear||validationDate.getMonth()!==month-1||validationDate.getDate()!==day)return null;

  return {
    day, month, year,
    remainder: query.replace(match[0], " ").replace(/\s+/g, " ").trim()
  };
}

function matchesSearchDate(value, searchDate) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return day === searchDate.day && month === searchDate.month
    && (searchDate.year === null || year === searchDate.year);
}

function dateSearchValue(searchDate) {
  const year=searchDate.year??new Date().getFullYear();
  return `${year}-${String(searchDate.month).padStart(2, "0")}-${String(searchDate.day).padStart(2, "0")}`;
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
  async function shareWebsite() {
    try {
      await shareContent("LifeProof", `Track your habits and life journey with LifeProof: ${window.location.origin}`);
      if (!navigator.share) alert("Website link copied to clipboard.");
    } catch (error) {
      if (error?.name !== "AbortError") alert(error?.message || "Could not share the website link.");
    }
  }

  if (loading) return <Splash/>;

  return (
    <div className="app-shell">
      <Sidebar page={page} mobile={mobileNav} close={()=>setMobileNav(false)} signOut={signOut} shareWebsite={shareWebsite}/>
      <div className="main-shell">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={()=>setMobileNav(true)}><Menu/></button>
          <GlobalSearch data={data}/>
          <div className="top-actions">
            <span className="date-chip"><CalendarDays size={15}/> {new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span>
            <button className="header-profile-button" onClick={()=>navigate("/explore")} aria-label="Explore people">
              {data.profile?.avatar_url
                ? <img className="avatar avatar-image" src={data.profile.avatar_url} alt="Explore people"/>
                : <span className="avatar">{(data.profile?.full_name || session.user.email || "U")[0].toUpperCase()}</span>}
            </button>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard data={data}/>}/>
            <Route path="/timeline" element={<Timeline data={data} userId={session.user.id} refresh={refresh}/>}/>
            <Route path="/habits" element={<Habits data={data} userId={session.user.id} refresh={refresh}/>}/>
            <Route path="/analytics" element={<Analytics data={data}/>}/>
            <Route path="/explore" element={<Explore userId={session.user.id}/>}/>
            <Route path="/insights" element={<Insights data={data}/>}/>
            <Route path="/reports" element={<Reports data={data}/>}/>
            <Route path="/profile" element={<Profile data={data} refresh={refresh} session={session}/>}/>
            <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
          </Routes>
        </main>
      </div>
    </div>
  );
}

function GlobalSearch({data}) {
  const navigate=useNavigate();
  const [query,setQuery]=useState("");
  const search=query.trim();
  const dateSearch=parseSearchDate(search);
  const textQuery=dateSearch?dateSearch.remainder:search;
  const datedLogs=dateSearch?data.logs.filter(log=>matchesSearchDate(log.log_date,dateSearch)):[];
  const datedHabitIds=new Set(datedLogs.map(log=>log.habit_id));
  const memoryResults=data.memories.filter(memory=>dateSearch
    ?matchesSearchDate(memory.memory_date,dateSearch)
    :true).map(memory=>({
    type:"Memory",
    title:memory.title,
    detail:[memory.category,formatDate(memory.memory_date),memory.description].filter(Boolean).join(" · "),
    target:dateSearch
      ?`/timeline?date=${encodeURIComponent(memory.memory_date)}`
      :`/timeline?q=${encodeURIComponent(memory.title)}`,
    score:dateSearch
      ?(textQuery?searchScore(textQuery,[memory.title,memory.description||"",memory.category,(memory.tags||[]).join(" ")]):1)
      :searchScore(textQuery,[memory.title,memory.description||"",memory.category,(memory.tags||[]).join(" ")])
  })).filter(result=>result.score).sort((a,b)=>b.score-a.score).slice(0,5);
  const habitResults=data.habits.filter(habit=>dateSearch
    ?datedHabitIds.has(habit.id)||(habit.frequency==="daily"&&habit.created_at?.slice(0,10)<=dateSearchValue(dateSearch))
    :true).map(habit=>({
    type:"Habit",
    title:habit.name,
    detail:dateSearch
      ?`${habit.frequency} · ${formatDate(datedLogs.find(log=>log.habit_id===habit.id)?.log_date||dateSearchValue(dateSearch))}`
      :[habit.frequency,habit.description].filter(Boolean).join(" · "),
    target:dateSearch
      ?`/habits?date=${encodeURIComponent(datedLogs.find(log=>log.habit_id===habit.id)?.log_date||dateSearchValue(dateSearch))}`
      :`/habits?q=${encodeURIComponent(habit.name)}`,
    score:dateSearch
      ?(textQuery?searchScore(textQuery,[habit.name,habit.description||"",habit.frequency]):1)
      :searchScore(textQuery,[habit.name,habit.description||"",habit.frequency])
  })).filter(result=>result.score).sort((a,b)=>b.score-a.score).slice(0,5);
  const memories=memoryResults;
  const habits=habitResults;
  const results=[...memories,...habits];

  function openResult(target) {
    navigate(target);
    setQuery("");
  }

  return <div className="global-search">
    <div className="top-search"><Search size={17}/><input
      value={query}
      onChange={event=>setQuery(event.target.value)}
      onKeyDown={event=>{if(event.key==="Escape")setQuery("");if(event.key==="Enter"&&results[0])openResult(results[0].target)}}
      placeholder="Search habits and memories by name or date…"
      aria-label="Search habits and memories"
      aria-expanded={Boolean(search)}
      aria-controls="global-search-results"
    />{query&&<button className="search-clear" aria-label="Clear search" onClick={()=>setQuery("")}><X size={15}/></button>}</div>
    {search&&<div className="search-results" id="global-search-results" role="listbox">
      {results.length?<>
        {memories.length>0&&<div className="search-group-label">MEMORIES</div>}
        {memories.map((result,index)=><button key={`memory-${index}`} className="search-result" role="option" aria-selected="false" onClick={()=>openResult(result.target)}><span className="search-result-icon"><BookOpen size={16}/></span><span className="search-result-copy"><strong>{result.title}</strong><small>{result.detail}</small></span></button>)}
        {habits.length>0&&<div className="search-group-label">HABITS</div>}
        {habits.map((result,index)=><button key={`habit-${index}`} className="search-result" role="option" aria-selected="false" onClick={()=>openResult(result.target)}><span className="search-result-icon"><ListChecks size={16}/></span><span className="search-result-copy"><strong>{result.title}</strong><small>{result.detail}</small></span></button>)}
      </>:<div className="search-empty">No habits or memories match “{search}”. Try 2 Oct, 2 October 2026, or 2/10/26.</div>}
    </div>}
  </div>;
}

function Explore({userId}) {
  const [query,setQuery]=useState("");
  const [people,setPeople]=useState([]);
  const [selected,setSelected]=useState(null);
  const [habits,setHabits]=useState([]);
  const [searching,setSearching]=useState(false);
  const [loadingProgress,setLoadingProgress]=useState(false);
  const [error,setError]=useState("");

  async function searchPeople(event) {
    event.preventDefault();
    const name=query.trim();
    if(!name)return;
    setSearching(true);
    setSelected(null);
    setHabits([]);
    setError("");
    try {
      const {data,error:searchError}=await supabase.rpc("search_explore_profiles",{search_name:name});
      if(searchError)throw searchError;
      setPeople(data||[]);
    } catch(requestError) {
      setError(requestError?.message||"Could not search for people.");
      setPeople([]);
    } finally {
      setSearching(false);
    }
  }

  async function openPerson(person) {
    setSelected(person);
    setHabits([]);
    setLoadingProgress(true);
    setError("");
    try {
      const {data,error:progressError}=await supabase.rpc("get_explore_habit_summary",{target_user_id:person.id});
      if(progressError)throw progressError;
      setHabits(data||[]);
    } catch(requestError) {
      setError(requestError?.message||"Could not load this person's public habit progress.");
    } finally {
      setLoadingProgress(false);
    }
  }

  const weeklyDone=habits.reduce((total,habit)=>total+Number(habit.completed_this_week||0),0);
  const weeklyGoal=habits.reduce((total,habit)=>total+Number(habit.week_goal||0),0);
  const weeklyRate=weeklyGoal?Math.round(weeklyDone/weeklyGoal*100):0;
  const todayDone=habits.filter(habit=>habit.completed_today).length;

  return <>
    <PageHeader eyebrow="COMMUNITY" title={selected?selected.full_name:"Explore"} description={selected?"Only today's habit check-ins and this week's progress are shown.":"Find people by name and get inspired by their habit progress."} action={selected&&<button className="secondary" onClick={()=>{setSelected(null);setError("");}}><ChevronRight size={15} className="back-chevron"/> Back to search</button>}/>
    {!selected&&<section className="panel explore-search-panel">
      <form className="explore-search-form" onSubmit={searchPeople}>
        <label htmlFor="explore-name">Search people by name</label>
        <div className="explore-search-input"><Search size={18}/><input id="explore-name" value={query} onChange={event=>{setQuery(event.target.value);setPeople([]);}} placeholder="Enter a name…" autoComplete="off"/><button className="primary" type="submit" disabled={searching||!query.trim()}>{searching?"Searching…":"Search"}</button></div>
      </form>
      {error&&<div className="notice" role="alert">{error}</div>}
      {people.length>0&&<div className="explore-results" aria-label="People search results">
        {people.map(person=><button className="explore-person" key={person.id} onClick={()=>openPerson(person)}><span className="avatar">{(person.full_name||"U")[0].toUpperCase()}</span><span><strong>{person.full_name}</strong><small>View today's habits and weekly progress</small></span><ChevronRight size={17}/></button>)}
      </div>}
      {!searching&&!error&&query.trim()&&people.length===0&&<p className="explore-empty">No profiles found for “{query.trim()}”.</p>}
    </section>}
    {selected&&<section className="panel explore-progress-panel">
      {error&&<div className="notice" role="alert">{error}</div>}
      {loadingProgress?<div className="explore-empty">Loading public habit progress…</div>:error?null:<>
        <div className="explore-metrics">
          <div><span>Today's habits</span><strong>{todayDone}<small> / {habits.length} completed</small></strong></div>
          <div><span>This week's progress</span><strong>{weeklyRate}%</strong><small>{weeklyDone} of {weeklyGoal} scheduled check-ins</small></div>
        </div>
        <div className="explore-week-progress" role="progressbar" aria-valuenow={weeklyRate} aria-valuemin="0" aria-valuemax="100" aria-label="Weekly habit progress"><span style={{width:`${weeklyRate}%`}}/></div>
        <div className="explore-habit-heading"><h2>Today's habits</h2><span>{new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</span></div>
        {habits.length?<div className="explore-habit-list">{habits.map(habit=><div className="explore-habit" key={habit.habit_id}><span className={`explore-habit-check${habit.completed_today?" completed":""}`}>{habit.completed_today?<Check size={15}/>:<CircleUserRound size={14}/>}</span><strong>{habit.habit_name}</strong><span className={`explore-habit-status${habit.completed_today?" completed":""}`}>{habit.completed_today?"Completed today":"Not checked in"}</span></div>)}</div>:<p className="explore-empty">No active habits to show yet.</p>}
      </>}
    </section>}
  </>;
}

function Sidebar({ page, mobile, close, signOut, shareWebsite }) {
  const nav = [
    ["dashboard","Dashboard",Home], ["timeline","Timeline",CalendarDays],
    ["habits","Habits",ListChecks], ["analytics","Analytics",BarChart3],
    ["insights","Insights",Lightbulb], ["reports","Reports",FileBarChart]
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
          <button className="side-item" onClick={()=>{shareWebsite();close?.()}}><Share2 size={18}/><span>Share website</span></button>
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
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const bedtimeReminder = hour >= 22;
  const today = isoDate(new Date());
  const completedToday = logs.filter(l=>l.log_date===today && l.completed).length;
  const completion = habits.length ? Math.round((completedToday/habits.length)*100) : 0;
  const streak = calculateOverallStreak(habits, logs);
  const recent = memories.slice(0,4);
  return <>
    <PageHeader eyebrow="YOUR JOURNEY" title={`Good ${greeting}${data.profile?.full_name?`, ${data.profile.full_name.split(" ")[0]}`:""}.`} description={bedtimeReminder?"It’s getting late. Consider winding down for bed after 10 PM to support healthy sleep.":"Here’s a clear view of where your life is moving."} action={<QuickAdd/>}/>
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

function Timeline({data,userId,refresh}) {
  const location=useLocation();
  const navigate=useNavigate();
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [query,setQuery]=useState(()=>new URLSearchParams(location.search).get("q")||"");
  const [category,setCategory]=useState("All");
  useEffect(()=>{setQuery(new URLSearchParams(location.search).get("q")||"");},[location.search]);
  const dateFilter=new URLSearchParams(location.search).get("date")||"";
  const filtered=data.memories.filter(m=>{
    const text=`${m.title} ${m.description||""} ${(m.tags||[]).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!dateFilter||m.memory_date===dateFilter) && (category==="All"||m.category===category);
  });
  return <>
    <PageHeader eyebrow="PERSONAL LIFE TIMELINE" title="Your story, one moment at a time." description="Capture memories with enough context to make them meaningful later." action={<button className="primary" onClick={()=>{setEditing(null);setOpen(true)}}><Plus size={17}/> Add memory</button>}/>
    <div className="toolbar"><div className="search-field"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search memories…"/></div><select value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
    {dateFilter&&<div className="date-filter-banner"><span>Memories from {formatDate(dateFilter)}</span><button className="link-button" onClick={()=>navigate("/timeline")}>Clear date filter <X size={14}/></button></div>}
    <section className="panel timeline-panel">
      {filtered.length ? filtered.map((m,i)=><MemoryCard key={m.id} memory={m} last={i===filtered.length-1} edit={()=>{setEditing(m);setOpen(true)}} refresh={refresh}/>) : <EmptyState icon={CalendarDays} title="Nothing here yet" text={query?"Try another search.":"Add a meaningful moment to begin your timeline."}/>}
    </section>
    {open && <MemoryModal initial={editing} userId={userId} close={()=>setOpen(false)} refresh={refresh}/>}
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

function MemoryModal({initial,userId,close,refresh}) {
  const [form,setForm]=useState({title:initial?.title||"",description:initial?.description||"",memory_date:initial?.memory_date||isoDate(new Date()),category:initial?.category||"Personal",mood:initial?.mood||"😊 Great",tags:(initial?.tags||[]).join(", ")});
  const [busy,setBusy]=useState(false);
  async function save(e) {
    e.preventDefault(); setBusy(true);
    const payload={title:form.title,description:form.description,memory_date:form.memory_date,category:form.category,mood:form.mood,tags:form.tags.split(",").map(x=>x.trim().replace(/^#/,"")).filter(Boolean),user_id:userId};
    const req=initial ? supabase.from("memories").update(payload).eq("id",initial.id) : supabase.from("memories").insert(payload);
    const {error}=await req;
    if(error) alert(error.message); else {close();refresh();}
    setBusy(false);
  }
  return <Modal title={initial?"Edit memory":"Capture a moment"} close={close}><form onSubmit={save} className="modal-form"><label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What happened?"/></label><div className="two-col"><label>Date<input type="date" required value={form.memory_date} onChange={e=>setForm({...form,memory_date:e.target.value})}/></label><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label></div><label>How did it feel?<select value={form.mood} onChange={e=>setForm({...form,mood:e.target.value})}>{MOODS.map(m=><option key={m}>{m}</option>)}</select></label><label>Description<textarea rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Add the context you'll want to remember…"/></label><label>Tags<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="hackathon, learning, milestone"/></label><button className="primary full" disabled={busy}>{busy?"Saving…":initial?"Save changes":"Save memory"}</button></form></Modal>;
}

function Habits({data,userId,refresh}) {
  const location=useLocation();
  const navigate=useNavigate();
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [query,setQuery]=useState(()=>new URLSearchParams(location.search).get("q")||"");
  const [pushBusy,setPushBusy]=useState(false);
  const [pushMessage,setPushMessage]=useState("");
  useEffect(()=>{setQuery(new URLSearchParams(location.search).get("q")||"");},[location.search]);
  const today=isoDate(new Date());
  const historyDate=new URLSearchParams(location.search).get("date")||"";
  const selectedDate=historyDate||today;
  const historyLogs=data.logs.filter(log=>log.log_date===selectedDate);
  const completedToday=data.logs.filter(l=>l.log_date===today&&l.completed).map(l=>l.habit_id);
  const filteredHabits=data.habits.filter(habit=>{
    const matchesQuery=!query.trim()||searchScore(query,[habit.name,habit.description||"",habit.frequency])>0;
    if(!matchesQuery)return false;
    if(!historyDate)return true;
    const created=habit.created_at?.slice(0,10);
    const logged=historyLogs.some(log=>log.habit_id===habit.id);
    const weekday=new Date(`${selectedDate}T00:00:00`).getDay()||7;
    const weeklyDue=habit.frequency==="weekly"&&habit.reminder_weekday===weekday;
    return (!created||created<=selectedDate)&&(logged||habit.frequency==="daily"||weeklyDue);
  });
  function statusForDate(habit) {
    if(historyLogs.some(log=>log.habit_id===habit.id&&log.completed))return "Completed";
    if(historyLogs.some(log=>log.habit_id===habit.id&&!log.completed))return "Missed";
    return selectedDate<today&&habit.frequency==="daily"?"Missed":"Not checked in";
  }
  async function enablePushReminders() {
    setPushBusy(true);
    setPushMessage("");
    try {
      const vapidPublicKey=import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if(!vapidPublicKey) throw new Error("Push reminders are not configured yet. Add VITE_VAPID_PUBLIC_KEY and restart the app.");
      if(!("serviceWorker" in navigator)||!("PushManager" in window)) throw new Error("This browser does not support push notifications.");
      const permission=await Notification.requestPermission();
      if(permission!=="granted") throw new Error("Allow notifications for this site in your browser to enable reminders.");
      await navigator.serviceWorker.register("/sw.js");
      const readyRegistration=await navigator.serviceWorker.ready;
      const existing=await readyRegistration.pushManager.getSubscription();
      const subscription=existing||await readyRegistration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:decodeVapidKey(vapidPublicKey)
      });
      const {error}=await supabase.from("habit_push_subscriptions").upsert({
        user_id:userId,
        endpoint:subscription.endpoint,
        subscription:subscription.toJSON()
      },{onConflict:"endpoint"});
      if(error) {
        if(!existing) await subscription.unsubscribe();
        throw error;
      }
      setPushMessage("Push reminders are enabled on this device.");
    } catch(error) {
      setPushMessage(error?.message||"Could not enable push reminders.");
    } finally {
      setPushBusy(false);
    }
  }
  async function toggle(habit) {
    const done=completedToday.includes(habit.id);
    if(done) await supabase.from("habit_logs").delete().eq("habit_id",habit.id).eq("log_date",today);
    else await supabase.from("habit_logs").upsert({habit_id:habit.id,user_id:userId,log_date:today,completed:true},{onConflict:"habit_id,log_date"});
    refresh();
  }
  return <>
    <PageHeader eyebrow={historyDate?"HABIT HISTORY":"HABIT TRACKER"} title={historyDate?`Habits on ${formatDate(historyDate)}`:"Small actions become visible progress."} description={historyDate?"A read-only view of your habits for this date.":"Keep the promises you make to yourself, one day at a time."} action={historyDate?<button className="secondary" onClick={()=>navigate("/habits")}>Return to today</button>:<button className="primary" onClick={()=>{setEditing(null);setOpen(true)}}><Plus size={17}/> New habit</button>}/>
    <div className="habit-summary"><Stat icon={Flame} label="Overall streak" value={`${calculateOverallStreak(data.habits,data.logs)} days`} hint="based on tracked activity"/><Stat icon={Check} label="Today" value={`${completedToday.length}/${data.habits.length}`} hint="habits completed"/><Stat icon={Target} label="This month" value={`${monthlyCompletion(data.habits,data.logs)}%`} hint="completion rate"/></div>
    <section className="panel"><div className="panel-head"><div><h3>{historyDate?"Habit check-ins":"Today's habits"}</h3><p>{historyDate?"Historical check-ins are read-only.":"Tap a habit when you've completed it."}</p></div>{!historyDate&&<button className="secondary" type="button" onClick={enablePushReminders} disabled={pushBusy}><Bell size={16}/>{pushBusy?"Enabling…":"Enable reminders"}</button>}</div>{pushMessage&&<div className="notice push-notice" role="status">{pushMessage}</div>}<div className="search-field habit-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter habits…"/></div>{filteredHabits.length?<div className="habit-list">{filteredHabits.map(h=><HabitCheck key={h.id} habit={h} completed={historyDate?historyLogs.some(log=>log.habit_id===h.id&&log.completed):completedToday.includes(h.id)} statusLabel={historyDate?statusForDate(h):""} readonly={Boolean(historyDate)} onToggle={()=>toggle(h)} edit={()=>{setEditing(h);setOpen(true)}} refresh={refresh}/>)}</div>:<EmptyState icon={ListChecks} title={data.habits.length?"No habits match":"Build your first habit"} text={data.habits.length?"Try a shorter or different keyword.":"Start with something small and repeatable."}/>}</section>
    {open&&<HabitModal initial={editing} userId={userId} close={()=>setOpen(false)} refresh={refresh}/>}
  </>;
}

function HabitCheck({habit,completed,onToggle,edit,refresh,readonly,statusLabel}) {
  const streak=calculateHabitStreak(habit.id, []);
  const weekdays=["","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const reminder=habit.reminder_time
    ? `Reminder ${habit.reminder_time.slice(0,5)}${habit.frequency==="weekly"&&habit.reminder_weekday?` · ${weekdays[habit.reminder_weekday]}`:""}`
    : "";
  const detail=[habit.description||`${habit.frequency} habit`,reminder,statusLabel].filter(Boolean).join(" · ");
  return <div className={`habit-row ${completed?"done":""} ${statusLabel==="Missed"?"history-missed":""}`}><button className="check-btn" onClick={onToggle} disabled={readonly}>{completed&&<Check size={17}/>}</button><div className="habit-info"><strong>{habit.name}</strong><span>{detail}</span></div><div className="habit-meta"><span className="streak"><Flame size={14}/> {streak||0}</span>{!readonly&&<button className="icon-btn" onClick={edit}><Settings size={15}/></button>}</div></div>;
}

function HabitModal({initial,userId,close,refresh}) {
  const [form,setForm]=useState({name:initial?.name||"",description:initial?.description||"",frequency:initial?.frequency||"daily",reminder_time:initial?.reminder_time?.slice(0,5)||"",reminder_weekday:String(initial?.reminder_weekday||1)});
  const [busy,setBusy]=useState(false);
  async function save(e) {
    e.preventDefault();setBusy(true);
    try {
      const payload={
        name:form.name,
        description:form.description,
        frequency:form.frequency,
        reminder_time:form.reminder_time||null,
        reminder_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC",
        reminder_weekday:form.frequency==="weekly"&&form.reminder_time?Number(form.reminder_weekday):null,
        user_id:userId
      };
      const req=initial?supabase.from("habits").update(payload).eq("id",initial.id):supabase.from("habits").insert(payload);
      const {error}=await req;
      if(error) throw error;
      close();
      refresh();
    } catch(error) {
      alert(error?.message || "Could not save the habit. Check your Supabase connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(){if(!initial||!confirm("Delete this habit and its logs?"))return;await supabase.from("habits").delete().eq("id",initial.id);close();refresh();}
  return <Modal title={initial?"Edit habit":"Create a habit"} close={close}><form onSubmit={save} className="modal-form"><label>Habit name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Study for 45 minutes"/></label><label>Description<textarea rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Why does this habit matter?"/></label><label>Frequency<select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label>Reminder time <span className="field-hint">Optional · uses your local timezone</span><input type="time" value={form.reminder_time} onChange={e=>setForm({...form,reminder_time:e.target.value})}/></label>{form.frequency==="weekly"&&form.reminder_time&&<label>Remind me every<select value={form.reminder_weekday} onChange={e=>setForm({...form,reminder_weekday:e.target.value})}><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="7">Sunday</option></select></label>}<button className="primary full" disabled={busy}>{busy?"Saving…":initial?"Save changes":"Create habit"}</button>{initial&&<button type="button" className="danger-button full" onClick={remove}>Delete habit</button>}</form></Modal>;
}

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
  const [avatarUrl,setAvatarUrl]=useState(data.profile?.avatar_url||"");
  const [file,setFile]=useState(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  async function save(e){
    e.preventDefault();
    setBusy(true);setMessage("");
    try {
      let nextAvatarUrl=avatarUrl;
      if(file){
        if(!file.type.startsWith("image/")) throw new Error("Choose an image file.");
        if(file.size>5*1024*1024) throw new Error("Choose an image smaller than 5 MB.");
        const extension=file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path=`${session.user.id}/${crypto.randomUUID()}.${extension}`;
        const {error:uploadError}=await supabase.storage.from("profile-photos").upload(path,file,{contentType:file.type,upsert:true});
        if(uploadError) throw uploadError;
        nextAvatarUrl=supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;
      }
      const {error}=await supabase.from("profiles").upsert({id:session.user.id,full_name:name,avatar_url:nextAvatarUrl});
      if(error) throw error;
      setAvatarUrl(nextAvatarUrl);
      setFile(null);
      setMessage("Profile saved.");
      refresh();
    } catch(error) {
      setMessage(error?.message || "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <PageHeader eyebrow="PROFILE" title="Your LifeProof profile." description="Keep your identity and journey space personal."/>
    <section className="panel profile-panel">
      <div className="profile-photo-wrap">
        {avatarUrl
          ? <img className="profile-avatar profile-avatar-image" src={avatarUrl} alt="Your profile"/>
          : <div className="profile-avatar">{(name||session.user.email||"U")[0].toUpperCase()}</div>}
        <label className="secondary photo-picker"><ImagePlus size={16}/> Change photo<input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
        {file&&<span className="photo-filename">{file.name}</span>}
      </div>
      <form className="profile-form" onSubmit={save}>
        <label>Full name<input value={name} onChange={e=>setName(e.target.value)} required/></label>
        <label>Email<input value={session.user.email||""} disabled/></label>
        {message&&<div className={message==="Profile saved."?"success-notice":"notice"} role="status">{message}</div>}
        <button className="primary" disabled={busy}>{busy?"Saving…":"Save profile"}</button>
      </form>
    </section>
  </>;
}

function Reports({data}) {
  const [period,setPeriod]=useState("week");
  const [message,setMessage]=useState("");
  const range=getReportPeriod(period);
  const periodLogs=data.logs.filter(log=>log.completed&&log.log_date>=range.start&&log.log_date<=range.end);
  const periodMemories=data.memories.filter(memory=>memory.memory_date>=range.start&&memory.memory_date<=range.end);
  const expected=data.habits.reduce((total,habit)=>total+(habit.frequency==="weekly"?countCalendarWeeks(range.start,range.end):range.dayCount),0);
  const completionRate=expected?Math.min(100,Math.round(periodLogs.length/expected*100)):0;
  const title=period==="week"?"Weekly report":"Monthly report";
  const rangeLabel=`${formatDate(range.start)} – ${formatDate(range.end)}`;

  async function shareReport(){
    const habitSummary=data.habits.map(habit=>{
      const count=periodLogs.filter(log=>log.habit_id===habit.id).length;
      return `${habit.name}: ${count} check-in${count===1?"":"s"}`;
    });
    const report=[
      `My LifeProof ${title.toLowerCase()} (${rangeLabel})`,
      `Habit check-ins: ${periodLogs.length}`,
      `Habit completion: ${completionRate}%`,
      `Memories captured: ${periodMemories.length}`,
      ...(habitSummary.length?["",...habitSummary]:[])
    ].join("\n");
    setMessage("");
    try {
      await shareContent(`LifeProof ${title}`,report);
      if(!navigator.share) setMessage("Report copied to clipboard.");
    } catch(error) {
      if(error?.name!=="AbortError") setMessage(error?.message||"Could not share this report.");
    }
  }

  return <>
    <PageHeader eyebrow="YOUR PROGRESS" title="Reports for your journey." description="Review and share a summary of your habit schedule and memories." action={<button className="primary" onClick={shareReport}><Share2 size={17}/> Share report</button>}/>
    <div className="report-controls">
      <div className="period-switch" role="group" aria-label="Report period">
        <button className={period==="week"?"selected":""} aria-pressed={period==="week"} onClick={()=>setPeriod("week")}>This week</button>
        <button className={period==="month"?"selected":""} aria-pressed={period==="month"} onClick={()=>setPeriod("month")}>This month</button>
      </div>
      <span className="report-range">{rangeLabel}</span>
    </div>
    {message&&<div className="notice report-notice" role="status">{message}</div>}
    <div className="stat-grid report-stats">
      <Stat icon={Check} label="Habit check-ins" value={periodLogs.length} hint={`${data.habits.length} active habits`}/>
      <Stat icon={TrendingUp} label="Schedule completion" value={`${completionRate}%`} hint="based on habit frequency"/>
      <Stat icon={BookOpen} label="Memories captured" value={periodMemories.length} hint={period==="week"?"this week":"this month"}/>
      <Stat icon={CalendarDays} label="Days in report" value={range.dayCount} hint="through today"/>
    </div>
    <section className="panel report-panel">
      <div className="panel-head"><div><h3>Habit schedule</h3><p>Check-ins recorded during this report period</p></div></div>
      {data.habits.length?<div className="report-habit-list">{data.habits.map(habit=>{
        const count=periodLogs.filter(log=>log.habit_id===habit.id).length;
        const target=habit.frequency==="weekly"?countCalendarWeeks(range.start,range.end):range.dayCount;
        return <div className="report-habit" key={habit.id}><div><strong>{habit.name}</strong><span>{habit.frequency} · {habit.description||"No description"}</span></div><b>{count}/{target}</b></div>;
      })}</div>:<EmptyState icon={ListChecks} title="No habits to report" text="Create a habit to start tracking your schedule." to="/habits"/>}
    </section>
    <section className="panel report-panel">
      <div className="panel-head"><div><h3>Memories from this period</h3><p>Moments captured during {period==="week"?"this week":"this month"}</p></div></div>
      {periodMemories.length?<div className="report-habit-list">{periodMemories.map(memory=><div className="report-habit" key={memory.id}><div><strong>{memory.title}</strong><span>{formatDate(memory.memory_date)} · {memory.category}</span></div></div>)}</div>:<p className="report-empty">No memories captured in this period.</p>}
    </section>
  </>;
}

function EmptyState({icon:Icon,title,text,to}){
  const navigate=useNavigate();
  return <div className="empty"><div className="empty-icon"><Icon size={22}/></div><h3>{title}</h3><p>{text}</p>{to&&<button className="secondary" onClick={()=>navigate(to)}>Get started</button>}</div>;
}

function Modal({title,close,children}){
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><div className="modal-head"><div><div className="eyebrow">LIFEPROOF</div><h2>{title}</h2></div><button className="icon-btn" onClick={close}><X/></button></div>{children}</div></div>;
}

export default App;