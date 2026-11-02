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

module.exports = { SAMPLE_QUIZ, SAMPLE_HL };
