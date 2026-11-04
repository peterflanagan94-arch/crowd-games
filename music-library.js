// Shared music bingo library: themed playlists of song titles (no audio).
// Hosts add single songs, whole playlists, or random picks to their game.
// To add a playlist, add an entry here: { id, name, emoji, songs: ['Artist - Title', ...] }.
const { WEDDING } = require('./quiz-sample');

const PLAYLISTS = [
  { id: 'floor', name: 'Floor-fillers', emoji: '🎉', songs: WEDDING.floorFillers },
  {
    id: '80s', name: '80s', emoji: '📼', songs: [
      'Michael Jackson - Billie Jean', 'a-ha - Take On Me', 'Madonna - Like a Prayer', 'Cyndi Lauper - Girls Just Want to Have Fun',
      'Whitney Houston - I Wanna Dance with Somebody', "Bon Jovi - Livin' on a Prayer", 'Wham! - Wake Me Up Before You Go-Go',
      'Dexys Midnight Runners - Come On Eileen', 'Tears for Fears - Everybody Wants to Rule the World', 'Duran Duran - Hungry Like the Wolf',
      'Survivor - Eye of the Tiger', 'Europe - The Final Countdown', 'Toto - Africa', 'Kim Wilde - Kids in America', 'Soft Cell - Tainted Love',
      'Prince - Purple Rain', 'Spandau Ballet - Gold', 'Rick Astley - Never Gonna Give You Up', 'Kylie Minogue - I Should Be So Lucky',
      'Bananarama - Venus', "Simple Minds - Don't You (Forget About Me)", "The Human League - Don't You Want Me", 'Culture Club - Karma Chameleon',
      'Bonnie Tyler - Total Eclipse of the Heart', 'Billy Idol - White Wedding', 'Queen - Another One Bites the Dust',
      'Belinda Carlisle - Heaven Is a Place on Earth', 'Phil Collins - In the Air Tonight', 'The Bangles - Walk Like an Egyptian',
      'Kenny Loggins - Footloose', 'Irene Cara - Flashdance... What a Feeling',
    ],
  },
  {
    id: '90s', name: '90s', emoji: '💿', songs: [
      'Spice Girls - Wannabe', "Backstreet Boys - Everybody (Backstreet's Back)", 'Britney Spears - ...Baby One More Time', 'Oasis - Wonderwall',
      'Blur - Song 2', 'Nirvana - Smells Like Teen Spirit', 'Haddaway - What Is Love', 'Vengaboys - Boom, Boom, Boom, Boom!!', 'Los del Río - Macarena',
      'Aqua - Barbie Girl', 'TLC - No Scrubs', "Destiny's Child - Say My Name", "Ricky Martin - Livin' la Vida Loca", 'Lou Bega - Mambo No. 5',
      'Whigfield - Saturday Night', 'Robbie Williams - Angels', 'Take That - Back for Good', 'Alanis Morissette - Ironic', 'Fatboy Slim - Praise You',
      'The Verve - Bitter Sweet Symphony', 'Pulp - Common People', 'Chumbawamba - Tubthumping', 'Cher - Believe', 'Eiffel 65 - Blue (Da Ba Dee)',
      "Will Smith - Gettin' Jiggy wit It", "No Doubt - Don't Speak", 'All Saints - Never Ever', "B*Witched - C'est la Vie", 'Steps - 5,6,7,8',
      'Celine Dion - My Heart Will Go On', '2 Unlimited - No Limit',
    ],
  },
  {
    id: '00s', name: '2000s', emoji: '📱', songs: [
      'Beyoncé ft. Jay-Z - Crazy in Love', 'OutKast - Hey Ya!', 'The Killers - Mr. Brightside', "Kylie Minogue - Can't Get You Out of My Head",
      'Rihanna ft. Jay-Z - Umbrella', 'Lady Gaga - Just Dance', 'The Black Eyed Peas - I Gotta Feeling', 'Kelly Clarkson - Since U Been Gone',
      'Gnarls Barkley - Crazy', 'Amy Winehouse - Rehab', 'Arctic Monkeys - I Bet You Look Good on the Dancefloor', 'Franz Ferdinand - Take Me Out',
      'Kings of Leon - Sex on Fire', 'Coldplay - Viva la Vida', 'Britney Spears - Toxic', "Shakira - Hips Don't Lie", 'Nelly Furtado - Maneater',
      'Justin Timberlake - SexyBack', 'Usher ft. Lil Jon & Ludacris - Yeah!', 'Eminem - Without Me', 'Sugababes - Push the Button',
      'Girls Aloud - Sound of the Underground', 'Mika - Grace Kelly', "Scissor Sisters - I Don't Feel Like Dancin'", 'Duffy - Mercy',
      'Leona Lewis - Bleeding Love', 'Snow Patrol - Chasing Cars', 'Avril Lavigne - Complicated', 'P!nk - Get the Party Started',
      'Calvin Harris - Acceptable in the 80s', 'Sean Paul - Get Busy',
    ],
  },
  {
    id: '10s', name: '2010s', emoji: '🎧', songs: [
      'Mark Ronson ft. Bruno Mars - Uptown Funk', 'Pharrell Williams - Happy', 'Daft Punk ft. Pharrell Williams - Get Lucky', 'Avicii - Wake Me Up',
      'Ed Sheeran - Shape of You', 'Adele - Rolling in the Deep', 'Carly Rae Jepsen - Call Me Maybe', 'Taylor Swift - Shake It Off',
      "Justin Timberlake - Can't Stop the Feeling!", 'Katy Perry - Firework', 'Rihanna ft. Calvin Harris - We Found Love', 'LMFAO - Party Rock Anthem',
      'Gotye ft. Kimbra - Somebody That I Used to Know', 'Psy - Gangnam Style', 'Calvin Harris - Summer', 'Clean Bandit ft. Jess Glynne - Rather Be',
      'Sia - Chandelier', 'Bruno Mars - Locked Out of Heaven', 'Dua Lipa - New Rules', 'Luis Fonsi ft. Daddy Yankee - Despacito',
      'Major Lazer & DJ Snake ft. MØ - Lean On', 'Little Mix - Shout Out to My Ex', 'One Direction - What Makes You Beautiful',
      'Macklemore & Ryan Lewis ft. Wanz - Thrift Shop', 'Meghan Trainor - All About That Bass', 'Avicii - Levels',
      "Swedish House Mafia ft. John Martin - Don't You Worry Child", 'Ellie Goulding - Burn', 'Lewis Capaldi - Someone You Loved',
      "Rag'n'Bone Man - Human", 'George Ezra - Shotgun',
    ],
  },
  {
    id: '20s', name: '2020s', emoji: '✨', songs: [
      'The Weeknd - Blinding Lights', 'Dua Lipa - Levitating', 'Harry Styles - As It Was', 'Harry Styles - Watermelon Sugar',
      'Olivia Rodrigo - drivers license', 'Miley Cyrus - Flowers', 'Lizzo - About Damn Time', 'Doja Cat - Say So', 'Ed Sheeran - Bad Habits',
      'Glass Animals - Heat Waves', 'Lil Nas X - Montero (Call Me by Your Name)', 'Elton John & Dua Lipa - Cold Heart', 'Sabrina Carpenter - Espresso',
      'Taylor Swift - Anti-Hero', 'Beyoncé - Break My Soul', 'Calvin Harris & Ellie Goulding - Miracle', 'Tate McRae - Greedy',
      'Chappell Roan - Good Luck, Babe!', 'Benson Boone - Beautiful Things', 'Billie Eilish - Birds of a Feather', 'Lady Gaga & Bruno Mars - Die with a Smile',
      'Shaboozey - A Bar Song (Tipsy)', 'Teddy Swims - Lose Control', 'Noah Kahan - Stick Season', 'Dua Lipa - Houdini', "Måneskin - Beggin'",
      'Becky Hill & David Guetta - Remember', 'Joel Corry ft. MNEK - Head & Heart', 'Charli XCX - 360',
    ],
  },
  {
    id: 'pub', name: 'Pub singalongs', emoji: '🍻', songs: [
      'Neil Diamond - Sweet Caroline', "The Proclaimers - I'm Gonna Be (500 Miles)", "Oasis - Don't Look Back in Anger", 'Oasis - Wonderwall',
      'Queen - Bohemian Rhapsody', "Bon Jovi - Livin' on a Prayer", "Journey - Don't Stop Believin'", 'The Killers - Mr. Brightside',
      'Dexys Midnight Runners - Come On Eileen', 'Robbie Williams - Angels', 'Toto - Africa', 'Kings of Leon - Sex on Fire',
      'Chesney Hawkes - The One and Only', 'Billy Joel - Piano Man', 'Elton John - Tiny Dancer', 'The Undertones - Teenage Kicks',
      'Madness - Our House', 'Wheatus - Teenage Dirtbag', "Bryan Adams - Summer of '69", 'Bonnie Tyler - Total Eclipse of the Heart',
      'ABBA - Waterloo', 'The Beatles - Hey Jude', 'Elvis Presley - Suspicious Minds', 'Tom Jones - Delilah', 'Fleetwood Mac - Go Your Own Way',
      'The Darkness - I Believe in a Thing Called Love', 'Kaiser Chiefs - I Predict a Riot', 'Busted - Year 3000', 'Natasha Bedingfield - Unwritten',
      'Mumford & Sons - Little Lion Man',
    ],
  },
  {
    id: 'disco', name: 'Disco & Motown', emoji: '🪩', songs: [
      'Gloria Gaynor - I Will Survive', "Bee Gees - Stayin' Alive", 'Donna Summer - Hot Stuff', 'Chic - Le Freak', 'Sister Sledge - We Are Family',
      'Earth, Wind & Fire - September', 'Boney M. - Rasputin', 'ABBA - Dancing Queen', 'Village People - Y.M.C.A.',
      "KC and the Sunshine Band - That's the Way (I Like It)", 'The Jacksons - Blame It on the Boogie', "Michael Jackson - Don't Stop 'til You Get Enough",
      'Diana Ross - Upside Down', "Marvin Gaye & Tammi Terrell - Ain't No Mountain High Enough", "The Supremes - You Can't Hurry Love",
      'Stevie Wonder - Superstition', 'Martha and the Vandellas - Dancing in the Street', "Four Tops - I Can't Help Myself (Sugar Pie Honey Bunch)",
      'The Temptations - My Girl', 'The Jackson 5 - I Want You Back', 'Marvin Gaye - I Heard It Through the Grapevine', 'Kool & the Gang - Celebration',
      'Lionel Richie - All Night Long', "The Weather Girls - It's Raining Men", 'Aretha Franklin - Respect', 'Wild Cherry - Play That Funky Music',
      'Hot Chocolate - You Sexy Thing', 'Rose Royce - Car Wash', 'Ottawan - D.I.S.C.O.',
    ],
  },
  {
    id: 'dance', name: 'Dance anthems', emoji: '🔊', songs: [
      'Darude - Sandstorm', 'Eric Prydz - Call on Me', 'Robin S - Show Me Love', 'Stardust - Music Sounds Better with You',
      "Spiller - Groovejet (If This Ain't Love)", 'Modjo - Lady (Hear Me Tonight)', 'Fedde Le Grand - Put Your Hands Up for Detroit',
      'David Guetta ft. Sia - Titanium', 'Calvin Harris - Feel So Close', 'Faithless - Insomnia', 'Alice Deejay - Better Off Alone',
      'ATB - 9 PM (Till I Come)', 'Sash! - Ecuador', 'Ultra Naté - Free', 'CeCe Peniston - Finally', 'Snap! - Rhythm Is a Dancer',
      'Corona - The Rhythm of the Night', 'Livin\' Joy - Dreamer', "Basement Jaxx - Where's Your Head At", "Groove Armada - Superstylin'",
      'Fatboy Slim - The Rockafeller Skank', "Armand Van Helden - You Don't Know Me", 'Daft Punk - One More Time', 'Chicane - Saltwater',
      'Gala - Freed from Desire', 'Benny Benassi - Satisfaction', 'Example - Changed the Way You Kiss Me', 'Disclosure ft. Sam Smith - Latch',
      'Avicii - Levels',
    ],
  },
  {
    id: 'rock', name: 'Rock anthems', emoji: '🎸', songs: [
      'Queen - We Will Rock You', 'AC/DC - Back in Black', "Guns N' Roses - Sweet Child o' Mine", "Bon Jovi - It's My Life", 'Survivor - Eye of the Tiger',
      'The White Stripes - Seven Nation Army', 'Foo Fighters - Everlong', 'Nirvana - Smells Like Teen Spirit', 'Red Hot Chili Peppers - Californication',
      'Green Day - Basket Case', 'Blink-182 - All the Small Things', 'Arctic Monkeys - Do I Wanna Know?', 'Linkin Park - In the End', 'Muse - Uprising',
      "The Rolling Stones - (I Can't Get No) Satisfaction", 'Led Zeppelin - Whole Lotta Love', 'Deep Purple - Smoke on the Water',
      'Thin Lizzy - The Boys Are Back in Town', 'Def Leppard - Pour Some Sugar on Me', "Joan Jett & the Blackhearts - I Love Rock 'n' Roll",
      "Status Quo - Rockin' All Over the World", "The Who - Baba O'Riley", "Kiss - I Was Made for Lovin' You", 'Van Halen - Jump',
      'Aerosmith - Walk This Way', "Fall Out Boy - Sugar, We're Goin Down", 'My Chemical Romance - Welcome to the Black Parade',
      'Stereophonics - Dakota', 'Kaiser Chiefs - Ruby', 'Kings of Leon - Sex on Fire',
    ],
  },
  {
    id: 'screen', name: 'Disney, films & musicals', emoji: '🎬', songs: [
      'Idina Menzel - Let It Go', 'Elton John - Can You Feel the Love Tonight', "Encanto Cast - We Don't Talk About Bruno", 'Keala Settle - This Is Me',
      'Hugh Jackman - The Greatest Show', 'Zac Efron & Zendaya - Rewrite the Stars', "Dwayne Johnson - You're Welcome", "Auli'i Cravalho - How Far I'll Go",
      'Samuel E. Wright - Under the Sea', 'Jodi Benson - Part of Your World', 'Robin Williams - Friend Like Me', 'Smash Mouth - All Star',
      "Randy Newman - You've Got a Friend in Me", "John Travolta & Olivia Newton-John - You're the One That I Want",
      'John Travolta & Olivia Newton-John - Summer Nights', 'The Rocky Horror Picture Show Cast - Time Warp', 'Idina Menzel - Defying Gravity',
      'Jason Donovan - Any Dream Will Do', "Bill Medley & Jennifer Warnes - (I've Had) The Time of My Life", 'Irene Cara - Fame',
      "Hairspray Cast - You Can't Stop the Beat", "Jason Weaver - I Just Can't Wait to Be King", 'Brad Kane & Lea Salonga - A Whole New World',
      'Angela Lansbury - Be Our Guest', 'Phil Harris - The Bare Necessities', 'Julie Andrews & Dick Van Dyke - Supercalifragilisticexpialidocious',
      'Kristen Bell - Do You Want to Build a Snowman?', "Phil Collins - You'll Be in My Heart", 'Lin-Manuel Miranda - My Shot',
    ],
  },
  {
    id: 'xmas', name: 'Christmas', emoji: '🎄', songs: [
      'Wham! - Last Christmas', 'Mariah Carey - All I Want for Christmas Is You', 'The Pogues ft. Kirsty MacColl - Fairytale of New York',
      'Slade - Merry Xmas Everybody', 'Wizzard - I Wish It Could Be Christmas Everyday', "Band Aid - Do They Know It's Christmas?",
      'Shakin\' Stevens - Merry Christmas Everyone', 'Brenda Lee - Rockin\' Around the Christmas Tree', 'Bobby Helms - Jingle Bell Rock',
      'Chris Rea - Driving Home for Christmas', "Michael Bublé - It's Beginning to Look a Lot Like Christmas", 'Elton John - Step into Christmas',
      'Mud - Lonely This Christmas', 'Jona Lewie - Stop the Cavalry', 'Paul McCartney - Wonderful Christmastime',
      'Darlene Love - Christmas (Baby Please Come Home)', 'Ariana Grande - Santa Tell Me', 'Justin Bieber - Mistletoe',
      'Kelly Clarkson - Underneath the Tree', "The Darkness - Christmas Time (Don't Let the Bells End)", 'Bing Crosby - White Christmas',
      'Dean Martin - Let It Snow! Let It Snow! Let It Snow!', "Andy Williams - It's the Most Wonderful Time of the Year",
      'John Lennon & Yoko Ono - Happy Xmas (War Is Over)', 'Greg Lake - I Believe in Father Christmas', 'East 17 - Stay Another Day',
      'Cliff Richard - Mistletoe and Wine', 'José Feliciano - Feliz Navidad', 'Sia - Snowman', 'Ed Sheeran & Elton John - Merry Christmas',
    ],
  },
];

module.exports = { PLAYLISTS: PLAYLISTS.map((p) => ({ ...p, songs: [...new Set(p.songs)] })) };
