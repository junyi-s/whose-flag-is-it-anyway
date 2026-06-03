import { v4 as uuidv4 } from 'uuid'
import {
  DEFAULT_GAME_SETTINGS,
  MAX_FLAGS_ASSIGNED_PER_TARGET,
  MAX_FLAGS_PER_PLAYER,
  MAX_PLAYERS,
  type AvatarConfig,
  type Game,
  type GameSettings,
  type Player,
  type PlayerId,
  type RedFlag,
  type RedFlagId,
  type Round,
  type RoomCode,
} from '@whose-flag/shared'
import { LLM_ROOM_CALL_LIMIT, LLM_ROOM_COOLDOWN_MS } from '../config.js'

export class GameRoom {
  readonly game: Game

  // ─── Server-only state (never snapshotted) ────────────────────────────
  /** Per-player secrets used to authenticate room:rejoin. Never in game snapshot. */
  private rejoinSecrets = new Map<PlayerId, string>()
  private llmCallCount = 0
  private lastGeneratingAt = 0
  /** Auto-reveal timer; cleared on manual reveal or round advance to prevent stale fires. */
  private votingTimerHandle?: ReturnType<typeof setTimeout>
  private votingTimerRound = -1
  /** Deferred host migration (A.5); cancelled if the host reconnects within the grace window. */
  private hostMigrationTimer?: ReturnType<typeof setTimeout>

  constructor(code: RoomCode, hostName: string, hostAvatar: AvatarConfig, settings?: Partial<GameSettings>, spectator = false) {
    const hostId = uuidv4()
    const host: Player = {
      id: hostId,
      name: hostName,
      avatar: hostAvatar,
      isHost: true,
      isConnected: true,
      joinedAt: Date.now(),
      spectator,
    }

    this.game = {
      code,
      status: 'LOBBY',
      hostId,
      settings: { ...DEFAULT_GAME_SETTINGS, ...settings },
      players: { [hostId]: host },
      flags: {},
      rounds: [],
      currentRoundIndex: -1,
      scores: { [hostId]: 0 },
      createdAt: Date.now(),
    }
    this.rejoinSecrets.set(hostId, uuidv4())
  }

  get playerCount(): number {
    return Object.keys(this.game.players).length
  }

  isFull(): boolean {
    return this.playerCount >= MAX_PLAYERS
  }

  hasPlayer(playerId: PlayerId): boolean {
    return playerId in this.game.players
  }

  isNameTaken(name: string, excludeId?: PlayerId): boolean {
    return Object.values(this.game.players).some(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId,
    )
  }

  addPlayer(name: string, avatar: AvatarConfig, spectator = false): { player: Player; secret: string } {
    const player: Player = {
      id: uuidv4(),
      name,
      avatar,
      isHost: false,
      isConnected: true,
      joinedAt: Date.now(),
      spectator,
    }
    this.game.players[player.id] = player
    this.game.scores[player.id] = 0
    const secret = uuidv4()
    this.rejoinSecrets.set(player.id, secret)
    return { player, secret }
  }

  getSecret(playerId: PlayerId): string | undefined {
    return this.rejoinSecrets.get(playerId)
  }

  verifySecret(playerId: PlayerId, secret: string): boolean {
    const stored = this.rejoinSecrets.get(playerId)
    return stored !== undefined && stored === secret
  }

  setConnected(playerId: PlayerId, connected: boolean): void {
    const player = this.game.players[playerId]
    if (player) player.isConnected = connected
  }

  updateSettings(settings: Partial<GameSettings>): void {
    Object.assign(this.game.settings, settings)
  }

  /** Remove a player entirely (LOBBY/SUBMITTING leave): frees slot, name, secret, and their flags. */
  removePlayer(playerId: PlayerId): void {
    delete this.game.players[playerId]
    delete this.game.scores[playerId]
    this.rejoinSecrets.delete(playerId)
    // Drop any flags this player authored — self-flags and call-outs they planted —
    // so no phantom subject/author ends up in the built rounds.
    for (const [id, flag] of Object.entries(this.game.flags)) {
      if (flag.authorId === playerId || flag.subjectId === playerId) {
        delete this.game.flags[id]
      }
    }
  }

  scheduleHostMigration(handle: ReturnType<typeof setTimeout>): void {
    this.cancelHostMigration()
    this.hostMigrationTimer = handle
  }

  cancelHostMigration(): void {
    if (this.hostMigrationTimer !== undefined) {
      clearTimeout(this.hostMigrationTimer)
      this.hostMigrationTimer = undefined
    }
  }

