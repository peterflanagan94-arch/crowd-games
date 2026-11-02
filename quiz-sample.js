// A starter quiz so the DJ can try things out straight away.
// Replace or extend it from the host screen with your own questions.
const SAMPLE_QUIZ = [
  { q: 'How many beats are in one bar of standard 4/4 time?', options: ['2', '3', '4', '8'], answer: 2 },
  { q: 'What does BPM stand for?', options: ['Bass Per Minute', 'Beats Per Minute', 'Bars Per Mix', 'Beats Per Measure'], answer: 1 },
  { q: 'Which instrument has 88 keys on a standard full-size model?', options: ['Organ', 'Accordion', 'Piano', 'Synthesizer'], answer: 2 },
  { q: 'How many strings does a standard bass guitar have?', options: ['4', '5', '6', '7'], answer: 0 },
  { q: 'Which city is the birthplace of The Beatles?', options: ['Manchester', 'London', 'Liverpool', 'Birmingham'], answer: 2 },
  { q: 'Which of these genres originated in Chicago in the 1980s?', options: ['House', 'Grime', 'Dubstep', 'Reggaeton'], answer: 0 },
  { q: 'What is the Italian musical term for "gradually getting louder"?', options: ['Diminuendo', 'Crescendo', 'Staccato', 'Legato'], answer: 1 },
  { q: 'Roughly what tempo range is typical for drum and bass?', options: ['70-90 BPM', '100-110 BPM', '120-128 BPM', '160-180 BPM'], answer: 3 },
  { q: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], answer: 1 },
  { q: 'How many players does each team have on the pitch in a football (soccer) match?', options: ['9', '10', '11', '12'], answer: 2 },
  { q: 'Which famous DJ equipment brand made the Technics SL-1200 turntable?', options: ['Sony', 'Panasonic', 'Pioneer', 'Yamaha'], answer: 1 },
  { q: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 2 },
];

// Higher or lower starter: years things happened. Neighbours must differ.
const SAMPLE_HL = {
  unit: 'year',
  items: [
    { label: 'First Moon landing', value: 1969 },
    { label: 'MTV launches', value: 1981 },
    { label: 'Sony Walkman goes on sale', value: 1979 },
    { label: 'Compact discs go on sale', value: 1982 },
    { label: 'Berlin Wall falls', value: 1989 },
    { label: 'Channel Tunnel opens', value: 1994 },
    { label: 'World Wide Web opens to the public', value: 1991 },
    { label: 'YouTube launches', value: 2005 },
    { label: 'First iPhone goes on sale', value: 2007 },
    { label: 'Spotify launches', value: 2008 },
    { label: 'Titanic sinks', value: 1912 },
    { label: 'First FIFA World Cup', value: 1930 },
  ],
};

