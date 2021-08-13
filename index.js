const { App, LogLevel } = require('@slack/bolt');
const config = require('config');

const { JsonDB } = require('node-json-db');
const JsonDBConfig = require('node-json-db/dist/lib/JsonDBConfig').Config;

const { Mutex, withTimeout } = require('async-mutex');

const port = config.get('port');
const signing_secret = config.get('signing_secret');
const slackCommand = config.get('command');
const helpLink = config.get('help_link');

const orgDb = new JsonDB(new JsonDBConfig('config/open_poll', true, false, '/'));
const pollsDb = new JsonDB(new JsonDBConfig('config/polls', true, false, '/'));

const mutexes = {};

orgDb.push('/token', {}, false);
pollsDb.push('/polls', {}, false);

const app = new App({
  signingSecret: signing_secret,
  clientId: config.get('client_id'),
  clientSecret: config.get('client_secret'),
  scopes: ['commands', 'chat:write.public', 'chat:write', 'groups:write'],
  stateSecret: config.get('state_secret'),
  endpoints: {
    events: '/slack/events',
    commands: '/slack/commands',
    actions: '/slack/actions',
  },
  installerOptions: {
    installPath: '/slack/install',
    redirectUriPath: '/slack/oauth_redirect',
    callbackOptions: {
      success: (installation, installOptions, req, res) => {
        res.redirect(config.get('oauth_success'));
      },
      failure: (error, installOptions , req, res) => {
        res.redirect(config.get('oauth_failure'));
      },
    },
  },
  installationStore: {
    storeInstallation: (installation) => {
      // save informations
      orgDb.push(`/token/${installation.team.id}`, installation, false);
      orgDb.reload();

      // distinct scopes
      installation = orgDb.getData(`/token/${installation.team.id}`);
      installation.bot.scopes = installation.bot.scopes.filter(function (value, index, self) {
        return index === self.indexOf(value);
      });
      orgDb.push(`/token/${installation.team.id}`, installation, false);
      orgDb.reload();

      return installation.teamId;
    },
    fetchInstallation: (InstallQuery) => {
      try {
        return orgDb.getData(`/token/${InstallQuery.teamId}`);
      } catch (e) {
        throw new Error('No matching authorizations');
      }
    },
  },
  logLevel: LogLevel.DEBUG,
});

app.event('app_home_opened', async ({ event, client, context }) => {
  try {
    const result = await client.views.publish({
      user_id: event.user,
      view: {
        type: "home",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Hello, here is how to create a poll with OpenPoll.",
            },
          },
          {
            type: "divider",
          },
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "Create poll",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*From command*\nJust typing `/poll` where you type the message, following with options (see below) and your choices surrounding by quotes.\nBe careful, this way open the shortcuts. But you just need to ignore it and continue typing options and choices.",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*From shortcuts*\nOpen shortcuts (lightning bolt below to message input, or just type `/` into message input) and type \"poll\"",
            },
          },
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "Delete poll",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "When you create a poll, a red button will appear at bottom of your poll.\nOnly the creator can delete a poll.",
            },
          },
          {
            type: "divider",
          },
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "Options",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "The options are optionals settings to apply to the poll.\nDon't surround options with quotes.",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Anonymous*\n`anonymous` inside command.\nThis option allow you to hide voters.",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Limited choices*\n`limit x` inside command. Replace \"x\" by desired number.\nThis option limit maximum choice for each users. If \"2\", each user can only select 2 choices.",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Hidden*\n`hidden` inside command.\nThis option hide the number of votes for each choice. You can reveal votes with a button at bottom of poll. Only the creator can reveal votes.",
            },
          },
          {
            type: "divider",
          },
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "Examples",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Simple poll*\nThis example will create a basic poll.",
            },
          },
          {
            type: "input",
            element: {
              type: "plain_text_input",
              initial_value: "/poll \"What's you favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\""
            },
            label: {
              type: "plain_text",
              text: " ",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Anonymous poll*\nThis example will create anonymous poll.",
            },
          },
          {
            type: "input",
            element: {
              type: "plain_text_input",
              initial_value: "/poll anonymous \"What's you favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"",
            },
            label: {
              type: "plain_text",
              text: " ",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Limited poll*\nThis example will create anonymous poll.",
            },
          },
          {
            type: "input",
            element: {
              type: "plain_text_input",
              initial_value: "/poll limit 2 \"What's you favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"",
            },
            label: {
              type: "plain_text",
              text: " ",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Hidden poll*\nThis example will create hidden poll and allow you to reveal votes.",
            },
          },
          {
            type: "input",
            element: {
              type: "plain_text_input",
              initial_value: "/poll hidden \"What's you favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"",
            },
            label: {
              type: "plain_text",
              text: " ",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Mixed options poll*\nThis example will create anonymous and limited poll.",
            },
          },
          {
            type: "input",
            element: {
              type: "plain_text_input",
              initial_value: "/poll anonymous limit 2 \"What's you favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"",
            },
            label: {
              type: "plain_text",
              text: " ",
              emoji: true,
            },
          },
          {
            type: "divider",
          },
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "Tips",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Private channel*\nTo create poll in private channels, you need to invite the bot inside with `/invite` command.",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Private messages*\nTo create poll in private messages, you need to invite the bot inside with `/invite` command.",
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error(error);
  }
});

