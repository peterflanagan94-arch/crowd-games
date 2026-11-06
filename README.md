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
- **YouTube music videos:** playlist-ideas songs link to their official YouTube video, and any song can take your own link ("Artist - Title | https://youtu.be/…"). When a song is called the video plays as a clip or in full, either in a pop-out player window on the DJ's own screen (so the crowd never sees the title) or on the big screen. The YouTube player is never covered or hidden, as YouTube's rules require. Your own music files are used first when you have them.

**Games**
- **Quiz:** timed multiple choice. You get 500 points for a right answer plus up to 500 for speed, and a leaderboard shows after each question. There are 650 built-in questions, 50 in each of 13 categories: General Knowledge, Disney, Films, Music, Pop Culture, History, Geography, TV, Sport, Food & Drink, Animals, 80s & 90s Throwback and Christmas. Pick one or more, or choose **All categories** for a mixed round. Answer order is shuffled every time, and you can edit questions or write your own.
- **Emoji guess:** the big screen shows a few emojis and guests pick what they spell out from four choices. There are 550 built-in puzzles, 50 in each of 11 categories: Disney & Pixar, Films, TV Shows, Musicals, Pop Hits, 80s Songs, 90s Songs, 2000s Songs, Christmas Songs, Christmas Films and Phrases & Sayings. Songs show the artist after the reveal. Scoring works like the quiz, and you can edit the puzzles or add your own as `emojis | answer | note`.
- **Bingo:** classic 75-number bingo. Every phone gets its own card. Tap numbers to mark them and hit BINGO!, and the server checks the claim against the calls.
- **Music bingo:** each card gets song titles (4x4 for 16 or more songs, 5x5 for 24 or more). Build the list by adding your own music files (titles come from the tags or file names), importing a Spotify or Apple Music playlist link, importing a CSV (e.g. from Exportify), M3U or TXT file, or pasting one song per line. With music files loaded, the host screen plays a chorus clip or the full song each time a song is called, and auto-call keeps going by itself until someone claims bingo. The files play from the host computer and are never uploaded. Without files, tap songs in the DJ panel as you play them from your decks. You can hide titles on the big screen so the crowd has to recognise each song by ear.

- **Higher or lower:** play with a freshly shuffled **deck of cards** (the default) or your own list of numbers. In card mode, aces can be set to *high or low* (an Ace counts whichever way helps the guest), *always high* or *always low*, and a pair scores nothing. Scoring works the same as the quiz.
- **Crowd vote:** a live poll on the big screen, for things like "What should I play next?". Guests can change their vote until you close it.

- **Volunteer draw:** made for between courses or between sets. Announce a challenge (hula hoop-off, fancy-dress karaoke, dance-off…). Guests who want to take part tap "I'm in!", then the DJ draws people at random with a drumroll on screen, and picked guests' phones buzz. It skips people already picked tonight so everyone gets a turn, lets you pick one more if someone's missing, and can hand over to a crowd vote for the winner.
- **Raffle & wheel:** a big spinning wheel with tick sounds. *Prize raffle*: every guest gets a ticket number on their phone (everyone who joined, or only those who tap Enter), prizes are drawn in order, winners' phones buzz, and "Winner not here? Redraw" spins again for the same prize. *Own list*: put forfeits, dares, drinks or anything on the wheel and spin as often as you like.
- **Karaoke:** guests sign up on their phones (search 117 popular karaoke songs in `karaoke-songs.js`, or type their own, with an optional duet partner). The DJ reorders the queue, adds walk-ups, and presses space for the next singer; phones buzz when they're up next and on. Each song can have a YouTube lyrics video that plays on the big screen ("Find video" opens a YouTube search; paste the link). When a link is added the server asks YouTube (oEmbed) whether the video may play on other sites and flags it if not; Sing King, for example, switches embedding off on its karaoke videos. Songs listed in `karaoke-youtube.json` link automatically (check candidates with `tools/karaoke-verify.js`, `KARAOKE_VERIFY=1`).
- **Logo & brand colour** (Event tab): your logo shows on the welcome screen, the wheel's centre and guests' phones; the brand colour replaces the theme's accent. Both are remembered in the host's browser for the next event.

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