// Wedding packs. {A} and {B} are replaced with the couple's names on the host screen.
const WEDDING = {
  // General wedding and love trivia (answers are traditional UK conventions).
  trivia: [
    { q: 'Something old, something new, something borrowed and something…?', options: ['Gold', 'Blue', 'True', 'White'], answer: 1 },
    { q: 'What is the traditional gift for a 25th wedding anniversary?', options: ['Gold', 'Pearl', 'Silver', 'Ruby'], answer: 2 },
    { q: 'What is the traditional gift for a 1st wedding anniversary?', options: ['Paper', 'Cotton', 'Wood', 'Tin'], answer: 0 },
    { q: 'Which anniversary is celebrated with gold?', options: ['25th', '40th', '50th', '60th'], answer: 2 },
    { q: 'What is the traditional gift for a 10th wedding anniversary?', options: ['Crystal', 'Tin', 'Leather', 'Lace'], answer: 1 },
    { q: 'Which Roman god of love is shown with a bow and arrows?', options: ['Mars', 'Mercury', 'Cupid', 'Apollo'], answer: 2 },
    { q: 'On which hand is a wedding ring traditionally worn in the UK?', options: ['Left', 'Right', 'Either', 'Neither, it goes on a necklace'], answer: 0 },
    { q: 'What are the stacked layers of a wedding cake called?', options: ['Tiers', 'Decks', 'Floors', 'Rungs'], answer: 0 },
    { q: 'Which composer wrote the "Wedding March" often played as couples leave the ceremony?', options: ['Mozart', 'Mendelssohn', 'Beethoven', 'Bach'], answer: 1 },
    { q: 'What date is Valentine’s Day?', options: ['1 February', '14 February', '14 March', '29 February'], answer: 1 },
  ],
  // Template the DJ fills in with the couple beforehand. * marks the answer to change.
  coupleQuiz: [
    { q: 'Where did {A} and {B} first meet?', options: ['*Edit me: the real answer', 'At work', 'On a night out', 'Online'] },
    { q: 'Who said "I love you" first?', options: ['*{A}', '{B}'] },
    { q: 'Where did {A} and {B} go on their first date?', options: ['*Edit me', 'Cinema', 'Restaurant', 'Pub'] },
    { q: 'Who is the better cook?', options: ['*{A}', '{B}'] },
    { q: 'How long have {A} and {B} been together?', options: ['*Edit me', 'Under 3 years', '3 to 6 years', 'Over 10 years'] },
    { q: 'Where did the proposal happen?', options: ['*Edit me', 'On holiday', 'At home', 'At a restaurant'] },
    { q: 'Who takes longer to get ready?', options: ['*{A}', '{B}'] },
    { q: 'What is the name of their first dance song?', options: ['*Edit me', 'Option 2', 'Option 3', 'Option 4'] },
  ],
  mostLikely: [
    'Who’s most likely to cry during the speeches?',
    'Who’s most likely to be last on the dance floor tonight?',
    'Who’s most likely to forget the anniversary?',
    'Who’s most likely to get lost on the honeymoon?',
    'Who’s most likely to have the first lie-in tomorrow?',
    'Who’s most likely to start a sing-along?',
    'Who’s most likely to win an argument?',
    'Who’s most likely to adopt a pet without asking?',
    'Who spends longest scrolling their phone?',
    'Who’s the bigger romantic?',
  ],
  coupleHigherLower: [
    { label: 'Years {A} & {B} have been together', value: 0 },
    { label: 'Countries they have visited together', value: 0 },
    { label: 'Guests at the wedding today', value: 0 },
    { label: 'Days from engagement to wedding', value: 0 },
  ],
  // Classic floor-fillers that also work for a pub or party night.
  floorFillers: [
    'ABBA - Dancing Queen',
    'Whitney Houston - I Wanna Dance with Somebody',
    'Bon Jovi - Livin’ on a Prayer',
    'Journey - Don’t Stop Believin’',
    'Queen - Don’t Stop Me Now',
    'Dexys Midnight Runners - Come On Eileen',
    'Mark Ronson ft. Bruno Mars - Uptown Funk',
    'Pharrell Williams - Happy',
    'Kool & the Gang - Celebration',
    'Neil Diamond - Sweet Caroline',
    'The Killers - Mr. Brightside',
    'Village People - Y.M.C.A.',
    'Earth, Wind & Fire - September',
    'Beyoncé - Crazy in Love',
    'Justin Timberlake - Can’t Stop the Feeling!',
    'The Proclaimers - I’m Gonna Be (500 Miles)',
    'Bruno Mars - Marry You',
    'Stevie Wonder - Signed, Sealed, Delivered I’m Yours',
    'Gloria Gaynor - I Will Survive',
    'Spice Girls - Wannabe',
    'Shania Twain - Man! I Feel Like a Woman!',
    'Daft Punk ft. Pharrell Williams - Get Lucky',
    'Cyndi Lauper - Girls Just Want to Have Fun',
    'Wham! - Wake Me Up Before You Go-Go',
    'Lionel Richie - All Night Long',
    'The Weather Girls - It’s Raining Men',
    'Kylie Minogue - Can’t Get You Out of My Head',
    'Oasis - Don’t Look Back in Anger',
    'Avicii - Wake Me Up',
    'Ed Sheeran - Shape of You',
  ],
};

module.exports = { SAMPLE_QUIZ, SAMPLE_HL, WEDDING };