app.command(`/${slackCommand}`, async ({ command, ack, say, context }) => {
  await ack();

  let body = (command && command.text) ? command.text.trim() : null;

  const isHelp = body ? 'help' === body : false;

  const channel = (command && command.channel_id) ? command.channel_id : null;

  const userId = (command && command.user_id) ? command.user_id : null;

  if (isHelp) {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Open source poll for slack*',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Simple poll*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "```\n/"+slackCommand+" \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Anonymous poll*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "```\n/"+slackCommand+" anonymous \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Hidden poll votes*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "```\n/"+slackCommand+" hidden \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Limited choice poll*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "```\n/"+slackCommand+" limit 2 \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Anonymous limited choice poll*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "```\n/"+slackCommand+" anonymous limit 2 \"What's your favourite color ?\" \"Red\" \"Green\" \"Blue\" \"Yellow\"\n```",
        },
      },
    ];

    await app.client.chat.postEphemeral({
      token: context.botToken,
      channel: channel,
      user: userId,
      blocks: blocks,
    });

    return;
  } else {
    const cmd = `/${slackCommand} ${body}`;
    let question = null;
    const options = [];

    let isAnonymous = false;
    let isLimited = false;
    let limit = null;
    let isHidden = false;
    let fetchArgs = true;

    while (fetchArgs) {
      fetchArgs = false;
      if (body.startsWith('anonymous')) {
        fetchArgs = true;
        isAnonymous = true;
        body = body.substring(9).trim();
      } else if (body.startsWith('limit')) {
        fetchArgs = true;
        body = body.substring(5).trim();
        isLimited = true;
        if (!isNaN(parseInt(body.charAt(0)))) {
          limit = parseInt(body.substring(0, body.indexOf(' ')));
          body = body.substring(body.indexOf(' ')).trim();
        }
      } else if (body.startsWith('hidden')) {
        fetchArgs = true;
        body = body.substring(6).trim();
        isHidden = true;
      }
    }

    const lastSep = body.split('').pop();
    const firstSep = body.charAt(0);

    if (isLimited && null === limit) {
      limit = 1;
    }

    const regexp = new RegExp(firstSep+'[^'+firstSep+'\\\\]*(?:\\\\[\S\s][^'+lastSep+'\\\\]*)*'+lastSep, 'g');
    for (let option of body.match(regexp)) {
      let opt = option.substring(1, option.length - 1);
      if (question === null) {
        question = opt;
      } else {
        options.push(opt);
      }
    }

    const blocks = createPollView(question, options, isAnonymous, isLimited, limit, isHidden, userId, cmd);

    if (null === blocks) {
      return;
    }

    await app.client.chat.postMessage({
      token: context.botToken,
      channel: channel,
      blocks: blocks,
      text: `Poll : ${question}`,
    });
  }
});

