/**
 * MOSAIC — GM Dedicated Game Configuration Panel
 *
 * Implements Sections A through M:
 * - A. Fixed QR Codes (10 permanent master identities: QR-01 through QR-10)
 * - B. Question Bank (Real count, search, filter, auto IDs, Add/Edit/Delete)
 * - C. Questions per QR (Min 1, Max 2, locked to automatic generation)
 * - D. Puzzle Image (Preview, image update, 5 vs 6 player piece breakdown)
 * - E. Decoy Messages (Persistent CRUD, 'Try another QR Buddy!' validation)
 * - F. Team Settings (5 and 6 players, starting lives 2, single active game)
 * - G. Round 1 Settings (Durations, auto-assignment calculations)
 * - H. Transition Settings (Duration 60s, role/task privacy)
 * - I. Round 2 Settings (Continuous 420s master, 1 imposter, 2 max kills)
 * - J. Voting Settings (Self-vote NO, No Elimination default, Revote, Random Pick)
 * - K. Physical Task Settings (Zones 1-6, Add/Edit/Delete, future games only)
 * - L. Automatic Generation Explanation (Read-only 10-step process)
 * - M. Save Configuration (MongoDB persistence, last-saved timestamp)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  QrCode, BookOpen, Layers, Image as ImageIcon, MessageSquare, Users,
  Clock, Shield, Vote, Wrench, Info, Save, Download, Printer, Plus,
  Edit2, Trash2, Search, Filter, AlertCircle, CheckCircle, Loader2,
  Eye, AlertTriangle, X
} from 'lucide-react';
import { BrowserQRCodeSvgWriter } from '@zxing/library';
import {
  getGameConfig, updateGameConfig, listQuestions, createQuestion,
  updateQuestion, deleteQuestion, listFixedQrs, listDecoys,
  createDecoy, updateDecoy, deleteDecoy, listTasks, createTask,
  updateTask, deleteTask, updatePuzzleImage,
  type GameConfigData, type QuestionBankItem, type FixedQrCodeItem,
  type DecoyMessageItem, type PhysicalTaskItem
} from '@/services/gameService';
import { AnswerOption } from '@/types/enums';

const REQUIRED_DECOY_PHRASE = 'Try another QR Buddy!';

const CATEGORIES = [
  'ALL',
  'Computer Science',
  'Networking',
  'Programming',
  'Electronics',
  'Operating Systems',
];

export default function GameConfigurationPanel() {
  const [activeTab, setActiveTab] = useState<
    'qr' | 'questions' | 'puzzle' | 'decoys' | 'tasks' | 'settings' | 'generation'
  >('qr');

  // Config State
  const [config, setConfig] = useState<GameConfigData>({
    round1DurationSeconds: 240,
    transitionDurationSeconds: 60,
    round2DurationSeconds: 420,
    bodyReportDurationSeconds: 20,
    moveToVotingDurationSeconds: 15,
    votingDurationSeconds: 15,
    startingLives: 2,
    minQuestionsPerQr: 1,
    maxQuestionsPerQr: 2,
    allowSelfVote: false,
    tieRule: 'NO_ELIMINATION',
    puzzleImagePath: null,
  });
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Section A: Fixed QRs
  const [fixedQrs, setFixedQrs] = useState<FixedQrCodeItem[]>([]);
  const [selectedQrPreview, setSelectedQrPreview] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Section B: Question Bank
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [qSearch, setQSearch] = useState('');
  const [qCategory, setQCategory] = useState('ALL');
  const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [questionDeleteTarget, setQuestionDeleteTarget] = useState<string | null>(null);

  // Section D: Puzzle Image
  const [puzzleUrlInput, setPuzzleUrlInput] = useState('');
  const [isUpdatingPuzzle, setIsUpdatingPuzzle] = useState(false);

  // Section E: Decoys
  const [decoys, setDecoys] = useState<DecoyMessageItem[]>([]);
  const [editingDecoy, setEditingDecoy] = useState<DecoyMessageItem | null>(null);
  const [isDecoyModalOpen, setIsDecoyModalOpen] = useState(false);
  const [decoyDeleteTarget, setDecoyDeleteTarget] = useState<string | null>(null);
  const [decoyError, setDecoyError] = useState<string | null>(null);

  // Section K: Physical Tasks
  const [tasks, setTasks] = useState<PhysicalTaskItem[]>([]);
  const [editingTask, setEditingTask] = useState<PhysicalTaskItem | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskDeleteTarget, setTaskDeleteTarget] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Load Initial Data
  const loadConfigData = useCallback(async () => {
    const [cfgRes, qrsRes, decoysRes, tasksRes, qRes] = await Promise.all([
      getGameConfig(),
      listFixedQrs(),
      listDecoys(),
      listTasks(),
      listQuestions(),
    ]);

    if (cfgRes.success && cfgRes.data) {
      setConfig(cfgRes.data);
      if (cfgRes.data.puzzleImagePath) {
        setPuzzleUrlInput(cfgRes.data.puzzleImagePath);
      }
      setLastSaved(new Date().toLocaleTimeString());
    }

    if (qrsRes.success && qrsRes.data?.qrCodes) {
      setFixedQrs(qrsRes.data.qrCodes);
    } else {
      // Fallback display if not seeded
      setFixedQrs(
        Array.from({ length: 10 }, (_, i) => {
          const id = `QR-${String(i + 1).padStart(2, '0')}`;
          return { _id: id, qrId: id, displayLabel: `Physical QR Code ${id}`, createdAt: '' };
        })
      );
    }

    if (decoysRes.success && decoysRes.data?.decoys) {
      setDecoys(decoysRes.data.decoys);
    }

    if (tasksRes.success && tasksRes.data?.tasks) {
      setTasks(tasksRes.data.tasks);
    }

    if (qRes.success && qRes.data?.questions) {
      setQuestions(qRes.data.questions);
    }
  }, []);

  useEffect(() => {
    void loadConfigData();
  }, [loadConfigData]);

  // Section M: Save Configuration
  async function handleSaveConfig() {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    if (config.minQuestionsPerQr > config.maxQuestionsPerQr) {
      setSaveError('Minimum questions per QR cannot exceed maximum questions per QR.');
      setIsSaving(false);
      return;
    }

    const res = await updateGameConfig(config);
    setIsSaving(false);

    if (!res.success) {
      setSaveError(res.error?.message || 'Failed to save configuration.');
      return;
    }

    setConfig(res.data);
    setLastSaved(new Date().toLocaleTimeString());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  // QR SVG Generator Helper
  function generateQrSvg(text: string, size = 180): string {
    try {
      const writer = new BrowserQRCodeSvgWriter();
      const svg = writer.write(text, size, size);
      return new XMLSerializer().serializeToString(svg);
    } catch {
      return '';
    }
  }

  function downloadQrSvg(qrId: string) {
    const svgContent = generateQrSvg(qrId, 300);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${qrId}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handlePrintSheet() {
    window.print();
  }

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-mosaic-border/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Game Configuration</h1>
            <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-mosaic-accent/15 text-mosaic-accent border border-mosaic-accent/30">
              GM MASTER CONTROLS
            </span>
          </div>
          <p className="text-mosaic-muted text-sm mt-1">
            Authoritative rules, master QR identities, question bank, decoy messages, and physical tasks.
          </p>
        </div>

        {/* Global Save Button & Timestamp */}
        <div className="flex items-center gap-4">
          {lastSaved && (
            <p className="text-xs text-mosaic-muted font-mono">
              Last saved: <span className="text-white">{lastSaved}</span>
            </p>
          )}
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveConfig}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mosaic-accent text-black font-bold hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-mosaic-accent/20 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Configuration
          </button>
        </div>
      </div>

      {/* Save Alerts */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-emerald-400 text-sm">
          <CheckCircle className="w-5 h-5 shrink-0" />
          Configuration saved successfully to MongoDB! Running games use their immutable snapshots; changes apply to future games.
        </div>
      )}
      {saveError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {saveError}
        </div>
      )}

      {/* Section Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-mosaic-surface/60 border border-mosaic-border/60 rounded-2xl">
        {[
          { key: 'qr', label: 'Fixed Master QRs', icon: QrCode, badge: `${fixedQrs.length}/10` },
          { key: 'questions', label: 'Question Bank', icon: BookOpen, badge: questions.length },
          { key: 'decoys', label: 'Decoy Messages', icon: MessageSquare, badge: decoys.length },
          { key: 'tasks', label: 'Physical Tasks', icon: Wrench, badge: `${tasks.length}/6` },
          { key: 'puzzle', label: 'Puzzle Image', icon: ImageIcon },
          { key: 'settings', label: 'Round & Team Rules', icon: Layers },
          { key: 'generation', label: 'Auto-Generation Spec', icon: Info },
        ].map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === key
                ? 'bg-mosaic-accent text-black shadow-md'
                : 'text-mosaic-muted hover:text-white hover:bg-mosaic-dark/80'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {badge !== undefined && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeTab === key ? 'bg-black/20 text-black' : 'bg-white/10 text-mosaic-muted'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── SECTION A: FIXED MASTER QR CODES ────────────────────────────── */}
      {activeTab === 'qr' && (
        <div className="space-y-6">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex items-start gap-4 text-amber-300">
            <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5 text-amber-400" />
            <div className="text-sm space-y-1">
              <p className="font-bold text-amber-200">PERMANENT PHYSICAL ASSETS — NEVER RE-ENCODE</p>
              <p className="text-amber-300/90 leading-relaxed">
                These 10 physical master QR codes encode the permanent strings <code className="bg-black/30 px-1 py-0.5 rounded text-amber-200">QR-01</code> through <code className="bg-black/30 px-1 py-0.5 rounded text-amber-200">QR-10</code>. Their game meanings (puzzle pieces vs decoys, questions, and decoy messages) are dynamically assigned per game by the backend. Printing this sheet again will reproduce the exact same 10 identities.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-semibold text-emerald-400">10 / 10 Master QR Codes Ready</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPrintModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-mosaic-surface border border-mosaic-border rounded-xl text-xs font-semibold text-white hover:bg-mosaic-dark transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4 text-mosaic-accent" />
                Print All Sheet
              </button>
            </div>
          </div>

          {/* 10 QR Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {fixedQrs.map((qr) => (
              <div
                key={qr.qrId}
                className="bg-mosaic-surface border border-mosaic-border/70 rounded-2xl p-4 flex flex-col items-center justify-between gap-3 hover:border-mosaic-accent/50 transition-all group"
              >
                <div className="w-full flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-mosaic-accent">{qr.qrId}</span>
                  <span className="text-[10px] text-mosaic-muted uppercase tracking-wider">Fixed</span>
                </div>

                {/* Scannable SVG Render */}
                <div
                  className="bg-white p-3 rounded-xl shadow-md cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setSelectedQrPreview(qr.qrId)}
                  title="Click to preview large"
                  dangerouslySetInnerHTML={{ __html: generateQrSvg(qr.qrId, 120) }}
                />

                <p className="text-xs text-center text-mosaic-muted font-medium truncate w-full">
                  {qr.displayLabel}
                </p>

                <div className="w-full grid grid-cols-2 gap-2 pt-1 border-t border-mosaic-border/40">
                  <button
                    type="button"
                    onClick={() => setSelectedQrPreview(qr.qrId)}
                    className="flex items-center justify-center gap-1 py-1 text-[11px] font-medium text-mosaic-muted hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadQrSvg(qr.qrId)}
                    className="flex items-center justify-center gap-1 py-1 text-[11px] font-medium text-mosaic-accent hover:text-white rounded-lg hover:bg-mosaic-accent/10 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    SVG
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── SECTION B: QUESTION BANK ────────────────────────────────────── */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-mosaic-muted">Populated Questions:</span>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-mosaic-accent/15 text-mosaic-accent border border-mosaic-accent/30">
                {questions.length} Questions Populated
              </span>
              {questions.length < 50 && (
                <span className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
                  Content still being populated
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingQuestion(null);
                setIsQuestionModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-mosaic-accent text-black font-bold rounded-xl text-xs hover:brightness-110 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Question
            </button>
          </div>

          {/* Search & Category Filter */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 text-mosaic-muted absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search question text, category, or Q-ID..."
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-mosaic-surface border border-mosaic-border rounded-xl text-sm text-white placeholder-mosaic-muted focus:outline-none focus:border-mosaic-accent"
              />
            </div>
            <div className="relative">
              <Filter className="w-4 h-4 text-mosaic-muted absolute left-3 top-3" />
              <select
                value={qCategory}
                onChange={(e) => setQCategory(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-mosaic-surface border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent cursor-pointer"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Question List */}
          <div className="space-y-3">
            {questions
              .filter((q) => {
                const matchesCat = qCategory === 'ALL' || q.category === qCategory;
                const matchesSearch =
                  !qSearch ||
                  q.questionText.toLowerCase().includes(qSearch.toLowerCase()) ||
                  q.questionId.toLowerCase().includes(qSearch.toLowerCase()) ||
                  q.category.toLowerCase().includes(qSearch.toLowerCase());
                return matchesCat && matchesSearch;
              })
              .map((q) => (
                <div
                  key={q._id}
                  className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5 hover:border-mosaic-border/90 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-mosaic-accent text-sm bg-mosaic-dark/80 px-2 py-0.5 rounded border border-mosaic-border">
                        {q.questionId}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {q.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuestion(q);
                          setIsQuestionModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-mosaic-muted hover:text-white hover:bg-white/5 cursor-pointer"
                        title="Edit question"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuestionDeleteTarget(q.questionId)}
                        className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                        title="Delete question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-white text-sm font-medium leading-relaxed">{q.questionText}</p>

                  {/* Options Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                      <div
                        key={opt}
                        className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                          q.correctAnswer === opt
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-semibold'
                            : 'bg-mosaic-dark/50 border-mosaic-border/40 text-mosaic-muted'
                        }`}
                      >
                        <span className="font-bold">{opt}.</span>
                        <span>{q[`option${opt}` as keyof QuestionBankItem] as string}</span>
                      </div>
                    ))}
                  </div>

                  {/* Technical Explanation (GM Confidential) */}
                  <div className="p-3 bg-mosaic-dark/70 rounded-xl border border-mosaic-border/40 text-xs text-mosaic-muted leading-relaxed">
                    <span className="font-semibold text-mosaic-accent mr-1">Explanation (Confidential):</span>
                    {q.technicalExplanation}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ─── SECTION E: DECOY MESSAGES ───────────────────────────────────── */}
      {activeTab === 'decoys' && (
        <div className="space-y-6">
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-5 flex items-start gap-3 text-purple-300">
            <Info className="w-5 h-5 shrink-0 text-purple-400 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-bold text-purple-200">DECOY RULE ENFORCEMENT</p>
              <p className="text-purple-300/90 leading-relaxed">
                Every decoy message MUST contain the exact phrase:{' '}
                <strong className="text-white bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/40">
                  {REQUIRED_DECOY_PHRASE}
                </strong>
                . Decoys are randomly mapped to decoy QRs at game generation. Decoys NEVER unlock puzzle pieces.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-mosaic-muted">Configured Decoy Messages:</span>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                {decoys.length} Messages Active
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingDecoy(null);
                setDecoyError(null);
                setIsDecoyModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-mosaic-accent text-black font-bold rounded-xl text-xs hover:brightness-110 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Decoy Message
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {decoys.map((d) => (
              <div
                key={d._id}
                className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-4 flex items-start justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <p className="text-white text-sm font-medium leading-relaxed">{d.message}</p>
                  <span className="inline-block text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Active Decoy
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDecoy(d);
                      setDecoyError(null);
                      setIsDecoyModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg text-mosaic-muted hover:text-white hover:bg-white/5 cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecoyDeleteTarget(d._id)}
                    className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── SECTION K: PHYSICAL TASKS ───────────────────────────────────── */}
      {activeTab === 'tasks' && (
        <div className="space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5 flex items-start gap-3 text-blue-300">
            <Info className="w-5 h-5 shrink-0 text-blue-400 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-bold text-blue-200">OFFLINE PHYSICAL TASK REPOSITORY</p>
              <p className="text-blue-300/90 leading-relaxed">
                These tasks are physical offline challenges located at physical venue zones. Tasks are NEVER digitally verified or completed in the software. No scoring or verification workflows exist. Changes here apply only to future games.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-mosaic-muted">Eligible Zone Tasks:</span>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                {tasks.length} Zones Populated
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingTask(null);
                setTaskError(null);
                setIsTaskModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-mosaic-accent text-black font-bold rounded-xl text-xs hover:brightness-110 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Physical Task
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tasks.map((t) => (
              <div
                key={t._id}
                className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-mosaic-accent bg-mosaic-dark px-2.5 py-1 rounded-lg border border-mosaic-border text-xs">
                      ZONE 0{t.zoneNumber}
                    </span>
                    <h3 className="text-white font-bold text-sm">{t.taskName}</h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTask(t);
                        setTaskError(null);
                        setIsTaskModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-mosaic-muted hover:text-white hover:bg-white/5 cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskDeleteTarget(t._id)}
                      className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-mosaic-muted text-xs leading-relaxed">{t.description || 'No description provided.'}</p>
                <p className="text-zinc-400 text-xs italic bg-mosaic-dark/60 p-2.5 rounded-xl border border-mosaic-border/40">
                  {t.instructions || 'Physical task instructions at zone.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── SECTION D: PUZZLE IMAGE ─────────────────────────────────────── */}
      {activeTab === 'puzzle' && (
        <div className="space-y-6">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-mosaic-accent" />
              Master Puzzle Image
            </h2>
            <p className="text-mosaic-muted text-sm leading-relaxed">
              There is exactly ONE master puzzle image. The system slices it dynamically into 5 or 6 pieces based on team size. Do not create separate uploads.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-mosaic-dark/60 border border-mosaic-border/60 rounded-xl space-y-1">
                <p className="text-white font-bold text-xs">5-Player Team</p>
                <p className="text-mosaic-muted text-xs">5 Puzzle Pieces • 5 Puzzle QRs • 5 Decoys</p>
              </div>
              <div className="p-4 bg-mosaic-dark/60 border border-mosaic-border/60 rounded-xl space-y-1">
                <p className="text-white font-bold text-xs">6-Player Team</p>
                <p className="text-mosaic-muted text-xs">6 Puzzle Pieces • 6 Puzzle QRs • 4 Decoys</p>
              </div>
            </div>

            {/* Current Image Preview */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-mosaic-muted">Current Puzzle Image Preview</label>
              <div className="w-full h-64 bg-mosaic-dark border border-mosaic-border rounded-2xl flex items-center justify-center overflow-hidden">
                {config.puzzleImagePath ? (
                  <img
                    src={config.puzzleImagePath}
                    alt="Master Puzzle"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center text-mosaic-muted space-y-2">
                    <ImageIcon className="w-12 h-12 mx-auto text-zinc-600" />
                    <p className="text-xs">No custom puzzle image URL configured. Using default theme image.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Image Path / URL Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-mosaic-muted">Puzzle Image URL or Storage Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://... or /assets/puzzle.jpg"
                  value={puzzleUrlInput}
                  onChange={(e) => setPuzzleUrlInput(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white placeholder-mosaic-muted focus:outline-none focus:border-mosaic-accent"
                />
                <button
                  type="button"
                  disabled={isUpdatingPuzzle}
                  onClick={async () => {
                    setIsUpdatingPuzzle(true);
                    const res = await updatePuzzleImage(puzzleUrlInput.trim() || null);
                    setIsUpdatingPuzzle(false);
                    if (res.success) {
                      setConfig((c) => ({ ...c, puzzleImagePath: res.data.puzzleImagePath }));
                      setSaveSuccess(true);
                      setTimeout(() => setSaveSuccess(false), 2000);
                    }
                  }}
                  className="px-5 py-2.5 bg-mosaic-accent text-black font-bold text-xs rounded-xl hover:brightness-110 cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingPuzzle ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Image'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION C, F, G, H, I, J: ROUND & TEAM RULES ───────────────── */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Section C: Questions per QR */}
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-mosaic-accent" />
              C. Questions Per QR Code
            </h3>
            <p className="text-mosaic-muted text-xs leading-relaxed">
              Every master QR receives randomly assigned questions from the Question Bank. Assignment is locked to automatic generation. The GM cannot manually attach questions to physical QRs.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Minimum Questions (Default: 1)</label>
                <input
                  type="number"
                  min={1}
                  max={2}
                  value={config.minQuestionsPerQr}
                  onChange={(e) => setConfig({ ...config, minQuestionsPerQr: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Maximum Questions (Default: 2)</label>
                <input
                  type="number"
                  min={1}
                  max={2}
                  value={config.maxQuestionsPerQr}
                  onChange={(e) => setConfig({ ...config, maxQuestionsPerQr: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
                />
              </div>
            </div>
          </div>

          {/* Section F: Team Settings */}
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-mosaic-accent" />
              F. Team Settings & Active Game Constraint
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-mosaic-dark/60 rounded-xl border border-mosaic-border/40">
                <span className="text-mosaic-muted">Allowed Team Sizes:</span>
                <p className="text-white font-bold text-sm mt-0.5">5 or 6 Players</p>
              </div>
              <div className="p-3 bg-mosaic-dark/60 rounded-xl border border-mosaic-border/40">
                <span className="text-mosaic-muted">Starting Lives:</span>
                <p className="text-white font-bold text-sm mt-0.5">{config.startingLives} Lives Default</p>
              </div>
              <div className="p-3 bg-mosaic-dark/60 rounded-xl border border-mosaic-border/40">
                <span className="text-mosaic-muted">Active Games:</span>
                <p className="text-emerald-400 font-bold text-sm mt-0.5">Max 1 Active Game (Enforced)</p>
              </div>
            </div>
          </div>

          {/* Section G: Round 1 Settings */}
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-mosaic-accent" />
              G. Round 1 Settings (Puzzle Solving)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Round 1 Duration (Seconds)</label>
                <input
                  type="number"
                  min={60}
                  max={600}
                  value={config.round1DurationSeconds}
                  onChange={(e) => setConfig({ ...config, round1DurationSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
                />
                <span className="text-[10px] text-mosaic-muted">Default: 240 seconds (4 minutes)</span>
              </div>
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Starting Player Lives</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={config.startingLives}
                  onChange={(e) => setConfig({ ...config, startingLives: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
                />
                <span className="text-[10px] text-mosaic-muted">Default: 2 lives (0 lives ends R1)</span>
              </div>
            </div>
          </div>

          {/* Section H: Transition Settings */}
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-mosaic-accent" />
              H. Transition Settings & Privacy Safeguard
            </h3>
            <div>
              <label className="text-xs font-medium text-mosaic-muted block mb-1">Transition Duration (Seconds)</label>
              <input
                type="number"
                min={10}
                max={300}
                value={config.transitionDurationSeconds}
                onChange={(e) => setConfig({ ...config, transitionDurationSeconds: Number(e.target.value) })}
                className="w-full sm:w-64 px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
              />
              <span className="text-[10px] text-mosaic-muted block mt-1">Default: 60 seconds</span>
            </div>
            <p className="text-xs text-mosaic-muted leading-relaxed">
              During Transition, the server assigns exactly 1 Imposter, Crewmate roles, and unique eligible physical task zones. Player roles and tasks remain strictly hidden until Round 2 begins.
            </p>
          </div>

          {/* Section I: Round 2 Settings */}
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-mosaic-accent" />
              I. Round 2 Deception Defaults
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Master Duration (Seconds)</label>
                <input
                  type="number"
                  min={120}
                  max={1200}
                  value={config.round2DurationSeconds}
                  onChange={(e) => setConfig({ ...config, round2DurationSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
                />
                <span className="text-[10px] text-mosaic-muted">Default: 420s (7 min continuous)</span>
              </div>
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Body Report Window</label>
                <input
                  type="number"
                  min={10}
                  max={60}
                  value={config.bodyReportDurationSeconds}
                  onChange={(e) => setConfig({ ...config, bodyReportDurationSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
                />
                <span className="text-[10px] text-mosaic-muted">Default: 20 seconds</span>
              </div>
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Movement Period</label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={config.moveToVotingDurationSeconds}
                  onChange={(e) => setConfig({ ...config, moveToVotingDurationSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
                />
                <span className="text-[10px] text-mosaic-muted">Default: 15 seconds</span>
              </div>
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Voting Duration</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={config.votingDurationSeconds}
                  onChange={(e) => setConfig({ ...config, votingDurationSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent"
                />
                <span className="text-[10px] text-mosaic-muted">Default: 15 seconds</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs pt-2">
              <div className="p-3 bg-mosaic-dark/60 rounded-xl border border-mosaic-border/40">
                <span className="text-mosaic-muted">Imposter Count:</span>
                <p className="text-red-400 font-bold text-sm">Exactly 1 Imposter (Fixed)</p>
              </div>
              <div className="p-3 bg-mosaic-dark/60 rounded-xl border border-mosaic-border/40">
                <span className="text-mosaic-muted">Maximum Kills:</span>
                <p className="text-red-400 font-bold text-sm">Max 2 Kills (Fixed)</p>
              </div>
            </div>
          </div>

          {/* Section J: Voting Settings */}
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Vote className="w-4 h-4 text-mosaic-accent" />
              J. Voting Settings
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-mosaic-muted block mb-1">Tie-Break Rule</label>
                <select
                  value={config.tieRule}
                  onChange={(e) => setConfig({ ...config, tieRule: e.target.value as any })}
                  className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-sm text-white focus:outline-none focus:border-mosaic-accent cursor-pointer"
                >
                  <option value="NO_ELIMINATION">No Elimination (Default)</option>
                  <option value="REVOTE">Revote</option>
                  <option value="RANDOM_PICK">Random Pick</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="selfVote"
                  checked={config.allowSelfVote}
                  onChange={(e) => setConfig({ ...config, allowSelfVote: e.target.checked })}
                  className="w-4 h-4 rounded border-mosaic-border bg-mosaic-dark text-mosaic-accent focus:ring-0 cursor-pointer"
                />
                <label htmlFor="selfVote" className="text-xs font-medium text-white cursor-pointer">
                  Allow Self-Voting (Default: No)
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION L: AUTOMATIC GENERATION EXPLANATION ─────────────────── */}
      {activeTab === 'generation' && (
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Info className="w-5 h-5 text-mosaic-accent" />
              L. Authoritative Backend Generation Process
            </h3>
            <p className="text-mosaic-muted text-sm mt-1">
              Read-only architectural explanation of the real 10-step backend game lifecycle:
            </p>
          </div>

          <div className="space-y-3">
            {[
              { step: 1, title: 'Read Team Size', desc: 'Backend inspects registered team size (5 or 6 players).' },
              { step: 2, title: 'Select Fixed QR Identities', desc: 'Selects the required number from the permanent 10 master QRs (QR-01 through QR-10).' },
              { step: 3, title: 'Assign Puzzle Pieces', desc: 'Randomly allocates 5 or 6 QRs to unlock corresponding puzzle piece indices.' },
              { step: 4, title: 'Mark Decoys', desc: 'Allocates remaining QRs as decoys (5 decoys for 5 players, 4 decoys for 6 players).' },
              { step: 5, title: 'Assign Questions per QR', desc: 'Randomly draws 1 to 2 questions from the Question Bank and attaches them to each QR.' },
              { step: 6, title: 'Assign Decoy Messages', desc: 'Randomly assigns valid decoy messages containing "Try another QR Buddy!" to decoy QRs.' },
              { step: 7, title: 'Lock Generated Mapping', desc: 'Freezes the QR-to-question and QR-to-piece mappings into the Game document.' },
              { step: 8, title: 'Create Immutable Snapshot', desc: 'Embeds an immutable configSnapshot into the Game document. Subsequent GM config edits will NOT mutate this game.' },
              { step: 9, title: 'Initialize Game State', desc: 'Sets phase to LOBBY, waiting for all players to join and claim their registered slots.' },
              { step: 10, title: 'Start Authoritative Round 1', desc: 'Round 1 begins ONLY when the GM explicitly clicks START GAME, initiating authoritative server timers.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex items-start gap-4 p-3 bg-mosaic-dark/50 rounded-xl border border-mosaic-border/40">
                <span className="w-6 h-6 rounded-full bg-mosaic-accent/15 text-mosaic-accent font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-mosaic-accent/30 font-mono">
                  {step}
                </span>
                <div>
                  <h4 className="text-white font-semibold text-xs">{title}</h4>
                  <p className="text-mosaic-muted text-xs mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MODALS ──────────────────────────────────────────────────────── */}

      {/* QR Large Preview Modal */}
      {selectedQrPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-lg text-mosaic-accent">{selectedQrPreview}</span>
              <button
                type="button"
                onClick={() => setSelectedQrPreview(null)}
                className="p-1 rounded-lg text-mosaic-muted hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className="bg-white p-6 rounded-2xl shadow-inner flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: generateQrSvg(selectedQrPreview, 240) }}
            />

            <p className="text-center text-xs text-mosaic-muted">
              Permanent Master QR Asset. Scans as: <code className="text-white font-mono">{selectedQrPreview}</code>
            </p>

            <button
              type="button"
              onClick={() => downloadQrSvg(selectedQrPreview)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-mosaic-accent text-black font-bold text-xs rounded-xl hover:brightness-110 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download SVG
            </button>
          </div>
        </div>
      )}

      {/* Print All Sheet Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-black rounded-2xl p-8 max-w-4xl w-full shadow-2xl space-y-6 my-auto print:p-0 print:m-0 print:max-w-none">
            <div className="flex items-center justify-between border-b pb-4 print:hidden">
              <div>
                <h2 className="text-2xl font-bold">MOSAIC — Permanent Physical QR Master Sheet</h2>
                <p className="text-sm text-zinc-600">Print on heavy cardstock. Cut along guidelines. Keep permanently.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrintSheet}
                  className="px-4 py-2 bg-black text-white font-bold rounded-xl text-xs hover:bg-zinc-800 cursor-pointer flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Print Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="p-2 rounded-lg text-zinc-600 hover:text-black cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable 10 QR Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
              {fixedQrs.map((qr) => (
                <div key={qr.qrId} className="border-2 border-dashed border-zinc-400 p-4 rounded-xl flex flex-col items-center gap-2">
                  <span className="font-mono font-extrabold text-base tracking-wider">{qr.qrId}</span>
                  <div
                    className="p-1"
                    dangerouslySetInnerHTML={{ __html: generateQrSvg(qr.qrId, 130) }}
                  />
                  <span className="text-[10px] uppercase font-bold text-zinc-700">MOSAIC DECEPTION</span>
                  <span className="text-[9px] text-zinc-500">Do Not Discard</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Question Modal */}
      {isQuestionModalOpen && (
        <QuestionEditModal
          question={editingQuestion}
          onClose={() => setIsQuestionModalOpen(false)}
          onSaved={async () => {
            setIsQuestionModalOpen(false);
            const res = await listQuestions();
            if (res.success && res.data?.questions) setQuestions(res.data.questions);
          }}
        />
      )}

      {/* Delete Question Confirmation */}
      {questionDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Delete Question {questionDeleteTarget}?
            </h3>
            <p className="text-mosaic-muted text-sm leading-relaxed">
              Are you sure you want to delete this question? This action permanently removes it from MongoDB.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setQuestionDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteQuestion(questionDeleteTarget);
                  setQuestionDeleteTarget(null);
                  const res = await listQuestions();
                  if (res.success && res.data?.questions) setQuestions(res.data.questions);
                }}
                className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold text-xs hover:bg-red-400 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Decoy Modal */}
      {isDecoyModalOpen && (
        <DecoyEditModal
          decoy={editingDecoy}
          error={decoyError}
          onClose={() => setIsDecoyModalOpen(false)}
          onSave={async (message) => {
            if (!message.includes(REQUIRED_DECOY_PHRASE)) {
              setDecoyError(`Message must contain: "${REQUIRED_DECOY_PHRASE}"`);
              return;
            }
            if (editingDecoy) {
              const res = await updateDecoy(editingDecoy._id, { message });
              if (!res.success) {
                setDecoyError(res.error?.message || 'Failed to update decoy.');
                return;
              }
            } else {
              const res = await createDecoy({ message });
              if (!res.success) {
                setDecoyError(res.error?.message || 'Failed to create decoy.');
                return;
              }
            }
            setIsDecoyModalOpen(false);
            const res = await listDecoys();
            if (res.success && res.data?.decoys) setDecoys(res.data.decoys);
          }}
        />
      )}

      {/* Delete Decoy Confirmation */}
      {decoyDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Delete Decoy Message?
            </h3>
            <p className="text-mosaic-muted text-sm leading-relaxed">
              Are you sure you want to delete this decoy message?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDecoyDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteDecoy(decoyDeleteTarget);
                  setDecoyDeleteTarget(null);
                  const res = await listDecoys();
                  if (res.success && res.data?.decoys) setDecoys(res.data.decoys);
                }}
                className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold text-xs hover:bg-red-400 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Task Modal */}
      {isTaskModalOpen && (
        <TaskEditModal
          task={editingTask}
          error={taskError}
          onClose={() => setIsTaskModalOpen(false)}
          onSave={async (taskData) => {
            if (editingTask) {
              const res = await updateTask(editingTask._id, taskData);
              if (!res.success) {
                setTaskError(res.error?.message || 'Failed to update task.');
                return;
              }
            } else {
              const res = await createTask(taskData);
              if (!res.success) {
                setTaskError(res.error?.message || 'Failed to create task.');
                return;
              }
            }
            setIsTaskModalOpen(false);
            const res = await listTasks();
            if (res.success && res.data?.tasks) setTasks(res.data.tasks);
          }}
        />
      )}

      {/* Delete Task Confirmation */}
      {taskDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Delete Physical Task?
            </h3>
            <p className="text-mosaic-muted text-sm leading-relaxed">
              Are you sure you want to delete this zone task?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTaskDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteTask(taskDeleteTarget);
                  setTaskDeleteTarget(null);
                  const res = await listTasks();
                  if (res.success && res.data?.tasks) setTasks(res.data.tasks);
                }}
                className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold text-xs hover:bg-red-400 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal Subcomponents ──────────────────────────────────────────────────────

function QuestionEditModal({
  question,
  onClose,
  onSaved,
}: {
  question: QuestionBankItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState(question?.category || 'Computer Science');
  const [questionText, setQuestionText] = useState(question?.questionText || '');
  const [optionA, setOptionA] = useState(question?.optionA || '');
  const [optionB, setOptionB] = useState(question?.optionB || '');
  const [optionC, setOptionC] = useState(question?.optionC || '');
  const [optionD, setOptionD] = useState(question?.optionD || '');
  const [correctAnswer, setCorrectAnswer] = useState<AnswerOption>(question?.correctAnswer || AnswerOption.A);
  const [technicalExplanation, setTechnicalExplanation] = useState(question?.technicalExplanation || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      category,
      questionText: questionText.trim(),
      optionA: optionA.trim(),
      optionB: optionB.trim(),
      optionC: optionC.trim(),
      optionD: optionD.trim(),
      correctAnswer,
      technicalExplanation: technicalExplanation.trim(),
      isActive: true,
    };

    if (question) {
      const res = await updateQuestion(question.questionId, payload);
      setLoading(false);
      if (!res.success) {
        setError(res.error?.message || 'Failed to update question.');
        return;
      }
    } else {
      const res = await createQuestion(payload as any);
      setLoading(false);
      if (!res.success) {
        setError(res.error?.message || 'Failed to create question.');
        return;
      }
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 max-w-xl w-full shadow-2xl my-auto space-y-4">
        <div className="flex items-center justify-between border-b border-mosaic-border/40 pb-3">
          <h3 className="text-lg font-bold text-white">
            {question ? `Edit Question ${question.questionId}` : 'Add New Question (Auto-ID)'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-mosaic-muted hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-mosaic-muted font-medium block mb-1">Category</label>
            <input
              type="text"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent"
            />
          </div>

          <div>
            <label className="text-mosaic-muted font-medium block mb-1">Question Text</label>
            <textarea
              required
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(['A', 'B', 'C', 'D'] as const).map((opt) => {
              const val = opt === 'A' ? optionA : opt === 'B' ? optionB : opt === 'C' ? optionC : optionD;
              const setVal = opt === 'A' ? setOptionA : opt === 'B' ? setOptionB : opt === 'C' ? setOptionC : setOptionD;
              return (
                <div key={opt}>
                  <label className="text-mosaic-muted font-medium block mb-1">Option {opt}</label>
                  <input
                    type="text"
                    required
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent"
                  />
                </div>
              );
            })}
          </div>

          <div>
            <label className="text-mosaic-muted font-medium block mb-1">Correct Answer</label>
            <select
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value as AnswerOption)}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent cursor-pointer"
            >
              <option value="A">Option A</option>
              <option value="B">Option B</option>
              <option value="C">Option C</option>
              <option value="D">Option D</option>
            </select>
          </div>

          <div>
            <label className="text-mosaic-muted font-medium block mb-1">Technical Explanation (Confidential)</label>
            <textarea
              required
              rows={3}
              value={technicalExplanation}
              onChange={(e) => setTechnicalExplanation(e.target.value)}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-mosaic-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-mosaic-accent text-black font-bold text-xs hover:brightness-110 cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : question ? 'Update Question' : 'Save Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DecoyEditModal({
  decoy,
  error,
  onClose,
  onSave,
}: {
  decoy: DecoyMessageItem | null;
  error: string | null;
  onClose: () => void;
  onSave: (message: string) => void;
}) {
  const [message, setMessage] = useState(
    decoy?.message || `Not this one! ${REQUIRED_DECOY_PHRASE}`
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-mosaic-border/40 pb-3">
          <h3 className="text-lg font-bold text-white">{decoy ? 'Edit Decoy Message' : 'Add Decoy Message'}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-mosaic-muted hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
            {error}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-mosaic-muted font-medium block mb-1">
              Decoy Message (Must contain "{REQUIRED_DECOY_PHRASE}")
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(message.trim())}
              className="px-5 py-2 rounded-xl bg-mosaic-accent text-black font-bold text-xs hover:brightness-110 cursor-pointer"
            >
              {decoy ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskEditModal({
  task,
  error,
  onClose,
  onSave,
}: {
  task: PhysicalTaskItem | null;
  error: string | null;
  onClose: () => void;
  onSave: (data: { zoneNumber: number; taskName: string; description: string; instructions: string }) => void;
}) {
  const [zoneNumber, setZoneNumber] = useState(task?.zoneNumber || 1);
  const [taskName, setTaskName] = useState(task?.taskName || '');
  const [description, setDescription] = useState(task?.description || '');
  const [instructions, setInstructions] = useState(task?.instructions || '');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-mosaic-border/40 pb-3">
          <h3 className="text-lg font-bold text-white">{task ? `Edit Zone 0${task.zoneNumber}` : 'Add Physical Task'}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-mosaic-muted hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
            {error}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-mosaic-muted font-medium block mb-1">Zone Number (1 to 6)</label>
            <input
              type="number"
              min={1}
              max={6}
              disabled={!!task}
              value={zoneNumber}
              onChange={(e) => setZoneNumber(Number(e.target.value))}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-mosaic-muted font-medium block mb-1">Task Name</label>
            <input
              type="text"
              required
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent"
            />
          </div>

          <div>
            <label className="text-mosaic-muted font-medium block mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent"
            />
          </div>

          <div>
            <label className="text-mosaic-muted font-medium block mb-1">Instructions</label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3 py-2 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-sm focus:outline-none focus:border-mosaic-accent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave({ zoneNumber, taskName: taskName.trim(), description: description.trim(), instructions: instructions.trim() })}
              className="px-5 py-2 rounded-xl bg-mosaic-accent text-black font-bold text-xs hover:brightness-110 cursor-pointer"
            >
              {task ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
