"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { analyzeStyle } from "@/lib/game/analysis";
import {
  agentPersona,
  chooseAiMove,
  compatibleRemoteAgent,
  explainAgentMove,
  legalMoves as enumerateLegalMoves,
  localTrainingAgent,
  observe,
  safeAgentDecision,
  safeAgentMove,
} from "@/lib/game/ai";
import { cardLabel, createDeck, RANK_LABEL } from "@/lib/game/cards";
import {
  beginnerEventNote,
  explainHintSelection,
  finishedCoach,
  isWildLevelCard,
} from "@/lib/game/coaching";
import {
  legalPlay,
  newGame,
  nextRound,
  passTurn,
  playCards,
  resultSummary,
} from "@/lib/game/engine";
import {
  ENDGAME_PUZZLES,
  isLegalPuzzleAction,
  parsePuzzleProgress,
  puzzleActionLabel,
  puzzleSummary,
  serializePuzzleProgress,
} from "@/lib/game/endgame-puzzles";
import { comboName, parseCombo } from "@/lib/game/rules";
import type { Card, GameState } from "@/lib/game/types";
import {
  onboardingCopy,
  type Locale,
  type OnboardingCopy,
} from "@/lib/i18n/onboarding";
import {
  parseCourseProgress,
  serializeCourseProgress,
  type CourseState,
} from "@/lib/services/course-progress";
import {
  createCountDrill,
  createNineGridDrill,
  parseCountAttempts,
  parseGridAttempts,
  serializeCountAttempts,
  serializeGridAttempts,
  type CountKind,
  type GridAttempt,
} from "@/lib/services/memory-drill";
import {
  buildPublicMatchReview,
  fetchRemoteMatchReview,
  mergeRemoteMatchReview,
  type RemoteMatchReview,
} from "@/lib/services/match-review";
import type { OnlineRoomView, QueueStatus } from "@/lib/services/online-store";
import type {
  AgentProvider,
  VoiceProvider,
} from "@/lib/services/provider-status";
import {
  mergeTrainingProfiles,
  rebaseTrainingProfile,
  type TrainingProfile,
} from "@/lib/services/training-profile";

type View =
  "home" | "lesson" | "puzzle" | "game" | "online" | "memory" | "replay";
type AccountStatus = {
  mode: "local" | "guest" | "google";
  googleOAuth: boolean;
  onlineMatching: boolean;
  onlineStatus: QueueStatus;
  agentProvider: AgentProvider;
  voiceProvider: VoiceProvider;
  displayName?: string;
};
type MatchReviewState = {
  seed: number;
  status: "loading" | "compatible" | "fallback";
  review?: RemoteMatchReview;
};
const AI_SPEEDS = [
  { label: "快速", delay: 1200 },
  { label: "舒缓", delay: 2200 },
  { label: "讲解", delay: 3500 },
] as const;
const TRAINING_CHANGED_EVENT = "guandan-training-changed";
const notifyTrainingChanged = () =>
  window.dispatchEvent(new Event(TRAINING_CHANGED_EVENT));
const newAttemptId = () => crypto.randomUUID();
function readLocalTrainingProfile(
  course: CourseState,
  locale: Locale,
  aiSpeed: number,
): TrainingProfile {
  return {
    schemaVersion: 1,
    course,
    countAttempts: parseCountAttempts(
      localStorage.getItem("gd-count-memory-v1"),
    ),
    gridAttempts: parseGridAttempts(localStorage.getItem("gd-memory-v2")),
    puzzle: parsePuzzleProgress(localStorage.getItem("gd-endgame-v1")),
    puzzleEpoch: Math.max(
      0,
      Math.min(
        1_000_000,
        Number(localStorage.getItem("gd-endgame-epoch-v1")) || 0,
      ),
    ),
    locale,
    aiSpeed: aiSpeed === 0 || aiSpeed === 2 ? aiSpeed : 1,
  };
}
function writeLocalTrainingProfile(profile: TrainingProfile) {
  localStorage.setItem("gd-course-v1", serializeCourseProgress(profile.course));
  localStorage.setItem(
    "gd-count-memory-v1",
    serializeCountAttempts(profile.countAttempts),
  );
  localStorage.setItem(
    "gd-memory-v2",
    serializeGridAttempts(profile.gridAttempts),
  );
  localStorage.setItem("gd-endgame-epoch-v1", String(profile.puzzleEpoch));
  if (profile.puzzle)
    localStorage.setItem("gd-endgame-v1", JSON.stringify(profile.puzzle));
  else localStorage.removeItem("gd-endgame-v1");
  localStorage.setItem("gd-locale-v1", profile.locale);
  localStorage.setItem("gd-ai-speed-v1", String(profile.aiSpeed));
}