const modalBlockInput = {
  type: 'input',
  element: {
    type: 'plain_text_input',
    placeholder: {
      type: 'plain_text',
      text: 'Write your choice',
    },
  },
  label: {
    type: 'plain_text',
    text: ' ',
  },
};

(async () => {
  await app.start(process.env.PORT || port);

  console.log('Bolt app is running!');
})();

app.action('btn_add_choice', async ({ action, ack, body, client, context }) => {
  await ack();

  if (
    !body
    || !body.view
    || !body.view.blocks
    || !body.view.hash
    || !body.view.type
    || !body.view.title
    || !body.view.submit
    || !body.view.close
    || !body.view.id
    || !body.view.private_metadata
  ) {
    console.log('error');
    return;
  }

  let blocks = body.view.blocks;
  const hash = body.view.hash;

  let beginBlocks = blocks.slice(0, blocks.length - 1);
  let endBlocks = blocks.slice(-1);

  let tempModalBlockInput = JSON.parse(JSON.stringify(modalBlockInput));
  tempModalBlockInput.block_id = 'choice_'+(blocks.length-8);

  beginBlocks.push(tempModalBlockInput);
  blocks = beginBlocks.concat(endBlocks);

  const view = {
    type: body.view.type,
    private_metadata: body.view.private_metadata,
    callback_id: 'modal_poll_submit',
    title: body.view.title,
    submit: body.view.submit,
    close: body.view.close,
    blocks: blocks,
    external_id: body.view.id,
  };

  const result = await client.views.update({
    token: context.botToken,
    hash: hash,
    view: view,
    view_id: body.view.id,
  });
});

app.action('btn_my_votes', async ({ action, ack, body, client, context, shortcut }) => {
  await ack();

  if (
    !body.hasOwnProperty('user')
    || !body.user.hasOwnProperty('id')
  ) {
    return;
  }

  const blocks = body.message.blocks;
  let votes = [];
  const userId = body.user.id;

  for (const block of blocks) {
    if (
      'section' !== block.type
      || !block.hasOwnProperty('accessory')
      || !block.accessory.hasOwnProperty('action_id')
      || 'btn_vote' !== block.accessory.action_id
      || !block.accessory.hasOwnProperty('value')
      || !block.hasOwnProperty('text')
      || !block.text.hasOwnProperty('text')
    ) {
      continue;
    }
    const value = JSON.parse(block.accessory.value);

    if (value.voters.includes(userId)) {
      votes.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: block.text.text,
        },
      });
      votes.push({
        type: 'divider',
      });
    }
  }

  if (0 === votes.length) {
    votes.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'You have not voted yet',
      },
    });
  } else {
    votes.pop();
  }

  try {
    await client.views.open({
      token: context.botToken,
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: 'Your votes',
        },
        close: {
          type: 'plain_text',
          text: 'Close',
        },
        blocks: votes,
      }
    });
  } catch (e) {
    console.error(e);
  }
});

app.action('btn_delete', async ({ action, ack, body, context }) => {
  await ack();

  if (
    !body
    || !body.user
    || !body.user.id
    || !body.message
    || !body.message.ts
    || !body.channel
    || !body.channel.id
    || !action
    || !action.value
  ) {
    console.log('error');
    return;
  }

  if (body.user.id != action.value) {
    console.log('invalid user');
    await app.client.chat.postEphemeral({
      token: context.botToken,
      channel: body.channel.id,
      user: body.user.id,
      attachments: [],
      text: "You can't delete poll from another user.",
    });
    return;
  }

  await app.client.chat.delete({
    token: context.botToken,
    channel: body.channel.id,
    ts: body.message.ts,
  });
});

