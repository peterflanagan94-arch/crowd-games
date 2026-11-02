# Crowd Games

Party games a DJ runs from the big screen while the crowd plays on their phones. Nobody installs an app: they scan the QR code and type a nickname.

**Games**
- **Quiz:** timed multiple choice. You get 500 points for a right answer plus up to 500 for speed, and a leaderboard shows after every question. Paste your own questions or use the starter set.
- **Bingo:** classic 75-number bingo. Every phone gets its own card. Tap numbers to mark them and hit BINGO!, and the server checks the claim against the calls.
- **Music bingo:** paste a playlist and each card gets song titles (4x4 for 16 or more songs, 5x5 for 24 or more). Tap songs in the DJ panel as you play them. You can hide titles on the big screen so the crowd has to recognise each song by ear.

Winning patterns: one line, two lines or full house. You can change the pattern mid-game, for example going from line to full house.

## Run it locally

```bash
npm install
npm start          # http://localhost:3000
```

Open `http://localhost:3000/host` on the screen or projector. Phones on the same Wi-Fi can scan the QR code, because the server swaps `localhost` for your LAN IP automatically.

DJ shortcuts on the host screen:
- `Space` or `→` moves the quiz on or calls the next number
- `C` shows or hides the controls
- `F` goes fullscreen
- **📱 Phone remote** gives you a private QR code, so you can run the game from your own phone while the screen shows only the game

## Deploy

You need any Node host that supports WebSockets. Two options:
- **Render:** connect the repo. `render.yaml` sets up a free web service.
- **Railway or Fly.io:** use `npm start`. The server listens on `PORT`.

Set `PUBLIC_URL` (for example `https://games.example.com`) if the QR code should point to a different domain than the one the host page was loaded from.

Game state lives in memory. Restarting the server ends any running rooms, which is fine for a night's gigs. Rooms expire after 12 hours idle.

## Quiz format

```
Which decade did disco peak in?
1960s
*1970s
1990s
2000s

Next question…
```

Put `*` in front of the correct answer. Each question can have two to four answers.

## Tests

```bash
npm test
```

The tests run a quiz, number bingo and music bingo end to end over real sockets.
