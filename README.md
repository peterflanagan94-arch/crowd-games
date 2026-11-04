# Crowd QR Games

Party games a DJ runs from the big screen while guests play on their phones. It works for pub quizzes, parties, club nights and events, and has an optional **wedding mode**. Nobody installs an app: guests scan the QR code and type a nickname.

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
- **My music:** hosts drag their songs or a folder in once. They're saved in that browser (IndexedDB) on that computer, never uploaded, and ready for every game: add single songs, all, or a random mix.
- **Playlist ideas:** 12 themed title lists (floor-fillers, 80s to 2020s, pub singalongs, disco & Motown, dance, rock, Disney & musicals, Christmas), about 330 songs, marked ♪ where the host has the song in My music. Edit `music-library.js` to add lists.

**Games**
- **Quiz:** timed multiple choice. You get 500 points for a right answer plus up to 500 for speed, and a leaderboard shows after each question. There are 650 built-in questions, 50 in each of 13 categories: General Knowledge, Disney, Films, Music, Pop Culture, History, Geography, TV, Sport, Food & Drink, Animals, 80s & 90s Throwback and Christmas. Pick one or more, or choose **All categories** for a mixed round. Answer order is shuffled every time, and you can edit questions or write your own.
- **Emoji guess:** the big screen shows a few emojis and guests pick what they spell out from four choices. There are 550 built-in puzzles, 50 in each of 11 categories: Disney & Pixar, Films, TV Shows, Musicals, Pop Hits, 80s Songs, 90s Songs, 2000s Songs, Christmas Songs, Christmas Films and Phrases & Sayings. Songs show the artist after the reveal. Scoring works like the quiz, and you can edit the puzzles or add your own as `emojis | answer | note`.
- **Bingo:** classic 75-number bingo. Every phone gets its own card. Tap numbers to mark them and hit BINGO!, and the server checks the claim against the calls.
- **Music bingo:** each card gets song titles (4x4 for 16 or more songs, 5x5 for 24 or more). Build the list by adding your own music files (titles come from the tags or file names), importing a Spotify or Apple Music playlist link, importing a CSV (e.g. from Exportify), M3U or TXT file, or pasting one song per line. With music files loaded, the host screen plays a chorus clip or the full song each time a song is called, and auto-call keeps going by itself until someone claims bingo. The files play from the host computer and are never uploaded. Without files, tap songs in the DJ panel as you play them from your decks. You can hide titles on the big screen so the crowd has to recognise each song by ear.

- **Higher or lower:** play with a freshly shuffled **deck of cards** (the default) or your own list of numbers. In card mode, aces can be set to *high or low* (an Ace counts whichever way helps the guest), *always high* or *always low*, and a pair scores nothing. Scoring works the same as the quiz.
- **Crowd vote:** a live poll on the big screen, for things like "What should I play next?". Guests can change their vote until you close it.

- **Volunteer draw:** made for between courses or between sets. Announce a challenge (hula hoop-off, fancy-dress karaoke, dance-off…). Guests who want to take part tap "I'm in!", then the DJ draws people at random with a drumroll on screen, and picked guests' phones buzz. It skips people already picked tonight so everyone gets a turn, lets you pick one more if someone's missing, and can hand over to a crowd vote for the winner.

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

Runs on Render as the `crowd-qr-games` web service (see `render.yaml`). Open `/host` on the big screen.

Every push to `main` redeploys automatically. On the free plan the service sleeps after 15 minutes idle, so open the host page a few minutes before your set to wake it up. A paid instance (about $7 a month) stays awake.

You can use any other Node host that supports WebSockets, such as Railway or Fly.io, with `npm start`. The server listens on `PORT`.

Set `HOST_PASSWORD` to make hosting private: `/host` and the question packs then need a login at `/login`, while guests still join with just the room code. The DJ phone remote link logs that phone in automatically. `/logout` signs out.

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