app.action('btn_reveal', async ({ action, ack, body, context }) => {
  await ack();

  if (
    !body
    || !body.user
    || !body.user.id
    || !body.message
    || !body.message.ts
    || !body.message.blocks
    || !body.channel
    || !body.channel.id
    || !action
    || !action.value
  ) {
    console.log('error');
    return;
  }

  let value = JSON.parse(action.value);

  if (body.user.id !== value.user) {
    console.log('invalid user');
    await app.client.chat.postEphemeral({
      token: context.botToken,
      channel: body.channel.id,
      user: body.user.id,
      attachments: [],
      text: "You can't reveal poll from another user.",
    });
    return;
  }

  if (value.hasOwnProperty('revealed') && value.revealed) {
    console.log('poll already revealed');
    await app.client.chat.postEphemeral({
      token: context.botToken,
      channel: body.channel.id,
      user: body.user.id,
      attachments: [],
      text: "This poll is already revealed.",
    });
    return;
  }

  let message = body.message;
  let channel = body.channel.id;
  let blocks = message.blocks;
  poll = pollsDb.getData(`/${message.team}/${channel}/${message.ts}`);

  for (const i in blocks) {
    let b = blocks[i];
    if (
      b.hasOwnProperty('accessory')
      && b.accessory.hasOwnProperty('value')
    ) {
      let val = JSON.parse(b.accessory.value);
      val.hidden = false;

      if (!val.hasOwnProperty('voters')) {
        val.voters = [];
      }

      val.voters = poll[val.id];
      let newVoters = '';

      if (poll[val.id].length === 0) {
        newVoters = 'No votes';
      } else {
        newVoters = '';
        for (const voter of poll[val.id]) {
          if (!val.anonymous) {
            newVoters += '<@'+voter+'> ';
          }
        }

        newVoters += poll[val.id].length +' ';
        if (poll[val.id].length === 1) {
          newVoters += 'vote';
        } else {
          newVoters += 'votes';
        }
      }

      blocks[i].accessory.value = JSON.stringify(val);
      const nextI = ''+(parseInt(i)+1);
      if (blocks[nextI].hasOwnProperty('elements')) {
        blocks[nextI].elements[0].text = newVoters;
      }
    }
  }

  let b = blocks[blocks.length - 1];

  if (
    b.hasOwnProperty('elements')
    && b.elements.length > 0
  ) {
    let elements = [];
    for (const i in b.elements) {
      let el = b.elements[i];
      if ('btn_reveal' !== el.action_id) {
        elements.push(el);
      }
    }

    b.elements = elements;
  }

  blocks[blocks.length - 1] = b;

  await app.client.chat.update({
    token: context.botToken,
    channel: channel,
    ts: message.ts,
    blocks: blocks,
  });
});

