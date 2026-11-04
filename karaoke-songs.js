// Popular karaoke songs, as ideas for guests and the DJ. One "Artist - Title" per line.
// Built from UK "most sung" karaoke lists and Sing King's most-viewed karaoke videos.
// KARAOKE_YT maps a song to a lyrics karaoke video on YouTube (checked with tools/karaoke-verify.js).
const LISTS = {
  '🔥 Crowd favourites': `The Killers - Mr. Brightside
ABBA - Dancing Queen
Mark Ronson ft. Amy Winehouse - Valerie
Queen - Bohemian Rhapsody
Neil Diamond - Sweet Caroline
Estelle ft. Kanye West - American Boy
Backstreet Boys - I Want It That Way
Oasis - Wonderwall
Wheatus - Teenage Dirtbag
Shania Twain - Man! I Feel Like a Woman!
Spice Girls - Wannabe
Robbie Williams - Angels
Bon Jovi - Livin' on a Prayer
Whitney Houston - I Wanna Dance with Somebody
Journey - Don't Stop Believin'
Queen - Don't Stop Me Now
Britney Spears - Toxic
Gloria Gaynor - I Will Survive
Proclaimers - I'm Gonna Be (500 Miles)
Vengaboys - We Like to Party!
S Club 7 - Reach
Steps - Tragedy
Abba - Mamma Mia
Dolly Parton - 9 to 5
Tina Turner - Proud Mary`,
  '💑 Duets': `Kenny Rogers & Dolly Parton - Islands in the Stream
Lady Gaga & Bradley Cooper - Shallow
Elton John & Kiki Dee - Don't Go Breaking My Heart
John Travolta & Olivia Newton-John - You're the One That I Want
The Human League - Don't You Want Me
Meat Loaf - Paradise by the Dashboard Light
Kylie Minogue & Jason Donovan - Especially for You
Marvin Gaye & Tammi Terrell - Ain't No Mountain High Enough
Bill Medley & Jennifer Warnes - (I've Had) The Time of My Life
Peaches & Herb - Reunited
Sonny & Cher - I Got You Babe
Charlie Puth & Selena Gomez - We Don't Talk Anymore
Zac Efron & Zendaya - Rewrite the Stars
Rihanna ft. Mikky Ekko - Stay
Nancy Sinatra & Lee Hazlewood - Some Velvet Morning
Tom Jones & Cerys Matthews - Baby, It's Cold Outside`,
  '🎤 Power ballads': `Bonnie Tyler - Total Eclipse of the Heart
Celine Dion - My Heart Will Go On
Whitney Houston - I Will Always Love You
Adele - Someone Like You
Aerosmith - I Don't Want to Miss a Thing
Bryan Adams - (Everything I Do) I Do It for You
Richard Marx - Right Here Waiting
Leona Lewis - Bleeding Love
Lewis Capaldi - Someone You Loved
Survivor - Eye of the Tiger
Europe - The Final Countdown
Heart - Alone
Cyndi Lauper - Time After Time
Ben E. King - Stand by Me
Amy Winehouse - Back to Black
Jason Mraz - I Won't Give Up
Maroon 5 - She Will Be Loved
Chris Stapleton - Tennessee Whiskey`,
  '🎸 Rock & indie': `Arctic Monkeys - I Bet You Look Good on the Dancefloor
Kings of Leon - Sex on Fire
Oasis - Don't Look Back in Anger
The Proclaimers - Letter from America
Blur - Song 2
Pulp - Common People
The Kooks - Naive
Kaiser Chiefs - I Predict a Riot
Evanescence - Bring Me to Life
Green Day - Basket Case
Bon Jovi - It's My Life
AC/DC - Highway to Hell
Guns N' Roses - Sweet Child o' Mine
Queen - Love of My Life
The Police - Every Breath You Take
The Beatles - Let It Be
The Beatles - Hey Jude
Snow Patrol - Chasing Cars
Gnarls Barkley - Crazy
Kate Bush - Running Up That Hill`,
  '💃 Pop hits': `Taylor Swift - Love Story
Taylor Swift - Shake It Off
Miley Cyrus - Flowers
Miley Cyrus - Party in the U.S.A.
Lady Gaga - Bad Romance
Katy Perry - Firework
Kelly Clarkson - Since U Been Gone
TLC - No Scrubs
Destiny's Child - Survivor
Beyoncé - Crazy in Love
Rihanna - Umbrella
Nicki Minaj - Super Bass
Harry Styles - As It Was
Dua Lipa - Don't Start Now
Olivia Rodrigo - Drivers License
Ed Sheeran - Shape of You
Justin Bieber - Love Yourself
Maroon 5 - Memories
Clean Bandit ft. Sean Paul & Anne-Marie - Rockabye
Sabrina Carpenter - Espresso
Chappell Roan - Pink Pony Club
Lizzo - Juice
Pharrell Williams - Happy
Bruno Mars - Uptown Funk`,
  '🎭 Musicals & films': `High School Musical - Breaking Free
Grease - Summer Nights
The Greatest Showman - This Is Me
The Greatest Showman - A Million Dreams
Frozen - Let It Go
Moana - How Far I'll Go
The Little Mermaid - Part of Your World
Mamma Mia! - Super Trouper
Encanto - We Don't Talk About Bruno
Wicked - Defying Gravity
Les Misérables - I Dreamed a Dream
The Lion King - Can You Feel the Love Tonight
Dirty Dancing - Hungry Eyes
Titanic - My Heart Will Go On`,
};
const KARAOKE_LISTS = Object.fromEntries(Object.entries(LISTS).map(([k, v]) => [k, v.split('\n').map((s) => s.trim()).filter(Boolean)]));
let KARAOKE_YT = {};
try { KARAOKE_YT = require('./karaoke-youtube.json'); } catch {}
module.exports = { KARAOKE_LISTS, KARAOKE_YT };