  transferHost(newHostId: PlayerId): void {
    const current = this.game.players[this.game.hostId]
    if (current) current.isHost = false
    const next = this.game.players[newHostId]
    if (next) {
      next.isHost = true
      this.game.hostId = newHostId
    }
  }

  selfFlagsForPlayer(playerId: PlayerId): RedFlag[] {
    return Object.values(this.game.flags).filter(
      (f) => f.authorId === playerId && f.subjectId === playerId,
    )
  }

  assignedFlagsByAuthorForSubject(authorId: PlayerId, subjectId: PlayerId): RedFlag[] {
    return Object.values(this.game.flags).filter(
      (f) => f.authorId === authorId && f.subjectId === subjectId,
    )
  }

  addSelfFlags(playerId: PlayerId, flags: RedFlag[]): number {
    // Replace only this player's self-flags (authorId === subjectId === playerId)
    for (const [id, flag] of Object.entries(this.game.flags)) {
      if (flag.authorId === playerId && flag.subjectId === playerId) {
        delete this.game.flags[id]
      }
    }
    const toAdd = flags.slice(0, MAX_FLAGS_PER_PLAYER)
    for (const flag of toAdd) {
      this.game.flags[flag.id] = flag
    }
    return toAdd.length
  }

  addAssignedFlags(authorId: PlayerId, subjectId: PlayerId, flags: RedFlag[]): number {
    // Replace only flags this author previously assigned to this subject
    for (const [id, flag] of Object.entries(this.game.flags)) {
      if (flag.authorId === authorId && flag.subjectId === subjectId) {
        delete this.game.flags[id]
      }
    }
    const toAdd = flags.slice(0, MAX_FLAGS_ASSIGNED_PER_TARGET)
    for (const flag of toAdd) {
      this.game.flags[flag.id] = flag
    }
    return toAdd.length
  }

  selfFlagCount(playerId: PlayerId): number {
    return this.selfFlagsForPlayer(playerId).length
  }

  allPlayersHaveMinFlags(): boolean {
    const min = this.game.settings.minFlagsPerPlayer
    return Object.keys(this.game.players).every(
      (pid) => this.selfFlagCount(pid) >= min,
    )
  }

  setRounds(rounds: Round[]): void {
    this.game.rounds = rounds
    this.game.currentRoundIndex = -1
  }

  applyScoreDeltas(deltas: Record<PlayerId, number>): void {
    for (const [pid, delta] of Object.entries(deltas)) {
      this.game.scores[pid] = (this.game.scores[pid] ?? 0) + delta
    }
  }

  resetForPlayAgain(): void {
    this.game.status = 'SUBMITTING'
    this.game.flags = {}
    this.game.rounds = []
    this.game.currentRoundIndex = -1
    for (const pid of Object.keys(this.game.scores)) {
      this.game.scores[pid] = 0
    }
  }

  flagById(flagId: RedFlagId): RedFlag | undefined {
    return this.game.flags[flagId]
  }

  setVotingTimer(handle: ReturnType<typeof setTimeout>, roundIndex: number): void {
    this.clearVotingTimer()
    this.votingTimerHandle = handle
    this.votingTimerRound = roundIndex
  }

  clearVotingTimer(): void {
    if (this.votingTimerHandle !== undefined) {
      clearTimeout(this.votingTimerHandle)
      this.votingTimerHandle = undefined
      this.votingTimerRound = -1
    }
  }

  get activeVotingRound(): number { return this.votingTimerRound }

  snapshot(): Game {
    return JSON.parse(JSON.stringify(this.game)) as Game
  }

  // ─── LLM abuse guards ─────────────────────────────────────────────────

  /** Returns allowed:true if this room may make another LLM call right now. */
  canUseLlm(): { allowed: true } | { allowed: false; reason: string } {
    if (this.llmCallCount >= LLM_ROOM_CALL_LIMIT) {
      return { allowed: false, reason: `room_cap (${this.llmCallCount}/${LLM_ROOM_CALL_LIMIT})` }
    }
    const cooldownRemaining = this.lastGeneratingAt + LLM_ROOM_COOLDOWN_MS - Date.now()
    if (cooldownRemaining > 0) {
      return { allowed: false, reason: `cooldown (${Math.ceil(cooldownRemaining / 1000)}s left)` }
    }
    return { allowed: true }
  }

  /** Call immediately before starting a GENERATING transition. */
  recordLlmCall(): void {
    this.llmCallCount++
    this.lastGeneratingAt = Date.now()
  }

  get llmCalls(): number { return this.llmCallCount }
}