app.action('btn_vote', async ({ action, ack, body, context }) => {
  await ack();

  if (
    !body
    || !action
    || !body.user
    || !body.user.id
    || !body.message
    || !body.message.blocks
    || !body.message.ts
    || !body.channel
    || !body.channel.id
  ) {
    console.log('error');
    return;
  }

  const user_id = body.user.id;
  const message = body.message;
  let blocks = message.blocks;

  const channel = body.channel.id;

  let value = JSON.parse(action.value);

  if (!mutexes.hasOwnProperty(`${message.team}/${channel}/${message.ts}`)) {
    mutexes[`${message.team}/${channel}/${message.ts}`] = withTimeout(new Mutex(), 2000);
  }

  const release = await mutexes[`${message.team}/${channel}/${message.ts}`].acquire();
    try {
      pollsDb.reload();
      pollsDb.push(`/${message.team}/${channel}/${message.ts}`, {}, false);
      poll = pollsDb.getData(`/${message.team}/${channel}/${message.ts}`);

      if (0 === Object.keys(poll).length) {
        for (const b of blocks) {
          if (
            b.hasOwnProperty('accessory')
            && b.accessory.hasOwnProperty('value')
          ) {
            const val = JSON.parse(b.accessory.value);
            poll[val.id] = val.voters ? val.voters : [];
          }
        }
      }
      button_id = 3 + (value.id * 2);
      context_id = 3 + (value.id * 2) + 1;
      let blockBtn = blocks[button_id];
      let block = blocks[context_id];
      let voters = value.voters ? value.voters : [];

      let removeVote = false;
      if (poll[value.id].includes(user_id)) {
        removeVote = true;
        poll[value.id] = poll[value.id].filter(voter_id => voter_id != user_id);
      } else {
        poll[value.id].push(user_id);
      }

      if (value.limited && value.limit) {
        let voteCount = 0;
        if (0 !== Object.keys(poll).length) {
          for (const p in poll) {
            if (poll[p].includes(user_id)) {
              ++voteCount;
            }
          }
        }

        if (removeVote) {
          voteCount -= 1;
        }

        if (voteCount > value.limit) {
          release();
          await app.client.chat.postEphemeral({
            token: context.botToken,
            channel: channel,
            user: body.user.id,
            attachments: [],
            text: "You can't vote anymore. Remove a vote to choose another option."
          });
          return;
        }
      }

      for (const i in blocks) {
        b = blocks[i];
        if (
          b.hasOwnProperty('accessory')
          && b.accessory.hasOwnProperty('value')
        ) {
          let val = JSON.parse(b.accessory.value);
          if (!val.hasOwnProperty('voters')) {
            val.voters = [];
          }

          val.voters = poll[val.id];
          let newVoters = '';

          if (val.hasOwnProperty('hidden') && val.hidden) {
            newVoters = 'Wait for reveal';
          } else if (poll[val.id].length === 0) {
            newVoters = 'No votes';
          } else {
            newVoters = '';
            for (const voter of poll[val.id]) {
              if (!val.anonymous) {
                newVoters += '<@'+voter+'> ';
              }
            }

            newVoters += poll[val.id].length +' ';
            if (poll[val.id].length === 1) {
              newVoters += 'vote';
            } else {
              newVoters += 'votes';
            }
          }

          blocks[i].accessory.value = JSON.stringify(val);
          const nextI = ''+(parseInt(i)+1);
          if (blocks[nextI].hasOwnProperty('elements')) {
            blocks[nextI].elements[0].text = newVoters;
          }
        }
      }

      pollsDb.push(`/${message.team}/${channel}/${message.ts}`, poll);

      await app.client.chat.update({
        token: context.botToken,
        channel: channel,
        ts: message.ts,
        blocks: blocks,
      });
    } finally {
      release();
    }
});

app.shortcut('open_modal_new', async ({ shortcut, ack, context, client }) => {
  try {
    await ack();

    let tempModalBlockInput = JSON.parse(JSON.stringify(modalBlockInput));
    tempModalBlockInput.block_id = 'choice_0';

    const privateMetadata = {
      anonymous: false,
      limited: false,
      hidden: false,
      channel: null,
    };

    const result = await client.views.open({
      token: context.botToken,
      trigger_id: shortcut.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'modal_poll_submit',
        private_metadata: JSON.stringify(privateMetadata),
        title: {
          type: 'plain_text',
          text: 'Create a poll',
        },
        submit: {
          type: 'plain_text',
          text: 'Create',
        },
        close: {
          type: 'plain_text',
          text: 'Cancel',
        },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Create a poll by filling the following form.',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Select a channel to post poll',
            },
          },
          {
            type: 'actions',
            block_id: 'channel',
            elements: [
              {
                type: 'conversations_select',
                action_id: 'modal_poll_channel',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select a channel',
                },
              },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: ':warning: Some of channels may not be visible to the bot. This may result by impossibility to create the poll.',
              },
            ],
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            block_id: 'options',
            text: {
              type: 'mrkdwn',
              text: "Choose your poll's options"
            },
            accessory: {
              type: 'checkboxes',
              action_id: 'modal_poll_options',
              options: [
                {
                  text: {
                    type: 'mrkdwn',
                    text: '*Anonymous*'
                  },
                  description: {
                    type: 'mrkdwn',
                    text: '*This option makes your poll anonymous*'
                  },
                  value: 'anonymous'
                },
                {
                  text: {
                    type: 'mrkdwn',
                    text: '*Limited*'
                  },
                  description: {
                    type: 'mrkdwn',
                    text: '*This option limit the number of choices by user*'
                  },
                  value: 'limit'
                },
                {
                  text: {
                    type: 'mrkdwn',
                    text: '*Hidden*'
                  },
                  description: {
                    type: 'mrkdwn',
                    text: '*This option hide the votes until reveal*'
                  },
                  value: 'hidden'
                }
              ]
            }
          },
          {
            type: 'divider',
          },
          {
            type: 'input',
            label: {
              type: 'plain_text',
              text: 'Choose your limit',
            },
            element: {
              type: 'plain_text_input',
              placeholder: {
                type: 'plain_text',
                text: 'Type a number',
              },
            },
            optional: true,
            block_id: 'limit',
          },
          {
            type: 'divider',
          },
          {
            type: 'input',
            label: {
              type: 'plain_text',
              text: 'Ask your question :',
            },
            element: {
              type: 'plain_text_input',
              placeholder: {
                type: 'plain_text',
                text: 'Write your question',
              },
            },
            block_id: 'question',
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Create your choice :*',
            },
          },
          tempModalBlockInput,
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                action_id: 'btn_add_choice',
                text: {
                  type: 'plain_text',
                  text: '+ Add a choice',
                  emoji: true,
                },
              },
            ],
          },
        ],
      }
    });
  } catch (error) {
    console.error(error);
  }
});

