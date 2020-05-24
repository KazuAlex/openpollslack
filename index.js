const { App, LogLevel } = require('@slack/bolt');
const config = require('config');

const token = config.get('token');
const signing_secret = config.get('signing_secret');
const slackCommand = config.get('command');

const app = new App({
  signingSecret: signing_secret,
  token: token,
  clientId: config.get('client_id'),
  clientSecret: config.get('client_secret'),
  endpoints: {
    events: '/slack/events',
    commands: '/slack/commands',
    actions: '/slack/actions',
  },
  installerOptions: {
    installPath: '/slack/install',
    redirectUriPath: '/slack/oauth_redirect',
  },
  logLevel: LogLevel.DEBUG,
});

app.command(`/${slackCommand}`, async ({ command, ack, say }) => {
  await ack();

  let body = (command && command.text) ? command.text.trim() : null;

  const isHelp = body ? 'help' === body : false;

  const channel = (command && command.channel_id) ? command.channel_id : null;

  const user_id = (command && command.user_id) ? command.user_id : null;

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
      token: token,
      channel: channel,
      user: user_id,
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

    const blocks = [];

    if (question && options) {
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
        text: ':eyes: by <@'+user_id+'>'
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
            text: '<https://github.com/kazualex/openpollslack.git|Need help ?>',
          },
          {
            type: 'mrkdwn',
            text: ':information_source: '+cmd,
          }
        ],
      });

      await app.client.chat.postMessage({
        token: token,
        channel: channel,
        blocks: blocks,
      });

      return;
    }
  }
});

(async () => {
  await app.start(process.env.PORT || 5000);

  console.log('Bolt app is running!');
})();

app.action('btn_vote', async ({ action, ack, body }) => {
  await ack();

  // console.log('body', body, 'action', action);

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
  button_id = 3 + (value.id * 2);
  context_id = 3 + (value.id * 2) + 1;
  let blockBtn = blocks[button_id];
  let block = blocks[context_id];
  let voters = value.voters ? value.voters : [];
  let newVoters = '';

  let removeVote = false;
  if (voters.includes(user_id)) {
    removeVote = true;
    voters = voters.filter(voter_id => voter_id != user_id);
  } else {
    voters.push(user_id);
  }

  if (value.limited && value.limit) {
    let voteCount = 0;
    for (let b of blocks) {
      if (b.accessory) {
        let val = JSON.parse(b.accessory.value);
        if (val.voters && val.voters.includes(user_id)) {
          ++voteCount;
        }
      }
    }

    if (removeVote) {
      voteCount -= 1;
    }

    if (voteCount >= value.limit) {
      return;
    }
  }

  if (voters.length === 0) {
    newVoters = 'No votes';
  } else {
    newVoters = '';
    for (let voter of voters) {
      if (!value.anonymous) {
        newVoters += '<@'+voter+'> ';
      }
    }

    newVoters += voters.length +' ';
    if (voters.length === 1) {
      newVoters += 'vote';
    } else {
      newVoters += 'votes';
    }
  }

  block.elements[0].text = newVoters;
  value.voters = voters;
  blockBtn.accessory.value = JSON.stringify(value);
  blocks[context_id] = block;

  await app.client.chat.update({
    token: token,
    channel: channel,
    ts: message.ts,
    blocks: blocks,
  });
});
