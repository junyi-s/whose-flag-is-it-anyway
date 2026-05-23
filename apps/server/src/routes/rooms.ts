import { Router } from 'express'
import { roomManager } from '../game/roomManager.js'

const router = Router()

router.get('/api/rooms/:code/exists', (req, res) => {
  const code = req.params['code']?.toUpperCase() ?? ''
  res.json({ exists: roomManager.has(code) })
})

export default router