app.action('modal_poll_channel', async ({ action, ack, body, client, context }) => {
  await ack();

  if (
    !action
    && !action.selected_channel
  ) {
    return;
  }

  const privateMetadata = JSON.parse(body.view.private_metadata);
  privateMetadata.channel = action.selected_channel || action.selected_conversation;

  const view = {
    type: body.view.type,
    private_metadata: JSON.stringify(privateMetadata),
    callback_id: 'modal_poll_submit',
    title: body.view.title,
    submit: body.view.submit,
    close: body.view.close,
    blocks: body.view.blocks,
    external_id: body.view.id,
  };

  const result = await client.views.update({
    token: context.botToken,
    hash: body.view.hash,
    view: view,
    view_id: body.view.id,
  });
});

app.action('modal_poll_options', async ({ action, ack, body, client, context }) => {
  await ack();

  if (
    !body
    || !body.view
    || !body.view.private_metadata
  ) {
    return;
  }

  const privateMetadata = JSON.parse(body.view.private_metadata);
  // let privateMetadata = {
  //   anonymous: false,
  //   limited: false,
  //   hidden: false,
  // };

  privateMetadata.anonymous = false;
  privateMetadata.limited = false;
  for (const option of action.selected_options) {
    if ('anonymous' === option.value) {
      privateMetadata.anonymous = true;
    } else if ('limit' === option.value) {
      privateMetadata.limited = true;
    } else if ('hidden' === option.value) {
      privateMetadata.hidden = true;
    }
  }

  const view = {
    type: body.view.type,
    private_metadata: JSON.stringify(privateMetadata),
    callback_id: 'modal_poll_submit',
    title: body.view.title,
    submit: body.view.submit,
    close: body.view.close,
    blocks: body.view.blocks,
    external_id: body.view.id,
  };

  const result = await client.views.update({
    token: context.botToken,
    hash: body.view.hash,
    view: view,
    view_id: body.view.id,
  });
});

app.view('modal_poll_submit', async ({ ack, body, view, context }) => {
  await ack();

  if (
    !view
    || !body
    || !view.blocks
    || !view.state
    || !view.private_metadata
    || !body.user
    || !body.user.id
  ) {
    return;
  }

  const privateMetadata = JSON.parse(view.private_metadata);
  const userId = body.user.id;

  const state = view.state;
  let question = null;
  const options = [];
  const isAnonymous = privateMetadata.anonymous;
  const isLimited = privateMetadata.limited;
  let limit = 1;
  const isHidden = privateMetadata.hidden;
  const channel = privateMetadata.channel;

  if (state.values) {
    for (const optionName in state.values) {
      const option = state.values[optionName][Object.keys(state.values[optionName])[0]];
      if ('question' === optionName) {
        question = option.value;
      } else if ('limit' === optionName) {
        limit = parseInt(option.value, 10);
      } else if (optionName.startsWith('choice_')) {
        options.push(option.value);
      }
    }
  }

  if (
    !question
    || 0 === options.length
  ) {
    return;
  }

  const cmd = createCmdFromInfos(question, options, isAnonymous, isLimited, limit, isHidden);

  const blocks = createPollView(question, options, isAnonymous, isLimited, limit, isHidden, userId, cmd);

  await app.client.chat.postMessage({
    token: context.botToken,
    channel: channel,
    blocks: blocks,
  });
});

