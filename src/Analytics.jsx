import { useMemo, useState } from "react";
import {
  Activity, Check, ChevronLeft, ChevronRight, Circle, Flame, Target,
  TrendingDown, TrendingUp, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const DAY = 86400000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RANGE_OPTIONS = [
  ["7", "7 Days"], ["30", "30 Days"], ["90", "90 Days"], ["custom", "Custom Range"]
];
const TREND_OPTIONS = [
  ["7", "7 Days"], ["30", "30 Days"], ["90", "3 Months"],
  ["180", "6 Months"], ["365", "1 Year"]
];
const COLORS = ["#8b7cff", "#5eead4", "#fbbf24", "#fb7185", "#60a5fa", "#c084fc"];
const tooltipStyle = {
  background: "#111827", border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 12, color: "#fff"
};

function localDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function mondayOf(date) {
  const result = new Date(date);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function habitCreatedDate(habit) {
  return habit.created_at ? localDate(habit.created_at) : new Date(0);
}

function weeklyDueDay(habit) {
  return Number(habit.reminder_weekday) || 7;
}

function isCompleted(logsByHabitAndDate, habitId, date) {
  return logsByHabitAndDate.get(habitId)?.has(dateKey(date)) || false;
}

function weekHasCompletion(logsByHabitAndDate, habitId, date) {
  const dates = logsByHabitAndDate.get(habitId);
  if (!dates?.size) return false;
  const weekStart = dateKey(mondayOf(date));
  const weekEnd = dateKey(shiftDate(mondayOf(date), 6));
  for (const completedDate of dates) {
    if (completedDate.length === 10 && completedDate >= weekStart && completedDate <= weekEnd) return true;
  }
  return false;
}

function scheduledOn(habit, date) {
  if (habitCreatedDate(habit) > date) return false;
  return habit.frequency !== "weekly" || ((date.getDay() || 7) === weeklyDueDay(habit));
}

function getDayStatus(habit, date, logsByHabitAndDate, today) {
  if (habitCreatedDate(habit) > date) return "not-scheduled";
  if (isCompleted(logsByHabitAndDate, habit.id, date)) return "completed";
  if (habit.frequency === "weekly") {
    if ((date.getDay() || 7) !== weeklyDueDay(habit)) return "not-scheduled";
    if (weekHasCompletion(logsByHabitAndDate, habit.id, date)) return "not-scheduled";
  } else if (!scheduledOn(habit, date)) {
    return "not-scheduled";
  }
  const explicitMiss = logsByHabitAndDate.get(habit.id)?.has(`${dateKey(date)}:missed`);
  return explicitMiss || date < today ? "missed" : "not-scheduled";
}

function makeStats(habits, logsByHabitAndDate, start, end, today) {
  let completed = 0;
  let missed = 0;
  let remaining = 0;
  let expected = 0;

  for (const habit of habits) {
    const created = habitCreatedDate(habit);
    const first = created > start ? created : start;
    if (first > end || first > today) continue;

    if (habit.frequency === "weekly") {
      const rangeStartWeek = mondayOf(first);
      const rangeEndWeek = mondayOf(end);
      for (let week = new Date(rangeStartWeek); week <= rangeEndWeek; week = shiftDate(week, 7)) {
        const dueDate = shiftDate(week, weeklyDueDay(habit) - 1);
        const isCurrentWeek = dateKey(week) === dateKey(mondayOf(today));
        const overlapsRange = dueDate >= start && dueDate <= end;
        const openCurrentWeek = isCurrentWeek && start <= today && end >= today;
        if (!overlapsRange && !openCurrentWeek) continue;
        if (week > today || week > end || week < mondayOf(first)) continue;
        if (dueDate < created && !weekHasCompletion(logsByHabitAndDate, habit.id, dueDate)) continue;
        const hasCompleted = weekHasCompletion(logsByHabitAndDate, habit.id, dueDate);
        const isDue = dueDate <= today;
        if (hasCompleted) {
          expected++;
          completed++;
        } else if (isDue && dueDate < today) {
          expected++;
          missed++;
        } else if (openCurrentWeek) {
          expected++;
          remaining++;
        }
      }
      continue;
    }

    for (let date = new Date(first); date <= end && date <= today; date = shiftDate(date, 1)) {
      expected++;
      if (isCompleted(logsByHabitAndDate, habit.id, date)) {
        completed++;
      } else if (logsByHabitAndDate.get(habit.id)?.has(`${dateKey(date)}:missed`) || date < today) {
        missed++;
      } else {
        remaining++;
      }
    }
  }

  return {
    completed, missed, remaining, expected,
    rate: expected ? Math.round(completed / expected * 100) : 0
  };
}

function todayStats(habits, logsByHabitAndDate, today) {
  let completed = 0;
  let missed = 0;
  let remaining = 0;
  let expected = 0;
  for (const habit of habits) {
    if (habitCreatedDate(habit) > today) continue;
    if (habit.frequency === "weekly" && (today.getDay() || 7) !== weeklyDueDay(habit)) continue;
    expected++;
    const done = habit.frequency === "weekly"
      ? weekHasCompletion(logsByHabitAndDate, habit.id, today)
      : isCompleted(logsByHabitAndDate, habit.id, today);
    if (done) completed++;
    else if (logsByHabitAndDate.get(habit.id)?.has(`${dateKey(today)}:missed`)) missed++;
    else remaining++;
  }
  return {
    completed, missed, remaining, expected,
    rate: expected ? Math.round(completed / expected * 100) : 0
  };
}

function scheduledDays(habit, logsByHabitAndDate, today) {
  const dates = [];
  const created = habitCreatedDate(habit);
  for (let date = new Date(created); date <= today; date = shiftDate(date, 1)) {
    if (habit.frequency !== "weekly" || (date.getDay() || 7) === weeklyDueDay(habit)) dates.push(date);
  }
  if (habit.frequency === "weekly" && weekHasCompletion(logsByHabitAndDate, habit.id, today)
    && !dates.some(date => dateKey(mondayOf(date)) === dateKey(mondayOf(today)))) {
    dates.push(today);
  }
  return dates;
}

function streakStats(habit, logsByHabitAndDate, today) {
  const dates = scheduledDays(habit, logsByHabitAndDate, today);
  const runs = [];
  let run = [];
  let broken = 0;
  for (const date of dates) {
    const done = habit.frequency === "weekly"
      ? weekHasCompletion(logsByHabitAndDate, habit.id, date)
      : isCompleted(logsByHabitAndDate, habit.id, date);
    const isOpenPeriod = habit.frequency === "weekly"
      ? dateKey(mondayOf(date)) === dateKey(mondayOf(today))
      : dateKey(date) === dateKey(today);
    if (isOpenPeriod && !done) continue;
    if (done) {
      run.push(date);
    } else {
      if (run.length) {
        runs.push(run);
        broken++;
      }
      run = [];
    }
  }
  if (run.length) runs.push(run);

  const longest = runs.reduce((value, item) => Math.max(value, item.length), 0);
  const current = runs.at(-1)?.length || 0;
  return { current, longest, runs, started: runs.length, broken };
}

function getTrend(habit, logsByHabitAndDate, today) {
  const currentStart = shiftDate(today, -13);
  const previousStart = shiftDate(today, -27);
  const current = makeStats([habit], logsByHabitAndDate, currentStart, today, today);
  const previous = makeStats([habit], logsByHabitAndDate, previousStart, shiftDate(today, -14), today);
  if (!current.expected && !previous.expected) return "No data";
  const difference = current.rate - previous.rate;
  if (difference >= 5) return "Improving";
  if (difference <= -5) return "Declining";
  return "Steady";
}

function weekRange(today, previous = false) {
  const currentStart = mondayOf(today);
  const start = previous ? shiftDate(currentStart, -7) : currentStart;
  return { start, end: previous ? shiftDate(start, 6) : today };
}

function formatDate(date, options = { month: "short", day: "numeric", year: "numeric" }) {
  return date.toLocaleDateString(undefined, options);
}

function daySummary(habits, logsByHabitAndDate, date, today) {
  const completedHabits = [];
  const missedHabits = [];
  for (const habit of habits) {
    const status = getDayStatus(habit, date, logsByHabitAndDate, today);
    if (status === "completed") completedHabits.push(habit.name);
    if (status === "missed") missedHabits.push(habit.name);
  }
  const scheduled = completedHabits.length + missedHabits.length;
  return {
    date, completed: completedHabits.length, missed: missedHabits.length,
    scheduled, rate: scheduled ? Math.round(completedHabits.length / scheduled * 100) : 0,
    completedHabits, missedHabits
  };
}

function Ring({ value, color, label }) {
  const circumference = 2 * Math.PI * 42;
  return <svg className="analytics-ring" viewBox="0 0 100 100" role="img" aria-label={`${label}: ${value}%`}>
    <circle className="analytics-ring-track" cx="50" cy="50" r="42"/>
    <circle className="analytics-ring-value" cx="50" cy="50" r="42" stroke={color}
      strokeDasharray={`${circumference * value / 100} ${circumference}`}/>
    <text x="50" y="48" textAnchor="middle" className="analytics-ring-number">{value}%</text>
    <text x="50" y="62" textAnchor="middle" className="analytics-ring-label">COMPLETE</text>
  </svg>;
}

function PeriodCard({ title, stats, detail, color }) {
  return <article className="panel performance-card">
    <div className="performance-card-copy">
      <span className="analytics-caption">{title}</span>
      <strong>{stats.completed}<small> completed</small></strong>
      <span className="performance-subtitle">
        {title === "Today" ? `${stats.remaining} remaining` : `${stats.missed} missed`}
      </span>
      <span className="performance-detail">{detail}</span>
    </div>
    <Ring value={stats.rate} color={color} label={title}/>
  </article>;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return <div className="analytics-tooltip">
    <strong>{item.fullDate || label}</strong>
    <span>Completed: {item.completed}</span>
    <span>Missed: {Math.abs(item.missed)}</span>
    <span>Completion: {item.rate}%</span>
  </div>;
}

export default function Analytics({ data }) {
  const today = localDate(new Date());
  const todayKey = dateKey(today);
  const [performanceRange, setPerformanceRange] = useState("7");
  const [customStart, setCustomStart] = useState(dateKey(shiftDate(today, -6)));
  const [customEnd, setCustomEnd] = useState(todayKey);
  const [trendRange, setTrendRange] = useState("30");
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [sortBy, setSortBy] = useState("recent");

  const logsByHabitAndDate = useMemo(() => {
    const map = new Map();
    for (const log of data.logs) {
      if (!map.has(log.habit_id)) map.set(log.habit_id, new Set());
      const dates = map.get(log.habit_id);
      if (log.completed) dates.add(log.log_date);
      else dates.add(`${log.log_date}:missed`);
    }
    return map;
  }, [data.logs]);

  const thisWeek = weekRange(today);
  const lastWeek = weekRange(today, true);
  const lastWeekStats = makeStats(data.habits, logsByHabitAndDate, lastWeek.start, lastWeek.end, today);
  const thisWeekStats = makeStats(data.habits, logsByHabitAndDate, thisWeek.start, thisWeek.end, today);
  const todaySummary = todayStats(data.habits, logsByHabitAndDate, today);
  const allTimeStats = makeStats(data.habits, logsByHabitAndDate, new Date(0), today, today);
  const habitStreaks = data.habits.map(habit => ({
    habit, ...streakStats(habit, logsByHabitAndDate, today),
    stats: makeStats([habit], logsByHabitAndDate, habitCreatedDate(habit), today, today),
    trend: getTrend(habit, logsByHabitAndDate, today)
  }));
  const bestStreak = habitStreaks.reduce((best, item) => {
    const duration = item.longest * (item.habit.frequency === "weekly" ? 7 : 1);
    const bestDuration = best ? best.longest * (best.habit.frequency === "weekly" ? 7 : 1) : 0;
    return duration > bestDuration ? item : best;
  }, null);
  const streakRuns = habitStreaks.flatMap(item => item.runs.map(run =>
    run.length * (item.habit.frequency === "weekly" ? 7 : 1)
  ));
  const averageStreak = streakRuns.length
    ? Math.round(streakRuns.reduce((sum, length) => sum + length, 0) / streakRuns.length)
    : 0;
  const streakTotals = habitStreaks.reduce((total, item) => ({
    started: total.started + item.started,
    broken: total.broken + item.broken
  }), { started: 0, broken: 0 });

  const performanceDates = useMemo(() => {
    const start = performanceRange === "custom" ? localDate(customStart) : shiftDate(today, -(Number(performanceRange) - 1));
    const end = performanceRange === "custom" ? localDate(customEnd) : today;
    if (start > end || start > today) return [];
    const dates = [];
    for (let date = start; date <= end && date <= today; date = shiftDate(date, 1)) dates.push(date);
    return dates;
  }, [performanceRange, customStart, customEnd, todayKey]);
  const performanceData = performanceDates.map(date => {
    const day = daySummary(data.habits, logsByHabitAndDate, date, today);
    return {
      ...day, completed: day.completed,
      missed: day.missed,
      missedValue: -day.missed,
      fullDate: formatDate(date),
      day: formatDate(date, { weekday: "short" })
    };
  });

  const trendData = useMemo(() => {
    const days = Number(trendRange);
    const start = shiftDate(today, -(days - 1));
    const bucketSize = days <= 30 ? 1 : days <= 180 ? 7 : 30;
    const points = [];
    for (let offset = 0; offset < days; offset += bucketSize) {
      const bucketStart = shiftDate(start, offset);
      const bucketEnd = shiftDate(start, Math.min(offset + bucketSize - 1, days - 1));
      const stats = makeStats(data.habits, logsByHabitAndDate, bucketStart, bucketEnd, today);
      points.push({
        date: bucketEnd, fullDate: `${formatDate(bucketStart)}${bucketStart < bucketEnd ? ` – ${formatDate(bucketEnd)}` : ""}`,
        label: formatDate(bucketEnd, days <= 30 ? { weekday: "short" } : { month: "short", day: "numeric" }),
        rate: stats.expected ? stats.rate : null,
        completed: stats.completed, missed: stats.missed
      });
    }
    return points;
  }, [data.habits, logsByHabitAndDate, trendRange, todayKey]);

  const monthCells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = shiftDate(first, -((first.getDay() + 6) % 7));
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const total = Math.ceil(((last - start) / DAY + 1) / 7) * 7;
    return Array.from({ length: total }, (_, index) => shiftDate(start, index));
  }, [month]);
  const selectedDay = daySummary(data.habits, logsByHabitAndDate, localDate(selectedDate), today);

  const sortedHabits = [...habitStreaks].sort((a, b) => {
    if (sortBy === "completion") return b.stats.rate - a.stats.rate;
    if (sortBy === "streak") return b.current - a.current || b.longest - a.longest;
    if (sortBy === "completed") return b.stats.completed - a.stats.completed;
    if (sortBy === "missed") return b.stats.missed - a.stats.missed;
    return new Date(b.habit.created_at || 0) - new Date(a.habit.created_at || 0);
  });
  const history = habitStreaks.flatMap(item => item.runs.map(run => ({
    name: item.habit.name, length: run.length,
    unit: item.habit.frequency === "weekly" ? "weeks" : "days"
  }))).sort((a, b) => b.length - a.length).slice(0, 5);
  const memoryCategories = [...data.memories.reduce((counts, memory) => {
    counts.set(memory.category || "Other", (counts.get(memory.category || "Other") || 0) + 1);
    return counts;
  }, new Map())].map(([name, value]) => ({ name, value }));
  const bestHabit = [...habitStreaks].sort((a, b) => b.stats.rate - a.stats.rate)[0];
  const improvingCount = habitStreaks.filter(item => item.trend === "Improving").length;

  return <div className="analytics-page">
    <div className="analytics-intro">
      <div>
        <div className="eyebrow">YOUR HABIT ANALYTICS</div>
        <h1>Small steps, clearly seen.</h1>
        <p>A real-time view of the habits you’re building and the progress you’ve made.</p>
      </div>
      <div className="analytics-asof"><Activity size={15}/> Updated from your habit history</div>
    </div>

    <section className="analytics-section" aria-labelledby="performance-heading">
      <div className="analytics-section-heading"><div><span className="analytics-kicker">AT A GLANCE</span><h2 id="performance-heading">Performance overview</h2></div></div>
      <div className="performance-grid">
        <PeriodCard title="Last Week" stats={lastWeekStats} detail={`${formatDate(lastWeek.start, { month: "short", day: "numeric" })} – ${formatDate(lastWeek.end, { month: "short", day: "numeric" })}`} color="#8b7cff"/>
        <PeriodCard title="This Week" stats={thisWeekStats} detail={`${thisWeekStats.completed} of ${thisWeekStats.expected} scheduled`} color="#5eead4"/>
        <PeriodCard title="Today" stats={todaySummary} detail={`${todaySummary.expected} habits scheduled`} color="#fbbf24"/>
      </div>
      <section className="panel overall-panel">
        <div className="panel-head"><div><h3>Overall performance</h3><p>Your all-time record across active habits</p></div><span className="overall-rate">{allTimeStats.rate}% <small>completion</small></span></div>
        <div className="overall-stats">
          <OverviewStat label="Habits tracked" value={data.habits.length}/>
          <OverviewStat label="Total completions" value={allTimeStats.completed}/>
          <OverviewStat label="Total missed" value={allTimeStats.missed}/>
          <OverviewStat label="Current streak" value={formatStreak(habitStreaks, "current")}/>
          <OverviewStat label="Longest streak" value={formatStreak(habitStreaks, "longest")}/>
        </div>
      </section>
    </section>

    <section className="panel analytics-panel" aria-labelledby="weekly-heading">
      <div className="panel-head analytics-chart-head">
        <div><span className="analytics-kicker">COMPLETED ABOVE · MISSED BELOW</span><h3 id="weekly-heading">Habit performance</h3><p>Daily check-ins against your schedule</p></div>
        <div className="analytics-controls">
          <div className="period-switch analytics-range" role="group" aria-label="Habit performance date range">
            {RANGE_OPTIONS.map(([value, label]) => <button key={value} className={performanceRange === value ? "selected" : ""} aria-pressed={performanceRange === value} onClick={() => setPerformanceRange(value)}>{label}</button>)}
          </div>
          {performanceRange === "custom" && <div className="analytics-custom-range"><label>From<input type="date" value={customStart} max={customEnd} onChange={event => setCustomStart(event.target.value)}/></label><label>To<input type="date" value={customEnd} min={customStart} max={todayKey} onChange={event => setCustomEnd(event.target.value)}/></label></div>}
        </div>
      </div>
      <div className="analytics-legend"><span><i className="legend-completed"/>Completed</span><span><i className="legend-missed"/>Missed</span></div>
      {performanceData.length ? <div className="analytics-bar-scroll"><div className="analytics-bar-chart" style={{ minWidth: `${Math.max(520, performanceData.length * 46)}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={performanceData} margin={{ top: 16, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,.06)"/>
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#8f9bb3", fontSize: 11 }}/>
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#8f9bb3", fontSize: 10 }}/>
            <ReferenceLine y={0} stroke="rgba(255,255,255,.26)"/>
            <Tooltip content={<CustomTooltip/>} contentStyle={tooltipStyle}/>
            <Bar dataKey="completed" name="Completed" fill="#5eead4" radius={[5, 5, 0, 0]} maxBarSize={28}/>
            <Bar dataKey="missedValue" name="Missed" fill="#fb7185" radius={[0, 0, 5, 5]} maxBarSize={28}/>
          </BarChart>
        </ResponsiveContainer>
      </div></div> : <EmptyAnalytics text="Choose a valid date range to see your habit activity."/>}
    </section>

    <section className="panel analytics-panel" aria-labelledby="habit-detail-heading">
      <div className="panel-head analytics-chart-head">
        <div><span className="analytics-kicker">YOUR ROUTINES</span><h3 id="habit-detail-heading">Habit-by-habit progress</h3><p>Completion, streaks and momentum for every active habit</p></div>
        <label className="analytics-sort">Sort by<select value={sortBy} onChange={event => setSortBy(event.target.value)}>
          <option value="completion">Completion %</option><option value="streak">Streak</option>
          <option value="completed">Most completed</option><option value="missed">Most missed</option>
          <option value="recent">Recently created</option>
        </select></label>
      </div>
      {sortedHabits.length ? <div className="habit-analytics-list">{sortedHabits.map(item => {
        const percent = item.stats.rate;
        const TrendIcon = item.trend === "Improving" ? TrendingUp : item.trend === "Declining" ? TrendingDown : Activity;
        const trendClass = item.trend.toLowerCase().replace(" ", "-");
        return <article className="habit-analytics-row" key={item.habit.id}>
          <div className="habit-analytics-main">
            <div className="habit-analytics-title"><strong>{item.habit.name}</strong><span className="habit-frequency">{item.habit.frequency}</span></div>
            <div className="analytics-progress" role="progressbar" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100" aria-label={`${item.habit.name} completion`}>
              <span style={{ width: `${percent}%` }}/>
            </div>
            <div className="habit-analytics-meta"><span>{percent}% completion</span><span>{item.stats.completed} completed</span><span>{item.stats.missed} missed</span><span>{item.stats.expected} scheduled</span></div>
          </div>
          <div className="habit-analytics-streak"><span><Flame size={14}/> {item.current} {item.habit.frequency === "weekly" ? "wk" : "day"} current</span><small>Longest {item.longest} {item.habit.frequency === "weekly" ? "wk" : "day"}</small></div>
          <div className={`habit-trend ${trendClass}`}><TrendIcon size={15}/>{item.trend}</div>
        </article>;
      })}</div> : <EmptyAnalytics text="Create a habit to see its completion rate and streak analytics."/>}
    </section>

    <div className="analytics-two-column">
      <section className="panel analytics-panel" aria-labelledby="heatmap-heading">
        <div className="panel-head"><div><span className="analytics-kicker">DAILY ACTIVITY</span><h3 id="heatmap-heading">Habit calendar</h3><p>Completed habits across your activity calendar</p></div></div>
        <div className="calendar-toolbar">
          <div className="calendar-month-nav"><button className="icon-btn" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17}/></button><strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button className="icon-btn" aria-label="Next month" disabled={month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth()} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17}/></button></div>
          <button className="secondary today-button" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(todayKey); }}>Today</button>
        </div>
        <div className="heatmap-grid" role="grid" aria-label="Monthly habit completion calendar">
          {WEEKDAYS.map(day => <span className="heatmap-weekday" key={day}>{day}</span>)}
          {monthCells.map(date => {
            const inMonth = date.getMonth() === month.getMonth();
            const summary = daySummary(data.habits, logsByHabitAndDate, date, today);
            const level = summary.completed === 0 ? 0 : summary.completed <= 2 ? 1 : summary.completed <= 4 ? 2 : 3;
            const isFuture = date > today;
            return <button key={dateKey(date)} role="gridcell" aria-label={`${formatDate(date)}, ${summary.completed} completed, ${summary.missed} missed`} aria-pressed={selectedDate === dateKey(date)} disabled={!inMonth || isFuture} className={`heatmap-day level-${level}${inMonth ? "" : " outside-month"}${selectedDate === dateKey(date) ? " selected" : ""}`} onClick={() => setSelectedDate(dateKey(date))}>{date.getDate()}</button>;
          })}
        </div>
        <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3].map(level => <i className={`heatmap-day level-${level}`} key={level}/>)}<span>More</span></div>
        <div className="selected-day-detail">
          <div className="selected-day-heading"><strong>{formatDate(selectedDay.date)}</strong><span>{selectedDay.rate}% completion · {selectedDay.completed} completed · {selectedDay.missed} missed</span></div>
          <div className="selected-day-columns">
            <DayHabitList title="Completed" names={selectedDay.completedHabits} icon={Check}/>
            <DayHabitList title="Missed" names={selectedDay.missedHabits} icon={X}/>
          </div>
        </div>
      </section>

      <section className="panel analytics-panel" aria-labelledby="trend-heading">
        <div className="panel-head analytics-chart-head"><div><span className="analytics-kicker">CONSISTENCY OVER TIME</span><h3 id="trend-heading">Completion trend</h3><p>Scheduled habit completion by time period</p></div></div>
        <div className="period-switch trend-switch" role="group" aria-label="Completion trend date range">
          {TREND_OPTIONS.map(([value, label]) => <button key={value} className={trendRange === value ? "selected" : ""} aria-pressed={trendRange === value} onClick={() => setTrendRange(value)}>{label}</button>)}
        </div>
        {trendData.some(item => item.rate !== null) ? <div className="analytics-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 12, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.06)"/>
              <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" tick={{ fill: "#8f9bb3", fontSize: 10 }}/>
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} tick={{ fill: "#8f9bb3", fontSize: 10 }}/>
              <Tooltip content={<CustomTooltip/>} contentStyle={tooltipStyle}/>
              <Line type="monotone" dataKey="rate" name="Completion" stroke="#8b7cff" strokeWidth={3} connectNulls={false} dot={{ r: 3, fill: "#5eead4", strokeWidth: 0 }} activeDot={{ r: 5 }}/>
            </LineChart>
          </ResponsiveContainer>
        </div> : <EmptyAnalytics text="Complete a scheduled habit to start your completion trend."/>}
      </section>
    </div>

    <section className="panel analytics-panel" aria-labelledby="matrix-heading">
      <div className="panel-head"><div><span className="analytics-kicker">CHECK-IN HISTORY</span><h3 id="matrix-heading">Daily habit matrix</h3><p>Recent scheduled dates and check-in status for each habit</p></div></div>
      {data.habits.length ? <div className="matrix-scroll"><table className="habit-matrix">
        <thead><tr><th scope="col">Habit</th>{Array.from({ length: 14 }, (_, index) => shiftDate(today, index - 13)).map(date => <th scope="col" key={dateKey(date)}><span>{formatDate(date, { weekday: "short" })}</span><small>{date.getDate()}</small></th>)}</tr></thead>
        <tbody>{data.habits.map(habit => <tr key={habit.id}><th scope="row">{habit.name}</th>{Array.from({ length: 14 }, (_, index) => shiftDate(today, index - 13)).map(date => {
          const status = getDayStatus(habit, date, logsByHabitAndDate, today);
          const Mark = status === "completed" ? Check : status === "missed" ? X : Circle;
          return <td key={dateKey(date)}><span className={`matrix-mark ${status}`} title={`${formatDate(date)}: ${status}`} aria-label={`${formatDate(date)}: ${status}`}><Mark size={15}/></span></td>;
        })}</tr>)}</tbody>
      </table></div> : <EmptyAnalytics text="Create a habit to see your day-by-day check-in matrix."/>}
      <div className="matrix-legend"><span><Check size={14}/> Completed</span><span><X size={14}/> Missed</span><span><Circle size={13}/> Not scheduled / still open</span></div>
    </section>

    <div className="analytics-two-column">
      <section className="panel analytics-panel" aria-labelledby="streak-heading">
        <div className="panel-head"><div><span className="analytics-kicker">KEEP THE MOMENTUM</span><h3 id="streak-heading">Streak analytics</h3><p>Consistency across your daily and weekly routines</p></div></div>
        <div className="streak-summary-grid">
          <OverviewStat label="Current streak" value={formatStreak(habitStreaks, "current")}/>
          <OverviewStat label="Longest streak" value={formatStreak(habitStreaks, "longest")}/>
          <OverviewStat label="Best habit streak" value={bestStreak ? `${bestStreak.longest}${bestStreak.habit.frequency === "weekly" ? "w" : "d"}` : "0d"} detail={bestStreak?.habit.name}/>
          <OverviewStat label="Average streak" value={`${averageStreak}d`}/>
          <OverviewStat label="Streaks started" value={streakTotals.started}/>
          <OverviewStat label="Streaks broken" value={streakTotals.broken}/>
        </div>
        <div className="streak-history"><h4>Longest streak runs</h4>{history.length ? history.map((item, index) => <div className="streak-history-row" key={`${item.name}-${index}`}><div><Flame size={15}/><strong>{item.length} {item.unit}</strong><span>{item.name}</span></div><div className="streak-history-track"><i style={{ width: `${Math.max(8, item.length / history[0].length * 100)}%` }}/></div></div>) : <p className="report-empty">Complete a scheduled habit to begin a streak.</p>}</div>
      </section>

      <div className="analytics-side-stack">
        {memoryCategories.length > 0 && <section className="panel analytics-panel" aria-labelledby="category-heading">
          <div className="panel-head"><div><span className="analytics-kicker">YOUR STORY</span><h3 id="category-heading">Memory categories</h3><p>Existing journal categories, by saved moments</p></div></div>
          <div className="category-chart-layout"><div className="category-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={memoryCategories} dataKey="value" nameKey="name" innerRadius={45} outerRadius={68} paddingAngle={3}>{memoryCategories.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]}/>)}</Pie><Tooltip contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer></div><div className="category-legend">{memoryCategories.map((item, index) => <div key={item.name}><i style={{ background: COLORS[index % COLORS.length] }}/><span>{item.name}</span><strong>{item.value}</strong></div>)}</div></div>
        </section>}
        <section className="analytics-insight" aria-label="Habit insight">
          <div className="insight-icon"><Target size={20}/></div>
          <div><span className="analytics-kicker">A PATTERN IN YOUR DATA</span>
            <h3>{!data.habits.length ? "Your analytics start with your first habit." : improvingCount ? `${improvingCount} ${improvingCount === 1 ? "habit is" : "habits are"} gaining momentum.` : bestHabit?.stats.expected ? `${bestHabit.habit.name} is your most consistent habit.` : "Your habit history is ready to grow."}</h3>
            <p>{!data.habits.length ? "Add a habit and check in regularly to see personal patterns here." : improvingCount ? "Compared with the prior two weeks, these habits have improved by at least five percentage points." : bestHabit?.stats.expected ? `${bestHabit.stats.rate}% completion across ${bestHabit.stats.expected} scheduled ${bestHabit.habit.frequency === "weekly" ? "weeks" : "days"}.` : "Keep checking in. This view will update as your real activity accumulates."}</p>
          </div>
        </section>
      </div>
    </div>
  </div>;
}

function OverviewStat({ label, value, detail }) {
  return <div className="overall-stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function formatStreak(habitStreaks, metric) {
  const best = habitStreaks.reduce((current, item) => {
    const value = item[metric] * (item.habit.frequency === "weekly" ? 7 : 1);
    const bestValue = current ? current[metric] * (current.habit.frequency === "weekly" ? 7 : 1) : 0;
    return value > bestValue ? item : current;
  }, null);
  if (!best || !best[metric]) return "0d";
  return `${best[metric]}${best.habit.frequency === "weekly" ? "w" : "d"}`;
}

function EmptyAnalytics({ text }) {
  return <div className="analytics-empty"><Activity size={20}/><span>{text}</span></div>;
}

function DayHabitList({ title, names, icon: Icon }) {
  return <div className="day-habit-list"><span><Icon size={13}/>{title}</span>{names.length ? names.map(name => <small key={name}>{name}</small>) : <small className="muted">None</small>}</div>;
}
