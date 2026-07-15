import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

/* ============================================================
   Constants
   ============================================================ */

const MOODS = [
  { value: 1, emoji: '😩', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Meh' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '🤩', label: 'Amazing' },
]

const QUOTES = [
  'The miracle isn\u2019t that you finished. The miracle is that you had the courage to start.',
  'Some days you just have to create your own sunshine.',
  'Running is the greatest metaphor for life, because you get out of it what you put into it.',
  'The pain of today is the strength of tomorrow.',
  'You don\u2019t have to be fast. You just have to start.',
  'A run is a conversation between who you are and who you\u2019re becoming.',
  'Every mile begins with a single step out the door.',
  'Legs feel heavy, mind feels light \u2014 that\u2019s the trade every runner makes.',
  'Consistency beats intensity. Show up again tomorrow.',
  'The road doesn\u2019t care about your excuses, only your footsteps.',
]

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const RUNS_KEY = 'stride_runs_v1'
const SETTINGS_KEY = 'stride_settings_v1'

const DEFAULT_SETTINGS = { name: 'Runner', unit: 'mi' }

/* ============================================================
   Storage helpers
   ============================================================ */

function loadRuns() {
  try {
    const raw = localStorage.getItem(RUNS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

/* ============================================================
   Date / stats helpers
   ============================================================ */

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfDay(d) {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function getWeekTrail(runs) {
  const today = new Date()
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const hasEntry = runs.some((r) => isSameDay(new Date(r.date), d))
    days.push({
      date: d,
      label: DAY_LABELS[d.getDay()],
      hasEntry,
      isToday: isSameDay(d, today),
    })
  }
  return days
}

function getStreak(runs) {
  if (!runs.length) return 0
  const today = startOfDay(new Date())
  let streak = 0
  let cursor = new Date(today)

  const hasRunOn = (d) => runs.some((r) => isSameDay(new Date(r.date), d))

  // If nothing logged today yet, streak counting still starts from yesterday
  if (!hasRunOn(cursor)) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (hasRunOn(cursor)) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function relativeDate(dateStr) {
  const d = new Date(dateStr)
  const today = startOfDay(new Date())
  const target = startOfDay(d)
  const diffDays = Math.round((today - target) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function quoteOfTheDay() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  )
  return QUOTES[dayOfYear % QUOTES.length]
}

function moodMeta(value) {
  return MOODS.find((m) => m.value === value) || MOODS[2]
}

/* Bucketing for insights charts */
function getBuckets(timeframe) {
  const now = new Date()
  if (timeframe === 'week') {
    const buckets = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const start = startOfDay(d)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      buckets.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), start, end })
    }
    return buckets
  }
  if (timeframe === 'month') {
    const buckets = []
    for (let i = 3; i >= 0; i--) {
      const end = startOfDay(now)
      end.setDate(end.getDate() - i * 7)
      const start = new Date(end)
      start.setDate(start.getDate() - 7)
      buckets.push({ label: i === 0 ? 'This wk' : `${i}wk ago`, start, end })
    }
    return buckets
  }
  // year
  const buckets = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    buckets.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), start, end })
  }
  return buckets
}

function aggregate(runs, timeframe, metric) {
  const buckets = getBuckets(timeframe)
  return buckets.map((b) => {
    const inBucket = runs.filter((r) => {
      const d = new Date(r.date)
      return d >= b.start && d < b.end
    })
    if (metric === 'distance') {
      const total = inBucket.reduce((sum, r) => sum + (parseFloat(r.distance) || 0), 0)
      return { label: b.label, value: Math.round(total * 10) / 10 }
    }
    if (metric === 'mood') {
      if (!inBucket.length) return { label: b.label, value: null }
      const avg = inBucket.reduce((sum, r) => sum + (r.mood || 0), 0) / inBucket.length
      return { label: b.label, value: Math.round(avg * 10) / 10 }
    }
    // runs count
    return { label: b.label, value: inBucket.length }
  })
}

/* ============================================================
   Icons (inline SVG, stroke-based)
   ============================================================ */