export default function GuandanApp({ supportUrl }: { supportUrl: string }) {
  const [view, setView] = useState<View>("home");
  const [rules, setRules] = useState(false);
  const [lesson, setLesson] = useState(0);
  const [game, setGame] = useState<GameState>(() => newGame(20260822));
  const [locale, setLocale] = useState<Locale>("zh");
  const copy = onboardingCopy[locale];
  const [selected, setSelected] = useState<string[]>([]);
  const [coach, setCoach] = useState("提示已开启：系统会解释每一次出牌。");
  const [history, setHistory] = useState<GameState[]>([]);
  const [matchReview, setMatchReview] = useState<MatchReviewState | null>(null);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [agentModeEnabled, setAgentModeEnabled] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  const [saveMode, setSaveMode] = useState<"checking" | "local" | "cloud">(
    "checking",
  );
  const [localSaveStatus, setLocalSaveStatus] = useState<
      "idle" | "saving" | "saved" | "error"
    >("idle"),
    [localSaveAttempt, setLocalSaveAttempt] = useState(0);
  const [syncStatus, setSyncStatus] = useState<
      "idle" | "saving" | "saved" | "error"
    >("idle"),
    [syncAttempt, setSyncAttempt] = useState(0);
  const [account, setAccount] = useState<AccountStatus>({
    mode: "local",
    googleOAuth: false,
    onlineMatching: false,
    onlineStatus: { status: "idle" },
    agentProvider: "local",
    voiceProvider: "browser",
  });
  const syncedSeeds = useRef(new Set<number>()),
    localSaveAttempts = useRef(new Map<number, number>()),
    currentSeed = useRef(game.seed);
  const aiSpeed = AI_SPEEDS[speedIndex];
  const [course, setCourse] = useState<CourseState>({
      progress: [0, 0, 0, 0],
      mastered: [false, false, false, false],
      mistakes: [0, 0, 0, 0],
    }),
    [courseReady, setCourseReady] = useState(false);
  const [cloudTraining, setCloudTraining] = useState<{
      profile: TrainingProfile;
      revision: number;
    } | null>(null),
    [cloudTrainingLoaded, setCloudTrainingLoaded] = useState(false),
    [trainingSyncReady, setTrainingSyncReady] = useState(false),
    [trainingDirty, setTrainingDirty] = useState(0);
  const trainingInitialized = useRef(false),
    trainingRevision = useRef(0),
    acknowledgedTraining = useRef<TrainingProfile | null>(null),
    localTrainingPresent = useRef(false),
    localPreferencePresent = useRef({ locale: false, speed: false }),
    initialLocalTraining = useRef<TrainingProfile | null>(null);
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      localTrainingPresent.current = [
        "gd-course-v1",
        "gd-count-memory-v1",
        "gd-memory-v2",
        "gd-endgame-v1",
        "gd-locale-v1",
        "gd-ai-speed-v1",
      ].some((key) => localStorage.getItem(key) !== null);
      localPreferencePresent.current = {
        locale: localStorage.getItem("gd-locale-v1") !== null,
        speed: localStorage.getItem("gd-ai-speed-v1") !== null,
      };
      const saved = localStorage.getItem("gd-locale-v1"),
        initialLocale: Locale = saved === "en" ? "en" : "zh";
      if (saved === "en") setLocale("en");
      const savedSpeedRaw = localStorage.getItem("gd-ai-speed-v1"),
        savedSpeed = Number(savedSpeedRaw),
        initialSpeed =
          savedSpeedRaw !== null &&
          Number.isInteger(savedSpeed) &&
          savedSpeed >= 0 &&
          savedSpeed < AI_SPEEDS.length
            ? savedSpeed
            : 1;
      if (initialSpeed !== 1) setSpeedIndex(initialSpeed);
      const key = "gd-course-v1",
        raw = localStorage.getItem(key),
        restored = parseCourseProgress(
          raw,
          onboardingCopy.zh.lessons.map((item) => item.steps.length),
        ),
        initialCourse = restored ?? {
          progress: [0, 0, 0, 0],
          mastered: [false, false, false, false],
          mistakes: [0, 0, 0, 0],
        };
      initialLocalTraining.current = readLocalTrainingProfile(
        initialCourse,
        initialLocale,
        initialSpeed,
      );
      if (restored) {
        setCourse(restored);
        const firstIncomplete = restored.mastered.findIndex((value) => !value);
        setLesson(firstIncomplete === -1 ? 3 : firstIncomplete);
      } else if (raw) localStorage.removeItem(key);
      setCourseReady(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    if (courseReady) localStorage.setItem("gd-locale-v1", locale);
  }, [courseReady, locale]);
  useEffect(() => {
    if (courseReady)
      localStorage.setItem("gd-course-v1", serializeCourseProgress(course));
  }, [course, courseReady]);
  useEffect(() => {
    if (courseReady) localStorage.setItem("gd-ai-speed-v1", String(speedIndex));
  }, [courseReady, speedIndex]);
  useEffect(() => {
    currentSeed.current = game.seed;
  }, [game.seed]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  useEffect(() => {
    const status = new URLSearchParams(location.search).get("login");
    if (!status) return;
    const saved = localStorage.getItem("gd-locale-v1"),
      messages = onboardingCopy[saved === "en" ? "en" : "zh"].login,
      id = setTimeout(
        () =>
          setLoginNotice(
            status === "ok"
              ? messages.success
              : status === "cancelled"
                ? messages.cancelled
                : messages.error,
          ),
        0,
      );
    window.history.replaceState(null, "", location.pathname + location.hash);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/session", {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("session unavailable");
        return (await response.json()) as {
          persistent?: boolean;
          googleOAuth?: boolean;
          onlineMatching?: boolean;
          onlineStatus?: QueueStatus;
          agentProvider?: AgentProvider;
          voiceProvider?: VoiceProvider;
          mode?: "local" | "guest" | "google";
          profile?: { displayName?: string } | null;
        };
      })
      .then((data) => {
        setSaveMode(data.persistent ? "cloud" : "local");
        setAccount({
          mode: data.mode || "local",
          googleOAuth: Boolean(data.googleOAuth),
          onlineMatching: Boolean(data.onlineMatching),
          onlineStatus: data.onlineStatus || { status: "idle" },
          agentProvider:
            data.agentProvider === "compatible" ? "compatible" : "local",
          voiceProvider:
            data.voiceProvider === "elevenlabs" ? "elevenlabs" : "browser",
          displayName: data.profile?.displayName,
        });
        if (!data.persistent) {
          setCloudTrainingLoaded(true);
          return;
        }
        return fetch("/api/progress?replays=1", {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
          .then(async (response) =>
            response.ok
              ? ((await response.json()) as {
                  replays?: GameState[];
                  training?: { profile: TrainingProfile; revision: number };
                })
              : null,
          )
          .then((progress) => {
            if (progress?.replays)
              setHistory((current) =>
                [...progress.replays!, ...current]
                  .filter(
                    (item, index, all) =>
                      all.findIndex((other) => other.seed === item.seed) ===
                      index,
                  )
                  .slice(0, 12),
              );
            if (progress?.training) setCloudTraining(progress.training);
          })
          .finally(() => setCloudTrainingLoaded(true));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSaveMode("local");
          setCloudTrainingLoaded(true);
        }
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!courseReady || !cloudTrainingLoaded || trainingInitialized.current)
      return;
    const id = setTimeout(() => {
      if (trainingInitialized.current) return;
      trainingInitialized.current = true;
      if (saveMode !== "cloud" || !cloudTraining) {
        setTrainingSyncReady(true);
        return;
      }
      const merged = localTrainingPresent.current
        ? mergeTrainingProfiles(
            cloudTraining.profile,
            initialLocalTraining.current ??
              readLocalTrainingProfile(course, locale, speedIndex),
          )
        : structuredClone(cloudTraining.profile);
      if (!localPreferencePresent.current.locale)
        merged.locale = cloudTraining.profile.locale;
      if (!localPreferencePresent.current.speed)
        merged.aiSpeed = cloudTraining.profile.aiSpeed;
      trainingRevision.current = cloudTraining.revision;
      acknowledgedTraining.current = structuredClone(cloudTraining.profile);
      writeLocalTrainingProfile(merged);
      setCourse(merged.course);
      setLocale(merged.locale);
      setSpeedIndex(merged.aiSpeed);
      const firstIncomplete = merged.course.mastered.findIndex(
        (value) => !value,
      );
      setLesson(firstIncomplete === -1 ? 3 : firstIncomplete);
      setTrainingSyncReady(true);
      setTrainingDirty((value) => value + 1);
    }, 0);
    return () => clearTimeout(id);
  }, [
    cloudTraining,
    cloudTrainingLoaded,
    course,
    courseReady,
    locale,
    saveMode,
    speedIndex,
  ]);
  useEffect(() => {
    const changed = () => setTrainingDirty((value) => value + 1);
    window.addEventListener(TRAINING_CHANGED_EVENT, changed);
    return () => window.removeEventListener(TRAINING_CHANGED_EVENT, changed);
  }, []);
  useEffect(() => {
    if (!trainingSyncReady || saveMode !== "cloud") return;
    const profile = readLocalTrainingProfile(course, locale, speedIndex),
      controller = new AbortController(),
      id = setTimeout(() => {
        void fetch("/api/progress", {
          method: "PUT",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            training: profile,
            baseRevision: trainingRevision.current,
          }),
        })
          .then(async (response) => {
            const result = (await response.json()) as {
              training?: { profile: TrainingProfile; revision: number };
            };
            if (response.status === 409 && result.training)
              return { conflict: true, training: result.training };
            if (!response.ok || !result.training)
              throw new Error("training sync failed");
            return { conflict: false, training: result.training };
          })
          .then((result) => {
            trainingRevision.current = result.training.revision;
            if (result.conflict) {
              const rebased = acknowledgedTraining.current
                ? rebaseTrainingProfile(
                    result.training.profile,
                    profile,
                    acknowledgedTraining.current,
                  )
                : result.training.profile;
              acknowledgedTraining.current = structuredClone(
                result.training.profile,
              );
              writeLocalTrainingProfile(rebased);
              setCourse(rebased.course);
              setLocale(rebased.locale);
              setSpeedIndex(rebased.aiSpeed);
              setTrainingDirty((value) => value + 1);
              return;
            }
            acknowledgedTraining.current = structuredClone(
              result.training.profile,
            );
            if (
              JSON.stringify(result.training.profile) !==
              JSON.stringify(profile)
            ) {
              writeLocalTrainingProfile(result.training.profile);
              setCourse(result.training.profile.course);
              setLocale(result.training.profile.locale);
              setSpeedIndex(result.training.profile.aiSpeed);
            }
          })
          .catch(() => {});
      }, 650);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [course, locale, saveMode, speedIndex, trainingDirty, trainingSyncReady]);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const raw = localStorage.getItem("gd-history-v2");
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) throw new Error("invalid history");
        const local = data.filter(
          (g) =>
            g &&
            g.schemaVersion === 2 &&
            Array.isArray(g.events) &&
            Array.isArray(g.players),
        );
        setHistory((current) =>
          [...current, ...local]
            .filter(
              (item, index, all) =>
                all.findIndex((other) => other.seed === item.seed) === index,
            )
            .slice(0, 12),
        );
      } catch {
        localStorage.removeItem("gd-history-v2");
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (view !== "game" || game.phase !== "playing" || game.turn === 0) return;
    let cancelled = false;
    const remote = agentModeEnabled && account.agentProvider === "compatible",
      applyAiState = (next: GameState, reason: string) => {
        setGame(next);
        if (next.phase === "finished") setCoach(finishedCoach(next));
        else if (next.turn === 0)
          setCoach(
            `${reason} ${next.lastPlay ? `现在轮到你跟${comboName(next.lastPlay.combo)}，可用更大的同型牌、合适的炸弹或过牌。` : "现在轮到你领出，先用“一键提示”查看合法牌。"}`,
          );
      };
    const id = setTimeout(async () => {
      try {
        const observation = observe(game, game.turn),
          decision = remote
            ? await safeAgentDecision(compatibleRemoteAgent, observation, 5200)
            : {
                move: await safeAgentMove(
                  localTrainingAgent,
                  observation,
                  5200,
                ),
                source: "fallback" as const,
              },
          move = decision.move,
          next = move
            ? playCards(game, game.turn, move)
            : passTurn(game, game.turn);
        if (!cancelled) {
          const reason = explainAgentMove(
            observation,
            move,
            decision.source !== "llm",
          );
          applyAiState(
            next,
            remote && decision.source === "fallback"
              ? `远程 Agent 暂不可用，已用本地合法策略兜底。${reason}`
              : reason,
          );
        }
      } catch {
        if (cancelled) return;
        try {
          const observation = observe(game, game.turn),
            move = game.lastPlay ? null : [game.players[game.turn].hand[0].id];
          applyAiState(
            move ? playCards(game, game.turn, move) : passTurn(game, game.turn),
            explainAgentMove(observation, move, true),
          );
        } catch {
          setCoach("AI 动作校验失败，已安全暂停。请开始新比赛。");
        }
      }
    }, aiSpeed.delay);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [account.agentProvider, agentModeEnabled, aiSpeed.delay, game, view]);
  useEffect(() => {
    if (view !== "game" || !voiceEnabled) return;
    let active = true,
      audio: HTMLAudioElement | null = null,
      url = "";
    const controller = new AbortController(),
      browserVoice = () => {
        if (!active || !("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(coach);
        utterance.lang = "zh-CN";
        utterance.rate = 0.92;
        window.speechSynthesis.speak(utterance);
      };
    void fetch("/api/tts", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: coach }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("fallback");
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        audio = new Audio(url);
        void audio.play().catch(browserVoice);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") browserVoice();
      });
    return () => {
      active = false;
      controller.abort();
      audio?.pause();
      if (url) URL.revokeObjectURL(url);
      window.speechSynthesis?.cancel();
    };
  }, [coach, view, voiceEnabled]);
  useEffect(() => {
    if (game.phase !== "finished" || account.agentProvider !== "compatible")
      return;
    let active = true;
    const controller = new AbortController(),
      id = setTimeout(() => {
        setMatchReview({ seed: game.seed, status: "loading" });
        const local = analyzeStyle(game);
        void fetchRemoteMatchReview(
          buildPublicMatchReview(game, local),
          fetch,
          8500,
          controller.signal,
        ).then((review) => {
          if (active)
            setMatchReview(
              review
                ? { seed: game.seed, status: "compatible", review }
                : { seed: game.seed, status: "fallback" },
            );
        });
      }, 0);
    return () => {
      active = false;
      clearTimeout(id);
      controller.abort();
    };
  }, [account.agentProvider, game]);
  useEffect(() => {
    if (
      game.phase !== "finished" ||
      localSaveAttempts.current.get(game.seed) === localSaveAttempt
    )
      return;
    localSaveAttempts.current.set(game.seed, localSaveAttempt);
    const id = setTimeout(() => {
      setLocalSaveStatus("saving");
      const next = [
        game,
        ...history.filter((item) => item.seed !== game.seed),
      ].slice(0, 12);
      try {
        localStorage.setItem("gd-history-v2", JSON.stringify(next));
        setHistory(next);
        setLocalSaveStatus("saved");
      } catch {
        setHistory(next);
        setLocalSaveStatus("error");
      }
    }, 0);
    return () => clearTimeout(id);
  }, [game, history, localSaveAttempt]);
  useEffect(() => {
    if (saveMode !== "cloud" || !history.length) return;
    let saved: number[] = [];
    try {
      const parsed = JSON.parse(
        localStorage.getItem("gd-cloud-synced-v1") || "[]",
      );
      saved = Array.isArray(parsed) ? parsed.filter(Number.isSafeInteger) : [];
    } catch {
      localStorage.removeItem("gd-cloud-synced-v1");
    }
    saved.forEach((seed) => syncedSeeds.current.add(seed));
    const pending = history.find(
      (item) =>
        item.phase === "finished" && !syncedSeeds.current.has(item.seed),
    );
    if (!pending) return;
    const activeRemote =
      account.agentProvider === "compatible" &&
      game.phase === "finished" &&
      pending.seed === game.seed;
    if (
      activeRemote &&
      (!matchReview ||
        matchReview.seed !== pending.seed ||
        matchReview.status === "loading")
    )
      return;
    const local = analyzeStyle(pending),
      analysis = mergeRemoteMatchReview(
        local,
        activeRemote && matchReview?.status === "compatible"
          ? (matchReview.review ?? null)
          : null,
      );
    syncedSeeds.current.add(pending.seed);
    if (currentSeed.current === pending.seed) setSyncStatus("saving");
    let retry: ReturnType<typeof setTimeout> | undefined;
    void fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game: pending, analysis }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("sync failed");
        const next = [...new Set([...saved, pending.seed])].slice(-50);
        localStorage.setItem("gd-cloud-synced-v1", JSON.stringify(next));
        if (currentSeed.current === pending.seed) setSyncStatus("saved");
        setSyncAttempt((value) => value + 1);
      })
      .catch(() => {
        syncedSeeds.current.delete(pending.seed);
        if (currentSeed.current === pending.seed) setSyncStatus("error");
        retry = setTimeout(() => setSyncAttempt((value) => value + 1), 5000);
      });
    return () => {
      if (retry) clearTimeout(retry);
    };
  }, [
    account.agentProvider,
    game,
    history,
    matchReview,
    saveMode,
    syncAttempt,
  ]);
  const start = () => {
    const next = newGame(Math.floor(Date.now() % 2147483647));
    setGame(next);
    setLocalSaveStatus("idle");
    setSyncStatus("idle");
    setSelected([]);
    setCoach(
      next.turn === 0
        ? "轮到你领出：建议先用“一键提示”看看一组合法牌。"
        : `${next.players[next.turn].name}先出，先观察牌型和桌面节奏。`,
    );
    setView("game");
  };
  const continueMatch = () => {
    setGame(nextRound(game, Math.floor(Date.now() % 2147483647)));
    setLocalSaveStatus("idle");
    setSyncStatus("idle");
    setSelected([]);
    setCoach("新一副已完成贡还牌。注意谁获得了首出权。");
  };
  const onPlay = () => {
    const valid = legalPlay(game, 0, selected);
    if (!valid.ok) {
      setCoach(`不能这样出：${valid.reason}`);
      return;
    }
    const cards = game.players[0].hand.filter((c) => selected.includes(c.id)),
      combo = parseCombo(cards, game.level)!,
      next = playCards(game, 0, selected);
    setGame(next);
    setSelected([]);
    setCoach(
      next.phase === "finished"
        ? finishedCoach(next)
        : `这手是${comboName(combo)}。${combo.kind.includes("bomb") ? "炸弹已记录：确认它值得换取这一圈控制权。" : "出牌有效，继续观察搭档剩余张数。"}`,
    );
  };
  const showHint = () => {
    if (game.turn !== 0) {
      setCoach(
        `现在是${game.players[game.turn].name}的回合，先看清对方出的牌型。`,
      );
      return;
    }
    const observation = observe(game, 0),
      options = enumerateLegalMoves(observation),
      move = chooseAiMove(observation);
    if (!move) {
      setSelected([]);
      setCoach(
        options.length
          ? "你有牌能压，但搭档只剩 3 张以内，建议过牌让搭档保持牌权。"
          : "当前确实没有合法压牌，建议过牌；这不是认输，是保留实力。",
      );
      return;
    }
    setSelected(move);
    const cards = game.players[0].hand.filter((c) => move.includes(c.id)),
      combo = parseCombo(cards, game.level)!;
    setCoach(explainHintSelection(cards, combo));
  };
  if (!trainingSyncReady)
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--ink)] text-[var(--paper)]">
        <div
          role="status"
          aria-live="polite"
          className="paper-panel text-center"
        >
          <span className="logo-mark mx-auto">G</span>
          <p className="mt-5 font-black text-[var(--ink)]">
            {locale === "zh"
              ? "正在载入训练档案…"
              : "Loading your training profile…"}
          </p>
        </div>
      </main>
    );
  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--paper)]">
      <div className="pixel-grid min-h-screen">
        <TopNav
          view={view}
          setView={setView}
          setRules={setRules}
          locale={locale}
          setLocale={setLocale}
          copy={copy}
        />
        {loginNotice && (
          <div role="status" aria-live="polite" className="login-notice">
            {loginNotice}
            <button
              aria-label={copy.login.close}
              onClick={() => setLoginNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {view === "home" && (
          <Home
            setView={setView}
            trainingComplete={course.mastered.every(Boolean)}
            onlineAvailable={account.onlineMatching}
            onlineStatus={account.onlineStatus}
            locale={locale}
            copy={copy}
          />
        )}{" "}
        {view === "lesson" && (
          <Lesson
            lesson={lesson}
            setLesson={setLesson}
            start={start}
            openPuzzles={() => setView("puzzle")}
            course={course}
            setCourse={setCourse}
            locale={locale}
            copy={copy}
          />
        )}{" "}
        {view === "puzzle" && <EndgamePuzzles locale={locale} start={start} />}{" "}
        {view === "game" && (
          <Game
            state={game}
            selected={selected}
            setSelected={setSelected}
            onPlay={onPlay}
            onPass={() => {
              try {
                setGame(passTurn(game, 0));
                setCoach("已过牌。观察这一圈由谁取得出牌权。");
              } catch (e) {
                setCoach((e as Error).message);
              }
            }}
            onHint={showHint}
            coach={coach}
            restart={start}
            nextDeal={continueMatch}
            setView={setView}
            aiSpeed={aiSpeed}
            cycleSpeed={() =>
              setSpeedIndex((speedIndex + 1) % AI_SPEEDS.length)
            }
            voiceEnabled={voiceEnabled}
            toggleVoice={() => setVoiceEnabled(!voiceEnabled)}
            saveMode={saveMode}
            localSaveStatus={localSaveStatus}
            retryLocalSave={() => setLocalSaveAttempt((value) => value + 1)}
            syncStatus={syncStatus}
            retrySync={() => setSyncAttempt((value) => value + 1)}
            matchReview={matchReview}
            agentProvider={account.agentProvider}
            agentModeEnabled={agentModeEnabled}
            toggleAgentMode={() => setAgentModeEnabled((value) => !value)}
          />
        )}{" "}
        {view === "online" && <OnlineTable enabled={account.onlineMatching} />}{" "}
        {view === "memory" && <Memory locale={locale} />}{" "}
        {view === "replay" && <Replay history={history} />}
        <SiteFooter
          canSupport={Boolean(supportUrl)}
          openSupport={() => setSupportOpen(true)}
          account={account}
          copy={copy}
        />
        {rules && <Rulebook close={() => setRules(false)} copy={copy} />}{" "}
        {supportOpen && supportUrl && (
          <SupportModal
            url={supportUrl}
            close={() => setSupportOpen(false)}
            copy={copy}
          />
        )}
      </div>
    </main>
  );
}

function SiteFooter({
  canSupport,
  openSupport,
  account,
  copy,
}: {
  canSupport: boolean;
  openSupport: () => void;
  account: AccountStatus;
  copy: OnboardingCopy;
}) {
  const f = copy.footer,
    logout = async () => {
      const response = await fetch("/api/session", { method: "DELETE" }),
        data = (await response.json()) as { error?: string };
      if (response.ok) location.reload();
      else alert(data.error || f.logoutError);
    },
    remove = async () => {
      if (!confirm(f.removeConfirm)) return;
      const response = await fetch("/api/progress", { method: "DELETE" }),
        data = (await response.json()) as { error?: string };
      if (response.ok) {
        for (const key of [
          "gd-course-v1",
          "gd-count-memory-v1",
          "gd-memory-v2",
          "gd-endgame-v1",
          "gd-endgame-epoch-v1",
          "gd-history-v2",
          "gd-cloud-synced-v1",
        ])
          localStorage.removeItem(key);
        location.reload();
      } else alert(data.error || f.removeError);
    };
  return (
    <footer className="site-footer">
      <p>
        <b>GuanDan Lab</b> · {f.tagline}
      </p>
      <div>
        <span data-testid="provider-status">
          Agent ·{" "}
          {account.agentProvider === "compatible"
            ? f.remoteAgent
            : f.localAgent}{" "}
          / {f.voiceLabel} ·{" "}
          {account.voiceProvider === "elevenlabs"
            ? f.elevenLabsVoice
            : f.deviceVoice}
        </span>
        {account.mode === "google" && (
          <span>
            {f.signedIn} · {account.displayName}
          </span>
        )}
        {account.mode === "guest" && account.googleOAuth && (
          <a href="/api/auth/google/start">{f.googleClaim}</a>
        )}
        {account.mode !== "local" && (
          <a href="/api/progress?export=1">{f.export}</a>
        )}
        {account.mode !== "local" && (
          <button onClick={() => void remove()}>{f.remove}</button>
        )}
        {account.mode === "google" && (
          <button onClick={() => void logout()}>{f.logout}</button>
        )}
        <a
          href="https://github.com/Mereithhh/guandan-lab"
          target="_blank"
          rel="noreferrer"
        >
          {f.github}
        </a>
        <ShareButton copy={copy} footer />
        {canSupport && <button onClick={openSupport}>{f.support}</button>}
      </div>
    </footer>
  );
}
function ShareButton({
  copy,
  footer = false,
}: {
  copy: OnboardingCopy;
  footer?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "shared" | "copied" | "failed">(
      "idle",
    ),
    s = copy.share;
  useEffect(() => {
    if (status === "idle") return;
    const id = setTimeout(() => setStatus("idle"), 4000);
    return () => clearTimeout(id);
  }, [status]);
  const share = async () => {
    setStatus("idle");
    const url = new URL("/", location.href).toString(),
      data = { title: s.title, text: s.text, url };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
        setStatus("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };
  return (
    <span className={`share-wrap ${footer ? "footer-share" : ""}`}>
      <button
        data-testid={footer ? "share-site-footer" : "share-site"}
        onClick={() => void share()}
        className={footer ? undefined : "pixel-button secondary"}
      >
        {footer ? s.footer : s.button}
      </button>
      {status !== "idle" && (
        <small role="status" className="share-status">
          {s[status]}
        </small>
      )}
    </span>
  );
}
function SupportModal({
  url,
  close,
  copy,
}: {
  url: string;
  close: () => void;
  copy: OnboardingCopy;
}) {
  const s = copy.support;
  return (
    <div
      className="support-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={s.dialogLabel}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <div className="support-card">
        <button className="close-btn" aria-label={s.close} onClick={close}>
          ×
        </button>
        <p className="eyebrow dark">SUPPORT OPEN SOURCE</p>
        <h2>{s.title}</h2>
        <div className="support-qr">
          <QRCodeSVG value={url} size={190} level="M" />
        </div>
        <p>{s.body}</p>
      </div>
    </div>
  );
}

function TopNav({
  view,
  setView,
  setRules,
  locale,
  setLocale,
  copy,
}: {
  view: View;
  setView: (v: View) => void;
  setRules: (v: boolean) => void;
  locale: Locale;
  setLocale: (v: Locale) => void;
  copy: OnboardingCopy;
}) {
  const links = [
    ["home", copy.nav.home],
    ["lesson", copy.nav.lesson],
    ["memory", copy.nav.memory],
    ["replay", copy.nav.replay],
  ] as [View, string][];
  return (
    <>
      <header className="sticky top-0 z-30 border-b-2 border-slate-700 bg-[var(--ink)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
          <button
            onClick={() => setView("home")}
            className="flex items-center gap-3 text-left"
          >
            <span className="logo-mark small">G</span>
            <span>
              <b className="block text-sm tracking-[.14em]">
                {locale === "zh" ? "掼蛋实验室" : "GuanDan Lab"}
              </b>
              <small className="text-[9px] tracking-[.22em] text-[var(--mint)]">
                GUANDAN LAB · OPEN SOURCE
              </small>
            </span>
          </button>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map(([v, l]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`nav-link ${view === v ? "active" : ""}`}
              >
                {l}
              </button>
            ))}
          </nav>
          <div className="flex gap-2">
            <button
              data-testid="locale-toggle"
              aria-label={copy.languageLabel}
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              className="pixel-button ghost"
            >
              {copy.languageSwitch}
            </button>
            <a
              href="https://github.com/Mereithhh/guandan-lab"
              target="_blank"
              rel="noreferrer"
              className="pixel-button ghost hidden sm:block"
            >
              GitHub ★
            </a>
            <button
              data-testid="rules-button"
              onClick={() => setRules(true)}
              className="pixel-button ghost"
            >
              {copy.nav.rules}
            </button>
          </div>
        </div>
      </header>
      <nav className="mobile-nav md:hidden">
        {links.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={view === v ? "active" : ""}
          >
            {l}
          </button>
        ))}
        <a
          data-testid="mobile-github"
          href="https://github.com/Mereithhh/guandan-lab"
          target="_blank"
          rel="noreferrer"
          aria-label={
            locale === "zh"
              ? "在 GitHub 查看并 Star 开源项目"
              : "View and star the open-source project on GitHub"
          }
        >
          GitHub ★
        </a>
      </nav>
    </>
  );
}

