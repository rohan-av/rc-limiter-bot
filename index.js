const constants = require("./const_values");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const bodyParser = require("body-parser");

require("dotenv").config();

const token = process.env.API_TOKEN;

if (process.env.NODE_ENV === "production") {
  const bot = new TelegramBot(token);
  bot.setWebHook(process.env.HEROKU_URL + bot.token);
} else {
  const bot = new TelegramBot(token, { polling: true });
}

const HERE = constants.HERE;
const TO_GO = constants.TO_GO;
const ALL = constants.ALL;

let capacity = constants.CAPACITY;
let takeaway_capacity = constants.TAKEAWAY_CAPACITY;

let diners = [];
let takeawayers = [];

bot.onText(/\/start/, msg => {
  const chatID = msg.chat.id;
  let output_text =
    "Hello! I am the RCLimitBot, developed inhouse for the electronic handling of capacity constraints in the dining hall. The following are the commands you can use:\n\n1. /capacity - informs you how many more diners can sit in the DH.\n2. /enter - enters the DH (and informs you if unsuccessful)\n3. /leave - leaves the DH (and informs you if unsuccessful.\n4. /status - gives your current status (including the amount of time left to eat).\n5. /help - retrieves the list of commands.";
  bot.sendMessage(msg.chat.id, output_text);
});

bot.onText(/\/echo (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const resp = match[1];
  bot.sendMessage(chatId, resp);
});

bot.onText(/\/capacity/, msg => {
  let output = stateOutput();
  bot.sendMessage(msg.chat.id, output, {
    parse_mode: "Markdown"
  });
});

bot.onText(/\/enter/, msg => {
  if (capacity === 0 && takeaway_capacity === 0) {
    bot.sendMessage(msg.chat.id, "Sorry! The dining hall is at full capacity.");
  } else if (isDining(msg.chat.id, ALL)) {
    bot.sendMessage(msg.chat.id, "You're already in!");
  } else {
    var options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: "Dine Here", callback_data: "1" }],
          [{ text: "Takeaway", callback_data: "2" }]
        ]
      })
    };
    bot.sendMessage(msg.from.id, "Dine here or takeaway?", options);
  }
});

bot.on("callback_query", function onCallbackQuery(callbackQuery) {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;
  const opts = {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    parse_mode: "Markdown"
  };

  if (action === "1") {
    if (capacity !== 0) {
      capacity--;
      diners.push({
        user: msg.chat.id,
        time: getTime()
      });
      bot.editMessageText(
        "Welcome to the Dining Hall. " +
          stateOutput() +
          "Please remember to eat quickly.\n\n*When leaving the dining hall*, remember to enter the /leave command.",
        opts
      );
    } else {
      bot.editMessageText("Sorry! All dining slots have been filled :(", opts);
    }
  } else if (action === "2") {
    if (takeaway_capacity !== 0) {
      takeaway_capacity--;
      takeawayers.push({
        user: msg.chat.id,
        time: getTime()
      });
      bot.editMessageText(
        "Welcome to the Dining Hall. " +
          stateOutput() +
          "Please remember to eat quickly.\n\n*When leaving the dining hall*, remember to enter the /leave command.",
        opts
      );
    } else {
      bot.editMessageText(
        "Sorry! All takeaway slots have been filled :(",
        opts
      );
    }
  }
});

bot.onText(/\/leave/, msg => {
  let index = -1;
  if (isDining(msg.chat.id, HERE)) {
    let diners_raw = [];
    for (x of diners) {
      diners_raw.push(x.user);
    }
    index = diners_raw.indexOf(msg.chat.id);
    capacity++;
    diners.splice(index, 1);
  } else if (isDining(msg.chat.id, TO_GO)) {
    let takeawayers_raw = [];
    for (x of takeawayers) {
      takeawayers_raw.push(x.user);
    }
    index = takeawayers_raw.indexOf(msg.chat.id);
    takeaway_capacity++;
    takeawayers.splice(index, 1);
  }
  if (index === -1) {
    bot.sendMessage(msg.chat.id, "You are not in the dining hall!");
  } else {
    bot.sendMessage(
      msg.chat.id,
      "You have now left the Dining Hall. " +
        stateOutput() +
        "See you again soon!",
      {
        parse_mode: "Markdown"
      }
    );
  }
});

bot.onText(/\/status/, msg => {
  bot.sendMessage(msg.chat.id, getStatus(msg.chat.id), {
    parse_mode: "Markdown"
  });
});

bot.onText(/\/help/, msg => {
  bot.sendMessage(
    msg.chat.id,
    "The following are the commands you can use: \n\n1. /capacity - informs you how many more diners can sit in the DH.\n2. /enter - enters the DH(and informs you if unsuccessful) \n3. /leave - leaves the DH(and informs you if unsuccessful.\n4. /status - gives your current status(including the amount of time left to eat).\n5. /help - retrieves the list of commands.",
    { parse_mode: "Markdown" }
  );
});

function stateOutput() {
  return `There can be *${capacity}* more diners in the DH, and *${takeaway_capacity}* more diners for takeaway. `;
}

function getStatus(query) {
  const curr_time = getTime();
  let text = "";
  if (isDining(query, HERE)) {
    let entry_time;
    text += "Currently, you are in the Dining Hall for *DINING HERE*. ";
    for (x of diners) {
      if (query === x.user) {
        entry_time = x.time;
      }
    }
    let diff = 30 + entry_time - curr_time;
    text += `Please finish eating in ${diff} min.`;
  } else if (isDining(query, TO_GO)) {
    text += "Currently, you are in the Dining Hall for *TAKEAWAY* ";
  } else {
    text += "You're outside the Dining Hall. Stay safe!";
  }

  return text;
}

function isDining(query, id) {
  if (id === 1) {
    for (x of diners) {
      if (query === x.user) {
        return true;
      }
    }
    return false;
  } else if (id === 2) {
    for (x of takeawayers) {
      if (query === x.user) {
        return true;
      }
    }
    return false;
  } else if (id === 3) {
    for (x of diners) {
      if (query === x.user) {
        return true;
      }
    }
    for (x of takeawayers) {
      if (query === x.user) {
        return true;
      }
    }
    return false;
  }
}

function getTime() {
  let now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const app = express();

app.use(bodyParser.json());

app.listen(process.env.PORT);

app.post("/" + bot.token, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
