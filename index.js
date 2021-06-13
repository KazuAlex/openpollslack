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
    let fetchLimit = false;

    if (body.startsWith('anonymous')) {
      isAnonymous = true;
      body = body.substring(9).trim();
    }
    if (body.startsWith('limit')) {
      body = body.substring(5).trim();
      isLimited = true;
      if (!isNaN(parseInt(body.charAt(0)))) {
        limit = parseInt(body.substring(0, body.indexOf(' ')));
        body = body.substring(body.indexOf(' ')).trim();
      }
    }
    if (!isAnonymous && body.startsWith('anonymous')) {
      isAnonymous = true;
      body = body.substring(9).trim();
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

    const blocks = createPollView(question, options, isAnonymous, isLimited, limit, userId, cmd);

    if (null === blocks) {
      return;
    }

    await app.client.chat.postMessage({
      token: context.botToken,
      channel: channel,
      blocks: blocks,
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
    mutexes[`${message.team}/${channel}/${message.ts}`] = withTimeout(new Mutex(), 1000);
  }

  mutexes[`${message.team}/${channel}/${message.ts}`]
    .acquire()
    .then(async (release) => {
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
        for (const p of poll) {
          if (p.includes(user_id)) {
            ++voteCount;
          }
        }

        if (removeVote) {
          voteCount -= 1;
        }

        if (voteCount >= value.limit) {
          release();
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

      pollsDb.push(`/${message.team}/${channel}/${message.ts}`, poll);

      await app.client.chat.update({
        token: context.botToken,
        channel: channel,
        ts: message.ts,
        blocks: blocks,
      });
      release();
    });
});

app.shortcut('open_modal_new', async ({ shortcut, ack, context, client, lody }) => {
  try {
    await ack();

    let tempModalBlockInput = JSON.parse(JSON.stringify(modalBlockInput));
    tempModalBlockInput.block_id = 'choice_0';

    const privateMetadata = {
      anonymous: false,
      limited: false,
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
                type: 'channels_select',
                action_id: 'modal_poll_channel',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select a channel',
                },
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
  privateMetadata.channel = action.selected_channel;

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
  // };

  privateMetadata.anonymous = false;
  privateMetadata.limited = false;
  for (const option of action.selected_options) {
    if ('anonymous' === option.value) {
      privateMetadata.anonymous = true;
    } else if ('limit' === option.value) {
      privateMetadata.limited = true;
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

  const cmd = createCmdFromInfos(question, options, isAnonymous, isLimited, limit);

  const blocks = createPollView(question, options, isAnonymous, isLimited, limit, userId, cmd);

  await app.client.chat.postMessage({
    token: context.botToken,
    channel: channel,
    blocks: blocks,
  });
});

function createCmdFromInfos(question, options, isAnonymous, isLimited, limit) {
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

  question = question.replace(/"/g, "\\\"");
  cmd += ` "${question}"`

  for (let option of options) {
    option = option.replace(/"/g, "\\\"");
    cmd += ` "${option}"`
  }

  return cmd;
}

function createPollView(question, options, isAnonymous, isLimited, limit, userId, cmd) {
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
  if (isAnonymous || isLimited) {
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
  }
  elements.push({
    type: 'mrkdwn',
    text: ':eyes: by <@'+userId+'>'
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
          text: 'No votes',
        }
      ],
    };
    blocks.push(block);
  }

  blocks.push({
    type: 'divider',
  });

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

  return blocks;
}
