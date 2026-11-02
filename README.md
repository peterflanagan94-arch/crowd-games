# Crowd QR Games

Party games a DJ runs from the big screen while guests play on their phones. It's built first for **weddings** and works just as well in pubs, bars and at parties. Nobody installs an app: guests scan the QR code and type a nickname.

## Event modes

Pick the event in the **Event** tab on the host screen:
- **Wedding:** an elegant gold and blush theme with serif headings, and the couple's names on the welcome screen and phones. It also unlocks the wedding packs listed below.
- **Party / club** or **Pub / bar:** the neon club theme, with an optional title such as "Friday Quiz at The Crown".

Wedding packs:
- **💍 Mr & Mrs:** the couple answer each "Who's more…?" question in secret, either on their own phones using private QR codes or with the DJ tapping in their answers (for example when they hold up shoes). Guests vote on what they think the couple said. Press reveal once to show the couple's answers, then again to show the crowd's votes. Guests score when they match the couple, but only when the couple agree. It comes with 14 classic questions.
- **How well do you know the couple?:** a quiz template with the couple's names filled in. Edit the answers with the couple before the day.
- **Wedding trivia:** 10 ready-to-go questions.
- **Who's most likely to…?:** a quick-fire series of votes where guests choose between the two partners.
- **Couple higher or lower:** a template for numbers such as years together or guests at the wedding.
- **30 classic floor-fillers:** a ready-made music bingo playlist. It's available in every mode.

**Games**
- **Quiz:** timed multiple choice. You get 500 points for a right answer plus up to 500 for speed, and a leaderboard shows after every question. Paste your own questions or use the starter set.
- **Bingo:** classic 75-number bingo. Every phone gets its own card. Tap numbers to mark them and hit BINGO!, and the server checks the claim against the calls.
- **Music bingo:** paste a playlist and each card gets song titles (4x4 for 16 or more songs, 5x5 for 24 or more). Tap songs in the DJ panel as you play them. You can hide titles on the big screen so the crowd has to recognise each song by ear.

- **Higher or lower:** play with a freshly shuffled **deck of cards** (the default) or your own list of numbers. In card mode, aces can be set to *high or low* (an Ace counts whichever way helps the guest), *always high* or *always low*, and a pair scores nothing. Scoring works the same as the quiz.
- **Crowd vote:** a live poll on the big screen, for things like "What should I play next?". Guests can change their vote until you close it.

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
