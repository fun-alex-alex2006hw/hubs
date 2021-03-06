#!/usr/bin/env node
const doc = `
Usage:
    ./run-bot.js [options]
Options:
    -h --help         Show this screen
    -u --url=<url>    URL
    -o --host=<host>  Hubs host if URL is not specified [default: localhost:8080]
    -r --room=<room>  Room id
    -a --audio=<file> File to replay for the bot's outgoing audio
    -d --data=<file>  File to replay for the bot's data channel
`;

const docopt = require("docopt").docopt;
const options = docopt(doc);

const puppeteer = require("puppeteer");
const querystring = require("query-string");

function log(...objs) {
  console.log.call(null, [new Date().toISOString()].concat(objs).join(" "));
}

function error(...objs) {
  console.error.call(null, [new Date().toISOString()].concat(objs).join(" "));
}

(async () => {
  const browser = await puppeteer.launch({ ignoreHTTPSErrors: true });
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  page.on("console", msg => log("PAGE: ", msg.text()));
  page.on("error", err => error("ERROR: ", err.toString().split("\n")[0]));
  page.on("pageerror", err => error("PAGE ERROR: ", err.toString().split("\n")[0]));

  const baseUrl = options["--url"] || `https://${options["--host"]}/hub.html`;

  const params = {
    bot: true,
    allow_multi: true
  };
  const roomOption = options["--room"];
  if (roomOption) {
    params.room = roomOption;
  }

  const url = `${baseUrl}?${querystring.stringify(params)}`;
  log(url);

  const navigate = async () => {
    try {
      log("Spawning bot...");
      await page.goto(url);
      await page.evaluate(() => console.log(navigator.userAgent));
      let retryCount = 5;
      let backoff = 1000;
      const loadFiles = async () => {
        try {
          // Interact with the page so that audio can play.
          await page.mouse.click(100, 100);
          if (options["--audio"]) {
            const audioInput = await page.waitForSelector("#bot-audio-input");
            audioInput.uploadFile(options["--audio"]);
            log("Uploaded audio file.");
          }
          if (options["--data"]) {
            const dataInput = await page.waitForSelector("#bot-data-input");
            dataInput.uploadFile(options["--data"]);
            log("Uploaded data file.");
          }
        } catch (e) {
          log("Interaction error", e.message);
          if (retryCount-- < 0) {
            // If retries failed, throw and restart navigation.
            throw new Error("Retries failed");
          }
          log("Retrying...");
          backoff *= 2;
          // Retry interaction to start audio playback
          setTimeout(loadFiles, backoff);
        }
      };
      await loadFiles();
    } catch (e) {
      log("Navigation error", e.message);
      setTimeout(navigate, 1000);
    }
  };

  navigate();
})();
