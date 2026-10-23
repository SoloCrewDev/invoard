'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  CheckCircle2,
  Copy,
  Download,
  Hand,
  LayoutGrid,
  MoreHorizontal,
  MousePointer2,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Undo2,
  UserX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

const initialFamilies = [
  { id: 'patel', name: 'Patel Family', location: 'Ahmedabad', color: 'gold', people: ['Rajesh', 'Sunita', 'Aarav', 'Meera', 'Ishaan'] },
  { id: 'sharma', name: 'Sharma Family', location: 'Delhi', color: 'blue', people: ['Vikram', 'Priya', 'Rohan', 'Anika'] },
  { id: 'iyer', name: 'Iyer Family', location: 'Chennai', color: 'coral', people: ['Suresh', 'Lakshmi', 'Kavya'] },
  { id: 'kapoor', name: 'Kapoor Family', location: 'Mumbai', color: 'purple', people: ['Amit', 'Neha', 'Kabir', 'Tara'] },
]

const positions = [
  { left: '24%', top: '35%' },
  { left: '57%', top: '28%' },
  { left: '34%', top: '68%' },
  { left: '72%', top: '66%' },
]

const fetcher = (url: string) => fetch(url).then((response) => response.json())

type BoardData = { families: typeof initialFamilies; positions: Record<string, { left: number; top: number }> }
type BoardSnapshot = {
  families: typeof initialFamilies
  positions: Record<string, { left: number; top: number }>
}

function damerauLevenshtein(a: string, b: string): number {
  const al = a.length, bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  const matrix: number[][] = []
  for (let i = 0; i <= al; i++) matrix[i] = [i]
  for (let j = 0; j <= bl; j++) matrix[0][j] = j
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost)
      }
    }
  }
  return matrix[al][bl]
}

function getGuestMatchScore(query: string, name: string) {
  const q = query.trim().toLowerCase()
  const n = name.trim().toLowerCase()
  if (!q || !n) return { matched: false, type: 'none' as const, dist: 99, score: 0 }
  if (q === n) return { matched: true, type: 'exact' as const, dist: 0, score: 1 }
  if (n.startsWith(q)) return { matched: true, type: 'prefix' as const, dist: 0, score: 0.95 }
  if (n.includes(q)) return { matched: true, type: 'contains' as const, dist: 0, score: 0.9 }

  const tokens = n.split(/\s+/)
  let bestDist = damerauLevenshtein(q, n)
  for (const t of tokens) {
    const d = damerauLevenshtein(q, t)
    if (d < bestDist) bestDist = d
  }
  const maxLen = Math.max(q.length, n.length)
  const sim = 1 - bestDist / maxLen
  const isMatch = (q.length >= 3 && bestDist <= 1) || (q.length >= 4 && bestDist <= 2) || (maxLen >= 7 && bestDist <= 3 && sim >= 0.55)
  return {
    matched: isMatch,
    type: (isMatch ? 'fuzzy' : 'none') as 'exact' | 'prefix' | 'contains' | 'fuzzy' | 'none',
    dist: bestDist,
    score: isMatch ? sim : 0,
  }
}

