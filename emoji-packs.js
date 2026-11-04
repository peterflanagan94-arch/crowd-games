// Emoji guessing packs. Each puzzle: [emojis, answer, note shown after the reveal (optional)].
// Wrong answers are drawn from the other answers in the same category, so they stay plausible.
const EMOJI_CATEGORIES = [
  {
    id: 'disney', name: 'Disney & Pixar', emoji: '🏰',
    items: [
      ['🦁👑', 'The Lion King'],
      ['❄️👸⛄', 'Frozen'],
      ['🧜‍♀️🐠🦀', 'The Little Mermaid'],
      ['🌹🕯️⏰🫖', 'Beauty and the Beast'],
      ['🐠🔍🌊', 'Finding Nemo'],
      ['🤠🚀🧸', 'Toy Story'],
      ['👴🏠🎈', 'Up'],
      ['🐀👨‍🍳🇫🇷', 'Ratatouille'],
      ['🍎👸7️⃣', 'Snow White'],
      ['🐘👂✈️', 'Dumbo'],
      ['🧞‍♂️🪔🐒', 'Aladdin'],
      ['👠🎃🕛', 'Cinderella'],
      ['🌊⛵🐓🌺', 'Moana'],
      ['🤖🌱🌍', 'WALL-E'],
      ['👹🚪😱', 'Monsters, Inc.'],
      ['🚗⚡🏁', 'Cars'],
      ['😊😢😡🧠', 'Inside Out'],
      ['💀🎸🌼', 'Coco'],
      ['🦊🐰🚓', 'Zootropolis'],
      ['👱‍♀️🗼🏮', 'Tangled'],
      ['🐶⚫⚪💯', '101 Dalmatians'],
      ['🐻🍯🎈', 'Winnie the Pooh'],
      ['🧚✨🐊⏰', 'Peter Pan'],
      ['👦🐻🐯🌴', 'The Jungle Book'],
      ['🦸‍♂️👨‍👩‍👧‍👦🔥', 'The Incredibles'],
    ],
  },
  {
    id: 'films', name: 'Films', emoji: '🎬',
    items: [
      ['🦈🌊🏖️', 'Jaws'],
      ['🚢🧊💔', 'Titanic'],
      ['👽📞🏠', 'E.T.'],
      ['🦖🏝️🧬', 'Jurassic Park'],
      ['⚡👓🧙', 'Harry Potter'],
      ['💍🌋🧙‍♂️', 'The Lord of the Rings'],
      ['👻🚫📞', 'Ghostbusters'],
      ['🚗⚡⏰🔙', 'Back to the Future'],
      ['🥊🇺🇸🏃‍♂️', 'Rocky'],
      ['🍫🏭🎫', 'Charlie and the Chocolate Factory'],
      ['🏃‍♂️🍫🪶', 'Forrest Gump'],
      ['👠🌪️🦁🤖', 'The Wizard of Oz'],
      ['🦍🏙️✈️', 'King Kong'],
      ['👠👗😈', 'The Devil Wears Prada'],
      ['💃🕺🍉🏨', 'Dirty Dancing'],
      ['🥷🐢🍕', 'Teenage Mutant Ninja Turtles'],
      ['🎈🤡🌧️', 'It'],
      ['💊🕶️💻', 'The Matrix'],
      ['🏴‍☠️⚓💀', 'Pirates of the Caribbean'],
      ['🐝🎬', 'Bee Movie'],
      ['👰💒🤵🤵🤵', 'Four Weddings and a Funeral'],
      ['🥧🇺🇸', 'American Pie'],
    ],
  },
  {
    id: 'tv', name: 'TV Shows', emoji: '📺',
    items: [
      ['👑🏰🐉', 'Game of Thrones'],
      ['☕🛋️👫👬', 'Friends'],
      ['🧪🚐💰', 'Breaking Bad'],
      ['🍩👨‍👩‍👧‍👦💛', 'The Simpsons'],
      ['🔦🚲👾', 'Stranger Things'],
      ['👑🇬🇧', 'The Crown'],
      ['🦑💰🎮', 'Squid Game'],
      ['🧢✂️🥃', 'Peaky Blinders'],
      ['📏👮', 'Line of Duty'],
      ['🍰⛺🇬🇧', 'The Great British Bake Off'],
      ['🕺💃⭐', 'Strictly Come Dancing'],
      ['🏝️❤️☀️', 'Love Island'],
      ['🏢📄🖨️', 'The Office'],
      ['⏰📞🟦', 'Doctor Who'],
      ['🍳🔥🤬', "Hell's Kitchen"],
      ['🐆👑', 'Tiger King'],
      ['🏚️🧱🔨', 'DIY SOS'],
      ['🧟‍♂️🚶', 'The Walking Dead'],
    ],
  },
  {
    id: 'musicals', name: 'Musicals', emoji: '🎭',
    items: [
      ['🐱🌙', 'Cats'],
      ['👻🎭🎹', 'The Phantom of the Opera'],
      ['🇫🇷⚔️😢', 'Les Misérables'],
      ['🇺🇸💵🎤', 'Hamilton'],
      ['🧙‍♀️💚🧹', 'Wicked'],
      ['👩🇬🇷🏝️💃', 'Mamma Mia!'],
      ['⛰️🎶👗👧👦', 'The Sound of Music'],
      ['🚗💄🕶️', 'Grease'],
      ['🎪🐘🎩', 'The Greatest Showman'],
      ['💃🌃🎹⭐', 'La La Land'],
      ['👧🔴🐕☀️', 'Annie'],
      ['📚👧🧠', 'Matilda'],
      ['🧥🌈', 'Joseph and the Amazing Technicolor Dreamcoat'],
      ['🌃💃🕺🔪', 'West Side Story'],
      ['🧑‍🍳🥧✂️', 'Sweeney Todd'],
      ['👞👞👠🏭', 'Kinky Boots'],
    ],
  },
  {
    id: 'pop', name: 'Pop Hits', emoji: '🎤',
    items: [
      ['😁👏', 'Happy', 'Pharrell Williams'],
      ['🙈💡', 'Blinding Lights', 'The Weeknd'],
      ['🍉🍬', 'Watermelon Sugar', 'Harry Styles'],
      ['🔷🫵', 'Shape of You', 'Ed Sheeran'],
      ['⬆️🏙️🕺', 'Uptown Funk', 'Mark Ronson ft. Bruno Mars'],
      ['🎆', 'Firework', 'Katy Perry'],
      ['🫨📴', 'Shake It Off', 'Taylor Swift'],
      ['👋📞', 'Hello', 'Adele'],
      ['🚗🪪', 'Drivers License', 'Olivia Rodrigo'],
      ['💃🐒', 'Dance Monkey', 'Tones and I'],
      ['😈👦', 'Bad Guy', 'Billie Eilish'],
      ['🐎🤠🛣️', 'Old Town Road', 'Lil Nas X'],
      ['🌸💐', 'Flowers', 'Miley Cyrus'],
      ['🧘‍♀️⬆️🌌', 'Levitating', 'Dua Lipa'],
      ['👑👑', 'Royals', 'Lorde'],
      ['☕', 'Espresso', 'Sabrina Carpenter'],
      ['💎💎', 'Diamonds', 'Rihanna'],
      ['🚫🛑😊', "Can't Stop the Feeling!", 'Justin Timberlake'],
      ['🫵👤🔁', 'Someone Like You', 'Adele'],
    ],
  },
  {
    id: '80s', name: '80s Songs', emoji: '📼',
    items: [
      ['💜🌧️', 'Purple Rain', 'Prince'],
      ['🧟🎃💃', 'Thriller', 'Michael Jackson'],
      ['🐯👁️', 'Eye of the Tiger', 'Survivor'],
      ['👧👧🎉', 'Girls Just Want to Have Fun', 'Cyndi Lauper'],
      ['🚫🛑🙏', "Don't Stop Believin'", 'Journey'],
      ['☀️🚶‍♀️', 'Walking on Sunshine', 'Katrina and the Waves'],
      ['🏃‍♀️⬆️⛰️', 'Running Up That Hill', 'Kate Bush'],
      ['🌑☀️❤️', 'Total Eclipse of the Heart', 'Bonnie Tyler'],
      ['🛍️💎👧', 'Material Girl', 'Madonna'],
      ['🫀🙏', "Livin' on a Prayer", 'Bon Jovi'],
      ['⏰👆🏃‍♂️🏃‍♂️', 'Wake Me Up Before You Go-Go', 'Wham!'],
      ['📞🫵', 'Call Me', 'Blondie'],
      ['🍹🌴🕺', 'Club Tropicana', 'Wham!'],
      ['🦸‍♂️⏳', 'Holding Out for a Hero', 'Bonnie Tyler'],
      ['💃🫵🕺', 'I Wanna Dance with Somebody', 'Whitney Houston'],
      ['🔴🔴🍷', 'Red Red Wine', 'UB40'],
      ['9️⃣9️⃣🔴🎈', '99 Red Balloons', 'Nena'],
      ['👻🔫', 'Ghostbusters', 'Ray Parker Jr.'],
      ['🦶🆓', 'Footloose', 'Kenny Loggins'],
      ['🏙️🏗️🎸', 'We Built This City', 'Starship'],
    ],
  },
  {
    id: '90s', name: '90s Songs', emoji: '💿',
    items: [
      ['🧊🧊👶', 'Ice Ice Baby', 'Vanilla Ice'],
      ['🚢❤️➡️', 'My Heart Will Go On', 'Céline Dion'],
      ['👱‍♀️🎀🌍', 'Barbie Girl', 'Aqua'],
      ['👶1️⃣⏱️', '...Baby One More Time', 'Britney Spears'],
      ['👃🧑‍🎤👻', 'Smells Like Teen Spirit', 'Nirvana'],
      ['💋🌹', 'Kiss from a Rose', 'Seal'],
      ['😲🧱', 'Wonderwall', 'Oasis'],
      ['🔵🔵🔵', 'Blue (Da Ba Dee)', 'Eiffel 65'],
      ['🚫🗣️', "Don't Speak", 'No Doubt'],
      ['💃5️⃣', 'Mambo No. 5', 'Lou Bega'],
      ['💯⭐', 'All Star', 'Smash Mouth'],
      ['💧🏞️', 'Waterfalls', 'TLC'],
      ['🕺🌶️🎉', "Livin' la Vida Loca", 'Ricky Martin'],
      ['📰💃', 'Vogue', 'Madonna'],
      ['🌶️👭🙋‍♀️', 'Wannabe', 'Spice Girls'],
      ['⏳❤️🫵', 'I Will Always Love You', 'Whitney Houston'],
      ['🛁👊🍺', 'Tubthumping', 'Chumbawamba'],
      ['💃🙆‍♀️🔁', 'Macarena', 'Los del Río'],
      ['🧞‍♀️🍾', 'Genie in a Bottle', 'Christina Aguilera'],
    ],
  },
  {
    id: '00s', name: '2000s Songs', emoji: '📱',
    items: [
      ['☂️🌧️', 'Umbrella', 'Rihanna'],
      ['👋🎶', 'Hey Ya!', 'OutKast'],
      ['🤪❤️', 'Crazy in Love', 'Beyoncé'],
      ['☠️🧪', 'Toxic', 'Britney Spears'],
      ['💃🚫🤥', "Hips Don't Lie", 'Shakira'],
      ['☀️🙋‍♂️', 'Mr. Brightside', 'The Killers'],
      ['7️⃣🌍🪖', 'Seven Nation Army', 'The White Stripes'],
      ['💋👧', 'I Kissed a Girl', 'Katy Perry'],
      ['🗽🧠', 'Empire State of Mind', 'Jay-Z & Alicia Keys'],
      ['1️⃣👩💍', 'Single Ladies', 'Beyoncé'],
      ['🎉🌃😃', 'I Gotta Feeling', 'Black Eyed Peas'],
      ['🃏😐', 'Poker Face', 'Lady Gaga'],
      ['🏃‍♂️🚗🚗', 'Chasing Cars', 'Snow Patrol'],
      ['💔📵', 'Since U Been Gone', 'Kelly Clarkson'],
      ['👑🔔🏰', 'Viva la Vida', 'Coldplay'],
      ['🟡⭐⭐', 'Yellow', 'Coldplay'],
      ['🔥🔥🌃', 'Sex on Fire', 'Kings of Leon'],
      ['🍭🍭🍭', 'Lollipop', 'Lil Wayne'],
    ],
  },
  {
    id: 'xmas-songs', name: 'Christmas Songs', emoji: '🎄',
    items: [
      ['🎄🎁🙏🫵', 'All I Want for Christmas Is You', 'Mariah Carey'],
      ['⏮️🎄💔', 'Last Christmas', 'Wham!'],
      ['🌙🤫⛪', 'Silent Night'],
      ['🦌🔴👃', 'Rudolph the Red-Nosed Reindeer'],
      ['⛄🎩✨', 'Frosty the Snowman'],
      ['🎅🔜🏘️', 'Santa Claus Is Coming to Town'],
      ['🚗🏠🎄', 'Driving Home for Christmas', 'Chris Rea'],
      ['🌍❓🎄', "Do They Know It's Christmas?", 'Band Aid'],
      ['❄️❄️❄️', 'Let It Snow!'],
      ['🔔🔔🪨', 'Jingle Bell Rock', 'Bobby Helms'],
      ['⚪🎄', 'White Christmas', 'Bing Crosby'],
      ['🧚📖🗽', 'Fairytale of New York', 'The Pogues ft. Kirsty MacColl'],
      ['🎸🔄🎄', "Rockin' Around the Christmas Tree", 'Brenda Lee'],
      ['👣➡️🎄', 'Step into Christmas', 'Elton John'],
      ['👀👩💋🎅', 'I Saw Mommy Kissing Santa Claus'],
      ['👶🥶🚪', "Baby, It's Cold Outside"],
      ['🎉🎄🌍', 'Merry Christmas Everyone', "Shakin' Stevens"],
      ['🔔🔔🔔', 'Jingle Bells'],
    ],
  },
  {
    id: 'xmas-films', name: 'Christmas Films', emoji: '🎅',
    items: [
      ['🏠👦😱🎄', 'Home Alone'],
      ['🧝🎄🗽', 'Elf'],
      ['🎄❤️🇬🇧', 'Love Actually'],
      ['🐸🐷👻📜', 'The Muppet Christmas Carol'],
      ['⛄🧣✈️', 'The Snowman'],
      ['🚂🎄🔔', 'The Polar Express'],
      ['💚😠🎄', 'The Grinch'],
      ['💥🏢🎄', 'Die Hard'],
      ['🎅⚖️🗽', 'Miracle on 34th Street'],
      ['👼🔔🌉', "It's a Wonderful Life"],
      ['🎅📏📜', 'The Santa Clause'],
      ['🏡🇬🇧🔁🇺🇸', 'The Holiday'],
      ['🎃🎄💀', 'The Nightmare Before Christmas'],
      ['🏃‍♂️🧸🎄', 'Jingle All the Way'],
      ['👦🎁👹', 'Gremlins'],
      ['🐻🍊🎄', 'Paddington 2'],
    ],
  },
  {
    id: 'phrases', name: 'Phrases & Sayings', emoji: '💬',
    items: [
      ['🌧️🐱🐶', 'Raining cats and dogs'],
      ['🍰', 'Piece of cake'],
      ['🐘🚪🛋️', 'The elephant in the room'],
      ['☝️🧊🏔️', 'Tip of the iceberg'],
      ['2️⃣🐦1️⃣🪨', 'Kill two birds with one stone'],
      ['🍎👁️', 'The apple of my eye'],
      ['🐈👜➡️', 'Let the cat out of the bag'],
      ['⏰🟰💰', 'Time is money'],
      ['1️⃣🔵🌙', 'Once in a blue moon'],
      ['💔🦵', 'Break a leg'],
      ['🚫😭🥛', "Don't cry over spilt milk"],
      ['🥚🥚🥚🧺🚫', "Don't put all your eggs in one basket"],
      ['⬇️🌦️', 'Under the weather'],
      ['🐟🐟🌊', 'Plenty more fish in the sea'],
      ['🐱👅❓', 'Cat got your tongue?'],
      ['👍🍞🔪', 'The best thing since sliced bread'],
      ['🦶👄', 'Put your foot in your mouth'],
      ['🐷🪽', 'When pigs fly'],
      ['🚫🔥🌉', "Don't burn your bridges"],
    ],
  },
];