const IconBase = ({ children, size = 22, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
)

const IconHome = (p) => (
  <IconBase {...p}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
  </IconBase>
)
const IconPlus = (p) => (
  <IconBase {...p}>
    <path d="M12 5v14M5 12h14" />
  </IconBase>
)
const IconSettings = (p) => (
  <IconBase {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13.5a1.8 1.8 0 0 0 .36 1.98l.06.06a2.18 2.18 0 1 1-3.08 3.08l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V20a2.18 2.18 0 1 1-4.36 0v-.1a1.8 1.8 0 0 0-1.18-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06a2.18 2.18 0 1 1-3.08-3.08l.06-.06a1.8 1.8 0 0 0 .36-1.98 1.8 1.8 0 0 0-1.65-1.1H2a2.18 2.18 0 1 1 0-4.36h.1a1.8 1.8 0 0 0 1.65-1.18 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2.18 2.18 0 1 1 3.08-3.08l.06.06a1.8 1.8 0 0 0 1.98.36H8.5a1.8 1.8 0 0 0 1.1-1.65V2a2.18 2.18 0 1 1 4.36 0v.1a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06a2.18 2.18 0 1 1 3.08 3.08l-.06.06a1.8 1.8 0 0 0-.36 1.98v.1a1.8 1.8 0 0 0 1.65 1.1H22a2.18 2.18 0 1 1 0 4.36h-.1a1.8 1.8 0 0 0-1.65 1.1Z" />
  </IconBase>
)
const IconSync = (p) => (
  <IconBase {...p}>
    <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
    <path d="M3 21v-5h5" />
  </IconBase>
)
const IconClose = (p) => (
  <IconBase {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </IconBase>
)
const IconChevronDown = (p) => (
  <IconBase {...p}>
    <path d="m6 9 6 6 6-6" />
  </IconBase>
)
const IconChevronLeft = (p) => (
  <IconBase {...p}>
    <path d="m15 18-6-6 6-6" />
  </IconBase>
)
const IconChevronRight = (p) => (
  <IconBase {...p}>
    <path d="m9 18 6-6-6-6" />
  </IconBase>
)
const IconTrash = (p) => (
  <IconBase {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </IconBase>
)

/* ============================================================
   Small shared components
   ============================================================ */

function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={'segmented-btn' + (value === opt.value ? ' active' : '')}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ============================================================
   Add Run Sheet
   ============================================================ */

function AddRunSheet({ onClose, onSave, unit }) {
  const [distance, setDistance] = useState('')
  const [distUnit, setDistUnit] = useState(unit)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pace, setPace] = useState('')
  const [cadence, setCadence] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [feeling, setFeeling] = useState('')
  const [mood, setMood] = useState(null)

  const canSave = distance.trim().length > 0 && !isNaN(parseFloat(distance))

  function handleSave() {
    if (!canSave) return
    onSave({
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      distance: parseFloat(distance),
      unit: distUnit,
      pace: pace.trim(),
      cadence: cadence.trim(),
      durationMin: minutes.trim(),
      durationSec: seconds.trim(),
      feeling: feeling.trim(),
      mood,
    })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span className="sheet-title">Log a run</span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>

        <label className="field-label" htmlFor="distance-input">
          How far did you run?
        </label>
        <div className="distance-input-row">
          <input
            id="distance-input"
            className="distance-input"
            type="number"
            inputMode="decimal"
            placeholder="0.0"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            autoFocus
          />
          <div className="unit-toggle">
            <button
              type="button"
              className={'unit-toggle-btn' + (distUnit === 'mi' ? ' active' : '')}
              onClick={() => setDistUnit('mi')}
            >
              mi
            </button>
            <button
              type="button"
              className={'unit-toggle-btn' + (distUnit === 'km' ? ' active' : '')}
              onClick={() => setDistUnit('km')}
            >
              km
            </button>
          </div>
        </div>

        <button
          type="button"
          className="advanced-toggle"
          onClick={() => setShowAdvanced((s) => !s)}
        >
          <span>Advanced details</span>
          <IconChevronDown
            size={18}
            className={'advanced-toggle-icon' + (showAdvanced ? ' open' : '')}
          />
        </button>

        {showAdvanced && (
          <div className="advanced-fields">
            <div className="advanced-fields-inner">
              <div className="advanced-field">
                <label className="field-label">Duration</label>
                <div className="duration-row">
                  <input
                    className="text-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="min"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                  <span className="duration-sep">:</span>
                  <input
                    className="text-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="sec"
                    value={seconds}
                    onChange={(e) => setSeconds(e.target.value)}
                  />
                </div>
              </div>
              <div className="advanced-row">
                <div className="advanced-field">
                  <label className="field-label">Pace</label>
                  <input
                    className="text-input"
                    type="text"
                    placeholder={`e.g. 8:30 /${distUnit}`}
                    value={pace}
                    onChange={(e) => setPace(e.target.value)}
                  />
                </div>
                <div className="advanced-field">
                  <label className="field-label">Cadence</label>
                  <input
                    className="text-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="spm"
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <label className="field-label">How did it feel?</label>
        <textarea
          className="text-input"
          placeholder="Legs felt heavy at first, but found a rhythm by mile 2..."
          value={feeling}
          onChange={(e) => setFeeling(e.target.value)}
          style={{ marginBottom: 18 }}
        />

        <label className="field-label">Mood</label>
        <div className="mood-row">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className={'mood-btn' + (mood === m.value ? ' selected' : '')}
              onClick={() => setMood(m.value)}
              aria-label={m.label}
            >
              {m.emoji}
            </button>
          ))}
        </div>

        <button className="primary-btn" disabled={!canSave} onClick={handleSave}>
          Save run
        </button>
      </div>
    </div>
  )
}

/* ============================================================
   Run Detail Sheet
   ============================================================ */

function RunDetailSheet({ run, onClose, onDelete }) {
  const mood = run.mood ? moodMeta(run.mood) : null
  const duration =
    run.durationMin || run.durationSec
      ? `${run.durationMin || 0}:${String(run.durationSec || 0).padStart(2, '0')}`
      : '—'

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span className="sheet-title">
            {`${relativeDate(run.date)}\u2019s run`}
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>

        <div className="detail-stat-grid">
          <div className="detail-stat">
            <div className="detail-stat-value">
              {run.distance} {run.unit}
            </div>
            <div className="detail-stat-label">Distance</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat-value">{duration}</div>
            <div className="detail-stat-label">Duration</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat-value">{run.pace || '—'}</div>
            <div className="detail-stat-label">Pace</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat-value">{run.cadence || '—'}</div>
            <div className="detail-stat-label">Cadence (spm)</div>
          </div>
        </div>

        <div className="detail-note-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {mood && <span style={{ fontSize: 20 }}>{mood.emoji}</span>}
            <span className="field-label" style={{ margin: 0 }}>
              {mood ? mood.label : 'How it felt'}
            </span>
          </div>
          <p>{run.feeling || 'No notes for this run.'}</p>
        </div>

        <button
          className="secondary-btn danger-btn"
          onClick={() => {
            onDelete(run.id)
            onClose()
          }}
        >
          Delete run
        </button>
      </div>
    </div>
  )
}

/* ============================================================
   Home / Insights entry screen
   ============================================================ */

function HomeScreen({ runs, settings, onOpenInsights, onOpenRun }) {
  const [syncing, setSyncing] = useState(false)
  const trail = useMemo(() => getWeekTrail(runs), [runs])
  const streak = useMemo(() => getStreak(runs), [runs])
  const quote = useMemo(() => quoteOfTheDay(), [])
  const recent = useMemo(
    () => [...runs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    [runs]
  )

  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  function handleSync() {
    setSyncing(true)
    setTimeout(() => setSyncing(false), 1200)
  }

  return (
    <div className="screen">
      <div className="home-header">
        <div>
          <p className="home-greeting-eyebrow">{timeGreeting}</p>
          <h1 className="home-greeting-name">{settings.name}</h1>
        </div>
        <button
          className={'sync-btn' + (syncing ? ' syncing' : '')}
          onClick={handleSync}
          aria-label="Sync"
        >
          <IconSync size={19} />
        </button>
      </div>

      <div className="card">
        <div className="streak-summary">
          <span className="streak-number">{streak}</span>
          <span className="streak-label">day streak {streak > 0 ? '\u{1F525}' : ''}</span>
        </div>
        <div className="trail">
          <div className="trail-line" />
          {trail.map((day, i) => (
            <div className="trail-day" key={i}>
              <div className={'trail-dot' + (day.hasEntry ? ' logged' : '') + (day.isToday ? ' today' : '')}>
                {day.hasEntry ? '\u{1F525}' : ''}
              </div>
              <span className={'trail-day-label' + (day.isToday ? ' today-label' : '')}>
                {day.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="motivation-card">
        <p className="motivation-eyebrow">Today's motivation</p>
        <p className="motivation-quote">{quote}</p>
      </div>

      <div className="card">
        <div className="card-title-row">
          <h2 className="card-title">Recent activity</h2>
        </div>
        {recent.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-emoji">{'\u{1F3C3}'}</span>
            <p className="empty-state-title">No runs yet</p>
            <p className="empty-state-sub">Tap the + button to log your first run.</p>
          </div>
        ) : (
          recent.map((run) => {
            const mood = run.mood ? moodMeta(run.mood) : null
            return (
              <button className="activity-item" key={run.id} onClick={() => onOpenRun(run)}>
                <div className="activity-mood">{mood ? mood.emoji : '\u{1F3C3}'}</div>
                <div className="activity-main">
                  <div className="activity-top-row">
                    <span className="activity-distance">
                      {run.distance} {run.unit}
                    </span>
                    <span className="activity-date">{relativeDate(run.date)}</span>
                  </div>
                  <p className="activity-note">{run.feeling || 'No notes'}</p>
                </div>
              </button>
            )
          })
        )}
      </div>

      <button className="insights-entry" onClick={onOpenInsights}>
        <div className="insights-entry-text">
          <span className="insights-entry-title">View insights</span>
          <span className="insights-entry-sub">Trends across distance, mood & pace</span>
        </div>
        <div className="insights-entry-arrow">
          <IconChevronRight size={18} />
        </div>
      </button>
    </div>
  )
}

/* ============================================================
   Insights screen
   ============================================================ */

const TIMEFRAME_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

const METRIC_OPTIONS = [
  { value: 'distance', label: 'Distance' },
  { value: 'mood', label: 'Mood' },
  { value: 'runs', label: 'Runs' },
]

function InsightsScreen({ runs, unit, onBack }) {
  const [timeframe, setTimeframe] = useState('week')
  const [metric, setMetric] = useState('distance')

  const data = useMemo(() => aggregate(runs, timeframe, metric), [runs, timeframe, metric])

  const totals = useMemo(() => {
    const totalDistance = runs.reduce((s, r) => s + (parseFloat(r.distance) || 0), 0)
    const moodVals = runs.filter((r) => r.mood).map((r) => r.mood)
    const avgMood = moodVals.length
      ? (moodVals.reduce((a, b) => a + b, 0) / moodVals.length).toFixed(1)
      : '—'
    return {
      totalDistance: Math.round(totalDistance * 10) / 10,
      avgMood,
      totalRuns: runs.length,
    }
  }, [runs])

  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric).label
  const yUnit = metric === 'distance' ? unit : metric === 'mood' ? '/5' : ''

  return (
    <div className="screen">
      <div className="insights-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          <IconChevronLeft size={20} />
        </button>
        <h1 className="insights-header-title">Insights</h1>
      </div>

      <div className="control-block">
        <p className="control-label">Timeframe</p>
        <Segmented options={TIMEFRAME_OPTIONS} value={timeframe} onChange={setTimeframe} />
      </div>
      <div className="control-block">
        <p className="control-label">Metric</p>
        <Segmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
      </div>

      <div className="chart-card">
        <div className="chart-card-title">
          <span className="card-title">
            {metricLabel} {yUnit && `(${yUnit})`}
          </span>
        </div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            {metric === 'mood' ? (
              <LineChart data={data} margin={{ top: 12, right: 16, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(20,20,20,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#A8A9AD' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 5]}
                  tick={{ fontSize: 11, fill: '#A8A9AD' }}
                  axisLine={false}
                  tickLine={false}
                  width={26}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#4457FF"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#4457FF' }}
                  connectNulls={false}
                />
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 12, right: 16, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(20,20,20,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#A8A9AD' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#A8A9AD' }}
                  axisLine={false}
                  tickLine={false}
                  width={26}
                  allowDecimals={metric === 'distance'}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                  cursor={{ fill: 'rgba(68,87,255,0.06)' }}
                />
                <Bar dataKey="value" fill="#FF6B4E" radius={[8, 8, 8, 8]} maxBarSize={28} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-title-row">
          <h2 className="card-title">All-time totals</h2>
        </div>
        <div className="stat-row">
          <div className="stat-pill">
            <div className="stat-pill-value">
              {totals.totalDistance} {unit}
            </div>
            <div className="stat-pill-label">Total distance</div>
          </div>
          <div className="stat-pill">
            <div className="stat-pill-value">{totals.totalRuns}</div>
            <div className="stat-pill-label">Runs logged</div>
          </div>
          <div className="stat-pill">
            <div className="stat-pill-value">{totals.avgMood}</div>
            <div className="stat-pill-label">Avg. mood</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Settings screen
   ============================================================ */

function SettingsScreen({ settings, onUpdateSettings, onClearData, runCount }) {
  const initials = settings.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'R'

  return (
    <div className="screen">
      <h1 className="home-greeting-name" style={{ marginBottom: 20 }}>
        Settings
      </h1>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="avatar-circle">{initials}</div>
        <div>
          <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 16 }}>
            {settings.name}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
            {runCount} {runCount === 1 ? 'run' : 'runs'} logged
          </div>
        </div>
      </div>

      <p className="settings-section-label">Profile</p>
      <div className="card">
        <div className="settings-row">
          <span className="settings-row-label">Name</span>
          <input
            className="settings-name-input"
            type="text"
            value={settings.name}
            onChange={(e) => onUpdateSettings({ ...settings, name: e.target.value })}
          />
        </div>
      </div>

      <p className="settings-section-label">Preferences</p>
      <div className="card">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span className="settings-row-label">Distance unit</span>
          <Segmented
            options={[
              { value: 'mi', label: 'Miles' },
              { value: 'km', label: 'Kilometers' },
            ]}
            value={settings.unit}
            onChange={(unit) => onUpdateSettings({ ...settings, unit })}
          />
        </div>
      </div>

      <p className="settings-section-label">Data</p>
      <div className="card">
        <button
          className="settings-row"
          style={{ width: '100%', textAlign: 'left', color: 'var(--coral)' }}
          onClick={onClearData}
        >
          <span className="settings-row-label" style={{ color: 'var(--coral)' }}>
            Clear all run data
          </span>
          <IconTrash size={18} />
        </button>
      </div>

      <div className="about-block">
        {'Stride \u2014 Run Journal'}
        <br />
        Your entries are stored privately on this device.
      </div>
    </div>
  )
}

/* ============================================================
   Bottom nav
   ============================================================ */

function BottomNav({ view, onNavigate, onAdd }) {
  return (
    <div className="bottom-nav-wrap">
      <nav className="bottom-nav">
        <button
          className={'nav-btn' + (view === 'home' || view === 'insights' ? ' active' : '')}
          onClick={() => onNavigate('home')}
        >
          <IconHome size={22} />
          <span className="nav-btn-label">Home</span>
        </button>

        <button className="nav-fab" onClick={onAdd} aria-label="Log a run">
          <IconPlus size={24} color="#fff" />
        </button>

        <button
          className={'nav-btn' + (view === 'settings' ? ' active' : '')}
          onClick={() => onNavigate('settings')}
        >
          <IconSettings size={22} />
          <span className="nav-btn-label">Settings</span>
        </button>
      </nav>
    </div>
  )
}

/* ============================================================
   Root App
   ============================================================ */

export default function App() {
  const [view, setView] = useState('home') // 'home' | 'insights' | 'settings'
  const [runs, setRuns] = useState(loadRuns)
  const [settings, setSettings] = useState(loadSettings)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedRun, setSelectedRun] = useState(null)

  useEffect(() => {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs))
  }, [runs])

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  function handleSaveRun(run) {
    setRuns((prev) => [run, ...prev])
    setShowAdd(false)
  }

  function handleDeleteRun(id) {
    setRuns((prev) => prev.filter((r) => r.id !== id))
  }

  function handleClearData() {
    if (window.confirm('Delete all logged runs? This cannot be undone.')) {
      setRuns([])
    }
  }

  return (
    <div className="app-shell">
      {view === 'home' && (
        <HomeScreen
          runs={runs}
          settings={settings}
          onOpenInsights={() => setView('insights')}
          onOpenRun={setSelectedRun}
        />
      )}
      {view === 'insights' && (
        <InsightsScreen runs={runs} unit={settings.unit} onBack={() => setView('home')} />
      )}
      {view === 'settings' && (
        <SettingsScreen
          settings={settings}
          onUpdateSettings={setSettings}
          onClearData={handleClearData}
          runCount={runs.length}
        />
      )}

      <BottomNav
        view={view}
        onNavigate={setView}
        onAdd={() => setShowAdd(true)}
      />

      {showAdd && (
        <AddRunSheet
          unit={settings.unit}
          onClose={() => setShowAdd(false)}
          onSave={handleSaveRun}
        />
      )}

      {selectedRun && (
        <RunDetailSheet
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
          onDelete={handleDeleteRun}
        />
      )}
    </div>
  )
}
