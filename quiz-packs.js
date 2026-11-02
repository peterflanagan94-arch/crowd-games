// Quiz question packs by category. Each question: [question, correct answer, wrong, wrong, wrong].
// The correct answer is listed first here; answer order is shuffled when a quiz is built.
const CATEGORIES = [
  {
    id: 'general', name: 'General Knowledge', emoji: '🧠',
    questions: [
      ['How many continents are there?', '7', '5', '6', '8'],
      ['What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
      ['How many sides does a hexagon have?', '6', '5', '7', '8'],
      ['What is the largest planet in our solar system?', 'Jupiter', 'Saturn', 'Neptune', 'Earth'],
      ['What is the hardest natural substance?', 'Diamond', 'Gold', 'Granite', 'Iron'],
      ['Which is the largest ocean?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'],
      ['How many hours are there in a week?', '168', '144', '160', '172'],
      ['Which gas do plants absorb from the air?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'],
      ['Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Pablo Picasso', 'Vincent van Gogh'],
      ['What is the smallest prime number?', '2', '1', '3', '0'],
      ['In which country are the Pyramids of Giza?', 'Egypt', 'Mexico', 'Jordan', 'Morocco'],
      ['How many minutes are there in a day?', '1,440', '1,200', '1,600', '2,400'],
      ['At what temperature does water boil at sea level?', '100°C', '90°C', '110°C', '120°C'],
      ['What is the longest river in the UK?', 'Severn', 'Thames', 'Trent', 'Tay'],
      ['Which language has the most native speakers?', 'Mandarin Chinese', 'English', 'Spanish', 'Hindi'],
      ['Which element has the chemical symbol O?', 'Oxygen', 'Gold', 'Osmium', 'Iron'],
    ],
  },
  {
    id: 'disney', name: 'Disney', emoji: '🏰',
    questions: [
      ['What is the name of the snowman in Frozen?', 'Olaf', 'Sven', 'Kristoff', 'Hans'],
      ["In The Lion King, what is Simba's father called?", 'Mufasa', 'Scar', 'Rafiki', 'Zazu'],
      ['What type of animal is Dumbo?', 'Elephant', 'Mouse', 'Donkey', 'Hippo'],
      ["In Aladdin, what is the name of Jasmine's pet tiger?", 'Rajah', 'Abu', 'Iago', 'Sultan'],
      ['Which Disney heroine has a raccoon friend called Meeko?', 'Pocahontas', 'Mulan', 'Belle', 'Rapunzel'],
      ['What is the name of the cowboy in Toy Story?', 'Woody', 'Buzz', 'Jessie', 'Rex'],
      ["What is the name of Peter Pan's fairy friend?", 'Tinker Bell', 'Silvermist', 'Fawn', 'Rosetta'],
      ['In Finding Nemo, what type of fish is Dory?', 'Blue tang', 'Clownfish', 'Angelfish', 'Pufferfish'],
      ['In The Little Mermaid, what does Ariel call a fork?', 'A dinglehopper', 'A snarfblatt', 'A thingamabob', 'A whatzit'],
      ['In Beauty and the Beast, what is the name of the candlestick?', 'Lumière', 'Cogsworth', 'Chip', 'Gaston'],
      ["What colour are Mickey Mouse's shorts?", 'Red', 'Blue', 'Yellow', 'Green'],
      ['In Moana, what is the name of the demigod?', 'Maui', 'Tamatoa', 'Hei Hei', 'Tui'],
      ["In Encanto, what is the family's surname?", 'Madrigal', 'Rivera', 'Delgado', 'Morales'],
      ["What are the names of Disney's two chipmunks?", 'Chip and Dale', 'Alvin and Simon', 'Pip and Squeak', 'Tic and Tac'],
      ['In Up, what does Carl use to lift his house into the sky?', 'Balloons', 'A rocket', 'An airship', 'Kites'],
      ['Which film features the song "Let It Go"?', 'Frozen', 'Tangled', 'Moana', 'Brave'],
    ],
  },
  {
    id: 'films', name: 'Films', emoji: '🎬',
    questions: [
      ['Which film features the line "I\'ll be back"?', 'The Terminator', 'Die Hard', 'RoboCop', 'Predator'],
      ['Who directed Jaws?', 'Steven Spielberg', 'George Lucas', 'Ridley Scott', 'James Cameron'],
      ['Which hobbit is played by Elijah Wood in The Lord of the Rings?', 'Frodo', 'Sam', 'Merry', 'Pippin'],
      ['Which 1997 film starring Leonardo DiCaprio won the Oscar for Best Picture?', 'Titanic', 'The Departed', 'Inception', 'Gladiator'],
      ['What colour pill does Neo take in The Matrix?', 'Red', 'Blue', 'Green', 'White'],
      ['What is the name of the wizarding school in Harry Potter?', 'Hogwarts', 'Durmstrang', 'Beauxbatons', 'Ilvermorny'],
      ['Which actor plays Iron Man in the Marvel films?', 'Robert Downey Jr.', 'Chris Evans', 'Chris Hemsworth', 'Mark Ruffalo'],
      ['In Back to the Future, how fast must the DeLorean go to time travel?', '88 mph', '77 mph', '100 mph', '121 mph'],
      ['In Jurassic Park, which dinosaurs stalk the kids in the kitchen?', 'Velociraptors', 'T. rex', 'Triceratops', 'Dilophosaurus'],
      ['"Here\'s looking at you, kid" is a line from which film?', 'Casablanca', 'Gone with the Wind', 'Citizen Kane', 'The Godfather'],
      ['Who played Captain Jack Sparrow?', 'Johnny Depp', 'Orlando Bloom', 'Brad Pitt', 'Russell Crowe'],
      ['What is the name of the Wookiee in Star Wars?', 'Chewbacca', 'Yoda', 'Jabba', 'Greedo'],
      ['"(I\'ve Had) The Time of My Life" is the big finale song in which film?', 'Dirty Dancing', 'Grease', 'Footloose', 'Flashdance'],
      ['What is the name of the lion in The Chronicles of Narnia?', 'Aslan', 'Mufasa', 'Leo', 'Simba'],
      ['Who played James Bond in Casino Royale (2006)?', 'Daniel Craig', 'Pierce Brosnan', 'Sean Connery', 'Roger Moore'],
      ['In The Wizard of Oz, what colour are Dorothy\'s slippers?', 'Ruby red', 'Silver', 'Gold', 'Emerald green'],
    ],
  },
  {
    id: 'music', name: 'Music', emoji: '🎵',
    questions: [
      ['Which band released "Bohemian Rhapsody"?', 'Queen', 'The Beatles', 'Led Zeppelin', 'The Rolling Stones'],
      ['Which singer is known as the "Queen of Pop"?', 'Madonna', 'Kylie Minogue', 'Britney Spears', 'Cher'],
      ['How many members were there in the Spice Girls?', '5', '4', '3', '6'],
      ['Which country did ABBA come from?', 'Sweden', 'Norway', 'Denmark', 'Finland'],
      ['Who sang "Purple Rain"?', 'Prince', 'Michael Jackson', 'Stevie Wonder', 'David Bowie'],
      ['Which Beatle was the drummer?', 'Ringo Starr', 'Paul McCartney', 'John Lennon', 'George Harrison'],
      ['Which artist released the album "21"?', 'Adele', 'Amy Winehouse', 'Rihanna', 'Dua Lipa'],
      ['Who is the lead singer of U2?', 'Bono', 'The Edge', 'Sting', 'Morrissey'],
      ['Who sang "Thriller"?', 'Michael Jackson', 'Prince', 'Lionel Richie', 'Bruno Mars'],
      ['"Wonderwall" was a hit for which band?', 'Oasis', 'Blur', 'Pulp', 'The Verve'],
      ["Which rapper's real name is Marshall Mathers?", 'Eminem', 'Jay-Z', 'Snoop Dogg', 'Dr. Dre'],
      ['Which band had a hit with "Mr. Brightside"?', 'The Killers', 'Kings of Leon', 'Coldplay', 'The Strokes'],
      ['What do the letters DJ stand for?', 'Disc jockey', 'Dance judge', 'Digital jukebox', 'Disco junction'],
      ["Which singer's fans are known as Swifties?", 'Taylor Swift', 'Beyoncé', 'Ariana Grande', 'Lady Gaga'],
      ['Who sang "Rocket Man"?', 'Elton John', 'David Bowie', 'Rod Stewart', 'Billy Joel'],
      ['How many strings does a standard guitar have?', '6', '4', '5', '8'],
    ],
  },
  {
    id: 'tv', name: 'TV', emoji: '📺',
    questions: [
      ['In Friends, what is the name of the coffee shop?', 'Central Perk', 'The Daily Grind', 'Java Joe\'s', 'Moondance'],
      ['Which TV series features the Iron Throne?', 'Game of Thrones', 'The Witcher', 'Vikings', 'The Crown'],
      ["What is the name of the Doctor's time machine in Doctor Who?", 'The TARDIS', 'The DeLorean', 'The Enterprise', 'The Falcon'],
      ['In The Simpsons, what is the name of the bar Homer goes to?', "Moe's", "Cheers", "Paddy's", "The Drunken Clam"],
      ['Which series is set in the town of Hawkins, Indiana?', 'Stranger Things', 'Twin Peaks', 'Riverdale', 'Wednesday'],
      ["In Only Fools and Horses, what is Del Boy's surname?", 'Trotter', 'Boycie', 'Jones', 'Harris'],
      ["In The Big Bang Theory, who is Sheldon's roommate?", 'Leonard', 'Howard', 'Raj', 'Stuart'],
      ['Which show features chemistry teacher Walter White?', 'Breaking Bad', 'Ozark', 'The Wire', 'Narcos'],
      ['What colour is Peppa Pig?', 'Pink', 'Red', 'Purple', 'Orange'],
      ['In the US version of The Office, which paper company do they work for?', 'Dunder Mifflin', 'Wernham Hogg', 'Vance Refrigeration', 'Sabre'],
      ['What is the family surname in Downton Abbey?', 'Crawley', 'Bridgerton', 'Bellamy', 'Grantham'],
      ['In Gavin & Stacey, which Welsh town is Stacey from?', 'Barry', 'Cardiff', 'Swansea', 'Newport'],
    ],
  },
  {
    id: 'sport', name: 'Sport', emoji: '⚽',
    questions: [
      ['How many players are in a rugby union team?', '15', '11', '13', '18'],
      ['In which sport would you perform a slam dunk?', 'Basketball', 'Volleyball', 'Tennis', 'Netball'],
      ['How often are the Summer Olympics held?', 'Every 4 years', 'Every 2 years', 'Every 3 years', 'Every 5 years'],
      ['What is the maximum break in snooker?', '147', '155', '180', '100'],
      ['Which country won the 2018 FIFA World Cup?', 'France', 'Croatia', 'Germany', 'Brazil'],
      ['On what surface is Wimbledon played?', 'Grass', 'Clay', 'Hard court', 'Carpet'],
      ['How many holes are on a standard golf course?', '18', '9', '12', '21'],
      ['In darts, what is the highest score possible with three darts?', '180', '150', '160', '200'],
      ['Which city hosted the 2012 Summer Olympics?', 'London', 'Beijing', 'Rio de Janeiro', 'Paris'],
      ['In tennis, what is a score of zero called?', 'Love', 'Nil', 'Duck', 'Zip'],
      ['Roughly how long is a marathon?', '26.2 miles', '13.1 miles', '20 miles', '30 miles'],
      ['Which sport uses a shuttlecock?', 'Badminton', 'Squash', 'Table tennis', 'Lacrosse'],
    ],
  },
  {
    id: 'food', name: 'Food & Drink', emoji: '🍕',
    questions: [
      ['What is the main ingredient in guacamole?', 'Avocado', 'Pea', 'Cucumber', 'Lime'],
      ['Which country does feta cheese come from?', 'Greece', 'Italy', 'France', 'Turkey'],
      ['What is sushi often wrapped in?', 'Seaweed', 'Rice paper', 'Lettuce', 'Banana leaf'],
      ['Which nut is used to make marzipan?', 'Almond', 'Hazelnut', 'Walnut', 'Cashew'],
      ['What type of pastry are profiteroles made from?', 'Choux', 'Puff', 'Filo', 'Shortcrust'],
      ['What is the main ingredient of hummus?', 'Chickpeas', 'Lentils', 'Butter beans', 'Peas'],
      ['Which spirit is used in a mojito?', 'Rum', 'Gin', 'Vodka', 'Tequila'],
      ['Which fruit is dried to make a raisin?', 'Grape', 'Plum', 'Cherry', 'Fig'],
      ['Pavlova is named after a famous what?', 'Ballerina', 'Opera singer', 'Scientist', 'Queen'],
      ['Paella is a traditional dish from which country?', 'Spain', 'Portugal', 'Mexico', 'Italy'],
      ['What is tofu made from?', 'Soya beans', 'Rice', 'Chickpeas', 'Coconut'],
      ['Which country is famous for inventing pizza?', 'Italy', 'Greece', 'France', 'USA'],
    ],
  },
  {
    id: 'animals', name: 'Animals', emoji: '🐾',
    questions: [
      ['What is the fastest land animal?', 'Cheetah', 'Lion', 'Horse', 'Greyhound'],
      ['How many legs does a spider have?', '8', '6', '10', '12'],
      ['What is a baby kangaroo called?', 'A joey', 'A cub', 'A kit', 'A pup'],
      ['What is the largest mammal?', 'Blue whale', 'Elephant', 'Giraffe', 'Sperm whale'],
      ['What is a group of lions called?', 'A pride', 'A pack', 'A herd', 'A troop'],
      ['Which animal is known as the "ship of the desert"?', 'Camel', 'Horse', 'Donkey', 'Llama'],
      ['How many hearts does an octopus have?', '3', '1', '2', '8'],
      ['What do giant pandas mainly eat?', 'Bamboo', 'Fish', 'Berries', 'Insects'],
      ['Which is the only mammal that can truly fly?', 'Bat', 'Flying squirrel', 'Sugar glider', 'Colugo'],
      ["What colour is a polar bear's skin?", 'Black', 'White', 'Pink', 'Grey'],
      ['Which bird is often used as a symbol of peace?', 'Dove', 'Robin', 'Swan', 'Eagle'],
      ['What is a female fox called?', 'A vixen', 'A doe', 'A sow', 'A jill'],
    ],
  },
  {
    id: 'throwback', name: '80s & 90s Throwback', emoji: '📼',
    questions: [
      ['Who sang "Never Gonna Give You Up" in 1987?', 'Rick Astley', 'George Michael', 'Jason Donovan', 'Phil Collins'],
      ['What was the name of the pocket virtual pet craze of the late 90s?', 'Tamagotchi', 'Furby', 'Pokémon', 'Game Boy'],
      ['Which puzzle cube was a huge craze in the early 80s?', "Rubik's Cube", 'Tetris Cube', 'Mind Block', 'Magic Square'],
      ['Which boy band had a hit with "Back for Good"?', 'Take That', 'Boyzone', 'Westlife', 'East 17'],
      ['Which sitcom about six friends in New York began in 1994?', 'Friends', 'Seinfeld', 'Frasier', 'Will & Grace'],
      ['What colour is Pac-Man?', 'Yellow', 'Red', 'Blue', 'Green'],
      ['Which famous wall came down in 1989?', 'The Berlin Wall', "Hadrian's Wall", 'The Great Wall', 'The Western Wall'],
      ['Which Spice Girl was known as "Posh"?', 'Victoria', 'Geri', 'Emma', 'Mel B'],
      ['What did the original Sony Walkman play?', 'Cassette tapes', 'CDs', 'Vinyl records', 'MP3s'],
      ['Which band released the album "Parklife" in 1994?', 'Blur', 'Oasis', 'Pulp', 'Suede'],
      ['Which charity supergroup released "Do They Know It\'s Christmas?" in 1984?', 'Band Aid', 'Live Aid', 'Comic Relief', 'USA for Africa'],
      ['In the 1985 film, what kind of car is the time machine in Back to the Future?', 'DeLorean', 'Ferrari', 'Mustang', 'Porsche'],
    ],
  },
  {
    id: 'christmas', name: 'Christmas', emoji: '🎄',
    questions: [
      ['In "The Twelve Days of Christmas", what is given on the first day?', 'A partridge in a pear tree', 'Two turtle doves', 'Five gold rings', 'Three French hens'],
      ['Which reindeer has a red nose?', 'Rudolph', 'Dasher', 'Comet', 'Blitzen'],
      ["What is the name of the Grinch's dog?", 'Max', 'Rex', 'Buddy', 'Spot'],
      ['What do people traditionally kiss under at Christmas?', 'Mistletoe', 'Holly', 'Ivy', 'A wreath'],
      ['In Home Alone, where are the McCallisters going on holiday?', 'Paris', 'London', 'Rome', 'New York'],
      ['Which Christmas film stars Will Ferrell as Buddy?', 'Elf', 'The Santa Clause', 'Jingle All the Way', 'Fred Claus'],
      ['Who wrote "A Christmas Carol"?', 'Charles Dickens', 'Jane Austen', 'Roald Dahl', 'Lewis Carroll'],
      ['Who sang "All I Want for Christmas Is You"?', 'Mariah Carey', 'Whitney Houston', 'Céline Dion', 'Kylie Minogue'],
      ['On which date is Boxing Day?', '26 December', '24 December', '27 December', '1 January'],
      ['How many gifts are given in total across "The Twelve Days of Christmas"?', '364', '78', '144', '300'],
    ],
  },
];

// Build a quiz from the chosen categories. Mixed quizzes take questions round-robin
// so every category gets a fair share. Answer order is shuffled every time.
function buildQuiz(catIds, n, shuffle) {
  const cats = CATEGORIES.filter((c) => catIds.includes(c.id));
  if (!cats.length) return [];
  const pools = cats.map((c) => ({ c, qs: shuffle(c.questions) }));
  const out = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const { c, qs } of shuffle(pools)) {
      if (out.length >= n) break;
      if (round < qs.length) { out.push({ c, q: qs[round] }); added = true; }
    }
    if (!added) break;
  }
  return shuffle(out).map(({ c, q }) => {
    const [question, right, ...wrong] = q;
    const options = shuffle([right, ...wrong]);
    return { q: question, options, answer: options.indexOf(right), cat: `${c.emoji} ${c.name}` };
  });
}

module.exports = { CATEGORIES, buildQuiz };
