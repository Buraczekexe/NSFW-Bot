
console.log('Bot startuje...'); //debug
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { createCanvas, loadImage } = require('canvas');
const GIFEncoder = require('gifencoder');


const DISCORD_TOKEN = 'TOKEN_BOTA' //token bota 
const CLIENT_ID = 'client_id'; // ID klienta z Discord Developer Portal
const GUILD_ID = 'Guild_ID'; // ID serwera, na którym bot będzie działał (prawym na serwer kopiuj ID)

const ACTIVITY_TEXT = 'developed by burakov'; //opis bota

const NSFW_SUBREDDITS = [
  "nsfw", "gonewild", "RealGirls", "nsfw_gifs", "legalteens", "Influencerki_"
];

const COOLDOWN = 10;
const cooldowns = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});


const commands = [
  new SlashCommandBuilder()
    .setName('gif_convert')
    .setDescription('Convertuje png na GIF do zapisania :PP')
    .addAttachmentOption(option =>
      option.setName('obrazek')
        .setDescription('Obrazek do zamiany na GIF')
        .setRequired(true)
    )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Komendy slash zarejestrowane!');
  } catch (err) {
    console.error('Błąd rejestracji komend slash:', err);
  }
})();

async function getRedditImage() {
  const subreddit = NSFW_SUBREDDITS[Math.floor(Math.random() * NSFW_SUBREDDITS.length)];
  try {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=100`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0; +https://discord.com)'
      }
    });
    const json = await res.json();
    const posts = json.data.children.filter(p =>
      p.data.url.endsWith('.jpg') || p.data.url.endsWith('.png') || p.data.url.endsWith('.gif')
    );
    if (posts.length > 0) {
      const post = posts[Math.floor(Math.random() * posts.length)].data;
      return { url: post.url, source: `Reddit: r/${subreddit}` };
    }
  } catch (err) {
    console.error('Reddit error:', err);
  }
  return null;
}

async function getWaifuImage() {
  try {
    const res = await fetch('https://api.waifu.pics/nsfw/waifu');
    const json = await res.json();
    if (json.url) return { url: json.url, source: 'waifu.pics' };
  } catch (err) {
    console.error('Waifu.pics error:', err);
  }
  return null;
}

async function getRealWomanImage() {
  try {
    const res = await fetch('https://nekobot.xyz/api/image?type=4k');
    const json = await res.json();
    if (json.success && json.message) return { url: json.message, source: 'nekobot.xyz 4k' };
  } catch (err) {
    console.error('Nekobot error:', err);
  }
  return null;
}

// ---- Obsługa bota ----
client.once('ready', () => {
  client.user.setActivity(ACTIVITY_TEXT, { type: 'LISTENING' });
  console.log('Bot gotowy!');
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // ---- NSFW ----
  if (!message.guild) return;
  if (!message.content.toLowerCase().startsWith('!nsfw')) return;
  if (!message.channel.nsfw) {
    message.reply('Tylko na kanałach NSFW!');
    return;
  }

  // COOLDOWN
  const now = Date.now();
  if (cooldowns.has(message.author.id)) {
    const expire = cooldowns.get(message.author.id) + COOLDOWN * 1000;
    if (now < expire) {
      const wait = Math.ceil((expire - now) / 1000);
      message.reply(`Poczekaj jeszcze ${wait} sekund przed kolejnym użyciem komendy.`);
      return;
    }
  }
  cooldowns.set(message.author.id, now);

  
  const args = message.content.split(/\s+/);
  let type = args[1]?.toLowerCase();
  let imageObj = null;

  if (type === 'waifu') {
    imageObj = await getWaifuImage();
  } else if (type === 'real') {
    imageObj = await getRealWomanImage();
  } else if (type === 'reddit') {
    imageObj = await getRedditImage();
  } else {
    // Losowo
    const order = [getRedditImage, getWaifuImage, getRealWomanImage].sort(() => Math.random() - 0.5);
    for (const fn of order) {
      imageObj = await fn();
      if (imageObj) break;
    }
  }

  if (imageObj) {
    const embed = new EmbedBuilder()
      .setTitle('NSFW obrazek')
      .setDescription(`Źródło: **${imageObj.source}**`)
      .setImage(imageObj.url)
      .setColor(0xE91E63)
      .setFooter({ text: `Wywołał: ${message.author.tag}` });
    await message.channel.send({ embeds: [embed] });
  } else {
    message.reply('Nie udało się znaleźć obrazka, spróbuj ponownie później.');
  }
});


client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  
  if (interaction.commandName === 'gif_convert') {
    await interaction.deferReply();

    const att = interaction.options.getAttachment('obrazek');
    if (!att || !att.contentType.startsWith('image/')) {
      await interaction.editReply('Musisz podać poprawny format pliku');
      return;
    }
    let imgBuffer;
    try {
      const res = await fetch(att.url);
      imgBuffer = await res.arrayBuffer();
    } catch {
      await interaction.editReply('Nie udało się pobrać obrazka.');
      return;
    }
    try {
      const img = await loadImage(Buffer.from(imgBuffer));
      const width = img.width;
      const height = img.height;
      const encoder = new GIFEncoder(width, height);
      const tmpPath = path.join(__dirname, `converted_${Date.now()}.gif`);
      const stream = fs.createWriteStream(tmpPath);

      encoder.createReadStream().pipe(stream);
      encoder.start();
      encoder.setRepeat(0);
      encoder.setDelay(350);
      encoder.setQuality(10);

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      encoder.addFrame(ctx);

      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1.0;
      ctx.drawImage(img, 0, 0, width, height);
      encoder.addFrame(ctx);

      encoder.finish();
      await new Promise(res => stream.on('finish', res));

      const gifAttachment = new AttachmentBuilder(tmpPath, { name: 'converted.gif' });
      await interaction.editReply({ content: 'Gotowy GIF:', files: [gifAttachment] });

      setTimeout(() => fs.unlink(tmpPath, () => {}), 2000);

    } catch (e) {
      console.error(e);
      await interaction.editReply('Wystąpił błąd podczas konwersji do GIF.');
    }
    return;
  }
});

client.login(DISCORD_TOKEN);