function createCmdFromInfos(question, options, isAnonymous, isLimited, limit, isHidden) {
  let cmd = `/${slackCommand}`;
  if (isAnonymous) {
    cmd += ` anonymous`
  }
  if (isLimited) {
    cmd += ` limit`
  }
  if (limit > 1) {
    cmd += ` ${limit}`
  }
  if (isHidden) {
    cmd += ` hidden`
  }

  question = question.replace(/"/g, "\\\"");
  cmd += ` "${question}"`

  for (let option of options) {
    option = option.replace(/"/g, "\\\"");
    cmd += ` "${option}"`
  }

  return cmd;
}

function createPollView(question, options, isAnonymous, isLimited, limit, isHidden, userId, cmd) {
  if (
    !question
    || !options
    || 0 === options.length
  ) {
    return null;
  }

  const blocks = [];

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: question,
    },
  });

  let voteLimit = 0;

  let elements = [];
  if (isAnonymous || isLimited || isHidden) {
    if (isAnonymous) {
      elements.push({
        type: 'mrkdwn',
        text: ':shushing_face: Anonymous poll',
      });
    }
    if (isLimited) {
      elements.push({
        type: 'mrkdwn',
        text: ':warning: Limited to '+ limit + ' vote' +(limit > 1 ? 's': ''),
      });
    }
    if (isHidden) {
      elements.push({
        type: 'mrkdwn',
        text: ':ninja: Votes are hidden'
      });
    }
  }
  elements.push({
    type: 'mrkdwn',
    text: ':writing_hand: by <@'+userId+'>'
  });
  blocks.push({
    type: 'context',
    elements: elements,
  });
  blocks.push({
    type: 'divider',
  });

  let button_value = {
    anonymous: isAnonymous,
    limited: isLimited,
    limit: limit,
    hidden: isHidden,
    voters: [],
    id: null,
  };

  for (let i in options) {
    let option = options[i];
    btn_value = JSON.parse(JSON.stringify(button_value));
    btn_value.id = i;
    let block = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: option,
      },
      accessory: {
        type: 'button',
        action_id: 'btn_vote',
        text: {
          type: 'plain_text',
          emoji: true,
          text: 'Vote',
        },
        value: JSON.stringify(btn_value),
      },
    };
    blocks.push(block);
    block = {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: isHidden ? 'Wait for reveal' : 'No votes',
        }
      ],
    };
    blocks.push(block);
    blocks.push({
      type: 'divider',
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `<${helpLink}|Need help ?>`,
      },
      {
        type: 'mrkdwn',
        text: ':information_source: '+cmd,
      }
    ],
  });

  elements = [];

  if (isHidden) {
    elements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: ":eyes: Reveal votes",
        emoji: true
      },
      value: JSON.stringify({revealed: false, user: userId}),
      action_id: "btn_reveal",
      style: "primary",
      confirm: {
        title: {
          type: "plain_text",
          text: "Are you sure?"
        },
        text: {
          type: "plain_text",
          text: "Revealing votes can't be undone.\nOnly the creator can reaveal the votes."
        }
      }
    });
  }

  elements.push({
    type: "button",
    text: {
      type: "plain_text",
      text: ":wastebasket: Remove",
      emoji: true
    },
    value: `${userId}`,
    action_id: "btn_delete",
    style: "danger",
    confirm: {
      title: {
        type: "plain_text",
        text: "Are you sure?"
      },
      text: {
        type: "plain_text",
        text: "Deleted poll are not recoverable.\nOnly the creator can delete it."
      }
    }
  });

  elements.push({
    type: "button",
    text: {
      type: "plain_text",
      text: ":ballot_box_with_ballot: My votes",
      emoji: true,
    },
    value: "btn_my_votes",
    action_id: "btn_my_votes",
  });

  blocks.push({
    "type": "actions",
    "elements": elements,
  });

  return blocks;
}