## Desktop app (offline play)

The same games as the website, as a Mac and Windows app for gigs with no internet. The app runs the game server on the DJ's laptop; guests scan the QR code and join over the local Wi-Fi.

- **Sign in once online** with a Crowd QR Games account. The app gets an offline pass that lasts until the account's access ends, and at most 30 days, and renews itself whenever the laptop is online. Signing out, changing the password or the access ending stops renewal.
- **Wi-Fi:** the laptop and guests' phones must be on the same network. Venue Wi-Fi often keeps devices apart, so a small travel router is the most reliable setup; a phone hotspot works for small groups (most allow about 10 devices). The first time the app opens, allow it through the Mac or Windows firewall so phones can connect.
- **Needs internet:** YouTube videos (music and karaoke) and Spotify/Apple Music playlist links. Every game, your own music files and playlist files work offline. The DJ controls show a note when there's no internet or no Wi-Fi.
- **Only the laptop can host:** guests on the same Wi-Fi can't open the host screen; the DJ phone remote link still works.

Run it from source with `npm install` then `npm run desktop`. Installers are built by the **Desktop app** GitHub Action: run it from the Actions tab, or push a `desktop-v1.2.3` tag to publish a release. Without signing certificates the installers are unsigned (see the workflow file for the secrets to add).

The website needs `DESKTOP_LICENCE_KEY` set to the Ed25519 private key (PEM) that matches the public key in `licence.js`; the app signs in at `/desktop/signin`. Keep that key secret: anyone with it could make passes. The app talks to `https://crowd-qr-games.onrender.com` unless built with `CROWD_QR_URL` set.

## Accounts and payments

Hosts sign up at `/signup` and confirm their email, which starts a one-off 7-day free trial (one per email address: case, `+tags` and Gmail dots count as the same address). After that, `/account` offers the £9.99 event pass (24 hours), £12.99 a month or £129 a year through Stripe Checkout. Guests never need an account. The DJ phone remote link still works without logging in, for that room only.

Accounts switch on when `DATABASE_URL` is set (Render Postgres). Without it the app keeps the `HOST_PASSWORD` lock below. Set these on the web service:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Any Postgres: Render Postgres (internal URL) or Supabase (its Session pooler connection string). Tables are created on start in their own `crowdqr` schema, so a database shared with another app is safe. |
| `DB_SCHEMA` | Optional, default `crowdqr`. |
| `DESKTOP_LICENCE_KEY` | Ed25519 private key (PEM, `\\n` escapes are fine) that signs the desktop app's offline passes. |
| `SESSION_SECRET` | Long random string that signs logins and email links. Changing it logs everyone out. |
| `STRIPE_SECRET_KEY` | `sk_test_...` for testing, `sk_live_...` for real payments. Without it the plan buttons say "coming soon". |
| `STRIPE_WEBHOOK_SECRET` | From a Stripe webhook to `https://<your domain>/billing/webhook` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sends confirmation and password reset emails through Resend (verify the sending domain there). Without a key the emails are only printed to the server log. |
| `ADMIN_EMAILS` | Comma separated emails with free full access. |
| `STRIPE_PRICE_PASS`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | Optional Stripe price ids. Without them the prices in `accounts.js` are used. |
| `TRIAL_DAYS` | Optional, default 7. |
| `SIGNUPS` | Set to `closed` before launch: only `ADMIN_EMAILS` can sign up and the home page still says "Coming soon". |

For "Manage subscription", save the customer portal settings once in the Stripe dashboard (Settings, Billing, Customer portal). Run locally with `ACCOUNTS=memory npm start` to try accounts without a database; emails are printed to the terminal.

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

The tests run a quiz, number bingo and music bingo end to end over real sockets, then sign-up, the free trial, login, password reset and Stripe webhooks.