export default function Page() {
  const { data, mutate } = useSWR<BoardData>('/api/board', fetcher, { refreshInterval: 3000 })
  const [families, setFamilies] = useState<typeof initialFamilies>([])
  const [input, setInput] = useState('')
  const [zoom, setZoom] = useState(100)
  const [selected, setSelected] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isHandTool, setIsHandTool] = useState(false)
  const [familyPositions, setFamilyPositions] = useState<Record<string, { left: number; top: number }>>({})
  const [ratePerHead, setRatePerHead] = useState(3500)
  const [view, setView] = useState<'canvas' | 'list'>('canvas')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [extraGuests, setExtraGuests] = useState(0)
  const [editingFamily, setEditingFamily] = useState<string | null>(null)
  const [editInput, setEditInput] = useState('')
  const [undoStack, setUndoStack] = useState<BoardSnapshot[]>([])

  const familiesRef = useRef(families)
  familiesRef.current = families

  const familyPositionsRef = useRef(familyPositions)
  familyPositionsRef.current = familyPositions

  const preDragSnapshot = useRef<BoardSnapshot | null>(null)
  const dragStart = useRef<{ id: string; x: number; y: number; left?: number; top?: number; panX?: number; panY?: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  function getFamilyPosition(id: string, customPositions = familyPositionsRef.current, fList = familiesRef.current) {
    if (customPositions[id]) return customPositions[id]
    const idx = fList.findIndex((item) => item.id === id)
    const fallback = positions[(idx >= 0 ? idx : 0) % positions.length]
    return { left: parseFloat(fallback.left), top: parseFloat(fallback.top) }
  }

  const pushUndo = (snapshot?: BoardSnapshot) => {
    const currentResolvedPositions: Record<string, { left: number; top: number }> = {}
    familiesRef.current.forEach((f) => {
      currentResolvedPositions[f.id] = getFamilyPosition(f.id)
    })
    const currentSnapshot: BoardSnapshot = snapshot ?? {
      families: [...familiesRef.current],
      positions: currentResolvedPositions,
    }
    setUndoStack((prev) => [...prev.slice(-25), currentSnapshot])
  }

  const handleUndo = () => {
    if (undoStack.length === 0) return
    const prevSnapshot = undoStack[undoStack.length - 1]
    setUndoStack((prev) => prev.slice(0, -1))
    setFamilies(prevSnapshot.families)
    setFamilyPositions(prevSnapshot.positions)
    void saveBoard(prevSnapshot.families, prevSnapshot.positions)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase()
        if (activeTag === 'input' || activeTag === 'textarea') return
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undoStack])

  function autoArrange() {
    if (families.length === 0) return

    const currentResolvedPositions: Record<string, { left: number; top: number }> = {}
    familiesRef.current.forEach((f) => {
      currentResolvedPositions[f.id] = getFamilyPosition(f.id)
    })
    pushUndo({
      families: [...familiesRef.current],
      positions: currentResolvedPositions,
    })

    const n = families.length
    const nextPositions: Record<string, { left: number; top: number }> = {}

    // Live dimensions of the canvas wrap and canvas grid
    const wrapW = canvasRef.current?.clientWidth || 1100
    const wrapH = canvasRef.current?.clientHeight || 750
    const gridW = wrapW + 80
    const gridH = wrapH + 80

    // Safe spacing: each family cluster with surrounding people spans ~320px wide by ~250px high.
    // Minimum 440px horizontal and 360px vertical center-to-center distance guarantees ZERO overlap.
    const safeDistX = 440
    const safeDistY = 360

    if (n === 1) {
      nextPositions[families[0].id] = { left: 50, top: 50 }
      setZoom(100)
    } else if (n === 2) {
      const stepXPercent = Math.min(42, (safeDistX / gridW) * 100)
      nextPositions[families[0].id] = { left: Math.round((50 - stepXPercent / 2) * 10) / 10, top: 50 }
      nextPositions[families[1].id] = { left: Math.round((50 + stepXPercent / 2) * 10) / 10, top: 50 }
      setZoom(100)
    } else {
      const canFit3Cols = (gridW - 100) >= 2 * safeDistX
      const cols = n <= 4 ? 2 : (n <= 8 || !canFit3Cols) ? 3 : 4
      const rows = Math.ceil(n / cols)

      const stepXPercent = (safeDistX / gridW) * 100
      const stepYPercent = (safeDistY / gridH) * 100

      // Start below canvas heading (~24%)
      const startYPercent = rows === 1 ? 50 : rows === 2 ? 34 : 28

      families.forEach((family, index) => {
        const r = Math.floor(index / cols)
        const c = index % cols
        const itemsInThisRow = r === rows - 1 && n % cols !== 0 ? n % cols : cols

        const rowXOffset = (c - (itemsInThisRow - 1) / 2) * stepXPercent
        const left = Math.round((50 + rowXOffset) * 10) / 10
        const top = Math.round((startYPercent + r * stepYPercent) * 10) / 10

        nextPositions[family.id] = { left, top }
      })

      // Smart zoom-to-fit: adjust zoom so that all families and their people are visible
      const neededWidth = (cols - 1) * safeDistX + 380
      const neededHeight = (rows - 1) * safeDistY + 360
      const zoomX = ((wrapW - 60) / neededWidth) * 100
      const zoomY = ((wrapH - 120) / neededHeight) * 100
      const fitZoom = Math.min(100, Math.max(70, Math.floor(Math.min(zoomX, zoomY))))
      setZoom(fitZoom)
    }

    setFamilyPositions(nextPositions)
    setPan({ x: 0, y: 0 })
    if (view !== 'canvas') setView('canvas')
    void saveBoard(familiesRef.current, nextPositions)
  }

  function addPersonToFamily(familyId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    pushUndo()
    const nextFamilies = families.map((f) => f.id === familyId ? { ...f, people: [...new Set([...f.people, trimmed])] } : f)
    setFamilies(nextFamilies)
    void saveBoard(nextFamilies)
  }

  const saveBoard = async (nextFamilies: typeof initialFamilies, nextPositions = familyPositionsRef.current) => {
    await mutate(fetch('/api/board', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ families: nextFamilies, positions: nextPositions }) }).then((response) => response.json()), { revalidate: false })
  }

  useEffect(() => {
    if (data) {
      setFamilies(data.families)
      setFamilyPositions(data.positions)
    }
  }, [data])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target as Node)) {
        setSearchDropdownOpen(false)
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSearchDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const guestMatches = useMemo(() => {
    const q = search.trim()
    if (!q) return []
    const results: Array<{
      person: string
      familyId: string
      familyName: string
      familyLocation: string
      familyColor: string
      score: number
      distance: number
      isSpellingMatch: boolean
    }> = []

    families.forEach((family) => {
      family.people.forEach((person) => {
        const match = getGuestMatchScore(q, person)
        if (match.matched) {
          results.push({
            person,
            familyId: family.id,
            familyName: family.name,
            familyLocation: family.location,
            familyColor: family.color,
            score: match.score,
            distance: match.dist,
            isSpellingMatch: match.type === 'fuzzy' && match.dist > 0,
          })
        }
      })
    })

    results.sort((a, b) => b.score - a.score || a.distance - b.distance)
    return results
  }, [families, search])

  function handleSelectMatch(familyId: string) {
    setSelected(familyId)
    if (view !== 'canvas') setView('canvas')
    const pos = getFamilyPosition(familyId)
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const targetX = rect.width * (0.5 - pos.left / 100)
      const targetY = rect.height * (0.5 - pos.top / 100)
      setPan({ x: Math.round(targetX), y: Math.round(targetY) })
    }
    setSearchDropdownOpen(false)
  }

  const totalGuests = useMemo(() => families.reduce((sum, family) => sum + family.people.length, 0), [families])
  const visibleFamilies = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return families
    return families.filter((family) => {
      if (`${family.name} ${family.people.join(' ')}`.toLowerCase().includes(query)) return true
      if (getGuestMatchScore(query, family.name).matched) return true
      return family.people.some((person) => getGuestMatchScore(query, person).matched)
    })
  }, [families, search])

  function addFamily(event: React.FormEvent) {
    event.preventDefault()
    const [rawName, rawPeople = ''] = input.split(':')
    const name = rawName.trim()
    const people = rawPeople.split(',').map((person) => person.trim()).filter(Boolean)
    if (!name || people.length === 0) return
    pushUndo()
    const existing = families.find((family) => family.name.toLowerCase() === name.toLowerCase())
    let nextFamilies
    if (existing) {
      nextFamilies = families.map((family) => family.id === existing.id ? { ...family, people: [...new Set([...family.people, ...people])] } : family)
    } else {
      nextFamilies = [...families, { id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, name, location: 'New invite', color: ['gold', 'blue', 'coral', 'purple'][families.length % 4], people }]
    }
    setFamilies(nextFamilies)
    void saveBoard(nextFamilies)
    setInput('')
  }

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!isHandTool) return
    if ((event.target as HTMLElement).closest('button, input, .canvas-controls, .mode-controls, .bottom-bar, .cluster-menu')) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { id: 'canvas', x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || dragStart.current.id !== 'canvas') return
    setPan({ x: (dragStart.current.panX ?? pan.x) + event.clientX - dragStart.current.x, y: (dragStart.current.panY ?? pan.y) + event.clientY - dragStart.current.y })
  }

  function endPan() {
    if (dragStart.current?.id && dragStart.current.id !== 'canvas') {
      const draggedId = dragStart.current.id
      const prevPos = preDragSnapshot.current?.positions[draggedId]
      const currentPos = familyPositionsRef.current[draggedId] ?? getFamilyPosition(draggedId)
      if (preDragSnapshot.current && prevPos && currentPos && (Math.abs(prevPos.left - currentPos.left) > 0.1 || Math.abs(prevPos.top - currentPos.top) > 0.1)) {
        pushUndo(preDragSnapshot.current)
      }
      void saveBoard(familiesRef.current, familyPositionsRef.current)
    }
    preDragSnapshot.current = null
    dragStart.current = null
  }

  function startFamilyDrag(event: React.PointerEvent<HTMLDivElement>, id: string) {
    if (isHandTool) return
    event.stopPropagation()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    preDragSnapshot.current = {
      families: [...familiesRef.current],
      positions: { ...familyPositionsRef.current, [id]: getFamilyPosition(id) },
    }
    const pos = getFamilyPosition(id)
    dragStart.current = { id, x: event.clientX, y: event.clientY, left: pos.left, top: pos.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveFamily(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStart.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!drag || !rect || drag.id === 'canvas') return
    const scale = zoom / 100
    setFamilyPositions((current) => ({ ...current, [drag.id]: { left: (drag.left ?? 0) + ((event.clientX - drag.x) / rect.width) * 100 / scale, top: (drag.top ?? 0) + ((event.clientY - drag.y) / rect.height) * 100 / scale } }))
  }

  function removeFamily(id: string) {
    pushUndo()
    const nextFamilies = families.filter((family) => family.id !== id)
    setFamilies(nextFamilies)
    void saveBoard(nextFamilies)
    setSelected(null)
  }

  function removePerson(familyId: string, person: string) {
    pushUndo()
    const nextFamilies = families.map((family) => family.id === familyId ? { ...family, people: family.people.filter((member) => member !== person) } : family).filter((family) => family.people.length > 0)
    setFamilies(nextFamilies)
    void saveBoard(nextFamilies)
  }

  if (!data) return <LoadingScreen />

  return (
    <main className="invite-app">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStns_a9lbm6EcBY-Cwzc1ThWLtDQzlzgcKaEeoQxvIRg&s=10" alt="Wedding logo" /></div><span>Invitation Board</span><span className="live-dot" /></div>
        <div className="view-tabs">
          <button className={view === 'canvas' ? 'active' : ''} onClick={() => setView('canvas')}>Canvas</button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
        </div>
        <div className="top-actions">
          <div className="search-box-wrap" ref={searchWrapRef}>
            <div className="search-bar">
              <Search size={14} className="search-bar-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="search-bar-input"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setSearchDropdownOpen(true)
                }}
                onFocus={() => setSearchDropdownOpen(true)}
                placeholder="Check if person is added..."
                aria-label="Check if person is added"
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch('')
                    setSearchDropdownOpen(false)
                    searchInputRef.current?.focus()
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {searchDropdownOpen && search.trim().length > 0 && (
              <div className="search-dropdown" onPointerDown={(event) => event.stopPropagation()}>
                {guestMatches.length > 0 ? (
                  <div className="search-results-box">
                    <div className="search-status-header status-added">
                      <CheckCircle2 size={16} />
                      <div>
                        <strong>Already Added!</strong>
                        <span>{guestMatches.length} matching {guestMatches.length === 1 ? 'guest' : 'guests'} on the list</span>
                      </div>
                    </div>
                    <div className="search-matches-list">
                      {guestMatches.map((match) => (
                        <div
                          key={`${match.familyId}-${match.person}`}
                          className="search-match-item"
                          onClick={() => handleSelectMatch(match.familyId)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className={`search-match-dot sb-dot-${match.familyColor}`} />
                          <div className="search-match-info">
                            <div className="search-match-name-row">
                              <span className="search-match-name">{match.person}</span>
                              {match.isSpellingMatch && (
                                <span className="search-fuzzy-pill">Spelling match</span>
                              )}
                            </div>
                            <span className="search-match-meta">
                              {match.familyName} · {match.familyLocation}
                            </span>
                          </div>
                          <span className="search-jump-hint">View →</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="search-results-box">
                    <div className="search-status-header status-not-added">
                      <UserX size={16} />
                      <div>
                        <strong>Not Added Yet</strong>
                        <span>No guest found matching &ldquo;{search.trim()}&rdquo;</span>
                      </div>
                    </div>
                    <p className="search-not-added-desc">
                      This person has not been added to any family yet. Ready to invite!
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="icon-button undo-button"
            aria-label="Undo"
            title={undoStack.length > 0 ? `Undo (${undoStack.length}) — Ctrl+Z` : 'Undo (Ctrl+Z)'}
            disabled={undoStack.length === 0}
            onClick={handleUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="arrange-button"
            aria-label="Auto arrange families"
            title="Auto arrange families on canvas"
            onClick={autoArrange}
          >
            <LayoutGrid size={15} />
            <span>Auto arrange</span>
          </button>
          <button className="icon-button" aria-label="Toggle sidebar" title="Toggle summary sidebar" onClick={() => setSidebarOpen(o => !o)}><SlidersHorizontal size={17} /></button>
          <button className="share-button" onClick={copyLink}><Share2 size={15} /> {copied ? 'Link copied' : 'Share board'}</button>
        </div>
      </header>

      <div className={`app-body ${sidebarOpen ? 'sidebar-visible' : ''}`}>
        <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
            <div className="sb-section">
              <span className="sb-heading">Guest Summary</span>
              <div className="sb-stat"><span className="sb-num">{families.length}</span><span className="sb-label">Families</span></div>
              <div className="sb-stat"><span className="sb-num">{totalGuests}</span><span className="sb-label">Confirmed guests</span></div>
            </div>
            <div className="sb-divider" />
            <div className="sb-section">
              <span className="sb-heading">Estimate</span>
              <label className="sb-field-label">Extra / buffer guests</label>
              <div className="sb-input-row">
                <input className="sb-input" type="number" min={0} value={extraGuests} onChange={(e) => setExtraGuests(Math.max(0, Number(e.target.value)))} aria-label="Extra guests estimate" />
                <span className="sb-input-suffix">guests</span>
              </div>
              <div className="sb-stat sb-total"><span className="sb-num">{totalGuests + extraGuests}</span><span className="sb-label">Total estimated</span></div>
            </div>
            <div className="sb-divider" />
            <div className="sb-section">
              <span className="sb-heading">Cost Estimate</span>
              <label className="sb-field-label">Cost per head</label>
              <div className="sb-input-row">
                <span className="sb-input-prefix">PKR</span>
                <input className="sb-input" type="number" min={0} value={ratePerHead} onChange={(e) => setRatePerHead(Math.max(0, Number(e.target.value)))} aria-label="Cost per head in PKR" />
              </div>
              <div className="sb-stat sb-expense">
                <span className="sb-num">PKR {((totalGuests + extraGuests) * ratePerHead).toLocaleString()}</span>
                <span className="sb-label">Estimated total expense</span>
              </div>
            </div>
          </aside>

        <div className="main-content">
          {view === 'canvas' ? (
            <>
              <section ref={canvasRef} className={`canvas-wrap ${isHandTool ? 'pan-mode' : ''}`} aria-label="Infinite family canvas" onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
                <div className="canvas-grid" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})` }}>
                  <div className="canvas-heading"><span>THE WEDDING OF</span><h1>Our Girl&apos;s Wedding</h1><p>Guest map · Anyone with the link can edit</p></div>
                  {visibleFamilies.map((family, index) => {
                    const fallback = positions[index % positions.length]
                    const pos = familyPositions[family.id] ?? { left: parseFloat(fallback.left), top: parseFloat(fallback.top) }
                    const isSelected = selected === family.id
                    return <FamilyCluster key={family.id} family={family} position={pos} selected={isSelected} onSelect={() => setSelected(isSelected ? null : family.id)} onDragStart={startFamilyDrag} onDragMove={moveFamily} onDragEnd={endPan} onRemoveFamily={removeFamily} onRemovePerson={removePerson} />
                  })}
                </div>
                <div className="canvas-controls" onPointerDown={(e) => e.stopPropagation()}>
                  <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom(Math.max(70, zoom - 10))}><ZoomOut size={16} /></button>
                  <span>{zoom}%</span>
                  <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom(Math.min(130, zoom + 10))}><ZoomIn size={16} /></button>
                </div>
                <div className="mode-controls" onPointerDown={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={!isHandTool ? 'active' : ''}
                    aria-label="Select tool"
                    title="Select tool"
                    onClick={() => setIsHandTool(false)}
                  >
                    <MousePointer2 size={16} />
                  </button>
                  <button
                    type="button"
                    className={isHandTool ? 'active' : ''}
                    aria-label="Pan tool"
                    title="Pan tool"
                    onClick={() => setIsHandTool(true)}
                  >
                    <Hand size={16} />
                  </button>
                </div>
              </section>
              <div className="bottom-bar">
                <form className="composer" onSubmit={addFamily}><div className="composer-icon"><Plus size={19} /></div><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Add a family — e.g. Patel Family: Rajesh, Sunita, Aarav" aria-label="Add a family and guests" /><button type="submit" className="add-button">Add guests <span>↵</span></button></form>
                <div className="hint"><span>Press <kbd>Enter</kbd> to add</span><span className="hint-separator">·</span><button type="button" onClick={copyLink}><Share2 size={12} /> Invite family to edit</button></div>
              </div>
            </>
          ) : (
            <div className="list-view">
              <div className="list-grid">
                {visibleFamilies.map((family) => (
                  <FamilyCard key={family.id} family={family} onRemoveFamily={removeFamily} onRemovePerson={removePerson} onAddPerson={addPersonToFamily} />
                ))}
                <AddFamilyCard onAdd={(name, people) => {
                  pushUndo()
                  const nextFamilies = [...families, { id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, name, location: 'New invite', color: ['gold', 'blue', 'coral', 'purple'][families.length % 4], people }]
                  setFamilies(nextFamilies)
                  void saveBoard(nextFamilies)
                }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function FamilyCluster({ family, position, selected, onSelect, onDragStart, onDragMove, onDragEnd, onRemoveFamily, onRemovePerson }: { family: typeof initialFamilies[number]; position: { left: number; top: number }; selected: boolean; onSelect: () => void; onDragStart: (event: React.PointerEvent<HTMLDivElement>, id: string) => void; onDragMove: (event: React.PointerEvent<HTMLDivElement>) => void; onDragEnd: () => void; onRemoveFamily: (id: string) => void; onRemovePerson: (familyId: string, person: string) => void }) {
  const center = { x: 150, y: 105 }
  const count = family.people.length
  // Dynamic radius based on member count so persons never overlap each other or the family node
  const radius = count <= 3 ? 86 : count <= 4 ? 92 : count <= 5 ? 98 : count <= 6 ? 106 : Math.min(124, 88 + count * 4.5)
  const peopleWithPositions = family.people.map((person, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
    return { person, x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
  })

  return <div className={`cluster cluster-${family.color} ${selected ? 'selected' : ''}`} style={{ left: `${position.left}%`, top: `${position.top}%` }} onPointerDown={(event) => onDragStart(event, family.id)} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
    <svg className="connections" viewBox="0 0 300 210" aria-hidden="true">
      {peopleWithPositions.map(({ person, x, y }) => <line key={`line-${person}`} x1={center.x} y1={center.y} x2={x} y2={y} />)}
    </svg>
    <button className="family-node" onClick={(event) => { event.stopPropagation(); onSelect() }}><span className="family-kicker">FAMILY</span><strong>{family.name}</strong><small>{family.location} · {family.people.length} guests</small><span className="family-remove" role="button" aria-label={`Remove ${family.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemoveFamily(family.id) }}>×</span></button>
    {peopleWithPositions.map(({ person, x, y }) => <div className="person-node" key={person} style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)' }}><span>{person}</span><button className="remove-person" aria-label={`Remove ${person}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemovePerson(family.id, person) }}>×</button></div>)}
    {selected && <div className="cluster-menu"><button aria-label="Remove family" onClick={(event) => { event.stopPropagation(); onRemoveFamily(family.id) }}><MoreHorizontal size={15} /> Remove family</button></div>}
  </div>
}

function FamilyCard({ family, onRemoveFamily, onRemovePerson, onAddPerson }: {
  family: typeof initialFamilies[number]
  onRemoveFamily: (id: string) => void
  onRemovePerson: (familyId: string, person: string) => void
  onAddPerson: (familyId: string, name: string) => void
}) {
  const [addInput, setAddInput] = useState('')

  function handleAddPerson(e: React.FormEvent) {
    e.preventDefault()
    if (!addInput.trim()) return
    onAddPerson(family.id, addInput)
    setAddInput('')
  }

  return (
    <div className={`fc fc-${family.color}`}>
      <div className="fc-header">
        <div>
          <span className="fc-kicker">FAMILY</span>
          <strong className="fc-name">{family.name}</strong>
        </div>
        <button className="fc-remove-family" aria-label={`Remove ${family.name}`} onClick={() => onRemoveFamily(family.id)}>×</button>
      </div>
      <div className="fc-people">
        {family.people.map((person) => (
          <span key={person} className="fc-person">
            {person}
            <button className="fc-remove-person" aria-label={`Remove ${person}`} onClick={() => onRemovePerson(family.id, person)}>×</button>
          </span>
        ))}
      </div>
      <form className="fc-add" onSubmit={handleAddPerson}>
        <input value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="Add guest..." aria-label="Add guest" />
        <button type="submit"><Plus size={13} /></button>
      </form>
    </div>
  )
}

function AddFamilyCard({ onAdd }: { onAdd: (name: string, people: string[]) => void }) {
  const [input, setInput] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const [rawName, rawPeople = ''] = input.split(':')
    const name = rawName.trim()
    const people = rawPeople.split(',').map((p) => p.trim()).filter(Boolean)
    if (!name || people.length === 0) return
    onAdd(name, people)
    setInput('')
  }

  return (
    <div className="fc fc-add-card">
      <strong className="fc-name">New Family</strong>
      <p className="fc-add-hint">Format: Family Name: Person1, Person2</p>
      <form className="fc-add-family-form" onSubmit={handleSubmit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Khan Family: Ali, Sara" aria-label="Add new family" />
        <button type="submit" className="fc-add-submit"><Plus size={14} /> Add</button>
      </form>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-inner">
        <div className="loading-mark">
          <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStns_a9lbm6EcBY-Cwzc1ThWLtDQzlzgcKaEeoQxvIRg&s=10" alt="Wedding logo" />
        </div>
        <p className="loading-title">Invitation Board</p>
        <p className="loading-sub">Loading your guest list...</p>
        <div className="loading-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}
