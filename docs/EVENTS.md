# Socket.IO Event Contract

All events are scoped to a Socket.IO room: `machine:{machineId}`

---

## Phone → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_game` | `{ machineId, name }` | Player enters name and joins |
| `submit_answer` | `{ value }` | Player submits input (quiz: option index 0-3) |
| `reconnect_player` | `{ machineId, playerId }` | Player reconnects mid-game |

---

## Screen → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `screen_connect` | `{ machineId }` | Laptop screen registers itself |
| `screen_reconnect` | `{ machineId }` | Screen reconnects after refresh |

---

## Server → Phone

| Event | Payload | Description |
|-------|---------|-------------|
| `joined_queue` | `{ position, playerId }` | Confirmed in queue at position N |
| `queue_updated` | `{ position }` | Queue moved, new position |
| `your_turn` | `{ countdown: 3 }` | It's your turn, countdown begins |
| `game_started` | `{ gameType, playerName }` | Game begins |
| `question` | `{ state }` | Full game state (see State Shape) |
| `answer_result` | `{ correct, correctValue, points, state }` | Result of submitted answer |
| `timer_tick` | `{ timeLeft }` | Every second from server |
| `timer_expired` | `{}` | Time ran out, auto-wrong |
| `game_finished` | `{ state, leaderboard }` | Game over |
| `reconnect_ok` | `{ state }` | Restored state after reconnect |
| `error` | `{ message }` | Rejected join / bad input |
| `maintenance` | `{ message }` | Server in maintenance mode |

---

## Server → Screen

| Event | Payload | Description |
|-------|---------|-------------|
| `screen_state` | `{ machine }` | Full machine state on connect/reconnect |
| `queue_updated` | `{ queue }` | Queue changed (join/leave/finish) |
| `game_started` | `{ playerName, gameType }` | New game began |
| `question_changed` | `{ state }` | New question or game state |
| `answer_feedback` | `{ correct, correctValue, playerName, score }` | Show highlight before next question |
| `timer_tick` | `{ timeLeft }` | Countdown to show on screen |
| `game_finished` | `{ playerName, score, leaderboard }` | Game over, show results |
| `next_player_soon` | `{ countdown: 3 }` | Next player starting in N seconds |
| `screen_waiting` | `{}` | No players, show QR code |
| `maintenance` | `{ message }` | Show maintenance message |

---

## Standard State Shape

Every `question` and `reconnect_ok` event carries this shape:

```json
{
  "playerName": "Rahul",
  "score": 40,
  "timeLeft": 18,
  "progress": 3,
  "total": 5,
  "gameType": "quiz",
  "payload": {
    "question": "Which bin is for dry recyclables?",
    "options": ["Green", "Blue", "Red", "Black"]
  }
}
```

`payload` is game-specific. Everything above `payload` is always present regardless of game type.

---

## Machine State Shape (Server internal)

```json
{
  "machineId": "machine1",
  "status": "WAITING | PLAYING | SHOWING_RESULT | FINISHED | MAINTENANCE",
  "currentGame": null,
  "currentPlayer": { "id": "socket.id", "name": "Rahul" },
  "queue": [{ "id": "socket.id", "name": "Priya" }],
  "leaderboard": [{ "name": "Rahul", "score": 80 }],
  "timer": null
}
```

---

## Machine Status States

```
WAITING
  │
  ▼ (player joins)
PLAYING
  │
  ▼ (answer submitted or timer expires)
SHOWING_RESULT
  │
  ▼ (delay ends)
PLAYING  ──── (if questions remain)
  │
  ▼ (all questions done)
FINISHED
  │
  ▼ (next player or empty queue)
WAITING
```
