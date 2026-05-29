import { Router } from 'express'
import { roomManager } from '../game/roomManager.js'
import { getLlmStats } from '../llm/questionGen.js'

const router = Router()

router.get('/health', (_req, res) => {
  const llm = getLlmStats()
  res.json({
    ok: true,
    rooms: roomManager.size(),
    llm: {
      activeCalls: llm.activeCalls,
      dailyCalls: llm.dailyCalls,
      dailyLimit: llm.dailyLimit,
      minuteBucketAvailable: llm.minuteBucketAvailable,
      minuteLimit: llm.minuteLimit,
    },
  })
})

export default router