// Pick n puzzles from the chosen categories, round-robin so mixed rounds are fair.
function buildEmojiRound(catIds, n, shuffle) {
  const cats = EMOJI_CATEGORIES.filter((c) => catIds.includes(c.id));
  const pools = cats.map((c) => ({ c, items: shuffle(c.items) }));
  const out = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const { c, items } of shuffle(pools)) {
      if (out.length >= n) break;
      if (round < items.length) {
        const [e, a, note] = items[round];
        out.push({ e, a, note: note || '', cat: `${c.emoji} ${c.name}` });
        added = true;
      }
    }
    if (!added) break;
  }
  return shuffle(out);
}

// Turn puzzles into multiple-choice questions. Wrong answers come from the same
// category where possible, then from any other answer in the round or the packs.
function emojiQuestions(puzzles, shuffle) {
  const packAnswers = new Map(EMOJI_CATEGORIES.map((c) => [`${c.emoji} ${c.name}`, c.items.map((i) => i[1])]));
  const allRound = [...new Set(puzzles.map((p) => p.a))];
  return puzzles.map((p) => {
    const sameCat = [...(packAnswers.get(p.cat) || []), ...puzzles.filter((x) => x.cat === p.cat).map((x) => x.a)];
    const wrong = [];
    for (const pool of [sameCat, allRound]) {
      for (const a of shuffle([...new Set(pool)])) {
        if (wrong.length >= 3) break;
        if (a.toLowerCase() !== p.a.toLowerCase() && !wrong.includes(a)) wrong.push(a);
      }
    }
    const options = shuffle([p.a, ...wrong]);
    return { q: p.e, options, answer: options.indexOf(p.a), cat: p.cat || null, note: p.note || null };
  });
}

module.exports = { EMOJI_CATEGORIES, buildEmojiRound, emojiQuestions };