function Home({
  setView,
  trainingComplete,
  onlineAvailable,
  onlineStatus,
  locale,
  copy,
}: {
  setView: (v: View) => void;
  trainingComplete: boolean;
  onlineAvailable: boolean;
  onlineStatus: QueueStatus;
  locale: Locale;
  copy: OnboardingCopy;
}) {
  const continueRoom = onlineStatus.status === "matched",
    h = copy.home;
  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pt-16">
        <div>
          <div className="status-chip">
            <i />
            {h.status}
          </div>
          <h1 className="mt-6 text-5xl font-black leading-[1.06] sm:text-7xl">
            {h.headline}
            <br />
            <span className="text-[var(--gold)]">{h.headlineAccent}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300">
            {h.intro}
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              data-testid="start-game"
              onClick={() => setView("lesson")}
              className="pixel-button primary"
            >
              {h.start}
            </button>
            <button
              data-testid="direct-game"
              onClick={() => setView("game")}
              className="pixel-button secondary"
            >
              {h.directGame}
            </button>
            {trainingComplete && (
              <button
                data-testid="start-puzzles"
                onClick={() => setView("puzzle")}
                className="pixel-button secondary"
              >
                5 MIN · {locale === "zh" ? "王总局残局" : "Wang endgames"}
              </button>
            )}
            <button
              onClick={() => setView("memory")}
              className="pixel-button secondary"
            >
              {h.memory}
            </button>
            {onlineAvailable && (
              <button
                data-testid="online-match"
                onClick={() => setView("online")}
                className={`pixel-button ${continueRoom ? "primary" : "secondary"}`}
              >
                {continueRoom ? h.onlineContinue : h.onlineBeta}
              </button>
            )}
            <ShareButton copy={copy} />
          </div>
          <div className="mt-8 flex flex-wrap gap-5 text-xs font-bold text-slate-400">
            {h.proof.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
        <Mission setView={setView} copy={copy} />
      </section>
      <section className="border-y-2 border-slate-700 bg-slate-900/60">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-slate-700 md:grid-cols-4">
          {h.stats.map(([n, l]) => (
            <div className="bg-[var(--ink)] p-6 text-center" key={l}>
              <strong className="text-3xl text-[var(--mint)]">{n}</strong>
              <small className="mt-1 block text-xs text-slate-400">{l}</small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function Mission({
  setView,
  copy,
}: {
  setView: (v: View) => void;
  copy: OnboardingCopy;
}) {
  const m = copy.mission;
  return (
    <div className="relative">
      <div className="training-card border-4 border-slate-950 bg-[var(--paper)] p-5 text-[var(--ink)] shadow-[9px_9px_0_var(--gold)] sm:p-7">
        <div className="flex items-end justify-between border-b-4 border-[var(--ink)] pb-4">
          <div>
            <small className="font-black tracking-[.2em] text-slate-500">
              TODAY&apos;S MISSION
            </small>
            <h2 className="mt-1 text-2xl font-black">{m.title}</h2>
          </div>
          <span className="boss-badge">{m.badge}</span>
        </div>
        <div className="cast-card">
          <div className="cast-avatars" role="img" aria-label={m.castAlt}>
            <Image
              src="/avatar-wang-v3.png"
              width={192}
              height={192}
              alt=""
              priority
            />
            <Image
              src="/avatar-gu-v3.png"
              width={192}
              height={192}
              alt=""
              priority
            />
            <Image
              src="/avatar-lin-v3.png"
              width={192}
              height={192}
              alt=""
              priority
            />
          </div>
          <p>
            <b>{m.castTitle}</b>
            <span>{m.castNote}</span>
          </p>
        </div>
        <div className="mt-5 space-y-3">
          <Track
            time={m.tracks[0].time}
            title={m.tracks[0].title}
            desc={m.tracks[0].description}
            onClick={() => setView("lesson")}
            active
          />
          <Track
            time={m.tracks[1].time}
            title={m.tracks[1].title}
            desc={m.tracks[1].description}
            onClick={() => setView("memory")}
          />
          <Track
            time={m.tracks[2].time}
            title={m.tracks[2].title}
            desc={m.tracks[2].unlocked}
            onClick={() => setView("game")}
          />
        </div>
        <p className="mt-5 border-t-2 border-dashed border-slate-300 pt-4 text-xs leading-6 text-slate-500">
          {m.ethics}
        </p>
      </div>
    </div>
  );
}
function Track({
  time,
  title,
  desc,
  onClick,
  active,
}: {
  time: string;
  title: string;
  desc: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button onClick={onClick} className={`track-row ${active ? "active" : ""}`}>
      <span className="time-chip">{time}</span>
      <span className="text-left">
        <b className="block">{title}</b>
        <small className="text-slate-500">{desc}</small>
      </span>
      <span className="ml-auto">→</span>
    </button>
  );
}

function Lesson({
  lesson,
  setLesson,
  start,
  openPuzzles,
  course,
  setCourse,
  locale,
  copy,
}: {
  lesson: number;
  setLesson: (n: number) => void;
  start: () => void;
  openPuzzles: () => void;
  course: CourseState;
  setCourse: Dispatch<SetStateAction<CourseState>>;
  locale: Locale;
  copy: OnboardingCopy;
}) {
  const { progress, mastered, mistakes } = course,
    [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
      null,
    ),
    current = copy.lessons[lesson],
    step = current.steps[progress[lesson]],
    allMastered = mastered.every(Boolean),
    unlocked = (index: number) =>
      index === 0 || mastered.slice(0, index).every(Boolean),
    quizRef = useRef<HTMLDivElement>(null),
    lastQuestion = useRef(`${lesson}:${progress[lesson]}`),
    c = copy.course;
  useEffect(() => {
    const key = `${lesson}:${progress[lesson]}`;
    if (lastQuestion.current === key) return;
    lastQuestion.current = key;
    quizRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [lesson, progress]);
  const choose = (answer: number) => {
    if (feedback?.ok) return;
    if (answer === step.correct) {
      setFeedback({ ok: true, text: step.explain });
      if (progress[lesson] === current.steps.length - 1)
        setCourse((state) => ({
          ...state,
          mastered: state.mastered.map((value, index) =>
            index === lesson ? true : value,
          ),
        }));
    } else {
      setCourse((state) => ({
        ...state,
        mistakes: state.mistakes.map((value, index) =>
          index === lesson ? value + 1 : value,
        ),
      }));
      setFeedback({ ok: false, text: step.wrong });
    }
  };
  const go = (index: number) => {
    if (!unlocked(index)) return;
    setLesson(index);
    setFeedback(null);
  };
  const nextQuestion = () => {
    setCourse((state) => ({
      ...state,
      progress: state.progress.map((value, index) =>
        index === lesson ? value + 1 : value,
      ),
    }));
    setFeedback(null);
  };
  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="text-3xl font-black sm:text-5xl">{c.title}</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">{c.intro}</p>
        </div>
        <b className="text-[var(--gold)]">
          {mastered.filter(Boolean).length} / 4 {c.mastered}
        </b>
      </div>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-2">
          {copy.lessons.map((item, index) => (
            <button
              disabled={!unlocked(index)}
              key={item.n}
              onClick={() => go(index)}
              className={`lesson-row ${lesson === index ? "active" : ""} ${mastered[index] ? "mastered" : ""}`}
            >
              <b>{mastered[index] ? "✓" : item.n}</b>
              <span>
                <strong>{item.t}</strong>
                <small>
                  {mastered[index]
                    ? c.mastered
                    : unlocked(index)
                      ? item.m
                      : c.locked}
                </small>
              </span>
            </button>
          ))}
        </aside>
        <article className="paper-panel min-h-[520px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow dark">
                LESSON {current.n} · {progress[lesson] + 1}/
                {current.steps.length}
              </p>
              <h2 className="mt-2 text-3xl font-black">{current.t}</h2>
              <p className="mt-2 text-slate-600">{current.d}</p>
            </div>
            <span className="lesson-score">
              {c.mistakes} {mistakes[lesson]}
            </span>
          </div>
          <div ref={quizRef} className="lesson-quiz">
            <p className="lesson-scene">{step.scene}</p>
            <h3>{step.prompt}</h3>
            <div className="lesson-options">
              {step.options.map((option, index) => (
                <button
                  data-testid="lesson-option"
                  disabled={Boolean(feedback?.ok)}
                  onClick={() => choose(index)}
                  className="lesson-option"
                  key={option}
                >
                  {option}
                </button>
              ))}
            </div>
            {feedback && (
              <div
                role={feedback.ok ? "status" : "alert"}
                className={`lesson-feedback ${feedback.ok ? "correct" : "wrong"}`}
              >
                <b>{feedback.ok ? c.correct : c.retry}</b>
                <p>{feedback.text}</p>
              </div>
            )}
            {feedback?.ok && progress[lesson] < current.steps.length - 1 && (
              <button
                data-testid="lesson-next-question"
                onClick={nextQuestion}
                className="pixel-button coral lesson-advance"
              >
                {c.nextQuestion}
              </button>
            )}
            {mastered[lesson] &&
              progress[lesson] === current.steps.length - 1 && (
                <p data-testid="lesson-complete" className="lesson-complete">
                  {c.complete}
                </p>
              )}
          </div>
          {allMastered && (
            <div className="mastery-list">
              <b>{c.checklistTitle}</b>
              {c.checklist.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
          <div className="mt-8 flex flex-wrap justify-between gap-3">
            <button
              disabled={!lesson}
              onClick={() => go(Math.max(0, lesson - 1))}
              className="pixel-button dark"
            >
              {c.previous}
            </button>
            {lesson < 3 ? (
              <button
                disabled={!mastered[lesson]}
                onClick={() => go(lesson + 1)}
                className="pixel-button coral"
              >
                {c.next}
              </button>
            ) : (
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  data-testid="lesson-start-game"
                  disabled={!allMastered}
                  onClick={start}
                  className="pixel-button dark"
                >
                  {c.start}
                </button>
                <button
                  data-testid="lesson-start-puzzles"
                  disabled={!allMastered}
                  onClick={openPuzzles}
                  className="pixel-button coral"
                >
                  {locale === "zh" ? "先练 5 关残局 →" : "Try 5 endgames →"}
                </button>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function EndgamePuzzles({
  locale,
  start,
}: {
  locale: Locale;
  start: () => void;
}) {
  const [index, setIndex] = useState(0),
    [answer, setAnswer] = useState<number | null>(null),
    [tried, setTried] = useState<number[]>([]),
    [score, setScore] = useState(0),
    [ready, setReady] = useState(false),
    puzzle = ENDGAME_PUZZLES[index],
    solved = answer === puzzle.best,
    done = solved && index === ENDGAME_PUZZLES.length - 1,
    names =
      locale === "zh"
        ? ["你", "王总", "小顾", "林姐"]
        : ["You", "Wang", "Gu", "Lin"];
  useEffect(() => {
    const id = setTimeout(() => {
      const saved = parsePuzzleProgress(localStorage.getItem("gd-endgame-v1"));
      if (saved) {
        setIndex(saved.index);
        setScore(saved.score);
        setTried(saved.tried);
        setAnswer(saved.answer);
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (ready) {
      localStorage.setItem(
        "gd-endgame-v1",
        serializePuzzleProgress({ index, score, tried, answer }),
      );
      notifyTrainingChanged();
    }
  }, [answer, index, ready, score, tried]);
  const choose = (choice: number) => {
    if (solved) return;
    const first = tried.length === 0;
    if (first && choice === puzzle.best) setScore((value) => value + 1);
    setTried((values) =>
      values.includes(choice) ? values : [...values, choice],
    );
    setAnswer(choice);
  };
  const next = () => {
    setIndex((value) => value + 1);
    setAnswer(null);
    setTried([]);
  };
  const reset = () => {
    setIndex(0);
    setScore(0);
    setTried([]);
    setAnswer(null);
    localStorage.setItem(
      "gd-endgame-epoch-v1",
      String(
        Math.min(
          1_000_000,
          (Number(localStorage.getItem("gd-endgame-epoch-v1")) || 0) + 1,
        ),
      ),
    );
    localStorage.removeItem("gd-endgame-v1");
    notifyTrainingChanged();
  };
  return (
    <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">ENDGAME BRIDGE · 5 MIN</p>
          <h1 className="text-3xl font-black sm:text-5xl">
            {locale === "zh"
              ? "王总局 · 迷你残局"
              : "Wang table · mini endgames"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            {locale === "zh"
              ? "每关只有 5—7 张手牌，立刻看规则判断和牌桌表达；不会展示任何对手暗牌。每关可反复尝试，首答分只记录第一次选择；本机会保存进度，自托管云存档可跨设备继续。"
              : "Each case uses only 5–7 cards and gives immediate rules and table-manner feedback. No hidden opponent cards are exposed. Retry freely; only the first choice affects the score. Progress stays on-device and can resume across devices with self-hosted cloud saves."}
          </p>
        </div>
        <b className="text-[var(--gold)]">
          {index + 1} / {ENDGAME_PUZZLES.length} ·{" "}
          {locale === "zh" ? "首答分" : "first-try"} {score}
        </b>
      </div>
      <article
        className="paper-panel puzzle-panel"
        data-testid="endgame-puzzle"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow dark">CASE #{puzzle.seed}</p>
            <h2>{puzzle.title[locale]}</h2>
          </div>
          <span className="lesson-score">{puzzleSummary(puzzle, locale)}</span>
        </div>
        <div
          className="puzzle-counts"
          aria-label={
            locale === "zh" ? "公开剩余张数" : "Public remaining card counts"
          }
        >
          {names.map((name, seat) => (
            <span key={name}>
              <b>{name}</b>
              {puzzle.remaining[seat]} {locale === "zh" ? "张" : "cards"}
            </span>
          ))}
        </div>
        <p className="lesson-scene">{puzzle.scene[locale]}</p>
        <div className="puzzle-table">
          <div>
            <small>{locale === "zh" ? "上一手" : "Last play"}</small>
            {puzzle.lastPlay ? (
              <>
                <b>{names[puzzle.lastPlay.seat]}</b>
                <div className="played-cards">
                  {puzzle.lastPlay.cards.map((card) => (
                    <CardView key={card.id} card={card} compact />
                  ))}
                </div>
              </>
            ) : (
              <b>{locale === "zh" ? "新一圈" : "New trick"}</b>
            )}
          </div>
          <div>
            <small>{locale === "zh" ? "你的手牌" : "Your hand"}</small>
            <div className="played-cards puzzle-hand">
              {puzzle.learnerHand.map((card) => (
                <CardView key={card.id} card={card} compact />
              ))}
            </div>
          </div>
        </div>
        <h3 className="puzzle-prompt">{puzzle.prompt[locale]}</h3>
        <div className="lesson-options">
          {puzzle.options.map((option, choice) => (
            <button
              data-testid="puzzle-option"
              disabled={solved}
              onClick={() => choose(choice)}
              className={`lesson-option ${tried.includes(choice) ? (choice === puzzle.best ? "puzzle-correct" : "puzzle-tried") : ""}`}
              key={puzzleActionLabel(puzzle, option, locale)}
            >
              <span>{puzzleActionLabel(puzzle, option, locale)}</span>
              <small>
                {isLegalPuzzleAction(puzzle, option.action)
                  ? locale === "zh"
                    ? "规则合法"
                    : "Legal"
                  : locale === "zh"
                    ? "规则不合法"
                    : "Illegal"}
              </small>
            </button>
          ))}
        </div>
        {answer !== null && (
          <div
            role={solved ? "status" : "alert"}
            className={`lesson-feedback ${solved ? "correct" : "wrong"}`}
          >
            <b>
              {solved
                ? locale === "zh"
                  ? "✓ 判断正确"
                  : "✓ Correct"
                : locale === "zh"
                  ? "再想一步 · 本关首答未得分，可继续重试"
                  : "Think again · no first-try point for this case; keep trying"}
            </b>
            <p>{puzzle.options[answer].explanation[locale]}</p>
            {solved && (
              <>
                <p>
                  <strong>{locale === "zh" ? "规则：" : "Rules: "}</strong>
                  {puzzle.rule[locale]}
                </p>
                <p>
                  <strong>
                    {locale === "zh" ? "牌桌：" : "At the table: "}
                  </strong>
                  {puzzle.social[locale]}
                </p>
              </>
            )}
          </div>
        )}{" "}
        {solved && (
          <div className="puzzle-next">
            {done ? (
              <>
                <p>
                  {locale === "zh"
                    ? `5 关完成，首答 ${score} / 5。现在进入整副牌，会更容易看清“该不该抢牌权”。`
                    : `All five complete. First-try score: ${score} / 5. You are ready for a full deal.`}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    data-testid="puzzle-start-game"
                    onClick={start}
                    className="pixel-button coral"
                  >
                    {locale === "zh"
                      ? "进入 108 张 AI 实战 ▶"
                      : "Enter the 108-card AI table ▶"}
                  </button>
                  <button
                    data-testid="puzzle-reset"
                    onClick={reset}
                    className="pixel-button dark"
                  >
                    {locale === "zh" ? "重新练 5 关" : "Restart all five"}
                  </button>
                </div>
              </>
            ) : (
              <button
                data-testid="puzzle-next"
                onClick={next}
                className="pixel-button coral"
              >
                {locale === "zh" ? "下一关 →" : "Next case →"}
              </button>
            )}
          </div>
        )}
      </article>
    </section>
  );
}

function Game({
  state,
  selected,
  setSelected,
  onPlay,
  onPass,
  onHint,
  coach,
  restart,
  nextDeal,
  setView,
  aiSpeed,
  cycleSpeed,
  voiceEnabled,
  toggleVoice,
  saveMode,
  localSaveStatus,
  retryLocalSave,
  syncStatus,
  retrySync,
  matchReview,
  agentProvider,
  agentModeEnabled,
  toggleAgentMode,
}: {
  state: GameState;
  selected: string[];
  setSelected: (v: string[]) => void;
  onPlay: () => void;
  onPass: () => void;
  onHint: () => void;
  coach: string;
  restart: () => void;
  nextDeal: () => void;
  setView: (v: View) => void;
  aiSpeed: (typeof AI_SPEEDS)[number];
  cycleSpeed: () => void;
  voiceEnabled: boolean;
  toggleVoice: () => void;
  saveMode: "checking" | "local" | "cloud";
  localSaveStatus: "idle" | "saving" | "saved" | "error";
  retryLocalSave: () => void;
  syncStatus: "idle" | "saving" | "saved" | "error";
  retrySync: () => void;
  matchReview: MatchReviewState | null;
  agentProvider: AgentProvider;
  agentModeEnabled: boolean;
  toggleAgentMode: () => void;
}) {
  const me = state.players[0],
    last = state.lastPlay,
    localAnalysis = analyzeStyle(state),
    activeReview = matchReview?.seed === state.seed ? matchReview : null,
    analysis = mergeRemoteMatchReview(
      localAnalysis,
      activeReview?.status === "compatible"
        ? (activeReview.review ?? null)
        : null,
    ),
    reviewLabel =
      agentProvider === "local"
        ? "本地证据复盘"
        : activeReview?.status === "compatible"
          ? "大模型策略分类 · 公开事件 + 本地统计"
          : activeReview?.status === "fallback"
            ? "大模型不可用 · 已用本地证据复盘"
            : "大模型复盘中 · 先显示本地证据",
    groups = me.hand.reduce<Card[][]>((all, card) => {
      const group = all.at(-1);
      if (group?.[0].rank === card.rank) group.push(card);
      else all.push([card]);
      return all;
    }, []),
    saveLabel =
      saveMode === "checking"
        ? "检测中"
        : saveMode === "local"
          ? localSaveStatus === "error"
            ? "本机失败 · 重试"
            : localSaveStatus === "saved"
              ? "本机已保存"
              : state.phase === "finished"
                ? "本机保存中"
                : "本机"
          : state.phase !== "finished"
            ? "完成后保存"
            : syncStatus === "saving"
              ? "云端保存中"
              : syncStatus === "saved"
                ? "云端已保存"
                : syncStatus === "error"
                  ? "云端失败 · 重试"
                  : "云端待保存",
    localFailure = saveMode === "local" && localSaveStatus === "error",
    cloudFailure = saveMode === "cloud" && syncStatus === "error",
    resultSaveLabel =
      saveMode === "checking"
        ? "正在确认存档方式"
        : saveMode === "local"
          ? localSaveStatus === "saved"
            ? "本机已保存"
            : localFailure
              ? "本机保存失败 · 点此重试"
              : "本机保存中"
          : syncStatus === "saving"
            ? "云端保存中"
            : syncStatus === "saved"
              ? "云端已保存"
              : cloudFailure
                ? "云端保存失败 · 点此重试"
                : "云端等待复盘完成",
    retrySave = localFailure ? retryLocalSave : retrySync,
    visibleCoach = state.phase === "finished" ? finishedCoach(state) : coach;
  return (
    <section className="mx-auto max-w-7xl px-3 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">
            AI PRACTICE · 第 {state.roundNo} 副 / 第 {state.trickNo} 圈
          </p>
          <h1 className="text-2xl font-black">
            打 {RANK_LABEL[state.level]} · 你与小顾一队
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            data-testid="save-mode"
            disabled={!localFailure && !cloudFailure}
            onClick={retrySave}
            className="mode-chip speed-chip"
          >
            存档 · {saveLabel}
          </button>
          <span className="mode-chip">提示 ON</span>
          <button
            data-testid="agent-mode"
            aria-pressed={agentModeEnabled}
            disabled={agentProvider !== "compatible"}
            onClick={toggleAgentMode}
            className="mode-chip speed-chip"
          >
            {agentProvider === "compatible"
              ? agentModeEnabled
                ? "Agent 实战 · 3/3 LLM 优先"
                : "本地策略模式"
              : "Agent 实战 · 待配置"}
          </button>
          <button
            data-testid="voice-toggle"
            aria-pressed={voiceEnabled}
            onClick={toggleVoice}
            className="mode-chip speed-chip"
          >
            语音 {voiceEnabled ? "ON" : "OFF"}
          </button>
          <button
            data-testid="ai-speed"
            aria-label={`切换 AI 出牌速度；当前为${aiSpeed.label}档，每位 AI 至少等待 ${aiSpeed.delay / 1000} 秒`}
            onClick={cycleSpeed}
            className="mode-chip speed-chip"
          >
            AI 节奏 · {aiSpeed.label} · {aiSpeed.delay / 1000}s
          </button>
          <button onClick={restart} className="pixel-button ghost smallbtn">
            新比赛
          </button>
        </div>
      </div>
      <div className="game-shell">
        <LiveHistory state={state} />
        <Opponent
          player={state.players[2]}
          active={state.turn === 2}
          agentMode={agentModeEnabled && agentProvider === "compatible"}
          top
        />
        <Opponent
          player={state.players[3]}
          active={state.turn === 3}
          agentMode={agentModeEnabled && agentProvider === "compatible"}
          side="left"
        />
        <Opponent
          player={state.players[1]}
          active={state.turn === 1}
          agentMode={agentModeEnabled && agentProvider === "compatible"}
          side="right"
        />
        <div className="table-center">
          <div className="last-play">
            {last ? (
              <>
                <small>
                  {state.players[last.seat].name} · {comboName(last.combo)}
                </small>
                <div className="played-cards">
                  {last.combo.cards.map((c) => (
                    <CardView card={c} level={state.level} key={c.id} compact />
                  ))}
                </div>
              </>
            ) : (
              <>
                <b>新一圈</b>
                <small>领出任意合法牌型</small>
              </>
            )}
          </div>
          <div className="turn-badge">
            {state.phase === "finished"
              ? "本副结束"
              : state.turn === 0
                ? "轮到你"
                : `AI 思考中 · ${aiSpeed.label}档`}
          </div>
        </div>
        <div className="self-seat">
          <div className="coach-bubble">
            <span>AI 语音教练</span>
            <p data-testid="coach-message">{visibleCoach}</p>
          </div>
          <p className="swipe-hint">← 同点牌已叠放 · 左右滑动查看全部手牌 →</p>
          <div
            className="hand grouped-hand"
            aria-label="你的手牌，已按相同点数叠放"
          >
            {groups.map((group) => (
              <div
                data-testid="rank-group"
                className="rank-group"
                aria-label={`${RANK_LABEL[group[0].rank]} 组，共 ${group.length} 张`}
                key={group[0].rank}
              >
                {group.map((card) => (
                  <CardView
                    key={card.id}
                    card={card}
                    level={state.level}
                    selected={selected.includes(card.id)}
                    onClick={() =>
                      setSelected(
                        selected.includes(card.id)
                          ? selected.filter((x) => x !== card.id)
                          : [...selected, card.id],
                      )
                    }
                  />
                ))}
                {group.length > 1 && (
                  <span aria-hidden="true" className="rank-count">
                    {group.length}张
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="action-bar">
            <span className="group-hint">同点叠放 · 逐张点选</span>
            <button
              data-testid="hint-button"
              onClick={onHint}
              className="pixel-button hint"
            >
              一键提示
            </button>
            <button
              onClick={onPass}
              disabled={state.turn !== 0 || !last}
              className="pixel-button dark"
            >
              过牌
            </button>
            <button
              data-testid="play-button"
              onClick={onPlay}
              disabled={state.turn !== 0 || !selected.length}
              className="pixel-button coral"
            >
              出牌 ({selected.length})
            </button>
          </div>
        </div>
      </div>
      {state.phase === "finished" && (
        <div className="result-modal">
          <div className="paper-panel max-w-lg">
            <p className="eyebrow dark">ROUND COMPLETE</p>
            <h2 data-testid="result-summary" className="text-3xl font-black">
              {resultSummary(state)}
            </h2>
            <div className="score-split">
              <div>
                <b>{analysis.metrics.score}</b>
                <span>牌技分</span>
              </div>
              <div>
                <b>{analysis.socialScore}</b>
                <span>社交分</span>
              </div>
            </div>
            <p data-testid="review-source" role="status" className="mode-chip">
              {reviewLabel}
            </p>
            <p className="review-privacy">
              仅发送已出牌、过牌、名次与不含暗牌的统计；任何玩家未出的手牌都不会发送。模型只选择本地审核过的策略分类，不会直接展示自由文本。
            </p>
            <h3>{analysis.title}</h3>
            {analysis.advice.map((a) => (
              <p key={a}>• {a}</p>
            ))}
            <div className="mt-4">
              {localFailure || cloudFailure ? (
                <button
                  data-testid="result-save-status"
                  onClick={retrySave}
                  className="mode-chip urgent"
                >
                  存档 · {resultSaveLabel}
                </button>
              ) : (
                <p
                  data-testid="result-save-status"
                  role="status"
                  className="mode-chip dark"
                >
                  存档 · {resultSaveLabel}
                </p>
              )}
            </div>
            <div className="result-actions mt-5">
              {state.matchWinner === null && (
                <button onClick={nextDeal} className="pixel-button coral">
                  贡还牌并继续
                </button>
              )}
              <button
                onClick={() => setView("replay")}
                className="pixel-button dark"
              >
                查看回放
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function OnlineTable({ enabled }: { enabled: boolean }) {
  const [queue, setQueue] = useState<QueueStatus>({ status: "idle" }),
    [room, setRoom] = useState<OnlineRoomView | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [message, setMessage] = useState("四位真人到齐后自动开桌。"),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState<"online" | "unstable">("online"),
    [now, setNow] = useState(() => Date.now());
  const failedPoll = useRef(false),
    queueFailures = useRef(0),
    roomId = queue.status === "matched" ? queue.roomId : null;
  useEffect(() => {
    if (!enabled || roomId) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/online/queue", {
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("queue poll failed");
        const next = (await response.json()) as QueueStatus;
        if (active) {
          if (queue.status === "queued" && next.status === "idle")
            setMessage("等待已超时，请重新加入匹配。");
          else if (queueFailures.current >= 2)
            setMessage("连接已恢复，等待人数已更新。");
          queueFailures.current = 0;
          setQueue(next);
        }
      } catch {
        if (active && ++queueFailures.current >= 2)
          setMessage("匹配大厅连接不稳定，正在自动重连。");
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [enabled, roomId, queue.status]);
  useEffect(() => {
    if (!enabled || !roomId) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/online/rooms/${encodeURIComponent(roomId)}`,
          { headers: { accept: "application/json" } },
        );
        if (!response.ok) throw new Error("poll failed");
        const next = (await response.json()) as OnlineRoomView;
        if (active) {
          setRoom(next);
          setConnection("online");
          if (failedPoll.current)
            setMessage("连接已恢复，牌局已同步到最新版本。");
          failedPoll.current = false;
        }
      } catch {
        if (active) {
          failedPoll.current = true;
          setConnection("unstable");
          setMessage("连接不稳定，正在自动重连；请勿重复出牌。");
        }
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [enabled, roomId]);
  useEffect(() => {
    if (!room?.turnDeadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [room?.turnDeadline]);
  const join = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/online/queue", { method: "POST" }),
        data = (await response.json()) as QueueStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "加入失败");
      setQueue(data);
      setMessage(
        data.status === "matched"
          ? "已匹配，正在进入牌桌。"
          : "已进入队列，等待四位牌友。",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/online/queue", { method: "DELETE" });
      if (!response.ok) throw new Error("离开队列失败，请重试");
      setQueue({ status: "idle" });
      setMessage("已离开匹配队列。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const act = async (type: "play" | "pass") => {
    if (!roomId || !room) return;
    setBusy(true);
    try {
      const response = await fetch(
          `/api/online/rooms/${encodeURIComponent(roomId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              actionId: crypto.randomUUID(),
              expectedVersion: room.version,
              type,
              cardIds: type === "play" ? selected : undefined,
            }),
          },
        ),
        data = (await response.json()) as OnlineRoomView & { error?: string };
      if (!response.ok) {
        if (response.status === 409) {
          const latest = await fetch(
            `/api/online/rooms/${encodeURIComponent(roomId)}`,
          );
          if (latest.ok) setRoom((await latest.json()) as OnlineRoomView);
        }
        throw new Error(data.error || "操作失败");
      }
      setRoom(data);
      setSelected([]);
      setMessage("动作已由服务器规则引擎确认。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancelRoom = async () => {
    if (!roomId || !confirm("离开会取消整桌当前牌局，确认继续？")) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/online/rooms/${encodeURIComponent(roomId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("取消牌局失败，请重试");
      setQueue({ status: "idle" });
      setRoom(null);
      setMessage("当前真人牌局已取消。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!enabled)
    return (
      <section className="mx-auto max-w-3xl px-5 py-16">
        <div className="paper-panel text-center">
          <p className="eyebrow dark">SELF-HOST PREVIEW</p>
          <h1 className="text-3xl font-black">在线匹配尚未启用</h1>
          <p className="mt-4 text-slate-600">
            自托管配置 SQLite、签名会话并设置 ONLINE_MATCHING_ENABLED=1
            后开放；未启用时仍可使用完整的本地 AI 对局。
          </p>
        </div>
      </section>
    );
  if (!room || !roomId) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-16">
        <div className="paper-panel text-center">
          <p className="eyebrow dark">ONLINE TABLE · BETA</p>
          <h1 className="text-4xl font-black">四人真人匹配</h1>
          <p className="mt-4 text-slate-600">
            服务器公平发牌，只向你显示自己的手牌。真人模式暂不提供 AI
            教练或公开聊天。
          </p>
          <div className="my-8 text-2xl font-black">
            {queue.status === "queued"
              ? `等待牌友 · 已到 ${Math.min(queue.waiting, 4)} / 4`
              : "准备加入牌桌"}
          </div>
          <p
            role="status"
            aria-live="polite"
            className="mb-6 text-sm text-slate-500"
          >
            {message}
          </p>
          {queue.status === "queued" ? (
            <button
              disabled={busy}
              onClick={leave}
              className="pixel-button dark"
            >
              离开队列
            </button>
          ) : (
            <button
              data-testid="join-online"
              disabled={busy}
              onClick={join}
              className="pixel-button coral"
            >
              加入匹配
            </button>
          )}
        </div>
      </section>
    );
  }
  const me = room.state.players.find((player) => player.seat === room.youSeat)!,
    playing = room.status === "playing",
    myTurn = playing && room.state.turn === room.youSeat,
    groups = me.hand.reduce<Card[][]>((all, card) => {
      const group = all.at(-1);
      if (group?.[0].rank === card.rank) group.push(card);
      else all.push([card]);
      return all;
    }, []),
    last = room.state.lastPlay,
    seconds = room.turnDeadline
      ? Math.max(0, Math.ceil((Date.parse(room.turnDeadline) - now) / 1000))
      : 0;
  const currentPlayer = room.state.players[room.state.turn],
    turnLabel =
      room.status === "finished"
        ? "本副结束"
        : room.status === "cancelled"
          ? "牌局已取消"
          : connection === "unstable"
            ? "连接不稳定"
            : `${myTurn ? "轮到你" : `轮到 ${currentPlayer.name}`} · ${seconds}s`;
  return (
    <section className="mx-auto max-w-6xl px-3 py-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">服务器公平发牌 · 版本 {room.version}</p>
          <h1 className="text-3xl font-black">
            真人牌桌 · 打 {RANK_LABEL[room.state.level]}
          </h1>
        </div>
        <span
          role="status"
          aria-live="polite"
          className={`mode-chip ${seconds <= 10 && playing ? "urgent" : ""}`}
        >
          {turnLabel}
        </span>
      </div>
      <div className="paper-panel">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {room.state.players.map((player) => (
            <div
              key={player.seat}
              className={`tip-card ${playing && player.seat === room.state.turn ? "ring-4 ring-[var(--gold)]" : ""}`}
            >
              <b>
                {player.role === "you"
                  ? "你"
                  : player.role === "partner"
                    ? "搭档"
                    : "对手"}
              </b>
              <strong>{player.name}</strong>
              <span>
                {player.finished
                  ? `第 ${player.finished} 名`
                  : `剩 ${player.cardCount} 张`}
              </span>
            </div>
          ))}
        </div>
        <div className="my-8 min-h-28 rounded border-4 border-[var(--ink)] bg-emerald-900 p-4 text-center text-white">
          {last ? (
            <>
              <small>
                {room.state.players[last.seat].name} · {comboName(last.combo)}
              </small>
              <div className="played-cards mt-3">
                {last.combo.cards.map((card) => (
                  <CardView key={card.id} card={card} compact />
                ))}
              </div>
            </>
          ) : (
            <>
              <b>新一圈</b>
              <p className="text-xs">领出任意合法牌型</p>
            </>
          )}
        </div>
        <p
          role="alert"
          aria-live="assertive"
          className="mb-3 text-center text-sm text-slate-600"
        >
          {room.status === "cancelled"
            ? "有牌友离开或连续两分钟未操作，本桌已安全取消，可返回重新匹配。"
            : seconds <= 30 && playing
              ? `请留意：本回合还剩 ${seconds} 秒，超时会取消本桌。`
              : message}
        </p>
        <p className="swipe-hint dark">← 左右滑动查看全部手牌 →</p>
        <div
          className="hand grouped-hand online-hand"
          aria-label="你的在线手牌"
        >
          {groups.map((group) => (
            <div className="rank-group" key={group[0].rank}>
              {group.map((card) => (
                <CardView
                  key={card.id}
                  card={card}
                  selected={selected.includes(card.id)}
                  onClick={() =>
                    setSelected(
                      selected.includes(card.id)
                        ? selected.filter((id) => id !== card.id)
                        : [...selected, card.id],
                    )
                  }
                />
              ))}
            </div>
          ))}
        </div>
        <div className="online-actions mt-5 flex flex-wrap justify-center gap-3">
          <button
            disabled={busy || !myTurn || !last}
            onClick={() => void act("pass")}
            className="pixel-button dark"
          >
            过牌
          </button>
          <button
            data-testid="online-play"
            disabled={busy || !myTurn || !selected.length}
            onClick={() => void act("play")}
            className="pixel-button coral"
          >
            出牌 ({selected.length})
          </button>
          {playing && (
            <button
              disabled={busy}
              onClick={() => void cancelRoom()}
              className="pixel-button ghost"
            >
              离开并取消本局
            </button>
          )}
        </div>
        {room.status === "finished" && (
          <p className="mt-6 text-center font-black">
            名次：
            {room.state.finishOrder
              .map((seat) => room.state.players[seat].name)
              .join(" → ")}
          </p>
        )}
      </div>
    </section>
  );
}

function LiveHistory({ state }: { state: GameState }) {
  const deck = new Map(createDeck().map((card) => [card.id, card])),
    events = state.events
      .filter(
        (event) =>
          event.type === "play" ||
          event.type === "pass" ||
          event.type === "trick",
      )
      .reverse();
  const action = (event: GameState["events"][number]) => {
    if (event.type === "pass") return "过牌";
    if (event.type === "trick") return "牌权重置";
    const cards = event.cardIds?.map((id) => deck.get(id)).filter(Boolean) as
        Card[] | undefined,
      combo = cards?.length ? parseCombo(cards, state.level) : null;
    return `${combo ? comboName(combo) : "出牌"} · ${cards?.map(cardLabel).join(" ") || "出牌"}`;
  };
  return (
    <details data-testid="live-history" className="live-history" open>
      <summary>本副出牌历史 · 最新在上 · {events.length} 条</summary>
      {events.length ? (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <b>
                {event.type === "trick"
                  ? "新一圈"
                  : event.seat === undefined
                    ? "牌桌"
                    : state.players[event.seat].name}
              </b>
              <span>{action(event)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p>这里会逐手保留本副动作；对局结束后可在“回放”查看完整记录。</p>
      )}
    </details>
  );
}
function Opponent({
  player,
  active,
  agentMode,
  top,
  side,
}: {
  player: GameState["players"][number];
  active: boolean;
  agentMode: boolean;
  top?: boolean;
  side?: "left" | "right";
}) {
  const persona = agentPersona(player.seat);
  return (
    <details
      data-testid={`agent-persona-${player.seat}`}
      className={`opponent ${top ? "top" : ""} ${side || ""} ${active ? "active" : ""}`}
    >
      <summary
        aria-label={`${player.name}，${persona.label}，点开查看风格说明`}
      >
        <div
          role="img"
          aria-label={`${player.name}头像`}
          className={`avatar avatar-${player.role}`}
        />
        <b>
          {player.name}
          {player.role === "boss" ? " · 老板" : ""}
        </b>
        <span>
          {player.finished
            ? `第 ${player.finished} 名`
            : `${player.hand.length} 张`}{" "}
          · {persona.label}
          {agentMode ? " · LLM Agent（本地兜底）" : " · 本地策略"}
        </span>
      </summary>
      <p className="persona-detail">
        <b>{persona.label}</b>
        {persona.description}
      </p>
    </details>
  );
}
function CardView({
  card,
  level,
  selected,
  compact,
  onClick,
}: {
  card: Card;
  level?: GameState["level"];
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const red = card.suit === "H" || card.suit === "D",
    wild = level !== undefined && isWildLevelCard(card, level),
    label = `${cardLabel(card)}${wild ? "，红桃级牌，逢人配" : ""}`,
    inside = (
      <>
        <span>{cardLabel(card)}</span>
        {wild && (
          <b aria-hidden="true" className="wild-badge">
            配
          </b>
        )}
        {card.suit !== "J" && (
          <i>
            {card.suit === "S"
              ? "♠"
              : card.suit === "H"
                ? "♥"
                : card.suit === "C"
                  ? "♣"
                  : "♦"}
          </i>
        )}
      </>
    );
  return compact ? (
    <div
      aria-label={label}
      className={`playing-card ${red ? "red" : ""} ${wild ? "wild-card" : ""} compact`}
    >
      {inside}
    </div>
  ) : (
    <button
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`playing-card ${red ? "red" : ""} ${wild ? "wild-card" : ""} ${selected ? "selected" : ""}`}
    >
      {inside}
    </button>
  );
}

function Memory({ locale }: { locale: Locale }) {
  const [mode, setMode] = useState<"count" | "grid">("count"),
    en = locale === "en";
  return (
    <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <p className="eyebrow">
        MEMORY LAB · {en ? "REAL-GAME TRANSFER" : "真实牌局迁移"}
      </p>
      <h1 className="text-4xl font-black">
        {en ? "Card Memory Lab" : "记牌训练场"}
      </h1>
      <p className="mt-3 text-slate-300">
        {en
          ? "Practise visible-card subtraction, then maintain a nine-cell key-card count from a real hand and public snapshots."
          : "先练已见牌减法，再从真实手牌起算并持续更新九宫关键牌余量；不是翻牌记位置。"}
      </p>
      <div
        className="memory-tabs"
        role="tablist"
        aria-label={en ? "Memory training mode" : "记牌训练模式"}
      >
        <button
          role="tab"
          aria-selected={mode === "count"}
          data-testid="memory-mode-count"
          onClick={() => setMode("count")}
        >
          {en ? "Live subtraction" : "实战减法"}
        </button>
        <button
          role="tab"
          aria-selected={mode === "grid"}
          data-testid="memory-mode-grid"
          onClick={() => setMode("grid")}
        >
          {en ? "Nine-cell counter" : "九宫余量盘"}
        </button>
      </div>
      {mode === "count" ? (
        <CountMemory locale={locale} />
      ) : (
        <GridMemory locale={locale} />
      )}
    </section>
  );
}

function CountMemory({ locale }: { locale: Locale }) {
  const [round, setRound] = useState(1),
    [seed] = useState(() => Date.now() % 1000003),
    [answer, setAnswer] = useState<number | null>(null),
    [submitted, setSubmitted] = useState(false),
    [focus, setFocus] = useState<CountKind | undefined>(),
    [attempts, setAttempts] = useState<ReturnType<typeof parseCountAttempts>>(
      [],
    ),
    drill = createCountDrill(seed, round, focus),
    correct = answer === drill.remaining,
    accuracy = attempts.length
      ? Math.round(
          (attempts.filter((attempt) => attempt.correct).length /
            attempts.length) *
            100,
        )
      : 0,
    en = locale === "en",
    label = en
      ? {
          jokers: "jokers",
          ace: "aces",
          two: "twos",
          level: `level ${RANK_LABEL[drill.level]} cards`,
        }[drill.kind]
      : drill.label;
  useEffect(() => {
    const id = setTimeout(() => {
      const saved = parseCountAttempts(
        localStorage.getItem("gd-count-memory-v1"),
      );
      if (saved.length) {
        setAttempts(saved);
        setRound(Math.max(...saved.map((attempt) => attempt.round)) + 1);
        const last = saved.at(-1);
        if (last && !last.correct) setFocus(last.kind);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  const submit = () => {
      if (answer === null) return;
      setSubmitted(true);
      const next = [
        ...attempts,
        {
          id: newAttemptId(),
          round,
          kind: drill.kind,
          seen: drill.seen,
          remaining: drill.remaining,
          answer,
          correct,
        },
      ];
      setAttempts(next);
      localStorage.setItem("gd-count-memory-v1", serializeCountAttempts(next));
      notifyTrainingChanged();
    },
    next = () => {
      setFocus(correct ? undefined : drill.kind);
      setRound(round + 1);
      setAnswer(null);
      setSubmitted(false);
    };
  return (
    <div className="paper-panel memory-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <b data-testid="count-prompt">
            {en
              ? `Two decks contain ${drill.total} ${label}. How many remain after the exposed cards?`
              : `两副牌共 ${drill.total} 张${label}，看完已见牌后还剩几张？`}
          </b>
          <p>
            {en
              ? `Level ${RANK_LABEL[drill.level]} · These are exposed-card snapshots, not three consecutive legal plays`
              : `当前打 ${RANK_LABEL[drill.level]} · 以下是练习用的已见牌快照，不代表连续三手合法牌型`}
          </p>
        </div>
        <span className="mode-chip dark">
          {en ? `SUBTRACTION · ROUND ${round}` : `实战减法 · 第 ${round} 轮`}
        </span>
      </div>
      <div
        className="count-events"
        aria-label={en ? "Exposed-card snapshots" : "已见牌快照"}
      >
        {drill.plays.map((play, index) => (
          <div
            className="count-event"
            key={play.map((card) => card.id).join("-")}
          >
            <b>{en ? `Snapshot ${index + 1}` : `已见牌组 ${index + 1}`}</b>
            <div className="played-cards">
              {play.map((card) => (
                <CardView card={card} key={card.id} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="count-form">
        <p>{en ? "Choose the number remaining:" : "请选择剩余张数："}</p>
        <div>
          {drill.options.map((option) => (
            <button
              data-testid="count-answer"
              aria-pressed={answer === option}
              disabled={submitted}
              onClick={() => setAnswer(option)}
              className={answer === option ? "selected" : ""}
              key={option}
            >
              {option}
              {en ? " cards" : " 张"}
            </button>
          ))}
        </div>
        <button
          data-testid="count-submit"
          disabled={answer === null || submitted}
          onClick={submit}
          className="pixel-button coral"
        >
          {en ? "Submit" : "提交判断"}
        </button>
      </div>
      {submitted && (
        <div
          role={correct ? "status" : "alert"}
          className={`lesson-feedback ${correct ? "correct" : "wrong"}`}
        >
          <b>
            {correct
              ? en
                ? "✓ Correct subtraction"
                : "✓ 减法正确"
              : en
                ? "Count the exposed cards again"
                : "再算一次已见牌"}
          </b>
          <p>
            {drill.total} − {en ? "exposed" : "已出现"} {drill.seen} ={" "}
            {en ? "remaining" : "剩余"} {drill.remaining}.{" "}
            {correct
              ? en
                ? "Continue with another key rank."
                : "继续换一类关键牌。"
              : en
                ? `The next round retrains ${label} with a new sequence.`
                : `下一轮会用新的牌序重练“${label}”。`}
          </p>
          <button
            data-testid="count-next"
            onClick={next}
            className="pixel-button dark mt-3"
          >
            {en ? "Next round →" : "下一轮 →"}
          </button>
        </div>
      )}
      <p className="memory-accuracy">
        {en
          ? `Accuracy ${accuracy}% · ${attempts.length} valid answers`
          : `累计准确率 ${accuracy}% · ${attempts.length} 次有效作答`}
      </p>
    </div>
  );
}

function GridMemory({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const [round, setRound] = useState(1),
    [seed] = useState(() => Date.now() % 1000003),
    [phase, setPhase] = useState<"show" | "recall" | "done">("show"),
    [answers, setAnswers] = useState<Array<number | null>>(Array(9).fill(null)),
    [openingScore, setOpeningScore] = useState(0),
    [attempts, setAttempts] = useState<GridAttempt[]>([]),
    drill = createNineGridDrill(seed, round),
    updateScore = drill.cells.filter(
      (cell, index) => answers[index] === cell.remaining,
    ).length,
    score = openingScore + updateScore;
  useEffect(() => {
    const id = setTimeout(() => {
      const saved = parseGridAttempts(localStorage.getItem("gd-memory-v2"));
      if (saved.length) {
        setAttempts(saved);
        setRound(Math.max(...saved.map((attempt) => attempt.round)) + 1);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  const submit = () => {
    setPhase("done");
    const next: GridAttempt[] = [
      ...attempts,
      { id: newAttemptId(), score, maxScore: 18, round },
    ];
    setAttempts(next);
    localStorage.setItem("gd-memory-v2", serializeGridAttempts(next));
    notifyTrainingChanged();
  };
  return (
    <div className="paper-panel memory-panel">
      <div className="flex items-center justify-between gap-3">
        <b data-testid="memory-prompt">
          {phase === "show"
            ? en
              ? "Opening code: count your real hand, then enter total minus hand"
              : "起手减法：数真实手牌，再填写“总量 − 手中张数”"
            : phase === "recall"
              ? en
                ? "Subtract every exposed key card, then restore all 9 counts"
                : "每出现一张关键牌，对应宫减 1；请还原九宫余量"
              : en
                ? `Opening ${openingScore}/9 · update ${updateScore}/9`
                : `起手 ${openingScore}/9 · 行牌更新 ${updateScore}/9`}
        </b>
        <span className="mode-chip dark">
          {en
            ? `KEY-CARD COUNTER · ROUND ${round}`
            : `九宫关键牌余量盘 · 第 ${round} 轮`}
        </span>
      </div>
      <p className="memory-method-note">
        {en
          ? "Popular extended method, not an official rule. This beginner drill uses level 2 so cells never overlap."
          : "流行扩展训练法，并非竞赛规则。本入门局固定打 2，避免级牌与 A/K/Q/10/5 重叠。"}
      </p>
      {phase === "show" && (
        <div className="opening-hand" aria-label="本轮真实起手牌">
          {drill.hand.map((card) => (
            <CardView key={card.id} card={card} level={drill.level} compact />
          ))}
        </div>
      )}
      <div className="memory-grid">
        {drill.cells.map((cell, i) => (
          <button
            data-testid={`memory-${i}`}
            disabled={phase === "done"}
            onClick={() =>
              setAnswers((current) => {
                const next = [...current];
                next[i] =
                  current[i] === null
                    ? 0
                    : (current[i]! + 1) % (cell.total + 1);
                return next;
              })
            }
            className={`memory-tile ${phase === "done" ? (answers[i] === cell.remaining ? "correct" : "wrong") : answers[i] !== null ? "picked" : ""}`}
            key={cell.key}
          >
            <b>{cell.label}</b>
            <strong>{answers[i] ?? "?"}</strong>
            <small>
              {phase === "show"
                ? `总量 ${cell.total} · 点按填写`
                : phase === "done"
                  ? `答案 ${cell.remaining}`
                  : `点按调整 0–${cell.total}`}
            </small>
          </button>
        ))}
      </div>
      {phase === "show" ? (
        <button
          data-testid="memory-hide"
          disabled={answers.some((answer) => answer === null)}
          onClick={() => {
            setOpeningScore(
              drill.cells.filter(
                (cell, index) => answers[index] === cell.initial,
              ).length,
            );
            setAnswers(Array(9).fill(null));
            setPhase("recall");
          }}
          className="pixel-button coral"
        >
          {en
            ? "Submit opening code and start update"
            : "提交起手码并开始行牌减法"}
        </button>
      ) : phase === "recall" ? (
        <>
          <div className="nine-grid-plays" aria-label="本轮公开出牌">
            {drill.plays.map((play, index) => (
              <div key={index}>
                <span>
                  {en
                    ? `Seen snapshot ${index + 1}`
                    : `已见牌快照 ${index + 1}`}
                </span>
                <div className="played-cards">
                  {play.map((card) => (
                    <CardView
                      key={card.id}
                      card={card}
                      level={drill.level}
                      compact
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            data-testid="memory-submit"
            disabled={answers.some((answer) => answer === null)}
            onClick={submit}
            className="pixel-button coral"
          >
            {en ? "Submit all 9 counts" : "提交九宫余量"}
          </button>
        </>
      ) : (
        <div>
          <p className="mt-4 text-slate-600">
            {score === 18
              ? en
                ? "Perfect. You updated every key-card count correctly."
                : "全对！你正确完成了起手减法和行牌更新。"
              : en
                ? "Review the first wrong cell: distinguish cards in your hand from cards already exposed."
                : "先复查第一个错格：手中牌只在起手时减一次，公开牌在行牌时再减。"}{" "}
            {en ? "Accuracy" : "累计准确率"}：
            {attempts.length
              ? Math.round(
                  (attempts.reduce((n, a) => n + a.score, 0) /
                    attempts.reduce((n, a) => n + (a.maxScore ?? 3), 0)) *
                    100,
                )
              : 0}
            %
          </p>
          <button
            onClick={() => {
              setRound(round + 1);
              setPhase("show");
              setOpeningScore(0);
              setAnswers(Array(9).fill(null));
            }}
            className="pixel-button dark mt-3"
          >
            {en ? "Next round" : "进入下一轮"}
          </button>
          <p className="memory-source-note">
            {en ? "Method note" : "方法说明"}：
            <a
              href="https://m.dushu.com/book/14144895/"
              target="_blank"
              rel="noreferrer"
            >
              {en ? "published memory-method index" : "出版物中的九宫法目录"}
            </a>
            {" · "}
            <a
              href="https://www.toutiao.com/w/1869410443611136/?source=m_redirect"
              target="_blank"
              rel="noreferrer"
            >
              {en ? "popular 3×3 example" : "流行九宫余量盘示例"}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function Replay({ history }: { history: GameState[] }) {
  const [chosen, setChosen] = useState<number | null>(
      history.length ? 0 : null,
    ),
    [cursor, setCursor] = useState(0),
    deck = new Map(createDeck().map((c) => [c.id, c])),
    game = chosen === null ? null : history[chosen],
    events = game?.events ?? [],
    event = events[cursor];
  const label = (type: string) =>
    ({
      deal: "发牌",
      play: "出牌",
      pass: "过牌",
      trick: "新一圈",
      finish: "出完",
      round: "贡还牌",
    })[type] ?? type;
  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <p className="eyebrow">MATCH ARCHIVE · 本机保存</p>
      <h1 className="text-4xl font-black">完整对局回放</h1>
      <p className="mt-3 text-slate-300">
        逐事件查看座位、牌张、圈次与分析证据；损坏记录会在载入时安全清除。
      </p>
      <div className="mt-8 grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          {history.length ? (
            history.map((g, i) => (
              <button
                onClick={() => {
                  setChosen(i);
                  setCursor(0);
                }}
                className={`replay-row ${chosen === i ? "active" : ""}`}
                key={g.seed}
              >
                <span className="time-chip">#{history.length - i}</span>
                <span>
                  <b>
                    打 {RANK_LABEL[g.level]} ·{" "}
                    {new Date(g.createdAt || 0).toLocaleDateString("zh-CN")}
                  </b>
                  <small>
                    {g.events.length} 个事件 · {g.ruleVersion}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <b>还没有完成的对局</b>
              <p>完成第一副 AI 实战后，这里会出现逐手事件与牌风报告。</p>
            </div>
          )}
        </div>
        {game && event && (
          <article className="paper-panel">
            <div className="flex justify-between">
              <p className="eyebrow dark">
                EVENT {cursor + 1} / {events.length}
              </p>
              <b>{resultSummary(game)}</b>
            </div>
            <h2 className="mt-3 text-3xl font-black">
              {label(event.type)}
              {event.seat !== undefined
                ? ` · ${game.players[event.seat].name}${event.seat === 0 ? "" : ` · ${agentPersona(event.seat).label}`}`
                : ""}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {beginnerEventNote(event)}
            </p>
            <details data-testid="replay-evidence" className="replay-evidence">
              <summary>证据详情</summary>
              <code>
                随机牌序 #{game.seed} · {game.ruleVersion}
              </code>
            </details>
            <div className="my-8 flex min-h-24 items-center justify-center">
              {event.cardIds?.length ? (
                <div className="played-cards">
                  {event.cardIds
                    .map((id) => deck.get(id))
                    .filter(Boolean)
                    .map((c) => (
                      <CardView
                        card={c!}
                        level={game.level}
                        key={c!.id}
                        compact
                      />
                    ))}
                </div>
              ) : (
                <span className="text-sm text-slate-400">
                  本事件没有牌张移动
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <button
                disabled={!cursor}
                onClick={() => setCursor(cursor - 1)}
                className="pixel-button dark"
              >
                ← 上一步
              </button>
              <button
                disabled={cursor >= events.length - 1}
                onClick={() => setCursor(cursor + 1)}
                className="pixel-button coral"
              >
                下一步 →
              </button>
            </div>
            <div className="mt-7 border-t-2 border-dashed border-slate-300 pt-5">
              <b>{analyzeStyle(game).title}</b>
              {analyzeStyle(game)
                .advice.slice(0, 2)
                .map((a) => (
                  <p className="mt-2 text-xs text-slate-600" key={a}>
                    • {a}
                  </p>
                ))}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function Rulebook({
  close,
  copy,
}: {
  close: () => void;
  copy: OnboardingCopy;
}) {
  const closeRef = useRef<HTMLButtonElement>(null),
    r = copy.rules;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      keydown = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
        else if (e.key === "Tab") {
          e.preventDefault();
          closeRef.current?.focus();
        }
      };
    document.addEventListener("keydown", keydown);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) close();
      }}
    >
      <aside
        className="rule-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={r.dialogLabel}
      >
        <div className="sticky top-0 flex items-center justify-between border-b-4 border-[var(--ink)] bg-[var(--paper)] py-4">
          <div>
            <p className="eyebrow dark">RULEBOOK · V1.0</p>
            <h2 className="text-2xl font-black">{r.title}</h2>
          </div>
          <button
            ref={closeRef}
            aria-label={r.close}
            data-testid="close-rules"
            onClick={close}
            className="close-btn"
          >
            ×
          </button>
        </div>
        <p className="my-5 border-2 border-amber-400 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
          {r.notice}
        </p>
        {r.sections.map(([t, d]) => (
          <section className="rule-section" key={t}>
            <h3>{t}</h3>
            <p>{d}</p>
          </section>
        ))}
        <section className="rule-section">
          <h3>{r.etiquetteTitle}</h3>
          <p>{r.etiquette}</p>
        </section>
      </aside>
    </div>
  );
}
